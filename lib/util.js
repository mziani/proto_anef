(function (g) {
  'use strict';
  const TZ = 'Europe/Paris';

  function statusInfo(code) {
    const c = String(code || '').toLowerCase().trim();
    const s = g.STATUTS[c];
    if (s) return { ...s, code: c, found: true };
    return { phase: 'Statut inconnu', explication: code || 'Non disponible', etape: 0, rang: 0,
      description: 'Statut non répertorié.', icon: '❓', code: c, found: false };
  }

  const PROGRESSIVE = new Set([7, 8, 9, 10, 11]);
  function isRegression(oldCode, newCode) {
    const a = statusInfo(oldCode), b = statusInfo(newCode);
    if (!a.etape || !b.etape) return false;
    if (a.etape !== b.etape) return b.etape < a.etape;
    if (!PROGRESSIVE.has(a.etape)) return false;
    return !!a.rang && !!b.rang && b.rang < a.rang;
  }

  const dayFmt = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function dayMs(d) { return new Date(dayFmt.format(d)).getTime(); }

  function daysBetween(a, b) {
    if (!a || !b) return null;
    const x = new Date(a), y = new Date(b);
    if (isNaN(x) || isNaN(y)) return null;
    const d = Math.round((dayMs(y) - dayMs(x)) / 86400000);
    return d >= 0 ? d : null;
  }
  const daysSince = (a) => daysBetween(a, new Date());

  function fmtDuration(j) {
    if (j === 0) return "aujourd'hui";
    if (j == null || j < 0) return '—';
    if (j < 30) return `${j} j`;
    if (j < 365) { const m = Math.floor(j / 30), r = j % 30; return r ? `${m} mois ${r} j` : `${m} mois`; }
    const y = Math.floor(j / 365), r = j % 365, m = Math.floor(r / 30);
    return `${y} an${y > 1 ? 's' : ''}${m ? ` ${m} mois` : ''}`;
  }

  function fmtDate(v, time = false) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return '—';
    const o = { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ };
    if (time) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return d.toLocaleString('fr-FR', o);
  }

  function subStep(rang) {
    const s = rang % 100, e = Math.floor(rang / 100);
    return s ? `${e}.${s}` : String(e);
  }

  function tone(info) {
    const c = info.code;
    if (['decret_naturalisation_publie', 'decret_naturalisation_publie_jo', 'decret_publie'].includes(c)) return 'ok';
    if (c.includes('negative') || c.includes('irrecevab') || c.startsWith('css_') || c === 'decision_notifiee') return 'bad';
    if (info.etape >= 10) return 'warm';
    return 'neutral';
  }

  g.U = { statusInfo, isRegression, daysBetween, daysSince, fmtDuration, fmtDate, subStep, tone };
})(globalThis);
