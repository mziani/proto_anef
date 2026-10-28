(function () {
  'use strict';
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    if (e.data?.source !== 'ANEF_MVP_PAGE' || e.data.type !== 'RESULT') return;
    chrome.runtime.sendMessage({ type: 'ANEF_RESULT', payload: e.data.payload, via: 'page' }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg?.type !== 'TRIGGER') return;
    window.postMessage({ source: 'ANEF_MVP_BRIDGE', type: 'TRIGGER' }, location.origin);
    reply({ ok: true });
  });

  chrome.runtime.sendMessage({ type: 'PAGE_READY', url: location.href }).catch(() => {});
})();
