// Petit serveur de redirection pour Render.
// Il ne contient aucune donnée : il envoie simplement vers l'application
// hébergée sur Freebuff (Cloudflare Workers + base D1).
const http = require('node:http');

const TARGET = 'https://site-a48ebaa71ce945cc8ab9ac9be7f59aa8.freebuff.page';
const PORT = process.env.PORT || 10000;

const page = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0;url=${TARGET}">
  <title>Assistant Commercial</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f4ec;color:#14532d;padding:24px;text-align:center}
    a{color:#14532d;font-weight:700}
    p{max-width:32ch;line-height:1.6}
  </style>
</head>
<body>
  <div>
    <h1>Assistant Commercial</h1>
    <p>L'application a déménagé. <a href="${TARGET}">Ouvrir Assistant Commercial</a>.</p>
  </div>
</body>
</html>`;

http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }
  res.writeHead(302, {
    Location: TARGET,
    'Cache-Control': 'no-store',
    'content-type': 'text/html; charset=utf-8',
  });
  res.end(page);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Redirection vers ${TARGET} sur le port ${PORT}`);
});
