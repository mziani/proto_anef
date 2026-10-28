importScripts('lib/statuts.js', 'lib/util.js', 'lib/mapper.js', 'lib/collect.js');

const ANEF = 'https://administration-etrangers-en-france.interieur.gouv.fr';
const MON_COMPTE = ANEF + '/usagers/#/espace-personnel/mon-compte';
const ALARM = 'anef-check';
const DEFAULTS = { autoCheck: true, intervalMin: 60, notify: true, fallbackWindow: true, privacy: false };

const DEPTS = {'01':'Ain','02':'Aisne','03':'Allier','04':'Alpes-de-Haute-Provence','05':'Hautes-Alpes','06':'Alpes-Maritimes','07':'Ardèche','08':'Ardennes','09':'Ariège','10':'Aube','11':'Aude','12':'Aveyron','13':'Bouches-du-Rhône','14':'Calvados','15':'Cantal','16':'Charente','17':'Charente-Maritime','18':'Cher','19':'Corrèze','2A':'Corse-du-Sud','2B':'Haute-Corse','21':"Côte-d'Or",'22':"Côtes-d'Armor",'23':'Creuse','24':'Dordogne','25':'Doubs','26':'Drôme','27':'Eure','28':'Eure-et-Loir','29':'Finistère','30':'Gard','31':'Haute-Garonne','32':'Gers','33':'Gironde','34':'Hérault','35':'Ille-et-Vilaine','36':'Indre','37':'Indre-et-Loire','38':'Isère','39':'Jura','40':'Landes','41':'Loir-et-Cher','42':'Loire','43':'Haute-Loire','44':'Loire-Atlantique','45':'Loiret','46':'Lot','47':'Lot-et-Garonne','48':'Lozère','49':'Maine-et-Loire','50':'Manche','51':'Marne','52':'Haute-Marne','53':'Mayenne','54':'Meurthe-et-Moselle','55':'Meuse','56':'Morbihan','57':'Moselle','58':'Nièvre','59':'Nord','60':'Oise','61':'Orne','62':'Pas-de-Calais','63':'Puy-de-Dôme','64':'Pyrénées-Atlantiques','65':'Hautes-Pyrénées','66':'Pyrénées-Orientales','67':'Bas-Rhin','68':'Haut-Rhin','69':'Rhône','70':'Haute-Saône','71':'Saône-et-Loire','72':'Sarthe','73':'Savoie','74':'Haute-Savoie','75':'Paris','76':'Seine-Maritime','77':'Seine-et-Marne','78':'Yvelines','79':'Deux-Sèvres','80':'Somme','81':'Tarn','82':'Tarn-et-Garonne','83':'Var','84':'Vaucluse','85':'Vendée','86':'Vienne','87':'Haute-Vienne','88':'Vosges','89':'Yonne','90':'Territoire de Belfort','91':'Essonne','92':'Hauts-de-Seine','93':'Seine-Saint-Denis','94':'Val-de-Marne','95':"Val-d'Oise",'971':'Guadeloupe','972':'Martinique','973':'Guyane','974':'La Réunion','976':'Mayotte'};

function deptFromCP(cp) {
  if (!cp) return null;
  const s = String(cp).padStart(5, '0');
  if (s.startsWith('97')) return DEPTS[s.slice(0, 3)] || null;
  if (s.startsWith('20')) return DEPTS[parseInt(s, 10) < 20200 ? '2A' : '2B'] || null;
  return DEPTS[s.slice(0, 2)] || null;
}

const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);
async function settings() { return { ...DEFAULTS, ...((await get('settings')).settings || {}) }; }
async function patchState(p) { const { state = {} } = await get('state'); await set({ state: { ...state, ...p } }); }

function extractInfo(res) {
  const d = res.detail || {};
  const ea = d.entretien_assimilation || null;
  const dom = d.demande?.domicile?.adresse || {};
  const lieu = ea?.unite_gestion?.nom_plateforme || ea?.unite_gestion?.libelle || null;
  return {
    dateDepot: d.taxe_payee?.date_consommation || d.date_creation || d._created || d.date_depot || null,
    entretienDate: ea?.date_rdv || null,
    entretienLieu: lieu,
    entretienAdresse: ea?.adresse_rdv || null,
    entretienInfo: ea?.information_complementaire_rdv || null,
    prefecture: lieu || deptFromCP(dom.code_postal),
    ville: dom.ville || null,
    numeroNational: d.numero_national || null,
    currentStep: d.current_step ?? null,
    dateStatut: res.stepper.date_statut,
    entretienReports: (ea?.rdv_reportes || []).map(r => r?.date_rdv_reporte).filter(Boolean),
    complements: (Array.isArray(d.demande_complement) ? d.demande_complement : [])
      .map(c => ({ date: c?.date_creation_demande || null, pieces: Array.isArray(c?.demande_complement) ? c.demande_complement.length : null, type: c?.type_complement || null }))
      .filter(c => c.date)
  };
}

function minimalDetail(d) {
  if (!d) return null;
  const ea = d.entretien_assimilation || null;
  return {
    _created: d._created ?? null, _updated: d._updated ?? null, current_step: d.current_step ?? null,
    statut: d.statut ?? null,
    taxe_payee: d.taxe_payee ? { date_consommation: d.taxe_payee.date_consommation ?? null } : null,
    entretien_assimilation: ea ? {
      date_rdv: ea.date_rdv ?? null,
      rdv_reportes: (ea.rdv_reportes || []).map(r => ({ date_rdv_reporte: r?.date_rdv_reporte ?? null })),
      unite_gestion: ea.unite_gestion ? { nom_plateforme: ea.unite_gestion.nom_plateforme ?? null, libelle: ea.unite_gestion.libelle ?? null } : null
    } : null,
    demande_complement: (Array.isArray(d.demande_complement) ? d.demande_complement : [])
      .map(c => ({ date_creation_demande: c?.date_creation_demande ?? null, type_complement: c?.type_complement ?? null,
        nb_pieces: Array.isArray(c?.demande_complement) ? c.demande_complement.length : null })),
    decret_assigne: !!res_decret(d)
  };
}
const res_decret = (d) => (d?.demande?.informations?.etat_civil?.identites_decrets || []).some(i => i?.decret?.id);

async function setBadge(code, error) {
  if (error) {
    await chrome.action.setBadgeText({ text: error === 'session' ? '🔑' : '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
    return;
  }
  const info = U.statusInfo(code);
  const t = U.tone(info);
  await chrome.action.setBadgeText({ text: info.etape ? String(info.etape) : '?' });
  await chrome.action.setBadgeBackgroundColor({ color: t === 'ok' ? '#15803d' : t === 'bad' ? '#b91c1c' : t === 'warm' ? '#c2410c' : '#1d4ed8' });
}

async function notify(title, message) {
  if (!(await settings()).notify) return;
  chrome.notifications.create('anef-' + Date.now(), { type: 'basic', iconUrl: 'icons/icon128.png', title, message, priority: 2 });
}

async function processResult(res, via) {
  const now = new Date().toISOString();
  if (!res?.ok) {
    await patchState({ lastCheck: now, lastError: res?.error || 'unknown', lastErrorDetail: res?.detail || res?.http || null, via });
    if (res?.error === 'session' || res?.error === 'maintenance') await setBadge(null, res.error);
    return false;
  }

  const { dossier: prev, history = [] } = await get(['dossier', 'history']);
  const derived = ANEFMapper.derive({
    statut: res.stepper.statut, frise: res.frise, notifications: res.notifications,
    dossierId: res.stepper.id, numeroDecret: res.numeroDecret
  });

  const prevCode = prev?.derived?.statutCode || null;
  let held = false;
  if (prevCode && derived.coarse && U.isRegression(prevCode, derived.statutCode)) {
    derived.heldFrom = derived.statutCode;
    derived.statutCode = prevCode;
    held = true;
  }
  const code = derived.statutCode;
  const changed = !!prevCode && prevCode !== code;

  let since;
  if (prev && !changed) since = prev.since;
  else {
    const ds = res.stepper.date_statut;
    const okDs = ds && !isNaN(new Date(ds)) && new Date(ds) <= new Date();
    since = prev ? (okDs && (!prev.since || new Date(ds) > new Date(prev.since)) ? ds : now) : (okDs ? ds : now);
  }

  if (!prevCode || changed) {
    history.push({ code, since, seenAt: now, from: derived.derivedFrom });
    while (history.length > 200) history.shift();
  }

  const dossier = { id: res.stepper.id, derived, info: extractInfo(res), dmr: res.dmr, since, updatedAt: now, held };
  await set({ dossier, history, raw: { ...res, detail: minimalDetail(res.detail), dmr: res.dmr ? { statut: res.dmr.statut, date_depot: res.dmr.date_depot ?? null } : null } });
  await patchState({ lastCheck: now, lastSuccess: now, lastError: null, lastErrorDetail: null, via });
  await setBadge(code);

  if (changed) {
    const i = U.statusInfo(code);
    await notify(`${i.icon} Étape ${i.etape}/12 — ${i.phase}`, i.explication);
  }
  const prevEvents = prev?.derived?.timeline?.length ?? null;
  if (prevEvents != null && derived.timeline.length > prevEvents) {
    const e = derived.timeline[derived.timeline.length - 1];
    await notify(`${e.icon} Nouvel événement ANEF`, `${e.label} — ${U.fmtDate(e.date)}`);
  }
  return true;
}

let pending = null;
function waitForTab(tabId, ms, kind) {
  return new Promise((resolve) => {
    const me = { tabId, kind };
    const done = (r) => { clearTimeout(timer); if (pending === me) pending = null; resolve(r); };
    const timer = setTimeout(() => done({ ok: false, error: 'timeout' }), ms);
    me.resolve = done;
    pending = me;
  });
}

async function windowRefresh() {
  let win = null;
  try {
    win = await chrome.windows.create({ url: 'about:blank', state: 'minimized' });
    const tabId = win.tabs[0].id;
    await set({ _refreshWin: win.id });
    const wait = waitForTab(tabId, 45000, 'window');
    await chrome.tabs.update(tabId, { url: MON_COMPTE });
    const loginWatch = setInterval(async () => {
      try {
        const t = await chrome.tabs.get(tabId);
        if (/connexion-inscription|sso\.|\/auth|\/login/.test(t.url || '')) {
          clearInterval(loginWatch);
          pending?.resolve({ ok: false, error: 'session' });
        }
      } catch { clearInterval(loginWatch); }
    }, 1500);
    const res = await wait;
    clearInterval(loginWatch);
    return res;
  } finally {
    if (win) { try { await chrome.windows.remove(win.id); } catch { /* déjà fermée */ } }
    await chrome.storage.local.remove('_refreshWin');
  }
}

async function cleanupOrphanWindow() {
  const { _refreshWin } = await get('_refreshWin');
  if (_refreshWin) { try { await chrome.windows.remove(_refreshWin); } catch { /* */ } await chrome.storage.local.remove('_refreshWin'); }
}

let checking = null;
async function runCheck(trigger) {
  if (checking) return checking;
  checking = (async () => {
    const s = await settings();
    const tabs = await chrome.tabs.query({ url: ANEF + '/*' });
    const live = tabs.find(t => (t.url || '').includes('mon-compte'));
    if (live) {
      const wait = waitForTab(live.id, 20000, 'tab');
      let sent = true;
      try { await chrome.tabs.sendMessage(live.id, { type: 'TRIGGER' }); }
      catch { sent = false; pending?.resolve({ ok: false, error: 'no_bridge' }); }
      const r = await wait;
      if (sent && r.error !== 'timeout') return r;
    }

    let res = await ANEFCollect.collect();
    if (res.ok) { await processResult(res, 'direct'); return res; }

    const { state = {} } = await get('state');
    const allowWindow = s.fallbackWindow && (res.error === 'session' || res.error === 'network')
      && (trigger === 'manual' || state.lastError !== 'session');
    if (allowWindow) {
      res = await windowRefresh();
      if (!res.ok && res.error !== 'timeout') await processResult(res, 'window');
      else if (!res.ok) await patchState({ lastCheck: new Date().toISOString(), lastError: 'timeout', via: 'window' });
      return res;
    }
    await processResult(res, 'direct');
    return res;
  })();
  try { return await checking; } finally { checking = null; }
}

async function schedule() {
  const s = await settings();
  await chrome.alarms.clear(ALARM);
  if (s.autoCheck) {
    const p = Math.max(30, Number(s.intervalMin) || 60);
    await chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: p });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await cleanupOrphanWindow();
  const { raw } = await get('raw');
  if (raw?.detail?.demande) await set({ raw: { ...raw, detail: minimalDetail(raw.detail) } });
  await schedule();
});
chrome.runtime.onStartup.addListener(async () => { await cleanupOrphanWindow(); await schedule(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) runCheck('alarm'); });
chrome.notifications.onClicked.addListener(() => chrome.tabs.create({ url: MON_COMPTE }));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch (msg?.type) {
      case 'ANEF_RESULT': {
        const p = pending && sender.tab?.id === pending.tabId ? pending : null;
        const isWindow = p?.kind === 'window';
        if (msg.payload?.ok || !isWindow) await processResult(msg.payload, isWindow ? 'window' : 'page');
        p?.resolve(msg.payload);
        return reply({ ok: true });
      }
      case 'REFRESH': return reply(await runCheck('manual'));
      case 'SAVE_SETTINGS': {
        await set({ settings: { ...(await settings()), ...msg.settings } });
        await schedule();
        return reply({ ok: true });
      }
      case 'OPEN_ANEF': await chrome.tabs.create({ url: MON_COMPTE }); return reply({ ok: true });
      case 'CLEAR': {
        await chrome.storage.local.remove(['dossier', 'history', 'raw', 'state']);
        await chrome.action.setBadgeText({ text: '' });
        return reply({ ok: true });
      }
      case 'PAGE_READY': return reply({ ok: true });
      default: return reply({ ok: false });
    }
  })();
  return true;
});
