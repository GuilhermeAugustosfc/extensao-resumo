// claude-inject.js
// Script para injetar a transcrição no Claude

(function() {
    'use strict';

    console.log('[Claude Inject] Script carregado');

    // Função para encontrar e preencher o input do Claude
    // O input do Claude é um contenteditable div: [contenteditable="true"][data-testid="chat-input"]
    function fillClaudeInput(promptText) {
        console.log('[Claude Inject] Tentando preencher input...');

        const selectors = [
            'div[contenteditable="true"][data-testid="chat-input"]',
            'div[contenteditable="true"][role="textbox"]',
            'div.ProseMirror[contenteditable="true"]',
            'div.tiptap[contenteditable="true"]',
            'textarea'
        ];

        for (const selector of selectors) {
            const input = document.querySelector(selector);
            if (input) {
                console.log('[Claude Inject] Input encontrado:', selector);

                // Focar no elemento
                input.focus();

                // Limpar conteúdo atual
                if (input.tagName === 'TEXTAREA') {
                    input.value = promptText;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    // Para contenteditable (ProseMirror / Tiptap do Claude)
                    // Usar execCommand para compatibilidade com o editor rico
                    input.textContent = '';
                    input.focus();

                    // Inserir via execCommand (funciona em contenteditable)
                    document.execCommand('selectAll', false, null);
                    document.execCommand('delete', false, null);
                    document.execCommand('insertText', false, promptText);

                    // Disparar eventos para notificar o React/framework interno
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: promptText }));
                }

                console.log('[Claude Inject] Texto inserido com sucesso');
                return true;
            }
        }

        console.warn('[Claude Inject] Input não encontrado');
        return false;
    }

    // Função para tentar preencher com retry
    function tryFillWithRetry(promptText, maxAttempts = 15, interval = 1000) {
        let attempts = 0;

        const intervalId = setInterval(() => {
            attempts++;
            console.log(`[Claude Inject] Tentativa ${attempts}/${maxAttempts}`);

            if (fillClaudeInput(promptText)) {
                clearInterval(intervalId);
                console.log('[Claude Inject] Sucesso!');
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.error('[Claude Inject] Falhou após todas as tentativas');
            }
        }, interval);
    }

    function processTranscription(data) {
        console.log('[Claude Inject] Processando transcrição:', {
            videoId: data.videoId,
            length: data.text.length,
            timestamp: new Date(data.timestamp),
            preset: data.preset || 'default'
        });

        // Aguardar um pouco para o Claude carregar e tentar preencher
        setTimeout(() => {
            tryFillWithRetry(data.text);
        }, 1500);

        // Limpar a transcrição após usar
        setTimeout(() => {
            chrome.storage.local.remove(['youtubeTranscription']);
        }, 8000);
    }

    // Verificar se há transcrição salva no chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // 1. Verificação imediata no carregamento inicial
        chrome.storage.local.get(['youtubeTranscription'], (result) => {
            if (result.youtubeTranscription) {
                processTranscription(result.youtubeTranscription);
            } else {
                console.log('[Claude Inject] Nenhuma transcrição encontrada no carregamento inicial');
            }
        });

        // 2. Escutar por atualizações futuras no storage (quando o painel/iframe já está carregado)
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.youtubeTranscription && changes.youtubeTranscription.newValue) {
                console.log('[Claude Inject] Nova transcrição detectada via storage.onChanged');
                processTranscription(changes.youtubeTranscription.newValue);
            }
        });
    }
})();
