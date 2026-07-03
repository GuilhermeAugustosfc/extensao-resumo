chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getVideoTitle") {
    const videoTitle = document.querySelector(
      "h1.ytd-video-primary-info-renderer"
    )?.textContent;
    sendResponse({ title: videoTitle || "Título não encontrado" });
  }
  return true;
});

// Função para verificar se estamos no YouTube
function isYouTubePage() {
  return window.location.hostname.includes("youtube.com");
}

// Função para mostrar feedback (Toast)
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'youtube-summary-toast';
  toast.innerText = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Função para carregar estilos adicionais (Toast e Feedback)
function addStyles() {
  if (document.getElementById('youtube-summary-extra-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'youtube-summary-extra-styles';
  style.innerHTML = `
    .youtube-summary-toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 25px;
      z-index: 99999;
      transition: transform 0.3s ease, opacity 0.3s ease;
      opacity: 0;
      font-size: 14px;
      font-family: Roboto, Arial, sans-serif;
    }
    .youtube-summary-toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .long-press-feedback {
      transition: background-color 0.3s ease;
      background-color: rgba(255, 255, 255, 0.2) !important;
    }
  `;
  document.head.appendChild(style);
}
addStyles();

// Removidas funções setupLongPress e addLongPressToPlayer

// Função para verificar se existem thumbnails
function checkThumbnails() {
  const thumbnails = document.querySelectorAll("a#thumbnail");
  return thumbnails.length > 0;
}

// Configuração da API Gemini
const GEMINI_API_KEY = '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Função para fazer request para Gemini API
async function callGeminiAPI(prompt) {
  try {
    
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();
    
    // Extrair texto da resposta
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Resposta vazia do Gemini');
    }
    
    return text;
  } catch (error) {
    throw error;
  }
}

// Função para renderizar markdown
function renderMarkdown(text) {
  // Converter markdown básico para HTML
  let html = text
    // Headers (processar antes de outros elementos)
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Bold (processar antes de italic)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic (processar depois de bold)
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    // Line breaks duplos (parágrafos)
    .replace(/\n\n/g, '</p><p>')
    // Lists (processar antes de line breaks simples)
    .replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="numbered">$1</li>')
    // Line breaks simples
    .replace(/\n/g, '<br>');
  
  // Agrupar listas
  html = html.replace(/(<li[^>]*>.*?<\/li>)(\s*<li[^>]*>.*?<\/li>)*/g, (match) => {
    if (match.includes('class="numbered"')) {
      return '<ol>' + match.replace(/class="numbered"/g, '') + '</ol>';
    } else {
      return '<ul>' + match + '</ul>';
    }
  });
  
  // Wrap in paragraphs se não houver elementos de bloco
  if (!html.includes('<p>') && !html.includes('<h1>') && !html.includes('<h2>') && !html.includes('<h3>')) {
    html = '<p>' + html + '</p>';
  }
  
  return html;
}

// Função para criar o menu lateral
function createSideMenu() {
  // Verificar se o menu já existe
  if (document.getElementById('youtube-summary-menu')) {
    return document.getElementById('youtube-summary-menu');
  }

  // Criar overlay
  const overlay = document.createElement('div');
  overlay.id = 'youtube-summary-overlay';
  overlay.className = 'youtube-summary-overlay';
  
  // Criar menu
  const menu = document.createElement('div');
  menu.id = 'youtube-summary-menu';
  menu.className = 'youtube-summary-menu';
  
  // Header do menu
  const header = document.createElement('div');
  header.className = 'youtube-summary-header';
  header.innerHTML = `
    <h3>📝 Resumo do Vídeo</h3>
    <button id="youtube-summary-close" class="youtube-summary-close">×</button>
  `;
  
  // Conteúdo do menu
  const content = document.createElement('div');
  content.className = 'youtube-summary-content';
  content.innerHTML = `
    <div id="youtube-summary-loading" class="youtube-summary-loading">
      <div class="youtube-summary-spinner"></div>
      <p>Gerando resumo...</p>
    </div>
    <div id="youtube-summary-result" class="youtube-summary-result" style="display: none;">
      <!-- Resultado será inserido aqui -->
    </div>
  `;
  
  // Footer com input para novo prompt
  const footer = document.createElement('div');
  footer.className = 'youtube-summary-footer';
  footer.innerHTML = `
    <div class="youtube-summary-input-container">
      <textarea id="youtube-summary-input" placeholder="Digite um novo prompt para análise do vídeo..."></textarea>
      <button id="youtube-summary-send" class="youtube-summary-send-btn">Enviar</button>
    </div>
  `;
  
  // Montar menu
  menu.appendChild(header);
  menu.appendChild(content);
  menu.appendChild(footer);
  
  // Adicionar ao overlay
  overlay.appendChild(menu);
  
  // Adicionar ao body
  document.body.appendChild(overlay);
  
  // Eventos
  setupMenuEvents(overlay, menu);
  setupResizeEvents(menu);
  
  return menu;
}

// Função para configurar eventos de redimensionamento do menu
function setupResizeEvents(menu) {
  const handle = document.createElement('div');
  handle.className = 'youtube-summary-resize-handle';
  menu.appendChild(handle);

  let isResizing = false;
  let startX;
  let startWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(window.getComputedStyle(menu).width, 10);

    menu.classList.add('resizing');

    // Adiciona um overlay para capturar o movimento do mouse em toda a tela
    const resizeOverlay = document.createElement('div');
    resizeOverlay.className = 'youtube-summary-resize-overlay';
    document.body.appendChild(resizeOverlay);

    const handleMouseMove = (moveEvent) => {
      if (!isResizing) return;
      // Calcula a nova largura baseado no movimento do mouse
      const newWidth = startWidth - (moveEvent.clientX - startX);
      
      
      // Define limites para a largura
      const minWidth = 300; // Largura mínima de 300px
      const maxWidth = window.innerWidth * 0.9; // Máximo de 90% da tela
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        menu.style.width = `${newWidth}px`;
      }
    };

    const handleMouseUp = () => {
      isResizing = false;
      menu.classList.remove('resizing');
      
      // Remove o overlay e os listeners de evento
      resizeOverlay.remove();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });
}

// Função para configurar eventos do menu
function setupMenuEvents(overlay, menu) {
  // Fechar menu
  const closeBtn = document.getElementById('youtube-summary-close');
  closeBtn.addEventListener('click', () => {
    closeSideMenu();
  });
  
  // Fechar ao clicar no overlay
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeSideMenu();
    }
  });
  
  // Enviar novo prompt
  const sendBtn = document.getElementById('youtube-summary-send');
  const input = document.getElementById('youtube-summary-input');
  
  sendBtn.addEventListener('click', () => {
    const prompt = input.value.trim();
    if (prompt) {
      handleNewPrompt(prompt);
      input.value = '';
    }
  });
  
  // Enter no textarea
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const prompt = input.value.trim();
      if (prompt) {
        handleNewPrompt(prompt);
        input.value = '';
      }
    }
  });
}

// Função para abrir o menu lateral
function openSideMenu() {
  const overlay = document.getElementById('youtube-summary-overlay');
  const menu = document.getElementById('youtube-summary-menu');
  
  if (overlay && menu) {
    overlay.style.display = 'flex';
    setTimeout(() => {
      overlay.classList.add('active');
      menu.classList.add('active');
    }, 10);
  }
}

// Função para fechar o menu lateral
function closeSideMenu() {
  const overlay = document.getElementById('youtube-summary-overlay');
  const menu = document.getElementById('youtube-summary-menu');
  
  if (overlay && menu) {
    overlay.classList.remove('active');
    menu.classList.remove('active');
    
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);
  }
}

// Função para processar novo prompt
async function handleNewPrompt(userPrompt) {
  const currentTranscription = window.currentTranscription;
  if (!currentTranscription) {
    showToast('⚠️ Nenhuma transcrição disponível.');
    return;
  }
  
  const fullPrompt = `${userPrompt}

Baseado na seguinte transcrição de vídeo:

${currentTranscription}

Por favor, responda em português do Brasil e formate a resposta em markdown.`;
  
  showLoading();
  
  try {
    const response = await callGeminiAPI(fullPrompt);
    showResult(response);
  } catch (error) {
    showError('Erro ao processar novo prompt: ' + error.message);
  }
}

// Função para mostrar loading
function showLoading() {
  const loading = document.getElementById('youtube-summary-loading');
  const result = document.getElementById('youtube-summary-result');
  
  if (loading && result) {
    loading.style.display = 'flex';
    result.style.display = 'none';
  }
}

// Função para mostrar resultado
function showResult(text) {
  const loading = document.getElementById('youtube-summary-loading');
  const result = document.getElementById('youtube-summary-result');
  
  if (loading && result) {
    loading.style.display = 'none';
    result.style.display = 'block';
    
    // Renderizar markdown
    const html = renderMarkdown(text);
    result.innerHTML = html;
    
    // Efeito de fade in
    result.style.opacity = '0';
    setTimeout(() => {
      result.style.opacity = '1';
    }, 100);
  }
}

// Função para mostrar erro
function showError(message) {
  const loading = document.getElementById('youtube-summary-loading');
  const result = document.getElementById('youtube-summary-result');
  
  if (loading && result) {
    loading.style.display = 'none';
    result.style.display = 'block';
    result.innerHTML = `<div class="youtube-summary-error">❌ ${message}</div>`;
    
    // Efeito de fade in
    result.style.opacity = '0';
    setTimeout(() => {
      result.style.opacity = '1';
    }, 100);
  }
}

// Função para processar transcrição com Gemini
async function processTranscriptionWithGemini(transcription) {
  const prompt = `Faça um resumo detalhado do seguinte vídeo em português do Brasil. Organize o conteúdo em 5 a 10 tópicos principais, destacando os pontos mais importantes. Formate a resposta em markdown com títulos, subtítulos e use negrito para destacar palavras-chave e conceitos importantes.

Transcrição do vídeo:

${transcription}

Por favor, estruture o resumo de forma clara e organizada, usando markdown para uma melhor apresentação.`;

  try {
    const response = await callGeminiAPI(prompt);
    return response;
  } catch (error) {
    throw error;
  }
}

// Novo método usando a classe YoutubeTranscript
async function getVideoTranscription(videoId) {
  console.log(`[SmartCaptions] === getVideoTranscription chamada ===`);
  console.log(`[SmartCaptions] VideoId: ${videoId}`);
  console.log(`[SmartCaptions] YoutubeTranscript disponível: ${typeof YoutubeTranscript !== 'undefined'}`);
  
  try {
    // Tentar primeiro em português, depois sem idioma específico
    let segments = null;
    
    try {
      console.log('[SmartCaptions] Tentativa 1: buscando em português (pt)...');
      segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'pt' });
    } catch (ptError) {
      console.warn(`[SmartCaptions] Falha ao buscar em pt: ${ptError.message}`);
      console.log('[SmartCaptions] Tentativa 2: buscando em qualquer idioma...');
      try {
        segments = await YoutubeTranscript.fetchTranscript(videoId, {});
      } catch (anyError) {
        console.error(`[SmartCaptions] Falha ao buscar em qualquer idioma: ${anyError.message}`);
        throw anyError;
      }
    }
    
    if (segments && segments.length > 0) {
      const fullText = segments.map(s => s.text).join(' ');
      console.log(`[SmartCaptions] SUCESSO: ${segments.length} segmentos, ${fullText.length} caracteres`);
      console.log(`[SmartCaptions] Preview: "${fullText.substring(0, 150)}..."`);
      return fullText;
    }
    
    console.warn('[SmartCaptions] Nenhuma transcrição encontrada (segments vazio).');
    return null;
    
  } catch (error) {
    console.error("[SmartCaptions] Erro ao obter transcrição:", error);
    console.error("[SmartCaptions] Tipo do erro:", error.constructor.name);
    console.error("[SmartCaptions] Mensagem:", error.message);
    return null;
  }
}



// Função para extrair o ID do vídeo da URL do thumbnail
function getVideoIdFromThumbnail(thumbnail) {
  try {
    const linkElement = thumbnail.querySelector("a");
    let href = null;
    if (!linkElement) {
      href = thumbnail.href;
    } else {
      href = linkElement.getAttribute("href");
    }
    console.log(`[SmartCaptions] getVideoIdFromThumbnail - href encontrado: ${href}`);
    if (!href) {
      console.warn('[SmartCaptions] getVideoIdFromThumbnail - nenhum href encontrado');
      return null;
    }

    const match = href.match(/[?&]v=([^&]+)/);
    if (match) {
      console.log(`[SmartCaptions] getVideoIdFromThumbnail - videoId extraído: ${match[1]}`);
      return match[1];
    } else {
      console.warn(`[SmartCaptions] getVideoIdFromThumbnail - não conseguiu extrair videoId de: ${href}`);
      return null;
    }
  } catch (error) {
    console.error('[SmartCaptions] getVideoIdFromThumbnail - erro:', error);
    return null;
  }
}

// Atualizar a função handleIconClick
function handleIconClick(thumbnail, index, isSecondIcon = false) {
  return async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const videoId = getVideoIdFromThumbnail(thumbnail);
    if (videoId) {
      const transcription = await getVideoTranscription(videoId);
      if (transcription) {
        window.currentTranscription = transcription; // Armazena a transcrição globalmente
        
        // Criar o menu se não existir
        createSideMenu();
        
        // Abrir o menu e processar com Gemini
        openSideMenu();
        
        // Processar transcrição com Gemini
        try {
          const summary = await processTranscriptionWithGemini(transcription);
          showResult(summary);
        } catch (error) {
          showError('Erro ao processar transcrição: ' + error.message);
        }
      } else {
        showToast("❌ Não foi possível obter a transcrição.");
      }
    }
  };
}

// Atualizar a função addSummaryIcons
function addSummaryIcons() {
  if (!isYouTubePage()) {
    return;
  }

  // Processo para adicionar botões ao contêiner do vídeo
  processVideoContainers();

  // Verificar novamente após um breve intervalo
  setTimeout(processVideoContainers, 1500);
}



// Função para processar contêineres de vídeo e adicionar botões Resumo AI
function processVideoContainers() {
 
  // Primeira tentativa: Procurar por vídeos com class="yt-lockup-view-model-wiz"
  const videoModelContainers = document.querySelectorAll(
    ".yt-lockup-view-model-wiz:not(.ai-summary-button-added)"
  );
  
  processContainers(videoModelContainers, ".yt-lockup-view-model-wiz__content-image");

  // Segunda tentativa: Procurar por vídeos com ytd-rich-item-renderer
  const richItemContainers = document.querySelectorAll(
    "ytd-rich-item-renderer:not(.ai-summary-button-added)"
  );
  
  processContainers(richItemContainers, "a[href^='/watch?v=']");
}

// Função auxiliar para processar contêineres com um seletor específico de thumbnail
function processContainers(containers, thumbnailSelector) {
  
  containers.forEach((container, index) => {
    try {
      
      // Verificar se já tem o select
      if (container.querySelector(".ai-summary-select")) {
        return;
      }

      // Encontrar o thumbnail associado a este container usando o seletor específico
      const thumbnailElement = container.querySelector(thumbnailSelector);
      
      if (!thumbnailElement) {
        return;
      }
      

      // Extrair o ID do vídeo do link
      let videoId = null;
      
      if (thumbnailElement.href) {
        // Se for um elemento <a> com href
        const match = thumbnailElement.href.match(/[?&]v=([^&]+)/);
        if (match) {
          videoId = match[1];
        }
      } else if (thumbnailElement.getAttribute("href")) {
        // Se for um elemento com atributo href
        const href = thumbnailElement.getAttribute("href");
        const match = href.match(/[?&]v=([^&]+)/);
        if (match) {
          videoId = match[1];
        }
      }
      
      if (!videoId) {
        return;
      }
      

      // Criar container para os botões
      const buttonsContainer = document.createElement("div");
      buttonsContainer.className = "ai-summary-buttons-container";

      // Criar select único com todas as opções
      const aiSelect = document.createElement("select");
      aiSelect.className = "ai-summary-select";
      aiSelect.innerHTML = `
        <option value="" disabled selected>🤖 Enviar para IA</option>
        <optgroup label="── Resumo ──">
          <option value="gemini">✨ Gemini</option>
          <option value="chatgpt">💬 ChatGPT</option>
          <option value="claude">🟠 Claude</option>
          <option value="deepseek">🔵 DeepSeek</option>
          <option value="metaai">🔷 Meta AI</option>
        </optgroup>
        <optgroup label="── Voz ──">
          <option value="live">🎙️ Gemini Live</option>
          <option value="aistudio">🎤 AI Studio Live</option>
        </optgroup>
        <optgroup label="── Outros ──">
          <option value="local-ia">🖥️ Local IA</option>
          <option value="copy">📋 Copiar Prompt</option>
        </optgroup>
      `;

      // Adicionar select ao container
      buttonsContainer.appendChild(aiSelect);

      // Adicionar o container como filho direto do contêiner do vídeo
      container.appendChild(buttonsContainer);
      container.classList.add("ai-summary-button-added");

      // Extrair o título do vídeo a partir do container da thumbnail
      // Tenta h3[title] (ytLockupMetadataViewModelHeadingReset), depois aria-label do link
      let thumbnailVideoTitle = '';
      const h3Title = container.querySelector('h3[title]');
      if (h3Title) {
        thumbnailVideoTitle = h3Title.getAttribute('title').trim();
      }
      if (!thumbnailVideoTitle) {
        const titleLink = container.querySelector('.ytLockupMetadataViewModelTitle[aria-label]');
        if (titleLink) {
          // aria-label costuma ser "Título do vídeo X minutos" — pega só o texto do span interno
          const titleSpan = titleLink.querySelector('span[role="text"]') || titleLink;
          thumbnailVideoTitle = (titleSpan.textContent || '').trim();
        }
      }
      if (!thumbnailVideoTitle) {
        // Fallback genérico: qualquer link com aria-label dentro do container
        const anyLink = container.querySelector('a[aria-label]');
        if (anyLink) thumbnailVideoTitle = anyLink.getAttribute('aria-label').trim();
      }

      // Evento do select: ao escolher uma opcao, disparar a acao correspondente
      aiSelect.addEventListener("change", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const platform = aiSelect.value;
        if (!platform) return;

        // Resetar o select para o placeholder
        aiSelect.value = "";

        showPresetSelector(videoId, platform, thumbnailVideoTitle, aiSelect);
      });

      // Impedir que o click do select propague para o link do YouTube
      aiSelect.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // Impedir mousedown de propagar (evita navegacao ao abrir o select)
      aiSelect.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
    } catch (error) {
    }
  });
}

// (Função processSpecificContentContainers removida)

// Função para obter o título do vídeo atual
function getCurrentVideoTitle() {
  // Tenta pelo atributo title do yt-formatted-string (mais confiável)
  const titleEl = document.querySelector('#title yt-formatted-string');
  if (titleEl) {
    const t = titleEl.getAttribute('title') || titleEl.textContent;
    if (t && t.trim()) return t.trim();
  }
  // Fallback: h1 dentro de ytd-watch-metadata
  const h1 = document.querySelector('ytd-watch-metadata h1 yt-formatted-string');
  if (h1) {
    const t = h1.getAttribute('title') || h1.textContent;
    if (t && t.trim()) return t.trim();
  }
  return 'título do vídeo';
}

// Definição dos presets de prompt
const PROMPT_PRESETS = {
  detalhado: {
    name: '📋 Detalhado',
    description: 'Resumo completo e estruturado',
    prompt: `Faça um resumo DETALHADO e COMPLETO com linguagem simples do seguinte vídeo em português do Brasil.

Organize o conteúdo seguindo esta estrutura:
- Introdução: contexto geral do vídeo
- Tópicos principais (5-10 pontos): desenvolva cada tema abordado
- Conceitos-chave: explique termos e ideias importantes
- Conclusão: principais takeaways

Use markdown com títulos (##), subtítulos (###), negrito para destacar palavras-chave e bullet points para listas.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  resumePraMim: {
    name: '💬 Resume pra mim',
    description: 'Resumo rápido e direto',
    prompt: `Resume pra mim dando o maximo de contexto possivel com linguagem simples do seguinte vídeo em português do Brasil.

[TRANSCRIPTION]`
  },
  direto: {
    name: '⚡ Direto ao Ponto',
    description: 'Resumo objetivo e conciso',
    prompt: `Faça um resumo DIRETO e OBJETIVO com linguagem simples do seguinte vídeo em português do Brasil.

Formato:
- Tema principal em 1 frase
- 3-5 pontos-chave (máximo 2 linhas cada)
- Conclusão em 1 frase

Seja conciso e vá direto ao essencial. Use markdown simples.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  passoAPasso: {
    name: '📝 Passo a Passo',
    description: 'Tutorial sequencial',
    prompt: `Transforme o conteúdo do seguinte vídeo em um GUIA PASSO A PASSO com linguagem simples em português do Brasil.

Estruture como um tutorial:
1. Objetivo: o que será ensinado
2. Pré-requisitos (se houver)
3. Passos numerados: cada etapa explicada claramente
4. Dicas importantes
5. Resultado final esperado

Use markdown com listas numeradas e destaque informações críticas em negrito.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  logica: {
    name: '🧠 Lógica e Conceitos',
    description: 'Explicação técnica aprofundada',
    prompt: `Faça uma ANÁLISE TÉCNICA E CONCEITUAL com linguagem simples do seguinte vídeo em português do Brasil.

Foque em:
- Conceitos fundamentais: explique a base teórica
- Lógica e raciocínio: como as ideias se conectam
- Detalhes técnicos: aspectos mais complexos
- Relações causa-efeito
- Implicações práticas

Use linguagem técnica apropriada e markdown para organizar. Ideal para quem já tem conhecimento na área.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  simples: {
    name: '👶 Linguagem Simples',
    description: 'Para iniciantes e leigos',
    prompt: `Explique o conteúdo do seguinte vídeo em LINGUAGEM SIMPLES E ACESSÍVEL, em português do Brasil.

Como se estivesse explicando para alguém que NÃO conhece o assunto:
- Use analogias e exemplos do dia a dia
- Evite jargões técnicos (ou explique-os quando necessário)
- Explique TODO o contexto necessário
- Quebre conceitos complexos em partes simples
- Use comparações familiares

Objetivo: qualquer pessoa deve entender, independente do conhecimento prévio.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  topicos: {
    name: '🎯 Tópicos Principais',
    description: 'Lista dos pontos-chave',
    prompt: `Liste os TÓPICOS PRINCIPAIS com linguagem simples do seguinte vídeo em português do Brasil.

Formato de lista organizada:
- Identifique 5-8 tópicos centrais
- Para cada tópico: título + descrição breve (2-3 linhas)
- Ordene por importância ou sequência lógica
- Adicione subtópicos quando relevante

Use markdown com hierarquia clara (##, ###, bullet points).

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  critico: {
    name: '🔍 Análise Crítica',
    description: 'Avaliação e insights',
    prompt: `Faça uma ANÁLISE CRÍTICA com linguagem simples do seguinte vídeo em português do Brasil.

Estruture sua análise:
- Resumo do conteúdo (breve)
- Pontos fortes: o que foi bem apresentado
- Pontos fracos: lacunas ou aspectos questionáveis
- Insights: observações e reflexões adicionais
- Aplicabilidade: como usar esse conhecimento
- Conclusão: avaliação geral

Seja analítico e construtivo. Use markdown para organizar.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  estudo: {
    name: '📚 Notas de Estudo',
    description: 'Resumo em um ou dois parágrafos em Português',
    prompt: `Resuma o conteudo em Portugues do Brasil em apenas um ou dois paragrafo.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  tituloExplicacao: {
    name: '🏷️ Título: Explicação',
    description: 'Por que o título representa o vídeo',
    prompt: `O título deste vídeo é: "[VIDEO_TITLE]"

Baseado na transcrição abaixo, explique por que esse título foi escolhido e como ele se relaciona com o conteúdo do vídeo. Responda em português do Brasil usando linguagem simples.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  tituloSimplesDireto: {
    name: '🏷️ Título: Simples e Direto',
    description: 'Explicação curta e objetiva do título',
    prompt: `O título deste vídeo é: "[VIDEO_TITLE]"

Baseado na transcrição abaixo, explique de maneira simples e direta por que esse título representa o vídeo. Seja objetivo, use no máximo 3 parágrafos curtos. Responda em português do Brasil.

Transcrição do vídeo:

[TRANSCRIPTION]`
  },
  tituloSimplesDetalhado: {
    name: '🏷️ Título: Simples e Detalhado',
    description: 'Explicação completa e acessível do título',
    prompt: `O título deste vídeo é: "[VIDEO_TITLE]"

Baseado na transcrição abaixo, explique de maneira simples e detalhada por que esse título representa o vídeo. Desenvolva cada ponto relevante da transcrição que se conecta ao título, use exemplos do próprio conteúdo e organize em tópicos para facilitar a leitura. Responda em português do Brasil usando markdown.

Transcrição do vídeo:

[TRANSCRIPTION]`
  }
};

// Função para mostrar o seletor de presets
function showPresetSelector(videoId, platform, videoTitle, clickedButton = null) {
  // Remover seletor existente se houver
  const existingSelector = document.querySelector('.youtube-preset-selector');
  if (existingSelector) existingSelector.remove();
  
  const selector = document.createElement('div');
  selector.className = 'youtube-preset-selector';
  
  // Criar HTML do seletor
  let presetsHTML = '';
  for (const [key, preset] of Object.entries(PROMPT_PRESETS)) {
    presetsHTML += `
      <div class="preset-option" data-preset="${key}">
        <div class="preset-name">${preset.name}</div>
        <div class="preset-description">${preset.description}</div>
      </div>
    `;
  }
  
  selector.innerHTML = `
    <div class="preset-overlay"></div>
    <div class="preset-modal">
      <div class="preset-header">
        <h3>Escolha o tipo de resumo</h3>
        <button class="preset-close">×</button>
      </div>
      <div class="preset-options">
        ${presetsHTML}
      </div>
    </div>
  `;
  
  document.body.appendChild(selector);
  
  // Eventos
  const closeBtn = selector.querySelector('.preset-close');
  const overlay = selector.querySelector('.preset-overlay');
  
  closeBtn.addEventListener('click', () => selector.remove());
  overlay.addEventListener('click', () => selector.remove());
  
  // Evento para cada preset
  const options = selector.querySelectorAll('.preset-option');
  options.forEach(option => {
    option.addEventListener('click', async () => {
      const presetKey = option.getAttribute('data-preset');
      selector.remove();
      await processWithPreset(videoId, presetKey, platform, videoTitle, clickedButton);
    });
  });
}

// Função para processar com o preset selecionado
async function processWithPreset(videoId, presetKey, platform, videoTitle, clickedButton = null) {
  const preset = PROMPT_PRESETS[presetKey];
  
  // Mostrar loading
  console.log(`Processando com preset: ${preset.name}`);
  
  // Se for Local IA, exibir popup local em vez de obter transcrição geral e redirecionar
  if (platform === 'local-ia') {
    showLocalIAPopup(clickedButton, videoId, presetKey, (videoTitle && videoTitle.trim()) ? videoTitle.trim() : getCurrentVideoTitle());
    return;
  }

  // Se for Gemini Live, obter transcrição e abrir no side panel aba Live
  if (platform === 'live') {
    try {
      showToast('🎤 Obtendo transcrição para conversa...');
      const transcription = await getVideoTranscription(videoId);
      if (!transcription) {
        showToast("❌ Não foi possível obter a transcrição.");
        return;
      }
      const resolvedTitle = (videoTitle && videoTitle.trim()) ? videoTitle.trim() : getCurrentVideoTitle();
      const fullPrompt = preset.prompt
        .replace('[VIDEO_TITLE]', resolvedTitle)
        .replace('[TRANSCRIPTION]', transcription);

      // Salvar no chrome.storage com mode 'live'
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 'youtubeTranscription': {
          text: fullPrompt,
          timestamp: Date.now(),
          videoId: videoId,
          preset: presetKey,
          mode: 'live'
        }}, () => {
          console.log('[Live] Contexto salvo para Gemini Live');
        });
      }

      // Abrir Side Panel na aba Live
      _openSidePanel('openLiveSidePanel', 'https://gemini.google.com/app');
    } catch (error) {
      showToast('❌ Erro: ' + error.message);
    }
    return;
  }

  // Se for AI Studio Live, obter transcrição e abrir no side panel aba aistudio
  if (platform === 'aistudio') {
    try {
      showToast('🎤 Obtendo transcrição para AI Studio Live...');
      const transcription = await getVideoTranscription(videoId);
      if (!transcription) {
        showToast("❌ Não foi possível obter a transcrição.");
        return;
      }
      const resolvedTitle = (videoTitle && videoTitle.trim()) ? videoTitle.trim() : getCurrentVideoTitle();
      const fullPrompt = preset.prompt
        .replace('[VIDEO_TITLE]', resolvedTitle)
        .replace('[TRANSCRIPTION]', transcription);

      // Salvar no chrome.storage com mode 'aistudio'
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 'youtubeTranscription': {
          text: fullPrompt,
          timestamp: Date.now(),
          videoId: videoId,
          preset: presetKey,
          mode: 'aistudio'
        }}, () => {
          console.log('[AI Studio] Contexto salvo para AI Studio Live');
        });
      }

      // Abrir Side Panel na aba aistudio
      _openSidePanel('openAIStudioSidePanel', 'https://aistudio.google.com/live');
    } catch (error) {
      showToast('❌ Erro: ' + error.message);
    }
    return;
  }
  
  if (platform === 'copy') {
    try {
      const transcription = await getVideoTranscription(videoId);
      if (!transcription) {
        showToast("❌ Não foi possível obter a transcrição.");
        return;
      }
      const resolvedTitle = (videoTitle && videoTitle.trim()) ? videoTitle.trim() : getCurrentVideoTitle();
      const fullPrompt = preset.prompt
        .replace('[VIDEO_TITLE]', resolvedTitle)
        .replace('[TRANSCRIPTION]', transcription);
        
      if (typeof smartSubtitleSystem !== 'undefined') {
        await smartSubtitleSystem.copyToClipboard(fullPrompt);
      } else {
        await navigator.clipboard.writeText(fullPrompt);
      }
      showToast("📋 Prompt + Transcrição copiados!");
    } catch (error) {
      showToast('❌ Erro ao copiar: ' + error.message);
    }
    return;
  }
  
  try {
    const transcription = await getVideoTranscription(videoId);
    if (!transcription) {
      showToast("❌ Não foi possível obter a transcrição.");
      return;
    }
    
    // Usar título passado (thumbnail) ou tentar pegar da página atual (player)
    const resolvedTitle = (videoTitle && videoTitle.trim()) ? videoTitle.trim() : getCurrentVideoTitle();
    
    // Substituir placeholder pela transcrição
    const fullPrompt = preset.prompt
      .replace('[VIDEO_TITLE]', resolvedTitle)
      .replace('[TRANSCRIPTION]', transcription);
    
    // Salvar no chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const transcriptionData = {
        text: fullPrompt,
        timestamp: Date.now(),
        videoId: videoId,
        preset: presetKey
      };
      
      chrome.storage.local.set({ 'youtubeTranscription': transcriptionData }, () => {
        if (chrome.runtime.lastError) {
          console.error('Erro ao salvar transcrição:', chrome.runtime.lastError);
        } else {
          console.log('Transcrição salva com sucesso');
        }
      });
    } else {
      window.currentTranscription = fullPrompt;
    }
    
    // Redirecionar para a plataforma escolhida no Side Panel
    if (platform === 'gemini') {
      _openSidePanel('openGeminiSidePanel', 'https://gemini.google.com/app');
    } else if (platform === 'chatgpt') {
      _openSidePanel('openChatGPTSidePanel', 'https://chatgpt.com/');
    } else if (platform === 'claude') {
      _openSidePanel('openClaudeSidePanel', 'https://claude.ai/new');
    } else if (platform === 'deepseek') {
      _openSidePanel('openDeepSeekSidePanel', 'https://chat.deepseek.com/');
    } else if (platform === 'metaai') {
      _openSidePanel('openMetaAISidePanel', 'https://www.meta.ai/');
    } else if (platform === 'aistudio') {
      _openSidePanel('openAIStudioSidePanel', 'https://aistudio.google.com/live');
    }
  } catch (error) {
    showToast('❌ Erro: ' + error.message);
  }
}

// ===== API DE SUMARIZAÇÃO LOCAL DO CHROME =====
async function summarizeTextLocally(text, progressCallback) {
  return new Promise((resolve, reject) => {
    const requestId = 'sum_' + Math.random().toString(36).substring(2, 9);
    
    const options = {
      type: 'tldr',
      format: 'plain-text',
      length: 'long'
    };
    
    // Timeout de 120 segundos para downloads ou processamentos longos
    const timeout = setTimeout(() => {
      window.removeEventListener('yt-summarize-response', handleResponse);
      reject(new Error("O processamento da IA local expirou. Verifique se o modelo do Gemini Nano está totalmente baixado e ativado no seu navegador em chrome://flags."));
    }, 120000);
    
    function handleResponse(event) {
      if (event.detail && event.detail.requestId === requestId) {
        clearTimeout(timeout);
        window.removeEventListener('yt-summarize-response', handleResponse);
        
        if (event.detail.error) {
          reject(new Error(event.detail.error));
        } else {
          resolve(event.detail.result);
        }
      }
    }
    
    window.addEventListener('yt-summarize-response', handleResponse);
    
    if (progressCallback) progressCallback("Disparando processamento via IA Local (Main World)...");
    
    // Disparar o CustomEvent para o MAIN world
    window.dispatchEvent(new CustomEvent('yt-summarize-request', {
      detail: { text, options, requestId }
    }));
  });
}

// ===== POPUP DO LOCAL IA (EXIBIÇÃO E FLUXO DE ABAS PROGRESSIVAS) =====
async function showLocalIAPopup(clickedButton, videoId, presetKey, videoTitle) {
  // Remover popup existente se houver
  const existingPopup = document.querySelector('.youtube-local-ia-popup');
  if (existingPopup) {
    // Tentar limpar ouvintes caso o popup anterior tenha sido recriado
    if (existingPopup.__cleanup) existingPopup.__cleanup();
    existingPopup.remove();
  }
  
  const popup = document.createElement('div');
  popup.className = 'youtube-local-ia-popup';
  popup.innerHTML = `
    <div class="local-ia-popup-header">
      <h4>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12c0-2.4 1-4.6 2.6-6.2"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Local IA (Gemini Nano)
      </h4>
      <button class="local-ia-popup-close">×</button>
    </div>
    <div class="local-ia-tabs-container" style="display: none;"></div>
    <div class="local-ia-popup-body">
      <div class="local-ia-loading-container">
        <div class="local-ia-spinner"></div>
        <div class="local-ia-loading-text">Obtendo transcrição do vídeo...</div>
      </div>
    </div>
    <div class="local-ia-popup-footer">
      <span>Inicializando IA Local</span>
      <div style="display: flex; gap: 8px;">
        <button class="local-ia-popup-translate-btn" style="display: none;">Traduzir 🌐</button>
        <button class="local-ia-popup-copy-btn" style="display: none;">Copiar Parte</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(popup);
  
  // Posicionamento inteligente acima do botão
  if (clickedButton) {
    const buttonRect = clickedButton.getBoundingClientRect();
    const popupWidth = 480; // largura ampliada para legibilidade
    const popupHeight = 320; 
    
    let topPos = buttonRect.top + window.scrollY - popupHeight - 10;
    let leftPos = buttonRect.left + window.scrollX - (popupWidth / 2) + (buttonRect.width / 2);
    
    if (leftPos < 10) leftPos = 10;
    if (leftPos + popupWidth > window.innerWidth - 10) {
      leftPos = window.innerWidth - popupWidth - 10;
    }
    
    if (topPos < window.scrollY + 10) {
      topPos = buttonRect.bottom + window.scrollY + 10; 
    }
    
    popup.style.top = `${topPos}px`;
    popup.style.left = `${leftPos}px`;
  } else {
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }
  
  setTimeout(() => popup.classList.add('active'), 50);
  
  const requestId = 'sum_' + Math.random().toString(36).substring(2, 9);
  const tabContentsMap = {};
  const tabContentsMapOriginal = {};
  const tabTranslatedFlags = {};
  let currentActiveTabIdx = null;
  
  // Função para mudar a aba ativa na tela
  function selectTab(index) {
    currentActiveTabIdx = index;
    
    const allTabBtns = popup.querySelectorAll('.local-ia-tab-button');
    allTabBtns.forEach(btn => {
      const idx = parseInt(btn.getAttribute('data-tab-idx'));
      if (idx === index) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    const allTabContents = popup.querySelectorAll('.local-ia-tab-content');
    allTabContents.forEach(content => {
      const idx = parseInt(content.getAttribute('data-tab-idx'));
      if (idx === index) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
    
    const copyBtn = popup.querySelector('.local-ia-popup-copy-btn');
    if (copyBtn) {
      if (tabContentsMap[index]) {
        copyBtn.style.display = 'block';
        copyBtn.textContent = (index === Object.keys(tabContentsMap).length - 1 && Object.keys(tabContentsMap).length > 1) ? 'Copiar Tudo' : 'Copiar Parte';
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(tabContentsMap[index]);
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copiado!';
            copyBtn.style.background = '#30d158';
            setTimeout(() => {
              copyBtn.textContent = originalText;
              copyBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            }, 2000);
          } catch (e) {
            showToast('❌ Falha ao copiar.');
          }
        };
      } else {
        copyBtn.style.display = 'none';
      }
    }

    const translateBtn = popup.querySelector('.local-ia-popup-translate-btn');
    if (translateBtn) {
      if (tabContentsMap[index]) {
        translateBtn.style.display = 'block';
        if (tabTranslatedFlags[index]) {
          translateBtn.textContent = 'Ver Original 🇺🇸';
          translateBtn.classList.remove('translating');
        } else {
          translateBtn.textContent = 'Traduzir 🌐';
          translateBtn.classList.remove('translating');
        }
        translateBtn.onclick = () => {
          executeLocalTranslation(index);
        };
      } else {
        translateBtn.style.display = 'none';
      }
    }
  }

  // Função para traduzir o conteúdo de uma aba usando a API local do Chrome
  async function executeLocalTranslation(index) {
    const translateBtn = popup.querySelector('.local-ia-popup-translate-btn');
    if (!translateBtn || !tabContentsMap[index]) return;
    
    // Se já estiver traduzido, voltar ao original
    if (tabTranslatedFlags[index]) {
      tabContentsMap[index] = tabContentsMapOriginal[index];
      tabTranslatedFlags[index] = false;
      
      const tabContent = popup.querySelector(`.local-ia-tab-content[data-tab-idx="${index}"]`);
      if (tabContent) {
        const isConsolidado = index === Object.keys(tabContentsMapOriginal).length - 1 && Object.keys(tabContentsMapOriginal).length > 1;
        tabContent.innerHTML = `
          <div style="font-weight: 700; margin-bottom: 10px; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; color: #ffffff;">
            ${videoTitle} - ${isConsolidado ? 'Resumo Geral Consolidado' : `Parte ${index + 1}`}
          </div>
          <div class="local-ia-content-markdown" style="font-size: 12.5px; text-align: left;">
            ${renderMarkdown(tabContentsMap[index])}
          </div>
        `;
      }
      
      translateBtn.textContent = 'Traduzir 🌐';
      return;
    }
    
    // Iniciar fluxo de tradução local
    translateBtn.textContent = 'Traduzindo...';
    translateBtn.classList.add('translating');
    
    const translateRequestId = 'trans_' + Math.random().toString(36).substring(2, 9);
    
    const translateResponseListener = (event) => {
      if (event.detail && event.detail.requestId === translateRequestId) {
        window.removeEventListener('yt-translate-response', translateResponseListener);
        
        const { result, error } = event.detail;
        
        if (error) {
          showToast(`⚠️ IA Local Indisponível\n${error}`);
          translateBtn.textContent = 'Traduzir 🌐';
          translateBtn.classList.remove('translating');
        } else if (result) {
          tabContentsMap[index] = result;
          tabTranslatedFlags[index] = true;
          
          if (currentActiveTabIdx === index) {
            const tabContent = popup.querySelector(`.local-ia-tab-content[data-tab-idx="${index}"]`);
            if (tabContent) {
              const isConsolidado = index === Object.keys(tabContentsMapOriginal).length - 1 && Object.keys(tabContentsMapOriginal).length > 1;
              tabContent.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 10px; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; color: #ffffff;">
                  ${videoTitle} - ${isConsolidado ? 'Resumo Geral Consolidado' : `Parte ${index + 1}`} (Traduzido)
                </div>
                <div class="local-ia-content-markdown" style="font-size: 12.5px; text-align: left;">
                  ${renderMarkdown(result)}
                </div>
              `;
            }
            translateBtn.textContent = 'Ver Original 🇺🇸';
            translateBtn.classList.remove('translating');
          }
        }
      }
    };
    
    window.addEventListener('yt-translate-response', translateResponseListener);
    
    window.dispatchEvent(new CustomEvent('yt-translate-request', {
      detail: {
        text: tabContentsMap[index],
        sourceLanguage: 'en',
        targetLanguage: 'pt',
        requestId: translateRequestId
      }
    }));
  }

  // Ouvintes de eventos do Main World
  function handleChunksCount(e) {
    if (e.detail.requestId !== requestId) return;
    const { totalChunks } = e.detail;
    console.log(`[Local IA UI] Inicializando interface para ${totalChunks} partes.`);
    
    const tabsContainer = popup.querySelector('.local-ia-tabs-container');
    const body = popup.querySelector('.local-ia-popup-body');
    
    if (tabsContainer && body) {
      tabsContainer.style.display = 'flex';
      tabsContainer.innerHTML = '';
      body.innerHTML = ''; 
      
      // 1. Criar a primeira aba: Visão Geral (índice 0)
      const visionTabBtn = document.createElement('button');
      visionTabBtn.className = 'local-ia-tab-button';
      visionTabBtn.setAttribute('data-tab-idx', 0);
      visionTabBtn.innerHTML = `<span>Visão Geral</span> <span class="tab-status-icon">🔒</span>`;
      tabsContainer.appendChild(visionTabBtn);
      
      const visionTabContent = document.createElement('div');
      visionTabContent.className = 'local-ia-tab-content';
      visionTabContent.setAttribute('data-tab-idx', 0);
      visionTabContent.innerHTML = `
        <div class="local-ia-loading-container">
          <div class="local-ia-spinner"></div>
          <div class="local-ia-loading-text">Gerando Visão Geral com toda a transcrição...</div>
        </div>
      `;
      body.appendChild(visionTabContent);
      
      // 2. Criar abas para as partes parciais (índice 1 a totalChunks)
      for (let i = 0; i < totalChunks; i++) {
        const partIdx = i + 1;
        const tabBtn = document.createElement('button');
        tabBtn.className = 'local-ia-tab-button';
        tabBtn.setAttribute('data-tab-idx', partIdx);
        tabBtn.innerHTML = `<span>Parte ${i + 1}</span> <span class="tab-status-icon">🔒</span>`;
        tabsContainer.appendChild(tabBtn);
        
        const tabContent = document.createElement('div');
        tabContent.className = 'local-ia-tab-content';
        tabContent.setAttribute('data-tab-idx', partIdx);
        tabContent.innerHTML = `
          <div class="local-ia-loading-container">
            <div class="local-ia-spinner"></div>
            <div class="local-ia-loading-text">Na fila de processamento...</div>
          </div>
        `;
        body.appendChild(tabContent);
      }
      
      // Selecionar por padrão a primeira aba (Visão Geral)
      selectTab(0);
    }
  }

  function handleProgress(e) {
    if (e.detail.requestId !== requestId) return;
    const { chunkIndex, text } = e.detail;
    
    const tabContent = popup.querySelector(`.local-ia-tab-content[data-tab-idx="${chunkIndex}"]`);
    if (tabContent) {
      const spinner = tabContent.querySelector('.local-ia-spinner');
      const loadingText = tabContent.querySelector('.local-ia-loading-text');
      
      if (!spinner) {
        tabContent.innerHTML = `
          <div class="local-ia-loading-container">
            <div class="local-ia-spinner"></div>
            <div class="local-ia-loading-text">${text}</div>
          </div>
        `;
      } else if (loadingText) {
        loadingText.textContent = text;
      }
    }
    
    const tabBtn = popup.querySelector(`.local-ia-tab-button[data-tab-idx="${chunkIndex}"]`);
    if (tabBtn && !tabBtn.classList.contains('unlocked')) {
      tabBtn.className = 'local-ia-tab-button processing';
      tabBtn.querySelector('.tab-status-icon').textContent = '⏳';
    }
    
    const footerText = popup.querySelector('.local-ia-popup-footer span');
    if (footerText) footerText.textContent = text;
  }

  function handleChunkReady(e) {
    if (e.detail.requestId !== requestId) return;
    const { chunkIndex, result } = e.detail;
    
    tabContentsMap[chunkIndex] = result;
    tabContentsMapOriginal[chunkIndex] = result; // Salvar original para cache
    
    const tabBtn = popup.querySelector(`.local-ia-tab-button[data-tab-idx="${chunkIndex}"]`);
    if (tabBtn) {
      tabBtn.className = 'local-ia-tab-button unlocked';
      tabBtn.querySelector('.tab-status-icon').textContent = '✓';
      tabBtn.onclick = () => selectTab(chunkIndex);
    }
    
    const tabContent = popup.querySelector(`.local-ia-tab-content[data-tab-idx="${chunkIndex}"]`);
    if (tabContent) {
      const isOverview = chunkIndex === 0;
      tabContent.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 10px; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; color: #ffffff;">
          ${videoTitle} - ${isOverview ? 'Visão Geral' : `Parte ${chunkIndex}`}
        </div>
        <div class="local-ia-content-markdown" style="font-size: 12.5px; text-align: left;">
          ${renderMarkdown(result)}
        </div>
      `;
    }
    
    if (chunkIndex === 0) {
      selectTab(0);
    }
  }

  window.addEventListener('yt-summarize-chunks-count', handleChunksCount);
  window.addEventListener('yt-summarize-progress', handleProgress);
  window.addEventListener('yt-summarize-chunk-ready', handleChunkReady);
  
  function cleanupListeners() {
    window.removeEventListener('yt-summarize-chunks-count', handleChunksCount);
    window.removeEventListener('yt-summarize-progress', handleProgress);
    window.removeEventListener('yt-summarize-chunk-ready', handleChunkReady);
  }
  
  popup.__cleanup = cleanupListeners;
  
  const closeBtn = popup.querySelector('.local-ia-popup-close');
  closeBtn.addEventListener('click', () => {
    cleanupListeners();
    popup.classList.remove('active');
    setTimeout(() => popup.remove(), 250);
  });
  
  // Iniciar fluxo assíncrono de transcrição e resumo
  try {
    const transcription = await getVideoTranscription(videoId);
    if (!transcription) {
      showPopupError(popup, "Não foi possível obter a transcrição automática desse vídeo do YouTube. O vídeo pode estar sem legendas disponíveis.", videoId, presetKey, videoTitle);
      return;
    }
    
    // Iniciar a escuta da resposta consolidada final
    const finalResponseListener = (event) => {
      if (event.detail && event.detail.requestId === requestId) {
        window.removeEventListener('yt-summarize-response', finalResponseListener);
        cleanupListeners();
        
        if (event.detail.error) {
          showPopupError(popup, event.detail.error, videoId, presetKey, videoTitle);
        } else {
          const footerText = popup.querySelector('.local-ia-popup-footer span');
          if (footerText) footerText.innerHTML = "🤖 Sumarização progressiva via <strong>Gemini Nano</strong>";
        }
      }
    };
    window.addEventListener('yt-summarize-response', finalResponseListener);
    
    const options = {
      type: 'tldr',
      format: 'plain-text',
      length: 'long'
    };
    
    const loadingText = popup.querySelector('.local-ia-loading-text');
    if (loadingText) loadingText.textContent = "Calculando divisões da transcrição...";
    
    const preset = PROMPT_PRESETS[presetKey];
    
    window.dispatchEvent(new CustomEvent('yt-summarize-request', {
      detail: { 
        text: transcription, 
        presetPrompt: preset ? preset.prompt : null,
        videoTitle: videoTitle,
        options, 
        requestId 
      }
    }));
    
  } catch (err) {
    console.error("[Local IA] Falha no processamento:", err);
    cleanupListeners();
    showPopupError(popup, err.message, videoId, presetKey, videoTitle);
  }
}

function showPopupResult(popup, text, videoTitle) {
  // Esta função é mantida para o fluxo clássico e fallback em nuvem
  const tabsContainer = popup.querySelector('.local-ia-tabs-container');
  if (tabsContainer) tabsContainer.style.display = 'none'; // Esconder abas se for resultado consolidado direto
  
  const body = popup.querySelector('.local-ia-popup-body');
  if (body) {
    body.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 10px; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 6px; color: #ffffff;">
        ${videoTitle}
      </div>
      <div class="local-ia-content-markdown" style="font-size: 12.5px; text-align: left;">
        ${renderMarkdown(text)}
      </div>
    `;
  }
  
  const footerText = popup.querySelector('.local-ia-popup-footer span');
  if (footerText) {
    footerText.innerHTML = "🤖 Sumarizado via <strong>Gemini na Nuvem</strong>";
  }
  
  const copyBtn = popup.querySelector('.local-ia-popup-copy-btn');
  if (copyBtn) {
    copyBtn.style.display = 'block';
    copyBtn.textContent = 'Copiar Resumo';
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copiado!';
        copyBtn.style.background = '#30d158';
        setTimeout(() => {
          copyBtn.textContent = 'Copiar Resumo';
          copyBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        }, 2000);
      } catch (e) {
        showToast('❌ Falha ao copiar.');
      }
    };
  }
}

function showPopupError(popup, message, videoId, presetKey, videoTitle) {
  const tabsContainer = popup.querySelector('.local-ia-tabs-container');
  if (tabsContainer) tabsContainer.style.display = 'none';
  
  const body = popup.querySelector('.local-ia-popup-body');
  if (body) {
    body.innerHTML = `
      <div class="local-ia-error-container" style="text-align: center;">
        <div style="font-weight: 700; margin-bottom: 8px; font-size: 14px; color: #ff453a; display: flex; align-items: center; justify-content: center; gap: 6px;">
          ⚠️ IA Local Indisponível
        </div>
        <div style="font-size: 12px; opacity: 0.85; margin-bottom: 12px; line-height: 1.4; text-align: left;">
          ${message}
        </div>
        <div style="font-size: 11px; opacity: 0.8; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); text-align: left; line-height: 1.5; margin-bottom: 14px; color: #e5e5ea;">
          <strong>Como habilitar o Gemini Nano no Chrome:</strong><br>
          1. Acesse <code>chrome://flags</code> no seu navegador.<br>
          2. Ative <strong>"Enables optimization guide on-device model"</strong> (mude para Enabled Bypass list ou Enabled).<br>
          3. Ative <strong>"Prompt API for Gemini Nano"</strong> (mude para Enabled).<br>
          4. Reinicie o Chrome e aguarde alguns minutos para o download do modelo.<br>
          <span style="font-size: 10px; color: #8e8e93; display: block; margin-top: 4px;">*Requer computador com GPU dedicada e min. 8GB de RAM.</span>
        </div>
        <button class="local-ia-fallback-btn">Usar Gemini na Nuvem (Fallback) ☁️</button>
      </div>
    `;
    
    const fallbackBtn = body.querySelector('.local-ia-fallback-btn');
    fallbackBtn.onclick = async () => {
      body.innerHTML = `
        <div class="local-ia-loading-container">
          <div class="local-ia-spinner"></div>
          <div class="local-ia-loading-text">Processando com Gemini na Nuvem (API)...</div>
        </div>
      `;
      
      const footerText = popup.querySelector('.local-ia-popup-footer span');
      if (footerText) footerText.textContent = "Obtendo dados...";
      
      try {
        const transcription = await getVideoTranscription(videoId);
        if (!transcription) {
          showToast("❌ Não foi possível obter a transcrição.");
          popup.remove();
          return;
        }
        
        if (footerText) footerText.textContent = "Processando Gemini Flash...";
        
        const preset = PROMPT_PRESETS[presetKey];
        const fullPrompt = preset.prompt
          .replace('[VIDEO_TITLE]', videoTitle)
          .replace('[TRANSCRIPTION]', transcription);
        
        const response = await callGeminiAPI(fullPrompt);
        showPopupResult(popup, response, videoTitle);
      } catch (err) {
        showToast("❌ Erro no fallback: " + err.message);
        popup.remove();
      }
    };
  }
  
  const footerText = popup.querySelector('.local-ia-popup-footer span');
  if (footerText) {
    footerText.textContent = "Modo Fallback Disponível";
  }
}

// Variante do showPresetSelector que já tem a transcrição (com timestamps) pronta
// Usada pelo botão de transcrição com timestamps do player
function showPresetSelectorWithTranscript(transcriptWithTs, videoId) {
  const existingSelector = document.querySelector('.youtube-preset-selector');
  if (existingSelector) existingSelector.remove();

  const selector = document.createElement('div');
  selector.className = 'youtube-preset-selector';

  let presetsHTML = '';
  for (const [key, preset] of Object.entries(PROMPT_PRESETS)) {
    presetsHTML += `
      <div class="preset-option" data-preset="${key}">
        <div class="preset-name">${preset.name}</div>
        <div class="preset-description">${preset.description}</div>
      </div>
    `;
  }

  selector.innerHTML = `
    <div class="preset-overlay"></div>
    <div class="preset-modal">
      <div class="preset-header">
        <h3>Escolha o tipo de resumo</h3>
        <button class="preset-close">×</button>
      </div>
      <div class="preset-options">
        ${presetsHTML}
      </div>
    </div>
  `;

  document.body.appendChild(selector);

  const closeBtn = selector.querySelector('.preset-close');
  const overlay = selector.querySelector('.preset-overlay');
  closeBtn.addEventListener('click', () => selector.remove());
  overlay.addEventListener('click', () => selector.remove());

  const options = selector.querySelectorAll('.preset-option');
  options.forEach(option => {
    option.addEventListener('click', async () => {
      const presetKey = option.getAttribute('data-preset');
      selector.remove();

      const preset = PROMPT_PRESETS[presetKey];
      const videoTitle = getCurrentVideoTitle();
      const fullPrompt = preset.prompt
        .replace('[VIDEO_TITLE]', videoTitle)
        .replace('[TRANSCRIPTION]', transcriptWithTs);

      // Salvar no chrome.storage
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          'youtubeTranscription': {
            text: fullPrompt,
            timestamp: Date.now(),
            videoId: videoId,
            preset: presetKey
          }
        }, () => console.log('[SmartCaptions] Prompt com timestamps salvo no storage.'));
      }

      // Copiar para clipboard
      try {
        await navigator.clipboard.writeText(fullPrompt);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = fullPrompt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }

      showToast('📋 Prompt copiado! Cole no Gemini, ChatGPT ou Claude.');
    });
  });
}

// Nova função para criar o popup de prompt
function createPromptPopup(button, transcription) {
  // Remover popup existente se houver
  const existingPopup = document.querySelector('.youtube-summary-prompt-popup');
  if (existingPopup) existingPopup.remove();
  
  const popup = document.createElement('div');
  popup.className = 'youtube-summary-prompt-popup';
  
  // Prompt pré-preenchido (sem a transcrição)
  const defaultPrompt = `Faça um resumo detalhado do seguinte vídeo em português do Brasil. Organize o conteúdo em 5 a 10 tópicos principais, destacando os pontos mais importantes. Formate a resposta em markdown com títulos, subtítulos e use negrito para destacar palavras-chave e conceitos importantes.

Transcrição do vídeo:

[TRANSCRIÇÃO SERÁ INSERIDA AQUI]

Por favor, estruture o resumo de forma clara e organizada, usando markdown para uma melhor apresentação.`;
  
  popup.innerHTML = `
    <div class="youtube-summary-prompt-header">
      <h3>Editar Prompt</h3>
      <button class="youtube-summary-prompt-close">×</button>
    </div>
    <textarea class="youtube-summary-prompt-textarea">${defaultPrompt}</textarea>
    <button class="youtube-summary-prompt-send">Enviar</button>
  `;
  
  // Posicionar acima do botão
  document.body.appendChild(popup);
  const buttonRect = button.getBoundingClientRect();
  popup.style.position = 'absolute';
  popup.style.top = `${buttonRect.top + window.pageYOffset - popup.offsetHeight - 10}px`;
  popup.style.left = `${buttonRect.left + window.pageXOffset}px`;
  
  // Eventos
  const closeBtn = popup.querySelector('.youtube-summary-prompt-close');
  closeBtn.addEventListener('click', () => popup.remove());
  
  const sendBtn = popup.querySelector('.youtube-summary-prompt-send');
  sendBtn.addEventListener('click', async () => {
    const userPrompt = popup.querySelector('.youtube-summary-prompt-textarea').value;
    const fullPrompt = userPrompt.replace('[TRANSCRIÇÃO SERÁ INSERIDA AQUI]', transcription);
    
    popup.remove();
    
    createSideMenu();
    openSideMenu();
    showLoading();
    
    try {
      const response = await callGeminiAPI(fullPrompt);
      showResult(response);
    } catch (error) {
      showError('Erro ao processar prompt: ' + error.message);
    }
  });
}

// Adicionar estilos para o popup no bloco de estilos
try {
  const styles = document.createElement("style");
  styles.textContent = `
    #thumbnail {
      position: relative;
    }



    /* Estilos para o botão no contêiner do vídeo */
    ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, .yt-lockup-view-model-wiz {
      position: relative !important;
    }

    .ai-summary-buttons-container {
      position: absolute;
      bottom: -30px;
      left: 6px;
      z-index: 9999;
    }

    .ai-summary-select {
      appearance: none;
      -webkit-appearance: none;
      background: rgba(15, 15, 15, 0.92);
      backdrop-filter: blur(6px);
      color: #e8e8e8;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
      padding: 4px 22px 4px 8px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
      outline: none;
      transition: border-color 0.18s, background 0.18s;
      max-width: 148px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23aaa' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 5px center;
    }

    .ai-summary-select:hover {
      border-color: rgba(255,255,255,0.35);
      background-color: rgba(30, 30, 30, 0.97);
    }

    .ai-summary-select:focus {
      border-color: #4285f4;
      box-shadow: 0 0 0 2px rgba(66,133,244,0.3);
    }

    .ai-summary-select option {
      background: #1a1a1a;
      color: #e8e8e8;
      font-size: 12px;
    }

    .ai-summary-select optgroup {
      color: #888;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    /* Estilos para o popup do Local IA (Glassmorphism Ampliado) */
    .youtube-local-ia-popup {
      position: absolute;
      width: 480px;
      max-height: 560px;
      background: rgba(28, 28, 30, 0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
      color: #e5e5ea;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      z-index: 10000;
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      transition: opacity 0.25s ease, transform 0.25s ease;
      overflow: hidden;
    }

    .youtube-local-ia-popup.active {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .local-ia-popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .local-ia-popup-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.5px;
      color: #30d158;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .local-ia-popup-close {
      background: none;
      border: none;
      color: #8e8e93;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      transition: color 0.2s;
    }

    .local-ia-popup-close:hover {
      color: #ffffff;
    }

    .local-ia-popup-body {
      padding: 16px;
      font-size: 15px;
      line-height: 1.65;
      overflow-y: auto;
      flex: 1;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .local-ia-popup-body::-webkit-scrollbar {
      width: 6px;
    }

    .local-ia-popup-body::-webkit-scrollbar-track {
      background: transparent;
    }

    .local-ia-popup-body::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }

    .local-ia-popup-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      background: rgba(0, 0, 0, 0.25);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      color: #8e8e93;
    }

    .local-ia-popup-copy-btn {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 4px;
      color: #ffffff;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .local-ia-popup-copy-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .local-ia-popup-translate-btn {
      background: rgba(48, 209, 88, 0.15);
      border: 1px solid rgba(48, 209, 88, 0.3);
      border-radius: 4px;
      color: #30d158;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, color 0.2s;
    }

    .local-ia-popup-translate-btn:hover {
      background: rgba(48, 209, 88, 0.25);
      border-color: rgba(48, 209, 88, 0.5);
      color: #ffffff;
    }
    
    .local-ia-popup-translate-btn.translating {
      background: rgba(255, 159, 10, 0.15);
      border-color: rgba(255, 159, 10, 0.3);
      color: #ff9f0a;
      cursor: wait;
    }

    /* Estado de Loading do Popup */
    .local-ia-loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 50px 24px;
      text-align: center;
      gap: 14px;
    }

    .local-ia-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #30d158;
      border-radius: 50%;
      animation: local-ia-spin 1s linear infinite;
    }

    @keyframes local-ia-spin {
      to { transform: rotate(360deg); }
    }

    /* Mensagem de Erro/Fallback */
    .local-ia-error-container {
      padding: 12px 0;
      color: #ff453a;
    }

    .local-ia-fallback-btn {
      margin-top: 14px;
      width: 100%;
      background: #4285f4;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .local-ia-fallback-btn:hover {
      background: #3367d6;
    }

    /* Menu de Abas Progressivas */
    .local-ia-tabs-container {
      display: flex;
      background: rgba(0, 0, 0, 0.25);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      overflow-x: auto;
      scrollbar-width: none;
    }

    .local-ia-tabs-container::-webkit-scrollbar {
      display: none;
    }

    .local-ia-tab-button {
      flex: 1;
      min-width: 90px;
      padding: 10px 12px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #8e8e93;
      font-size: 12.5px;
      font-weight: 600;
      text-align: center;
      cursor: not-allowed;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
    }

    .local-ia-tab-button.unlocked {
      cursor: pointer;
      color: #aeaeb2;
    }

    .local-ia-tab-button.unlocked:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.03);
    }

    .local-ia-tab-button.active {
      color: #30d158;
      border-bottom-color: #30d158;
      background: rgba(48, 209, 88, 0.05);
    }

    .local-ia-tab-button.processing {
      color: #ff9f0a;
      cursor: wait;
    }

    /* Esconder abas que não estão sendo visualizadas */
    .local-ia-tab-content {
      display: none;
      height: 100%;
    }

    .local-ia-tab-content.active {
      display: block;
      animation: local-ia-fade-in 0.25s ease;
    }

    @keyframes local-ia-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ai-summary-video-container-button.copy-prompt {
      background-color: #cc785c;
    }

    .ai-summary-video-container-button.copy-prompt:hover {
      background-color: #b5643a !important;
    }

    .ai-summary-video-container-button.live-talk {
      background-color: #8B5CF6;
    }

    .ai-summary-video-container-button.live-talk:hover {
      background-color: #7c3aed !important;
    }

    .ai-summary-video-container-button svg {
      margin-right: 4px;
    }

    .ai-summary-video-container-button:hover {
      background-color: #3367d6;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    }

    /* Estilos para o menu lateral */
    .youtube-summary-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: none;
      justify-content: flex-end;
      align-items: stretch;
      z-index: 999999;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .youtube-summary-overlay.active {
      opacity: 1;
    }

    .youtube-summary-menu {
      width: 40%;
      max-width: 90vw;
      min-width: 300px;
      height: 100%;
      background-color: #1a1a1a;
      color: white;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s ease, width 0.2s ease;
      box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3);
      position: relative;
    }

    .youtube-summary-menu.resizing {
      transition: none;
    }

    .youtube-summary-menu.active {
      transform: translateX(0);
    }

    .youtube-summary-header {
      padding: 20px;
      background-color: #2a2a2a;
      border-bottom: 1px solid #3a3a3a;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .youtube-summary-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: white;
    }

    .youtube-summary-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background-color 0.2s;
    }

    .youtube-summary-close:hover {
      background-color: #3a3a3a;
    }

    .youtube-summary-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.8;
      font-size: 20px;
    }

    .youtube-summary-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: #aaa;
    }

    .youtube-summary-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #333;
      border-top: 3px solid #065fd4;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 15px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .youtube-summary-result {
      opacity: 1;
      transition: opacity 0.5s ease;
    }

    .youtube-summary-result h1 {
      font-size: 24px;
      margin: 0 0 20px 0;
      color: #065fd4;
    }

    .youtube-summary-result h2 {
      font-size: 20px;
      margin: 25px 0 15px 0;
      color: #4a9eff;
    }

    .youtube-summary-result h3 {
      font-size: 18px;
      margin: 20px 0 10px 0;
      color: #6bb6ff;
    }

    .youtube-summary-result p {
      margin: 0 0 15px 0;
      color: #e0e0e0;
    }

    .youtube-summary-result strong {
      color: white;
      font-weight: 600;
    }

    .youtube-summary-result ul, .youtube-summary-result ol {
      margin: 15px 0;
      padding-left: 20px;
    }

    .youtube-summary-result li {
      margin: 8px 0;
      color: #e0e0e0;
    }

    .youtube-summary-result em {
      color: #b8b8b8;
      font-style: italic;
    }

    .youtube-summary-error {
      color: #ff6b6b;
      background-color: #2a1a1a;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #ff6b6b;
      margin: 20px 0;
    }

    .youtube-summary-footer {
      padding: 20px;
      background-color: #2a2a2a;
      border-top: 1px solid #3a3a3a;
    }

    .youtube-summary-input-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .youtube-summary-input-container textarea {
      width: 100%;
      min-height: 80px;
      padding: 12px;
      border: 1px solid #3a3a3a;
      border-radius: 8px;
      background-color: #1a1a1a;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 14px;
      resize: vertical;
      box-sizing: border-box;
    }

    .youtube-summary-input-container textarea::placeholder {
      color: #888;
    }

    .youtube-summary-input-container textarea:focus {
      outline: none;
      border-color: #065fd4;
    }

    .youtube-summary-send-btn {
      align-self: flex-end;
      padding: 10px 20px;
      background-color: #065fd4;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .youtube-summary-send-btn:hover {
      background-color: #0056b3;
    }

    .youtube-summary-send-btn:disabled {
      background-color: #333;
      cursor: not-allowed;
    }

    /* Scrollbar personalizada para o menu */
    .youtube-summary-content::-webkit-scrollbar {
      width: 8px;
    }

    .youtube-summary-content::-webkit-scrollbar-track {
      background: #2a2a2a;
    }

    .youtube-summary-content::-webkit-scrollbar-thumb {
      background: #4a4a4a;
      border-radius: 4px;
    }

    .youtube-summary-content::-webkit-scrollbar-thumb:hover {
      background: #5a5a5a;
    }

    /* Estilos para a alça de redimensionamento */
    .youtube-summary-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 10px;
      height: 100%;
      cursor: col-resize;
      z-index: 100;
    }

    /* Overlay para evitar seleção de texto durante o redimensionamento */
    .youtube-summary-resize-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      cursor: col-resize;
      z-index: 9999999;
    }

    /* Estilos para o popup de prompt */
    .youtube-summary-prompt-popup {
      width: 300px;
      background-color: #2a2a2a;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      padding: 15px;
      z-index: 10000;
    }

    .youtube-summary-prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .youtube-summary-prompt-header h3 {
      margin: 0;
      font-size: 16px;
      color: white;
    }

    .youtube-summary-prompt-close {
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
    }

    .youtube-summary-prompt-textarea {
      width: 100%;
      height: 150px;
      padding: 10px;
      background-color: #1a1a1a;
      color: white;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      resize: vertical;
      font-size: 14px;
    }

    .youtube-summary-prompt-send {
      margin-top: 10px;
      padding: 8px 16px;
      background-color: #065fd4;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      float: right;
    }

    .youtube-summary-prompt-send:hover {
      background-color: #0056b3;
    }

    /* Estilos para o seletor de presets */
    .youtube-preset-selector {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .preset-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
    }

    .preset-modal {
      position: relative;
      background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow: hidden;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .preset-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #3a3a3a;
    }

    .preset-header h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: white;
    }

    .preset-close {
      background: none;
      border: none;
      color: #aaa;
      font-size: 28px;
      cursor: pointer;
      transition: color 0.2s;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .preset-close:hover {
      color: white;
    }

    .preset-options {
      padding: 16px;
      max-height: calc(80vh - 80px);
      overflow-y: auto;
    }

    .preset-option {
      background: #2a2a2a;
      border: 2px solid #3a3a3a;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .preset-option:hover {
      background: #333;
      border-color: #065fd4;
      transform: translateX(4px);
    }

    .preset-option:active {
      transform: translateX(2px);
    }

    .preset-name {
      font-size: 16px;
      font-weight: 600;
      color: white;
      margin-bottom: 4px;
    }

    .preset-description {
      font-size: 13px;
      color: #aaa;
    }

    /* Scrollbar customizada para o modal */
    .preset-options::-webkit-scrollbar {
      width: 8px;
    }

    .preset-options::-webkit-scrollbar-track {
      background: #1a1a1a;
      border-radius: 4px;
    }

    .preset-options::-webkit-scrollbar-thumb {
      background: #3a3a3a;
      border-radius: 4px;
    }

    .preset-options::-webkit-scrollbar-thumb:hover {
      background: #4a4a4a;
    }

    /* ===== BOTÃO FLUTUANTE ÚNICO — SIDE PANEL ===== */
    #yt-sidepanel-fab {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4285f4 0%, #10a37f 50%, #4D6BFE 100%);
      color: white;
      border: none;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 4px 18px rgba(66, 107, 254, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    #yt-sidepanel-fab:hover {
      transform: scale(1.12) translateY(-2px);
      box-shadow: 0 8px 28px rgba(66, 107, 254, 0.6);
    }

    #yt-sidepanel-fab:active {
      transform: scale(0.95);
    }

    /* Popup do prompt personalizado */
    #yt-custom-prompt-popup {
      position: fixed;
      bottom: 96px;
      right: 28px;
      width: 380px;
      max-width: calc(100vw - 56px);
      background: linear-gradient(160deg, #1e1e2e 0%, #2a2a3e 100%);
      border: 1px solid rgba(66, 133, 244, 0.3);
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05);
      z-index: 2147483646;
      overflow: hidden;
      animation: fabPopupIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      transform-origin: bottom right;
    }

    @keyframes fabPopupIn {
      from { opacity: 0; transform: scale(0.85) translateY(12px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }

    #yt-custom-prompt-popup.closing {
      animation: fabPopupOut 0.18s ease forwards;
    }

    @keyframes fabPopupOut {
      from { opacity: 1; transform: scale(1) translateY(0); }
      to   { opacity: 0; transform: scale(0.85) translateY(12px); }
    }

    .yt-cp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }

    .yt-cp-header h4 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: #e8eaed;
      letter-spacing: 0.2px;
    }

    .yt-cp-close {
      background: none;
      border: none;
      color: #9aa0a6;
      font-size: 20px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.15s, color 0.15s;
      padding: 0;
      line-height: 1;
    }

    .yt-cp-close:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }

    .yt-cp-body {
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .yt-cp-textarea {
      width: 100%;
      min-height: 140px;
      max-height: 40vh;
      padding: 12px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      color: #e8eaed;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 13.5px;
      line-height: 1.6;
      resize: vertical;
      box-sizing: border-box;
      transition: border-color 0.2s;
      outline: none;
    }

    .yt-cp-textarea::placeholder {
      color: #5f6368;
    }

    .yt-cp-textarea:focus {
      border-color: rgba(66, 133, 244, 0.6);
      background: rgba(0,0,0,0.4);
    }

    .yt-cp-footer {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .yt-cp-select {
      flex: 1;
      padding: 9px 12px;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #e8eaed;
      font-size: 13px;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239aa0a6' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 30px;
    }

    .yt-cp-select:focus {
      border-color: rgba(66, 133, 244, 0.6);
    }

    .yt-cp-select option {
      background: #2a2a3e;
      color: #e8eaed;
    }

    .yt-cp-send {
      padding: 9px 20px;
      background: linear-gradient(135deg, #065fd4 0%, #4285f4 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: opacity 0.2s, transform 0.15s;
      letter-spacing: 0.2px;
    }

    .yt-cp-send:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .yt-cp-send:active {
      transform: translateY(0);
    }

    .yt-cp-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    /* Animação de rotação da esfera do FAB */
    @keyframes yt-fab-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    /* Painel do Gemini Integrado */
    .smart-captions-gemini-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 550px;
      height: 85vh;
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 16px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-shadow: 0 15px 50px rgba(0,0,0,0.8);
      overflow: hidden;
      animation: panelSlideIn 0.3s ease-out;
    }

    @keyframes panelSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .smart-captions-gemini-header {
      padding: 14px 18px;
      background: #2a2a2a;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #4285f4;
    }

    .smart-captions-gemini-header h3 {
      margin: 0;
      font-size: 15px;
      color: #fff;
    }

    .smart-captions-iframe {
      flex: 1;
      border: none;
      background: #fff;
    }

    .smart-captions-gemini-footer {
      padding: 15px;
      background: #1e1e1e;
      border-top: 1px solid #333;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .smart-captions-minimize {
      cursor: pointer;
      color: #aaa;
      font-size: 20px;
      background: none;
      border: none;
      padding: 5px;
    }

    .smart-captions-gemini-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 10px;
      height: 100%;
      cursor: col-resize;
      z-index: 1001;
      background: transparent;
      transition: background 0.2s;
    }

    .smart-captions-gemini-resize-handle:hover {
      background: rgba(66, 133, 244, 0.2);
    }

    .smart-captions-gemini-panel.resizing {
      user-select: none;
      pointer-events: none; /* Evita que o iframe capture eventos durante o resize */
    }

    .smart-captions-gemini-panel.resizing .smart-captions-iframe {
      pointer-events: none;
    }

    .smart-captions-gemini-panel.minimized {
      height: 48px !important;
      width: 250px !important;
      overflow: hidden;
    }

    .smart-captions-gemini-panel.minimized .smart-captions-iframe,
    .smart-captions-gemini-panel.minimized .smart-captions-gemini-resize-handle,
    .smart-captions-gemini-panel.minimized .smart-captions-paste-overlay {
      display: none;
    }

    .smart-captions-paste-overlay {
      position: absolute;
      bottom: 10px;
      left: 10px;
      right: 10px;
      background: #252525;
      border: 1px solid #444;
      border-radius: 12px;
      padding: 12px;
      display: none;
      flex-direction: column;
      gap: 8px;
      z-index: 1002;
      box-shadow: 0 -5px 20px rgba(0,0,0,0.5);
    }

    .smart-captions-paste-overlay.active {
      display: flex;
    }

    .smart-captions-header-btn {
      background: #4285f4;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: bold;
      cursor: pointer;
      margin-right: 10px;
    }

    .smart-captions-header-btn:hover {
      background: #3367d6;
    }

    /* ===== POPUP DE LEGENDAS INTELIGENTES ===== */
    #smart-captions-popup {
      position: fixed;
      width: 380px;
      max-width: calc(100vw - 20px);
      background: linear-gradient(160deg, #18181f 0%, #23232f 100%);
      border: 1px solid rgba(66, 133, 244, 0.25);
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05);
      z-index: 2147483647;
      overflow: hidden;
      opacity: 0;
      transform: scale(0.92) translateY(8px);
      transition: opacity 0.22s cubic-bezier(0.34,1.56,0.64,1), transform 0.22s cubic-bezier(0.34,1.56,0.64,1);
      transform-origin: top center;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    #smart-captions-popup.sc-popup-visible {
      opacity: 1;
      transform: scale(1) translateY(0);
    }

    .sc-popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 16px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      background: rgba(66,133,244,0.08);
    }

    .sc-popup-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #e8eaed;
      letter-spacing: 0.2px;
    }

    .sc-popup-close {
      background: none;
      border: none;
      color: #9aa0a6;
      font-size: 22px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.15s, color 0.15s;
      padding: 0;
      line-height: 1;
      flex-shrink: 0;
    }

    .sc-popup-close:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }

    .sc-popup-instructions {
      padding: 12px 16px 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .sc-popup-step {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .sc-popup-step-num {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: linear-gradient(135deg, #065fd4, #4285f4);
      color: white;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .sc-popup-step-text {
      font-size: 12.5px;
      color: #bdc1c6;
      line-height: 1.5;
    }

    .sc-popup-step-text strong {
      color: #e8eaed;
    }

    .sc-popup-link {
      color: #4285f4;
      text-decoration: none;
      font-weight: 600;
    }

    .sc-popup-link:hover {
      text-decoration: underline;
    }

    .sc-popup-kbd {
      display: inline-block;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 11px;
      font-family: monospace;
      color: #e8eaed;
    }

    .sc-popup-body {
      padding: 12px 16px;
    }

    .sc-popup-textarea {
      width: 100%;
      min-height: 110px;
      max-height: 220px;
      padding: 10px 12px;
      background: rgba(0,0,0,0.35);
      border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      color: #e8eaed;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.5;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s, background 0.2s;
    }

    .sc-popup-textarea::placeholder {
      color: #5f6368;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    .sc-popup-textarea:focus {
      border-color: rgba(66,133,244,0.5);
      background: rgba(0,0,0,0.45);
    }

    .sc-popup-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px 14px;
    }

    .sc-popup-btn-secondary {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 13px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #bdc1c6;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
      font-family: inherit;
    }

    .sc-popup-btn-secondary:hover {
      background: rgba(255,255,255,0.12);
      color: #e8eaed;
    }

    .sc-popup-btn-primary {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 9px 16px;
      background: linear-gradient(135deg, #065fd4 0%, #4285f4 100%);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: opacity 0.15s, transform 0.15s;
      letter-spacing: 0.2px;
      font-family: inherit;
    }

    .sc-popup-btn-primary:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .sc-popup-btn-primary:active {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(styles);
} catch (error) {
}

// Executar a função addSummaryIcons mais vezes para garantir que os elementos sejam capturados

// ===== BOTÃO FLUTUANTE ÚNICO — SIDE PANEL =====

/**
 * Cria e injeta o botão flutuante (FAB) único que abre o Chrome Side Panel.
 * Substitui os 3 FABs anteriores (Gemini, ChatGPT, DeepSeek) por um único botão.
 */
function createSidePanelFAB() {
  if (document.getElementById('yt-sidepanel-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'yt-sidepanel-fab';
  fab.title = 'Abrir AI Assistant';
  fab.setAttribute('aria-label', 'Abrir AI Assistant');
  fab.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="white" stroke="white" stroke-width="0.5" stroke-linejoin="round"/>
    </svg>
  `;

  fab.addEventListener('click', () => {
    _openSidePanel('openGeminiSidePanel', 'https://gemini.google.com/app');
  });

  document.body.appendChild(fab);
}

/**
 * Abre o popup de prompt personalizado.
 */
function openCustomPromptPopup() {
  // Fechar se já existir
  const existing = document.getElementById('yt-custom-prompt-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'yt-custom-prompt-popup';

  popup.innerHTML = `
    <div class="yt-cp-header">
      <h4>✨ Prompt Personalizado</h4>
      <button class="yt-cp-close" id="yt-cp-close-btn" aria-label="Fechar">×</button>
    </div>
    <div class="yt-cp-body">
      <textarea
        id="yt-cp-textarea"
        class="yt-cp-textarea"
        placeholder="Digite seu prompt aqui...&#10;&#10;Exemplo: Explique os conceitos principais deste vídeo de forma simples."
        maxlength="2147483647"
      ></textarea>
      <div class="yt-cp-footer">
        <select id="yt-cp-platform-select" class="yt-cp-select">
          <option value="gemini" selected>🔵 Gemini</option>
          <option value="chatgpt">🟢 ChatGPT</option>
          <option value="deepseek">🔵 DeepSeek</option>
          <option value="claude">🟠 Claude</option>
          <option value="metaai">🔵 Meta AI</option>
        </select>
        <button id="yt-cp-send-btn" class="yt-cp-send">Enviar →</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Focar no textarea
  const textarea = document.getElementById('yt-cp-textarea');
  setTimeout(() => textarea && textarea.focus(), 50);

  // Fechar ao clicar no X
  document.getElementById('yt-cp-close-btn').addEventListener('click', closeCustomPromptPopup);

  // Enviar
  document.getElementById('yt-cp-send-btn').addEventListener('click', handleCustomPromptSend);

  // Ctrl+Enter para enviar
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleCustomPromptSend();
    }
  });

  // Fechar ao clicar fora do popup e do FAB
  setTimeout(() => {
    document.addEventListener('click', outsideClickHandler);
  }, 100);
}

function outsideClickHandler(e) {
  const popup = document.getElementById('yt-custom-prompt-popup');
  const fab = document.getElementById('yt-custom-prompt-fab');
  if (popup && !popup.contains(e.target) && fab && !fab.contains(e.target)) {
    closeCustomPromptPopup();
  }
}

/**
 * Fecha o popup com animação.
 */
function closeCustomPromptPopup() {
  document.removeEventListener('click', outsideClickHandler);
  const popup = document.getElementById('yt-custom-prompt-popup');
  if (!popup) return;
  popup.classList.add('closing');
  setTimeout(() => popup.remove(), 180);
}

/**
 * Processa o envio do prompt personalizado:
 * salva no chrome.storage e redireciona para Gemini ou ChatGPT,
 * exatamente como o fluxo dos presets existentes.
 */
async function handleCustomPromptSend() {
  const textarea = document.getElementById('yt-cp-textarea');
  const select = document.getElementById('yt-cp-platform-select');
  const sendBtn = document.getElementById('yt-cp-send-btn');

  if (!textarea || !select) return;

  const userPrompt = textarea.value.trim();
  if (!userPrompt) {
    textarea.focus();
    textarea.style.borderColor = 'rgba(234, 67, 53, 0.7)';
    setTimeout(() => { textarea.style.borderColor = ''; }, 1500);
    return;
  }

  const platform = select.value; // 'gemini' ou 'chatgpt'

  // Desabilitar botão enquanto processa
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Salvando...';
  }

  // Montar o dado no mesmo formato que processWithPreset usa
  const transcriptionData = {
    text: userPrompt,
    timestamp: Date.now(),
    videoId: null,
    preset: 'custom'
  };

  // Salvar no chrome.storage (mesmo mecanismo dos presets)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ 'youtubeTranscription': transcriptionData }, () => {
      if (chrome.runtime.lastError) {
        console.error('[CustomPrompt] Erro ao salvar:', chrome.runtime.lastError);
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar →'; }
        return;
      }
      closeCustomPromptPopup();
      // Redirecionar para a plataforma escolhida
      if (platform === 'gemini') {
        // Abrir no Side Panel
        if (typeof smartSubtitleSystem !== 'undefined') {
          smartSubtitleSystem.copyToClipboard(userPrompt);
          smartSubtitleSystem.updateOverlayStatus("Prompt copiado! Cole no Gemini no painel lateral.", true);
        }
        _openSidePanel('openGeminiSidePanel', 'https://gemini.google.com/app');
      } else if (platform === 'chatgpt') {
        _openSidePanel('openChatGPTSidePanel', 'https://chatgpt.com/');
      } else if (platform === 'deepseek') {
        _openSidePanel('openDeepSeekSidePanel', 'https://chat.deepseek.com/');
      } else if (platform === 'claude') {
        _openSidePanel('openClaudeSidePanel', 'https://claude.ai/new');
      } else if (platform === 'metaai') {
        _openSidePanel('openMetaAISidePanel', 'https://www.meta.ai/');
      }
    });
  } else {
    // Fallback sem chrome.storage
    closeCustomPromptPopup();
    if (platform === 'gemini') {
      if (typeof smartSubtitleSystem !== 'undefined') {
        smartSubtitleSystem.copyToClipboard(userPrompt);
      }
      _openSidePanel('openGeminiSidePanel', 'https://gemini.google.com/app');
    } else if (platform === 'chatgpt') {
      _openSidePanel('openChatGPTSidePanel', 'https://chatgpt.com/');
    } else if (platform === 'deepseek') {
      _openSidePanel('openDeepSeekSidePanel', 'https://chat.deepseek.com/');
    } else if (platform === 'claude') {
      _openSidePanel('openClaudeSidePanel', 'https://claude.ai/new');
    } else if (platform === 'metaai') {
      _openSidePanel('openMetaAISidePanel', 'https://www.meta.ai/');
    }
  }
}

// ===== BOTÃO FLUTUANTE CHATGPT =====

/**
 * Cria e injeta o botão flutuante (FAB) do ChatGPT.
 * Fica posicionado acima do FAB do Gemini.
 */
function createChatGPTFAB() {
  if (document.getElementById('yt-chatgpt-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'yt-chatgpt-fab';
  fab.title = 'Abrir ChatGPT';
  fab.setAttribute('aria-label', 'Abrir ChatGPT');
  fab.innerHTML = `
    <span class="yt-chatgpt-fab-icon">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="11" fill="#10a37f"/>
        <path d="M12 7.7a4.3 4.3 0 0 0-3.3 1.5 4.3 4.3 0 0 0-.5 4.4L7.5 14a5 5 0 0 1 .5-5.1c1-1.4 2.6-2.2 4-2.2H12zm2.1.8a4.3 4.3 0 0 0-4 .5 4.3 4.3 0 0 0-1.8 4L7.2 13.5A5 5 0 0 1 9.2 9c1.3-.9 3-1.1 4.9-.5v.5zm1.5 2.8a4.3 4.3 0 0 0-2.3-3.3 4.3 4.3 0 0 0-4.3.4l-.8-1.2A5 5 0 0 1 11.5 7c1.8 0 3.3.9 4.1 2.5v1.3zm.6 3.6a4.3 4.3 0 0 0 .5-4.4 4.3 4.3 0 0 0-3.3-1.5H12V7.7a5 5 0 0 1 4 2.2c1 1.4 1 3.5 0 5.1l-.6-1.3zm-.8 2.6a4.3 4.3 0 0 0 1.8-4 4.3 4.3 0 0 0-4-.5l.5-1.1a5 5 0 0 1 4.9.5c1.3.9 2 2.6 2 4.4h-5.2zm-2.8 1.5a4.3 4.3 0 0 0 4.3-.4 4.3 4.3 0 0 0 2.3-3.3l1.1.5c-1 1.8-2.6 2.8-4.5 2.8a5 5 0 0 1-3.2-.6v-1z" fill="white"/>
      </svg>
    </span>
  `;

  fab.addEventListener('click', () => {
    openChatGPTSidePanel();
  });

  document.body.appendChild(fab);
}

/**
 * Abre o ChatGPT no Chrome Side Panel nativo.
 * Usa chrome.runtime.connect() para garantir que o service worker
 * esteja acordado antes de enviar a mensagem (evita "Receiving end does not exist").
 */
function openChatGPTSidePanel() {
  _openSidePanel('openChatGPTSidePanel', 'https://chatgpt.com/');
}


// Estilos do FAB ChatGPT e painel iframe ChatGPT
try {
  const chatgptStyles = document.createElement('style');
  chatgptStyles.textContent = `
    /* ===== FAB CHATGPT ===== */
    #yt-chatgpt-fab {
      position: fixed;
      bottom: 94px;
      right: 28px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10a37f 0%, #1a7f64 100%);
      color: white;
      border: none;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 4px 16px rgba(16, 163, 127, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      font-size: 22px;
      line-height: 1;
    }

    #yt-chatgpt-fab:hover {
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 8px 24px rgba(16, 163, 127, 0.6);
    }

    #yt-chatgpt-fab:active {
      transform: scale(0.95);
    }

    .yt-chatgpt-fab-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ===== PAINEL IFRAME CHATGPT ===== */
    .yt-chatgpt-iframe-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 550px;
      height: 85vh;
      background: #1e1e1e;
      border: 1px solid #10a37f;
      border-radius: 16px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-shadow: 0 15px 50px rgba(0,0,0,0.8);
      overflow: hidden;
      animation: chatgptPanelSlideIn 0.3s ease-out;
    }

    @keyframes chatgptPanelSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }

    .yt-chatgpt-iframe-panel.minimized {
      height: 48px !important;
      width: 220px !important;
      overflow: hidden;
    }

    .yt-chatgpt-iframe-panel.minimized .yt-chatgpt-iframe,
    .yt-chatgpt-iframe-panel.minimized .yt-chatgpt-resize-handle {
      display: none;
    }

    .yt-chatgpt-panel-header {
      padding: 12px 16px;
      background: #0d5c47;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #10a37f;
      flex-shrink: 0;
    }

    .yt-chatgpt-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #e6fffa;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    .yt-chatgpt-panel-btn {
      background: none;
      border: none;
      color: #aaa;
      font-size: 18px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
      padding: 0;
    }

    .yt-chatgpt-panel-btn:hover {
      background: rgba(16, 163, 127, 0.2);
      color: #10a37f;
    }

    .yt-chatgpt-iframe {
      flex: 1;
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
    }

    .yt-chatgpt-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 10px;
      height: 100%;
      cursor: col-resize;
      z-index: 1001;
      background: transparent;
      transition: background 0.2s;
    }

    .yt-chatgpt-resize-handle:hover {
      background: rgba(16, 163, 127, 0.2);
    }

    .yt-chatgpt-iframe-panel.resizing {
      user-select: none;
    }

    .yt-chatgpt-iframe-panel.resizing .yt-chatgpt-iframe {
      pointer-events: none;
    }
  `;
  document.head.appendChild(chatgptStyles);
} catch(e) {}
function ensureFloatingButtons() {
  createSidePanelFAB();
}

// Inicializar os botões flutuantes (FABs)
if (document.body) {
  ensureFloatingButtons();
} else {
  document.addEventListener('DOMContentLoaded', ensureFloatingButtons);
}
if (isYouTubePage()) {
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(ensureFloatingButtons, 500);
  });
}

// ===== BOTÃO FLUTUANTE DEEPSEEK =====

/**
 * Cria e injeta o botão flutuante (FAB) do DeepSeek.
 * Fica posicionado acima do FAB do ChatGPT.
 */
function createDeepSeekFAB() {
  if (document.getElementById('yt-deepseek-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'yt-deepseek-fab';
  fab.title = 'Abrir DeepSeek AI';
  fab.setAttribute('aria-label', 'Abrir DeepSeek AI');
  fab.innerHTML = `
    <span class="yt-deepseek-fab-icon">
      <svg width="26" height="26" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22" fill="white" fill-opacity="0.15"/>
        <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="22" font-weight="bold" font-family="Arial,sans-serif" fill="white">DS</text>
      </svg>
    </span>
  `;

  fab.addEventListener('click', () => {
    openDeepSeekSidePanel();
  });

  document.body.appendChild(fab);
}

/**
 * Abre o DeepSeek no Chrome Side Panel nativo (aba DeepSeek).
 */
function openDeepSeekSidePanel() {
  _openSidePanel('openDeepSeekSidePanel', 'https://chat.deepseek.com/');
}

/**
 * Função interna: acorda o service worker via port e envia a mensagem para abrir o side panel.
 * Fallback: abre em nova aba se o side panel não estiver disponível.
 */
function _openSidePanel(action, fallbackUrl) {
  // 1. Tentar acordar o service worker com um port (mais confiável que sendMessage)
  let port;
  try {
    port = chrome.runtime.connect({ name: 'sidepanel-wakeup' });
  } catch (e) {
    // Se não conseguir conectar, abrir diretamente
    window.open(fallbackUrl, '_blank');
    return;
  }

  // 2. Após conectar (service worker acordado), enviar a mensagem real
  // O port é fechado logo depois para não manter conexão desnecessária
  port.disconnect();

  // 3. Agora enviar a mensagem — o worker já está ativo
  chrome.runtime.sendMessage({ action }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[YouTube Assistant] Side Panel falhou, abrindo em nova aba:', chrome.runtime.lastError.message);
      window.open(fallbackUrl, '_blank');
    } else if (response && !response.success) {
      console.warn('[YouTube Assistant] Side Panel não disponível:', response.error);
      window.open(fallbackUrl, '_blank');
    }
  });
}


/**
 * Abre o painel lateral com iframe do DeepSeek.
 * Mesma estratégia do Gemini: iframe embutido na página.
 * A regra no rules.json remove os headers X-Frame-Options e CSP do DeepSeek.
 */
function openDeepSeekIframePanel() {
  // Toggle: remove se já existir
  const existing = document.getElementById('yt-deepseek-iframe-panel');
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'yt-deepseek-iframe-panel';
  panel.className = 'yt-deepseek-iframe-panel';

  panel.innerHTML = `
    <div class="yt-deepseek-panel-header">
      <div class="yt-deepseek-panel-title">
        <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-size="24" font-weight="bold" font-family="Arial,sans-serif" fill="#4D6BFE">DS</text>
        </svg>
        <span>DeepSeek AI</span>
      </div>
      <div style="display:flex;gap:5px;">
        <button id="yt-deepseek-panel-minimize" class="yt-deepseek-panel-btn" title="Minimizar">_</button>
        <button id="yt-deepseek-panel-close" class="yt-deepseek-panel-btn" title="Fechar">×</button>
      </div>
    </div>
    <iframe
      id="yt-deepseek-iframe"
      src="https://chat.deepseek.com/"
      class="yt-deepseek-iframe"
      allow="clipboard-read; clipboard-write; microphone; storage-access"
      referrerpolicy="no-referrer"
    ></iframe>
    <div class="yt-deepseek-resize-handle" id="yt-deepseek-resize-handle"></div>
  `;

  const container = document.querySelector('#content.ytd-app') || document.querySelector('ytd-app') || document.body;
  container.appendChild(panel);

  // ── Fallback: escutar postMessage do deepseek-inject.js ──────────────────
  // Se o Cloudflare challenge for detectado dentro do iframe,
  // o deepseek-inject.js envia { source: 'deepseek-inject', type: 'deepseek-blocked' }
  const iframe = document.getElementById('yt-deepseek-iframe');

  // Criar overlay de fallback (oculto por padrão)
  const fallbackOverlay = document.createElement('div');
  fallbackOverlay.id = 'yt-deepseek-fallback';
  fallbackOverlay.style.cssText = `
    position: absolute;
    inset: 0;
    background: linear-gradient(160deg, #0a0f2e 0%, #0f1a44 100%);
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 24px;
    z-index: 10;
    font-family: 'Segoe UI', system-ui, sans-serif;
  `;
  fallbackOverlay.innerHTML = `
    <div style="font-size:52px;margin-bottom:16px;">🤖</div>
    <h3 style="color:#4D6BFE;margin:0 0 10px;font-size:20px;font-weight:700;">DeepSeek AI</h3>
    <p style="color:#8899cc;font-size:13px;margin:0 0 8px;line-height:1.6;max-width:280px;">
      O DeepSeek usa proteção Cloudflare que bloqueia incorporação via iframe.
    </p>
    <p style="color:#6677aa;font-size:12px;margin:0 0 24px;line-height:1.5;max-width:280px;">
      Clique abaixo para abrir em uma nova aba e usar normalmente.
    </p>
    <a id="yt-deepseek-open-link" href="https://chat.deepseek.com/" target="_blank" style="
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 28px;
      background: linear-gradient(135deg, #3450d4, #4D6BFE);
      color: white;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 4px 16px rgba(77,107,254,0.4);
      transition: opacity 0.2s, transform 0.2s;
    "
    onmouseover="this.style.opacity='0.85';this.style.transform='translateY(-1px)'"
    onmouseout="this.style.opacity='1';this.style.transform='translateY(0)'">
      Abrir DeepSeek →
    </a>
  `;

  // Inserir o overlay dentro do painel (acima do iframe)
  panel.insertBefore(fallbackOverlay, iframe);

  function showDeepSeekFallback() {
    if (fallbackOverlay.style.display === 'flex') return; // já visível
    iframe.style.display = 'none';
    fallbackOverlay.style.display = 'flex';
  }

  // Listener do postMessage do deepseek-inject.js
  function onDeepSeekMessage(e) {
    if (!e.data || e.data.source !== 'deepseek-inject') return;
    if (e.data.type === 'deepseek-blocked') {
      showDeepSeekFallback();
    }
    // se 'deepseek-ok' → manter iframe visível (não faz nada)
  }
  window.addEventListener('message', onDeepSeekMessage);

  // Limpar listener quando o painel for fechado
  const originalRemove = panel.remove.bind(panel);
  panel.remove = function () {
    window.removeEventListener('message', onDeepSeekMessage);
    originalRemove();
  };

  // Fechar
  document.getElementById('yt-deepseek-panel-close').onclick = (e) => {
    e.stopPropagation();
    panel.remove();
  };

  // Minimizar
  const minimizeBtn = document.getElementById('yt-deepseek-panel-minimize');
  minimizeBtn.onclick = (e) => {
    e.stopPropagation();
    panel.classList.toggle('minimized');
    minimizeBtn.textContent = panel.classList.contains('minimized') ? '▢' : '_';
  };

  // Redimensionamento (mesma lógica do Gemini/Claude)
  const handle = document.getElementById('yt-deepseek-resize-handle');
  let isResizing = false;
  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(window.getComputedStyle(panel).width, 10);
    panel.classList.add('resizing');
    document.addEventListener('mousemove', onDsMouseMove);
    document.addEventListener('mouseup', onDsMouseUp);
  });

  function onDsMouseMove(e) {
    if (!isResizing) return;
    const diff = startX - e.clientX;
    const newWidth = Math.min(Math.max(startWidth + diff, 320), window.innerWidth * 0.7);
    panel.style.width = newWidth + 'px';
  }

  function onDsMouseUp() {
    isResizing = false;
    panel.classList.remove('resizing');
    document.removeEventListener('mousemove', onDsMouseMove);
    document.removeEventListener('mouseup', onDsMouseUp);
  }
}

// Estilos do FAB DeepSeek e painel iframe DeepSeek
try {
  const deepseekStyles = document.createElement('style');
  deepseekStyles.textContent = `
    /* ===== FAB DEEPSEEK ===== */
    #yt-deepseek-fab {
      position: fixed;
      bottom: 160px;
      right: 28px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3450d4 0%, #4D6BFE 100%);
      color: white;
      border: none;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 4px 16px rgba(77, 107, 254, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      font-size: 22px;
      line-height: 1;
    }

    #yt-deepseek-fab:hover {
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 8px 24px rgba(77, 107, 254, 0.7);
    }

    #yt-deepseek-fab:active {
      transform: scale(0.95);
    }

    .yt-deepseek-fab-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ===== PAINEL IFRAME DEEPSEEK ===== */
    .yt-deepseek-iframe-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 550px;
      height: 85vh;
      background: #0d0d0d;
      border: 1px solid #2a3560;
      border-radius: 16px;
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      box-shadow: 0 15px 50px rgba(0,0,0,0.85), 0 0 0 1px rgba(77,107,254,0.15);
      overflow: hidden;
      animation: deepseekPanelSlideIn 0.3s ease-out;
    }

    @keyframes deepseekPanelSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }

    .yt-deepseek-iframe-panel.minimized {
      height: 48px !important;
      width: 230px !important;
      overflow: hidden;
    }

    .yt-deepseek-iframe-panel.minimized .yt-deepseek-iframe,
    .yt-deepseek-iframe-panel.minimized .yt-deepseek-resize-handle {
      display: none;
    }

    .yt-deepseek-panel-header {
      padding: 12px 16px;
      background: linear-gradient(135deg, #0f1535 0%, #1a2055 100%);
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #4D6BFE;
      flex-shrink: 0;
    }

    .yt-deepseek-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #a8b8ff;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    .yt-deepseek-panel-btn {
      background: none;
      border: none;
      color: #aaa;
      font-size: 18px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.15s, color 0.15s;
      padding: 0;
    }

    .yt-deepseek-panel-btn:hover {
      background: rgba(77, 107, 254, 0.2);
      color: #4D6BFE;
    }

    .yt-deepseek-iframe-wrapper {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .yt-deepseek-iframe {
      flex: 1;
      width: 100%;
      border: none;
      background: #fff;
    }

    .yt-deepseek-blocked-msg {
      position: absolute;
      inset: 0;
      background: #0d0d0d;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .yt-deepseek-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 10px;
      height: 100%;
      cursor: col-resize;
      z-index: 1001;
      background: transparent;
      transition: background 0.2s;
    }

    .yt-deepseek-resize-handle:hover {
      background: rgba(77, 107, 254, 0.2);
    }

    .yt-deepseek-iframe-panel.resizing {
      user-select: none;
    }

    .yt-deepseek-iframe-panel.resizing .yt-deepseek-iframe {
      pointer-events: none;
    }
  `;
  document.head.appendChild(deepseekStyles);
} catch(e) {}


// Configurar observador
let observerTimeout;
const observer = new MutationObserver(() => {
  clearTimeout(observerTimeout);
  observerTimeout = setTimeout(() => {
    addSummaryIcons();
    ensureFloatingButtons();
  }, 1000);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Verificação de fallback periódica para garantir a visibilidade dos FABs
setInterval(ensureFloatingButtons, 2000);

// Verificações adicionais em intervalos diferentes
setTimeout(() => {
  addSummaryIcons();
}, 2000);

setTimeout(() => {
  addSummaryIcons();
}, 5000);

// Executar imediatamente para a página atual
addSummaryIcons();

// Funcionalidade removida - agora usando menu lateral integrado com Gemini API





// =================================================================================================
// NOVA IMPLEMENTAÇÃO: LEGENDAS INTELIGENTES (SMART CAPTIONS)
// =================================================================================================

// Utilitários de Tempo
function formatTimestamp(seconds) {
  const date = new Date(0);
  date.setSeconds(seconds);
  const iso = date.toISOString();
  if (seconds < 3600) {
    return iso.substr(14, 5); // mm:ss
  }
  return iso.substr(11, 8); // hh:mm:ss
}

function parseTimestampToSeconds(timestamp) {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// ----------------------------------------------------------------
// 1. Extração de Transcrição COM TIMESTAMPS
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// 1. Extração de Transcrição (Nova implementação baseada em youtube-transcript)
// ----------------------------------------------------------------

// Classe YoutubeTranscript removida pois agora é importada externamente via manifest.json

// Versão que busca no IDIOMA ORIGINAL para manter timestamps corretos.
// A tradução fica por conta do Gemini.
async function getVideoTranscriptionWithTimestamps(videoId) {
  try {
    console.log(`[SmartCaptions] Buscando transcrição para vídeo ${videoId}...`);
    
    // NÃO forçar lang: 'pt' — buscar no idioma original para manter timestamps corretos.
    // Quando forçamos 'pt' em vídeos de outros idiomas, o YouTube retorna auto-translate
    // com timestamps reagrupados/desalinhados.
    let segments = null;
    let detectedLang = 'unknown';
    
    try {
      // Primeiro: tentar sem forçar idioma (pega a faixa nativa)
      const result = await YoutubeTranscript.fetchTranscript(videoId, {});
      segments = result;
      console.log(`[SmartCaptions] Faixa nativa obtida: ${segments?.length || 0} segmentos`);
    } catch (err) {
      console.warn(`[SmartCaptions] Falha ao buscar faixa nativa: ${err.message}`);
    }
    
    if (segments && segments.length > 0) {
      detectedLang = segments[0].lang || 'unknown';
      console.log(`[SmartCaptions] Idioma detectado: ${detectedLang}`);
      console.log(`[SmartCaptions] ${segments.length} segmentos obtidos com timestamps originais.`);
      
      return segments.map(seg => ({
        text: seg.text,
        start: seg.offset,
        duration: seg.duration,
        offset: seg.offset * 1000,
        lang: detectedLang
      }));
    }
    
    console.warn('[SmartCaptions] Nenhum segmento encontrado.');
    return null;
    
  } catch (error) {
    console.error("[SmartCaptions] Erro ao obter transcrição:", error);
    return null;
  }
}

// Funções antigas removidas ou comentadas para limpeza
// downloadTranscriptSegments, extractSegmentsFromApiResponse, downloadTranscriptXMLFallbackWithTimestamps, etc.


// ----------------------------------------------------------------
// 2. Sistema de Legendas Inteligentes (Smart Captions)
// ----------------------------------------------------------------

class SmartSubtitleSystem {
  constructor() {
    this.active = false;
    this.currentVideoId = null;
    this.transcriptionSegments = null;
    this.rewrittenSubtitles = null;
    this.overlayElement = null;
    this.subtitleElement = null;
    this.checkInterval = null;
    this.toggleButton = null;
    
    // Cache de legendas reescritas por videoId
    this.subtitlesCache = {};
    
    this.init();
  }

  init() {
    // Verificar mudança de vídeo periodicamente
    setInterval(() => this.checkVideoChange(), 2000);
    
    // Escutar eventos de navegação
    document.addEventListener('yt-navigate-finish', () => this.checkVideoChange());

    // Escutar atalho Ctrl + D para acionar o Tutor Proativo manualmente
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) {
        if (this.proactiveTutorActive) {
          e.preventDefault();
          console.log('[ProactiveTutor] Ctrl+D detectado. Enviando atualização manual...');
          this._sendProactiveTutorUpdate();
          showToast('🧠 Enviando atualização manual para o AI Studio...');
        }
      }
    });
  }

  async checkVideoChange() {
    if (!window.location.href.includes('/watch?v=')) {
      if (this.currentVideoId !== null) {
        this.currentVideoId = null;
        this.reset();
      }
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const newVideoId = urlParams.get('v');

    if (newVideoId && newVideoId !== this.currentVideoId) {
      this.currentVideoId = newVideoId;
      this.reset(); // Reseta estado e botão ao mudar de vídeo
      this.injectToggleButton(); // Adiciona botão no novo vídeo
    } else if (newVideoId && !this.toggleButton) {
       // Caso o botão tenha sumido (SPA re-render), injeta de novo
       this.injectToggleButton();
    }
  }
  
  injectToggleButton() {
    // Tentar encontrar a barra de controles da direita
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;
    
    if (document.getElementById('smart-captions-btn')) return;

    // Estilo para feedback visual
    if (!document.getElementById('smart-captions-btn-style')) {
      const style = document.createElement('style');
      style.id = 'smart-captions-btn-style';
      style.textContent = `
        #smart-captions-btn.active path { fill: #4285f4 !important; fill-opacity: 1 !important; }
        #smart-captions-btn.active { opacity: 1 !important; }
        #copy-transcript-btn { position: relative; }
        #copy-transcript-btn.copied path, #copy-transcript-btn.copied rect, #copy-transcript-btn.copied polyline { stroke: #34a853 !important; }
        #copy-transcript-btn.copied { opacity: 1 !important; }
        #copy-transcript-btn.loading { opacity: 0.6 !important; animation: sc-pulse 0.8s ease-in-out infinite; }
        #copy-transcript-ts-btn.loading { opacity: 0.6 !important; animation: sc-pulse 0.8s ease-in-out infinite; }
        #copy-transcript-ts-btn.copied path, #copy-transcript-ts-btn.copied rect { stroke: #34a853 !important; fill: #34a853 !important; }
        #copy-transcript-ts-btn.copied { opacity: 1 !important; }
        #explain-moment-btn.loading { opacity: 0.6 !important; animation: sc-pulse 0.8s ease-in-out infinite; }
        #explain-moment-btn.copied { opacity: 1 !important; }
        #explain-moment-btn.copied path { fill: #fbbc04 !important; }
        #proactive-tutor-btn.loading { opacity: 0.6 !important; animation: sc-pulse 0.8s ease-in-out infinite; }
        #proactive-tutor-btn.active { opacity: 1 !important; }
        #proactive-tutor-btn.active path, #proactive-tutor-btn.active circle { fill: #34a853 !important; fill-opacity: 1 !important; stroke: #34a853 !important; }
        @keyframes sc-pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }

        /* ====== Tutor Popup ====== */
        #tutor-popup-overlay {
          position: fixed;
          inset: 0;
          z-index: 99998;
          background: transparent;
        }
        #tutor-popup {
          position: fixed;
          z-index: 99999;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%);
          border: 1px solid rgba(52,168,83,0.45);
          border-radius: 14px;
          padding: 20px;
          width: 280px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(52,168,83,0.15);
          font-family: 'Google Sans', Roboto, Arial, sans-serif;
          color: #e8eaf6;
          animation: tutor-popup-in 0.2s ease;
        }
        @keyframes tutor-popup-in {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        #tutor-popup .tp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        #tutor-popup .tp-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 14px;
          font-weight: 600;
          color: #34a853;
        }
        #tutor-popup .tp-close {
          background: none;
          border: none;
          color: #9aa0a6;
          font-size: 20px;
          cursor: pointer;
          line-height: 1;
          padding: 0 2px;
          transition: color 0.15s;
        }
        #tutor-popup .tp-close:hover { color: #e8eaf6; }
        #tutor-popup .tp-countdown-label {
          font-size: 11px;
          color: #9aa0a6;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 6px;
        }
        #tutor-popup .tp-countdown {
          font-size: 36px;
          font-weight: 700;
          color: #34a853;
          text-align: center;
          letter-spacing: 2px;
          margin-bottom: 4px;
          font-variant-numeric: tabular-nums;
        }
        #tutor-popup .tp-countdown-bar-bg {
          background: rgba(255,255,255,0.08);
          border-radius: 4px;
          height: 4px;
          margin-bottom: 18px;
          overflow: hidden;
        }
        #tutor-popup .tp-countdown-bar {
          height: 4px;
          border-radius: 4px;
          background: linear-gradient(90deg, #34a853, #4caf50);
          transition: width 0.9s linear;
        }
        #tutor-popup .tp-divider {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.08);
          margin: 0 0 14px;
        }
        #tutor-popup .tp-interval-label {
          font-size: 11px;
          color: #9aa0a6;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 8px;
        }
        #tutor-popup .tp-interval-row {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 14px;
        }
        #tutor-popup .tp-interval-input {
          flex: 1;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          color: #e8eaf6;
          font-size: 15px;
          padding: 7px 10px;
          outline: none;
          transition: border-color 0.2s;
        }
        #tutor-popup .tp-interval-input:focus {
          border-color: #34a853;
        }
        #tutor-popup .tp-interval-unit {
          font-size: 12px;
          color: #9aa0a6;
          white-space: nowrap;
        }
        #tutor-popup .tp-save-btn {
          width: 100%;
          padding: 9px;
          border: none;
          border-radius: 8px;
          background: linear-gradient(90deg, #34a853, #2e7d32);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
          margin-bottom: 8px;
        }
        #tutor-popup .tp-save-btn:hover { opacity: 0.88; transform: scale(1.02); }
        #tutor-popup .tp-stop-btn {
          width: 100%;
          padding: 8px;
          border: 1px solid rgba(234,67,53,0.4);
          border-radius: 8px;
          background: rgba(234,67,53,0.1);
          color: #ef9a9a;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        #tutor-popup .tp-stop-btn:hover { background: rgba(234,67,53,0.22); }
        #tutor-popup .tp-saved-msg {
          text-align: center;
          font-size: 12px;
          color: #34a853;
          height: 16px;
          margin-top: 6px;
          transition: opacity 0.3s;
        }
        #tutor-popup .tp-prompt-label {
          font-size: 11px;
          color: #9aa0a6;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 6px;
          margin-top: 14px;
        }
        #tutor-popup .tp-prompt-hint {
          font-size: 10px;
          color: rgba(154,160,166,0.7);
          margin-bottom: 6px;
          line-height: 1.4;
        }
        #tutor-popup .tp-prompt-textarea {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.13);
          border-radius: 8px;
          color: #e8eaf6;
          font-size: 12px;
          font-family: 'Google Sans', Roboto, Arial, sans-serif;
          line-height: 1.5;
          padding: 8px 10px;
          resize: vertical;
          outline: none;
          min-height: 110px;
          transition: border-color 0.2s;
        }
        #tutor-popup .tp-prompt-textarea:focus { border-color: #34a853; }
        #tutor-popup .tp-prompt-save-btn {
          width: 100%;
          padding: 8px;
          border: 1px solid rgba(52,168,83,0.4);
          border-radius: 8px;
          background: rgba(52,168,83,0.1);
          color: #81c784;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
          margin-top: 6px;
        }
        #tutor-popup .tp-prompt-save-btn:hover { background: rgba(52,168,83,0.22); }
        #tutor-popup .tp-prompt-reset-btn {
          width: 100%;
          padding: 6px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: rgba(154,160,166,0.6);
          font-size: 11px;
          cursor: pointer;
          margin-top: 4px;
          transition: color 0.2s;
        }
        #tutor-popup .tp-prompt-reset-btn:hover { color: #9aa0a6; }
        #tutor-popup .tp-header { cursor: grab; user-select: none; }
        #tutor-popup .tp-header:active { cursor: grabbing; }
        #tutor-popup .tp-send-now-btn {
          width: 100%;
          padding: 9px;
          border: none;
          border-radius: 8px;
          background: linear-gradient(90deg, #1a73e8, #1557b0);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        #tutor-popup .tp-send-now-btn:hover { opacity: 0.88; transform: scale(1.02); }
        #tutor-popup .tp-send-now-btn:active { transform: scale(0.98); }
      `;
      document.head.appendChild(style);
    }

    // --- Botão 1: Legendas Inteligentes (AI) ---
    const btn = document.createElement('button');
    btn.id = 'smart-captions-btn';
    btn.className = 'ytp-button';
    btn.setAttribute('title', 'Legendas Inteligentes (AI)');
    btn.setAttribute('aria-label', 'Legendas Inteligentes (AI)');
    btn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
        <path d="M18,10 c-4.4,0-8,3.6-8,8 c0,4.4,3.6,8,8,8 c4.4,0,8-3.6,8-8 C26,13.6,22.4,10,18,10 z M18,24 c-3.3,0-6-2.7-6-6 c0-3.3,2.7-6,6-6 s6,2.7,6,6 C24,21.3,21.3,24,18,24 z" fill="white" fill-opacity="0.8"></path>
        <path d="M18,13 L18,16 L21,16" fill="none" stroke="white" stroke-width="2"></path>
      </svg>
    `;
    btn.onclick = () => this.toggle();

    // --- Botão 2: Copiar Transcrição Pura ---
    const copyBtn = document.createElement('button');
    copyBtn.id = 'copy-transcript-btn';
    copyBtn.className = 'ytp-button';
    copyBtn.setAttribute('title', 'Copiar Transcrição (texto puro)');
    copyBtn.setAttribute('aria-label', 'Copiar Transcrição');
    copyBtn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="13" y="11" width="13" height="16" rx="2" stroke="white" stroke-width="2" stroke-opacity="0.85"/>
        <path d="M10 25V10a2 2 0 0 1 2-2h10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-opacity="0.85"/>
        <line x1="16" y1="17" x2="22" y2="17" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.85"/>
        <line x1="16" y1="20" x2="22" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.85"/>
        <line x1="16" y1="23" x2="20" y2="23" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.85"/>
      </svg>
    `;
    copyBtn.onclick = () => this.copyTranscriptOnly();

    // --- Botão 3: Transcrição com Timestamps + Menu de Prompts ---
    const copyTsBtn = document.createElement('button');
    copyTsBtn.id = 'copy-transcript-ts-btn';
    copyTsBtn.className = 'ytp-button';
    copyTsBtn.setAttribute('title', 'Transcrição com timestamps + Prompt');
    copyTsBtn.setAttribute('aria-label', 'Transcrição com timestamps');
    copyTsBtn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="13" y="11" width="13" height="16" rx="2" stroke="white" stroke-width="2" stroke-opacity="0.85"/>
        <path d="M10 25V10a2 2 0 0 1 2-2h10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-opacity="0.85"/>
        <circle cx="22" cy="14" r="3" fill="white" fill-opacity="0.85"/>
        <line x1="22" y1="13" x2="22" y2="14.5" stroke="#1a1a1a" stroke-width="1" stroke-linecap="round"/>
        <line x1="22" y1="14.5" x2="23" y2="14.5" stroke="#1a1a1a" stroke-width="1" stroke-linecap="round"/>
        <line x1="16" y1="20" x2="22" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.85"/>
        <line x1="16" y1="23" x2="20" y2="23" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.85"/>
      </svg>
    `;
    copyTsBtn.onclick = () => this.copyTranscriptWithTimestamps();

    // --- Botão 4: Explicar Momento Atual ---
    const explainBtn = document.createElement('button');
    explainBtn.id = 'explain-moment-btn';
    explainBtn.className = 'ytp-button';
    explainBtn.setAttribute('title', 'Explicar momento atual do vídeo');
    explainBtn.setAttribute('aria-label', 'Explicar momento atual');
    explainBtn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="18" r="8" fill="none" stroke="white" stroke-width="2" stroke-opacity="0.85"/>
        <line x1="18" y1="10" x2="18" y2="18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-opacity="0.85"/>
        <line x1="18" y1="18" x2="23" y2="18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-opacity="0.85"/>
        <circle cx="18" cy="18" r="1.5" fill="white" fill-opacity="0.85"/>
      </svg>
    `;
    explainBtn.onclick = () => this.explainCurrentMoment();

    // --- Botão 5: Tutor Proativo ---
    const tutorBtn = document.createElement('button');
    tutorBtn.id = 'proactive-tutor-btn';
    tutorBtn.className = 'ytp-button';
    tutorBtn.setAttribute('title', 'Tutor Proativo');
    tutorBtn.setAttribute('aria-label', 'Tutor Proativo');
    tutorBtn.innerHTML = `
      <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 10 C18 10 14 10 14 14 C14 16 16 17 16 19 L20 19 C20 17 22 16 22 14 C22 10 18 10 18 10 Z" fill="none" stroke="white" stroke-width="1.8" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="16" y1="21" x2="20" y2="21" stroke="white" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
        <line x1="16.5" y1="23" x2="19.5" y2="23" stroke="white" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
        <line x1="18" y1="7" x2="18" y2="9" stroke="white" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
        <line x1="12" y1="10" x2="13.5" y2="11.5" stroke="white" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
        <line x1="24" y1="10" x2="22.5" y2="11.5" stroke="white" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
        <line x1="10" y1="14" x2="12" y2="14" stroke="white" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
        <line x1="24" y1="14" x2="26" y2="14" stroke="white" stroke-width="1.5" stroke-opacity="0.85" stroke-linecap="round"/>
        <circle cx="28" cy="10" r="3" fill="none" stroke="white" stroke-width="1.2" stroke-opacity="0.7"/>
        <line x1="28" y1="9" x2="28" y2="10.5" stroke="white" stroke-width="1" stroke-linecap="round" stroke-opacity="0.7"/>
        <line x1="28" y1="10.5" x2="29.2" y2="10.5" stroke="white" stroke-width="1" stroke-linecap="round" stroke-opacity="0.7"/>
      </svg>
    `;
    tutorBtn.onclick = () => {
      if (this.proactiveTutorActive) {
        this.openTutorPopup();
      } else {
        this.toggleProactiveTutor();
      }
    };
    
    // Inserir os cinco botões antes do botão de configurações (gear)
    rightControls.prepend(tutorBtn);
    rightControls.prepend(explainBtn);
    rightControls.prepend(copyTsBtn);
    rightControls.prepend(copyBtn);
    rightControls.prepend(btn);
    this.toggleButton = btn;
    this.copyTranscriptButton = copyBtn;
    this.copyTranscriptTsButton = copyTsBtn;
    this.explainMomentButton = explainBtn;
    this.proactiveTutorButton = tutorBtn;
  }

  toggle() {
    if (this.active) {
      this.stop();
    } else {
      this.start(this.currentVideoId);
    }
  }

  async start(videoId) {
    if (!videoId) return;
    this.active = true;
    if (this.toggleButton) this.toggleButton.classList.add('active');
    
    // 1. Criar UI de Loading
    this.createOverlay();
    
    // 2. Verificar se já existe cache para este vídeo
    if (this.subtitlesCache[videoId]) {
      console.log("DEBUG: Usando legendas do cache para vídeo:", videoId);
      this.rewrittenSubtitles = this.subtitlesCache[videoId];
      this.startSyncLoop();
      this.updateOverlayStatus("", false);
      return;
    }
    
    // 3. Se não tem cache, buscar e processar
    this.updateOverlayStatus("Identificando vídeo...", true);

    // 4. Obter Transcrição com Timestamp
    try {
      const segments = await getVideoTranscriptionWithTimestamps(videoId);
      
      if (!segments || segments.length === 0) {
        this.updateOverlayStatus("Legendas não disponíveis para este vídeo.", false, 3000);
        this.stop(); // Desliga se não tiver legenda
        return;
      }

      this.transcriptionSegments = segments;
      this.updateOverlayStatus("Gerando legendas inteligentes...", true);

      // 5. Processar com Gemini (vai salvar no cache automaticamente)
      await this.processWithGemini(segments, videoId);

    } catch (error) {
      this.updateOverlayStatus("Erro ao gerar legendas.", false, 3000);
      this.stop();
    }
  }

  reset() {
    this.stop();
    this.stopProactiveTutor();
    // Remove botões antigos se existirem para recriar limpo
    const oldBtn = document.getElementById('smart-captions-btn');
    if (oldBtn) oldBtn.remove();
    const oldCopyBtn = document.getElementById('copy-transcript-btn');
    if (oldCopyBtn) oldCopyBtn.remove();
    const oldCopyTsBtn = document.getElementById('copy-transcript-ts-btn');
    if (oldCopyTsBtn) oldCopyTsBtn.remove();
    const oldExplainBtn = document.getElementById('explain-moment-btn');
    if (oldExplainBtn) oldExplainBtn.remove();
    const oldTutorBtn = document.getElementById('proactive-tutor-btn');
    if (oldTutorBtn) oldTutorBtn.remove();
    this.toggleButton = null;
    this.copyTranscriptButton = null;
    this.copyTranscriptTsButton = null;
    this.explainMomentButton = null;
    this.proactiveTutorButton = null;
    // Nota: Cache é mantido por videoId, então não limpa aqui
    // Isso permite que se o usuário voltar ao vídeo, use o cache
  }

  stop() {
    this.active = false;
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.removeOverlay();
    this.removeGeminiPanel();
    this.closeCaptionsPopup();
    this.transcriptionSegments = null;
    this.rewrittenSubtitles = null;
    if (this.toggleButton) this.toggleButton.classList.remove('active');
    // Nota: NÃO para o tutor proativo no stop() pois ele funciona independentemente
  }

  removeGeminiPanel() {
    const el = document.getElementById('smart-captions-gemini-panel');
    if (el) el.remove();
  }

  // Monta o prompt e abre o popup abaixo do ícone de legendas
  async processWithGemini(segments, videoId) {
    // Criar um mapa dos timestamps originais em segundos para uso posterior (ARRAY)
    // IMPORTANTE: guardar também a duration para saber quando cada segmento termina
    this.originalTimestampsMap = segments.map(seg => ({
      seconds: seg.start,
      duration: seg.duration || 3, // duração real do segmento (fallback 3s)
      originalText: seg.text
    }));

    // Formatar transcrição com índices para garantir correspondência exata
    let formattedTranscription = "";
    segments.forEach((seg, index) => {
      formattedTranscription += `[${index}] ${seg.text}\n`;
    });

    const prompt = `
Você é um especialista em legendagem.
Sua tarefa é reescrever os textos abaixo para ficarem fluídos e naturais em **Português do Brasil**.
Os textos podem estar em QUALQUER IDIOMA — traduza e adapte para pt-BR.

**REGRAS CRÍTICAS:**
1. **NÃO ALTERE OS ÍNDICES** - Cada linha começa com [número]. Você DEVE manter EXATAMENTE os mesmos índices na resposta.
2. **NÃO AGRUPE NEM DIVIDA** - Mantenha a mesma quantidade de linhas. Se recebeu ${segments.length} linhas, retorne ${segments.length} linhas.
3. **TRADUÇÃO + REESCRITA** - Traduza para português do Brasil se necessário, corrija erros de fala, repetições e deixe o texto natural. Mantenha o sentido original.
4. **FORMATO:** Responda APENAS com um JSON onde a chave é o índice (número) e o valor é o texto traduzido/reescrito:

\`\`\`json
{
  "0": "Texto traduzido/reescrito da linha 0...",
  "1": "Texto traduzido/reescrito da linha 1...",
  "2": "Texto traduzido/reescrito da linha 2..."
}
\`\`\`

**Transcrição Original (${segments.length} segmentos):**
${formattedTranscription}
`;

    // Copiar para o clipboard automaticamente
    await this.copyToClipboard(prompt);

    // Salvar no storage
    const transcriptionData = {
      text: prompt,
      timestamp: Date.now(),
      videoId: videoId,
      preset: 'smart-captions'
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ 'youtubeTranscription': transcriptionData }, () => {
        console.log('[SmartCaptions] Prompt salvo no storage.');
      });
    }

    // Abrir o popup abaixo do botão de legendas
    this.openCaptionsPopup(videoId);
    this.updateOverlayStatus("✅ Prompt copiado! Cole o resultado no popup.", false, 5000);
  }

  // Método auxiliar para copiar texto para o clipboard
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      console.log("[SmartCaptions] Prompt copiado para o clipboard com sucesso!");
    } catch (err) {
      console.error("[SmartCaptions] Erro ao copiar para o clipboard:", err);
      // Fallback usando um textarea invisível se o navigator.clipboard falhar
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (copyErr) {
        console.error("[SmartCaptions] Fallback de cópia também falhou.");
      }
      document.body.removeChild(textArea);
    }
  }

  // Copiar apenas a transcrição pura (sem prompt) para o clipboard
  async copyTranscriptOnly() {
    const videoId = this.currentVideoId;
    if (!videoId) {
      showToast('⚠️ Nenhum vídeo detectado.');
      return;
    }

    const copyBtn = document.getElementById('copy-transcript-btn');

    // Feedback visual: loading
    if (copyBtn) copyBtn.classList.add('loading');
    this.createOverlay();
    this.updateOverlayStatus('Buscando transcrição...', true);

    try {
      const segments = await getVideoTranscriptionWithTimestamps(videoId);

      if (!segments || segments.length === 0) {
        this.updateOverlayStatus('Transcrição não disponível para este vídeo.', false, 3000);
        if (copyBtn) copyBtn.classList.remove('loading');
        return;
      }

      // Montar texto puro (sem prompt, sem índices)
      const plainText = segments.map(seg => seg.text).join(' ');

      await this.copyToClipboard(plainText);

      // Feedback visual: sucesso
      if (copyBtn) {
        copyBtn.classList.remove('loading');
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 2000);
      }
      this.updateOverlayStatus('✅ Transcrição copiada!', false, 3000);
      showToast('📋 Transcrição copiada para o clipboard!');

    } catch (error) {
      console.error('[SmartCaptions] Erro ao copiar transcrição:', error);
      this.updateOverlayStatus('Erro ao buscar transcrição.', false, 3000);
      if (copyBtn) copyBtn.classList.remove('loading');
      showToast('❌ Erro ao copiar transcrição.');
    }
  }

  // Botão 3: Pega transcrição com timestamps, abre menu de presets e salva prompt+transcrição no clipboard
  async copyTranscriptWithTimestamps() {
    const videoId = this.currentVideoId;
    if (!videoId) {
      showToast('⚠️ Nenhum vídeo detectado.');
      return;
    }

    const tsBtn = document.getElementById('copy-transcript-ts-btn');
    if (tsBtn) tsBtn.classList.add('loading');
    this.createOverlay();
    this.updateOverlayStatus('Buscando transcrição com timestamps...', true);

    try {
      const segments = await getVideoTranscriptionWithTimestamps(videoId);

      if (!segments || segments.length === 0) {
        this.updateOverlayStatus('Transcrição não disponível para este vídeo.', false, 3000);
        if (tsBtn) tsBtn.classList.remove('loading');
        return;
      }

      // Formatar transcrição com timestamps no formato [MM:SS] texto
      const transcriptWithTs = segments.map(seg => {
        const totalSec = Math.floor(seg.start);
        const min = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const sec = (totalSec % 60).toString().padStart(2, '0');
        return `[${min}:${sec}] ${seg.text}`;
      }).join('\n');

      if (tsBtn) {
        tsBtn.classList.remove('loading');
        tsBtn.classList.add('copied');
        setTimeout(() => tsBtn.classList.remove('copied'), 2000);
      }
      this.updateOverlayStatus('✅ Transcrição obtida! Escolha o tipo de resumo.', false, 4000);

      // Abrir menu de presets passando a transcrição com timestamps
      showPresetSelectorWithTranscript(transcriptWithTs, videoId);

    } catch (error) {
      console.error('[SmartCaptions] Erro ao buscar transcrição com timestamps:', error);
      this.updateOverlayStatus('Erro ao buscar transcrição.', false, 3000);
      if (tsBtn) tsBtn.classList.remove('loading');
      showToast('❌ Erro ao buscar transcrição.');
    }
  }

  // Botão 4: Pega minutagem atual + transcrição e gera prompt de contexto do momento
  async explainCurrentMoment() {
    const videoId = this.currentVideoId;
    if (!videoId) {
      showToast('⚠️ Nenhum vídeo detectado.');
      return;
    }

    const video = document.querySelector('video');
    if (!video) {
      showToast('⚠️ Player de vídeo não encontrado.');
      return;
    }

    const currentTimeSec = Math.floor(video.currentTime);
    const min = Math.floor(currentTimeSec / 60).toString().padStart(2, '0');
    const sec = (currentTimeSec % 60).toString().padStart(2, '0');
    const currentTimeFormatted = `${min}:${sec}`;

    const explainBtn = document.getElementById('explain-moment-btn');
    if (explainBtn) explainBtn.classList.add('loading');
    this.createOverlay();
    this.updateOverlayStatus(`Buscando transcrição para o momento ${currentTimeFormatted}...`, true);

    try {
      const segments = await getVideoTranscriptionWithTimestamps(videoId);

      if (!segments || segments.length === 0) {
        this.updateOverlayStatus('Transcrição não disponível para este vídeo.', false, 3000);
        if (explainBtn) explainBtn.classList.remove('loading');
        return;
      }

      // Formatar transcrição completa com timestamps
      const fullTranscript = segments.map(seg => {
        const totalSec = Math.floor(seg.start);
        const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const s = (totalSec % 60).toString().padStart(2, '0');
        return `[${m}:${s}] ${seg.text}`;
      }).join('\n');

      // Montar o prompt de contexto do momento atual
      const prompt = `O momento do vídeo é [${currentTimeFormatted}] e quero entender o que está sendo explicado nesse exato momento. Me dê o contexto do assunto desse momento em relação à transcrição toda.

Transcrição completa do vídeo:
${fullTranscript}`;

      // Salvar no chrome.storage e copiar para clipboard
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          'youtubeTranscription': {
            text: prompt,
            timestamp: Date.now(),
            videoId: videoId,
            preset: 'explain-moment',
            currentTime: currentTimeFormatted
          }
        }, () => console.log('[SmartCaptions] Prompt de momento salvo no storage.'));
      }

      await this.copyToClipboard(prompt);

      if (explainBtn) {
        explainBtn.classList.remove('loading');
        explainBtn.classList.add('copied');
        setTimeout(() => explainBtn.classList.remove('copied'), 2000);
      }
      this.updateOverlayStatus(`✅ Prompt do momento [${currentTimeFormatted}] copiado!`, false, 4000);
      showToast(`⏱️ Prompt do momento [${currentTimeFormatted}] copiado! Cole no Gemini, ChatGPT ou Claude.`);

    } catch (error) {
      console.error('[SmartCaptions] Erro ao explicar momento:', error);
      this.updateOverlayStatus('Erro ao buscar transcrição.', false, 3000);
      if (explainBtn) explainBtn.classList.remove('loading');
      showToast('❌ Erro ao buscar transcrição.');
    }
  }

  // ==================== TUTOR PROATIVO ====================

  // Botão 5: Tutor Proativo — envia explicações automáticas a cada 2 minutos via AI Studio Live
  async toggleProactiveTutor() {
    // Se já está ativo, parar
    if (this.proactiveTutorActive) {
      this.stopProactiveTutor();
      showToast('⏹️ Tutor Proativo desativado.');
      return;
    }

    const videoId = this.currentVideoId;
    if (!videoId) {
      showToast('⚠️ Nenhum vídeo detectado.');
      return;
    }

    const video = document.querySelector('video');
    if (!video) {
      showToast('⚠️ Player de vídeo não encontrado.');
      return;
    }

    const tutorBtn = document.getElementById('proactive-tutor-btn');
    if (tutorBtn) tutorBtn.classList.add('loading');
    this.createOverlay();
    this.updateOverlayStatus('Preparando Tutor Proativo...', true);

    try {
      // 1. Buscar transcrição completa com timestamps
      const segments = await getVideoTranscriptionWithTimestamps(videoId);

      if (!segments || segments.length === 0) {
        this.updateOverlayStatus('Transcrição não disponível para este vídeo.', false, 3000);
        if (tutorBtn) tutorBtn.classList.remove('loading');
        return;
      }

      // 2. Formatar transcrição completa com timestamps
      const fullTranscript = segments.map(seg => {
        const totalSec = Math.floor(seg.start);
        const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const s = (totalSec % 60).toString().padStart(2, '0');
        return `[${m}:${s}] ${seg.text}`;
      }).join('\n');

      // 3. System instruction otimizada para tutor proativo
      const videoTitle = getCurrentVideoTitle();
      const systemPrompt = `Você é um tutor proativo que assiste o vídeo junto com o usuário e explica o que está acontecendo.
Responda SEMPRE em Português do Brasil.

REGRAS CRÍTICAS:
- SEMPRE comece com UMA ÚNICA FRASE resumindo o que está acontecendo no momento (ex: "O autor está explicando como funciona a recursividade.")
- Depois dessa frase de resumo, aprofunde a explicação de forma objetiva e detalhista
- Seja DIRETO — sem introduções, sem preâmbulos, sem se apresentar
- Explique como se estivesse explicando para um amigo
- Foque no que o autor está fazendo ou explicando naquele momento
- Contextualize com o que já foi dito anteriormente no vídeo
- Se for código, terminal ou tela, descreva o que está acontecendo tecnicamente
- Não repita explicações que já deu antes
- NUNCA faça perguntas no final da explicação. NÃO pergunte se quer continuar, aprofundar, ou se tem dúvidas. Apenas explique e encerre.

=== VÍDEO: ${videoTitle} ===

=== TRANSCRIÇÃO COMPLETA ===
${fullTranscript}
=== FIM DA TRANSCRIÇÃO ===

O usuário vai te enviar periodicamente o trecho do momento atual do vídeo. Comece SEMPRE com uma frase-resumo do momento, depois explique detalhadamente. Nunca faça perguntas.`;

      // 4. Salvar no chrome.storage com mode 'aistudio' para conectar ao AI Studio Live
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          'youtubeTranscription': {
            text: systemPrompt,
            timestamp: Date.now(),
            videoId: videoId,
            preset: 'proactive-tutor',
            mode: 'aistudio'
          }
        }, () => {
          console.log('[ProactiveTutor] Contexto salvo para AI Studio Live');
        });
      }

      // 5. Abrir Side Panel na aba AI Studio
      _openSidePanel('openAIStudioSidePanel', 'https://aistudio.google.com/live');

      // 6. Guardar segmentos para o loop
      this._proactiveTutorSegments = segments;
      this.proactiveTutorActive = true;
      this._proactiveTutorIntervalMs = this._proactiveTutorIntervalMs || 20000; // padrão 20s
      this._proactiveTutorNextSendAt = null;

      // 7. Feedback visual
      if (tutorBtn) {
        tutorBtn.classList.remove('loading');
        tutorBtn.classList.add('active');
      }
      const secLabel = Math.round(this._proactiveTutorIntervalMs / 1000);
      this.updateOverlayStatus(`🧠 Tutor Proativo ativo! Explicações a cada ${secLabel}s.`, false, 5000);
      showToast(`🧠 Tutor Proativo ativado! Próximo envio a cada ${secLabel}s.`);

      // 8. Enviar primeira explicação após 10 segundos (tempo para AI Studio carregar e conectar)
      this._proactiveTutorTimeout = setTimeout(() => {
        this._sendProactiveTutorUpdate();

        // 9. Iniciar loop com intervalo configurável
        this._proactiveTutorNextSendAt = Date.now() + this._proactiveTutorIntervalMs;
        this._proactiveTutorInterval = setInterval(() => {
          this._sendProactiveTutorUpdate();
          this._proactiveTutorNextSendAt = Date.now() + this._proactiveTutorIntervalMs;
        }, this._proactiveTutorIntervalMs);
      }, 10000);

    } catch (error) {
      console.error('[ProactiveTutor] Erro ao iniciar:', error);
      this.updateOverlayStatus('Erro ao buscar transcrição.', false, 3000);
      if (tutorBtn) tutorBtn.classList.remove('loading');
      showToast('❌ Erro ao iniciar Tutor Proativo.');
    }
  }

  stopProactiveTutor() {
    this.proactiveTutorActive = false;
    this.closeTutorPopup();

    if (this._proactiveTutorInterval) {
      clearInterval(this._proactiveTutorInterval);
      this._proactiveTutorInterval = null;
    }

    if (this._proactiveTutorTimeout) {
      clearTimeout(this._proactiveTutorTimeout);
      this._proactiveTutorTimeout = null;
    }

    if (this._tutorPopupCountdownTimer) {
      clearInterval(this._tutorPopupCountdownTimer);
      this._tutorPopupCountdownTimer = null;
    }

    this._proactiveTutorSegments = null;
    this._proactiveTutorNextSendAt = null;

    const tutorBtn = document.getElementById('proactive-tutor-btn');
    if (tutorBtn) {
      tutorBtn.classList.remove('active', 'loading');
    }

    // Limpar a mensagem do storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['youtubeTranscription']);
    }

    console.log('[ProactiveTutor] Parado.');
  }

  openTutorPopup() {
    // Fechar popup existente
    this.closeTutorPopup();

    const tutorBtn = document.getElementById('proactive-tutor-btn');
    if (!tutorBtn) return;

    // Posicionar popup acima do botão
    const rect = tutorBtn.getBoundingClientRect();
    const popupWidth = 280;
    let left = rect.left + rect.width / 2 - popupWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));
    const top = rect.top - 10; // será ajustado após render

    // Overlay para fechar ao clicar fora
    const overlay = document.createElement('div');
    overlay.id = 'tutor-popup-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) this.closeTutorPopup(); };
    document.body.appendChild(overlay);

    const popup = document.createElement('div');
    popup.id = 'tutor-popup';
    popup.style.left = left + 'px';
    popup.style.top = '0px'; // ajustado abaixo

    const intervalSec = Math.round((this._proactiveTutorIntervalMs || 20000) / 1000);

    popup.innerHTML = `
      <div class="tp-header">
        <div class="tp-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#34a853"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
          Tutor Proativo
        </div>
        <button class="tp-close" id="tp-close-btn" aria-label="Fechar">×</button>
      </div>

      <div class="tp-countdown-label">Próximo envio em</div>
      <div class="tp-countdown" id="tp-countdown">--:--</div>
      <div class="tp-countdown-bar-bg">
        <div class="tp-countdown-bar" id="tp-countdown-bar" style="width:100%"></div>
      </div>
      <button class="tp-send-now-btn" id="tp-send-now-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        Enviar agora
      </button>

      <hr class="tp-divider">

      <div class="tp-interval-label">Intervalo de envio</div>
      <div class="tp-interval-row">
        <input
          class="tp-interval-input"
          id="tp-interval-input"
          type="number"
          min="5"
          max="3600"
          value="${intervalSec}"
          placeholder="segundos"
        >
        <span class="tp-interval-unit">segundos</span>
      </div>
      <button class="tp-save-btn" id="tp-save-btn">💾 Salvar intervalo</button>
      <div class="tp-saved-msg" id="tp-saved-msg"></div>

      <hr class="tp-divider">

      <div class="tp-prompt-label">Prompt periódico</div>
      <div class="tp-prompt-hint">Use <code style="color:#81c784;background:rgba(52,168,83,0.12);padding:1px 4px;border-radius:3px">{TEMPO}</code> e <code style="color:#81c784;background:rgba(52,168,83,0.12);padding:1px 4px;border-radius:3px">{TRANSCRICAO}</code> como variáveis.</div>
      <textarea class="tp-prompt-textarea" id="tp-prompt-textarea">${(this._proactiveTutorMessageTemplate || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
      <button class="tp-prompt-save-btn" id="tp-prompt-save-btn">✏️ Salvar prompt</button>
      <button class="tp-prompt-reset-btn" id="tp-prompt-reset-btn">↺ Restaurar padrão</button>

      <hr class="tp-divider">

      <button class="tp-stop-btn" id="tp-stop-btn">⏹ Desativar tutor</button>
    `;

    document.body.appendChild(popup);

    // Ajustar posição vertical para ficar acima do botão
    const popupH = 580; // estimado (agora maior por causa do textarea)
    popup.style.top = Math.max(8, rect.top - popupH - 8) + 'px';

    // Fechar
    document.getElementById('tp-close-btn').onclick = () => this.closeTutorPopup();

    // Enviar agora
    document.getElementById('tp-send-now-btn').onclick = () => {
      this._sendProactiveTutorUpdate();
      this._proactiveTutorNextSendAt = Date.now() + (this._proactiveTutorIntervalMs || 20000);
      const btn = document.getElementById('tp-send-now-btn');
      if (btn) {
        btn.textContent = '✓ Enviado!';
        btn.style.background = 'linear-gradient(90deg,#34a853,#2e7d32)';
        setTimeout(() => {
          if (btn) {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> Enviar agora';
            btn.style.background = '';
          }
        }, 1500);
      }
      showToast('📤 Prompt enviado manualmente!');
    };

    // Parar tutor
    document.getElementById('tp-stop-btn').onclick = () => {
      this.stopProactiveTutor();
      showToast('⏹️ Tutor Proativo desativado.');
    };

    // Salvar novo intervalo
    document.getElementById('tp-save-btn').onclick = () => {
      const inp = document.getElementById('tp-interval-input');
      const sec = parseInt(inp.value, 10);
      if (isNaN(sec) || sec < 5) {
        inp.style.borderColor = '#ea4335';
        setTimeout(() => inp.style.borderColor = '', 1500);
        return;
      }
      const newMs = sec * 1000;
      this._proactiveTutorIntervalMs = newMs;

      // Reiniciar o loop com novo intervalo
      if (this._proactiveTutorInterval) {
        clearInterval(this._proactiveTutorInterval);
      }
      this._proactiveTutorNextSendAt = Date.now() + newMs;
      this._proactiveTutorInterval = setInterval(() => {
        this._sendProactiveTutorUpdate();
        this._proactiveTutorNextSendAt = Date.now() + this._proactiveTutorIntervalMs;
      }, newMs);

      const msg = document.getElementById('tp-saved-msg');
      if (msg) { msg.textContent = `✓ Intervalo salvo: ${sec}s`; setTimeout(() => { msg.textContent = ''; }, 2500); }
      showToast(`⏱️ Intervalo atualizado para ${sec} segundos.`);
    };

    // Salvar prompt personalizado
    const defaultTemplate = `[Momento atual: {TEMPO}]\n\nTrecho da transcrição ao redor deste momento:\n{TRANSCRICAO}\n\nComece com UMA frase resumindo o que está acontecendo agora. Depois explique detalhadamente o que o autor está fazendo ou explicando neste trecho. Seja direto e não faça perguntas.`;

    const promptTextarea = document.getElementById('tp-prompt-textarea');
    if (promptTextarea && this._proactiveTutorMessageTemplate) {
      promptTextarea.value = this._proactiveTutorMessageTemplate;
    }

    document.getElementById('tp-prompt-save-btn').onclick = () => {
      const ta = document.getElementById('tp-prompt-textarea');
      if (!ta) return;
      const val = ta.value.trim();
      if (!val) return;
      this._proactiveTutorMessageTemplate = val;
      const msg = document.getElementById('tp-saved-msg');
      if (msg) { msg.textContent = '✓ Prompt salvo!'; setTimeout(() => { msg.textContent = ''; }, 2500); }
      showToast('✏️ Prompt do tutor atualizado!');
    };

    document.getElementById('tp-prompt-reset-btn').onclick = () => {
      const ta = document.getElementById('tp-prompt-textarea');
      if (ta) ta.value = defaultTemplate;
      this._proactiveTutorMessageTemplate = defaultTemplate;
      const msg = document.getElementById('tp-saved-msg');
      if (msg) { msg.textContent = '✓ Prompt restaurado!'; setTimeout(() => { msg.textContent = ''; }, 2500); }
    };

    // Countdown timer
    this._startTutorPopupCountdown();

    // Drag — arrastar pelo header
    const header = popup.querySelector('.tp-header');
    let isDragging = false, dragStartX = 0, dragStartY = 0, popupStartX = 0, popupStartY = 0;
    header.addEventListener('mousedown', (e) => {
      // Ignorar clique no botão fechar
      if (e.target.closest('#tp-close-btn')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      popupStartX = parseInt(popup.style.left) || 0;
      popupStartY = parseInt(popup.style.top)  || 0;
      document.body.style.userSelect = 'none';
    });
    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const pw = popup.offsetWidth  || 280;
      const ph = popup.offsetHeight || 500;
      const newLeft = Math.max(0, Math.min(popupStartX + dx, window.innerWidth  - pw));
      const newTop  = Math.max(0, Math.min(popupStartY + dy, window.innerHeight - ph));
      popup.style.left = newLeft + 'px';
      popup.style.top  = newTop  + 'px';
    };
    const stopDrag = () => { isDragging = false; document.body.style.userSelect = ''; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopDrag);
    // Limpar listeners quando popup for removido
    const dragObserver = new MutationObserver(() => {
      if (!document.getElementById('tutor-popup')) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stopDrag);
        dragObserver.disconnect();
      }
    });
    dragObserver.observe(document.body, { childList: true });
  }

  closeTutorPopup() {
    if (this._tutorPopupCountdownTimer) {
      clearInterval(this._tutorPopupCountdownTimer);
      this._tutorPopupCountdownTimer = null;
    }
    const overlay = document.getElementById('tutor-popup-overlay');
    if (overlay) overlay.remove();
    const popup = document.getElementById('tutor-popup');
    if (popup) popup.remove();
  }

  _startTutorPopupCountdown() {
    if (this._tutorPopupCountdownTimer) clearInterval(this._tutorPopupCountdownTimer);

    const updateDisplay = () => {
      const countEl = document.getElementById('tp-countdown');
      const barEl = document.getElementById('tp-countdown-bar');
      if (!countEl || !barEl) {
        clearInterval(this._tutorPopupCountdownTimer);
        this._tutorPopupCountdownTimer = null;
        return;
      }

      const totalMs = this._proactiveTutorIntervalMs || 20000;
      const remaining = this._proactiveTutorNextSendAt ? Math.max(0, this._proactiveTutorNextSendAt - Date.now()) : 0;
      const sec = Math.ceil(remaining / 1000);
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      countEl.textContent = `${m}:${s}`;
      barEl.style.width = (remaining / totalMs * 100).toFixed(1) + '%';
    };

    updateDisplay();
    this._tutorPopupCountdownTimer = setInterval(updateDisplay, 500);
  }

  _sendProactiveTutorUpdate() {
    if (!this.proactiveTutorActive || !this._proactiveTutorSegments) return;

    const video = document.querySelector('video');
    if (!video) return;

    // Se o vídeo está pausado, pular esta atualização
    if (video.paused) {
      console.log('[ProactiveTutor] Vídeo pausado, pulando atualização.');
      return;
    }

    const currentTimeSec = Math.floor(video.currentTime);
    const min = Math.floor(currentTimeSec / 60).toString().padStart(2, '0');
    const sec = (currentTimeSec % 60).toString().padStart(2, '0');
    const currentTimeFormatted = `${min}:${sec}`;

    // Pegar mais contexto ao redor do momento atual (2 min antes, 4 min depois)
    const windowBefore = 120; // 2 minutos antes
    const windowAfter = 240;  // 4 minutos depois
    const startTime = Math.max(0, currentTimeSec - windowBefore);
    const endTime = currentTimeSec + windowAfter;

    const relevantSegments = this._proactiveTutorSegments.filter(seg => {
      return seg.start >= startTime && seg.start <= endTime;
    });

    if (relevantSegments.length === 0) {
      console.log('[ProactiveTutor] Nenhum segmento relevante para o momento atual.');
      return;
    }

    const contextTranscript = relevantSegments.map(seg => {
      const totalSec = Math.floor(seg.start);
      const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const s = (totalSec % 60).toString().padStart(2, '0');
      return `[${m}:${s}] ${seg.text}`;
    }).join('\n');

    // Usar template customizável (editável no popup)
    const defaultTemplate = `[Momento atual: {TEMPO}]

Trecho da transcrição ao redor deste momento:
{TRANSCRICAO}

Comece com UMA frase resumindo o que está acontecendo agora. Depois explique detalhadamente o que o autor está fazendo ou explicando neste trecho. Seja direto e não faça perguntas.`;

    if (!this._proactiveTutorMessageTemplate) {
      this._proactiveTutorMessageTemplate = defaultTemplate;
    }

    const message = this._proactiveTutorMessageTemplate
      .replace('{TEMPO}', currentTimeFormatted)
      .replace('{TRANSCRICAO}', contextTranscript);

    // Enviar via chrome.storage como youtubeTranscription com mode 'aistudio'
    // O aistudio-inject.js vai pegar, preencher o textarea, clicar Talk e Run
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        'youtubeTranscription': {
          text: message,
          timestamp: Date.now(),
          videoId: this.currentVideoId,
          preset: 'proactive-tutor-update',
          mode: 'aistudio'
        }
      }, () => {
        console.log(`[ProactiveTutor] Atualização enviada para AI Studio [${currentTimeFormatted}]`);
      });
    }
  }

  // Abre o popup de legendas inteligentes abaixo do ícone no player
  openCaptionsPopup(videoId) {
    // Remover popup existente se houver
    this.closeCaptionsPopup();

    const popup = document.createElement('div');
    popup.id = 'smart-captions-popup';
    popup.className = 'smart-captions-popup';

    popup.innerHTML = `
      <div class="sc-popup-header">
        <div class="sc-popup-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:#4285f4;flex-shrink:0;">
            <path d="M21 6.5C21 8.43 19.43 10 17.5 10S14 8.43 14 6.5 15.57 3 17.5 3 21 4.57 21 6.5zm-3.5 4.5c-2.49 0-4.5-2.01-4.5-4.5A4.5 4.5 0 0 1 17.5 2a4.5 4.5 0 0 1 4.5 4.5A4.5 4.5 0 0 1 17.5 11zM17 9h1V7h2V6h-2V4h-1v2h-2v1h2v2zm-4.5 3h-9C2.67 12 2 12.67 2 13.5v7c0 .83.67 1.5 1.5 1.5h13c.83 0 1.5-.67 1.5-1.5V14c-.85.63-1.88 1-3 1-.85 0-1.65-.22-2.35-.6L12.5 15z"/>
          </svg>
          <span>Legendas Inteligentes</span>
        </div>
        <button class="sc-popup-close" id="sc-popup-close-btn" aria-label="Fechar">×</button>
      </div>

      <div class="sc-popup-instructions">
        <div class="sc-popup-step">
          <div class="sc-popup-step-num">1</div>
          <div class="sc-popup-step-text">
            <strong>Prompt copiado!</strong> Abra o <a href="https://gemini.google.com/app" target="_blank" class="sc-popup-link">Gemini</a> e cole o prompt <span class="sc-popup-kbd">Ctrl+V</span>
          </div>
        </div>
        <div class="sc-popup-step">
          <div class="sc-popup-step-num">2</div>
          <div class="sc-popup-step-text">
            Copie o <strong>JSON</strong> da resposta e cole abaixo:
          </div>
        </div>
      </div>

      <div class="sc-popup-body">
        <textarea
          id="sc-popup-json-area"
          class="sc-popup-textarea"
          placeholder='Cole aqui o JSON do Gemini...&#10;&#10;{"0": "Texto reescrito...", "1": "..."}'></textarea>
      </div>

      <div class="sc-popup-footer">
        <button id="sc-popup-gemini-btn" class="sc-popup-btn-secondary">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.22 8.22 0 0 0 4.82 1.56V6.81a4.85 4.85 0 0 1-1.05-.12z"/></svg>
          Abrir Gemini
        </button>
        <button id="sc-popup-apply-btn" class="sc-popup-btn-primary">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
          Carregar Legendas
        </button>
      </div>
    `;

    document.body.appendChild(popup);

    // Posicionar abaixo do botão de legendas
    this._positionCaptionsPopup(popup);

    // Reposicionar ao redimensionar
    this._captionsPopupResizeHandler = () => this._positionCaptionsPopup(popup);
    window.addEventListener('resize', this._captionsPopupResizeHandler);

    // Animação de entrada
    requestAnimationFrame(() => popup.classList.add('sc-popup-visible'));

    // Fechar
    document.getElementById('sc-popup-close-btn').onclick = () => {
      this.closeCaptionsPopup();
      this.stop();
    };

    // Abrir Gemini
    document.getElementById('sc-popup-gemini-btn').onclick = () => {
      window.open('https://gemini.google.com/app', '_blank');
    };

    // Aplicar legendas
    document.getElementById('sc-popup-apply-btn').onclick = () => {
      const textarea = document.getElementById('sc-popup-json-area');
      if (!textarea) return;
      const text = textarea.value.trim();
      if (!text) {
        textarea.style.borderColor = 'rgba(234,67,53,0.8)';
        setTimeout(() => textarea.style.borderColor = '', 1500);
        return;
      }
      try {
        let cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const rewrittenByIndex = JSON.parse(cleanJson);
        this.applyRewrittenSubtitles(rewrittenByIndex, videoId);
        this.closeCaptionsPopup();
      } catch (e) {
        showToast('❌ JSON inválido. Verifique a resposta do Gemini.');
        const textarea = document.getElementById('sc-popup-json-area');
        if (textarea) {
          textarea.style.borderColor = 'rgba(234,67,53,0.8)';
          setTimeout(() => textarea.style.borderColor = '', 2000);
        }
      }
    };

    // Fechar ao clicar fora
    setTimeout(() => {
      this._captionsPopupOutsideHandler = (e) => {
        const pop = document.getElementById('smart-captions-popup');
        const btn = document.getElementById('smart-captions-btn');
        if (pop && !pop.contains(e.target) && btn && !btn.contains(e.target)) {
          this.closeCaptionsPopup();
        }
      };
      document.addEventListener('click', this._captionsPopupOutsideHandler);
    }, 150);

    // Focar no textarea
    setTimeout(() => {
      const ta = document.getElementById('sc-popup-json-area');
      if (ta) ta.focus();
    }, 300);
  }

  _positionCaptionsPopup(popup) {
    const btn = document.getElementById('smart-captions-btn');
    if (!btn) {
      // Fallback: posicionar no centro inferior do player
      const player = document.querySelector('#movie_player');
      if (player) {
        const rect = player.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.bottom = `${window.innerHeight - rect.bottom + 60}px`;
        popup.style.left = `${rect.left + rect.width / 2 - 190}px`;
      } else {
        popup.style.position = 'fixed';
        popup.style.bottom = '100px';
        popup.style.right = '20px';
      }
      return;
    }
    const rect = btn.getBoundingClientRect();
    const popupWidth = 380;
    const popupHeight = popup.offsetHeight || 320;
    const margin = 8;

    // Centro horizontal alinhado ao botão, evitando sair da tela
    let left = rect.left + rect.width / 2 - popupWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));

    // Abaixo do botão (popup fica abaixo do ícone)
    let top = rect.bottom + margin;

    // Se não couber abaixo, subir acima
    if (top + popupHeight > window.innerHeight - 8) {
      top = rect.top - popupHeight - margin;
    }

    popup.style.position = 'fixed';
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    popup.style.bottom = 'auto';
  }

  closeCaptionsPopup() {
    const existing = document.getElementById('smart-captions-popup');
    if (existing) {
      existing.classList.remove('sc-popup-visible');
      setTimeout(() => existing.remove(), 220);
    }
    if (this._captionsPopupOutsideHandler) {
      document.removeEventListener('click', this._captionsPopupOutsideHandler);
      this._captionsPopupOutsideHandler = null;
    }
    if (this._captionsPopupResizeHandler) {
      window.removeEventListener('resize', this._captionsPopupResizeHandler);
      this._captionsPopupResizeHandler = null;
    }
  }

  // Novo método para abrir o painel com iframe do Gemini (mantido para o FAB)
  openGeminiIframePanel(videoId) {
    // Remover se já existir
    this.removeGeminiPanel();

    const panel = document.createElement('div');
    panel.id = 'smart-captions-gemini-panel';
    panel.className = 'smart-captions-gemini-panel';
    
    panel.innerHTML = `
      <div class="smart-captions-gemini-header">
        <h3 style="margin:0; font-family:sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">✨ Gemini Assistente</h3>
        ${videoId ? `<button id="toggle-paste-overlay" class="smart-captions-header-btn">Finalizar Legendas</button>` : ''}
        <div style="display: flex; gap: 5px;">
          <button id="minimize-gemini-panel" class="smart-captions-minimize" title="Minimizar/Maximizar" style="font-size: 16px; padding: 0 5px;">_</button>
          <button id="close-gemini-panel" class="smart-captions-minimize" title="Fechar">×</button>
        </div>
      </div>
      <iframe src="https://gemini.google.com/app" class="smart-captions-iframe" id="gemini-iframe"></iframe>
      
      <div class="smart-captions-paste-overlay" id="smart-captions-paste-overlay">
        <p style="margin:0; color:#ccc; font-size:11px; line-height:1.3;">
          Cole o <b>JSON</b> do Gemini abaixo:
        </p>
        <textarea id="paste-json-area" placeholder='{"0": "...", "1": "..."}' style="width:100%; height:60px; background:#111; border:1px solid #444; border-radius:8px; color:#fff; padding:6px; font-family:monospace; font-size:10px; resize:none; outline:none; box-sizing:border-box;"></textarea>
        <button id="process-pasted-json" style="width:100%; padding:8px; background:#4285f4; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:12px;">Aplicar Legendas</button>
      </div>

      <div class="smart-captions-gemini-resize-handle" id="gemini-panel-resize-handle"></div>
    `;

    // Adicionar ao container principal para evitar que outras extensões fiquem por cima
    const container = document.querySelector('#content.ytd-app') || document.querySelector('ytd-app') || document.body;
    container.appendChild(panel);

    // Setup de Redimensionamento
    this.setupGeminiResize(panel);

    // Eventos
    document.getElementById('close-gemini-panel').onclick = (e) => {
      e.stopPropagation();
      this.removeGeminiPanel();
      this.stop();
    };

    const minimizeBtn = document.getElementById('minimize-gemini-panel');
    minimizeBtn.onclick = (e) => {
      e.stopPropagation();
      panel.classList.toggle('minimized');
      minimizeBtn.textContent = panel.classList.contains('minimized') ? '▢' : '_';
    };

    if (videoId) {
      const togglePasteBtn = document.getElementById('toggle-paste-overlay');
      const overlay = document.getElementById('smart-captions-paste-overlay');
      const textarea = document.getElementById('paste-json-area');
      const processBtn = document.getElementById('process-pasted-json');

      togglePasteBtn.onclick = () => {
        overlay.classList.toggle('active');
        if (overlay.classList.contains('active')) {
          textarea.focus();
        }
      };

      processBtn.onclick = () => {
        const text = textarea.value.trim();
        if (!text) return;

        try {
          let cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const rewrittenByIndex = JSON.parse(cleanJson);
          this.applyRewrittenSubtitles(rewrittenByIndex, videoId);
          this.removeGeminiPanel();
        } catch (e) {
          showToast("❌ JSON inválido do Gemini.");
        }
      };

      togglePasteBtn.onmouseover = () => togglePasteBtn.style.background = '#3367d6';
      togglePasteBtn.onmouseout = () => togglePasteBtn.style.background = '#4285f4';
    }

    // Focar na área de colagem após um tempo
    setTimeout(() => {
      const textarea = document.getElementById('paste-json-area');
      if (textarea) textarea.focus();
    }, 1000);
  }

  // Lógica de redimensionamento para o painel do Gemini
  setupGeminiResize(panel) {
    const handle = panel.querySelector('#gemini-panel-resize-handle');
    let isResizing = false;
    let startX;
    let startWidth;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(window.getComputedStyle(panel).width, 10);
      
      panel.classList.add('resizing');

      const onMouseMove = (moveEvent) => {
        if (!isResizing) return;
        // Como o painel está à direita, mover para a esquerda aumenta o tamanho
        const delta = startX - moveEvent.clientX;
        const newWidth = startWidth + delta;
        
        if (newWidth > 350 && newWidth < window.innerWidth * 0.9) {
          panel.style.width = `${newWidth}px`;
        }
      };

      const onMouseUp = () => {
        isResizing = false;
        panel.classList.remove('resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Re-habilitar eventos no iframe
        const iframe = panel.querySelector('iframe');
        if (iframe) iframe.style.pointerEvents = 'auto';
      };

      // Desabilitar eventos no iframe durante o resize para não perder o foco do mouse
      const iframe = panel.querySelector('iframe');
      if (iframe) iframe.style.pointerEvents = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }



  // Novo método para aplicar as legendas processadas
  applyRewrittenSubtitles(rewrittenByIndex, videoId) {
    try {
      this.rewrittenSubtitles = [];
      
      this.originalTimestampsMap.forEach((item, index) => {
        const indexStr = String(index);
        const rewrittenText = rewrittenByIndex[indexStr] || item.originalText;
        this.rewrittenSubtitles.push({
          seconds: item.seconds,
          duration: item.duration, // preservar a duração real do segmento
          text: rewrittenText
        });
      });
      
      this.rewrittenSubtitles.sort((a, b) => a.seconds - b.seconds);
      
      if (videoId) {
        this.subtitlesCache[videoId] = this.rewrittenSubtitles.map(item => ({
          seconds: item.seconds,
          duration: item.duration,
          text: item.text
        }));
      }

      this.startSyncLoop();
      this.updateOverlayStatus("Legendas ativas!", false, 3000); 
    } catch (e) {
      console.error("[SmartCaptions] Erro ao aplicar legendas:", e);
      this.updateOverlayStatus("Erro ao aplicar legendas.", false, 3000);
    }
  }



  startSyncLoop() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    
    const video = document.querySelector('video');
    if (!video) return;

    const subtitlesMap = this.rewrittenSubtitles;
    
    console.log("[SmartCaptions] Sync loop iniciado. Total de segmentos:", subtitlesMap.length);
    if (subtitlesMap.length > 0) {
      console.log("[SmartCaptions] Primeiro segmento:", subtitlesMap[0]);
      console.log("[SmartCaptions] Último segmento:", subtitlesMap[subtitlesMap.length - 1]);
    }

    let lastShownSubtitle = null;

    this.checkInterval = setInterval(() => {
      if (!this.active || !this.rewrittenSubtitles || this.rewrittenSubtitles.length === 0) return;
      
      const currentTime = video.currentTime;

      // ── Busca binária: acha o último segmento com seconds <= currentTime ──
      let lo = 0, hi = subtitlesMap.length - 1, foundIdx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (subtitlesMap[mid].seconds <= currentTime) {
          foundIdx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      let currentSubtitle = null;

      if (foundIdx >= 0) {
        const candidate = subtitlesMap[foundIdx];
        // Tolerância de 0.3s para cobrir o atraso do polling de 100ms
        const endTime = candidate.seconds + (candidate.duration || 3) + 0.3;

        // Só exibe se o tempo atual ainda está dentro do intervalo do segmento
        if (currentTime <= endTime) {
          currentSubtitle = candidate;
        }
      }

      if (currentSubtitle) {
        if (lastShownSubtitle !== currentSubtitle.text) {
          console.log(`DEBUG: Sincronização - Tempo Vídeo: ${currentTime.toFixed(1)}s | Legenda: [${formatTimestamp(currentSubtitle.seconds)}] "${currentSubtitle.text}"`);
          lastShownSubtitle = currentSubtitle.text;
        }
        this.showSubtitle(currentSubtitle.text);
      } else {
        // Nenhum segmento ativo: esconder a legenda
        if (lastShownSubtitle !== null) {
          lastShownSubtitle = null;
          this.hideSubtitle();
        }
      }
    }, 100); // 100ms para maior responsividade na troca de segmentos
  }

  // ----------------------------------------------------------------
  // UI - Layout Moderno Suspenso
  // ----------------------------------------------------------------
  
  createOverlay() {
    if (document.getElementById('smart-captions-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'smart-captions-overlay';
    
    // Estilos Injetados via JS para garantir isolamento
    Object.assign(overlay.style, {
      position: 'absolute',
      bottom: '100px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '80%',
      maxWidth: '800px',
      textAlign: 'center',
      zIndex: '9999',
      pointerEvents: 'none', // Deixar clicar no vídeo através da legenda
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '10px',
      transition: 'opacity 0.3s ease'
    });

    // Container do texto
    const textContainer = document.createElement('div');
    textContainer.id = 'smart-captions-text';
    Object.assign(textContainer.style, {
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: '#ffffff',
      padding: '12px 24px',
      borderRadius: '12px',
      fontSize: '20px',
      lineHeight: '1.5',
      fontFamily: '"YouTube Sans", Roboto, Arial, sans-serif',
      fontWeight: '500',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(4px)',
      opacity: '0', // Começa invisível
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      textShadow: '0 2px 4px rgba(0,0,0,0.5)'
    });

    // Status (loading etc)
    const statusContainer = document.createElement('div');
    statusContainer.id = 'smart-captions-status';
    Object.assign(statusContainer.style, {
      fontSize: '14px',
      color: '#aaa',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '4px 12px',
      borderRadius: '16px',
      display: 'none'
    });

    overlay.appendChild(statusContainer);
    overlay.appendChild(textContainer);

    // Inserir no container do vídeo para acompanhar Fullscreen
    const videoContainer = document.querySelector('#movie_player') || document.body;
    videoContainer.appendChild(overlay);
    
    this.overlayElement = overlay;
    this.subtitleElement = textContainer;
  }

  removeOverlay() {
    const el = document.getElementById('smart-captions-overlay');
    if (el) el.remove();
    this.overlayElement = null;
    this.subtitleElement = null;
  }

  updateOverlayStatus(message, isLoading, autoHideMs = 0) {
    if (!this.overlayElement) return;
    
    const statusEl = this.overlayElement.querySelector('#smart-captions-status');
    if (message) {
      statusEl.innerHTML = isLoading ? 
        `<span class="smart-spinner" style="display:inline-block;width:10px;height:10px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin-right:8px;"></span>${message}` : 
        message;
      
      // Adicionar keyframe spin se não existir
      if (!document.getElementById('smart-captions-style')) {
        const style = document.createElement('style');
        style.id = 'smart-captions-style';
        style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
      }

      statusEl.style.display = 'flex';
      statusEl.style.alignItems = 'center';
    } else {
      statusEl.style.display = 'none';
    }

    if (autoHideMs > 0) {
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, autoHideMs);
    }
  }

  showSubtitle(text) {
    if (!this.subtitleElement) return;
    
    // Se o texto for igual ao atual em exibição, não faz nada
    if (this.subtitleElement.textContent === text && this.subtitleElement.style.opacity === '1') return;

    this.subtitleElement.textContent = text;
    this.subtitleElement.style.opacity = '1';
    this.subtitleElement.style.transform = 'translateY(0)';
  }

  hideSubtitle() {
    if (!this.subtitleElement) return;
    this.subtitleElement.style.opacity = '0';
    this.subtitleElement.style.transform = 'translateY(4px)';
  }
}

// Inicializar o sistema
// Inicializar sistema globalmente para ser acessível pelo FAB
const smartSubtitleSystem = new SmartSubtitleSystem();
