/* GÉNÉRÉ par scripts/cache.js — ne pas modifier à la main.
   Modèle : scripts/sw.template.js. */
const CACHE = 'assistant-commercial-d16162b83a';
const PRECACHE = [
  "./",
  "./app.min.js",
  "./i18n.min.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/logo-header.png",
  "./index.html",
  "./manifest.webmanifest",
  "./style.css"
];
const CACHE_FIRST = [
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/logo-header.png"
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
            await self.clients.claim();
        })(),
    );
});

/* La nouvelle version attend le clic de l'utilisateur : remplacer le code
   pendant une saisie peut vider un formulaire en cours. */
self.addEventListener('message', (event) => {
    if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    /* L'API n'est jamais mise en cache : une vente périmée ou une session
       expirée resservie hors ligne serait pire qu'une absence de réponse. */
    if (url.pathname.startsWith('/api/')) return;
    event.respondWith(respond(request, url));
});

async function respond(request, url) {
    const cache = await caches.open(CACHE);
    if (CACHE_FIRST.some((p) => url.pathname.endsWith(p.replace(/^\./, '')))) {
        const hit = await cache.match(request);
        if (hit) return hit;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
    }
    try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
    } catch (e) {
        const hit = await cache.match(request);
        if (hit) return hit;
        if (request.mode === 'navigate') {
            const shell = await cache.match('./index.html');
            if (shell) return shell;
        }
        /* Jamais de HTML à la place d'un fichier ou d'une donnée : l'appelant
           doit voir une erreur, pas du contenu qui n'a rien à faire là. */
        return new Response('', { status: 504, statusText: 'Offline' });
    }
}
