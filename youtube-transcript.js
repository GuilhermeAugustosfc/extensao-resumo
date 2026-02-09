// youtube-transcript.js
// Content script wrapper que se comunica com o script injetado na página (MAIN world)

(function() {
    'use strict';

    class YoutubeTranscriptError extends Error {
        constructor(message) {
            super(`[YoutubeTranscript] 🚨 ${message}`);
        }
    }
    class YoutubeTranscriptTooManyRequestError extends YoutubeTranscriptError {
        constructor() {
            super('YouTube is receiving too many requests from this IP and now requires solving a captcha to continue');
        }
    }
    class YoutubeTranscriptVideoUnavailableError extends YoutubeTranscriptError {
        constructor(videoId) {
            super(`The video is no longer available (${videoId})`);
        }
    }
    class YoutubeTranscriptDisabledError extends YoutubeTranscriptError {
        constructor(videoId) {
            super(`Transcript is disabled on this video (${videoId})`);
        }
    }
    class YoutubeTranscriptNotAvailableError extends YoutubeTranscriptError {
        constructor(videoId) {
            super(`No transcripts are available for this video (${videoId})`);
        }
    }

    const RE_YOUTUBE = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    
    // Contador de requisições para IDs únicos
    let requestCounter = 0;
    
    // Map de promessas pendentes
    const pendingRequests = new Map();
    
    // Listener para respostas do script da página
    window.addEventListener('yt-transcript-response', function(event) {
        const { requestId, result } = event.detail;
        const pending = pendingRequests.get(requestId);
        
        if (pending) {
            pending.resolve(result);
            pendingRequests.delete(requestId);
        }
    });

    /**
     * Class to retrieve transcript via page-world script
     */
    class YoutubeTranscript {
        /**
         * Fetch transcript from YTB Video
         * @param videoId Video url or video identifier
         * @param config Get transcript in a specific language ISO
         */
        static fetchTranscript(videoId, config) {
            return new Promise((resolve, reject) => {
                const identifier = this.retrieveVideoId(videoId);
                const targetLang = config?.lang;
                const requestId = `req_${Date.now()}_${requestCounter++}`;
                
                console.log(`[YoutubeTranscript-ContentScript] === Nova requisição ===`);
                console.log(`[YoutubeTranscript-ContentScript] VideoId original: ${videoId}`);
                console.log(`[YoutubeTranscript-ContentScript] VideoId extraído: ${identifier}`);
                console.log(`[YoutubeTranscript-ContentScript] Idioma: ${targetLang || 'não especificado'}`);
                console.log(`[YoutubeTranscript-ContentScript] RequestId: ${requestId}`);
                
                // Timeout após 30 segundos (aumentado para dar tempo do fetch)
                const timeout = setTimeout(() => {
                    console.error(`[YoutubeTranscript-ContentScript] TIMEOUT! Requisição ${requestId} expirou após 30s`);
                    pendingRequests.delete(requestId);
                    reject(new YoutubeTranscriptNotAvailableError(videoId));
                }, 30000);
                
                // Armazena a promise
                pendingRequests.set(requestId, {
                    resolve: (result) => {
                        clearTimeout(timeout);
                        
                        console.log(`[YoutubeTranscript-ContentScript] Resposta recebida para ${requestId}`);
                        console.log(`[YoutubeTranscript-ContentScript] Erro: ${result.error || 'nenhum'}`);
                        console.log(`[YoutubeTranscript-ContentScript] Segmentos: ${result.segments?.length || 0}`);
                        
                        if (result.error) {
                            console.error(`[YoutubeTranscript-ContentScript] ERRO do page-world: ${result.error}`);
                            reject(new YoutubeTranscriptNotAvailableError(videoId));
                        } else if (result.segments && result.segments.length > 0) {
                            console.log(`[YoutubeTranscript-ContentScript] SUCESSO: ${result.segments.length} segmentos recebidos`);
                            resolve(result.segments);
                        } else {
                            console.error(`[YoutubeTranscript-ContentScript] Sem segmentos na resposta`);
                            reject(new YoutubeTranscriptNotAvailableError(videoId));
                        }
                    },
                    reject: reject
                });
                
                // Envia requisição para o script da página
                window.dispatchEvent(new CustomEvent('yt-transcript-request', {
                    detail: {
                        videoId: identifier,
                        targetLang: targetLang,
                        requestId: requestId
                    }
                }));
            });
        }
        
        /**
         * Retrieve video id from url or string
         * @param videoId video url or video id
         */
        static retrieveVideoId(videoId) {
            if (videoId.length === 11) {
                return videoId;
            }
            const matchId = videoId.match(RE_YOUTUBE);
            if (matchId && matchId.length) {
                return matchId[1];
            }
            throw new YoutubeTranscriptError('Impossible to retrieve Youtube video ID.');
        }
    }

    // Global exposure for Chrome Extension
    window.YoutubeTranscript = YoutubeTranscript;
    window.YoutubeTranscriptError = YoutubeTranscriptError;
    window.YoutubeTranscriptTooManyRequestError = YoutubeTranscriptTooManyRequestError;
    window.YoutubeTranscriptVideoUnavailableError = YoutubeTranscriptVideoUnavailableError;
    window.YoutubeTranscriptDisabledError = YoutubeTranscriptDisabledError;
    window.YoutubeTranscriptNotAvailableError = YoutubeTranscriptNotAvailableError;

    console.log('[YoutubeTranscript] Content script wrapper ready!');
})();
