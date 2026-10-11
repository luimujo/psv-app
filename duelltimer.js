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
  // nächstes Duell (ab 2.7.2: ausgewogene Rotation bis jedes Kind „ziel“ Duelle je Rolle hat, wechselnde Gegner; ungerade Anzahl ok)
  function stand(duelle, ids) {
    var off = {}, def = {}; ids.forEach(function (id) { off[id] = 0; def[id] = 0; });
    (duelle || []).forEach(function (d) { if (d.a in off) off[d.a]++; if (d.v in def) def[d.v]++; });
    return { off: off, def: def };
  }
  function naechstesPaar(duelle, ids, a, v, ziel) {
    duelle = duelle || []; ziel = ziel || 6; if (ids.length < 2) return null;
    var S = stand(duelle, ids), off = S.off, def = S.def;
    var begegnung = function (x, y) { return duelle.filter(function (d) { return (d.a === x && d.v === y) || (d.a === y && d.v === x); }).length; };
    var richtung = function (x, y) { return duelle.filter(function (d) { return d.a === x && d.v === y; }).length; };
    var offen = function (id) { return Math.max(0, ziel - off[id]) + Math.max(0, ziel - def[id]); };
    if (ids.every(function (id) { return off[id] >= ziel && def[id] >= ziel; })) return null;
    // Rollentausch, wenn beide in der getauschten Rolle noch Duelle brauchen und das Paar andersherum seltener gespielt hat
    if (a && v && ids.indexOf(a) >= 0 && ids.indexOf(v) >= 0 && off[v] < ziel && def[a] < ziel && richtung(v, a) < richtung(a, v)) return { a: v, v: a, grund: 'Rollen getauscht' };
    var pos = function (id) { return ids.indexOf(id); };
    var letzte = duelle.length ? duelle[duelle.length - 1] : null, pause = function (id) { return letzte && (letzte.a === id || letzte.v === id) ? 1 : 0; };
    var ang = ids.slice().sort(function (x, y) { return (off[x] >= ziel) - (off[y] >= ziel) || off[x] - off[y] || pause(x) - pause(y) || offen(y) - offen(x) || pos(x) - pos(y); })[0];
    var ver = ids.filter(function (id) { return id !== ang; }).sort(function (x, y) { return (def[x] >= ziel) - (def[y] >= ziel) || begegnung(ang, x) - begegnung(ang, y) || def[x] - def[y] || pause(x) - pause(y) || pos(x) - pos(y); })[0];
    return { a: ang, v: ver, grund: 'nächstes Paar' };
  }
  return { MIN: MIN, MAX: MAX, STANDARD: STANDARD, sekunden: sekunden, starte: starte, stand: stand, naechstesPaar: naechstesPaar, ZIEL: 6 };
});
