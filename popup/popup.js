(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ANEF_API = 'https://administration-etrangers-en-france.interieur.gouv.fr/api';
  const DEFAULTS = { autoCheck: true, intervalMin: 60, notify: true, fallbackWindow: true, privacy: false };
  const ERRORS = {
    session: 'Session ANEF expirée. Reconnecte-toi pour actualiser.',
    maintenance: 'ANEF en maintenance. Nouvel essai au prochain cycle.',
    rate_limited: 'ANEF limite les requêtes (429). Réessaie plus tard.',
    timeout: "Pas de réponse d'ANEF dans le délai.",
    network: 'Erreur réseau.',
    no_dossier: 'Aucun dossier de naturalisation trouvé sur ce compte.',
    exception: 'Erreur inattendue pendant la lecture.'
  };
  const VIA = { page: 'onglet ANEF', direct: 'appel direct', window: 'fenêtre minimisée' };
  const DMR_STATUTS = { BROUILLON: 'Brouillon', DEPOT_CONFIRME: 'Dépôt confirmé', TRAITEMENT_TERMINE: 'Traitement terminé' };

  let S = {};

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
    }
    kids.flat().forEach(k => k != null && n.append(k));
    return n;
  };
  const send = (msg) => chrome.runtime.sendMessage(msg);

  async function load() {
    S = await chrome.storage.local.get(['dossier', 'history', 'raw', 'state', 'settings']);
    S.settings = { ...DEFAULTS, ...(S.settings || {}) };
    render();
  }

  function render() {
    const { dossier, state = {}, settings } = S;
    document.body.classList.toggle('privacy', !!settings.privacy);
    $('btnPrivacy').classList.toggle('on', !!settings.privacy);
    renderSettings(settings);
    renderAlert(state);

    $('empty').hidden = !!dossier;
    $('main').hidden = !dossier;
    if (!dossier) return;

    const d = dossier.derived, info = dossier.info || {};
    const s = U.statusInfo(d.statutCode);
    const card = $('statusCard');
    card.dataset.tone = U.tone(s);
    $('sIcon').textContent = s.icon;
    $('sStep').textContent = s.etape || '?';
    $('sSub').textContent = s.found ? `sous-étape ${U.subStep(s.rang)}` : (d.statutCode || 'inconnu');
    $('sPhase').textContent = s.phase;
    $('sExpl').textContent = s.explication;
    $('sDesc').textContent = s.description;
    $('sSince').textContent = U.fmtDate(dossier.since);
    $('sSinceDur').textContent = U.fmtDuration(U.daysSince(dossier.since));

    const steps = $('steps');
    steps.replaceChildren(...Array.from({ length: 12 }, (_, i) =>
      el('i', { class: i + 1 < s.etape ? 'done' : i + 1 === s.etape ? 'cur' : '', title: `Étape ${i + 1}` })));

    const chips = [];
    if (d.decisionAvailable) chips.push(['Décision disponible', '']);
    if (d.inDecretPipeline) chips.push(['Pipeline décret', '']);
    if (d.decretAssigned) chips.push(['Décret assigné', '']);
    if (d.complementPending) chips.push(['Complément demandé (historique)', 'warn']);
    if (d.canRapo) chips.push(['RAPO accessible', 'warn']);
    if (d.coarse) chips.push(['Statut approximatif (frise absente)', 'warn']);
    if (dossier.held) chips.push(['Recul ignoré (signal grossier)', 'warn']);
    $('chips').replaceChildren(...chips.map(([t, c]) => el('span', { class: 'chip ' + c, text: t })));

    $('kDepot').textContent = U.fmtDate(info.dateDepot);
    $('kDepotDur').textContent = info.dateDepot ? 'il y a ' + U.fmtDuration(U.daysSince(info.dateDepot)) : '';
    $('kEa').textContent = U.fmtDate(info.entretienDate, true);
    $('kEaLieu').textContent = info.entretienLieu || '';
    $('kPref').textContent = info.prefecture || '—';
    $('kDecret').textContent = d.numeroDecret || '—';
    $('kNum').textContent = info.numeroNational || '—';
    $('kCheck').textContent = U.fmtDate(state.lastSuccess || dossier.updatedAt, true);
    $('kVia').textContent = state.via ? 'via ' + (VIA[state.via] || state.via) : '';

    renderTimeline(d.timeline || []);
    renderHistory(S.history || []);
    renderDmr(dossier.dmr);
    renderRaw(d, info);
  }

  function renderAlert(state) {
    const a = $('alert');
    const stale = state.lastError && (!state.lastSuccess || state.lastCheck > state.lastSuccess);
    a.hidden = !stale;
    if (!stale) return;
    a.replaceChildren(ERRORS[state.lastError] || `Échec : ${state.lastError}`);
    if (state.lastError === 'session' || state.lastError === 'no_dossier') {
      const b = el('button', { text: 'Ouvrir ANEF' });
      b.onclick = () => send({ type: 'OPEN_ANEF' });
      a.append(b);
    }
  }

  function renderTimeline(tl) {
    $('tlCount').textContent = tl.length || '';
    const items = [...tl].reverse().map((e, i, arr) => {
      const prev = arr[i + 1];
      const gap = prev ? U.daysBetween(prev.date, e.date) : null;
      return el('li', {},
        el('span', { text: e.icon }),
        el('span', {}, e.label, gap != null ? el('span', { class: 's', text: `+${U.fmtDuration(gap)} après l'événement précédent` }) : null),
        el('span', { class: 'd sens', text: U.fmtDate(e.date) }));
    });
    $('timeline').replaceChildren(...(items.length ? items : [el('li', {}, el('span'), el('span', { class: 'muted', text: 'Aucun événement' }))]));
  }

  function renderHistory(h) {
    $('hCount').textContent = h.length || '';
    $('history').replaceChildren(...[...h].reverse().map(e => {
      const i = U.statusInfo(e.code);
      return el('li', {},
        el('span', { text: i.icon }),
        el('span', {}, `${i.etape || '?'}${i.found ? '.' + (i.rang % 100) : ''} · ${i.explication}`,
          el('span', { class: 's', text: `vu le ${U.fmtDate(e.seenAt, true)} · source ${e.from || '—'}` })),
        el('span', { class: 'd sens', text: U.fmtDate(e.since) }));
    }));
  }

  function jwtExpiry(path) {
    try {
      const sig = new URL(ANEF_API + path).searchParams.get('signature');
      const p = JSON.parse(atob(sig.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.exp ? p.exp * 1000 : null;
    } catch { return null; }
  }

  function renderDmr(dmr) {
    $('dmrBox').hidden = !dmr;
    if (!dmr) return;
    const enfants = Array.isArray(dmr.formulaire?.nouveaux_enfants) ? dmr.formulaire.nouveaux_enfants : [];
    const box = $('dmr');
    box.replaceChildren(
      el('div', {}, el('b', { text: DMR_STATUTS[dmr.statut] || dmr.statut }), dmr.date_depot ? ` · déposée le ${U.fmtDate(dmr.date_depot)}` : ''),
      ...enfants.map(e => el('div', { class: 'muted sens',
        text: `+ ${[].concat(e.prenoms || []).filter(Boolean).join(' ')} ${e.nom || ''} (${U.fmtDate(e.date_naissance)})` }))
    );
    const link = dmr.attestation_depot?._links?.data;
    const exp = link ? jwtExpiry(link) : null;
    if (link && (!exp || exp > Date.now())) {
      const a = el('a', { href: ANEF_API + link, target: '_blank', text: "Télécharger l'attestation de dépôt" });
      box.append(el('div', {}, a));
    }
  }

  function renderRaw(d, info) {
    const rows = [
      ['statut brut', d.statutRaw], ['macro', d.macro], ['drapeaux', (d.flags || []).join(', ') || '—'],
      ['frise', d.typeFrise ? `${d.typeFrise} · ${d.friseIndex}/${d.friseTotal} · ${d.friseKey}` : '—'],
      ['code interne', d.statutCode], ['dérivé de', d.derivedFrom + (d.coarse ? ' (grossier)' : '')],
      ['current_step', info.currentStep ?? '—'], ['date_statut ANEF', info.dateStatut || '—'],
      ['id dossier', S.dossier.id]
    ];
    $('raw').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { class: k === 'id dossier' ? 'sens' : '', text: String(v ?? '—') })]));
  }

  function renderSettings(s) {
    $('optAuto').checked = !!s.autoCheck;
    $('optInterval').value = String(s.intervalMin);
    $('optNotify').checked = !!s.notify;
    $('optWindow').checked = !!s.fallbackWindow;
  }

  async function saveSettings(p) {
    S.settings = { ...S.settings, ...p };
    await send({ type: 'SAVE_SETTINGS', settings: p });
    render();
  }

  function summary() {
    const d = S.dossier.derived, info = S.dossier.info || {}, s = U.statusInfo(d.statutCode);
    const priv = S.settings.privacy;
    const lines = [
      `ANEF — Étape ${s.etape}/12 (${U.subStep(s.rang || 0)}) : ${s.phase}`,
      s.explication,
      `Depuis : ${priv ? '•••' : U.fmtDate(S.dossier.since)} (${U.fmtDuration(U.daysSince(S.dossier.since))})`,
      `Dépôt : ${priv ? '•••' : U.fmtDate(info.dateDepot)}${info.dateDepot ? ` (${U.fmtDuration(U.daysSince(info.dateDepot))})` : ''}`
    ];
    if (info.entretienDate) lines.push(`Entretien : ${priv ? '•••' : U.fmtDate(info.entretienDate)}`);
    if (info.prefecture && !priv) lines.push(`Préfecture : ${info.prefecture}`);
    if (d.numeroDecret && !priv) lines.push(`Décret : ${d.numeroDecret}`);
    return lines.join('\n');
  }

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportPng() {
    const d = S.dossier.derived, info = S.dossier.info || {}, s = U.statusInfo(d.statutCode);
    const priv = S.settings.privacy;
    const cv = $('cv'), c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const tone = U.tone(s);
    const col = { ok: '#15803d', bad: '#b91c1c', warm: '#c2410c', neutral: '#1f3a8a' }[tone];
    c.fillStyle = '#f6f5f1'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.strokeStyle = '#e4e2db'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(30, 30, W - 60, H - 60, 22); c.fill(); c.stroke();
    c.fillStyle = '#6a6f7a'; c.font = '600 22px system-ui, sans-serif';
    c.fillText(`SUIVI NATURALISATION · ÉTAPE ${s.etape}/12 · ${U.subStep(s.rang || 0)}`, 70, 95);
    c.fillStyle = col; c.font = '700 46px system-ui, sans-serif';
    c.fillText(`${s.icon} ${s.phase}`, 70, 160);
    c.fillStyle = '#16181d'; c.font = '28px system-ui, sans-serif';
    c.fillText(s.explication, 70, 205);
    const gw = (W - 140 - 11 * 8) / 12;
    for (let i = 0; i < 12; i++) {
      c.fillStyle = i + 1 <= s.etape ? col : '#e4e2db';
      c.beginPath(); c.roundRect(70 + i * (gw + 8), 240, gw, 14, 7); c.fill();
    }
    const kv = [
      ['Depuis', priv ? `${U.fmtDuration(U.daysSince(S.dossier.since))}` : `${U.fmtDate(S.dossier.since)} · ${U.fmtDuration(U.daysSince(S.dossier.since))}`],
      ['Dépôt', info.dateDepot ? (priv ? `il y a ${U.fmtDuration(U.daysSince(info.dateDepot))}` : `${U.fmtDate(info.dateDepot)} · ${U.fmtDuration(U.daysSince(info.dateDepot))}`) : '—'],
      ['Entretien', info.entretienDate ? (priv ? 'fixé' : U.fmtDate(info.entretienDate)) : '—'],
      ['Préfecture', priv ? '•••' : (info.prefecture || '—')]
    ];
    kv.forEach(([k, v], i) => {
      const x = 70 + (i % 2) * 430, y = 320 + Math.floor(i / 2) * 90;
      c.fillStyle = '#6a6f7a'; c.font = '600 18px system-ui, sans-serif'; c.fillText(k.toUpperCase(), x, y);
      c.fillStyle = '#16181d'; c.font = '600 28px system-ui, sans-serif'; c.fillText(v, x, y + 36);
    });
    c.fillStyle = '#9aa0ab'; c.font = '16px system-ui, sans-serif';
    c.fillText(`Généré le ${U.fmtDate(new Date(), true)}`, 70, H - 60);
    cv.toBlob(b => download(`anef-suivi-${new Date().toISOString().slice(0, 10)}.png`, b), 'image/png');
  }

  $('btnRefresh').onclick = async () => {
    const b = $('btnRefresh');
    b.classList.add('spin'); b.disabled = true;
    try { await send({ type: 'REFRESH' }); } finally { b.classList.remove('spin'); b.disabled = false; load(); }
  };
  $('btnPrivacy').onclick = () => saveSettings({ privacy: !S.settings.privacy });
  $('btnOpen').onclick = $('btnOpenEmpty').onclick = () => send({ type: 'OPEN_ANEF' });
  $('btnCopy').onclick = async () => {
    await navigator.clipboard.writeText(summary());
    $('btnCopy').textContent = 'Copié ✓';
    setTimeout(() => { $('btnCopy').textContent = 'Copier résumé'; }, 1500);
  };
  $('btnPng').onclick = exportPng;
  $('btnExportJson').onclick = () => download(`anef-brut-${new Date().toISOString().slice(0, 10)}.json`,
    new Blob([JSON.stringify({ dossier: S.dossier, history: S.history, raw: S.raw }, null, 2)], { type: 'application/json' }));
  $('btnClear').onclick = async () => {
    if (!confirm('Effacer statut, historique et données brutes stockés localement ?')) return;
    await send({ type: 'CLEAR' });
    load();
  };
  $('optAuto').onchange = (e) => saveSettings({ autoCheck: e.target.checked });
  $('optInterval').onchange = (e) => saveSettings({ intervalMin: Number(e.target.value) });
  $('optNotify').onchange = (e) => saveSettings({ notify: e.target.checked });
  $('optWindow').onchange = (e) => saveSettings({ fallbackWindow: e.target.checked });

  chrome.storage.onChanged.addListener((_c, area) => { if (area === 'local') load(); });
  load();
})();
