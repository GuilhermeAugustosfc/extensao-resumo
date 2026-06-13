// gemini-live.js — Motor de conexão WebSocket com Gemini Live API
// Roda no contexto do sidepanel.html

(function () {
  'use strict';

  // ── Constantes ──────────────────────────────────────────────────────
  const LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  const MODEL = 'models/gemini-3.1-flash-live-preview';
  const INPUT_SAMPLE_RATE = 16000;   // Gemini espera 16kHz
  const OUTPUT_SAMPLE_RATE = 24000;  // Gemini retorna 24kHz
  const CHUNK_INTERVAL_MS = 250;     // Enviar chunks a cada 250ms

  // API Key do projeto (mesma do content.js)
  const API_KEY = 'AIzaSyCcQ18t2gKILVIH8NpIrW4S_1wV0G7FvBA';

  // ── Estado global ───────────────────────────────────────────────────
  let ws = null;
  let audioContext = null;
  let micStream = null;
  let micProcessor = null;
  let micSource = null;
  let playbackContext = null;
  let isConnected = false;
  let isMuted = false;
  let audioQueue = [];
  let isPlaying = false;
  let currentContext = null;  // Transcrição/contexto do vídeo carregado
  let analyserNode = null;
  let animFrameId = null;

  // ── Referências DOM ─────────────────────────────────────────────────
  function getEl(id) { return document.getElementById(id); }

  // ── Conexão WebSocket ───────────────────────────────────────────────
  function connect(systemInstruction) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[Gemini Live] Já conectado.');
      return;
    }

    updateStatus('connecting', 'Conectando ao Gemini...');

    const url = `${LIVE_WS_URL}?key=${API_KEY}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[Gemini Live] WebSocket aberto, enviando setup...');
      sendSetupMessage(systemInstruction);
    };

    ws.onmessage = async (event) => {
      try {
        let data = event.data;
        if (data instanceof Blob) {
          data = await data.text();
        }
        handleServerMessage(data);
      } catch (err) {
        console.error('[Gemini Live] Erro ao decodificar mensagem do WebSocket:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[Gemini Live] WebSocket error:', err);
      updateStatus('error', 'Erro na conexão');
    };

    ws.onclose = (event) => {
      console.log('[Gemini Live] WebSocket fechado:', event.code, event.reason);
      isConnected = false;
      stopMicrophone();
      updateStatus('disconnected', 'Desconectado');
      updateUIDisconnected();
    };
  }

  function sendSetupMessage(systemInstruction) {
    const setupMsg = {
      setup: {
        model: MODEL,
        generation_config: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: 'Zephyr'
              }
            }
          }
        },
        system_instruction: {
          parts: [{
            text: systemInstruction
          }]
        }
      }
    };

    ws.send(JSON.stringify(setupMsg));
    console.log('[Gemini Live] Setup enviado');
  }

  function disconnect() {
    console.log('[Gemini Live] Desconectando...');
    stopMicrophone();
    stopAudioPlayback();

    if (ws) {
      ws.close();
      ws = null;
    }

    isConnected = false;
    audioQueue = [];
    isPlaying = false;
    updateStatus('disconnected', 'Desconectado');
    updateUIDisconnected();
  }

  // ── Processar mensagens do servidor ─────────────────────────────────
  function handleServerMessage(rawData) {
    try {
      const msg = JSON.parse(rawData);

      // Setup completo
      if (msg.setupComplete) {
        console.log('[Gemini Live] Setup completo! Sessão ativa.');
        isConnected = true;
        updateStatus('connected', 'Conectado — Fale algo!');
        updateUIConnected();
        startMicrophone();
        return;
      }

      // Mensagem do servidor com conteúdo
      if (msg.serverContent) {
        const sc = msg.serverContent;

        // Áudio recebido
        if (sc.modelTurn && sc.modelTurn.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
              const audioB64 = part.inlineData.data;
              queueAudioForPlayback(audioB64);
              updateStatus('speaking', 'Gemini está falando...');
            }
            if (part.text) {
              console.log('[Gemini Live] Texto:', part.text);
              appendTranscript('gemini', part.text);
            }
          }
        }

        // Turn completo — Gemini parou de falar
        if (sc.turnComplete) {
          console.log('[Gemini Live] Turn completo');
          // Limpar fila de áudio remanescente para suportar interrupções
          // (o buffer em reprodução terminará naturalmente)
          setTimeout(() => {
            if (isConnected) {
              updateStatus('connected', 'Sua vez de falar...');
            }
          }, 500);
        }

        // Interrompido pelo usuário
        if (sc.interrupted) {
          console.log('[Gemini Live] Interrompido pelo usuário');
          audioQueue = [];
          stopAudioPlayback();
          updateStatus('connected', 'Sua vez de falar...');
        }
      }
    } catch (e) {
      console.error('[Gemini Live] Erro ao processar mensagem:', e, rawData);
    }
  }

  // ── Captura de Microfone ────────────────────────────────────────────
  async function startMicrophone() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: INPUT_SAMPLE_RATE },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });

      // Se o browser capturou em taxa diferente, precisamos reamostrar
      // O AudioContext com sampleRate forçado faz isso automaticamente
      micSource = audioContext.createMediaStreamSource(micStream);

      // Analyser para visualização
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 256;
      micSource.connect(analyserNode);

      // ScriptProcessorNode para capturar PCM raw
      // (AudioWorklet seria mais eficiente mas mais complexo para extensão)
      const bufferSize = 4096;
      micProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

      let audioBuffer = [];
      let lastSendTime = Date.now();

      micProcessor.onaudioprocess = (event) => {
        if (!isConnected || isMuted) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Converter Float32 para Int16 PCM
        const pcm16 = float32ToInt16(inputData);
        audioBuffer.push(...pcm16);

        // Enviar a cada CHUNK_INTERVAL_MS
        const now = Date.now();
        if (now - lastSendTime >= CHUNK_INTERVAL_MS && audioBuffer.length > 0) {
          const chunk = new Int16Array(audioBuffer);
          const base64 = int16ArrayToBase64(chunk);
          sendAudioChunk(base64);
          audioBuffer = [];
          lastSendTime = now;
        }
      };

      micSource.connect(micProcessor);
      micProcessor.connect(audioContext.destination); // Necessário para o processador funcionar

      // Iniciar visualização
      startVisualization();

      console.log('[Gemini Live] Microfone iniciado (' + audioContext.sampleRate + 'Hz)');
    } catch (err) {
      console.error('[Gemini Live] Erro ao acessar microfone:', err);
      if (err.name === 'NotAllowedError') {
        updateStatus('error', 'Permissão negada. Clique aqui para autorizar microfone.');
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: 'permission.html' });
        }
      } else {
        updateStatus('error', 'Erro: Microfone não permitido (' + err.message + ')');
      }
    }
  }

  function stopMicrophone() {
    stopVisualization();

    if (micProcessor) {
      micProcessor.disconnect();
      micProcessor = null;
    }
    if (micSource) {
      micSource.disconnect();
      micSource = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    analyserNode = null;
  }

  function sendAudioChunk(base64Data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const msg = {
      realtime_input: {
        audio: {
          mime_type: 'audio/pcm;rate=16000',
          data: base64Data
        }
      }
    };

    ws.send(JSON.stringify(msg));
  }

  // ── Playback de Áudio ───────────────────────────────────────────────
  function queueAudioForPlayback(base64Data) {
    const pcmBytes = base64ToUint8Array(base64Data);
    const int16 = new Int16Array(pcmBytes.buffer);
    const float32 = int16ToFloat32(int16);
    audioQueue.push(float32);

    if (!isPlaying) {
      playNextChunk();
    }
  }

  function playNextChunk() {
    if (audioQueue.length === 0) {
      isPlaying = false;
      return;
    }

    isPlaying = true;

    if (!playbackContext || playbackContext.state === 'closed') {
      playbackContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    }

    const float32Data = audioQueue.shift();
    const buffer = playbackContext.createBuffer(1, float32Data.length, OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(float32Data);

    const source = playbackContext.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackContext.destination);

    source.onended = () => {
      playNextChunk();
    };

    source.start();
  }

  function stopAudioPlayback() {
    audioQueue = [];
    isPlaying = false;
    if (playbackContext && playbackContext.state !== 'closed') {
      playbackContext.close().catch(() => {});
      playbackContext = null;
    }
  }

  // ── Enviar texto (opcional) ─────────────────────────────────────────
  function sendTextMessage(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !isConnected) return;

    const msg = {
      client_content: {
        turns: [{
          role: 'user',
          parts: [{ text: text }]
        }],
        turn_complete: true
      }
    };

    ws.send(JSON.stringify(msg));
    appendTranscript('user', text);
  }

  // ── Conversão de Áudio ──────────────────────────────────────────────
  function float32ToInt16(float32Array) {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  function int16ToFloat32(int16Array) {
    const float32 = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
    }
    return float32;
  }

  function int16ArrayToBase64(int16Array) {
    const bytes = new Uint8Array(int16Array.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // ── Visualização de Ondas ───────────────────────────────────────────
  function startVisualization() {
    const canvas = getEl('live-visualizer');
    if (!canvas || !analyserNode) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      animFrameId = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const barCount = 32;
      const barWidth = W / barCount - 2;
      const gap = 2;

      for (let i = 0; i < barCount; i++) {
        const dataIdx = Math.floor(i * bufferLength / barCount);
        const value = dataArray[dataIdx];
        const barHeight = (value / 255) * H * 0.85;

        const hue = 260 + (i / barCount) * 40; // roxo → azul
        ctx.fillStyle = `hsla(${hue}, 80%, 65%, 0.9)`;

        const x = i * (barWidth + gap);
        const y = H / 2 - barHeight / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight || 2, 3);
        ctx.fill();
      }
    }

    draw();
  }

  function stopVisualization() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    const canvas = getEl('live-visualizer');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ── UI Updates ──────────────────────────────────────────────────────
  function updateStatus(state, text) {
    const statusEl = getEl('live-status-text');
    const dotEl = getEl('live-status-dot');
    if (!statusEl || !dotEl) return;

    statusEl.textContent = text;

    if (state === 'error' && text.includes('autorizar')) {
      statusEl.style.cursor = 'pointer';
      statusEl.style.textDecoration = 'underline';
    } else {
      statusEl.style.cursor = 'default';
      statusEl.style.textDecoration = 'none';
    }

    dotEl.className = 'live-status-dot';
    if (state === 'connecting') dotEl.classList.add('status-connecting');
    else if (state === 'connected') dotEl.classList.add('status-connected');
    else if (state === 'speaking') dotEl.classList.add('status-speaking');
    else if (state === 'error') dotEl.classList.add('status-error');
    else dotEl.classList.add('status-disconnected');
  }

  function updateUIConnected() {
    const connectBtn = getEl('live-connect-btn');
    const disconnectBtn = getEl('live-disconnect-btn');
    const micBtn = getEl('live-mic-btn');
    const textInput = getEl('live-text-input');
    const textSend = getEl('live-text-send');

    if (connectBtn) connectBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'flex';
    if (micBtn) { micBtn.style.display = 'flex'; micBtn.classList.remove('muted'); }
    if (textInput) textInput.disabled = false;
    if (textSend) textSend.disabled = false;
    isMuted = false;
  }

  function updateUIDisconnected() {
    const connectBtn = getEl('live-connect-btn');
    const disconnectBtn = getEl('live-disconnect-btn');
    const micBtn = getEl('live-mic-btn');
    const textInput = getEl('live-text-input');
    const textSend = getEl('live-text-send');

    if (connectBtn) connectBtn.style.display = 'flex';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (micBtn) micBtn.style.display = 'none';
    if (textInput) textInput.disabled = true;
    if (textSend) textSend.disabled = true;
  }

  function appendTranscript(role, text) {
    const log = getEl('live-transcript-log');
    if (!log) return;

    const entry = document.createElement('div');
    entry.className = 'live-transcript-entry ' + (role === 'user' ? 'user-msg' : 'gemini-msg');
    entry.innerHTML = `
      <span class="live-transcript-role">${role === 'user' ? '🧑 Você' : '✨ Gemini'}</span>
      <span class="live-transcript-text">${text}</span>
    `;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  function setContextDisplay(title, preview) {
    const ctxTitle = getEl('live-context-title');
    const ctxPreview = getEl('live-context-preview');
    if (ctxTitle) ctxTitle.textContent = title || 'Vídeo carregado';
    if (ctxPreview) ctxPreview.textContent = preview || '';
  }

  // ── Inicialização / Event Binding ───────────────────────────────────
  function initLiveUI() {
    // Botão conectar
    const connectBtn = getEl('live-connect-btn');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => {
        if (!currentContext) {
          updateStatus('error', 'Nenhum vídeo carregado. Selecione um vídeo primeiro.');
          return;
        }
        connect(currentContext);
      });
    }

    // Botão desconectar
    const disconnectBtn = getEl('live-disconnect-btn');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', disconnect);
    }

    // Botão mute/unmute
    const micBtn = getEl('live-mic-btn');
    if (micBtn) {
      micBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        micBtn.classList.toggle('muted', isMuted);
        const micIcon = micBtn.querySelector('.mic-icon');
        if (micIcon) {
          micIcon.innerHTML = isMuted ? getMicOffSVG() : getMicOnSVG();
        }
        updateStatus('connected', isMuted ? 'Microfone mutado' : 'Sua vez de falar...');
      });
    }

    // Enviar texto
    const textSend = getEl('live-text-send');
    const textInput = getEl('live-text-input');
    if (textSend && textInput) {
      textSend.addEventListener('click', () => {
        const text = textInput.value.trim();
        if (text) {
          sendTextMessage(text);
          textInput.value = '';
        }
      });

      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          textSend.click();
        }
      });
    }

    // Inserir contexto manual
    const manualBtn = getEl('live-manual-context-btn');
    const viewMode = getEl('live-context-view-mode');
    const editMode = getEl('live-context-edit-mode');
    const manualInput = getEl('live-manual-context-input');
    const manualSave = getEl('live-manual-context-save');
    const manualCancel = getEl('live-manual-context-cancel');

    if (manualBtn && viewMode && editMode && manualInput) {
      manualBtn.addEventListener('click', () => {
        viewMode.style.display = 'none';
        editMode.style.display = 'block';
        manualInput.focus();
      });

      if (manualCancel) {
        manualCancel.addEventListener('click', () => {
          editMode.style.display = 'none';
          viewMode.style.display = 'block';
          manualInput.value = '';
        });
      }

      if (manualSave) {
        manualSave.addEventListener('click', () => {
          const text = manualInput.value.trim();
          if (!text) {
            alert('Por favor, insira algum texto para o contexto.');
            return;
          }
          
          loadManualContext(text);
          
          editMode.style.display = 'none';
          viewMode.style.display = 'block';
          manualInput.value = '';
        });
      }
    }

    // Clique no status de erro de microfone abre a página de permissão
    const statusText = getEl('live-status-text');
    if (statusText) {
      statusText.addEventListener('click', () => {
        const dotEl = getEl('live-status-dot');
        if (dotEl && dotEl.classList.contains('status-error') && statusText.textContent.includes('autorizar')) {
          if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: 'permission.html' });
          }
        }
      });
    }

    // Estado inicial
    updateUIDisconnected();
    updateStatus('disconnected', 'Selecione um vídeo para começar');

    console.log('[Gemini Live] UI inicializada');
  }

  // ── Escutar contexto do vídeo via chrome.storage ────────────────────
  function listenForVideoContext() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    // Verificação imediata
    chrome.storage.local.get(['youtubeTranscription'], (result) => {
      if (result.youtubeTranscription && result.youtubeTranscription.mode === 'live') {
        loadVideoContext(result.youtubeTranscription);
      }
    });

    // Escutar mudanças
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.youtubeTranscription && changes.youtubeTranscription.newValue) {
        const data = changes.youtubeTranscription.newValue;
        if (data.mode === 'live') {
          loadVideoContext(data);
        }
      }
    });
  }

  function loadVideoContext(data) {
    console.log('[Gemini Live] Contexto do vídeo recebido:', data.videoId);

    // Construir system instruction
    const systemPrompt = `Você é um tutor interativo e amigável que conversa em Português do Brasil.
O usuário quer discutir o conteúdo de um vídeo do YouTube. Abaixo está a transcrição e contexto do vídeo.

IMPORTANTE:
- Responda SEMPRE em Português do Brasil
- Seja didático e use exemplos práticos
- Se o usuário fizer perguntas sobre trechos específicos, referencie o conteúdo da transcrição
- Mantenha a conversa fluida e natural, como um professor particular
- Se não souber algo que não está na transcrição, diga honestamente

=== CONTEXTO DO VÍDEO ===
${data.text}
=== FIM DO CONTEXTO ===

Comece se apresentando brevemente e dizendo que está pronto para discutir o conteúdo do vídeo. Seja conciso na apresentação.`;

    currentContext = systemPrompt;

    // Atualizar UI
    const preview = data.text.substring(0, 150).replace(/\n/g, ' ') + '...';
    setContextDisplay('Vídeo carregado', preview);
    updateStatus('disconnected', 'Vídeo carregado! Clique em Conectar.');

    // Mostrar botão de conectar
    const connectBtn = getEl('live-connect-btn');
    if (connectBtn) connectBtn.style.display = 'flex';

    // Limpar log anterior
    const log = getEl('live-transcript-log');
    if (log) log.innerHTML = '';

    // Limpar storage para não reprocessar
    chrome.storage.local.remove(['youtubeTranscription']);

    // Auto-conectar
    setTimeout(() => {
      if (currentContext && !isConnected) {
        connect(currentContext);
      }
    }, 800);
  }

  function loadManualContext(text) {
    console.log('[Gemini Live] Contexto manual recebido');

    // Construir system instruction
    const systemPrompt = `Você é um tutor interativo e amigável que conversa em Português do Brasil.
O usuário quer discutir um texto fornecido. Abaixo está o texto do contexto.

IMPORTANTE:
- Responda SEMPRE em Português do Brasil
- Seja didático e use exemplos práticos
- Se o usuário fizer perguntas sobre trechos específicos, referencie o conteúdo do contexto fornecido
- Mantenha a conversa fluida e natural, como um professor particular
- Se não souber algo que não está no contexto, diga honestamente

=== CONTEXTO ===
${text}
=== FIM DO CONTEXTO ===

Comece se apresentando brevemente e dizendo que está pronto para discutir o conteúdo fornecido. Seja conciso na apresentação.`;

    currentContext = systemPrompt;

    // Atualizar UI
    const preview = text.substring(0, 150).replace(/\n/g, ' ') + '...';
    setContextDisplay('Contexto manual carregado', preview);
    updateStatus('disconnected', 'Contexto carregado! Conectando...');

    // Mostrar botão de conectar
    const connectBtn = getEl('live-connect-btn');
    if (connectBtn) connectBtn.style.display = 'flex';

    // Limpar log anterior
    const log = getEl('live-transcript-log');
    if (log) log.innerHTML = '';

    // Auto-conectar
    setTimeout(() => {
      if (currentContext && !isConnected) {
        connect(currentContext);
      }
    }, 800);
  }

  // ── SVG Helpers ─────────────────────────────────────────────────────
  function getMicOnSVG() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>`;
  }

  function getMicOffSVG() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>`;
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  // Esperar o DOM estar pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initLiveUI();
      listenForVideoContext();
    });
  } else {
    initLiveUI();
    listenForVideoContext();
  }

  // Expor globalmente para debug
  window.geminiLive = {
    connect,
    disconnect,
    sendTextMessage,
    get isConnected() { return isConnected; }
  };

})();
