/* PSV Wesel-Lackhausen – Cloud-Kern (ab 2.0): Verschlüsselung, Aufteilung in Abschnitte, Hilfsfunktionen.
   Ohne Firebase-Abhängigkeit, damit es auch in Node getestet werden kann. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis.crypto);
  else root.PSVCloudCore = factory(root.crypto);
})(typeof self !== 'undefined' ? self : this, function (cr) {
  'use strict';
  var subtle = cr && cr.subtle;
  var ITER = 600000;            // PBKDF2-SHA256-Iterationen (OWASP-Empfehlung, Minimum laut Vorgabe 310 000)
  var MIN_ITER = 310000;
  var CHUNK = 900000;           // max. Zeichen Chiffretext (Base64) je Firestore-Dokument
  var VERIFIER_TEXT = 'PSV-TEAM-SCHLUESSEL-OK';
  var te = new TextEncoder(), td = new TextDecoder();

  function b64(u8) { var s = '', i, n = 0x8000; for (i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function zufall(n) { var u = new Uint8Array(n); cr.getRandomValues(u); return u; }

  // Einladungscode: 10 Zeichen ohne verwechselbare Zeichen (≈ 50 Bit), Anzeige als XXXXX-XXXXX
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function einladungsCode() { var u = zufall(10), s = ''; for (var i = 0; i < 10; i++) s += ALPHA[u[i] & 31]; return s; }
  function codeNormal(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function codeAnzeige(c) { c = codeNormal(c); return c.length === 10 ? c.slice(0, 5) + '-' + c.slice(5) : c; }

  async function schluesselAusPasswort(passwort, saltB64, iter, exportierbar) {
    if (!(iter >= MIN_ITER)) throw new Error('Unsichere Schlüsselableitung');
    var basis = await subtle.importKey('raw', te.encode(String(passwort).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, basis, { name: 'AES-GCM', length: 256 }, !!exportierbar, ['encrypt', 'decrypt']);
  }
  async function schluesselExport(key) { return b64(new Uint8Array(await subtle.exportKey('raw', key))); }
  async function schluesselImport(rawB64) { return subtle.importKey('raw', unb64(rawB64), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']); }
  function neuesSalt() { return b64(zufall(16)); }

  async function verschluesseln(key, text, aad) {
    var iv = zufall(12);
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: te.encode(aad || '') }, key, te.encode(text));
    return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }
  async function entschluesseln(key, iv, ct, aad) {
    var pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: te.encode(aad || '') }, key, unb64(ct));
    return td.decode(pt);
  }
  async function encJSON(key, obj, aad) { return verschluesseln(key, JSON.stringify(obj), aad); }
  async function decJSON(key, e, aad) { return JSON.parse(await entschluesseln(key, e.iv, e.ct, aad)); }

  // Prüfwert: erkennt ein falsches Team-Passwort, ohne Daten zu entschlüsseln
  async function pruefwert(key, teamId) { return verschluesseln(key, VERIFIER_TEXT, 'verifier/' + teamId); }
  async function pruefen(key, teamId, v) { try { return (await entschluesseln(key, v.iv, v.ct, 'verifier/' + teamId)) === VERIFIER_TEXT; } catch (e) { return false; } }

  // kanonisches JSON (sortierte Schlüssel) für stabile Prüfsummen
  function kanon(o) {
    if (o === null || typeof o !== 'object') return JSON.stringify(o === undefined ? null : o);
    if (Array.isArray(o)) return '[' + o.map(kanon).join(',') + ']';
    return '{' + Object.keys(o).filter(function (k) { return o[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ':' + kanon(o[k]); }).join(',') + '}';
  }
  async function hash(o) { var d = await subtle.digest('SHA-256', te.encode(kanon(o))); return b64(new Uint8Array(d)).slice(0, 32); }

  // Dokument-IDs: nur [A-Za-z0-9_-], andere Zeichen als ~hex
  function idTeil(id) { return String(id).replace(/[^A-Za-z0-9_-]/g, function (c) { return '~' + c.charCodeAt(0).toString(16) + '.'; }); }

  // Daten → Abschnitte: kern, spieler (ohne Fotos), st_<id> je Spieltag, foto_<id> je Foto
  var OHNE = { players: 1, spieltage: 1, taktiken: 1, geaendert: 1, appVersion: 1 };   // ab 2.2: taktiken → tk_<id>
  function aufteilen(d) {
    var s = {}, kern = {};
    Object.keys(d).forEach(function (k) { if (!OHNE[k]) kern[k] = d[k]; });
    kern._stReihe = (d.spieltage || []).map(function (st) { return st.id; });
    s.kern = kern;
    s.spieler = (d.players || []).map(function (p) {
      if (typeof p.foto === 'string' && p.foto.indexOf('data:') === 0) { var c = Object.assign({}, p); c.foto = 'cloud'; s['foto_' + idTeil(p.id)] = { pid: p.id, foto: p.foto }; return c; }
      return p;
    });
    (d.spieltage || []).forEach(function (st) { s['st_' + idTeil(st.id)] = st; });
    (d.taktiken || []).forEach(function (t) { s['tk_' + idTeil(t.id)] = t; });
    return s;
  }
  function zusammensetzen(s) {
    var kern = JSON.parse(JSON.stringify(s.kern || {})), reihe = kern._stReihe || []; delete kern._stReihe;
    var d = kern;
    d.players = (s.spieler || []).map(function (p) {
      if (p.foto !== 'cloud') return p;
      var f = s['foto_' + idTeil(p.id)], c = Object.assign({}, p); c.foto = f && f.foto ? f.foto : ''; return c;
    });
    var st = Object.keys(s).filter(function (k) { return k.indexOf('st_') === 0; }).map(function (k) { return s[k]; });
    var pos = {}; reihe.forEach(function (id, i) { pos[String(id)] = i; });
    st.sort(function (a, b) {
      var pa = pos[String(a.id)], pb = pos[String(b.id)];
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1; if (pb !== undefined) return 1;
      return String(a.datum || '').localeCompare(String(b.datum || ''));
    });
    d.spieltage = st;
    d.taktiken = Object.keys(s).filter(function (k) { return k.indexOf('tk_') === 0; }).map(function (k) { return s[k]; }).sort(function (a, b) { return String(a.erstellt || '').localeCompare(String(b.erstellt || '')); });
    return d;
  }
  function bereichName(k) {
    if (k === 'kern') return 'Einstellungen/Messungen/Gegner';
    if (k === 'spieler') return 'Kader';
    if (k.indexOf('st_') === 0) return 'Spieltag';
    if (k.indexOf('foto_') === 0) return 'Foto';
    if (k.indexOf('tk_') === 0) return 'Taktiktafel';
    return k;
  }
  function stuecke(s, n) { n = n || CHUNK; var out = []; for (var i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out.length ? out : ['']; }

  // Verschlüsselter Export (optional): Format psv-enc-1
  async function exportVerschluesselt(passwort, text) {
    var salt = neuesSalt(), key = await schluesselAusPasswort(passwort, salt, ITER, false), e = await verschluesseln(key, text, 'psv-export');
    return JSON.stringify({ format: 'psv-enc-1', hinweis: 'PSV Wesel-Lackhausen – verschlüsselte Sicherung (AES-GCM 256, PBKDF2-SHA256)', kdf: { alg: 'PBKDF2-SHA256', iter: ITER, salt: salt }, iv: e.iv, ct: e.ct });
  }
  function istVerschluesselt(txt) { try { var o = JSON.parse(txt); return o && o.format === 'psv-enc-1'; } catch (e) { return false; } }
  async function importVerschluesselt(passwort, txt) {
    var o = JSON.parse(txt), key = await schluesselAusPasswort(passwort, o.kdf.salt, o.kdf.iter, false);
    try { return await entschluesseln(key, o.iv, o.ct, 'psv-export'); } catch (e) { throw new Error('Falsches Passwort oder beschädigte Datei'); }
  }

  return { ITER: ITER, MIN_ITER: MIN_ITER, CHUNK: CHUNK, b64: b64, unb64: unb64, einladungsCode: einladungsCode, codeNormal: codeNormal, codeAnzeige: codeAnzeige,
    schluesselAusPasswort: schluesselAusPasswort, schluesselExport: schluesselExport, schluesselImport: schluesselImport, neuesSalt: neuesSalt,
    verschluesseln: verschluesseln, entschluesseln: entschluesseln, encJSON: encJSON, decJSON: decJSON, pruefwert: pruefwert, pruefen: pruefen,
    kanon: kanon, hash: hash, idTeil: idTeil, aufteilen: aufteilen, zusammensetzen: zusammensetzen, bereichName: bereichName, stuecke: stuecke,
    exportVerschluesselt: exportVerschluesselt, istVerschluesselt: istVerschluesselt, importVerschluesselt: importVerschluesselt };
});
