// Génère les pages de présentation par langue : presentation.html (fr, écrite à
// la main), presentation-en.html et presentation-ar.html.
//
// Pourquoi des fichiers et pas une réécriture dans worker.js : les fichiers
// statiques sont servis avant le Worker, donc une route /presentation ne voit
// jamais la requête. Les liens partagés pointent donc vers une vraie page, avec
// sa vignette et sa langue écrites en dur — ce que WhatsApp lit sans JavaScript.
//
// `npm run cache` appelle ce script avant de générer le service worker.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

export const OG_LOCALES = { fr: 'fr_FR', en: 'en_US', ar: 'ar_SA' };

/* Réécrit les quatre balises qui dépendent de la langue. `lang` inconnu donne
   le français : un lien abîmé ne doit pas casser l'aperçu. */
export function variant(html, lang) {
  const l = OG_LOCALES[lang] ? lang : 'fr';
  const suffix = l === 'fr' ? '' : '-' + l;
  return String(html)
    .replace(/<html lang="[^"]*"/, `<html lang="${l}"${l === 'ar' ? ' dir="rtl"' : ''}`)
    .replace(/content="([^"]*)\/og(-en|-ar)?\.jpe?g"/, `content="$1/og${suffix}.jpg"`)
    .replace(/(<meta property="og:locale" content=")[^"]*"/, `$1${OG_LOCALES[l]}"`)
    .replace(/(<meta property="og:url" content="[^"]*\/)presentation(\.html)?"/, `$1presentation${suffix}"`);
}

function main() {
  const src = path.join(PUBLIC, 'presentation.html');
  const html = fs.readFileSync(src, 'utf8');
  let ok = true;
  for (const lang of ['en', 'ar']) {
    const out = path.join(PUBLIC, `presentation-${lang}.html`);
    const body = variant(html, lang);
    const image = (body.match(/og:image" content="[^"]*\/(og[^"]*)"/) || [])[1];
    if (image !== `og-${lang}.jpg`) {
      console.error(`✗ presentation-${lang}.html : vignette « ${image} » au lieu de og-${lang}.jpg`);
      ok = false;
      continue;
    }
    fs.writeFileSync(out, body);
    console.log(`✓ presentation-${lang}.html — ${image}, ${OG_LOCALES[lang]}`);
  }
  process.exit(ok ? 0 : 1);
}

/* Exécuté directement (`node scripts/presentation.mjs`), pas à l'import. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
