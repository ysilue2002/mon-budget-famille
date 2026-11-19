// Génère public/sw.js et public/version.json à partir de public/.
// Aucune dépendance : `node scripts/cache.js` (ou `npm run cache`).
//
// Pourquoi générer : la version du cache et la liste des fichiers préchargés
// étaient tenues à la main. Un fichier oublié ou une version non incrémentée
// laissait une boutique sur une vieille version de l'application.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const TEMPLATE = path.join(__dirname, 'sw.template.js');

/* sw.js est le produit de ce script ; version.json est lu par l'application
   (ne pas hacher un fichier qui contient la version : la boucle tournerait). */
const EXCLUDE = new Set(['sw.js', 'version.json']);
const INCLUDED = /\.(html|css|js|webmanifest|png|svg|ico|woff2?)$/i;
/* Fichiers figés (bibliothèques, icônes) : servis depuis le cache d'abord,
   ils ne changeront pas avant une nouvelle version du cache. */
const CACHE_FIRST = /^(qrcode\.js|jspdf\.umd\.min\.js|icons\/)/;
/* Icônes que seul le système lit, à l'installation ou à l'ajout à l'écran
   d'accueil — toujours en ligne. Les précharger coûtait 450 Ko au premier
   lancement pour des images que l'application n'affiche jamais. */
const NOT_PRECACHED = new Set([
    'icons/icon-512.png',
    'icons/icon-512-maskable.png',
    'jspdf.umd.min.js', // chargés à la demande, puis gardés par le cache de service
    'qrcode.js',
]);

function walk(dir, base = '') {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return walk(path.join(dir, entry.name), rel);
        return [rel];
    });
}

function listFiles(publicDir = PUBLIC) {
    return walk(publicDir)
        .filter((rel) => INCLUDED.test(rel) && !EXCLUDE.has(rel))
        .sort();
}

function listPrecache(publicDir = PUBLIC) {
    const files = listFiles(publicDir).filter((f) => !NOT_PRECACHED.has(f));
    return { files, urls: ['./', ...files.map((f) => `./${f}`)] };
}

function versionOf(files, publicDir = PUBLIC) {
    const h = crypto.createHash('sha256');
    for (const rel of files) {
        h.update(rel);
        h.update('\0');
        h.update(crypto.createHash('sha256').update(fs.readFileSync(path.join(publicDir, rel))).digest());
    }
    return h.digest('hex').slice(0, 10);
}

function build(publicDir = PUBLIC) {
    const { files, urls } = listPrecache(publicDir);
    /* La version couvre aussi les icônes non préchargées : les changer doit
       renouveler le cache. */
    const version = versionOf(listFiles(publicDir), publicDir);
    const cacheFirst = urls.filter((u) => CACHE_FIRST.test(u.replace(/^\.\//, '')));
    const out = fs
        .readFileSync(TEMPLATE, 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(urls, null, 2))
        .replace('__CACHE_FIRST__', JSON.stringify(cacheFirst, null, 2));
    const bytes = files.reduce((a, rel) => a + fs.statSync(path.join(publicDir, rel)).size, 0);
    const meta = { version, files: urls.length, bytes };
    return { out, meta, urls, files, bytes, version };
}

function write() {
    const r = build();
    fs.writeFileSync(path.join(PUBLIC, 'sw.js'), r.out);
    fs.writeFileSync(path.join(PUBLIC, 'version.json'), JSON.stringify(r.meta) + '\n');
    return r;
}

if (require.main === module) {
    if (process.argv.includes('--check')) {
        const expected = build().out;
        const actual = fs.existsSync(path.join(PUBLIC, 'sw.js')) ? fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8') : '';
        if (expected !== actual) {
            console.error('public/sw.js est périmé : lance `npm run cache`.');
            process.exit(1);
        }
        console.log('public/sw.js est à jour.');
    } else {
        const r = write();
        console.log(`sw.js et version.json générés — version ${r.version}, ${r.urls.length} fichiers, ${Math.round(r.bytes / 1024)} Ko.`);
    }
}

module.exports = { build, write, listFiles, listPrecache, versionOf, PUBLIC };
