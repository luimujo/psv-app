/* PSV Wesel-Lackhausen – Cloud-Synchronisation (ab 2.0)
   Firebase Auth (E-Mail/Passwort) + Firestore. Alle Teamdaten werden auf dem Gerät mit AES-GCM 256 verschlüsselt;
   der Schlüssel entsteht aus dem Team-Passwort (PBKDF2-SHA256) und verlässt das Gerät nie. */
(function () {
  'use strict';
  var C = window.PSVCloudCore, F = window.PSVFB, T = window.PSV_CLOUD_TEST || {};
  var CFG = { apiKey: 'AIzaSyCLrZA7l1Y6mmls_B7QPhKkPzcbF6X75wY', authDomain: 'psv-aufstellung-d6.firebaseapp.com', projectId: 'psv-aufstellung-d6',
    storageBucket: 'psv-aufstellung-d6.firebasestorage.app', messagingSenderId: '1035528067069', appId: '1:1035528067069:web:72d12e64275e960696ab94' };
  if (T.projectId) CFG.projectId = T.projectId;
  var DB_ID = T.databaseId || 'psvd6';   // benannte Firestore-Datenbank (nicht „(default)“)
  var LS = { modus: 'psv_modus', team: 'psv_cloud_team', cache: 'psv_cloud_cache_', key: 'psv_cloud_key_', legacy: 'psv_kaas_daten_v1', anfrage: 'psv_cloud_anfrage' };
  var H = null;                       // Hooks der App
  var fbApp, auth, db, user = null, team = null, key = null;
  var secs = {}, hashes = {}, meta = {}, lc = {}, konflikte = [], remote = {}, inflight = {}, wartend = {};
  var serverAktuell = false, hatteCache = false, bereit = false, offen = false, pushT = null, cacheT = null, tickT = null, unsubDocs = null, unsubTeam = null, unsubReq = null, anfragen = [];
  var st = { s: 'aus', text: '' }, online = navigator.onLine !== false, letzterFehler = '', merkenWunsch = true, entsperrt = false;

  // ---------- kleine Helfer ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function lsJSON(k) { try { return JSON.parse(lsGet(k) || 'null'); } catch (e) { return null; } }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function toast(t) { if (H && H.toast) H.toast(t); }
  function jetzt() { return Date.now(); }
  function ms(ts) { return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0; }
  function datum(t) { if (!t) return '–'; var d = new Date(t); return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
  var NETZ_MS = T.netzMs || 30000;
  function mitTimeout(p, ms, was) {   // jede Netzwerk-Operation bekommt eine Zeitgrenze
    var t; return Promise.race([p, new Promise(function (_, rej) { t = setTimeout(function () { var e = new Error(was || 'Zeitüberschreitung'); e.code = 'psv/timeout'; rej(e); }, ms || NETZ_MS); })])
      .then(function (v) { clearTimeout(t); return v; }, function (e) { clearTimeout(t); throw e; });
  }
  // Prüft vor dem ersten Schreiben, ob die Firestore-Datenbank existiert und die Regeln veröffentlicht sind.
  // Hintergrund: Bei fehlender Datenbank wiederholt das Firestore-SDK Schreibvorgänge endlos (NOT_FOUND) – ohne Fehler.
  var cloudOk = false;
  async function pruefeCloud() {
    if (cloudOk) return;
    var basis = T.emulator ? 'http://' + T.emulator + ':' + (T.fsPort || 8080) : 'https://firestore.googleapis.com';
    var url = basis + '/v1/projects/' + CFG.projectId + '/databases/' + DB_ID + '/documents/invites/__pruefung?key=' + CFG.apiKey;
    async function hole(token) {
      try {
        var r = await mitTimeout(fetch(url, { headers: token ? { Authorization: 'Bearer ' + token } : {} }), 20000, 'Cloud prüfen');
        return { s: r.status, t: await r.text() };
      } catch (e) {
        if (e.code === 'psv/timeout') throw e;
        if (navigator.onLine === false) { var o = new Error('offline'); o.code = 'unavailable'; throw o; }
        console.warn('Cloud-Prüfung nicht möglich', e); return null;   // nicht blockieren, Zeitgrenzen greifen trotzdem
      }
    }
    function fehler(code, t) { var e = new Error(t || code); e.code = code; return e; }
    var r1 = await hole(null);   // 1) ohne Anmeldung: existiert die Datenbank?
    if (!r1) return;
    if (r1.s === 404 && /database \S+ does not exist|does not exist for project|datastore\/setup/i.test(r1.t)) throw fehler('psv/db-fehlt', r1.t);
    if (r1.s === 403 && /has not been used|SERVICE_DISABLED|disabled/i.test(r1.t)) throw fehler('psv/db-fehlt', r1.t);
    var token = user && user.getIdToken ? await mitTimeout(user.getIdToken(), 20000, 'Anmeldung prüfen') : null;
    if (!token) return;
    var r2 = await hole(token);  // 2) angemeldet: sind unsere Regeln veröffentlicht? (invites/… darf jeder Angemeldete lesen)
    if (!r2) return;
    if (r2.s === 404 && /database \S+ does not exist|does not exist for project|datastore\/setup/i.test(r2.t)) throw fehler('psv/db-fehlt', r2.t);
    if (r2.s === 403) throw fehler('psv/regeln', r2.t);
    if (r2.s === 404 || r2.s === 200) { cloudOk = true; return; }
    console.warn('Cloud-Prüfung: Status', r2.s, r2.t.slice(0, 200));
  }
  function modus() { if (!F || !C || !window.crypto || !window.crypto.subtle) return 'lokal'; return lsGet(LS.modus) === 'lokal' ? 'lokal' : 'cloud'; }
  function hatLegacy() { var s = lsGet(LS.legacy); if (!s) return null; try { var d = JSON.parse(s); return d && Array.isArray(d.players) ? d : null; } catch (e) { return null; } }

  function fehlerText(e) {
    var c = (e && e.code) || '', m = (e && e.message) || String(e || '');
    var A = {
      'auth/operation-not-allowed': 'Die Anmeldung mit E-Mail und Passwort ist im Firebase-Projekt nicht aktiviert (Firebase-Konsole → Authentication → Sign-in method → E-Mail/Passwort aktivieren).',
      'auth/configuration-not-found': 'Firebase Authentication ist im Projekt noch nicht eingerichtet (Firebase-Konsole → Authentication → „Los geht\'s“ und E-Mail/Passwort aktivieren).',
      'auth/email-already-in-use': 'Für diese E-Mail-Adresse gibt es schon ein Konto. Bitte „Anmelden“ nutzen.',
      'auth/invalid-email': 'Die E-Mail-Adresse ist ungültig.',
      'auth/missing-email': 'Bitte E-Mail-Adresse eingeben.',
      'auth/missing-password': 'Bitte Passwort eingeben.',
      'auth/weak-password': 'Das Konto-Passwort ist zu kurz (mindestens 6 Zeichen, besser 10+).',
      'auth/invalid-credential': 'E-Mail oder Passwort falsch.',
      'auth/invalid-login-credentials': 'E-Mail oder Passwort falsch.',
      'auth/wrong-password': 'E-Mail oder Passwort falsch.',
      'auth/user-not-found': 'Kein Konto mit dieser E-Mail-Adresse.',
      'auth/user-disabled': 'Dieses Konto wurde gesperrt.',
      'auth/too-many-requests': 'Zu viele Versuche. Bitte später erneut versuchen.',
      'auth/network-request-failed': 'Keine Verbindung zum Internet.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Der Firebase-API-Schlüssel ist ungültig.',
      'auth/requires-recent-login': 'Bitte ab- und wieder anmelden und dann erneut versuchen.'
    };
    if (A[c]) return A[c];
    if (c === 'psv/db-fehlt') return 'Die Cloud-Datenbank (Firestore) ist im Firebase-Projekt noch nicht angelegt. Firebase-Konsole → Firestore Database → Datenbank „psvd6“ anlegen (Standort europe-west3, Produktionsmodus), danach für „psvd6“ unter „Regeln“ die Sicherheitsregeln einfügen und veröffentlichen.';
    if (c === 'psv/regeln') return 'Die Firestore-Sicherheitsregeln sind noch nicht veröffentlicht. Firebase-Konsole → Firestore Database → oben Datenbank „psvd6“ wählen → Regeln → Inhalt von firestore.rules einfügen → „Veröffentlichen“.';
    if (c === 'psv/timeout') return 'Zeitüberschreitung (' + m + '): Die Cloud antwortet nicht. Bitte Internetverbindung prüfen und erneut versuchen. Es wurde nichts doppelt angelegt.';
    if (c === 'psv/unsicher') return 'Diese Android-WebView stellt keine sichere Verschlüsselung (WebCrypto) bereit. Bitte „Android System WebView“ bzw. Chrome im Play Store aktualisieren.';
    if (/database.*does not exist|NOT_FOUND.*database|Cloud Firestore API has not been used|firestore\.googleapis\.com.*disabled/i.test(m))
      return 'Die Cloud-Datenbank (Firestore) ist im Firebase-Projekt noch nicht angelegt. Firebase-Konsole → Firestore Database → „Datenbank erstellen“ (Standort europe-west3, Produktionsmodus), danach die Sicherheitsregeln einfügen.';
    if (c === 'permission-denied' || /permission/i.test(c)) return 'Kein Zugriff. Entweder bist du (noch) nicht als Mitglied freigegeben, oder die Sicherheitsregeln sind in der Firebase-Konsole noch nicht eingefügt/veröffentlicht.';
    if (c === 'unavailable' || c === 'deadline-exceeded') return 'Keine Verbindung zur Cloud – es wird später automatisch erneut versucht.';
    if (c === 'not-found') return 'Nicht gefunden.';
    if (c === 'resource-exhausted') return 'Das kostenlose Tageskontingent der Cloud ist aufgebraucht. Morgen geht es weiter; bis dahin wird lokal gespeichert.';
    if (c === 'failed-precondition') return 'Die Cloud-Datenbank ist noch nicht bereit (Firestore anlegen). ' + m;
    return (c ? c + ': ' : '') + m;
  }

  // ---------- Status ----------
  function setStatus(s, text) { st = { s: s, text: text || '' }; if (H && H.status) H.status(statusInfo()); }
  function statusInfo() {
    var n = Object.keys(inflight).length, offenN = Object.keys(dirtyKeys()).length;
    if (modus() === 'lokal') return { s: 'lokal', icon: '', text: 'Nur auf diesem Gerät' };
    if (!entsperrt) return { s: 'gesperrt', icon: '🔒', text: 'Gesperrt' };
    if (st.s === 'fehler') return { s: 'fehler', icon: '⚠', text: st.text || 'Sync-Fehler' };
    if (!online) return { s: 'offline', icon: '⦸', text: 'offline' + (offenN ? ' – ' + offenN + ' Änderung(en) warten' : '') };
    if (!bereit) return { s: 'sync', icon: '⟳', text: 'lädt…' };
    if (n || offenN) return { s: 'sync', icon: '⟳', text: 'synchronisiert…' };
    return { s: 'ok', icon: '✓', text: 'synchronisiert' };
  }
  function dirtyKeys() {
    var o = {}; Object.keys(hashes).forEach(function (k) { if (!meta[k] || meta[k].h !== hashes[k]) o[k] = 1; });
    Object.keys(meta).forEach(function (k) { if (!(k in hashes)) o[k] = 1; }); return o;
  }

  // ---------- Firebase ----------
  function initFirebase() {
    if (fbApp) return;
    fbApp = F.initializeApp(CFG);
    auth = F.initializeAuth(fbApp, { persistence: T.memory ? F.inMemoryPersistence : [F.indexedDBLocalPersistence, F.browserLocalPersistence] });
    auth.languageCode = 'de';
    db = F.initializeFirestore(fbApp, { localCache: F.memoryLocalCache(), ignoreUndefinedProperties: true }, DB_ID);
    if (T.emulator) { F.connectAuthEmulator(auth, 'http://' + T.emulator + ':' + (T.authPort || 9099), { disableWarnings: true }); F.connectFirestoreEmulator(db, T.emulator, T.fsPort || 8080); }
  }
  function tRef(id) { return F.doc(db, 'teams', id || team.id); }
  function dRef(k) { return F.doc(db, 'teams', team.id, 'docs', k); }

  // ---------- Oberfläche (Vollbild über der App) ----------
  function ui(html) {
    var o = $('#cloudUI');
    if (!o) { o = document.createElement('div'); o.id = 'cloudUI'; document.body.appendChild(o); }
    o.innerHTML = '<div class="cl-wrap"><div class="cl-kopf"><img class="cl-logo kk" src="logo.svg" alt=""><div><b>Kaderkompass</b><div class="cl-sub">Kader, Aufstellung &amp; Taktik · Cloud</div></div></div>' + html +
      '<div class="cl-fuss"><a href="#" id="clDs">Datenschutz</a> · ' + (window.kkCopy ? window.kkCopy() : '© 2026 MLN Consulting · mlnc.net') + '</div></div>';
    o.classList.remove('hidden'); offen = true; document.body.classList.add('cl-offen');
    $('#clDs').addEventListener('click', function (e) { e.preventDefault(); zeigeDatenschutz(); });
    return o;
  }
  function uiZu() { var o = $('#cloudUI'); if (o) { o.classList.add('hidden'); o.innerHTML = ''; } offen = false; document.body.classList.remove('cl-offen'); }
  function meldung(sel, t, gut) { var m = $(sel); if (m) { m.textContent = t || ''; m.className = 'cl-msg' + (gut ? ' gut' : '') + (t ? '' : ' hidden'); } }
  function busy(b, an, txt) { if (!b) return; if (an) { if (!b.disabled) b._t = b.textContent; b.disabled = true; b.textContent = txt || '…'; } else { b.disabled = false; if (b._t) b.textContent = b._t; } }
  function zeigeDatenschutz() {
    var vorher = $('#cloudUI') && !$('#cloudUI').classList.contains('hidden') ? $('#cloudUI').innerHTML : null;
    ui('<div class="card cl-ds">' + datenschutzHtml() + '</div><button class="btn sec" id="clDsZu">Zurück</button>');
    $('#clDsZu').addEventListener('click', function () { if (vorher !== null && !entsperrt) zeigeStart(); else if (vorher !== null) uiZu(); else uiZu(); });
  }

  function legacyHinweis() {
    var L = hatLegacy(); if (!L) return '';
    var n = L.players.filter(function (p) { return p.name && !p.archiviert; }).length, s = (L.spieltage || []).length;
    return '<div class="cl-info">Auf diesem Gerät sind Daten aus der bisherigen Version gespeichert (' + n + ' Kinder, ' + s + ' Spieltage). Sie bleiben erhalten, bis du sie in die Cloud hochgeladen hast.</div>';
  }

  // Anmeldung / Registrierung / Passwort vergessen
  function zeigeStart(vorgabeMail) {
    ui('<div class="card"><h2>Anmelden</h2>' + legacyHinweis() +
      '<label class="f">E-Mail</label><input type="email" id="clMail" autocomplete="username" value="' + esc(vorgabeMail || (user && user.email) || '') + '">' +
      '<label class="f">Konto-Passwort</label><input type="password" id="clPw" autocomplete="current-password">' +
      '<div id="clMsg" class="cl-msg hidden"></div>' +
      '<button class="btn" id="clLogin">Anmelden</button>' +
      '<button class="btn sec" id="clReg">Neues Konto registrieren</button>' +
      '<button class="btn sec small" id="clReset">Passwort vergessen?</button></div>' +
      '<div class="card"><div class="muted">Ohne Konto kannst du die App weiter nur auf diesem Gerät nutzen (keine Cloud, kein Teilen mit Co-Trainern).</div>' +
      '<button class="btn sec" id="clLokal">Ohne Cloud nur auf diesem Gerät nutzen</button></div>');
    var mail = function () { return $('#clMail').value.trim(); }, pw = function () { return $('#clPw').value; };
    $('#clLogin').addEventListener('click', function () {
      var b = this; busy(b, true, 'Anmelden…'); meldung('#clMsg', '');
      mitTimeout(F.signInWithEmailAndPassword(auth, mail(), pw()), NETZ_MS, 'Anmelden').catch(function (e) { busy(b, false); meldung('#clMsg', fehlerText(e)); });
    });
    $('#clReg').addEventListener('click', function () { zeigeRegistrieren(mail()); });
    $('#clReset').addEventListener('click', function () {
      if (!mail()) { meldung('#clMsg', 'Bitte zuerst die E-Mail-Adresse eingeben.'); return; }
      var b = this; busy(b, true);
      meldung('#clMsg', ''); mitTimeout(F.sendPasswordResetEmail(auth, mail()), NETZ_MS, 'E-Mail senden').then(function () { busy(b, false); meldung('#clMsg', 'Falls ein Konto existiert, wurde eine E-Mail zum Zurücksetzen des Konto-Passworts an ' + mail() + ' gesendet (auch im Spam-Ordner nachsehen). Das Team-Passwort lässt sich so NICHT zurücksetzen.', true); })
        .catch(function (e) { busy(b, false); meldung('#clMsg', fehlerText(e)); });
    });
    $('#clLokal').addEventListener('click', function () {
      if (!confirm('Die App speichert dann wie bisher nur auf diesem Gerät (unverschlüsselt im App-Speicher). Die Cloud kannst du später unter „Mehr“ einrichten. Fortfahren?')) return;
      lsSet(LS.modus, 'lokal'); location.reload();
    });
  }
  function zeigeRegistrieren(m) {
    ui('<div class="card"><h2>Neues Konto</h2><div class="muted">Das Konto gehört dir als Trainer/in. Die Kinderdaten schützt später zusätzlich das Team-Passwort.</div>' +
      '<label class="f">E-Mail</label><input type="email" id="clMail" autocomplete="username" value="' + esc(m || '') + '">' +
      '<label class="f">Konto-Passwort (mind. 8 Zeichen)</label><input type="password" id="clPw" autocomplete="new-password">' +
      '<label class="f">Konto-Passwort wiederholen</label><input type="password" id="clPw2" autocomplete="new-password">' +
      '<label class="cl-check"><input type="checkbox" id="clDsOk"> Ich habe die <a href="#" id="clDs2">Datenschutzhinweise</a> gelesen.</label>' +
      '<div id="clMsg" class="cl-msg hidden"></div><button class="btn" id="clRegGo">Konto anlegen</button><button class="btn sec" id="clZur">Zurück</button></div>');
    $('#clDs2').addEventListener('click', function (e) { e.preventDefault(); zeigeDatenschutz(); });
    $('#clZur').addEventListener('click', function () { zeigeStart($('#clMail').value.trim()); });
    $('#clRegGo').addEventListener('click', function () {
      var mail = $('#clMail').value.trim(), pw = $('#clPw').value; meldung('#clMsg', '');
      if (pw.length < 8) return meldung('#clMsg', 'Das Konto-Passwort muss mindestens 8 Zeichen haben.');
      if (pw !== $('#clPw2').value) return meldung('#clMsg', 'Die Passwörter stimmen nicht überein.');
      if (!$('#clDsOk').checked) return meldung('#clMsg', 'Bitte die Datenschutzhinweise bestätigen.');
      var b = this; busy(b, true, 'Wird angelegt…');
      mitTimeout(F.createUserWithEmailAndPassword(auth, mail, pw), NETZ_MS, 'Konto anlegen').then(function (c) { if (!T.keineMail) F.sendEmailVerification(c.user).catch(function () { }); })
        .catch(function (e) { busy(b, false); meldung('#clMsg', fehlerText(e)); });
    });
  }

  // Team wählen / erstellen / beitreten
  function zeigeTeams() {
    ui('<div class="card"><h2>Team</h2><div class="muted">Angemeldet als <b>' + esc(user.email) + '</b></div><div id="clListe" class="cl-liste">Teams werden geladen…</div><div id="clMsg" class="cl-msg hidden"></div></div>' +
      '<div class="card"><h2>Neues Team erstellen</h2><div class="muted">Für den/die Haupttrainer/in. Du erhältst einen Einladungscode für Co-Trainer.</div><button class="btn" id="clNeu">Team erstellen</button></div>' +
      '<div class="card"><h2>Einem Team beitreten</h2><div class="muted">Einladungscode vom Haupttrainer eingeben. Der Haupttrainer muss dich danach freigeben.</div>' +
      '<input type="text" id="clCode" placeholder="XXXXX-XXXXX" autocapitalize="characters" autocomplete="off"><button class="btn sec" id="clJoin">Beitritt anfragen</button></div>' +
      '<button class="btn sec" id="clOut">Abmelden</button>');
    $('#clNeu').addEventListener('click', zeigeTeamNeu);
    $('#clOut').addEventListener('click', abmelden);
    $('#clJoin').addEventListener('click', function () { beitreten($('#clCode').value, this); });
    pruefeCloud().then(function () { return mitTimeout(F.getDocs(F.query(F.collection(db, 'teams'), F.where('members', 'array-contains', user.uid))), NETZ_MS, 'Teams laden'); }).then(function (q) {
      if (!$('#clListe')) return;   // Ansicht inzwischen gewechselt
      var L = q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      if (!L.length) { $('#clListe').innerHTML = '<div class="muted">Du bist noch in keinem Team.</div>'; return; }
      $('#clListe').innerHTML = L.map(function (t) {
        return '<button class="btn sec cl-team" data-id="' + esc(t.id) + '">Team von ' + esc((t.namen || {})[t.ownerUid] || 'Haupttrainer') + (t.ownerUid === user.uid ? ' (du)' : '') + ' · ' + (t.members || []).length + ' Mitglied(er)</button>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('.cl-team'), function (b) {
        b.addEventListener('click', function () { var t = L.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; teamMerken(t); zeigeEntsperren(); });
      });
    }).catch(function (e) { if (!$('#clListe')) return; $('#clListe').innerHTML = ''; meldung('#clMsg', fehlerText(e)); });
    var a = lsJSON(LS.anfrage); if (a && a.uid === user.uid) zeigeWarten();
  }
  function pwRegelnOk(pw) { return pw.length >= 10; }
  function zeigeTeamNeu() {
    ui('<div class="card"><h2>Team erstellen</h2>' +
      '<label class="f">Teamname</label><input type="text" id="clName" value="PSV Wesel VI">' +
      '<label class="f">Team-Passwort (mind. 10 Zeichen)</label><input type="password" id="clTp" autocomplete="new-password">' +
      '<label class="f">Team-Passwort wiederholen</label><input type="password" id="clTp2" autocomplete="new-password">' +
      '<div class="cl-warn"><b>Wichtig:</b> Mit dem Team-Passwort werden alle Kinderdaten auf dem Handy verschlüsselt. Es wird nie übertragen und kann von niemandem wiederhergestellt werden. <b>Passwort vergessen = Daten verloren.</b> Bitte sicher notieren und regelmäßig unter „Mehr → Exportieren“ eine Sicherung anlegen. Co-Trainer brauchen dasselbe Team-Passwort (persönlich weitergeben, nicht per Chat).</div>' +
      '<label class="cl-check"><input type="checkbox" id="clMerk" checked> Team-Passwort auf diesem Gerät merken</label>' +
      '<label class="cl-check"><input type="checkbox" id="clVerst"> Ich habe das Team-Passwort notiert.</label>' +
      '<div id="clMsg" class="cl-msg hidden"></div><button class="btn" id="clGo">Team erstellen</button><button class="btn sec" id="clZur">Zurück</button></div>');
    $('#clZur').addEventListener('click', zeigeTeams);
    $('#clGo').addEventListener('click', async function () {
      var b = this; if (b.disabled) return;
      meldung('#clMsg', '');   // alte Meldung immer zuerst entfernen
      var pw = $('#clTp').value, pw2 = $('#clTp2').value;
      if (!pwRegelnOk(pw)) return meldung('#clMsg', 'Das Team-Passwort muss mindestens 10 Zeichen haben (eingegeben: ' + pw.length + ').');
      if (pw !== pw2) return meldung('#clMsg', 'Die Team-Passwörter stimmen nicht überein.');
      if (!$('#clVerst').checked) return meldung('#clMsg', 'Bitte bestätigen, dass du das Team-Passwort notiert hast.');
      busy(b, true, 'Verbindung prüfen…');
      try {
        await teamErstellen($('#clName').value.trim() || 'PSV Wesel VI', pw, $('#clMerk').checked, function (t) { b.textContent = t; });
      } catch (e) { console.warn('Team erstellen', e); meldung('#clMsg', fehlerText(e)); }
      finally { busy(b, false); }
    });
  }
  var teamAnlage = null;   // laufende Anlage (bei Zeitüberschreitung wiederverwenden, damit kein zweites Team entsteht)
  async function teamErstellen(name, pw, merken, schritt) {
    schritt = schritt || function () { };
    if (!window.isSecureContext || !window.crypto || !window.crypto.subtle) { var u = new Error('unsicher'); u.code = 'psv/unsicher'; throw u; }
    schritt('Verbindung prüfen…'); await pruefeCloud();
    // vorhandenes eigenes Team (z. B. aus einem abgebrochenen Versuch) erkennen → fortsetzen statt doppelt anlegen
    schritt('Vorhandene Teams prüfen…');
    var q = await mitTimeout(F.getDocs(F.query(F.collection(db, 'teams'), F.where('members', 'array-contains', user.uid))), NETZ_MS, 'Teams laden');
    var eigene = q.docs.filter(function (d) { return d.data().ownerUid === user.uid; });
    for (var i = 0; i < eigene.length; i++) {
      var x = Object.assign({ id: eigene[i].id }, eigene[i].data());
      schritt('Schlüssel prüfen…');
      var kx = await C.schluesselAusPasswort(pw, x.kdf.salt, x.kdf.iter, true);
      if (await C.pruefen(kx, x.id, x.verifier)) {
        if (!x.inviteCode || !(await mitTimeout(F.getDoc(F.doc(db, 'invites', x.inviteCode)), NETZ_MS, 'Einladung prüfen')).exists()) {   // Einladung fehlt → nachtragen
          var neu = C.einladungsCode(), bb = F.writeBatch(db);
          bb.set(F.doc(db, 'invites', neu), { teamId: x.id, ownerUid: user.uid, createdAt: F.serverTimestamp() });
          bb.update(tRef(x.id), { inviteCode: neu, updatedAt: F.serverTimestamp() });
          schritt('Einladung anlegen…'); await mitTimeout(bb.commit(), NETZ_MS, 'Einladung anlegen'); x.inviteCode = neu;
        }
        teamMerken(x); toast('Vorhandenes Team fortgesetzt');
        schritt('Entsperren…'); await entsperrtMit(kx, merken, false); return;
      }
    }
    if (!teamAnlage || teamAnlage.uid !== user.uid) {
      schritt('Schlüssel erzeugen…');
      var ref = F.doc(F.collection(db, 'teams')), tid = ref.id, salt = C.neuesSalt();
      var k = await C.schluesselAusPasswort(pw, salt, C.ITER, true), ver = await C.pruefwert(k, tid), code = C.einladungsCode();
      var nameEnc = await C.encJSON(k, name, 'name/' + tid), namen = {}; namen[user.uid] = user.email || '';
      var t = { ownerUid: user.uid, members: [user.uid], namen: namen, kdf: { alg: 'PBKDF2-SHA256', iter: C.ITER, salt: salt }, verifier: ver, inviteCode: code, nameEnc: nameEnc, v: 1,
        createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() };
      var b = F.writeBatch(db);
      b.set(ref, t); b.set(F.doc(db, 'invites', code), { teamId: tid, ownerUid: user.uid, createdAt: F.serverTimestamp() });
      schritt('Team anlegen…');
      teamAnlage = { uid: user.uid, tid: tid, t: t, k: k, name: name, p: b.commit() };
    } else schritt('Team anlegen (erneuter Versuch)…');
    var A = teamAnlage;
    await mitTimeout(A.p, NETZ_MS, 'Team anlegen');
    teamAnlage = null;
    A.t.id = A.tid; A.t.name = A.name; teamMerken(A.t);
    schritt('Entsperren…');
    await entsperrtMit(A.k, merken, true);
  }
  async function beitreten(roh, b) {
    var code = C.codeNormal(roh);
    if (code.length !== 10) return meldung('#clMsg', 'Der Einladungscode hat 10 Zeichen (z. B. ABCDE-FGH23).');
    meldung('#clMsg', ''); busy(b, true, 'Verbindung prüfen…');
    try {
      await pruefeCloud(); b.textContent = 'Wird gesendet…';
      var inv = await mitTimeout(F.getDoc(F.doc(db, 'invites', code)), NETZ_MS, 'Code prüfen');
      if (!inv.exists()) { busy(b, false); return meldung('#clMsg', 'Dieser Einladungscode ist unbekannt oder nicht mehr gültig.'); }
      var tid = inv.data().teamId;
      await mitTimeout(F.setDoc(F.doc(db, 'teams', tid, 'requests', user.uid), { uid: user.uid, email: user.email || '', code: code, createdAt: F.serverTimestamp() }), NETZ_MS, 'Anfrage senden');
      lsSet(LS.anfrage, JSON.stringify({ uid: user.uid, teamId: tid, zeit: jetzt() }));
      zeigeWarten();
    } catch (e) { busy(b, false); meldung('#clMsg', fehlerText(e)); }
  }
  var wartenT = null;
  function zeigeWarten() {
    var a = lsJSON(LS.anfrage); if (!a) return zeigeTeams();
    ui('<div class="card"><h2>Beitritt angefragt</h2><div class="muted">Deine Anfrage wurde gesendet. Der Haupttrainer muss dich in der App unter „Mehr → Cloud &amp; Team“ freigeben. Danach brauchst du noch das Team-Passwort (persönlich vom Haupttrainer).</div>' +
      '<div id="clMsg" class="cl-msg hidden"></div><button class="btn" id="clPruef">Status prüfen</button><button class="btn sec" id="clAbbr">Anfrage zurückziehen</button><button class="btn sec" id="clOut">Abmelden</button></div>');
    var pruef = function (manuell) {
      F.getDoc(tRef(a.teamId)).then(function (d) {
        clearInterval(wartenT); lsDel(LS.anfrage);
        var t = Object.assign({ id: d.id }, d.data()); teamMerken(t); toast('Freigegeben ✓'); zeigeEntsperren();
      }).catch(function (e) {
        if (e.code !== 'permission-denied') { if (manuell) meldung('#clMsg', fehlerText(e)); return; }
        F.getDoc(F.doc(db, 'teams', a.teamId, 'requests', user.uid)).then(function (r) {
          if (!r.exists()) { clearInterval(wartenT); lsDel(LS.anfrage); ui('<div class="card"><h2>Anfrage abgelehnt</h2><div class="muted">Der Haupttrainer hat die Anfrage abgelehnt oder zurückgesetzt.</div><button class="btn" id="clOk">OK</button></div>'); $('#clOk').addEventListener('click', zeigeTeams); }
          else if (manuell) meldung('#clMsg', 'Noch nicht freigegeben.');
        }).catch(function (e2) { if (manuell) meldung('#clMsg', fehlerText(e2)); });
      });
    };
    $('#clPruef').addEventListener('click', function () { pruef(true); });
    $('#clAbbr').addEventListener('click', function () { F.deleteDoc(F.doc(db, 'teams', a.teamId, 'requests', user.uid)).catch(function () { }); clearInterval(wartenT); lsDel(LS.anfrage); zeigeTeams(); });
    $('#clOut').addEventListener('click', abmelden);
    clearInterval(wartenT); wartenT = setInterval(function () { if ($('#clPruef')) pruef(false); else clearInterval(wartenT); }, T.pollMs || 10000);
  }

  function teamMerken(t) {
    team = { id: t.id, ownerUid: t.ownerUid, members: t.members || [], namen: t.namen || {}, kdf: t.kdf, verifier: t.verifier, inviteCode: t.inviteCode, nameEnc: t.nameEnc, name: t.name || (team && team.id === t.id ? team.name : '') };
    lsSet(LS.team, JSON.stringify(Object.assign({ uid: user.uid }, team)));
  }
  function zeigeEntsperren(msg) {
    ui('<div class="card"><h2>Team-Passwort</h2><div class="muted">Angemeldet als <b>' + esc(user.email) + '</b>. Das Team-Passwort entschlüsselt die Daten auf diesem Gerät.</div>' +
      '<label class="f">Team-Passwort</label><input type="password" id="clTp" autocomplete="current-password">' +
      '<label class="cl-check"><input type="checkbox" id="clMerk"' + (merkenWunsch ? ' checked' : '') + '> Passwort auf diesem Gerät merken</label>' +
      '<div id="clMsg" class="cl-msg hidden"></div><button class="btn" id="clGo">Entsperren</button><button class="btn sec small" id="clAnders">Anderes Team</button><button class="btn sec small" id="clOut">Abmelden</button></div>');
    if (msg) meldung('#clMsg', msg);
    var go = function () {
      var b = $('#clGo'), pw = $('#clTp').value; busy(b, true, 'Prüfe…'); meldung('#clMsg', '');
      C.schluesselAusPasswort(pw, team.kdf.salt, team.kdf.iter, true).then(function (k) {
        return C.pruefen(k, team.id, team.verifier).then(function (ok) {
          if (!ok) { meldung('#clMsg', 'Falsches Team-Passwort.'); return; }
          return entsperrtMit(k, $('#clMerk').checked, false);
        });
      }).catch(function (e) { meldung('#clMsg', fehlerText(e)); }).then(function () { busy(b, false); });
    };
    $('#clGo').addEventListener('click', go);
    $('#clTp').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    $('#clAnders').addEventListener('click', function () { lsDel(LS.team); team = null; zeigeTeams(); });
    $('#clOut').addEventListener('click', abmelden);
  }

  // ---------- Entsperren, Cache, Start der Synchronisation ----------
  async function entsperrtMit(k, merken, neuesTeam, ohneSync) {
    key = k; entsperrt = true;
    if (merken) lsSet(LS.key + team.id, await C.schluesselExport(k)); else lsDel(LS.key + team.id);
    if (!team.name && team.nameEnc) { try { team.name = await C.decJSON(k, team.nameEnc, 'name/' + team.id); teamMerken(team); } catch (e) { } }
    await cacheLaden();
    var d = Object.keys(secs).length ? C.zusammensetzen(secs) : null;
    H.setzeDaten(d);
    uiZu(); setStatus('sync');
    if (!ohneSync) starteSync();
    if (neuesTeam) toast('Team erstellt ✓ – Einladungscode unter „Mehr → Cloud & Team“');
  }
  async function cacheLaden() {
    secs = {}; hashes = {}; meta = {}; lc = {}; konflikte = []; hatteCache = false;
    var c = lsJSON(LS.cache + team.id); if (!c) return;
    try {
      var o = await C.decJSON(key, c, 'cache/' + team.id);
      secs = o.secs || {}; meta = o.meta || {}; lc = o.lc || {}; konflikte = o.konflikte || [];
      for (var k in secs) hashes[k] = await C.hash(secs[k]);
      hatteCache = Object.keys(meta).length > 0;
    } catch (e) { console.warn('Cache unlesbar', e); secs = {}; meta = {}; }
  }
  var cacheLaeuft = null;
  function cacheSpeichernBald() { clearTimeout(cacheT); cacheT = setTimeout(cacheSpeichern, 300); }
  async function cacheSpeichern() {
    if (!key || !team) return;
    var o = { secs: secs, meta: meta, lc: lc, konflikte: konflikte.slice(-5), zeit: jetzt() };
    var e = await C.encJSON(key, o, 'cache/' + team.id);
    if (!lsSet(LS.cache + team.id, JSON.stringify(e))) {   // zu groß? ohne Konfliktkopien erneut
      o.konflikte = []; e = await C.encJSON(key, o, 'cache/' + team.id);
      if (!lsSet(LS.cache + team.id, JSON.stringify(e))) setStatus('fehler', 'Gerätespeicher voll – lokale Kopie konnte nicht gespeichert werden');
    }
  }

  function stopSync() {
    [unsubDocs, unsubTeam, unsubReq].forEach(function (u) { if (u) try { u(); } catch (e) { } });
    unsubDocs = unsubTeam = unsubReq = null; clearInterval(tickT); tickT = null; bereit = false; remote = {}; inflight = {}; anfragen = [];
  }
  function starteSync() {
    stopSync(); bereit = false; var erster = true;
    unsubDocs = F.onSnapshot(F.collection(db, 'teams', team.id, 'docs'), { includeMetadataChanges: true }, function (snap) {
      serverAktuell = !snap.metadata.fromCache;   // erst nach aktuellem Server-Stand schreiben (Konflikte erkennen statt blind überschreiben)
      if (erster && snap.metadata.fromCache) return;   // offline/leerer Zwischenspeicher: nichts als „gelöscht“ werten
      snap.docChanges().forEach(function (ch) { if (ch.type === 'removed') delete remote[ch.doc.id]; else remote[ch.doc.id] = { d: ch.doc.data(), pending: ch.doc.metadata.hasPendingWrites }; });
      var keys = {};
      snap.docChanges().forEach(function (ch) { keys[ch.doc.id.replace(/~~\d+$/, '')] = 1; });
      if (erster) { Object.keys(meta).forEach(function (k) { keys[k] = 1; }); }
      Object.keys(keys).forEach(function (k) { wartend[k] = 1; });
      if (st.s === 'fehler') setStatus('ok');
      var war = erster; erster = false;
      verarbeiteWartende().then(function () {
        if (war) { bereit = true; abgleich(); setStatus('ok'); if (hatLegacy()) setTimeout(zeigeHochladen, 50); }
      });
    }, function (e) {
      if (e.code === 'permission-denied') { keinZugriff(); return; }
      setStatus('fehler', fehlerText(e));
    });
    unsubTeam = F.onSnapshot(tRef(), function (d) {
      if (d.metadata.fromCache) return;
      if (!d.exists()) return keinZugriff();
      var t = d.data(); team.members = t.members || []; team.namen = t.namen || {}; team.inviteCode = t.inviteCode; team.ownerUid = t.ownerUid; teamMerken(team);
      if (team.members.indexOf(user.uid) < 0) return keinZugriff();
      if (H.teamGeaendert) H.teamGeaendert();
    }, function (e) { if (e.code === 'permission-denied') keinZugriff(); });
    if (team.ownerUid === user.uid) {
      unsubReq = F.onSnapshot(F.collection(db, 'teams', team.id, 'requests'), function (q) {
        var vorher = anfragen.length;
        anfragen = q.docs.map(function (d) { return d.data(); });
        if (anfragen.length > vorher) toast('Neue Beitrittsanfrage – Mehr → Cloud & Team');
        if (H.teamGeaendert) H.teamGeaendert();
      }, function () { });
    }
    tickT = setInterval(tick, T.tickMs || 2000);
  }
  function keinZugriff() {
    stopSync(); entsperrt = false; key = null;
    ui('<div class="card"><h2>Kein Zugriff</h2><div class="muted">Du bist nicht (mehr) Mitglied dieses Teams oder die Sicherheitsregeln fehlen. Die verschlüsselte Kopie bleibt auf dem Gerät.</div><button class="btn" id="clOk">Weiter</button></div>');
    $('#clOk').addEventListener('click', function () { H.setzeDaten(null); zeigeTeams(); });
  }
  function tick() {
    if (!entsperrt) return;
    if (Object.keys(wartend).length && !H.beschaeftigt()) verarbeiteWartende();
    if (bereit && !H.liveAktiv()) pushen();
    taeglichPruefen();
    setStatus(st.s === 'fehler' ? 'fehler' : 'ok', st.s === 'fehler' ? st.text : '');
  }

  // Remote → lokal
  var verarbeitet = Promise.resolve();
  function verarbeiteWartende() {
    verarbeitet = verarbeitet.then(async function () {
      if (H.beschaeftigt() && bereit) return;   // während Eingabe/Live-Modus später übernehmen
      var keys = Object.keys(wartend); wartend = {}; var geaendert = false;
      for (var i = 0; i < keys.length; i++) { try { if (await remoteAnwenden(keys[i])) geaendert = true; } catch (e) { console.warn('Sync', keys[i], e); } }
      if (geaendert) { H.setzeDaten(C.zusammensetzen(secs), true); cacheSpeichernBald(); wiederherstellungMelden(); }
    });
    return verarbeitet;
  }
  async function remoteAnwenden(k) {
    var r = remote[k];
    if (!r) {   // entfernt (von anderem Gerät gelöscht)
      if (meta[k] && !inflight[k]) {
        if (k in hashes && hashes[k] === meta[k].h) { delete secs[k]; delete hashes[k]; delete meta[k]; delete lc[k]; return true; }
        if (!(k in hashes)) { delete meta[k]; return false; }
        konflikt(k, null, 'auf einem anderen Gerät gelöscht, hier aber geändert – deine Version bleibt'); delete meta[k]; return false;
      }
      return false;
    }
    if (r.pending) return false;
    var dd = r.d, t = ms(dd.updatedAt);
    if (meta[k] && t && t <= meta[k].t) return false;
    var n = dd.parts || 1, ct = dd.ct || '';
    for (var i = 1; i < n; i++) { var c = remote[k + '~~' + i]; if (!c || c.d.iv !== dd.iv) { wartend[k] = 1; return false; } ct += c.d.ct; }
    var obj = await C.decJSON(key, { iv: dd.iv, ct: ct }, team.id + '/' + k);
    var rh = await C.hash(obj), lh = hashes[k], synced = meta[k] ? meta[k].h : undefined;
    if (lh === rh) { meta[k] = { h: rh, t: t, p: n }; delete lc[k]; return false; }
    if (dd.by === user.uid && (rh === synced || rh === inflight[k])) { meta[k] = { h: rh, t: t, p: n }; return false; }   // eigener, bereits bekannter Stand
    var dirty = lh !== undefined ? lh !== synced : synced !== undefined;
    if (dirty && inflight[k]) dirty = true;
    if (!dirty || !(lc[k] > t)) {
      if (dirty) konflikt(k, secs[k], 'gleichzeitig geändert – die neuere Version vom anderen Gerät gilt, deine ist als Konfliktkopie gesichert');
      secs[k] = obj; hashes[k] = rh; meta[k] = { h: rh, t: t, p: n }; delete lc[k];
      return true;
    }
    konflikt(k, obj, 'gleichzeitig geändert – deine neuere Version gilt, die andere ist als Konfliktkopie gesichert');
    meta[k] = { h: synced, t: t, p: n };
    return false;
  }
  function konflikt(k, kopie, text) {
    konflikte.push({ zeit: jetzt(), key: k, bereich: C.bereichName(k), text: text, kopie: kopie });
    if (konflikte.length > 5) konflikte.shift();
    toast('Sync-Konflikt (' + C.bereichName(k) + '): ' + text.split(' – ')[1]);
    if (H.konflikt) H.konflikt();
  }

  // Lokal → Cloud
  var abgleichLaeuft = Promise.resolve(), abgleichNoetig = false;
  function lokalGeaendert() {
    if (!entsperrt) return;
    abgleichNoetig = true;
    clearTimeout(pushT); pushT = setTimeout(abgleich, T.debounceMs || 1200);
    setStatus(st.s === 'fehler' ? 'fehler' : 'sync', st.text);
  }
  function abgleich() {
    abgleichLaeuft = abgleichLaeuft.then(async function () {
      if (!entsperrt) return;
      if (!bereit && !hatteCache) return;   // neues Gerät: erst den Cloud-Stand laden, sonst würde der leere Stand gewinnen
      abgleichNoetig = false;
      var neu = C.aufteilen(H.daten()), nh = {};
      for (var k in neu) {
        nh[k] = await C.hash(neu[k]);
        if (nh[k] !== hashes[k] && !(meta[k] && meta[k].h === nh[k])) lc[k] = jetzt();   // Zeitpunkt der letzten lokalen Änderung
        else if (meta[k] && meta[k].h === nh[k]) delete lc[k];
      }
      Object.keys(hashes).forEach(function (k) { if (!(k in nh) && meta[k] && !lc[k]) lc[k] = jetzt(); });
      secs = neu; hashes = nh;
      cacheSpeichernBald();
      if (bereit && !H.liveAktiv()) pushen();
    });
    return abgleichLaeuft;
  }
  function pushen() {
    if (!bereit || !entsperrt || !online || !serverAktuell) return;
    var d = dirtyKeys();
    Object.keys(d).forEach(function (k) {
      if (inflight[k]) return;
      if (k in hashes) schreiben(k, secs[k], hashes[k]); else loeschen(k);
    });
  }
  async function schreiben(k, obj, h) {
    inflight[k] = h;
    try {
      var e = await C.encJSON(key, obj, team.id + '/' + k), teile = C.stuecke(e.ct), b = F.writeBatch(db), alt = meta[k] && meta[k].p || 1;
      for (var i = 1; i < teile.length; i++) b.set(dRef(k + '~~' + i), { iv: e.iv, ct: teile[i], part: i, by: user.uid, v: 1, updatedAt: F.serverTimestamp() });
      for (var j = teile.length; j < alt; j++) b.delete(dRef(k + '~~' + j));
      b.set(dRef(k), { iv: e.iv, ct: teile[0], parts: teile.length, by: user.uid, v: 1, updatedAt: F.serverTimestamp() });
      var pc = b.commit();
      try { await mitTimeout(pc, NETZ_MS, 'Speichern in der Cloud'); }
      catch (te) { if (te.code !== 'psv/timeout') throw te; cloudOk = false; pruefeCloud().then(function () { setStatus('sync', 'Übertragung dauert…'); }, function (e2) { setStatus('fehler', fehlerText(e2)); }); await pc; }
      meta[k] = { h: h, t: (meta[k] && meta[k].t) || 0, p: teile.length };
      if (hashes[k] === h) delete lc[k];
      if (st.s === 'fehler') setStatus('ok');
    } catch (err) {
      setStatus('fehler', fehlerText(err)); letzterFehler = fehlerText(err);
    } finally { delete inflight[k]; cacheSpeichernBald(); setStatus(st.s, st.text); }
  }
  async function loeschen(k) {
    inflight[k] = 'del';
    try {
      var b = F.writeBatch(db), n = meta[k] && meta[k].p || 1;
      for (var i = 1; i < n; i++) b.delete(dRef(k + '~~' + i));
      b.delete(dRef(k)); await b.commit();
      delete meta[k]; delete lc[k];
    } catch (err) { setStatus('fehler', fehlerText(err)); }
    finally { delete inflight[k]; cacheSpeichernBald(); setStatus(st.s, st.text); }
  }
  function allesUebertragen(timeoutMs) {   // wartet, bis nichts mehr offen ist
    var bis = jetzt() + (timeoutMs || 120000);
    return new Promise(function (res, rej) {
      (function warte() {
        abgleichLaeuft.then(function () {
          pushen();
          if (!Object.keys(dirtyKeys()).length && !Object.keys(inflight).length) return res(true);
          if (st.s === 'fehler' && !online) return rej(new Error(st.text));
          if (jetzt() > bis) return rej(new Error('Zeitüberschreitung – Daten werden später übertragen'));
          setTimeout(warte, 400);
        });
      })();
    });
  }

  // ---------- Lokale Daten (Version 1.x) hochladen ----------
  function zeigeHochladen() {
    var L = hatLegacy(); if (!L || !entsperrt) return;
    var n = L.players.filter(function (p) { return p.name && !p.archiviert; }).length, s = (L.spieltage || []).length;
    var cloudN = (secs.spieler || []).filter(function (p) { return p.name && !p.archiviert; }).length, cloudS = Object.keys(secs).filter(function (k) { return k.indexOf('st_') === 0; }).length;
    ui('<div class="card"><h2>Lokale Daten übernehmen?</h2>' +
      '<div class="muted">Auf diesem Gerät liegen Daten aus der bisherigen Version: <b>' + n + ' Kinder, ' + s + ' Spieltage</b>.</div>' +
      (cloudN || cloudS ? '<div class="cl-warn">Im Team in der Cloud sind bereits <b>' + cloudN + ' Kinder, ' + cloudS + ' Spieltage</b> gespeichert. Hochladen <b>ersetzt</b> diese Daten für alle Trainer im Team.</div>' : '') +
      '<div class="muted">Die Daten werden verschlüsselt hochgeladen. Die unverschlüsselte lokale Kopie wird erst entfernt, wenn die Cloud den Empfang bestätigt hat.</div>' +
      '<div id="clMsg" class="cl-msg hidden"></div>' +
      '<button class="btn" id="clHoch">Lokale Daten in die Cloud hochladen</button>' +
      '<button class="btn sec" id="clSich">Vorher als Datei sichern</button>' +
      '<button class="btn sec" id="clSpaeter">Jetzt nicht (später unter „Mehr → Cloud &amp; Team“)</button></div>');
    $('#clSich').addEventListener('click', function () { H.exportiereText(lsGet(LS.legacy), 'Sicherung_vor_Cloud'); });
    $('#clSpaeter').addEventListener('click', function () { uiZu(); });
    $('#clHoch').addEventListener('click', function () {
      if ((cloudN || cloudS) && !confirm('Cloud-Daten des Teams wirklich durch die Daten dieses Geräts ersetzen?')) return;
      var b = this; busy(b, true, 'Wird hochgeladen…'); meldung('#clMsg', online ? '' : 'Offline – die Daten werden übertragen, sobald eine Verbindung besteht.', true);
      hochladen().then(function () { busy(b, false); uiZu(); toast('Hochgeladen ✓ – unverschlüsselte lokale Kopie entfernt'); })
        .catch(function (e) { busy(b, false); meldung('#clMsg', 'Noch nicht bestätigt: ' + (e.message || e) + '. Die lokale Kopie bleibt erhalten.'); });
    });
  }
  async function hochladen() {
    var L = hatLegacy(); if (!L) return;
    if (Object.keys(secs).length) await sicherung('vor_hochladen').catch(function () { });
    H.setzeDaten(L); H.speichern();          // App normalisiert; speichern → lokalGeaendert
    await abgleich();
    Object.keys(hashes).forEach(function (k) { lc[k] = jetzt() + 1000; });
    await allesUebertragen(T.uploadTimeoutMs || 180000);
    if (hatLegacy()) lsDel(LS.legacy);
    await cacheSpeichern();
  }

  // ---------- Abmelden ----------
  function abmelden(datenWeg) {
    var tid = team && team.id;
    stopSync(); key = null; entsperrt = false;
    if (datenWeg === true && tid) { lsDel(LS.cache + tid); lsDel(LS.key + tid); lsDel(LS.team); }
    secs = {}; hashes = {}; meta = {}; lc = {};
    if (H) H.setzeDaten(null);
    F.signOut(auth).catch(function () { });
    zeigeStart();
  }

  // ---------- Team-Verwaltung (in der App unter Mehr → Cloud & Team) ----------
  function istOwner() { return team && user && team.ownerUid === user.uid; }
  function view() {
    if (modus() === 'lokal') {
      return '<div class="card"><h2>Cloud &amp; Team</h2><div class="muted">Die App speichert derzeit nur auf diesem Gerät. Mit der Cloud teilst du die Daten verschlüsselt mit Co-Trainern und hast eine Sicherung.</div>' +
        '<button class="btn" id="clEinr">Cloud-Synchronisation einrichten</button></div>';
    }
    if (!entsperrt || !team) return '<div class="card"><h2>Cloud &amp; Team</h2><div class="muted">Nicht angemeldet.</div><button class="btn" id="clAnm">Anmelden</button></div>';
    var s = statusInfo(), L = hatLegacy();
    var h = '<div class="card"><h2>Cloud &amp; Team</h2>' +
      '<div class="cl-st ' + s.s + '">' + s.icon + ' ' + esc(s.text) + '</div>' +
      '<div class="muted">Team <b>' + esc(team.name || 'PSV Wesel VI') + '</b> · angemeldet als ' + esc(user.email) + (istOwner() ? ' · Haupttrainer' : ' · Co-Trainer') + '</div>' +
      (st.s === 'fehler' ? '<div class="cl-msg">' + esc(st.text) + '</div>' : '') +
      '<button class="btn small sec" id="clJetzt">Jetzt synchronisieren</button></div>';
    if (L) h += '<div class="card"><h2>Lokale Daten</h2><div class="muted">Auf diesem Gerät liegen noch unverschlüsselte Daten aus der bisherigen Version (' + L.players.filter(function (p) { return p.name && !p.archiviert; }).length + ' Kinder).</div><button class="btn" id="clHochM">Lokale Daten in die Cloud hochladen</button></div>';
    if (istOwner()) {
      h += '<div class="card"><h2>Co-Trainer einladen</h2><div class="muted">Einladungscode weitergeben. Co-Trainer registrieren sich in der App, wählen „Einem Team beitreten“ und geben den Code ein. Danach hier freigeben und das Team-Passwort persönlich mitteilen.</div>' +
        '<div class="cl-code" id="clCodeAnz">' + esc(C.codeAnzeige(team.inviteCode || '')) + '</div>' +
        '<button class="btn small sec" id="clCodeTeil">Code teilen</button> <button class="btn small sec" id="clCodeNeu">Neuen Code erzeugen</button></div>';
      h += '<div class="card"><h2>Beitrittsanfragen</h2>' + (anfragen.length ? anfragen.map(function (a) {
        return '<div class="cl-row"><span>' + esc(a.email || a.uid) + '</span><button class="btn small" data-ok="' + esc(a.uid) + '">Freigeben</button><button class="btn small warn" data-nein="' + esc(a.uid) + '">Ablehnen</button></div>';
      }).join('') : '<div class="muted">Keine offenen Anfragen.</div>') + '</div>';
    }
    h += '<div class="card"><h2>Mitglieder</h2>' + team.members.map(function (u) {
      return '<div class="cl-row"><span>' + esc(team.namen[u] || u) + (u === team.ownerUid ? ' (Haupttrainer)' : '') + (u === user.uid ? ' – du' : '') + '</span>' +
        (istOwner() && u !== user.uid ? '<button class="btn small warn" data-weg="' + esc(u) + '">Entfernen</button>' : '') + '</div>';
    }).join('') + (!istOwner() ? '<button class="btn small sec" id="clVerl">Team verlassen</button>' : '') + '</div>';
    if (konflikte.length) h += '<div class="card"><h2>Konflikte</h2>' + konflikte.slice().reverse().map(function (k, i) {
      return '<div class="cl-row"><span>' + datum(k.zeit) + ' · ' + esc(k.bereich) + ': ' + esc(k.text) + '</span>' + (k.kopie ? '<button class="btn small sec" data-kk="' + (konflikte.length - 1 - i) + '">Kopie sichern</button>' : '') + '</div>';
    }).join('') + '</div>';
    h += '<div class="card"><h2>Dieses Gerät</h2>' +
      '<label class="cl-check"><input type="checkbox" id="clMerkT"' + (lsGet(LS.key + team.id) ? ' checked' : '') + '> Team-Passwort auf diesem Gerät merken</label>' +
      '<div class="muted">Ohne „merken“ fragt die App bei jedem Start nach dem Team-Passwort. Offline arbeitest du mit der verschlüsselten Kopie auf dem Gerät weiter.</div>' +
      '<div class="cl-warn">Team-Passwort vergessen = Daten nicht wiederherstellbar. Regelmäßig unter „Exportieren“ sichern (auch verschlüsselt möglich).</div>' +
      '<button class="btn sec" id="clAbm">Abmelden</button><button class="btn warn" id="clAbmWeg">Abmelden und Daten von diesem Gerät entfernen</button></div>';
    return h;
  }
  function bind() {
    var q = function (s) { return $(s); }, alle = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
    if (q('#clEinr')) q('#clEinr').addEventListener('click', function () { if (!confirm('Cloud einrichten? Die App startet neu und zeigt die Anmeldung. Deine Daten auf diesem Gerät bleiben erhalten, bis du sie hochlädst.')) return; lsDel(LS.modus); location.reload(); });
    if (q('#clAnm')) q('#clAnm').addEventListener('click', function () { if (user) nachLogin(); else zeigeStart(); });
    if (q('#clJetzt')) q('#clJetzt').addEventListener('click', function () { setStatus('sync'); abgleich().then(function () { pushen(); verarbeiteWartende(); }); });
    if (q('#clHochM')) q('#clHochM').addEventListener('click', zeigeHochladen);
    if (q('#clCodeTeil')) q('#clCodeTeil').addEventListener('click', function () {
      var t = 'Einladung ins Team „' + (team.name || 'PSV Wesel VI') + '“ in der App PSV Wesel-Lackhausen: Code ' + C.codeAnzeige(team.inviteCode) + ' (App öffnen → „Neues Konto registrieren“ → bei „Einem Team beitreten“ den Code eingeben). Das Team-Passwort bekommst du persönlich.';
      H.teileText('Einladung PSV Wesel-Lackhausen', t);
    });
    if (q('#clCodeNeu')) q('#clCodeNeu').addEventListener('click', function () {
      if (!confirm('Neuen Einladungscode erzeugen? Der alte Code funktioniert dann nicht mehr.')) return;
      var neu = C.einladungsCode(), alt = team.inviteCode, b = F.writeBatch(db);
      b.set(F.doc(db, 'invites', neu), { teamId: team.id, ownerUid: user.uid, createdAt: F.serverTimestamp() });
      b.update(tRef(), { inviteCode: neu, updatedAt: F.serverTimestamp() });
      if (alt) b.delete(F.doc(db, 'invites', alt));
      b.commit().then(function () { team.inviteCode = neu; teamMerken(team); H.render(); toast('Neuer Code erzeugt'); }).catch(function (e) { alert(fehlerText(e)); });
    });
    alle('[data-ok]').forEach(function (b) {
      b.addEventListener('click', function () {
        var uid = b.getAttribute('data-ok'), a = anfragen.filter(function (x) { return x.uid === uid; })[0] || {};
        if (!confirm((a.email || uid) + ' als Co-Trainer freigeben? Die Person kann danach – mit dem Team-Passwort – alle Teamdaten sehen und ändern.')) return;
        var bt = F.writeBatch(db), upd = { members: F.arrayUnion(uid), updatedAt: F.serverTimestamp() }; upd['namen.' + uid] = a.email || '';
        bt.update(tRef(), upd); bt.delete(F.doc(db, 'teams', team.id, 'requests', uid));
        bt.commit().then(function () { toast('Freigegeben – Team-Passwort bitte persönlich mitteilen'); }).catch(function (e) { alert(fehlerText(e)); });
      });
    });
    alle('[data-nein]').forEach(function (b) { b.addEventListener('click', function () { F.deleteDoc(F.doc(db, 'teams', team.id, 'requests', b.getAttribute('data-nein'))).catch(function (e) { alert(fehlerText(e)); }); }); });
    alle('[data-weg]').forEach(function (b) {
      b.addEventListener('click', function () {
        var uid = b.getAttribute('data-weg'); if (!confirm((team.namen[uid] || uid) + ' aus dem Team entfernen? Hinweis: Wer das Team-Passwort kennt und eine alte Kopie hat, kann diese weiter lesen. Bei Bedarf ein neues Team mit neuem Passwort anlegen.')) return;
        var upd = { members: F.arrayRemove(uid), updatedAt: F.serverTimestamp() }; upd['namen.' + uid] = F.deleteField();
        F.updateDoc(tRef(), upd).then(function () { toast('Entfernt'); }).catch(function (e) { alert(fehlerText(e)); });
      });
    });
    if (q('#clVerl')) q('#clVerl').addEventListener('click', function () {
      if (!confirm('Team wirklich verlassen? Du verlierst den Zugriff auf die Teamdaten.')) return;
      var upd = { members: F.arrayRemove(user.uid), updatedAt: F.serverTimestamp() }; upd['namen.' + user.uid] = F.deleteField();
      F.updateDoc(tRef(), upd).then(function () { var tid = team.id; stopSync(); lsDel(LS.cache + tid); lsDel(LS.key + tid); lsDel(LS.team); entsperrt = false; key = null; H.setzeDaten(null); zeigeTeams(); }).catch(function (e) { alert(fehlerText(e)); });
    });
    alle('[data-kk]').forEach(function (b) { b.addEventListener('click', function () { var k = konflikte[+b.getAttribute('data-kk')]; H.exportiereText(JSON.stringify(k, null, 1), 'Konfliktkopie'); }); });
    if (q('#clMerkT')) q('#clMerkT').addEventListener('change', function (e) {
      if (e.target.checked) C.schluesselExport(key).then(function (r) { lsSet(LS.key + team.id, r); toast('Team-Passwort wird auf diesem Gerät gemerkt'); });
      else { lsDel(LS.key + team.id); toast('Team-Passwort wird nicht mehr gemerkt'); }
    });
    if (q('#clAbm')) q('#clAbm').addEventListener('click', function () { if (confirm('Abmelden? Die verschlüsselte Kopie bleibt auf dem Gerät.')) { allesUebertragen(5000).catch(function () { }).then(function () { abmelden(false); }); } });
    if (q('#clAbmWeg')) q('#clAbmWeg').addEventListener('click', function () {
      var n = Object.keys(dirtyKeys()).length;
      if (!confirm((n ? 'ACHTUNG: ' + n + ' Änderung(en) sind noch nicht in der Cloud und gehen verloren. ' : '') + 'Abmelden und alle Teamdaten von diesem Gerät entfernen? In der Cloud bleiben sie erhalten.')) return;
      abmelden(true);
    });
  }

  function datenschutzHtml() {
    return '<h2>Datenschutz</h2>' +
      '<p><b>Was wird gespeichert?</b> Kader (Namen, Rückennummern, Positionen, Einschätzungen, Notizen, Fotos), Spieltage, Messungen und Gegnerinfos – also Daten von Kindern. Verantwortlich ist der Verein bzw. die Trainer, die die App nutzen.</p>' +
      '<p><b>Wetter (ab 2.4):</b> Für „Wetter zur Spielzeit“ fragt die App die Bright Sky API (api.brightsky.dev, Daten des Deutschen Wetterdienstes) ab – übertragen werden nur die Koordinaten des Platzes und der Zeitraum, keine Kinderdaten. Die Adresssuche für Spielorte nutzt OpenStreetMap Nominatim (nur der eingegebene Suchtext). Quelle: Deutscher Wetterdienst; Kartendaten © OpenStreetMap-Mitwirkende (ODbL).</p>' +
      '<p><b>Wo?</b> Auf deinem Handy (App-Speicher) und – wenn du die Cloud nutzt – in Google Firebase (Firestore) im Projekt des Teams, Speicherort Frankfurt (europe-west3, EU).</p>' +
      '<p><b>Verschlüsselt:</b> Alle Teamdaten inkl. Fotos werden auf dem Gerät mit AES-GCM (256 Bit) verschlüsselt, bevor sie hochgeladen werden. Der Schlüssel wird aus dem Team-Passwort abgeleitet (PBKDF2-SHA256, 600 000 Runden) und verlässt das Gerät nie. Google/Firebase und Dritte sehen nur unlesbare Daten. Auch die Kopie auf dem Handy ist im Cloud-Modus verschlüsselt.</p>' +
      '<p><b>Unverschlüsselt in der Cloud</b> liegen nur technische Angaben: Team-Kennung, Benutzerkennungen und E-Mail-Adressen der Trainer (für Anmeldung und Freigabe), Einladungscode, Zeitpunkte der Änderungen, Anzahl/Größe der Datenblöcke.</p>' +
      '<p><b>Konto:</b> Firebase Authentication speichert E-Mail-Adresse und Passwort-Hash der Trainer. Keine Werbung, kein Tracking, keine Weitergabe.</p>' +
      '<p><b>Liga-Tab:</b> lädt die offiziellen Widgets von fussball.de (DFB-Medien); dabei gelten deren Datenschutzhinweise.</p>' +
      '<p><b>Löschen:</b> „Mehr → Cloud &amp; Team → Abmelden und Daten von diesem Gerät entfernen“ löscht die Kopie auf dem Handy. Einzelne Kinder lassen sich im Kader löschen; das wird auch in der Cloud gelöscht. Das ganze Team und Konten kann der Haupttrainer in der Firebase-Konsole löschen.</p>' +
      '<p><b>Wichtig:</b> Ohne Team-Passwort kann niemand – auch nicht der Entwickler – die Daten wiederherstellen.</p>' +
      '<p class="muted">Eltern sollten über die Nutzung informiert sein und eingewilligt haben (insbesondere bei Fotos).</p>' +
      '<p class="cl-sub">Kaderkompass · ' + (window.kkCopy ? window.kkCopy() : '© 2026 MLN Consulting · mlnc.net') + '</p>';
  }

  // ---------- Start ----------
  function start(hooks) {
    H = hooks;
    window.addEventListener('online', function () { online = true; setStatus(st.s === 'fehler' ? 'ok' : st.s); });
    window.addEventListener('offline', function () { online = false; serverAktuell = false; setStatus(st.s); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && entsperrt) { clearTimeout(pushT); abgleich(); cacheSpeichern(); } });
    if (modus() === 'lokal') return false;
    start2();
    return true;
  }
  function start2() {
    ui('<div class="card"><div class="muted">Wird gestartet…</div></div>');
    try { initFirebase(); } catch (e) {
      ui('<div class="card"><h2>Cloud nicht verfügbar</h2><div class="cl-msg">' + esc(fehlerText(e)) + '</div><button class="btn sec" id="clLokal">Ohne Cloud nur auf diesem Gerät nutzen</button></div>');
      $('#clLokal').addEventListener('click', function () { lsSet(LS.modus, 'lokal'); location.reload(); }); return;
    }
    var gestartet = false, schnell = schnellstart();
    F.onAuthStateChanged(auth, function (u) {
      schnell.then(function () {
        var vorher = user; user = u;
        if (!u) { if (entsperrt) abmelden(false); else zeigeStart(); return; }
        if (entsperrt && vorher && vorher.uid !== u.uid) { stopSync(); entsperrt = false; key = null; H.setzeDaten(null); gestartet = true; nachLogin(); return; }
        if (entsperrt && team && !unsubDocs) { starteSync(); teamAktualisieren(); return; }   // Schnellstart: Sync nachziehen
        if (vorher && vorher.uid === u.uid && entsperrt) return;
        if (gestartet && entsperrt) return; gestartet = true;
        nachLogin();
      });
    });
  }
  async function schnellstart() {   // gemerktes Passwort: sofort aus der verschlüsselten Kopie starten (auch offline), Sync nach Anmeldung
    try {
      var t = lsJSON(LS.team), raw = t && lsGet(LS.key + t.id);
      if (!t || !raw || !t.kdf || !t.verifier || !lsGet(LS.cache + t.id)) return;
      var k = await C.schluesselImport(raw); if (!(await C.pruefen(k, t.id, t.verifier))) return;
      team = t; var uidT = t.uid; delete team.uid; user = user || { uid: uidT, email: (t.namen || {})[uidT] || '' };
      await entsperrtMit(k, true, false, true);
    } catch (e) { console.warn('Schnellstart', e); }
  }
  async function nachLogin() {
    var t = lsJSON(LS.team);
    if (t && t.uid === user.uid && t.kdf && t.verifier) {
      team = t; delete team.uid;
      var raw = lsGet(LS.key + team.id);
      if (raw) {
        try { var k = await C.schluesselImport(raw); if (await C.pruefen(k, team.id, team.verifier)) { await entsperrtMit(k, true, false); teamAktualisieren(); return; } } catch (e) { }
      }
      zeigeEntsperren(); teamAktualisieren(); return;
    }
    var a = lsJSON(LS.anfrage); if (a && a.uid === user.uid) return zeigeWarten();
    zeigeTeams();
  }
  function teamAktualisieren() {   // Mitgliedschaft im Hintergrund prüfen (offline egal)
    F.getDoc(tRef()).then(function (d) { if (d.exists()) { var x = d.data(); team.members = x.members || []; team.namen = x.namen || {}; team.inviteCode = x.inviteCode; teamMerken(team); } })
      .catch(function (e) { if (e.code === 'permission-denied') keinZugriff(); });
  }


  // ---------- Sicherungen / Versionsverlauf (ab 2.3) ----------
  // teams/{id}/snapshots/{sid} (Metadaten im Klartext: Zeit, Autor, Grund, Größe, App-Version – keine Kinderdaten)
  //   …/snapshots/{sid}/chunks/{n} (Chiffretext), teams/{id}/snapfotos/{hash} (Fotos, je Hash nur einmal)
  var SN_MAX = T.snapMax || 30, SN_WOCHEN = 12, snKette = Promise.resolve(), snLetzte = null, snFotoBekannt = {};
  function snCol() { return F.collection(db, 'teams', team.id, 'snapshots'); }
  function snRef(sid) { return F.doc(db, 'teams', team.id, 'snapshots', sid); }
  function snChunk(sid, i) { return F.doc(db, 'teams', team.id, 'snapshots', sid, 'chunks', String(i)); }
  function snFoto(h) { return F.doc(db, 'teams', team.id, 'snapfotos', h); }
  function berlinTag(t) { return new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
  function berlinZeit(t) { return t ? new Date(t).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'wird gespeichert…'; }
  function snLetzteHolen() { if (!team) return null; return lsJSON('psv_snap_' + team.id) || {}; }
  function sicherung(grund, label) {   // Stand SOFORT festhalten (vor der Änderung), Übertragung danach
    if (!entsperrt || !team || !key || !user) return Promise.resolve(null);
    var d = JSON.parse(JSON.stringify(H.daten())), tid = team.id;
    var p = snKette.then(function () { return snSchreiben(d, grund || 'manuell', label || '', tid); });
    snKette = p.catch(function () { });
    return p;
  }
  async function snSchreiben(d, grund, label, tid) {
    if (!team || team.id !== tid) return null;
    var pk = await C.sicherungPacken(C.aufteilen(d)), sid = F.doc(snCol()).id, dh = await C.hash(pk.inhalt);
    var b = F.writeBatch(db), neuFotos = 0, fh = Object.keys(pk.fotos);
    for (var i = 0; i < fh.length; i++) {   // Fotos nur, wenn dieser Stand noch nicht in der Cloud liegt
      var h = fh[i]; if (snFotoBekannt[h]) continue;
      var da = false; try { da = (await mitTimeout(F.getDoc(snFoto(h)), 8000, 'Foto prüfen')).exists(); } catch (e) { }
      if (!da) { var ef = await C.encJSON(key, pk.fotos[h], team.id + '/snapfoto/' + h); b.set(snFoto(h), { iv: ef.iv, ct: ef.ct, by: user.uid, createdAt: F.serverTimestamp() }); neuFotos += ef.ct.length; }
      snFotoBekannt[h] = 1;
    }
    var e = await C.encJSON(key, { format: 'psv-snap-1', secs: pk.inhalt, appVersion: H.version ? H.version() : '' }, team.id + '/snap/' + sid), teile = C.stuecke(e.ct);
    teile.forEach(function (t, i) { b.set(snChunk(sid, i), { iv: e.iv, ct: t, part: i, by: user.uid }); });
    var m = { by: user.uid, grund: C.GRUENDE[grund] ? grund : 'manuell', groesse: e.ct.length + neuFotos, appVersion: String(H.version ? H.version() : '').slice(0, 20), parts: teile.length, iv: e.iv, fotos: fh, v: 1, createdAt: F.serverTimestamp() };
    if (label) { var el = await C.encJSON(key, String(label).slice(0, 200), team.id + '/snaplabel/' + sid); m.labelIv = el.iv; m.labelCt = el.ct; }
    b.set(snRef(sid), m);
    var pc = b.commit();
    try { await mitTimeout(pc, NETZ_MS, 'Sicherung speichern'); }
    catch (te) { if (te.code !== 'psv/timeout') throw te; pc.catch(function () { }); }   // offline: bleibt in der Warteschlange
    var alt = lsJSON('psv_snap_' + tid) || {}; lsSet('psv_snap_' + tid, JSON.stringify({ tag: grund === 'taeglich' ? berlinTag(jetzt()) : alt.tag, hash: dh }));
    snAufraeumen().catch(function (e2) { console.warn('Sicherungen aufräumen', e2); });
    return sid;
  }
  var snTagLaeuft = false;
  async function taeglichPruefen() {   // einmal pro Tag beim ersten Öffnen/Ändern, nur wenn sich etwas geändert hat
    if (snTagLaeuft || !entsperrt || !bereit || !serverAktuell || !team || !Object.keys(secs).length) return 'nicht bereit';
    var l = snLetzteHolen(), heute = berlinTag(jetzt()); if (l.tag === heute) return 'heute schon';
    snTagLaeuft = true;
    try {
      var h = await C.hash((await C.sicherungPacken(secs)).inhalt);
      if (h === l.hash) { lsSet('psv_snap_' + team.id, JSON.stringify({ tag: heute, hash: h })); return 'unverändert'; }
      await sicherung('taeglich'); return 'gesichert';
    } catch (e) { console.warn('Tägliche Sicherung', e); } finally { snTagLaeuft = false; }
  }
  async function snListe() {
    var q = await mitTimeout(F.getDocs(snCol()), NETZ_MS, 'Sicherungen laden'), L = [];
    for (var i = 0; i < q.docs.length; i++) {
      var x = q.docs[i].data(), o = { id: q.docs[i].id, t: ms(x.createdAt), by: x.by, grund: x.grund, groesse: x.groesse || 0, appVersion: x.appVersion || '', parts: x.parts || 1, iv: x.iv, fotos: x.fotos || [], label: '' };
      if (x.labelCt) { try { o.label = await C.decJSON(key, { iv: x.labelIv, ct: x.labelCt }, team.id + '/snaplabel/' + o.id); } catch (e) { } }
      L.push(o);
    }
    return L.sort(function (a, b) { return (b.t || 9e15) - (a.t || 9e15); });
  }
  async function snAufraeumen() {
    var L = await snListe(), r = C.sicherungAufbewahren(L, jetzt(), SN_MAX, SN_WOCHEN), owner = istOwner();
    var weg = L.filter(function (x) { return r.loeschen.indexOf(x.id) >= 0 && (owner || x.by === user.uid); });
    for (var i = 0; i < weg.length; i++) await snLoeschenDocs(weg[i]);
    if (owner && weg.length) {   // nicht mehr benutzte Fotos entfernen
      var benutzt = {}; L.filter(function (x) { return weg.indexOf(x) < 0; }).forEach(function (x) { x.fotos.forEach(function (h) { benutzt[h] = 1; }); });
      var fq = await F.getDocs(F.collection(db, 'teams', team.id, 'snapfotos')), b = F.writeBatch(db), n = 0;
      fq.docs.forEach(function (d) { if (!benutzt[d.id]) { b.delete(d.ref); delete snFotoBekannt[d.id]; n++; } });
      if (n) await b.commit();
    }
    return weg.length;
  }
  async function snLoeschenDocs(x) {
    var b = F.writeBatch(db); for (var i = 0; i < (x.parts || 1); i++) b.delete(snChunk(x.id, i)); b.delete(snRef(x.id)); await mitTimeout(b.commit(), NETZ_MS, 'Sicherung löschen');
  }
  async function snLaden(x) {   // → vollständige Daten (Fotos aus dem Fotospeicher, fehlende = aktuelles Foto)
    var ct = '';
    for (var i = 0; i < x.parts; i++) { var c = await mitTimeout(F.getDoc(snChunk(x.id, i)), NETZ_MS, 'Sicherung laden'); if (!c.exists()) throw new Error('Sicherung unvollständig (Teil ' + (i + 1) + ' fehlt)'); ct += c.data().ct; }
    var o = await C.decJSON(key, { iv: x.iv, ct: ct }, team.id + '/snap/' + x.id), fotos = {};
    for (var j = 0; j < x.fotos.length; j++) {
      try { var f = await mitTimeout(F.getDoc(snFoto(x.fotos[j])), NETZ_MS, 'Foto laden'); if (f.exists()) fotos[x.fotos[j]] = await C.decJSON(key, f.data(), team.id + '/snapfoto/' + x.fotos[j]); } catch (e) { }
    }
    var s = C.sicherungEntpacken(o.secs, fotos);
    Object.keys(o.secs).forEach(function (k) { if (k.indexOf('foto_') === 0 && !s[k] && secs[k]) s[k] = secs[k]; });
    return C.zusammensetzen(s);
  }
  async function wiederherstellen(x) {
    var d = await snLaden(x);
    await sicherung('vor_wiederherstellen');
    d.wiederhergestellt = { zeit: jetzt(), von: (team.namen && team.namen[user.uid]) || user.email || '', stand: x.t || 0 };
    H.setzeDaten(d); H.speichern();
    await abgleich();
    Object.keys(hashes).forEach(function (k) { lc[k] = jetzt() + 1000; });
    pushen();
    return d;
  }
  var snGesehen = null;
  function wiederherstellungMelden() {   // anderes Gerät hat einen alten Stand zurückgeholt → Hinweis
    var w = secs.kern && secs.kern.wiederhergestellt; if (!w || !w.zeit) return;
    if (snGesehen === null) { snGesehen = lsGet('psv_snap_gesehen') || ''; }
    if (String(w.zeit) === snGesehen) return;
    snGesehen = String(w.zeit); lsSet('psv_snap_gesehen', snGesehen);
    if (H.hinweis) H.hinweis('Daten wiederhergestellt', 'Die Teamdaten wurden' + (w.von ? ' von ' + w.von : '') + ' auf den Stand vom ' + berlinZeit(w.stand) + ' zurückgesetzt.');
    else toast('Daten auf Stand vom ' + berlinZeit(w.stand) + ' zurückgesetzt');
  }
  function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function sicherungenView() {
    if (!entsperrt || !team) return '<div class="card"><h2>Sicherungen</h2><div class="muted">Sicherungen gibt es nur mit Cloud-Team. Lokal: „Exportieren“ unter Mehr.</div></div>';
    return '<div class="card"><h2>Jetzt sichern</h2><div class="muted">Verschlüsselte Kopie aller Teamdaten in der Cloud. Automatisch: täglich, vor Live-Spiel, Import, Löschen und Wiederherstellen.</div>' +
      '<label class="f">Bezeichnung (optional)</label><input type="text" id="snLabel" maxlength="80" placeholder="z. B. vor Saisonstart">' +
      '<button class="btn" id="snJetzt">Jetzt sichern</button><div id="snMsg" class="cl-msg hidden"></div></div>' +
      '<div class="card"><h2>Gespeicherte Stände</h2><div id="snInfo" class="muted">Wird geladen…</div><div id="snListe"></div></div>';
  }
  function alle(x) { return Array.prototype.slice.call(document.querySelectorAll(x)); }
  var snCache = [];
  function sicherungenBind() {
    if (!$('#snJetzt')) return;
    $('#snJetzt').addEventListener('click', function () {
      var b = this; busy(b, true, 'Wird gesichert…');
      sicherung('manuell', $('#snLabel').value.trim()).then(function () { busy(b, false); $('#snLabel').value = ''; toast('Gesichert ✓'); snAnzeigen(); })
        .catch(function (e) { busy(b, false); meldung('#snMsg', fehlerText(e)); });
    });
    snAnzeigen();
  }
  function snAnzeigen() {
    snListe().then(function (L) {
      snCache = L; if (!$('#snListe')) return;
      var summe = L.reduce(function (a, x) { return a + x.groesse; }, 0);
      $('#snInfo').innerHTML = L.length + ' Sicherung' + (L.length === 1 ? '' : 'en') + ' · zusammen ca. ' + kb(summe) + ' (kostenloser Firestore-Speicher: 1 GB – reicht bei weitem). Aufbewahrt werden die letzten 30 und für 12 Wochen je eine pro Woche.';
      $('#snListe').innerHTML = L.length ? L.map(function (x, i) {
        var autor = (team.namen && team.namen[x.by]) || (x.by === user.uid ? 'du' : 'Co-Trainer');
        return '<div class="sn-row"><div><b>' + esc(berlinZeit(x.t)) + '</b> · ' + esc(C.grundText(x.grund)) + (x.label ? ' – „' + esc(x.label) + '“' : '') +
          '<div class="muted">von ' + esc(autor) + ' · ' + kb(x.groesse) + (x.appVersion ? ' · App ' + esc(x.appVersion) : '') + '</div><div class="muted sn-vor" id="snV' + i + '"></div></div>' +
          '<div class="sn-kn"><button class="btn small sec" data-snv="' + i + '">Vorschau</button><button class="btn small" data-snw="' + i + '">Wiederherstellen</button><button class="btn small sec" data-sne="' + i + '">Als Datei exportieren</button>' +
          (istOwner() ? '<button class="btn small warn" data-snd="' + i + '">Löschen</button>' : '') + '</div></div>';
      }).join('') : '<div class="muted">Noch keine Sicherung.</div>';
      alle('[data-snv]').forEach(function (b) { b.addEventListener('click', function () {
        var i = +b.getAttribute('data-snv'), el = $('#snV' + i); el.textContent = 'Wird geladen…';
        snLaden(snCache[i]).then(function (d) { var z = C.sicherungZaehlen(d); el.textContent = z.spieler + ' Spieler' + (z.ehemalige ? ' (+' + z.ehemalige + ' ehemalige)' : '') + ' · ' + z.spieltage + ' Spieltage · ' + z.tafeln + ' Taktiktafeln · ' + z.fotos + ' Fotos'; })
          .catch(function (e) { el.textContent = fehlerText(e); });
      }); });
      alle('[data-snw]').forEach(function (b) { b.addEventListener('click', function () {
        var x = snCache[+b.getAttribute('data-snw')];
        if (!confirm('Stand vom ' + berlinZeit(x.t) + ' wiederherstellen?\n\nAlle aktuellen Teamdaten werden ersetzt – auf allen Geräten des Teams. Der jetzige Stand wird vorher automatisch gesichert.')) return;
        busy(b, true, 'Wird wiederhergestellt…');
        wiederherstellen(x).then(function () { toast('Wiederhergestellt ✓ – wird an alle Geräte übertragen'); }).catch(function (e) { busy(b, false); alert('Wiederherstellen fehlgeschlagen: ' + fehlerText(e)); });
      }); });
      alle('[data-sne]').forEach(function (b) { b.addEventListener('click', function () {
        var x = snCache[+b.getAttribute('data-sne')]; busy(b, true, 'Wird geladen…');
        snLaden(x).then(function (d) { busy(b, false); d.appVersion = x.appVersion; H.exportiereText(JSON.stringify(d, null, 1), 'Sicherung_' + berlinTag(x.t || jetzt())); })
          .catch(function (e) { busy(b, false); alert(fehlerText(e)); });
      }); });
      alle('[data-snd]').forEach(function (b) { b.addEventListener('click', function () {
        var x = snCache[+b.getAttribute('data-snd')]; if (!confirm('Sicherung vom ' + berlinZeit(x.t) + ' endgültig löschen?')) return;
        snLoeschenDocs(x).then(snAnzeigen).catch(function (e) { alert(fehlerText(e)); });
      }); });
    }).catch(function (e) { if ($('#snInfo')) $('#snInfo').textContent = fehlerText(e); });
  }

  window.PSVCloud = { start: start, modus: modus, aktiv: function () { return modus() === 'cloud'; }, entsperrt: function () { return entsperrt; },
    lokalGeaendert: lokalGeaendert, statusInfo: statusInfo, view: view, bind: bind, datenschutzHtml: datenschutzHtml, fehlerText: fehlerText,
    zeigeHochladen: zeigeHochladen, sicherung: sicherung, sicherungenView: sicherungenView, sicherungenBind: sicherungenBind, _sn: { liste: function () { return snListe(); }, laden: snLaden, wiederherstellen: wiederherstellen, aufraeumen: snAufraeumen, taeglich: taeglichPruefen, kette: function () { return snKette; } }, _cloudPruefungZuruecksetzen: function () { cloudOk = false; }, allesUebertragen: allesUebertragen, anfragenAnzahl: function () { return anfragen.length; },
    teamName: function () { return team && team.name ? team.name : ''; },
    _intern: function () { return { secs: secs, meta: meta, hashes: hashes, lc: lc, team: team, user: user, konflikte: konflikte, inflight: inflight, bereit: bereit, remote: remote }; } };
})();
