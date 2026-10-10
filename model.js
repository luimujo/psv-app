/* PSV Wesel-Lackhausen Aufstellung – Datenmodell ab Version 1.1
 * Spieltage (mit eingefrorenen Aufstellungen), Spielbewertungen, automatische Form, Grundwert-Vorschläge.
 * Der Rechenkern (engine.js) bleibt unverändert; hier wird nur bestimmt, mit welchen Eingaben er rechnet.
 */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PSVEngine;
  var DATA_VERSION = 2;
  var MATCH_SETTINGS = ['zusagenVerwenden', 'offenMitplanen', 'kapitaen', 'kapitaenStartelf', 'gewichtKondition', 'paar7', 'paar9'];

  // Kriterien der Spielbewertung und ihre Grundwerte (Zeilen im Spielerbogen)
  // ab 1.4: w = Gewicht der Zeile (unter 1 = Kriterium misst die Zeile nur teilweise → mehr Spiele nötig, Messungen zählen stärker);
  //        pos = Faktor je gespielter Positionsgruppe (def = IV/LV/RV, mit = 6/8/LM/RM, off = 10/LA/RA/ST/HS)
  var KRIT_FELD = [
    { key: 'zweikampf', label: 'Zweikampf', rows: [36, 29], pos: { 29: { off: 0.4 } } },
    { key: 'positionsspiel', label: 'Positionsspiel', rows: [25, 30], pos: { 25: { off: 0.5 }, 30: { def: 0.5 } } },
    { key: 'einsatz', label: 'Laufbereitschaft / Einsatz', rows: [35, 41, 28], w: { 35: 0.5 } },
    { key: 'passspiel', label: 'Passspiel / Ballbehandlung', rows: [16, 17] },
    { key: 'spielverstaendnis', label: 'Spielverständnis', rows: [26, 40, 31] }
  ];
  var KRIT_TW = [
    { key: 'halten', label: 'Halten', rows: [16, 33, 21], w: { 33: 0.5 } },
    { key: 'strafraum', label: 'Strafraumbeherrschung', rows: [22, 17, 28], w: { 28: 0.5 } },
    { key: 'spielaufbau', label: 'Spielaufbau', rows: [18, 19, 23, 29], w: { 29: 0.5 } }
  ];
  // Positionseignung aus Spielbewertungen: Gewicht der Kriterien je Position (Summe 1)
  var POS_KRIT = {
    IV: { zweikampf: 0.35, positionsspiel: 0.3, spielverstaendnis: 0.15, passspiel: 0.1, einsatz: 0.1 },
    LV: { zweikampf: 0.25, positionsspiel: 0.25, einsatz: 0.25, passspiel: 0.15, spielverstaendnis: 0.1 },
    RV: { zweikampf: 0.25, positionsspiel: 0.25, einsatz: 0.25, passspiel: 0.15, spielverstaendnis: 0.1 },
    '6': { positionsspiel: 0.25, passspiel: 0.25, spielverstaendnis: 0.25, zweikampf: 0.15, einsatz: 0.1 },
    '8': { passspiel: 0.25, einsatz: 0.25, spielverstaendnis: 0.2, zweikampf: 0.15, positionsspiel: 0.15 },
    '10': { spielverstaendnis: 0.3, passspiel: 0.3, positionsspiel: 0.2, einsatz: 0.1, zweikampf: 0.1 },
    HS: { spielverstaendnis: 0.3, passspiel: 0.3, positionsspiel: 0.2, einsatz: 0.1, zweikampf: 0.1 },
    LA: { passspiel: 0.3, einsatz: 0.25, positionsspiel: 0.2, spielverstaendnis: 0.15, zweikampf: 0.1 },
    RA: { passspiel: 0.3, einsatz: 0.25, positionsspiel: 0.2, spielverstaendnis: 0.15, zweikampf: 0.1 },
    ST: { positionsspiel: 0.3, zweikampf: 0.2, einsatz: 0.2, passspiel: 0.15, spielverstaendnis: 0.15 },
    TW: { halten: 0.5, strafraum: 0.3, spielaufbau: 0.2 }
  };
  var POS_SPALTE = { LM: 'LA', RM: 'RA' };
  function posGruppe(pos) {
    if (!pos) return '';
    if (pos === 'TW') return 'tw';
    if (['IV', 'LV', 'RV'].indexOf(pos) >= 0) return 'def';
    if (['6', '8', 'LM', 'RM'].indexOf(pos) >= 0) return 'mit';
    return 'off';
  }
  function posFaktor(k, row, pos) { var g = posGruppe(pos), m = k.pos && k.pos[row]; return m && isNum(m[g]) ? m[g] : 1; }
  function zeilenGewicht(k, row) { return k.w && isNum(k.w[row]) ? k.w[row] : 1; }
  // Gegnerstärke (optional je Spieltag): milde Korrektur der Bewertung (gegen Starke zählt eine 3 etwas mehr)
  var GEGNER = { schwach: -0.3, mittel: 0, stark: 0.3 };
  function gegnerKorrektur(st) { return st && GEGNER[st.gegnerStaerke] ? GEGNER[st.gegnerStaerke] : 0; }
  function korrigiert(v, st) { var a = gegnerKorrektur(st); return a ? Math.max(1, Math.min(5, v + a)) : v; }
  var FORM_MAX_TAGE = 120;   // ältere Spiele (bezogen auf das neueste bewertete) zählen nicht mehr zur Form
  var FORM_MAX_SPIELE = 5;
  var FORM_RECENCY = [1, 0.8, 0.6, 0.4, 0.2];
  var VORSCHLAG_MIN_SPIELE = 3, VORSCHLAG_MAX_SPIELE = 5, VORSCHLAG_SCHWELLE = 0.75;
  var STANDARD_SPIELZEIT = 60;   // ab 1.8: alle Spiele 2 × 30 Min. (7er und 9er)

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function newId() { return 'st_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function fmtDatum(iso) { if (!iso) return 'ohne Datum'; var p = iso.split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : iso; }
  function titel(st) {
    if (!st) return 'Kein Spieltag';
    return fmtDatum(st.datum) + (st.gegner ? ' · gegen ' + st.gegner : '') + (st.ort ? ' (' + st.ort + ')' : '') + (st.groesse ? ' · ' + st.groesse + 'er' : '');
  }
  function kritFuer(p, b) {   // Kriterien nach gespielter Position (TW) bzw. Bogen
    var pos = b && b.position;
    if (pos === 'TW') return KRIT_TW;
    if (!pos && p && p.typ === 'TW') return KRIT_TW;
    return KRIT_FELD;
  }
  function kritMapFuerTyp(typ) { return typ === 'TW' ? KRIT_TW : KRIT_FELD; }   // Zuordnung Kriterium → Grundwert gilt nur für den eigenen Bogen-Typ

  // ---------- Migration / Normalisierung ----------
  function parseSpielName(s) {   // „Spiel 08.10. gegen Hemden“ → Datum/Gegner
    var r = { datum: '', gegner: '' }, m = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/.exec(s || '');
    if (m) { var y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : '2026'; r.datum = y + '-' + pad(+m[2]) + '-' + pad(+m[1]); }
    var g = /gegen\s+(.+)$/i.exec(s || ''); if (g) r.gegner = g[1].trim();
    return r;
  }
  function migrate(d) {
    if (!d || !Array.isArray(d.players)) throw new Error('Keine gültige Kaderdatei (players fehlt).');
    d = clone(d);
    if (isNum(d.version) && d.version > DATA_VERSION) throw new Error('Die Datei stammt aus einer neueren App-Version (' + d.version + ').');
    // stabile Spieler-IDs
    var used = {}, maxId = 0, fix = [];
    d.players.forEach(function (p) { if (isNum(p.id) && !used[p.id]) { used[p.id] = true; maxId = Math.max(maxId, p.id); } else fix.push(p); });
    fix.forEach(function (p) { p.id = ++maxId; });
    d.settings = d.settings || {};
    if (!Array.isArray(d.spieltage)) {
      // Version 1.0: ein einziger Spieltag in settings + player.status
      var info = parseSpielName(d.settings.spieltag);
      var st = { id: 'st_migriert_1', datum: info.datum || today(), gegner: info.gegner || '', ort: '', groesse: '', spielzeit: STANDARD_SPIELZEIT,
        status: 'offen', settings: {}, zusagen: {}, bewertungen: {}, snapshot: null, angelegt: new Date().toISOString(), migriert: true };
      MATCH_SETTINGS.forEach(function (k) { if (d.settings[k] !== undefined) st.settings[k] = d.settings[k]; });
      if (st.settings.zusagenVerwenden === undefined) st.settings.zusagenVerwenden = true;
      d.players.forEach(function (p) { if (p.name && p.status) st.zusagen[p.id] = p.status; });
      d.spieltage = [st]; d.aktiverSpieltag = st.id;
    }
    d.players.forEach(function (p) { delete p.status; if (!p.archiviert) delete p.archiviert; });
    MATCH_SETTINGS.concat(['spieltag']).forEach(function (k) { delete d.settings[k]; });
    d.spieltage.forEach(function (st) {
      st.id = st.id || newId(); st.settings = st.settings || {}; st.zusagen = st.zusagen || {}; st.bewertungen = st.bewertungen || {};
      st.status = st.status === 'abgeschlossen' && st.snapshot ? 'abgeschlossen' : 'offen'; if (st.status === 'offen') st.snapshot = null;
      if (!isNum(st.spielzeit)) st.spielzeit = STANDARD_SPIELZEIT;
      spielbericht(st);
      ['datum', 'gegner', 'ort', 'groesse'].forEach(function (k) { if (st[k] === undefined || st[k] === null) st[k] = ''; });
      st.groesse = String(st.groesse);
    });
    if (!d.spieltage.some(function (s) { return s.id === d.aktiverSpieltag; })) d.aktiverSpieltag = d.spieltage.length ? sortSpieltage(d.spieltage)[0].id : null;
    d.vorschlaegeIgnoriert = d.vorschlaegeIgnoriert || {};
    d.team = 'PSV Wesel-Lackhausen';   // Vereinsname (ab 1.3; ältere Dateien trugen noch den Sponsornamen)
    if (!Array.isArray(d.messkatalog)) d.messkatalog = standardKatalog();   // ab 1.4
    if (!Array.isArray(d.messungen)) d.messungen = [];
    d.messungen.forEach(function (m) { m.werte = m.werte || {}; m.tests = m.tests || []; });
    gegnerMigrieren(d);   // ab 1.6: Gegner-Datei, Spieltage verknüpfen
    korrekturenAnwenden(d);   // ab 1.7: einmalige Korrekturen (Spielbericht Hemden 08.10.2026)
    d.version = DATA_VERSION;
    return d;
  }
  function sortSpieltage(list) {   // neueste zuerst
    return list.slice().sort(function (a, b) { return (b.datum || '').localeCompare(a.datum || '') || (b.angelegt || '').localeCompare(a.angelegt || ''); });
  }
  function getSpieltag(d, id) { for (var i = 0; i < d.spieltage.length; i++) if (d.spieltage[i].id === id) return d.spieltage[i]; return null; }
  function aktiver(d) { return getSpieltag(d, d.aktiverSpieltag); }

  function defaultMatchSettings() { return { zusagenVerwenden: true, offenMitplanen: false, kapitaen: '', kapitaenStartelf: true, gewichtKondition: 2, paar7: E.STANDARD_PAAR['7'].slice(), paar9: E.STANDARD_PAAR['9'].slice() }; }
  function neuerSpieltag(d, opt) {
    opt = opt || {};
    var datum = opt.datum || today();
    // Vorlage: letzter Spieltag am oder vor dem Datum, sonst der neueste
    var sorted = sortSpieltage(d.spieltage), vor = null;
    for (var i = 0; i < sorted.length; i++) if ((sorted[i].datum || '') <= datum) { vor = sorted[i]; break; }
    if (!vor && sorted.length) vor = sorted[0];
    var st = { id: newId(), datum: datum, gegner: (opt.gegner || '').trim(), ort: opt.ort || 'Heim', groesse: opt.groesse ? String(opt.groesse) : '',
      spielzeit: isNum(opt.spielzeit) && opt.spielzeit > 0 ? opt.spielzeit : STANDARD_SPIELZEIT,
      status: 'offen', settings: Object.assign(defaultMatchSettings(), vor ? clone(vor.settings) : {}), zusagen: vor ? clone(vor.zusagen) : {},
      bewertungen: {}, snapshot: null, spiel: leererSpielbericht(), angelegt: new Date().toISOString(), vorlage: vor ? vor.id : null };
    if (opt.gegnerStaerke && GEGNER[opt.gegnerStaerke] !== undefined) st.gegnerStaerke = opt.gegnerStaerke;
    if (st.gegner) gegnerVerknuepfen(d, st);
    d.spieltage.push(st); d.aktiverSpieltag = st.id;
    return st;
  }
  function loescheSpieltag(d, id) {
    d.spieltage = d.spieltage.filter(function (s) { return s.id !== id; });
    if (d.aktiverSpieltag === id) d.aktiverSpieltag = d.spieltage.length ? sortSpieltage(d.spieltage)[0].id : null;
  }

  // ---------- Form aus Spielbewertungen ----------
  function spielwert(b) {   // Mittel der vergebenen Kriterien (1–5)
    if (!b || b.gespielt === false || !b.werte) return null;
    var s = 0, n = 0; Object.keys(b.werte).forEach(function (k) { var v = b.werte[k]; if (isNum(v)) { s += v; n++; } });
    return n ? s / n : null;
  }
  function bewerteteSpiele(d, pid) {   // neueste zuerst
    var out = [];
    sortSpieltage(d.spieltage).forEach(function (st) {
      if (st.ohneWertung) return;   // Spiel ohne Wertung zählt nicht für Form und Vorschläge
      var b = st.bewertungen[pid], w = spielwert(b);
      if (w !== null) out.push({ st: st, b: b, wert: w });
    });
    return out;
  }
  function minutenFaktor(b, st, pid) {
    var m = isNum(b.minuten) ? b.minuten : (pid !== undefined ? minutenFuer(st, pid) : null);
    if (!isNum(m)) return 1;
    var sz = isNum(st.spielzeit) && st.spielzeit > 0 ? st.spielzeit : STANDARD_SPIELZEIT;
    return Math.max(0.25, Math.min(1, m / sz));
  }
  function autoForm(d, pid) {
    var alle = bewerteteSpiele(d, pid), neu = alle.length && alle[0].st.datum ? Date.parse(alle[0].st.datum) : null;
    var spiele = alle.filter(function (x) { return neu === null || !x.st.datum || (neu - Date.parse(x.st.datum)) / 864e5 <= FORM_MAX_TAGE; }).slice(0, FORM_MAX_SPIELE);
    if (!spiele.length) return null;
    var sw = 0, s = 0;
    spiele.forEach(function (x, k) { x.roh = x.wert; x.wert = korrigiert(x.wert, x.st); var w = FORM_RECENCY[k] * minutenFaktor(x.b, x.st, pid); x.gewicht = w; s += w * x.wert; sw += w; });
    var form = E.xround(s / sw, 1);
    var chron = spiele.slice().reverse();
    var trend = null;
    if (spiele.length >= 2) {
      var frueher = spiele.slice(1), m = frueher.reduce(function (a, x) { return a + x.wert; }, 0) / frueher.length;
      var diff = spiele[0].wert - m;
      trend = { diff: diff, richtung: diff >= 0.3 ? 'steigend' : (diff <= -0.3 ? 'fallend' : 'stabil') };
    }
    return { form: form, anzahl: spiele.length, spiele: chron.map(function (x) { return { id: x.st.id, datum: x.st.datum, gegner: x.st.gegner, gegnerStaerke: x.st.gegnerStaerke || '', roh: E.xround(x.roh, 1), wert: E.xround(x.wert, 1), minuten: minutenFuer(x.st, pid), gewicht: E.xround(x.gewicht, 2) }; }), trend: trend };
  }
  // Eingaben für den Rechenkern: Form-Felder Spiel 1–3 werden durch die automatische Form ersetzt, Trainingsbeteiligung bleibt
  function effectivePlayers(d) {
    return d.players.map(function (p) {
      var q = clone(p), af = autoForm(d, p.id);
      if (p.archiviert) q.name = '';   // ehemalige Spieler: nicht mehr in Ranking und Aufstellungs-Vorschlägen
      q.formQuelle = af ? 'auto' : 'manuell';
      if (af) q.form = [af.form, af.form, af.form, (p.form || [])[3] === undefined ? null : (p.form || [])[3]];
      return q;
    });
  }
  function effectiveData(d, st) {
    var players = effectivePlayers(d), s = st ? Object.assign(defaultMatchSettings(), st.settings) : Object.assign(defaultMatchSettings(), { zusagenVerwenden: false });
    players.forEach(function (p) { p.status = p.name ? ((st && st.zusagen[p.id]) || 'nicht gemeldet') : ''; });
    var settings = Object.assign({}, s, { bonusStamm: d.settings.bonusStamm, bonusAlt: d.settings.bonusAlt, spieltag: titel(st) });
    return { skala: d.skala, labels: d.labels, zones: d.zones, players: players, settings: settings };
  }
  function berechne(d, st) { return E.compute(effectiveData(d, st === undefined ? aktiver(d) : st)); }

  // ---------- Eingefrorene Aufstellung ----------
  function snapshotAus(d, st) {
    var R = berechne(d, st), L = R.lineups, pit = {};
    Object.keys(L.pitches).forEach(function (code) {
      var P = L.pitches[code];
      pit[code] = { code: code, name: P.name, size: P.size, rolle: P.rolle || '', aufstellung: clone(P.aufstellung), bank: clone(P.bank) };
      pit[code].aufstellung.concat(pit[code].bank).forEach(function (s) { if (s.kind && d.players[s.kind - 1]) s.pid = d.players[s.kind - 1].id; });
    });
    var gesamt = {}; d.players.forEach(function (p, i) { if (p.name && !p.archiviert) gesamt[p.id] = R.evals[i].gesamt; });
    return { erstellt: new Date().toISOString(), pitches: pit, varianten: { '7': { v: L.varianten['7'].v, paar: L.varianten['7'].paar }, '9': { v: L.varianten['9'].v, paar: L.varianten['9'].paar } },
      einsetzbar: L.einsetzbar, nichtEingeplant: clone(L.nichtEingeplant), kapitaen: L.kapitaenNr ? L.kinder[L.kapitaenNr - 1].vor : '', gesamt: gesamt, titel: titel(st) };
  }
  function abschliessen(d, id) { var st = getSpieltag(d, id); st.snapshot = snapshotAus(d, st); st.status = 'abgeschlossen'; st.abgeschlossenAm = st.snapshot.erstellt; return st; }
  function wiederOeffnen(d, id) { var st = getSpieltag(d, id); st.status = 'offen'; st.snapshot = null; delete st.abgeschlossenAm; return st; }
  // Startaufstellung eines Spieltags (eingefroren oder live) – für die Vorbelegung „gespielte Position“
  function aufstellungVon(d, st, R) {
    if (st.snapshot) return st.snapshot.pitches;
    return (R || berechne(d, st)).lineups.pitches;
  }

  // ---------- Grundwert-Vorschläge ----------
  function komma(x) { return String(x).replace('.', ','); }
  // Vorschläge für Grundwerte aus Spielbewertungen (je Kriterium, gewichtet nach gespielter Position und Gegnerstärke)
  // und aus Messungen (Testkatalog). Nie automatisch – nur Übernehmen/Ignorieren.
  function vorschlaege(d, pid, heute) {
    var p = spielerById(d, pid);
    if (!p || !p.name) return [];
    var spiele = bewerteteSpiele(d, pid), out = [], quellen = {};
    var label = function (r) { return (d.labels && d.labels[p.typ] && d.labels[p.typ][String(r)]) || ('Zeile ' + r); };
    kritMapFuerTyp(p.typ).forEach(function (k) {
      var eint = [];
      spiele.forEach(function (x) { var v = x.b.werte[k.key]; if (isNum(v) && eint.length < VORSCHLAG_MAX_SPIELE) eint.push({ v: korrigiert(v, x.st), roh: v, pos: x.b.position || '' }); });
      k.rows.forEach(function (r) {
        var sf = 0, sv = 0, n = 0, posGew = false;
        eint.forEach(function (e) { var f = posFaktor(k, r, e.pos); if (f < 1) posGew = true; if (f > 0) { sf += f; sv += f * e.v; n++; } });
        if (!n) return;
        var zw = zeilenGewicht(k, r);
        quellen[r] = { k: k, avg: sv / sf, n: n, neff: sf, zw: zw, posGew: posGew, gegner: eint.some(function (e) { return e.v !== e.roh; }),
          genug: sf >= Math.min(VORSCHLAG_MAX_SPIELE, VORSCHLAG_MIN_SPIELE / zw) - 1e-9 };
      });
    });
    var mq = messQuellen(d, p, heute);
    var rows = {}; Object.keys(quellen).concat(Object.keys(mq)).forEach(function (r) { rows[r] = true; });
    Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      var b = p.skills ? p.skills[String(r)] : null; if (!isNum(b)) return;
      var q = quellen[r], m = mq[r] || [], mw = m.reduce(function (a, x) { return a + x.w; }, 0);
      var est, art;
      if (mw >= 0.5 - 1e-9) {
        var wq = q ? q.zw * Math.min(1, q.neff / VORSCHLAG_MIN_SPIELE) : 0;
        est = (wq * (q ? q.avg : 0) + m.reduce(function (a, x) { return a + x.w * x.score; }, 0)) / (wq + mw);
        art = wq > 0 ? 'kombiniert' : 'messung';
      } else if (q && q.genug) { est = q.avg; art = 'spiele'; }
      else return;
      if (Math.abs(est - b) < VORSCHLAG_SCHWELLE - 1e-9) return;
      var neu = Math.max(1, Math.min(5, E.xround(est, 0))); if (neu === b) return;
      var avg = q ? E.xround(q.avg, 1) : null, sig;
      if (art === 'spiele') sig = neu + '|' + q.n + '|' + avg;
      else sig = neu + '|' + (q ? q.n + '|' + avg : '-') + '|' + m.map(function (x) { return x.sessionId + ':' + x.test.id; }).join(',') + '|' + E.xround(est, 1);
      var text = 'Vorschlag: ' + label(r) + ' ' + b + ' → ' + neu + ' (';
      var spText = q ? 'Ø ' + komma(avg) + ' aus ' + q.n + ' Spiel' + (q.n === 1 ? '' : 'en') + ', Kriterium ' + q.k.label + (q.posGew ? ', gewichtet nach Position' : '') + (q.gegner ? ', Gegnerstärke berücksichtigt' : '') : '';
      if (art === 'spiele') text += spText + ')';
      else text += 'Messung: ' + m.map(function (x) { return x.test.name + ' ' + komma(x.wert) + ' ' + x.test.einheit + ' → ' + komma(x.score); }).join('; ') + (art === 'kombiniert' ? '; Spiele: ' + spText : '') + (art === 'kombiniert' || m.length > 1 ? '; zusammen ' + komma(E.xround(est, 1)) : '') + ')';
      out.push({ pid: pid, row: r, label: label(r), kriterium: q ? q.k.label : '', quelle: art, alt: b, neu: neu, avg: art === 'spiele' ? avg : E.xround(est, 1), n: q ? q.n : 0,
        messungen: m.map(function (x) { return { test: x.test.name, wert: x.wert, score: x.score, datum: x.datum }; }), signatur: sig, ignoriert: d.vorschlaegeIgnoriert[pid + ':' + r] === sig, text: text });
    });
    eignungsVorschlaege(d, p, spiele).forEach(function (v) { out.push(v); });
    return out;
  }
  // Positionseignung je gespielter Position (mind. 3 Spiele auf dieser Position)
  function eignungsVorschlaege(d, p, spiele) {
    var proPos = {}, out = [];
    spiele.forEach(function (x) {
      var pos = x.b.position; if (!pos) return;
      var col = POS_SPALTE[pos] || pos, W = POS_KRIT[col]; if (!W) return;
      var s = 0, w = 0; Object.keys(W).forEach(function (k) { var v = x.b.werte[k]; if (isNum(v)) { s += W[k] * korrigiert(v, x.st); w += W[k]; } });
      if (w < 0.5 - 1e-9) return;   // zu wenige positionsrelevante Kriterien bewertet
      (proPos[col] = proPos[col] || []).length < VORSCHLAG_MAX_SPIELE && proPos[col].push(s / w);
    });
    Object.keys(proPos).forEach(function (col) {
      var L = proPos[col], b = p.eignung ? p.eignung[col] : null;
      if (L.length < VORSCHLAG_MIN_SPIELE || !isNum(b)) return;
      var avg = L.reduce(function (a, v) { return a + v; }, 0) / L.length;
      if (Math.abs(avg - b) < VORSCHLAG_SCHWELLE - 1e-9) return;
      var neu = Math.max(1, Math.min(5, E.xround(avg, 0))); if (neu === b) return;
      var row = 'e:' + col, sig = neu + '|' + L.length + '|' + E.xround(avg, 1);
      out.push({ pid: p.id, row: row, label: 'Positionseignung ' + col, kriterium: 'Positionswertung', quelle: 'spiele', alt: b, neu: neu, avg: E.xround(avg, 1), n: L.length, messungen: [], signatur: sig,
        ignoriert: d.vorschlaegeIgnoriert[p.id + ':' + row] === sig,
        text: 'Vorschlag: Positionseignung ' + col + ' ' + b + ' → ' + neu + ' (Ø ' + komma(E.xround(avg, 1)) + ' aus ' + L.length + ' Spielen als ' + col + ', Kriterien nach Position gewichtet)' });
    });
    return out;
  }
  function vorschlagUebernehmen(d, v) {
    var p = d.players.filter(function (x) { return x.id === v.pid; })[0];
    if (String(v.row).indexOf('e:') === 0) { p.eignung = p.eignung || {}; p.eignung[v.row.slice(2)] = v.neu; delete d.vorschlaegeIgnoriert[v.pid + ':' + v.row]; return; }
    p.skills[String(v.row)] = v.neu;
    p.notes = p.notes || {};
    var her = v.quelle === 'messung' ? 'Aus Messung übernommen' : (v.quelle === 'kombiniert' ? 'Aus Messung + Spielbewertung übernommen' : 'Aus Spielbewertung übernommen');
    var detail = v.quelle === 'spiele' ? 'Ø ' + komma(v.avg) + ' aus ' + v.n + ' Spielen' : v.messungen.map(function (m) { return m.test + ' ' + komma(m.wert) + ' (' + fmtDatum(m.datum) + ')'; }).join(', ') + (v.n ? ', ' + v.n + ' Spiele' : '');
    p.notes[String(v.row)] = her + ': ' + v.alt + ' → ' + v.neu + ' (' + detail + ', ' + fmtDatum(today()) + ')';
    delete d.vorschlaegeIgnoriert[v.pid + ':' + v.row];
  }
  function vorschlagIgnorieren(d, v) { d.vorschlaegeIgnoriert[v.pid + ':' + v.row] = v.signatur; }

  // ---------- Spielverlauf: tatsächliche Startelf, Tore, Vorlagen, Abwehrfehler, Wechsel ----------
  function leererSpielbericht() { return { startelf: null, tore: [], fehler: [], wechsel: [], gegentore: 0, gegen: [], notizen: [], karten: [], tausch: [] }; }
  function spielbericht(st) {
    if (!st.spiel) st.spiel = leererSpielbericht();
    var s = st.spiel; ['tore', 'fehler', 'wechsel', 'gegen', 'notizen', 'karten', 'tausch'].forEach(function (k) { s[k] = s[k] || []; }); if (!isNum(s.gegentore)) s.gegentore = 0;
    return s;
  }
  function formationVon(code) { for (var i = 0; i < E.PITCHES.length; i++) if (E.PITCHES[i].code === code) return E.PITCHES[i]; return null; }
  // Startelf aus dem (eingefrorenen oder live) Vorschlag übernehmen
  function startelfAusVorschlag(d, st, code) {
    code = code || E.paarFuer(st.settings, String(st.groesse || '9'))[0];
    var pit = aufstellungVon(d, st)[code], slots = [];
    (pit ? pit.aufstellung : []).forEach(function (s) { var pid = s.pid || (s.kind && !st.snapshot && d.players[s.kind - 1] ? d.players[s.kind - 1].id : null); slots.push(pid || null); });
    spielbericht(st).startelf = { formation: code, slots: slots };
    return st.spiel.startelf;
  }
  function startelfListe(st) {   // [{pid,pos}]
    var s = st.spiel && st.spiel.startelf; if (!s) return [];
    var f = formationVon(s.formation); if (!f) return [];
    return f.slots.map(function (sl, i) { return { pos: sl[0], pid: s.slots[i] === undefined ? null : s.slots[i] }; });
  }
  function setFormation(st, code) {   // Kinder wandern auf gleiche Position, sonst auf den nächstgelegenen Platz
    var s = spielbericht(st), f = formationVon(code); if (!f) return;
    var of = s.startelf ? formationVon(s.startelf.formation) : null, alt = [];
    if (of) of.slots.forEach(function (sl, i) { var pid = s.startelf.slots[i]; if (pid) alt.push({ pid: pid, pos: sl[0], x: sl[1], y: sl[2] }); });
    var slots = f.slots.map(function () { return null; }), frei = alt.slice();
    f.slots.forEach(function (sl, i) {   // 1. gleiche Position (bei zwei IV: der nähere)
      var best = -1, bd = 1e9;
      frei.forEach(function (o, k) { if (o.pos !== sl[0]) return; var dd = Math.abs(o.x - sl[1]) + Math.abs(o.y - sl[2]); if (dd < bd) { bd = dd; best = k; } });
      if (best >= 0) { slots[i] = frei[best].pid; frei.splice(best, 1); }
    });
    for (;;) {   // 2. übrige Plätze: jeweils das insgesamt nächstgelegene Paar Kind/Platz (TW nur auf TW)
      var bi = -1, bk = -1, bd2 = 1e9;
      f.slots.forEach(function (sl, i) {
        if (slots[i] !== null) return;
        frei.forEach(function (o, k) { if ((o.pos === 'TW') !== (sl[0] === 'TW')) return; var dd = Math.hypot(o.x - sl[1], o.y - sl[2]); if (dd < bd2) { bd2 = dd; bi = i; bk = k; } });
      });
      if (bi < 0) break;
      slots[bi] = frei[bk].pid; frei.splice(bk, 1);
    }
    s.startelf = { formation: code, slots: slots };   // übrig gebliebene Kinder (kleinere Formation) sitzen auf der Bank
  }
  // Drag & Drop auf dem Spielfeld: src/dst = 's:<Slot-Index>' | 'b:<Kind-ID>' (Bank) | 'bank'
  function startelfDrop(st, src, dst) {
    var se = st.spiel && st.spiel.startelf; if (!se || !src || !dst || src === dst) return false;
    var sl = se.slots, a = src.split(':'), b = dst.split(':');
    if (a[0] === 's' && b[0] === 's') { var i = +a[1], j = +b[1], t = sl[i]; sl[i] = sl[j] === undefined ? null : sl[j]; sl[j] = t === undefined ? null : t; return true; }
    if (a[0] === 'b' && b[0] === 's') { var pid = +a[1], k = sl.indexOf(pid); if (k >= 0) return false; sl[+b[1]] = pid; return true; }
    if (a[0] === 's' && (dst === 'bank' || b[0] === 'b')) { if (sl[+a[1]] === null) return false; sl[+a[1]] = null; return true; }
    return false;
  }
  function spielzeitVon(st) { return isNum(st.spielzeit) && st.spielzeit > 0 ? st.spielzeit : STANDARD_SPIELZEIT; }
  // Minuten je Kind aus Startelf + Wechseln (nur wenn eine Startelf erfasst ist)
  function spielMinuten(st) {
    var out = {}, s = st.spiel; if (!s || !s.startelf) return null;
    var T = spielzeitVon(st), on = {};
    startelfListe(st).forEach(function (x) { if (x.pid) on[x.pid] = 0; });
    var w = (s.wechsel || []).slice().sort(function (a, b) { return (isNum(a.minute) ? a.minute : T) - (isNum(b.minute) ? b.minute : T); });
    function add(pid, von, bis) { out[pid] = (out[pid] || 0) + Math.max(0, Math.min(bis, T) - Math.max(0, von)); }
    w.forEach(function (x) {
      var m = isNum(x.minute) ? Math.max(0, Math.min(T, x.minute)) : T;
      if (x.raus && on[x.raus] !== undefined) { add(x.raus, on[x.raus], m); delete on[x.raus]; }
      if (x.rein && on[x.rein] === undefined) on[x.rein] = m;
    });
    Object.keys(on).forEach(function (pid) { add(+pid, on[pid], T); });
    Object.keys(out).forEach(function (k) { out[k] = Math.round(out[k]); });
    return out;
  }
  function aufDemPlatz(st, minute) {   // Kinder, die zur Minute auf dem Feld stehen (für die Auswahl „raus“)
    var on = {}; startelfListe(st).forEach(function (x) { if (x.pid) on[x.pid] = true; });
    var T = spielzeitVon(st), m0 = isNum(minute) ? minute : T;
    (st.spiel && st.spiel.wechsel || []).slice().sort(function (a, b) { return (isNum(a.minute) ? a.minute : T) - (isNum(b.minute) ? b.minute : T); })
      .forEach(function (x) { if ((isNum(x.minute) ? x.minute : T) <= m0) { if (x.raus) delete on[x.raus]; if (x.rein) on[x.rein] = true; } });
    return Object.keys(on).map(Number);
  }
  function hatGespielt(st, pid) {
    var s = st.spiel;
    if (s && s.startelf && (startelfListe(st).some(function (x) { return x.pid === pid; }) || (s.wechsel || []).some(function (w) { return w.rein === pid; }))) return true;
    var b = st.bewertungen[pid]; return !!(b && b.gespielt !== false && spielwert(b) !== null);
  }
  function minutenFuer(st, pid) {   // erfasste Minuten der Spielbewertung, sonst aus Startelf + Wechseln
    var b = st.bewertungen[pid];
    if (b && isNum(b.minuten)) return b.minuten;
    var m = spielMinuten(st); return m ? (m[pid] || 0) : null;
  }
  var KARTEN = { Gelb: '🟨', Rot: '🟥', Zeitstrafe: '⏱', Verletzung: '🩹' };
  function nameFn(d) { return function (pid) { var p = d.players.filter(function (x) { return x.id === pid; })[0]; return p ? E.firstName(p.name) : '?'; }; }
  function bericht(d, st) {   // Spielbericht (sortierte Ereignisse)
    var s = spielbericht(st), name = nameFn(d);
    var ev = [], fehlerZuGegentor = {};
    s.gegen.forEach(function (g) { if (g.fehlerId) fehlerZuGegentor[g.fehlerId] = true; });
    s.tore.forEach(function (t) { ev.push({ typ: 'tor', minute: t.minute, zeit: t.zeit, text: '⚽ Tor ' + (t.pid ? name(t.pid) : '(Torschütze unbekannt)') + (t.elfmeter ? ' (Elfmeter)' : '') + (t.assist ? ' (Vorlage ' + name(t.assist) + ')' : '') + (t.notiz ? ' – ' + t.notiz : ''), id: t.id }); });
    s.gegen.forEach(function (g) { ev.push({ typ: 'gegentor', minute: g.minute, zeit: g.zeit, text: '🥅 Gegentor' + (g.elfmeter ? ' (Elfmeter)' : '') + (g.fehlerPid ? ' (Abwehrfehler ' + name(g.fehlerPid) + ')' : ''), id: g.id }); });
    s.fehler.forEach(function (f) { if (!fehlerZuGegentor[f.id]) ev.push({ typ: 'fehler', minute: f.minute, zeit: f.zeit, text: '⚠ Abwehrfehler ' + name(f.pid) + (f.notiz ? ' – ' + f.notiz : ''), id: f.id }); });
    s.wechsel.forEach(function (w) { ev.push({ typ: 'wechsel', minute: w.minute, zeit: w.zeit, text: '🔁 ' + (w.rein ? name(w.rein) : '?') + ' für ' + (w.raus ? name(w.raus) : '?'), id: w.id }); });
    s.tausch.forEach(function (x) { ev.push({ typ: 'tausch', minute: x.minute, zeit: x.zeit, text: '↔ Positionstausch ' + name(x.a) + ' / ' + name(x.b), id: x.id }); });
    s.karten.forEach(function (k) { ev.push({ typ: 'karte', minute: k.minute, zeit: k.zeit, text: (KARTEN[k.art] || '🟨') + ' ' + k.art + ' ' + name(k.pid), id: k.id }); });
    s.notizen.forEach(function (n) { ev.push({ typ: 'notiz', minute: n.minute, zeit: n.zeit, text: '📝 ' + (n.pid ? name(n.pid) + ': ' : '') + n.text, id: n.id }); });
    ev.forEach(function (e, k) { e._k = k; });
    ev.sort(function (a, b) { return (isNum(a.minute) ? a.minute : 999) - (isNum(b.minute) ? b.minute : 999) || (a.zeit || 0) - (b.zeit || 0) || a._k - b._k; });
    ev.forEach(function (e) { delete e._k; });
    var min = spielMinuten(st) || {};
    return { tore: s.tore.length, gegentore: s.gegentore, ereignisse: ev, startelf: startelfListe(st).map(function (x) { return { pos: x.pos, pid: x.pid, name: x.pid ? name(x.pid) : '–' }; }), minuten: min };
  }
  // Saisonwerte je Kind über alle Spieltage
  function saison(d, key) {
    var out = {};
    d.players.forEach(function (p) { if (p.name) { out[p.id] = { pid: p.id, name: p.name, spiele: 0, startelf: 0, minuten: 0, tore: 0, assists: 0, fehler: 0, einwechslungen: 0 }; if (p.archiviert) out[p.id].archiviert = true; } });
    spieltageDerSaison(d, key).forEach(function (st) {
      var s = st.spiel || leererSpielbericht(), se = startelfListe(st);
      Object.keys(out).forEach(function (k) {
        var pid = +k, o = out[k];
        if (hatGespielt(st, pid)) { o.spiele++; var m = minutenFuer(st, pid); if (isNum(m)) o.minuten += m; }
        if (se.some(function (x) { return x.pid === pid; })) o.startelf++;
      });
      (s.tore || []).forEach(function (t) { if (out[t.pid]) out[t.pid].tore++; if (t.assist && out[t.assist]) out[t.assist].assists++; });
      (s.fehler || []).forEach(function (f) { if (out[f.pid]) out[f.pid].fehler++; });
      (s.wechsel || []).forEach(function (w) { if (w.rein && out[w.rein]) out[w.rein].einwechslungen++; });
    });
    return out;
  }
  // ---------- Messungen (Testkatalog, Termine, Bewertung 1–5) ----------
  var KLASSEN = ['U9', 'U10', 'U11', 'U12', 'U13'];
  // Bänder: Schwellen für Note 2, 3, 4, 5 je Altersklasse (Schätzwerte, in der App änderbar). Basis U11 + Schritt je Jahr.
  function baender(u11, schritt, nk) {
    var o = {}; KLASSEN.forEach(function (k, i) { var d = i - 2; o[k] = u11.map(function (c) { return Number((c + d * schritt).toFixed(nk === undefined ? 2 : nk)); }); }); return o;
  }
  function gleich(c) { var o = {}; KLASSEN.forEach(function (k) { o[k] = c.slice(); }); return o; }
  var KAT = [   // id, Name, Einheit, Richtung, Gruppe, Versuche, Regel, Bänder, Zuordnung Feld/TW [[Zeile, Gewicht]], Beschreibung
    ['sprint5', 'Antritt 5 m', 's', 'kleiner', 'Schnelligkeit', 2, 'best', baender([1.5, 1.4, 1.3, 1.2], -0.03), [[33, 1]], [[36, 0.6]], 'Hochstart, Zeit ab Bewegungsbeginn (Lichtschranke oder 2 Stoppuhren).'],
    ['sprint10', 'Sprint 10 m', 's', 'kleiner', 'Schnelligkeit', 2, 'best', baender([2.45, 2.3, 2.15, 2.0], -0.05), [[34, 0.6], [33, 0.4]], [[36, 0.5]], 'Hochstart. Handzeiten sind ca. 0,1–0,2 s schneller – immer gleich messen.'],
    ['sprint20', 'Sprint 20 m', 's', 'kleiner', 'Schnelligkeit', 2, 'best', baender([4.25, 4.0, 3.8, 3.6], -0.09), [[34, 1]], [], 'Hochstart, fliegende Ziellinie.'],
    ['gewandt', 'Gewandtheit (Slalom ohne Ball)', 's', 'kleiner', 'Koordination', 2, 'best', baender([10.0, 9.4, 8.9, 8.4], -0.25), [[37, 1]], [[35, 0.6]], 'Slalom-/Richtungswechsel-Parcours ohne Ball (z. B. nach DFB-Stützpunkt-Muster), Aufbau immer gleich.'],
    ['dribbling', 'Dribbling-Slalom mit Ball', 's', 'kleiner', 'Technik', 2, 'best', baender([13.5, 12.5, 11.7, 11.0], -0.4), [[19, 0.8], [16, 0.2]], [], 'Gleicher Parcours wie Gewandtheit, mit Ball; Stangenberührung +1 s.'],
    ['lauf6', '6-Minuten-Lauf', 'm', 'groesser', 'Ausdauer', 1, 'best', baender([950, 1050, 1150, 1250], 40, 0), [[35, 1]], [], 'Rundkurs (z. B. 50 m), Strecke nach 6 Minuten. Alternative zum Yo-Yo-Test.'],
    ['yoyo', 'Yo-Yo IR1 (Strecke)', 'm', 'groesser', 'Ausdauer', 1, 'best', baender([320, 480, 640, 840], 100, 0), [[35, 1]], [], 'Yo-Yo Intermittent Recovery Level 1, erreichte Strecke in Metern.'],
    ['sprung', 'Standweitsprung', 'cm', 'groesser', 'Kraft', 3, 'best', baender([135, 150, 165, 180], 7, 0), [[33, 0.3], [21, 0.2]], [[34, 1]], 'Beidbeinig aus dem Stand, Landung ohne Zurückgreifen; Ferse zählt.'],
    ['jongl_stark', 'Jonglieren starker Fuß', 'Anzahl', 'groesser', 'Technik', 2, 'best', { U9: [3, 8, 20, 40], U10: [4, 10, 25, 50], U11: [5, 15, 35, 70], U12: [8, 20, 50, 100], U13: [10, 30, 70, 150] }, [[16, 0.6]], [[23, 0.3]], 'Nur ein Fuß, Ball darf nicht aufkommen; bester von 2 Versuchen.'],
    ['jongl_schwach', 'Jonglieren schwacher Fuß', 'Anzahl', 'groesser', 'Technik', 2, 'best', { U9: [1, 3, 6, 12], U10: [1, 4, 10, 20], U11: [2, 6, 15, 30], U12: [3, 8, 20, 40], U13: [4, 10, 25, 50] }, [[23, 0.5], [16, 0.2]], [], 'Wie oben mit dem schwachen Fuß.'],
    ['pass10', 'Passgenauigkeit', 'Treffer von 10', 'groesser', 'Technik', 1, 'best', gleich([3, 5, 7, 9]), [[17, 1]], [[23, 0.5]], 'Flachpass in ein Minitor/Hütchentor (1 m) aus 8 m (U9/U10) bzw. 10 m (ab U11), abwechselnd links/rechts.'],
    ['torschuss', 'Torschuss-Präzision', 'Treffer von 10', 'groesser', 'Technik', 1, 'best', gleich([2, 4, 6, 8]), [[20, 1]], [], 'Schuss aus 11 m in die markierten Torecken (je 1,5 m breit), ohne Torwart.'],
    ['schuss_kmh', 'Schussgeschwindigkeit', 'km/h', 'groesser', 'Technik', 3, 'best', baender([45, 55, 62, 70], 4, 0), [[20, 0.5], [18, 0.4]], [[19, 0.6]], 'Radar/Speed-App; Vollspann aus 2–3 Schritten Anlauf.'],
    ['reaktion', 'Reaktion (Fallstab)', 'cm', 'kleiner', 'Schnelligkeit', 3, 'mittel', baender([25, 20, 16, 12], -0.8, 1), [[33, 0.3]], [[33, 0.5]], 'Lineal/Fallstab fangen, Fallstrecke in cm; Mittel aus 3 Versuchen.'],
    ['leiter', 'Koordinationsleiter', 's', 'kleiner', 'Koordination', 2, 'best', baender([7.0, 6.2, 5.6, 5.0], -0.25), [[37, 0.6], [33, 0.2]], [[35, 0.4]], 'Feste Schrittfolge (z. B. 2 Kontakte je Feld, 10 Felder), Fehler +0,5 s.'],
    ['beidfuss', 'Beidfüßigkeit (Pass schwacher Fuß)', 'Treffer von 10', 'groesser', 'Technik', 1, 'best', gleich([2, 4, 6, 8]), [[23, 1]], [], 'Passgenauigkeit wie oben, nur mit dem schwachen Fuß.'],
    ['tw_reaktion', 'TW-Reaktion (Bälle gehalten)', 'Treffer von 10', 'groesser', 'Torwart', 1, 'best', gleich([3, 5, 7, 9]), [], [[33, 1], [16, 0.3]], 'Reaktionsbälle aus 6–8 m (geworfen/geschossen), gefangen oder sicher abgewehrt.'],
    ['tw_abschlag', 'TW-Abschlagweite', 'm', 'groesser', 'Torwart', 3, 'best', baender([20, 26, 32, 38], 3, 0), [], [[19, 1]], 'Abschlag/Abstoß vom Boden, Weite bis zum ersten Aufsprung.'],
    ['tw_abwurf', 'TW-Abwurf-Genauigkeit', 'Treffer von 10', 'groesser', 'Torwart', 1, 'best', gleich([3, 5, 7, 9]), [], [[18, 1]], 'Abwurf in eine 3 × 3 m Zone in 15 m Entfernung.'],
    ['groesse', 'Körpergröße', 'cm', 'groesser', 'Körper', 1, 'best', null, [], [], 'Nur zur Information (keine Note, kein Vorschlag).'],
    ['gewicht', 'Körpergewicht', 'kg', 'groesser', 'Körper', 1, 'best', null, [], [], 'Nur zur Information (keine Note, kein Vorschlag).']
  ];
  function standardKatalog() {
    return KAT.map(function (x) { return { id: x[0], name: x[1], einheit: x[2], richtung: x[3], gruppe: x[4], versuche: x[5], regel: x[6], baender: x[7] ? clone(x[7]) : null, feld: clone(x[8]), tw: clone(x[9]), beschreibung: x[10], aktiv: true, standard: true, quelle: 'Schätzwert (siehe Info)' }; });
  }
  function testById(d, id) { for (var i = 0; i < (d.messkatalog || []).length; i++) if (d.messkatalog[i].id === id) return d.messkatalog[i]; return null; }
  function saisonJahr(iso, startMonat) { var y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= (startMonat || 7) ? y : y - 1; }
  function saisonKey(iso, startMonat) { if (!iso) return ''; var y = saisonJahr(iso, startMonat); return y + '/' + String(y + 1).slice(2); }
  function altersklasse(d, p, iso) {
    var j = p && +p.jahrgang;
    if (j > 1990 && j < 2100) { var u = saisonJahr(iso || today(), d.settings.saisonStartMonat) + 1 - j; return 'U' + Math.max(9, Math.min(13, u)); }
    return KLASSEN.indexOf(d.settings.altersklasse) >= 0 ? d.settings.altersklasse : 'U11';
  }
  function bestWert(L, regel, richtung) {
    var v = (L || []).filter(isNum); if (!v.length) return null;
    if (regel === 'mittel') return E.xround(v.reduce(function (a, x) { return a + x; }, 0) / v.length, 2);
    return richtung === 'kleiner' ? Math.min.apply(null, v) : Math.max.apply(null, v);
  }
  // Messwert → Note 1–5 (stetig, 0,1-Schritte): Schwelle i erreicht = Note i+2, dazwischen linear
  function messNote(t, wert, klasse) {
    if (!t || !t.baender || !isNum(wert)) return null;
    var c = t.baender[klasse] || t.baender.U11; if (!c || c.length !== 4) return null;
    var sgn = t.richtung === 'kleiner' ? -1 : 1, x = sgn * wert, k = c.map(function (v) { return sgn * v; });
    var n;
    if (x >= k[3]) n = 5;
    else if (x < k[0]) n = 2 - (k[0] - x) / ((k[1] - k[0]) || 1);
    else { for (var i = 0; i < 3; i++) if (x < k[i + 1]) { n = 2 + i + (x - k[i]) / ((k[i + 1] - k[i]) || 1); break; } }
    return E.xround(Math.max(1, Math.min(5, n)), 1);
  }
  function neueMessung(d, opt) {
    opt = opt || {};
    var m = { id: 'm_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), datum: opt.datum || today(), titel: opt.titel || '', tests: (opt.tests || []).slice(), werte: {}, notiz: '' };
    d.messungen.push(m); return m;
  }
  function messungById(d, id) { for (var i = 0; i < d.messungen.length; i++) if (d.messungen[i].id === id) return d.messungen[i]; return null; }
  function messwertSetzen(m, pid, tid, idx, v) {
    var w = m.werte[pid] = m.werte[pid] || {}, L = w[tid] = w[tid] || [];
    while (L.length <= idx) L.push(null);
    L[idx] = isNum(v) ? v : null;
    while (L.length && L[L.length - 1] === null) L.pop();
    if (!L.length) delete w[tid];
    if (!Object.keys(w).length) delete m.werte[pid];
  }
  function messErgebnis(d, m, pid, tid) {
    var t = testById(d, tid), L = m.werte[pid] && m.werte[pid][tid]; if (!t || !L) return null;
    var wert = bestWert(L, t.regel, t.richtung); if (wert === null) return null;
    var p = spielerById(d, pid), kl = altersklasse(d, p, m.datum);
    return { wert: wert, versuche: L.filter(isNum).length, klasse: kl, note: messNote(t, wert, kl) };
  }
  function sortMessungen(L) { return L.slice().sort(function (a, b) { return (a.datum || '').localeCompare(b.datum || '') || a.id.localeCompare(b.id); }); }
  function messVerlauf(d, pid, tid) {   // chronologisch
    var out = [];
    sortMessungen(d.messungen).forEach(function (m) { var r = messErgebnis(d, m, pid, tid); if (r) out.push({ messung: m.id, datum: m.datum, wert: r.wert, note: r.note, klasse: r.klasse }); });
    return out;
  }
  function teamVergleich(d, m, tid, pid) {   // Werte aller Kinder in diesem Termin
    var t = testById(d, tid), L = [];
    Object.keys(m.werte).forEach(function (k) { var r = messErgebnis(d, m, +k, tid); if (r) L.push({ pid: +k, wert: r.wert, note: r.note }); });
    if (!L.length) return null;
    var sgn = t.richtung === 'kleiner' ? 1 : -1;
    L.sort(function (a, b) { return sgn * (a.wert - b.wert); });
    var w = L.map(function (x) { return x.wert; }).slice().sort(function (a, b) { return a - b; }), mid = Math.floor(w.length / 2);
    var median = w.length % 2 ? w[mid] : (w[mid - 1] + w[mid]) / 2;
    var rang = pid !== undefined ? L.findIndex(function (x) { return x.pid === pid; }) + 1 : 0;
    return { anzahl: L.length, median: E.xround(median, 2), mittel: E.xround(w.reduce(function (a, x) { return a + x; }, 0) / w.length, 2), rang: rang, liste: L };
  }
  // Je Grundwert-Zeile: aktuelle Messwerte (neuester Termin je Test, max. 365 Tage alt; älter als 120 Tage zählt halb)
  function messQuellen(d, p, heute) {
    var out = {}, h = Date.parse(heute || today());
    (d.messkatalog || []).forEach(function (t) {
      if (t.aktiv === false || !t.baender) return;
      var map = p.typ === 'TW' ? t.tw : t.feld; if (!map || !map.length) return;
      var V = messVerlauf(d, p.id, t.id); if (!V.length) return;
      var last = V[V.length - 1], alter = (h - Date.parse(last.datum)) / 864e5;
      if (alter > 365 || last.note === null) return;
      var rec = alter > 120 ? 0.5 : 1;
      map.forEach(function (e) { var r = String(e[0]); if (!(e[1] > 0)) return; (out[r] = out[r] || []).push({ test: t, wert: last.wert, score: last.note, w: e[1] * rec, datum: last.datum, sessionId: last.messung }); });
    });
    return out;
  }
  // ---------- Saison / Einsatzzeit ----------
  function saisonListe(d) { var o = {}; d.spieltage.forEach(function (st) { if (st.datum) o[saisonKey(st.datum, d.settings.saisonStartMonat)] = true; }); return Object.keys(o).sort().reverse(); }
  function spieltageDerSaison(d, key) { return key ? d.spieltage.filter(function (st) { return st.datum && saisonKey(st.datum, d.settings.saisonStartMonat) === key; }) : d.spieltage; }
  // Fair-Play-Minuten: gespielte Minuten / mögliche Minuten (Spiele, in denen das Kind zugesagt hatte oder spielte)
  function einsatzQuote(d, pid, key) {
    var moeglich = 0, gespielt = 0, n = 0;
    spieltageDerSaison(d, key).forEach(function (st) {
      var spiel = hatGespielt(st, pid), da = st.zusagen[pid] === 'Zugesagt' || spiel;
      if (!da || !(st.spiel && st.spiel.startelf) && !spiel) return;
      var m = minutenFuer(st, pid); moeglich += spielzeitVon(st); gespielt += isNum(m) ? m : 0; n++;
    });
    return n ? { spiele: n, moeglich: moeglich, gespielt: gespielt, quote: moeglich ? gespielt / moeglich : 0 } : null;
  }

  // ---------- Gegner-Datei (ab 1.6) ----------
  // d.gegner = [{ id, name, alias: [Schlüssel], altersklasse, platz, farben, notizen: [{ id, typ: 'allgemein'|'taktik'|'spieler', text, nr, name, stId, minute, datum, erstellt, team }] }]
  // Spieltage verweisen über st.gegnerId; st.gegner bleibt der angezeigte Name (= Gegner-Name).
  var GEGNER_NOTIZ_TYPEN = { taktik: 'Taktik', spieler: 'Auffälliger Spieler', allgemein: 'Allgemein' };
  function gegnerName(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function gegnerKey(s) {   // „Hemden “, „hemden“, „Hemden.“ → gleicher Schlüssel; „Hemden II“ bleibt eigener Gegner
    return gegnerName(s).toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/e\.\s?v\./g, ' ').replace(/[.,;:'"()\/_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  var VEREINS_KUERZEL = ['sv', 'fc', 'tus', 'tsv', 'vfl', 'vfb', 'sc', 'jsg', 'spvgg', 'sg', 'djk', 'bv', 'ssv', 'fsv', 'tv', 'rsv', 'sus', 'psv', 'ev'];
  function gegnerKern(s) { return gegnerKey(s).split(' ').filter(function (w) { return VEREINS_KUERZEL.indexOf(w) < 0 && !/^\d{4}$/.test(w); }).join(' '); }
  function gegnerById(d, id) { var L = d.gegner || []; for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
  function gegnerSuchen(d, name) {
    var k = gegnerKey(name); if (!k) return null;
    var L = d.gegner || [];
    for (var i = 0; i < L.length; i++) if (gegnerKey(L[i].name) === k || (L[i].alias || []).indexOf(k) >= 0) return L[i];
    return null;
  }
  function neuerGegner(d, name, opt) {
    opt = opt || {};
    var g = { id: 'g_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), name: gegnerName(name), alias: [], altersklasse: opt.altersklasse || '', platz: opt.platz || '', farben: opt.farben || '', notizen: [], angelegt: new Date().toISOString() };
    (d.gegner = d.gegner || []).push(g); return g;
  }
  function gegnerFuerName(d, name, anlegen) { var g = gegnerSuchen(d, name); if (!g && anlegen !== false && gegnerKey(name)) g = neuerGegner(d, name); return g; }
  function gegnerVerknuepfen(d, st) {   // Spieltag ↔ Gegner (legt den Gegner bei Bedarf an)
    var g = gegnerName(st.gegner) ? gegnerFuerName(d, st.gegner, true) : null;
    if (g) { st.gegnerId = g.id; st.gegner = g.name; } else delete st.gegnerId;
    return g;
  }
  function gegnerVon(d, st) { if (!st) return null; return (st.gegnerId && gegnerById(d, st.gegnerId)) || gegnerSuchen(d, st.gegner); }
  function gegnerSpieltage(d, gid) { return sortSpieltage(d.spieltage.filter(function (st) { return st.gegnerId === gid; })); }
  function mitErgebnis(st) { var s = st.spiel; return !!(s && (s.startelf || (s.tore && s.tore.length) || s.gegentore)); }
  function gegnerBilanz(d, gid, ohneStId) {   // Direktvergleich aus verknüpften Spieltagen mit Ergebnis (neueste zuerst)
    var name = nameFn(d), out = { spiele: [], s: 0, u: 0, n: 0, tore: 0, gegentore: 0, diff: 0, letzteStaerke: '', ohneWertung: 0 };
    gegnerSpieltage(d, gid).forEach(function (st) {
      if (!out.letzteStaerke && st.gegnerStaerke) out.letzteStaerke = st.gegnerStaerke;
      if (st.id === ohneStId || !mitErgebnis(st)) return;
      var a = st.spiel.tore.length, b = st.spiel.gegentore || 0, sc = {};
      st.spiel.tore.forEach(function (t) { if (t.pid) sc[t.pid] = (sc[t.pid] || 0) + 1; });
      var e = a > b ? 'S' : (a === b ? 'U' : 'N'), ow = !!st.ohneWertung;
      if (ow) out.ohneWertung++; else { out[e.toLowerCase()]++; out.tore += a; out.gegentore += b; }   // ohne Wertung: gelistet, aber nicht in der Bilanz
      out.spiele.push({ stId: st.id, datum: st.datum, ort: st.ort, tore: a, gegentore: b, ergebnis: e, ohneWertung: ow, gegnerStaerke: st.gegnerStaerke || '', torschuetzen: Object.keys(sc).map(function (k) { return name(+k) + (sc[k] > 1 ? ' ' + sc[k] : ''); }) });
    });
    out.diff = out.tore - out.gegentore; out.anzahl = out.spiele.length - out.ohneWertung;
    return out;
  }
  function gegnerNotiz(d, gid, n) {
    var g = gegnerById(d, gid); if (!g) return null;
    var typ = GEGNER_NOTIZ_TYPEN[n.typ] ? n.typ : 'allgemein', text = String(n.text || '').trim();
    if (!text && !(typ === 'spieler' && (n.nr || n.name))) return null;
    var x = { id: 'gn_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), typ: typ, text: text, datum: n.datum || today(), erstellt: new Date().toISOString() };
    if (typ === 'spieler') { x.nr = n.nr === undefined || n.nr === null ? '' : String(n.nr).trim(); x.name = String(n.name || '').trim(); }
    if (typ === 'taktik') x.team = n.team !== false;
    if (n.stId) x.stId = n.stId;
    if (isNum(n.minute)) x.minute = n.minute;
    g.notizen.push(x); return x;
  }
  function gegnerNotizen(g, typ) {   // neueste zuerst
    return (g.notizen || []).filter(function (n) { return !typ || n.typ === typ; }).slice().sort(function (a, b) { return (b.datum || '').localeCompare(a.datum || '') || (b.erstellt || '').localeCompare(a.erstellt || ''); });
  }
  function gegnerNotizLoeschen(d, gid, nid) { var g = gegnerById(d, gid); if (g) g.notizen = g.notizen.filter(function (n) { return n.id !== nid; }); }
  function gegnerUmbenennen(d, gid, name) {
    var g = gegnerById(d, gid), neu = gegnerName(name); if (!g || !neu) return false;
    var anderer = gegnerSuchen(d, neu); if (anderer && anderer.id !== g.id) return false;
    var k = gegnerKey(g.name); if (k && k !== gegnerKey(neu) && g.alias.indexOf(k) < 0) g.alias.push(k);
    g.name = neu; d.spieltage.forEach(function (st) { if (st.gegnerId === gid) st.gegner = neu; }); return true;
  }
  function gegnerZusammenfuehren(d, zielId, quellId) {   // Quelle wird in Ziel übernommen (Spieltage, Notizen, Schreibweisen)
    var z = gegnerById(d, zielId), q = gegnerById(d, quellId); if (!z || !q || z === q) return false;
    d.spieltage.forEach(function (st) { if (st.gegnerId === quellId) { st.gegnerId = zielId; st.gegner = z.name; } });
    z.notizen = z.notizen.concat(q.notizen);
    [gegnerKey(q.name)].concat(q.alias || []).forEach(function (k) { if (k && k !== gegnerKey(z.name) && z.alias.indexOf(k) < 0) z.alias.push(k); });
    ['altersklasse', 'platz', 'farben'].forEach(function (k) { if (!z[k] && q[k]) z[k] = q[k]; });
    d.gegner = d.gegner.filter(function (g) { return g.id !== quellId; }); return true;
  }
  function gegnerLoeschen(d, gid) { if (gegnerSpieltage(d, gid).length) return false; d.gegner = d.gegner.filter(function (g) { return g.id !== gid; }); return true; }
  function gegnerAehnlich(d) {   // mögliche Doppelungen, z. B. „Hemden“ / „SV Hemden“
    var L = d.gegner || [], out = [];
    for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) {
      var a = gegnerKern(L[i].name), b = gegnerKern(L[j].name);
      if (a && b && a === b) out.push([L[i], L[j]]);
    }
    return out;
  }
  function gegnerInfo(d, st) {   // für die Gegner-Info-Karte: nur wenn es Vorgeschichte oder Notizen gibt
    var g = gegnerVon(d, st); if (!g) return null;
    var b = gegnerBilanz(d, g.id, st.id), N = gegnerNotizen(g);
    if (!b.anzahl && !N.length) return null;
    return { g: g, bilanz: b, spieler: gegnerNotizen(g, 'spieler'), taktik: gegnerNotizen(g, 'taktik'), allgemein: gegnerNotizen(g, 'allgemein'), anzahlNotizen: N.length };
  }
  function gegnerMigrieren(d) {
    if (!Array.isArray(d.gegner)) d.gegner = [];
    d.gegner.forEach(function (g) { g.name = gegnerName(g.name) || 'Gegner'; g.alias = g.alias || []; g.notizen = Array.isArray(g.notizen) ? g.notizen : []; ['altersklasse', 'platz', 'farben'].forEach(function (k) { if (typeof g[k] !== 'string') g[k] = ''; }); });
    d.spieltage.forEach(function (st) {
      if (st.gegnerId && gegnerById(d, st.gegnerId)) { st.gegner = gegnerById(d, st.gegnerId).name; return; }
      if (gegnerName(st.gegner)) gegnerVerknuepfen(d, st); else delete st.gegnerId;
    });
  }

  // ---------- Einmalige Datenkorrekturen (ab 1.7) ----------
  // Je Korrektur genau einmal (Kennung in d.korrekturen); Zuordnung über Datum + Gegner. Vorhandene Ereignisse werden der
  // Reihe nach (nach Minute) den Toren des Spielberichts zugeordnet: Minute, Elfmeter, Torschütze und Vorlage werden gesetzt;
  // Abwehrfehler, Wechsel, Zusagen, Bewertungen und alles andere bleiben unverändert.
  var KORREKTUREN = [];   // ab 2.0 ohne Kinderdaten im Code: die Hemden-Korrektur (k17, 1.7) ist auf dem Handy längst angewandt; Definition nur noch als Test-Fixture
  function spielerPerVorname(d, n) {
    var L = d.players.filter(function (p) { return p.name && !p.archiviert && E.firstName(p.name).toLowerCase() === n.toLowerCase(); });
    return L.length === 1 ? L[0].id : null;
  }
  function nachMinute(L) { return L.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) { return (isNum(a.x.minute) ? a.x.minute : 999) - (isNum(b.x.minute) ? b.x.minute : 999) || a.i - b.i; }).map(function (o) { return o.x; }); }
  function kurzBericht(d, st) {
    var s = spielbericht(st), name = nameFn(d);
    return { ort: st.ort || '', ohneWertung: !!st.ohneWertung, ergebnis: s.tore.length + ':' + (s.gegentore || 0),
      tore: nachMinute(s.tore).map(function (t) { return minTxt(t.minute) + ' ' + (t.pid ? name(t.pid) : 'unbekannt') + (t.elfmeter ? ' (Elfmeter)' : '') + (t.assist ? ' (Vorlage ' + name(t.assist) + ')' : '') + (t.notiz ? ' – ' + t.notiz : ''); }),
      gegentore: nachMinute(s.gegen).map(function (g) { return minTxt(g.minute) + (g.elfmeter ? ' (Elfmeter)' : ''); }),
      wechsel: s.wechsel.length, notizen: s.notizen.length };
  }
  function korrekturAnwenden(d, K) {
    d.korrekturen = d.korrekturen || {};
    if (d.korrekturen[K.id]) return null;
    var kern = gegnerKern(K.gegner), key = gegnerKey(K.gegner);
    var treffer = d.spieltage.filter(function (st) {
      if (st.datum !== K.datum) return false;
      var g = gegnerVon(d, st);
      return gegnerKern(st.gegner) === kern || (g && (g.alias || []).indexOf(key) >= 0);
    });
    if (treffer.length !== 1) return null;   // Spieltag nicht (eindeutig) vorhanden → nichts tun, später erneut prüfen
    var st = treffer[0], s = spielbericht(st), vorher = kurzBericht(d, st), hinweise = [];
    if (K.ort) st.ort = K.ort;
    if (K.ohneWertung) st.ohneWertung = true;
    var T = nachMinute(s.tore);
    if (T.length <= K.tore.length) K.tore.forEach(function (k, i) {
      var t = T[i] || addTor(st, null, null, k.minute); t.minute = k.minute;
      if (k.spieler) { var pid = spielerPerVorname(d, k.spieler); if (pid) t.pid = pid; else hinweise.push(k.spieler + ' nicht eindeutig im Kader'); }
      if (k.vorlage !== undefined) { var ap = k.vorlage ? spielerPerVorname(d, k.vorlage) : null; if (k.vorlage && !ap) hinweise.push(k.vorlage + ' nicht eindeutig im Kader'); else t.assist = ap; }   // Vorlage laut Trainer (null = ohne Vorlage)
      if (k.elfmeter) t.elfmeter = true;
    }); else hinweise.push('mehr Tore erfasst als im Spielbericht – Tore nicht geändert');
    var G = nachMinute(s.gegen);
    if (G.length <= K.gegen.length) {
      K.gegen.forEach(function (k, i) {
        var g = G[i]; if (!g) { g = { id: eid(), minute: k.minute, fehlerPid: null, fehlerId: null }; s.gegen.push(g); }
        g.minute = k.minute; if (k.elfmeter) g.elfmeter = true;
        if (g.fehlerId) { var fe = findeEreignis(st, g.fehlerId); if (fe) fe.ev.minute = k.minute; }
      });
      s.gegentore = s.gegen.length;
    } else hinweise.push('mehr Gegentore erfasst als im Spielbericht – Gegentore nicht geändert');
    if (K.notiz && !s.notizen.some(function (n) { return n.text === K.notiz; })) addNotiz(st, null, K.notiz);
    if (!st.gegnerId && st.gegner) gegnerVerknuepfen(d, st);
    var g = gegnerVon(d, st);
    if (g && K.gegnerNotiz && !g.notizen.some(function (n) { return n.text === K.gegnerNotiz; })) gegnerNotiz(d, g.id, { typ: 'allgemein', text: K.gegnerNotiz, stId: st.id, datum: K.datum });
    var nachher = kurzBericht(d, st);
    d.korrekturen[K.id] = { titel: K.titel, angewandt: new Date().toISOString(), stId: st.id, vorher: vorher, nachher: nachher, hinweise: hinweise, gemeldet: false };
    return d.korrekturen[K.id];
  }
  function gemesseneDauer(st) {   // live aufgezeichnetes, abgepfiffenes Spiel mit gemessener Dauer
    var L = st.live; return !!(L && L.phase === 'ende' && isNum(L.h1Start) && (isNum(L.h1Ende) || isNum(L.h2Ende)));
  }
  function spielzeit60(d) {   // ab 1.8 einmalig: alle Spieltage 60 Min. (außer live gemessene Spiele)
    var id = 'k18_spielzeit_60'; d.korrekturen = d.korrekturen || {};
    if (d.korrekturen[id]) return null;
    var geaendert = [], behalten = [];
    d.spieltage.forEach(function (st) {
      if (gemesseneDauer(st)) { behalten.push({ stId: st.id, spielzeit: st.spielzeit }); return; }
      if (st.spielzeit !== STANDARD_SPIELZEIT) geaendert.push({ stId: st.id, vorher: st.spielzeit });
      st.spielzeit = STANDARD_SPIELZEIT;
      if (st.live && st.live.phase === 'vor') st.live.halbzeit = STANDARD_SPIELZEIT / 2;
    });
    d.korrekturen[id] = { titel: 'Spielzeit aller Spieltage 60 Min. (2 × 30)', angewandt: new Date().toISOString(), geaendert: geaendert, behalten: behalten, hinweise: [], gemeldet: !geaendert.length };
    return d.korrekturen[id];
  }
  function korrekturenAnwenden(d) { var out = []; KORREKTUREN.forEach(function (K) { var r = korrekturAnwenden(d, K); if (r) out.push(r); }); var z = spielzeit60(d); if (z) out.push(z); return out; }
  function zaehltFuerWertung(st) { return !st.ohneWertung; }

  // ---------- Ehemalige Spieler (Archiv statt Löschen) ----------
  function spielerById(d, pid) { for (var i = 0; i < d.players.length; i++) if (d.players[i].id === pid) return d.players[i]; return null; }
  function aktiveSpieler(d) { return d.players.filter(function (p) { return p.name && !p.archiviert; }); }
  function ehemaligeSpieler(d) { return d.players.filter(function (p) { return p.name && p.archiviert; }); }
  function inEreignissen(st, pid) {   // erfasste Ereignisse des Spielberichts, in denen das Kind vorkommt
    var s = st.spiel; if (!s) return false;
    var f = function (l, keys) { return (l || []).some(function (e) { return keys.some(function (k) { return e[k] === pid; }); }); };
    return f(s.tore, ['pid', 'assist']) || f(s.fehler, ['pid']) || f(s.wechsel, ['rein', 'raus']) || f(s.gegen, ['fehlerPid']) || f(s.notizen, ['pid']) || f(s.karten, ['pid']) || f(s.tausch, ['a', 'b']);
  }
  function inSnapshot(st, pid) {
    var sn = st.snapshot; if (!sn || !sn.pitches) return false;
    return Object.keys(sn.pitches).some(function (c) { var P = sn.pitches[c]; return (P.aufstellung || []).concat(P.bank || []).some(function (x) { return x.pid === pid; }); });
  }
  function beteiligt(st, pid) {   // Kind kommt in diesem Spieltag in gespeicherten Daten vor
    return startelfListe(st).some(function (x) { return x.pid === pid; }) || inEreignissen(st, pid) || !!st.bewertungen[pid] || inSnapshot(st, pid);
  }
  function vergangeneDaten(d, pid) {   // [{ spieltag, gruende[] }] – leer = darf endgültig gelöscht werden
    var out = [];
    sortSpieltage(d.spieltage).forEach(function (st) {
      var g = [];
      if (inSnapshot(st, pid)) g.push('eingefrorene Aufstellung');
      if (startelfListe(st).some(function (x) { return x.pid === pid; })) g.push('Startelf');
      if (inEreignissen(st, pid)) g.push('Spielbericht-Ereignisse');
      if (st.bewertungen[pid]) g.push('Spielbewertung');
      if (g.length) out.push({ id: st.id, titel: titel(st), gruende: g });
    });
    var mz = (d.messungen || []).filter(function (m) { return m.werte[pid]; });
    if (mz.length) out.push({ id: 'messungen', titel: 'Messungen (' + mz.length + ' Termin' + (mz.length > 1 ? 'e' : '') + ')', gruende: ['Messwerte'] });
    return out;
  }
  function spielAktiv(st) { return (st.live && st.live.phase && st.live.phase !== 'vor') || EV_LISTEN.some(function (k) { return st.spiel && (st.spiel[k] || []).length; }); }
  // Spieler entfernen = archivieren: bleibt in allen vergangenen Daten; im offenen Spieltag nur aus dem noch nicht begonnenen Vorschlag/Startelf
  function archivieren(d, pid, now) {
    var p = spielerById(d, pid); if (!p || p.archiviert) return false;
    p.archiviert = now || new Date().toISOString();
    d.spieltage.forEach(function (st) {
      if (st.status === 'abgeschlossen') return;
      var se = st.spiel && st.spiel.startelf;
      if (se && !spielAktiv(st) && !inEreignissen(st, pid)) se.slots = se.slots.map(function (x) { return x === pid ? null : x; });
    });
    return true;
  }
  function wiederherstellen(d, pid) { var p = spielerById(d, pid); if (!p || !p.archiviert) return false; delete p.archiviert; return true; }
  function endgueltigLoeschen(d, pid) {
    var v = vergangeneDaten(d, pid); if (v.length) throw new Error('Kind hat Daten in ' + v.length + ' Spieltag(en)');
    var i = d.players.findIndex(function (p) { return p.id === pid; }); if (i < 0) return false;
    d.players.splice(i, 1);
    d.spieltage.forEach(function (st) { delete st.zusagen[pid]; });
    Object.keys(d.vorschlaegeIgnoriert || {}).forEach(function (k) { if (k.split(':')[0] === String(pid)) delete d.vorschlaegeIgnoriert[k]; });
    return true;
  }
  function eid() { return 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function addTor(st, pid, assist, minute) { var t = { id: eid(), pid: pid, assist: assist || null, minute: isNum(minute) ? minute : null }; spielbericht(st).tore.push(t); return t; }
  function addFehler(st, pid, minute, notiz) { var f = { id: eid(), pid: pid, minute: isNum(minute) ? minute : null, notiz: notiz || '' }; spielbericht(st).fehler.push(f); return f; }
  function addWechsel(st, minute, rein, raus) { var w = { id: eid(), minute: isNum(minute) ? minute : null, rein: rein || null, raus: raus || null }; spielbericht(st).wechsel.push(w); return w; }
  function addGegentor(st, minute, fehlerPid, notiz) {
    var s = spielbericht(st), g = { id: eid(), minute: isNum(minute) ? minute : null, fehlerPid: fehlerPid || null, fehlerId: null };
    if (fehlerPid) g.fehlerId = addFehler(st, fehlerPid, minute, notiz || 'vor Gegentor').id;
    s.gegen.push(g); s.gegentore++; return g;
  }
  function addNotiz(st, minute, text, pid) { var n = { id: eid(), minute: isNum(minute) ? minute : null, text: String(text || ''), pid: pid || null }; spielbericht(st).notizen.push(n); return n; }
  function addKarte(st, minute, pid, art) { var k = { id: eid(), minute: isNum(minute) ? minute : null, pid: pid, art: KARTEN[art] ? art : 'Gelb' }; spielbericht(st).karten.push(k); return k; }
  function addTausch(st, minute, a, b) { var x = { id: eid(), minute: isNum(minute) ? minute : null, a: a, b: b }; spielbericht(st).tausch.push(x); return x; }
  var EV_LISTEN = ['tore', 'fehler', 'wechsel', 'gegen', 'notizen', 'karten', 'tausch'];
  function findeEreignis(st, id) { var s = spielbericht(st), r = null; EV_LISTEN.forEach(function (k) { s[k].forEach(function (x) { if (x.id === id) r = { liste: k, ev: x }; }); }); return r; }
  function entferneEreignis(st, id) {
    var s = spielbericht(st), f = findeEreignis(st, id); if (!f) return;
    if (f.liste === 'gegen') { s.gegentore = Math.max(0, s.gegentore - 1); if (f.ev.fehlerId) s.fehler = s.fehler.filter(function (x) { return x.id !== f.ev.fehlerId; }); }
    s.gegen.forEach(function (g) { if (g.fehlerId === id) { g.fehlerId = null; g.fehlerPid = null; } });
    s[f.liste] = s[f.liste].filter(function (x) { return x.id !== id; });
  }
  function bearbeiteEreignis(st, id, neu) {   // Minute, Text/Notiz, Spieler nachträglich ändern
    var f = findeEreignis(st, id); if (!f) return null;
    var e = f.ev;
    if (neu.minute !== undefined) e.minute = isNum(neu.minute) ? neu.minute : null;
    ['text', 'notiz', 'pid', 'assist', 'rein', 'raus', 'art', 'a', 'b'].forEach(function (k) { if (neu[k] !== undefined && k in e) e[k] = neu[k]; });
    if (neu.elfmeter !== undefined && (f.liste === 'tore' || f.liste === 'gegen')) { if (neu.elfmeter) e.elfmeter = true; else delete e.elfmeter; }
    if (f.liste === 'gegen') {
      if (neu.fehlerPid !== undefined && neu.fehlerPid !== e.fehlerPid) {
        if (e.fehlerId && !neu.fehlerPid) { var sb = spielbericht(st); sb.fehler = sb.fehler.filter(function (x) { return x.id !== e.fehlerId; }); e.fehlerId = null; }
        else if (e.fehlerId) { var f1 = findeEreignis(st, e.fehlerId); if (f1) f1.ev.pid = neu.fehlerPid; }
        else if (neu.fehlerPid) e.fehlerId = addFehler(st, neu.fehlerPid, e.minute, 'vor Gegentor').id;
        e.fehlerPid = neu.fehlerPid || null;
      }
      if (e.fehlerId) { var fe = findeEreignis(st, e.fehlerId); if (fe) fe.ev.minute = e.minute; }
    }
    return e;
  }


  // ---------- Live-Spiel: Uhr aus gespeicherten Zeitstempeln (übersteht Hintergrund/Bildschirm aus) ----------
  function standardHalbzeit(st) { return Math.max(5, Math.round(spielzeitVon(st) / 2)); }   // Standard 2 × 30, folgt der Spielzeit des Spieltags
  function live(st) {
    if (!st.live) st.live = { phase: 'vor', halbzeit: standardHalbzeit(st), h1Start: null, h1Ende: null, h2Start: null, h2Ende: null };
    return st.live;
  }
  function liveLaeuft(st) { return !!(st.live && (st.live.phase === 'h1' || st.live.phase === 'h2')); }
  function liveSekunden(st, now) {   // angezeigte Spielzeit in Sekunden (2. Halbzeit beginnt bei Halbzeitlänge)
    var L = st.live; if (!L || L.phase === 'vor') return 0;
    var H = L.halbzeit * 60;
    if (L.phase === 'h1') return Math.max(0, (now - L.h1Start) / 1000);
    if (L.phase === 'pause') return Math.max(0, (L.h1Ende - L.h1Start) / 1000);
    if (L.phase === 'h2') return H + Math.max(0, (now - L.h2Start) / 1000);
    if (L.h2Start) return H + Math.max(0, ((L.h2Ende || now) - L.h2Start) / 1000);
    return Math.max(0, ((L.h1Ende || now) - L.h1Start) / 1000);
  }
  function liveMinute(st, now) {   // Spielminute für ein Ereignis (1. Minute = 0:00–0:59); Nachspielzeit der 1. HZ zählt als letzte Minute
    var L = st.live; if (!L || L.phase === 'vor') return null;
    var H = L.halbzeit;
    if (L.phase === 'h1') return Math.min(H, Math.floor(liveSekunden(st, now) / 60) + 1);
    if (L.phase === 'pause') return H;
    if (L.phase === 'h2') return H + Math.floor((now - L.h2Start) / 60000) + 1;
    return spielzeitVon(st);
  }
  function liveAktion(st, aktion, now) {
    var L = live(st);
    if (aktion === 'start' && L.phase === 'vor') { L.phase = 'h1'; L.h1Start = now; }
    else if (aktion === 'halbzeit' && L.phase === 'h1') { L.phase = 'pause'; L.h1Ende = now; }
    else if (aktion === 'zweite' && L.phase === 'pause') { L.phase = 'h2'; L.h2Start = now; }
    else if (aktion === 'stop' && (L.phase === 'h1' || L.phase === 'h2' || L.phase === 'pause')) {
      if (L.phase === 'h1') L.h1Ende = now; if (L.phase === 'h2') L.h2Ende = now;
      L.phase = 'ende';
      var dauer = L.h2Start ? L.halbzeit + Math.round((L.h2Ende - L.h2Start) / 60000) : Math.round((L.h1Ende - L.h1Start) / 60000);
      var maxEv = 0; EV_LISTEN.forEach(function (k) { spielbericht(st)[k].forEach(function (x) { if (isNum(x.minute)) maxEv = Math.max(maxEv, x.minute); }); });
      st.spielzeit = Math.max(1, dauer, maxEv);
    }
    else if (aktion === 'weiter' && L.phase === 'ende') {   // Abpfiff rückgängig
      if (L.h2Start) { L.phase = 'h2'; L.h2Ende = null; } else { L.phase = 'h1'; L.h1Ende = null; }
    }
    else return false;
    return true;
  }
  // Aufstellung mit Positionen zu einer Minute (Startelf + Wechsel + Positionstausch)
  function liveAufstellung(st, minute) {
    var se = startelfListe(st), slots = se.map(function (x) { return x.pid; }), s = spielbericht(st), m0 = isNum(minute) ? minute : Infinity;
    var ev = s.wechsel.map(function (w, k) { return { t: 'w', e: w, k: k }; }).concat(s.tausch.map(function (x, k) { return { t: 't', e: x, k: 1000 + k }; }));
    ev.sort(function (a, b) { return (isNum(a.e.minute) ? a.e.minute : 9999) - (isNum(b.e.minute) ? b.e.minute : 9999) || (a.e.zeit || 0) - (b.e.zeit || 0) || a.k - b.k; });
    ev.forEach(function (x) {
      var mm = isNum(x.e.minute) ? x.e.minute : 9999; if (mm > m0) return;
      if (x.t === 'w') { var i = slots.indexOf(x.e.raus); if (i >= 0 && slots.indexOf(x.e.rein) < 0) slots[i] = x.e.rein; }
      else { var a = slots.indexOf(x.e.a), b = slots.indexOf(x.e.b); if (a >= 0 && b >= 0) { slots[a] = x.e.b; slots[b] = x.e.a; } }
    });
    return se.map(function (x, i) { return { pos: x.pos, pid: slots[i] || null }; });
  }
  // Drag & Drop im Live-Modus: Bank → Position = Wechsel, Position ↔ Position = Positionstausch
  function liveDrop(st, src, dst, minute) {
    var a = src.split(':'), b = dst.split(':'), auf = liveAufstellung(st, null);
    if (b[0] !== 's') return null;
    var ziel = auf[+b[1]]; if (!ziel) return null;
    if (a[0] === 'b') { var rein = +a[1]; if (auf.some(function (x) { return x.pid === rein; })) return null; if (!ziel.pid) return null; return addWechsel(st, minute, rein, ziel.pid); }
    if (a[0] === 's') { var q = auf[+a[1]]; if (!q || !q.pid || !ziel.pid || q.pid === ziel.pid) return null; return addTausch(st, minute, q.pid, ziel.pid); }
    return null;
  }
  // ---------- Zusammenfassung (Text für WhatsApp & Co., HTML/PDF) ----------
  function zusammenfassung(d, st) {
    var b = bericht(d, st), name = nameFn(d), s = spielbericht(st), L = st.live || null;
    var torListe = {}; s.tore.forEach(function (t) { if (t.pid) (torListe[t.pid] = torListe[t.pid] || { tore: 0, assists: 0 }).tore++; if (t.assist) (torListe[t.assist] = torListe[t.assist] || { tore: 0, assists: 0 }).assists++; });
    var scorer = Object.keys(torListe).map(function (k) { return { pid: +k, name: name(+k), tore: torListe[k].tore, assists: torListe[k].assists }; }).sort(function (x, y) { return y.tore - x.tore || y.assists - x.assists || x.name.localeCompare(y.name); });
    var fehler = {}; s.fehler.forEach(function (f) { fehler[f.pid] = (fehler[f.pid] || 0) + 1; });
    var minuten = Object.keys(b.minuten).map(function (k) { return { pid: +k, name: name(+k), min: b.minuten[k] }; }).sort(function (x, y) { return y.min - x.min || x.name.localeCompare(y.name); });
    var ende = liveAufstellung(st, null).map(function (x) { return { pos: x.pos, pid: x.pid, name: x.pid ? name(x.pid) : '–' }; });
    return { titel: titel(st), gegner: st.gegner || 'Gegner', ort: st.ort, tore: b.tore, gegentore: b.gegentore, spielzeit: spielzeitVon(st),
      halbzeit: L ? L.halbzeit : null, beginn: L && L.h1Start ? L.h1Start : null, ereignisse: b.ereignisse, startelf: b.startelf, endelf: ende,
      wechsel: s.wechsel.slice().sort(function (x, y) { return (x.minute || 0) - (y.minute || 0); }).map(function (w) { return { minute: w.minute, rein: name(w.rein), raus: name(w.raus) }; }),
      scorer: scorer, fehler: Object.keys(fehler).map(function (k) { return { name: name(+k), n: fehler[k] }; }),
      notizen: s.notizen.map(function (n) { return { minute: n.minute, text: (n.pid ? name(n.pid) + ': ' : '') + n.text }; }), minuten: minuten };
  }
  function minTxt(m) { return isNum(m) ? m + '′' : '–'; }
  function zusammenfassungText(d, st) {
    var z = zusammenfassung(d, st), L = [];
    L.push('⚽ PSV Wesel-Lackhausen – ' + z.gegner + (z.ort ? ' (' + z.ort + ')' : ''));
    L.push(fmtDatum(st.datum) + (z.beginn ? ', Anpfiff ' + new Date(z.beginn).toTimeString().slice(0, 5) + ' Uhr' : '') + (z.halbzeit ? ' · 2 × ' + z.halbzeit + ' Min.' : ''));
    L.push('Ergebnis: *' + z.tore + ':' + z.gegentore + '*' + (st.ohneWertung ? ' (ohne Wertung)' : ''));
    L.push('');
    if (z.scorer.length) { L.push('Tore/Vorlagen: ' + z.scorer.map(function (x) { return x.name + (x.tore ? ' ' + x.tore + ' T' : '') + (x.assists ? ' ' + x.assists + ' V' : ''); }).join(', ')); }
    L.push('Startelf: ' + z.startelf.map(function (x) { return x.pos + ' ' + x.name; }).join(', '));
    if (JSON.stringify(z.endelf) !== JSON.stringify(z.startelf.map(function (x) { return { pos: x.pos, pid: x.pid, name: x.name }; })))
      L.push('Schlussaufstellung: ' + z.endelf.map(function (x) { return x.pos + ' ' + x.name; }).join(', '));
    if (z.wechsel.length) L.push('Wechsel: ' + z.wechsel.map(function (w) { return minTxt(w.minute) + ' ' + w.rein + ' für ' + w.raus; }).join(', '));
    if (z.fehler.length) L.push('Abwehrfehler: ' + z.fehler.map(function (f) { return f.name + (f.n > 1 ? ' ×' + f.n : ''); }).join(', '));
    L.push('');
    L.push('Spielverlauf:');
    if (!z.ereignisse.length) L.push('– keine Ereignisse –');
    z.ereignisse.forEach(function (e) { L.push(minTxt(e.minute) + ' ' + e.text); });
    if (z.minuten.length) { L.push(''); L.push('Einsatzminuten (von ' + z.spielzeit + '): ' + z.minuten.map(function (m) { return m.name + ' ' + m.min; }).join(', ')); }
    return L.join('\n');
  }
  function h(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function zusammenfassungHtml(d, st) {
    var z = zusammenfassung(d, st);
    var tab = function (kopf, zeilen) { return '<table><tr>' + kopf.map(function (k) { return '<th>' + h(k) + '</th>'; }).join('') + '</tr>' + zeilen.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + h(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>'; };
    var se = z.startelf.map(function (x, i) { return [x.pos, x.name, z.endelf[i] ? z.endelf[i].name : '']; });
    return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + h('Spielbericht ' + z.titel) + '</title><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#1d2320;margin:24px;max-width:780px}h1{color:#1B5E20;font-size:22px;margin:0}h2{color:#1B5E20;font-size:16px;border-bottom:2px solid #1B5E20;padding-bottom:3px;margin-top:22px}' +
      '.erg{font-size:40px;font-weight:800;margin:10px 0}.mu{color:#68736c}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #dfe5df;padding:5px 6px;text-align:left}th{background:#eef2ee}' +
      '</style></head><body><h1>PSV Wesel-Lackhausen – ' + h(z.gegner) + '</h1><div class="mu">' + h(z.titel) + (z.halbzeit ? ' · 2 × ' + z.halbzeit + ' Min.' : '') + '</div>' +
      '<div class="erg">' + z.tore + ' : ' + z.gegentore + '</div>' +
      '<h2>Spielverlauf</h2>' + (z.ereignisse.length ? tab(['Min.', 'Ereignis'], z.ereignisse.map(function (e) { return [minTxt(e.minute), e.text]; })) : '<p class="mu">Keine Ereignisse.</p>') +
      '<h2>Aufstellung</h2>' + tab(['Position', 'Anpfiff', 'Abpfiff'], se) +
      (z.wechsel.length ? '<h2>Wechsel</h2>' + tab(['Min.', 'Rein', 'Raus'], z.wechsel.map(function (w) { return [minTxt(w.minute), w.rein, w.raus]; })) : '') +
      (z.scorer.length ? '<h2>Tore und Vorlagen</h2>' + tab(['Spieler', 'Tore', 'Vorlagen'], z.scorer.map(function (x) { return [x.name, x.tore, x.assists]; })) : '') +
      (z.fehler.length ? '<h2>Abwehrfehler</h2>' + tab(['Spieler', 'Anzahl'], z.fehler.map(function (f) { return [f.name, f.n]; })) : '') +
      (z.notizen.length ? '<h2>Notizen</h2>' + tab(['Min.', 'Notiz'], z.notizen.map(function (n) { return [minTxt(n.minute), n.text]; })) : '') +
      '<h2>Einsatzminuten</h2>' + tab(['Spieler', 'Minuten'], z.minuten.map(function (m) { return [m.name, m.min + ' / ' + z.spielzeit]; })) +
      '<p class="mu" style="margin-top:24px;font-size:11px">Erstellt mit PSV Wesel-Lackhausen · Aufstellung 2.2</p></body></html>';
  }
  var api = { DATA_VERSION: DATA_VERSION, KRIT_FELD: KRIT_FELD, KRIT_TW: KRIT_TW, FORM_RECENCY: FORM_RECENCY, STANDARD_SPIELZEIT: STANDARD_SPIELZEIT,
    VORSCHLAG_MIN_SPIELE: VORSCHLAG_MIN_SPIELE, VORSCHLAG_SCHWELLE: VORSCHLAG_SCHWELLE,
    migrate: migrate, sortSpieltage: sortSpieltage, getSpieltag: getSpieltag, aktiver: aktiver, neuerSpieltag: neuerSpieltag, loescheSpieltag: loescheSpieltag,
    korrekturenAnwenden: korrekturenAnwenden, KORREKTUREN: KORREKTUREN, zaehltFuerWertung: zaehltFuerWertung, titel: titel, fmtDatum: fmtDatum, today: today, kritFuer: kritFuer, spielwert: spielwert, bewerteteSpiele: bewerteteSpiele, autoForm: autoForm,
    effectiveData: effectiveData, berechne: berechne, snapshotAus: snapshotAus, abschliessen: abschliessen, wiederOeffnen: wiederOeffnen, aufstellungVon: aufstellungVon,
    vorschlaege: vorschlaege, vorschlagUebernehmen: vorschlagUebernehmen, vorschlagIgnorieren: vorschlagIgnorieren,
    spielbericht: spielbericht, startelfAusVorschlag: startelfAusVorschlag, startelfListe: startelfListe, setFormation: setFormation, startelfDrop: startelfDrop, spielMinuten: spielMinuten,
    aufDemPlatz: aufDemPlatz, hatGespielt: hatGespielt, minutenFuer: minutenFuer, bericht: bericht, saison: saison, spielzeitVon: spielzeitVon,
    addTor: addTor, addGegentor: addGegentor, addNotiz: addNotiz, addKarte: addKarte, addTausch: addTausch, bearbeiteEreignis: bearbeiteEreignis, findeEreignis: findeEreignis,
    KLASSEN: KLASSEN, standardKatalog: standardKatalog, testById: testById, altersklasse: altersklasse, saisonKey: saisonKey, bestWert: bestWert, messNote: messNote,
    neueMessung: neueMessung, messungById: messungById, messwertSetzen: messwertSetzen, messErgebnis: messErgebnis, messVerlauf: messVerlauf, teamVergleich: teamVergleich,
    messQuellen: messQuellen, sortMessungen: sortMessungen, saisonListe: saisonListe, spieltageDerSaison: spieltageDerSaison, einsatzQuote: einsatzQuote,
    GEGNER_NOTIZ_TYPEN: GEGNER_NOTIZ_TYPEN, gegnerKey: gegnerKey, gegnerById: gegnerById, gegnerSuchen: gegnerSuchen, neuerGegner: neuerGegner, gegnerFuerName: gegnerFuerName, gegnerVerknuepfen: gegnerVerknuepfen, gegnerVon: gegnerVon,
    gegnerSpieltage: gegnerSpieltage, gegnerBilanz: gegnerBilanz, gegnerNotiz: gegnerNotiz, gegnerNotizen: gegnerNotizen, gegnerNotizLoeschen: gegnerNotizLoeschen, gegnerUmbenennen: gegnerUmbenennen,
    gegnerZusammenfuehren: gegnerZusammenfuehren, gegnerLoeschen: gegnerLoeschen, gegnerAehnlich: gegnerAehnlich, gegnerInfo: gegnerInfo, mitErgebnis: mitErgebnis,
    POS_KRIT: POS_KRIT, GEGNER: GEGNER, posGruppe: posGruppe, KRIT_FELD: KRIT_FELD, KRIT_TW: KRIT_TW,
    aktiveSpieler: aktiveSpieler, ehemaligeSpieler: ehemaligeSpieler, beteiligt: beteiligt, vergangeneDaten: vergangeneDaten, archivieren: archivieren, wiederherstellen: wiederherstellen, endgueltigLoeschen: endgueltigLoeschen, spielerById: spielerById,
    live: live, liveLaeuft: liveLaeuft, liveSekunden: liveSekunden, liveMinute: liveMinute, liveAktion: liveAktion, liveAufstellung: liveAufstellung, liveDrop: liveDrop, standardHalbzeit: standardHalbzeit,
    zusammenfassung: zusammenfassung, zusammenfassungText: zusammenfassungText, zusammenfassungHtml: zusammenfassungHtml, KARTEN: KARTEN, addFehler: addFehler, addWechsel: addWechsel, entferneEreignis: entferneEreignis };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PSVModel = api;
})(this);
