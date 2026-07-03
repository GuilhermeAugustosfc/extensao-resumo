// aistudio-inject.js
// Script para injetar o prompt no AI Studio Live, clicar em Talk e em Run

(function () {
  'use strict';

  console.log('[AI Studio Inject] Script carregado');

  // Preenche o textarea do AI Studio Live
  function fillAIStudioTextarea(promptText) {
    console.log('[AI Studio Inject] Tentando preencher textarea...');

    const selectors = [
      'textarea[formcontrolname="promptText"]',
      'textarea[aria-label="Enter a prompt to generate a video"]',
      'textarea[placeholder="Start typing a prompt"]',
      '.textarea.cdk-textarea-autosize',
      'textarea.cdk-textarea-autosize',
      'textarea'
    ];

    for (const selector of selectors) {
      try {
        const textarea = document.querySelector(selector);
        if (textarea) {
          console.log('[AI Studio Inject] Textarea encontrado:', selector);

          // Focar no elemento
          textarea.focus();

          // Definir valor via nativeInputValueSetter (contorna Angular)
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          );
          if (nativeSetter && nativeSetter.set) {
            nativeSetter.set.call(textarea, promptText);
          } else {
            textarea.value = promptText;
          }

          // Disparar eventos para notificar o Angular
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
          textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

          // Ajustar altura do autosize
          textarea.style.height = 'auto';
          textarea.style.height = Math.min(textarea.scrollHeight, 210) + 'px';

          console.log('[AI Studio Inject] Texto inserido com sucesso');
          return true;
        }
      } catch (e) {
        console.error('[AI Studio Inject] Erro ao testar seletor:', selector, e);
      }
    }

    console.warn('[AI Studio Inject] Textarea não encontrado');
    return false;
  }

  // Clica no botão "Talk" do AI Studio Live
  function clickTalkButton() {
    console.log('[AI Studio Inject] Tentando clicar no botão Talk...');

    const talkSelectors = [
      'button[aria-label="Talk"]',
      'button.ms-button-primary[aria-label="Talk"]',
      'button.ms-button-large[aria-label="Talk"]',
      'button[jslog*="247646"]',
      'button.ms-button-primary'
    ];

    for (const selector of talkSelectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          const label = btn.getAttribute('aria-label') || btn.textContent || '';
          if (label.toLowerCase().includes('talk') || selector === 'button[aria-label="Talk"]') {
            if (btn.getAttribute('aria-disabled') === 'true' || btn.disabled) {
              console.warn('[AI Studio Inject] Botão Talk encontrado, mas está desabilitado.');
              return false;
            }
            console.log('[AI Studio Inject] Botão Talk clicado:', selector);
            btn.click();
            return true;
          }
        }
      } catch (e) {
        console.error('[AI Studio Inject] Erro ao testar seletor do botão Talk:', selector, e);
      }
    }

    console.warn('[AI Studio Inject] Botão Talk não encontrado');
    return false;
  }

  // Clica no botão "Run" (submit) após injetar o prompt
  function clickRunButton() {
    console.log('[AI Studio Inject] Tentando clicar no botão Run...');

    const runSelectors = [
      // Botão submit do formulário de prompt (Run / Ctrl+Enter)
      'button[type="submit"].ms-button-primary',
      'button[type="submit"].ctrl-enter-submits',
      'button.ctrl-enter-submits',
      'button[jslog*="225921"]',
      // Fallback genérico: botão que contém "Run" no texto
      'button.ms-button-primary'
    ];

    for (const selector of runSelectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
          // Verificar se é o botão Run pelo texto ou por ser o submit do formulário
          if (
            label.includes('run') ||
            btn.type === 'submit' ||
            btn.classList.contains('ctrl-enter-submits')
          ) {
            if (btn.getAttribute('aria-disabled') === 'true' || btn.disabled) {
              console.warn('[AI Studio Inject] Botão Run encontrado, mas está desabilitado.');
              return false;
            }
            console.log('[AI Studio Inject] Botão Run clicado:', selector);
            btn.click();
            return true;
          }
        }
      } catch (e) {
        console.error('[AI Studio Inject] Erro ao testar seletor do botão Run:', selector, e);
      }
    }

    // Fallback: simular Ctrl+Enter no textarea
    console.warn('[AI Studio Inject] Botão Run não encontrado, tentando Ctrl+Enter...');
    const textarea = document.querySelector('textarea[formcontrolname="promptText"], textarea');
    if (textarea) {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      }));
      return true;
    }

    return false;
  }

  // Retry para clicar no botão Talk
  function tryClickTalkWithRetry(maxAttempts = 10, interval = 500) {
    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts++;
      console.log(`[AI Studio Inject] Tentativa de clique no Talk ${attempts}/${maxAttempts}`);

      if (clickTalkButton()) {
        clearInterval(intervalId);
        console.log('[AI Studio Inject] Botão Talk clicado com sucesso!');

        // Após Talk, aguardar e clicar em Run
        setTimeout(() => {
          tryClickRunWithRetry();
        }, 800);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        console.warn('[AI Studio Inject] Talk não encontrado, tentando Run diretamente...');
        tryClickRunWithRetry();
      }
    }, interval);
  }

  // Retry para clicar no botão Run
  function tryClickRunWithRetry(maxAttempts = 10, interval = 600) {
    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts++;
      console.log(`[AI Studio Inject] Tentativa de clique no Run ${attempts}/${maxAttempts}`);

      if (clickRunButton()) {
        clearInterval(intervalId);
        console.log('[AI Studio Inject] Botão Run clicado com sucesso!');
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        console.error('[AI Studio Inject] Não foi possível clicar no Run após todas as tentativas.');
      }
    }, interval);
  }

  // Retry para preencher o textarea
  function tryFillWithRetry(promptText, maxAttempts = 15, interval = 1000) {
    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts++;
      console.log(`[AI Studio Inject] Tentativa de preenchimento ${attempts}/${maxAttempts}`);

      if (fillAIStudioTextarea(promptText)) {
        clearInterval(intervalId);
        console.log('[AI Studio Inject] Sucesso no preenchimento!');

        // Aguardar Angular processar, depois tentar Talk → Run
        setTimeout(() => {
          tryClickTalkWithRetry();
        }, 600);
      } else if (attempts >= maxAttempts) {
        clearInterval(intervalId);
        console.error('[AI Studio Inject] Falhou após todas as tentativas.');
      }
    }, interval);
  }

  function processTranscription(data) {
    console.log('[AI Studio Inject] Processando transcrição:', {
      videoId: data.videoId,
      length: data.text.length,
      timestamp: new Date(data.timestamp),
      preset: data.preset || 'default'
    });

    // Aguardar a página carregar completamente
    setTimeout(() => {
      tryFillWithRetry(data.text);
    }, 2000);

    // Limpar a transcrição após usar
    setTimeout(() => {
      chrome.storage.local.remove(['youtubeTranscription']);
    }, 15000);
  }

  // Escutar transcrições salvas no chrome.storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    // 1. Verificação imediata no carregamento
    chrome.storage.local.get(['youtubeTranscription'], (result) => {
      if (result.youtubeTranscription) {
        if (result.youtubeTranscription.mode === 'live') return;
        processTranscription(result.youtubeTranscription);
      } else {
        console.log('[AI Studio Inject] Nenhuma transcrição encontrada no carregamento inicial');
      }
    });

    // 2. Escutar atualizações futuras
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.youtubeTranscription && changes.youtubeTranscription.newValue) {
        if (changes.youtubeTranscription.newValue.mode === 'live') return;
        console.log('[AI Studio Inject] Nova transcrição detectada via storage.onChanged');
        processTranscription(changes.youtubeTranscription.newValue);
      }
    });
  }
})();
