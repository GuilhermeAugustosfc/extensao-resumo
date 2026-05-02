// deepseek-inject.js
// Injetado dentro do iframe do DeepSeek (via content_scripts com all_frames: true)
// Detecta Cloudflare challenge e notifica o frame pai via postMessage

(function () {
  'use strict';

  // Só age se estiver dentro de um iframe
  if (window === window.top) return;

  console.log('[DeepSeek Inject] Script carregado no iframe do DeepSeek');

  function isCloudflareChallenge() {
    const title = document.title || '';
    const bodyText = document.body ? document.body.innerText : '';

    return (
      title.includes('Just a moment')              ||
      title.includes('Attention Required')          ||
      bodyText.includes('Max challenge attempts')   ||
      bodyText.includes('Just a moment...')         ||
      bodyText.includes('challenge-form')           ||
      !!document.getElementById('challenge-form')   ||
      !!document.querySelector('.cf-browser-verification') ||
      !!document.querySelector('.cf-challenge-running')
    );
  }

  function notifyParent(type) {
    try {
      window.parent.postMessage({ source: 'deepseek-inject', type }, '*');
      console.log('[DeepSeek Inject] postMessage enviado:', type);
    } catch (e) {}
  }

  function check() {
    if (isCloudflareChallenge()) {
      notifyParent('deepseek-blocked');
    } else {
      notifyParent('deepseek-ok');
    }
  }

  // Verificar após o DOM estar pronto
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    check();
  } else {
    document.addEventListener('DOMContentLoaded', check);
  }

  // Segunda verificação após 2s (challenge pode aparecer depois do load)
  setTimeout(check, 2000);
  // Terceira verificação após 5s
  setTimeout(check, 5000);
})();
