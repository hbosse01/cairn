// Cache hors-ligne de l'application (les données viennent d'Intervals.icu et sont gardées par l'app elle-même)
const CACHE = 'cairn-v2';
const SHELL = ['./', './index.html', './css/app.css', './fonts/big-shoulders-display-latin-700-normal.woff2', './fonts/big-shoulders-display-latin-800-normal.woff2', './fonts/hanken-grotesk-latin-400-normal.woff2', './fonts/hanken-grotesk-latin-600-normal.woff2', './fonts/hanken-grotesk-latin-700-normal.woff2', './manifest.webmanifest', './js/app.js', './js/data.js', './js/util.js', './js/demo.js', './js/races.js', './js/metrics.js', './js/charts.js',
  './js/views/home.js', './js/views/health.js', './js/views/activities.js', './js/views/volume.js', './js/views/more.js', './js/views/parts.js', './js/views/planning.js', './js/plan.js', './js/fit.js', './icons/icon-192.png',
  './vendor/chart.umd.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('intervals.icu') || u.hostname.endsWith('google.com')) return; // jamais de cache pour les données
  // réseau d'abord (pour recevoir les mises à jour), cache si hors-ligne
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); if (r.ok) caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
