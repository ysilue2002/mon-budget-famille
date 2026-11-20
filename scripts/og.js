#!/usr/bin/env node
// Génère les vignettes d'aperçu des liens partagés : public/og.png (fr),
// public/og-en.png (en) et public/og-ar.png (ar), en 1200 × 630.
//
// Pourquoi un script : la vignette est une vraie page rendue par un navigateur,
// pas une image bricolée à la main. On la refait d'une commande quand le texte,
// les couleurs ou le domaine changent, et les trois langues restent alignées.
//
// `npm run og` — Chrome (ou Edge) doit être installé. Chemin imposé possible :
//   CHROME="C:\chemin\chrome.exe" npm run og
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const W = 1200;
const H = 630;

const CANDIDATES = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findBrowser() {
  const found = CANDIDATES.filter((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  if (!found.length) {
    console.error('Aucun navigateur trouvé. Installez Chrome/Edge ou passez CHROME="chemin".');
    process.exit(1);
  }
  return found[0];
}

/* Le texte de la vignette, langue par langue. Les quatre mots clés sont ceux
   que comprend un commerçant, pas des noms de fonctionnalités. */
const PAGES = {
  fr: {
    out: 'og.png',
    dir: 'ltr',
    name: 'Assistant<br><span>Commercial</span>',
    pill: 'Français · English · العربية',
    text: 'Votre boutique dans votre poche,<br>même sans réseau.',
    chips: ['Vendre', 'Stock', 'Crédits', 'Bénéfice'],
    shop: 'Ma boutique',
    big: '47 500 FCFA',
    sub: "Ventes d'aujourd'hui",
    tiles: [['12', 'ventes'], ['8 000', 'à encaisser'], ['3', 'en stock bas'], ['0', 'à livrer']],
    cta: '＋ Nouvelle vente',
  },
  en: {
    out: 'og-en.png',
    dir: 'ltr',
    name: 'Assistant<br><span>Commercial</span>',
    pill: 'English · Français · العربية',
    text: 'Your shop in your pocket,<br>even without network.',
    chips: ['Sell', 'Stock', 'Credits', 'Profit'],
    shop: 'My shop',
    big: '47 500 FCFA',
    sub: "Today's sales",
    tiles: [['12', 'sales'], ['8 000', 'to collect'], ['3', 'low stock'], ['0', 'to deliver']],
    cta: '＋ New sale',
  },
  ar: {
    out: 'og-ar.png',
    dir: 'rtl',
    name: 'المساعد<br><span>التجاري</span>',
    pill: 'العربية · Français · English',
    text: 'متجرك في جيبك،<br>حتى بلا إنترنت.',
    chips: ['بيع', 'مخزون', 'ديون', 'ربح'],
    shop: 'متجري',
    big: '47 500 CFA',
    sub: 'مبيعات اليوم',
    tiles: [['12', 'مبيعات'], ['8 000', 'للتحصيل'], ['3', 'مخزون منخفض'], ['0', 'للتسليم']],
    cta: '＋ بيع جديد',
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function html(lang) {
  const p = PAGES[lang];
  const rtl = p.dir === 'rtl';
  return `<!doctype html>
<html lang="${lang}" dir="${p.dir}">
<head>
<meta charset="utf-8">
<title>Assistant Commercial — ${lang}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  /* Les halos débordent volontairement : sans ça, une page en arabe s'ouvre
     décalée de la largeur du débordement et la capture est coupée. */
  html { width: ${W}px; height: ${H}px; overflow: hidden; }
  /* Les halos sont coupés par leur propre boîte : aucun débordement ne peut
     décaler la capture, surtout en arabe où le navigateur s'aligne à droite. */
  .bg { position: absolute; inset: 0; overflow: hidden; }
  body {
    width: ${W}px; height: ${H}px; overflow: hidden; background: #0d3b22; color: #fff;
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, Tahoma, sans-serif;
    direction: ${p.dir};
  }
  .glow { position: absolute; border-radius: 50%; background: radial-gradient(circle, rgba(52,211,153,.35), rgba(52,211,153,0) 70%); }
  .g1 { width: 900px; height: 900px; inset-inline-end: -300px; top: -380px; }
  .g2 { width: 700px; height: 700px; inset-inline-start: -260px; bottom: -380px; opacity: .7; }
  /* Grille explicite : la vignette arabe se contente d'échanger les deux
     colonnes, sans dépendre de l'ordre du document ni du sens de lecture. */
  .wrap {
    position: absolute; inset: 0; padding: 64px 72px; display: grid; gap: 40px; align-items: center;
    direction: ltr; grid-template-columns: ${rtl ? '286px minmax(0, 1fr)' : 'minmax(0, 1fr) 286px'};
  }
  .left { min-width: 0; direction: ${p.dir}; text-align: ${rtl ? 'right' : 'left'}; ${rtl ? 'grid-column: 2;' : ''} }
  .phone { ${rtl ? 'grid-column: 1; grid-row: 1;' : ''} }
  .pill {
    display: inline-block; padding: 10px 18px; border-radius: 999px; font-size: 22px; font-weight: 600;
    background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.28);
  }
  h1 { margin-top: 26px; font-size: 76px; line-height: 1.02; letter-spacing: -1.5px; font-weight: 800; }
  h1 span { color: #6ee7a8; }
  p { margin-top: 22px; font-size: 30px; line-height: 1.3; color: #d7eadc; max-width: 560px; }
  .chips { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; }
  .chip {
    padding: 10px 18px; border-radius: 12px; font-size: 22px; font-weight: 600;
    background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18);
  }
  .phone {
    width: 286px; height: 462px; border-radius: 40px; padding: 12px;
    background: #082514; border: 3px solid rgba(255,255,255,.22);
    box-shadow: 0 40px 80px rgba(0,0,0,.45); transform: rotate(-5deg);
  }
  .screen { height: 100%; border-radius: 32px; background: #f7f4ea; padding: 22px 18px; color: #14261b; }
  .shop { font-size: 15px; font-weight: 700; color: #14532d; text-transform: uppercase; letter-spacing: .6px; }
  .big { font-size: 34px; font-weight: 800; margin-top: 8px; text-align: ${rtl ? 'right' : 'left'}; }
  .sub { font-size: 14px; color: #5b6b60; margin-top: 2px; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }
  .tile { background: #fff; border: 1px solid #d9e5db; border-radius: 14px; padding: 12px; }
  .tile b { display: block; font-size: 19px; color: #14532d; text-align: ${rtl ? 'right' : 'left'}; }
  .tile small { font-size: 12px; color: #5b6b60; }
  .cta { margin-top: 18px; border-radius: 14px; background: #14532d; color: #fff; text-align: center; padding: 15px; font-size: 19px; font-weight: 700; }
</style>
</head>
<body>
  <div class="bg"><div class="glow g1"></div><div class="glow g2"></div></div>
  <div class="wrap">
    <div class="left">
      <div class="pill">${esc(p.pill)}</div>
      <h1>${p.name}</h1>
      <p>${p.text}</p>
      <div class="chips">${p.chips.map((c) => `<div class="chip">${esc(c)}</div>`).join('')}</div>
    </div>
    <div class="phone">
      <div class="screen">
        <div class="shop">${esc(p.shop)}</div>
        <div class="big" dir="ltr">${esc(p.big)}</div>
        <div class="sub">${esc(p.sub)}</div>
        <div class="tiles">${p.tiles.map(([b, s]) => `<div class="tile"><b dir="ltr">${esc(b)}</b><small>${esc(s)}</small></div>`).join('')}</div>
        <div class="cta">${esc(p.cta)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* Largeur et hauteur lues dans l'en-tête PNG : une capture ratée (page vide,
   mauvaise taille) doit échouer bruyamment, pas être publiée. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.toString('latin1', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function render(browser, lang) {
  const p = PAGES[lang];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-og-'));
  try {
    const src = path.join(tmp, 'og.html');
    fs.writeFileSync(src, html(lang));
    const out = path.join(PUBLIC, p.out);
    const run = spawnSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--force-device-scale-factor=1', `--window-size=${W},${H}`,
      `--user-data-dir=${path.join(tmp, 'profil')}`,
      `--screenshot=${out}`, pathToFileURL(src).href,
    ], { stdio: 'ignore', timeout: 120000 });
    if (!fs.existsSync(out)) {
      console.error(`✗ ${p.out} : le navigateur n'a rien écrit (code ${run.status}).`);
      return false;
    }
    const size = pngSize(out);
    if (!size || size.w !== W || size.h !== H) {
      console.error(`✗ ${p.out} : taille ${size ? size.w + '×' + size.h : 'inconnue'}, attendu ${W}×${H}.`);
      return false;
    }
    const ko = Math.round(fs.statSync(out).size / 1024);
    console.log(`✓ ${p.out} — ${size.w}×${size.h}, ${ko} Ko`);
    return true;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const browser = findBrowser();
console.log(`Navigateur : ${browser}`);
const ok = Object.keys(PAGES).map((lang) => render(browser, lang));
process.exit(ok.every(Boolean) ? 0 : 1);
