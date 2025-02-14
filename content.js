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

// Função para obter a transcrição do vídeo
async function getVideoTranscription(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();

    // Extrair os dados do player
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (!match) {
      return null;
    }

    const playerResponse = JSON.parse(match[1]);

    // O caminho correto para as legendas é através do captions
    const captions =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captions || captions.length === 0) {
      return null;
    }

    // Pegar a primeira legenda disponível (geralmente a original)
    const captionUrl = captions[0].baseUrl;

    // Obter o XML da legenda
    const transcriptResponse = await fetch(captionUrl);
    const transcriptText = await transcriptResponse.text();

    // Converter XML em texto
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptText, "text/xml");
    const textElements = xmlDoc.getElementsByTagName("text");

    // Extrair e formatar o texto
    let transcription = Array.from(textElements)
      .map((element) => {
        const text = element.textContent.trim();
        const start = parseFloat(element.getAttribute("start"));
        return {
          text,
          start,
          duration: parseFloat(element.getAttribute("dur")) || 0,
        };
      })
      .filter((item) => item.text)
      .sort((a, b) => a.start - b.start)
      .map((item) => item.text)
      .join(" ");

    return transcription;
  } catch (error) {
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
          "Resuma o conteúdo a seguir em 5 a 10 tópicos com registro de data e hora, se for uma transcrição. in Portuguese (Brazil): " +
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
    return;
  }

  if (!checkThumbnails()) {
    return;
  }

  const thumbnails = document.querySelectorAll(
    "a#thumbnail:not(.summary-icon-added)"
  );

  thumbnails.forEach((thumbnail, index) => {
    if (thumbnail.querySelector(".summary-icon")) {
      return;
    }

    try {
      // Ícone inferior esquerdo (Deepseek)
      const iconContainerBottom = document.createElement("div");
      iconContainerBottom.className = "summary-icon-container bottom";
      iconContainerBottom.innerHTML = `
        <svg class="summary-icon" width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
        </svg>
      `;

      // Ícone superior esquerdo (Google AI Studio)
      const iconContainerTop = document.createElement("div");
      iconContainerTop.className = "summary-icon-container top";
      iconContainerTop.innerHTML = `
        <svg class="summary-icon" width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
        </svg>
      `;

      thumbnail.appendChild(iconContainerBottom);
      thumbnail.appendChild(iconContainerTop);
      thumbnail.classList.add("summary-icon-added");

      // Primeiro ícone (Deepseek)
      iconContainerBottom.addEventListener(
        "click",
        handleIconClick(thumbnail, index)
      );

      // Segundo ícone (Google AI Studio)
      iconContainerTop.addEventListener(
        "click",
        handleIconClick(thumbnail, index, true)
      );
    } catch (error) {
      // Aqui você pode adicionar lógica para lidar com o erro
    }
  });
}

// Adicionar estilos CSS
try {
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

    .summary-icon-container.bottom {
      bottom: 8px;
      left: 8px;
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
  `;
  document.head.appendChild(styles);
} catch (error) {
  // Aqui você pode adicionar lógica para lidar com o erro
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

setTimeout(() => {
  addSummaryIcons();
}, 2000);

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

