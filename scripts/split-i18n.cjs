// Découpe `public/i18n.js` (trois langues) en un fichier par langue.
//
// Pourquoi : le fichier unique pèse 60 Ko minifié. Un téléphone en 3G
// téléchargeait l'arabe et l'anglais pour afficher du français. Désormais le
// français est chargé avec la page, les deux autres seulement si on les choisit.
//
// Ce script n'a servi qu'une fois : les fichiers produits sont les nouvelles
// sources. Il reste là pour expliquer d'où ils viennent.
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const source = fs.readFileSync(path.join(PUBLIC, 'i18n.js'), 'utf8');

function block(marker) {
  const i = source.indexOf(marker);
  if (i < 0) throw new Error('bloc absent : ' + marker);
  const start = source.indexOf('{', i);
  let depth = 0;
  let quote = null;
  for (let j = start; j < source.length; j += 1) {
    const c = source[j];
    if (quote) {
      if (c === '\\') { j += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(start, j + 1); }
  }
  throw new Error('bloc non fermé : ' + marker);
}

const langs = { fr: block('  fr: {'), en: block('  en: {'), ar: block('  ar: {') };

fs.writeFileSync(path.join(PUBLIC, 'i18n.js'), `/* Textes français de l'interface. Chargés avec la page.
   L'anglais et l'arabe vivent dans i18n-en.js et i18n-ar.js : ils ne sont
   téléchargés que si on les choisit. Les trois fichiers doivent avoir les mêmes
   clés — un test le vérifie. */
const I18N = { fr: ${langs.fr} };
const LANGS = [{ id: 'fr', label: 'FR' }, { id: 'en', label: 'EN' }, { id: 'ar', label: 'ع' }];
`);

fs.writeFileSync(path.join(PUBLIC, 'i18n-en.js'), `/* Textes anglais de l'interface. Chargé seulement si l'anglais est choisi. */
I18N.en = ${langs.en};
`);

fs.writeFileSync(path.join(PUBLIC, 'i18n-ar.js'), `/* Textes arabes de l'interface. Chargé seulement si l'arabe est choisi. */
I18N.ar = ${langs.ar};
`);

for (const [id, body] of Object.entries(langs)) {
  console.log(`✓ ${id} : ${(body.length / 1024).toFixed(0)} Ko de source`);
}
