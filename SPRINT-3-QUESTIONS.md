# Sprint 3 — Questions ouvertes pour Jérémy

> Document remontant les points de décision que Claude Code n'a pas pu
> trancher en mode autonome et qui nécessitent validation produit.

## Q1 — Chantier 4 : "Upload PDF recettes" n'existe pas dans le code actuel

**Constat** : Le module Recettes (`src/modules/recettes/Recettes.jsx`) propose
uniquement l'**export** PDF (génération côté client via jsPDF + html2canvas).
Il n'existe **AUCUN bouton d'upload PDF** dans ce module.

**Endroits où l'upload PDF EXISTE bien** dans l'app :
- `src/modules/documents/Documents.jsx` (module Documents dédié, `<input accept="application/pdf,.pdf">`)
- `src/modules/factures/Factures.jsx` (envoi auto du PDF de facture vers le bucket)
- `src/modules/consultant-tools/CarteCreator.jsx` (upload du PDF de carte généré)

Tous trois utilisent `legacySB.db.uploadFile()` (dans `src/services/legacySupabase.js`),
**fonctionnel à la lecture du code** (pas de bug évident — gestion d'erreur,
rollback storage en cas de fail DB).

**3 hypothèses sur ce que tu voulais dire** :

### A. "Export PDF qui foire ou produit un PDF moche"
→ Adressé par **Chantier 5** de ce sprint (refonte design PDF).

### B. "Tu veux POUVOIR joindre un PDF à une recette" (nouvelle feature)
Cas d'usage : attacher une fiche technique fournisseur, scanner une vieille
recette papier, joindre un certificat AOP de produit, etc.
→ Si oui, c'est un nouveau chantier à scoper (table `recette_attachments`,
UI dans RecetteDetail, lien storage). Pas inclus dans Sprint 3 par défaut.

### C. "Le bug est ailleurs" (Documents, Factures, CarteCreator)
→ Si oui, indique-moi le scénario exact de reproduction et je débogue.

**En attendant ta réponse** : aucune modification de code dans le cadre du
Chantier 4. La code review confirme `uploadFile()` fonctionnel.

---

## Q2 — Chantier 7 : recettes partagées vs feature de duplication existante

**Constat** : Il existe déjà dans le code (livré dans un sprint précédent
ou par moi dans cette session) une feature "🔀 Dupliquer la recette vers…"
dans `RecetteDetail` qui copie une recette vers plusieurs établissements,
avec options (ingrédients/étapes/photos/prix/allergènes) et gestion de
conflit (rename/overwrite/skip).

Cette feature **n'est PAS un système de templates partagés** — elle crée
des copies indépendantes sans lien de parenté.

**Chantier 7 demande un vrai système de templates** avec :
- Table dédiée `recipe_templates` (séparée de `recipes`)
- Notion de "subscription" et de "re-sync" optionnel
- Le consultant publie / dépublie

**Question** : la duplication existante te suffit-elle pour cette release,
ou veux-tu absolument la sophistication templates+subscriptions ?

**Mon avis** : je recommande de **rester sur la duplication existante**
pour Sprint 3 (mature, testée) et de scoper le système templates en
Sprint 4 dédié. Le Chantier 7 livré dans cette PR sera donc :
- **Architecture doc** complète (`ARCHITECTURE-RECETTES-PARTAGEES.md`)
- **Pas de code** (la feature de duplication actuelle couvre le besoin
  minimal du Rucher d'Évolène cette semaine)

Si tu veux le code dans Sprint 3 quand même, ping-moi et je l'attaque.

---

## Q3 — Backup table `kit_items` avant DROP

**Constat** : Chantier 1 a supprimé le module Kit cuisinier mais la table
Supabase `kit_items` est **encore là**. Le script de drop est dans
`supabase/migrations/20260514_drop_kit_items.sql`.

**À faire de ton côté avant d'exécuter le drop** :
1. Vérifier le volume de données dans la table (Dashboard Supabase > Editor)
2. Si données présentes : exporter en JSON (Dashboard > Export > JSON),
   placer dans `backups/kit_items-export-2026-05-14.json`
3. Exécuter le SQL dans Dashboard > SQL Editor

Si tu préfères **garder la table** dormante (au cas où tu reviendrais sur
la décision), c'est OK aussi : l'UI est partie, la table sera juste ignorée.

---

## Q4 — Storage bucket : whitelist MIME à appliquer manuellement

**Constat** : Chantier 3 a renforcé le filtrage côté client (HEIC accepté,
SVG/PDF/GIF/TIFF rejetés pour les photos). Mais la whitelist côté Supabase
Storage **doit être appliquée manuellement** dans le Dashboard (Supabase ne
permet pas de la configurer via SQL — c'est un setting bucket).

**À faire** : Dashboard > Storage > documents > Edit bucket > Allowed MIME types →
coller : `image/jpeg, image/png, image/webp, image/heic, image/heif, application/pdf`

(`application/pdf` reste autorisé pour Documents/Factures/Cartes. La protection
côté client suffit pour bloquer un PDF uploadé comme photo de recette.)
