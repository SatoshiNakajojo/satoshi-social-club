/**
 * Publie la build web à la racine du dépôt `satoshi-social-club`, d'où GitHub
 * Pages la sert à l'adresse `https://<compte>.github.io/satoshi-social-club/`.
 *
 * La source vit à côté, dans `app/` : la publication ne touche qu'aux fichiers
 * du site (voir `publish-root.mjs`). Tout est d'abord préparé et vérifié dans
 * un dossier à part ; la racine n'est modifiée qu'une fois la publication jugée
 * bonne. Sinon `decorateDir`, qui parcourt tous les `.html` d'un dossier,
 * réécrirait aussi les gabarits de courriel de `app/supabase/templates/`.
 *
 * Le script **vérifie** ce qu'il publie : si un document sortait sans ses
 * balises PWA, l'app cesserait d'être installable sans que rien ne le signale,
 * jusqu'à ce qu'un membre se retrouve avec un marque-page. Mieux vaut échouer
 * ici.
 *
 * Il ne commite rien : à vous de relire puis de pousser.
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decorateDir, htmlFiles } from './decorate-web.mjs';
import { REPO_ROOT, siteEntries } from './publish-root.mjs';
import { missingTags } from './pwa-head.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');

if (!existsSync(DIST)) {
  console.error('dist/ est absent — lancez d’abord `npm run build:web`.');
  process.exit(1);
}

// --- Préparation, à l'écart de la racine -------------------------------------

const STAGE = mkdtempSync(path.join(os.tmpdir(), 'club-publication-'));
cpSync(DIST, STAGE, { recursive: true });

// `build:web` a normalement déjà fait ce travail sur `dist/` ; on le refait
// ici parce qu'une publication doit être complète quoi qu'il se soit passé
// avant elle, et que les injections sont idempotentes.
const injected = decorateDir(STAGE);

/**
 * GitHub Pages n'a pas de réécriture d'URL : sans ce fichier, ouvrir
 * `/satoshi-social-club/oracle` directement donne un 404. Le 404 sert la
 * coquille, et le routeur reprend la main côté client.
 */
cpSync(path.join(STAGE, 'index.html'), path.join(STAGE, '404.html'));

/** `.nojekyll` : sans lui, GitHub Pages ignore les dossiers commençant par `_`
 *  — ce qui est exactement le cas de `_expo/static/`, donc de tout le bundle. */
writeFileSync(path.join(STAGE, '.nojekyll'), '');

// --- Vérification, avant de toucher à quoi que ce soit ----------------------

const missing = missingTags(readFileSync(path.join(STAGE, 'index.html'), 'utf8'));
if (missing.length > 0) {
  console.error('\nLe document publié n’est pas installable. Balises manquantes :');
  for (const tag of missing) console.error(`  · ${tag}`);
  console.error('\nRien n’a été publié — corrigez avant de recommencer.');
  rmSync(STAGE, { recursive: true, force: true });
  process.exit(1);
}

for (const asset of ['manifest.json', 'sw.js', 'apple-touch-icon.png', 'icon-512.png']) {
  if (!existsSync(path.join(STAGE, asset))) {
    console.error(`\n${asset} est absent de la publication. Rien n’a été publié.`);
    rmSync(STAGE, { recursive: true, force: true });
    process.exit(1);
  }
}

// --- Publication : on remplace le site, et lui seul -------------------------

// On vide l'ancien site : un bundle à empreinte laissé derrière ferait grossir
// le dépôt à chaque déploiement.
for (const name of siteEntries()) rmSync(path.join(REPO_ROOT, name), { recursive: true, force: true });
cpSync(STAGE, REPO_ROOT, { recursive: true });
rmSync(STAGE, { recursive: true, force: true });

const pages = htmlFiles(REPO_ROOT).filter((f) => !f.startsWith(path.join(REPO_ROOT, 'app') + path.sep)).length;
console.log('Publié à la racine du dépôt (le site seul : app/, .github/ et le README intacts)');
console.log(`  ${pages} document(s) HTML, dont ${injected} complété(s) à la publication`);
console.log('  installable : oui');
console.log('\nRelisez, puis : git add -A && git commit && git push');
