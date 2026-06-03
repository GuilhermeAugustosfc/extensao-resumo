// sidepanel.js — Lógica do painel lateral (ChatGPT + DeepSeek)

const URLS = {
  gemini:   'https://gemini.google.com/app',
  chatgpt:  'https://chatgpt.com/',
  deepseek: 'https://chat.deepseek.com/',
  claude:   'https://claude.ai/new',
  metaai:   'https://www.meta.ai/'
};

const iframes  = {
  gemini:   document.getElementById('gemini-iframe'),
  chatgpt:  document.getElementById('chatgpt-iframe'),
  deepseek: document.getElementById('deepseek-iframe'),
  claude:   document.getElementById('claude-iframe'),
  metaai:   document.getElementById('metaai-iframe')
};

const loadings = {
  gemini:   document.getElementById('gemini-loading'),
  chatgpt:  document.getElementById('chatgpt-loading'),
  deepseek: document.getElementById('deepseek-loading'),
  claude:   document.getElementById('claude-loading'),
  metaai:   document.getElementById('metaai-loading')
};

const loaded = { gemini: false, chatgpt: false, deepseek: false, claude: false, metaai: false };
let activeTab = 'gemini';

// ── Loading helpers ──────────────────────────────────────────
function hideLoading(key) { loadings[key].classList.add('hidden'); }
function showLoading(key) { loadings[key].classList.remove('hidden'); }

// ── Carregar iframe ──────────────────────────────────────────
// Listener de 'load' é adicionado ANTES de setar src para não
// perder o evento em páginas cacheadas.
function loadFrame(key) {
  if (loaded[key]) return;
  loaded[key] = true;

  var iframe = iframes[key];

  // 1. Listener ANTES de setar src
  iframe.addEventListener('load', function () {
    setTimeout(function () { hideLoading(key); }, 600);
  });

  // 2. Timeout de segurança — 6s
  setTimeout(function () { hideLoading(key); }, 6000);

  // 3. Setar src DEPOIS do listener
  iframe.src = URLS[key];
}

// ── Trocar aba ───────────────────────────────────────────────
function switchTab(key) {
  if (!URLS[key]) return;
  if (key === activeTab) {
    loadFrame(key);
    return;
  }

  var allTabs   = document.querySelectorAll('.sp-tab');
  var allFrames = document.querySelectorAll('.sp-frame');

  for (var i = 0; i < allTabs.length; i++)   allTabs[i].classList.remove('active');
  for (var i = 0; i < allFrames.length; i++) allFrames[i].classList.remove('active');

  document.getElementById('tab-'   + key).classList.add('active');
  document.getElementById('frame-' + key).classList.add('active');
  activeTab = key;
  loadFrame(key);
}

// ── Clique nas abas ──────────────────────────────────────────
var tabButtons = document.querySelectorAll('.sp-tab');
for (var i = 0; i < tabButtons.length; i++) {
  (function (tab) {
    tab.addEventListener('click', function () {
      switchTab(tab.getAttribute('data-frame'));
    });
  })(tabButtons[i]);
}

// ── Botões de recarregar ─────────────────────────────────────
var reloadButtons = document.querySelectorAll('[data-reload]');
for (var i = 0; i < reloadButtons.length; i++) {
  (function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-reload');
      showLoading(key);
      loaded[key] = false; // permitir reload
      iframes[key].src = 'about:blank';
      setTimeout(function () {
        loadFrame(key);
        // Forçar loaded para true novamente caso loadFrame não tenha rodado
        loaded[key] = true;
        iframes[key].addEventListener('load', function onReload() {
          setTimeout(function () { hideLoading(key); }, 600);
          iframes[key].removeEventListener('load', onReload);
        });
        setTimeout(function () { hideLoading(key); }, 6000);
        iframes[key].src = URLS[key];
      }, 200);
    });
  })(reloadButtons[i]);
}

// ── Botões de nova aba ───────────────────────────────────────
var newTabButtons = document.querySelectorAll('[data-newtab]');
for (var i = 0; i < newTabButtons.length; i++) {
  (function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.getAttribute('data-newtab');
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: url });
      } else {
        window.open(url, '_blank');
      }
    });
  })(newTabButtons[i]);
}

// ── Escutar mensagens do background.js ──────────────────────
// Quando o background chama chrome.runtime.sendMessage({ action: 'switchSidePanelTab', tab: 'deepseek' }),
// este listener recebe e troca a aba — funciona mesmo com o painel já aberto.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'switchSidePanelTab' && msg.tab) {
      switchTab(msg.tab);
      sendResponse({ ok: true });
    }
    return false;
  });
}

// ── Carregar Gemini na abertura inicial ─────────────────────
loadFrame('gemini');

console.log('[SidePanel] Inicializado com sucesso');
