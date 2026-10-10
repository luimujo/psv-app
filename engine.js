/* PSV Wesel-Lackhausen Aufstellung – Rechenkern
 * 1:1-Portierung der Formeln aus „Fussball_Spieltagsaufstellung (2).xlsx“ (Stand 08.10.2026):
 * Spielerbögen (G15–G33), Übersicht (M, Ranking), Positionsvorschlag (AI:AS) und
 * das ausgeblendete Blatt „Listen“ (Erstbesetzung, Tauschrunden, Auswechseloptionen).
 */
(function (root) {
  'use strict';
  var PV_POS = ['TW', 'IV', 'LV', 'RV', '6', '8', '10', 'LA', 'RA', 'ST', 'HS'];   // Positionsvorschlag AI:AS / Bogen B45:B55
  var POS12 = ['TW', 'IV', 'LV', 'RV', '6', '8', '10', 'LM', 'RM', 'LA', 'RA', 'ST']; // Positionen auf den Feldern
  var PRI = ['TW', 'IV', '6', '8', 'ST', 'LM', 'RM', 'LA', 'RA', 'LV', 'RV', '10'];   // Vergabe-Reihenfolge
  var COLMAP = { LM: 'LA', RM: 'RA' };
  var ZROWS = ['TW', 'IV', 'LV', 'RV', '6', '8', '10', 'LM', 'RM', 'LA', 'RA', 'ST', 'HS'];
  // Spielfelder: Positionen in Anzeige-Reihenfolge (wie Formation_Visuell) mit Koordinaten (x 0..100 links→rechts, y 0..100 Angriff→Tor)
  var PITCHES = [
    { code: '7A', size: '7', name: '7er · 2-3-1', kurz: '2-3-1', slots: [['TW', 50, 92], ['LV', 28, 72], ['RV', 72, 72], ['LM', 16, 40], ['6', 50, 48], ['RM', 84, 40], ['ST', 50, 15]] },
    { code: '7B', size: '7', name: '7er · 2-1-3', kurz: '2-1-3', slots: [['TW', 50, 92], ['IV', 30, 72], ['IV', 70, 72], ['6', 50, 50], ['LA', 16, 22], ['ST', 50, 13], ['RA', 84, 22]] },
    { code: '9A', size: '9', name: '9er · 3-4-1', kurz: '3-4-1', slots: [['TW', 50, 92], ['LV', 18, 72], ['IV', 50, 76], ['RV', 82, 72], ['LM', 13, 38], ['6', 36, 49], ['8', 64, 37], ['RM', 87, 38], ['ST', 50, 13]] },
    { code: '9B', size: '9', name: '9er · 3-2-3', kurz: '3-2-3', slots: [['TW', 50, 92], ['LV', 18, 72], ['IV', 50, 76], ['RV', 82, 72], ['8', 32, 49], ['10', 66, 37], ['LA', 16, 21], ['ST', 50, 12], ['RA', 84, 21]] },
    // ab Version 1.2: weitere Formationen (nur bestehende Positionen → Zonen, Stamm/Alt-Bonus, Kapitän- und Konditionsregel gelten unverändert)
    { code: '7C', size: '7', name: '7er · 3-2-1', kurz: '3-2-1', slots: [['TW', 50, 92], ['LV', 20, 70], ['IV', 50, 74], ['RV', 80, 70], ['6', 32, 46], ['8', 68, 46], ['ST', 50, 15]] },
    { code: '7D', size: '7', name: '7er · 3-1-2', kurz: '3-1-2', slots: [['TW', 50, 92], ['LV', 20, 70], ['IV', 50, 74], ['RV', 80, 70], ['6', 50, 48], ['ST', 32, 17], ['ST', 68, 17]] },
    { code: '7E', size: '7', name: '7er · 2-2-2', kurz: '2-2-2', slots: [['TW', 50, 92], ['LV', 28, 72], ['RV', 72, 72], ['6', 32, 46], ['8', 68, 46], ['ST', 32, 17], ['ST', 68, 17]] },
    { code: '9C', size: '9', name: '9er · 3-3-2', kurz: '3-3-2', slots: [['TW', 50, 92], ['LV', 18, 72], ['IV', 50, 76], ['RV', 82, 72], ['LM', 14, 44], ['6', 50, 50], ['RM', 86, 44], ['ST', 32, 15], ['ST', 68, 15]] },
    { code: '9D', size: '9', name: '9er · 4-3-1', kurz: '4-3-1', slots: [['TW', 50, 92], ['LV', 13, 68], ['IV', 37, 76], ['IV', 63, 76], ['RV', 87, 68], ['LM', 18, 40], ['6', 50, 48], ['RM', 82, 40], ['ST', 50, 13]] },
    { code: '9E', size: '9', name: '9er · 4-2-2', kurz: '4-2-2', slots: [['TW', 50, 92], ['LV', 13, 68], ['IV', 37, 76], ['IV', 63, 76], ['RV', 87, 68], ['6', 32, 47], ['8', 68, 47], ['ST', 32, 15], ['ST', 68, 15]] },
    { code: '9F', size: '9', name: '9er · 3-1-3-1', kurz: '3-1-3-1', slots: [['TW', 50, 92], ['LV', 18, 73], ['IV', 50, 77], ['RV', 82, 73], ['6', 50, 57], ['LM', 14, 38], ['10', 50, 33], ['RM', 86, 38], ['ST', 50, 12]] }
  ];
  // Vorschlags-Paar je Größe: [Abwehr-Formation, Angriffs-Formation] – Standard wie im Excel-Blatt
  var STANDARD_PAAR = { '7': ['7A', '7B'], '9': ['9A', '9B'] };
  function pitchByCode(c) { for (var i = 0; i < PITCHES.length; i++) if (PITCHES[i].code === c) return PITCHES[i]; return null; }
  function paarFuer(S, sz) {
    var p = S && S['paar' + sz];
    if (Array.isArray(p) && p.length === 2 && p[0] !== p[1] && pitchByCode(p[0]) && pitchByCode(p[1]) && pitchByCode(p[0]).size === sz && pitchByCode(p[1]).size === sz) return [p[0], p[1]];
    return STANDARD_PAAR[sz].slice();
  }
  var STAMM_LABEL = 'Ausdauer über die Spielzeit';

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  // Excel ROUND (kaufmännisch, mit 15-stelliger Korrektur wie Excel)
  function xround(x, d) {
    var m = Math.pow(10, d || 0);
    var y = Number((Math.abs(x) * m).toPrecision(15));
    return (x < 0 ? -1 : 1) * Math.round(y) / m;
  }
  function avg(arr) { var s = 0, n = 0; arr.forEach(function (v) { if (isNum(v)) { s += v; n++; } }); return n ? s / n : null; }
  function rng(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }

  // Gewichte der Positionsnote (Positionsvorschlag AI:AS)
  var TW_SKILL_W = [[16, .14], [17, .08], [18, .08], [19, .08], [20, .14], [21, .14], [22, .12], [23, .08], [25, .08], [42, .06]];
  var FIELD_W = {
    IV: [[25, .2], [21, .14], [36, .18], [29, .18], [39, .1], [26, .12], [42, .08]],
    LV: [[33, .14], [34, .12], [22, .16], [29, .14], [25, .12], [35, .1], [17, .1], [30, .12]],
    RV: [[33, .14], [34, .12], [22, .16], [29, .14], [25, .12], [35, .1], [17, .1], [30, .12]],
    '6': [[25, .18], [26, .16], [17, .14], [18, .12], [29, .14], [39, .1], [36, .1], [42, .06]],
    '8': [[35, .16], [36, .14], [27, .14], [30, .14], [17, .12], [41, .1], [28, .12], [26, .08]],
    '10': [[31, .18], [26, .14], [19, .14], [17, .12], [20, .12], [40, .12], [16, .1], [23, .08]],
    LA: [[19, .18], [33, .14], [34, .14], [22, .14], [20, .12], [30, .12], [37, .08], [16, .08]],
    RA: [[19, .18], [33, .14], [34, .14], [22, .14], [20, .12], [30, .12], [37, .08], [16, .08]],
    ST: [[20, .22], [33, .14], [21, .12], [30, .14], [36, .1], [37, .08], [41, .12], [16, .08]],
    HS: [[20, .16], [31, .16], [19, .14], [26, .14], [30, .12], [16, .12], [40, .1], [17, .06]]
  };
  function sk(p, row) { var v = p.skills ? p.skills[String(row)] : null; return isNum(v) ? v : null; }
  function weighted(p, W) {
    var s = 0, w = 0;
    W.forEach(function (e) { var v = sk(p, e[0]); if (v !== null) { s += v * e[1]; w += e[1]; } });
    return w === 0 ? null : xround(s / w, 1);
  }
  function eig(p, pos) { var v = p.eignung ? p.eignung[pos] : null; return isNum(v) ? v : null; }

  // ---------- Spielerbogen ----------
  function playerEval(p, skala) {
    var r = { technik: null, taktik: null, athletik: null, mental: null, form: null, gesamt: null };
    if (!p) return r;
    var cat = function (a, b) { var a2 = avg(rng(a, b).map(function (i) { return sk(p, i); })); return a2 === null ? null : xround(a2, 1); };
    r.technik = cat(16, 23); r.taktik = cat(25, 31); r.mental = cat(39, 43);
    if (p.typ === 'TW') r.athletik = cat(33, 37);
    else {
      var vals = rng(33, 37).map(function (i) { return sk(p, i); });
      var cnt = vals.filter(isNum).length;
      if (cnt) {
        var w = isNum(skala.ausdauerGewicht) ? skala.ausdauerGewicht : 1;
        var sum = vals.reduce(function (a, v) { return a + (isNum(v) ? v : 0); }, 0);
        var b35 = sk(p, 35);
        var den = cnt + (w - 1) * (b35 !== null ? 1 : 0);
        r.athletik = den === 0 ? null : xround((sum + (w - 1) * (b35 !== null ? b35 : 0)) / den, 1);
      }
    }
    var f = avg((p.form || []).slice(0, 4)); r.form = f === null ? null : xround(f, 1);
    var W = skala.weights, cats = [['technik', 'Technik'], ['taktik', 'Taktik'], ['athletik', 'Athletik'], ['mental', 'Mental'], ['form', 'Form']];
    var s = 0, ws = 0, any = false;
    cats.forEach(function (c) { if (r[c[0]] !== null) { any = true; s += r[c[0]] * W[c[1]]; ws += W[c[1]]; } });
    r.gesamt = any && ws ? xround(s / ws, 1) : null;
    // Einsatzempfehlung / Minuten (G27/G29)
    var v = p.verfuegbarkeit || '';
    if (!p.name) { r.einsatz = ''; r.minuten = ''; }
    else if (v === 'Verletzt' || v === 'Abwesend') { r.einsatz = 'Nicht einsetzen'; r.minuten = '0'; }
    else if (v === 'Angeschlagen' || p.aufbau === 'Ja') { r.einsatz = 'Joker / reduzierte Minuten'; r.minuten = '10–20 Min.'; }
    else if (r.gesamt !== null && r.gesamt >= 4) { r.einsatz = 'Startelf-Kandidat'; r.minuten = p.darfVoll === 'Nein' ? 'eine Halbzeit' : 'volle Spielzeit'; }
    else if (r.gesamt !== null && r.gesamt >= 3.2) { r.einsatz = 'Rotation'; r.minuten = '20–35 Min.'; }
    else { r.einsatz = r.gesamt === null ? 'Noten fehlen' : 'Joker / Aufbau'; r.minuten = '10–20 Min.'; }
    // Beste Position (G31) / Positionsfit Stamm (G33) – aus der Positionseignung des Trainers
    var best = null, bv = -Infinity;
    PV_POS.forEach(function (q) { var e = eig(p, q); if (e !== null && e > bv) { bv = e; best = q; } });
    r.besteDetail = best; r.beste = best || '';
    r.fitStamm = (p.stamm && best !== null && PV_POS.indexOf(p.stamm) >= 0) ? (eig(p, p.stamm) !== null ? eig(p, p.stamm) : 0) : null;
    r.ausdauer = (p.typ !== 'TW') ? sk(p, 35) : null;
    return r;
  }

  // ---------- Positionsvorschlag AI:AS ----------
  function posScores(p) {
    var out = {};
    PV_POS.forEach(function (q) {
      var E = eig(p, q), val = null;
      if (p.typ === 'TW') {
        if (q === 'TW') {
          var S = weighted(p, TW_SKILL_W);
          if (S === null && E === null) val = null; else if (S === null) val = E; else if (E === null) val = S; else val = xround(0.7 * S + 0.3 * E, 1);
        } else val = E;
      } else {
        if (q === 'TW') val = E;
        else {
          var S2 = weighted(p, FIELD_W[q]);
          var bonus = 0;
          if ((q === 'LV' || q === 'LA') && (p.fuss === 'Links' || p.fuss === 'Beidfüßig')) bonus = 0.3;
          if ((q === 'RV' || q === 'RA') && (p.fuss === 'Rechts' || p.fuss === 'Beidfüßig')) bonus = 0.3;
          if (S2 === null && E === null) val = null; else if (S2 === null) val = E;
          else if (E === null) val = Math.min(5, xround(S2 + bonus, 1));
          else val = Math.min(5, xround(0.65 * (S2 + bonus) + 0.35 * E, 1));
        }
      }
      out[q] = val;
    });
    return out;
  }

  function firstName(n) { n = (n || '').trim(); var i = n.indexOf(' '); return i < 0 ? n : n.slice(0, i); }

  // ---------- Erstbesetzung (Blatt „Listen“) ----------
  function lineups(data, evals) {
    var S = data.settings, P = data.players, Z = data.zones || {};
    var bStamm = isNum(S.bonusStamm) ? S.bonusStamm : 0.5, bAlt = isNum(S.bonusAlt) ? S.bonusAlt : 0.25;
    var M2 = 1, R4 = 3, M4 = isNum(S.gewichtKondition) ? S.gewichtKondition : 0;
    var K = P.map(function (p, i) {
      var ev = evals[i], H = i + 1, name = (p.name || '').trim();
      var c = { H: H, p: p, name: name, vor: firstName(name), nr: p.nr, gesamt: ev.gesamt, stamm: p.stamm || '', alt: p.alt || '', beste: ev.beste };
      var v = p.verfuegbarkeit || '';
      var st = '';
      if (name && S.zusagenVerwenden) st = p.status || 'nicht gemeldet';
      c.status = st;
      c.P = (!name) ? 0 : ((v === 'Verletzt' || v === 'Abwesend') ? 0 : (!S.zusagenVerwenden ? 1 : (st === 'Zugesagt' ? 1 : ((st === 'Offen' && S.offenMitplanen) ? 1 : 0))));
      c.grund = (!name || c.P === 1) ? '' : ((v === 'Verletzt' || v === 'Abwesend') ? v : (st === '' ? 'nicht gemeldet' : st));
      c.Q = (isNum(c.gesamt) ? c.gesamt : 0) / 1000 + (17 - H) / 1000000;
      c.ausd = (p.typ !== 'TW') ? sk(p, 35) : null;
      c.AZ = isNum(c.ausd) ? M4 * (c.ausd - 3) * 0.25 : 0;
      var sc = posScores(p); c.sc = sc;
      c.E = {}; c.B = {};
      POS12.forEach(function (q) {
        var col = COLMAP[q] || q, s = sc[col], base;
        if (!name || !isNum(s)) base = -99;
        else if (c.stamm === q || c.stamm === col) base = s + bStamm;
        else if (c.alt === q || c.alt === col) base = s + bAlt;
        else {
          var zz = function (r) { var row = Z[r]; if (!r || !row) return 99; var x = row[q]; return isNum(x) ? x : 99; };
          var m = Math.min(zz(c.stamm), zz(c.alt));
          base = m >= 99 ? -99 : s - m;
        }
        c.B[q] = base;
        c.E[q] = base < -50 ? -99 : base + (q === 'TW' ? 0 : c.AZ);
      });
      return c;
    });
    // Kapitän
    var kap = (S.kapitaen || '').trim(), I4 = 0;
    if (kap) {
      for (var i = 0; i < K.length; i++) if (K[i].name === kap) { I4 = i + 1; break; }
      if (!I4) for (i = 0; i < K.length; i++) if (K[i].vor === kap) { I4 = i + 1; break; }
    }
    var K4 = (I4 > 0 && S.kapitaenStartelf && K[I4 - 1].P === 1) ? I4 : 0;
    var N = K.length;

    function prepPitch(pt) {
      var disp = pt.slots.map(function (s) { return s[0]; });
      var order = disp.map(function (_, i) { return i; }).sort(function (a, b) { return (PRI.indexOf(disp[a]) - PRI.indexOf(disp[b])) || (a - b); });
      var slots = order.map(function (di) { return { pos: disp[di], di: di }; });
      // FX[j][k] = Auswahlwert (null wenn nicht erlaubt)
      var FX = slots.map(function (s) { return K.map(function (c) { var e = c.E[s.pos]; return e < -50 ? null : e; }); });
      var mx = K.map(function (c, k) { var m = null; for (var j = 1; j < slots.length; j++) { var v = FX[j][k]; if (v !== null && (m === null || v > m)) m = v; } return m === null ? 0 : m; });
      // Kapitän: letzte erlaubte Position (X57 frei)
      var cap57 = slots.map(function (s, j) {
        if (K4 === 0) return 0;
        if (FX[j][K4 - 1] === null) return 0;
        if (j === slots.length - 1) return 1;
        for (var t = j + 1; t < slots.length; t++) if (FX[t][K4 - 1] !== null) return 0;
        return 1;
      });
      return { pt: pt, slots: slots, FX: FX, mx: mx, cap57: cap57 };
    }
    var PP = {}; PITCHES.forEach(function (pt) { PP[pt.code] = prepPitch(pt); });

    function assign(pp, allowed) {
      var n = pp.slots.length, chosen = [];
      for (var j = 0; j < n; j++) {
        var best = -Infinity, bk = null;
        for (var k = 0; k < N; k++) {
          var FXv = pp.FX[j][k], v = -1;
          if (allowed(k) && FXv !== null && chosen.indexOf(k + 1) < 0) {
            v = FXv + (pp.slots[j].pos === 'TW' ? 0 : M2 * (FXv - pp.mx[k])) + K[k].Q + ((k + 1 === K4 && pp.cap57[j] === 1) ? 1000 : 0);
          }
          if (v > best) { best = v; bk = k; }   // erstes Maximum (MATCH)
        }
        chosen.push(best < 0 ? null : bk + 1);
      }
      return chosen;
    }
    // Für Formationen außerhalb des Paars (und für ein vom Standard abweichendes Paar): bleibt eine Position leer (kein Gruppenkind dort erlaubt), wird sie mit dem
    // passendsten einsetzbaren Kind besetzt, das noch nicht in dieser Formation steht (gleiche Bewertungsregel wie die Erstbesetzung).
    function auffuellen(pp, kids) {
      var out = kids.slice();
      for (var j = 0; j < out.length; j++) {
        if (out[j] !== null) continue;
        var best = -Infinity, bk = null;
        for (var k = 0; k < N; k++) {
          var FXv = pp.FX[j][k];
          if (K[k].P !== 1 || FXv === null || out.indexOf(k + 1) >= 0) continue;
          var v = FXv + (pp.slots[j].pos === 'TW' ? 0 : M2 * (FXv - pp.mx[k])) + K[k].Q;
          if (v > best) { best = v; bk = k; }
        }
        if (bk !== null) out[j] = bk + 1;
      }
      // immer noch leer: ein Kind der Formation rückt auf die leere Position, ein freies Kind übernimmt dessen Platz
      var frei = function (k) { return K[k].P === 1 && out.indexOf(k + 1) < 0; };
      for (j = 0; j < out.length; j++) {
        if (out[j] !== null) continue;
        var bw = -Infinity, bi = -1, bf = -1;
        for (var i = 0; i < out.length; i++) {
          var h = out[i]; if (h === null || pp.FX[j][h - 1] === null) continue;
          for (k = 0; k < N; k++) {
            if (!frei(k) || pp.FX[i][k] === null) continue;
            var w = pp.FX[j][h - 1] + pp.FX[i][k] + K[k].Q;
            if (w > bw) { bw = w; bi = i; bf = k; }
          }
        }
        if (bi >= 0) { out[j] = out[bi]; out[bi] = bf + 1; }
      }
      return out;
    }
    function blockSum(pp, kids) {
      var s = 0, cnt = 0;
      kids.forEach(function (h, j) { if (h !== null) { s += pp.FX[j][h - 1]; cnt++; } });
      return s - R4 * (pp.slots.length - cnt);
    }
    var FREE = {}, RESTR = {};   // RESTR = Ausgangsbesetzung je Formation (vor den Tauschrunden)
    PITCHES.forEach(function (pt) {
      var pp = PP[pt.code];
      FREE[pt.code] = assign(pp, function (k) { return K[k].P === 1; });
    });
    // Erstbesetzung nur mit den Kindern einer Gruppe (Spalte „gleiche Kinder“ im Blatt „Listen“) inkl. Reparatur
    function restrict(pt, partner) {
      var pp = PP[pt.code], n = pp.slots.length;
      var g = assign(pp, function (k) { return partner.indexOf(k + 1) >= 0; });
      // Reparatur: übriges Gruppenkind (kleinste Nr.) auf leere Position
      var left = partner.filter(function (h) { return h !== null && g.indexOf(h) < 0; });
      var s57 = left.length ? Math.min.apply(null, left) : null;
      var x58 = g.map(function (h, j) { if (h !== null) return 99; return (s57 !== null && pp.FX[j][Math.max(1, s57) - 1] !== null) ? j + 1 : 50 + j + 1; });
      var mn = Math.min.apply(null, x58), s58 = mn >= 99 ? 99 : mn % 50;
      var final = g.slice();
      if (s57 !== null && s58 !== 99) {
        var gains = g.map(function (h, j) {
          var jj = j + 1, ecs = pp.FX[j][s57 - 1];
          if (h === null) return (jj === s58 && ecs !== null) ? ecs : -9;
          var exh = pp.FX[s58 - 1][h - 1], exs = pp.FX[j][h - 1];
          return (exh !== null && ecs !== null) ? exh + ecs - exs : -9;
        });
        var s59 = Math.max.apply(null, gains);
        var s60 = s59 <= -9 ? 0 : gains.indexOf(s59) + 1;
        if (s60 !== 0) {
          final = g.map(function (h, j) {
            var jj = j + 1;
            if (jj === s58) return s60 === s58 ? s57 : g[s60 - 1];
            if (jj === s60) return s57;
            return h;
          });
        }
      }
      return final;
    }
    var VAR = {};
    ['7', '9'].forEach(function (sz) {
      var pr = paarFuer(S, sz), A = pr[0], B = pr[1];
      var RB = restrict(pitchByCode(B), FREE[A]), RA = restrict(pitchByCode(A), FREE[B]);
      var t1 = blockSum(PP[A], FREE[A]) + blockSum(PP[B], RB);
      var t2 = blockSum(PP[B], FREE[B]) + blockSum(PP[A], RA);
      var v = t1 >= t2 - 0.0000001 ? 1 : 2, startCode = v === 1 ? A : B;
      VAR[sz] = { v: v, t1: t1, t2: t2, paar: pr, start: startCode };
      var std = A === STANDARD_PAAR[sz][0] && B === STANDARD_PAAR[sz][1];
      // alle Formationen dieser Größe mit denselben Kindern: Startformation frei, alle anderen aus deren Gruppe
      PITCHES.forEach(function (pt) {
        if (pt.size !== sz) return;
        if (pt.code === startCode) RESTR[pt.code] = std ? FREE[pt.code] : auffuellen(PP[pt.code], FREE[pt.code]);
        else if (pt.code === A) RESTR[pt.code] = std ? RA : auffuellen(PP[A], RA);   // Standard-Paar: exakt wie Excel
        else if (pt.code === B) RESTR[pt.code] = std ? RB : auffuellen(PP[B], RB);
        else RESTR[pt.code] = auffuellen(PP[pt.code], restrict(pt, FREE[startCode]));   // weitere Formation: Lücken mit freien Kindern füllen
      });
    });
    function isStammAt(h, pos) { var st = K[h - 1].stamm; return st === pos || st === (COLMAP[pos] || pos); }
    function swapRound(pp, kids) {
      var n = kids.length, best = -Infinity, bi = 0, bj = 0;
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
        var Ki = kids[i], Kj = kids[j], gain;
        if (Ki === null || Kj === null) gain = -9;
        else {
          var pi = pp.slots[i].pos, pj = pp.slots[j].pos;
          var block = (isStammAt(Ki, pi) && !isStammAt(Ki, pj)) || (isStammAt(Kj, pj) && !isStammAt(Kj, pi));
          if (block) gain = -9;
          else {
            var a = pp.FX[j][Ki - 1], b = pp.FX[i][Kj - 1], c = pp.FX[i][Ki - 1], d = pp.FX[j][Kj - 1];
            gain = (a !== null && b !== null) ? a + b - c - d : -9;
          }
        }
        if (gain > best) { best = gain; bi = i; bj = j; }
      }
      if (best > 0.0001) { var r = kids.slice(); r[bi] = kids[bj]; r[bj] = kids[bi]; return r; }
      return kids;
    }
    var result = { kapitaenNr: I4, kapitaenGesetzt: K4, kinder: K, varianten: VAR, pitches: {} };
    PITCHES.forEach(function (pt) {
      var pp = PP[pt.code], V = VAR[pt.size];
      var start = RESTR[pt.code];
      var r1 = swapRound(pp, start), r2 = swapRound(pp, r1);
      var byDisp = [];
      pp.slots.forEach(function (s, j) {
        var h = r2[j];
        byDisp[s.di] = {
          pos: s.pos, x: pt.slots[s.di][1], y: pt.slots[s.di][2], kind: h,
          name: h ? K[h - 1].name : '', vorname: h ? K[h - 1].vor : '', nr: h ? K[h - 1].nr : '',
          kapitaen: !!h && h === I4,
          eignung: h ? K[h - 1].sc[COLMAP[s.pos] || s.pos] : null,
          auswahl: h ? pp.FX[j][h - 1] : 0
        };
      });
      result.pitches[pt.code] = { code: pt.code, name: pt.name, size: pt.size, rolle: pt.code === V.paar[0] ? 'Abwehr' : (pt.code === V.paar[1] ? 'Angriff' : ''), slotsPri: pp.slots, kidsPri: r2, aufstellung: byDisp, pp: pp };
    });
    // Auswechseloptionen
    ['7', '9'].forEach(function (sz) {
      var codes = PITCHES.filter(function (pt) { return pt.size === sz; }).map(function (pt) { return pt.code; }), paar = VAR[sz].paar;
      var inLineup = function (h) { return paar.some(function (c) { return result.pitches[c].kidsPri.indexOf(h) >= 0; }); };
      var keys = K.map(function (c) { return (c.P === 1 && !inLineup(c.H)) ? (isNum(c.gesamt) ? c.gesamt : 0) + (17 - c.H) / 1000000 : -1; });
      var bankPaar = [];
      var sorted = keys.map(function (v, i) { return [v, i]; }).filter(function (x) { return x[0] >= 0; })
        .sort(function (a, b) { return (b[0] - a[0]) || (a[1] - b[1]); });
      sorted.slice(0, 9).forEach(function (x) { bankPaar.push(x[1] + 1); });
      function bankFuer(code) {   // weitere Formationen: alle einsetzbaren Kinder, die dort nicht beginnen
        var kp = result.pitches[code].kidsPri;
        return K.map(function (c) { return (c.P === 1 && kp.indexOf(c.H) < 0) ? [(isNum(c.gesamt) ? c.gesamt : 0) + (17 - c.H) / 1000000, c.H] : null; })
          .filter(Boolean).sort(function (a, b) { return (b[0] - a[0]) || (a[1] - b[1]); }).slice(0, 9).map(function (x) { return x[1]; });
      }
      codes.forEach(function (code) {
        var R = result.pitches[code], pp = R.pp, bank = paar.indexOf(code) >= 0 ? bankPaar : bankFuer(code);
        var x54 = R.kidsPri.map(function (h, j) { return h ? pp.FX[j][h - 1] : 0; });
        R.bank = bank.map(function (h) {
          var c = K[h - 1], best = null, bj = -1;
          for (var j = 0; j < pp.slots.length; j++) {
            var fx = pp.FX[j][h - 1]; if (fx === null) continue;
            var val = fx - x54[j] / 1000;
            if (best === null || val > best) { best = val; bj = j; }
          }
          var o = { kind: h, name: c.name, vorname: c.vor, nr: c.nr, note: c.gesamt, beste: c.beste, kapitaen: h === I4 };
          if (bj < 0) { o.ersetzt = '–'; o.fuer = ''; o.fuerVorname = ''; o.eignung = null; }
          else {
            var occ = R.kidsPri[bj], pos = pp.slots[bj].pos;
            o.ersetzt = pos; o.fuer = occ ? K[occ - 1].name + (occ === I4 ? ' (C)' : '') : '–';
            o.fuerVorname = occ ? K[occ - 1].vor + (occ === I4 ? ' (C)' : '') : '–';
            o.eignung = c.sc[COLMAP[pos] || pos];
          }
          return o;
        });
      });
    });
    result.nichtEingeplant = K.filter(function (c) { return c.grund; }).map(function (c) { return { name: c.vor, grund: c.grund }; });
    result.einsetzbar = K.filter(function (c) { return c.P === 1; }).length;
    return result;
  }

  function compute(data) {
    var evals = data.players.map(function (p) { return playerEval(p, data.skala); });
    // Ranking (Übersicht M22:R39)
    var keyed = data.players.map(function (p, i) { var g = evals[i].gesamt; return { i: i, key: (!p.name ? -2 : (isNum(g) ? g : -1)) - (i + 5) / 100000 }; });
    keyed.sort(function (a, b) { return b.key - a.key; });
    var ranking = keyed.filter(function (x) { return data.players[x.i].name; }).map(function (x) {
      var g = evals[x.i].gesamt, p = data.players[x.i];
      var rank = isNum(g) ? evals.filter(function (e, j) { return data.players[j].name && isNum(e.gesamt) && e.gesamt > g; }).length + 1 : '–';
      return { rang: rank, idx: x.i, name: p.name, nr: p.nr, gesamt: isNum(g) ? g : null, einsatz: evals[x.i].einsatz, beste: evals[x.i].beste || '–' };
    });
    var L = lineups(data, evals);
    return { evals: evals, ranking: ranking, lineups: L };
  }

  function noteColor(g) {   // Farbstufen wie Übersicht M5:M20
    if (!isNum(g)) return null;
    if (g >= 4.5) return '#1B5E20'; if (g >= 4.25) return '#2E7D32'; if (g >= 4.0) return '#43A047'; if (g >= 3.75) return '#7CB342';
    if (g >= 3.5) return '#C0CA33'; if (g >= 3.25) return '#FDD835'; if (g >= 3.0) return '#FFB300'; if (g >= 2.75) return '#FB8C00';
    if (g >= 2.5) return '#F4511E'; if (g >= 2.0) return '#E53935'; return '#B71C1C';
  }
  function scaleColor(v) {  // Farbskala Übersicht H5:L20: 1 rot – 3 gelb – 5 grün
    if (!isNum(v)) return null;
    var a = [0xEF, 0x9A, 0x9A], b = [0xFF, 0xF5, 0x9D], c = [0x66, 0xBB, 0x6A], t, x, y;
    if (v <= 3) { t = Math.max(0, (v - 1) / 2); x = a; y = b; } else { t = Math.min(1, (v - 3) / 2); x = b; y = c; }
    return 'rgb(' + x.map(function (q, i) { return Math.round(q + (y[i] - q) * t); }).join(',') + ')';
  }

  var api = { STANDARD_PAAR: STANDARD_PAAR, paarFuer: paarFuer, pitchByCode: pitchByCode, PV_POS: PV_POS, POS12: POS12, PRI: PRI, ZROWS: ZROWS, PITCHES: PITCHES, STAMM_LABEL: STAMM_LABEL, xround: xround,
    playerEval: playerEval, posScores: posScores, lineups: lineups, compute: compute, noteColor: noteColor, scaleColor: scaleColor, firstName: firstName, isNum: isNum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PSVEngine = api;
})(this);
