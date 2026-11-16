// Pipeline des icônes d'installation (PWA) — `npm run icons`.
//
// Source : docs/logo-source.webp (l'image fournie par la boutique). Elle contient
// la tuile carrée du logo ET le mot « ASSISTANT COMMERCIAL » en dessous : une
// icône ne doit contenir que la tuile, le nom est affiché par le système.
//
// Géométrie mesurée sur la source 1408x768 : tuile du logo carrée, 365 px de
// côté, coin supérieur gauche en (519, 186). Ces trois nombres sont les seuls
// à ajuster si le logo change de cadrage.
//
// Sorties dans public/icons/ :
//   icon-192.png            Android (écran d'accueil) et favicon
//   icon-512.png            écrans haute densité et écran de démarrage
//   icon-512-maskable.png   Android qui découpe l'icône en cercle / squircle
//   apple-touch-icon.png    iOS (fond opaque, coins arrondis par le système)
//
// La version « maskable » réduit le logo à 86 % du carré et le centre sur le
// bleu du logo : le dessin reste dans les 80 % centraux que le système garantit
// de ne pas rogner. Les autres gardent la tuile pleine, c'est le système qui
// applique son masque.
//
// Encodage : PNG truecolor (pas de palette) pour éviter tout aplat dans le
// dégradé du logo ; les icônes pèsent donc ~500 Ko à elles quatre, ce qui est
// le prix de la fidélité du logo. Après génération : `npm run cache` (le
// service worker embarque les icônes, donc change de version).
const fs = require('node:fs');
const path = require('node:path');

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('Ce script a besoin de sharp : npm install --save-dev sharp');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const SRC = path.resolve(ROOT, arg('source', 'docs/logo-source.webp'));
const OUT = path.resolve(ROOT, arg('out', 'public/icons'));
const TILE = { left: 519, top: 186, size: 365 };
const MASKABLE_RATIO = 440 / 512; // 86 % : contenu dans la zone sûre de 80 %
const BG = { r: 24, g: 56, b: 104, alpha: 1 }; // bleu dominant de la tuile
/* Truecolor, sans palette. Ne pas ajouter `effort: 10` : à cette valeur sharp
   tente une quantification en palette (colorType 3) et le dégradé du logo
   s'aplatit. Vérifié : sans `effort`, colorType 2. */
const PNG = { compressionLevel: 9, palette: false };

const cropTile = (margin = 0) => {
  const m = Math.round(TILE.size * margin);
  return sharp(SRC).extract({ left: TILE.left - m, top: TILE.top - m, width: TILE.size + m * 2, height: TILE.size + m * 2 });
};

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Logo introuvable : ${path.relative(ROOT, SRC)}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const tile = await cropTile().png(PNG).toBuffer();
  const big = Math.round(512 * MASKABLE_RATIO);
  const inner = await sharp(tile).resize(big, big).png(PNG).toBuffer();

  await sharp(tile).resize(512, 512).png(PNG).toFile(path.join(OUT, 'icon-512.png'));
  await sharp(tile).resize(192, 192).png(PNG).toFile(path.join(OUT, 'icon-192.png'));
  await sharp(tile).resize(180, 180).flatten({ background: BG }).png(PNG).toFile(path.join(OUT, 'apple-touch-icon.png'));
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
    .composite([{ input: inner, gravity: 'center' }])
    .png(PNG)
    .toFile(path.join(OUT, 'icon-512-maskable.png'));

  for (const f of ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png']) {
    const meta = await sharp(path.join(OUT, f)).metadata();
    const ko = Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
    console.log(`${f} ${meta.width}x${meta.height} ${ko} Ko${meta.paletteBitDepth ? ' PALETTE' : ''}`);
  }
  console.log('Pense à relancer `npm run cache` : les icônes font partie du préchargement.');
})();
