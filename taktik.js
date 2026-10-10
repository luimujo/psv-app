/* PSV Wesel-Lackhausen – Taktiktafel (ab 2.2). Reine Logik + SVG-Erzeugung (ohne DOM), in Node testbar.
   Koordinaten in Metern: x längs (0 = eigenes Tor links, L = gegnerisches Tor), y quer (0 = oben). Eigenes Team (B, blau) spielt nach rechts. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.PSVTaktik = factory(root.PSVEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  var VEREIN = 'PSV Wesel-Lackhausen';
  // Jugend-Spielfelder (DFB-Richtwerte, gerundet): 7er ~50×35 m, 9er ~70×50 m, 11er 105×68 m
  var FELDER = {
    '7': { L: 50, B: 35, tor: 5, sr: [10, 20], ta: null, punkt: 8, kreis: 5, name: '7er-Feld (ca. 50×35 m)' },
    '9': { L: 70, B: 50, tor: 5, sr: [13, 30], ta: [5, 12], punkt: 9, kreis: 7, name: '9er-Feld (ca. 70×50 m)' },
    '11': { L: 105, B: 68, tor: 7.32, sr: [16.5, 40.32], ta: [5.5, 18.32], punkt: 11, kreis: 9.15, name: '11er-Feld (105×68 m)' }
  };
  var FORM11 = {   // aus der Vorlage (Meter auf 105×68, eigene Hälfte)
    '11-433': ['4-3-3', [[5, 34, 'TW'], [22, 10, 'LV'], [18, 26, 'IV'], [18, 42, 'IV'], [22, 58, 'RV'], [32, 34, 'ZDM'], [40, 22, 'ZM'], [40, 46, 'ZM'], [50, 10, 'LA'], [52, 34, 'ST'], [50, 58, 'RA']]],
    '11-442': ['4-4-2', [[5, 34, 'TW'], [22, 10, 'LV'], [18, 26, 'IV'], [18, 42, 'IV'], [22, 58, 'RV'], [36, 10, 'LM'], [34, 27, 'ZM'], [34, 41, 'ZM'], [36, 58, 'RM'], [50, 27, 'ST'], [50, 41, 'ST']]],
    '11-352': ['3-5-2', [[5, 34, 'TW'], [18, 20, 'IV'], [17, 34, 'IV'], [18, 48, 'IV'], [34, 7, 'LAV'], [30, 27, 'ZDM'], [30, 41, 'ZDM'], [38, 34, 'ZOM'], [34, 61, 'RAV'], [50, 27, 'ST'], [50, 41, 'ST']]],
    '11-4231': ['4-2-3-1', [[5, 34, 'TW'], [22, 10, 'LV'], [18, 26, 'IV'], [18, 42, 'IV'], [22, 58, 'RV'], [30, 27, 'ZDM'], [30, 41, 'ZDM'], [42, 12, 'LA'], [42, 34, 'ZOM'], [42, 56, 'RA'], [52, 34, 'ST']]]
  };
  var FARBEN = ['#000000', '#ffd800', '#e00000', '#ffffff'];
  var WERKZEUGE = { move: '✋ Bewegen', run: '━ Laufweg', pass: '┄ Pass', dribble: '〰 Dribbling', zone: '▦ Zone' };
  var ELEMENTE = { cone: '🔺 Hütchen', pole: '| Stange', goal: '⊓ Minitor', dummy: '▮ Dummy' };

  function initialen(n) { var w = String(n || '').trim().split(/\s+/); return ((w[0] || '').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase(); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function feld(g) { return FELDER[String(g)] || FELDER['9']; }
  function u(g) { return 0.5 + feld(g).L / 210; }   // Größenfaktor für Symbole/Linien
  function neueId(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---------- Formationen ----------
  function formationen(g) {   // [{code,name,slots:[[x,y,pos]] in Metern}]
    g = String(g); var F = feld(g);
    if (g === '11') return Object.keys(FORM11).map(function (c) { return { code: c, name: '11er · ' + FORM11[c][0], slots: FORM11[c][1].map(function (s) { return [r2(s[0] * 0.95), s[1], s[2]]; }) }; });
    return E.PITCHES.filter(function (p) { return p.size === g; }).map(function (p) { return { code: p.code, name: p.name, slots: p.slots.map(function (s) { var m = slotMeter(s[1], s[2], g); return [m[0], m[1], s[0]]; }) }; });
  }
  function slotMeter(sx, sy, g) { var F = feld(g); return [r2((100 - sy) / 100 * F.L * 0.58), r2(sx / 100 * F.B)]; }   // App-Feld (hochkant) → Meter
  function formation(g, code) { var L = formationen(g); for (var i = 0; i < L.length; i++) if (L[i].code === code) return L[i]; return L[0]; }
  function spiegeln(p, g) { var F = feld(g); return [r2(F.L - p[0]), r2(F.B - p[1])]; }
  function standardFormation(g, team) { g = String(g); if (g === '11') return team === 'R' ? '11-442' : '11-433'; return E.STANDARD_PAAR[g][0]; }

  // ---------- Tafel ----------
  function neu(o) {
    o = o || {}; var g = String(o.groesse || '9');
    var b = { id: neueId('tk'), name: o.name || 'Neue Taktik', groesse: g, halb: false, anzeige: 'foto', spieler: [], ball: { x: r2(feld(g).L / 2), y: r2(feld(g).B / 2) }, items: [], lines: [], steps: [],
      stId: o.stId || null, gegnerId: o.gegnerId || null, gegnerName: o.gegnerName || '', erstellt: new Date().toISOString(), geaendert: new Date().toISOString() };
    if (o.ohneSpieler !== true) { formationSetzen(b, 'B', standardFormation(g, 'B'), true); formationSetzen(b, 'R', standardFormation(g, 'R'), true); }
    return b;
  }
  function team(b, t) { return b.spieler.filter(function (s) { return s.team === t; }); }
  function formationSetzen(b, t, code, auffuellen) {
    var f = formation(b.groesse, code), toks = team(b, t), frei = toks.slice();
    var plaetze = f.slots.map(function (s) { var p = t === 'B' ? [s[0], s[1]] : spiegeln(s, b.groesse); return { x: p[0], y: p[1], pos: s[2] }; });
    var belegt = plaetze.map(function () { return null; });
    plaetze.forEach(function (pl, i) {   // zuerst gleiche Position (eigene Kinder bleiben auf ihrer Position)
      var k = frei.findIndex(function (s) { return s.pos && s.pos === pl.pos; }); if (k >= 0) { belegt[i] = frei[k]; frei.splice(k, 1); }
    });
    plaetze.forEach(function (pl, i) { if (!belegt[i] && frei.length) belegt[i] = frei.shift(); });
    plaetze.forEach(function (pl, i) {
      var s = belegt[i];
      if (!s) { if (auffuellen === false) return; s = { id: neueId(t), team: t, pid: null, label: t === 'R' ? String(naechsteNr(b, 'R')) : '', pos: pl.pos, name: '' }; b.spieler.push(s); }
      s.x = pl.x; s.y = pl.y; if (!s.pid || !s.pos) s.pos = pl.pos;
    });
    frei.forEach(function (s) { if (s.pid) b.spieler.splice(b.spieler.indexOf(s), 1); });   // überzählige Kinder → Bank
    if (t === 'R' && auffuellen !== false) frei.forEach(function (s) { b.spieler.splice(b.spieler.indexOf(s), 1); });
    return b;
  }
  function naechsteNr(b, t) { var n = team(b, t).map(function (s) { return parseInt(s.label, 10) || 0; }); var i = 1; while (n.indexOf(i) >= 0) i++; return i; }
  // Aufstellung übernehmen: slots = [{pid,pos,sx,sy,kapitaen}] (App-Feld-Koordinaten) → eigene Tokens ersetzen
  function aufstellungSetzen(b, slots) {
    b.spieler = b.spieler.filter(function (s) { return s.team !== 'B'; });
    slots.forEach(function (sl) {
      var m = slotMeter(sl.sx, sl.sy, b.groesse);
      b.spieler.push({ id: neueId('B'), team: 'B', pid: sl.pid || null, label: '', pos: sl.pos, name: '', x: m[0], y: m[1], kap: !!sl.kapitaen });
    });
    return b;
  }
  function bank(b, verfuegbar) { var drin = {}; team(b, 'B').forEach(function (s) { if (s.pid) drin[s.pid] = 1; }); return verfuegbar.filter(function (p) { return !drin[p.id]; }); }
  function einwechseln(b, pid, x, y, pos) { var s = { id: neueId('B'), team: 'B', pid: pid, label: '', pos: pos || '', name: '', x: r2(x), y: r2(y) }; b.spieler.push(s); return s; }
  function zurBank(b, id) { b.spieler = b.spieler.filter(function (s) { return s.id !== id; }); }
  function groesseAendern(b, g) {   // Positionen proportional umrechnen
    g = String(g); if (g === b.groesse) return b;
    var A = feld(b.groesse), N = feld(g), sx = N.L / A.L, sy = N.B / A.B, f = function (o) { o.x = r2(o.x * sx); o.y = r2(o.y * sy); };
    b.spieler.forEach(f); b.items.forEach(f); f(b.ball);
    b.lines.forEach(function (l) { l.pts = l.pts.map(function (p) { return [r2(p[0] * sx), r2(p[1] * sy)]; }); });
    b.steps.forEach(function (st) { Object.keys(st.spieler).forEach(function (k) { st.spieler[k] = [r2(st.spieler[k][0] * sx), r2(st.spieler[k][1] * sy)]; }); st.ball = { x: r2(st.ball.x * sx), y: r2(st.ball.y * sy) };
      Object.keys(st.items).forEach(function (k) { st.items[k] = [r2(st.items[k][0] * sx), r2(st.items[k][1] * sy)]; }); st.lines.forEach(function (l) { l.pts = l.pts.map(function (p) { return [r2(p[0] * sx), r2(p[1] * sy)]; }); }); });
    b.groesse = g; return b;
  }
  function kaderEinfuegen(b, text, posAnzeigen) {   // Vorlage: „Nummer;Name;Position“ je Zeile → blaue Tokens der Reihe nach
    var rows = String(text || '').split(/\r?\n/).map(function (r) { return r.split(/[;\t,]/).map(function (s) { return s.trim(); }); }).filter(function (r) { return r[0] || r[1]; });
    var toks = team(b, 'B'); rows.slice(0, toks.length).forEach(function (r, i) { var s = toks[i]; s.pid = null; s.kap = false; s.label = r[0] || ''; s.name = r[1] || ''; if (r[2]) s.pos = r[2]; });
    if (posAnzeigen) b.anzeige = 'pos';
    return Math.min(rows.length, toks.length);
  }
  function elementHinzu(b, typ, x, y) { var it = { id: neueId('i'), type: typ, x: r2(x), y: r2(y) }; b.items.push(it); return it; }

  // ---------- Schritte / Animation ----------
  function schnappschuss(b) {
    var sp = {}, it = {}; b.spieler.forEach(function (s) { sp[s.id] = [s.x, s.y]; }); b.items.forEach(function (i) { it[i.id] = [i.x, i.y]; });
    return { spieler: sp, ball: { x: b.ball.x, y: b.ball.y }, items: it, lines: clone(b.lines) };
  }
  function zwischen(b, a, z, t) {   // Zustand zwischen zwei Schritten (t 0..1); Linien springen am Ende
    var L = function (p, q) { return p + (q - p) * t; };
    b.spieler.forEach(function (s) { var p = a.spieler[s.id], q = z.spieler[s.id] || p; if (p) { s.x = r2(L(p[0], q[0])); s.y = r2(L(p[1], q[1])); } });
    b.items.forEach(function (i) { var p = a.items[i.id], q = z.items[i.id] || p; if (p) { i.x = r2(L(p[0], q[0])); i.y = r2(L(p[1], q[1])); } });
    b.ball = { x: r2(L(a.ball.x, z.ball.x)), y: r2(L(a.ball.y, z.ball.y)) }; b.lines = clone((t < 1 ? a : z).lines);
    return b;
  }
  function easing(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // ---------- SVG ----------
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function viewBox(b) { var F = feld(b.groesse), m = 3 * u(b.groesse); return b.halb ? [r2(F.L / 2 - m), r2(-m - 2 * u(b.groesse)), r2(F.L / 2 + 2 * m), r2(F.B + 2 * m + 2 * u(b.groesse))] : [-m, r2(-m - 2 * u(b.groesse)), r2(F.L + 2 * m), r2(F.B + 2 * m + 2 * u(b.groesse))]; }
  function feldSvg(g) {
    var F = feld(g), k = u(g), sw = 0.15 * k + 0.08, h = '', m = 3 * k;
    h += '<rect x="' + (-m) + '" y="' + (-m - 2 * k) + '" width="' + (F.L + 2 * m) + '" height="' + (F.B + 2 * m + 2 * k) + '" fill="#2e8b3e"/>';
    for (var i = 0; i < 10; i++) h += '<rect x="' + r2(i * F.L / 10) + '" y="0" width="' + r2(F.L / 10) + '" height="' + F.B + '" fill="' + (i % 2 ? '#2a8238' : '#2e8b3e') + '"/>';
    h += '<g fill="none" stroke="#fff" stroke-width="' + r2(sw) + '"><rect x="0" y="0" width="' + F.L + '" height="' + F.B + '"/><line x1="' + F.L / 2 + '" y1="0" x2="' + F.L / 2 + '" y2="' + F.B + '"/>' +
      '<circle cx="' + F.L / 2 + '" cy="' + F.B / 2 + '" r="' + F.kreis + '"/><circle cx="' + F.L / 2 + '" cy="' + F.B / 2 + '" r="' + r2(sw * 1.5) + '" fill="#fff"/>';
    [0, 1].forEach(function (s) {
      var X = function (v) { return r2(s ? F.L - v : v); };
      h += '<rect x="' + (s ? r2(F.L - F.sr[0]) : 0) + '" y="' + r2((F.B - F.sr[1]) / 2) + '" width="' + F.sr[0] + '" height="' + F.sr[1] + '"/>';
      if (F.ta) h += '<rect x="' + (s ? r2(F.L - F.ta[0]) : 0) + '" y="' + r2((F.B - F.ta[1]) / 2) + '" width="' + F.ta[0] + '" height="' + F.ta[1] + '"/>';
      h += '<circle cx="' + X(F.punkt) + '" cy="' + F.B / 2 + '" r="' + r2(sw * 1.5) + '" fill="#fff"/>';
      var tt = r2(1.2 * k + (g === '11' ? 0.8 : 0));   // Tortiefe (Jugendtore kleiner)
      h += '<rect x="' + (s ? F.L : r2(-tt)) + '" y="' + r2((F.B - F.tor) / 2) + '" width="' + tt + '" height="' + F.tor + '" stroke-width="' + r2(sw * 1.4) + '"/>';
    });
    return h + '</g>';
  }
  function zig(pts, k) {
    if (pts.length < 2) return ''; var st = 1.2 * k, a2 = 0.7 * k, acc = 0, sgn = 1, d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
      var nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      for (var t = st - acc; t < L; t += st) { var x = a[0] + (b[0] - a[0]) * t / L, y = a[1] + (b[1] - a[1]) * t / L, last = i === pts.length - 1 && t > L - 2.5 * k; d += ' L' + r2(x + (last ? 0 : nx * a2 * sgn)) + ' ' + r2(y + (last ? 0 : ny * a2 * sgn)); sgn = -sgn; acc = L - t; }
      acc = acc % st;
    }
    var e = pts[pts.length - 1]; return d + ' L' + e[0] + ' ' + e[1];
  }
  function linieSvg(l, g) {
    var k = u(g);
    if (l.kind === 'zone') { var a = l.pts[0], z = l.pts[l.pts.length - 1]; return '<rect x="' + Math.min(a[0], z[0]) + '" y="' + Math.min(a[1], z[1]) + '" width="' + r2(Math.abs(z[0] - a[0])) + '" height="' + r2(Math.abs(z[1] - a[1])) + '" fill="' + l.color + '" fill-opacity=".3" stroke="' + l.color + '" stroke-opacity=".6" stroke-width="' + r2(0.2 * k) + '"/>'; }
    var d = l.kind === 'dribble' ? zig(l.pts, k) : 'M' + l.pts.map(function (p) { return p.join(' '); }).join(' L');
    return '<path d="' + d + '" fill="none" stroke="' + l.color + '" stroke-width="' + r2(0.45 * k) + '" stroke-linecap="round" stroke-linejoin="round"' + (l.kind === 'pass' ? ' stroke-dasharray="' + r2(1.2 * k) + ' ' + r2(0.9 * k) + '"' : '') + ' marker-end="url(#tka' + l.color.slice(1) + ')"/>';
  }
  function linienSvg(b, extra) { return b.lines.concat(extra ? [extra] : []).map(function (l) { return linieSvg(l, b.groesse); }).join(''); }
  function itemSvg(it, g) {
    var k = u(g), h = '<g transform="translate(' + it.x + ' ' + it.y + ') scale(' + r2(k) + ')" data-it="' + esc(it.id) + '">';
    if (it.type === 'cone') h += '<path d="M-1 1L0 -1.2L1 1z" fill="#ff7a00" stroke="#000" stroke-width=".1"/>';
    if (it.type === 'pole') h += '<rect x="-.25" y="-2" width=".5" height="4" fill="#ff0" stroke="#000" stroke-width=".1"/>';
    if (it.type === 'goal') h += '<path d="M-2 1V-1H2V1" fill="none" stroke="#fff" stroke-width=".4"/>';
    if (it.type === 'dummy') h += '<rect x="-.9" y="-2" width="1.8" height="4" rx=".8" fill="#555" stroke="#fff" stroke-width=".15"/>';
    return h + '<circle r="2.2" fill="transparent"/></g>';
  }
  // ctx: { spieler: {pid: {name, vorname, nr, foto}}, anzeige }
  function spielerSvg(b, s, ctx) {
    var k = u(b.groesse), r = r2(2.2 * k), p = s.pid && ctx && ctx.spieler ? ctx.spieler[s.pid] : null, anz = b.anzeige || 'foto';
    var blau = s.team === 'B', farbe = blau ? '#1565d8' : '#d32f2f';
    var name = p ? p.vorname : s.name, nr = p ? (p.nr === null || p.nr === undefined ? '' : String(p.nr)) : s.label;
    var h = '<g transform="translate(' + s.x + ' ' + s.y + ')' + (ctx && ctx.hoch ? ' rotate(90)' : '') + '" data-p="' + esc(s.id) + '"><circle r="' + r + '" fill="' + farbe + '" stroke="#fff" stroke-width="' + r2(0.25 * k) + '"/>';
    if (blau && p && p.foto && anz === 'foto') h += '<image href="' + esc(p.foto) + '" x="' + (-r) + '" y="' + (-r) + '" width="' + 2 * r + '" height="' + 2 * r + '" clip-path="url(#tkClip)" preserveAspectRatio="xMidYMid slice"/><circle r="' + r + '" fill="none" stroke="#fff" stroke-width="' + r2(0.25 * k) + '"/>';
    else { var vollName = p ? p.name : s.name, t = anz === 'pos' ? (s.pos || nr) : anz === 'foto' && blau && vollName ? initialen(vollName) : (nr || s.pos || (name ? name.charAt(0) : '')); h += '<text y="' + r2(0.36 * r * (t.length > 2 ? 0.8 : 1)) + '" text-anchor="middle" font-size="' + r2((t.length > 2 ? 0.75 : 1) * r) + '" font-weight="bold" fill="#fff" font-family="sans-serif">' + esc(t) + '</text>'; }
    if (blau && (p || s.name) && anz === 'foto' && nr) h += '<circle cx="' + r2(r * 0.78) + '" cy="' + r2(r * 0.78) + '" r="' + r2(r * 0.42) + '" fill="#0d3c8c" stroke="#fff" stroke-width="' + r2(0.1 * k) + '"/><text x="' + r2(r * 0.78) + '" y="' + r2(r * 0.78 + r * 0.17) + '" text-anchor="middle" font-size="' + r2(r * 0.48) + '" font-weight="bold" fill="#fff" font-family="sans-serif">' + esc(nr) + '</text>';
    if (s.kap) h += '<circle cx="' + r2(-r * 0.8) + '" cy="' + r2(-r * 0.8) + '" r="' + r2(r * 0.4) + '" fill="#ffd800" stroke="#000" stroke-width="' + r2(0.08 * k) + '"/><text x="' + r2(-r * 0.8) + '" y="' + r2(-r * 0.8 + r * 0.17) + '" text-anchor="middle" font-size="' + r2(r * 0.5) + '" font-weight="bold" fill="#000" font-family="sans-serif">C</text>';
    if (blau && s.pos && anz !== 'pos') h += '<text y="' + r2(-r - 0.35 * k) + '" text-anchor="middle" font-size="' + r2(0.95 * k) + '" font-weight="bold" fill="#fff" stroke="#000" stroke-width="' + r2(0.2 * k) + '" paint-order="stroke" font-family="sans-serif">' + esc(s.pos) + '</text>';
    if (name) h += '<text y="' + r2(r + 1.3 * k) + '" text-anchor="middle" font-size="' + r2(1.25 * k) + '" fill="#fff" stroke="#000" stroke-width="' + r2(0.25 * k) + '" paint-order="stroke" font-family="sans-serif">' + esc(name) + '</text>';
    return h + '</g>';
  }
  function ballSvg(b) { var k = u(b.groesse); return '<g transform="translate(' + b.ball.x + ' ' + b.ball.y + ') scale(' + r2(k) + ')" data-ball="1"><circle r="1" fill="#fff" stroke="#000" stroke-width=".2"/><circle r=".35" fill="#000"/><circle r="2" fill="transparent"/></g>'; }
  function defsSvg(b) {
    var r = r2(2.2 * u(b.groesse));
    return '<defs><clipPath id="tkClip"><circle r="' + r + '"/></clipPath>' + FARBEN.map(function (c) { return '<marker id="tka' + c.slice(1) + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + c + '"/></marker>'; }).join('') + '</defs>';
  }
  function kopfSvg(b, ctx) {   // Beschriftung über dem Feld: links eigenes Team, rechts Gegner
    var F = feld(b.groesse), k = u(b.groesse), y = r2(-1.1 * k), x0 = b.halb ? F.L / 2 : 0;
    var g = b.gegnerName || (ctx && ctx.gegnerName) || '';
    return '<text x="' + x0 + '" y="' + y + '" font-size="' + r2(1.5 * k) + '" font-weight="bold" fill="#bfe3c4" font-family="sans-serif">' + esc(VEREIN) + '</text>' +
      (g ? '<text x="' + F.L + '" y="' + y + '" text-anchor="end" font-size="' + r2(1.5 * k) + '" font-weight="bold" fill="#ffb4b4" font-family="sans-serif">Gegner: ' + esc(g) + '</text>' : '');
  }
  function svg(b, ctx, opt) {
    opt = opt || {}; var vb = viewBox(b), hoch = !!(ctx && ctx.hoch);
    if (hoch) vb = [vb[1], r2(-(vb[0] + vb[2])), vb[3], vb[2]];   // Hochformat: Feld gedreht, Angriff nach oben
    var a = 'xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.join(' ') + '"' + (opt.breite ? ' width="' + opt.breite + '" height="' + Math.round(opt.breite * vb[3] / vb[2]) + '"' : '') + (opt.attr ? ' ' + opt.attr : '');
    return '<svg ' + a + '>' + defsSvg(b) + '<g id="tkInhalt"' + (hoch ? ' transform="rotate(-90)"' : '') + '><g id="tkFeldG">' + feldSvg(b.groesse) + (hoch ? '' : kopfSvg(b, ctx)) + '</g><g id="tkLinien">' + linienSvg(b, opt.zeichnen) + '</g><g id="tkItems">' + b.items.map(function (i) { return itemSvg(i, b.groesse); }).join('') +
      '</g><g id="tkSpieler">' + b.spieler.map(function (s) { return spielerSvg(b, s, ctx); }).join('') + '</g>' + ballSvg(b) + '</g></svg>';
  }

  // ---------- PDF (ein Bild, A4 quer) ----------
  function pdf(jpeg, w, h) {
    var W = 842, H = 595, sk = Math.min((W - 40) / w, (H - 40) / h), iw = Math.round(w * sk), ih = Math.round(h * sk), ox = Math.round((W - iw) / 2), oy = Math.round((H - ih) / 2);
    var enc = function (s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; };
    var parts = [], off = [], len = 0, push = function (x) { parts.push(x); len += x.length; };
    push(enc('%PDF-1.4\n'));
    var obj = function (n, s, bin, tail) { off[n] = len; push(enc(n + ' 0 obj\n' + s)); if (bin) { push(bin); push(enc(tail)); } push(enc('\nendobj\n')); };
    obj(1, '<</Type/Catalog/Pages 2 0 R>>'); obj(2, '<</Type/Pages/Kids[3 0 R]/Count 1>>');
    obj(3, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + W + ' ' + H + ']/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>');
    obj(4, '<</Type/XObject/Subtype/Image/Width ' + w + '/Height ' + h + '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + jpeg.length + '>>stream\n', jpeg, '\nendstream');
    var cs = 'q ' + iw + ' 0 0 ' + ih + ' ' + ox + ' ' + oy + ' cm /Im0 Do Q'; obj(5, '<</Length ' + cs.length + '>>stream\n' + cs + '\nendstream');
    var x = len, xr = 'xref\n0 6\n0000000000 65535 f \n'; for (var i = 1; i < 6; i++) xr += String(off[i]).padStart(10, '0') + ' 00000 n \n';
    push(enc(xr + 'trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n' + x + '\n%%EOF'));
    var out = new Uint8Array(len), p = 0; parts.forEach(function (q) { out.set(q, p); p += q.length; }); return out;
  }

  // ---------- Ablage in den App-Daten ----------
  function liste(d) { return d.taktiken || (d.taktiken = []); }
  function speichern(d, b) {
    var L = liste(d), c = clone(b); c.geaendert = new Date().toISOString();
    var i = L.findIndex(function (x) { return x.id === c.id; }); if (i >= 0) L[i] = c; else L.push(c); return c;
  }
  function loeschen(d, id) { d.taktiken = liste(d).filter(function (x) { return x.id !== id; }); }
  function gruppen(d, M) {   // [{titel, tafeln}] – zuerst je Spieltag, dann je Gegner, dann allgemein
    var G = {}, R = [];
    liste(d).slice().sort(function (a, b) { return String(b.geaendert).localeCompare(String(a.geaendert)); }).forEach(function (t) {
      var st = t.stId && M ? M.getSpieltag(d, t.stId) : null, g = !st && t.gegnerId && M ? M.gegnerById(d, t.gegnerId) : null;
      var key = st ? 'st:' + st.id : g ? 'g:' + g.id : 'allg', titel = st ? 'Spieltag ' + M.titel(st) : g ? 'Gegner ' + g.name : 'Allgemein';
      if (!G[key]) { G[key] = { key: key, titel: titel, datum: st ? st.datum || '' : '', tafeln: [] }; R.push(G[key]); }
      G[key].tafeln.push(t);
    });
    return R.sort(function (a, b) { var o = function (x) { return x.key.indexOf('st:') === 0 ? 0 : x.key.indexOf('g:') === 0 ? 1 : 2; }; return o(a) - o(b) || String(b.datum).localeCompare(String(a.datum)) || a.titel.localeCompare(b.titel); });
  }
  function dateiname(b, ext) { return 'Taktik_' + String(b.name || 'Tafel').replace(/[^A-Za-z0-9äöüÄÖÜß_-]+/g, '_').replace(/^_+|_+$/g, '') + '.' + ext; }

  return { initialen: initialen, VEREIN: VEREIN, FELDER: FELDER, FARBEN: FARBEN, WERKZEUGE: WERKZEUGE, ELEMENTE: ELEMENTE, feld: feld, u: u, formationen: formationen, formation: formation, slotMeter: slotMeter,
    standardFormation: standardFormation, neu: neu, team: team, formationSetzen: formationSetzen, aufstellungSetzen: aufstellungSetzen, bank: bank, einwechseln: einwechseln, zurBank: zurBank,
    groesseAendern: groesseAendern, kaderEinfuegen: kaderEinfuegen, elementHinzu: elementHinzu, naechsteNr: naechsteNr, schnappschuss: schnappschuss, zwischen: zwischen, easing: easing,
    viewBox: viewBox, svg: svg, linienSvg: linienSvg, linieSvg: linieSvg, zig: zig, pdf: pdf, liste: liste, speichern: speichern, loeschen: loeschen, gruppen: gruppen, dateiname: dateiname, clone: clone, neueId: neueId };
});
