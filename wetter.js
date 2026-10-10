/* PSV Wesel-Lackhausen – Wetter zur Spielzeit (ab 2.4)
   Quelle: Deutscher Wetterdienst (DWD) über die Bright Sky API (https://brightsky.dev, frei, ohne Schlüssel).
   Vorhersage: MOSMIX/Beobachtungen stündlich; Regenradar: RADOLAN-RV-Nowcast in 5-Minuten-Schritten bis 2 h; Warnungen: DWD-CAP.
   Es werden nur die Platz-Koordinaten übertragen – keine Kinderdaten. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PSVWetter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var API = 'https://api.brightsky.dev';
  var HEIM = { name: 'PSV-Sportanlage Molkereiweg 14a, 46485 Wesel-Lackhausen', lat: 51.6799, lon: 6.6395, quelle: 'heim' };
  var QUELLE = 'Quelle: Deutscher Wetterdienst (DWD), über Bright Sky';
  var RADAR_KM = 15;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // Europe/Berlin-Ortszeit → Zeitstempel (ms), unabhängig von der Gerätezeitzone
  function berlinOffsetMin(ms) {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)), o = {};
      p.forEach(function (x) { o[x.type] = x.value; });
      return Math.round((Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute) - Math.floor(ms / 60000) * 60000) / 60000);
    } catch (e) { return 120; }
  }
  function berlinMs(datum, hhmm) {
    if (!datum || !/^\d{4}-\d\d-\d\d$/.test(datum)) return null;
    var z = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); if (!z) return null;
    var d = datum.split('-'), utc = Date.UTC(+d[0], +d[1] - 1, +d[2], +z[1], +z[2]);
    var off = berlinOffsetMin(utc - 60 * 60000); return utc - berlinOffsetMin(utc - off * 60000) * 60000;
  }
  function hhmm(ms) { if (!ms && ms !== 0) return '–'; var o = berlinOffsetMin(ms), d = new Date(ms + o * 60000); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function iso(ms) { var o = berlinOffsetMin(ms), d = new Date(ms + o * 60000); return d.toISOString().slice(0, 19) + (o >= 0 ? '+' : '-') + pad(Math.floor(Math.abs(o) / 60)) + ':' + pad(Math.abs(o) % 60); }
  // Spielfenster: Treffen (oder 60 Min. vor Anpfiff) bis Spielende (Anpfiff + Spielzeit + 10 Min. Pause)
  function fenster(st) {
    var an = berlinMs(st.datum, st.uhrzeit); if (!an) return null;
    var tr = berlinMs(st.datum, st.treffen); if (!tr || tr > an || an - tr > 4 * 3600000) tr = an - 60 * 60000;
    var dauer = (st.spielzeit > 0 ? st.spielzeit : 60) + 10;
    return { treffen: tr, anpfiff: an, ende: an + dauer * 60000 };
  }
  function ort(d, st, gegner) {   // gespeicherter Spielort, sonst Heimplatz bzw. Gegnerplatz
    if (st.wetterOrt && isFinite(st.wetterOrt.lat) && isFinite(st.wetterOrt.lon)) return st.wetterOrt;
    if (st.ort !== 'Auswärts') return HEIM;
    if (gegner && gegner.koord && isFinite(gegner.koord.lat)) return { name: gegner.koord.name || gegner.platz || gegner.name, lat: gegner.koord.lat, lon: gegner.koord.lon, quelle: 'gegner' };
    return null;
  }
  // Aktualisierung: alle 5 Min. ab 3 h vor Anpfiff bis Spielende bzw. Abpfiff
  function phase(f, now, live) {
    if (!f) return 'ohneZeit';
    if (live === 'h1' || live === 'pause' || live === 'h2') return 'live';
    if (live === 'ende' && now > f.anpfiff) return 'vorbei';
    if (now > f.ende) return 'vorbei';
    if (now >= f.anpfiff - 3 * 3600000) return 'nah';
    if (now >= f.anpfiff - 10 * 86400000) return 'vorschau';
    return 'fern';
  }
  function radarAktiv(f, now, ph) { return ph === 'live' || (ph === 'nah' && now >= f.anpfiff - 2 * 3600000) || (f && now >= f.anpfiff - 2 * 3600000 && now <= f.ende); }
  function urls(o, f) {
    var a = f.treffen - 3600000, b = f.ende + 3600000, ll = 'lat=' + o.lat.toFixed(4) + '&lon=' + o.lon.toFixed(4);
    return { wetter: API + '/weather?' + ll + '&date=' + encodeURIComponent(iso(a)) + '&last_date=' + encodeURIComponent(iso(b)) + '&tz=Europe/Berlin',
      radar: API + '/radar?' + ll + '&distance=' + (RADAR_KM * 1000) + '&format=plain&tz=Europe/Berlin', warnungen: API + '/alerts?' + ll + '&tz=Europe/Berlin' };
  }
  var GEWITTER = /thunder/;
  function stunden(w, f) {   // stündliche Werte im Spielfenster
    var L = (w && w.weather) || [], a = f.treffen - 3600000 + 1, b = f.ende;
    return L.filter(function (x) { var t = Date.parse(x.timestamp); return t > a - 3600000 && t <= b + 3599999; }).map(function (x) {
      return { t: Date.parse(x.timestamp), temp: x.temperature, wkt: x.precipitation_probability, mm: x.precipitation, wind: x.wind_speed, boeen: x.wind_gust_speed, bed: x.condition, icon: x.icon, gewitter: GEWITTER.test(x.condition || '') || GEWITTER.test(x.icon || '') };
    }).filter(function (x) { return x.t >= Math.floor((f.treffen) / 3600000) * 3600000 && x.t <= f.ende; });
  }
  function staerke(mmh) { return mmh < 0.1 ? '' : mmh < 2.5 ? 'leicht' : mmh < 7.6 ? 'mäßig' : 'stark'; }
  function nowcast(r) {   // Radar am Platz (Maximum 3×3 km um den Platz) je 5 Min., mm/h
    if (!r || !r.radar || !r.radar.length) return [];
    var p = r.latlon_position || { x: 0, y: 0 }, cx = Math.round(p.x), cy = Math.round(p.y);
    return r.radar.map(function (fr) {
      var g = fr.precipitation_5 || [], m = 0;
      for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++) if (g[y] && g[y][x] > m) m = g[y][x];
      return { t: Date.parse(fr.timestamp), mmh: Math.round(m * 0.01 * 12 * 10) / 10 };
    });
  }
  function nowcastText(nc, now) {
    var L = nc.filter(function (x) { return x.t >= now - 5 * 60000; }); if (!L.length) return '';
    var nass = function (x) { return x.mmh >= 0.1; }, i = L.findIndex ? L.findIndex(nass) : -1;
    if (i < 0) return 'Kein Regen bis ca. ' + hhmm(L[L.length - 1].t);
    var max = 0, j = i; while (j < L.length && nass(L[j])) { max = Math.max(max, L[j].mmh); j++; }
    if (i === 0) return 'Regen jetzt, ' + staerke(max) + (j < L.length ? ' – endet ca. ' + hhmm(L[j].t) : ' – hält an');
    return 'Regen ab ca. ' + hhmm(L[i].t) + ', ' + staerke(max);
  }
  function warnungen(a) { return ((a && a.alerts) || []).map(function (x) { return { titel: x.headline_de || x.event_de || 'Wetterwarnung', stufe: x.severity, von: Date.parse(x.onset), bis: Date.parse(x.expires), text: x.description_de || '' }; }); }
  function relevanteWarnungen(L, f) { return L.filter(function (w) { return !f || (w.bis >= f.treffen && w.von <= f.ende); }); }
  // Endstand für den Spieltag (Anpfiff + Regen im Spiel)
  function abschluss(w, nc, f, alt) {
    var S = stunden(w, f), k = S.filter(function (x) { return x.t <= f.anpfiff; }).pop() || S[0]; if (!k) return alt || null;
    var im = S.filter(function (x) { return x.t > f.anpfiff - 3600000 && x.t <= f.ende; });
    var mm = im.reduce(function (s, x) { return s + (x.mm || 0); }, 0), maxR = 0;
    (nc || []).forEach(function (x) { if (x.t >= f.anpfiff && x.t <= f.ende) maxR = Math.max(maxR, x.mmh); });
    if (alt && alt.radarMax > maxR) maxR = alt.radarMax;
    return { temp: k.temp, bed: k.bed, wind: k.wind, boeen: k.boeen, regenMm: Math.round(mm * 10) / 10, radarMax: maxR, gewitter: im.some(function (x) { return x.gewitter; }) || !!(alt && alt.gewitter), quelle: 'DWD' };
  }
  var BED = { dry: 'trocken', fog: 'Nebel', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
  var ICON = { 'clear-day': '☀️', 'clear-night': '🌙', 'partly-cloudy-day': '⛅', 'partly-cloudy-night': '☁️', cloudy: '☁️', fog: '🌫', wind: '💨', rain: '🌧', sleet: '🌨', snow: '❄️', hail: '🌨', thunderstorm: '⛈' };
  function zahl(x, n) { return x === null || x === undefined || !isFinite(x) ? '–' : String(Math.round(x * Math.pow(10, n || 0)) / Math.pow(10, n || 0)).replace('.', ','); }
  function abschlussText(e) {
    if (!e) return '';
    return 'Wetter: ' + zahl(e.temp) + ' °C' + (BED[e.bed] ? ', ' + BED[e.bed] : '') + ', Wind ' + zahl(e.wind) + ' km/h' + (e.boeen ? ' (Böen ' + zahl(e.boeen) + ')' : '') +
      (e.regenMm > 0 || e.radarMax >= 0.1 ? ', Regen im Spiel ' + zahl(e.regenMm, 1) + ' mm' + (e.radarMax >= 0.1 ? ' (' + staerke(e.radarMax) + ')' : '') : ', kein Regen im Spiel') + (e.gewitter ? ', Gewitter' : '') + ' (DWD)';
  }
  var FARBEN = [[0.1, [160, 210, 255]], [0.5, [80, 160, 255]], [2.5, [30, 90, 230]], [7.6, [250, 200, 0]], [20, [240, 80, 0]], [1e9, [200, 0, 120]]];
  function farbe(mmh) { for (var i = 0; i < FARBEN.length; i++) if (mmh < FARBEN[i][0]) return i ? FARBEN[i - 1][1] : null; return FARBEN[FARBEN.length - 1][1]; }
  return { API: API, HEIM: HEIM, QUELLE: QUELLE, RADAR_KM: RADAR_KM, berlinMs: berlinMs, hhmm: hhmm, iso: iso, fenster: fenster, ort: ort, phase: phase, radarAktiv: radarAktiv, urls: urls,
    stunden: stunden, nowcast: nowcast, nowcastText: nowcastText, staerke: staerke, warnungen: warnungen, relevanteWarnungen: relevanteWarnungen, abschluss: abschluss, abschlussText: abschlussText,
    BED: BED, ICON: ICON, zahl: zahl, farbe: farbe };
});
