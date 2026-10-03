/**
 * Où vit le site publié, et ce qui ne lui appartient PAS.
 *
 * Le dépôt `satoshi-social-club` est servi par GitHub Pages depuis sa racine :
 * le site construit y est publié, à côté de la source (`app/`). Publier, c'est
 * donc remplacer les fichiers du site à la racine — et jamais `app/`, `.github/`
 * ni le README, qui ne sont pas du site.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** La racine du dépôt : c'est elle que GitHub Pages sert. */
export const REPO_ROOT = path.join(HERE, '..', '..');

/** Ce qui, à la racine, n'est PAS le site publié. */
export const NOT_SITE = new Set(['app', '.git', '.github', 'README.md', 'CLAUDE.md', '.gitignore']);

/** Les entrées de la racine qui forment le site publié. */
export function siteEntries(root = REPO_ROOT) {
  return readdirSync(root).filter((name) => !NOT_SITE.has(name));
}
