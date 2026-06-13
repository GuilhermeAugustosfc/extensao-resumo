// background.js
console.log('[YouTube Assistant] Background script loaded');

// ── Keepalive ────────────────────────────────────────────────
let keepAliveInterval;
function startKeepAlive() {
  clearInterval(keepAliveInterval);
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000);
}
startKeepAlive();

chrome.runtime.onConnect.addListener(() => startKeepAlive());

// ── Listener principal ───────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  startKeepAlive();

  const tabId = sender.tab?.id;

  if (
    request.action === 'openGeminiSidePanel'   ||
    request.action === 'openChatGPTSidePanel'  ||
    request.action === 'openDeepSeekSidePanel' ||
    request.action === 'openClaudeSidePanel'   ||
    request.action === 'openMetaAISidePanel'   ||
    request.action === 'openLiveSidePanel'     ||
    request.action === 'openAIStudioSidePanel'
  ) {
    if (!tabId) {
      sendResponse({ success: false, error: 'tabId não encontrado' });
      return true;
    }

    var targetTab = 'gemini';
    if (request.action === 'openChatGPTSidePanel')  targetTab = 'chatgpt';
    if (request.action === 'openDeepSeekSidePanel') targetTab = 'deepseek';
    if (request.action === 'openClaudeSidePanel')   targetTab = 'claude';
    if (request.action === 'openMetaAISidePanel')   targetTab = 'metaai';
    if (request.action === 'openLiveSidePanel')     targetTab = 'live';
    if (request.action === 'openAIStudioSidePanel') targetTab = 'aistudio';

    // Abrir side panel IMEDIATAMENTE (sem await antes — preserva gesto do usuário)
    chrome.sidePanel.open({ tabId })
      .then(() => {
        sendResponse({ success: true });

        // Após o painel abrir, enviar mensagem para trocar a aba.
        // Funciona tanto se o painel é novo quanto se já estava aberto.
        // Delay pequeno para garantir que o sidepanel.html já inicializou.
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: 'switchSidePanelTab',
            tab: targetTab
          }).catch(() => {
            // Painel pode não estar pronto ainda, tentar de novo
            setTimeout(() => {
              chrome.runtime.sendMessage({
                action: 'switchSidePanelTab',
                tab: targetTab
              }).catch(() => {});
            }, 500);
          });
        }, 350);
      })
      .catch((err) => {
        console.error('[YouTube Assistant] Erro ao abrir Side Panel:', err.message);
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }
});
