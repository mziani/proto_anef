/* Recombinaison des signaux ANEF (stepper + frise + notifications + détail) en statut.
 * Logique reprise de Letranger-dev/anef-extension lib/anef-mapper.js (MIT) — voir THIRD_PARTY.md */
(function (g) {
  'use strict';

  const BASE = ['demande_envoyee', 'demande_envoyee', 'examen_pieces', 'demande_deposee', 'traitement_instruction',
    'recepisse_completude', 'traitement_instruction_2', 'entretien_assimilation', 'traitement_plateforme_3'];

  function friseKeys(typeFrise, hasScec) {
    const t = String(typeFrise || '').trim().toUpperCase();
    const arr = (a) => Object.fromEntries(a.map((k, i) => [i, k]));
    switch (t) {
      case 'DECISION_RAPO': return {};
      case 'DECISION_PLATEFORME_AVANT_VF': return arr(['demande_envoyee', 'demande_envoyee', 'examen_pieces', 'traitement_instruction', 'decision_prefecture']);
      case 'DECISION_PLATEFORME_AVANT_RECEPISSE_COMPLETUDE': return arr([...BASE.slice(0, 5), 'decision_prefecture']);
      case 'DECISION_PLATEFORME_AVANT_EA': return arr([...BASE.slice(0, 7), 'decision_prefecture']);
      case 'DECISION_PLATEFORME_APRES_EA': return arr([...BASE, 'decision_prefecture']);
      case 'DECISION_SDANF_AVANT_SCEC': return arr([...BASE, 'traitement_sdanf_1', 'decision_prise']);
      case 'DECISION_SDANF_APRES_SCEC': return arr([...BASE, 'traitement_sdanf_1', 'traitement_scec', 'traitement_sdanf_2', 'decision_prise']);
    }
    if (t === 'COMPLET' && hasScec === false) return arr([...BASE, 'traitement_sdanf_1', 'decision_prise', 'ceremonie_naturalisation']);
    return arr([...BASE, 'traitement_sdanf_1', 'traitement_scec', 'traitement_sdanf_2', 'decision_prise', 'ceremonie_naturalisation']);
  }

  function friseToCode(k, ctx) {
    switch (k) {
      case 'demande_envoyee': return 'dossier_depose';
      case 'examen_pieces': return 'verification_formelle_en_cours';
      case 'demande_deposee': return 'instruction_a_affecter';
      case 'traitement_instruction': return 'instruction_recepisse_completude_a_envoyer';
      case 'traitement_instruction_2':
      case 'recepisse_completude': return 'instruction_date_ea_a_fixer';
      case 'entretien_assimilation': return 'ea_en_attente_ea';
      case 'traitement_plateforme_3': return 'prop_decision_pref_a_effectuer';
      case 'decision_prefecture': return ctx.decisionAvailable ? 'decision_notifiee' : 'prop_decision_pref_a_effectuer';
      case 'traitement_sdanf_1': return 'controle_sdanf';
      case 'traitement_scec': return 'controle_en_attente_pec';
      case 'traitement_sdanf_2': return 'controle_en_attente_retour_hierarchique';
      case 'ceremonie_naturalisation': return 'decret_naturalisation_publie';
      case 'decision_prise':
        if (ctx.inDecretPipeline) return 'prete_pour_insertion_decret';
        if (ctx.decisionAvailable) return 'decision_notifiee';
        return 'controle_en_attente_retour_hierarchique';
      default: return null;
    }
  }

  function parseStatut(statut) {
    let raw = statut && typeof statut === 'object' ? (statut.type ?? statut.code ?? statut.value ?? statut.statut ?? '') : statut;
    raw = String(raw || '').trim();
    try { raw = decodeURIComponent(raw); } catch { /* brut */ }
    const tokens = raw.split('|').map(t => t.trim()).filter(Boolean);
    const macro = (tokens.shift() || '').toUpperCase();
    return { macro, flags: tokens.filter(t => !t.includes('.')).map(t => t.toUpperCase()), raw };
  }

  const MACRO_CODE = {
    DEMANDE_EN_COURS_DE_TRAITEMENT: 'instruction_recepisse_completude_a_envoyer',
    DECISION_FAVORABLE: 'controle_transmise_pour_decret',
    DEMANDE_FAVORABLE: 'controle_transmise_pour_decret',
    DECISION_DEFAVORABLE: 'decision_negative_en_delais_recours',
    DEMANDE_REJETEE: 'decision_negative_en_delais_recours',
    DEMANDE_AJOURNEE: 'decision_notifiee',
    DEMANDE_CLASSEE_SANS_SUITE: 'css_notifie',
    DEMANDE_IRRECEVABLE: 'irrecevabilite_manifeste',
    DECRET_PUBLIE: 'decret_naturalisation_publie',
    DECRET_NATURALISATION_PUBLIE: 'decret_naturalisation_publie',
    NATURALISATION_PUBLIEE: 'decret_naturalisation_publie',
    DECISION_NOTIFIEE: 'decision_notifiee',
    DEMANDE_TRAITEE: 'demande_traitee'
  };
  const TERMINAL_MACROS = new Set(['DECISION_NOTIFIEE', 'DECISION_DEFAVORABLE', 'DEMANDE_REJETEE', 'DEMANDE_AJOURNEE',
    'DEMANDE_CLASSEE_SANS_SUITE', 'DEMANDE_IRRECEVABLE', 'DEMANDE_TRAITEE', 'DECRET_PUBLIE']);
  const TERMINAL_CODES = new Set(['decision_notifiee', 'decision_negative_en_delais_recours', 'css_notifie',
    'irrecevabilite_manifeste', 'decret_naturalisation_publie', 'demande_traitee']);
  const POST_DECISION = new Set(['decision_prefecture', 'decision_prise', 'ceremonie_naturalisation']);
  const DECISION_MACROS = new Set(['DECISION_FAVORABLE', 'DEMANDE_FAVORABLE']);
  const DECISION_MOTIFS = new Set(['DECISION_FAVORABLE', 'DECISION_DEFAVORABLE', 'DECRET_PUBLIE', 'CLASSEMENT_SANS_SUITE']);
  const PUBLISHED = ['decret_naturalisation_publie', 'decret_naturalisation_publie_jo', 'decret_publie', 'demande_traitee'];
  const isPublishedMacro = (m) => /PUBLI/.test(m) && /(DECRET|NATURALISATION)/.test(m);

  const MOTIFS = {
    CONFIRMATION_DEPOT: ['Dépôt confirmé', '📨', 'dossier_depose'],
    RECEPISSE_DEPOT_ENVOYE: ['Récépissé de dépôt envoyé', '🧾', 'instruction_a_affecter'],
    DEMANDE_COMPLEMENT_INSTRUCTION: ['Demande de complément', '📎'],
    RECEPISSE_COMPLETUDE_ENVOYE: ['Récépissé de complétude', '✅', 'instruction_date_ea_a_fixer'],
    ENTRETIEN_ASSIMILATION_FIXE: ["Entretien d'assimilation fixé", '🗓️', 'ea_en_attente_ea'],
    ENTRETIEN_ASSIMILATION_REPORTE: ['Entretien reporté', '🔄', 'ea_demande_report_ea'],
    DECISION_FAVORABLE: ['Décision favorable', '🎉', 'controle_transmise_pour_decret'],
    DECISION_DEFAVORABLE: ['Décision défavorable', '❌', 'decision_negative_en_delais_recours'],
    DECRET_PUBLIE: ['Décret publié au JO', '🏅', 'decret_naturalisation_publie'],
    CLASSEMENT_SANS_SUITE: ['Classement sans suite', '⚠️', 'css_notifie'],
    MISE_EN_DEMEURE: ['Mise en demeure', '⚠️', 'verification_formelle_mise_en_demeure']
  };
  const humanize = (m) => { const s = m.toLowerCase().replace(/_/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : 'Événement'; };

  function buildTimeline(notifs, dossierId) {
    const items = Array.isArray(notifs) ? notifs : (notifs?._items || notifs?.items || notifs?.data || []);
    const want = dossierId != null ? String(dossierId) : null;
    return items
      .filter(n => String(n.type_notification || '').toUpperCase() === 'NATIONALITE')
      .filter(n => want == null || String(n.id_demande) === want)
      .map(n => {
        const motif = String(n.motif_notification || '').toUpperCase();
        const [label, icon, code] = MOTIFS[motif] || [humanize(motif), '•'];
        return { date: n._created || n.date_creation || n.date, motif, label, icon, code: code || null };
      })
      .filter(e => e.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function derive({ statut, frise, notifications, dossierId, numeroDecret }) {
    const { macro, flags, raw } = parseStatut(statut);
    const has = (f) => flags.includes(f);
    const fDecision = has('SHOW_DECISION_DOWNLOAD_BUTTON');
    const fPipeline = has('CAN_ACCESS_DESISTEMENT_NAT_DECRET') || has('CAN_ACCESS_DESISTEMENT_NAT');
    const completed = has('STATUT_DOSSIER_COMPLETED');
    const timeline = buildTimeline(notifications, dossierId);

    let friseKey = null, friseIndex = null, friseTotal = null;
    const ra = frise?.id_active;
    const idActive = (typeof ra === 'number' || (typeof ra === 'string' && ra.trim() !== '')) ? Number(ra) : NaN;
    if (Number.isInteger(idActive) && idActive >= 0) {
      const keys = friseKeys(frise?.type_frise, frise?.has_step_scec);
      const idx = Object.keys(keys).map(Number);
      friseTotal = idx.length ? Math.max(...idx) : null;
      friseIndex = idActive;
      friseKey = keys[idActive] || null;
    }

    const decretAssigned = numeroDecret != null && String(numeroDecret).trim() !== '';
    const last = timeline[timeline.length - 1] || null;
    const corroborated = friseKey == null || POST_DECISION.has(friseKey) || decretAssigned || completed
      || TERMINAL_MACROS.has(macro) || DECISION_MACROS.has(macro) || isPublishedMacro(macro)
      || (!!last && DECISION_MOTIFS.has(last.motif));
    const decisionAvailable = corroborated && fDecision;
    const inDecretPipeline = corroborated && fPipeline;

    const fc = friseKey ? friseToCode(friseKey, { decisionAvailable, inDecretPipeline }) : null;
    const mc = MACRO_CODE[macro] || null;
    const tc = last ? last.code : null;
    let derivedFrom = fc ? 'frise' : mc ? 'macro' : tc ? 'timeline' : null;
    let code = fc || mc || tc || null;

    if (decisionAvailable && inDecretPipeline && friseKey === 'decision_prise') { code = 'inseree_dans_decret'; derivedFrom = 'signal'; }
    if (decretAssigned && !PUBLISHED.includes(code)) {
      code = friseKey === 'ceremonie_naturalisation' ? 'decret_naturalisation_publie' : 'inseree_dans_decret';
      derivedFrom = 'signal';
    }
    if (completed && decretAssigned) { code = 'decret_naturalisation_publie'; derivedFrom = 'signal'; }
    else if (completed && TERMINAL_MACROS.has(macro)) { code = MACRO_CODE[macro] || code; derivedFrom = 'signal'; }
    if (isPublishedMacro(macro) || timeline.some(e => e.motif === 'DECRET_PUBLIE')) { code = 'decret_naturalisation_publie'; derivedFrom = 'signal'; }

    return {
      statutCode: code, derivedFrom,
      coarse: (derivedFrom === 'macro' || derivedFrom === 'timeline') && !TERMINAL_CODES.has(code),
      statutRaw: raw, macro, flags, friseKey, friseIndex, friseTotal, typeFrise: frise?.type_frise ?? null,
      decretAssigned, numeroDecret: decretAssigned ? String(numeroDecret) : null,
      decisionAvailable, inDecretPipeline, canRapo: flags.some(f => f.includes('RAPO')), completed,
      complementPending: timeline.some(e => e.motif === 'DEMANDE_COMPLEMENT_INSTRUCTION'),
      timeline
    };
  }

  g.ANEFMapper = { derive, parseStatut, buildTimeline };
})(globalThis);
