// gemini-inject.js
// Script para injetar a transcrição no Gemini

(function() {
    'use strict';

    console.log('[Gemini Inject] Script carregado');

    // Função para encontrar e preencher o textarea do Gemini
    function fillGeminiTextarea(promptText) {
        console.log('[Gemini Inject] Tentando preencher textarea...');
        
        // Seletor para o textarea do Gemini
        const selectors = [
            'div.ql-editor[contenteditable="true"]',
            'div[contenteditable="true"][role="textbox"]',
            'textarea',
            'div.text-input-field_textarea-wrapper textarea',
            'rich-textarea div[contenteditable="true"]'
        ];

        for (const selector of selectors) {
            const textarea = document.querySelector(selector);
            if (textarea) {
                console.log('[Gemini Inject] Textarea encontrado:', selector);
                
                // Preencher o textarea com o prompt já formatado
                if (textarea.tagName === 'TEXTAREA') {
                    textarea.value = promptText;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    // Para contenteditable divs
                    textarea.textContent = promptText;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                console.log('[Gemini Inject] Texto inserido com sucesso');
                
                // Tentar focar no textarea
                textarea.focus();
                
                return true;
            }
        }
        
        console.warn('[Gemini Inject] Textarea não encontrado');
        return false;
    }

    // Função para tentar preencher com retry
    function tryFillWithRetry(promptText, maxAttempts = 10, interval = 1000) {
        let attempts = 0;
        
        const intervalId = setInterval(() => {
            attempts++;
            console.log(`[Gemini Inject] Tentativa ${attempts}/${maxAttempts}`);
            
            if (fillGeminiTextarea(promptText)) {
                clearInterval(intervalId);
                console.log('[Gemini Inject] Sucesso!');
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
                console.error('[Gemini Inject] Falhou após todas as tentativas');
            }
        }, interval);
    }

    function processTranscription(data) {
        console.log('[Gemini Inject] Processando transcrição:', {
            videoId: data.videoId,
            length: data.text.length,
            timestamp: new Date(data.timestamp),
            preset: data.preset || 'default'
        });
        
        // O texto já vem com o prompt completo formatado
        tryFillWithRetry(data.text);
        
        // Limpar a transcrição após usar
        setTimeout(() => {
            chrome.storage.local.remove(['youtubeTranscription']);
        }, 5000);
    }

    // Verificar se há transcrição salva
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // 1. Verificação imediata no carregamento inicial
        chrome.storage.local.get(['youtubeTranscription'], (result) => {
            if (result.youtubeTranscription) {
                processTranscription(result.youtubeTranscription);
            } else {
                console.log('[Gemini Inject] Nenhuma transcrição encontrada no carregamento inicial');
            }
        });

        // 2. Escutar por atualizações futuras no storage (quando o painel/iframe já está carregado)
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.youtubeTranscription && changes.youtubeTranscription.newValue) {
                console.log('[Gemini Inject] Nova transcrição detectada via storage.onChanged');
                processTranscription(changes.youtubeTranscription.newValue);
            }
        });
    }
})();
