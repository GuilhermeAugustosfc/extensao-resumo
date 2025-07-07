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
  
  return menu;
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
      
      // Verificar se já tem o botão
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

      // Criar botão Resumo AI para o contêiner do vídeo
      const aiSummaryButton = document.createElement("div");
      aiSummaryButton.className = "ai-summary-video-container-button";
      aiSummaryButton.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
        </svg>
        <span>Resumo AI</span>
      `;

      // Adicionar o botão como filho direto do contêiner do vídeo
      container.appendChild(aiSummaryButton);
      container.classList.add("ai-summary-button-added");
      console.log(`[YouTube] Botão Resumo AI adicionado ao contêiner ${index}`);

      // Evento para o botão Resumo AI usando o ID do vídeo diretamente
      aiSummaryButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`[YouTube] Botão Resumo AI clicado para vídeo ${videoId}`);
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
      });
    } catch (error) {
      console.error(`[YouTube] Erro ao adicionar botão Deepseek ao contêiner ${index}:`, error);
    }
  });
}

// Adicionar estilos CSS
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

    .ai-summary-video-container-button {
      position: absolute;
      bottom: -28px; /* Ajuste este valor conforme necessário */
      left: 10px;
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
      background-color: rgba(0, 0, 0, 0.5);
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
      width: 75%;
      height: 100%;
      background-color: #1a1a1a;
      color: white;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3);
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
  `;
  document.head.appendChild(styles);
  console.log("[YouTube] Estilos CSS adicionados com sucesso");
} catch (error) {
  console.error("[YouTube] Erro ao adicionar estilos CSS:", error);
}

// Executar a função addSummaryIcons mais vezes para garantir que os elementos sejam capturados
console.log("[YouTube] Inicializando observers e timers...");

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

