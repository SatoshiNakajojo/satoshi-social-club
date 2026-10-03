# Dépôt `satoshi-social-club`

- `app/` — la source (Expo, PWA, Supabase). Voir `app/AGENTS.md` et `app/README.md`.
- La racine — le site construit, que GitHub Pages sert. On ne l'édite pas à la
  main : `npm run build:web && npm run deploy` (depuis `app/`) le régénère, et le
  workflow `deploy-club.yml` le fait à chaque push sur `main` touchant `app/`.
- `app/scripts/publish-root.mjs` dit ce qui, à la racine, n'est PAS le site
  (`app`, `.github`, `README.md`, `CLAUDE.md`…) : à tenir à jour si on ajoute un
  fichier de ce genre à la racine, sinon la publication l'effacerait.
- Dépôt **public** : aucune clé privée (service_role, VAPID privée) ne doit y
  entrer. Seules les variables `EXPO_PUBLIC_*` partent dans la build.
