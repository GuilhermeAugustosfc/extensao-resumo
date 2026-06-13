// metaai-inject.js
// Script para injetar a transcrição e enviar automaticamente no Meta AI

(function() {
    'use strict';

    console.log('[Meta AI Inject] Script carregado no Meta AI');

    // Função para encontrar e preencher o campo de texto do Meta AI
    function fillMetaAITextArea(promptText) {
        console.log('[Meta AI Inject] Tentando preencher textarea...');
        
        // Seletores comuns para o input do Meta AI
        const selectors = [
            'textarea',
            'div[contenteditable="true"]',
            '[role="textbox"]',
            '[data-testid="composer-input"]'
        ];
        
        let textArea = null;
        for (const selector of selectors) {
            textArea = document.querySelector(selector);
            if (textArea) {
                console.log('[Meta AI Inject] Textarea encontrado:', selector);
                break;
            }
        }
        
        if (!textArea) {
            console.warn('[Meta AI Inject] Textarea não encontrado');
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
            // Limpar conteúdo anterior
            textArea.textContent = '';
            
            // Inserir via execCommand para compatibilidade com ProseMirror/Lexical
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, prompt);
            
            // Disparar eventos
            textArea.dispatchEvent(new Event('input', { bubbles: true }));
            textArea.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt }));
        }
        
        console.log('[Meta AI Inject] Texto inserido com sucesso');
        return true;
    }

    // Função para clicar no botão de enviar do Meta AI
    function clickSendButton() {
        console.log('[Meta AI Inject] Tentando clicar no botão de enviar...');
        
        // Seletores do botão de enviar (incluindo o fornecido pelo usuário: data-testid="composer-send-button")
        const sendSelectors = [
            'button[data-testid="composer-send-button"]',
            'button[aria-label="Enviar"]',
            'button.enabled\\:active\\:scale-98', // classe específica
            'button:has(svg)'
        ];
        
        for (const selector of sendSelectors) {
            try {
                const btn = document.querySelector(selector);
                if (btn) {
                    // Verificar se o botão não está desabilitado
                    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled')) {
                        console.warn('[Meta AI Inject] Botão de enviar encontrado, mas está desabilitado.');
                        return false;
                    }
                    console.log('[Meta AI Inject] Botão de enviar clicado:', selector);
                    btn.click();
                    return true;
                }
            } catch (e) {
                console.error('[Meta AI Inject] Erro ao testar seletor do botão de enviar:', selector, e);
            }
        }
        
        console.warn('[Meta AI Inject] Botão de enviar não encontrado ou não clicável');
        return false;
    }

    // Função para tentar clicar no botão de enviar com retry (para dar tempo do React habilitar o botão)
    function tryClickSendButtonWithRetry(maxAttempts = 6, interval = 300) {
        let attempts = 0;
        
        const intervalId = setInterval(() => {
            attempts++;
            console.log(`[Meta AI Inject] Tentativa de clique no botão de enviar ${attempts}/${maxAttempts}`);
            
            if (clickSendButton()) {
                clearInterval(intervalId);
                console.log('[Meta AI Inject] Botão de enviar clicado com sucesso!');
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.error('[Meta AI Inject] Não foi possível clicar no botão de enviar após todas as tentativas.');
            }
        }, interval);
    }

    // Função para tentar preencher com retry
    function tryFillWithRetry(promptText, maxAttempts = 15, interval = 1000) {
        let attempts = 0;
        
        const intervalId = setInterval(() => {
            attempts++;
            console.log(`[Meta AI Inject] Tentativa ${attempts}/${maxAttempts}`);
            
            if (fillMetaAITextArea(promptText)) {
                clearInterval(intervalId);
                console.log('[Meta AI Inject] Sucesso!');
                
                // Tentar clicar no botão de enviar após o preenchimento bem sucedido
                // Pequeno delay para o React atualizar o estado interno e habilitar o botão
                setTimeout(() => {
                    tryClickSendButtonWithRetry();
                }, 400);
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.error('[Meta AI Inject] Falhou após todas as tentativas');
            }
        }, interval);
    }

    function processTranscription(data) {
        console.log('[Meta AI Inject] Processando transcrição:', {
            videoId: data.videoId,
            length: data.text.length,
            timestamp: new Date(data.timestamp),
            preset: data.preset || 'default'
        });
        
        // Verificar se a transcrição é recente (últimos 5 minutos)
        const now = Date.now();
        const timeDiff = now - data.timestamp;
        if (timeDiff > 5 * 60 * 1000) {
            console.log('[Meta AI Inject] Transcrição ignorada (mais antiga que 5 minutos)');
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
                console.log('[Meta AI Inject] Nenhuma transcrição encontrada no carregamento inicial');
            }
        });

        // 2. Escutar por atualizações futuras no storage (quando o painel/iframe já está carregado)
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.youtubeTranscription && changes.youtubeTranscription.newValue) {
                if (changes.youtubeTranscription.newValue.mode === 'live') return;
                console.log('[Meta AI Inject] Nova transcrição detectada via storage.onChanged');
                processTranscription(changes.youtubeTranscription.newValue);
            }
        });
    }
})();
