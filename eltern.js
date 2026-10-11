/* Kaderkompass – Elternbericht je Spieltag (ab 2.6)
   Für Eltern, die nicht beim Spiel waren: Ergebnis, eigene Tore mit Vorlage, Gegentore ohne Namen, wer dabei war, Wetter und Ort, Notiz des Trainerteams.
   Bewusst ohne Noten, Minuten, Abwehrfehler oder Kritik. Ausgabe als HTML (PDF über den Druckweg) und als Bild (Canvas). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PSVEltern = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VEREIN = 'PSV Wesel-Lackhausen';
  var C = { g: '#1B5E20', g2: '#2E7D32', bg: '#f3f5f2', card: '#fff', tx: '#1d2320', mu: '#68736c', bd: '#dfe5df', chip: '#eef2ee' };
  var FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  var LOGO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1024 1024\"><rect width=\"1024\" height=\"1024\" fill=\"#1B5E20\"/><rect x=\"275\" y=\"142\" width=\"474\" height=\"740\" rx=\"10\" fill=\"#FFFFFF\"/><rect x=\"301\" y=\"168\" width=\"422\" height=\"688\" fill=\"none\" stroke=\"#1B5E20\" stroke-width=\"18\"/><g fill=\"none\" stroke=\"#1B5E20\" stroke-width=\"18\"><line x1=\"287\" y1=\"512\" x2=\"737\" y2=\"512\"/><rect x=\"420\" y=\"154\" width=\"184\" height=\"62\"/><rect x=\"420\" y=\"808\" width=\"184\" height=\"62\"/></g><g transform=\"rotate(-30 512 512)\"><polygon points=\"512,206 590,512 434,512\" fill=\"#FFD600\" stroke=\"#1B5E20\" stroke-width=\"14\" stroke-linejoin=\"round\"/><polygon points=\"512,818 590,512 434,512\" fill=\"#1B5E20\" stroke=\"#1B5E20\" stroke-width=\"14\" stroke-linejoin=\"round\"/></g></svg>");
  var STANDARD_NOTIZ = 'Danke an alle Kinder für ihren Einsatz und an alle Eltern für die Unterstützung. Wir sehen uns beim nächsten Training!';
  var BED = { dry: 'trocken', fog: 'Nebel', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
  var TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function h(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function zahl(x, n) { return String(Math.round(x * Math.pow(10, n || 0)) / Math.pow(10, n || 0)).replace('.', ','); }
  function datumTxt(iso) {
    if (!iso) return ''; var p = iso.split('-'); if (p.length !== 3) return iso;
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return TAGE[d.getUTCDay()] + ', ' + p[2] + '.' + p[1] + '.' + p[0];
  }
  function einstellungen(st) { return st.eltern || {}; }
  function wetterTxt(w) {
    if (!w || !isNum(w.temp)) return '';
    var t = [zahl(w.temp) + ' °C']; if (BED[w.bed]) t.push(BED[w.bed]);
    if (isNum(w.wind)) t.push('Wind ' + zahl(w.wind) + ' km/h');
    t.push(w.regenMm > 0 ? 'Regen im Spiel ' + zahl(w.regenMm, 1) + ' mm' : 'kein Regen im Spiel');
    if (w.gewitter) t.push('Gewitter');
    return t.join(' · ');
  }
  // Inhalt aus den Spieltagsdaten (M = Modell, opt.platz = Spielort-Name)
  function daten(M, d, st, opt) {
    opt = opt || {};
    var s = M.spielbericht(st), name = function (pid) { var p = M.spielerById(d, pid); return p ? (p.name || '').trim().split(/\s+/)[0] : ''; };
    var L = st.live || {}, H = L.halbzeit || (st.spielzeit ? st.spielzeit / 2 : null) || (M.spielzeitVon ? M.spielzeitVon(st) / 2 : null);
    var ev = [];
    s.tore.forEach(function (t) { ev.push({ typ: 'tor', minute: isNum(t.minute) ? t.minute : null, name: t.pid ? name(t.pid) : '', vorlage: t.assist ? name(t.assist) : '', elfmeter: !!t.elfmeter }); });
    s.gegen.forEach(function (g) { ev.push({ typ: 'gegentor', minute: isNum(g.minute) ? g.minute : null, elfmeter: !!g.elfmeter }); });   // bewusst ohne Namen
    ev.forEach(function (e, k) { e.k = k; });
    ev.sort(function (a, b) { return (isNum(a.minute) ? a.minute : 999) - (isNum(b.minute) ? b.minute : 999) || a.k - b.k; });
    var tore = s.tore.length, gegentore = s.gegentore, pause = null;
    if (isNum(H) && s.gegen.length === gegentore && ev.length && ev.every(function (e) { return isNum(e.minute); })) {
      pause = { tore: 0, gegentore: 0 }; ev.forEach(function (e) { if (e.minute <= H) { if (e.typ === 'tor') pause.tore++; else pause.gegentore++; } });
    }
    var ids = [], dazu = function (pid) { if (pid && ids.indexOf(pid) < 0) ids.push(pid); };
    M.startelfListe(st).forEach(function (x) { dazu(x.pid); }); s.wechsel.forEach(function (w) { dazu(w.rein); });
    if (!ids.length) d.players.forEach(function (p) { if (p.name && M.hatGespielt(st, p.id)) dazu(p.id); });
    ids = ids.filter(function (pid) { var m = M.minutenFuer(st, pid); return !isNum(m) || m > 0; });
    var spieler = ids.map(name).filter(Boolean).sort(function (a, b) { return a.localeCompare(b, 'de'); });
    var e = einstellungen(st), verletzt = [];
    s.karten.forEach(function (k) { if (k.art === 'Verletzung') { var n = name(k.pid); if (n && verletzt.indexOf(n) < 0) verletzt.push(n); } });
    return {
      verein: VEREIN, gegner: st.gegner || 'Gegner', datum: datumTxt(st.datum), datumIso: st.datum || '', ort: st.ort || '', format: st.groesse ? st.groesse + 'er' : '',
      halbzeit: isNum(H) ? H : null, tore: tore, gegentore: gegentore, pause: pause, ohneWertung: !!st.ohneWertung,
      verlauf: ev.map(function (x) { delete x.k; return x; }), spieler: spieler,
      wetter: wetterTxt(st.wetter), wetterQuelle: st.wetter ? 'Wetterdaten: Deutscher Wetterdienst (DWD) über Bright Sky' : '',
      platz: opt.platz || '', notiz: typeof e.notiz === 'string' ? e.notiz : STANDARD_NOTIZ,
      besserung: e.besserung && verletzt.length ? verletzt : [], verletzt: verletzt
    };
  }
  function metaTxt(m) { return [m.datum, m.ort, m.format, m.halbzeit ? '2 × ' + m.halbzeit + ' Min.' : ''].filter(Boolean).join(' · '); }
  function torZeile(e) { return e.typ === 'tor' ? { titel: 'Tor' + (e.name ? ' – ' + e.name : '') + (e.elfmeter ? ' (Elfmeter)' : ''), zusatz: e.vorlage ? 'Vorlage ' + e.vorlage : '' } : { titel: 'Gegentor' + (e.elfmeter ? ' (Elfmeter)' : ''), zusatz: '' }; }
  function minTxt(m) { return isNum(m) ? m + '′' : '–'; }
  function dateiname(m, ext) { return 'Elternbericht_' + (m.datumIso || 'Spiel') + '_' + m.gegner.replace(/[^\wäöüÄÖÜß-]+/g, '_').replace(/_+$/, '') + '.' + ext; }

  // ---------- HTML (A4 hoch, für PDF/Druck) ----------
  var CSS = ':root{--g:' + C.g + ';--bg:' + C.bg + ';--card:#fff;--tx:' + C.tx + ';--mu:' + C.mu + ';--bd:' + C.bd + '}' +
    '*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.4 ' + FONT + '}' +
    '.eb{max-width:720px;margin:0 auto}.kopf{background:var(--g);color:#fff;display:flex;align-items:center;gap:10px;padding:12px 16px}.kopf img{width:34px;height:34px;border-radius:7px}.kopf b{font-size:18px;display:block}.kopf span{font-size:12.5px;opacity:.85}' +
    '.inh{padding:12px}.card{background:#fff;border-radius:12px;padding:12px 14px;margin:0 0 10px;box-shadow:0 1px 2px rgba(0,0,0,.08);break-inside:avoid}.card h2{font-size:15px;margin:0 0 8px;color:var(--g)}' +
    '.sc{display:flex;align-items:center;justify-content:space-between;gap:8px}.team{flex:1;font-weight:700;font-size:15px;text-align:center}.res b{font-size:36px;color:var(--g);white-space:nowrap}.mu{color:var(--mu);font-size:12.5px}.zen{text-align:center}' +
    '.ev{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--bd)}.ev:last-child{border-bottom:0}.ev .m{width:36px;color:var(--mu);flex:none;text-align:right}.ev.tor b{color:var(--g)}.ev.gegentor{color:var(--mu)}.hz{font-size:12px;color:var(--mu);text-align:center;padding:4px 0;border-bottom:1px solid var(--bd)}' +
    '.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:14px;padding:4px 10px;border-radius:6px;background:#eef2ee;color:#334}.notiz{white-space:pre-wrap}.fuss{text-align:center;font-size:11px;color:var(--mu);padding:4px 0 12px}' +
    '@page{size:A4 portrait;margin:12mm}@media print{html,body{background:#fff}.eb{max-width:none}.card{box-shadow:none;border:1px solid var(--bd)}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  function html(m, logoSrc) {
    var v = '';
    var hz = m.halbzeit, hzGezeigt = false;
    m.verlauf.forEach(function (e) {
      if (hz && !hzGezeigt && isNum(e.minute) && e.minute > hz) { hzGezeigt = true; v += '<div class="hz">Halbzeit' + (m.pause ? ' ' + m.pause.tore + ' : ' + m.pause.gegentore : '') + '</div>'; }
      var z = torZeile(e); v += '<div class="ev ' + e.typ + '"><span class="m">' + minTxt(e.minute) + '</span><span>' + (e.typ === 'tor' ? '<b>' + h(z.titel) + '</b>' : h(z.titel)) + (z.zusatz ? ' <span class="mu">' + h(z.zusatz) + '</span>' : '') + '</span></div>';
    });
    return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + h('Elternbericht ' + m.datum + ' gegen ' + m.gegner) + '</title><style>' + CSS + '</style></head><body><div class="eb">' +
      '<div class="kopf">' + (logoSrc ? '<img src="' + h(logoSrc) + '" alt="">' : '') + '<div><b>' + h(m.verein) + '</b><span>Spielbericht für Eltern</span></div></div><div class="inh">' +
      '<div class="card"><div class="mu zen">' + h(metaTxt(m)) + '</div><div class="sc" style="margin-top:6px"><div class="team">' + h(m.verein) + '</div><div class="res"><b>' + m.tore + ' : ' + m.gegentore + '</b></div><div class="team">' + h(m.gegner) + '</div></div>' +
      (m.pause ? '<div class="mu zen">Halbzeit ' + m.pause.tore + ' : ' + m.pause.gegentore + '</div>' : '') + (m.ohneWertung ? '<div class="mu zen">Spiel ohne Wertung</div>' : '') + '</div>' +
      (m.verlauf.length ? '<div class="card"><h2>Spielverlauf</h2>' + v + '</div>' : '') +
      (m.spieler.length ? '<div class="card"><h2>Dabei waren</h2><div class="chips">' + m.spieler.map(function (n) { return '<span class="chip">' + h(n) + '</span>'; }).join('') + '</div></div>' : '') +
      (m.platz || m.wetter ? '<div class="card"><h2>Ort und Wetter</h2>' + (m.platz ? '<div>' + h(m.platz) + '</div>' : '') + (m.wetter ? '<div style="margin-top:4px">' + h(m.wetter) + '</div><div class="mu" style="font-size:11px;margin-top:4px">' + h(m.wetterQuelle) + '</div>' : '') + '</div>' : '') +
      (m.notiz || m.besserung.length ? '<div class="card"><h2>Vom Trainerteam</h2>' + (m.notiz ? '<div class="notiz">' + h(m.notiz) + '</div>' : '') + (m.besserung.length ? '<div style="margin-top:8px"><b>Gute Besserung, ' + h(m.besserung.join(' und ')) + '!</b></div>' : '') + '</div>' : '') +
      '<div class="fuss">Kaderkompass</div></div></div></body></html>';
  }

  // ---------- Bild (Canvas, Handy hochkant) ----------
  function umbruch(ctx, text, maxW) {
    var out = []; String(text).split('\n').forEach(function (abs) {
      var w = [], z = '';
      abs.split(' ').forEach(function (x, i) { x.replace(/([\/-])/g, '$1\u0000').split('\u0000').filter(Boolean).forEach(function (y, j) { w.push({ t: y, sp: i > 0 && j === 0 }); }); });
      w.forEach(function (x) {
        var t = z ? z + (x.sp ? ' ' : '') + x.t : x.t;
        if (ctx.measureText(t).width <= maxW || !z) z = t; else { out.push(z); z = x.t; }
        while (ctx.measureText(z).width > maxW && z.length > 1) { var k = z.length - 1; while (k > 1 && ctx.measureText(z.slice(0, k)).width > maxW) k--; out.push(z.slice(0, k)); z = z.slice(k); }
      });
      out.push(z);
    }); return out;
  }
  function zeichne(canvas, m, logo) {   // Breite 360 CSS-Pixel × 3
    var S = 3, W = 360, P = 12, IW = W - 2 * P - 28;
    var ctx = canvas.getContext('2d');
    function f(gr, gew) { ctx.font = (gew || 400) + ' ' + gr + 'px ' + FONT; }
    // Blöcke: jede Karte als Liste von Zeichenbefehlen mit Höhe
    function karte(titel, inhalt) { return { titel: titel, inhalt: inhalt }; }
    var K = [];
    K.push(karte(null, function (y, mal) {
      var y0 = y; f(12.5); ctx.fillStyle = C.mu; ctx.textAlign = 'center'; if (mal) ctx.fillText(metaTxt(m), W / 2, y + 12); y += 22;
      f(13.5, 700); var tw = (IW - 96) / 2, LA = umbruch(ctx, m.verein, tw), LB = umbruch(ctx, m.gegner, tw), n = Math.max(LA.length, LB.length), hb = Math.max(48, n * 17 + 6), mitte = y + hb / 2;
      function zl(L, x) { L.forEach(function (l, i) { if (mal) { ctx.fillStyle = C.tx; ctx.fillText(l, x, mitte + 5 - (L.length - 1) * 8.5 + i * 17); } }); }
      zl(LA, P + 14 + tw / 2); zl(LB, W - P - 14 - tw / 2);
      f(34, 700); ctx.fillStyle = C.g; if (mal) ctx.fillText(m.tore + ' : ' + m.gegentore, W / 2, mitte + 12);
      y += hb + 6;
      f(12.5); ctx.fillStyle = C.mu;
      if (m.pause) { if (mal) ctx.fillText('Halbzeit ' + m.pause.tore + ' : ' + m.pause.gegentore, W / 2, y + 10); y += 18; }
      if (m.ohneWertung) { if (mal) ctx.fillText('Spiel ohne Wertung', W / 2, y + 10); y += 18; }
      ctx.textAlign = 'left'; return y - y0;
    }));
    if (m.verlauf.length) K.push(karte('Spielverlauf', function (y, mal) {
      var y0 = y, hzG = false, X = P + 14;
      function linie() { if (mal) { ctx.fillStyle = C.bd; ctx.fillRect(X, y, IW, 1); } }
      m.verlauf.forEach(function (e, i) {
        if (m.halbzeit && !hzG && isNum(e.minute) && e.minute > m.halbzeit) { hzG = true; f(12); ctx.fillStyle = C.mu; ctx.textAlign = 'center'; if (mal) ctx.fillText('Halbzeit' + (m.pause ? ' ' + m.pause.tore + ' : ' + m.pause.gegentore : ''), W / 2, y + 16); ctx.textAlign = 'left'; y += 24; linie(); }
        var z = torZeile(e); f(15); ctx.fillStyle = C.mu; ctx.textAlign = 'right'; if (mal) ctx.fillText(minTxt(e.minute), X + 34, y + 21); ctx.textAlign = 'left';
        f(15, e.typ === 'tor' ? 700 : 400); ctx.fillStyle = e.typ === 'tor' ? C.g : C.mu; if (mal) ctx.fillText(z.titel, X + 46, y + 21);
        var hh = 32;
        if (z.zusatz) { var tw = ctx.measureText(z.titel).width; f(13); ctx.fillStyle = C.mu; if (X + 46 + tw + 8 + ctx.measureText(z.zusatz).width < X + IW) { if (mal) ctx.fillText(z.zusatz, X + 46 + tw + 8, y + 21); } else { if (mal) ctx.fillText(z.zusatz, X + 46, y + 39); hh = 48; } }
        y += hh; if (i < m.verlauf.length - 1) linie();
      });
      return y - y0;
    }));
    if (m.spieler.length) K.push(karte('Dabei waren', function (y, mal) {
      var y0 = y, x = P + 14; f(14);
      m.spieler.forEach(function (n) { var w = ctx.measureText(n).width + 20; if (x + w > P + 14 + IW) { x = P + 14; y += 32; } if (mal) { ctx.fillStyle = C.chip; rr(x, y, w, 26, 6); ctx.fill(); ctx.fillStyle = '#334'; ctx.fillText(n, x + 10, y + 18); } x += w + 6; });
      return y + 26 - y0;
    }));
    if (m.platz || m.wetter) K.push(karte('Ort und Wetter', function (y, mal) {
      var y0 = y; f(15); ctx.fillStyle = C.tx;
      if (m.platz) umbruch(ctx, m.platz, IW).forEach(function (l) { if (mal) ctx.fillText(l, P + 14, y + 15); y += 20; });
      if (m.wetter) { if (m.platz) y += 4; umbruch(ctx, m.wetter, IW).forEach(function (l) { if (mal) ctx.fillText(l, P + 14, y + 15); y += 20; }); f(11); ctx.fillStyle = C.mu; umbruch(ctx, m.wetterQuelle, IW).forEach(function (l) { if (mal) ctx.fillText(l, P + 14, y + 14); y += 15; }); }
      return y - y0;
    }));
    if (m.notiz || m.besserung.length) K.push(karte('Vom Trainerteam', function (y, mal) {
      var y0 = y; f(15); ctx.fillStyle = C.tx;
      if (m.notiz) umbruch(ctx, m.notiz, IW).forEach(function (l) { if (mal) ctx.fillText(l, P + 14, y + 15); y += 21; });
      if (m.besserung.length) { y += 6; f(15, 700); umbruch(ctx, 'Gute Besserung, ' + m.besserung.join(' und ') + '!', IW).forEach(function (l) { if (mal) ctx.fillText(l, P + 14, y + 15); y += 21; }); }
      return y - y0;
    }));
    function rr(x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function lauf(mal) {
      var y = 0;
      if (mal) { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, 10000); ctx.fillStyle = C.g; ctx.fillRect(0, 0, W, 58); if (logo) { ctx.save(); rr(P + 2, 12, 34, 34, 7); ctx.clip(); ctx.drawImage(logo, P + 2, 12, 34, 34); ctx.restore(); }
        ctx.fillStyle = '#fff'; f(18, 700); ctx.fillText(m.verein, P + (logo ? 46 : 4), 29); f(12.5); ctx.globalAlpha = .85; ctx.fillText('Spielbericht für Eltern', P + (logo ? 46 : 4), 46); ctx.globalAlpha = 1; }
      y = 58 + P;
      K.forEach(function (k) {
        var kopf = k.titel ? 26 : 0, hh = k.inhalt(y + 12 + kopf, false) + 24 + kopf;
        if (mal) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.08)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1; ctx.fillStyle = '#fff'; rr(P, y, W - 2 * P, hh, 12); ctx.fill(); ctx.restore();
          if (k.titel) { f(15, 700); ctx.fillStyle = C.g; ctx.fillText(k.titel, P + 14, y + 12 + 16); } k.inhalt(y + 12 + kopf, true); }
        y += hh + 10;
      });
      if (mal) { f(11); ctx.fillStyle = C.mu; ctx.textAlign = 'center'; ctx.fillText('Kaderkompass', W / 2, y + 10); ctx.textAlign = 'left'; }
      return y + 24;
    }
    canvas.width = W * S; canvas.height = 2000 * S; ctx = canvas.getContext('2d'); ctx.scale(S, S);
    var H = lauf(false);
    canvas.height = Math.ceil(H * S); ctx = canvas.getContext('2d'); ctx.setTransform(S, 0, 0, S, 0, 0); ctx.textBaseline = 'alphabetic';
    lauf(true); return canvas;
  }
  return { LOGO: LOGO, daten: daten, html: html, zeichne: zeichne, dateiname: dateiname, STANDARD_NOTIZ: STANDARD_NOTIZ, wetterTxt: wetterTxt };
});
