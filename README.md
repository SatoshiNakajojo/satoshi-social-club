# Satoshi Social Club

Adresse : https://satoshinakajojo.github.io/satoshi-social-club/

| Où | Quoi |
|---|---|
| `app/` | **la source** — le projet Expo (PWA), sa doc (`app/README.md`, `app/docs/INSTALLATION.md`), Supabase |
| racine (`index.html`, `_expo/`, `assets/`, `sw.js`…) | **le site construit**, servi tel quel par GitHub Pages — ne pas le modifier à la main |
| `.github/workflows/deploy-club.yml` | le robot : à chaque push sur `main` qui touche `app/`, il contrôle, construit et republie le site à la racine |

La source vivait dans le dépôt `dashboard` (dossier `mobile/`) ; elle est ici
depuis octobre 2026, pour que `dashboard` ne garde que J.C. Global Investments.

Le robot a besoin, une fois, des variables **publiques** de la build dans les
secrets du dépôt : `cd app && npm run ci:secrets` (voir
`app/docs/INSTALLATION.md` §2.0). Sans elles il s'arrête avant de publier, et le
site garde sa version.
