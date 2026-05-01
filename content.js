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
const GEMINI_API_KEY = 'AIzaSyCcTCBbpj8Dllf8fmhPngaG7PQbTJoTqck';
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
      
      // Verificar se já tem os botões
      if (container.querySelector(".ai-summary-video-container-button")) {
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

      // Criar botão Claude
      const claudeButton = document.createElement("div");
      claudeButton.className = "ai-summary-video-container-button claude";
      claudeButton.title = "Resumo com Claude";
      claudeButton.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C14.8 4 17.2 5.4 18.7 7.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <span>Claude</span>
      `;

      // Adicionar botões ao container
      buttonsContainer.appendChild(aiSummaryButton);
      buttonsContainer.appendChild(chatgptButton);
      buttonsContainer.appendChild(claudeButton);

      // Adicionar o container como filho direto do contêiner do vídeo
      container.appendChild(buttonsContainer);
      container.classList.add("ai-summary-button-added");

      // Evento para o botão Resumo AI usando o ID do vídeo diretamente
      aiSummaryButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Mostrar popup de seleção de preset
        showPresetSelector(videoId, 'gemini');
      });

      // Evento para o botão Resumo ChatGPT
      chatgptButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Mostrar popup de seleção de preset
        showPresetSelector(videoId, 'chatgpt');
      });

      // Evento para o botão Claude
      claudeButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Mostrar popup de seleção de preset
        showPresetSelector(videoId, 'claude');
      });
    } catch (error) {
    }
  });
}

// (Função processSpecificContentContainers removida)

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
    description: 'Formato para revisão',
    prompt: `Crie NOTAS DE ESTUDO com linguagem simples do seguinte vídeo em português do Brasil.

Formato de material de revisão:
- Título e tema principal
- Conceitos-chave: definições claras
- Fatos importantes: dados, números, nomes
- Fórmulas/processos (se aplicável)
- Exemplos práticos
- Perguntas para revisão (3-5)
- Resumo em bullet points

Use markdown com formatação clara para facilitar revisão rápida.

Transcrição do vídeo:

[TRANSCRIPTION]`
  }
};

// Função para mostrar o seletor de presets
function showPresetSelector(videoId, platform) {
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
      await processWithPreset(videoId, presetKey, platform);
    });
  });
}

// Função para processar com o preset selecionado
async function processWithPreset(videoId, presetKey, platform) {
  const preset = PROMPT_PRESETS[presetKey];
  
  // Mostrar loading
  console.log(`Processando com preset: ${preset.name}`);
  
  try {
    const transcription = await getVideoTranscription(videoId);
    if (!transcription) {
      showToast("❌ Não foi possível obter a transcrição.");
      return;
    }
    
    // Substituir placeholder pela transcrição
    const fullPrompt = preset.prompt.replace('[TRANSCRIPTION]', transcription);
    
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
    
    // Redirecionar para a plataforma escolhida
    if (platform === 'gemini') {
      window.open('https://gemini.google.com/app', '_blank');
    } else if (platform === 'chatgpt') {
      window.open('https://chatgpt.com/?model=auto', '_blank');
    } else if (platform === 'claude') {
      window.open('https://claude.ai/new', '_blank');
    }
    
  } catch (error) {
    showToast('❌ Erro: ' + error.message);
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
      const fullPrompt = preset.prompt.replace('[TRANSCRIPTION]', transcriptWithTs);

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

    .ai-summary-video-container-button.claude {
      background-color: #cc785c;
    }

    .ai-summary-video-container-button.claude:hover {
      background-color: #b5643a !important;
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

    /* ===== BOTÃO FLUTUANTE DE PROMPT PERSONALIZADO ===== */
    #yt-custom-prompt-fab {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #065fd4 0%, #4285f4 100%);
      color: white;
      border: none;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 4px 16px rgba(6, 95, 212, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      font-size: 22px;
      line-height: 1;
    }

    #yt-custom-prompt-fab:hover {
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 8px 24px rgba(6, 95, 212, 0.6);
    }

    #yt-custom-prompt-fab:active {
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

// ===== BOTÃO FLUTUANTE DE PROMPT PERSONALIZADO =====

/**
 * Cria e injeta o botão flutuante (FAB) de prompt personalizado.
 * Só é criado em páginas do YouTube.
 */
function createCustomPromptFAB() {
  if (!isYouTubePage()) return;
  if (document.getElementById('yt-custom-prompt-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'yt-custom-prompt-fab';
  fab.title = 'Enviar prompt personalizado para IA';
  fab.setAttribute('aria-label', 'Abrir prompt personalizado');
  fab.innerHTML = `
    <span class="yt-fab-sphere">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Esfera base -->
        <circle cx="14" cy="14" r="12" fill="url(#sphereGrad)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
        <!-- Meridianos verticais -->
        <ellipse cx="14" cy="14" rx="5" ry="12" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
        <ellipse cx="14" cy="14" rx="10" ry="12" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.8"/>
        <!-- Paralelos horizontais -->
        <ellipse cx="14" cy="14" rx="12" ry="4" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1"/>
        <ellipse cx="14" cy="9" rx="10" ry="2.5" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
        <ellipse cx="14" cy="19" rx="10" ry="2.5" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
        <!-- Brilho -->
        <ellipse cx="10" cy="9" rx="3" ry="2" fill="rgba(255,255,255,0.25)" transform="rotate(-20 10 9)"/>
        <!-- Gradiente -->
        <defs>
          <radialGradient id="sphereGrad" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stop-color="rgba(255,255,255,0.4)"/>
            <stop offset="40%" stop-color="rgba(66,133,244,0.6)"/>
            <stop offset="100%" stop-color="rgba(4,40,120,0.9)"/>
          </radialGradient>
        </defs>
      </svg>
    </span>
  `;

  fab.addEventListener('click', () => {
    if (typeof smartSubtitleSystem !== 'undefined') {
      smartSubtitleSystem.openGeminiIframePanel(null);
    }
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
          <option value="claude">🟠 Claude</option>
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
        // Fluxo Integrado via Iframe
        if (typeof smartSubtitleSystem !== 'undefined') {
          smartSubtitleSystem.copyToClipboard(userPrompt);
          smartSubtitleSystem.openGeminiIframePanel(null); // null pois não é vinculado a um vídeo específico para cache de legenda
          smartSubtitleSystem.updateOverlayStatus("Prompt copiado! Cole no Gemini abaixo.", true);
        } else {
          // Fallback se o sistema de legendas não estiver disponível por algum motivo
          window.open('https://gemini.google.com/app', '_blank');
        }
      } else if (platform === 'chatgpt') {
        window.open('https://chatgpt.com/?model=auto', '_blank');
      } else if (platform === 'claude') {
        window.open('https://claude.ai/new', '_blank');
      }
    });
  } else {
    // Fallback sem chrome.storage
    closeCustomPromptPopup();
    if (platform === 'gemini') {
      if (typeof smartSubtitleSystem !== 'undefined') {
        smartSubtitleSystem.copyToClipboard(userPrompt);
        smartSubtitleSystem.openGeminiIframePanel(null);
      } else {
        window.open('https://gemini.google.com/app', '_blank');
      }
    } else if (platform === 'chatgpt') {
      window.open('https://chatgpt.com/?model=auto', '_blank');
    } else if (platform === 'claude') {
      window.open('https://claude.ai/new', '_blank');
    }
  }
}

// ===== BOTÃO FLUTUANTE CLAUDE =====

/**
 * Cria e injeta o botão flutuante (FAB) do Claude.
 * Fica posicionado acima do FAB do Gemini.
 */
function createClaudeFAB() {
  if (!isYouTubePage()) return;
  if (document.getElementById('yt-claude-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'yt-claude-fab';
  fab.title = 'Abrir Claude AI';
  fab.setAttribute('aria-label', 'Abrir Claude AI');
  fab.innerHTML = `
    <span class="yt-claude-fab-icon">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-1.907-.061L0 12.571l.085-.327 1.992-.388 2.365-.291 2.428-.266 1.16-.121-.899-.243L4.2 10.6l-2.222-.8-1.893-.735L0 8.856l.522-.909 2.122.04 1.614.245 2.043.375 1.613.39-.655-1.054-1.398-2.391-1.084-1.993-.552-1.219.881-.613 1.646 1.568 1.212 1.394 1.539 1.848.866 1.087.107-.582-.276-1.752-.375-2.394-.25-1.682-.012-1.125.855-.135 1.6 1.012 1.372.857 1.712 1.118 1.103.785.097-.048-.157-.485-.662-2.017-.448-1.608L11.366 0l1.008.012.973 2.142.557 1.935.49 1.828.146.662V6.8l.267-.388 1.134-1.848.935-1.394.923-1.12.649-.856.78.388-.036 1.706-.522 1.527-.862 1.588-.606 1.136.036.048.291-.194 1.575-1.015 1.87-1.123 1.697-.71 1.064-.401.58.725.267-.316 1.49-.985 1.697-1.185 2.01-.734 1.442-.17.62.267-.097.376-1.658 1.137-1.964.913-2.015.638-.662.134.158.448.649 1.49.546 1.81.316 1.997.097 1.188.085.025-.061.037-.765-.012-.776-.194-2.27-.146-1.5.024-.834.134.048.17.255.876 1.49 1.22 1.9.986 1.478.629 1.31.158-.012.096-.619-.28-.861-.949-1.733-.583-1.197.049-.085.218.097 1.648 1.197 2.15 1.36 1.709.983 1.067.504.133-.46-.606-.655-1.661-1.73-1.344-1.562.073-.121.194-.048 1.783.85 2.391 1.312 1.818 1.027 1.198.565.388.073.025-.073.024-.413-.655-.51-1.625-1.26-1.733-1.09.012-.085.146-.024 1.43.387 2.55.814 1.77.583 1.065.134.98-.231.085-.51-.474-.376-1.187-.85-1.49-.46-.255-.096-.036-.17.17-.024.994.096 1.783.218 1.466.243.28-.012.255-.085.219-.255-.558-.558-1.028-.47-.875-.316-.109-.206.109-.157 1.199-.097.899-.012.206-.133.182-.255-.34-.376-.85-.607-.472-.23L24 11.3l-.642-.691-1.905-1.745-1.709-1.417-1.296-.923-1.503-.996-.024-.17.851-.255 1.964.474 1.55.584 1.78.79 1.174.606-.024-.206-.996-1.406-1.02-1.381-.85-1.224-.218-.5.425-.34 1.66.619 1.612.961 1.684 1.209 1.55 1.187.048-.133-.461-1.417-.632-2.003-.485-1.782.024-.121.607.012.936 1.49.838 1.563.68 1.587.461 1.3.17.4.04-.04-.025-1.28.025-1.38.097-1.418.194-1.124.183-.46.62.194.376 1.393.17 1.587-.012 1.938v1.21l.182-.17.996-1.357.948-1.333 1.003-1.38.716-1.002.558.073.134.716-.474 1.587-.68 1.648-.777 1.647-.424.935.012.049.632-.34 1.515-.935 1.55-.96 1.43-.84.886-.413.327.547.012.291-.74.79-1.647.85-1.611.703-1.346.34-.96.097.012.157.183-.012.9-1.12.923-1.296.947-1.527.704-1.393.34-.924.364.036-.024.742-.632 1.479-.607 1.587-.413 1.527-.133 1.08v.27l.42-.012.292-.34.4-.668.534-.863.59-.911.669-.984.205.085.194.522-.097 1.09-.267 1.21-.34.985-.267.655.024.048.218-.097.79-.79.85-.984.813-1.176.716-1.308.413-1.224.097-.935-.073-.292-.364.194-.12.704.024 1.28.012 1.004.048.91-.05.693.025.158-.255.024-.376-.244-.485-.34-.46-.255-.352.025-.255.244.146.558.437 1.028.352.9.17.631-.01.34-.304.572-.34.254-.35.085-.619-.107-.98-.473-1.054-.754-.52-.607-.219-.52.048-.194.34-.13.766.302 1.09.619 1.05.57.46.25.133 0 .025-.036-.182-.46-.437-.668-.182-.401.048-.206.243-.109.474.061.79.461 1.162.45.607.13.376-.219.292-.8.097-.314-.12-.547-.449-.912-.619-.692-.402-.328.062-.243.285-.024.473.376.79.485.534.174.353-.012.316-.34.255-.825.097-.655-.182-.61-.535-.67-.68-.303-.62.062-.243.34-.036.34.304.729.461.547.255.255.073.17-.243.121-.655.097-1.575-.194-1.12-.388-.935-.509-.79-.498-.51.061-.181.437-.025.85.352.923.462.644.194.292.073.17-.267.085-.716.024-.984"/>
      </svg>
    </span>
  `;

  fab.addEventListener('click', () => {
    window.open('https://claude.ai/new', '_blank');
  });

  document.body.appendChild(fab);
}

/**
 * Abre o painel lateral com iframe do Claude.
 */
function openClaudeIframePanel() {
  // Remover painel Claude se já existir (toggle)
  const existing = document.getElementById('yt-claude-iframe-panel');
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'yt-claude-iframe-panel';
  panel.className = 'yt-claude-iframe-panel';

  panel.innerHTML = `
    <div class="yt-claude-panel-header">
      <div class="yt-claude-panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#cc785c" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-1.907-.061L0 12.571l.085-.327 1.992-.388 2.365-.291 2.428-.266 1.16-.121-.899-.243L4.2 10.6l-2.222-.8-1.893-.735L0 8.856l.522-.909 2.122.04 1.614.245 2.043.375 1.613.39-.655-1.054-1.398-2.391-1.084-1.993-.552-1.219.881-.613 1.646 1.568 1.212 1.394 1.539 1.848.866 1.087.107-.582-.276-1.752-.375-2.394-.25-1.682-.012-1.125.855-.135 1.6 1.012 1.372.857 1.712 1.118 1.103.785.097-.048-.157-.485-.662-2.017-.448-1.608L11.366 0l1.008.012.973 2.142.557 1.935.49 1.828.146.662V6.8l.267-.388 1.134-1.848.935-1.394.923-1.12.649-.856.78.388-.036 1.706-.522 1.527-.862 1.588-.606 1.136.036.048.291-.194 1.575-1.015 1.87-1.123 1.697-.71 1.064-.401.58.725.267-.316 1.49-.985 1.697-1.185 2.01-.734 1.442-.17.62.267-.097.376-1.658 1.137-1.964.913-2.015.638-.662.134.158.448.649 1.49.546 1.81.316 1.997.097 1.188.085.025-.061.037-.765-.012-.776-.194-2.27-.146-1.5.024-.834.134.048.17.255.876 1.49 1.22 1.9.986 1.478.629 1.31.158-.012.096-.619-.28-.861-.949-1.733-.583-1.197.049-.085.218.097 1.648 1.197 2.15 1.36 1.709.983 1.067.504.133-.46-.606-.655-1.661-1.73-1.344-1.562.073-.121.194-.048 1.783.85 2.391 1.312 1.818 1.027 1.198.565.388.073.025-.073.024-.413-.655-.51-1.625-1.26-1.733-1.09.012-.085.146-.024 1.43.387 2.55.814 1.77.583 1.065.134.98-.231.085-.51-.474-.376-1.187-.85-1.49-.46-.255-.096-.036-.17.17-.024.994.096 1.783.218 1.466.243.28-.012.255-.085.219-.255-.558-.558-1.028-.47-.875-.316-.109-.206.109-.157 1.199-.097.899-.012.206-.133.182-.255-.34-.376-.85-.607-.472-.23L24 11.3l-.642-.691-1.905-1.745-1.709-1.417-1.296-.923-1.503-.996-.024-.17.851-.255 1.964.474 1.55.584 1.78.79 1.174.606-.024-.206-.996-1.406-1.02-1.381-.85-1.224-.218-.5.425-.34 1.66.619 1.612.961 1.684 1.209 1.55 1.187.048-.133-.461-1.417-.632-2.003-.485-1.782.024-.121.607.012.936 1.49.838 1.563.68 1.587.461 1.3.17.4.04-.04-.025-1.28.025-1.38.097-1.418.194-1.124.183-.46.62.194.376 1.393.17 1.587-.012 1.938v1.21l.182-.17.996-1.357.948-1.333 1.003-1.38.716-1.002.558.073.134.716-.474 1.587-.68 1.648-.777 1.647-.424.935.012.049.632-.34 1.515-.935 1.55-.96 1.43-.84.886-.413.327.547.012.291-.74.79-1.647.85-1.611.703-1.346.34-.96.097.012.157.183-.012.9-1.12.923-1.296.947-1.527.704-1.393.34-.924.364.036-.024.742-.632 1.479-.607 1.587-.413 1.527-.133 1.08v.27l.42-.012.292-.34.4-.668.534-.863.59-.911.669-.984.205.085.194.522-.097 1.09-.267 1.21-.34.985-.267.655.024.048.218-.097.79-.79.85-.984.813-1.176.716-1.308.413-1.224.097-.935-.073-.292-.364.194-.12.704.024 1.28.012 1.004.048.91-.05.693.025.158-.255.024-.376-.244-.485-.34-.46-.255-.352.025-.255.244.146.558.437 1.028.352.9.17.631-.01.34-.304.572-.34.254-.35.085-.619-.107-.98-.473-1.054-.754-.52-.607-.219-.52.048-.194.34-.13.766.302 1.09.619 1.05.57.46.25.133 0 .025-.036-.182-.46-.437-.668-.182-.401.048-.206.243-.109.474.061.79.461 1.162.45.607.13.376-.219.292-.8.097-.314-.12-.547-.449-.912-.619-.692-.402-.328.062-.243.285-.024.473.376.79.485.534.174.353-.012.316-.34.255-.825.097-.655-.182-.61-.535-.67-.68-.303-.62.062-.243.34-.036.34.304.729.461.547.255.255.073.17-.243.121-.655.097-1.575-.194-1.12-.388-.935-.509-.79-.498-.51.061-.181.437-.025.85.352.923.462.644.194.292.073.17-.267.085-.716.024-.984"/>
        </svg>
        <span>Claude AI</span>
      </div>
      <div style="display:flex;gap:5px;">
        <button id="yt-claude-panel-minimize" class="yt-claude-panel-btn" title="Minimizar">_</button>
        <button id="yt-claude-panel-close" class="yt-claude-panel-btn" title="Fechar">×</button>
      </div>
    </div>
    <iframe id="yt-claude-iframe" src="https://claude.ai/new" class="yt-claude-iframe" allow="clipboard-read; clipboard-write"></iframe>
    <div class="yt-claude-resize-handle" id="yt-claude-resize-handle"></div>
  `;

  const container = document.querySelector('#content.ytd-app') || document.querySelector('ytd-app') || document.body;
  container.appendChild(panel);

  // Fechar
  document.getElementById('yt-claude-panel-close').onclick = (e) => {
    e.stopPropagation();
    panel.remove();
  };

  // Minimizar
  const minimizeBtn = document.getElementById('yt-claude-panel-minimize');
  minimizeBtn.onclick = (e) => {
    e.stopPropagation();
    panel.classList.toggle('minimized');
    minimizeBtn.textContent = panel.classList.contains('minimized') ? '▢' : '_';
  };

  // Redimensionamento
  const handle = document.getElementById('yt-claude-resize-handle');
  let isResizing = false;
  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(window.getComputedStyle(panel).width, 10);
    panel.classList.add('resizing');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isResizing) return;
    const diff = startX - e.clientX;
    const newWidth = Math.min(Math.max(startWidth + diff, 320), window.innerWidth * 0.7);
    panel.style.width = newWidth + 'px';
  }

  function onMouseUp() {
    isResizing = false;
    panel.classList.remove('resizing');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
}

// Estilos do FAB Claude e painel iframe Claude
try {
  const claudeStyles = document.createElement('style');
  claudeStyles.textContent = `
    /* ===== FAB CLAUDE ===== */
    #yt-claude-fab {
      position: fixed;
      bottom: 94px;
      right: 28px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #b5643a 0%, #cc785c 100%);
      color: white;
      border: none;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 4px 16px rgba(181, 100, 58, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      font-size: 22px;
      line-height: 1;
    }

    #yt-claude-fab:hover {
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 8px 24px rgba(181, 100, 58, 0.7);
    }

    #yt-claude-fab:active {
      transform: scale(0.95);
    }

    .yt-claude-fab-icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ===== PAINEL IFRAME CLAUDE ===== */
    .yt-claude-iframe-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 550px;
      height: 85vh;
      background: #1e1e1e;
      border: 1px solid #4a3020;
      border-radius: 16px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      box-shadow: 0 15px 50px rgba(0,0,0,0.8);
      overflow: hidden;
      animation: claudePanelSlideIn 0.3s ease-out;
    }

    @keyframes claudePanelSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }

    .yt-claude-iframe-panel.minimized {
      height: 48px !important;
      width: 220px !important;
      overflow: hidden;
    }

    .yt-claude-iframe-panel.minimized .yt-claude-iframe,
    .yt-claude-iframe-panel.minimized .yt-claude-resize-handle {
      display: none;
    }

    .yt-claude-panel-header {
      padding: 12px 16px;
      background: #2a1f18;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #cc785c;
      flex-shrink: 0;
    }

    .yt-claude-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #f0c8a0;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    .yt-claude-panel-btn {
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

    .yt-claude-panel-btn:hover {
      background: rgba(204, 120, 92, 0.2);
      color: #cc785c;
    }

    .yt-claude-iframe {
      flex: 1;
      border: none;
      background: #fff;
    }

    .yt-claude-resize-handle {
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

    .yt-claude-resize-handle:hover {
      background: rgba(204, 120, 92, 0.2);
    }

    .yt-claude-iframe-panel.resizing {
      user-select: none;
    }

    .yt-claude-iframe-panel.resizing .yt-claude-iframe {
      pointer-events: none;
    }
  `;
  document.head.appendChild(claudeStyles);
} catch(e) {}

// Inicializar o FAB Gemini na página do YouTube
if (isYouTubePage()) {
  if (document.body) {
    createCustomPromptFAB();
  } else {
    document.addEventListener('DOMContentLoaded', createCustomPromptFAB);
  }
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(createCustomPromptFAB, 500);
  });
}

// Inicializar o FAB Claude na página do YouTube
if (isYouTubePage()) {
  if (document.body) {
    createClaudeFAB();
  } else {
    document.addEventListener('DOMContentLoaded', createClaudeFAB);
  }
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(createClaudeFAB, 600);
  });
}

// Verificar se estamos no ChatGPT e processar integração
if (window.location.hostname.includes('chatgpt.com')) {
  handleChatGPTIntegration();
  
  // Observer para mudanças de URL no ChatGPT (SPA)
  let lastUrl = location.href;
  const chatGPTObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
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
    addSummaryIcons();
  }, 1000);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

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



// Função para manipular diretamente o ChatGPT
function handleChatGPTIntegration() {
  // Verificar se estamos no ChatGPT
  if (!window.location.hostname.includes('chatgpt.com')) {
    return;
  }
  
  
  // Teste de acesso ao chrome.storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  } else {
    return;
  }
  
  // Verificar se há transcrição salva no chrome.storage
  chrome.storage.local.get(['youtubeTranscription'], (result) => {
    if (chrome.runtime.lastError) {
      return;
    }
    
    const transcriptionData = result.youtubeTranscription;
    
    
    if (!transcriptionData) {
      return;
    }
    
    
    // Verificar se a transcrição é recente (últimos 5 minutos)
    const now = Date.now();
    const timeDiff = now - transcriptionData.timestamp;
    const timeDiffMinutes = Math.floor(timeDiff / (1000 * 60));
    
    
    if (timeDiff > 5 * 60 * 1000) {
      chrome.storage.local.remove(['youtubeTranscription'], () => {
      });
      return;
    }
    
    
    // Função para encontrar e preencher o campo de texto
    function fillChatGPTTextArea() {
      
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
          break;
        }
      }
      
      if (!textArea) {
        setTimeout(fillChatGPTTextArea, 1000);
        return;
      }
      
      
      // Limpar o campo
      if (textArea.tagName === 'TEXTAREA') {
        textArea.value = '';
        textArea.focus();
      } else if (textArea.contentEditable === 'true') {
        textArea.innerHTML = '';
        textArea.focus();
      }
      
      
      // Inserir a transcrição
      const prompt = `Resuma pra mim
Transcrição do vídeo:

${transcriptionData.text}

Por favor, estruture o resumo de forma clara e organizada.`;
      
      if (textArea.tagName === 'TEXTAREA') {
        textArea.value = prompt;
        // Disparar evento de input
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (textArea.contentEditable === 'true') {
        textArea.innerHTML = '<p>' + prompt.replace(/\n/g, '</p><p>') + '</p>';
        // Disparar evento de input
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      
      // Limpar a transcrição do chrome.storage imediatamente após preencher
      chrome.storage.local.remove(['youtubeTranscription'], () => {
      });
    }
    
    
    // Aguardar um pouco para a página carregar completamente
    setTimeout(fillChatGPTTextArea, 2000);
  });
}


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
  }

  async checkVideoChange() {
    if (!window.location.href.includes('/watch?v=')) {
      this.reset();
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
        @keyframes sc-pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
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
    
    // Inserir os quatro botões antes do botão de configurações (gear)
    rightControls.prepend(explainBtn);
    rightControls.prepend(copyTsBtn);
    rightControls.prepend(copyBtn);
    rightControls.prepend(btn);
    this.toggleButton = btn;
    this.copyTranscriptButton = copyBtn;
    this.copyTranscriptTsButton = copyTsBtn;
    this.explainMomentButton = explainBtn;
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
    // Remove botões antigos se existirem para recriar limpo
    const oldBtn = document.getElementById('smart-captions-btn');
    if (oldBtn) oldBtn.remove();
    const oldCopyBtn = document.getElementById('copy-transcript-btn');
    if (oldCopyBtn) oldCopyBtn.remove();
    const oldCopyTsBtn = document.getElementById('copy-transcript-ts-btn');
    if (oldCopyTsBtn) oldCopyTsBtn.remove();
    const oldExplainBtn = document.getElementById('explain-moment-btn');
    if (oldExplainBtn) oldExplainBtn.remove();
    this.toggleButton = null;
    this.copyTranscriptButton = null;
    this.copyTranscriptTsButton = null;
    this.explainMomentButton = null;
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
