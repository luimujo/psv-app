/* PSV Wesel-Lackhausen – Web-App (PWA, ab 2.2): Service Worker für Offline-Betrieb + Hinweis bei neuer Version.
   In der Android-App (file://) ohne Wirkung. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || !/^https:$|^http:$/.test(location.protocol) || window.AndroidBridge) return;
  if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  var neuLaden = false, hatteController = !!navigator.serviceWorker.controller;   // Erstinstallation: nicht neu laden
  navigator.serviceWorker.addEventListener('controllerchange', function () { if (neuLaden || !hatteController) return; neuLaden = true; location.reload(); });
  function hinweis(reg) {
    if (document.getElementById('updBar')) return;
    var d = document.createElement('div'); d.id = 'updBar'; d.className = 'updbar';
    d.innerHTML = '<span>Neue Version verfügbar</span><button id="updJa">Aktualisieren</button><button id="updNein" aria-label="Später">✕</button>';
    document.body.appendChild(d);
    document.getElementById('updJa').onclick = function () { if (reg.waiting) reg.waiting.postMessage('skipWaiting'); d.remove(); };
    document.getElementById('updNein').onclick = function () { d.remove(); };
  }
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      window.__psvSW = reg;
      if (reg.waiting && navigator.serviceWorker.controller) hinweis(reg);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) hinweis(reg); });
      });
      setInterval(function () { reg.update().catch(function () { }); }, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () { }); });
    }).catch(function () { });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { });   // Daten nicht automatisch löschen lassen
  });
})();
