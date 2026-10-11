/* Kaderkompass – Messwerkzeuge je Test (ab 2.8): Stoppuhr, Lauf-Countdown mit Rundenzähler, Zähler, Treffer, Reaktionssignal, Schnelleingabe */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PSVMesstools = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var NAMEN = { stoppuhr: 'Stoppuhr mit Startsignal', lauf: 'Lauf-Countdown mit Rundenzähler', runden: 'Rundenzähler (mehrere Kinder)', zaehler: 'Zähler (Tippen)', treffer: 'Treffer / Daneben', reaktion: 'Reaktionssignal + Eingabe', eingabe: 'Schnelleingabe der Versuche', duell: '1-gegen-1 mit Duell-Timer' };
  var FEST = { sprint5: 'stoppuhr', sprint10: 'stoppuhr', sprint20: 'stoppuhr', gewandt: 'stoppuhr', dribbling: 'stoppuhr', leiter: 'stoppuhr', lauf6: 'lauf', yoyo: 'runden',
    jongl_stark: 'zaehler', jongl_schwach: 'zaehler', pass10: 'treffer', torschuss: 'treffer', beidfuss: 'treffer', tw_reaktion: 'treffer', tw_abwurf: 'treffer',
    reaktion: 'reaktion', sprung: 'eingabe', schuss_kmh: 'eingabe', tw_abschlag: 'eingabe', groesse: 'eingabe', gewicht: 'eingabe', duell_off: 'duell', duell_def: 'duell' };
  function werkzeug(t) {
    if (!t) return 'eingabe'; if (FEST[t.id]) return FEST[t.id];
    if (t.einheit === 's') return 'stoppuhr'; if (/^Treffer/.test(t.einheit || '')) return 'treffer'; if (t.einheit === 'Anzahl') return 'zaehler';
    return 'eingabe';
  }
  function laufDauer(t) { var m = /(\d+)-Minuten/.exec(t && t.name || ''); return m ? +m[1] * 60 : 360; }
  function zeitWert(ms) { return Math.round(ms / 10) / 100; }   // Sekunden mit 2 Nachkommastellen
  function freierVersuch(L, versuche) { L = L || []; for (var i = 0; i < versuche; i++) if (L[i] === null || L[i] === undefined) return i; return -1; }
  function naechstesKind(werte, tid, ids, pid, versuche) {   // nächstes Kind (nach pid, ringförmig) mit freiem Versuch
    var n = ids.length, start = Math.max(-1, ids.indexOf(pid));
    for (var k = 1; k <= n; k++) { var id = ids[(start + k) % n]; if (freierVersuch(werte[id] && werte[id][tid], versuche) >= 0) return id; }
    return null;
  }
  function strecke(runden, laenge, rest) { return Math.max(0, Math.round((runden || 0) * (laenge || 0) + (+rest || 0))); }
  var SEQUENZ = [{ t: 0, ms: 180, hz: 1800 }, { t: 1000, ms: 180, hz: 1800 }, { t: 2000, ms: 500, hz: 2900 }];   // Auf die Plätze – fertig – los (Start bei 2000 ms)
  function minutenSignale(dauerSek, verstrichenSek, schon) {   // volle Minuten: kurz, Ende: lang
    var out = [];
    for (var m = 1; m * 60 < dauerSek; m++) if (verstrichenSek >= m * 60 && !schon['m' + m]) { schon['m' + m] = true; out.push('minute'); }
    if (verstrichenSek >= dauerSek && !schon.ende) { schon.ende = true; out.push('ende'); }
    return out;
  }
  return { NAMEN: NAMEN, FEST: FEST, werkzeug: werkzeug, laufDauer: laufDauer, zeitWert: zeitWert, freierVersuch: freierVersuch, naechstesKind: naechstesKind, strecke: strecke, SEQUENZ: SEQUENZ, minutenSignale: minutenSignale };
});
