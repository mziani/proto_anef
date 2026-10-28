(function () {
  'use strict';
  if (window.__ANEF_MVP__) return;
  window.__ANEF_MVP__ = true;

  const MIN_GAP_MS = 15000;
  let running = false, lastOk = 0;

  const post = (type, payload) => window.postMessage({ source: 'ANEF_MVP_PAGE', type, payload }, location.origin);
  const onMonCompte = () => location.href.includes('mon-compte');

  async function run(force) {
    if (running) return;
    if (!force && Date.now() - lastOk < MIN_GAP_MS) return;
    running = true;
    try {
      const res = await globalThis.ANEFCollect.collect();
      if (res.ok) lastOk = Date.now();
      post('RESULT', res);
    } catch (e) {
      post('RESULT', { ok: false, error: 'exception', detail: String(e.message || e) });
    } finally {
      running = false;
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'ANEF_MVP_BRIDGE') return;
    if (e.data.type === 'TRIGGER') run(true);
  });

  let lastUrl = location.href;
  const check = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (onMonCompte()) setTimeout(() => run(false), 800);
  };
  window.addEventListener('hashchange', check);
  setInterval(check, 1000);

  if (onMonCompte()) run(false);
})();
