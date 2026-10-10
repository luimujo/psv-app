/* PSV Wesel-Lackhausen – Präsentation für Besprechungen (Version 1.5)
   Erzeugt eine eigenständige HTML-Datei mit 16:9-Folien (offline, ohne externe Dateien).
   Zwei Fassungen:
   - 'trainer'   : alle Zahlen (Noten, Kategorien, Gesamtnote, Rang, Positionsnoten, Form, Messwerte, Saison, Spiel)
   - 'mannschaft': KEINE Noten/Ränge/Messwerte/Notizen – nur Farbstufen (Skala der Gesamtnote) und unkritische Infos
   Die Mannschaftsfassung bekommt Bewertungen nur als Farbe über farbe(); Zahlen aus Bewertungen/Messungen werden dort nie in Text umgewandelt. */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PSVEngine;
  var M = (typeof module !== 'undefined' && module.exports) ? require('./model.js') : root.PSVModel;
  var T = (typeof module !== 'undefined' && module.exports) ? require('./taktik.js') : root.PSVTaktik;   // ab 2.2
  var VEREIN = 'PSV Wesel-Lackhausen';
  var GRUPPEN = [['Technik', 16, 23], ['Taktik', 25, 31], ['Athletik', 33, 37], ['Mental', 39, 43]];
  var KATS = [['Technik', 'technik'], ['Taktik', 'taktik'], ['Athletik', 'athletik'], ['Mental', 'mental'], ['Form', 'form']];
  var LEGENDE = [4.5, 4.25, 4, 3.75, 3.5, 3.25, 3, 2.75, 2.5, 2, 1.5];   // Stufen wie die Gesamtnote (stark → ausbaufähig)
  var AV_FARBEN = ['#1B5E20', '#00695C', '#283593', '#6A1B9A', '#AD1457', '#E65100', '#4E342E', '#37474F'];
  var INHALTE = [['aufstellung', 'Aufstellung'], ['kader', 'Kader-Übersicht'], ['spieler', 'Spieler-Folien'], ['spiel', 'Letztes Spiel'], ['saison', 'Saison-Statistik'], ['messung', 'Messtermin'], ['gegner', 'Gegner'], ['taktik', 'Taktiktafeln']];

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function h(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function k1(v) { return isNum(v) ? v.toFixed(1).replace('.', ',') : '–'; }
  function k2(v) { return isNum(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '–'; }
  function vorn(p) { return p ? E.firstName(p.name) : '–'; }
  function nrTxt(p) { return p && p.nr !== null && p.nr !== undefined && p.nr !== '' ? String(p.nr) : ''; }
  function hell(hex) { return ['#C0CA33', '#FDD835', '#FFB300', '#7CB342'].indexOf(hex) >= 0; }
  function farbe(v) { return E.noteColor(v); }   // gleiche Farbstufen wie die Gesamtnote
  function initialen(name) { var w = String(name || '?').trim().split(/\s+/); return ((w[0] || '?').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase(); }
  function datumDe(iso) { return M.fmtDatum(iso); }
  function nachNr(a, b) { return (Number(a.nr) || 999) - (Number(b.nr) || 999) || a.name.localeCompare(b.name, 'de'); }
  function nachName(a, b) { return a.name.localeCompare(b.name, 'de'); }

  // ---------- Bausteine ----------
  function fotoSrc(p, fotos) {
    if (!p || !p.foto) return '';
    if (/^data:image\//.test(p.foto)) return p.foto;
    var m = /fotos\/([^\/]+)\.jpg$/.exec(p.foto); return m && fotos && fotos[m[1]] ? fotos[m[1]] : '';
  }
  function av(p, px, fotos) {
    var src = fotoSrc(p, fotos), st = 'width:' + px + 'px;height:' + px + 'px;';
    if (src) return '<span class="av" style="' + st + '"><img src="' + h(src) + '" alt=""></span>';
    return '<span class="av ini" style="' + st + 'font-size:' + Math.round(px * 0.4) + 'px;background:' + AV_FARBEN[(+(p && p.id) || 0) % AV_FARBEN.length] + '">' + h(p ? initialen(p.name) : '–') + '</span>';
  }
  function dot(v, cls) { var c = farbe(v); return '<span class="dot' + (cls ? ' ' + cls : '') + (c ? '' : ' leer') + '"' + (c ? ' style="background:' + c + '"' : '') + '></span>'; }   // Mannschaft: Farbe ohne Zahl
  function badge(v, cls) { var c = farbe(v); return '<span class="bd' + (cls ? ' ' + cls : '') + '" style="background:' + (c || '#e3e7e3') + (c && !hell(c) ? ';color:#fff' : '') + '">' + k1(v) + '</span>'; }   // Trainer: Zahl + Farbe
  function legende() {
    return '<div class="legende"><div class="lbar">' + LEGENDE.map(function (g) { return '<span style="background:' + farbe(g) + '"></span>'; }).join('') + '</div><div class="llab"><span>stark</span><span>gut</span><span>solide</span><span>im Aufbau</span><span>ausbaufähig</span></div></div>';
  }
  function trendTxt(t) { if (!t) return ''; return { steigend: '↑ steigend', fallend: '↓ fallend', stabil: '→ stabil' }[t.richtung] || ''; }

  function folie(titel, inhalt, extra) {
    extra = extra || {};
    return { titel: titel, html: '<section class="slide' + (extra.cls ? ' ' + extra.cls : '') + '"><div class="in">' +
      (extra.ohneKopf ? '' : '<div class="kopf"><div class="verein"><span class="wappen">PSV</span>' + VEREIN + '</div><h1>' + h(titel) + '</h1>' + (extra.unter ? '<div class="unter">' + extra.unter + '</div>' : '') + '</div>') +
      '<div class="body">' + inhalt + '</div><div class="fuss"><span>' + h(extra.fuss || '') + '</span><span class="nr"></span></div></div></section>' };
  }

  // ---------- Daten ----------
  function spieler(d, sort) {
    var L = M.aktiveSpieler(d).slice();
    return L.sort(sort === 'name' ? nachName : nachNr);
  }
  function evalVon(d, R, p) { var i = d.players.indexOf(p); return i >= 0 && R.evals[i] ? R.evals[i] : {}; }
  function rangVon(d, R, p) { var i = d.players.indexOf(p), r = null; R.ranking.forEach(function (x) { if (x.idx === i) r = x.rang; }); return r; }
  function hatErgebnis(st) { var s = st.spiel; return !!(s && (s.startelf || (s.tore && s.tore.length) || s.gegentore)); }
  function letztesSpiel(d) { return M.sortSpieltage(d.spieltage).filter(hatErgebnis)[0] || null; }
  function pidVon(d, s, st) { return s.pid || (s.kind && !(st && st.snapshot) && d.players[s.kind - 1] ? d.players[s.kind - 1].id : null); }

  // Aufstellung: tatsächliche Startelf (falls erfasst und Formation passt), sonst Vorschlag (eingefroren oder live)
  function aufstellungDaten(d, st, code) {
    var se = st.spiel && st.spiel.startelf;
    if (se && (!code || code === se.formation)) {
      var f = E.pitchByCode(se.formation), k = st.settings ? st.settings.kapitaen : '';
      var spots = f.slots.map(function (sl, i) { var pid = se.slots[i] || null, p = pid ? M.spielerById(d, pid) : null; return { pos: sl[0], x: sl[1], y: sl[2], p: p, kapitaen: !!(p && k && (vorn(p) === k || p.name === k)), eignung: null }; });
      var on = se.slots.filter(Boolean), bank = [];
      Object.keys(st.zusagen || {}).forEach(function (id) { id = +id; if (st.zusagen[id] === 'Zugesagt' && on.indexOf(id) < 0) bank.push(id); });
      ((st.spiel.wechsel) || []).forEach(function (w) { if (w.rein && on.indexOf(w.rein) < 0 && bank.indexOf(w.rein) < 0) bank.push(w.rein); });
      return { quelle: 'Startelf', code: se.formation, name: f.name, spots: spots, bank: bank.map(function (id) { return { p: M.spielerById(d, id) }; }).filter(function (b) { return b.p && b.p.name; }) };
    }
    var pits = M.aufstellungVon(d, st), sz = String(st.groesse || '9');
    if (!code || !pits[code]) code = E.paarFuer(st.settings, sz)[0];
    if (!pits[code]) code = Object.keys(pits)[0];
    var P = pits[code];
    return { quelle: st.snapshot ? 'eingefroren' : 'Vorschlag', code: code, name: P.name, spots: P.aufstellung.map(function (s) { var pid = s.kind ? pidVon(d, s, st) : null; return { pos: s.pos, x: s.x, y: s.y, p: pid ? M.spielerById(d, pid) : null, kapitaen: !!s.kapitaen, eignung: s.eignung }; }),
      bank: (P.bank || []).map(function (b) { var pid = pidVon(d, b, st); return { p: pid ? M.spielerById(d, pid) : null, ersetzt: b.ersetzt, fuer: b.fuerVorname, note: b.note, eignung: b.eignung, kapitaen: b.kapitaen }; }).filter(function (b) { return b.p; }),
      nicht: st.snapshot ? st.snapshot.nichtEingeplant : null };
  }

  // ---------- Folien ----------
  function titelFolie(o) {
    var team = o.version === 'mannschaft';
    var inh = '<div class="tbox"><div class="twappen">PSV</div><div class="tname">' + VEREIN + '</div><div class="tsub">' + (team ? 'Mannschaftsbesprechung' : 'Trainerbesprechung') + '</div>' +
      '<div class="tdat">' + h(datumDe(o.datum)) + (o.unterTitel ? ' · ' + h(o.unterTitel) : '') + '</div><div class="tinh">' + o.liste.map(function (x) { return '<span>' + h(x) + '</span>'; }).join('') + '</div></div>';
    return folie('Titel', inh, { cls: 'titel', ohneKopf: true, fuss: team ? 'Mannschaftsfassung' : 'Trainerfassung – nur intern' });
  }
  function legendeFolie() {
    var inh = '<div class="lgross">' + legende() + '</div><div class="ltext"><p>Die Farben zeigen, wo jeder gerade steht – grün ist schon stark, gelb ist solide, orange und rot heißen: Da können wir gemeinsam noch zulegen.</p><p>Jeder kann sich verbessern. Wir schauen auf Fortschritt, nicht auf Vergleiche.</p></div>';
    return folie('So lesen wir die Farben', inh, { fuss: 'Mannschaftsfassung' });
  }
  function aufstellungFolie(d, R, st, A, o) {
    var team = o.version === 'mannschaft', fotos = o.fotos;
    var feld = '<div class="pitch"><div class="pl l1"></div><div class="pl l2"></div><div class="pl l3"></div><div class="pl l4"></div>' + A.spots.map(function (s) {
      return '<div class="spot" style="left:' + s.x + '%;top:' + (6 + s.y * 0.86).toFixed(1) + '%"><div class="tok' + (s.pos === 'TW' ? ' tw' : '') + '">' + (s.p ? av(s.p, 56, fotos) : '<span class="av leer" style="width:56px;height:56px"></span>') +
        '<span class="tpos">' + h(s.pos) + '</span>' + (s.kapitaen ? '<span class="cpt">C</span>' : '') + '<span class="tnm">' + (s.p ? h(vorn(s.p)) + (nrTxt(s.p) ? ' <small>' + h(nrTxt(s.p)) + '</small>' : '') : '–') + '</span>' +
        (!team && isNum(s.eignung) ? '<span class="tev">' + k1(s.eignung) + '</span>' : '') + '</div></div>';
    }).join('') + '</div>';
    var rechts = '<div class="seite"><div class="fname">' + h(A.name) + '</div><div class="muted">' + (A.quelle === 'Startelf' ? 'Startelf' : (team ? 'Geplante Aufstellung' : (A.quelle === 'eingefroren' ? 'Vorschlag (eingefroren)' : 'Vorschlag der App'))) + '</div>';
    if (team) {
      var bank = A.bank.map(function (b) { return b.p; }).sort(nachName);
      rechts += '<h3>Wechselspieler</h3>' + (bank.length ? '<div class="bank">' + bank.map(function (p) { return '<div class="bk">' + av(p, 44, fotos) + '<span>' + h(vorn(p)) + (nrTxt(p) ? ' <small>' + h(nrTxt(p)) + '</small>' : '') + '</span></div>'; }).join('') + '</div>' : '<div class="muted">–</div>');
      rechts += '<div class="merk">Jeder ist wichtig – auf dem Platz und auf der Bank.</div>';
    } else {
      if (A.quelle === 'Startelf') rechts += '<h3>Wechselspieler</h3>' + (A.bank.length ? '<table class="tb"><tr><th>Name</th><th class="c">Nr.</th><th class="c">Gesamtnote</th><th class="c">Beste Pos.</th><th class="c">Stamm / Alt.</th></tr>' + A.bank.map(function (b) { var ev = evalVon(d, R, b.p); return '<tr><td>' + h(vorn(b.p)) + '</td><td class="c">' + h(nrTxt(b.p)) + '</td><td class="c">' + badge(ev.gesamt, 'k') + '</td><td class="c">' + h(ev.beste || '–') + '</td><td class="c">' + h((b.p.stamm || '–') + (b.p.alt ? ' / ' + b.p.alt : '')) + '</td></tr>'; }).join('') + '</table>' : '<div class="muted">–</div>');
      else rechts += '<h3>Auswechseloptionen</h3>' + (A.bank.length ? '<table class="tb"><tr><th>Name</th><th>Pos.</th><th>für</th><th class="c">Note</th><th class="c">Eignung</th></tr>' + A.bank.map(function (b) {
        return '<tr><td>' + h(vorn(b.p)) + (b.kapitaen ? ' <b>C</b>' : '') + '</td><td>' + h(b.ersetzt || '') + '</td><td>' + h(b.fuer || '') + '</td><td class="c">' + (isNum(b.note) ? badge(b.note, 'k') : '') + '</td><td class="c">' + (isNum(b.eignung) ? k1(b.eignung) : '') + '</td></tr>'; }).join('') + '</table>' : '<div class="muted">–</div>');
      if (A.nicht && A.nicht.length) rechts += '<div class="muted" style="margin-top:8px">Nicht eingeplant: ' + A.nicht.map(function (x) { return h(x.name) + ' (' + h(x.grund) + ')'; }).join(', ') + '</div>';
    }
    rechts += '</div>';
    return folie('Aufstellung', '<div class="aufst">' + feld + rechts + '</div>', { unter: h(M.titel(st)), fuss: team ? 'Mannschaftsfassung' : 'Trainerfassung' });
  }
  function kaderFolien(d, R, o) {
    var team = o.version === 'mannschaft', L = spieler(d, 'nr'), out = [];
    for (var k = 0; k < L.length; k += 15) {
      var teil = L.slice(k, k + 15);
      var inh = '<div class="kgrid">' + teil.map(function (p) {
        var ev = evalVon(d, R, p);
        return '<div class="kc">' + av(p, 86, o.fotos) + '<div class="kn">' + h(vorn(p)) + '</div><div class="kp">' + (nrTxt(p) ? '<b>' + h(nrTxt(p)) + '</b> · ' : '') + h((p.typ === 'TW' && !p.stamm) ? 'TW' : (p.stamm || '–') + (p.alt ? ' / ' + p.alt : '')) + '</div>' +
          (team ? '' : '<div class="kg">' + badge(ev.gesamt) + ' <span class="muted">Rang ' + h(rangVon(d, R, p) || '–') + '</span></div>') + '</div>';
      }).join('') + '</div>';
      out.push(folie('Unser Kader' + (L.length > 15 ? ' (' + (k / 15 + 1) + ')' : ''), inh, { unter: L.length + ' Kinder · nach Trikotnummer', fuss: team ? 'Mannschaftsfassung' : 'Trainerfassung' }));
    }
    if (!team) {   // Ranking-Tabelle
      var rows = R.ranking.filter(function (r) { var p = d.players[r.idx]; return p && p.name && !p.archiviert; });
      var inh2 = '<table class="tb dicht"><tr><th class="c">Rang</th><th>Name</th><th class="c">Nr.</th><th class="c">Gesamt</th>' + KATS.map(function (c) { return '<th class="c">' + c[0] + '</th>'; }).join('') + '<th class="c">Beste Pos.</th><th>Form-Trend</th></tr>' +
        rows.map(function (r) { var p = d.players[r.idx], ev = R.evals[r.idx], af = M.autoForm(d, p.id); return '<tr><td class="c"><b>' + h(r.rang) + '</b></td><td>' + h(vorn(p)) + '</td><td class="c">' + h(nrTxt(p)) + '</td><td class="c">' + badge(ev.gesamt) + '</td>' +
          KATS.map(function (c) { return '<td class="c">' + k1(ev[c[1]]) + '</td>'; }).join('') + '<td class="c">' + h(ev.beste || '–') + '</td><td>' + h(af ? trendTxt(af.trend) : '') + '</td></tr>'; }).join('') + '</table>';
      out.push(folie('Ranking Gesamtnote', inh2, { unter: 'Gesamtnote = Technik, Taktik, Athletik, Mental, Form (gewichtet)', fuss: 'Trainerfassung' }));
    }
    return out;
  }
  function spielerFolie(d, R, p, o) {
    var team = o.version === 'mannschaft', ev = evalVon(d, R, p), lab = (d.labels && d.labels[p.typ]) || {}, S = o.saison[p.id] || {};
    var links = '<div class="pl-links">' + av(p, 170, o.fotos) + '<div class="pn">' + h(p.name) + '</div><div class="pinfo">' + (nrTxt(p) ? '<span class="trikot">' + h(nrTxt(p)) + '</span>' : '') +
      h(p.typ === 'TW' || p.stamm === 'TW' ? 'Torhüter' : 'Feldspieler') + '</div><div class="pinfo">' + (p.typ === 'TW' && !p.stamm ? 'TW' : h((p.stamm || '–') + (p.alt ? ' / ' + p.alt : ''))) + (p.fuss ? ' · ' + h(p.fuss) : '') + '</div>' +
      '<div class="sz"><div><b>' + (S.spiele || 0) + '</b><span>Spiele</span></div><div><b>' + (S.tore || 0) + '</b><span>Tore</span></div><div><b>' + (S.assists || 0) + '</b><span>Vorlagen</span></div>' + (team ? '' : '<div><b>' + (S.minuten || 0) + '</b><span>Minuten</span></div>') + '</div>';
    if (!team) {
      var af = M.autoForm(d, p.id), sc = E.posScores(p), top = Object.keys(sc).filter(function (q) { return isNum(sc[q]); }).sort(function (a, b) { return sc[b] - sc[a]; }).slice(0, 3);
      links += '<div class="tinfo"><div>Gesamtnote ' + badge(ev.gesamt) + ' · Rang ' + h(rangVon(d, R, p) || '–') + '</div><div>Positionsnoten: ' + top.map(function (q) { return h(q) + ' ' + k1(sc[q]); }).join(' · ') + '</div>' +
        (af ? '<div>Form aus ' + af.anzahl + ' Spiel' + (af.anzahl > 1 ? 'en' : '') + ': ' + k1(af.form) + ' ' + h(trendTxt(af.trend)) + '</div>' : '') + '</div>';
    }
    links += '</div>';
    var kats = '<div class="kats">' + KATS.map(function (c) { var v = ev[c[1]], col = farbe(v); return '<div class="kat"' + (col ? ' style="background:' + col + (hell(col) ? '' : ';color:#fff') + '"' : '') + '>' + c[0] + (team ? '' : '<b>' + k1(v) + '</b>') + '</div>'; }).join('') + '</div>';
    var grid = '<div class="skg">' + GRUPPEN.map(function (g) {
      var s = '<div class="skcol"><h4>' + g[0] + '</h4>';
      for (var r = g[1]; r <= g[2]; r++) { var v = p.skills[String(r)], l = lab[String(r)]; if (!l) continue;
        s += '<div class="sk">' + (team ? dot(isNum(v) ? v : null) : (isNum(v) ? badge(v, 'k') : '<span class="bd k leer">–</span>')) + '<span>' + h(l) + '</span></div>';
        if (!team && o.notizen && p.notes && p.notes[String(r)]) s += '<div class="sknote">' + h(p.notes[String(r)]) + '</div>';
      }
      return s + '</div>';
    }).join('') + '</div>';
    var mess = '';
    if (!team && o.messungen) {
      var ms = (d.messkatalog || []).map(function (t) { var V = M.messVerlauf(d, p.id, t.id); return V.length ? { t: t, l: V[V.length - 1] } : null; }).filter(Boolean).slice(0, 6);
      if (ms.length) mess = '<div class="pmess">Messungen: ' + ms.map(function (x) { return h(x.t.name) + ' <b>' + k2(x.l.wert) + ' ' + h(x.t.einheit) + '</b>' + (isNum(x.l.note) ? ' ' + badge(x.l.note, 'k') : ''); }).join(' · ') + '</div>';
    }
    return folie(vorn(p), '<div class="pfolie">' + links + '<div class="pl-rechts">' + kats + grid + mess + (team ? legende() : '') + '</div></div>', { unter: team ? '' : 'Trainerfassung – Werte 1–5', fuss: team ? 'Mannschaftsfassung' : 'Trainerfassung' });
  }
  function spielFolien(d, st, o) {
    var team = o.version === 'mannschaft', z = M.zusammenfassung(d, st), s = M.spielbericht(st), out = [];
    var name = function (pid) { var p = M.spielerById(d, pid); return p ? vorn(p) : '?'; };
    var erg = z.tore > z.gegentore ? 'Sieg' : (z.tore === z.gegentore ? 'Unentschieden' : 'Niederlage');
    var tore = s.tore.slice().sort(function (a, b) { return (isNum(a.minute) ? a.minute : 999) - (isNum(b.minute) ? b.minute : 999); });
    var inh = '<div class="score"><div class="sct">' + VEREIN + '</div><div class="scr">' + z.tore + ' : ' + z.gegentore + '</div><div class="sct">' + h(z.gegner) + '</div></div>' +
      '<div class="spalten"><div><h3>Tore</h3>' + (tore.length ? tore.map(function (t) { return '<div class="tor">⚽ ' + (isNum(t.minute) ? t.minute + '′ ' : '') + '<b>' + h(t.pid ? name(t.pid) : 'Torschütze unbekannt') + '</b>' + (t.elfmeter ? ' <span class="muted">(Elfmeter)</span>' : '') + (t.notiz && !team ? ' <span class="muted">– ' + h(t.notiz) + '</span>' : '') + (t.assist ? ' <span class="muted">Vorlage ' + h(name(t.assist)) + '</span>' : '') + '</div>'; }).join('') : '<div class="muted">–</div>') + '</div>' +
      '<div><h3>Startelf</h3><div class="chips">' + z.startelf.map(function (x) { return '<span class="chip"><b>' + h(x.pos) + '</b> ' + h(x.name) + '</span>'; }).join('') + '</div>' +
      (z.wechsel.length ? '<h3>Eingewechselt</h3><div class="chips">' + (team ? z.wechsel.map(function (w) { return w.rein; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort().map(function (n) { return '<span class="chip">' + h(n) + '</span>'; }).join('') : z.wechsel.map(function (w) { return '<span class="chip">' + (isNum(w.minute) ? w.minute + '′ ' : '') + h(w.rein) + ' für ' + h(w.raus) + '</span>'; }).join('')) + '</div>' : '') + '</div></div>';
    if (team) {
      var plus = [];
      if (z.tore > z.gegentore) plus.push('Sieg – stark gekämpft!'); else if (z.tore === z.gegentore) plus.push('Unentschieden – gemeinsam einen Punkt geholt');
      if (!z.gegentore) plus.push('Zu null gespielt – starke Abwehrarbeit vom ganzen Team');
      var sch = {}; s.tore.forEach(function (t) { if (t.pid) sch[t.pid] = 1; }); var ns = Object.keys(sch).length;
      if (ns >= 2) plus.push(ns + ' verschiedene Torschützen');
      if (s.tore.some(function (t) { return t.assist; })) plus.push('Tore nach schönem Zusammenspiel');
      var gesp = Object.keys(st.zusagen || {}).filter(function (id) { return st.zusagen[id] === 'Zugesagt'; });
      if (gesp.length && gesp.every(function (id) { return M.hatGespielt(st, +id); })) plus.push('Alle Kinder, die dabei waren, haben gespielt');
      if (!plus.length) plus.push('Dranbleiben – beim nächsten Mal holen wir uns das zurück!');
      inh += '<div class="plus">' + plus.map(function (x) { return '<span>✔ ' + h(x) + '</span>'; }).join('') + '</div>';
    }
    out.push(folie('Letztes Spiel: ' + (st.ohneWertung ? 'Freundschaftsspiel' : erg), inh, { unter: h(z.titel) + (st.ohneWertung ? ' · ohne Wertung' : ''), fuss: team ? 'Mannschaftsfassung' : 'Trainerfassung' }));
    if (!team) {   // Details: Bewertung, Minuten, Fehler, (Notizen)
      var b = M.bericht(d, st), ids = Object.keys(b.minuten).map(Number);
      Object.keys(st.bewertungen || {}).forEach(function (k) { if (ids.indexOf(+k) < 0 && M.spielwert(st.bewertungen[k]) !== null) ids.push(+k); });
      var sp = {}; M.startelfListe(st).forEach(function (x) { if (x.pid) sp[x.pid] = x.pos; });
      var rows = ids.map(function (pid) { var bw = st.bewertungen[pid]; return { pid: pid, name: name(pid), min: M.minutenFuer(st, pid), pos: bw && bw.position || sp[pid] || '', w: M.spielwert(bw) }; }).sort(function (a, c) { return (c.min || 0) - (a.min || 0) || a.name.localeCompare(c.name, 'de'); });
      var inh3 = '<div class="spalten"><div><table class="tb"><tr><th>Name</th><th class="c">Min.</th><th class="c">Pos.</th><th class="c">Spielbewertung</th></tr>' + rows.map(function (r) { return '<tr><td>' + h(r.name) + '</td><td class="c">' + (isNum(r.min) ? r.min : '–') + '</td><td class="c">' + h(r.pos) + '</td><td class="c">' + (isNum(r.w) ? badge(r.w, 'k') : '–') + '</td></tr>'; }).join('') + '</table></div><div>' +
        (z.fehler.length ? '<h3>Abwehrfehler</h3>' + z.fehler.map(function (f) { return h(f.name) + (f.n > 1 ? ' ×' + f.n : ''); }).join(', ') : '<h3>Abwehrfehler</h3><div class="muted">keine erfasst</div>') +
        (st.gegnerStaerke ? '<h3>Gegnerstärke</h3>' + h(st.gegnerStaerke) : '') +
        (o.notizen && z.notizen.length ? '<h3>Notizen</h3>' + z.notizen.map(function (n) { return '<div>' + (isNum(n.minute) ? n.minute + '′ ' : '') + h(n.text) + '</div>'; }).join('') : '') + '</div></div>';
      out.push(folie('Spiel im Detail', inh3, { unter: h(z.titel) + ' · Spielzeit ' + z.spielzeit + ' Min.', fuss: 'Trainerfassung' }));
    }
    return out;
  }
  function saisonFolie(d, o) {
    var team = o.version === 'mannschaft', key = o.saisonKey, S = o.saison, L = spieler(d, 'name');
    var sts = M.spieltageDerSaison(d, key).filter(hatErgebnis), s = 0, u = 0, n = 0, tf = 0, tg = 0;
    var ow = sts.filter(function (st) { return st.ohneWertung; }).length; sts = sts.filter(function (st) { return !st.ohneWertung; });   // Spiele ohne Wertung nicht in der Bilanz
    sts.forEach(function (st) { var a = st.spiel.tore.length, b = st.spiel.gegentore || 0; tf += a; tg += b; if (a > b) s++; else if (a === b) u++; else n++; });
    var kopf = '<div class="tiles"><div><b>' + sts.length + '</b><span>Spiele' + (ow ? ' (+' + ow + ' o. W.)' : '') + '</span></div><div><b>' + s + '</b><span>Siege</span></div><div><b>' + u + '</b><span>Unentschieden</span></div><div><b>' + n + '</b><span>Niederlagen</span></div><div><b>' + tf + ' : ' + tg + '</b><span>Tore</span></div></div>';
    var tab;
    if (team) {
      var half = Math.ceil(L.length / 2), sp = [L.slice(0, half), L.slice(half)];
      tab = '<div class="spalten">' + sp.map(function (T) { return '<table class="tb gross"><tr><th>Name</th><th class="c">Spiele</th><th class="c">Tore</th><th class="c">Vorlagen</th></tr>' + T.map(function (p) { var x = S[p.id] || {}; return '<tr><td>' + h(vorn(p)) + '</td><td class="c">' + (x.spiele || 0) + '</td><td class="c">' + (x.tore || 0) + '</td><td class="c">' + (x.assists || 0) + '</td></tr>'; }).join('') + '</table>'; }).join('') + '</div>';
    } else {
      var rows = L.map(function (p) { return S[p.id]; }).filter(Boolean).sort(function (a, b) { return b.minuten - a.minuten || b.spiele - a.spiele || a.name.localeCompare(b.name, 'de'); });
      tab = '<table class="tb"><tr><th>Name</th><th class="c">Spiele</th><th class="c">Start</th><th class="c">Min.</th><th class="c">Tore</th><th class="c">Vorl.</th><th class="c">Fehler</th><th class="c">Einw.</th><th class="c">Quote</th></tr>' +
        rows.map(function (x) { var q = M.einsatzQuote(d, x.pid, key); return '<tr><td>' + h(E.firstName(x.name)) + '</td><td class="c">' + x.spiele + '</td><td class="c">' + x.startelf + '</td><td class="c">' + x.minuten + '</td><td class="c"><b>' + x.tore + '</b></td><td class="c">' + x.assists + '</td><td class="c">' + x.fehler + '</td><td class="c">' + x.einwechslungen + '</td><td class="c' + (q && q.quote < 0.5 ? ' rot' : '') + '">' + (q ? Math.round(q.quote * 100) + ' %' : '–') + '</td></tr>'; }).join('') + '</table>';
    }
    return folie('Saison ' + (key || '(alle Spieltage)'), kopf + tab, { unter: team ? 'Spiele, Tore und Vorlagen – alphabetisch' : 'Quote = gespielte ÷ mögliche Minuten', fuss: team ? 'Mannschaftsfassung' : 'Trainerfassung' });
  }
  function messFolien(d, m, o) {
    var team = o.version === 'mannschaft', out = [];
    var T = m.tests.map(function (id) { return M.testById(d, id); }).filter(function (t) { return t && (!team || t.baender); });   // Mannschaft: nur Tests mit Notenbändern (Farbe)
    var kids = spieler(d, 'name').filter(function (p) { return m.werte[p.id] && T.some(function (t) { return m.werte[p.id][t.id]; }); });
    if (!T.length || !kids.length) return out;
    var proSeite = team ? 7 : 5;
    for (var k = 0; k < T.length; k += proSeite) {
      var TT = T.slice(k, k + proSeite);
      var tab = '<table class="tb mess"><tr><th>Name</th>' + TT.map(function (t) { return '<th class="c">' + h(t.name) + (team ? '' : '<br><small>' + h(t.einheit) + '</small>') + '</th>'; }).join('') + '</tr>' +
        kids.map(function (p) { return '<tr><td>' + h(vorn(p)) + '</td>' + TT.map(function (t) { var r = M.messErgebnis(d, m, p.id, t.id);
          if (team) return '<td class="c">' + (r ? dot(r.note) : '<span class="muted">–</span>') + '</td>';
          return '<td class="c">' + (r ? k2(r.wert) + (isNum(r.note) ? ' ' + badge(r.note, 'k') : '') : '–') + '</td>'; }).join('') + '</tr>'; }).join('');
      if (!team) tab += '<tr class="med"><td>Team-Median</td>' + TT.map(function (t) { var tv = M.teamVergleich(d, m, t.id); return '<td class="c">' + (tv ? k2(tv.median) : '–') + '</td>'; }).join('') + '</tr>';
      tab += '</table>';
      var unten = team ? '<div class="merk">Danke fürs Mitmachen! Beim nächsten Messtermin schauen wir, wie sich jeder verbessert hat.</div>' + legende() : '';
      out.push(folie('Messtermin ' + datumDe(m.datum) + (T.length > proSeite ? ' (' + (k / proSeite + 1) + ')' : ''), tab + unten, { unter: (m.titel ? h(m.titel) + ' · ' : '') + (team ? 'Farbe = Stand im Vergleich zur Altersklasse' : 'Bestwert bzw. Mittel, Note 1–5 nach Altersklasse'), fuss: team ? 'Mannschaftsfassung' : 'Trainerfassung' }));
    }
    return out;
  }

  // Gegner: Trainer = alles; Mannschaft = Ergebnisse + neutrale Taktik-Hinweise (keine Beschreibungen einzelner Gegenspieler)
  var NR_BEZUG = /(\bnr\.?\s*\d|\bnummer\s*\d|#\s*\d|\btrikot\s*\d|\b\d{1,2}er\b)/i;
  function teamTaktik(g) { return M.gegnerNotizen(g, 'taktik').filter(function (n) { return n.team !== false && !NR_BEZUG.test(n.text); }); }
  function gegnerFolie(d, g, o) {
    var team = o.version === 'mannschaft', b = M.gegnerBilanz(d, g.id);
    var info = [g.altersklasse, g.farben ? 'Farben: ' + g.farben : '', g.platz ? 'Platz: ' + g.platz : ''].filter(Boolean).map(h).join(' · ');
    var kopf = '<div class="tiles"><div><b>' + b.anzahl + '</b><span>Spiele</span></div><div><b>' + b.s + '</b><span>Siege</span></div><div><b>' + b.u + '</b><span>Unentschieden</span></div><div><b>' + b.n + '</b><span>Niederlagen</span></div><div><b>' + b.tore + ' : ' + b.gegentore + '</b><span>Tore</span></div>' +
      (team ? '' : '<div><b>' + (b.diff > 0 ? '+' : '') + b.diff + '</b><span>Tordifferenz</span></div><div><b>' + h(b.letzteStaerke || '–') + '</b><span>zuletzt Stärke</span></div>') + '</div>';
    var erg = b.spiele.length ? '<table class="tb"><tr><th>Datum</th><th>Ort</th><th class="c">Ergebnis</th><th>Unsere Torschützen</th>' + (team ? '' : '<th>Stärke</th>') + '</tr>' + b.spiele.slice(0, 6).map(function (x) {
      return '<tr><td>' + h(datumDe(x.datum)) + '</td><td>' + h(x.ort || '') + '</td><td class="c"><span class="erg ' + x.ergebnis + '">' + x.tore + ' : ' + x.gegentore + '</span>' + (x.ohneWertung ? ' <span class="ow">o. W.</span>' : '') + '</td><td>' + h(x.torschuetzen.join(', ') || '–') + '</td>' + (team ? '' : '<td>' + h(x.gegnerStaerke || '') + '</td>') + '</tr>'; }).join('') + '</table>' : '<div class="muted">Noch keine Spiele gegen diesen Gegner.</div>';
    var notizListe = function (L, mitNr) { return L.slice(0, 5).map(function (n) { return '<div class="gn">' + (mitNr && (n.nr || n.name) ? '<b>' + h((n.nr ? 'Nr. ' + n.nr : '') + (n.name ? (n.nr ? ' ' : '') + n.name : '')) + '</b> ' : '') + h(n.text) + (team ? '' : ' <span class="muted">' + h(datumDe(n.datum)) + (isNum(n.minute) ? ', ' + n.minute + '′' : '') + '</span>') + '</div>'; }).join(''); };
    var rechts;
    if (team) { var T = teamTaktik(g); rechts = T.length ? '<h3>Darauf achten wir</h3>' + notizListe(T, false) : ''; }
    else {
      var S = M.gegnerNotizen(g, 'spieler'), TT = M.gegnerNotizen(g, 'taktik'), A = M.gegnerNotizen(g, 'allgemein');
      rechts = (S.length ? '<h3>Auffällige Spieler</h3>' + notizListe(S, true) : '') + (TT.length ? '<h3>Taktik</h3>' + notizListe(TT, false) : '') + (A.length ? '<h3>Allgemein</h3>' + notizListe(A, false) : '');
    }
    return folie('Gegner: ' + g.name, kopf + '<div class="spalten"><div>' + erg + '</div>' + (rechts ? '<div class="gnotes">' + rechts + '</div>' : '') + '</div>', { unter: info, fuss: team ? 'Mannschaftsfassung' : 'Trainerfassung' });
  }

  // ---------- Gesamt ----------
  function erzeuge(d, R, opt) {
    var o = Object.assign({ version: 'mannschaft', inhalte: {}, datum: M.today(), fotos: {}, notizen: false, messungen: true, sortierung: 'nr' }, opt || {});
    if (o.version !== 'trainer') { o.version = 'mannschaft'; o.notizen = false; if (o.sortierung === 'rang') o.sortierung = 'nr'; }
    if (o.saisonKey === undefined) o.saisonKey = M.saisonListe(d)[0] || '';
    o.saison = M.saison(d, o.saisonKey);
    var team = o.version === 'mannschaft', I = o.inhalte, F = [], liste = [];
    var stA = I.aufstellung ? (M.getSpieltag(d, o.stId) || M.aktiver(d)) : null;
    var stS = I.spiel ? (M.getSpieltag(d, o.spielId) || letztesSpiel(d)) : null;
    if (stS && !hatErgebnis(stS)) stS = null;
    var mess = I.messung ? (M.messungById(d, o.messId) || M.sortMessungen(d.messungen || []).slice(-1)[0] || null) : null;
    var geg = I.gegner ? (M.gegnerById(d, o.gegnerId) || M.gegnerVon(d, stA || M.aktiver(d))) : null;
    if (geg) liste.push('Gegner');
    if (stA) liste.push('Aufstellung'); if (I.kader) liste.push('Kader'); if (I.spieler) liste.push('Spieler'); if (stS) liste.push('Letztes Spiel'); if (I.saison) liste.push('Saison'); if (mess) liste.push('Messungen');
    var tks = taktikTafeln(d, o); if (tks.length) liste.push('Taktik');
    F.push(titelFolie({ version: o.version, datum: o.datum, liste: liste, unterTitel: o.unterTitel }));
    if (team && (I.spieler || mess)) F.push(legendeFolie());
    if (geg) F.push(gegnerFolie(d, geg, o));
    if (stA) F.push(aufstellungFolie(d, R, stA, aufstellungDaten(d, stA, o.formation), o));
    if (I.kader) F = F.concat(kaderFolien(d, R, o));
    if (I.spieler) {
      var L = spieler(d, o.sortierung === 'name' ? 'name' : 'nr');
      if (!team && o.sortierung === 'rang') L.sort(function (a, b) { return (rangVon(d, R, a) || 99) - (rangVon(d, R, b) || 99) || nachNr(a, b); });
      L.forEach(function (p) { F.push(spielerFolie(d, R, p, o)); });
    }
    if (stS) F = F.concat(spielFolien(d, stS, o));
    if (I.saison) F.push(saisonFolie(d, o));
    if (mess) F = F.concat(messFolien(d, mess, o));
    tks.forEach(function (b) { F.push(taktikFolie(d, b, o)); });
    var titel = VEREIN + ' – ' + (team ? 'Mannschaftsbesprechung' : 'Trainerbesprechung') + ' ' + datumDe(o.datum);
    return { version: o.version, folien: F, anzahl: F.length, titel: titel, html: dokument(titel, F), text: textFassung(d, R, o, { stA: stA, stS: stS, mess: mess, geg: geg }), dateiname: dateiname(o) };
  }
  // ---------- Taktiktafeln (ab 2.2): gespeicherter Stand der Tafel; enthält nie Noten ----------
  function taktikTafeln(d, o) {
    if (!o.inhalte.taktik || !T) return [];
    var ids = o.taktikIds || [], L = (d.taktiken || []);
    return ids.length ? ids.map(function (id) { return L.filter(function (t) { return t.id === id; })[0]; }).filter(Boolean) : L.filter(function (t) { return o.stId && t.stId === o.stId; });
  }
  function taktikCtx(d, o) {
    var sp = {}; d.players.forEach(function (p) { if (p.name) sp[p.id] = { name: p.name, vorname: E.firstName(p.name), nr: p.nr, foto: fotoSrc(p, o.fotos) }; });
    return { spieler: sp };
  }
  function taktikFolie(d, b, o) {
    var st = b.stId ? M.getSpieltag(d, b.stId) : null;
    var bild = T.svg(b, taktikCtx(d, o), { attr: 'class="tksvg" preserveAspectRatio="xMidYMid meet"' });
    return folie('Taktik: ' + b.name, '<div class="tkfolie">' + bild + '</div>', { unter: h(st ? M.titel(st) : (b.gegnerName ? 'gegen ' + b.gegnerName : '')) + (b.steps && b.steps.length ? ' · Ausgangsstellung (' + b.steps.length + ' Schritte in der App)' : ''), fuss: o.version === 'mannschaft' ? 'Mannschaftsfassung' : 'Trainerfassung' });
  }
  function dateiname(o) { return 'PSV_Wesel-Lackhausen_Praesentation_' + (o.version === 'trainer' ? 'Trainer' : 'Mannschaft') + '_' + o.datum + '.html'; }

  // Kurzfassung als Text (Teilen per Messenger). Mannschaft: ohne Noten/Messwerte/Notizen.
  function textFassung(d, R, o, x) {
    var team = o.version === 'mannschaft', L = [];
    L.push('⚽ ' + VEREIN + ' – ' + (team ? 'Mannschaftsbesprechung' : 'Trainerbesprechung') + ' ' + datumDe(o.datum));
    if (x.geg) { var gb = M.gegnerBilanz(d, x.geg.id); L.push(''); L.push('Gegner ' + x.geg.name + ': ' + gb.anzahl + ' Spiele, ' + gb.s + ' S / ' + gb.u + ' U / ' + gb.n + ' N, Tore ' + gb.tore + ':' + gb.gegentore + (gb.ohneWertung ? ' (+' + gb.ohneWertung + ' ohne Wertung)' : ''));
      (team ? teamTaktik(x.geg) : M.gegnerNotizen(x.geg, 'taktik')).slice(0, 3).forEach(function (n) { L.push('• ' + n.text); }); }
    if (x.stA) { var A = aufstellungDaten(d, x.stA, o.formation); L.push(''); L.push('Aufstellung ' + M.titel(x.stA) + ' (' + A.name + '):'); L.push(A.spots.map(function (s) { return s.pos + ' ' + (s.p ? vorn(s.p) : '–') + (s.kapitaen ? ' (C)' : '') + (!team && isNum(s.eignung) ? ' ' + k1(s.eignung) : ''); }).join(', '));
      var bank = A.bank.map(function (b) { return vorn(b.p); }); if (team) bank.sort(function (a, b) { return a.localeCompare(b, 'de'); }); if (bank.length) L.push('Wechselspieler: ' + bank.join(', ')); }
    if (o.inhalte.kader) { L.push(''); L.push('Kader: ' + spieler(d, 'nr').map(function (p) { return (nrTxt(p) ? nrTxt(p) + ' ' : '') + vorn(p); }).join(', ')); }
    if (!team && (o.inhalte.kader || o.inhalte.spieler)) { L.push(''); L.push('Ranking: ' + R.ranking.filter(function (r) { var p = d.players[r.idx]; return p && !p.archiviert; }).map(function (r) { return r.rang + '. ' + E.firstName(r.name) + ' ' + k1(r.gesamt); }).join(', ')); }
    if (x.stS) { var z = M.zusammenfassung(d, x.stS); L.push(''); L.push('Letztes Spiel: ' + VEREIN + ' – ' + z.gegner + ' ' + z.tore + ':' + z.gegentore + ' (' + datumDe(x.stS.datum) + ')');
      if (z.scorer.length) L.push('Tore/Vorlagen: ' + z.scorer.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); }).map(function (s) { return s.name + (s.tore ? ' ' + s.tore + ' T' : '') + (s.assists ? ' ' + s.assists + ' V' : ''); }).join(', ')); }
    if (o.inhalte.saison) { L.push(''); L.push('Saison ' + (o.saisonKey || '') + ' – Tore: ' + spieler(d, 'name').filter(function (p) { var s = o.saison[p.id]; return s && (s.tore || s.assists); }).map(function (p) { var s = o.saison[p.id]; return vorn(p) + ' ' + s.tore + ' T / ' + s.assists + ' V'; }).join(', ')); }
    if (x.mess) { L.push(''); L.push('Messtermin ' + datumDe(x.mess.datum) + ': ' + x.mess.tests.map(function (id) { var t = M.testById(d, id); return t ? t.name : ''; }).filter(Boolean).join(', ') + (team ? ' – danke fürs Mitmachen!' : ''));
      if (!team) x.mess.tests.forEach(function (id) { var t = M.testById(d, id), tv = t && M.teamVergleich(d, x.mess, id); if (tv) L.push('  ' + t.name + ': ' + tv.liste.map(function (e) { return vorn(M.spielerById(d, e.pid)) + ' ' + k2(e.wert); }).join(', ') + ' (Median ' + k2(tv.median) + ' ' + t.einheit + ')'); }); }
    return L.join('\n');
  }

  // ---------- HTML-Dokument (eigenständig, offline) ----------
  var CSS = [
    '*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0f2412;font-family:Roboto,"Segoe UI",Arial,Helvetica,sans-serif;color:#1d2320;-webkit-text-size-adjust:100%}',
    'body{overflow:hidden}.slide{position:absolute;left:0;top:0;width:100%;height:100%;display:none;align-items:center;justify-content:center}.slide.on{display:flex}',
    '.in{width:1280px;height:720px;flex:none;background:#fff;position:relative;overflow:hidden;transform:scale(var(--s,1));transform-origin:center center;padding:30px 48px 46px;display:flex;flex-direction:column;border-radius:4px}',
    '.kopf{border-bottom:4px solid #1B5E20;padding-bottom:10px;margin-bottom:16px;position:relative}.verein{color:#1B5E20;font-weight:700;font-size:20px;letter-spacing:.5px;display:flex;align-items:center;gap:10px}',
    '.wappen{display:inline-block;background:#1B5E20;color:#fff;border-radius:6px;font-size:14px;padding:3px 7px;font-weight:800}h1{margin:4px 0 0;font-size:46px;line-height:1.1;color:#14361a}.unter{position:absolute;right:0;top:4px;color:#5f6b63;font-size:20px;max-width:60%;text-align:right}',
    '.body{flex:1;min-height:0;position:relative}.fuss{position:absolute;left:48px;right:48px;bottom:12px;display:flex;justify-content:space-between;color:#8a948d;font-size:16px}.fuss .nr{display:none}',
    '.muted{color:#68736c}h3{margin:14px 0 8px;font-size:24px;color:#1B5E20}.merk{margin-top:16px;font-size:22px;color:#1B5E20;font-weight:600}',
    '.av{display:inline-block;border-radius:50%;overflow:hidden;background:#dfe6df;flex:none;vertical-align:middle;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25)}.av img{width:100%;height:100%;object-fit:cover;display:block}.av.ini{color:#fff;font-weight:700;display:inline-flex;align-items:center;justify-content:center}',
    '.titel .in{background:linear-gradient(135deg,#1B5E20,#2E7D32 60%,#43A047);color:#fff;justify-content:center}.tbox{text-align:center}.twappen{display:inline-block;border:5px solid #fff;border-radius:18px;font-size:54px;font-weight:900;padding:8px 24px;margin-bottom:24px}',
    '.tname{font-size:84px;font-weight:800;line-height:1.05}.tsub{font-size:44px;margin-top:14px;opacity:.95}.tdat{font-size:28px;margin-top:10px;opacity:.85}.tinh{margin-top:40px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center}.tinh span{background:rgba(255,255,255,.18);border-radius:24px;padding:8px 20px;font-size:24px}.titel .fuss{color:rgba(255,255,255,.8)}',
    '.legende{margin-top:14px}.lbar{display:flex;height:26px;border-radius:13px;overflow:hidden}.lbar span{flex:1}.llab{display:flex;justify-content:space-between;font-size:18px;color:#3d4741;margin-top:4px}',
    '.lgross{margin:60px 40px 30px}.lgross .lbar{height:70px;border-radius:35px}.lgross .llab{font-size:30px;margin-top:12px}.ltext{font-size:30px;line-height:1.4;margin:0 40px;color:#2c352f}',
    '.tkfolie{height:100%;display:flex;align-items:center;justify-content:center}.tksvg{width:100%;height:100%;border-radius:10px}' +
    '.aufst{display:flex;gap:36px;height:100%}.pitch{position:relative;width:440px;height:100%;flex:none;background:repeating-linear-gradient(0deg,#2E7D32 0 52px,#388E3C 52px 104px);border-radius:10px;border:3px solid #1B5E20}',
    '.pl{position:absolute;border:2px solid rgba(255,255,255,.65)}.l1{left:6%;right:6%;top:4%;bottom:4%}.l2{left:6%;right:6%;top:50%;height:0;border-width:2px 0 0}.l3{left:28%;right:28%;bottom:4%;height:14%;border-bottom:0}.l4{left:28%;right:28%;top:4%;height:14%;border-top:0}',
    '.spot{position:absolute;transform:translate(-50%,-34px)}.tok{display:flex;flex-direction:column;align-items:center;position:relative;width:120px}.tok .tpos{position:absolute;top:18px;left:0;background:#fff;color:#1B5E20;font-weight:800;font-size:14px;border-radius:9px;padding:1px 6px}',
    '.tok.tw .av{border-color:#FFB300}.tok .cpt,.cpt{position:absolute;top:-8px;right:14px;background:#FFB300;color:#222;font-weight:800;font-size:14px;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center}',
    '.tnm{background:rgba(0,0,0,.62);color:#fff;font-weight:700;font-size:18px;border-radius:12px;padding:1px 9px;margin-top:-8px;white-space:nowrap;position:relative}.tnm small{opacity:.8;font-weight:400}.tev{position:absolute;top:30px;right:4px;background:#fff;font-size:14px;border-radius:8px;padding:0 5px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.3)}',
    '.seite{flex:1;min-width:0}.fname{font-size:34px;font-weight:800;color:#14361a}.bank{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}.bk{display:flex;align-items:center;gap:10px;font-size:24px;font-weight:600}.bk small,.kp b{color:#1B5E20}',
    '.tb{border-collapse:collapse;width:100%;font-size:19px}.tb th,.tb td{border-bottom:1px solid #e1e7e1;padding:5px 8px;text-align:left}.tb th{background:#eef3ee;color:#1B5E20;font-size:17px}.tb .c{text-align:center}.tb.gross{font-size:22px}.tb.gross td{padding:7px 8px}.tb.dicht{font-size:18px}.tb.dicht td,.tb.dicht th{padding:3px 8px}.tb.dicht .bd{font-size:17px;padding:0 8px}.tb .rot{color:#E64A19;font-weight:700}.tb tr.med td{font-weight:700;background:#f6f8f6}',
    '.bd{display:inline-block;min-width:54px;text-align:center;border-radius:14px;padding:2px 8px;font-weight:800;font-size:20px;color:#222}.bd.k{min-width:44px;font-size:16px;padding:1px 6px}.bd.leer{background:#eceeec;color:#999}',
    '.kgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px 16px}.kc{text-align:center;background:#f5f8f5;border-radius:14px;padding:10px 6px}.kn{font-size:24px;font-weight:700;margin-top:4px}.kp{font-size:18px;color:#4e5a52}.kg{margin-top:4px;font-size:16px}',
    '.pfolie{display:flex;gap:34px;height:100%}.pl-links{width:300px;flex:none;text-align:center}.pn{font-size:36px;font-weight:800;margin-top:8px;line-height:1.1}.pinfo{font-size:22px;color:#4e5a52;margin-top:4px}',
    '.trikot{display:inline-block;background:#1B5E20;color:#fff;border-radius:10px;padding:0 12px;margin-right:10px;font-weight:800}.sz{display:flex;justify-content:center;gap:10px;margin-top:14px}.sz div,.tiles div{background:#eef3ee;border-radius:12px;padding:6px 12px;min-width:76px}',
    '.sz b,.tiles b{display:block;font-size:28px;color:#14361a}.sz span,.tiles span{font-size:15px;color:#5f6b63}.tinfo{margin-top:12px;font-size:17px;text-align:left;line-height:1.6;background:#f6f8f6;border-radius:10px;padding:8px 10px}',
    '.pl-rechts{flex:1;min-width:0;display:flex;flex-direction:column}.kats{display:flex;gap:10px}.kat{flex:1;border-radius:12px;padding:10px 8px;text-align:center;font-size:22px;font-weight:700;background:#eceeec;color:#222}.kat b{display:block;font-size:30px}',
    '.skg{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:14px}.skcol h4{margin:0 0 6px;font-size:21px;color:#1B5E20;border-bottom:2px solid #dfe8df}.sk{display:flex;align-items:center;gap:8px;font-size:17px;line-height:1.15;margin:5px 0}',
    '.sknote{font-size:13px;color:#68736c;margin:-2px 0 4px 30px}.dot{display:inline-block;width:22px;height:22px;border-radius:50%;flex:none;border:2px solid rgba(0,0,0,.08)}.dot.leer{background:#eceeec}.pmess{margin-top:10px;font-size:16px;line-height:1.7}',
    '.score{display:flex;align-items:center;justify-content:center;gap:36px;margin:6px 0 10px}.sct{font-size:34px;font-weight:700;width:380px;text-align:center}.scr{font-size:90px;font-weight:900;color:#14361a}',
    '.spalten{display:flex;gap:40px}.spalten>*{flex:1;min-width:0}.tor{font-size:24px;margin:5px 0}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{background:#eef3ee;border-radius:16px;padding:4px 12px;font-size:20px}.chip b{color:#1B5E20}',
    '.plus{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.plus span{background:#E8F5E9;color:#1B5E20;border-radius:18px;padding:8px 16px;font-size:22px;font-weight:600}',
    '.tiles{display:flex;gap:12px;margin-bottom:14px}.erg{display:inline-block;border-radius:12px;padding:1px 10px;font-weight:800;color:#fff;background:#FFB300}.ow{font-size:.7em;color:#777;border:1px solid #bbb;border-radius:4px;padding:0 4px;margin-left:4px}.erg.S{background:#2E7D32}.erg.N{background:#E53935}.gn{font-size:19px;margin:4px 0;line-height:1.3}.gnotes h3{margin-top:4px}.tiles div{text-align:center;flex:1}.tb.mess td{font-size:19px}.tb.mess .dot{width:28px;height:28px}',
    '#ui{position:fixed;right:10px;bottom:10px;display:flex;gap:6px;align-items:center;z-index:9;opacity:.85}#ui button{background:rgba(255,255,255,.92);border:0;border-radius:20px;min-width:44px;height:40px;font-size:20px;color:#1B5E20;font-weight:700}#ui span{color:#fff;background:rgba(0,0,0,.45);border-radius:14px;padding:4px 10px;font-size:15px}',
    '#zu{display:none}.inapp #zu{display:inline-block}.tap{position:fixed;top:0;bottom:60px;width:22%;z-index:5}#tapL{left:0}#tapR{right:0}',
    '@media print{@page{size:A4 landscape;margin:0}.fuss .nr{display:inline}html,body{background:#fff;height:auto;overflow:visible}#ui,.tap{display:none!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.slide{position:relative;display:flex!important;width:297mm;height:209mm;overflow:hidden;page-break-after:always;break-after:page;align-items:center;justify-content:center}.slide:last-child{page-break-after:auto;break-after:auto}',
    '.in{transform:scale(.86)!important;border-radius:0;box-shadow:0 0 0 1px #dfe5df}}'
  ].join('\n');
  function deckScript() {
    var S = [].slice.call(document.querySelectorAll('.slide')), n = S.length, i = 0, app = null;
    try { app = window.frameElement && window.parent && window.parent.PSV_PRAES ? window.parent.PSV_PRAES : null; } catch (e) { app = null; }
    if (app) document.documentElement.className += ' inapp';
    S.forEach(function (s, k) { var x = s.querySelector('.fuss .nr'); if (x) x.textContent = (k + 1) + ' / ' + n; });
    function fit() { var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720); document.documentElement.style.setProperty('--s', String(s)); }
    function zeige(k) { i = Math.max(0, Math.min(n - 1, k)); S.forEach(function (x, j) { x.className = x.className.replace(/ ?\bon\b/g, '') + (j === i ? ' on' : ''); }); document.getElementById('cnt').textContent = (i + 1) + ' / ' + n; if (app && app.folie) app.folie(i); }
    function vollbild() {
      if (app && app.vollbild) { app.vollbild(); return; }
      var de = document.documentElement, fe = document.fullscreenElement || document.webkitFullscreenElement;
      if (fe) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } else if (de.requestFullscreen || de.webkitRequestFullscreen) { (de.requestFullscreen || de.webkitRequestFullscreen).call(de); }
    }
    window.addEventListener('resize', fit); fit();
    document.getElementById('vor').onclick = function () { zeige(i + 1); };
    document.getElementById('zur').onclick = function () { zeige(i - 1); };
    document.getElementById('vb').onclick = vollbild;
    document.getElementById('zu').onclick = function () { if (app && app.schliessen) app.schliessen(); };
    document.getElementById('tapL').onclick = function () { zeige(i - 1); };
    document.getElementById('tapR').onclick = function () { zeige(i + 1); };
    document.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter' || k === 'ArrowDown') { zeige(i + 1); e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace' || k === 'ArrowUp') { zeige(i - 1); e.preventDefault(); }
      else if (k === 'Home') zeige(0); else if (k === 'End') zeige(n - 1); else if (k === 'f' || k === 'F') vollbild();
      else if (k === 'Escape' && app && app.schliessen) app.schliessen();
    });
    var x0 = null, y0 = 0;
    document.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    document.addEventListener('touchend', function (e) { if (x0 === null) return; var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) zeige(i + (dx < 0 ? 1 : -1)); });
    window.PRAES = { zeige: zeige, get index() { return i; }, anzahl: n };
    zeige(app && app.start ? app.start : 0);
  }
  function dokument(titel, F) {
    return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + h(titel) + '</title><style>' + CSS + '</style></head><body>' +
      F.map(function (f) { return f.html; }).join('\n') +
      '<div class="tap" id="tapL"></div><div class="tap" id="tapR"></div><div id="ui"><button id="zu" title="Schließen">✕</button><button id="zur" title="Zurück">‹</button><span id="cnt"></span><button id="vor" title="Weiter">›</button><button id="vb" title="Vollbild">⛶</button></div>' +
      '<script>(' + deckScript.toString() + ')();</script></body></html>';
  }

  var api = { erzeuge: erzeuge, teamTaktik: teamTaktik, INHALTE: INHALTE, aufstellungDaten: aufstellungDaten, letztesSpiel: letztesSpiel, hatErgebnis: hatErgebnis, LEGENDE: LEGENDE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PSVPraes = api;
})(this);
