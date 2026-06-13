// youtube-transcript-page.js
// Script injetado no contexto da PÁGINA (MAIN world)
// Usa iframe oculto para navegar à página do vídeo e extrair transcrição
// com o contexto completo da sessão do YouTube

(function() {
    'use strict';

    const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

    // ==================== UTILIDADES ====================

    function parseXmlTranscript(xmlBody, langCode) {
        const results = [...xmlBody.matchAll(RE_XML_TRANSCRIPT)];
        return results.map((result) => ({
            text: result[3],
            duration: parseFloat(result[2]),
            offset: parseFloat(result[1]),
            lang: langCode,
        }));
    }

    function decodeHtmlEntities(text) {
        // Usar replace manual em vez de innerHTML (Trusted Types do YouTube bloqueia innerHTML)
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&apos;': "'",
            '&#x27;': "'",
            '&#x2F;': '/',
            '&#32;': ' ',
            '&nbsp;': ' ',
        };
        let decoded = text;
        for (const [entity, char] of Object.entries(entities)) {
            decoded = decoded.split(entity).join(char);
        }
        // Decode numeric entities (&#123; e &#x1F;)
        decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
        decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        return decoded;
    }

    function findKey(obj, targetKey) {
        if (!obj || typeof obj !== 'object') return null;
        if (targetKey in obj) return obj[targetKey];
        for (const key of Object.keys(obj)) {
            const result = findKey(obj[key], targetKey);
            if (result !== null && result !== undefined) return result;
        }
        return null;
    }

    function getClientVersion() {
        if (window.ytcfg?.data_?.INNERTUBE_CLIENT_VERSION) {
            return window.ytcfg.data_.INNERTUBE_CLIENT_VERSION;
        }
        if (typeof window.ytcfg?.get === 'function') {
            const v = window.ytcfg.get('INNERTUBE_CLIENT_VERSION');
            if (v) return v;
        }
        return '2.20260206.01.00';
    }

    function getInnertubeApiKey() {
        if (window.ytcfg?.data_?.INNERTUBE_API_KEY) {
            return window.ytcfg.data_.INNERTUBE_API_KEY;
        }
        if (typeof window.ytcfg?.get === 'function') {
            const k = window.ytcfg.get('INNERTUBE_API_KEY');
            if (k) return k;
        }
        return '';
    }

    function getVisitorData() {
        if (window.ytcfg?.data_?.VISITOR_DATA) {
            return window.ytcfg.data_.VISITOR_DATA;
        }
        if (typeof window.ytcfg?.get === 'function') {
            const v = window.ytcfg.get('VISITOR_DATA');
            if (v) return v;
        }
        return undefined;
    }

    function getDelegatedSessionId() {
        if (window.ytcfg?.data_?.DELEGATED_SESSION_ID) {
            return window.ytcfg.data_.DELEGATED_SESSION_ID;
        }
        return undefined;
    }

    function splitTextIntoChunks(text, maxChunkSize = 7500, overlap = 500) {
        if (!text) return [];
        if (text.length <= maxChunkSize) {
            return [text];
        }
        
        const chunks = [];
        let startIndex = 0;
        
        while (startIndex < text.length) {
            // Se o resto do texto cabe inteiramente no bloco, pegar o resto e encerrar
            if (startIndex + maxChunkSize >= text.length) {
                chunks.push(text.substring(startIndex).trim());
                break;
            }
            
            let endIndex = startIndex + maxChunkSize;
            
            // Tentar cortar em um espaço para evitar quebrar palavras no meio
            const lastSpace = text.lastIndexOf(' ', endIndex);
            if (lastSpace > startIndex + (maxChunkSize / 2)) {
                endIndex = lastSpace;
            }
            
            chunks.push(text.substring(startIndex, endIndex).trim());
            
            // Avançar considerando o overlap
            startIndex = endIndex - overlap;
            
            // Garantir que startIndex avança pelo menos 1 caractere para evitar loops infinitos
            if (startIndex <= endIndex - maxChunkSize) {
                startIndex = endIndex;
            }
        }
        
        return chunks;
    }

    // ==================== ESTRATÉGIA 1: Simular clique no botão de transcrição via YT API interna ====================

    /**
     * Usa a API interna do YouTube (yt.player) para buscar a transcrição
     * navegando para a página do vídeo via window.location da SPA do YouTube
     */
    async function fetchViaYtNavigate(videoId, targetLang) {
        console.log(`[YT-Transcript] === Estratégia 1: YT SPA navigate + extract ===`);

        return new Promise((resolve, reject) => {
            // Criar iframe oculto que navega para a página do vídeo
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.sandbox = ''; // Sem sandbox para ter acesso total
            
            // Usar about:blank primeiro, depois navegar
            iframe.src = `https://www.youtube.com/watch?v=${videoId}`;
            
            const timeout = setTimeout(() => {
                console.error('[YT-Transcript] iframe timeout (20s)');
                iframe.remove();
                reject(new Error('iframe timeout'));
            }, 20000);

            iframe.onload = async () => {
                try {
                    console.log('[YT-Transcript] iframe carregado');
                    
                    // Tentar acessar o conteúdo do iframe
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!iframeDoc) {
                        throw new Error('Não conseguiu acessar document do iframe');
                    }

                    const iframeHtml = iframeDoc.documentElement.innerHTML;
                    console.log(`[YT-Transcript] iframe HTML: ${iframeHtml.length} chars`);

                    // Extrair ytInitialPlayerResponse do iframe
                    const iframeWindow = iframe.contentWindow;
                    const playerResponse = iframeWindow?.ytInitialPlayerResponse;
                    
                    if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                        const tracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
                        console.log(`[YT-Transcript] iframe: ${tracks.length} caption tracks`);
                        
                        let selected = targetLang
                            ? (tracks.find(t => t.languageCode === targetLang) || tracks.find(t => t.languageCode.startsWith(targetLang)))
                            : null;
                        const track = selected || tracks[0];
                        
                        // Fazer fetch do timedtext a partir do iframe (mesmo contexto)
                        const response = await iframeWindow.fetch(track.baseUrl);
                        if (response.ok) {
                            const xml = await response.text();
                            console.log(`[YT-Transcript] iframe fetch XML: ${xml.length} chars`);
                            if (xml.length > 0) {
                                let segments = parseXmlTranscript(xml, track.languageCode);
                                segments = segments.map(s => ({ ...s, text: decodeHtmlEntities(s.text) }));
                                if (segments.length > 0) {
                                    clearTimeout(timeout);
                                    iframe.remove();
                                    resolve({ error: null, segments, lang: track.languageCode });
                                    return;
                                }
                            }
                        }
                    }

                    throw new Error('iframe: sem dados de transcrição');
                } catch (e) {
                    console.warn(`[YT-Transcript] iframe erro: ${e.message}`);
                    clearTimeout(timeout);
                    iframe.remove();
                    reject(e);
                }
            };

            iframe.onerror = () => {
                clearTimeout(timeout);
                iframe.remove();
                reject(new Error('iframe falhou ao carregar'));
            };

            document.body.appendChild(iframe);
        });
    }

    // ==================== ESTRATÉGIA 2: Innertube com contexto completo ====================

    async function fetchViaInnertubeFullContext(videoId, targetLang) {
        console.log(`[YT-Transcript] === Estratégia 2: Innertube contexto completo ===`);

        const clientVersion = getClientVersion();
        const apiKey = getInnertubeApiKey();
        const visitorData = getVisitorData();
        const sessionId = getDelegatedSessionId();

        console.log(`[YT-Transcript] version=${clientVersion}, visitor=${visitorData?.substring(0,20)}...`);

        // Construir contexto completo como o YouTube faz
        const context = {
            client: {
                clientName: 'WEB',
                clientVersion: clientVersion,
                hl: document.documentElement.lang || 'pt',
                gl: 'BR',
                userAgent: navigator.userAgent,
                platform: 'DESKTOP',
                clientFormFactor: 'UNKNOWN_FORM_FACTOR',
            }
        };

        if (visitorData) {
            context.client.visitorData = visitorData;
        }

        if (sessionId) {
            context.user = { delegatedSessionId: sessionId };
        }

        // Tentar pegar SAPISIDHASH para autenticação
        const sapisidHash = await generateSapisidHash();
        const headers = {
            'Content-Type': 'application/json',
            'X-Youtube-Client-Name': '1',
            'X-Youtube-Client-Version': clientVersion,
        };
        if (sapisidHash) {
            headers['Authorization'] = `SAPISIDHASH ${sapisidHash}`;
        }
        if (visitorData) {
            headers['X-Goog-Visitor-Id'] = visitorData;
        }

        const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`;
        console.log('[YT-Transcript] Innertube: POST /player...');

        const playerResponse = await fetch(playerUrl, {
            method: 'POST',
            headers: headers,
            credentials: 'include',
            body: JSON.stringify({ context, videoId })
        });

        if (!playerResponse.ok) {
            throw new Error(`player HTTP ${playerResponse.status}`);
        }

        const playerJson = await playerResponse.json();
        const status = playerJson?.playabilityStatus?.status;
        console.log(`[YT-Transcript] playabilityStatus=${status}`);

        // Tentar captions
        const captionTracks = playerJson?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (captionTracks && captionTracks.length > 0) {
            console.log(`[YT-Transcript] ${captionTracks.length} tracks: ${captionTracks.map(t => t.languageCode).join(', ')}`);

            let selected = targetLang
                ? (captionTracks.find(t => t.languageCode === targetLang) || captionTracks.find(t => t.languageCode.startsWith(targetLang)))
                : null;
            const track = selected || captionTracks[0];

            // Buscar XML com mesmos headers
            const xmlResponse = await fetch(track.baseUrl, {
                credentials: 'include',
                headers: sapisidHash ? { 'Authorization': `SAPISIDHASH ${sapisidHash}` } : {}
            });

            if (xmlResponse.ok) {
                const xml = await xmlResponse.text();
                console.log(`[YT-Transcript] XML: ${xml.length} chars`);
                if (xml.length > 0 && xml.includes('<text')) {
                    let segments = parseXmlTranscript(xml, track.languageCode);
                    segments = segments.map(s => ({ ...s, text: decodeHtmlEntities(s.text) }));
                    if (segments.length > 0) {
                        return { error: null, segments, lang: track.languageCode };
                    }
                }
            }
        }

        // Tentar get_transcript
        const transcriptEndpoint = findKey(playerJson, 'getTranscriptEndpoint');
        if (transcriptEndpoint?.params) {
            console.log('[YT-Transcript] Tentando get_transcript...');
            const trUrl = `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}&prettyPrint=false`;
            const trResponse = await fetch(trUrl, {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify({ context, params: transcriptEndpoint.params })
            });

            if (trResponse.ok) {
                const trJson = await trResponse.json();
                const segments = extractSegmentsFromTranscriptJson(trJson, targetLang);
                if (segments.length > 0) {
                    return { error: null, segments, lang: targetLang || 'unknown' };
                }
            }
        }

        throw new Error(`Innertube full: status=${status}, sem dados`);
    }

    /**
     * Gera SAPISIDHASH para autenticação com a API do YouTube
     */
    async function generateSapisidHash() {
        try {
            const cookies = document.cookie.split(';').map(c => c.trim());
            const sapisid = cookies.find(c => c.startsWith('SAPISID=') || c.startsWith('__Secure-3PAPISID='));
            if (!sapisid) return null;

            const value = sapisid.split('=')[1];
            const timestamp = Math.floor(Date.now() / 1000);
            const origin = 'https://www.youtube.com';
            const input = `${timestamp} ${value} ${origin}`;

            const encoder = new TextEncoder();
            const data = encoder.encode(input);
            const hashBuffer = await crypto.subtle.digest('SHA-1', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            return `${timestamp}_${hashHex}`;
        } catch (e) {
            console.warn('[YT-Transcript] SAPISIDHASH falhou:', e.message);
            return null;
        }
    }

    function extractSegmentsFromTranscriptJson(json, targetLang) {
        const transcriptRenderer = findKey(json, 'transcriptRenderer');
        const initialSegments = transcriptRenderer
            ?.content?.transcriptSearchPanelRenderer?.body
            ?.transcriptSegmentListRenderer?.initialSegments;

        if (initialSegments && initialSegments.length > 0) {
            const segs = initialSegments
                .map(seg => seg?.transcriptSegmentRenderer)
                .filter(Boolean)
                .map(seg => ({
                    text: seg?.snippet?.runs?.map(r => r.text).join('') || '',
                    offset: parseInt(seg?.startMs || '0') / 1000,
                    duration: (parseInt(seg?.endMs || '0') - parseInt(seg?.startMs || '0')) / 1000,
                    lang: targetLang || 'unknown'
                }));
            if (segs.length > 0) return segs;
        }

        // Busca recursiva
        const allSegs = [];
        function findAllSegs(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (obj.transcriptSegmentRenderer) allSegs.push(obj.transcriptSegmentRenderer);
            for (const val of Object.values(obj)) findAllSegs(val);
        }
        findAllSegs(json);

        return allSegs.map(seg => ({
            text: seg?.snippet?.runs?.map(r => r.text).join('') || '',
            offset: parseInt(seg?.startMs || '0') / 1000,
            duration: (parseInt(seg?.endMs || '0') - parseInt(seg?.startMs || '0')) / 1000,
            lang: targetLang || 'unknown'
        }));
    }

    // ==================== ESTRATÉGIA 3: Fetch HTML + extrair dados completos ====================

    async function fetchViaHtmlFullExtract(videoId, targetLang) {
        console.log(`[YT-Transcript] === Estratégia 3: HTML full extract ===`);

        const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            credentials: 'include',
            headers: {
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
            }
        });
        if (!pageResponse.ok) throw new Error(`HTTP ${pageResponse.status}`);

        const html = await pageResponse.text();
        console.log(`[YT-Transcript] HTML: ${html.length} chars`);

        // Extrair ytInitialPlayerResponse completo
        const ytInitMatch = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script)/s);
        let playerResponse = null;
        if (ytInitMatch) {
            try {
                playerResponse = JSON.parse(ytInitMatch[1]);
                console.log(`[YT-Transcript] ytInitialPlayerResponse extraído`);
            } catch (e) {
                console.warn('[YT-Transcript] parse ytInitialPlayerResponse falhou');
            }
        }

        // Fallback: extrair de "captions":
        if (!playerResponse) {
            const splitByCaptions = html.split('"captions":');
            if (splitByCaptions.length > 1) {
                try {
                    const captionsJsonStr = splitByCaptions[1].split(',"videoDetails')[0].replace(/\n/g, '');
                    const captionsObj = JSON.parse(captionsJsonStr);
                    playerResponse = { captions: captionsObj };
                } catch (e) { /* ignore */ }
            }
        }

        const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!captionTracks || captionTracks.length === 0) {
            throw new Error('HTML: sem caption tracks');
        }

        console.log(`[YT-Transcript] HTML: ${captionTracks.length} tracks (${captionTracks.map(t => t.languageCode).join(', ')})`);

        let selected = targetLang
            ? (captionTracks.find(t => t.languageCode === targetLang) || captionTracks.find(t => t.languageCode.startsWith(targetLang)))
            : null;
        const track = selected || captionTracks[0];

        // Extrair clientVersion e apiKey da página para usar no get_transcript
        const versionMatch = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/);
        const apiKeyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
        const pageVersion = versionMatch ? versionMatch[1] : getClientVersion();
        const pageApiKey = apiKeyMatch ? apiKeyMatch[1] : getInnertubeApiKey();

        // Tentar buscar XML do timedtext
        console.log(`[YT-Transcript] Tentando timedtext para track ${track.languageCode}...`);
        try {
            const xmlResponse = await fetch(track.baseUrl, { credentials: 'include' });
            if (xmlResponse.ok) {
                const xml = await xmlResponse.text();
                if (xml.length > 0 && xml.includes('<text')) {
                    let segments = parseXmlTranscript(xml, track.languageCode);
                    segments = segments.map(s => ({ ...s, text: decodeHtmlEntities(s.text) }));
                    if (segments.length > 0) {
                        console.log(`[YT-Transcript] HTML timedtext OK: ${segments.length} segs`);
                        return { error: null, segments, lang: track.languageCode };
                    }
                }
                console.log(`[YT-Transcript] timedtext retornou ${xml.length} chars mas sem segmentos`);
            }
        } catch (e) {
            console.warn(`[YT-Transcript] timedtext falhou: ${e.message}`);
        }

        // Fallback: get_transcript com params do HTML
        const paramsMatch = html.match(/"getTranscriptEndpoint"\s*:\s*\{[^}]*"params"\s*:\s*"([^"]+)"/);
        if (paramsMatch) {
            console.log('[YT-Transcript] Tentando get_transcript com params do HTML...');

            const visitorData = getVisitorData();
            const context = {
                client: {
                    clientName: 'WEB',
                    clientVersion: pageVersion,
                    hl: 'pt',
                    gl: 'BR',
                }
            };
            if (visitorData) context.client.visitorData = visitorData;

            const trResponse = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${pageApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Youtube-Client-Name': '1',
                    'X-Youtube-Client-Version': pageVersion,
                },
                credentials: 'include',
                body: JSON.stringify({ context, params: paramsMatch[1] })
            });

            if (trResponse.ok) {
                const trJson = await trResponse.json();
                const segments = extractSegmentsFromTranscriptJson(trJson, targetLang);
                if (segments.length > 0) {
                    console.log(`[YT-Transcript] get_transcript OK: ${segments.length} segs`);
                    return { error: null, segments, lang: targetLang || track.languageCode };
                }
            } else {
                console.warn(`[YT-Transcript] get_transcript HTTP ${trResponse.status}`);
            }
        }

        throw new Error('HTML full extract: todas as sub-tentativas falharam');
    }

    // ==================== ESTRATÉGIA 4: Variável global ====================

    async function fetchViaGlobalVar(videoId, targetLang) {
        console.log(`[YT-Transcript] === Estratégia 4: Variável global ===`);

        const captionTracks = window.ytInitialPlayerResponse
            ?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!captionTracks || captionTracks.length === 0) {
            throw new Error('ytInitialPlayerResponse sem caption tracks');
        }

        const track = (targetLang
            ? captionTracks.find(t => t.languageCode === targetLang || t.languageCode.startsWith(targetLang))
            : null) || captionTracks[0];

        const response = await fetch(track.baseUrl, { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const xml = await response.text();
        if (!xml || xml.length === 0) throw new Error('XML vazio');

        let segments = parseXmlTranscript(xml, track.languageCode);
        segments = segments.map(s => ({ ...s, text: decodeHtmlEntities(s.text) }));
        if (segments.length === 0) throw new Error('0 segmentos');

        return { error: null, segments, lang: track.languageCode };
    }

    // ==================== ORQUESTRADOR ====================

    async function fetchTranscript(videoId, targetLang) {
        console.log(`[YT-Transcript] ========================================`);
        console.log(`[YT-Transcript] Video: ${videoId} | Lang: ${targetLang || 'any'}`);
        console.log(`[YT-Transcript] Page: ${window.location.href}`);
        console.log(`[YT-Transcript] Version: ${getClientVersion()}`);
        console.log(`[YT-Transcript] ========================================`);

        const strategies = [
            { name: 'Innertube contexto completo', fn: () => fetchViaInnertubeFullContext(videoId, targetLang) },
            { name: 'HTML full extract', fn: () => fetchViaHtmlFullExtract(videoId, targetLang) },
            { name: 'Variável global', fn: () => fetchViaGlobalVar(videoId, targetLang) },
        ];

        for (const strategy of strategies) {
            try {
                console.log(`[YT-Transcript] Tentando: ${strategy.name}...`);
                const result = await strategy.fn();
                if (result?.segments?.length > 0) {
                    console.log(`[YT-Transcript] ✅ "${strategy.name}": ${result.segments.length} segmentos`);
                    return result;
                }
            } catch (e) {
                console.warn(`[YT-Transcript] ❌ "${strategy.name}": ${e.message}`);
            }
        }

        console.error('[YT-Transcript] ❌❌❌ TODAS falharam');
        return { error: 'Nenhuma estratégia conseguiu obter a transcrição', segments: [] };
    }

    window.__youtubeTranscriptFetch = fetchTranscript;

    window.addEventListener('yt-transcript-request', async function(event) {
        const { videoId, targetLang, requestId } = event.detail;
        console.log(`[YT-Transcript] Req: ${requestId} (${videoId})`);
        const result = await fetchTranscript(videoId, targetLang);
        console.log(`[YT-Transcript] Res ${requestId}: ${result.error ? 'ERR ' + result.error : result.segments.length + ' segs'}`);
        window.dispatchEvent(new CustomEvent('yt-transcript-response', {
            detail: { requestId, result }
        }));
    });

    window.addEventListener('yt-summarize-request', async function(event) {
        const { text, presetPrompt, videoTitle, options, requestId } = event.detail;
        console.log(`[YT-Summarize] Req recebida no MAIN world: ${requestId}`);
        
        try {
            // Obter a API de sumarização disponível no escopo MAIN
            let summarizerApi = null;
            if (typeof window.Summarizer !== 'undefined') {
                summarizerApi = window.Summarizer;
            } else if (typeof Summarizer !== 'undefined') {
                summarizerApi = Summarizer;
            } else if (typeof window.summarizer !== 'undefined') {
                summarizerApi = window.summarizer;
            } else if (typeof window.ai !== 'undefined' && typeof window.ai.summarizer !== 'undefined') {
                summarizerApi = window.ai.summarizer;
            }
            
            if (!summarizerApi) {
                throw new Error("A API de sumarização (Gemini Nano) não foi encontrada no escopo global da página do YouTube. Certifique-se de que ativou as flags de IA Local em chrome://flags.");
            }
            
            // 1. Fatiar a transcrição em pedaços de tamanho ideal (limite de 7500 caracteres)
            const chunks = splitTextIntoChunks(text, 7500, 500);
            const totalChunks = chunks.length;
            console.log(`[YT-Summarize] Texto dividido em ${totalChunks} parte(s).`);
            
            // 2. Comunicar ao Isolated World a contagem de partes para criar as abas
            // A UI criará as abas: Visão Geral (idx 0) e depois as partes (idx 1 a totalChunks)
            window.dispatchEvent(new CustomEvent('yt-summarize-chunks-count', {
                detail: { requestId, totalChunks }
            }));
            
            // 3. PASSO 1: Resumir tudo de uma vez para gerar a Visão Geral (idx 0)
            console.log(`[YT-Summarize] Gerando Visão Geral diretamente...`);
            window.dispatchEvent(new CustomEvent('yt-summarize-progress', {
                detail: { requestId, chunkIndex: 0, text: "Gerando Visão Geral localmente com toda a transcrição..." }
            }));
            
            let finalConsolidatedResult = "";
            try {
                const summarizerInstance = await summarizerApi.create(options);
                
                let mainPrompt = text;
                if (presetPrompt) {
                    mainPrompt = presetPrompt
                        .replace('[VIDEO_TITLE]', videoTitle || '')
                        .replace('[TRANSCRIPTION]', text);
                }
                
                finalConsolidatedResult = await summarizerInstance.summarize(mainPrompt);
                
                if (summarizerInstance.destroy) {
                    summarizerInstance.destroy();
                }
                
                console.log(`[YT-Summarize] Visão Geral gerada com sucesso!`);
                window.dispatchEvent(new CustomEvent('yt-summarize-chunk-ready', {
                    detail: { requestId, chunkIndex: 0, result: finalConsolidatedResult }
                }));
            } catch (errOverview) {
                console.error("[YT-Summarize] Erro ao gerar Visão Geral direta:", errOverview);
                // Caso a IA local falhe no texto inteiro (limite de contexto), geramos uma mensagem amigável de erro na Visão Geral
                finalConsolidatedResult = `⚠️ **IA Local Indisponível para o texto completo**\n\nOcorreu um erro ao processar o texto inteiro de uma só vez devido ao limite de capacidade de memória da IA local do navegador (Gemini Nano):\n*Erro: ${errOverview.message}*\n\nPor favor, leia os resumos detalhados das **Partes** abaixo, que estão sendo processadas de forma fracionada e segura!`;
                window.dispatchEvent(new CustomEvent('yt-summarize-chunk-ready', {
                    detail: { requestId, chunkIndex: 0, result: finalConsolidatedResult }
                }));
            }
            
            // 4. PASSO 2: Processar sequencialmente cada pedaço (idx 1 a totalChunks)
            const summaries = [];
            for (let i = 0; i < totalChunks; i++) {
                const partIdx = i + 1;
                console.log(`[YT-Summarize] Criando instância para a parte ${i + 1}/${totalChunks} (Aba idx ${partIdx})...`);
                
                window.dispatchEvent(new CustomEvent('yt-summarize-progress', {
                    detail: { requestId, chunkIndex: partIdx, text: `Inicializando IA para Parte ${i + 1} de ${totalChunks}...` }
                }));
                
                const summarizerInstance = await summarizerApi.create(options);
                
                window.dispatchEvent(new CustomEvent('yt-summarize-progress', {
                    detail: { requestId, chunkIndex: partIdx, text: `Resumindo Parte ${i + 1} de ${totalChunks} localmente...` }
                }));
                
                let chunkPrompt = chunks[i];
                if (presetPrompt) {
                    chunkPrompt = presetPrompt
                        .replace('[VIDEO_TITLE]', videoTitle || '')
                        .replace('[TRANSCRIPTION]', chunks[i]);
                }
                
                const chunkSummary = await summarizerInstance.summarize(chunkPrompt);
                summaries.push(chunkSummary);
                
                if (summarizerInstance.destroy) {
                    summarizerInstance.destroy();
                }
                
                console.log(`[YT-Summarize] Parte ${i + 1} pronta.`);
                window.dispatchEvent(new CustomEvent('yt-summarize-chunk-ready', {
                    detail: { requestId, chunkIndex: partIdx, result: chunkSummary }
                }));
            }
            
            console.log('[YT-Summarize] Processamento de todas as partes concluído!');
            
            // 5. Encerrar fluxo e notificar o isolated world
            window.dispatchEvent(new CustomEvent('yt-summarize-response', {
                detail: { requestId, result: finalConsolidatedResult, error: null }
            }));
            
        } catch (err) {
            console.error("[YT-Summarize] Erro na sumarização progressiva local:", err);
            window.dispatchEvent(new CustomEvent('yt-summarize-response', {
                detail: { requestId, result: null, error: err.message }
            }));
        }
    });

    window.addEventListener('yt-translate-request', async function(event) {
        const { text, sourceLanguage = 'en', targetLanguage = 'pt', requestId } = event.detail;
        console.log(`[YT-Translate] Req recebida no MAIN world: ${requestId}`);
        
        try {
            // Identificar a Translator API preferencial ou APIs alternativas de fallback
            let translatorApi = null;
            let isModernApi = false;
            
            if (typeof Translator !== 'undefined') {
                translatorApi = Translator;
                isModernApi = true;
            } else if (typeof window.Translator !== 'undefined') {
                translatorApi = window.Translator;
                isModernApi = true;
            } else if (typeof self.Translator !== 'undefined') {
                translatorApi = self.Translator;
                isModernApi = true;
            } else if (typeof window.translation !== 'undefined') {
                translatorApi = window.translation;
            } else if (typeof window.ai !== 'undefined' && typeof window.ai.translator !== 'undefined') {
                translatorApi = window.ai.translator;
            }
            
            if (!translatorApi) {
                throw new Error("A API Translator local não foi encontrada no escopo. Certifique-se de que ativou as flags de tradução local em chrome://flags.");
            }
            
            // Fluxo usando a API de Tradução moderna (classe Translator) que o usuário demonstrou
            if (isModernApi) {
                console.log("[YT-Translate] Usando API Translator preferencial.");
                
                // Verificar disponibilidade
                const availability = await translatorApi.availability({
                    sourceLanguage,
                    targetLanguage
                });
                
                console.log(`[YT-Translate] Disponibilidade para en->pt: ${availability}`);
                if (availability === 'no') {
                    throw new Error(`Tradução de '${sourceLanguage}' para '${targetLanguage}' não é suportada localmente.`);
                }
                
                // Criar instância
                const translatorInstance = await translatorApi.create({
                    sourceLanguage,
                    targetLanguage
                });
                
                if (!translatorInstance) {
                    throw new Error("Falha ao instanciar o tradutor local do Chrome.");
                }
                
                console.log('[YT-Translate] Traduzindo texto localmente...');
                const translatedText = await translatorInstance.translate(text);
                
                if (translatorInstance.destroy) {
                    translatorInstance.destroy();
                }
                
                console.log('[YT-Translate] Tradução concluída com sucesso!');
                window.dispatchEvent(new CustomEvent('yt-translate-response', {
                    detail: { requestId, result: translatedText, error: null }
                }));
                return;
            }
            
            // Fluxo de Fallback (para APIs experimentais legadas window.translation / window.ai.translator)
            console.log("[YT-Translate] Usando API de tradução experimental como fallback.");
            let canTranslate = 'maybe';
            if (typeof translatorApi.canTranslate === 'function') {
                canTranslate = await translatorApi.canTranslate({ sourceLanguage, targetLanguage });
            }
            
            if (canTranslate === 'no') {
                throw new Error(`Tradução de '${sourceLanguage}' para '${targetLanguage}' não é suportada localmente.`);
            }
            
            let translatorInstance = null;
            if (typeof translatorApi.createTranslator === 'function') {
                translatorInstance = await translatorApi.createTranslator({ sourceLanguage, targetLanguage });
            } else if (typeof translatorApi.create === 'function') {
                translatorInstance = await translatorApi.create({ sourceLanguage, targetLanguage });
            }
            
            if (!translatorInstance) {
                throw new Error("Falha ao instanciar o tradutor local experimental.");
            }
            
            console.log('[YT-Translate] Traduzindo com API experimental...');
            const translatedText = await translatorInstance.translate(text);
            
            if (translatorInstance.destroy) {
                translatorInstance.destroy();
            }
            
            console.log('[YT-Translate] Tradução experimental concluída!');
            window.dispatchEvent(new CustomEvent('yt-translate-response', {
                detail: { requestId, result: translatedText, error: null }
            }));
        } catch (err) {
            console.error("[YT-Translate] Erro na tradução local:", err);
            window.dispatchEvent(new CustomEvent('yt-translate-response', {
                detail: { requestId, result: null, error: err.message }
            }));
        }
    });

    console.log('[YT-Transcript] 🚀 MAIN world ready (4 strategies + local summarizer and translator listeners)');
})();
