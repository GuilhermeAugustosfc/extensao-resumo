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
        const formattedTranscription =
          "Resuma o conteúdo a seguir em 5 a 10 tópicos , se for uma transcrição. in Portuguese (Brazil): " +
          transcription;

        console.log(
          "[YouTube] Salvando transcrição no storage:",
          formattedTranscription.substring(0, 100) + "..."
        );
        
        if (isSecondIcon) {
          // Para o segundo ícone, abrir o Google AI Studio
          chrome.storage.local.set(
            { pendingTranscript: formattedTranscription },
            () => {
              console.log("[YouTube] Transcrição salva, abrindo Google AI Studio...");
              window.open("https://aistudio.google.com/prompts/new_chat", "_blank");
            }
          );
        } else {
          // Para o primeiro ícone, manter o comportamento original
          chrome.storage.local.set(
            { pendingTranscript: formattedTranscription },
            () => {
              console.log("[YouTube] Transcrição salva, abrindo Deepseek...");
              window.open("https://chat.deepseek.com/", "_blank");
            }
          );
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

// Função para processar contêineres de vídeo e adicionar botões Deepseek
function processVideoContainers() {
  console.log("[YouTube] Procurando contêineres de vídeo para adicionar botões Deepseek...");

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
    ".yt-lockup-view-model-wiz:not(.deepseek-button-added)"
  );
  
  processContainers(videoModelContainers, ".yt-lockup-view-model-wiz__content-image");

  // Segunda tentativa: Procurar por vídeos com ytd-rich-item-renderer
  const richItemContainers = document.querySelectorAll(
    "ytd-rich-item-renderer:not(.deepseek-button-added)"
  );
  
  processContainers(richItemContainers, "a[href^='/watch?v=']");
}

// Função auxiliar para processar contêineres com um seletor específico de thumbnail
function processContainers(containers, thumbnailSelector) {
  console.log(`[YouTube] Processando ${containers.length} contêineres com seletor de thumbnail "${thumbnailSelector}"`);
  
  containers.forEach((container, index) => {
    try {
      
      // Verificar se já tem o botão
      if (container.querySelector(".deepseek-video-container-button")) {
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

      // Criar botão Deepseek para o contêiner do vídeo
      const deepseekButton = document.createElement("div");
      deepseekButton.className = "deepseek-video-container-button";
      deepseekButton.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
        </svg>
        <span>Deepseek</span>
      `;

      // Adicionar o botão como filho direto do contêiner do vídeo
      container.appendChild(deepseekButton);
      container.classList.add("deepseek-button-added");
      console.log(`[YouTube] Botão Deepseek adicionado ao contêiner ${index}`);

      // Evento para o botão Deepseek usando o ID do vídeo diretamente
      deepseekButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`[YouTube] Botão Deepseek clicado para vídeo ${videoId}`);
        const transcription = await getVideoTranscription(videoId);
        if (transcription) {
          const formattedTranscription =
            "Resuma o conteúdo a seguir em 5 a 10 tópicos com registro de data e hora, se for uma transcrição. in Portuguese (Brazil): " +
            transcription;

          console.log(
            "[YouTube] Salvando transcrição no storage:",
            formattedTranscription.substring(0, 100) + "..."
          );
          
          // Para o botão do contêiner, abrir o Deepseek
          chrome.storage.local.set(
            { pendingTranscript: formattedTranscription },
            () => {
              console.log("[YouTube] Transcrição salva, abrindo Deepseek...");
              window.open("https://chat.deepseek.com/", "_blank");
            }
          );
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

    .deepseek-video-container-button {
      position: absolute;
      bottom: -28px; /* Ajuste este valor conforme necessário */
      left: 10px;
      display: flex;
      align-items: center;
      padding: 6px 10px;
      background-color: #065fd4;
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

    .deepseek-video-container-button svg {
      margin-right: 4px;
    }

    .deepseek-video-container-button:hover {
      background-color: #0056b3;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
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

// Função para verificar se estamos no Deepseek
function isDeepseekPage() {
  const isDeeepseek = window.location.hostname.includes("deepseek.com");
  console.log("[Deepseek] Verificando se é página Deepseek:", isDeeepseek);
  return isDeeepseek;
}

// Função para inserir a transcrição no Deepseek
function handleDeepseekPage() {
  console.log("[Deepseek] Iniciando handleDeepseekPage");
  if (!isDeepseekPage()) {
    console.log("[Deepseek] Não estamos no Deepseek, retornando...");
    return;
  }

  console.log("[Deepseek] Aguardando carregamento da página...");
  // Esperar um pouco para garantir que a página carregou
  setTimeout(() => {
    console.log("[Deepseek] Tentando recuperar transcrição do storage...");
    chrome.storage.local.get(["pendingTranscript"], function (result) {
      console.log("[Deepseek] Resultado do storage:", result);
      if (result.pendingTranscript) {
        console.log(
          "[Deepseek] Transcrição encontrada, procurando textarea..."
        );
        const textarea = document.querySelector("#chat-input");
        console.log("[Deepseek] Textarea encontrado:", textarea);

        if (textarea) {
          console.log("[Deepseek] Inserindo texto no textarea...");
          textarea.value = result.pendingTranscript;

          // Disparar evento de input para notificar mudanças
          console.log("[Deepseek] Disparando evento de input...");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));

          // Aguardar um momento antes de clicar no botão de modelo e enviar
          setTimeout(() => {
            console.log("[Deepseek] Procurando botão de modelo...");
            const modelButton = document.querySelector(
              "#root > div > div.c3ecdb44 > div.f2eea526 > div > div.b83ee326 > div > div > div.cbcaa82c > div.aaff8b8f > div > div > div.ec4f5d61 > div:nth-child(1)"
            );

            if (modelButton) {
              console.log("[Deepseek] Clicando no botão de modelo...");
              modelButton.click();

              // Aguardar mais um momento antes de simular o Enter
            } else {
              console.log("[Deepseek] ERRO: Botão de modelo não encontrado!");
            }
          }, 1000); // Aguarda 1 segundo antes de clicar no botão de modelo

          setTimeout(() => {
            console.log("[Deepseek] Simulando pressionar Enter...");
            textarea.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
              })
            );

            // Limpar o storage após usar
            console.log("[Deepseek] Limpando storage...");
            chrome.storage.local.remove("pendingTranscript");
          }, 1000); // Aguarda 1 segundo antes de pressionar Enter
        } else {
          console.log("[Deepseek] ERRO: Textarea não encontrado!");
        }
      } else {
        console.log(
          "[Deepseek] Nenhuma transcrição pendente encontrada no storage"
        );
      }
    });
  }, 2000);
}

// Inicializar a funcionalidade do Deepseek
console.log("[Deepseek] Inicializando script...");
handleDeepseekPage();

// Função para verificar se estamos no Google AI Studio
function isGoogleAIStudioPage() {
  return window.location.hostname.includes("aistudio.google.com");
}

// Função para inserir a transcrição no Google AI Studio
function handleGoogleAIStudioPage() {
  console.log("[Google AI Studio] Iniciando handleGoogleAIStudioPage");
  if (!isGoogleAIStudioPage()) {
    console.log("[Google AI Studio] Não estamos no Google AI Studio, retornando...");
    return;
  }

  console.log("[Google AI Studio] Aguardando carregamento da página...");
  setTimeout(() => {
    console.log("[Google AI Studio] Tentando recuperar transcrição do storage...");
    chrome.storage.local.get(["pendingTranscript"], function (result) {
      console.log("[Google AI Studio] Resultado do storage:", result);
      if (result.pendingTranscript) {
        console.log("[Google AI Studio] Transcrição encontrada, procurando textarea...");
        const textarea = document.querySelector(
          "body > app-root > div > div div > span > ms-prompt-switcher > ms-chunk-editor > section > footer > div.input-wrapper > div.text-wrapper > ms-chunk-input > section > ms-text-chunk > ms-autosize-textarea > textarea"
        );
        console.log("[Google AI Studio] Textarea encontrado:", textarea);

        if (textarea) {
          console.log("[Google AI Studio] Inserindo texto no textarea...");
          textarea.value = result.pendingTranscript;

          // Disparar evento de input para notificar mudanças
          console.log("[Google AI Studio] Disparando evento de input...");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));

          // Aguardar um momento antes de clicar no botão de enviar
          setTimeout(() => {
            console.log("[Google AI Studio] Procurando botão de enviar...");
            const sendButton = document.querySelector(
              "body > app-root > div > div div > span > ms-prompt-switcher > ms-chunk-editor > section > footer > div.input-wrapper > div:nth-child(3) > run-button > button"
            );

            if (sendButton) {
              console.log("[Google AI Studio] Clicando no botão de enviar...");
              sendButton.click();

              // Limpar o storage após usar
              console.log("[Google AI Studio] Limpando storage...");
              chrome.storage.local.remove("pendingTranscript");
            } else {
              console.log("[Google AI Studio] ERRO: Botão de enviar não encontrado!");
            }
          }, 1000); // Aguarda 1 segundo antes de clicar no botão
        } else {
          console.log("[Google AI Studio] ERRO: Textarea não encontrado!");
        }
      } else {
        console.log("[Google AI Studio] Nenhuma transcrição pendente encontrada no storage");
      }
    });
  }, 2000);
}

// Inicializar a funcionalidade do Google AI Studio
console.log("[Google AI Studio] Inicializando script...");
handleGoogleAIStudioPage();

