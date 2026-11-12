// Construit la page de redirection publiée par Render (site statique).
// Aucune dépendance : ce script écrit un fichier HTML dans les dossiers
// de publication usuels.
const fs = require('node:fs');

const TARGET = 'https://site-a48ebaa71ce945cc8ab9ac9be7f59aa8.freebuff.page';

const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0;url=${TARGET}">
  <link rel="canonical" href="${TARGET}">
  <title>Assistant Commercial</title>
  <style>
    body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f4ec;color:#14532d;padding:24px;text-align:center}
    h1{font-size:26px;margin:0 0 8px}
    p{max-width:34ch;line-height:1.6;margin:0 auto}
    a{color:#14532d;font-weight:700}
  </style>
</head>
<body>
  <div>
    <h1>Assistant Commercial</h1>
    <p>L'application a déménagé. <a href="${TARGET}">Ouvrir Assistant Commercial</a>.</p>
  </div>
  <script>
    // Nettoie l'ancienne application installée sur ce domaine, puis redirige.
    (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (e) {}
      window.location.replace(${JSON.stringify(TARGET)});
    })();
  </script>
</body>
</html>
`;

// Render publie selon le réglage « Publish Directory » du service.
// On écrit la page dans les dossiers les plus courants pour éviter un échec.
const sw = `// Service worker de nettoyage : désinstalle l'ancienne application
// et supprime ses caches, puis recharge la page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try { await self.registration.unregister(); } catch (e) {}
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    try {
      const list = await self.clients.matchAll({ type: 'window' });
      list.forEach((c) => c.navigate(c.url));
    } catch (e) {}
  })());
});
`;

for (const dir of ['dist', 'build', 'out']) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/index.html`, html);
  fs.writeFileSync(`${dir}/404.html`, html);
  fs.writeFileSync(`${dir}/sw.js`, sw);
}

console.log('Page de redirection générée dans dist/, build/ et out/.');
