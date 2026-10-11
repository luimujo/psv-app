/* Kaderkompass – Schiedsrichter-Modus und Schiedsrichterbericht je Spieltag (ab 2.8)
   Uhr = gemeinsame Live-Uhr des Spieltags (st.live). Tore der eigenen Mannschaft/Gegentore laufen über den Spielbericht (Ergebnis synchron),
   Schiedsrichter-Zusätze (Rückennummern Gegner, persönliche Strafen, Vorkommnisse, Spieldaten) liegen in st.sr. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PSVSchiri = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VEREIN = 'PSV Wesel-Lackhausen';
  var STRAFEN = { ermahnung: 'Ermahnung', gelb: 'Gelbe Karte', zeit2: 'Zeitstrafe 2 Min.', zeit5: 'Zeitstrafe 5 Min.', gelbrot: 'Gelb-Rote Karte', rot: 'Rote Karte' };
  var ZEIT = { zeit2: 2, zeit5: 5 };
  var KATEGORIEN = ['Fair-Play', 'Spielabbruch', 'Zuschauerverhalten', 'Platzverhältnisse', 'Verletzung', 'Sonstiges'];
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function h(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sid() { return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function sr(st) {
    var x = st.sr || (st.sr = {});
    x.schiri = x.schiri || { name: '', assistent1: '', assistent2: '', art: 'neutral' };
    x.ereignisse = x.ereignisse || []; x.offizielle = x.offizielle || { heim: '', gast: '' }; x.spielerzahl = x.spielerzahl || { heim: null, gast: null };
    x.wechsel = x.wechsel || { heim: 0, gast: 0 }; x.nachspiel = x.nachspiel || { h1: 0, h2: 0 }; x.unterbrechungen = x.unterbrechungen || [];
    if (!isNum(x.warnMin)) x.warnMin = 1;
    ['spielnummer', 'spielklasse', 'platz', 'besonderes'].forEach(function (k) { if (typeof x[k] !== 'string') x[k] = ''; });
    if (typeof x.passkontrolle !== 'boolean') x.passkontrolle = false;
    return x;
  }
  function wirHeim(st) { return st.ort !== 'Auswärts'; }
  function teams(st) { var g = st.gegner || 'Gegner'; return wirHeim(st) ? { heim: VEREIN, gast: g } : { heim: g, gast: VEREIN }; }
  function unserTeam(st) { return wirHeim(st) ? 'heim' : 'gast'; }
  // ---------- Uhr ----------
  function uhr(st, now) {   // Halbzeit-Countdown aus der Live-Uhr
    var L = st.live; if (!L || L.phase === 'vor') return { phase: 'vor', rest: (L ? L.halbzeit : 30) * 60, halbzeit: 1 };
    var H = L.halbzeit * 60, ab = null, hz = 1;
    if (L.phase === 'h1') ab = L.h1Start; else if (L.phase === 'h2') { ab = L.h2Start; hz = 2; }
    if (ab === null) return { phase: L.phase, rest: L.phase === 'pause' ? H : 0, halbzeit: L.phase === 'pause' ? 2 : 2 };
    var x = st.sr || {}, unterbrochen = (x.unterbrechungen || []).filter(function (u) { return u.hz === hz; }).reduce(function (s, u) { return s + ((u.bis || now) - u.von); }, 0);
    return { phase: L.phase, rest: H - (now - ab) / 1000, halbzeit: hz, vorschlagNachspiel: Math.ceil(unterbrochen / 60000), laeuftUnterbrechung: (x.unterbrechungen || []).some(function (u) { return !u.bis && u.hz === hz; }) };
  }
  function uhrText(sek) { var neg = sek < 0, s = Math.abs(Math.round(sek)), t = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); return neg ? '+' + t : t; }
  function signale(st, now, schon) {   // fällige Signale: Warnung vor Halbzeitende, langer Ton bei 0 (je Halbzeit einmal)
    var u = uhr(st, now), out = []; if (u.phase !== 'h1' && u.phase !== 'h2') return out;
    var x = sr(st), k = u.phase;
    if (x.warnMin > 0 && u.rest <= x.warnMin * 60 && u.rest > 0 && !schon[k + 'w']) { schon[k + 'w'] = true; out.push('warnung'); }
    if (u.rest <= 0 && !schon[k + 'e']) { schon[k + 'e'] = true; schon[k + 'w'] = true; out.push('ende'); }
    return out;
  }
  // ---------- Ereignisse ----------
  function strafe(st, o) { var e = { id: sid(), typ: 'strafe', art: STRAFEN[o.art] ? o.art : 'gelb', team: o.team, nr: o.nr || '', name: o.name || '', pid: o.pid || null, grund: o.grund || '', minute: isNum(o.minute) ? o.minute : null, start: o.start || null, refId: o.refId || null }; sr(st).ereignisse.push(e); return e; }
  function vorkommnis(st, o) { var e = { id: sid(), typ: 'vorkommnis', kategorie: KATEGORIEN.indexOf(o.kategorie) >= 0 ? o.kategorie : 'Sonstiges', team: o.team || '', nr: o.nr || '', name: o.name || '', pid: o.pid || null, text: o.text || '', minute: isNum(o.minute) ? o.minute : null, refId: o.refId || null }; sr(st).ereignisse.push(e); return e; }
  function torInfo(st, o) { var e = { id: sid(), typ: 'torinfo', refId: o.refId, nr: o.nr || '', name: o.name || '' }; sr(st).ereignisse.push(e); return e; }   // Rückennummer des Gegners zu einem Gegentor
  function entfernen(st, id) { var x = sr(st); x.ereignisse = x.ereignisse.filter(function (e) { return e.id !== id; }); }
  function strafenAktiv(st, now) {   // laufende Zeitstrafen mit Restzeit (Sekunden, nur während einer Halbzeit gezählt – einfache Wanduhr)
    return sr(st).ereignisse.filter(function (e) { return e.typ === 'strafe' && ZEIT[e.art] && e.start; }).map(function (e) { var rest = ZEIT[e.art] * 60 - (now - e.start) / 1000; return { ev: e, rest: rest }; }).filter(function (x) { return x.rest > 0; });
  }
  function unterbrechung(st, now) {   // an/aus
    var x = sr(st), u = uhr(st, now), offen = x.unterbrechungen.filter(function (z) { return !z.bis; })[0];
    if (offen) { offen.bis = now; return false; }
    if (u.phase !== 'h1' && u.phase !== 'h2') return false;
    x.unterbrechungen.push({ hz: u.halbzeit, von: now, bis: null }); return true;
  }
  // ---------- Bericht ----------
  function zeitTxt(ms) { if (!ms) return ''; var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function datumTxt(iso) { if (!iso) return ''; var p = iso.split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : iso; }
  function bericht(M, d, st) {
    var x = sr(st), s = M.spielbericht(st), T = teams(st), wir = unserTeam(st), sie = wir === 'heim' ? 'gast' : 'heim', L = st.live || {};
    var H = L.halbzeit || Math.round(M.spielzeitVon(st) / 2);
    var spieler = function (pid) { var p = M.spielerById(d, pid); return p ? { nr: p.nr === null || p.nr === undefined ? '' : String(p.nr), name: p.name || '' } : { nr: '', name: '' }; };
    var info = {}; x.ereignisse.forEach(function (e) { if (e.typ === 'torinfo') info[e.refId] = e; });
    var tore = [];
    s.tore.forEach(function (t) { var p = t.pid ? spieler(t.pid) : { nr: '', name: '' }; tore.push({ minute: t.minute, team: wir, nr: p.nr, name: p.name, elfmeter: !!t.elfmeter }); });
    s.gegen.forEach(function (g) { var i = info[g.id] || {}; tore.push({ minute: g.minute, team: sie, nr: i.nr || '', name: i.name || '', elfmeter: !!g.elfmeter }); });
    var fehlt = s.gegentore - s.gegen.length; for (var k = 0; k < fehlt; k++) tore.push({ minute: null, team: sie, nr: '', name: '' });
    tore.sort(function (a, b) { return (isNum(a.minute) ? a.minute : 999) - (isNum(b.minute) ? b.minute : 999); });
    var st0 = { heim: 0, gast: 0 }; tore.forEach(function (t) { st0[t.team]++; t.stand = st0.heim + ':' + st0.gast; });
    var alleMin = tore.every(function (t) { return isNum(t.minute); }), pause = alleMin ? tore.filter(function (t) { return t.minute <= H; }).reduce(function (a, t) { a[t.team]++; return a; }, { heim: 0, gast: 0 }) : null;
    var strafen = x.ereignisse.filter(function (e) { return e.typ === 'strafe'; }).map(function (e) { var p = e.pid ? spieler(e.pid) : null; return { minute: e.minute, team: e.team, nr: e.nr || (p && p.nr) || '', name: e.name || (p && p.name) || '', art: STRAFEN[e.art], grund: e.grund }; });
    var verkn = {}; x.ereignisse.forEach(function (e) { if (e.refId) verkn[e.refId] = true; });
    s.karten.forEach(function (kk) { if (verkn[kk.id] || kk.art === 'Verletzung') return; var p = spieler(kk.pid), art = { Gelb: 'Gelbe Karte', Rot: 'Rote Karte', Zeitstrafe: 'Zeitstrafe' }[kk.art]; if (art) strafen.push({ minute: kk.minute, team: wir, nr: p.nr, name: p.name, art: art, grund: '' }); });
    strafen.sort(function (a, b) { return (isNum(a.minute) ? a.minute : 999) - (isNum(b.minute) ? b.minute : 999); });
    var vork = x.ereignisse.filter(function (e) { return e.typ === 'vorkommnis'; }).map(function (e) { var p = e.pid ? spieler(e.pid) : null; return { minute: e.minute, kategorie: e.kategorie, team: e.team, nr: e.nr || (p && p.nr) || '', name: e.name || (p && p.name) || '', text: e.text }; });
    s.karten.forEach(function (kk) { if (kk.art !== 'Verletzung' || verkn[kk.id]) return; var p = spieler(kk.pid); vork.push({ minute: kk.minute, kategorie: 'Verletzung', team: wir, nr: p.nr, name: p.name, text: '' }); });
    vork.sort(function (a, b) { return (isNum(a.minute) ? a.minute : 999) - (isNum(b.minute) ? b.minute : 999); });
    var wechsel = { heim: x.wechsel.heim || 0, gast: x.wechsel.gast || 0 }; wechsel[wir] = Math.max(wechsel[wir], s.wechsel.length);
    return { teams: T, datum: datumTxt(st.datum), anstoss: zeitTxt(L.h1Start) || st.uhrzeit || '', ende: zeitTxt(L.h2Ende || L.h1Ende), spielnummer: x.spielnummer, spielklasse: x.spielklasse, platz: x.platz,
      schiri: x.schiri, halbzeit: H, ergebnis: { heim: st0.heim, gast: st0.gast }, pause: pause, tore: tore, strafen: strafen, vorkommnisse: vork, besonderes: x.besonderes, wechsel: wechsel,
      passkontrolle: x.passkontrolle, spielerzahl: x.spielerzahl, offizielle: x.offizielle, nachspiel: x.nachspiel, ohneWertung: !!st.ohneWertung };
  }
  function teamName(b, t) { return t === 'heim' ? b.teams.heim : t === 'gast' ? b.teams.gast : ''; }
  function minTxt(m) { return isNum(m) ? m + '.' : '–'; }
  var CSS = '*{box-sizing:border-box}body{font:12.5px/1.4 Arial,Helvetica,sans-serif;color:#1d2320;margin:0}.blatt{max-width:760px;margin:0 auto;padding:16px}' +
    '.kopf{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1B5E20;padding-bottom:6px}.kopf h1{font-size:19px;margin:0;color:#1B5E20}.kopf .r{text-align:right;color:#555;font-size:11.5px}' +
    'h2{font-size:13.5px;margin:14px 0 5px;color:#1B5E20;border-bottom:1px solid #cfd8cf;padding-bottom:2px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cfd8cf;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2ee;font-weight:700}' +
    '.kv td:first-child{width:34%;background:#f6f8f6;font-weight:700}.erg{font-size:26px;font-weight:800;text-align:center;margin:8px 0 2px}.zen{text-align:center}.mu{color:#5f6b63}.frei{min-height:46px;white-space:pre-wrap}' +
    '.sig{display:flex;gap:18px;margin-top:34px}.sig div{flex:1;border-top:1px solid #333;padding-top:3px;font-size:11px;text-align:center}.fuss{margin-top:16px;font-size:10px;color:#5f6b63;display:flex;justify-content:space-between}' +
    '@page{size:A4 portrait;margin:12mm}@media print{.blatt{padding:0;max-width:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  function html(b) {
    var kv = function (k, v) { return '<tr><td>' + h(k) + '</td><td>' + (v === '' || v === null || v === undefined ? '&nbsp;' : h(v)) + '</td></tr>'; };
    var sz = function (t) { return isNum(b.spielerzahl[t]) ? b.spielerzahl[t] : ''; };
    var r = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + h('Schiedsrichterbericht ' + b.datum + ' ' + b.teams.heim + ' – ' + b.teams.gast) + '</title><style>' + CSS + '</style></head><body><div class="blatt">' +
      '<div class="kopf"><h1>Schiedsrichterbericht</h1><div class="r">' + h(b.spielklasse || '') + (b.spielnummer ? '<br>Spielnummer ' + h(b.spielnummer) : '') + '</div></div>' +
      '<div class="erg">' + h(b.teams.heim) + ' &nbsp;' + b.ergebnis.heim + ' : ' + b.ergebnis.gast + '&nbsp; ' + h(b.teams.gast) + '</div><div class="zen mu">' + (b.pause ? 'Halbzeit ' + b.pause.heim + ' : ' + b.pause.gast : 'Halbzeitstand nicht erfasst') + (b.ohneWertung ? ' · Spiel ohne Wertung' : '') + '</div>' +
      '<h2>Spieldaten</h2><table class="kv">' + kv('Datum', b.datum) + kv('Anstoß / Spielende', (b.anstoss || '–') + ' / ' + (b.ende || '–') + ' Uhr') + kv('Spielzeit', '2 × ' + b.halbzeit + ' Min.' + ((b.nachspiel.h1 || b.nachspiel.h2) ? ' (Nachspielzeit ' + (b.nachspiel.h1 || 0) + ' / ' + (b.nachspiel.h2 || 0) + ' Min.)' : '')) +
      kv('Spielklasse', b.spielklasse) + kv('Spielnummer', b.spielnummer) + kv('Spielort / Platz', b.platz) +
      kv('Schiedsrichter', (b.schiri.name || '') + (b.schiri.art === 'verein' ? ' (Vereinsschiedsrichter)' : b.schiri.name ? ' (neutral)' : '')) + kv('Assistenten', [b.schiri.assistent1, b.schiri.assistent2].filter(Boolean).join(', ')) +
      kv('Pass- / Spielberechtigung kontrolliert', b.passkontrolle ? 'ja' : 'nein') + kv('Spielerzahl Heim / Gast', (sz('heim') || '–') + ' / ' + (sz('gast') || '–')) + kv('Auswechslungen Heim / Gast', b.wechsel.heim + ' / ' + b.wechsel.gast) +
      kv('Mannschaftsverantwortliche Heim', b.offizielle.heim) + kv('Mannschaftsverantwortliche Gast', b.offizielle.gast) + '</table>';
    r += '<h2>Torfolge</h2>' + (b.tore.length ? '<table><thead><tr><th style="width:12%">Min.</th><th style="width:12%">Stand</th><th>Mannschaft</th><th style="width:10%">Nr.</th><th>Torschütze</th></tr></thead><tbody>' + b.tore.map(function (t) { return '<tr><td>' + minTxt(t.minute) + '</td><td>' + t.stand + '</td><td>' + h(teamName(b, t.team)) + '</td><td>' + h(t.nr) + '</td><td>' + h(t.name) + (t.elfmeter ? ' (Strafstoß)' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="mu">Keine Tore.</div>');
    r += '<h2>Persönliche Strafen</h2>' + (b.strafen.length ? '<table><thead><tr><th style="width:9%">Min.</th><th>Mannschaft</th><th style="width:8%">Nr.</th><th>Spieler/in</th><th>Strafe</th><th>Grund</th></tr></thead><tbody>' + b.strafen.map(function (s) { return '<tr><td>' + minTxt(s.minute) + '</td><td>' + h(teamName(b, s.team)) + '</td><td>' + h(s.nr) + '</td><td>' + h(s.name) + '</td><td>' + h(s.art) + '</td><td>' + h(s.grund) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="mu">Keine persönlichen Strafen.</div>');
    r += '<h2>Verletzungen und Vorkommnisse</h2>' + (b.vorkommnisse.length ? '<table><thead><tr><th style="width:9%">Min.</th><th style="width:18%">Art</th><th>Mannschaft</th><th style="width:8%">Nr.</th><th>Beschreibung</th></tr></thead><tbody>' + b.vorkommnisse.map(function (v) { return '<tr><td>' + minTxt(v.minute) + '</td><td>' + h(v.kategorie) + '</td><td>' + h(teamName(b, v.team)) + '</td><td>' + h(v.nr) + '</td><td>' + h([v.name, v.text].filter(Boolean).join(' – ')) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="mu">Keine.</div>');
    r += '<h2>Besondere Vorkommnisse / Bemerkungen</h2><div class="frei">' + (b.besonderes ? h(b.besonderes) : '<span class="mu">Keine.</span>') + '</div>';
    r += '<div class="sig"><div>Schiedsrichter/in</div><div>Verantwortliche/r Heim</div><div>Verantwortliche/r Gast</div></div>' +
      '<div class="fuss"><span>Ort, Datum: ____________________, ' + h(b.datum) + '</span><span>Maßgeblich ist der offizielle Spielbericht im DFBnet. · Kaderkompass</span></div></div></body></html>';
    return r;
  }
  function dateiname(b, ext) { return 'Schiedsrichterbericht_' + b.datum.split('.').reverse().join('-') + '.' + ext; }
  return { STRAFEN: STRAFEN, ZEIT: ZEIT, KATEGORIEN: KATEGORIEN, sr: sr, teams: teams, unserTeam: unserTeam, uhr: uhr, uhrText: uhrText, signale: signale, strafe: strafe, vorkommnis: vorkommnis, torInfo: torInfo,
    entfernen: entfernen, strafenAktiv: strafenAktiv, unterbrechung: unterbrechung, bericht: bericht, html: html, dateiname: dateiname };
});
