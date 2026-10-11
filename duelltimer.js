/* Kaderkompass – Duell-Timer für den 1-gegen-1-Test (ab 2.7.1)
   Countdown mit kurzem Signal je Sekunde und langem Signal am Ende; Paarungsvorschlag für das nächste Duell. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PSVDuellTimer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MIN = 6, MAX = 12, STANDARD = 8;
  function sekunden(x) { x = Math.round(+x); return isFinite(x) && x >= MIN && x <= MAX ? x : STANDARD; }
  // o: { sek, jetzt(), planen(fn, ms), abbrechen(id), tick(rest), ende(grund: 'zeit' | 'stopp') }
  function starte(o) {
    var sek = sekunden(o.sek), t0 = o.jetzt(), id = null, fertig = false, letzte = sek;
    function schritt() {
      if (fertig) return;
      var rest = Math.max(0, sek - Math.floor((o.jetzt() - t0) / 1000));
      if (rest !== letzte) { letzte = rest; if (rest > 0) o.tick(rest, false); }
      if (rest <= 0) { fertig = true; o.tick(0, true); o.ende('zeit'); return; }
      id = o.planen(schritt, 100);
    }
    o.tick(sek, false); id = o.planen(schritt, 100);
    return { stopp: function () { if (fertig) return; fertig = true; if (id !== null && o.abbrechen) o.abbrechen(id); o.ende('stopp'); }, laeuft: function () { return !fertig; } };
  }
  // nächstes Duell: zuerst Rollen tauschen (wenn dieses Paar andersherum noch nicht gespielt hat), sonst Kinder mit den wenigsten Duellen der jeweiligen Rolle
  function naechstesPaar(duelle, ids, a, v) {
    duelle = duelle || [];
    var gespielt = function (x, y) { return duelle.filter(function (d) { return d.a === x && d.v === y; }).length; };
    if (a && v && ids.indexOf(a) >= 0 && ids.indexOf(v) >= 0 && gespielt(v, a) < gespielt(a, v)) return { a: v, v: a, grund: 'Rollen getauscht' };
    if (ids.length < 2) return null;
    var off = {}, def = {}; ids.forEach(function (id) { off[id] = 0; def[id] = 0; });
    duelle.forEach(function (d) { if (d.a in off) off[d.a]++; if (d.v in def) def[d.v]++; });
    var ang = ids.slice().sort(function (x, y) { return off[x] - off[y] || (def[x] + off[x]) - (def[y] + off[y]) || ids.indexOf(x) - ids.indexOf(y); })[0];
    var ver = ids.filter(function (id) { return id !== ang; }).sort(function (x, y) { return gespielt(ang, x) - gespielt(ang, y) || def[x] - def[y] || ids.indexOf(x) - ids.indexOf(y); })[0];
    return { a: ang, v: ver, grund: 'nächstes Paar' };
  }
  return { MIN: MIN, MAX: MAX, STANDARD: STANDARD, sekunden: sekunden, starte: starte, naechstesPaar: naechstesPaar };
});
