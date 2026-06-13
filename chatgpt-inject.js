// chatgpt-inject.js
// Script para injetar a transcrição no ChatGPT

(function() {
    'use strict';

    console.log('[ChatGPT Inject] Script carregado no ChatGPT');

    // Função para encontrar e preencher o campo de texto do ChatGPT
    function fillChatGPTTextArea(promptText) {
        console.log('[ChatGPT Inject] Tentando preencher textarea...');
        
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
                console.log('[ChatGPT Inject] Textarea encontrado:', selector);
                break;
            }
        }
        
        if (!textArea) {
            console.warn('[ChatGPT Inject] Textarea não encontrado');
            return false;
        }
        
        // Focar no elemento
        textArea.focus();
        
        // Inserir a transcrição
        const prompt = `Resuma pra mim
Transcrição do vídeo:

${promptText}

Por favor, estruture o resumo de forma clara e organizada.`;
        
        if (textArea.tagName === 'TEXTAREA') {
            textArea.value = prompt;
            // Disparar evento de input para notificar os frameworks internos (React)
            textArea.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (textArea.contentEditable === 'true') {
            // Limpar conteúdo anterior e inserir via execCommand ou textContent
            textArea.textContent = '';
            
            // Inserir via execCommand para compatibilidade total com ProseMirror
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, prompt);
            
            // Disparar eventos
            textArea.dispatchEvent(new Event('input', { bubbles: true }));
            textArea.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt }));
        }
        
        console.log('[ChatGPT Inject] Texto inserido com sucesso');
        return true;
    }

    // Função para clicar no botão de enviar do ChatGPT
    function clickSendButton() {
        console.log('[ChatGPT Inject] Tentando clicar no botão de enviar...');
        
        // Seletores do botão de enviar do ChatGPT
        const sendSelectors = [
            'button[data-testid="send-button"]',
            'button[aria-label="Enviar prompt"]',
            'button[aria-label="Send prompt"]',
            'button[aria-label="Enviar mensagem"]',
            'button[aria-label="Send message"]',
            'button.mb-1.5'
        ];
        
        for (const selector of sendSelectors) {
            try {
                const btn = document.querySelector(selector);
                if (btn) {
                    // Verificar se o botão não está desabilitado
                    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
                        console.warn('[ChatGPT Inject] Botão de enviar encontrado, mas está desabilitado.');
                        return false;
                    }
                    console.log('[ChatGPT Inject] Botão de enviar clicado:', selector);
                    btn.click();
                    return true;
                }
            } catch (e) {
                console.error('[ChatGPT Inject] Erro ao testar seletor do botão de enviar:', selector, e);
            }
        }
        
        console.warn('[ChatGPT Inject] Botão de enviar não encontrado ou não clicável');
        return false;
    }

    // Função para tentar clicar no botão de enviar com retry (para dar tempo do React habilitar o botão)
    function tryClickSendButtonWithRetry(maxAttempts = 6, interval = 300) {
        let attempts = 0;
        
        const intervalId = setInterval(() => {
            attempts++;
            console.log(`[ChatGPT Inject] Tentativa de clique no botão de enviar ${attempts}/${maxAttempts}`);
            
            if (clickSendButton()) {
                clearInterval(intervalId);
                console.log('[ChatGPT Inject] Botão de enviar clicado com sucesso!');
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.error('[ChatGPT Inject] Não foi possível clicar no botão de enviar após todas as tentativas.');
            }
        }, interval);
    }

    // Função para tentar preencher com retry
    function tryFillWithRetry(promptText, maxAttempts = 15, interval = 1000) {
        let attempts = 0;
        
        const intervalId = setInterval(() => {
            attempts++;
            console.log(`[ChatGPT Inject] Tentativa ${attempts}/${maxAttempts}`);
            
            if (fillChatGPTTextArea(promptText)) {
                clearInterval(intervalId);
                console.log('[ChatGPT Inject] Sucesso!');
                
                // Tentar clicar no botão de enviar após o preenchimento bem sucedido
                // Pequeno delay para o React atualizar o estado interno e habilitar o botão
                setTimeout(() => {
                    tryClickSendButtonWithRetry();
                }, 400);
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.error('[ChatGPT Inject] Falhou após todas as tentativas');
            }
        }, interval);
    }

    function processTranscription(data) {
        console.log('[ChatGPT Inject] Processando transcrição:', {
            videoId: data.videoId,
            length: data.text.length,
            timestamp: new Date(data.timestamp),
            preset: data.preset || 'default'
        });
        
        // Verificar se a transcrição é recente (últimos 5 minutos)
        const now = Date.now();
        const timeDiff = now - data.timestamp;
        if (timeDiff > 5 * 60 * 1000) {
            console.log('[ChatGPT Inject] Transcrição ignorada (mais antiga que 5 minutos)');
            chrome.storage.local.remove(['youtubeTranscription']);
            return;
        }

        // Aguardar um pouco para a página carregar completamente e preencher
        setTimeout(() => {
            tryFillWithRetry(data.text);
        }, 1500);
        
        // Limpar a transcrição do chrome.storage imediatamente após processar
        setTimeout(() => {
            chrome.storage.local.remove(['youtubeTranscription']);
        }, 6000);
    }

    // Verificar se há transcrição salva no chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // 1. Verificação imediata no carregamento inicial
        chrome.storage.local.get(['youtubeTranscription'], (result) => {
            if (result.youtubeTranscription) {
                if (result.youtubeTranscription.mode === 'live') return;
                processTranscription(result.youtubeTranscription);
            } else {
                console.log('[ChatGPT Inject] Nenhuma transcrição encontrada no carregamento inicial');
            }
        });

        // 2. Escutar por atualizações futuras no storage (quando o painel/iframe já está carregado)
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.youtubeTranscription && changes.youtubeTranscription.newValue) {
                if (changes.youtubeTranscription.newValue.mode === 'live') return;
                console.log('[ChatGPT Inject] Nova transcrição detectada via storage.onChanged');
                processTranscription(changes.youtubeTranscription.newValue);
            }
        });
    }
})();
