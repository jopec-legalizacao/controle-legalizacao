// Service worker: deixa o app instalável, abre a "casca" offline e mostra as
// notificações do link público. Os dados sempre vêm do Supabase (rede primeiro).
const CACHE = 'legaliza-v6';
const ARQS = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'presets-sugeridos.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
});

// ---- notificações (Web Push)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'JOPEC · Legalização', {
    body: d.corpo || '', icon: 'icons/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag,
    lang: 'pt-BR', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const aberto = cs.find(c => c.url.includes('?p='));
    if (aberto) return aberto.navigate(url).then(c => (c || aberto).focus()).catch(() => aberto.focus());
    return self.clients.openWindow(url);
  }));
});
// o navegador trocou a inscrição (raro): avisa a página para inscrever de novo na próxima visita
self.addEventListener('pushsubscriptionchange', () => {});
