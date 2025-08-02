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

// Função para verificar se existem thumbnails
function checkThumbnails() {
  const thumbnails = document.querySelectorAll("a#thumbnail");
  return thumbnails.length > 0;
}

// Configuração da API Gemini
const GEMINI_API_KEY = 'AIzaSyCcTCBbpj8Dllf8fmhPngaG7PQbTJoTqck';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Função para fazer request para Gemini API
async function callGeminiAPI(prompt) {
  try {
    console.log('[Gemini] Fazendo request para API...');
    
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
    console.log('[Gemini] Resposta recebida:', data);
    
    // Extrair texto da resposta
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Resposta vazia do Gemini');
    }
    
    return text;
  } catch (error) {
    console.error('[Gemini] Erro na API:', error);
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
    alert('Nenhuma transcrição disponível. Clique em um vídeo primeiro.');
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
    console.log('[Gemini] Processando transcrição...');
    const response = await callGeminiAPI(prompt);
    return response;
  } catch (error) {
    console.error('[Gemini] Erro ao processar transcrição:', error);
    throw error;
  }
}

// Novo método usando API interna do YouTube
async function getVideoTranscription(videoId) {
  try {
    console.log(`[YouTube] Iniciando extração de transcrição para vídeo: ${videoId}`);
    
    // Tentar primeiro com a API interna do YouTube (mais confiável)
    console.log('[YouTube] Tentando API interna do YouTube...');
    const transcriptFromApi = await downloadTranscriptXML(videoId);
    
    if (transcriptFromApi) {
      console.log(`[YouTube] Transcrição obtida via API interna. Tamanho: ${transcriptFromApi.length} caracteres`);
      return transcriptFromApi;
    }
    
    // Se a API interna falhar, usar o método fallback já implementado
    console.log('[YouTube] API interna falhou, tentando método fallback...');
    
    // Obter HTML da página
    const html = await fetchVideoPageHTML(videoId);
    if (!html) {
      throw new Error('Não foi possível obter o HTML da página');
    }
    
    // Extrair dados de transcrição
    const transcriptionData = extractTranscriptionData(html);
    if (!transcriptionData || transcriptionData.length === 0) {
      throw new Error('Nenhuma transcrição disponível para este vídeo');
    }
    
    // Selecionar melhor opção
    const selectedCaption = selectBestCaptionFromData(transcriptionData);
    console.log(`[YouTube] Transcrição selecionada: ${selectedCaption.language}`);
    
    // Baixar via método antigo
    const transcriptFromFallback = await downloadTranscriptXMLFallback(videoId);
    
    if (!transcriptFromFallback) {
      throw new Error('Todos os métodos de extração falharam');
    }
    
    console.log(`[YouTube] Transcrição extraída via fallback. Tamanho: ${transcriptFromFallback.length} caracteres`);
    return transcriptFromFallback;
    
  } catch (error) {
    console.error('[YouTube] Erro na extração de transcrição:', error);
    return null;
  }
}

// Passo 1: Obter o conteúdo HTML da página do vídeo
async function fetchVideoPageHTML(videoId) {
  try {
    console.log(`[YouTube] Fazendo fetch da página do vídeo: ${videoId}`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Cabeçalho User-Agent para simular um navegador real
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }
    
    const html = await response.text();
    console.log(`[YouTube] HTML obtido com sucesso. Tamanho: ${html.length} caracteres`);
    return html;
  } catch (error) {
    console.error('[YouTube] Erro ao obter HTML da página:', error);
    return null;
  }
}

// Extrair legendas usando split simples (baseado na lógica fv)
function extractCaptionTracks(html) {
  try {
    console.log('[YouTube] Extraindo captionTracks usando split...');
    
    const parts = html.split('"captions":');
    if (parts.length < 2) {
      throw new Error('Youtube caption is not found');
    }
    
    try {
      const captionsPart = parts[1].split(',"videoDetails')[0].replace('\n', '');
      const captionsData = JSON.parse(captionsPart);
      return captionsData.playerCaptionsTracklistRenderer.captionTracks;
    } catch (error) {
      throw new Error('Youtube caption is not found');
    }
  } catch (error) {
    console.error('[YouTube] Erro ao extrair captionTracks:', error);
    return null;
  }
}

// Extrair título do vídeo (baseado na lógica pv)
function extractVideoTitle(html) {
  try {
    const parts = html.split('"title":"');
    if (parts.length < 2) {
      throw new Error('Youtube title is not found');
    }
    return parts[1].split('","lengthSeconds"')[0] || '';
  } catch (error) {
    console.error('[YouTube] Erro ao extrair título:', error);
    return '';
  }
}

// Função principal para extrair dados de transcrição (baseado na lógica dv)
function extractTranscriptionData(html) {
  try {
    console.log('[YouTube] Processando dados de transcrição...');
    
    if (!html || !html.trim()) {
      return [];
    }

    const captionTracks = extractCaptionTracks(html);
    const title = extractVideoTitle(html);
    
    if (!captionTracks || captionTracks.length === 0) {
      return [];
    }
    
    console.log(`[YouTube] Encontradas ${captionTracks.length} opções de transcrição`);
    console.log(`[YouTube] Título do vídeo: ${title}`);
    
    // Criar mapa de legendas por nome para evitar duplicatas
    const trackMap = new Map(captionTracks.map(track => [track.name.simpleText, track]));
    const languages = Array.from(trackMap.keys());
    
    // Priorizar Português, depois Inglês
    const targetLanguage = "Português";
    const englishLanguage = "English";
    
    // Ordenar: Português primeiro, depois Inglês, depois outros
    const sortedLanguages = languages.sort((a, b) => {
      if (a.includes(targetLanguage)) return -1;
      if (b.includes(targetLanguage)) return 1;
      if (a.includes(englishLanguage)) return -1;
      if (b.includes(englishLanguage)) return 1;
      return 0;
    }).sort((a, b) => {
      if (a === targetLanguage) return -1;
      if (b === targetLanguage) return 1;
      if (a === englishLanguage) return -1;
      if (b === englishLanguage) return 1;
      return 0;
    });

    // Mapear para o formato esperado
    return sortedLanguages.map(languageName => {
      const track = trackMap.get(languageName);
      const vssId = track.vssId?.startsWith('.') ? track.vssId.slice(1) : track.vssId || '';
      
      console.log(`[YouTube] Legenda mapeada: ${languageName} (${track.languageCode}) - vssId: ${vssId}`);
      
      return {
        language: languageName,
        link: track.baseUrl || '',
        title: title,
        vssId: vssId,
        languageCode: track.languageCode
      };
    });
    
  } catch (error) {
    console.error('[YouTube] Erro ao processar dados de transcrição:', error);
    return [];
  }
}

// Selecionar a melhor opção de transcrição da lista processada
function selectBestCaptionFromData(transcriptionData) {
  console.log('[YouTube] Selecionando melhor transcrição...');
  
  // Priorizar português, depois inglês
  const priorities = [
    // 1. Português (qualquer variação)
    item => item.languageCode === 'pt' || item.language.toLowerCase().includes('português'),
    // 2. Inglês 
    item => item.languageCode === 'en' || item.language.toLowerCase().includes('english'),
    // 3. Qualquer outro
    item => true
  ];
  
  for (const priority of priorities) {
    const selected = transcriptionData.find(priority);
    if (selected) {
      console.log(`[YouTube] Selecionada: ${selected.language} (${selected.languageCode})`);
      return selected;
    }
  }
  
  // Fallback para o primeiro disponível
  console.log('[YouTube] Usando primeira transcrição disponível como fallback');
  return transcriptionData[0];
}

// Baixar transcrição usando a API interna do YouTube
async function downloadTranscriptXML(videoId, transcriptParams) {
  try {
    console.log('[YouTube] Baixando transcrição via API interna do YouTube...');
    console.log(`[YouTube] Video ID: ${videoId}`);
    
    // Usar a API interna que funciona
    const url = 'https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false';
    
    const requestBody = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20250630.00.00"
        }
      },
      params: transcriptParams || await generateTranscriptParams(videoId)
    };
    
    console.log('[YouTube] Fazendo requisição para API interna...');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': '*/*',
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'pragma': 'no-cache',
        'sec-ch-ua': '"Google Chrome";v="138", "Chromium";v="138", "Not)A;Brand";v="8"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`Erro HTTP na API interna: ${response.status} - ${response.statusText}`);
    }
    
    const jsonResponse = await response.json();
    console.log('[YouTube] Resposta da API recebida');
    
    // Extrair texto da resposta JSON
    const transcriptText = extractTextFromApiResponse(jsonResponse);
    
    if (!transcriptText) {
      throw new Error('Não foi possível extrair texto da resposta da API');
    }
    
    console.log(`[YouTube] Transcrição extraída com sucesso. Tamanho: ${transcriptText.length} caracteres`);
    return transcriptText;
    
  } catch (error) {
    console.error('[YouTube] Erro ao baixar via API interna:', error);
    
    // Fallback para o método antigo se a API interna falhar
    console.log('[YouTube] Tentando método fallback...');
    return await downloadTranscriptXMLFallback(videoId);
  }
}

// Gerar parâmetros para a API de transcrição
async function generateTranscriptParams(videoId) {
  try {
    console.log(`[YouTube] Gerando params para vídeo: ${videoId}`);
    
    // Tentar extrair params do HTML da página
    const html = await fetchVideoPageHTML(videoId);
    if (html) {
      const extractedParams = extractTranscriptParams(html);
      if (extractedParams) {
        console.log('[YouTube] Params extraídos do HTML');
        return extractedParams;
      }
    }
    
    // Tentar gerar params usando o padrão que funciona
    console.log('[YouTube] Gerando params usando padrão conhecido...');
    const generatedParams = generateParamsFromVideoId(videoId);
    if (generatedParams) {
      console.log('[YouTube] Params gerados com sucesso');
      return generatedParams;
    }
    
    // Se não conseguir extrair, usar formato básico
    console.log('[YouTube] Usando params básicos gerados');
    const basicParams = btoa(`${videoId}\x12\x12\x0a\x0basr\x12\x02pt\x1a\x00`);
    return basicParams;
    
  } catch (error) {
    console.error('[YouTube] Erro ao gerar params:', error);
    return null;
  }
}

// Gerar params usando padrão conhecido (baseado no exemplo que funciona)
function generateParamsFromVideoId(videoId) {
  try {
    console.log(`[YouTube] Construindo params para ${videoId}...`);
    
    // Estrutura baseada no exemplo que funciona
    // O exemplo decodificado contém informações sobre o vídeo e configurações de transcrição
    
    // Construir a estrutura base
    const protoData = {
      videoId: videoId,
      // Configurações de transcrição automática
      transcriptConfig: {
        language: 'pt',
        type: 'asr' // automatic speech recognition
      },
      // Configurações do painel de engajamento
      panelConfig: {
        searchable: true,
        type: 'transcript-search-panel'
      }
    };
    
    // Tentar construir params similar ao exemplo
    // CgtTbnZDcE1oT1YzaxISQ2dOaGMzSVNBbkIwR2dBJTNEGAEqM2VuZ2FnZW1lbnQtcGFuZWwtc2VhcmNoYWJsZS10cmFuc2NyaXB0LXNlYXJjaC1wYW5lbDAAOAFAAQ%3D%3D
    
    // Construir manualmente seguindo o padrão
    const paramString = `\x0a\x0b${videoId}\x12\x12\x0a\x0basr\x12\x02pt\x1a\x00\x18\x01*3engagement-panel-searchable-transcript-search-panel\x00\x008\x01@\x01`;
    
    const encodedParams = btoa(paramString);
    console.log(`[YouTube] Params gerados: ${encodedParams.substring(0, 50)}...`);
    
    return encodedParams;
    
  } catch (error) {
    console.error('[YouTube] Erro ao gerar params do videoId:', error);
    return null;
  }
}

// Extrair parâmetros de transcrição do HTML
function extractTranscriptParams(html) {
  try {
    console.log('[YouTube] Procurando params de transcrição no HTML...');
    
    // Padrões mais específicos para encontrar params de transcrição
    const patterns = [
      // Padrão mais comum - getTranscriptEndpoint
      /"getTranscriptEndpoint":\s*{\s*"params":\s*"([^"]+)"/,
      // Padrão alternativo 
      /"transcriptCommand":\s*{\s*"getTranscriptEndpoint":\s*{\s*"params":\s*"([^"]+)"/,
      // Padrão em clickCommand
      /"clickCommand":\s*{\s*"getTranscriptEndpoint":\s*{\s*"params":\s*"([^"]+)"/,
      // Padrão genérico
      /"params":\s*"([^"]+)"[^}]*transcript/i,
      // Padrão em transcriptRenderer  
      /"transcriptRenderer"[^}]*"params":\s*"([^"]+)"/
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        console.log('[YouTube] Params encontrados no HTML via pattern');
        return match[1];
      }
    }
    
    // Tentar encontrar params através da análise de botões de transcrição
    const transcriptButtonMatch = html.match(/"text":\s*"Transcrição"[^}]*}/);
    if (transcriptButtonMatch) {
      console.log('[YouTube] Botão de transcrição encontrado, procurando params próximos...');
      
      // Procurar params nas proximidades do botão de transcrição
      const nearbyParamsMatch = html.substring(Math.max(0, transcriptButtonMatch.index - 2000), transcriptButtonMatch.index + 2000)
        .match(/"params":\s*"([^"]+)"/);
      
      if (nearbyParamsMatch) {
        console.log('[YouTube] Params encontrados próximo ao botão de transcrição');
        return nearbyParamsMatch[1];
      }
    }
    
    console.log('[YouTube] Params não encontrados no HTML');
    return null;
  } catch (error) {
    console.error('[YouTube] Erro ao extrair params:', error);
    return null;
  }
}

// Extrair texto da resposta da API
function extractTextFromApiResponse(apiResponse) {
  try {
    console.log('[YouTube] Extraindo texto da resposta da API...');
    
    // Log da estrutura para debug
    console.log('[YouTube] Estrutura da resposta:', Object.keys(apiResponse));
    
    // Método 1: Formato com actions (mais comum)
    if (apiResponse.actions && Array.isArray(apiResponse.actions)) {
      console.log('[YouTube] Processando formato com actions...');
      
      for (const action of apiResponse.actions) {
        // Tentar diferentes caminhos para transcriptRenderer
        const transcriptRenderer = 
          action.updateEngagementPanelAction?.content?.transcriptRenderer ||
          action.updateEngagementPanelAction?.content?.transcriptSearchPanelRenderer ||
          action.appendContinuationItemsAction?.continuationItems?.[0]?.transcriptRenderer;
        
        if (transcriptRenderer) {
          // Tentar extrair de diferentes estruturas
          let segments = 
            transcriptRenderer.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments ||
            transcriptRenderer.body?.transcriptSegmentListRenderer?.initialSegments ||
            transcriptRenderer.initialSegments;
          
          if (segments && Array.isArray(segments)) {
            console.log(`[YouTube] Encontrados ${segments.length} segmentos de transcrição`);
            
            const textParts = segments.map(segment => {
              const renderer = segment.transcriptSegmentRenderer;
              if (renderer && renderer.snippet && renderer.snippet.runs) {
                return renderer.snippet.runs.map(run => run.text || '').join('');
              }
              return '';
            }).filter(text => text.trim().length > 0);
            
            if (textParts.length > 0) {
              const fullText = textParts.join(' ');
              console.log(`[YouTube] Texto extraído via actions. Tamanho: ${fullText.length} caracteres`);
              return fullText;
            }
          }
        }
      }
    }
    
    // Método 2: Formato direto com transcript
    if (apiResponse.transcript && Array.isArray(apiResponse.transcript)) {
      console.log('[YouTube] Processando formato direto com transcript...');
      const textParts = apiResponse.transcript.map(item => item.text || '').filter(text => text.trim().length > 0);
      if (textParts.length > 0) {
        const fullText = textParts.join(' ');
        console.log(`[YouTube] Texto extraído via transcript direto. Tamanho: ${fullText.length} caracteres`);
        return fullText;
      }
    }
    
    // Método 3: Formato com segments
    if (apiResponse.segments && Array.isArray(apiResponse.segments)) {
      console.log('[YouTube] Processando formato com segments...');
      const textParts = apiResponse.segments.map(segment => 
        segment.text || segment.snippet?.text || ''
      ).filter(text => text.trim().length > 0);
      
      if (textParts.length > 0) {
        const fullText = textParts.join(' ');
        console.log(`[YouTube] Texto extraído via segments. Tamanho: ${fullText.length} caracteres`);
        return fullText;
      }
    }
    
    // Método 4: Busca recursiva por qualquer campo com 'text'
    console.log('[YouTube] Tentando busca recursiva por texto...');
    const extractedText = recursiveTextSearch(apiResponse);
    if (extractedText) {
      console.log(`[YouTube] Texto extraído via busca recursiva. Tamanho: ${extractedText.length} caracteres`);
      return extractedText;
    }
    
    console.log('[YouTube] Estrutura da resposta não reconhecida');
    console.log('[YouTube] Resposta completa:', JSON.stringify(apiResponse, null, 2).substring(0, 1000));
    return null;
    
  } catch (error) {
    console.error('[YouTube] Erro ao extrair texto da API:', error);
    return null;
  }
}

// Função auxiliar para busca recursiva de texto
function recursiveTextSearch(obj, maxDepth = 5, currentDepth = 0) {
  if (currentDepth > maxDepth) return null;
  
  if (typeof obj === 'string' && obj.length > 10) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    const textParts = [];
    for (const item of obj) {
      if (typeof item === 'string' && item.length > 3) {
        textParts.push(item);
      } else if (typeof item === 'object' && item !== null) {
        const result = recursiveTextSearch(item, maxDepth, currentDepth + 1);
        if (result) textParts.push(result);
      }
    }
    return textParts.length > 0 ? textParts.join(' ') : null;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    // Procurar por campos específicos primeiro
    if (obj.text && typeof obj.text === 'string' && obj.text.length > 3) {
      return obj.text;
    }
    
    // Procurar em runs (comum no YouTube)
    if (obj.runs && Array.isArray(obj.runs)) {
      const textParts = obj.runs.map(run => run.text || '').filter(text => text.trim().length > 0);
      if (textParts.length > 0) return textParts.join('');
    }
    
    // Buscar recursivamente em outros campos
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase().includes('text') || key.toLowerCase().includes('transcript')) {
        const result = recursiveTextSearch(obj[key], maxDepth, currentDepth + 1);
        if (result) return result;
      }
    }
  }
  
  return null;
}

// Método fallback usando o método antigo
async function downloadTranscriptXMLFallback(videoId) {
  try {
    console.log('[YouTube] Usando método fallback...');
    
    // Obter dados de transcrição 
    const html = await fetchVideoPageHTML(videoId);
    if (!html) return null;
    
    const transcriptionData = extractTranscriptionData(html);
    if (!transcriptionData || transcriptionData.length === 0) return null;
    
    const selectedCaption = selectBestCaptionFromData(transcriptionData);
    if (!selectedCaption || !selectedCaption.link) return null;
    
    // Baixar XML do método antigo
    const xmlUrl = selectedCaption.link.includes('&fmt=xml') ? selectedCaption.link : `${selectedCaption.link}&fmt=xml`;
    
    const response = await fetch(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const xmlContent = await response.text();
    return parseTranscriptXML(xmlContent);
    
  } catch (error) {
    console.error('[YouTube] Erro no método fallback:', error);
    return null;
  }
}

// Passo 5: Analisar o XML e Extrair o Texto Final
function parseTranscriptXML(xmlContent) {
  try {
    console.log('[YouTube] Analisando XML e extraindo texto...');
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    
    // Verificar se houve erro no parsing
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Erro ao fazer parse do XML');
    }
    
    // Encontrar todas as tags <text>
    const textElements = xmlDoc.getElementsByTagName("text");
    
    if (textElements.length === 0) {
      throw new Error('Nenhuma tag <text> encontrada no XML');
    }
    
    console.log(`[YouTube] Encontradas ${textElements.length} tags de texto`);
    
    // Extrair e concatenar todo o texto
    const textParts = Array.from(textElements)
      .map(element => {
        const text = element.textContent?.trim();
        return text ? text : '';
      })
      .filter(text => text.length > 0);
    
    const finalText = textParts.join(' ');
    console.log(`[YouTube] Texto final extraído. Tamanho: ${finalText.length} caracteres`);
    
    return finalText;
  } catch (error) {
    console.error('[YouTube] Erro ao analisar XML:', error);
    return null;
  }
}

// Função para extrair o ID do vídeo da URL do thumbnail
function getVideoIdFromThumbnail(thumbnail) {
  try {
    // Encontrar o elemento <a> dentro do thumbnail
    const linkElement = thumbnail.querySelector("a");
    let href = null;
    if (!linkElement) {
      href = thumbnail.href;
    } else {
      href = linkElement.getAttribute("href");
    }
    if (!href) {
      return null;
    }

    const match = href.match(/[?&]v=([^&]+)/);
    if (match) {
      return match[1];
    } else {
      return null;
    }
  } catch (error) {
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
        alert("Não foi possível obter a transcrição deste vídeo.");
      }
    }
  };
}

// Atualizar a função addSummaryIcons
function addSummaryIcons() {
  if (!isYouTubePage()) {
    console.log("[YouTube] Não estamos no YouTube, saindo...");
    return;
  }

  console.log("[YouTube] Iniciando processamento de vídeos...");
  // Processo para adicionar ícones às thumbnails
  processVideoThumbnails();

  // Processo para adicionar botões ao contêiner do vídeo
  processVideoContainers();

  // Verificar novamente após um breve intervalo
  console.log("[YouTube] Agendando nova verificação em 1.5 segundos...");
  setTimeout(processVideoContainers, 1500);
}

// Função para processar thumbnails e adicionar ícones
function processVideoThumbnails() {
  console.log("[YouTube] Procurando thumbnails para adicionar ícones...");
  const thumbnails = document.querySelectorAll(
    "a#thumbnail:not(.summary-icons-added)"
  );
  console.log(`[YouTube] Encontradas ${thumbnails.length} thumbnails para processar`);

  thumbnails.forEach((thumbnail, index) => {
    try {
      // Ícone superior esquerdo (Google AI Studio)
      const iconContainerTop = document.createElement("div");
      iconContainerTop.className = "summary-icon-container top";
      iconContainerTop.innerHTML = `
        <svg class="summary-icon" width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
        </svg>
      `;

      thumbnail.appendChild(iconContainerTop);
      thumbnail.classList.add("summary-icons-added");

      // Evento para o ícone do Google AI Studio
      iconContainerTop.addEventListener(
        "click",
        handleIconClick(thumbnail, index, true)
      );
      console.log(`[YouTube] Ícone do Google AI Studio adicionado à thumbnail ${index}`);
    } catch (error) {
      console.error(`[YouTube] Erro ao adicionar ícone do Google AI Studio à thumbnail ${index}:`, error);
    }
  });
}

// Função para processar contêineres de vídeo e adicionar botões Resumo AI
function processVideoContainers() {
  console.log("[YouTube] Procurando contêineres de vídeo para adicionar botões Resumo AI...");

  // Testar diferentes seletores para thumbnails
  console.log("[YouTube] Testando seletores para thumbnails:");
  [
    "a#thumbnail", 
    "a.yt-simple-endpoint", 
    "a[href^='/watch?v=']",
    "img.yt-core-image",
    ".yt-lockup-view-model-wiz__content-image"
  ].forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`[YouTube] Seletor para thumbnail "${selector}": ${elements.length} elementos encontrados`);
  });

  // Testar diferentes seletores para contêineres de vídeo
  [
    "ytd-rich-item-renderer", 
    "ytd-video-renderer", 
    "ytd-compact-video-renderer",
    ".yt-lockup-view-model-wiz",
    "#content"
  ].forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`[YouTube] Seletor para contêiner "${selector}": ${elements.length} elementos encontrados`);
  });

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
  console.log(`[YouTube] Processando ${containers.length} contêineres com seletor de thumbnail "${thumbnailSelector}"`);
  
  containers.forEach((container, index) => {
    try {
      
      // Verificar se já tem os botões
      if (container.querySelector(".ai-summary-video-container-button")) {
        return;
      }

      // Encontrar o thumbnail associado a este container usando o seletor específico
      const thumbnailElement = container.querySelector(thumbnailSelector);
      
      if (!thumbnailElement) {
        return;
      }
      
      console.log(`[YouTube] Thumbnail encontrado no contêiner ${index} usando seletor "${thumbnailSelector}"`);

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
        console.log(`[YouTube] Não foi possível extrair o ID do vídeo, pulando...`);
        return;
      }
      
      console.log(`[YouTube] ID do vídeo extraído: ${videoId}`);

      // Criar container para os botões
      const buttonsContainer = document.createElement("div");
      buttonsContainer.className = "ai-summary-buttons-container";

      // Criar botão Resumo AI para o contêiner do vídeo
      const aiSummaryButton = document.createElement("div");
      aiSummaryButton.className = "ai-summary-video-container-button";
      aiSummaryButton.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
        </svg>
        <span>Resumo AI</span>
      `;

      // Criar botão Resumo ChatGPT
      const chatgptButton = document.createElement("div");
      chatgptButton.className = "ai-summary-video-container-button chatgpt";
      chatgptButton.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142-.0852 4.783-2.7582a.7712.7712 0 0 0 .7806 0l5.8428 3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
        </svg>
      `;

      // Adicionar botões ao container
      buttonsContainer.appendChild(aiSummaryButton);
      buttonsContainer.appendChild(chatgptButton);

      // Adicionar o container como filho direto do contêiner do vídeo
      container.appendChild(buttonsContainer);
      container.classList.add("ai-summary-button-added");
      console.log(`[YouTube] Botões Resumo AI e ChatGPT adicionados ao contêiner ${index}`);

      // Evento para o botão Resumo AI usando o ID do vídeo diretamente
      aiSummaryButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`[YouTube] Botão Resumo AI clicado para vídeo ${videoId}`);
        
        // Mostrar loading global ou algo enquanto pega transcrição
        // Para simplicidade, vamos assumir que pegamos a transcrição primeiro
        const transcription = await getVideoTranscription(videoId);
        if (!transcription) {
          alert("Não foi possível obter a transcrição deste vídeo.");
          return;
        }
        window.currentTranscription = transcription;
        
        // Criar popup
        createPromptPopup(aiSummaryButton, transcription);
      });

      // Evento para o botão Resumo ChatGPT
      chatgptButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`[YouTube] Botão Resumo ChatGPT clicado para vídeo ${videoId}`);
        
        // Mostrar loading
        chatgptButton.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142-.0852 4.783-2.7582a.7712.7712 0 0 0 .7806 0l5.8428 3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 0-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
          </svg>
          <span>Carregando...</span>
        `;
        chatgptButton.style.opacity = '0.7';
        
        try {
          console.log(`[YouTube] Extraindo transcrição para vídeo ${videoId}...`);
          const transcription = await getVideoTranscription(videoId);
          if (!transcription) {
            alert("Não foi possível obter a transcrição deste vídeo.");
            return;
          }
          

          
          console.log(`[YouTube] Transcrição extraída com sucesso! Tamanho: ${transcription.length} caracteres`);
          console.log(`[YouTube] Salvando transcrição no chrome.storage...`);
          
          // Salvar transcrição no chrome.storage (funciona entre domínios)
          const transcriptionData = {
            text: transcription,
            timestamp: Date.now(),
            videoId: videoId
          };
          
          chrome.storage.local.set({ 'youtubeTranscription': transcriptionData }, () => {
            if (chrome.runtime.lastError) {
              console.error(`[YouTube] ❌ Erro ao salvar transcrição:`, chrome.runtime.lastError);
            } else {
              console.log(`[YouTube] ✅ Transcrição salva com sucesso no chrome.storage!`);
              console.log(`[YouTube] Timestamp: ${new Date(transcriptionData.timestamp).toLocaleString()}`);
              console.log(`[YouTube] Tamanho salvo: ${transcription.length} caracteres`);
              console.log(`[YouTube] Video ID: ${videoId}`);
            }
          });
          
          console.log(`[YouTube] Abrindo ChatGPT em nova aba...`);
          // Redirecionar para o ChatGPT
          window.open('https://chatgpt.com/?model=auto', '_blank');
          
        } catch (error) {
          console.error('[YouTube] Erro ao processar transcrição para ChatGPT:', error);
          alert('Erro ao processar transcrição: ' + error.message);
        } finally {
          // Restaurar botão
          chatgptButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142-.0852 4.783-2.7582a.7712.7712 0 0 0 .7806 0l5.8428 3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 0-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
            </svg>
          `;
          chatgptButton.style.opacity = '1';
        }
      });
    } catch (error) {
      console.error(`[YouTube] Erro ao adicionar botões ao contêiner ${index}:`, error);
    }
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
  console.log("[YouTube] Adicionando estilos CSS...");
  const styles = document.createElement("style");
  styles.textContent = `
    #thumbnail {
      position: relative;
    }

    .summary-icon-container {
      position: absolute;
      background-color: rgba(0, 0, 0, 0.7);
      border-radius: 4px;
      padding: 4px;
      cursor: pointer;
      z-index: 10;
      transition: transform 0.2s;
    }

    .summary-icon-container.top {
      top: 8px;
      left: 8px;
    }

    .summary-icon-container:hover {
      transform: scale(1.1);
      background-color: rgba(0, 0, 0, 0.9);
    }

    .summary-icon {
      display: block;
      width: 20px;
      height: 20px;
    }

    /* Estilos para o botão no contêiner do vídeo */
    ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, .yt-lockup-view-model-wiz {
      position: relative !important;
    }

    .ai-summary-buttons-container {
      position: absolute;
      bottom: -28px;
      left: 10px;
      display: flex;
      gap: 8px;
      z-index: 9999;
    }

    .ai-summary-video-container-button {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      background-color: #4285f4;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      transition: transform 0.2s, background-color 0.2s;
      z-index: 9999;
      pointer-events: auto;
    }

    .ai-summary-video-container-button.chatgpt {
      background-color: #10a37f;
    }

    .ai-summary-video-container-button.chatgpt:hover {
      background-color: #0d8a6f;
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
  `;
  document.head.appendChild(styles);
  console.log("[YouTube] Estilos CSS adicionados com sucesso");
} catch (error) {
  console.error("[YouTube] Erro ao adicionar estilos CSS:", error);
}

// Executar a função addSummaryIcons mais vezes para garantir que os elementos sejam capturados
console.log("[YouTube] Inicializando observers e timers...");

// Verificar se estamos no ChatGPT e processar integração
if (window.location.hostname.includes('chatgpt.com')) {
  console.log("[ChatGPT] Detectado ChatGPT, verificando integração...");
  handleChatGPTIntegration();
  
  // Observer para mudanças de URL no ChatGPT (SPA)
  let lastUrl = location.href;
  const chatGPTObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log("[ChatGPT] URL mudou, verificando integração novamente...");
      setTimeout(handleChatGPTIntegration, 1000);
    }
  });
  
  chatGPTObserver.observe(document, { subtree: true, childList: true });
}

// Verificar se estamos no ChatGPT e processar integração
if (window.location.hostname.includes('chatgpt.com')) {
  console.log("[ChatGPT] Detectado ChatGPT, verificando integração...");
  handleChatGPTIntegration();
  
  // Observer para mudanças de URL no ChatGPT (SPA)
  let lastUrl = location.href;
  const chatGPTObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log("[ChatGPT] URL mudou, verificando integração novamente...");
      setTimeout(handleChatGPTIntegration, 1000);
    }
  });
  
  chatGPTObserver.observe(document, { subtree: true, childList: true });
}

// Configurar observador
let observerTimeout;
const observer = new MutationObserver(() => {
  clearTimeout(observerTimeout);
  observerTimeout = setTimeout(() => {
    console.log("[YouTube] Mudanças detectadas no DOM, executando addSummaryIcons...");
    addSummaryIcons();
  }, 1000);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Verificações adicionais em intervalos diferentes
setTimeout(() => {
  console.log("[YouTube] Executando addSummaryIcons após 2 segundos...");
  addSummaryIcons();
}, 2000);

setTimeout(() => {
  console.log("[YouTube] Executando addSummaryIcons após 5 segundos...");
  addSummaryIcons();
}, 5000);

// Executar imediatamente para a página atual
console.log("[YouTube] Executando addSummaryIcons imediatamente...");
addSummaryIcons();

// Funcionalidade removida - agora usando menu lateral integrado com Gemini API



// Função para manipular diretamente o ChatGPT
function handleChatGPTIntegration() {
  // Verificar se estamos no ChatGPT
  if (!window.location.hostname.includes('chatgpt.com')) {
    return;
  }
  
  console.log('[ChatGPT] 🚀 Detectado ChatGPT, verificando transcrição...');
  
  // Teste de acesso ao chrome.storage
  console.log('[ChatGPT] 🔧 Testando acesso ao chrome.storage...');
  if (typeof chrome !== 'undefined' && chrome.storage) {
    console.log('[ChatGPT] ✅ chrome.storage disponível');
  } else {
    console.error('[ChatGPT] ❌ chrome.storage não disponível');
    return;
  }
  
  // Verificar se há transcrição salva no chrome.storage
  console.log('[ChatGPT] 📋 Verificando chrome.storage...');
  chrome.storage.local.get(['youtubeTranscription'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('[ChatGPT] ❌ Erro ao acessar chrome.storage:', chrome.runtime.lastError);
      return;
    }
    
    const transcriptionData = result.youtubeTranscription;
    
    console.log('[ChatGPT] Transcrição encontrada:', transcriptionData ? '✅ SIM' : '❌ NÃO');
    
    if (!transcriptionData) {
      console.log('[ChatGPT] ❌ Nenhuma transcrição válida encontrada no chrome.storage');
      return;
    }
    
    console.log(`[ChatGPT] 📊 Transcrição recuperada! Tamanho: ${transcriptionData.text.length} caracteres`);
    console.log(`[ChatGPT] ⏰ Timestamp: ${new Date(transcriptionData.timestamp).toLocaleString()}`);
    console.log(`[ChatGPT] 🎥 Video ID: ${transcriptionData.videoId}`);
    
    // Verificar se a transcrição é recente (últimos 5 minutos)
    const now = Date.now();
    const timeDiff = now - transcriptionData.timestamp;
    const timeDiffMinutes = Math.floor(timeDiff / (1000 * 60));
    
    console.log(`[ChatGPT] ⏱️ Tempo decorrido: ${timeDiffMinutes} minutos`);
    
    if (timeDiff > 5 * 60 * 1000) {
      console.log('[ChatGPT] ⏰ Transcrição expirada (mais de 5 minutos), removendo...');
      chrome.storage.local.remove(['youtubeTranscription'], () => {
        console.log('[ChatGPT] 🧹 Transcrição expirada removida do chrome.storage');
      });
      return;
    }
    
    console.log('[ChatGPT] ✅ Transcrição válida! Iniciando processamento...');
    
    // Função para encontrar e preencher o campo de texto
    function fillChatGPTTextArea() {
      console.log('[ChatGPT] 🔍 Procurando campo de texto...');
      
      // Tentar diferentes seletores para o campo de texto
      const selectors = [
        '#prompt-textarea',
        'textarea[name="prompt-textarea"]',
        '.ProseMirror[contenteditable="true"]',
        '[data-id="root"] textarea',
        '[data-id="root"] [contenteditable="true"]',
        'div[contenteditable="true"]',
        'textarea'
      ];
      
      let textArea = null;
      
      for (const selector of selectors) {
        textArea = document.querySelector(selector);
        if (textArea) {
          console.log(`[ChatGPT] ✅ Campo de texto encontrado usando: ${selector}`);
          break;
        }
      }
      
      if (!textArea) {
        console.log('[ChatGPT] ⏳ Campo de texto não encontrado, tentando novamente em 1 segundo...');
        setTimeout(fillChatGPTTextArea, 1000);
        return;
      }
      
      console.log('[ChatGPT] 🧹 Limpando campo de texto...');
      
      // Limpar o campo
      if (textArea.tagName === 'TEXTAREA') {
        textArea.value = '';
        textArea.focus();
      } else if (textArea.contentEditable === 'true') {
        textArea.innerHTML = '';
        textArea.focus();
      }
      
      console.log('[ChatGPT] 📝 Inserindo transcrição no campo...');
      
      // Inserir a transcrição
      const prompt = `Resuma pra mim
Transcrição do vídeo:

${transcriptionData.text}

Por favor, estruture o resumo de forma clara e organizada.`;
      
      if (textArea.tagName === 'TEXTAREA') {
        textArea.value = prompt;
        // Disparar evento de input
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[ChatGPT] ✅ Texto inserido em textarea');
      } else if (textArea.contentEditable === 'true') {
        textArea.innerHTML = '<p>' + prompt.replace(/\n/g, '</p><p>') + '</p>';
        // Disparar evento de input
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[ChatGPT] ✅ Texto inserido em contenteditable');
      }
      
      console.log('[ChatGPT] ⏳ Aguardando 500ms para pressionar Enter...');
      
      // Aguardar um pouco e pressionar Enter
      setTimeout(() => {
        console.log('[ChatGPT] ⌨️ Simulando pressionar Enter...');
        
        // Simular pressionar Enter
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        
        textArea.dispatchEvent(enterEvent);
        
        // Limpar a transcrição do chrome.storage após usar
        chrome.storage.local.remove(['youtubeTranscription'], () => {
          console.log('[ChatGPT] 🧹 Transcrição removida do chrome.storage');
        });
        
        console.log('[ChatGPT] 🎉 Transcrição inserida e enviada com sucesso!');
      }, 500);
    }
    
    console.log('[ChatGPT] ⏳ Aguardando 2 segundos para página carregar completamente...');
    
    // Aguardar um pouco para a página carregar completamente
    setTimeout(fillChatGPTTextArea, 2000);
  });
}

