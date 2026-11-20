// Réduit le poids des scripts servis au téléphone.
// esbuild est déjà installé avec wrangler : aucune dépendance en plus.
//
// Pourquoi : app.js et i18n.js sont livrés tels qu'écrits, commentaires et
// indentation compris. Les minifier allège le premier chargement sans rien
// changer au comportement. Les fichiers source restent la référence (tests,
// lecture) ; index.html sert les versions .min.js.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const FILES = ['i18n.js', 'i18n-en.js', 'i18n-ar.js', 'app.js'];
/* charset utf8 : les accents, l'arabe et les emojis restent lisibles dans le
   fichier au lieu d'être transformés en séquences \uXXXX. */
const OPTIONS = { minify: true, target: 'es2020', charset: 'utf8', legalComments: 'none' };

function minifiedName(file) {
    return file.replace(/\.js$/, '.min.js');
}

function build(publicDir = PUBLIC) {
    const out = {};
    for (const file of FILES) {
        const source = fs.readFileSync(path.join(publicDir, file), 'utf8');
        out[minifiedName(file)] = esbuild.transformSync(source, OPTIONS).code;
    }
    return out;
}

function write(publicDir = PUBLIC) {
    const result = build(publicDir);
    for (const [file, code] of Object.entries(result)) {
        fs.writeFileSync(path.join(publicDir, file), `/* ${file.replace('.min.js', '.js')} minifié — source : public/${file.replace('.min.js', '.js')} */\n${code}`);
    }
    return result;
}

if (require.main === module) {
    const result = write();
    for (const [file, code] of Object.entries(result)) {
        const source = fs.statSync(path.join(PUBLIC, file.replace('.min.js', '.js'))).size;
        console.log(`${file} : ${Math.round(source / 1024)} Ko → ${Math.round(code.length / 1024)} Ko`);
    }
}

module.exports = { build, write, minifiedName, FILES, OPTIONS };
