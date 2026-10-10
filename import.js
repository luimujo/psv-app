/* PSV Wesel-Lackhausen – SpielerPlus-Import (ab 2.1): Zusagen aus Excel/CSV/Text übernehmen.
   Erkennt Anwesenheits-Matrix (Mitglieder × Termine) und Langliste (Termin/Datum/Typ/Name/Status).
   Trainings werden erkannt und ignoriert (die App führt keine Trainingsliste). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PSVImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function txt(v) { return v === null || v === undefined ? '' : String(v).replace(/\u00a0/g, ' ').trim(); }
  function norm(s) {
    return txt(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 \-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100)) return null; return y + '-' + pad(m) + '-' + pad(d); }

  // ---------- Tabelle einlesen ----------
  function trennzeichen(zeilen) {
    var K = [';', '\t', ',', '|'], best = ';', bestW = -1;
    K.forEach(function (k) {
      var anz = zeilen.slice(0, 20).filter(function (z) { return z.trim(); }).map(function (z) { return csvZeile(z, k).length; });
      if (!anz.length) return;
      var gleich = anz.filter(function (a) { return a === anz[0]; }).length, w = (anz[0] > 1 ? gleich * anz[0] : 0);
      if (w > bestW) { bestW = w; best = k; }
    });
    return best;
  }
  function csvZeile(z, k) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < z.length; i++) {
      var c = z[i];
      if (q) { if (c === '"') { if (z[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur.trim() === '') { q = true; cur = ''; }
      else if (c === k) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out.map(txt);
  }
  function tabelleAusText(t) {
    t = String(t || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
    var zeilen = t.split('\n'); var k = trennzeichen(zeilen);
    // mehrzeilige Felder in Anführungszeichen zusammenführen
    var rows = [], puffer = null;
    zeilen.forEach(function (z) {
      var s = puffer === null ? z : puffer + '\n' + z, quotes = (s.match(/"/g) || []).length;
      if (quotes % 2) { puffer = s; return; }
      puffer = null; rows.push(csvZeile(s, k));
    });
    if (puffer !== null) rows.push(csvZeile(puffer, k));
    return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
  }
  function tabelleAusArbeitsmappe(XLSX, bytes) {   // erstes Blatt mit den meisten gefüllten Zellen
    var wb = XLSX.read(bytes, { type: 'array', cellDates: true, dense: false });
    var best = null;
    wb.SheetNames.forEach(function (n) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }).map(function (r) { return r.map(function (c) { return c instanceof Date ? c : (typeof c === 'number' ? c : txt(c)); }); })
        .filter(function (r) { return r.some(function (c) { return c !== ''; }); });
      var n2 = rows.reduce(function (a, r) { return a + r.filter(function (c) { return c !== ''; }).length; }, 0);
      if (!best || n2 > best.n) best = { name: n, rows: rows, n: n2 };
    });
    return best ? best.rows : [];
  }

  // ---------- Werte erkennen ----------
  function datumUndZeit(v, ref) {
    ref = ref || new Date();
    if (v instanceof Date && !isNaN(v)) {
      var hh = v.getHours(), mi = v.getMinutes();
      return { datum: iso(v.getFullYear(), v.getMonth() + 1, v.getDate()), zeit: hh || mi ? pad(hh) + ':' + pad(mi) : null };
    }
    if (typeof v === 'number' && v > 20000 && v < 80000) {   // Excel-Seriennummer
      var ms = Math.round((v - 25569) * 86400000), d = new Date(ms), fr = v % 1;
      var z = fr ? Math.round(fr * 1440) : 0;
      return { datum: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), zeit: z ? pad(Math.floor(z / 60)) + ':' + pad(z % 60) : null };
    }
    var s = txt(v); if (!s) return null;
    var m, datum = null, zeit = null, rest = s;
    if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { datum = iso(+m[1], +m[2], +m[3]); rest = s.replace(m[0], ' '); }
    else if ((m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/.exec(s))) {
      var y = m[3] ? +m[3] : null; if (y !== null && y < 100) y += 2000;
      if (y === null) {   // Jahr fehlt: so wählen, dass das Datum möglichst nah am Referenzdatum liegt
        var c = [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1].map(function (j) { return { j: j, d: Math.abs(new Date(j, +m[2] - 1, +m[1]) - ref) }; }).sort(function (a, b) { return a.d - b.d; });
        y = c[0].j;
      }
      datum = iso(y, +m[2], +m[1]); rest = s.replace(m[0], ' ');
    } else if ((m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) { datum = iso(+m[3], +m[1], +m[2]); rest = s.replace(m[0], ' '); }
    if ((m = /(\d{1,2})[:.](\d{2})(?:\s*uhr)?/i.exec(rest)) && +m[1] < 24 && +m[2] < 60) zeit = pad(+m[1]) + ':' + m[2];
    if (!datum) return null;
    return { datum: datum, zeit: zeit };
  }
  function zeitAus(v) {
    if (v instanceof Date) return pad(v.getHours()) + ':' + pad(v.getMinutes());
    if (typeof v === 'number' && v >= 0 && v < 1) { var z = Math.round(v * 1440); return pad(Math.floor(z / 60)) + ':' + pad(z % 60); }
    var m = /(\d{1,2})[:.](\d{2})/.exec(txt(v)); return m && +m[1] < 24 ? pad(+m[1]) + ':' + m[2] : null;
  }
  var ZU = /^(zugesagt|zusage|zugesagt \(.*\)|ja|j|yes|y|x|✓|✔|✔️|☑|☑️|👍|1|true|dabei|anwesend|teilgenommen|kommt|accepted|attending|present|going|\+)$/;
  var AB = /^(abgesagt|absage|abgesagt \(.*\)|nein|n|no|✗|✘|✕|❌|👎|0|false|nicht dabei|abwesend|entschuldigt|kommt nicht|declined|not attending|absent|not going)$/;
  var OF = /^(unsicher|vielleicht|\?|offen|keine antwort|keine rueckmeldung|keine ruckmeldung|k a|ka|unbeantwortet|ausstehend|maybe|pending|unknown|no response|not answered|eventuell)$/;
  function status(v) {
    var s = txt(v).toLowerCase().replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    if (!s || s === '-' || s === '–') return null;
    if (ZU.test(s)) return 'Zugesagt';
    if (AB.test(s)) return 'Abgesagt';
    if (OF.test(s)) return 'Offen';
    if (/^zugesagt|^zusage/.test(s)) return 'Zugesagt';
    if (/^abgesagt|^absage/.test(s)) return 'Abgesagt';
    if (/^unsicher|^keine/.test(s)) return 'Offen';
    return undefined;   // unbekannt
  }
  function art(typ, titel) {
    var s = norm(typ + ' ' + titel);
    if (/training|uebung|trainingseinheit|practice/.test(s)) return 'training';
    if (/spiel|match|turnier|pokal|liga|freundschaft|game|heim|auswaerts|gegen|vs/.test(s)) return 'spiel';
    return 'ignorieren';
  }
  function ortAus(typ, titel, ortWert) {
    var s = norm(ortWert + ' ' + typ + ' ' + titel);
    if (/auswaerts|ausw |away/.test(s + ' ')) return 'Auswärts';
    if (/heim|home/.test(s)) return 'Heim';
    return '';
  }
  function gegnerAus(gegnerWert, titel) {
    var g = txt(gegnerWert); if (g) return g;
    var t = txt(titel), m = /(?:gegen|vs\.?|versus|gg\.?)\s+(.+)$/i.exec(t);
    if (m) return m[1].replace(/\s*\(.*\)\s*$/, '').trim();
    return '';
  }

  // ---------- Layout erkennen ----------
  var KOPF = {
    name: /^(name|vollst.*name|mitglied|mitglieder|spieler|spielerin|teilnehmer|teilnehmerin|person|member|player|mitgliedsname)$/,
    vorname: /^(vorname|first ?name)$/, nachname: /^(nachname|familienname|last ?name|surname)$/,
    status: /(status|zusage|antwort|teilnahme|rueckmeldung|ruckmeldung|response|attendance|anwesenheit|rsvp)/,
    datum: /^(datum|termin ?datum|date|tag|wann|termin|start ?datum|beginn ?datum)$/,
    uhrzeit: /^(uhrzeit|zeit|beginn|start|time|anpfiff|startzeit|beginnzeit|von)$/,
    treffen: /(treffen|treffpunkt ?zeit|meet)/,
    ende: /^(ende|bis|end|endzeit)$/,
    typ: /^(typ|art|kategorie|type|terminart|termintyp|veranstaltungsart)$/,
    titel: /^(titel|bezeichnung|termin ?name|event|veranstaltung|beschreibung|name des termins|terminbezeichnung|termin)$/,
    gegner: /^(gegner|opponent|gegen)$/,
    ort: /^(heim ?\/? ?auswaerts|heim auswaerts|spielort|ort|location)$/
  };
  function kopfAnalyse(row) {
    var sp = {};
    row.forEach(function (c, i) {
      var h = norm(c); if (!h) return;
      Object.keys(KOPF).forEach(function (k) { if (sp[k] === undefined && KOPF[k].test(h)) sp[k] = i; });
    });
    return sp;
  }
  function erkennen(rows, ref) {
    var bester = null;
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var sp = kopfAnalyse(rows[r]);
      var hatName = sp.name !== undefined || sp.vorname !== undefined;
      if (hatName && sp.status !== undefined) {
        // „Termin“ kann Datum oder Titel sein: am Inhalt prüfen
        if (sp.datum !== undefined && sp.datum === sp.titel) {
          var dz = rows.slice(r + 1, r + 6).filter(function (x) { return datumUndZeit(x[sp.datum], ref); }).length;
          if (dz) delete sp.titel; else delete sp.datum;
        }
        if (sp.datum === undefined) {   // Datum in anderer Spalte suchen (Inhalt)
          for (var c = 0; c < rows[r].length; c++) if (c !== sp.name && rows.slice(r + 1, r + 6).filter(function (x) { return datumUndZeit(x[c], ref); }).length >= 1) { sp.datum = c; break; }
        }
        return { layout: 'liste', kopf: r, spalten: sp };
      }
      // Matrix: viele Datumsköpfe
      var dat = []; rows[r].forEach(function (c, i) { var d = datumUndZeit(c, ref); if (d) dat.push(i); });
      if (dat.length >= 1 && (!bester || dat.length > bester.n)) bester = { r: r, n: dat.length, spalten: dat };
    }
    if (bester) {
      var r0 = bester.r, nameSp = 0;
      for (var c2 = 0; c2 < (rows[r0] || []).length; c2++) if (bester.spalten.indexOf(c2) < 0) { nameSp = c2; break; }
      return { layout: 'matrix', kopf: r0, nameSpalte: nameSp, terminSpalten: bester.spalten };
    }
    return { layout: 'unbekannt' };
  }

  // ---------- Einträge ----------
  var SUMME = /^(summe|gesamt|total|anzahl|zugesagt|abgesagt|offen|unsicher|keine antwort|quote|teilnahme ?quote)\b/;
  function eintraege(rows, e, ref) {
    var out = [];
    if (e.layout === 'liste') {
      var s = e.spalten;
      rows.slice(e.kopf + 1).forEach(function (r) {
        var name = s.name !== undefined ? txt(r[s.name]) : (txt(r[s.vorname]) + ' ' + txt(r[s.nachname])).trim();
        if (s.name === undefined && s.vorname === undefined) return;
        if (!name || SUMME.test(norm(name))) return;
        var dz = s.datum !== undefined ? datumUndZeit(r[s.datum], ref) : null; if (!dz) return;
        var st = status(r[s.status]);
        out.push({ datum: dz.datum, uhrzeit: (s.uhrzeit !== undefined && zeitAus(r[s.uhrzeit])) || dz.zeit || '', treffen: s.treffen !== undefined ? zeitAus(r[s.treffen]) || '' : '',
          typ: s.typ !== undefined ? txt(r[s.typ]) : '', titel: s.titel !== undefined ? txt(r[s.titel]) : '', gegner: s.gegner !== undefined ? txt(r[s.gegner]) : '',
          ort: s.ort !== undefined ? txt(r[s.ort]) : '', name: name, statusRoh: s.status !== undefined ? txt(r[s.status]) : '', status: st });
      });
    } else if (e.layout === 'matrix') {
      var kopf = rows[e.kopf], ueber = e.kopf > 0 ? rows[e.kopf - 1] : [], unter = rows[e.kopf + 1] || [];
      var zeitZeile = unter.filter(function (c, i) { return e.terminSpalten.indexOf(i) >= 0 && zeitAus(c) && !status(c); }).length >= Math.max(1, e.terminSpalten.length / 2);
      var termine = e.terminSpalten.map(function (i) {
        var dz = datumUndZeit(kopf[i], ref), kt = txt(kopf[i] instanceof Date ? '' : kopf[i]).replace(/\d{1,2}\.\d{1,2}\.(\d{2,4})?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[:.]\d{2}( uhr)?/gi, ' ').replace(/^\s*(mo|di|mi|do|fr|sa|so)\.?,?\s*/i, '').replace(/\s+/g, ' ').trim();
        var ue = txt(ueber[i]);
        return { col: i, datum: dz.datum, uhrzeit: dz.zeit || (zeitZeile ? zeitAus(unter[i]) : '') || '', titel: [ue, kt].filter(Boolean).join(' ').trim() };
      });
      rows.slice(e.kopf + 1 + (zeitZeile ? 1 : 0)).forEach(function (r) {
        var name = txt(r[e.nameSpalte]); if (!name || SUMME.test(norm(name)) || datumUndZeit(name, ref)) return;
        termine.forEach(function (t) {
          var roh = txt(r[t.col] instanceof Date ? '' : r[t.col]);
          out.push({ datum: t.datum, uhrzeit: t.uhrzeit, treffen: '', typ: '', titel: t.titel, gegner: '', ort: '', name: name, statusRoh: roh, status: status(roh) });
        });
      });
    }
    return out;
  }
  function ereignisse(liste) {
    var map = {}, L = [];
    liste.forEach(function (x) {
      var k = [x.datum, x.uhrzeit, norm(x.typ), norm(x.titel), norm(x.gegner)].join('|');
      if (!map[k]) {
        map[k] = { key: k, datum: x.datum, uhrzeit: x.uhrzeit, treffen: x.treffen, typ: x.typ, titel: x.titel, art: art(x.typ, x.titel + ' ' + x.gegner),
          gegner: gegnerAus(x.gegner, x.titel || x.typ), ort: ortAus(x.typ, x.titel, x.ort), antworten: [] };
        L.push(map[k]);
      }
      if (!map[k].treffen && x.treffen) map[k].treffen = x.treffen;
      map[k].antworten.push({ name: x.name, status: x.status, roh: x.statusRoh });
    });
    L.forEach(function (ev) { if (ev.art === 'ignorieren' && ev.gegner) ev.art = 'spiel'; });
    return L.sort(function (a, b) { return (a.datum + a.uhrzeit).localeCompare(b.datum + b.uhrzeit); });
  }

  // ---------- Namen zuordnen ----------
  function lev(a, b) {
    var m = a.length, n = b.length, d = []; for (var i = 0; i <= m; i++) { d[i] = [i]; } for (var j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) { d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); }   // inkl. Buchstabendreher
    return d[m][n];
  }
  function vorschlag(name, players, gemerkt) {
    var n = norm(name); if (!n) return 'skip';
    var aktiv = players.filter(function (p) { return p.name && !p.archiviert; });
    if (gemerkt && gemerkt[n] !== undefined) { var g = gemerkt[n]; if (g === 'skip' || players.some(function (p) { return p.id === g; })) return g; }
    var exakt = aktiv.filter(function (p) { return norm(p.name) === n; }); if (exakt.length === 1) return exakt[0].id;
    var vn = n.split(' ')[0];
    var gleich = aktiv.filter(function (p) { return norm(p.name).split(' ')[0] === vn; });
    if (gleich.length === 1) {
      var pn = norm(gleich[0].name).split(' '), inN = n.split(' ');
      if (pn.length < 2 || inN.length < 2 || pn[pn.length - 1] === inN[inN.length - 1] || pn[pn.length - 1][0] === inN[inN.length - 1][0]) return gleich[0].id;
    }
    if (gleich.length > 1) {   // gleicher Vorname mehrfach: Nachname entscheidet
      var nach = n.split(' ').slice(-1)[0], t = gleich.filter(function (p) { return norm(p.name).split(' ').slice(-1)[0] === nach; }); if (t.length === 1) return t[0].id;
      return 'skip';
    }
    if (vn.length >= 4) { var f = aktiv.filter(function (p) { return lev(norm(p.name).split(' ')[0], vn) <= 1; }); if (f.length === 1) return f[0].id; }
    return 'skip';
  }

  // ---------- Plan & Übernahme ----------
  function spieltagSuchen(d, ev, M) {
    var am = d.spieltage.filter(function (st) { return st.datum === ev.datum; });
    if (ev.gegner && M && M.gegnerKey) {
      var gk = M.gegnerKey(ev.gegner), t = am.filter(function (st) { return M.gegnerKey(st.gegner || '') === gk; });
      if (t.length) return t[0];
      t = am.filter(function (st) { return !st.gegner; }); if (t.length === 1) return t[0];
      return am.length === 1 && !am[0].gegner ? am[0] : (am.length === 1 && M.gegnerKey(am[0].gegner).indexOf(gk.split(' ')[0]) >= 0 ? am[0] : null);
    }
    return am.length === 1 ? am[0] : null;
  }
  function plan(d, evs, namen, arten, M) {
    var schritte = [];
    evs.forEach(function (ev) {
      var a = arten[ev.key] || ev.art; if (a !== 'spiel') { schritte.push({ ev: ev, art: a, ignoriert: true }); return; }
      var st = spieltagSuchen(d, ev, M), aend = [], unbekannt = [];
      ev.antworten.forEach(function (x) {
        var pid = namen[norm(x.name)]; if (pid === undefined || pid === 'skip') return;
        if (x.status === undefined) { unbekannt.push(x.name + ': „' + x.roh + '“'); return; }
        if (x.status === null) return;
        var alt = st ? (st.zusagen[pid] || '') : '';
        if (alt !== x.status) aend.push({ pid: pid, alt: alt, neu: x.status });
      });
      schritte.push({ ev: ev, art: 'spiel', neu: !st, stId: st ? st.id : null, abgeschlossen: !!(st && st.status === 'abgeschlossen'), aenderungen: aend, unbekannt: unbekannt });
    });
    return schritte;
  }
  function anwenden(d, schritte, namen, M, opt) {
    opt = opt || {}; var r = { neu: 0, geaendert: 0, zusagen: 0, uebersprungen: 0 }, vorher = d.aktiverSpieltag, neue = [];
    schritte.forEach(function (s) {
      if (s.ignoriert) return;
      if (s.abgeschlossen && !opt.abgeschlosseneUeberschreiben) { r.uebersprungen++; return; }
      var st;
      if (s.neu) { st = M.neuerSpieltag(d, { datum: s.ev.datum, gegner: s.ev.gegner, ort: s.ev.ort || 'Heim' }); st.zusagen = {}; r.neu++; neue.push(st); }
      else { st = M.getSpieltag(d, s.stId); if (!st) return; if (s.ev.ort && !st.ort) st.ort = s.ev.ort; r.geaendert++; }
      if (s.ev.uhrzeit) st.uhrzeit = s.ev.uhrzeit; if (s.ev.treffen) st.treffen = s.ev.treffen;
      st.spielerplus = { importiert: new Date().toISOString() };
      s.aenderungen.forEach(function (a) { st.zusagen[a.pid] = a.neu; r.zusagen++; });
    });
    // aktiver Spieltag: nächster neu angelegter ab heute, sonst wie vorher
    var heute = M.today ? M.today() : new Date().toISOString().slice(0, 10);
    var kommend = neue.filter(function (st) { return st.datum >= heute; }).sort(function (a, b) { return a.datum.localeCompare(b.datum); });
    d.aktiverSpieltag = kommend.length ? kommend[0].id : (vorher || d.aktiverSpieltag);
    d.importZuordnung = Object.assign(d.importZuordnung || {}, namen);
    return r;
  }

  return { norm: norm, tabelleAusText: tabelleAusText, tabelleAusArbeitsmappe: tabelleAusArbeitsmappe, datumUndZeit: datumUndZeit, status: status, art: art,
    erkennen: erkennen, eintraege: eintraege, ereignisse: ereignisse, vorschlag: vorschlag, plan: plan, anwenden: anwenden };
});
