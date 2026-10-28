(function (g) {
  'use strict';
  const ROOT = 'https://administration-etrangers-en-france.interieur.gouv.fr/api';
  const API = {
    STEPPER: ROOT + '/anf/dossier-stepper',
    FRISE: ROOT + '/anf/usager/dossiers/frise-stepper',
    NOTIFS: ROOT + '/notifications',
    DETAIL: ROOT + '/anf/usager/dossiers/',
    DMR: ROOT + '/anf/usager/dmr'
  };

  async function getJson(url) {
    const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    const ct = r.headers.get('content-type') || '';
    let json = null;
    if (r.ok && ct.includes('json')) { try { json = await r.json(); } catch { /* non JSON */ } }
    return { ok: r.ok, status: r.status, json, redirected: r.redirected };
  }

  const unwrap = (j) => (j && (j.data ?? j)) || null;
  const soft = async (url) => { try { const r = await getJson(url); return unwrap(r.json); } catch { return null; } };

  async function collect() {
    let st;
    try { st = await getJson(API.STEPPER); }
    catch (e) { return { ok: false, error: 'network', detail: String(e.message || e) }; }

    if (st.status === 502 || st.status === 503) return { ok: false, error: 'maintenance', http: st.status };
    if (st.status === 401 || st.status === 403 || (st.ok && !st.json)) return { ok: false, error: 'session', http: st.status };
    if (st.status === 429) return { ok: false, error: 'rate_limited', http: 429 };
    const dossier = st.json?.dossier;
    if (!dossier?.statut) return { ok: false, error: 'no_dossier', http: st.status };

    const [friseRaw, notifRaw] = await Promise.all([soft(API.FRISE), (async () => {
      try { const r = await getJson(API.NOTIFS); return r.json; } catch { return null; }
    })()]);
    const detail = dossier.id ? await soft(API.DETAIL + dossier.id) : null;

    const statut = String(dossier.statut);
    const decretId = (detail?.demande?.informations?.etat_civil?.identites_decrets || [])
      .map(i => i?.decret?.id).find(Boolean) ?? null;
    const dmr = (statut.includes('CAN_ACCESS_DMR') || decretId) ? await soft(API.DMR) : null;

    const notifItems = notifRaw ? (notifRaw._items || notifRaw.items || notifRaw.data || []) : [];
    return {
      ok: true,
      fetchedAt: new Date().toISOString(),
      stepper: { id: dossier.id, statut, date_statut: dossier.date_statut ?? null },
      frise: friseRaw ? { id_active: friseRaw.id_active, type_frise: friseRaw.type_frise, has_step_scec: friseRaw.has_step_scec } : null,
      notifications: notifItems.map(n => ({
        type_notification: n.type_notification, motif_notification: n.motif_notification,
        id_demande: n.id_demande, _created: n._created || n.date_creation || n.date, lu: n.lu
      })),
      numeroDecret: decretId != null ? String(decretId) : null,
      detail,
      dmr: dmr && dmr.statut ? dmr : null
    };
  }

  g.ANEFCollect = { collect, API };
})(globalThis);
