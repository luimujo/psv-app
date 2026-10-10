/* PSV Wesel-Lackhausen Aufstellung – Oberfläche (Version 2.2) */
(function () {
  'use strict';
  var E = window.PSVEngine, M = window.PSVModel, P = window.PSVPraes;
  var KEY = 'psv_kaas_daten_v1';
  var APP_VERSION = '2.5';
  var CLOUD = window.PSVCloud && window.PSVCloud.aktiv() ? window.PSVCloud : null;   // ab 2.0: verschlüsselte Cloud-Synchronisation
  var state = { tab: 'kader', detail: null, sub: null, stId: null, size: '9', form: { '7': '7A', '9': '9A' }, kaderSort: 'nr', bwAlle: false, benchAlle: false, rkMode: 'note', sheet: null };
  var data, R;
  var POS_ALL = ['TW', 'IV', 'LV', 'RV', '6', '8', '10', 'LM', 'RM', 'LA', 'RA', 'ST', 'HS'];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v) { return E.isNum(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '–'; }
  function fmt1(v) { return E.isNum(v) ? v.toFixed(1).replace('.', ',') : '–'; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function toast(t) { var el = $('#toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.add('hidden'); }, 2600); }
  function isLight(hex) { return ['#C0CA33', '#FDD835', '#FFB300', '#7CB342'].indexOf(hex) >= 0; }
  function badge(g, big) {
    var c = E.noteColor(g);
    if (!c) return '<span class="badge lt" style="background:#e0e0e0">–</span>';
    return '<span class="badge' + (isLight(c) ? ' lt' : '') + '" style="background:' + c + (big ? ';font-size:18px;height:36px;min-width:54px' : '') + '">' + fmt1(g) + '</span>';
  }
  function ausrichtung(p) {
    var s = p.stamm;
    if (!s) return ['', ''];
    if (s === 'TW') return ['Torwart', 'tw'];
    if (['IV', 'LV', 'RV'].indexOf(s) >= 0) return ['Defensiv', 'def'];
    if (s === '6') return ['Defensives Mittelfeld', 'mid'];
    if (s === '8') return ['Zentrales Mittelfeld', 'mid'];
    return ['Offensiv', 'of'];
  }
  function trendIcon(t) { if (!t) return ''; return { steigend: '↑', fallend: '↓', stabil: '→' }[t.richtung]; }
  function trendCls(t) { return !t ? '' : (t.richtung === 'steigend' ? 'up' : (t.richtung === 'fallend' ? 'down' : 'flat')); }

  // ---------- Web-Plattform (ab 2.2 PWA): Ersatz für die Android-Brücke ----------
  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function webDownload(name, blob) {   // iOS: Teilen-Blatt („In Dateien sichern“), sonst Download
    try {
      if (IOS && navigator.canShare && window.File) { var f = new File([blob], name, { type: blob.type }); if (navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: name }).catch(function () { }); return; } }
    } catch (e) { }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1500);
  }
  function webDrucken(html) {   // Drucken / „Als PDF sichern“ ohne Pop-up (funktioniert auch als Home-Bildschirm-App)
    var alt = document.getElementById('druckFrame'); if (alt) alt.remove();
    var f = document.createElement('iframe'); f.id = 'druckFrame'; f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f); var d = f.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Drucken nicht möglich'); } }, 400);
  }
  function webTeilenText(titel, txt) {
    if (navigator.share) { navigator.share({ title: titel, text: txt }).catch(function () { }); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Text kopiert'); }, function () { toast('Kopieren nicht möglich'); });
  }
  function pById(id) { for (var i = 0; i < data.players.length; i++) if (data.players[i].id === id) return data.players[i]; return null; }
  function vorn(id) { var p = pById(id); return p ? E.firstName(p.name) : '–'; }
  function segHtml(id, val, opts, cls) { return '<div class="seg' + (cls ? ' ' + cls : '') + '" id="' + id + '">' + opts.map(function (o) { return '<button data-v="' + esc(o[0]) + '" class="' + (String(val) === String(o[0]) ? 'on' : '') + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function bindSeg(id, fn) { $$('#' + id + ' button').forEach(function (b) { b.addEventListener('click', function () { $$('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x === b); }); fn(b.getAttribute('data-v')); }); }); }
  function sel(id, val, opts, extra) { return '<select id="' + id + '"' + (extra || '') + '>' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>'; }

  function initialen(name) { var w = String(name || '?').trim().split(/\s+/); return ((w[0] || '?').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : '')).toUpperCase(); }
  var AV_FARBEN = ['#1B5E20', '#00695C', '#283593', '#6A1B9A', '#AD1457', '#E65100', '#4E342E', '#37474F'];
  function avatar(p, cls) {   // rundes Foto bzw. Initialen
    if (!p) return '<span class="av ' + (cls || '') + ' leer">–</span>';
    if (p.foto) return '<span class="av ' + (cls || '') + '"><img src="' + esc(p.foto) + '" alt="" draggable="false"></span>';
    return '<span class="av ini ' + (cls || '') + '" style="background:' + AV_FARBEN[(+p.id || 0) % AV_FARBEN.length] + '">' + esc(initialen(p.name)) + '</span>';
  }
  function istKapitaen(st, p) { var k = st && st.settings ? st.settings.kapitaen : ''; return !!(k && p && p.name && (E.firstName(p.name) === k || p.name === k)); }
  // Ziehen per Pointer-Events (funktioniert mit Finger im Android-WebView, kein HTML5-DnD)
  function bindDnD(root, onDrop, onTap) {
    root.addEventListener('pointerdown', function (e) {
      var t = e.target.closest('[data-drag]'); if (!t || !root.contains(t) || (e.button !== undefined && e.button > 0)) return;
      var src = t.getAttribute('data-drag'), sx = e.clientX, sy = e.clientY, ghost = null, over = null, pid = e.pointerId;
      try { t.setPointerCapture(pid); } catch (x) { }
      function find(x, y) { if (ghost) ghost.style.display = 'none'; var el = document.elementFromPoint(x, y); if (ghost) ghost.style.display = ''; return el ? el.closest('[data-drop]') : null; }
      function move(ev) {
        if (ev.pointerId !== pid) return;
        if (!ghost) {
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 8) return;
          ghost = t.cloneNode(true); ghost.classList.add('ghost'); ghost.removeAttribute('data-drop'); document.body.appendChild(ghost); t.classList.add('dragging');
        }
        ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
        var d = find(ev.clientX, ev.clientY); if (d !== over) { if (over) over.classList.remove('over'); over = d; if (d) d.classList.add('over'); }
        ev.preventDefault();
      }
      function end(ev, abbruch) {
        if (ev.pointerId !== pid) return;
        t.removeEventListener('pointermove', move); t.removeEventListener('pointerup', up); t.removeEventListener('pointercancel', cancel);
        if (over) over.classList.remove('over'); t.classList.remove('dragging');
        if (ghost) { ghost.remove(); if (!abbruch && over) onDrop(src, over.getAttribute('data-drop')); }
        if (ghost) root._dragEnde = Date.now();
      }
      function up(ev) { end(ev, false); }
      function cancel(ev) { end(ev, true); }
      t.addEventListener('pointermove', move); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', cancel);
    });
    // Antippen über das normale click-Ereignis (sonst schließt der nachfolgende Klick ein gerade geöffnetes Blatt)
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-drag]'); if (!t || !onTap) return;
      if (root._dragEnde && Date.now() - root._dragEnde < 400) return;
      onTap(t.getAttribute('data-drag'));
    });
  }
  function fotoVerkleinern(file, fn) { var r = new FileReader(); r.onload = function () { fotoVerkleinernUrl(r.result, fn); }; r.readAsDataURL(file); }
  function fotoVerkleinernUrl(src, fn) {   // Galeriefoto → quadratisch 192 px JPEG (Data-URL)
    (function () {
      var img = new Image();
      img.onload = function () {
        var n = 192, c = document.createElement('canvas'); c.width = n; c.height = n;
        var s = Math.min(img.width, img.height), g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, n, n);
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, n, n);
        fn(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { toast('Bild konnte nicht gelesen werden'); };
      img.src = src;
    })();
  }

  // ---------- Daten ----------
  function normalize(d) {
    var def = clone(window.PSV_DEFAULT);
    d = M.migrate(d);
    d.skala = d.skala || def.skala; d.skala.weights = Object.assign({}, def.skala.weights, d.skala.weights || {});
    if (!E.isNum(d.skala.ausdauerGewicht)) d.skala.ausdauerGewicht = def.skala.ausdauerGewicht;
    d.taktiken = Array.isArray(d.taktiken) ? d.taktiken : [];   // ab 2.2
    d.labels = d.labels || def.labels; d.zones = d.zones || def.zones;
    if (!E.isNum(d.settings.bonusStamm)) d.settings.bonusStamm = def.settings.bonusStamm;
    if (!E.isNum(d.settings.bonusAlt)) d.settings.bonusAlt = def.settings.bonusAlt;
    d.players.forEach(function (p) {
      p.typ = p.typ === 'TW' ? 'TW' : 'Feld';
      p.skills = p.skills || {}; p.notes = p.notes || {}; p.eignung = p.eignung || {}; p.form = p.form || [null, null, null, null];
      ['name', 'stamm', 'alt', 'fuss', 'hinweis'].forEach(function (k) { if (p[k] === null || p[k] === undefined) p[k] = ''; });
      if (typeof p.foto !== 'string' || p.foto.indexOf('fotos/') === 0) p.foto = '';   // ab 2.0 keine mitgelieferten Fotos mehr (über „Fotos aus Datei übernehmen“ wiederherstellbar)
      p.verfuegbarkeit = p.verfuegbarkeit || 'Fit'; p.darfVoll = p.darfVoll || 'Ja'; p.aufbau = p.aufbau || 'Nein';
    });
    d.quelle = d.quelle || def.quelle;
    return d;
  }
  function load() {
    if (CLOUD) { data = normalize(clone(window.PSV_DEFAULT)); return; }   // Cloud: Daten kommen nach Anmeldung + Team-Passwort
    try { var s = localStorage.getItem(KEY); if (s) { data = normalize(JSON.parse(s)); korrekturMelden(); return; } } catch (e) { console.warn('Gespeicherte Daten unlesbar, Werkstand geladen', e); }
    data = normalize(clone(window.PSV_DEFAULT)); korrekturMelden();
  }
  function korrekturMelden() {   // ab 1.7: einmalige Korrekturen sofort speichern und einmal melden
    var K = data.korrekturen || {}, neu = Object.keys(K).filter(function (k) { return K[k] && K[k].gemeldet === false; });
    if (!neu.length) return;
    neu.forEach(function (k) { K[k].gemeldet = true; }); save();
    setTimeout(function () { toast('Korrigiert: ' + neu.map(function (k) { return K[k].titel || k; }).join(', ')); }, 400);
  }
  function korrekturVon(st) { var K = data.korrekturen || {}; for (var k in K) if (K[k] && K[k].stId === st.id && K[k].angewandt) return K[k]; return null; }
  function owChip(st) { return st.ohneWertung ? '<span class="chip ow">ohne Wertung</span>' : ''; }
  function save() { data.geaendert = new Date().toISOString(); data.appVersion = APP_VERSION; if (CLOUD) { CLOUD.lokalGeaendert(); return; } try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { toast('Speichern fehlgeschlagen'); } }
  function recalc() { R = M.berechne(data); }
  function commit() { save(); recalc(); }
  function aktiv() { return M.aktiver(data); }
  function setAktiv(id) { data.aktiverSpieltag = id; var st = aktiv(); if (st && st.groesse) state.size = st.groesse; commit(); }

  // ---------- Navigation ----------
  function setTab(t) { if (!impVerlassen(function () { setTab(t); })) return; if (!tkVerlassen(function () { setTab(t); })) return; state.tk = null; state.tab = t; state.detailZurueck = null; state.zsZurueck = null; state.gegnerZurueck = null; state.detail = null; state.sub = null; state.sheet = null; render(); window.scrollTo(0, 0); }
  function go(sub, extra) { state.sub = sub; state.sheet = null; if (extra) Object.assign(state, extra); render(); window.scrollTo(0, 0); }
  window.appBack = function () {
    if ($('#impModal')) { $('#impModal').remove(); return true; }
    if (!impVerlassen(function () { window.appBack(); })) return true;
    if (!tkVerlassen(function () { window.appBack(); })) return true;
    if (state.sub === 'taktik') { state.tk = null; state.sub = state.tkZurueck || null; state.tkZurueck = null; render(); window.scrollTo(0, 0); return true; }
    if (state.praesOffen) { praesSchliessen(); return true; }
    if (state.sheet) { closeSheet(); return true; }
    if (state.detail !== null) { state.detail = null; if (state.detailZurueck) { state.sub = state.detailZurueck; state.detailZurueck = null; } render(); return true; }
    if (state.zsZurueck && ['zusammenfassung', 'spieltag'].indexOf(state.sub) >= 0) { state.sub = state.zsZurueck; state.zsZurueck = null; render(); window.scrollTo(0, 0); return true; }
    if (state.sub === 'gegner') { var gz = state.gegnerZurueck; state.gegnerZurueck = null; if (gz) { state.tab = gz.tab; state.sub = gz.sub; state.stId = gz.stId; } else state.sub = 'gegnerListe'; render(); window.scrollTo(0, 0); return true; }
    if (['bewertung', 'spiel', 'live', 'zusammenfassung'].indexOf(state.sub) >= 0) { state.sub = 'spieltag'; render(); window.scrollTo(0, 0); return true; }
    if (state.sub === 'messVerlauf' && E.isNum(state.mvZurueck)) { state.sub = null; state.detail = state.mvZurueck; state.mvZurueck = null; render(); return true; }
    if (state.sub === 'testEdit') { state.sub = 'messKatalog'; render(); return true; }
    if (state.sub) { state.sub = null; render(); return true; }
    if (state.tab !== 'kader') { setTab('kader'); return true; }
    return false;
  };
  $$('#tabs button').forEach(function (b) { b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); }); });
  $('#backBtn').addEventListener('click', function () { window.appBack(); });
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  function render() {
    document.body.classList.toggle('tk-modus', state.sub === 'taktik' && !!state.tk);
    if (state.sub === 'taktik' && !state.tk) state.sub = 'taktiken';
    if (!(state.tab === 'liga' && state.detail === null && !state.sub)) ligaAus();
    $$('#tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === state.tab); });
    var v = $('#view'), back = state.detail !== null || !!state.sub;
    v.onclick = null; v.onchange = null;
    $('#backBtn').classList.toggle('hidden', !back);
    var st = aktiv();
    if (state.detail !== null) { v.innerHTML = viewDetail(state.detail); bindDetail(); setTitle(data.players[state.detail].archiviert ? 'Ehemaliger Spieler' : 'Spieler bearbeiten', data.players[state.detail].name || 'Neuer Spieler'); return; }
    var stTitel = function () { return M.titel(M.getSpieltag(data, state.stId)); };
    var subs = {
      sicherungen: [function () { return CLOUD ? CLOUD.sicherungenView() : ''; }, function () { if (CLOUD) CLOUD.sicherungenBind(); }, 'Sicherungen', function () { return 'Versionsverlauf · verschlüsselt'; }],
      cloud: [function () { return window.PSVCloud ? window.PSVCloud.view() : ''; }, function () { if (window.PSVCloud) window.PSVCloud.bind(); }, 'Cloud & Team', function () { var s = CLOUD ? CLOUD.statusInfo() : null; return s ? (s.icon + ' ' + s.text) : ''; }],
      datenschutz: [function () { return '<div class="card cl-ds">' + (window.PSVCloud ? window.PSVCloud.datenschutzHtml() : '<h2>Datenschutz</h2><p><b>Wetter:</b> Für „Wetter zur Spielzeit“ werden nur die Platz-Koordinaten an die Bright Sky API (Daten des Deutschen Wetterdienstes) übertragen, die Adresssuche nutzt OpenStreetMap Nominatim – keine Kinderdaten.</p>') + '<p class="muted">' + kkCopy() + '</p></div>'; }, function () { }, 'Datenschutz', ''],
      encExp: [viewEncExp, bindEncExp, 'Verschlüsselt exportieren', ''],
      taktik: [viewTaktik, bindTaktik, 'Taktiktafel', tkTitel],
      taktiken: [viewTaktiken, bindTaktiken, 'Taktiktafeln', function () { return T.liste(data).length + ' gespeichert · verschlüsselt synchronisiert'; }],
      spImport: [viewSpImport, bindSpImport, 'SpielerPlus importieren', function () { return state.imp ? (state.imp.dateiname || 'Zusagen übernehmen') : 'Zusagen übernehmen'; }],
      zonen: [viewZonen, bindZonen, 'Positions-Zonen', 'Erlaubte Positionen und Abzug'],
      gewichte: [viewGewichte, bindGewichte, 'Gewichtung', 'Skala der Gesamtnote'],
      info: [viewInfo, function () { }, 'So entsteht der Vorschlag', ''],
      ehemalige: [viewEhemalige, bindEhemalige, 'Ehemalige Spieler', function () { return M.ehemaligeSpieler(data).length + ' archiviert · bleiben in allen Spieltagen erhalten'; }],
      paste: [viewPaste, bindPaste, 'Import', 'Text einfügen'],
      neu: [viewNeu, bindNeu, 'Neuer Spieltag', 'Zusagen werden vom letzten Spieltag übernommen'],
      spieltag: [viewSpieltagDetail, bindSpieltagDetail, 'Spieltag', stTitel],
      bewertung: [viewBewertung, bindBewertung, 'Spielbewertung', stTitel],
      spiel: [viewSpiel, bindSpiel, 'Spielbericht', stTitel],
      live: [viewLive, bindLive, 'Live-Spiel', stTitel],
      zusammenfassung: [viewZusammenfassung, bindZusammenfassung, 'Spielzusammenfassung', stTitel],
      messNeu: [viewMessNeu, bindMessNeu, 'Neuer Messtermin', 'Tests auswählen'],
      messTermin: [viewMessTermin, bindMessTermin, 'Messtermin', function () { var m = M.messungById(data, state.messId); return m ? M.fmtDatum(m.datum) + (m.titel ? ' · ' + m.titel : '') : ''; }],
      messVerlauf: [viewMessVerlauf, bindMessVerlauf, 'Messverlauf', function () { var p = pById(state.mvPid); return p ? p.name : ''; }],
      messKatalog: [viewMessKatalog, bindMessKatalog, 'Testkatalog', function () { return data.messkatalog.length + ' Tests · Bänder und Zuordnung änderbar'; }],
      praes: [viewPraes, bindPraes, 'Präsentation', 'Für Mannschafts- und Trainerbesprechung'],
      gegnerListe: [viewGegnerListe, bindGegnerListe, 'Gegner-Datei', function () { return (data.gegner || []).length + ' Gegner · Direktvergleich und Notizen'; }],
      gegner: [viewGegner, bindGegner, 'Gegner', function () { var g = M.gegnerById(data, state.gegnerId); return g ? g.name : ''; }],
      testEdit: [viewTestEdit, bindTestEdit, 'Test bearbeiten', function () { var t = M.testById(data, state.testId); return t ? t.name : ''; }]
    };
    if (state.sub && subs[state.sub]) {
      if (['spieltag', 'bewertung', 'spiel', 'live', 'zusammenfassung'].indexOf(state.sub) >= 0 && !M.getSpieltag(data, state.stId)) { state.sub = null; return render(); }
      var s = subs[state.sub]; v.innerHTML = s[0](); s[1](); setTitle(s[2], typeof s[3] === 'function' ? s[3]() : s[3]); return;
    }
    var f = { kader: viewKader, ranking: viewRanking, spieltag: viewSpieltage, liga: viewLiga, aufstellung: viewAufstellung, messungen: viewMessungen, mehr: viewMehr }[state.tab];
    v.innerHTML = f();
    ({ kader: bindKader, ranking: bindRanking, spieltag: bindSpieltage, liga: bindLiga, aufstellung: bindAufstellung, messungen: bindMessungen, mehr: bindMehr })[state.tab]();
    setTitle('Kaderkompass', { kader: 'Kader · ' + named().length + ' Kinder', ranking: state.rkMode === 'saison' ? 'Saison-Statistik' : 'Ranking nach Gesamtnote', spieltag: 'Spieltage · ' + data.spieltage.length, messungen: 'Messungen · ' + data.messungen.length + ' Termin' + (data.messungen.length === 1 ? '' : 'e'), aufstellung: st ? M.titel(st) : 'Kein Spieltag', mehr: 'Daten & Einstellungen', liga: 'Liga · D-Junioren Kreisliga B, Gr. 6' }[state.tab]);
  }
  var TEAM_NAME = 'PSV Wesel-Lackhausen';   // Team-Kontext (Vereinsname bleibt Teamdaten)
  function teamName() { try { var t = window.PSVCloud && PSVCloud.teamName && PSVCloud.teamName(); return t || TEAM_NAME; } catch (e) { return TEAM_NAME; } }
  function setTitle(t, s) { $('#title').textContent = t; $('#subtitle').textContent = t === 'Kaderkompass' ? teamName() + (s ? ' · ' + s : '') : (s || ''); }
  function named() { return data.players.map(function (p, i) { return i; }).filter(function (i) { return data.players[i].name && !data.players[i].archiviert; }); }   // aktueller Kader (ohne ehemalige)
  function ehemaligeIn(st) { return M.ehemaligeSpieler(data).filter(function (p) { return M.beteiligt(st, p.id); }).map(function (p) { return p.id; }); }

  // ---------- Auswahl-Blatt (Bottom-Sheet) ----------
  function openSheet(html, bind) {
    closeSheet(true);
    var bg = document.createElement('div'); bg.className = 'sheetbg'; bg.id = 'sheetbg';
    bg.innerHTML = '<div class="sheet" id="sheet"><div class="grab"></div>' + html + '</div>';
    document.body.appendChild(bg); state.sheet = true;
    bg.addEventListener('click', function (e) { if (e.target === bg) closeSheet(); });
    bind($('#sheet'));
  }
  function closeSheet(silent) { var bg = $('#sheetbg'); if (bg) bg.remove(); state.sheet = null; }
  function pickGrid(name, ids, selected, extra) {   // Spieler-Auswahl als Kachelraster
    return '<div class="pick" data-name="' + name + '">' + (extra || '') + ids.map(function (id) { var p = pById(id); if (!p) return ''; return '<button data-v="' + id + '" class="' + (selected === id ? 'on' : '') + '"><b>' + esc(p.nr === null ? '–' : p.nr) + '</b>' + esc(E.firstName(p.name)) + '</button>'; }).join('') + '</div>';
  }
  function bindPick(root, name, fn) {
    var g = $('.pick[data-name="' + name + '"]', root);
    g.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $$('button', g).forEach(function (x) { x.classList.toggle('on', x === b); }); var v = b.getAttribute('data-v'); fn(v === '' ? null : +v); });
  }
  function stepper(id, val, ph) { return '<div class="stepper"><button data-step="-5" data-for="' + id + '">−5</button><button data-step="-1" data-for="' + id + '">−1</button><input type="number" id="' + id + '" value="' + (E.isNum(val) ? val : '') + '" placeholder="' + (ph || 'Min.') + '"><button data-step="1" data-for="' + id + '">+1</button><button data-step="5" data-for="' + id + '">+5</button></div>'; }
  function bindStepper(root, max) {
    $$('[data-step]', root).forEach(function (b) { b.addEventListener('click', function () { var inp = $('#' + b.getAttribute('data-for')); var v = parseFloat(inp.value); if (!E.isNum(v)) v = 0; v = Math.max(0, Math.min(max || 120, v + +b.getAttribute('data-step'))); inp.value = v; }); });
  }
  function numVal(id) { var v = parseFloat(($('#' + id) || {}).value); return E.isNum(v) ? v : null; }

  // ---------- Kader ----------
  function viewKader() {
    var idx = named();
    if (state.kaderSort === 'note') idx.sort(function (a, b) { return (R.evals[b].gesamt || -1) - (R.evals[a].gesamt || -1) || a - b; });
    else if (state.kaderSort === 'name') idx.sort(function (a, b) { return data.players[a].name.localeCompare(data.players[b].name, 'de'); });
    else idx.sort(function (a, b) { return (Number(data.players[a].nr) || 999) - (Number(data.players[b].nr) || 999); });
    var h = '<div class="seg small" id="sortSeg" style="margin-bottom:10px">' + [['nr', 'Trikot'], ['name', 'Name'], ['note', 'Gesamtnote']].map(function (x) { return '<button data-s="' + x[0] + '" class="' + (state.kaderSort === x[0] ? 'on' : '') + '">Sortieren: ' + x[1] + '</button>'; }).join('') + '</div>';
    h = '<button class="btn big" id="addNeu">+ Neuer Spieler</button>' + h + '<div class="plist">';
    idx.forEach(function (i) {
      var p = data.players[i], ev = R.evals[i], a = ausrichtung(p), af = M.autoForm(data, p.id), vs = M.vorschlaege(data, p.id).filter(function (v) { return !v.ignoriert; });
      h += '<div class="card" data-i="' + i + '"><div class="row"><span class="avwrap">' + avatar(p, 'm' + (p.typ === 'TW' ? ' tw' : '')) + '<span class="nr mini' + (p.typ === 'TW' ? ' tw' : '') + '">' + esc(p.nr === null ? '–' : p.nr) + '</span></span>' +
        '<div class="grow"><div class="pname">' + esc(p.name) + (R.lineups.kapitaenNr === i + 1 ? ' <span class="cpt">C</span>' : '') + '</div>' +
        '<div class="chips"><span class="chip">' + esc(p.stamm || '–') + (p.alt ? ' / ' + esc(p.alt) : '') + '</span>' +
        (a[0] ? '<span class="chip ' + a[1] + '">' + a[0] + '</span>' : '') +
        (p.groesse ? '<span class="chip">ca. ' + esc(p.groesse) + ' cm</span>' : '') +
        (p.verfuegbarkeit !== 'Fit' ? '<span class="chip off">' + esc(p.verfuegbarkeit) + '</span>' : '') +
        (vs.length ? '<span class="chip tip">💡 ' + vs.length + ' Vorschlag' + (vs.length > 1 ? 'e' : '') + '</span>' : '') + '</div></div>' + badge(ev.gesamt) + '</div>' +
        '<div class="cats">' + catsHtml(ev, p, af) + '</div></div>';
    });
    var nEhem = M.ehemaligeSpieler(data).length;
    h += '</div><button class="btn sec" id="addNeu2">+ Neuer Spieler</button><button class="btn sec" id="ehemBtn">Ehemalige Spieler' + (nEhem ? ' (' + nEhem + ')' : '') + '</button>';
    h += '<div class="card"><div class="muted">Farben der Gesamtnote</div><div class="legend">' + [4.5, 4.25, 4, 3.75, 3.5, 3.25, 3, 2.75, 2.5, 2, 1.5].map(function (g, k) {
      var lab = ['≥ 4,5', '4,3–4,4', '4,0–4,2', '3,8–3,9', '3,5–3,7', '3,3–3,4', '3,0–3,2', '2,8–2,9', '2,5–2,7', '2,0–2,4', '< 2,0'][k];
      var c = E.noteColor(g); return '<span style="background:' + c + (isLight(c) ? ';color:#222' : '') + '">' + lab + '</span>'; }).join('') + '</div></div>';
    return h;
  }
  function bindKader() {
    $$('.plist .card').forEach(function (c) { c.addEventListener('click', function () { state.detail = +c.getAttribute('data-i'); render(); window.scrollTo(0, 0); }); });
    $$('#sortSeg button').forEach(function (b) { b.addEventListener('click', function () { state.kaderSort = b.getAttribute('data-s'); render(); }); });
    function neu() {
      openSheet('<h3>Neuer Spieler</h3><div class="muted">Danach öffnet sich der Spielerbogen: Name, Trikotnummer, Größe, Stamm-/Alternativposition, starker Fuß, Verfügbarkeit, alle Noten 1–5 mit Notizen, Positionseignung und Foto.</div>' +
        '<div class="evtypes"><button id="addFeld">⚽ Feldspieler</button><button id="addTW">🧤 Torhüter</button></div>', function (root) {
        $('#addFeld', root).addEventListener('click', function () { closeSheet(); addPlayer('Feld'); });
        $('#addTW', root).addEventListener('click', function () { closeSheet(); addPlayer('TW'); });
      });
    }
    $('#ehemBtn').addEventListener('click', function () { go('ehemalige'); });
    $('#addNeu').addEventListener('click', neu); $('#addNeu2').addEventListener('click', neu);
  }
  function addPlayer(typ) {
    var i = -1;
    data.players.forEach(function (p, k) { if (i < 0 && !p.name && p.typ === typ) i = k; });
    if (i < 0) {
      var maxId = data.players.reduce(function (m, p) { return Math.max(m, p.id); }, 0);
      data.players.push({ id: maxId + 1, typ: typ, name: '', nr: null, stamm: typ === 'TW' ? 'TW' : '', alt: '', fuss: '', verfuegbarkeit: 'Fit', form: [null, null, null, null], darfVoll: 'Ja', aufbau: 'Nein', freigabe: 'Ja', skills: {}, notes: {}, eignung: {}, hinweis: '' });
      i = data.players.length - 1;
    }
    var p = data.players[i];
    p.name = typ === 'TW' ? 'Neuer Torhüter' : 'Neuer Spieler'; p.foto = ''; state.neuAngelegt = true;
    var st = aktiv(); if (st && st.status !== 'abgeschlossen') st.zusagen[p.id] = 'Offen';
    commit(); state.detail = i; window.scrollTo(0, 0); render();
  }

  // ---------- Spieler-Detail ----------
  function rateBtns(key, val) {
    var h = '<div class="rate" data-k="' + key + '">';
    for (var n = 1; n <= 5; n++) { var on = val === n; h += '<button data-v="' + n + '" class="' + (on ? 'on' : '') + '"' + (on ? ' style="background:' + E.scaleColor(n) + '"' : '') + '>' + n + '</button>'; }
    return h + '<button data-v="" class="clr" title="leer">✕</button></div>';
  }
  function catsHtml(ev, p, af) {
    if (af === undefined) af = p ? M.autoForm(data, p.id) : null;
    return [['Technik', ev.technik], ['Taktik', ev.taktik], ['Athletik', ev.athletik], ['Mental', ev.mental], ['Form', ev.form]].map(function (c) {
      var tr = (c[0] === 'Form' && af && af.trend) ? ' <span class="tr ' + trendCls(af.trend) + '">' + trendIcon(af.trend) + '</span>' : '';
      return '<div class="cat" style="background:' + (E.scaleColor(c[1]) || '#f1f1f1') + '">' + c[0] + '<b>' + fmt1(c[1]) + tr + '</b></div>'; }).join('');
  }
  function kvHtml(ev) { return '<div>Einsatz</div><div>' + esc(ev.einsatz || '–') + '</div><div>Minuten</div><div>' + esc(ev.minuten || '–') + '</div><div>Beste Position</div><div>' + esc(ev.beste || '–') + '</div><div>Fit Stamm</div><div>' + (E.isNum(ev.fitStamm) ? ev.fitStamm : '–') + '</div>'; }
  function vorschlagHtml(p) {
    var vs = M.vorschlaege(data, p.id), offen = vs.filter(function (v) { return !v.ignoriert; }), ign = vs.length - offen.length;
    if (!vs.length) return '';
    var h = '<div class="card" id="vsCard"><h2>💡 Vorschläge aus Spielbewertungen und Messungen</h2>';
    var QL = { spiele: ['Spiele', ''], messung: ['Messung', 'def'], kombiniert: ['Messung + Spiele', 'of'] };
    offen.forEach(function (v) {
      var q = QL[v.quelle] || QL.spiele;
      h += '<div class="vs" data-vsrow="' + esc(v.row) + '"><div><span class="chip ' + q[1] + '">' + q[0] + '</span> ' + esc(v.text) + '</div><div class="row" style="margin-top:6px"><button class="btn small" data-vs="ok" data-row="' + esc(v.row) + '">Übernehmen</button><button class="btn small sec" data-vs="ign" data-row="' + esc(v.row) + '">Ignorieren</button></div></div>';
    });
    if (!offen.length) h += '<div class="muted">Keine offenen Vorschläge.</div>';
    if (ign) h += '<div class="muted" style="margin-top:6px">' + ign + ' ignoriert – erscheint wieder, sobald neue Bewertungen den Schnitt ändern.</div>';
    return h + '<div class="muted" style="margin-top:6px">Grundwerte werden nie automatisch geändert.</div></div>';
  }
  function formHtml(p, ev) {
    var af = M.autoForm(data, p.id);
    var h = '<div class="card" id="formCard"><h2>Form <span class="muted" id="gv_Form">Ø ' + fmt1(ev.form) + '</span></h2>';
    if (af) {
      h += '<div><b>Automatisch aus ' + af.anzahl + ' Spiel' + (af.anzahl > 1 ? 'en' : '') + ': ' + fmt1(af.form) + '</b>' +
        (af.trend ? ' <span class="tr ' + trendCls(af.trend) + '">' + trendIcon(af.trend) + ' ' + af.trend.richtung + '</span>' : '') + '</div>';
      h += '<div class="spark">' + af.spiele.map(function (s) {
        return '<div class="sb"><div class="bar" style="height:' + Math.round((s.wert / 5) * 56) + 'px;background:' + E.scaleColor(s.wert) + '"></div><div class="v">' + fmt1(s.wert) + '</div><div class="d">' + esc(M.fmtDatum(s.datum).slice(0, 6)) + (E.isNum(s.minuten) ? '<br>' + s.minuten + '′' : '') + '</div></div>';
      }).join('') + '</div>';
      h += '<div class="muted">Neuestes Spiel zählt am meisten (1 · 0,8 · 0,6 · 0,4 · 0,2), kurze Einsätze weniger. Spiel 1–3 der Form werden durch diesen Wert ersetzt; die Trainingsbeteiligung zählt weiter.</div>';
    } else h += '<div class="muted">Noch keine Spielbewertung – es gilt die manuelle Form.</div>';
    ['Spiel 1 (ältestes)', 'Spiel 2', 'Spiel 3 (letztes)', 'Trainingsbeteiligung'].forEach(function (l, k) { h += '<div class="skill' + (af && k < 3 ? ' dim' : '') + '"><div class="lbl">' + l + (af && k < 3 ? ' <span class="muted">(manuell, ruht)</span>' : '') + '</div>' + rateBtns('f' + k, E.isNum(p.form[k]) ? p.form[k] : null) + '</div>'; });
    return h + '</div>';
  }
  function saisonHtml(p) {
    var s = M.saison(data)[p.id]; if (!s) return '';
    var cells = [['Spiele', s.spiele], ['Startelf', s.startelf], ['Minuten', s.minuten], ['Tore', s.tore], ['Assists', s.assists], ['Abwehrfehler', s.fehler], ['Einwechsl.', s.einwechslungen]];
    return '<div class="card"><h2>Saison (alle Spieltage)</h2><div class="stats">' + cells.map(function (c) { return '<div><b>' + c[1] + '</b><span>' + c[0] + '</span></div>'; }).join('') + '</div></div>';
  }
  function viewDetail(i) {
    var p = data.players[i], ev = R.evals[i], lab = data.labels[p.typ], sc = E.posScores(p), a = ausrichtung(p);
    var h = (p.archiviert ? '<div class="warnbox">Ehemaliger Spieler – nicht im aktuellen Kader. Vergangene Spieldaten bleiben erhalten. <button class="btn small" id="restTop">Wiederherstellen</button></div>' : '') + '<div class="card"><div class="row"><span class="avwrap" id="dAv">' + avatar(p, 'l' + (p.typ === 'TW' ? ' tw' : '')) + '<span class="nr mini' + (p.typ === 'TW' ? ' tw' : '') + '">' + esc(p.nr === null ? '–' : p.nr) + '</span></span><div class="grow"><div class="pname">' + esc(p.name) + '</div><div class="muted">' + (p.typ === 'TW' ? 'Torhüter' : 'Feldspieler') + (a[0] ? ' · ' + a[0] : '') + '</div></div><div id="dGes">' + badge(ev.gesamt, true) + '</div></div>';
    h += '<div class="cats" id="dCats">' + catsHtml(ev, p) + '</div><div class="kv" style="margin-top:10px" id="dKv">' + kvHtml(ev) + '</div></div>';
    h += '<div id="vsWrap">' + vorschlagHtml(p) + '</div><div id="formWrap">' + formHtml(p, ev) + '</div>' + saisonHtml(p) + messKarteHtml(p);
    h += '<div class="card"><h2>Foto</h2><div class="row"><span id="fotoPrev">' + avatar(p, 'l') + '</span><div class="grow"><button class="btn small" id="fotoWahl">Foto aus Galerie wählen</button>' +
      (p.foto ? ' <button class="btn small sec" id="fotoWeg">Foto entfernen</button>' : '') + '' +
      '</div></div><div class="muted" style="margin-top:6px">Wird auf 192 × 192 Pixel verkleinert und nur auf diesem Gerät bzw. im Export gespeichert. Ohne Foto erscheinen die Initialen.</div><input type="file" id="fotoIn" accept="image/*" class="hidden"></div>';
    h += '<div class="card"><h2>Stammdaten</h2><label class="f">Name</label><input type="text" id="fName" value="' + esc(p.name) + '">' +
      '<div class="grid2"><div><label class="f">Trikotnummer</label><input type="number" id="fNr" value="' + esc(p.nr === null ? '' : p.nr) + '"></div>' +
      '<div><label class="f">Größe ca. (cm)</label><input type="number" id="fGr" value="' + esc(p.groesse || '') + '"></div>' +
      '<div><label class="f">Jahrgang</label><input type="number" id="fJg" inputmode="numeric" placeholder="z. B. 2016" value="' + esc(p.jahrgang || '') + '"></div>' +
      '<div><label class="f">Altersklasse (Messungen)</label><div class="ro" id="fAk">' + esc(M.altersklasse(data, p)) + (p.jahrgang ? '' : ' (Team-Vorgabe)') + '</div></div>' +
      '<div><label class="f">Stammposition</label>' + sel('fStamm', p.stamm, [''].concat(POS_ALL)) + '</div>' +
      '<div><label class="f">Alternativposition</label>' + sel('fAlt', p.alt, [''].concat(POS_ALL)) + '</div>' +
      '<div><label class="f">Starker Fuß</label>' + sel('fFuss', p.fuss, [['', '–'], 'Rechts', 'Links', 'Beidfüßig']) + '</div>' +
      '<div><label class="f">Verfügbarkeit</label>' + sel('fVerf', p.verfuegbarkeit, ['Fit', 'Angeschlagen', 'Verletzt', 'Abwesend']) + '</div>' +
      '<div><label class="f">Darf voll spielen</label>' + sel('fVoll', p.darfVoll, ['Ja', 'Nein']) + '</div>' +
      '<div><label class="f">Nach Verletzung im Aufbau</label>' + sel('fAufb', p.aufbau, ['Nein', 'Ja']) + '</div></div>' +
      '<div class="muted" style="margin-top:6px">Ausrichtung (offensiv/defensiv) ergibt sich aus Stamm- und Alternativposition; die Tabelle „Positions-Zonen“ (Mehr) legt fest, wohin ein Kind ausweichen darf.</div></div>';
    [['Technik', 16, 23], ['Taktik', 25, 31], ['Athletik', 33, 37], ['Mental', 39, 43]].forEach(function (g) {
      h += '<div class="card"><h2>' + g[0] + ' <span class="muted" id="gv_' + g[0] + '">Ø ' + fmt1(ev[g[0].toLowerCase()]) + '</span></h2>';
      for (var r = g[1]; r <= g[2]; r++) {
        var v = p.skills[String(r)], extra = (p.typ !== 'TW' && r === 35) ? ' <span class="chip">zählt ×' + fmt(data.skala.ausdauerGewicht) + '</span>' : '';
        h += '<div class="skill" id="sk_' + r + '"><div class="lbl"><span>' + esc(lab[String(r)]) + extra + '</span></div>' + rateBtns('s' + r, E.isNum(v) ? v : null) + '<input type="text" class="obsin" data-note="' + r + '" value="' + esc(p.notes[String(r)] || '') + '" placeholder="Notiz / Beobachtung (optional)"></div>';
      }
      h += '</div>';
    });
    h += '<div class="card"><h2>Positionseignung (Trainer, 1–5)</h2><div class="muted">Fließt zu 35 % in die Positionsnote ein (Torhüter im Tor 30 %).</div>';
    E.PV_POS.forEach(function (q) { h += '<div class="skill"><div class="lbl"><span>' + q + '</span><span class="muted">Positionsnote <b id="pn_' + q + '">' + fmt1(sc[q]) + '</b></span></div>' + rateBtns('e' + q, E.isNum(p.eignung[q]) ? p.eignung[q] : null) + '</div>'; });
    h += '</div><div class="card"><h2>Hinweis des Trainers</h2><textarea id="fHint">' + esc(p.hinweis) + '</textarea></div>' + (p.archiviert ? '<button class="btn" id="restP">Wiederherstellen (zurück in den Kader)</button>' : '<button class="btn warn" id="delP">Spieler entfernen (ins Archiv „Ehemalige Spieler“)</button>');
    return h;
  }
  function refreshDetail(i) {
    var ev = R.evals[i], p = data.players[i], sc = E.posScores(p);
    $('#dGes').innerHTML = badge(ev.gesamt, true); $('#dCats').innerHTML = catsHtml(ev, p); $('#dKv').innerHTML = kvHtml(ev);
    ['Technik', 'Taktik', 'Athletik', 'Mental', 'Form'].forEach(function (g) { var el = $('#gv_' + g); if (el) el.textContent = 'Ø ' + fmt1(ev[g.toLowerCase()]); });
    E.PV_POS.forEach(function (q) { var el = $('#pn_' + q); if (el) el.textContent = fmt1(sc[q]); });
    $('#vsWrap').innerHTML = vorschlagHtml(p); bindVorschlaege(i);
    if ($('#fAk')) $('#fAk').textContent = M.altersklasse(data, p) + (p.jahrgang ? '' : ' (Team-Vorgabe)');
  }
  function bindRate(box, i) {
    var p = data.players[i];
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = box.getAttribute('data-k'), v = b.getAttribute('data-v'); v = v === '' ? null : +v;
      if (k[0] === 's') { if (v === null) delete p.skills[k.slice(1)]; else p.skills[k.slice(1)] = v; }
      else if (k[0] === 'f') p.form[+k.slice(1)] = v;
      else if (k[0] === 'e') { if (v === null) delete p.eignung[k.slice(1)]; else p.eignung[k.slice(1)] = v; }
      $$('button', box).forEach(function (x) { var on = x.getAttribute('data-v') !== '' && +x.getAttribute('data-v') === v; x.classList.toggle('on', on); x.style.background = on ? E.scaleColor(v) : ''; });
      commit(); refreshDetail(i);
    });
  }
  function bindVorschlaege(i) {
    var p = data.players[i];
    $$('[data-vs]').forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.getAttribute('data-row'), v = M.vorschlaege(data, p.id).filter(function (x) { return String(x.row) === row; })[0]; if (!v) return;
        if (b.getAttribute('data-vs') === 'ok') { M.vorschlagUebernehmen(data, v); commit(); toast(v.label + ': ' + v.alt + ' → ' + v.neu + ' übernommen'); keepScroll(render); }
        else { M.vorschlagIgnorieren(data, v); commit(); refreshDetail(i); toast('Vorschlag ignoriert'); }
      });
    });
  }
  function bindDetail() {
    var i = state.detail, p = data.players[i];
    $$('.rate').forEach(function (box) { bindRate(box, i); });
    bindVorschlaege(i);
    function bindIn(id, fn) { var el = $(id); el.addEventListener('change', function () { fn(el.value); commit(); refreshDetail(i); }); }
    bindIn('#fName', function (v) { p.name = v.trim(); });
    bindIn('#fNr', function (v) { p.nr = v === '' ? null : +v; });
    bindIn('#fGr', function (v) { p.groesse = v === '' ? null : +v; });
    bindIn('#fStamm', function (v) { p.stamm = v; });
    bindIn('#fAlt', function (v) { p.alt = v; });
    bindIn('#fFuss', function (v) { p.fuss = v; });
    bindIn('#fVerf', function (v) { p.verfuegbarkeit = v; });
    bindIn('#fVoll', function (v) { p.darfVoll = v; });
    bindIn('#fAufb', function (v) { p.aufbau = v; });
    bindIn('#fHint', function (v) { p.hinweis = v; });
    bindIn('#fJg', function (v) { var j = parseInt(v, 10); p.jahrgang = j > 1990 && j < 2100 ? j : ''; });
    $$('.obsin').forEach(function (el) { el.addEventListener('change', function () { var r = el.getAttribute('data-note'), v = el.value.trim(); if (v) p.notes[r] = v; else delete p.notes[r]; commit(); }); });
    if (state.neuAngelegt) { state.neuAngelegt = false; var f = $('#fName'); f.scrollIntoView({ block: 'center' }); f.focus(); f.select(); }
    function fotoSetzen(url) { p.foto = url; commit(); if (state.detail === i) keepScroll(render); toast('Foto gespeichert'); }
    $('#fotoWahl').addEventListener('click', function () {
      if (window.AndroidBridge && window.AndroidBridge.pickImage) { window.onImagePicked = function (url) { window.onImagePicked = null; if (!url) { toast('Kein Foto übernommen'); return; } fotoVerkleinernUrl(url, fotoSetzen); }; window.AndroidBridge.pickImage(); }
      else $('#fotoIn').click();
    });
    $('#fotoIn').addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; fotoVerkleinern(f, fotoSetzen); e.target.value = ''; });
    if ($('#fotoWeg')) $('#fotoWeg').addEventListener('click', function () { p.foto = ''; commit(); keepScroll(render); });
    if ($('#delP')) $('#delP').addEventListener('click', function () { archivFrage(p); });
    if ($('#messVerlaufBtn')) $('#messVerlaufBtn').addEventListener('click', function () { state.mvZurueck = i; state.detail = null; go('messVerlauf', { mvPid: p.id }); });
    if ($('#restTop')) $('#restTop').addEventListener('click', function () { wiederFrage(p); });
    if ($('#restP')) $('#restP').addEventListener('click', function () { wiederFrage(p); });
  }

  // ---------- Ehemalige Spieler ----------
  function archivFrage(p) {
    var n = M.vergangeneDaten(data, p.id).length;
    if (!confirm('„' + p.name + '“ aus dem Kader entfernen?\n\nDas Kind verschwindet aus Kader, Ranking, Zusagen und neuen Aufstellungen. In vergangenen Spieltagen, Spielberichten, Bewertungen und der Saison-Statistik bleibt es mit Name, Nummer und Foto erhalten' + (n ? ' (' + n + ' Spieltag' + (n > 1 ? 'e' : '') + ')' : '') + '.\n\nUnter „Ehemalige Spieler“ kannst du es jederzeit wiederherstellen.')) return;
    sichern('vor_archiv'); M.archivieren(data, p.id); commit(); state.detail = null; render(); window.scrollTo(0, 0); toast(E.firstName(p.name) + ' ist jetzt bei „Ehemalige Spieler“');
  }
  function wiederFrage(p) {
    if (!confirm('„' + p.name + '“ wiederherstellen und zurück in den Kader holen?')) return;
    M.wiederherstellen(data, p.id); commit();
    var dop = M.aktiveSpieler(data).filter(function (q) { return q.id !== p.id && p.nr !== null && p.nr !== '' && String(q.nr) === String(p.nr); })[0];
    keepScroll(render); toast(E.firstName(p.name) + ' ist wieder im Kader' + (dop ? ' – Achtung: Nummer ' + p.nr + ' trägt auch ' + E.firstName(dop.name) : ''));
  }
  function viewEhemalige() {
    var L = M.ehemaligeSpieler(data);
    var h = '<div class="card"><div class="muted">Entfernte Kinder werden hier archiviert. In vergangenen Spieltagen, eingefrorenen Aufstellungen, Spielberichten, Live-Protokollen, Zusammenfassungen, Spielbewertungen und der Saison-Statistik bleiben sie mit Name, Nummer und Foto erhalten. Für neue Aufstellungen, Zusagen und das Ranking zählen sie nicht.</div></div>';
    if (!L.length) return h + '<div class="card empty">Keine ehemaligen Spieler.</div>';
    L.forEach(function (p) {
      var v = M.vergangeneDaten(data, p.id), seit = p.archiviert && p.archiviert.length >= 10 ? M.fmtDatum(p.archiviert.slice(0, 10)) : '';
      h += '<div class="card ehem" data-pid="' + p.id + '"><div class="row">' + avatar(p, 'm' + (p.typ === 'TW' ? ' tw' : '')) + '<div class="grow"><b>' + esc(p.name) + '</b> <span class="chip">Nr. ' + esc(p.nr === null ? '–' : p.nr) + '</span>' + (p.stamm ? ' <span class="chip">' + esc(p.stamm) + '</span>' : '') +
        '<div class="muted">' + (seit ? 'Entfernt am ' + seit + ' · ' : '') + (v.length ? 'Daten in ' + v.length + ' Spieltag' + (v.length > 1 ? 'en' : '') + ': ' + esc(v.slice(0, 3).map(function (x) { return x.titel; }).join('; ')) + (v.length > 3 ? ' …' : '') : 'keine Spieldaten') + '</div></div></div>' +
        '<div class="row" style="margin-top:8px;gap:8px"><button class="btn small grow" data-rest="' + p.id + '">Wiederherstellen</button><button class="btn small sec grow' + (v.length ? ' dis' : '') + '" data-del="' + p.id + '">Endgültig löschen</button></div></div>';
    });
    return h;
  }
  function bindEhemalige() {
    $$('[data-rest]').forEach(function (b) { b.addEventListener('click', function () { wiederFrage(pById(+b.getAttribute('data-rest'))); }); });
    $$('[data-del]').forEach(function (b) { b.addEventListener('click', function () {
      var p = pById(+b.getAttribute('data-del')), v = M.vergangeneDaten(data, p.id);
      if (v.length) { alert('„' + p.name + '“ kann nicht endgültig gelöscht werden, weil es in vergangenen Spieltagen vorkommt:\n\n' + v.map(function (x) { return '• ' + x.titel + ' (' + x.gruende.join(', ') + ')'; }).join('\n') + '\n\nSonst würden Spielberichte, Bewertungen und Statistik unvollständig. Das Kind bleibt deshalb unter „Ehemalige Spieler“.'); return; }
      if (!confirm('„' + p.name + '“ endgültig löschen?\n\nDas Kind hat keine Spieldaten. Alle Angaben (Noten, Notizen, Foto) werden unwiderruflich entfernt.')) return;
      M.endgueltigLoeschen(data, p.id); commit(); keepScroll(render); toast('Endgültig gelöscht');
    }); });
  }

  // ---------- Messungen (ab 1.4) ----------
  function zahl(v) { if (v === null || v === undefined) return null; var x = parseFloat(String(v).replace(',', '.')); return E.isNum(x) ? x : null; }
  function notenBadge(n) { return E.isNum(n) ? '<span class="nb" style="background:' + E.scaleColor(n) + '">' + fmt1(n) + '</span>' : '<span class="nb leer">–</span>'; }
  function wertTxt(t, v) { return E.isNum(v) ? fmt(v) + ' ' + esc(t.einheit) : '–'; }
  function zeilenLabel(typ, r) { var L = (data.labels && data.labels[typ]) || {}; return L[String(r)] || ('Zeile ' + r); }
  function mapChips(t) {
    var f = (t.feld || []).map(function (e) { return '<span class="chip">' + esc(zeilenLabel('Feld', e[0])) + ' ×' + fmt(e[1]) + '</span>'; }).join(' ');
    var w = (t.tw || []).map(function (e) { return '<span class="chip tw">TW: ' + esc(zeilenLabel('TW', e[0])) + ' ×' + fmt(e[1]) + '</span>'; }).join(' ');
    return (f || w) ? f + ' ' + w : '<span class="muted">nur Information, keine Zuordnung</span>';
  }
  function nurTW(t) { return !(t.feld && t.feld.length) && t.tw && t.tw.length; }
  function messKinder(m, t) {   // aktueller Kader (TW-Tests nur Torhüter) + ehemalige mit Werten in diesem Termin
    var L = named().map(function (i) { return data.players[i]; }).filter(function (p) { return !t || !nurTW(t) || p.typ === 'TW' || p.stamm === 'TW' || p.alt === 'TW'; });
    M.ehemaligeSpieler(data).forEach(function (p) { if (m.werte[p.id]) L.push(p); });
    return L;
  }
  function viewMessungen() {
    var L = M.sortMessungen(data.messungen).reverse(), aktivT = data.messkatalog.filter(function (t) { return t.aktiv !== false; }).length;
    var h = '<button class="btn big" id="mNeu">+ Neuer Messtermin</button>';
    h += '<div class="card"><h2>Messtermine</h2>';
    if (!L.length) h += '<div class="muted">Noch keine Messungen. Lege einen Termin an, wähle die Tests und trage die Werte direkt auf dem Platz ein.</div>';
    L.forEach(function (m) {
      var n = Object.keys(m.werte).length;
      h += '<div class="mterm" data-m="' + m.id + '"><div class="grow"><b>' + esc(M.fmtDatum(m.datum)) + '</b>' + (m.titel ? ' · ' + esc(m.titel) : '') + '<div class="muted">' + m.tests.length + ' Test' + (m.tests.length === 1 ? '' : 's') + ' · ' + n + ' Kind' + (n === 1 ? '' : 'er') + ' gemessen</div></div><span class="muted">›</span></div>';
    });
    h += '</div><div class="card"><h2>Verlauf je Kind</h2><div class="kidgrid">' + named().map(function (i) { var p = data.players[i]; return '<button class="kid" data-mv="' + p.id + '">' + avatar(p, 'm' + (p.typ === 'TW' ? ' tw' : '')) + '<span>' + esc(E.firstName(p.name)) + '</span></button>'; }).join('') + '</div></div>';
    h += '<div class="card"><h2>Testkatalog</h2><div class="muted">' + aktivT + ' aktive Tests mit Einheit, Richtung, Notenbändern je Altersklasse und Zuordnung zu den Grundwerten. Alles änderbar, eigene Tests möglich.</div><button class="btn sec" id="mKat">Testkatalog öffnen</button></div>';
    h += '<div class="card"><h2>Altersklasse des Teams</h2>' + segHtml('mAk', data.settings.altersklasse || 'U11', M.KLASSEN.map(function (k) { return [k, k]; }), 'small') +
      '<div class="muted" style="margin-top:6px">Gilt für die Notenbänder, wenn beim Kind kein Jahrgang eingetragen ist (Spielerbogen → Jahrgang). Mit Jahrgang: Altersklasse der Saison (z. B. 2016 in 2026/27 = U11).</div></div>';
    return h;
  }
  function bindMessungen() {
    $('#mNeu').addEventListener('click', function () { state.mneu = null; go('messNeu'); });
    $('#mKat').addEventListener('click', function () { go('messKatalog'); });
    $$('[data-m]').forEach(function (c) { c.addEventListener('click', function () { go('messTermin', { messId: c.getAttribute('data-m'), messTest: null }); }); });
    $$('[data-mv]').forEach(function (c) { c.addEventListener('click', function () { go('messVerlauf', { mvPid: +c.getAttribute('data-mv'), mvZurueck: null }); }); });
    bindSeg('mAk', function (v) { data.settings.altersklasse = v; commit(); toast('Altersklasse ' + v); });
  }
  var STD_AUSWAHL = ['sprint10', 'gewandt', 'dribbling', 'jongl_stark', 'pass10'];
  function viewMessNeu() {
    var n = state.mneu || (state.mneu = { datum: M.today(), titel: '', tests: STD_AUSWAHL.filter(function (id) { var t = M.testById(data, id); return t && t.aktiv !== false; }) });
    var gr = {}; data.messkatalog.forEach(function (t) { if (t.aktiv === false) return; (gr[t.gruppe || 'Eigene'] = gr[t.gruppe || 'Eigene'] || []).push(t); });
    var h = '<div class="card"><h2>Neuer Messtermin</h2><div class="grid2"><div><label class="f">Datum</label><input type="date" id="mnDat" value="' + esc(n.datum) + '"></div><div><label class="f">Titel (optional)</label><input type="text" id="mnTit" placeholder="z. B. Herbsttest" value="' + esc(n.titel) + '"></div></div>' +
      '<label class="f">Tests (antippen zum Auswählen)</label>';
    Object.keys(gr).forEach(function (g) {
      h += '<div class="bwl">' + esc(g) + '</div><div class="tchips">' + gr[g].map(function (t) { return '<button class="tchip' + (n.tests.indexOf(t.id) >= 0 ? ' on' : '') + '" data-tt="' + esc(t.id) + '">' + esc(t.name) + '<small>' + esc(t.einheit) + '</small></button>'; }).join('') + '</div>';
    });
    return h + '<button class="btn" id="mnOk">Termin anlegen (' + n.tests.length + ' Tests)</button></div>';
  }
  function bindMessNeu() {
    var n = state.mneu;
    $('#mnDat').addEventListener('change', function (e) { n.datum = e.target.value; });
    $('#mnTit').addEventListener('input', function (e) { n.titel = e.target.value; });
    $$('[data-tt]').forEach(function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-tt'), k = n.tests.indexOf(id); if (k >= 0) n.tests.splice(k, 1); else n.tests.push(id); keepScroll(render); }); });
    $('#mnOk').addEventListener('click', function () {
      if (!n.datum) { toast('Bitte ein Datum wählen'); return; }
      if (!n.tests.length) { toast('Bitte mindestens einen Test wählen'); return; }
      var m = M.neueMessung(data, { datum: n.datum, titel: n.titel.trim(), tests: n.tests }); state.mneu = null; commit();
      state.tab = 'messungen'; go('messTermin', { messId: m.id, messTest: m.tests[0] });
    });
  }
  function ergebnisZelle(m, p, t) {
    var r = M.messErgebnis(data, m, p.id, t.id);
    return r ? '<b>' + wertTxt(t, r.wert) + '</b> ' + (t.baender ? notenBadge(r.note) : '') : '<span class="muted">–</span>';
  }
  function viewMessTermin() {
    var m = M.messungById(data, state.messId); if (!m) return '<div class="card empty">Termin nicht gefunden.</div>';
    var tid = m.tests.indexOf(state.messTest) >= 0 ? state.messTest : m.tests[0]; state.messTest = tid;
    var t = tid ? M.testById(data, tid) : null;
    var h = '<div class="card"><div class="grid2"><div><label class="f">Datum</label><input type="date" id="mtDat" value="' + esc(m.datum) + '"></div><div><label class="f">Titel</label><input type="text" id="mtTit" value="' + esc(m.titel) + '"></div></div>' +
      '<div class="tchips scrollx" id="mtTests">' + m.tests.map(function (id) { var x = M.testById(data, id); if (!x) return ''; var n = messKinder(m, x).filter(function (p) { return M.messErgebnis(data, m, p.id, id); }).length; return '<button class="tchip' + (id === tid ? ' on' : '') + '" data-mt="' + esc(id) + '">' + esc(x.name) + '<small>' + n + ' ✓</small></button>'; }).join('') + '<button class="tchip add" id="mtAdd">+ Test</button></div></div>';
    if (!t) return h + '<div class="card empty">Kein Test gewählt.</div>';
    var tv = M.teamVergleich(data, m, tid);
    h += '<div class="card" id="mtGrid"><h2>' + esc(t.name) + ' <span class="muted">' + esc(t.einheit) + ' · ' + (t.richtung === 'kleiner' ? 'weniger ist besser' : 'mehr ist besser') + ' · ' + t.versuche + ' Versuch' + (t.versuche > 1 ? 'e' : '') + (t.versuche > 1 ? ', zählt ' + (t.regel === 'mittel' ? 'Mittel' : 'Bestwert') : '') + '</span></h2>' +
      '<div class="muted">' + esc(t.beschreibung || '') + '</div>';
    h += '<div class="mgrid">';
    messKinder(m, t).forEach(function (p) {
      var L = (m.werte[p.id] && m.werte[p.id][tid]) || [];
      h += '<div class="mrow' + (p.archiviert ? ' ehem' : '') + '" data-pid="' + p.id + '">' + avatar(p, 'm' + (p.typ === 'TW' ? ' tw' : '')) + '<div class="mname">' + esc(E.firstName(p.name)) + '<small>' + esc(M.altersklasse(data, p, m.datum)) + '</small></div><div class="minp">';
      for (var k = 0; k < Math.max(1, t.versuche); k++) h += '<input type="text" inputmode="decimal" enterkeyhint="next" class="mv" data-pid="' + p.id + '" data-k="' + k + '" value="' + (E.isNum(L[k]) ? String(L[k]).replace('.', ',') : '') + '" placeholder="' + (t.versuche > 1 ? (k + 1) + '.' : '') + '">';
      h += '</div><div class="merg" id="me_' + p.id + '">' + ergebnisZelle(m, p, t) + '</div></div>';
    });
    h += '</div><div class="muted" id="mtTeam" style="margin-top:8px">' + teamTxt(t, tv) + '</div></div>';
    h += '<div class="card"><button class="btn sec" id="mtVerlaufAlle">Ergebnisse aller Tests (Übersicht)</button><button class="btn warn" id="mtDel">Messtermin löschen</button></div>';
    return h;
  }
  function teamTxt(t, tv) { return tv ? 'Team: ' + tv.anzahl + ' gemessen · Median ' + wertTxt(t, tv.median) + ' · Ø ' + wertTxt(t, tv.mittel) + '. Eingabe mit Komma oder Punkt; „Weiter“ springt zum nächsten Feld.' : 'Noch keine Werte. Eingabe mit Komma oder Punkt; „Weiter“ springt zum nächsten Feld.'; }
  function bindMessTermin() {
    var m = M.messungById(data, state.messId); if (!m) return;
    $('#mtDat').addEventListener('change', function (e) { if (e.target.value) { m.datum = e.target.value; commit(); keepScroll(render); } });
    $('#mtTit').addEventListener('change', function (e) { m.titel = e.target.value.trim(); commit(); });
    $$('[data-mt]').forEach(function (b) { b.addEventListener('click', function () { state.messTest = b.getAttribute('data-mt'); keepScroll(render); }); });
    $('#mtAdd').addEventListener('click', function () {
      var frei = data.messkatalog.filter(function (t) { return t.aktiv !== false && m.tests.indexOf(t.id) < 0; });
      if (!frei.length) { toast('Alle aktiven Tests sind schon dabei'); return; }
      openSheet('<h3>Test hinzufügen</h3><div class="tchips">' + frei.map(function (t) { return '<button class="tchip" data-add="' + esc(t.id) + '">' + esc(t.name) + '<small>' + esc(t.einheit) + '</small></button>'; }).join('') + '</div>', function (root) {
        $$('[data-add]', root).forEach(function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-add'); m.tests.push(id); state.messTest = id; commit(); closeSheet(); keepScroll(render); }); });
      });
    });
    if (!$('#mtGrid')) { if ($('#mtDel')) bindDel(); return; }
    var t = M.testById(data, state.messTest), inputs = $$('.mv');
    inputs.forEach(function (el, idx) {
      el.addEventListener('change', function () {
        var raw = el.value.trim(), v = zahl(raw);
        if (raw && v === null) { el.classList.add('bad'); toast('Bitte eine Zahl eingeben'); return; }
        el.classList.remove('bad');
        var pid = +el.getAttribute('data-pid'); M.messwertSetzen(m, pid, t.id, +el.getAttribute('data-k'), v); save();
        var p = pById(pid); $('#me_' + pid).innerHTML = ergebnisZelle(m, p, t); $('#mtTeam').textContent = teamTxt(t, M.teamVergleich(data, m, t.id));
      });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.dispatchEvent(new Event('change')); var nx = inputs[idx + 1]; if (nx) { nx.focus(); nx.select(); } else el.blur(); } });
    });
    $('#mtVerlaufAlle').addEventListener('click', function () { terminUebersicht(m); });
    bindDel();
    function bindDel() {
      $('#mtDel').addEventListener('click', function () {
        if (!confirm('Messtermin vom ' + M.fmtDatum(m.datum) + ' mit allen ' + Object.keys(m.werte).length + ' Messwerten löschen?')) return;
        data.messungen = data.messungen.filter(function (x) { return x.id !== m.id; }); commit(); state.sub = null; state.tab = 'messungen'; render(); toast('Messtermin gelöscht');
      });
    }
  }
  function terminUebersicht(m) {
    var T = m.tests.map(function (id) { return M.testById(data, id); }).filter(Boolean);
    var h = '<h3>' + esc(M.fmtDatum(m.datum)) + (m.titel ? ' · ' + esc(m.titel) : '') + '</h3><div class="scroll"><table class="st"><thead><tr><th>Kind</th>' + T.map(function (t) { return '<th class="c">' + esc(t.name) + '</th>'; }).join('') + '</tr></thead><tbody>';
    messKinder(m).forEach(function (p) { h += '<tr><td>' + esc(E.firstName(p.name)) + '</td>' + T.map(function (t) { var r = M.messErgebnis(data, m, p.id, t.id); return '<td class="c">' + (r ? fmt(r.wert) + (t.baender ? '<br>' + notenBadge(r.note) : '') : '–') + '</td>'; }).join('') + '</tr>'; });
    openSheet(h + '</tbody></table></div>', function () { });
  }
  // Verlauf eines Kindes: je Test Diagramm (Kind + Team-Median), Tabelle, Teamvergleich
  function chartSvg(t, V, Med) {
    var W = 300, H = 120, pl = 34, pr = 8, pt = 10, pb = 22, vals = V.map(function (x) { return x.wert; }).concat(Med.filter(E.isNum));
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (hi === lo) { hi += 1; lo -= 1; } var pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
    var inv = t.richtung === 'kleiner';   // oben = besser
    var y = function (v) { var f = (v - lo) / (hi - lo); return pt + (inv ? f : 1 - f) * (H - pt - pb); };
    var x = function (i) { return V.length === 1 ? (pl + W - pr) / 2 : pl + i * (W - pl - pr) / (V.length - 1); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
    [hi - pad, lo + pad].forEach(function (v) { s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/><text x="2" y="' + (y(v) + 4) + '" class="ax">' + fmt(E.xround(v, 2)) + '</text>'; });
    var med = Med.map(function (v, i) { return E.isNum(v) ? x(i) + ',' + y(v) : null; }).filter(Boolean);
    if (med.length > 1) s += '<polyline points="' + med.join(' ') + '" class="med"/>';
    Med.forEach(function (v, i) { if (E.isNum(v)) s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.5" class="medp"/>'; });
    if (V.length > 1) s += '<polyline points="' + V.map(function (p, i) { return x(i) + ',' + y(p.wert); }).join(' ') + '" class="ln"/>';
    V.forEach(function (p, i) { s += '<circle cx="' + x(i) + '" cy="' + y(p.wert) + '" r="4" class="pt"/><text x="' + x(i) + '" y="' + (H - 6) + '" class="ax" text-anchor="middle">' + esc(M.fmtDatum(p.datum).slice(0, 6)) + '</text>'; });
    return s + '</svg>';
  }
  function verlaufDaten(pid) {
    var out = [];
    data.messkatalog.forEach(function (t) {
      var V = M.messVerlauf(data, pid, t.id); if (!V.length) return;
      var Med = V.map(function (v) { var tv = M.teamVergleich(data, M.messungById(data, v.messung), t.id, pid); v.rang = tv ? tv.rang : 0; v.anzahl = tv ? tv.anzahl : 0; return tv ? tv.median : null; });
      out.push({ t: t, V: V, Med: Med });
    });
    return out;
  }
  function trendPfeil(t, V) {
    if (V.length < 2) return '';
    var a = V[V.length - 2].wert, b = V[V.length - 1].wert, besser = t.richtung === 'kleiner' ? b < a : b > a;
    return a === b ? ' <span class="muted">→</span>' : (besser ? ' <span class="up">↑ besser</span>' : ' <span class="down">↓ schwächer</span>');
  }
  function viewMessVerlauf() {
    var p = pById(state.mvPid); if (!p) return '<div class="card empty">Kind nicht gefunden.</div>';
    var D = verlaufDaten(p.id);
    var h = '<div class="card"><div class="row">' + avatar(p, 'l' + (p.typ === 'TW' ? ' tw' : '')) + '<div class="grow"><b>' + esc(p.name) + '</b><div class="muted">Nr. ' + esc(p.nr === null ? '–' : p.nr) + ' · Altersklasse ' + esc(M.altersklasse(data, p)) + ' · ' + D.length + ' Test' + (D.length === 1 ? '' : 's') + ' gemessen</div></div></div>' +
      '<div class="muted" style="margin-top:6px">Diagramm: oben = besser. Grüne Linie = Kind, graue Punkte = Team-Median am selben Termin.</div></div>';
    if (!D.length) return h + '<div class="card empty">Noch keine Messwerte.</div>';
    D.forEach(function (x) {
      var t = x.t, last = x.V[x.V.length - 1];
      h += '<div class="card mvcard" data-test="' + esc(t.id) + '"><h2>' + esc(t.name) + ' <span class="muted">' + esc(t.einheit) + '</span></h2>' +
        '<div class="row"><div class="grow"><b class="big">' + wertTxt(t, last.wert) + '</b> ' + (t.baender ? notenBadge(last.note) : '') + trendPfeil(t, x.V) + '<div class="muted">Platz ' + last.rang + ' von ' + last.anzahl + ' · Team-Median ' + wertTxt(t, x.Med[x.Med.length - 1]) + '</div></div></div>' +
        chartSvg(t, x.V, x.Med) + '<table class="st kl"><tbody>' + x.V.slice().reverse().map(function (v, k) { return '<tr><td>' + esc(M.fmtDatum(v.datum)) + '</td><td class="c">' + wertTxt(t, v.wert) + '</td><td class="c">' + (t.baender ? notenBadge(v.note) : '') + '</td><td class="c muted">' + v.rang + '/' + v.anzahl + '</td></tr>'; }).join('') + '</tbody></table>' +
        (t.baender ? '<div class="muted">Zählt für: ' + mapChips(t) + '</div>' : '') + '</div>';
    });
    var vs = M.vorschlaege(data, p.id).filter(function (v) { return v.quelle !== 'spiele' && !v.ignoriert; });
    if (vs.length) h += '<div class="card"><h2>💡 Vorschläge aus Messungen</h2>' + vs.map(function (v) { return '<div class="vs">' + esc(v.text) + '</div>'; }).join('') + '<button class="btn sec" id="mvZumBogen">Im Spielerbogen übernehmen / ignorieren</button></div>';
    return h;
  }
  function bindMessVerlauf() {
    if ($('#mvZumBogen')) $('#mvZumBogen').addEventListener('click', function () { var i = data.players.indexOf(pById(state.mvPid)); state.sub = null; state.detail = i; state.detailZurueck = 'messVerlauf'; state.mvZurueck = null; render(); var c = $('#vsCard'); if (c) c.scrollIntoView(); });
  }
  function messKarteHtml(p) {   // im Spielerbogen
    var D = verlaufDaten(p.id);
    var h = '<div class="card" id="messCard"><h2>📏 Messungen</h2>';
    if (!D.length) return h + '<div class="muted">Noch keine Messwerte. Messtermine im Tab „Messungen“.</div></div>';
    h += '<table class="st"><tbody>' + D.map(function (x) { var l = x.V[x.V.length - 1]; return '<tr><td>' + esc(x.t.name) + '</td><td class="c">' + wertTxt(x.t, l.wert) + '</td><td class="c">' + (x.t.baender ? notenBadge(l.note) : '') + '</td><td class="c">' + trendPfeil(x.t, x.V) + '</td></tr>'; }).join('') + '</tbody></table>';
    return h + '<button class="btn sec" id="messVerlaufBtn">Verlauf & Team-Vergleich</button></div>';
  }
  // Testkatalog
  function viewMessKatalog() {
    var kl = data.settings.altersklasse || 'U11', gr = {};
    data.messkatalog.forEach(function (t) { (gr[t.gruppe || 'Eigene'] = gr[t.gruppe || 'Eigene'] || []).push(t); });
    var h = '<button class="btn big" id="tkNeu">+ Eigener Test</button><div class="card"><div class="muted">Notenbänder: ab diesem Wert gibt es Note 2 / 3 / 4 / 5 (dazwischen stufenlos, darunter bis 1). Angezeigt für ' + esc(kl) + '. Die mitgelieferten Bänder sind <b>Schätzwerte</b> für Jungen im Breitensport (orientiert an veröffentlichten Normwerten und DFB-Stützpunkt-Testpraxis), keine amtliche Norm – bitte nach den ersten eigenen Messungen anpassen.</div></div>';
    Object.keys(gr).forEach(function (g) {
      h += '<div class="card"><h2>' + esc(g) + '</h2>' + gr[g].map(function (t) {
        var c = t.baender && (t.baender[kl] || t.baender.U11);
        return '<div class="tkrow' + (t.aktiv === false ? ' aus' : '') + '" data-te="' + esc(t.id) + '"><div class="grow"><b>' + esc(t.name) + '</b> <span class="chip">' + esc(t.einheit) + '</span> <span class="chip ' + (t.richtung === 'kleiner' ? 'def' : 'of') + '">' + (t.richtung === 'kleiner' ? '↓ weniger besser' : '↑ mehr besser') + '</span>' + (t.aktiv === false ? ' <span class="chip off">inaktiv</span>' : '') + (t.standard ? '' : ' <span class="chip">eigener</span>') +
          '<div class="muted">' + (c ? 'Note 2/3/4/5 ab ' + c.map(fmt).join(' / ') + ' ' + esc(t.einheit) : 'ohne Note') + ' · ' + t.versuche + '× ' + (t.regel === 'mittel' ? 'Mittel' : 'Bestwert') + '</div><div class="tkmap">' + mapChips(t) + '</div></div><span class="muted">›</span></div>';
      }).join('') + '</div>';
    });
    return h;
  }
  function bindMessKatalog() {
    $$('[data-te]').forEach(function (r) { r.addEventListener('click', function () { go('testEdit', { testId: r.getAttribute('data-te') }); }); });
    $('#tkNeu').addEventListener('click', function () {
      var id = 'eigen_' + Date.now().toString(36), b = {}; M.KLASSEN.forEach(function (k) { b[k] = [1, 2, 3, 4]; });
      data.messkatalog.push({ id: id, name: 'Neuer Test', einheit: 's', richtung: 'kleiner', gruppe: 'Eigene', versuche: 2, regel: 'best', baender: { U9: [12, 11, 10, 9], U10: [12, 11, 10, 9], U11: [12, 11, 10, 9], U12: [12, 11, 10, 9], U13: [12, 11, 10, 9] }, feld: [], tw: [], beschreibung: '', aktiv: true, standard: false, quelle: 'eigener Test' });
      commit(); go('testEdit', { testId: id });
    });
  }
  var ZEILEN = [16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43];
  function viewTestEdit() {
    var t = M.testById(data, state.testId); if (!t) return '<div class="card empty">Test nicht gefunden.</div>';
    var h = '<div class="card"><label class="f">Name</label><input type="text" id="teName" value="' + esc(t.name) + '">' +
      '<div class="grid2"><div><label class="f">Einheit</label><input type="text" id="teEh" value="' + esc(t.einheit) + '"></div><div><label class="f">Gruppe</label><input type="text" id="teGr" value="' + esc(t.gruppe || '') + '"></div>' +
      '<div><label class="f">Versuche</label><input type="number" id="teVs" min="1" max="5" value="' + esc(t.versuche) + '"></div><div><label class="f">Es zählt</label>' + sel('teRg', t.regel, [['best', 'Bestwert'], ['mittel', 'Mittelwert']]) + '</div></div>' +
      '<label class="f">Richtung</label>' + segHtml('teRi', t.richtung, [['kleiner', 'weniger ist besser (Zeit, cm Fallstab)'], ['groesser', 'mehr ist besser (Meter, Treffer)']], 'small') +
      '<label class="f">Beschreibung / Aufbau</label><textarea id="teBe">' + esc(t.beschreibung || '') + '</textarea>' +
      '<label class="f">Aktiv (in Auswahl und Vorschlägen)</label>' + segHtml('teAk', t.aktiv === false ? '0' : '1', [['1', 'Ja'], ['0', 'Nein']], 'small') + '</div>';
    h += '<div class="card"><h2>Notenbänder</h2><label class="f">Mit Note bewerten</label>' + segHtml('teNo', t.baender ? '1' : '0', [['1', 'Ja'], ['0', 'Nein, nur Information']], 'small');
    if (t.baender) {
      h += '<div class="muted" style="margin:6px 0">Ab diesem Wert: Note 2 · 3 · 4 · 5 (' + (t.richtung === 'kleiner' ? 'Werte fallend' : 'Werte steigend') + ').</div><table class="st band"><thead><tr><th></th><th class="c">2</th><th class="c">3</th><th class="c">4</th><th class="c">5</th></tr></thead><tbody>';
      M.KLASSEN.forEach(function (k) { var c = t.baender[k] || [null, null, null, null]; h += '<tr><td><b>' + k + '</b></td>' + c.map(function (v, i) { return '<td><input type="text" inputmode="decimal" class="bnd" data-kl="' + k + '" data-i="' + i + '" value="' + (E.isNum(v) ? String(v).replace('.', ',') : '') + '"></td>'; }).join('') + '</tr>'; });
      h += '</tbody></table>';
    }
    h += '</div>';
    ['feld', 'tw'].forEach(function (art) {
      var typ = art === 'tw' ? 'TW' : 'Feld', L = t[art] || [];
      h += '<div class="card"><h2>Zuordnung ' + (art === 'tw' ? 'Torhüter-Bogen' : 'Feldspieler-Bogen') + '</h2><div class="muted">Grundwert (Zeile) und Gewicht 0–1. Gewicht 1 = Test misst die Fähigkeit direkt; kleiner = nur teilweise.</div>';
      L.forEach(function (e, k) { h += '<div class="row mapr"><div class="grow">' + sel('mr_' + art + '_' + k, e[0], ZEILEN.map(function (r) { return [r, r + ' · ' + zeilenLabel(typ, r)]; })) + '</div><input type="text" inputmode="decimal" class="mw" data-art="' + art + '" data-k="' + k + '" value="' + String(e[1]).replace('.', ',') + '"><button class="btn small sec" data-mdel="' + art + ':' + k + '">✕</button></div>'; });
      h += '<button class="btn small sec" data-madd="' + art + '">+ Grundwert zuordnen</button></div>';
    });
    var benutzt = data.messungen.some(function (m) { return Object.keys(m.werte).some(function (pid) { return m.werte[pid][t.id]; }); });
    h += '<div class="card">' + (t.standard ? '<button class="btn sec" id="teStd">Mitgelieferte Werte wiederherstellen</button>' : '') + (!t.standard && !benutzt ? '<button class="btn warn" id="teDel">Test löschen</button>' : '<div class="muted">' + (benutzt ? 'Test hat Messwerte – zum Ausblenden „Aktiv: Nein“ wählen.' : 'Mitgelieferte Tests können deaktiviert, aber nicht gelöscht werden.') + '</div>') + '</div>';
    return h;
  }
  function bindTestEdit() {
    var t = M.testById(data, state.testId); if (!t) return;
    function upd(fn, neu) { fn(); commit(); if (neu) keepScroll(render); }
    $('#teName').addEventListener('change', function (e) { upd(function () { t.name = e.target.value.trim() || t.name; }); setTitle('Test bearbeiten', t.name); });
    $('#teEh').addEventListener('change', function (e) { upd(function () { t.einheit = e.target.value.trim(); }); });
    $('#teGr').addEventListener('change', function (e) { upd(function () { t.gruppe = e.target.value.trim() || 'Eigene'; }); });
    $('#teVs').addEventListener('change', function (e) { upd(function () { var v = parseInt(e.target.value, 10); t.versuche = v >= 1 && v <= 5 ? v : 1; }); });
    $('#teRg').addEventListener('change', function (e) { upd(function () { t.regel = e.target.value; }); });
    $('#teBe').addEventListener('change', function (e) { upd(function () { t.beschreibung = e.target.value; }); });
    bindSeg('teRi', function (v) { upd(function () { t.richtung = v; }, true); });
    bindSeg('teAk', function (v) { upd(function () { t.aktiv = v === '1'; }); });
    bindSeg('teNo', function (v) { upd(function () { if (v === '1') { if (!t.baender) { var b = {}; M.KLASSEN.forEach(function (k) { b[k] = t.richtung === 'kleiner' ? [4, 3, 2, 1] : [1, 2, 3, 4]; }); t.baender = b; } } else t.baender = null; }, true); });
    $$('.bnd').forEach(function (el) { el.addEventListener('change', function () { var v = zahl(el.value); if (v === null) { el.classList.add('bad'); return; } el.classList.remove('bad'); upd(function () { t.baender[el.getAttribute('data-kl')][+el.getAttribute('data-i')] = v; }); }); });
    ['feld', 'tw'].forEach(function (art) { (t[art] || []).forEach(function (e, k) { $('#mr_' + art + '_' + k).addEventListener('change', function (ev) { upd(function () { t[art][k][0] = +ev.target.value; }); }); }); });
    $$('.mw').forEach(function (el) { el.addEventListener('change', function () { var v = zahl(el.value); if (v === null || v < 0 || v > 1) { el.classList.add('bad'); toast('Gewicht zwischen 0 und 1'); return; } el.classList.remove('bad'); upd(function () { t[el.getAttribute('data-art')][+el.getAttribute('data-k')][1] = v; }); }); });
    $$('[data-mdel]').forEach(function (b) { b.addEventListener('click', function () { var x = b.getAttribute('data-mdel').split(':'); upd(function () { t[x[0]].splice(+x[1], 1); }, true); }); });
    $$('[data-madd]').forEach(function (b) { b.addEventListener('click', function () { var art = b.getAttribute('data-madd'); upd(function () { (t[art] = t[art] || []).push([16, 0.5]); }, true); }); });
    if ($('#teStd')) $('#teStd').addEventListener('click', function () { if (!confirm('Name, Bänder und Zuordnung von „' + t.name + '“ auf die mitgelieferten Werte zurücksetzen?')) return; var s = M.standardKatalog().filter(function (x) { return x.id === t.id; })[0]; if (s) { var ak = t.aktiv; Object.keys(s).forEach(function (k) { t[k] = s[k]; }); t.aktiv = ak; } commit(); keepScroll(render); toast('Zurückgesetzt'); });
    if ($('#teDel')) $('#teDel').addEventListener('click', function () { if (!confirm('Test „' + t.name + '“ löschen?')) return; data.messkatalog = data.messkatalog.filter(function (x) { return x.id !== t.id; }); data.messungen.forEach(function (m) { m.tests = m.tests.filter(function (x) { return x !== t.id; }); }); commit(); go('messKatalog'); toast('Test gelöscht'); });
  }

  // ---------- Ranking / Saison ----------
  function viewRanking() {
    var h = segHtml('rkSeg', state.rkMode, [['note', 'Ranking Gesamtnote'], ['saison', 'Saison-Statistik']], 'small') + '<div style="height:8px"></div>';
    if (state.rkMode === 'saison') {
      var SL = M.saisonListe(data); if (state.saisonKey === undefined) state.saisonKey = SL[0] || '';
      h += segHtml('szSaison', state.saisonKey, SL.map(function (k) { return [k, 'Saison ' + k]; }).concat([['', 'Alle']]), 'small') + '<div style="height:8px"></div>';
      var S = M.saison(data, state.saisonKey), rows = named().map(function (i) { return S[data.players[i].id]; }).filter(Boolean)
        .concat(M.ehemaligeSpieler(data).map(function (p) { return S[p.id]; }).filter(function (x) { return x && (x.spiele || x.startelf || x.tore || x.assists || x.fehler || x.einwechslungen); }));
      rows.sort(function (a, b) { return b.minuten - a.minuten || b.spiele - a.spiele || a.name.localeCompare(b.name, 'de'); });
      h += '<div class="card scroll"><table class="st"><thead><tr><th>Name</th><th class="c">Sp.</th><th class="c">Start</th><th class="c">Min.</th><th class="c">Tore</th><th class="c">Ass.</th><th class="c">Fehl.</th><th class="c">Einw.</th><th class="c">Quote</th></tr></thead><tbody>';
      rows.forEach(function (s) { h += '<tr data-pid="' + s.pid + '"' + (s.archiviert ? ' class="ehem"' : '') + '><td>' + esc(E.firstName(s.name)) + (s.archiviert ? ' <span class="chip">ehemalig</span>' : '') + '</td><td class="c">' + s.spiele + '</td><td class="c">' + s.startelf + '</td><td class="c">' + s.minuten + '</td><td class="c"><b>' + s.tore + '</b></td><td class="c">' + s.assists + '</td><td class="c">' + s.fehler + '</td><td class="c">' + s.einwechslungen + '</td><td class="c">' + quoteHtml(M.einsatzQuote(data, s.pid, state.saisonKey)) + '</td></tr>'; });
      h += '</tbody></table></div><div class="muted" style="padding:0 4px">' + (state.saisonKey ? 'Spieltage der Saison ' + esc(state.saisonKey) + ' (Saisonbeginn unter Mehr → Saison).' : 'Alle Spieltage.') + ' Minuten aus Startelf und Wechseln (oder aus der Spielbewertung, falls dort eingetragen). Sp. = Spiele, Fehl. = Abwehrfehler, Einw. = Einwechslungen. <b>Quote</b> = Fair-Play-Minuten: gespielte ÷ mögliche Minuten in Spielen, für die das Kind zugesagt hatte (unter 50 % orange) – hilft, Einsatzzeiten gerecht zu verteilen.</div>';
      return h;
    }
    h += '<div class="card"><table><thead><tr><th class="c">Rang</th><th>Name</th><th class="c">Nr.</th><th class="c">Note</th><th>Einsatz</th><th class="c">Beste</th></tr></thead><tbody>';
    R.ranking.forEach(function (r) {
      h += '<tr data-i="' + r.idx + '"><td class="c"><b>' + r.rang + '</b></td><td>' + esc(r.name) + '</td><td class="c">' + esc(r.nr === null ? '' : r.nr) + '</td><td class="c">' + badge(r.gesamt) + '</td><td style="font-size:12px">' + esc(r.einsatz) + '</td><td class="c">' + esc(r.beste) + '</td></tr>';
    });
    h += '</tbody></table></div><div class="muted" style="padding:0 4px">Gesamtnote = Technik 25 %, Taktik 30 %, Athletik 20 %, Mental 15 %, Form 10 % (nur bewertete Kategorien); Ausdauer zählt in Athletik ×' + fmt(data.skala.ausdauerGewicht) + '. Form aus den Spielbewertungen, sonst manuell. Gleiche Note = gleicher Rang.</div>';
    return h;
  }
  function quoteHtml(q) { if (!q) return '–'; var pz = Math.round(q.quote * 100); return '<span class="quote' + (pz < 50 ? ' tief' : '') + '" title="' + q.gespielt + ' von ' + q.moeglich + ' Min.">' + pz + ' %</span>'; }
  function bindRanking() {
    bindSeg('rkSeg', function (v) { state.rkMode = v; render(); });
    if ($('#szSaison')) bindSeg('szSaison', function (v) { state.saisonKey = v; keepScroll(render); });
    $$('tr[data-i]').forEach(function (tr) { tr.addEventListener('click', function () { state.detail = +tr.getAttribute('data-i'); render(); window.scrollTo(0, 0); }); });
    $$('tr[data-pid]').forEach(function (tr) { tr.addEventListener('click', function () { var pid = +tr.getAttribute('data-pid'); state.detail = data.players.indexOf(pById(pid)); render(); window.scrollTo(0, 0); }); });
  }

  // ---------- Spieltage ----------
  function anzahlBewertet(st) { return Object.keys(st.bewertungen).filter(function (k) { return M.spielwert(st.bewertungen[k]) !== null; }).length; }
  function ergebnisText(st) { var s = st.spiel; if (!s || (!s.startelf && !s.tore.length && !s.gegentore)) return ''; return s.tore.length + ':' + s.gegentore; }
  function viewSpieltage() {
    var h = '<div class="row"><button class="btn grow" id="neuSt">+ Neuer Spieltag</button><button class="btn sec" style="width:auto" id="gListe">Gegner-Datei (' + (data.gegner || []).length + ')</button></div>';
    if (!data.spieltage.length) h += '<div class="card muted">Noch kein Spieltag angelegt.</div>';
    M.sortSpieltage(data.spieltage).forEach(function (st) {
      var akt = st.id === data.aktiverSpieltag, zu = Object.keys(st.zusagen).filter(function (k) { return st.zusagen[k] === 'Zugesagt' && pById(+k) && pById(+k).name; }).length, bw = anzahlBewertet(st), erg = ergebnisText(st);
      h += '<div class="card stcard' + (akt ? ' akt' : '') + '" data-st="' + st.id + '"><div class="row"><div class="date"><b>' + esc(M.fmtDatum(st.datum).slice(0, 6)) + '</b><span>' + esc((st.datum || '').slice(0, 4)) + '</span></div>' +
        '<div class="grow"><div class="pname">' + (st.gegner ? 'gegen ' + esc(st.gegner) : 'Gegner offen') + (erg ? ' <span class="erg">' + erg + '</span>' : '') + '</div><div class="chips">' +
        (st.ort ? '<span class="chip">' + esc(st.ort) + '</span>' : '') + (st.groesse ? '<span class="chip">' + esc(st.groesse) + 'er</span>' : '') +
        (st.status === 'abgeschlossen' ? '<span class="chip lock">🔒 abgeschlossen</span>' : '<span class="chip open">offen</span>') + (akt ? '<span class="chip akt">aktuell</span>' : '') + (tkTafeln(st.id).length ? '<span class="chip tkc">📋 Taktik' + (tkTafeln(st.id).length > 1 ? ' ' + tkTafeln(st.id).length : '') + '</span>' : '') + (M.liveLaeuft(st) || (st.live && st.live.phase === 'pause') ? '<span class="chip live">● live</span>' : '') + owChip(st) + (!erg && M.gegnerInfo(data, st) ? '<span class="chip ginfo">🔎 Gegner-Info</span>' : '') + '</div>' +
        '<div class="muted" style="margin-top:3px">' + zu + ' Zusagen · ' + (bw ? bw + ' Kinder bewertet' : 'keine Spielbewertung') + '</div></div><span class="chev">›</span></div></div>';
    });
    return h + '<div class="muted" style="padding:0 4px">Antippen öffnet den Spieltag und macht ihn zum aktuellen Spieltag für „Aufstellung“. Abgeschlossene Spieltage zeigen die eingefrorene Aufstellung.</div>';
  }
  function bindSpieltage() {
    $('#neuSt').addEventListener('click', function () { go('neu'); });
    $('#gListe').addEventListener('click', function () { go('gegnerListe'); });
    $$('.stcard').forEach(function (c) { c.addEventListener('click', function () { var id = c.getAttribute('data-st'); setAktiv(id); go('spieltag', { stId: id }); }); });
  }
  function viewNeu() {
    var n = state.neu || (state.neu = { datum: M.today(), gegner: '', ort: 'Heim', groesse: '', spielzeit: '' });
    var vorlage = M.sortSpieltage(data.spieltage)[0];
    return '<div class="card"><h2>Neuer Spieltag</h2><label class="f">Datum</label><input type="date" id="nDat" value="' + esc(n.datum) + '">' +
      '<label class="f">Gegner</label><input type="text" id="nGeg" list="gegnerDl" placeholder="z. B. Hemden" value="' + esc(n.gegner) + '">' + gegnerDatalist() + '<div class="muted" id="nGegH">' + gegnerHinweis(n.gegner) + '</div>' +
      '<label class="f">Heim / Auswärts</label>' + segHtml('nOrt', n.ort, [['Heim', 'Heim'], ['Auswärts', 'Auswärts']]) +
      '<label class="f">Gegnerstärke (optional)</label>' + segHtml('nGs', n.gegnerStaerke || '', [['', 'unbekannt'], ['schwach', 'schwach'], ['mittel', 'mittel'], ['stark', 'stark']], 'small') +
      '<label class="f">Spielform (optional)</label>' + segHtml('nGr', n.groesse, [['', 'offen'], ['7', '7er'], ['9', '9er']]) +
      '<label class="f">Spielzeit gesamt (Min.)</label><input type="number" id="nZeit" placeholder="' + M.STANDARD_SPIELZEIT + ' (2 × 30)" value="' + esc(n.spielzeit) + '">' +
      '<div class="muted" style="margin-top:8px">' + (vorlage ? 'Zusagen, Kapitän und Einstellungen werden vom vorherigen Spieltag übernommen (' + esc(M.titel(vorlage)) + ').' : 'Erster Spieltag: alle Einstellungen auf Standard.') + '</div>' +
      '<button class="btn" id="nOk">Spieltag anlegen</button></div>';
  }
  function bindNeu() {
    var n = state.neu;
    $('#nDat').addEventListener('change', function (e) { n.datum = e.target.value; });
    $('#nGeg').addEventListener('input', function (e) { n.gegner = e.target.value; $('#nGegH').innerHTML = gegnerHinweis(n.gegner); });
    $('#nZeit').addEventListener('input', function (e) { n.spielzeit = e.target.value; });
    bindSeg('nOrt', function (v) { n.ort = v; }); bindSeg('nGs', function (v) { n.gegnerStaerke = v; }); bindSeg('nGr', function (v) { n.groesse = v; });
    $('#nOk').addEventListener('click', function () {
      if (!n.datum) { toast('Bitte ein Datum wählen'); return; }
      var z = parseFloat(n.spielzeit);
      var st = M.neuerSpieltag(data, { datum: n.datum, gegner: n.gegner, ort: n.ort, gegnerStaerke: n.gegnerStaerke || '', groesse: n.groesse, spielzeit: E.isNum(z) && z > 0 ? z : undefined });
      state.neu = null; if (st.groesse) state.size = st.groesse; commit(); toast('Spieltag angelegt'); go('spieltag', { stId: st.id });
    });
  }
  function viewSpieltagDetail() {
    var st = M.getSpieltag(data, state.stId), S = Object.assign({ zusagenVerwenden: true }, st.settings), closed = st.status === 'abgeschlossen';
    var Rst = closed ? null : (st.id === data.aktiverSpieltag ? R : M.berechne(data, st));
    var erg = ergebnisText(st), gg = M.gegnerVon(data, st);
    var h = gegnerInfoKarte(st) + '<div class="card"><h2>Spiel</h2><div class="grid2"><div><label class="f">Datum</label><input type="date" id="dDat" value="' + esc(st.datum) + '"></div><div><label class="f">Gegner</label><input type="text" id="dGeg" list="gegnerDl" value="' + esc(st.gegner) + '">' + gegnerDatalist() + (gg ? '<button class="linkbtn" id="dGegOpen">Gegner-Datei ›</button>' : '') + '</div></div>' +
      '<label class="f">Heim / Auswärts</label>' + segHtml('dOrt', st.ort, [['Heim', 'Heim'], ['Auswärts', 'Auswärts']]) +
      '<label class="f">Gegnerstärke (für Form und Vorschläge, mild)</label>' + segHtml('dGs', st.gegnerStaerke || '', [['', 'unbekannt'], ['schwach', 'schwach'], ['mittel', 'mittel'], ['stark', 'stark']], 'small') +
      '<label class="ck"><input type="checkbox" id="dOw"' + (st.ohneWertung ? ' checked' : '') + '> Spiel ohne Wertung (z. B. Freundschaftsspiel) – zählt nicht für Bilanz, Form und Vorschläge</label>' +
      '<div class="grid2"><div><label class="f">Spielform</label>' + segHtml('dGr', st.groesse, [['', 'offen'], ['7', '7er'], ['9', '9er']], 'small') + '</div><div><label class="f">Spielzeit (Min.)</label><input type="number" id="dZeit" value="' + esc(st.spielzeit) + '"></div></div>' +
      '<div class="grid2"><div><label class="f">Anpfiff</label><input type="time" id="dUhr" value="' + esc(st.uhrzeit || '') + '"></div><div><label class="f">Treffen</label><input type="time" id="dTreff" value="' + esc(st.treffen || '') + '"></div></div>' + (function () { var o = WT ? wtOrt(st) : null, g = M.gegnerVon(data, st); if (!o && st.ort === 'Auswärts' && g && g.platz) o = { adresse: g.platz, name: g.platz }; return o ? '<label class="f">Spielort</label><div class="d-ort">' + ortLink(o) + '</div>' : ''; })() + '</div>';
    h += '<div class="card ' + (closed ? 'lockcard' : '') + '"><h2>' + (closed ? '🔒 Abgeschlossen' : 'Status: offen') + '</h2>' +
      (closed ? '<div class="muted">Vorschlag (Aufstellung und Auswechseloptionen) eingefroren am ' + esc(new Date(st.snapshot.erstellt).toLocaleString('de-DE')) + '. Spätere Notenänderungen ändern ihn nicht.</div><button class="btn sec" id="dOpen">Wieder öffnen</button>'
        : '<div class="muted">Der Vorschlag rechnet live mit den aktuellen Noten und Zusagen. „Abschließen“ friert ihn für diesen Spieltag ein.</div><button class="btn" id="dClose">Spieltag abschließen</button>') +
      '<button class="btn sec" id="dAuf">Vorgeschlagene Aufstellung ansehen</button>' +
      '<button class="btn" id="dLive">' + (!st.live || st.live.phase === 'vor' ? '▶ Live-Modus: Spiel starten' : (st.live.phase === 'ende' ? '📄 Spielzusammenfassung' : '⏱ Live-Spiel läuft – öffnen')) + '</button>' +
      '<button class="btn sec" id="dSpiel">Spielbericht: Startelf, Ereignisse' + (erg ? ' (' + erg + ')' : '') + '</button>' +
      '<button class="btn sec" id="dBew">Spielbewertung' + (anzahlBewertet(st) ? ' (' + anzahlBewertet(st) + ' bewertet)' : '') + '</button></div>';
    h += wtKarte(st);
    h += fsKarte(st);
    h += tkKarte(st);
    var dis = closed ? ' disabled' : '';
    var kapOpts = [['', '– kein Kapitän –']].concat(named().map(function (i) { var n = data.players[i].name; return [E.firstName(n), n]; }));
    if (S.kapitaen && !kapOpts.some(function (o) { return o[0] === S.kapitaen || o[1] === S.kapitaen; })) kapOpts.push([S.kapitaen, S.kapitaen + ' (nicht im Kader)']);
    h += '<div class="card"><h2>Spieltag-Vorgaben</h2>' + (closed ? '<div class="warnbox">Abgeschlossen – zum Ändern wieder öffnen.</div>' : '') +
      '<label class="f">Zusagen verwenden</label>' + segHtml('sZus', S.zusagenVerwenden ? '1' : '0', [['1', 'Ja'], ['0', 'Nein (alle Fitten)']]) +
      '<label class="f">Offen mitplanen</label>' + segHtml('sOff', S.offenMitplanen ? '1' : '0', [['1', 'Ja'], ['0', 'Nein']]) +
      '<label class="f">Kapitän</label>' + sel('sKap', S.kapitaen || '', kapOpts, dis) +
      '<label class="f">Kapitän immer in Startelf</label>' + segHtml('sKS', S.kapitaenStartelf ? '1' : '0', [['1', 'Ja'], ['0', 'Nein']]) +
      ['7', '9'].map(function (sz) { var pr = paarVon(st, sz), o = E.PITCHES.filter(function (p) { return p.size === sz; }).map(function (p) { return [p.code, p.kurz]; });
        return '<label class="f">Vorschlags-Formationen ' + sz + 'er (Abwehr / Angriff)</label><div class="grid2"><div>' + sel('sPA' + sz, pr[0], o, dis) + '</div><div>' + sel('sPB' + sz, pr[1], o, dis) + '</div></div>'; }).join('') +
      '<label class="f">Gewicht Kondition für Aufstellung (Standard 2)</label><div class="row"><button class="btn sec" style="width:56px" id="kMinus"' + dis + '>−</button><input type="number" step="0.5" min="0" max="5" id="sKond" value="' + esc(S.gewichtKondition) + '" style="text-align:center"' + dis + '><button class="btn sec" style="width:56px" id="kPlus"' + dis + '>+</button></div>' +
      '<div class="muted">Zuschlag = Gewicht × (Ausdauer − 3) × 0,25; gilt nicht für TW.</div></div>';
    if (Rst) {
      var L = Rst.lineups;
      h += '<div class="card"><div class="row"><div class="grow"><b>' + L.einsetzbar + ' Kinder einsetzbar</b>' + (L.kapitaenNr ? '<div class="muted">Kapitän: ' + esc(L.kinder[L.kapitaenNr - 1].vor) + (L.kapitaenGesetzt ? ' (gesetzt)' : (L.kinder[L.kapitaenNr - 1].P ? '' : ' – nicht einsetzbar')) + '</div>' : (S.kapitaen ? '<div class="muted">Kapitän „' + esc(S.kapitaen) + '“ nicht im Kader gefunden</div>' : '')) + '</div>' +
        '<button class="btn sec" style="width:auto" id="allZ">Alle zusagen</button></div>' +
        (L.nichtEingeplant.length ? '<div class="muted" style="margin-top:6px">Nicht eingeplant: ' + L.nichtEingeplant.map(function (x) { return esc(x.name) + ' (' + esc(x.grund) + ')'; }).join(', ') + '</div>' : '') + '</div>';
    }
    h += '<div class="card"><h2>Zusagen</h2>';
    named().forEach(function (i) {
      var p = data.players[i], stt = st.zusagen[p.id] || '', inj = p.verfuegbarkeit === 'Verletzt' || p.verfuegbarkeit === 'Abwesend';
      var einsetzbar = Rst ? Rst.lineups.kinder[i].P : null;
      h += '<div class="skill"><div class="lbl"><span><b>' + esc(p.name) + '</b> <span class="muted">#' + esc(p.nr === null ? '–' : p.nr) + '</span>' + (inj ? ' <span class="chip off">' + esc(p.verfuegbarkeit) + '</span>' : (p.verfuegbarkeit !== 'Fit' ? ' <span class="chip">' + esc(p.verfuegbarkeit) + '</span>' : '')) + '</span>' +
        (einsetzbar === null ? '' : (einsetzbar ? '<span class="chip" style="background:#c8e6c9">einsetzbar</span>' : '<span class="chip off">nicht dabei</span>')) + '</div>' +
        '<div class="seg small zs" data-pid="' + p.id + '"><button class="z' + (stt === 'Zugesagt' ? ' on' : '') + '" data-v="Zugesagt"' + dis + '>Zugesagt</button><button class="o' + (stt === 'Offen' ? ' on' : '') + '" data-v="Offen"' + dis + '>Offen</button><button class="a' + (stt === 'Abgesagt' ? ' on' : '') + '" data-v="Abgesagt"' + dis + '>Abgesagt</button></div></div>';
    });
    h += '<div class="muted" style="margin-top:6px">Verletzt/Abwesend (im Spielerbogen) und Abgesagt sind nie dabei. Ohne Eintrag gilt „nicht gemeldet“.</div></div>';
    return h + '<button class="btn warn" id="dDel">Spieltag löschen</button>';
  }
  function bindSpieltagDetail() {
    var st = M.getSpieltag(data, state.stId), S = st.settings, closed = st.status === 'abgeschlossen';
    function upd(fn) { fn(); commit(); keepScroll(render); }
    $('#dDat').addEventListener('change', function (e) { upd(function () { st.datum = e.target.value; }); });
    $('#dGeg').addEventListener('change', function (e) { upd(function () { st.gegner = e.target.value.trim(); M.gegnerVerknuepfen(data, st); }); });
    if ($('#dGegOpen')) $('#dGegOpen').addEventListener('click', function () { gegnerOeffnen(M.gegnerVon(data, st).id); });
    bindGegnerInfo(st);
    tkKarteBinden(st); fsBinden(st); wtBinden(st);
    $('#dUhr').addEventListener('change', function (e) { upd(function () { st.uhrzeit = e.target.value; delete st.wetter; }); });
    $('#dTreff').addEventListener('change', function (e) { upd(function () { st.treffen = e.target.value; }); });
    $('#dZeit').addEventListener('change', function (e) { upd(function () { var z = parseFloat(e.target.value); st.spielzeit = E.isNum(z) && z > 0 ? z : M.STANDARD_SPIELZEIT; }); });
    bindSeg('dOrt', function (v) { upd(function () { st.ort = v; }); });
    bindSeg('dGs', function (v) { upd(function () { if (v) st.gegnerStaerke = v; else delete st.gegnerStaerke; }); });
    $('#dOw').addEventListener('change', function (e) { upd(function () { if (e.target.checked) st.ohneWertung = true; else delete st.ohneWertung; }); });
    bindSeg('dGr', function (v) { upd(function () { st.groesse = v; if (v) state.size = v; }); });
    if (closed) $('#dOpen').addEventListener('click', function () { if (!confirm('Spieltag wieder öffnen? Der eingefrorene Vorschlag wird verworfen und wieder live berechnet. Spielbericht und Bewertungen bleiben.')) return; upd(function () { M.wiederOeffnen(data, st.id); }); toast('Spieltag wieder geöffnet'); });
    else $('#dClose').addEventListener('click', function () { upd(function () { M.abschliessen(data, st.id); }); toast('Abgeschlossen – Aufstellung eingefroren'); });
    $('#dAuf').addEventListener('click', function () { setAktiv(st.id); setTab('aufstellung'); });
    $('#dBew').addEventListener('click', function () { go('bewertung'); });
    $('#dSpiel').addEventListener('click', function () { go('spiel'); });
    $('#dLive').addEventListener('click', function () { go(st.live && st.live.phase === 'ende' ? 'zusammenfassung' : 'live'); });
    $('#dDel').addEventListener('click', function () {
      if (!confirm('Spieltag „' + M.titel(st) + '“ mit Zusagen, Spielbericht, Spielbewertungen und eingefrorener Aufstellung löschen?')) return;
      sichern('vor_st_loeschen'); M.loescheSpieltag(data, st.id); commit(); state.sub = null; state.stId = null; render(); toast('Spieltag gelöscht');
    });
    if (closed) return;
    var segB = function (id, key) { bindSeg(id, function (v) { upd(function () { S[key] = v === '1'; }); }); };
    segB('sZus', 'zusagenVerwenden'); segB('sOff', 'offenMitplanen'); segB('sKS', 'kapitaenStartelf');
    ['7', '9'].forEach(function (sz) { ['A', 'B'].forEach(function (ab, k) { $('#sP' + ab + sz).addEventListener('change', function (e) { setzePaar(st, sz, k, e.target.value); keepScroll(render); }); }); });
    $('#sKap').addEventListener('change', function (e) { upd(function () { S.kapitaen = e.target.value; }); });
    function setK(v) { v = Math.max(0, Math.min(5, Math.round(v * 2) / 2)); upd(function () { S.gewichtKondition = v; }); }
    $('#sKond').addEventListener('change', function (e) { setK(parseFloat(String(e.target.value).replace(',', '.')) || 0); });
    $('#kMinus').addEventListener('click', function () { setK((+S.gewichtKondition || 0) - 0.5); });
    $('#kPlus').addEventListener('click', function () { setK((+S.gewichtKondition || 0) + 0.5); });
    if ($('#allZ')) $('#allZ').addEventListener('click', function () { upd(function () { named().forEach(function (i) { st.zusagen[data.players[i].id] = 'Zugesagt'; }); }); toast('Alle auf „Zugesagt“ gesetzt'); });
    $$('.zs').forEach(function (s) { s.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; upd(function () { st.zusagen[+s.getAttribute('data-pid')] = b.getAttribute('data-v'); }); }); });
  }

  // ---------- Spielbericht ----------
  function gespielteIds(st) {
    var ids = [];
    M.startelfListe(st).forEach(function (x) { if (x.pid && ids.indexOf(x.pid) < 0) ids.push(x.pid); });
    M.spielbericht(st).wechsel.forEach(function (w) { if (w.rein && ids.indexOf(w.rein) < 0) ids.push(w.rein); });
    return ids;
  }
  function kaderIds(st) {   // Zugesagte zuerst, dann der Rest
    var all = named().map(function (i) { return data.players[i].id; }).concat(ehemaligeIn(st));   // ehemalige nur, wenn sie hier schon vorkommen
    var zu = all.filter(function (id) { return st.zusagen[id] === 'Zugesagt'; });
    return zu.concat(all.filter(function (id) { return zu.indexOf(id) < 0; }));
  }
  function pitchBg() {
    var h = '';
    for (var s = 0; s < 10; s += 2) h += '<div class="stripe" style="top:' + (s * 10) + '%"></div>';
    return h + '<div class="ln" style="left:4%;right:4%;top:50%;height:0;border-width:2px 0 0 0"></div>' +
      '<div class="ln" style="left:50%;top:50%;width:22%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%)"></div>' +
      '<div class="ln" style="left:22%;right:22%;bottom:3%;height:15%;border-bottom:0"></div><div class="ln" style="left:36%;right:36%;bottom:3%;height:6%;border-bottom:0"></div>' +
      '<div class="ln" style="left:22%;right:22%;top:3%;height:15%;border-top:0"></div><div class="ln" style="left:36%;right:36%;top:3%;height:6%;border-top:0"></div>';
  }
  function token(p, pos, attrs, kap) {
    return '<div class="tok' + (pos === 'TW' ? ' tw' : '') + (p ? '' : ' frei') + '" ' + attrs + '>' + avatar(p, 'm') + (pos ? '<span class="tpos">' + esc(pos) + '</span>' : '') + (kap ? '<span class="cpt tc">C</span>' : '') +
      '<span class="tnm">' + (p ? esc(E.firstName(p.name)) + (p.nr !== null && p.nr !== '' ? ' · ' + esc(p.nr) : '') : 'frei') + '</span></div>';
  }
  function startelfEditor(st) {
    var se = st.spiel.startelf, f = null; E.PITCHES.forEach(function (x) { if (x.code === se.formation) f = x; });
    var h = '<div id="seEd"><div class="pitch edit">' + pitchBg();
    f.slots.forEach(function (sl, i) {
      var p = se.slots[i] ? pById(se.slots[i]) : null;
      h += '<div class="spot" style="left:' + sl[1] + '%;top:' + sl[2] + '%" data-drop="s:' + i + '">' + token(p, sl[0], 'data-drag="s:' + i + '" data-drop="s:' + i + '"', istKapitaen(st, p)) + '</div>';
    });
    h += '</div>';
    var on = se.slots.filter(Boolean), alle = kaderIds(st).filter(function (id) { return on.indexOf(id) < 0; });
    var sicht = state.benchAlle ? alle : alle.filter(function (id) { var p = pById(id); return st.zusagen[id] === 'Zugesagt' || M.hatGespielt(st, id) || !st.settings.zusagenVerwenden && p.verfuegbarkeit !== 'Verletzt' && p.verfuegbarkeit !== 'Abwesend'; });
    h += '<div class="bench" data-drop="bank"><div class="bhead"><b>Bank</b><span class="muted">' + sicht.length + (sicht.length === 1 ? ' Kind' : ' Kinder') + '</span>' +
      (alle.length !== sicht.length || state.benchAlle ? '<button class="btn small sec" id="benchAll">' + (state.benchAlle ? 'Nur Zugesagte' : 'Alle Kinder (' + alle.length + ')') + '</button>' : '') + '</div><div class="bgrid">';
    sicht.forEach(function (id) { var p = pById(id); h += token(p, '', 'data-drag="b:' + id + '"' + (st.zusagen[id] === 'Zugesagt' ? '' : ' data-x="1"'), istKapitaen(st, p)); });
    if (!sicht.length) h += '<div class="muted" style="padding:10px">Hierher ziehen, um eine Position frei zu machen.</div>';
    return h + '</div></div></div>';
  }
  // ---------- Ereignisse: einfügen / bearbeiten / löschen (Spielbericht, Live, Zusammenfassung) ----------
  var EV_TYPEN = [['tor', '⚽ Tor'], ['gegentor', '🥅 Gegentor'], ['wechsel', '🔁 Wechsel'], ['fehler', '⚠ Abwehrfehler'], ['notiz', '📝 Notiz'], ['karte', '🟨 Karte / Verletzung'], ['tausch', '↔ Positionstausch']];
  var EV_LISTE = { tor: 'tore', gegentor: 'gegen', wechsel: 'wechsel', fehler: 'fehler', notiz: 'notizen', karte: 'karten', tausch: 'tausch' };
  function typVonListe(l) { for (var k in EV_LISTE) if (EV_LISTE[k] === l) return k; return null; }
  function aufPlatzIds(st, minute) { return M.liveAufstellung(st, minute).map(function (x) { return x.pid; }).filter(Boolean); }
  function jetztMinute(st) { var L = st.live; if (L && L.phase !== 'vor') return M.liveMinute(st, Date.now()); return null; }
  function letzteMinute(st) { var s = M.spielbericht(st), ms = []; ['tore', 'fehler', 'wechsel', 'gegen', 'notizen', 'karten', 'tausch'].forEach(function (k) { s[k].forEach(function (x) { if (E.isNum(x.minute)) ms.push(x.minute); }); }); return ms.length ? Math.max.apply(null, ms) : null; }
  // Formular je Typ; e = vorhandenes Ereignis (Bearbeiten) oder null (neu)
  function evSheet(st, typ, e, minute) {
    var T = M.spielzeitVon(st), neu = !e, v = { p1: null, p2: null, art: 'Gelb' };
    if (e) {
      if (typ === 'tor') { v.p1 = e.pid; v.p2 = e.assist; } else if (typ === 'gegentor') v.p1 = e.fehlerPid; else if (typ === 'wechsel') { v.p1 = e.rein; v.p2 = e.raus; }
      else if (typ === 'fehler' || typ === 'notiz') v.p1 = e.pid; else if (typ === 'karte') { v.p1 = e.pid; v.art = e.art; } else if (typ === 'tausch') { v.p1 = e.a; v.p2 = e.b; }
      minute = e.minute; v.elf = !!e.elfmeter;
    }
    var on = aufPlatzIds(st, E.isNum(minute) ? minute : null), alle = kaderIds(st), bank = alle.filter(function (id) { return on.indexOf(id) < 0; });
    var feldZuerst = on.concat(bank), titel = { tor: 'Tor für PSV', gegentor: 'Gegentor', wechsel: 'Wechsel', fehler: 'Abwehrfehler', notiz: 'Notiz', karte: 'Karte / Verletzung', tausch: 'Positionstausch' }[typ];
    var h = '<h3>' + (neu ? titel + (st.live && st.live.phase !== 'vor' && neu && E.isNum(jetztMinute(st)) ? '' : ' einfügen') : titel + ' bearbeiten') + '</h3>';
    h += '<div class="bwl">Minute</div>' + stepper('evMin', minute);
    if (typ === 'tor') h += '<div class="bwl">Torschütze</div>' + pickGrid('p1', feldZuerst, v.p1, e && !e.pid ? '<button data-v="" class="leer' + (v.p1 ? '' : ' on') + '">unbekannt</button>' : '') + '<div class="bwl">Vorlage (optional)</div>' + pickGrid('p2', feldZuerst, v.p2, '<button data-v="" class="leer' + (v.p2 ? '' : ' on') + '">ohne</button>');
    if (typ === 'gegentor') h += '<div class="bwl">Abwehrfehler davor? (optional)</div>' + pickGrid('p1', feldZuerst, v.p1, '<button data-v="" class="leer' + (v.p1 ? '' : ' on') + '">keiner</button>');
    if (typ === 'wechsel') h += '<div class="bwl">Kommt rein</div>' + pickGrid('p1', neu ? bank : alle, v.p1) + '<div class="bwl">Geht raus</div>' + pickGrid('p2', neu ? on : alle, v.p2);
    if (typ === 'fehler') h += '<div class="bwl">Spieler</div>' + pickGrid('p1', feldZuerst, v.p1) + '<div class="bwl">Notiz (optional)</div><input type="text" id="evTxt" value="' + esc(e ? e.notiz : '') + '" placeholder="z. B. Ball im Aufbau verloren">';
    if (typ === 'notiz') h += '<div class="bwl">Notiz</div><textarea id="evTxt" placeholder="z. B. mehr über außen spielen">' + esc(e ? e.text : '') + '</textarea><div class="bwl">Spieler (optional)</div>' + pickGrid('p1', feldZuerst, v.p1, '<button data-v="" class="leer' + (v.p1 ? '' : ' on') + '">keiner</button>');
    if (typ === 'karte') h += '<div class="bwl">Art</div>' + segHtml('evArt', v.art, [['Gelb', '🟨 Gelb'], ['Rot', '🟥 Rot'], ['Zeitstrafe', '⏱ Zeitstrafe'], ['Verletzung', '🩹 Verletzung']], 'small') + '<div class="bwl">Spieler</div>' + pickGrid('p1', feldZuerst, v.p1);
    if (typ === 'tausch') h += '<div class="bwl">Spieler 1</div>' + pickGrid('p1', on.length ? on : alle, v.p1) + '<div class="bwl">Spieler 2</div>' + pickGrid('p2', on.length ? on : alle, v.p2);
    if (typ === 'tor' || typ === 'gegentor') h += '<label class="ck"><input type="checkbox" id="evElf"' + (v.elf ? ' checked' : '') + '> Elfmeter</label>';
    h += '<button class="btn" id="evOk">Speichern</button>' + (e ? '<button class="btn warn" id="evDel">Ereignis löschen</button>' : '');
    openSheet(h, function (root) {
      ['p1', 'p2'].forEach(function (k) { if ($('.pick[data-name="' + k + '"]', root)) bindPick(root, k, function (x) { v[k] = x; }); });
      if ($('#evArt')) bindSeg('evArt', function (x) { v.art = x; });
      bindStepper(root, T + 40);
      $('#evOk').addEventListener('click', function () {
        var mi = numVal('evMin'), txt = $('#evTxt') ? $('#evTxt').value.trim() : '';
        var elf = $('#evElf') ? $('#evElf').checked : false;
        var fehlt = ((typ === 'tor' && !(e && !e.pid)) || typ === 'fehler' || typ === 'karte') && !v.p1 ? 'Bitte den Spieler wählen' : (typ === 'wechsel' || typ === 'tausch') && (!v.p1 || !v.p2) ? 'Bitte beide Spieler wählen' : typ === 'notiz' && !txt ? 'Bitte eine Notiz eingeben' : (v.p1 && v.p1 === v.p2 && typ !== 'tor') ? 'Zweimal dasselbe Kind' : '';
        if (fehlt) { toast(fehlt); return; }
        if (typ === 'tor' && v.p2 === v.p1) v.p2 = null;
        var x;
        if (e) {
          var c = { minute: mi };
          if (typ === 'tor') { c.pid = v.p1 || null; c.assist = v.p2 || null; } else if (typ === 'gegentor') c.fehlerPid = v.p1 || null;
          if (typ === 'tor' || typ === 'gegentor') c.elfmeter = elf; else if (typ === 'wechsel') { c.rein = v.p1; c.raus = v.p2; }
          else if (typ === 'fehler') { c.pid = v.p1; c.notiz = txt; } else if (typ === 'notiz') { c.text = txt; c.pid = v.p1 || null; } else if (typ === 'karte') { c.pid = v.p1; c.art = v.art; } else if (typ === 'tausch') { c.a = v.p1; c.b = v.p2; }
          M.bearbeiteEreignis(st, e.id, c);
        } else {
          if (typ === 'tor') x = M.addTor(st, v.p1, v.p2, mi); else if (typ === 'gegentor') x = M.addGegentor(st, mi, v.p1); else if (typ === 'wechsel') x = M.addWechsel(st, mi, v.p1, v.p2);
          else if (typ === 'fehler') x = M.addFehler(st, v.p1, mi, txt); else if (typ === 'notiz') x = M.addNotiz(st, mi, txt, v.p1); else if (typ === 'karte') x = M.addKarte(st, mi, v.p1, v.art); else x = M.addTausch(st, mi, v.p1, v.p2);
          if (elf && (typ === 'tor' || typ === 'gegentor')) x.elfmeter = true;
          if (M.liveLaeuft(st)) x.zeit = Date.now();
        }
        nachEreignis(st); closeSheet(); keepScroll(render); toast(e ? 'Geändert' : titel + ' eingetragen');
      });
      if ($('#evDel')) $('#evDel').addEventListener('click', function () { if (!confirm('Ereignis löschen?')) return; M.entferneEreignis(st, e.id); nachEreignis(st); closeSheet(); keepScroll(render); toast('Gelöscht'); });
    });
  }
  function nachEreignis(st) { if (st.live && st.live.phase === 'ende') st.live.zusammenfassung = M.zusammenfassungText(data, st); commit(); }
  function einfuegenSheet(st) {
    var m = jetztMinute(st); if (!E.isNum(m)) m = letzteMinute(st);
    openSheet('<h3>Ereignis einfügen</h3><div class="muted">Vergessenes Ereignis nachtragen – Minute im nächsten Schritt wählen.</div><div class="evtypes">' + EV_TYPEN.map(function (t) { return '<button data-typ="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>', function (root) {
      $$('[data-typ]', root).forEach(function (b) { b.addEventListener('click', function () { evSheet(st, b.getAttribute('data-typ'), null, m); }); });
    });
  }
  function timelineHtml(st, b) {
    b = b || M.bericht(data, st);
    return '<div class="card"><div class="row"><h2 class="grow" style="margin:0">Spielverlauf</h2><button class="btn small" id="evIns">+ Ereignis einfügen</button></div><div style="height:6px"></div>' +
      (b.ereignisse.length ? b.ereignisse.map(function (e) { return '<div class="evt ' + e.typ + '" data-ev="' + e.id + '"><span class="min">' + (E.isNum(e.minute) ? e.minute + '′' : '–') + '</span><span class="grow">' + esc(e.text) + '</span><span class="chev">✎</span></div>'; }).join('') : '<div class="muted">Noch keine Ereignisse.</div>') +
      '<div class="muted" style="margin-top:6px">Eintrag antippen = Minute, Spieler oder Text ändern bzw. löschen. Ergebnis, Minuten, Schlussaufstellung und Statistik rechnen automatisch neu.</div></div>';
  }
  function fwSheet(st, e) {   // Formationswechsel: Minute ändern oder löschen
    dialog('Formationswechsel', '<p>' + esc(E.pitchByCode(e.formation) ? E.pitchByCode(e.formation).name : e.formation) + '</p><label class="f">Minute</label><input type="number" id="fwMin" min="0" max="120" value="' + (E.isNum(e.minute) ? e.minute : '') + '">', [
      { t: 'Speichern', f: function (m) { var v = parseInt($('#fwMin', m).value, 10); e.minute = E.isNum(v) ? v : null; nachEreignis(st); keepScroll(render); } },
      { t: 'Löschen', sek: true, f: function () { var L = M.spielbericht(st).formwechsel; L.splice(L.indexOf(e), 1); nachEreignis(st); keepScroll(render); } },
      { t: 'Abbrechen', sek: true }]);
  }
  function bindTimeline(st) {
    if ($('#evIns')) $('#evIns').addEventListener('click', function () { einfuegenSheet(st); });
    $$('.evt[data-ev]').forEach(function (r) { r.addEventListener('click', function () { var f = M.findeEreignis(st, r.getAttribute('data-ev')); if (f && f.liste === 'formwechsel') return fwSheet(st, f.ev); if (f) evSheet(st, typVonListe(f.liste), f.ev); }); });
  }
  function minutenHtml(st, b) {
    var T = M.spielzeitVon(st), m = b.minuten, ks = Object.keys(m).sort(function (a, c) { return m[c] - m[a] || vorn(+a).localeCompare(vorn(+c)); });
    return '<div class="card"><h2>Einsatzzeiten <span class="muted">(Spielzeit ' + T + ' Min.)</span></h2>' + (ks.length ? '<table><tbody>' + ks.map(function (k) { return '<tr><td>' + esc(vorn(+k)) + '</td><td class="c"><div class="mbar"><div style="width:' + Math.min(100, Math.round(100 * m[k] / T)) + '%"></div></div></td><td class="c"><b>' + m[k] + '′</b></td></tr>'; }).join('') + '</tbody></table>' : '<div class="muted">–</div>') +
      '<div class="muted" style="margin-top:6px">Berechnet aus Startelf und Wechseln.</div></div>';
  }
  function scoreHtml(st, b, mitKnoepfen) {
    return '<div class="card score"><div class="sc"><div class="team">PSV Wesel-Lackhausen</div><div class="res"><b id="erg">' + b.tore + ' : ' + b.gegentore + '</b></div><div class="team">' + esc(st.gegner || 'Gegner') + '</div></div>' +
      (mitKnoepfen ? '<div class="row qa"><button class="btn" data-neu="tor">⚽ Tor</button><button class="btn sec" data-neu="gegentor">🥅 Gegentor</button><button class="btn" data-neu="wechsel">🔁 Wechsel</button></div>' +
        '<div class="row qa"><button class="btn warn" data-neu="fehler">⚠ Abwehrfehler</button><button class="btn sec" data-neu="notiz">📝 Notiz</button><button class="btn sec" data-neu="karte">🟨 Karte/Verl.</button></div>' : '') + '</div>';
  }
  function bindNeuKnoepfe(st) { $$('[data-neu]').forEach(function (b) { b.addEventListener('click', function () { var t = b.getAttribute('data-neu'), m = jetztMinute(st); if (!E.isNum(m)) m = letzteMinute(st); evSheet(st, t, null, m); }); }); }

  // ---------- Wetter zur Spielzeit (ab 2.4; DWD über Bright Sky) ----------
  var WT = window.PSVWetter, wtLaeuft = {};
  function wtCache(id) { try { return JSON.parse(localStorage.getItem('psv_wetter_' + id) || 'null'); } catch (e) { return null; } }
  function wtCacheSetzen(id, c) { try { localStorage.setItem('psv_wetter_' + id, JSON.stringify(c)); } catch (e) { try { delete c.r; localStorage.setItem('psv_wetter_' + id, JSON.stringify(c)); } catch (e2) { } } }
  function wtJetzt() { return window.__wtJetzt ? window.__wtJetzt() : Date.now(); }
  function wtOrt(st) { return WT ? WT.ort(data, st, M.gegnerVon(data, st)) : null; }
  function wtLive(st) { return st.live && st.live.phase && st.live.phase !== 'vor' ? st.live.phase : null; }
  function wtHolen(url) {
    return new Promise(function (ok, fehler) {
      var x = new XMLHttpRequest(), t = setTimeout(function () { try { x.abort(); } catch (e) { } fehler(new Error('Zeitüberschreitung')); }, 15000);
      x.open('GET', url); x.onload = function () { clearTimeout(t); if (x.status === 200) { try { ok(JSON.parse(x.responseText)); } catch (e) { fehler(e); } } else fehler(new Error('HTTP ' + x.status)); };
      x.onerror = function () { clearTimeout(t); fehler(new Error('keine Verbindung')); }; x.send();
    });
  }
  function wtFaellig(st, c, ph) {
    var o = wtOrt(st); if (!o) return false;
    if (!c || c.ortKey !== o.lat + ',' + o.lon) return true;
    var alter = wtJetzt() - c.stand;
    return ph === 'live' || ph === 'nah' ? alter > 4.5 * 60000 : ph === 'vorbei' ? !st.wetter && alter > 10 * 60000 : alter > 30 * 60000;
  }
  function wtLaden(st, erzwingen) {
    if (!WT) return Promise.resolve();
    var f = WT.fenster(st), ph = WT.phase(f, wtJetzt(), st.live && st.live.phase), o = wtOrt(st), c = wtCache(st.id);
    if (!f || !o || ph === 'fern' || wtLaeuft[st.id] || navigator.onLine === false) return Promise.resolve();
    if (ph === 'vorbei' && st.wetter && !erzwingen) return Promise.resolve();
    if (!erzwingen && !wtFaellig(st, c, ph)) return Promise.resolve();
    var u = WT.urls(o, f), radar = WT.radarAktiv(f, wtJetzt(), ph);
    wtLaeuft[st.id] = true; wtZeigen(st);
    return Promise.all([wtHolen(u.wetter), radar ? wtHolen(u.radar).catch(function () { return null; }) : Promise.resolve(null), wtHolen(u.warnungen).catch(function () { return null; })]).then(function (r) {
      var alt = c || {}, nc = r[1] ? WT.nowcast(r[1]) : [];
      var log = (alt.log || []).filter(function (x) { return x.t >= f.anpfiff - 600000 && x.t <= f.ende; });   // Radar-Messwerte während des Spiels
      nc.forEach(function (x) { if (x.t <= wtJetzt() + 60000 && x.t >= f.anpfiff && x.t <= f.ende && !log.some(function (y) { return y.t === x.t; })) log.push(x); });
      var neu = { stand: wtJetzt(), ortKey: o.lat + ',' + o.lon, w: { weather: r[0].weather }, r: r[1] || (radar ? null : alt.r && wtJetzt() - alt.stand < 3600000 ? alt.r : null), a: r[2] ? WT.warnungen(r[2]) : alt.a || [], log: log, fehler: '' };
      wtCacheSetzen(st.id, neu);
      if (ph === 'vorbei' || (ph === 'live' && st.live.phase === 'ende')) {   // Endstand im Spieltag festhalten
        var e = WT.abschluss(neu.w, log, f, st.wetter); if (e) { e.text = WT.abschlussText(e); e.stand = neu.stand; st.wetter = e; commit(); }
      }
    }).catch(function (e) { var cc = wtCache(st.id) || {}; cc.fehler = e.message || String(e); wtCacheSetzen(st.id, cc); })
      .then(function () { wtLaeuft[st.id] = false; wtZeigen(st); });
  }
  function wtKarte(st) { return WT ? '<div class="card wtcard" id="wtKarte" data-st="' + esc(st.id) + '">' + wtInhalt(st) + '</div>' : ''; }
  function wtInhalt(st) {
    var f = WT.fenster(st), now = wtJetzt(), ph = WT.phase(f, now, st.live && st.live.phase), o = wtOrt(st), c = wtCache(st.id);
    var h = '<div class="row"><h2 class="grow" style="margin:0">🌦 Wetter zur Spielzeit</h2>' + (o && f ? '<button class="btn small sec" id="wtNeu" aria-label="Aktualisieren">⟳</button>' : '') + '</div>';
    h += '<div class="muted wt-ort">' + (o ? ortLink(o, o.name || (o.lat.toFixed(4) + ', ' + o.lon.toFixed(4))) : '📍 Spielort fehlt') + ' <a href="#" id="wtOrt">ändern</a></div>';
    if (!f) return h + '<div class="muted">Anpfiff-Zeit im Spieltag eintragen, dann erscheint hier das Wetter von Treffen bis Spielende.</div>' + (state.sub !== 'spieltag' ? '<button class="btn small sec" id="wtZeit">Anpfiff eintragen</button>' : '');
    if (!o) return h + '<div class="muted">Auswärtsspiel: bitte den Platz des Gegners suchen oder Koordinaten eingeben.</div><button class="btn small" id="wtOrt2">Spielort festlegen</button>';
    h += '<div class="muted">Treffen ' + WT.hhmm(f.treffen) + ' · Anpfiff ' + WT.hhmm(f.anpfiff) + ' · Ende ca. ' + WT.hhmm(f.ende) + '</div>';
    if (ph === 'fern') return h + '<div class="muted">Die Vorhersage gibt es ab etwa 10 Tage vor dem Spiel.</div>';
    if (ph === 'vorbei' && st.wetter) h += '<div class="wt-end">' + esc(st.wetter.text) + '</div>';
    if (!c || !c.w) return h + '<div class="muted">' + (wtLaeuft[st.id] ? 'Wird geladen…' : navigator.onLine === false ? 'Offline – noch keine Wetterdaten.' : c && c.fehler ? 'Wetter nicht abrufbar: ' + esc(c.fehler) : 'Noch keine Daten.') + '</div>' + wtFuss();
    var S = WT.stunden(c.w, f), W = WT.relevanteWarnungen(c.a || [], f);
    W.forEach(function (w) { h += '<div class="warnbox wt-warn">⚠ ' + esc(w.titel) + ' <span class="muted">(' + WT.hhmm(w.von) + '–' + WT.hhmm(w.bis) + ')</span></div>'; });
    if (S.some(function (x) { return x.gewitter; })) h += '<div class="warnbox wt-warn">⛈ Gewitter möglich – bei Donner Spiel unterbrechen!</div>';
    h += '<div class="wt-std">' + S.map(function (x) {
      return '<div class="wt-h"><b>' + WT.hhmm(x.t) + '</b><span class="wt-i">' + (WT.ICON[x.icon] || '') + '</span><span>' + WT.zahl(x.temp) + ' °C</span><span class="wt-r">💧 ' + (x.mm || 0).toFixed(1).replace('.', ',') + ' mm · ' + WT.zahl(x.wkt) + ' %</span><span class="muted">💨 ' + WT.zahl(x.wind) + (x.boeen ? ' / ' + WT.zahl(x.boeen) : '') + ' km/h</span></div>';
    }).join('') + '</div>';
    var nc = (c.r ? WT.nowcast(c.r) : []).filter(function (x) { return x.t >= now - 10 * 60000; });
    if (nc.length && WT.radarAktiv(f, now, ph)) h += '<div class="wt-nc"><b>' + esc(WT.nowcastText(nc, now)) + '</b>' + wtDiagramm(nc, f, now) + '</div>';
    return h + wtFuss(c);
  }
  function wtDiagramm(nc, f, now) {   // feste Skala in mm/h – nie relativ zum Maximum der Daten
    var H = 96, t0 = nc[0].t, t1 = nc[nc.length - 1].t + 300000, x = function (t) { return ((t - t0) / (t1 - t0) * 100).toFixed(2) + '%'; };
    var g = WT.SKALA.map(function (v) { var y = WT.skalaY(v) * H; return '<div class="wt-gl" style="bottom:' + y + 'px"><span>' + (v === 10 ? '10+' : WT.zahl(v, 1)) + '</span></div>'; }).join('');
    var bars = nc.map(function (p) { var hh = p.mmh >= 0.1 ? Math.max(2, Math.round(WT.skalaY(p.mmh) * H)) : 0; return '<i class="wt-b" title="' + WT.hhmm(p.t) + ' ' + WT.zahl(p.mmh, 1) + ' mm/h" style="left:' + x(p.t) + ';width:' + (100 / nc.length).toFixed(2) + '%;height:' + hh + 'px;background:' + (WT.bandFarbe(p.mmh) || 'transparent') + '"></i>'; }).join('');
    var mark = function (t, cls, txt) { return t >= t0 && t <= t1 ? '<div class="' + cls + '" style="left:' + x(t) + '"><span>' + txt + '</span></div>' : ''; };
    var ticks = '', s = Math.ceil(t0 / 1800000) * 1800000; for (; s <= t1; s += 1800000) ticks += '<span style="left:' + x(s) + '">' + WT.hhmm(s) + '</span>';
    return '<div class="wt-dia"><div class="wt-y">mm/h</div><div class="wt-plot" style="height:' + H + 'px">' + g + bars + mark(now, 'wt-jetzt', 'jetzt') + mark(f.anpfiff, 'wt-an', 'Anpfiff ' + WT.hhmm(f.anpfiff)) + mark(f.ende, 'wt-an', 'Ende') + '</div>' +
      '<div class="wt-x">' + ticks + '</div></div><div class="wt-leg"><span><i style="background:#64b5f6"></i>leicht &lt; 2,5</span><span><i style="background:#1e5bbf"></i>mäßig 2,5–10</span><span><i style="background:#c2185b"></i>stark &gt; 10 mm/h</span></div>';
  }
  // ---------- Karten-Links (2.4.2): Google Maps / Route / Apple Karten ----------
  function mapsUrl(o, art) {
    var q = o && isFinite(o.lat) ? (+o.lat).toFixed(5) + ',' + (+o.lon).toFixed(5) : (o && o.adresse) || '';
    if (art === 'apple') return 'https://maps.apple.com/?' + (o && isFinite(o.lat) ? 'll=' + q + '&q=' + encodeURIComponent(o.name || 'Spielort') : 'q=' + encodeURIComponent(q));
    return art === 'dir' || art === 'nav' ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q) + '&travelmode=driving&dir_action=navigate' : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function navigieren(o) {   // Hauptaktion: Navigation direkt starten
    var b = window.AndroidBridge, url = mapsUrl(o, 'nav');
    if (b && typeof b.navigiere === 'function') b.navigiere(o && isFinite(o.lat) ? (+o.lat).toFixed(5) + ',' + (+o.lon).toFixed(5) : (o && o.adresse) || '', url); else extern(url);
  }
  function kkCopy() { return '<span class="kk-copy">© 2026 MLN Consulting · <a href="https://mlnc.net" data-extern>mlnc.net</a> · <a href="https://mlnc.net" data-extern>Impressum</a></span>'; }
  window.kkCopy = kkCopy;
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[data-extern]'); if (!a) return; e.preventDefault(); extern(a.getAttribute('href')); }, true);
  function extern(url) { var b = window.AndroidBridge; if (b && typeof b.oeffneExtern === 'function') b.oeffneExtern(url); else window.open(url, '_blank', 'noopener'); }
  function ortLink(o, label) {   // o = {lat, lon, name} oder {adresse}
    if (!o || !(isFinite(o.lat) || o.adresse)) return '';
    var d = ' data-lat="' + esc(isFinite(o.lat) ? o.lat : '') + '" data-lon="' + esc(isFinite(o.lon) ? o.lon : '') + '" data-adr="' + esc(o.adresse || '') + '" data-name="' + esc(o.name || label || '') + '"';
    return '<span class="maprow"><a href="#" class="maplink" data-maps="nav"' + d + ' title="Navigation starten (lange drücken: weitere Optionen)">📍 <u>' + esc(label || o.name || o.adresse) + '</u></a> <button class="btn small sec maproute" data-maps="search"' + d + '>🗺 Karte</button></span>';
  }
  function mapsZiel(el) { var la = el.getAttribute('data-lat'); return la !== '' && la !== null ? { lat: +la, lon: +el.getAttribute('data-lon'), name: el.getAttribute('data-name') } : { adresse: el.getAttribute('data-adr'), name: el.getAttribute('data-name') }; }
  function mapsMenue(o) {
    openSheet('<h3>' + esc(o.name || o.adresse || 'Spielort') + '</h3><button class="btn sec" data-mm="nav">🚗 Navigation starten</button><button class="btn sec" data-mm="search">🗺 Karte anzeigen (Google Maps)</button><button class="btn sec" data-mm="apple">🍎 In Apple Karten öffnen</button>', function (root) {
      $$('[data-mm]', root).forEach(function (b) { b.addEventListener('click', function () { closeSheet(); var a = b.getAttribute('data-mm'); if (a === 'nav') navigieren(o); else extern(mapsUrl(o, a)); }); });
    });
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-maps]'); if (!el) return;
    e.preventDefault(); e.stopPropagation(); var a = el.getAttribute('data-maps'), o = mapsZiel(el); if (a === 'nav') navigieren(o); else extern(mapsUrl(o, a));
  }, true);
  document.addEventListener('contextmenu', function (e) { var el = e.target.closest && e.target.closest('.maplink'); if (!el) return; e.preventDefault(); mapsMenue(mapsZiel(el)); });
  function wtFuss(c) {
    return '<div class="muted wt-fuss">' + (c && c.stand ? 'Stand: ' + WT.hhmm(c.stand) + (navigator.onLine === false ? ' · offline' : '') + (c.fehler ? ' · Aktualisierung fehlgeschlagen' : '') + ' · ' : '') + esc(WT.QUELLE) + '</div>';
  }
  function wtZeigen(st) { var k = $('#wtKarte'); if (!k || k.getAttribute('data-st') !== String(st.id)) return; k.innerHTML = wtInhalt(st); wtBinden(st, true); }
  function wtBinden(st, nurKarte) {
    if (!WT || !$('#wtKarte')) return;
    if ($('#wtNeu')) $('#wtNeu').addEventListener('click', function () { wtLaden(st, true); });
    ['#wtOrt', '#wtOrt2'].forEach(function (s) { if ($(s)) $(s).addEventListener('click', function (e) { e.preventDefault(); wtOrtSheet(st); }); });
    if ($('#wtZeit')) $('#wtZeit').addEventListener('click', function () { state.stId = st.id; setTab('spieltag'); go('spieltag'); });
    if (!nurKarte) wtLaden(st);
  }
  function wtGeocode(q) {   // Adresse → Koordinaten (OpenStreetMap Nominatim, nur auf Knopfdruck; Ersatz: Open-Meteo-Ortssuche)
    return wtHolen('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=de&accept-language=de&q=' + encodeURIComponent(q)).then(function (L) {
      if (L && L.length) return L.map(function (x) { return { name: x.display_name.split(', ').slice(0, 4).join(', '), lat: +x.lat, lon: +x.lon, quelle: 'osm' }; });
      return wtHolen('https://geocoding-api.open-meteo.com/v1/search?count=5&language=de&countryCode=DE&name=' + encodeURIComponent(q)).then(function (r) { return ((r && r.results) || []).map(function (x) { return { name: [x.name, x.admin2 || x.admin1].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude, quelle: 'open-meteo' }; }); });
    });
  }
  function wtOrtSetzen(st, o, fuerGegner) {
    st.wetterOrt = { name: o.name, lat: Math.round(o.lat * 1e5) / 1e5, lon: Math.round(o.lon * 1e5) / 1e5, quelle: o.quelle || 'manuell' };
    var g = M.gegnerVon(data, st); if (fuerGegner && g) g.koord = { name: o.name, lat: st.wetterOrt.lat, lon: st.wetterOrt.lon };
    delete st.wetter; commit(); closeSheet(); keepScroll(render); toast('Spielort gespeichert');
  }
  function wtOrtSheet(st) {
    var g = M.gegnerVon(data, st), auswaerts = st.ort === 'Auswärts';
    openSheet('<h3>Spielort für das Wetter</h3>' +
      '<button class="btn sec" id="wsHeim">🏠 Heimplatz: PSV-Sportanlage, Molkereiweg 14a, Wesel</button>' +
      (g && g.koord ? '<button class="btn sec" id="wsGeg">🚩 Platz von ' + esc(g.name) + ': ' + esc(g.koord.name) + '</button>' : '') +
      '<label class="f">Adresse / Sportplatz suchen</label><input type="text" id="wsQ" value="' + esc(auswaerts && g && g.platz ? g.platz + (g.koord ? '' : '') : '') + '" placeholder="z. B. Sportplatz Haldern, Rees"><button class="btn" id="wsSuch">Suchen</button><div id="wsErg"></div>' +
      '<label class="f">oder Koordinaten (Breite, Länge)</label><input type="text" id="wsKo" placeholder="51.6799, 6.6395"><button class="btn sec" id="wsKoOk">Koordinaten übernehmen</button>' +
      '<div class="muted" style="margin-top:8px">Suche: OpenStreetMap Nominatim (© OpenStreetMap-Mitwirkende, ODbL). Übertragen wird nur der Suchtext.</div>', function (root) {
      $('#wsHeim', root).addEventListener('click', function () { var H = WT.HEIM; wtOrtSetzen(st, { name: 'PSV-Sportanlage Molkereiweg 14a, Wesel', lat: H.lat, lon: H.lon, quelle: 'heim' }); });
      if ($('#wsGeg', root)) $('#wsGeg', root).addEventListener('click', function () { wtOrtSetzen(st, Object.assign({ quelle: 'gegner' }, g.koord)); });
      $('#wsSuch', root).addEventListener('click', function () {
        var q = $('#wsQ', root).value.trim(); if (!q) return; var erg = $('#wsErg', root); erg.innerHTML = '<div class="muted">Suche…</div>';
        wtGeocode(q).then(function (L) {
          if (!L.length) { erg.innerHTML = '<div class="muted">Nichts gefunden – andere Schreibweise oder Koordinaten eingeben.</div>'; return; }
          erg.innerHTML = L.map(function (o, i) { return '<button class="btn small sec wt-treffer" data-i="' + i + '">' + esc(o.name) + '</button>'; }).join('');
          $$('[data-i]', erg).forEach(function (b) { b.addEventListener('click', function () { wtOrtSetzen(st, L[+b.getAttribute('data-i')], auswaerts); }); });
        }).catch(function (e) { erg.innerHTML = '<div class="muted">Suche nicht möglich: ' + esc(e.message) + '</div>'; });
      });
      $('#wsKoOk', root).addEventListener('click', function () {
        var m = /(-?\d+[.,]\d+)\s*[,; ]\s*(-?\d+[.,]\d+)/.exec($('#wsKo', root).value); if (!m) { toast('Format: 51.6799, 6.6395'); return; }
        var la = +m[1].replace(',', '.'), lo = +m[2].replace(',', '.'); if (Math.abs(la) > 90 || Math.abs(lo) > 180) { toast('Koordinaten ungültig'); return; }
        wtOrtSetzen(st, { name: la.toFixed(4) + ', ' + lo.toFixed(4), lat: la, lon: lo, quelle: 'manuell' }, auswaerts);
      });
    });
  }
  setInterval(function () {   // alle 5 Min. (nah am Spiel / live), sonst seltener – nur solange die Karte sichtbar ist
    var k = $('#wtKarte'); if (!k || document.hidden) return; var st = M.getSpieltag(data, k.getAttribute('data-st')); if (st) wtLaden(st);
  }, (window.__wtTakt || 60000));
  window.addEventListener('online', function () { var k = $('#wtKarte'); if (k) { var st = M.getSpieltag(data, k.getAttribute('data-st')); if (st) wtLaden(st, true); } });

  // ---------- Formation & Startelf (ab 2.3.1: in jedem Spieltag, jederzeit änderbar) ----------
  function fsLaeuft(st) { return !!(st.live && (st.live.phase === 'h1' || st.live.phase === 'pause' || st.live.phase === 'h2')); }
  function fsFertig(st) { return st.status === 'abgeschlossen' || !!(st.live && st.live.phase === 'ende'); }
  function fsAnsicht(st) {   // ohne erfasste Startelf: Vorschlag anzeigen (wird erst mit der ersten Änderung übernommen)
    var s = st.spiel && st.spiel.startelf; if (s) return { st: st, vorschlag: false };
    var k = JSON.parse(JSON.stringify(st)); M.startelfAusVorschlag(data, k); return { st: k, vorschlag: true };
  }
  function fsKarte(st) {
    var a = fsAnsicht(st), se = a.st.spiel.startelf, f = E.pitchByCode(se.formation), fertig = fsFertig(st), lf = st.spiel && st.spiel.startelf ? M.liveFormation(st, null) : null;
    var h = '<div class="card fscard" id="fsCard"><h2>Formation &amp; Startelf</h2>' +
      (fertig ? '<div class="muted">' + (st.status === 'abgeschlossen' ? '🔒 Abgeschlossen' : 'Abgepfiffen') + ' – Änderungen sind möglich (einmalige Rückfrage). Der eingefrorene „Vorschlag damals“ bleibt unverändert; geändert wird die tatsächliche Startelf.</div>' : '') +
      (fsLaeuft(st) ? '<div class="warnbox">Spiel läuft – Änderungen an der Startelf schreiben die Anfangsaufstellung um, Minuten werden aus dem Spielverlauf neu berechnet. Formationswechsel im Spiel wird als Ereignis eingetragen.</div>' : '') +
      '<button class="btn sec fmbtn" id="fsForm">Formation' + (lf && lf !== se.formation ? ' (Anpfiff)' : '') + ': ' + esc(f ? f.name : se.formation) + ' ▾</button>' +
      (lf && lf !== se.formation ? '<div class="muted">Aktuell nach Formationswechsel: <b>' + esc(E.pitchByCode(lf).name) + '</b></div>' : '') +
      startelfEditor(a.st) +
      '<div class="muted">' + (a.vorschlag ? 'Noch der aktuelle Vorschlag – mit der ersten Änderung wird er als Startelf übernommen. ' : '') + 'Foto auf eine Position ziehen = tauschen, von der Bank = einsetzen, auf die Bank = Position frei. Antippen = Auswahlliste.</div>' +
      (st.snapshot ? '<button class="btn small sec" id="fsDamals">Vorschlag damals ansehen</button>' : '') +
      '<button class="btn small sec" id="fsVor">Neu aus Vorschlag übernehmen</button></div>';
    return h;
  }
  function fsFreigabe(st, weiter) {   // Rückfragen: abgeschlossen/abgepfiffen (einmal je Spieltag), laufendes Spiel (einmal)
    state.fsFrei = state.fsFrei || {};
    if (fsFertig(st) && !state.fsFrei[st.id]) {
      return frage('Abgeschlossenen Spieltag bearbeiten?', 'Formation und Startelf von „' + M.titel(st) + '“ werden geändert. Der eingefrorene Vorschlag bleibt als „Vorschlag damals“ erhalten. Minuten, Statistik, Zusammenfassung und Fair-Play werden neu berechnet. Vorher wird automatisch eine Sicherung angelegt.', 'Bearbeiten', function () { sichern('vor_bearbeiten'); state.fsFrei[st.id] = 1; weiter(); });
    }
    if (fsLaeuft(st) && !state.fsFrei['live' + st.id]) {
      return frage('Startelf nachträglich ändern?', 'Das Spiel läuft bereits. Die Änderung gilt ab Anpfiff – die Einsatzminuten werden aus dem Spielverlauf neu berechnet. Für einen Wechsel jetzt bitte „Wechsel“ verwenden.', 'Startelf ändern', function () { state.fsFrei['live' + st.id] = 1; weiter(); });
    }
    weiter();
  }
  function fsAendern(st, fn) {   // fn(st) ändert die (ggf. erst angelegte) Startelf
    fsFreigabe(st, function () {
      var s = M.spielbericht(st); if (!s.startelf) M.startelfAusVorschlag(data, st);
      if (fn(st) === false) return;
      nachEreignis(st); recalc(); keepScroll(render);
    });
  }
  function fsFormation(st) {
    var a = fsAnsicht(st), akt = fsLaeuft(st) && st.spiel && st.spiel.startelf ? M.liveFormation(st, null) : a.st.spiel.startelf.formation;
    var gr = st.groesse ? String(st.groesse) : (E.pitchByCode(akt) ? String(E.pitchByCode(akt).size) : null);
    formationSheet({ groessen: gr ? [gr] : ['7', '9'], aktuell: akt, st: st, onPick: function (v) {
      if (fsLaeuft(st) && st.spiel && st.spiel.startelf) {
        var m = jetztMinute(st), f = E.pitchByCode(v);
        return dialog('Formation ändern', '<p>Ab jetzt (' + m + '. Minute) in <b>' + esc(f.name) + '</b> spielen – oder wurde von Anfang an anders gespielt?</p>', [
          { t: 'Formationswechsel ab ' + m + '. Minute', f: function () { M.addFormwechsel(st, m, v); nachEreignis(st); recalc(); keepScroll(render); toast('Formationswechsel eingetragen'); } },
          { t: 'Startformation nachträglich ändern', sek: true, f: function () { fsAendern(st, function (x) { M.setFormation(x, v); }); } },
          { t: 'Abbrechen', sek: true }]);
      }
      fsAendern(st, function (x) { M.setFormation(x, v); });
    } });
  }
  function fsBinden(st) {
    if (!$('#fsCard')) return;
    $('#fsForm').addEventListener('click', function () { fsFormation(st); });
    $('#fsVor').addEventListener('click', function () { frage('Neu aus Vorschlag übernehmen?', 'Die Startelf wird mit der vorgeschlagenen Aufstellung' + (st.snapshot ? ' (Vorschlag damals)' : '') + ' überschrieben.', 'Übernehmen', function () { fsAendern(st, function (x) { M.startelfAusVorschlag(data, x, x.spiel.startelf.formation); }); }); });
    if ($('#fsDamals')) $('#fsDamals').addEventListener('click', function () { setAktiv(st.id); setTab('aufstellung'); });
    if ($('#benchAll')) $('#benchAll').addEventListener('click', function () { state.benchAlle = !state.benchAlle; keepScroll(render); });
    function slotSheet(i) {
      var a = fsAnsicht(st), cur = a.st.spiel.startelf.slots[i], pos = M.startelfListe(a.st)[i].pos;
      openSheet('<h3>' + pos + ' besetzen</h3>' + pickGrid('slot', kaderIds(st), cur, '<button data-v="" class="leer">– frei –</button>'), function (root) {
        bindPick(root, 'slot', function (pid) {
          closeSheet();
          fsAendern(st, function (x) { var sl = x.spiel.startelf.slots, c = sl[i], j = pid ? sl.indexOf(pid) : -1; if (j >= 0 && j !== i) sl[j] = c; sl[i] = pid; });
        });
      });
    }
    bindDnD($('#seEd'), function (src, dst) {
      var probe = JSON.parse(JSON.stringify(fsAnsicht(st).st)); if (!M.startelfDrop(probe, src, dst)) return;
      fsAendern(st, function (x) { return M.startelfDrop(x, src, dst); });
    }, function (src) { if (src.charAt(0) === 's') slotSheet(+src.slice(2)); else toast('Auf eine Position ziehen, um einzusetzen'); });
  }
  function viewSpiel() {
    var st = M.getSpieltag(data, state.stId), s = M.spielbericht(st);
    if (!s.startelf) { M.startelfAusVorschlag(data, st); commit(); state.prefillToast = true; }   // Spielbericht = tatsächliches Spiel: Startelf aus dem Vorschlag vorbelegen
    var b = M.bericht(data, st), L = st.live;
    var liveTxt = !L || L.phase === 'vor' ? '▶ Live-Modus: Spiel starten' : (L.phase === 'ende' ? '📄 Spielzusammenfassung' : '⏱ Live-Spiel läuft – öffnen');
    var h = '<button class="btn" id="toLive">' + liveTxt + '</button>' + scoreHtml(st, b, true);
    h += timelineHtml(st, b);
    h += fsKarte(st);
      '<div class="muted">Vorbelegt aus der vorgeschlagenen Aufstellung' + (st.snapshot ? ' (eingefroren)' : '') + '. Foto auf eine Position ziehen = tauschen, von der Bank auf eine Position = einsetzen, auf die Bank ziehen = Position frei. Antippen öffnet die Auswahlliste. Wechsel im Spiel bitte als Ereignis eintragen.</div><button class="btn sec" id="reVor">Neu aus Vorschlag übernehmen</button></div>';
    h += minutenHtml(st, b);
    h += '<div class="card"><h2>Gegentore ohne Zeitangabe</h2><div class="row"><span class="grow muted">Nur für Spiele ohne Einzelerfassung</span><button class="btn small sec" id="gtMinus">−</button><button class="btn small sec" id="gtPlus">+</button></div></div>';
    return h;
  }
  function bindSpiel() {
    var st = M.getSpieltag(data, state.stId), s = M.spielbericht(st);
    if (state.prefillToast) { state.prefillToast = false; toast('Startelf aus dem Vorschlag vorbelegt'); }
    function upd(fn) { fn(); nachEreignis(st); keepScroll(render); }
    $('#toLive').addEventListener('click', function () { go(st.live && st.live.phase === 'ende' ? 'zusammenfassung' : 'live'); });
    $('#gtMinus').addEventListener('click', function () { upd(function () { if (s.gegentore > s.gegen.length) s.gegentore--; else toast('Gegentor mit Minute bitte im Spielverlauf löschen'); }); });
    $('#gtPlus').addEventListener('click', function () { upd(function () { s.gegentore++; }); });
    bindTimeline(st); bindNeuKnoepfe(st); fsBinden(st);
  }

  // ---------- Live-Spiel ----------
  function uhrText(sek) { sek = Math.max(0, Math.floor(sek)); var m = Math.floor(sek / 60), s = sek % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  var PHASE_TXT = { vor: 'vor dem Anpfiff', h1: '1. Halbzeit', pause: 'Halbzeitpause', h2: '2. Halbzeit', ende: 'Abpfiff' };
  function livePitch(st) {
    var f = E.pitchByCode(M.liveFormation(st, null));
    var auf = M.liveAufstellung(st, null), h = '<div id="liveEd"><div class="pitch edit">' + pitchBg();
    f.slots.forEach(function (sl, i) { var p = auf[i] && auf[i].pid ? pById(auf[i].pid) : null; h += '<div class="spot" style="left:' + sl[1] + '%;top:' + sl[2] + '%" data-drop="s:' + i + '">' + token(p, sl[0], 'data-drag="s:' + i + '" data-drop="s:' + i + '"', istKapitaen(st, p)) + '</div>'; });
    h += '</div>';
    var on = auf.map(function (x) { return x.pid; }), bank = kaderIds(st).filter(function (id) { return on.indexOf(id) < 0 && (state.benchAlle || st.zusagen[id] === 'Zugesagt' || M.hatGespielt(st, id)); });
    h += '<div class="bench"><div class="bhead"><b>Bank</b><span class="muted">auf eine Position ziehen = Wechsel</span><button class="btn small sec" id="benchAll">' + (state.benchAlle ? 'Nur Zugesagte' : 'Alle') + '</button></div><div class="bgrid">';
    bank.forEach(function (id) { h += token(pById(id), '', 'data-drag="b:' + id + '"', istKapitaen(st, pById(id))); });
    return h + '</div></div></div>';
  }
  function viewLive() {
    var st = M.getSpieltag(data, state.stId), s = M.spielbericht(st);
    if (!s.startelf) { M.startelfAusVorschlag(data, st); commit(); }
    var L = M.live(st), b = M.bericht(data, st), now = Date.now();
    var h = gegnerInfoKarte(st, true) + '<div class="card livebar ' + L.phase + '"><div class="sc"><div class="team">PSV Wesel-Lackhausen</div><div class="res"><b id="erg">' + b.tore + ' : ' + b.gegentore + '</b></div><div class="team">' + esc(st.gegner || 'Gegner') + '</div></div>' +
      '<div class="clock" id="clock">' + uhrText(M.liveSekunden(st, now)) + '</div><div class="phase" id="phase">' + PHASE_TXT[L.phase] + (L.phase === 'h1' || L.phase === 'h2' ? ' · <span id="liveMin">' + M.liveMinute(st, now) + '</span>. Minute' : '') + '</div>';
    if (L.phase === 'vor') h += '<div class="bwl" style="text-align:center">Halbzeitlänge (Min.)</div><div class="row" style="justify-content:center"><button class="btn small sec" id="hzMinus">−</button><b style="font-size:20px;min-width:70px;text-align:center" id="hzVal">2 × ' + L.halbzeit + '</b><button class="btn small sec" id="hzPlus">+</button></div><button class="btn big" id="lvStart">▶ Spiel starten</button>';
    if (L.phase === 'h1') h += '<div class="row"><button class="btn big" id="lvHalb">⏸ Halbzeit</button><button class="btn big warn" id="lvStop">⏹ Abpfiff</button></div>';
    if (L.phase === 'pause') h += '<div class="row"><button class="btn big" id="lvZweite">▶ 2. Halbzeit</button><button class="btn big warn" id="lvStop">⏹ Abpfiff</button></div>';
    if (L.phase === 'h2') h += '<button class="btn big warn" id="lvStop">⏹ Abpfiff</button>';
    if (L.phase === 'ende') h += '<button class="btn big" id="lvSumm">📄 Spielzusammenfassung</button><button class="btn sec" id="lvWeiter">Abpfiff rückgängig – weiterspielen</button>';
    h += '</div>';
    h += wtKarte(st);
    if (L.phase !== 'vor') h += '<div class="card"><div class="row qa"><button class="btn big" data-neu="tor">⚽ Tor</button><button class="btn big sec" data-neu="gegentor">🥅 Gegentor</button></div><div class="row qa"><button class="btn big" data-neu="wechsel">🔁 Wechsel</button><button class="btn big warn" data-neu="fehler">⚠ Abwehrfehler</button></div><div class="row qa"><button class="btn sec" data-neu="notiz">📝 Notiz</button><button class="btn sec" data-neu="karte">🟨 Karte / Verletzung</button></div><div class="row qa"><button class="btn sec" id="lvGeg">🔎 Gegner-Notiz</button></div></div>';
    if (L.phase === 'vor') h += fsKarte(st);
    else h += '<div class="card"><h2>' + (L.phase === 'vor' ? 'Startelf' : 'Auf dem Platz') + '</h2>' + '<div class="row"><button class="btn small sec" id="lvForm">🔀 Formation: ' + esc(E.pitchByCode(M.liveFormation(st, null)).name) + '</button><button class="btn small sec" id="lvStartelf">✎ Startelf (Anpfiff) ändern</button></div>' + livePitch(st) + '<div class="muted">' + (L.phase === 'vor' ? 'Startelf vor dem Anpfiff: im Spielbericht ändern (Drag & Drop).' : 'Von der Bank auf eine Position ziehen = Wechsel zur aktuellen Minute, zwei Positionen tauschen = Positionstausch.') + '</div></div>';
    h += timelineHtml(st, b);
    return h;
  }
  function bindLive() {
    var st = M.getSpieltag(data, state.stId), L = M.live(st);
    wtBinden(st);
    function akt(a) { var now = Date.now(); if (M.liveAktion(st, a, now)) { if (a === 'stop') { st.live.zusammenfassung = M.zusammenfassungText(data, st); setTimeout(function () { wtLaden(st, true).then(function () { if (st.wetter) { st.live.zusammenfassung = M.zusammenfassungText(data, st); commit(); } }); }, 50); } commit(); wachHalten(); keepScroll(render); } }
    if ($('#hzMinus')) { $('#hzMinus').addEventListener('click', function () { L.halbzeit = Math.max(5, L.halbzeit - 5); commit(); keepScroll(render); }); $('#hzPlus').addEventListener('click', function () { L.halbzeit = Math.min(45, L.halbzeit + 5); commit(); keepScroll(render); }); }
    if ($('#lvGeg')) $('#lvGeg').addEventListener('click', function () { gegnerNotizFuerSpieltag(st); });
    bindGegnerInfo(st);
    if ($('#lvStart')) $('#lvStart').addEventListener('click', function () { sichern('vor_live'); akt('start'); toast('Anpfiff – Uhr läuft'); });
    if ($('#lvHalb')) $('#lvHalb').addEventListener('click', function () { akt('halbzeit'); });
    if ($('#lvZweite')) $('#lvZweite').addEventListener('click', function () { akt('zweite'); });
    if ($('#lvStop')) $('#lvStop').addEventListener('click', function () { if (!confirm('Abpfiff? Danach entsteht die Spielzusammenfassung (weiter bearbeitbar).')) return; akt('stop'); go('zusammenfassung'); });
    if ($('#lvWeiter')) $('#lvWeiter').addEventListener('click', function () { akt('weiter'); });
    if ($('#lvSumm')) $('#lvSumm').addEventListener('click', function () { go('zusammenfassung'); });
    bindNeuKnoepfe(st); bindTimeline(st);
    if (L.phase === 'vor') { fsBinden(st); return; }
    $('#benchAll').addEventListener('click', function () { state.benchAlle = !state.benchAlle; keepScroll(render); });
    $('#lvForm').addEventListener('click', function () { fsFormation(st); });
    $('#lvStartelf').addEventListener('click', function () { state.stZurueckLive = true; go('spiel'); });
    bindDnD($('#liveEd'), function (src, dst) {
      var m = jetztMinute(st), x = M.liveDrop(st, src, dst, m);
      if (!x) { toast('Nicht möglich'); return; }
      if (M.liveLaeuft(st)) x.zeit = Date.now();
      nachEreignis(st); keepScroll(render); toast(x.rein ? (vorn(x.rein) + ' für ' + vorn(x.raus) + ' (' + m + '′)') : ('Positionstausch ' + vorn(x.a) + ' / ' + vorn(x.b)));
    }, function (src) {
      if (src.charAt(0) !== 's') { toast('Auf eine Position ziehen = Wechsel'); return; }
      var auf = M.liveAufstellung(st, null)[+src.slice(2)]; if (!auf || !auf.pid) return;
      var on = aufPlatzIds(st, null), bank = kaderIds(st).filter(function (id) { return on.indexOf(id) < 0; });
      openSheet('<h3>Wechsel für ' + esc(vorn(auf.pid)) + ' (' + auf.pos + ')</h3><div class="bwl">Wer kommt rein?</div>' + pickGrid('wr', bank, null), function (root) {
        bindPick(root, 'wr', function (rein) { var x = M.addWechsel(st, jetztMinute(st), rein, auf.pid); if (M.liveLaeuft(st)) x.zeit = Date.now(); nachEreignis(st); closeSheet(); keepScroll(render); toast(vorn(rein) + ' für ' + vorn(auf.pid)); });
      });
    });
  }
  // Uhr: nur Anzeige – die Zeit kommt immer aus den gespeicherten Zeitstempeln
  setInterval(function () {
    if (state.sub !== 'live' || !data) return;
    var st = M.getSpieltag(data, state.stId); if (!st || !st.live) return;
    var c = $('#clock'); if (c) c.textContent = uhrText(M.liveSekunden(st, Date.now()));
    var m = $('#liveMin'); if (m) m.textContent = M.liveMinute(st, Date.now());
  }, 1000);
  function wachHalten() {
    var an = data.spieltage.some(function (s) { return s.live && (s.live.phase === 'h1' || s.live.phase === 'pause' || s.live.phase === 'h2'); });
    if (window.AndroidBridge && window.AndroidBridge.keepAwake) window.AndroidBridge.keepAwake(an);
    else if (navigator.wakeLock && an && !wachHalten._lock) navigator.wakeLock.request('screen').then(function (l) { wachHalten._lock = l; l.addEventListener('release', function () { wachHalten._lock = null; }); }).catch(function () { });
    else if (!an && wachHalten._lock) { wachHalten._lock.release(); wachHalten._lock = null; }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && data) { wachHalten(); if (state.sub === 'live') keepScroll(render); } });

  // ---------- Spielzusammenfassung ----------
  function viewZusammenfassung() {
    var st = M.getSpieltag(data, state.stId), z = M.zusammenfassung(data, st), b = M.bericht(data, st);
    var h = '<div class="card score"><div class="sc"><div class="team">PSV Wesel-Lackhausen</div><div class="res"><b id="erg">' + z.tore + ' : ' + z.gegentore + '</b></div><div class="team">' + esc(z.gegner) + '</div></div><div class="muted" style="text-align:center">' + esc(z.titel) + (z.halbzeit ? ' · 2 × ' + z.halbzeit + ' Min.' : '') + ' · Spielzeit ' + z.spielzeit + ' Min.</div></div>';
    var kr = korrekturVon(st);
    if (st.ohneWertung || kr) h += '<div class="card owcard">' + (st.ohneWertung ? owChip(st) + ' <span class="muted">zählt nicht für Bilanz, Form und Vorschläge</span>' : '') + (kr ? '<div class="muted" style="margin-top:4px">Nach offiziellem Spielbericht korrigiert (' + esc(M.fmtDatum(kr.angewandt.slice(0, 10))) + ')</div>' : '') + '</div>';
    h += '<div class="card"><h2>Exportieren</h2><button class="btn" id="zsShare">Als Text teilen (WhatsApp, Mail …)</button><button class="btn sec" id="zsPdf">Als PDF speichern / drucken</button><button class="btn sec" id="zsHtml">Als HTML-Datei speichern</button><button class="btn sec" id="zsGeg">🔎 Gegner-Notiz hinzufügen</button><div class="muted">Die Zusammenfassung ist außerdem im JSON-Export enthalten.</div></div>';
    h += timelineHtml(st, b);
    h += '<div class="card"><h2>Aufstellung Anpfiff → Abpfiff</h2><table><thead><tr><th>Pos.</th><th>Anpfiff</th><th>Abpfiff</th></tr></thead><tbody>' + z.startelf.map(function (x, i) { var e = z.endelf[i] || {}; return '<tr><td><b>' + esc(x.pos) + '</b></td><td>' + esc(x.name) + '</td><td>' + (e.name !== x.name ? '<b>' + esc(e.name) + '</b>' : esc(e.name)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    if (z.wechsel.length) h += '<div class="card"><h2>Wechsel</h2><table><tbody>' + z.wechsel.map(function (w) { return '<tr><td class="c">' + (E.isNum(w.minute) ? w.minute + '′' : '–') + '</td><td>' + esc(w.rein) + ' für ' + esc(w.raus) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    if (z.scorer.length) h += '<div class="card"><h2>Tore und Vorlagen</h2><table><thead><tr><th>Spieler</th><th class="c">Tore</th><th class="c">Vorlagen</th></tr></thead><tbody>' + z.scorer.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="c">' + x.tore + '</td><td class="c">' + x.assists + '</td></tr>'; }).join('') + '</tbody></table></div>';
    if (z.fehler.length) h += '<div class="card"><h2>Abwehrfehler</h2>' + z.fehler.map(function (f) { return esc(f.name) + (f.n > 1 ? ' ×' + f.n : ''); }).join(', ') + '</div>';
    if (z.notizen.length) h += '<div class="card"><h2>Notizen</h2>' + z.notizen.map(function (n) { return '<div class="evt notiz"><span class="min">' + (E.isNum(n.minute) ? n.minute + '′' : '–') + '</span><span class="grow">' + esc(n.text) + '</span></div>'; }).join('') + '</div>';
    h += minutenHtml(st, b);
    return h;
  }
  function dateiName(st, ext) { return 'Spielbericht_' + (st.datum || 'ohne_Datum') + (st.gegner ? '_' + st.gegner.replace(/[^\wäöüÄÖÜß-]+/g, '_') : '') + '.' + ext; }
  function bindZusammenfassung() {
    var st = M.getSpieltag(data, state.stId), br = window.AndroidBridge;
    if (st.live && st.live.phase === 'ende') { var t = M.zusammenfassungText(data, st); if (st.live.zusammenfassung !== t) { st.live.zusammenfassung = t; save(); } }
    bindTimeline(st);
    $('#zsGeg').addEventListener('click', function () { gegnerNotizFuerSpieltag(st); });
    $('#zsShare').addEventListener('click', function () {
      var txt = M.zusammenfassungText(data, st);
      if (br && br.shareText) br.shareText('Spielbericht ' + M.titel(st), txt);
      else if (navigator.share) navigator.share({ title: 'Spielbericht', text: txt }).catch(function () { });
      else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Text kopiert'); }, function () { toast('Kopieren nicht möglich'); });
    });
    $('#zsHtml').addEventListener('click', function () {
      var html = M.zusammenfassungHtml(data, st), name = dateiName(st, 'html');
      if (br && br.saveFileAs) { br.saveFileAs(name, html, 'text/html'); return; }
      webDownload(name, new Blob([html], { type: 'text/html' })); toast('„' + name + '“ gespeichert');
    });
    $('#zsPdf').addEventListener('click', function () {
      var html = M.zusammenfassungHtml(data, st);
      if (br && br.printHtml) { br.printHtml(dateiName(st, 'pdf').replace(/\.pdf$/, ''), html); return; }
      webDrucken(html);
    });
  }

  // ---------- Spielbewertung ----------
  function startPositionen(st) {   // Kind-ID → Position: tatsächliche Startelf, sonst Vorschlag
    var out = {}, se = M.startelfListe(st);
    if (se.length) { se.forEach(function (x) { if (x.pid) out[x.pid] = x.pos; }); return out; }
    var pit = M.aufstellungVon(data, st, st.id === data.aktiverSpieltag ? R : null), code = (st.groesse || state.size || '9') + 'A';
    (pit[code] ? pit[code].aufstellung : []).forEach(function (s) { var pid = s.pid || (s.kind && !st.snapshot && data.players[s.kind - 1] ? data.players[s.kind - 1].id : null); if (pid) out[pid] = s.pos; });
    return out;
  }
  function bwCard(st, p, startPos) {
    var b = st.bewertungen[p.id] || null, posAkt = b && b.position ? b.position : (startPos[p.id] || ''), krit = M.kritFuer(p, { position: posAkt }), w = M.spielwert(b), gesp = b ? b.gespielt !== false : (M.hatGespielt(st, p.id) ? true : null);
    var mAuto = M.spielMinuten(st), mA = mAuto ? (mAuto[p.id] || 0) : null;
    var h = '<div class="card bw' + (gesp === false ? ' nein' : '') + '" id="bw_' + p.id + '" data-pid="' + p.id + '"><div class="row"><span class="avwrap">' + avatar(p, 'm' + (p.typ === 'TW' ? ' tw' : '')) + '<span class="nr mini' + (p.typ === 'TW' ? ' tw' : '') + '">' + esc(p.nr === null ? '–' : p.nr) + '</span></span><div class="grow"><div class="pname">' + esc(p.name) + '</div>' +
      '<div class="muted">' + (startPos[p.id] ? 'Start: ' + startPos[p.id] : 'nicht in der Startelf') + (E.isNum(mA) && mA > 0 ? ' · ' + mA + '′ laut Spielbericht' : '') + '</div></div>' + (w !== null ? badge(E.xround(w, 1)) : '') + '</div>';
    h += '<div class="seg small" style="margin-top:8px"><button data-act="gesp" data-v="1" class="' + (gesp === true ? 'on' : '') + '">Hat gespielt</button><button data-act="gesp" data-v="0" class="' + (gesp === false ? 'on' : '') + '">Nicht gespielt</button></div>';
    if (gesp !== false) {
      h += '<div class="bwl">Position' + (!(b && b.position) && posAkt ? ' <span class="muted">(aus Startelf)</span>' : '') + '</div><div class="pchips">' + POS_ALL.map(function (q) { return '<button data-act="pos" data-v="' + q + '" class="' + (posAkt === q ? 'on' : '') + '">' + q + '</button>'; }).join('') + '</div>';
      h += '<div class="bwl">Minuten' + (b && E.isNum(b.minuten) ? '' : (E.isNum(mA) ? ' <span class="muted">(aus Spielbericht: ' + mA + '′)</span>' : '')) + '</div><div class="pchips">' + [10, 15, 20, 25, 30, 40, 50, 60].map(function (m) { return '<button data-act="min" data-v="' + m + '" class="' + (b && b.minuten === m ? 'on' : '') + '">' + m + '</button>'; }).join('') +
        '<input type="number" class="minin" data-act="minin" value="' + (b && E.isNum(b.minuten) ? b.minuten : '') + '" placeholder="' + (E.isNum(mA) ? mA : 'Min') + '"></div>';
      krit.forEach(function (k) {
        var v = b && b.werte ? b.werte[k.key] : null;
        h += '<div class="bwl">' + esc(k.label) + '</div><div class="rate big">' + [1, 2, 3, 4, 5].map(function (n) { var on = v === n; return '<button data-act="w" data-k="' + k.key + '" data-v="' + n + '" class="' + (on ? 'on' : '') + '"' + (on ? ' style="background:' + E.scaleColor(n) + '"' : '') + '>' + n + '</button>'; }).join('') + '<button data-act="w" data-k="' + k.key + '" data-v="" class="clr">✕</button></div>';
      });
      h += '<input type="text" class="note" data-act="note" placeholder="Notiz (optional)" value="' + esc(b && b.notiz || '') + '">';
    }
    return h + '</div>';
  }
  function bwKinder(st) {
    return named().map(function (i) { return data.players[i]; }).concat(ehemaligeIn(st).map(pById)).filter(function (p) {
      return state.bwAlle || st.zusagen[p.id] === 'Zugesagt' || st.bewertungen[p.id] || M.hatGespielt(st, p.id) || !st.settings.zusagenVerwenden;
    });
  }
  function viewBewertung() {
    var st = M.getSpieltag(data, state.stId), sp = startPositionen(st);
    var h = '<div class="card"><div class="muted">Tippen genügt – jede Eingabe wird sofort gespeichert. Ein Kind zählt als „gespielt“, sobald eine Note vergeben ist. Feldspieler: 5 Kriterien, auf Position TW: Halten, Strafraumbeherrschung, Spielaufbau. Minuten ohne Eintrag kommen aus dem Spielbericht.</div>' +
      segHtml('bwFilter', state.bwAlle ? '1' : '0', [['0', 'Zugesagte / Gespielte'], ['1', 'Alle Kinder']], 'small') + '</div>';
    var kids = bwKinder(st);
    kids.sort(function (a, b) { var pa = sp[a.id] ? 0 : 1, pb = sp[b.id] ? 0 : 1; return pa - pb || (Number(a.nr) || 999) - (Number(b.nr) || 999); });
    kids.forEach(function (p) { h += bwCard(st, p, sp); });
    if (!kids.length) h += '<div class="card muted">Keine Kinder mit Zusage – „Alle Kinder“ wählen.</div>';
    return h;
  }
  function bindBewertung() {
    var st = M.getSpieltag(data, state.stId), sp = startPositionen(st);
    bindSeg('bwFilter', function (v) { state.bwAlle = v === '1'; render(); });
    function ensure(pid) {
      var b = st.bewertungen[pid];
      if (!b) b = st.bewertungen[pid] = { gespielt: true, minuten: null, position: sp[pid] || '', notiz: '', werte: {} };
      b.werte = b.werte || {}; return b;
    }
    function rerenderCard(pid) {
      var el = $('#bw_' + pid), p = pById(pid); if (!el || !p) return;
      var tmp = document.createElement('div'); tmp.innerHTML = bwCard(st, p, sp); el.parentNode.replaceChild(tmp.firstChild, el);
    }
    var view = $('#view');
    view.onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
      var card = b.closest('.bw'); if (!card) return;
      var pid = +card.getAttribute('data-pid'), act = b.getAttribute('data-act'), v = b.getAttribute('data-v'), bw = ensure(pid);
      if (act === 'gesp') bw.gespielt = v === '1';
      else if (act === 'pos') bw.position = bw.position === v ? '' : v;
      else if (act === 'min') bw.minuten = bw.minuten === +v ? null : +v;
      else if (act === 'w') { if (v === '') delete bw.werte[b.getAttribute('data-k')]; else { bw.werte[b.getAttribute('data-k')] = +v; bw.gespielt = true; } }
      commit(); rerenderCard(pid);
    };
    view.onchange = function (e) {
      var t = e.target, card = t.closest && t.closest('.bw'); if (!card) return;
      var pid = +card.getAttribute('data-pid'), bw = ensure(pid), act = t.getAttribute('data-act');
      if (act === 'note') bw.notiz = t.value;
      else if (act === 'minin') { var m = parseFloat(t.value); bw.minuten = E.isNum(m) && m >= 0 ? m : null; }
      commit(); rerenderCard(pid);
    };
  }

  // ---------- Formationen: Auswahl-Blatt mit Mini-Feldern ----------
  function paarVon(st, sz) { return E.paarFuer(st ? st.settings : null, sz); }
  function miniFeld(pt) {
    return '<div class="mini">' + pt.slots.map(function (sl) { return '<span class="md' + (sl[0] === 'TW' ? ' tw' : '') + '" style="left:' + sl[1] + '%;top:' + sl[2] + '%">' + esc(sl[0]) + '</span>'; }).join('') + '</div>';
  }
  // opt: { groessen: ['7','9'], aktuell, st (für Rollen + Paar-Auswahl), paarBearbeiten, onPick(code) }
  function formationSheet(opt) {
    var st = opt.st, h = '<h3>Formation wählen</h3>';
    opt.groessen.forEach(function (sz) {
      var pr = paarVon(st, sz);
      h += '<div class="bwl">' + sz + 'er</div><div class="fmgrid">' + E.PITCHES.filter(function (p) { return p.size === sz; }).map(function (pt) {
        var rolle = pt.code === pr[0] ? 'Abwehr' : (pt.code === pr[1] ? 'Angriff' : '');
        return '<button class="fmcard' + (pt.code === opt.aktuell ? ' on' : '') + '" data-fm="' + pt.code + '">' + miniFeld(pt) + '<b>' + esc(pt.kurz) + '</b>' + (rolle ? '<span class="chip ' + (rolle === 'Abwehr' ? 'def' : 'of') + '">' + rolle + '</span>' : '<span class="chip">weitere</span>') + '</button>';
      }).join('') + '</div>';
      if (opt.paarBearbeiten && st) {
        var opts = E.PITCHES.filter(function (p) { return p.size === sz; }).map(function (p) { return [p.code, p.kurz]; });
        var dis = st.status === 'abgeschlossen' ? ' disabled' : '';
        h += '<div class="paar"><div class="muted">Vorschlags-Paar ' + sz + 'er (gleiche Kinder in allen ' + sz + 'er-Formationen)</div><div class="grid2"><div><label class="f">Abwehr-Formation</label>' + sel('pA' + sz, pr[0], opts, dis) + '</div><div><label class="f">Angriffs-Formation</label>' + sel('pB' + sz, pr[1], opts, dis) + '</div></div></div>';
      }
    });
    openSheet(h, function (root) {
      $$('[data-fm]', root).forEach(function (b) { b.addEventListener('click', function () { closeSheet(); opt.onPick(b.getAttribute('data-fm')); }); });
      opt.groessen.forEach(function (sz) {
        ['A', 'B'].forEach(function (ab, k) {
          var el = $('#p' + ab + sz, root); if (!el) return;
          el.addEventListener('change', function () { setzePaar(st, sz, k, el.value); closeSheet(); keepScroll(render); toast('Vorschlags-Paar ' + sz + 'er: ' + paarVon(st, sz).map(function (c) { return E.pitchByCode(c).kurz; }).join(' / ')); });
        });
      });
    });
  }
  function setzePaar(st, sz, k, code) {   // k = 0 Abwehr, 1 Angriff; gleiche Formation in beiden → tauschen
    var pr = paarVon(st, sz);
    if (pr[1 - k] === code) pr[1 - k] = pr[k];
    pr[k] = code; st.settings['paar' + sz] = pr; commit();
  }

  // ---------- Aufstellung ----------
  function pitchHtml(P, st) {
    var h = '<div class="pitch">' + pitchBg();
    P.aufstellung.forEach(function (s) {
      var pid = s.kind ? (s.pid || (!(st && st.snapshot) && data.players[s.kind - 1] ? data.players[s.kind - 1].id : null)) : null, p = pid ? pById(pid) : null;
      h += '<div class="spot" style="left:' + s.x + '%;top:' + s.y + '%"><div class="tok' + (s.pos === 'TW' ? ' tw' : '') + (s.kind ? '' : ' frei') + '">' + (s.kind ? (p ? avatar(p, 'm') : avatar({ id: s.kind, name: s.name }, 'm')) : avatar(null, 'm')) +
        '<span class="tpos">' + esc(s.pos) + '</span>' + (s.kapitaen ? '<span class="cpt tc">C</span>' : '') +
        '<span class="tnm">' + (s.kind ? esc(s.vorname) + (s.nr !== null && s.nr !== '' ? ' · ' + esc(s.nr) : '') : '–') + '</span>' + (s.kind ? '<span class="tev">Eignung ' + fmt1(s.eignung) + '</span>' : '') + '</div></div>';
    });
    return h + '</div>';
  }
  function viewAufstellung() {
    var st = aktiv();
    if (!st) return '<div class="card"><h2>Kein Spieltag</h2><div class="muted">Lege zuerst einen Spieltag an – die Aufstellung richtet sich nach dessen Zusagen und Vorgaben.</div><button class="btn" id="goNeu">+ Neuer Spieltag</button></div>';
    var closed = st.status === 'abgeschlossen' && st.snapshot, sz = state.size, code = state.form[sz];
    var pits = closed ? st.snapshot.pitches : R.lineups.pitches, P = pits[code], fehlt = !P;
    if (fehlt) { code = Object.keys(pits).filter(function (c) { return pits[c].size === sz; })[0]; P = pits[code]; }
    var pr = closed && st.snapshot.varianten[sz].paar ? st.snapshot.varianten[sz].paar : paarVon(st, sz);
    var info = closed ? { v: st.snapshot.varianten[sz].v, einsetzbar: st.snapshot.einsetzbar, nicht: st.snapshot.nichtEingeplant } : { v: R.lineups.varianten[sz].v, einsetzbar: R.lineups.einsetzbar, nicht: R.lineups.nichtEingeplant };
    var h = gegnerInfoKarte(st) + '<div class="card stbar' + (closed ? ' lockcard' : '') + '"><div class="row"><div class="grow"><b>' + esc(M.titel(st)) + '</b><div class="muted">' + (closed ? '🔒 Vorschlag damals – eingefroren am ' + esc(new Date(st.snapshot.erstellt).toLocaleString('de-DE')) + ' · tatsächliche Startelf im Spieltag änderbar' : 'offen – rechnet live mit aktuellen Noten') + '</div></div>' +
      '<button class="btn small sec" id="stOpen">' + (closed ? 'Startelf ändern' : 'Spieltag') + '</button><button class="btn small sec" id="stWahl">Wechseln</button></div></div>';
    h += wtKarte(st);
    h += '<div class="seg" id="szSeg" style="margin-bottom:6px"><button data-v="7" class="' + (sz === '7' ? 'on' : '') + '">7er</button><button data-v="9" class="' + (sz === '9' ? 'on' : '') + '">9er</button></div>';
    var segCodes = pr.slice(); if (segCodes.indexOf(code) < 0) segCodes.push(code);
    h += '<div class="row fmrow"><div class="seg small grow" id="fmSeg">' + segCodes.map(function (c) { var pt = E.pitchByCode(c); return '<button data-v="' + c + '" class="' + (c === code ? 'on' : '') + '">' + pt.kurz + (c === pr[0] ? ' (Abwehr)' : (c === pr[1] ? ' (Angriff)' : '')) + '</button>'; }).join('') + '</div><button class="btn small" id="fmMore">Formationen ▾</button></div>';
    if (fehlt) h += '<div class="warnbox">Diese Formation ist im eingefrorenen Stand (vor Version 1.2) nicht enthalten.</div>';
    if (st.groesse && st.groesse !== sz) h += '<div class="warnbox">Dieser Spieltag ist als ' + st.groesse + 'er-Spiel angelegt.</div>';
    h += pitchHtml(P, st);
    h += '<div class="card"><h2>Auswechseloptionen · ' + esc(P.name) + '</h2>';
    if (!P.bank.length) h += '<div class="muted">Keine weiteren einsetzbaren Kinder.</div>';
    else {
      h += '<table><thead><tr><th>Position</th><th>Ersatz</th><th>für</th><th class="c">Eignung</th></tr></thead><tbody>';
      P.bank.forEach(function (b) {
        h += '<tr><td><b>' + esc(b.ersetzt) + '</b></td><td>' + esc(b.vorname) + (b.kapitaen ? ' <span class="cpt">C</span>' : '') + ' <span class="muted">#' + esc(b.nr === null ? '–' : b.nr) + ' · ' + fmt1(b.note) + '</span></td><td>' + esc(b.fuerVorname || '–') + '</td><td class="c">' + fmt1(b.eignung) + '</td></tr>';
      });
      h += '</tbody></table><div class="muted" style="margin-top:6px">Reihenfolge nach Gesamtnote. Position = beste erlaubte Position des Kindes, „für“ = Kind, das dort beginnt.</div>';
    }
    h += '</div>';
    h += '<div class="card"><h2>Erstbesetzung</h2><table><thead><tr><th>Pos.</th><th class="c">Nr.</th><th>Name</th><th class="c">Eignung</th></tr></thead><tbody>';
    P.aufstellung.forEach(function (s) { h += '<tr><td><b>' + esc(s.pos) + '</b></td><td class="c">' + esc(s.kind ? (s.nr === null ? '' : s.nr) : '') + '</td><td>' + (s.kind ? esc(s.name) + (s.kapitaen ? ' <span class="cpt">C</span>' : '') : '–') + '</td><td class="c">' + (s.kind ? fmt1(s.eignung) : '') + '</td></tr>'; });
    h += '</tbody></table><div class="muted" style="margin-top:6px">Gleiche Kinder in allen ' + sz + 'er-Formationen (Paar ' + pr.map(function (c) { return E.pitchByCode(c).kurz; }).join(' / ') + ', Variante ' + info.v + (pr.indexOf(code) < 0 ? '; nicht passende Positionen werden mit freien Kindern besetzt' : '') + '). ' + info.einsetzbar + ' Kinder einsetzbar.' +
      (info.nicht.length ? ' Nicht eingeplant: ' + info.nicht.map(function (x) { return esc(x.name) + ' (' + esc(x.grund) + ')'; }).join(', ') + '.' : '') + '</div></div>';
    h += '<button class="btn" id="toTaktik">📋 Taktiktafel' + (tkTafeln(st.id).length ? ' (' + tkTafeln(st.id).length + ')' : '') + '</button><button class="btn sec" id="toSpiel">Spielbericht / tatsächliche Startelf</button><button class="btn sec" id="toPraes">📽 Als Präsentation zeigen</button><button class="btn sec" id="infoBtn">So entsteht der Vorschlag</button>';
    return h;
  }
  function bindAufstellung() {
    if (aktiv()) wtBinden(aktiv());
    if ($('#goNeu')) { $('#goNeu').addEventListener('click', function () { state.tab = 'spieltag'; go('neu'); }); return; }
    $$('#szSeg button').forEach(function (b) { b.addEventListener('click', function () { state.size = b.getAttribute('data-v'); render(); }); });
    $$('#fmSeg button').forEach(function (b) { b.addEventListener('click', function () { state.form[state.size] = b.getAttribute('data-v'); render(); }); });
    $('#fmMore').addEventListener('click', function () { var st = aktiv(); formationSheet({ groessen: [state.size], aktuell: state.form[state.size], st: st, paarBearbeiten: true, onPick: function (c) { state.form[state.size] = c; keepScroll(render); } }); });
    $('#infoBtn').addEventListener('click', function () { go('info'); });
    bindGegnerInfo(aktiv());
    $('#toPraes').addEventListener('click', function () { var o = praesOpt(); o.stId = data.aktiverSpieltag; o.formation = state.form[state.size] || ''; var st = aktiv(); if (st && st.spiel && st.spiel.startelf && st.spiel.startelf.formation === o.formation) o.formation = ''; go('praes'); });
    $('#stOpen').addEventListener('click', function () { go('spieltag', { stId: data.aktiverSpieltag }); });
    $('#toSpiel').addEventListener('click', function () { go('spiel', { stId: data.aktiverSpieltag }); });
    $('#toTaktik').addEventListener('click', function () {   // Tafel des Spieltags öffnen – gibt es keine, wird sie mit der Aufstellung angelegt
      var st = aktiv(), L = tkTafeln(st.id);
      if (L.length === 1) { tkOeffnen(L[0]); return; }
      if (L.length > 1) { state.stId = st.id; go('spieltag', { stId: st.id }); setTimeout(function () { var c = $('#tkKarte'); if (c) c.scrollIntoView({ block: 'start' }); }, 50); return; }
      var b = tkNeueTafel(st, 'Taktik 1'); T.speichern(data, b); commit(); tkOeffnen(b);
    });
    $('#stWahl').addEventListener('click', function () {
      var list = M.sortSpieltage(data.spieltage);
      openSheet('<h3>Spieltag wählen</h3><div class="stlist">' + list.map(function (s) { return '<button data-st="' + s.id + '" class="' + (s.id === data.aktiverSpieltag ? 'on' : '') + '">' + esc(M.titel(s)) + (s.status === 'abgeschlossen' ? ' 🔒' : '') + '</button>'; }).join('') + '</div>', function (root) {
        $$('[data-st]', root).forEach(function (b) { b.addEventListener('click', function () { setAktiv(b.getAttribute('data-st')); closeSheet(); render(); }); });
      });
    });
  }
  function kritZuordnung(K, typ) {
    var L = (data.labels && data.labels[typ]) || {}, G = { def: 'Abwehr', mit: 'Mittelfeld', off: 'Angriff' };
    return K.map(function (k) { return '<b>' + esc(k.label) + '</b> → ' + k.rows.map(function (r) {
      var w = k.w && k.w[r], ps = k.pos && k.pos[r];
      return esc(L[r] || ('Zeile ' + r)) + (w ? ' (Gewicht ' + fmt(w) + ')' : '') + (ps ? ' (' + Object.keys(ps).map(function (g) { return G[g] + ' ×' + fmt(ps[g]); }).join(', ') + ')' : '');
    }).join(', '); }).join(' · ');
  }
  function viewInfo() {
    var KF = M.KRIT_FELD.map(function (k) { return k.label; }).join(', '), KT = M.KRIT_TW.map(function (k) { return k.label; }).join(', ');
    return '<div class="card info"><h2>Aufstellung</h2><p><b>1. Eignung je Kind und Position</b> = Positionsnote (65 % Fähigkeiten, 35 % Positionseignung des Trainers) + 0,5 auf der Stammposition bzw. + 0,25 auf der Alternativposition. Andere Positionen nur, wenn die Tabelle „Positions-Zonen“ sie erlaubt – mit Abzug (0,25 gleiche Gruppe, 0,5 Nachbarzone), sonst nie.</p>' +
      '<p><b>2. Kondition:</b> Auswahlwert = Eignung + Gewicht × (Ausdauer − 3) × 0,25; ohne Ausdauer-Note neutral, nicht für TW. Die Gesamtnote bleibt unverändert.</p>' +
      '<p><b>3. Kapitän</b> spielt bei „Kapitän immer in Startelf = Ja“ von Anfang an: Er bekommt seine Position wie alle nach Eignung, ohne Vorgriff; findet er bis zu seiner letzten erlaubten Position keinen Platz, wird er dort gesetzt.</p>' +
      '<p><b>4. Vergabe-Reihenfolge</b> TW, IV, 6, 8, ST, Flügel, LV/RV, 10: jede Position bekommt das passendste freie Kind (Vorrang hat, wer dort im Vergleich zu seinen anderen Positionen am stärksten ist). Danach werden bis zu zweimal zwei Kinder getauscht, wenn das die Eignung erhöht – wer auf seiner Stammposition steht, wird dabei nicht weggetauscht.</p>' +
      '<p><b>5. Pro Größe dieselben Kinder</b> in Abwehr- und Angriffsformation des gewählten Vorschlags-Paars (Standard 7er 2-3-1/2-1-3, 9er 3-4-1/3-2-3; je Spieltag änderbar): Variante 1 startet mit der Abwehr-, Variante 2 mit der Angriffsformation; genommen wird die höhere Gesamteignung (jede leere Position −3). Weitere Formationen derselben Größe werden mit denselben Kindern besetzt; bleibt dort eine Position leer, weil kein Kind der Gruppe sie spielen darf, rückt das passendste freie Kind nach. „–“ = kein erlaubtes Kind frei.</p>' +
      '<p><b>6. Auswechseloptionen</b> nach Gesamtnote; Position = beste erlaubte Position des Kindes, „für“ = Kind, das dort steht.</p>' +
      '<p class="muted">Gleiche Rechnung wie im Excel-Blatt „Formation_Visuell“ / „Listen“ (Stand 08.10.2026). Jeder offene Spieltag rechnet mit seinen eigenen Zusagen und Vorgaben; „Abschließen“ friert Aufstellung und Auswechseloptionen ein.</p></div>' +
      '<div class="card info"><h2>Automatische Form</h2><p><b>Spielwert</b> = Mittel der vergebenen Kriterien eines Spiels (Feld: ' + esc(KF) + '; auf TW: ' + esc(KT) + ').</p>' +
      '<p><b>Form</b> = gewichtetes Mittel der letzten bis zu 5 bewerteten Spiele (neuestes zuerst). Gewicht = Aktualität (1 · 0,8 · 0,6 · 0,4 · 0,2) × Minutenfaktor; Minutenfaktor = Minuten ÷ Spielzeit, begrenzt auf 0,25 … 1 (ohne Minutenangabe 1). Gerundet auf eine Nachkommastelle.</p>' +
      '<p>Die automatische Form ersetzt „Spiel 1–3“ im Spielerbogen; „Training“ zählt weiter mit: Kategorie Form = Mittel aus (Form, Form, Form, Training). Ohne Bewertung gilt die manuelle Form.</p>' +
      '<p><b>Trend</b> (ab 2 Spielen): letztes Spiel minus Mittel der früheren; ≥ +0,3 steigend ↑, ≤ −0,3 fallend ↓, sonst stabil →.</p></div>' +
      '<div class="card info"><h2>Vorschläge für Grundwerte</h2><p>Je Kriterium werden die letzten bis zu 5 Spiele mit Note betrachtet; nötig sind mindestens ' + M.VORSCHLAG_MIN_SPIELE + '. Weicht der Durchschnitt um mindestens ' + String(M.VORSCHLAG_SCHWELLE).replace('.', ',') + ' von einem zugeordneten Grundwert ab, erscheint ein Vorschlag (gerundeter Durchschnitt). Grundwerte ändern sich nur mit „Übernehmen“. „Ignorieren“ blendet den Vorschlag aus, bis sich Durchschnitt oder Anzahl ändern.</p>' +
      '<p><b>Gespielte Position (ab 1.4):</b> Eine Zweikampf-Note als Stürmer sagt wenig über das defensive 1-gegen-1 → zählt dort nur ×0,4. Positionsspiel als Verteidiger zählt voll für Stellungsspiel, als Angreifer voll für Laufwege ohne Ball (das jeweils andere ×0,5).</p>' +
      '<p><b>Gewicht unter 1</b> heißt: Das Kriterium misst den Grundwert nur teilweise (z. B. Einsatz → Ausdauer, Halten → Reaktionsschnelligkeit). Dann sind mindestens 5 Spiele nötig, und eine Messung (z. B. 6-Minuten-Lauf) zählt stärker.</p>' +
      '<p><b>Gegnerstärke</b> (optional je Spieltag): gegen starke Gegner +0,3, gegen schwache −0,3 auf jede Bewertung (gilt für Form und Vorschläge, begrenzt auf 1–5). Ohne Angabe oder „mittel“: unverändert.</p>' +
      '<p><b>Positionseignung:</b> Wer mindestens 3-mal auf derselben Position bewertet wurde, bekommt einen Vorschlag für die Positionseignung. Dabei zählen die Kriterien je Position unterschiedlich, z. B. IV: Zweikampf 35 %, Positionsspiel 30 %; 6: Passspiel, Positionsspiel und Spielverständnis je 25 %; Stürmer: Positionsspiel (Laufwege) 30 %.</p>' +
      '<p><b>Messungen</b> (Tab „Messungen“): Jeder Test ergibt eine Note 1–5 aus den Notenbändern der Altersklasse. Ein Test zählt für seine zugeordneten Grundwerte mit seinem Gewicht (älter als 120 Tage: halb, älter als 1 Jahr: gar nicht). Liegen Messung und Spiele vor, wird gemischt: Spiele zählen mit Gewicht × (Spiele ÷ 3, höchstens 1), Messungen mit ihrem Gewicht. Eine Messung allein reicht, wenn ihr Gewicht zusammen mindestens 0,5 ist.</p>' +
      '<p><b>Form:</b> Spiele, die mehr als 120 Tage vor dem neuesten bewerteten Spiel liegen, zählen nicht mehr (z. B. nach der Sommerpause).</p>' +
      '<p class="muted">Zuordnung Feld: ' + kritZuordnung(M.KRIT_FELD, 'Feld') + '<br>Zuordnung TW: ' + kritZuordnung(M.KRIT_TW, 'TW') + '</p></div>';
  }

  // ---------- Gegner-Datei (ab 1.6) ----------
  var GN_TYP = { taktik: ['Taktik', 'def'], spieler: ['Spieler', 'of'], allgemein: ['Allgemein', ''] };
  function ergChip(x) { return '<span class="ergc ' + x.ergebnis + (x.ohneWertung ? ' ow' : '') + '"' + (x.ohneWertung ? ' title="ohne Wertung"' : '') + '>' + x.tore + ':' + x.gegentore + (x.ohneWertung ? ' <small>o.W.</small>' : '') + '</span>'; }
  function bilanzTxt(b) { return b.s + ' S · ' + b.u + ' U · ' + b.n + ' N · Tore ' + b.tore + ':' + b.gegentore + ' (' + (b.diff > 0 ? '+' : '') + b.diff + ')' + (b.ohneWertung ? ' · ' + b.ohneWertung + ' ohne Wertung' : ''); }
  function gnText(n) { return (n.typ === 'spieler' && (n.nr || n.name) ? '<b>' + esc((n.nr ? 'Nr. ' + n.nr : '') + (n.name ? (n.nr ? ' ' : '') + n.name : '')) + '</b> ' + (n.text ? '– ' : '') : '') + esc(n.text); }
  function gnMeta(n) { var st = n.stId ? M.getSpieltag(data, n.stId) : null; return esc(M.fmtDatum(n.datum)) + (E.isNum(n.minute) ? ' · ' + n.minute + '′' : '') + (st ? ' · ' + esc(st.gegner ? 'Spiel ' + M.fmtDatum(st.datum) : M.titel(st)) : ''); }
  function gegnerInfoKarte(st, zu) {   // „Gegner-Info“ oben auf Spieltag, Aufstellung und Live
    var I = M.gegnerInfo(data, st); if (!I) return '';
    var b = I.bilanz, top = I.taktik.slice(0, 3).concat(I.allgemein.slice(0, I.taktik.length >= 3 ? 1 : 2));   // Taktik zuerst, dann Allgemeines
    var h = '<details class="card ginfo" id="gInfo"' + (zu ? '' : ' open') + '><summary><span class="gdot">!</span><b>Gegner-Info: ' + esc(I.g.name) + '</b>' +
      (b.anzahl ? ' <span class="muted">' + b.s + ' S · ' + b.u + ' U · ' + b.n + ' N</span>' : (b.spiele.length ? ' <span class="muted">nur Spiele ohne Wertung</span>' : ' <span class="muted">noch nicht gespielt</span>')) + (I.anzahlNotizen ? ' <span class="gbadge">' + I.anzahlNotizen + ' Notiz' + (I.anzahlNotizen > 1 ? 'en' : '') + '</span>' : '') + '</summary>';
    if (b.spiele.length) h += '<div class="glast">' + b.spiele.slice(0, 3).map(function (x) { return '<span class="gl">' + ergChip(x) + ' ' + esc(M.fmtDatum(x.datum).slice(0, 6)) + ' ' + (x.ort === 'Auswärts' ? 'A' : 'H') + '</span>'; }).join('') + '</div><div class="muted">Bilanz ' + bilanzTxt(b) + (b.letzteStaerke ? ' · zuletzt Stärke: ' + esc(b.letzteStaerke) : '') + '</div>';
    else if (b.letzteStaerke) h += '<div class="muted">Gegnerstärke: ' + esc(b.letzteStaerke) + '</div>';
    if (I.spieler.length) h += '<div class="bwl">Auffällige Spieler</div>' + I.spieler.slice(0, 3).map(function (n) { return '<div class="gnl">⚠ ' + gnText(n) + '</div>'; }).join('');
    if (top.length) h += '<div class="bwl">Notizen</div>' + top.map(function (n) { return '<div class="gnl"><span class="chip ' + GN_TYP[n.typ][1] + '">' + GN_TYP[n.typ][0] + '</span> ' + gnText(n) + '</div>'; }).join('');
    return h + '<div class="row" style="margin-top:8px"><button class="btn small sec" id="giOpen">Gegner-Datei</button><button class="btn small" id="giNotiz">+ Gegner-Notiz</button></div></details>';
  }
  function bindGegnerInfo(st) {
    var g = M.gegnerVon(data, st); if (!g) return;
    if ($('#giOpen')) $('#giOpen').addEventListener('click', function () { gegnerOeffnen(g.id); });
    if ($('#giNotiz')) $('#giNotiz').addEventListener('click', function () { gegnerNotizSheet(g, { stId: st.id, minute: jetztMinute(st) }); });
  }
  function gegnerOeffnen(gid) { state.gegnerZurueck = { sub: state.sub, tab: state.tab, stId: state.stId }; go('gegner', { gegnerId: gid }); }
  function gegnerNotizFuerSpieltag(st) {   // Schnell-Knopf (Live, Zusammenfassung)
    var g = M.gegnerVon(data, st);
    if (!g) { toast('Erst einen Gegner am Spieltag eintragen'); return; }
    gegnerNotizSheet(g, { stId: st.id, minute: jetztMinute(st) });
  }
  function gegnerNotizSheet(g, ctx, n) {
    ctx = ctx || {}; var neu = !n, v = n ? clone(n) : { typ: ctx.typ || 'taktik', text: '', nr: '', name: '', stId: ctx.stId || '', minute: E.isNum(ctx.minute) ? ctx.minute : null, datum: M.today(), team: true };
    var sts = M.gegnerSpieltage(data, g.id);
    var h = '<h3>' + (neu ? 'Gegner-Notiz' : 'Notiz bearbeiten') + ' · ' + esc(g.name) + '</h3>' + segHtml('gnTyp', v.typ, [['taktik', 'Taktik'], ['spieler', 'Auffälliger Spieler'], ['allgemein', 'Allgemein']], 'small') +
      '<div id="gnSp" class="grid2' + (v.typ === 'spieler' ? '' : ' hidden') + '"><div><label class="f">Nr.</label><input type="text" inputmode="numeric" id="gnNr" value="' + esc(v.nr || '') + '" placeholder="z. B. 9"></div><div><label class="f">Name (optional)</label><input type="text" id="gnName" value="' + esc(v.name || '') + '"></div></div>' +
      '<label class="f">Notiz</label><textarea id="gnText" placeholder="' + (v.typ === 'spieler' ? 'z. B. sehr schnell, linker Fuß' : 'z. B. spielen hohes Pressing, schwach bei Standards') + '">' + esc(v.text) + '</textarea>' +
      '<div class="grid2"><div><label class="f">Spieltag (optional)</label>' + sel('gnSt', v.stId || '', [['', '–']].concat(sts.map(function (s) { return [s.id, M.fmtDatum(s.datum)]; }))) + '</div><div><label class="f">Minute (optional)</label><input type="number" id="gnMin" value="' + (E.isNum(v.minute) ? v.minute : '') + '"></div></div>' +
      '<label class="f">Datum</label><input type="date" id="gnDat" value="' + esc(v.datum) + '">' +
      '<label class="ck' + (v.typ === 'taktik' ? '' : ' hidden') + '" id="gnTeamL"><input type="checkbox" id="gnTeam"' + (v.team !== false ? ' checked' : '') + '> In der Mannschafts-Präsentation zeigen</label>' +
      '<div class="muted">Beschreibungen einzelner Gegenspieler und allgemeine Notizen erscheinen nur in der Trainer-Präsentation.</div>' +
      '<button class="btn" id="gnOk">Speichern</button>' + (neu ? '' : '<button class="btn warn" id="gnDel">Notiz löschen</button>');
    openSheet(h, function (root) {
      bindSeg('gnTyp', function (t) { v.typ = t; $('#gnSp', root).classList.toggle('hidden', t !== 'spieler'); $('#gnTeamL', root).classList.toggle('hidden', t !== 'taktik'); });
      $('#gnText', root).focus();
      $('#gnOk', root).addEventListener('click', function () {
        var m = parseInt($('#gnMin', root).value, 10), x = { typ: v.typ, text: $('#gnText', root).value, nr: $('#gnNr', root).value, name: $('#gnName', root).value, stId: $('#gnSt', root).value || null, minute: E.isNum(m) ? m : null, datum: $('#gnDat', root).value || M.today(), team: $('#gnTeam', root).checked };
        if (neu) { if (!M.gegnerNotiz(data, g.id, x)) { toast('Bitte einen Text eingeben'); return; } }
        else {
          if (!x.text.trim() && !(x.typ === 'spieler' && (x.nr || x.name))) { toast('Bitte einen Text eingeben'); return; }
          var o = g.notizen.filter(function (y) { return y.id === n.id; })[0]; if (!o) return;
          o.typ = x.typ; o.text = x.text.trim(); o.datum = x.datum; if (x.stId) o.stId = x.stId; else delete o.stId; if (E.isNum(x.minute)) o.minute = x.minute; else delete o.minute;
          if (x.typ === 'spieler') { o.nr = String(x.nr || '').trim(); o.name = String(x.name || '').trim(); } else { delete o.nr; delete o.name; }
          if (x.typ === 'taktik') o.team = x.team; else delete o.team;
        }
        commit(); closeSheet(); keepScroll(render); toast('Gegner-Notiz gespeichert');
      });
      if ($('#gnDel', root)) $('#gnDel', root).addEventListener('click', function () { if (!confirm('Notiz löschen?')) return; M.gegnerNotizLoeschen(data, g.id, n.id); commit(); closeSheet(); keepScroll(render); });
    });
  }
  function viewGegnerListe() {
    var L = (data.gegner || []).map(function (g) { var sts = M.gegnerSpieltage(data, g.id); return { g: g, b: M.gegnerBilanz(data, g.id), letzt: sts[0] ? sts[0].datum : '', n: sts.length }; });
    L.sort(function (a, b) { return (b.letzt || '').localeCompare(a.letzt || '') || a.g.name.localeCompare(b.g.name, 'de'); });
    var h = '<button class="btn" id="gNeu">+ Gegner anlegen</button>';
    M.gegnerAehnlich(data).forEach(function (p) { h += '<div class="warnbox">Gleicher Gegner? <b>' + esc(p[0].name) + '</b> und <b>' + esc(p[1].name) + '</b> <button class="btn small" data-merge="' + p[0].id + ':' + p[1].id + '">Zusammenführen</button></div>'; });
    if (!L.length) h += '<div class="card muted">Noch keine Gegner. Gegner entstehen automatisch, sobald ein Spieltag einen Gegner hat.</div>';
    L.forEach(function (x) {
      var g = x.g, nN = g.notizen.length, nS = M.gegnerNotizen(g, 'spieler').length;
      h += '<div class="card gcard" data-g="' + g.id + '"><div class="row"><div class="gav">' + esc(g.name.charAt(0).toUpperCase()) + '</div><div class="grow"><div class="pname">' + esc(g.name) + '</div><div class="chips">' +
        (g.altersklasse ? '<span class="chip">' + esc(g.altersklasse) + '</span>' : '') + '<span class="chip">' + x.n + ' Spieltag' + (x.n === 1 ? '' : 'e') + '</span>' +
        (x.b.anzahl ? '<span class="chip open">' + x.b.s + ' S · ' + x.b.u + ' U · ' + x.b.n + ' N</span>' : '') + (x.b.spiele.length ? ergChip(x.b.spiele[0]) : '') +
        (nN ? '<span class="chip tip">📝 ' + nN + '</span>' : '') + (nS ? '<span class="chip of">⚠ ' + nS + ' Spieler</span>' : '') + '</div>' +
        (g.farben || g.platz ? '<div class="muted" style="margin-top:3px">' + esc([g.farben, g.platz].filter(Boolean).join(' · ')) + '</div>' : '') + '</div><span class="chev">›</span></div></div>';
    });
    return h + '<div class="muted" style="padding:0 4px">Gleiche Schreibweisen (Groß/Klein, Leerzeichen, Punkte) landen automatisch beim selben Gegner. Spieltage mit Ergebnis ergeben den Direktvergleich.</div>';
  }
  function bindGegnerListe() {
    $$('.gcard').forEach(function (c) { c.addEventListener('click', function () { state.gegnerZurueck = null; go('gegner', { gegnerId: c.getAttribute('data-g') }); }); });
    $$('[data-merge]').forEach(function (b) { b.addEventListener('click', function () { var ids = b.getAttribute('data-merge').split(':'); mergeFrage(ids[0], ids[1]); }); });
    $('#gNeu').addEventListener('click', function () {
      var name = prompt('Name des Gegners (Verein / Mannschaft)'); if (!name || !name.trim()) return;
      var vorh = M.gegnerSuchen(data, name); if (vorh) { toast('„' + vorh.name + '“ gibt es schon'); go('gegner', { gegnerId: vorh.id }); return; }
      var g = M.neuerGegner(data, name); commit(); go('gegner', { gegnerId: g.id });
    });
  }
  function mergeFrage(a, b) {
    var A = M.gegnerById(data, a), B = M.gegnerById(data, b); if (!A || !B) return;
    openSheet('<h3>Zusammenführen</h3><div class="muted">Spieltage, Notizen und Schreibweisen werden übernommen. Welcher Name bleibt?</div><div class="evtypes"><button data-ziel="' + a + '">' + esc(A.name) + '</button><button data-ziel="' + b + '">' + esc(B.name) + '</button></div>', function (root) {
      $$('[data-ziel]', root).forEach(function (x) { x.addEventListener('click', function () { var z = x.getAttribute('data-ziel'); M.gegnerZusammenfuehren(data, z, z === a ? b : a); commit(); closeSheet(); if (state.sub === 'gegner') state.gegnerId = z; keepScroll(render); toast('Zusammengeführt'); }); });
    });
  }
  function viewGegner() {
    var g = M.gegnerById(data, state.gegnerId); if (!g) return '<div class="card muted">Gegner nicht gefunden.</div>';
    var b = M.gegnerBilanz(data, g.id), sts = M.gegnerSpieltage(data, g.id);
    var h = '<div class="card"><div class="row"><div class="gav big">' + esc(g.name.charAt(0).toUpperCase()) + '</div><div class="grow"><div class="pname">' + esc(g.name) + '</div><div class="muted">' + sts.length + ' Spieltag' + (sts.length === 1 ? '' : 'e') + (g.notizen.length ? ' · ' + g.notizen.length + ' Notizen' : '') + '</div></div></div>' +
      '<div class="stats sechs">' + [['Spiele', b.anzahl], ['Siege', b.s], ['Unent.', b.u], ['Niederl.', b.n], ['Tore', b.tore + ':' + b.gegentore], ['Diff.', (b.diff > 0 ? '+' : '') + b.diff]].map(function (c) { return '<div><b>' + c[1] + '</b><span>' + c[0] + '</span></div>'; }).join('') + '</div>' +
      (b.letzteStaerke ? '<div class="muted" style="margin-top:6px">Zuletzt eingeschätzte Gegnerstärke: <b>' + esc(b.letzteStaerke) + '</b></div>' : '') + '</div>';
    h += '<div class="card"><h2>Direktvergleich</h2>' + (sts.length ? sts.map(function (st) {
      var x = b.spiele.filter(function (y) { return y.stId === st.id; })[0];
      return '<div class="h2h" data-st="' + st.id + '"><span class="date"><b>' + esc(M.fmtDatum(st.datum).slice(0, 6)) + '</b><span>' + esc((st.datum || '').slice(0, 4)) + '</span></span><div class="grow"><div>' + (x ? ergChip(x) + ' ' : '<span class="chip">kein Ergebnis</span> ') + '<span class="chip">' + esc(st.ort || '–') + '</span>' + (st.gegnerStaerke ? ' <span class="chip">' + esc(st.gegnerStaerke) + '</span>' : '') + (st.ohneWertung ? ' ' + owChip(st) : '') + '</div>' +
        (x && x.torschuetzen.length ? '<div class="muted">⚽ ' + esc(x.torschuetzen.join(', ')) + '</div>' : '') + '</div><span class="chev">›</span></div>'; }).join('') : '<div class="muted">Noch kein Spieltag gegen diesen Gegner.</div>') + '</div>';
    [['spieler', 'Auffällige Spieler'], ['taktik', 'Taktik'], ['allgemein', 'Allgemeine Notizen']].forEach(function (t) {
      var N = M.gegnerNotizen(g, t[0]);
      h += '<div class="card"><div class="row"><h2 class="grow" style="margin:0">' + t[1] + '</h2><button class="btn small" data-gnneu="' + t[0] + '">+ Notiz</button></div>' +
        (N.length ? N.map(function (n) { return '<div class="gnr" data-gn="' + n.id + '"><div>' + gnText(n) + (t[0] === 'taktik' && n.team === false ? ' <span class="chip">nur Trainer</span>' : '') + '</div><div class="muted">' + gnMeta(n) + '</div></div>'; }).join('') : '<div class="muted" style="margin-top:6px">' + { spieler: 'z. B. „Nr. 9 sehr schnell, linker Fuß“', taktik: 'z. B. „spielen hohes Pressing“, „schwach bei Standards“', allgemein: 'z. B. Anfahrt, Kabinen, Schiedsrichter' }[t[0]] + '</div>') + '</div>';
    });
    var andere = (data.gegner || []).filter(function (x) { return x.id !== g.id; });
    h += '<div class="card"><h2>Stammdaten</h2><label class="f">Name</label><input type="text" id="gName" value="' + esc(g.name) + '">' +
      '<div class="grid2"><div><label class="f">Altersklasse</label>' + sel('gAk', g.altersklasse, [['', '–']].concat(M.KLASSEN)) + '</div><div><label class="f">Farben (Trikot)</label><input type="text" id="gFarb" value="' + esc(g.farben) + '" placeholder="z. B. rot/weiß"></div></div>' +
      '<label class="f">Platz / Adresse</label><input type="text" id="gPlatz" value="' + esc(g.platz) + '" placeholder="z. B. Kunstrasen, Sportplatzstr. 1">' +
      '<div class="g-ort">' + (g.koord ? ortLink({ lat: g.koord.lat, lon: g.koord.lon, name: g.koord.name }, g.platz || g.koord.name) : g.platz ? ortLink({ adresse: g.platz, name: g.platz }) : '') + '</div>' +
      (g.alias.length ? '<div class="muted" style="margin-top:6px">Weitere Schreibweisen: ' + esc(g.alias.join(', ')) + '</div>' : '') +
      (andere.length ? '<label class="f">Mit anderem Gegner zusammenführen</label>' + sel('gMerge', '', [['', '– wählen –']].concat(andere.map(function (x) { return [x.id, x.name]; }))) : '') +
      (sts.length ? '' : '<button class="btn warn" id="gDel">Gegner löschen</button>') + '</div>';
    return h;
  }
  function bindGegner() {
    var g = M.gegnerById(data, state.gegnerId); if (!g) return;
    $$('[data-gnneu]').forEach(function (b) { b.addEventListener('click', function () { gegnerNotizSheet(g, { typ: b.getAttribute('data-gnneu') }); }); });
    $$('[data-gn]').forEach(function (r) { r.addEventListener('click', function () { var n = g.notizen.filter(function (x) { return x.id === r.getAttribute('data-gn'); })[0]; if (n) gegnerNotizSheet(g, {}, n); }); });
    $$('.h2h[data-st]').forEach(function (r) { r.addEventListener('click', function () { var id = r.getAttribute('data-st'), st = M.getSpieltag(data, id); state.zsZurueck = 'gegner'; go(M.mitErgebnis(st) ? 'zusammenfassung' : 'spieltag', { stId: id }); }); });
    $('#gName').addEventListener('change', function (e) { if (!M.gegnerUmbenennen(data, g.id, e.target.value)) { toast('Name schon vergeben – ggf. zusammenführen'); e.target.value = g.name; return; } commit(); setTitle('Gegner', g.name); });
    $('#gAk').addEventListener('change', function (e) { g.altersklasse = e.target.value; commit(); });
    $('#gFarb').addEventListener('change', function (e) { g.farben = e.target.value.trim(); commit(); });
    $('#gPlatz').addEventListener('change', function (e) { g.platz = e.target.value.trim(); commit(); });
    if ($('#gMerge')) $('#gMerge').addEventListener('change', function (e) { if (e.target.value) mergeFrage(g.id, e.target.value); });
    if ($('#gDel')) $('#gDel').addEventListener('click', function () { if (!confirm('Gegner „' + g.name + '“ mit allen Notizen löschen?')) return; M.gegnerLoeschen(data, g.id); commit(); state.sub = 'gegnerListe'; render(); });
  }
  function gegnerDatalist() { return '<datalist id="gegnerDl">' + (data.gegner || []).map(function (g) { return '<option value="' + esc(g.name) + '">'; }).join('') + '</datalist>'; }
  function gegnerHinweis(name) { var g = M.gegnerSuchen(data, name); if (!g) return name && name.trim() ? 'Neuer Gegner – wird in der Gegner-Datei angelegt.' : ''; var b = M.gegnerBilanz(data, g.id); return 'Bekannt: ' + esc(g.name) + ' · ' + b.anzahl + ' Spiel' + (b.anzahl === 1 ? '' : 'e') + (g.notizen.length ? ' · ' + g.notizen.length + ' Notizen' : ''); }

  // ---------- Präsentation (ab 1.5) ----------
  function praesOpt() {
    var o = state.praes || (state.praes = { version: 'mannschaft', inhalte: { aufstellung: true, kader: true, spieler: true, spiel: true, saison: true, messung: true, gegner: false }, gegnerId: '', stId: data.aktiverSpieltag, formation: '', spielId: '', saisonKey: M.saisonListe(data)[0] || '', messId: '', sortierung: 'nr', notizen: false });
    if (!M.getSpieltag(data, o.stId)) o.stId = data.aktiverSpieltag;
    return o;
  }
  function praesErzeugen() {
    var o = praesOpt();
    return P.erzeuge(data, R, { version: o.version, inhalte: o.inhalte, stId: o.stId, formation: o.formation, spielId: o.spielId, gegnerId: o.gegnerId, saisonKey: o.saisonKey, messId: o.messId, sortierung: o.sortierung, notizen: o.notizen, taktikIds: o.taktikIds || [], fotos: window.PSV_FOTOS || {}, datum: M.today() });
  }
  function viewPraes() {
    var o = praesOpt(), team = o.version === 'mannschaft', st = M.getSpieltag(data, o.stId);
    var h = '<div class="card"><h2>Fassung</h2>' + segHtml('pVer', o.version, [['mannschaft', 'Mannschaft (ohne Werte)'], ['trainer', 'Trainer (detailliert)']]) +
      '<div class="' + (team ? 'okbox' : 'warnbox') + '" style="margin-top:8px">' + (team ? 'Für die Kinder: <b>keine</b> Noten, Ränge, Messwerte oder Notizen. Kategorien und Fähigkeiten nur als Farbe (grün = stark … rot = ausbaufähig), Reihenfolge nach Trikotnummer bzw. Name.' :
        'Nur für Trainer: alle Zahlen – Noten, Kategorien, Gesamtnote, Ranking, Positionsnoten, Form, Messwerte, Saison und Spieldetails. Nicht mit Kindern oder Eltern teilen.') + '</div></div>';
    h += '<div class="card"><h2>Inhalt</h2>';
    var ck = function (k, l, sub) { return '<label class="ck"><input type="checkbox" data-ih="' + k + '"' + (o.inhalte[k] ? ' checked' : '') + '> ' + l + '</label>' + (o.inhalte[k] && sub ? '<div class="cksub">' + sub + '</div>' : ''); };
    var STs = M.sortSpieltage(data.spieltage), fm = [];
    if (st && st.spiel && st.spiel.startelf) fm.push(['', 'Startelf (' + E.pitchByCode(st.spiel.startelf.formation).name + ')']); else fm.push(['', 'Vorschlag (Standard)']);
    E.PITCHES.forEach(function (p) { fm.push([p.code, p.name]); });
    h += ck('aufstellung', 'Aufstellung', STs.length ? sel('pSt', o.stId, STs.map(function (s) { return [s.id, M.titel(s)]; })) + sel('pFm', o.formation, fm) : '<span class="muted">Kein Spieltag angelegt.</span>');
    h += ck('kader', 'Kader-Übersicht' + (team ? '' : ' + Ranking'), '');
    h += ck('spieler', 'Spieler-Folien (eine je Kind)', sel('pSort', o.sortierung, [['nr', 'nach Trikotnummer'], ['name', 'nach Name']].concat(team ? [] : [['rang', 'nach Ranking']])));
    var mitErg = STs.filter(P.hatErgebnis);
    h += ck('spiel', 'Letztes Spiel (Zusammenfassung)', mitErg.length ? sel('pSp', o.spielId, [['', 'letztes Spiel mit Ergebnis']].concat(mitErg.map(function (s) { return [s.id, M.titel(s) + ' · ' + s.spiel.tore.length + ':' + (s.spiel.gegentore || 0)]; }))) : '<span class="muted">Noch kein Spiel mit Ergebnis.</span>');
    h += ck('saison', 'Saison-Statistik', sel('pSz', o.saisonKey, M.saisonListe(data).map(function (k) { return [k, 'Saison ' + k]; }).concat([['', 'alle Spieltage']])));
    var MS = M.sortMessungen(data.messungen).reverse();
    h += ck('messung', 'Ergebnisse eines Messtermins', MS.length ? sel('pMs', o.messId, [['', 'letzter Messtermin']].concat(MS.map(function (m) { return [m.id, M.fmtDatum(m.datum) + (m.titel ? ' · ' + m.titel : '')]; }))) : '<span class="muted">Noch kein Messtermin.</span>');
    var GG = (data.gegner || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); }), stG = M.gegnerVon(data, st);
    h += ck('gegner', 'Gegner (Direktvergleich' + (team ? ', neutrale Taktik-Hinweise' : ', Notizen, auffällige Spieler') + ')', GG.length ? sel('pGg', o.gegnerId, [['', 'Gegner des Spieltags' + (stG ? ' (' + stG.name + ')' : '')]].concat(GG.map(function (g) { return [g.id, g.name]; }))) + (team ? '<div class="muted">Mannschaft: nur Ergebnisse und Taktik-Hinweise ohne Bezug auf einzelne Gegenspieler.</div>' : '') : '<span class="muted">Noch keine Gegner.</span>');
    var TK = T.liste(data);
    h += ck('taktik', 'Taktiktafeln', TK.length ? '<div class="muted">Ohne Auswahl: alle Tafeln des gewählten Spieltags. Tafeln enthalten keine Noten.</div>' + TK.map(function (t) { var s2 = t.stId ? M.getSpieltag(data, t.stId) : null; return '<label class="ck"><input type="checkbox" data-tkp="' + esc(t.id) + '"' + ((o.taktikIds || []).indexOf(t.id) >= 0 ? ' checked' : '') + '> ' + esc(t.name) + ' <span class="muted">' + esc(s2 ? M.titel(s2) : 'allgemein') + '</span></label>'; }).join('') : '<span class="muted">Noch keine Taktiktafel gespeichert.</span>');
    if (!team) h += '<label class="ck"><input type="checkbox" id="pNot"' + (o.notizen ? ' checked' : '') + '> Beobachtungen und Spielnotizen einblenden</label><div class="muted">Standard: aus. Der Hinweis-Text im Spielerbogen erscheint nie.</div>';
    var r = praesErzeugen();
    h += '</div><div class="card"><h2>' + r.anzahl + ' Folien · 16:9</h2><button class="btn big" id="pStart">▶ Präsentation starten (Vollbild)</button>' +
      '<button class="btn sec" id="pPdf">Als PDF speichern (Druckdialog, quer)</button><button class="btn sec" id="pHtml">Als HTML-Datei speichern</button>' +
      ((window.AndroidBridge && window.AndroidBridge.shareFile) || navigator.share ? '<button class="btn sec" id="pShare">HTML-Datei teilen (WhatsApp, Mail …)</button>' : '') + '<button class="btn sec" id="pText">Als Text teilen</button>' +
      '<div class="muted">Die HTML-Datei ist eigenständig (Fotos eingebettet) und läuft offline in jedem Browser – am Beamer mit Pfeiltasten/Presenter, am Handy mit Wischen; ⛶ = Vollbild. Im PDF steht jede Folie auf einer eigenen Seite (A4 quer).</div></div>';
    return h;
  }
  function bindPraes() {
    var o = praesOpt();
    bindSeg('pVer', function (v) { o.version = v; if (v === 'mannschaft') { o.notizen = false; if (o.sortierung === 'rang') o.sortierung = 'nr'; } keepScroll(render); });
    $$('[data-ih]').forEach(function (c) { c.addEventListener('change', function () { o.inhalte[c.getAttribute('data-ih')] = c.checked; keepScroll(render); }); });
    [['pGg', 'gegnerId'], ['pSt', 'stId'], ['pFm', 'formation'], ['pSort', 'sortierung'], ['pSp', 'spielId'], ['pSz', 'saisonKey'], ['pMs', 'messId']].forEach(function (x) { var el = $('#' + x[0]); if (el) el.addEventListener('change', function () { o[x[1]] = el.value; if (x[0] === 'pSt') o.formation = ''; keepScroll(render); }); });
    $$('[data-tkp]').forEach(function (c) { c.addEventListener('change', function () { var L = o.taktikIds || (o.taktikIds = []), id = c.getAttribute('data-tkp'), i = L.indexOf(id); if (c.checked && i < 0) L.push(id); if (!c.checked && i >= 0) L.splice(i, 1); keepScroll(render); }); });
    if ($('#pNot')) $('#pNot').addEventListener('change', function (e) { o.notizen = e.target.checked; keepScroll(render); });
    var br = window.AndroidBridge;
    $('#pStart').addEventListener('click', function () { praesZeigen(praesErzeugen()); });
    $('#pPdf').addEventListener('click', function () {
      var r = praesErzeugen();
      if (br && br.printHtmlQuer) { br.printHtmlQuer(r.dateiname.replace(/\.html$/, ''), r.html); return; }
      webDrucken(r.html);
    });
    $('#pHtml').addEventListener('click', function () {
      var r = praesErzeugen();
      if (br && br.saveFileAs) { br.saveFileAs(r.dateiname, r.html, 'text/html'); return; }
      webDownload(r.dateiname, new Blob([r.html], { type: 'text/html' })); toast('„' + r.dateiname + '“ gespeichert');
    });
    if ($('#pShare')) $('#pShare').addEventListener('click', function () { var r = praesErzeugen(); if (br && br.shareFile) br.shareFile(r.dateiname, r.html, 'text/html'); else webDownload(r.dateiname, new Blob([r.html], { type: 'text/html' })); });
    $('#pText').addEventListener('click', function () {
      var r = praesErzeugen();
      if (br && br.shareText) br.shareText(r.titel, r.text);
      else if (navigator.share) navigator.share({ title: r.titel, text: r.text }).catch(function () { });
      else if (navigator.clipboard) navigator.clipboard.writeText(r.text).then(function () { toast('Text kopiert'); }, function () { toast('Kopieren nicht möglich'); });
    });
  }
  function nativVollbild(an) {
    state.praesVoll = an;
    var br = window.AndroidBridge;
    if (br && br.praesentation) { br.praesentation(!!an); return; }
    try { if (an && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { }); else if (!an && document.fullscreenElement) document.exitFullscreen().catch(function () { }); } catch (e) { }
  }
  function praesZeigen(r) {
    praesSchliessen(true);
    var ov = document.createElement('div'); ov.id = 'praesOv'; ov.innerHTML = '<iframe id="praesIf" title="Präsentation"></iframe>'; document.body.appendChild(ov);
    var f = $('#praesIf'); f.onload = function () { try { f.contentWindow.focus(); } catch (e) { } }; f.srcdoc = r.html;
    state.praesOffen = true; state.praesFolie = 0; nativVollbild(true);
    if (window.AndroidBridge && window.AndroidBridge.keepAwake) window.AndroidBridge.keepAwake(true);
  }
  function praesSchliessen(still) {
    var ov = $('#praesOv'); if (ov) ov.remove();
    if (state.praesOffen) { state.praesOffen = false; nativVollbild(false); if (window.AndroidBridge && window.AndroidBridge.keepAwake) { window.AndroidBridge.keepAwake(false); wachHalten(); } }
  }
  window.PSV_PRAES = { vollbild: function () { nativVollbild(!state.praesVoll); }, schliessen: function () { praesSchliessen(); }, folie: function (i) { state.praesFolie = i; } };

  // ---------- Mehr ----------
  // ---------- Liga (ab 1.9): offizielle fussball.de-Widgets, nur online, keine Datenübernahme ----------
  var LIGA_URL = 'https://luimujo.github.io/psv-liga/';
  var LIGA_TEAM = 'https://www.fussball.de/mannschaft/psv-wesel-6-psv-wesel-lackhausen-1928-niederrhein/-/saison/2627/team-id/031C60GPP4000000VS5489BSVU7CJV8J';
  var ligaAn = false;
  function ligaNativ() { var b = window.AndroidBridge; return b && typeof b.ligaZeigen === 'function' ? b : null; }
  function ligaAus() { if (!ligaAn) return; ligaAn = false; var b = ligaNativ(); if (b) b.ligaVerbergen(); }
  function viewLiga() {
    return '<div class="card ligabar"><div class="ligaknoepfe">' +
      '<button class="btn small" id="ligaReload">⟳ Neu laden</button>' +
      '<button class="btn small sec" id="ligaExtern">Auf fussball.de öffnen</button></div>' +
      '<div class="muted ligahinweis">PSV Wesel VI · Spiele &amp; Tabelle · Daten: fussball.de</div></div>' +
      '<div id="ligaOff" class="card ligaoff hidden">📶 Keine Verbindung – Liga-Daten nur online</div>' +
      '<div id="ligaBox" class="ligabox"></div>';
  }
  function ligaLayout(neu) {
    var box = $('#ligaBox'); if (!box || state.tab !== 'liga' || state.sub || state.detail !== null) return;
    var off = navigator.onLine === false, b = ligaNativ();
    $('#ligaOff').classList.toggle('hidden', !off || !!b);   // in der App zeigt die Liga-Ansicht selbst den Offline-Hinweis
    var nav = $('#tabs'), unten = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    var r = box.getBoundingClientRect(), h = Math.max(200, Math.floor(unten - r.top - 4));
    box.style.height = h + 'px';
    if (b) { ligaAn = true; b.ligaZeigen(r.left, r.top, r.width, h, !!neu); return; }
    if (neu) box.innerHTML = off ? '' : '<iframe id="ligaFrame" title="Liga" src="' + LIGA_URL + '?app=1&t=' + Date.now() + '"></iframe>';
  }
  function bindLiga() {
    window.scrollTo(0, 0);
    $('#ligaReload').addEventListener('click', function () { ligaLayout(true); });
    $('#ligaExtern').addEventListener('click', function () {
      var b = window.AndroidBridge;
      if (b && typeof b.oeffneExtern === 'function') b.oeffneExtern(LIGA_TEAM); else window.open(LIGA_TEAM, '_blank', 'noopener');
    });
    ligaLayout(true);   // bei jedem Öffnen des Tabs frisch laden
  }
  window.addEventListener('resize', function () { if (state.tab === 'liga') ligaLayout(false); });
  window.addEventListener('online', function () { if (state.tab === 'liga') ligaLayout(true); });
  window.addEventListener('offline', function () { if (state.tab === 'liga') ligaLayout(false); });

  function viewMehr() {
    var nBew = 0, nAbg = 0; data.spieltage.forEach(function (s) { nBew += anzahlBewertet(s); if (s.status === 'abgeschlossen') nAbg++; });
    var cs = CLOUD ? CLOUD.statusInfo() : null, nA = CLOUD ? CLOUD.anfragenAnzahl() : 0;
    return '<div class="card"><h2>Cloud &amp; Team</h2>' + (CLOUD ? '<div class="cl-st ' + cs.s + '">' + cs.icon + ' ' + esc(cs.text) + '</div><div class="muted">Daten werden Ende-zu-Ende-verschlüsselt mit den Trainern im Team synchronisiert.</div>' : '<div class="muted">Die Daten liegen nur auf diesem Gerät.</div>') +
      '<button class="btn' + (CLOUD ? ' sec' : '') + '" id="cloudM">' + (CLOUD ? 'Cloud & Team verwalten' + (nA ? ' (' + nA + ' Anfrage' + (nA > 1 ? 'n' : '') + ')' : '') : 'Cloud-Synchronisation einrichten') + '</button>' + (CLOUD && CLOUD.entsperrt() ? '<button class="btn sec" id="sichM">🕓 Sicherungen (Versionsverlauf)</button>' : '') + '<button class="btn sec" id="dsM">Datenschutz</button></div>' +
      '<div class="card"><h2>Daten sichern & teilen</h2><div class="muted">' + (CLOUD ? 'Zusätzlich zur Cloud regelmäßig eine Sicherung exportieren – ohne Team-Passwort sind die Cloud-Daten nicht wiederherstellbar.' : 'Alle Daten liegen nur auf diesem Gerät.') + ' Der Export enthält Kader, Spieltage, Gegner-Datei, Messungen mit Testkatalog, eingefrorene Aufstellungen, Spielberichte und Spielbewertungen. Dateien aus Version 1.0 können weiterhin importiert werden.</div>' +
      '<button class="btn" id="exp">Exportieren (JSON-Datei speichern)</button>' + ((window.AndroidBridge && window.AndroidBridge.shareText) || navigator.share ? '<button class="btn sec" id="share">Teilen (z. B. per Messenger / Mail)</button>' : '') +
      '<button class="btn sec" id="expEnc">Verschlüsselt exportieren (mit Passwort)</button><button class="btn sec" id="imp">Importieren (JSON-Datei öffnen)</button><button class="btn sec" id="paste">Importieren aus eingefügtem Text</button></div>' +
      '<div class="card"><h2>Präsentation</h2><div class="muted">Folien (16:9) für die Besprechung: Mannschaftsfassung ohne Werte oder Trainerfassung mit allen Zahlen – Vollbild, PDF oder HTML-Datei für Beamer/Tablet.</div><button class="btn" id="praesM">📽 Präsentation erstellen</button></div>' +
      '<div class="card"><h2>Einstellungen</h2><button class="btn sec" id="gew">Gewichtung der Gesamtnote</button><button class="btn sec" id="zon">Positions-Zonen & Bonus Stamm/Alt</button><button class="btn sec" id="inf">So rechnet die App (Aufstellung, Form, Vorschläge)</button><button class="btn sec" id="ehemM">Ehemalige Spieler (' + M.ehemaligeSpieler(data).length + ')</button><button class="btn sec" id="gegM">Gegner-Datei (' + (data.gegner || []).length + ')</button></div>' +
      '<div class="card"><h2>Saison</h2><label class="f">Saisonbeginn (für Saison-Statistik, Altersklassen)</label>' + sel('saisonStart', data.settings.saisonStartMonat || 7, [[7, 'Juli'], [8, 'August'], [1, 'Januar']]) + '<div class="muted" style="margin-top:6px">Aktuelle Saison: ' + esc(M.saisonKey(M.today(), data.settings.saisonStartMonat)) + '. Spieltage werden nach Datum zugeordnet.</div></div>' +
      '<div class="card"><h2>Datenstand</h2><div class="kv"><div>Quelle</div><div>' + esc(data.quelle || '') + '</div><div>Zuletzt geändert</div><div>' + (data.geaendert ? new Date(data.geaendert).toLocaleString('de-DE') : 'unverändert') + '</div><div>Kinder</div><div>' + named().length + '</div>' +
      '<div>Spieltage</div><div>' + data.spieltage.length + (nAbg ? ' (' + nAbg + ' abgeschlossen)' : '') + '</div><div>Bewertungen</div><div>' + nBew + '</div></div>' +
      '<button class="btn sec" id="tkM">📋 Taktiktafeln</button><button class="btn sec" id="spImpM">SpielerPlus importieren (Zusagen)</button><button class="btn sec" id="fotoImp">Fotos aus Datei übernehmen</button><button class="btn warn" id="reset">Alle Daten leeren (neu beginnen)</button></div>' +
      '<div class="card kk-info"><img src="logo.svg" alt="" class="kk-logo"><div><b>Kaderkompass</b> · Version ' + APP_VERSION + '<br><span class="muted">Team: ' + esc(teamName()) + '</span><br>' + kkCopy() + '</div></div>' +
      '<div class="muted" style="padding:0 4px"><b>Kaderkompass</b> · Version ' + APP_VERSION + (CLOUD ? ' · Cloud-Synchronisation verschlüsselt (EU).' : ' · nur auf diesem Gerät gespeichert.') + ' Der Liga-Tab braucht Internet. Änderungen werden nicht in die Excel-Datei übertragen.</div>';
  }
  function sichern(grund) { if (CLOUD && CLOUD.sicherung) CLOUD.sicherung(grund).catch(function (e) { console.warn('Sicherung', e); }); }
  function exportName() { var d = new Date(); return 'PSV_Wesel-Lackhausen_Daten_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json'; }
  function exportText(pretty) { data.appVersion = APP_VERSION; return JSON.stringify(data, null, pretty ? 1 : 0); }
  function bindMehr() {
    $('#saisonStart').addEventListener('change', function (e) { data.settings.saisonStartMonat = +e.target.value; state.saisonKey = undefined; commit(); keepScroll(render); });
    $('#exp').addEventListener('click', function () {
      var txt = exportText(true), name = exportName();
      if (window.AndroidBridge && window.AndroidBridge.saveFile) { window.AndroidBridge.saveFile(name, txt); return; }
      webDownload(name, new Blob([txt], { type: 'application/json' })); toast('Datei „' + name + '“ gespeichert');
    });
    if ($('#share')) $('#share').addEventListener('click', function () { if (window.AndroidBridge && window.AndroidBridge.shareText) window.AndroidBridge.shareText(exportName(), exportText(false)); else webDownload(exportName(), new Blob([exportText(false)], { type: 'application/json' })); });
    $('#imp').addEventListener('click', function () { if (window.AndroidBridge && window.AndroidBridge.openFile) window.AndroidBridge.openFile(); else $('#fileIn').click(); });
    $('#paste').addEventListener('click', function () { go('paste'); });
    $('#praesM').addEventListener('click', function () { go('praes'); });
    $('#gew').addEventListener('click', function () { go('gewichte'); });
    $('#zon').addEventListener('click', function () { go('zonen'); });
    $('#inf').addEventListener('click', function () { go('info'); });
    $('#ehemM').addEventListener('click', function () { go('ehemalige'); });
    $('#gegM').addEventListener('click', function () { go('gegnerListe'); });
    $('#reset').addEventListener('click', function () { if (!confirm('Wirklich ALLE Daten (Kader, Spieltage, Bewertungen, Messungen) löschen und leer beginnen?' + (CLOUD ? ' Das gilt auch in der Cloud für alle Trainer im Team!' : '') + ' Vorher exportieren!')) return; if (!confirm('Sicher? Das kann nicht rückgängig gemacht werden.')) return; data = normalize(clone(window.PSV_DEFAULT)); commit(); render(); toast('Daten geleert'); });
    $('#cloudM').addEventListener('click', function () { go('cloud'); });
    if ($('#sichM')) $('#sichM').addEventListener('click', function () { go('sicherungen'); });
    $('#dsM').addEventListener('click', function () { go('datenschutz'); });
    $('#tkM').addEventListener('click', function () { go('taktiken'); });
    $('#spImpM').addEventListener('click', function () { state.imp = null; state.impMeldung = null; state.impUebernommen = false; go('spImport'); });
    $('#expEnc').addEventListener('click', function () { go('encExp'); });
    $('#fotoImp').addEventListener('click', function () { state.fotoImport = true; if (window.AndroidBridge && window.AndroidBridge.openFile) window.AndroidBridge.openFile(); else $('#fileIn').click(); });
  }
  function viewEncExp() {
    return '<div class="card"><h2>Verschlüsselt exportieren</h2><div class="muted">Die Sicherung wird mit AES-GCM 256 verschlüsselt. Zum Importieren wird genau dieses Passwort gebraucht – ohne Passwort ist die Datei wertlos.</div>' +
      '<label class="f">Passwort (mind. 10 Zeichen)</label><input type="password" id="ePw" autocomplete="new-password"><label class="f">Passwort wiederholen</label><input type="password" id="ePw2" autocomplete="new-password">' +
      '<div class="muted" id="eMsg"></div><button class="btn" id="eGo">Verschlüsselte Datei speichern</button></div>';
  }
  function bindEncExp() {
    $('#eGo').addEventListener('click', function () {
      var pw = $('#ePw').value, b = this;
      if (pw.length < 10) { $('#eMsg').textContent = 'Mindestens 10 Zeichen.'; return; }
      if (pw !== $('#ePw2').value) { $('#eMsg').textContent = 'Passwörter stimmen nicht überein.'; return; }
      b.disabled = true; $('#eMsg').textContent = 'Wird verschlüsselt…';
      window.PSVCloudCore.exportVerschluesselt(pw, exportText(false)).then(function (t) { b.disabled = false; $('#eMsg').textContent = ''; state.letzterEncExport = t; dateiSpeichern(exportName().replace('.json', '_verschluesselt.json'), t); })
        .catch(function (e) { b.disabled = false; $('#eMsg').textContent = 'Fehler: ' + e.message; });
    });
  }
  // ---------- SpielerPlus-Import (ab 2.1) ----------
  var IMP = window.PSVImport;
  function impAnalyse(rows, name) {
    var e = IMP.erkennen(rows);
    state.imp = { rows: rows, dateiname: name || 'eingefügter Text', e: e, arten: {}, namen: null };
    impNeu(true);
  }
  function impNeu(namenNeu) {
    var I = state.imp; I.L = I.e.layout === 'unbekannt' ? [] : IMP.eintraege(I.rows, I.e); I.evs = IMP.ereignisse(I.L);
    var alt = I.namen || {}; I.namen = {};
    var gem = Object.assign({}, data.importZuordnung || {});
    I.L.forEach(function (x) { var k = IMP.norm(x.name); if (I.namen[k] !== undefined) return; I.namen[k] = !namenNeu && alt[k] !== undefined ? alt[k] : IMP.vorschlag(x.name, data.players, gem); I.anzeige = I.anzeige || {}; I.anzeige[k] = x.name; });
    I.plan = IMP.plan(data, I.evs, I.namen, I.arten, M);
  }
  var impTimer = null;
  function impWarten() {   // 2.1.2: nach 60 s ohne Ergebnis Hinweis statt endlosem Warten
    clearTimeout(impTimer);
    impTimer = setTimeout(function () { if (state.impMeldung && /geöffnet/.test(state.impMeldung.t)) impMeldung('Keine Datei angekommen. Bitte „Alternative Dateiauswahl“ versuchen oder den Tabellentext unten einfügen und „Text auswerten“ tippen.', true); }, window.__impTimeout || 60000);
  }
  function impMeldung(t, fehler) { if (!/geöffnet/.test(t || '')) clearTimeout(impTimer); state.impMeldung = t ? { t: t, f: !!fehler } : null; if (state.sub === 'spImport') keepScroll(render); if (t) toast(t); }
  function impArt(name, bytes) {   // Inhalt entscheidet, nicht Name/MIME (Android liefert oft octet-stream ohne Endung)
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'xlsx';
    if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'xls';
    return 'text';
  }
  function impBytes(name, bytes) {
    state.sub = 'spImport';
    try {
      if (!bytes || !bytes.length) throw new Error('Die Datei ist leer.');
      var a = impArt(name, bytes), rows;
      if (a === 'text') {
        var t = new TextDecoder('utf-8').decode(bytes); if (t.indexOf('\ufffd') >= 0) { try { t = new TextDecoder('windows-1252').decode(bytes); } catch (e) { } }
        if (/^\s*</.test(t) && /<html|<table/i.test(t)) rows = IMP.tabelleAusArbeitsmappe(window.XLSX, bytes);   // „.xls“ als HTML-Tabelle
        else rows = IMP.tabelleAusText(t);
      } else {
        if (!window.XLSX) throw new Error('Excel-Leser nicht geladen.');
        rows = IMP.tabelleAusArbeitsmappe(window.XLSX, bytes);
      }
      impAnalyse(rows, name);
      state.impMeldung = state.imp.e.layout === 'unbekannt' ? { t: 'Datei gelesen, aber keine Termine/Zusagen erkannt (' + rows.length + ' Zeilen).', f: true } : { t: 'Datei gelesen: ' + name + ' (' + Math.round(bytes.length / 1024 * 10) / 10 + ' KB)', f: false };
      state.tab = 'mehr'; render(); impGeladen();
    } catch (e) { state.imp = null; impMeldung('Datei konnte nicht gelesen werden: ' + (e && e.message || e), true); }
  }
  function impB64(name, b64) { var b = atob(b64), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); impBytes(name, u); }
  window.onImportBinary = function (name, b64) { try { impB64(name, b64); } catch (e) { impMeldung('Datei konnte nicht gelesen werden: ' + e.message, true); } };
  window.onImportBinaryBereit = function () {   // 2.1.1: native Seite hat die Datei gelesen → abholen
    var br = window.AndroidBridge; if (!br || !br.holeDatei) return;
    var j = br.holeDatei(); if (!j) return;
    try {
      var o = JSON.parse(j);
      if (o.fehler) { state.sub = 'spImport'; state.tab = 'mehr'; impMeldung('Datei konnte nicht gelesen werden: ' + o.fehler, true); return; }
      state.tab = 'mehr'; impB64(o.name || 'datei', o.b64 || '');
    } catch (e) { state.sub = 'spImport'; impMeldung('Datei konnte nicht gelesen werden: ' + e.message, true); }
  };
  // ---------- 2.1.3: Popups (geladen / verlassen / übernommen) ----------
  function impModal(html, knoepfe) {
    var alt = $('#impModal'); if (alt) alt.remove();
    var m = document.createElement('div'); m.id = 'impModal'; m.className = 'imp-modal';
    m.innerHTML = '<div class="imp-box">' + html + '<div class="imp-knoepfe">' + knoepfe.map(function (k, i) { return '<button class="btn' + (k.sek ? ' sec' : '') + '" data-mk="' + i + '">' + esc(k.t) + '</button>'; }).join('') + '</div></div>';
    document.body.appendChild(m);
    $$('[data-mk]', m).forEach(function (b) { b.addEventListener('click', function () { m.remove(); var f = knoepfe[+b.getAttribute('data-mk')].f; if (f) f(m); }); });
  }
  function impZahlen() {
    var I = state.imp; if (!I || !I.plan) return { st: 0, z: 0 };
    var sp = I.plan.filter(function (s) { return !s.ignoriert; });
    return { st: sp.length, z: sp.reduce(function (a, s) { return a + s.aenderungen.length; }, 0) };
  }
  function impOffen() { var z = impZahlen(); return state.sub === 'spImport' && !!state.imp && z.st > 0 && !state.impUebernommen; }
  function impGeladen() {
    var z = impZahlen(); if (!z.st) return;
    state.impUebernommen = false;
    impModal('<h2>Daten geladen – noch nicht übernommen</h2><p>' + z.st + ' Spieltag(e), ' + z.z + ' Zusage(n).</p><p>Bitte prüfen und „Übernehmen“ tippen.</p>',
      [{ t: 'Jetzt übernehmen', f: impUebernehmen }, { t: 'Vorschau ansehen', sek: true, f: function () { var v = $('#impVorschau'); if (v) v.scrollIntoView({ block: 'start' }); var g = $('#impGo'); if (g) g.classList.add('pulse'); } }]);
  }
  function impVerlassen(weiter) {   // true = darf sofort verlassen
    if (!impOffen()) return true;
    impModal('<h2>Geladene Zusagen verwerfen?</h2><p>Die Zusagen wurden noch nicht übernommen.</p>',
      [{ t: 'Verwerfen', f: function () { state.imp = null; state.impMeldung = null; weiter(); } }, { t: 'Zurück zum Import', sek: true }]);
    return false;
  }
  function impUebernehmen() {
    var I = state.imp; if (!I) return;
    var abg = $('#impAbg') && $('#impAbg').checked;
    var hatAbg = I.plan.some(function (s) { return s.abgeschlossen; });
    if (abg && !confirm('Zusagen in abgeschlossenen Spieltagen wirklich ändern?')) return;
    var schritte = I.plan.filter(function (s) { return !s.ignoriert && (!s.abgeschlossen || abg); });
    sichern('vor_import'); var r = IMP.anwenden(data, I.plan, I.namen, M, { abgeschlosseneUeberschreiben: abg });
    commit(); state.imp = null; state.impMeldung = null; state.impUebernommen = true;
    var ziel = null, zeilen = schritte.map(function (s) {
      var st = s.stId ? M.getSpieltag(data, s.stId) : data.spieltage.filter(function (x) { return x.datum === s.ev.datum && (!s.ev.gegner || x.gegner === s.ev.gegner); }).slice(-1)[0];
      if (st && !ziel) ziel = st;
      return 'Spieltag ' + M.fmtDatum(s.ev.datum) + (st && st.gegner ? ' gegen ' + st.gegner : '') + ' ' + (s.neu ? 'angelegt' : 'aktualisiert');
    });
    state.sub = null; state.tab = 'mehr'; render();
    impModal('<h2>✓ Übernommen</h2><p>' + zeilen.map(esc).join('<br>') + '</p><p class="muted">' + r.zusagen + ' Zusage(n) eingetragen' + (r.uebersprungen ? ', ' + r.uebersprungen + ' abgeschlossene(r) übersprungen' : '') + (hatAbg && !abg ? '' : '') + '.</p>',
      [{ t: 'Zum Spieltag', f: function () { if (ziel) { data.aktiverSpieltag = ziel.id; commit(); } setTab('spieltag'); } }, { t: 'Schließen', sek: true }]);
  }
  function viewSpImport() {
    var I = state.imp;
    var mh = state.impMeldung ? '<div class="card" style="border-left:4px solid ' + (state.impMeldung.f ? '#c62828' : '#2e7d32') + '" id="impMeld">' + esc(state.impMeldung.t) + '</div>' : '';
    var h = mh + '<div class="card"><h2>Zusagen aus SpielerPlus</h2><div class="muted">Export aus SpielerPlus (Excel .xlsx/.xls oder CSV) wählen oder Tabelle als Text einfügen. Erkannt werden Anwesenheits-Tabellen (Mitglieder × Termine) und Listen (Datum, Termin, Name, Status). Trainings werden erkannt, aber nicht übernommen.</div>' +
      '<button class="btn" id="impDatei">Datei wählen (.xlsx, .xls, .csv)</button>' + (window.AndroidBridge ? '<button class="btn sec small" id="impAlt">Alternative Dateiauswahl</button>' : '') + '<input type="file" id="impFile" class="hidden" accept="*/*">' +
      '<textarea id="impText" placeholder="… oder Tabelle hier einfügen" style="min-height:90px;font-size:12px"></textarea><button class="btn sec small" id="impTextGo">Text auswerten</button></div>';
    if (!I) return h;
    var heads = (I.rows[I.e.kopf] || []).map(function (c, i) { return [i, (String(c instanceof Date ? M.fmtDatum(c.toISOString().slice(0, 10)) : c) || '(Spalte ' + (i + 1) + ')').slice(0, 30)]; });
    h += '<div class="card"><h2>Erkannt</h2><div class="muted">' + esc(I.dateiname) + ' · ' + ({ liste: 'Liste (eine Zeile je Person und Termin)', matrix: 'Tabelle (Personen × Termine)', unbekannt: 'Format nicht erkannt' })[I.e.layout] + ' · ' + I.evs.length + ' Termin(e), ' + Object.keys(I.namen).length + ' Namen</div>';
    if (I.e.layout === 'liste') {
      var S = I.e.spalten, opt = [['', '–']].concat(heads);
      [['name', 'Name'], ['datum', 'Datum'], ['status', 'Status/Zusage'], ['uhrzeit', 'Uhrzeit'], ['typ', 'Typ'], ['titel', 'Termin/Titel'], ['gegner', 'Gegner']].forEach(function (f) {
        h += '<label class="f">' + f[1] + '</label>' + sel('impSp_' + f[0], S[f[0]] === undefined ? '' : S[f[0]], opt, ' data-sp="' + f[0] + '"');
      });
    } else if (I.e.layout === 'matrix') h += '<label class="f">Spalte mit den Namen</label>' + sel('impNameSp', I.e.nameSpalte, heads);
    else h += '<div class="cl-msg">Keine Termine/Zusagen gefunden. Bitte prüfen, ob die Datei eine Kopfzeile mit Datum bzw. Name und Status enthält.</div>';
    h += '</div>';
    if (I.evs.length) {
      h += '<div class="card"><h2>Termine</h2>' + I.evs.map(function (ev, i) {
        var a = I.arten[ev.key] || ev.art;
        return '<div class="imp-row"><span><b>' + esc(M.fmtDatum(ev.datum)) + (ev.uhrzeit ? ' ' + esc(ev.uhrzeit) : '') + '</b> ' + esc(ev.gegner ? (ev.ort ? ev.ort + ' gegen ' : 'gegen ') + ev.gegner : (ev.titel || ev.typ || '')) + '</span>' +
          sel('impArt' + i, a, [['spiel', 'Spieltag'], ['training', 'Training (ignoriert)'], ['ignorieren', 'Ignorieren']], ' data-ev="' + i + '"') + '</div>';
      }).join('') + '</div>';
      var spOpt = [['skip', '– überspringen (Trainer, Betreuer …) –']].concat(data.players.filter(function (p) { return p.name; }).map(function (p) { return [p.id, p.name + (p.archiviert ? ' (ehemalig)' : '')]; }));
      h += '<div class="card"><h2>Namen zuordnen</h2><div class="muted">Vorschlag über den Vornamen. Die Zuordnung wird für den nächsten Import gemerkt.</div>' + Object.keys(I.namen).map(function (k, i) {
        return '<div class="imp-row"><span>' + esc(I.anzeige[k]) + '</span>' + sel('impN' + i, I.namen[k], spOpt, ' data-n="' + esc(k) + '"') + '</div>';
      }).join('') + '</div>';
      var hatAbg = false;
      h += '<div class="card" id="impVorschau"><h2>Vorschau</h2>' + I.plan.map(function (s) {
        var ev = s.ev, kopf = esc(M.fmtDatum(ev.datum)) + (ev.uhrzeit ? ' ' + esc(ev.uhrzeit) : '');
        if (s.ignoriert) return '<div class="muted">' + kopf + ': ' + (s.art === 'training' ? 'Training – wird nicht übernommen' : 'ignoriert') + '</div>';
        if (s.abgeschlossen) hatAbg = true;
        return '<div style="margin:6px 0"><b>' + kopf + ' · ' + (s.neu ? 'neuer Spieltag' : 'vorhandener Spieltag') + (ev.gegner ? ' gegen ' + esc(ev.gegner) : '') + '</b>' + (s.abgeschlossen ? ' <span class="chip ow">abgeschlossen</span>' : '') +
          '<div class="muted">' + (s.aenderungen.length ? s.aenderungen.map(function (a) { var p = pById(a.pid); return esc(p ? p.name : a.pid) + ': ' + esc(a.alt || 'nicht gemeldet') + ' → <b>' + esc(a.neu) + '</b>'; }).join('<br>') : 'keine Änderungen') +
          (s.unbekannt.length ? '<br>Unbekannter Status (nicht übernommen): ' + esc(s.unbekannt.join(', ')) : '') + '</div></div>';
      }).join('') + (hatAbg ? '<label class="cl-check"><input type="checkbox" id="impAbg"> Auch abgeschlossene Spieltage ändern</label>' : '') +
        '<button class="btn" id="impGo">Übernehmen</button></div>' +
        (impZahlen().st ? '<div class="imp-sticky"><span>Noch nicht übernommen</span><button class="btn" id="impGo2">Übernehmen</button></div>' : '');
    }
    return h;
  }
  function bindSpImport() {
    if ($('#impAlt')) $('#impAlt').addEventListener('click', function () { impWarten(); impMeldung('Alternative Dateiauswahl geöffnet …'); $('#impFile').click(); });
    $('#impDatei').addEventListener('click', function () {
      impWarten(); impMeldung('Dateiauswahl geöffnet …');
      try { if (window.AndroidBridge && window.AndroidBridge.openFileBinary) window.AndroidBridge.openFileBinary(); else $('#impFile').click(); }
      catch (e) { impMeldung('Dateiauswahl nicht möglich: ' + e.message + ' – bitte den Text einfügen.', true); }
    });
    $('#impFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) { impMeldung('Keine Datei gewählt', true); return; }
      var r = new FileReader(); r.onload = function () { impBytes(f.name, new Uint8Array(r.result)); }; r.onerror = function () { impMeldung('Datei konnte nicht gelesen werden.', true); };
      r.readAsArrayBuffer(f); e.target.value = '';
    });
    $('#impTextGo').addEventListener('click', function () {
      var t = $('#impText').value; if (!t.trim()) { impMeldung('Bitte zuerst eine Tabelle einfügen.', true); return; }
      try { impAnalyse(IMP.tabelleAusText(t), 'eingefügter Text'); state.impMeldung = state.imp.e.layout === 'unbekannt' ? { t: 'Keine Termine/Zusagen im Text erkannt.', f: true } : null; keepScroll(render); impGeladen(); }
      catch (e) { impMeldung('Text konnte nicht ausgewertet werden: ' + e.message, true); }
    });
    var I = state.imp; if (!I) return;
    $$('[data-sp]').forEach(function (x) { x.addEventListener('change', function () { var k = x.getAttribute('data-sp'); if (x.value === '') delete I.e.spalten[k]; else I.e.spalten[k] = +x.value; impNeu(false); keepScroll(render); }); });
    if ($('#impNameSp')) $('#impNameSp').addEventListener('change', function (e) { I.e.nameSpalte = +e.target.value; impNeu(true); keepScroll(render); });
    $$('[data-ev]').forEach(function (x) { x.addEventListener('change', function () { I.arten[I.evs[+x.getAttribute('data-ev')].key] = x.value; I.plan = IMP.plan(data, I.evs, I.namen, I.arten, M); keepScroll(render); }); });
    $$('[data-n]').forEach(function (x) { x.addEventListener('change', function () { I.namen[x.getAttribute('data-n')] = x.value === 'skip' ? 'skip' : +x.value; I.plan = IMP.plan(data, I.evs, I.namen, I.arten, M); keepScroll(render); }); });
    if ($('#impGo')) $('#impGo').addEventListener('click', function () { impUebernehmen(); });
    if ($('#impGo2')) $('#impGo2').addEventListener('click', function () { impUebernehmen(); });
  }
  // ---------- Taktiktafel (ab 2.2) ----------
  var T = window.PSVTaktik;
  function dialog(titel, html, knoepfe) { impModal('<h2>' + esc(titel) + '</h2>' + (html || ''), knoepfe); }
  function frage(titel, text, jaText, ja, neinText) { dialog(titel, '<p>' + esc(text) + '</p>', [{ t: jaText || 'OK', f: ja }, { t: neinText || 'Abbrechen', sek: true }]); }
  function eingabe(titel, wert, ok, hinweis) {
    dialog(titel, (hinweis ? '<p class="muted">' + esc(hinweis) + '</p>' : '') + '<input type="text" id="dlgIn" value="' + esc(wert || '') + '">', [{ t: 'OK', f: function (m) { var v = $('#dlgIn', m).value.trim(); if (v) ok(v); } }, { t: 'Abbrechen', sek: true }]);
    setTimeout(function () { var i = $('#dlgIn'); if (i) { i.focus(); i.select(); } }, 50);
  }
  function tkTafeln(stId) { return T.liste(data).filter(function (t) { return t.stId === stId; }); }
  function tkHoch() { var f = $('#tkFeld'); var w = f ? f.clientWidth : window.innerWidth, h = f ? f.clientHeight : window.innerHeight; return h > w * 1.05; }
  function tkCtx(hoch) {
    var sp = {}; data.players.forEach(function (p) { if (p.name) sp[p.id] = { name: p.name, vorname: E.firstName(p.name), nr: p.nr, foto: /^data:image\//.test(p.foto || '') ? p.foto : '' }; });
    return { spieler: sp, hoch: !!hoch };
  }
  function tkVerfuegbar(b) {   // Standard: nur verfügbare Kinder des Spieltags (Zusagen), sonst alle aktiven
    var st = b.stId ? M.getSpieltag(data, b.stId) : null, S = st ? Object.assign({ zusagenVerwenden: true, offenMitplanen: false }, st.settings) : null;
    return data.players.filter(function (p) {
      if (!p.name || p.archiviert) return false;
      if (!st || !S.zusagenVerwenden || state.tk.alle) return true;
      var z = st.zusagen[p.id]; return z === 'Zugesagt' || (S.offenMitplanen && (z === 'Offen' || !z));
    });
  }
  // Aufstellung des Spieltags: tatsächliche Startelf, sonst Vorschlag (Formation des Spieltags)
  function tkAufstellung(st, groesse) {
    if (!st) return null;
    var sz = String(st.groesse || groesse || state.size || '9'), kap = st.settings ? st.settings.kapitaen : '';
    var istKap = function (pid) { var p = pById(pid); return !!(kap && p && (E.firstName(p.name) === kap || p.name === kap)); };
    var se = st.spiel && st.spiel.startelf, f = se ? E.pitchByCode(se.formation) : null;
    if (f && se.slots.some(function (x) { return x; })) return { groesse: f.size, code: f.code, quelle: 'Startelf', slots: f.slots.map(function (sl, i) { var pid = se.slots[i] || null; return { pid: pid, pos: sl[0], sx: sl[1], sy: sl[2], kapitaen: pid && istKap(pid) }; }) };
    var code = (st.id === data.aktiverSpieltag && state.form[sz] && E.pitchByCode(state.form[sz]) && E.pitchByCode(state.form[sz]).size === sz) ? state.form[sz] : E.paarFuer(st.settings, sz)[0];
    var pits = M.aufstellungVon(data, st, st.id === data.aktiverSpieltag && !st.snapshot ? R : undefined), P = pits[code];
    if (!P) { code = Object.keys(pits).filter(function (c) { return pits[c].size === sz; })[0]; P = pits[code]; }
    if (!P) return null;
    return { groesse: sz, code: code, quelle: 'Vorschlag', slots: P.aufstellung.map(function (s) { var pid = s.kind ? (s.pid || (!st.snapshot && data.players[s.kind - 1] ? data.players[s.kind - 1].id : null)) : null; return { pid: pid, pos: s.pos, sx: s.x, sy: s.y, kapitaen: !!s.kapitaen }; }) };
  }
  function tkNeueTafel(st, name) {
    var A = tkAufstellung(st), gg = st ? M.gegnerVon(data, st) : null;
    var b = T.neu({ groesse: A ? A.groesse : (st && st.groesse) || state.size || '9', name: name, stId: st ? st.id : null, gegnerId: gg ? gg.id : null, gegnerName: st ? st.gegner || '' : '', ohneSpieler: true });
    if (A) T.aufstellungSetzen(b, A.slots.filter(function (s) { return s.pid; })); else T.formationSetzen(b, 'B', T.standardFormation(b.groesse, 'B'));
    T.formationSetzen(b, 'R', T.standardFormation(b.groesse, 'R'));
    return b;
  }
  function tkOeffnen(b, neu) {
    state.tk = { b: T.clone(b), dirty: !!neu, tool: 'move', col: '#000000', undo: [], cur: -1, leiste: true, alle: false };
    state.tkZurueck = state.sub && state.sub !== 'taktik' ? state.sub : state.tkZurueck || null; state.sub = 'taktik'; state.sheet = null; render(); window.scrollTo(0, 0);
  }
  function tkNeuFuer(st) {
    var n = (st ? tkTafeln(st.id).length : T.liste(data).length) + 1;
    eingabe('Neue Taktiktafel', st ? 'Taktik ' + n : 'Taktik ' + n, function (name) { var b = tkNeueTafel(st, name); T.speichern(data, b); commit(); tkOeffnen(b); }, st ? 'Aufstellung, Formation und Gegner von ' + M.titel(st) + ' werden übernommen.' : '');
  }
  function tkKopieren(st) {   // aus anderem Spieltag oder Gegner kopieren
    var G = T.gruppen(data, M);
    var html = G.length ? G.map(function (g) { return '<div class="tk-gr">' + esc(g.titel) + '</div>' + g.tafeln.map(function (t) { return '<button class="btn sec small" data-kopie="' + esc(t.id) + '">' + esc(t.name) + '</button>'; }).join(''); }).join('') : '<p class="muted">Noch keine Taktiktafeln gespeichert.</p>';
    dialog('Taktiktafel kopieren', '<div class="tk-kopieliste">' + html + '</div>', [{ t: 'Abbrechen', sek: true }]);
    $$('[data-kopie]').forEach(function (x) { x.addEventListener('click', function () {
      var q = T.liste(data).filter(function (t) { return t.id === x.getAttribute('data-kopie'); })[0]; if (!q) return;
      var c = T.clone(q), gg = st ? M.gegnerVon(data, st) : null; c.id = T.neueId('tk'); c.name = q.name + ' (Kopie)'; c.erstellt = c.geaendert = new Date().toISOString();
      c.stId = st ? st.id : null; if (st) { c.gegnerId = gg ? gg.id : null; c.gegnerName = st.gegner || ''; }
      var m = $('#impModal'); if (m) m.remove(); T.speichern(data, c); commit(); toast('Kopiert: ' + c.name); tkOeffnen(c);
    }); });
  }
  function tkKarte(st) {   // Abschnitt im Spieltag
    var L = tkTafeln(st.id);
    return '<div class="card" id="tkKarte"><h2>📋 Taktik</h2>' + (L.length ? L.map(function (t) { return '<div class="imp-row tk-zeile" data-tk="' + esc(t.id) + '"><span><b>' + esc(t.name) + '</b> <span class="muted">' + esc(t.groesse) + 'er' + (t.steps && t.steps.length ? ' · ' + t.steps.length + ' Schritte' : '') + '</span></span><span class="chev">›</span></div>'; }).join('') : '<div class="muted">Noch keine Taktiktafel für diesen Spieltag.</div>') +
      '<button class="btn" id="tkNeu">+ Neue Taktiktafel</button><button class="btn sec small" id="tkKopie">Aus anderem Spieltag/Gegner kopieren</button></div>';
  }
  function tkKarteBinden(st) {
    $$('#tkKarte [data-tk]').forEach(function (r) { r.addEventListener('click', function () { var t = T.liste(data).filter(function (x) { return x.id === r.getAttribute('data-tk'); })[0]; if (t) tkOeffnen(t); }); });
    $('#tkNeu').addEventListener('click', function () { tkNeuFuer(st); });
    $('#tkKopie').addEventListener('click', function () { tkKopieren(st); });
  }
  function viewTaktiken() {
    var G = T.gruppen(data, M), st = aktiv();
    var h = '<div class="card"><h2>Taktiktafeln</h2><div class="muted">Tafeln gehören zu einem Spieltag (mit Aufstellung, Formation und Gegner) oder sind allgemein. Sie werden verschlüsselt mit dem Team synchronisiert und sind im Export enthalten.</div>' +
      (st ? '<button class="btn" id="tkNeuSt">+ Neue Tafel für ' + esc(M.titel(st)) + '</button>' : '') + '<button class="btn sec" id="tkNeuAllg">+ Neue allgemeine Tafel</button></div>';
    if (!G.length) h += '<div class="card muted">Noch keine Taktiktafeln gespeichert.</div>';
    G.forEach(function (g) { h += '<div class="card"><h2>' + esc(g.titel) + '</h2>' + g.tafeln.map(function (t) { return '<div class="imp-row tk-zeile" data-tk="' + esc(t.id) + '"><span><b>' + esc(t.name) + '</b> <span class="muted">' + esc(t.groesse) + 'er · ' + esc(new Date(t.geaendert).toLocaleDateString('de-DE')) + (t.steps && t.steps.length ? ' · ' + t.steps.length + ' Schritte' : '') + '</span></span><button class="btn sec small" data-tkdel="' + esc(t.id) + '" style="width:auto">🗑</button></div>'; }).join('') + '</div>'; });
    return h;
  }
  function bindTaktiken() {
    var st = aktiv();
    if ($('#tkNeuSt')) $('#tkNeuSt').addEventListener('click', function () { tkNeuFuer(st); });
    $('#tkNeuAllg').addEventListener('click', function () { tkNeuFuer(null); });
    $$('[data-tk]').forEach(function (r) { r.addEventListener('click', function (e) { if (e.target.closest('[data-tkdel]')) return; var t = T.liste(data).filter(function (x) { return x.id === r.getAttribute('data-tk'); })[0]; if (t) tkOeffnen(t); }); });
    $$('[data-tkdel]').forEach(function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-tkdel'), t = T.liste(data).filter(function (x) { return x.id === id; })[0]; frage('Taktiktafel löschen?', '„' + (t ? t.name : '') + '“ wird gelöscht.', 'Löschen', function () { T.loeschen(data, id); commit(); keepScroll(render); }); }); });
  }
  // ---- Editor ----
  function tkTitel() { var k = state.tk; return k ? k.b.name + (k.dirty ? ' •' : '') : ''; }
  function viewTaktik() {
    var k = state.tk, b = k.b, st = b.stId ? M.getSpieltag(data, b.stId) : null;
    var fo = T.formationen(b.groesse).map(function (f) { return [f.code, f.name.replace(/^\d+er · /, '')]; });
    var W = T.WERKZEUGE, EL = T.ELEMENTE;
    var bar = '<div class="tk-bar' + (k.leiste ? '' : ' zu') + '" id="tkBar">' +
      '<div class="g">' + Object.keys(W).map(function (w) { return '<button data-tool="' + w + '" class="' + (k.tool === w ? 'on' : '') + '">' + W[w] + '</button>'; }).join('') + '</div>' +
      '<div class="g">' + T.FARBEN.map(function (c) { return '<button class="c' + (k.col === c ? ' on' : '') + '" data-col="' + c + '" style="background:' + c + '" aria-label="Farbe ' + c + '"></button>'; }).join('') + '</div>' +
      '<div class="g"><button id="tkUndo">↶ Rückgängig</button><button id="tkClear">🗑 Linien löschen</button></div>' +
      '<div class="g"><button id="tkView">' + (b.halb ? 'Halbes Feld' : 'Ganzes Feld') + '</button>' + sel('tkGr', b.groesse, [['7', '7er'], ['9', '9er'], ['11', '11er']]) +
      sel('tkFormB', '', [['', 'Blau: Formation']].concat(fo)) + sel('tkFormR', '', [['', 'Rot: Formation']].concat(fo)) + '</div>' +
      '<div class="g"><button id="tkAuf">⚽ Aufstellung übernehmen</button>' + sel('tkAnz', b.anzeige || 'foto', [['foto', 'Fotos'], ['nummer', 'Nummern'], ['pos', 'Positionen']]) + '<button id="tkAlle" class="' + (k.alle ? 'on' : '') + '">' + (k.alle ? 'Alle Spieler' : 'Nur verfügbare') + '</button><button id="tkRotPlus">+ Rot</button></div>' +
      '<div class="g">' + Object.keys(EL).map(function (e) { return '<button data-add="' + e + '">' + EL[e] + '</button>'; }).join('') + '</div>' +
      '<div class="g"><button id="tkKader">👥 Kader einfügen</button><button id="tkSave">💾 Speichern</button><button id="tkSaveAs">Speichern als …</button><button id="tkListe">📂 Tafeln</button></div>' +
      '<div class="g"><button id="tkPng">🖼 PNG</button><button id="tkPdf">📄 PDF</button><button id="tkShare">📤 Teilen</button></div></div>';
    var bankL = T.bank(b, tkVerfuegbar(b));
    var bank = '<div class="tk-bank" id="tkBank"><div class="tk-bank-t">Bank</div>' + (bankL.length ? bankL.map(function (p) { return '<div class="tk-chip" data-bank="' + p.id + '">' + avatar(p, 's') + '<span>' + esc(E.firstName(p.name)) + '</span></div>'; }).join('') : '<div class="muted">–</div>') + '</div>';
    return '<div id="tk" class="tk"><div class="tk-kopf"><button id="tkZurueck" class="tk-mini tk-zur" aria-label="Zurück">‹</button><button id="tkLeiste" class="tk-mini">' + (k.leiste ? '▲ Werkzeuge' : '▼ Werkzeuge') + '</button><span class="tk-name" id="tkName">' + esc(b.name) + '</span><span class="muted tk-st">' + esc(st ? M.titel(st) + (st.status === 'abgeschlossen' ? ' 🔒' : '') : (b.gegnerName ? 'gegen ' + b.gegnerName : 'allgemein')) + '</span></div>' + bar +
      '<div class="tk-main"><div class="tk-feld" id="tkFeld"></div>' + bank + '</div>' +
      '<div class="tk-steps"><button id="tkAdd">+ Schritt</button><button id="tkPrev">⏮</button><span id="tkInfo">' + (k.cur + 1) + '/' + b.steps.length + '</span><button id="tkNext">⏭</button><button id="tkPlay">▶ Abspielen</button><button id="tkDelSt">Schritte löschen</button></div></div>';
  }
  function tkMerken() { var k = state.tk; k.undo.push(JSON.stringify({ spieler: k.b.spieler, ball: k.b.ball, items: k.b.items, lines: k.b.lines })); if (k.undo.length > 40) k.undo.shift(); k.dirty = true; }
  function tkNeuZeichnen() { var k = state.tk; if (!k) return; var f = $('#tkFeld'); if (!f) return; f.innerHTML = T.svg(k.b, tkCtx(tkHoch()), { attr: 'id="tkSvg" preserveAspectRatio="xMidYMid meet"' }); tkSvgBinden(); var i = $('#tkInfo'); if (i) i.textContent = (k.cur + 1) + '/' + k.b.steps.length; setTitle('Taktiktafel', tkTitel()); }
  function tkVoll() { keepScroll(render); }
  function tkPunkt(e) { var s = $('#tkSvg'), g = $('#tkInhalt') || s, p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; var q = p.matrixTransform(g.getScreenCTM().inverse()); return [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100]; }
  var tkDrag = null, tkZeichnen = null;
  function tkSvgBinden() {
    var s = $('#tkSvg'); if (!s) return;
    s.addEventListener('pointerdown', function (e) {
      var k = state.tk, b = k.b, P = tkPunkt(e);
      if (k.tool === 'move') {
        var g = e.target.closest('g[data-p],g[data-ball],g[data-it]'); if (!g) return;
        var o = g.getAttribute('data-p') ? b.spieler.filter(function (x) { return x.id === g.getAttribute('data-p'); })[0] : g.getAttribute('data-ball') ? b.ball : b.items.filter(function (x) { return x.id === g.getAttribute('data-it'); })[0];
        if (!o) return; e.preventDefault();
        tkDrag = { o: o, g: g, dx: o.x - P[0], dy: o.y - P[1], moved: false, vorher: JSON.stringify({ spieler: b.spieler, ball: b.ball, items: b.items, lines: b.lines }) };
      } else { e.preventDefault(); tkZeichnen = { kind: k.tool, color: k.col, pts: [P, P] }; }
      try { s.setPointerCapture(e.pointerId); } catch (x) { }
    });
    s.addEventListener('pointermove', tkMove); s.addEventListener('pointerup', tkUp); s.addEventListener('pointercancel', function () { tkDrag = null; tkZeichnen = null; });
  }
  function tkMove(e) {
    if (tkDrag) { var P = tkPunkt(e), o = tkDrag.o; if (!tkDrag.moved && Math.hypot(P[0] + tkDrag.dx - o.x, P[1] + tkDrag.dy - o.y) < 0.3) return; o.x = Math.round((P[0] + tkDrag.dx) * 100) / 100; o.y = Math.round((P[1] + tkDrag.dy) * 100) / 100; tkDrag.moved = true; tkDrag.g.setAttribute('transform', tkDrag.g.getAttribute('transform').replace(/translate\([^)]*\)/, 'translate(' + o.x + ' ' + o.y + ')')); }
    else if (tkZeichnen) {
      var P2 = tkPunkt(e), z = tkZeichnen;
      if (z.kind === 'zone') z.pts[1] = P2; else { var l = z.pts[z.pts.length - 2]; if (Math.hypot(P2[0] - l[0], P2[1] - l[1]) > 0.8) z.pts.splice(-1, 0, P2); z.pts[z.pts.length - 1] = P2; }
      var L = $('#tkLinien'); if (L) L.innerHTML = T.linienSvg(state.tk.b, z);
    }
  }
  function tkUp(e) {
    var k = state.tk; if (!k) return; var b = k.b;
    if (tkDrag) {
      var d = tkDrag; tkDrag = null;
      if (d.moved) {
        k.undo.push(d.vorher); k.dirty = true;
        var bk = $('#tkBank'), r = bk ? bk.getBoundingClientRect() : null;
        if (d.o.pid && r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { T.zurBank(b, d.o.id); tkVoll(); return; }   // auf die Bank ziehen
        setTitle('Taktiktafel', tkTitel()); return;
      }
      if (d.o.team) tkSpielerDialog(d.o); else if (d.o.type) frage('Element entfernen?', ELN(d.o.type), 'Entfernen', function () { tkMerken(); b.items = b.items.filter(function (i) { return i !== d.o; }); tkNeuZeichnen(); });
    }
    if (tkZeichnen) { var z = tkZeichnen; tkZeichnen = null; if (z.pts.length > 2 || Math.hypot(z.pts[1][0] - z.pts[0][0], z.pts[1][1] - z.pts[0][1]) > 1) { tkMerken(); b.lines.push(z); } tkNeuZeichnen(); }
  }
  function ELN(t) { return (T.ELEMENTE[t] || t).replace(/^\S+\s/, ''); }
  function tkSpielerDialog(s) {
    var b = state.tk.b, p = s.pid ? pById(s.pid) : null;
    if (s.team === 'B' && p) {
      dialog(p.name, '<label class="f">Position</label><input type="text" id="dlgPos" value="' + esc(s.pos || '') + '"><label class="ck"><input type="checkbox" id="dlgKap"' + (s.kap ? ' checked' : '') + '> Kapitän</label>', [
        { t: 'Übernehmen', f: function (m) { tkMerken(); s.pos = $('#dlgPos', m).value.trim(); var kap = $('#dlgKap', m).checked; if (kap) b.spieler.forEach(function (x) { if (x.team === 'B') x.kap = false; }); s.kap = kap; tkNeuZeichnen(); } },
        { t: 'Auf die Bank', sek: true, f: function () { tkMerken(); T.zurBank(b, s.id); tkVoll(); } }, { t: 'Abbrechen', sek: true }]);
      return;
    }
    var gg = s.team === 'R' && b.gegnerId ? M.gegnerById(data, b.gegnerId) : null, auff = gg ? M.gegnerNotizen(gg, 'spieler').filter(function (n) { return n.nr || n.name; }) : [];
    dialog(s.team === 'R' ? 'Gegenspieler' : 'Spieler', '<div class="grid2"><div><label class="f">Nummer</label><input type="text" id="dlgNr" value="' + esc(s.label || '') + '"></div><div><label class="f">Position</label><input type="text" id="dlgPos" value="' + esc(s.pos || '') + '"></div></div><label class="f">Name / Hinweis</label><input type="text" id="dlgName" value="' + esc(s.name || '') + '">' +
      (auff.length ? '<label class="f">Auffällige Spieler (' + esc(gg.name) + ')</label><div class="tk-auff">' + auff.map(function (n, i) { return '<button class="btn sec small" data-auff="' + i + '">' + esc((n.nr ? 'Nr. ' + n.nr + ' ' : '') + (n.name || '')) + '</button>'; }).join('') + '</div>' : ''), [
      { t: 'Übernehmen', f: function (m) { tkMerken(); s.label = $('#dlgNr', m).value.trim(); s.pos = $('#dlgPos', m).value.trim(); s.name = $('#dlgName', m).value.trim(); tkNeuZeichnen(); } },
      { t: 'Entfernen', sek: true, f: function () { tkMerken(); b.spieler = b.spieler.filter(function (x) { return x !== s; }); tkNeuZeichnen(); } }, { t: 'Abbrechen', sek: true }]);
    $$('[data-auff]').forEach(function (x) { x.addEventListener('click', function () { var n = auff[+x.getAttribute('data-auff')]; $('#dlgNr').value = n.nr || ''; $('#dlgName').value = n.name || (n.text || '').slice(0, 20); }); });
  }
  function tkSchritt(i, anim) {
    var k = state.tk, b = k.b; if (i < 0 || i >= b.steps.length) return Promise.resolve();
    var a = k.cur >= 0 ? b.steps[k.cur] : b.steps[i], z = b.steps[i]; k.cur = i;
    if (!anim) { T.zwischen(b, z, z, 1); tkNeuZeichnen(); return Promise.resolve(); }
    return new Promise(function (res) { var t0 = performance.now(); var f = function (n) { var t = Math.min(1, (n - t0) / 1200); T.zwischen(b, a, z, t >= 1 ? 1 : T.easing(t)); tkNeuZeichnen(); if (t < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  }
  function tkSpeichern(alsNeu, danach) {
    var k = state.tk;
    var fertig = function () { var c = T.speichern(data, k.b); k.b.geaendert = c.geaendert; k.dirty = false; commit(); toast('Gespeichert: ' + k.b.name); setTitle('Taktiktafel', tkTitel()); if (danach) danach(); };
    if (alsNeu) eingabe('Speichern als', k.b.name + ' (2)', function (n) { k.b = T.clone(k.b); k.b.id = T.neueId('tk'); k.b.name = n; k.b.erstellt = new Date().toISOString(); fertig(); render(); });
    else fertig();
  }
  function tkVerlassen(weiter) {   // ungespeicherte Änderungen?
    var k = state.tk; if (state.sub !== 'taktik' || !k || !k.dirty) return true;
    dialog('Änderungen speichern?', '<p>Die Taktiktafel „' + esc(k.b.name) + '“ hat ungespeicherte Änderungen.</p>', [{ t: 'Speichern', f: function () { tkSpeichern(false, function () { state.tk = null; weiter(); }); } }, { t: 'Verwerfen', sek: true, f: function () { state.tk.dirty = false; state.tk = null; weiter(); } }, { t: 'Abbrechen', sek: true }]);
    return false;
  }
  // Export: Bild mit Kopfzeile (Vereinsname, Tafel, Spieltag) – nie Sponsor
  function tkCanvas() {
    var k = state.tk, b = k.b, st = b.stId ? M.getSpieltag(data, b.stId) : null, B = 1600, vb = T.viewBox(b), H = Math.round(B * vb[3] / vb[2]), KOPF = 90;
    return new Promise(function (res, rej) {
      var img = new Image(), c = document.createElement('canvas'); c.width = B; c.height = H + KOPF;
      img.onload = function () {
        var x = c.getContext('2d'); x.fillStyle = '#1b5e20'; x.fillRect(0, 0, B, KOPF); x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.fillText(T.VEREIN + ' · Taktik: ' + b.name, 24, 44); x.font = '18px sans-serif'; x.fillStyle = '#c8e6c9'; x.textAlign = 'right'; x.fillText('erstellt mit Kaderkompass · © 2026 MLN Consulting', B - 20, 44); x.textAlign = 'left';
        x.font = '24px sans-serif'; x.fillStyle = '#c8e6c9'; x.fillText(st ? M.titel(st) : (b.gegnerName ? 'gegen ' + b.gegnerName : ''), 24, 76); x.drawImage(img, 0, KOPF, B, H); res(c);
      };
      img.onerror = function () { rej(new Error('Bild konnte nicht erzeugt werden')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(T.svg(b, tkCtx(), { breite: B }));
    });
  }
  function tkAusgeben(name, b64, mime, teilen) {
    var br = window.AndroidBridge;
    if (teilen && br && br.shareBase64) { br.shareBase64(name, b64, mime); return; }
    if (!teilen && br && br.saveBase64) { br.saveBase64(name, b64, mime); return; }
    var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var blob = new Blob([u], { type: mime });
    if (teilen && navigator.canShare) { try { var f = new File([blob], name, { type: mime }); if (navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: T.VEREIN + ' – Taktik' }).catch(function () { }); return; } } catch (e) { } }
    webDownload(name, blob); toast('„' + name + '“ gespeichert');
  }
  function tkExport(art) {
    var b = state.tk.b;
    tkCanvas().then(function (c) {
      if (art === 'pdf') { var j = c.toDataURL('image/jpeg', 0.92).split(',')[1], bin = atob(j), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        var p = T.pdf(u, c.width, c.height), s = ''; for (var q = 0; q < p.length; q += 8192) s += String.fromCharCode.apply(null, p.subarray(q, q + 8192)); window.__tkLetzterExport = { name: T.dateiname(b, 'pdf'), groesse: p.length }; tkAusgeben(T.dateiname(b, 'pdf'), btoa(s), 'application/pdf', false); return; }
      var d = c.toDataURL('image/png').split(',')[1]; window.__tkLetzterExport = { name: T.dateiname(b, 'png'), groesse: d.length }; tkAusgeben(T.dateiname(b, 'png'), d, 'image/png', art === 'teilen');
    }).catch(function (e) { toast('Export fehlgeschlagen: ' + e.message); });
  }
  function bindTaktik() {
    var k = state.tk, b = k.b;
    var kp = $('#tk'), top = ($('header#top') || { offsetHeight: 56 }).offsetHeight; if (kp) kp.style.top = top + 'px';
    document.body.classList.add('tk-modus');
    tkNeuZeichnen();
    if (!window.__tkResize) { window.__tkResize = true; window.addEventListener('resize', function () { if (state.sub === 'taktik' && state.tk) tkNeuZeichnen(); }); }
    $('#tkZurueck').addEventListener('click', function () { window.appBack(); });
    $('#tkLeiste').addEventListener('click', function () { k.leiste = !k.leiste; tkVoll(); });
    $('#tkName').addEventListener('click', function () { eingabe('Name der Taktiktafel', b.name, function (n) { b.name = n; k.dirty = true; tkVoll(); }); });
    $$('[data-tool]').forEach(function (x) { x.addEventListener('click', function () { k.tool = x.getAttribute('data-tool'); $$('[data-tool]').forEach(function (y) { y.classList.toggle('on', y === x); }); }); });
    $$('[data-col]').forEach(function (x) { x.addEventListener('click', function () { k.col = x.getAttribute('data-col'); $$('[data-col]').forEach(function (y) { y.classList.toggle('on', y === x); }); }); });
    $('#tkUndo').addEventListener('click', function () { var u = k.undo.pop(); if (!u) { toast('Nichts rückgängig zu machen'); return; } var o = JSON.parse(u); b.spieler = o.spieler; b.ball = o.ball; b.items = o.items; b.lines = o.lines; k.dirty = true; tkVoll(); });
    $('#tkClear').addEventListener('click', function () { if (!b.lines.length) return; tkMerken(); b.lines = []; tkNeuZeichnen(); });
    $('#tkView').addEventListener('click', function () { b.halb = !b.halb; k.dirty = true; tkVoll(); });
    $('#tkGr').addEventListener('change', function (e) { tkMerken(); T.groesseAendern(b, e.target.value); tkVoll(); });
    $('#tkFormB').addEventListener('change', function (e) { if (!e.target.value) return; tkMerken(); T.formationSetzen(b, 'B', e.target.value, !T.team(b, 'B').some(function (s) { return s.pid; })); tkVoll(); });
    $('#tkFormR').addEventListener('change', function (e) { if (!e.target.value) return; tkMerken(); T.formationSetzen(b, 'R', e.target.value); tkVoll(); });
    $('#tkAuf').addEventListener('click', function () {
      var st = (b.stId && M.getSpieltag(data, b.stId)) || aktiv(), A = tkAufstellung(st, b.groesse); if (!A) { toast('Kein Spieltag mit Aufstellung'); return; }
      tkMerken(); if (A.groesse !== b.groesse) T.groesseAendern(b, A.groesse); T.aufstellungSetzen(b, A.slots.filter(function (s) { return s.pid; })); tkVoll(); toast(A.quelle + ' übernommen (' + E.pitchByCode(A.code).name + ')');
    });
    $('#tkAnz').addEventListener('change', function (e) { b.anzeige = e.target.value; k.dirty = true; tkNeuZeichnen(); });
    $('#tkAlle').addEventListener('click', function () { k.alle = !k.alle; tkVoll(); });
    $('#tkRotPlus').addEventListener('click', function () { tkMerken(); var F = T.feld(b.groesse); b.spieler.push({ id: T.neueId('R'), team: 'R', pid: null, label: String(T.naechsteNr(b, 'R')), pos: '', name: '', x: F.L * 0.7, y: F.B / 2 }); tkNeuZeichnen(); });
    $$('[data-add]').forEach(function (x) { x.addEventListener('click', function () { tkMerken(); var F = T.feld(b.groesse); T.elementHinzu(b, x.getAttribute('data-add'), b.halb ? F.L * 0.7 : F.L / 2, F.B * (0.3 + Math.random() * 0.4)); tkNeuZeichnen(); }); });
    $('#tkKader').addEventListener('click', function () {
      dialog('Kader einfügen', '<p class="muted">Eine Zeile pro Spieler: Nummer;Name;Position (z. B. 1;Müller;TW). Aus Excel einfach Spalten kopieren und einfügen (Tab geht auch). Ersetzt die Beschriftung der blauen Spieler der Reihe nach.</p><textarea id="dlgKader" style="min-height:140px"></textarea><label class="ck"><input type="checkbox" id="dlgPosAnz"> Positionskürzel statt Nummer anzeigen</label>',
        [{ t: 'Auf Team Blau übernehmen', f: function (m) { tkMerken(); var n = T.kaderEinfuegen(b, $('#dlgKader', m).value, $('#dlgPosAnz', m).checked); if (!$('#dlgPosAnz', m).checked && b.anzeige === 'foto') b.anzeige = 'nummer'; toast(n + ' Spieler beschriftet'); tkVoll(); } }, { t: 'Abbrechen', sek: true }]);
    });
    $('#tkSave').addEventListener('click', function () { tkSpeichern(false); });
    $('#tkSaveAs').addEventListener('click', function () { tkSpeichern(true); });
    $('#tkListe').addEventListener('click', function () { tkVerlassen(function () { state.sub = 'taktiken'; render(); }) && (state.tk = null, state.sub = 'taktiken', render()); });
    $('#tkPng').addEventListener('click', function () { tkExport('png'); });
    $('#tkPdf').addEventListener('click', function () { tkExport('pdf'); });
    $('#tkShare').addEventListener('click', function () { tkExport('teilen'); });
    $('#tkAdd').addEventListener('click', function () { b.steps.splice(k.cur + 1, 0, T.schnappschuss(b)); k.cur++; k.dirty = true; tkNeuZeichnen(); });
    $('#tkPrev').addEventListener('click', function () { tkSchritt(k.cur - 1, true); });
    $('#tkNext').addEventListener('click', function () { tkSchritt(k.cur + 1, true); });
    $('#tkPlay').addEventListener('click', function () { if (!b.steps.length) { toast('Erst Schritte mit „+ Schritt“ anlegen'); return; } tkSchritt(0, false); var i = 1; (function weiter() { if (i >= b.steps.length || state.tk !== k) return; setTimeout(function () { tkSchritt(i++, true).then(weiter); }, 400); })(); });
    $('#tkDelSt').addEventListener('click', function () { if (!b.steps.length) return; frage('Schritte löschen?', 'Alle ' + b.steps.length + ' Schritte dieser Tafel werden gelöscht.', 'Löschen', function () { b.steps = []; k.cur = -1; k.dirty = true; tkNeuZeichnen(); }); });
    // Bank: Kind auf das Feld ziehen (oder antippen)
    $$('[data-bank]').forEach(function (c) {
      c.addEventListener('pointerdown', function (e) {
        e.preventDefault(); var pid = +c.getAttribute('data-bank'), start = [e.clientX, e.clientY], geist = null;
        var mv = function (ev) { if (!geist && Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) > 8) { geist = c.cloneNode(true); geist.className = 'tk-chip tk-geist'; document.body.appendChild(geist); } if (geist) { geist.style.left = ev.clientX + 'px'; geist.style.top = ev.clientY + 'px'; } };
        var up = function (ev) {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (geist) geist.remove();
          var s = $('#tkSvg'), r = s.getBoundingClientRect(), F = T.feld(b.groesse), P;
          if (geist && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) P = tkPunkt(ev); else if (!geist) P = [b.halb ? F.L * 0.62 : F.L * 0.3, F.B / 2]; else return;
          tkMerken(); T.einwechseln(b, pid, P[0], P[1]); tkVoll();
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    });
  }
  function viewPaste() { return '<div class="card"><h2>Daten einfügen</h2><div class="muted">Geteilten Text (JSON) hier einfügen, z. B. aus einer Nachricht eines anderen Trainers. Auch Dateien aus Version 1.0 werden übernommen.</div><textarea id="pasteTx" style="min-height:220px;font-size:12px"></textarea><button class="btn" id="pasteGo">Importieren</button></div>'; }
  function bindPaste() { $('#pasteGo').addEventListener('click', function () { window.onImportText($('#pasteTx').value); }); }
  function importiere(txt) {   // liefert normalisierte Daten oder wirft
    var roh = JSON.parse(txt);
    if (!roh || !Array.isArray(roh.players)) throw new Error('Keine PSV-Kaderdatei');
    var alt = !(roh.version >= 2);
    return { d: normalize(roh), alt: alt };
  }
  function dateiSpeichern(name, txt, mime) {
    if (window.AndroidBridge && window.AndroidBridge.saveFile) { window.AndroidBridge.saveFile(name, txt); return; }
    webDownload(name, new Blob([txt], { type: mime || 'application/json' })); toast('Datei „' + name + '“ gespeichert');
  }
  function fotosUebernehmen(o) {   // {format:'psv-fotos-1', fotos:{Vorname: dataURL}} → Kinder ohne Foto
    var F = o.fotos || {}, n = 0;
    data.players.forEach(function (p) { var v = p.name ? E.firstName(p.name) : ''; if (!p.foto && v && typeof F[v] === 'string' && F[v].indexOf('data:image/') === 0) { p.foto = F[v]; n++; } });
    commit(); render(); toast(n + ' Foto(s) übernommen');
    return n;
  }
  function passwortAbfrage(titel, fn) {
    openSheet('<h3>' + esc(titel) + '</h3><input type="password" id="pwIn" autocomplete="off"><div class="muted" id="pwMsg"></div><button class="btn" id="pwGo">OK</button>', function (r) {
      $('#pwGo', r).addEventListener('click', function () { var b = this; b.disabled = true; $('#pwMsg', r).textContent = 'Wird entschlüsselt…'; fn($('#pwIn', r).value, function (fehler) { b.disabled = false; $('#pwMsg', r).textContent = fehler || ''; if (!fehler) closeSheet(); }); });
    });
  }
  window.onImportText = function (txt) {
    var C = window.PSVCloudCore;
    if (state.fotoImport) { state.fotoImport = false; try { var fo = JSON.parse(txt); if (fo && fo.format === 'psv-fotos-1') return fotosUebernehmen(fo); alert('Keine Foto-Datei (psv-fotos-1).'); } catch (e) { alert('Foto-Datei unlesbar: ' + e.message); } return; }
    if (C && C.istVerschluesselt(txt)) {
      return passwortAbfrage('Passwort der verschlüsselten Sicherung', function (pw, fertig) {
        C.importVerschluesselt(pw, txt).then(function (klar) { fertig(); window.onImportText(klar); }).catch(function (e) { fertig(e.message); });
      });
    }
    try { var fo2 = JSON.parse(txt); if (fo2 && fo2.format === 'psv-fotos-1') return fotosUebernehmen(fo2); } catch (e) { }
    try {
      var r = importiere(txt), d = r.d;
      var msg = 'Import ersetzt die aktuellen Daten (' + d.players.filter(function (p) { return p.name; }).length + ' Kinder, ' + d.spieltage.length + ' Spieltage in der Datei' + (r.alt ? ', Datei aus Version 1.0' : '') + ')' + (CLOUD ? ' – auch in der Cloud für alle Trainer im Team' : '') + '. Fortfahren?';
      if (!confirm(msg)) return;
      sichern('vor_json'); data = d; state.sub = null; state.detail = null; commit(); render(); toast('Import erfolgreich' + (r.alt ? ' (Datei aus Version 1.0 umgewandelt)' : ''));
    } catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
  };
  window.onNativeMessage = function (t) { toast(t); };
  setTimeout(function () { try { window.onImportBinaryBereit(); } catch (e) { } }, 300);   // Datei, die während eines Neustarts gewählt wurde
  $('#fileIn').addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { window.onImportText(r.result); }; r.readAsText(f); e.target.value = ''; });

  function viewGewichte() {
    var W = data.skala.weights, sum = 0; Object.keys(W).forEach(function (k) { sum += +W[k] || 0; });
    var h = '<div class="card"><h2>Gewichte der Kategorien</h2>';
    ['Technik', 'Taktik', 'Athletik', 'Mental', 'Form'].forEach(function (k) { h += '<label class="f">' + k + ' (%)</label><input type="number" step="1" min="0" max="100" data-w="' + k + '" value="' + Math.round((+W[k] || 0) * 100) + '">'; });
    h += '<div class="' + (Math.abs(sum - 1) > 0.001 ? 'warnbox' : 'muted') + '" style="margin-top:8px">Summe: ' + Math.round(sum * 100) + ' %' + (Math.abs(sum - 1) > 0.001 ? ' – sollte 100 % ergeben' : '') + '</div>';
    h += '<label class="f">Gewicht Ausdauer innerhalb Athletik (Feldspieler; 2 = doppelt, 1 = normal)</label><input type="number" step="0.5" min="1" max="5" id="ausW" value="' + esc(data.skala.ausdauerGewicht) + '"></div>';
    return h;
  }
  function bindGewichte() {
    $$('input[data-w]').forEach(function (el) { el.addEventListener('change', function () { data.skala.weights[el.getAttribute('data-w')] = (parseFloat(el.value) || 0) / 100; commit(); render(); }); });
    $('#ausW').addEventListener('change', function (e) { var v = parseFloat(String(e.target.value).replace(',', '.')); data.skala.ausdauerGewicht = E.isNum(v) && v >= 0 ? v : 1; commit(); render(); });
  }
  function viewZonen() {
    var Z = data.zones, S = data.settings;
    var h = '<div class="card"><h2>Bonus</h2><div class="grid2"><div><label class="f">Bonus Stammposition</label><input type="number" step="0.05" id="bS" value="' + esc(S.bonusStamm) + '"></div><div><label class="f">Bonus Alternativposition</label><input type="number" step="0.05" id="bA" value="' + esc(S.bonusAlt) + '"></div></div></div>';
    h += '<div class="card"><h2>Positions-Zonen</h2><div class="muted">Zeile = Stamm- oder Alternativposition des Kindes, Spalte = Position auf dem Feld. Zahl = Abzug von der Positionsnote, leer = nie dort aufstellen. Es gilt der kleinere Abzug aus Stamm- und Alternativposition.</div><div class="scroll"><table class="zt"><thead><tr><th></th>' + E.POS12.map(function (q) { return '<th>' + q + '</th>'; }).join('') + '</tr></thead><tbody>';
    E.ZROWS.forEach(function (r) {
      h += '<tr><th>' + r + '</th>' + E.POS12.map(function (q) { var v = Z[r] ? Z[r][q] : null; return '<td><input type="text" inputmode="decimal" data-r="' + r + '" data-q="' + q + '" value="' + (E.isNum(v) ? String(v).replace('.', ',') : '') + '"></td>'; }).join('') + '</tr>';
    });
    h += '</tbody></table></div><button class="btn warn" id="zReset">Zonen auf Standard zurücksetzen</button></div>';
    return h;
  }
  function bindZonen() {
    $$('input[data-r]').forEach(function (el) {
      el.addEventListener('change', function () {
        var r = el.getAttribute('data-r'), q = el.getAttribute('data-q'), v = parseFloat(el.value.replace(',', '.'));
        data.zones[r] = data.zones[r] || {};
        if (el.value.trim() === '' || !E.isNum(v)) delete data.zones[r][q]; else data.zones[r][q] = v;
        commit(); toast('Gespeichert – Aufstellung neu berechnet');
      });
    });
    $('#bS').addEventListener('change', function (e) { data.settings.bonusStamm = parseFloat(e.target.value) || 0; commit(); });
    $('#bA').addEventListener('change', function (e) { data.settings.bonusAlt = parseFloat(e.target.value) || 0; commit(); });
    $('#zReset').addEventListener('click', function () { if (!confirm('Zonen-Tabelle auf den Stand der Excel-Datei setzen?')) return; data.zones = clone(window.PSV_DEFAULT.zones); data.settings.bonusStamm = window.PSV_DEFAULT.settings.bonusStamm; data.settings.bonusAlt = window.PSV_DEFAULT.settings.bonusAlt; commit(); render(); });
  }

  // ---------- Start ----------
  load(); recalc(); wachHalten();
  function syncAnzeige(s) {
    var el = $('#syncSt'); if (!el) return;
    if (!CLOUD || !s || s.s === 'lokal') { el.classList.add('hidden'); return; }
    el.className = 'syncst ' + s.s; el.textContent = s.icon + (s.s === 'offline' ? ' offline' : s.s === 'fehler' ? ' Fehler' : ''); el.title = s.text;
  }
  if (CLOUD) {
    $('#syncSt').addEventListener('click', function () { if (CLOUD.entsperrt()) go('cloud'); });
    CLOUD.start({
      setzeDaten: function (d, vonRemote) {
        data = normalize(d ? clone(d) : clone(window.PSV_DEFAULT)); recalc();
        if (state.detail !== null && !data.players[state.detail]) state.detail = null;
        if (!vonRemote) { state.sub = null; state.detail = null; }
        korrekturMelden();
        keepScroll(render);
      },
      daten: function () { return data; },
      speichern: function () { save(); },
      liveAktiv: function () { return state.sub === 'live'; },
      beschaeftigt: function () { var a = document.activeElement; return state.sub === 'live' || !!state.sheet || !!state.praesVoll || !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.closest('#cloudUI')); },
      status: syncAnzeige,
      toast: toast,
      render: function () { keepScroll(render); },
      teamGeaendert: function () { var a = document.activeElement; if (state.tab === 'mehr' && (!state.sub || state.sub === 'cloud') && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) keepScroll(render); },
      konflikt: function () { },
      version: function () { return APP_VERSION; },
      hinweis: function (titel, text) { dialog(titel, '<p>' + esc(text) + '</p>', [{ t: 'OK' }]); },
      exportiereText: function (txt, was) { dateiSpeichern(exportName().replace('.json', '_' + was + '.json'), txt); },
      teileText: function (titel, txt) { if (window.AndroidBridge && window.AndroidBridge.shareText) window.AndroidBridge.shareText(titel, txt); else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Einladung kopiert'); }, function () { }); }
    });
  }
  (function () { var st = aktiv(); if (st && st.groesse) state.size = st.groesse; })();
  var hash = (location.hash || '').replace('#', '').split('/');
  if (hash[0] === 'detail') { state.tab = 'kader'; state.detail = +hash[1]; }
  else if (hash[0]) { if (['kader', 'ranking', 'spieltag', 'aufstellung', 'mehr'].indexOf(hash[0]) >= 0) state.tab = hash[0]; if (hash[1] && /^[79][A-F]$/.test(hash[1])) { state.size = hash[1].charAt(0); state.form[state.size] = hash[1]; } }
  render();
  window.__psv = { CLOUD: CLOUD, fotosUebernehmen: fotosUebernehmen, get data() { return data; }, get R() { return R; }, state: state, render: render, commit: commit, go: go, setTab: setTab, importiere: importiere, exportText: exportText, M: M, P: P, praesErzeugen: praesErzeugen, wtLaden: wtLaden };
})();
