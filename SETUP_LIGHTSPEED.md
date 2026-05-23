# Configuration Lightspeed POS

Guide de mise en production de l'intégration Lightspeed K-Series.

---

## Prérequis

- Accès au compte développeur Lightspeed du restaurant (propriétaire ou admin)
- Accès au dashboard Supabase du projet (`ppmtoiqgajwcdkbnrcll`)
- Rôle `consultant` ou `patron` dans l'application Samper

---

## Étape 1 — Portail développeur Lightspeed

**URL :** https://developers.lightspeedhq.com

1. Connecte-toi avec le compte propriétaire du restaurant
2. Crée une nouvelle application avec ces paramètres :

   | Paramètre    | Valeur |
   |---|---|
   | Redirect URI | `https://ppmtoiqgajwcdkbnrcll.supabase.co/functions/v1/pos-oauth` |
   | Scopes       | `financial-api offline_access` |

3. Note le **Client ID** et le **Client Secret** — tu en auras besoin à l'étape 2

---

## Étape 2 — Secrets Supabase

**Dashboard → Edge Functions → Manage secrets**

Ajoute ces 4 valeurs :

| Clé | Valeur |
|---|---|
| `LS_CLIENT_ID` | (Client ID du portail Lightspeed) |
| `LS_CLIENT_SECRET` | (Client Secret du portail Lightspeed) |
| `LS_REDIRECT_URI` | `https://ppmtoiqgajwcdkbnrcll.supabase.co/functions/v1/pos-oauth` |
| `LS_ENV` | `demo` (sandbox) ou `production` (données réelles) |

---

## Étape 3 — Connexion dans l'application

1. Dans l'app Samper : **Settings → Intégrations POS**
2. Cliquer **"Connecter Lightspeed"**
3. Autoriser l'accès sur le portail Lightspeed
4. La fenêtre se ferme automatiquement → statut "Connecté ✅"

---

## Étape 4 — Backfill initial (recommandé)

Après la connexion, cliquer **"Importer les 14 derniers jours"**.

Cela peuple `pos_sales` avec l'historique nécessaire pour :
- Vue 1 — Mise en place J+1 (prédictions basées sur l'historique DOW)
- Vue 2 — Top/Flop (comparaison semaine/période précédente)
- Vue 3 — Conso ingrédients (volumes sur une période)

---

## Variantes Lightspeed supportées

| Variante | Statut |
|---|---|
| K-Series (Restaurant, cloud) | ✅ Supporté |
| L-Series (iKentoo) | À valider |
| Retail | ❌ Non supporté (scope différent) |

---

## Synchronisation automatique

Un cron Supabase tourne chaque nuit à 03h00 (heure CH) pour synchroniser
les ventes de la journée précédente.

---

## Dépannage

| Symptôme | Solution |
|---|---|
| Bouton "Connecter" désactivé | Vérifier que les 4 secrets Supabase sont configurés (LS_CLIENT_ID, LS_CLIENT_SECRET, LS_REDIRECT_URI, LS_ENV) |
| Erreur `invalid_client` | LS_CLIENT_ID ou LS_CLIENT_SECRET incorrect |
| Erreur `invalid_redirect_uri` | La Redirect URI dans le portail Lightspeed ne correspond pas à LS_REDIRECT_URI |
| Erreur `invalid_scope` | Ajouter `financial-api` et `offline_access` dans le portail Lightspeed |
| Statut "Erreur" après sync | Voir `pos_sync_logs` dans Supabase pour le détail de l'erreur |
| Token expiré | Cliquer "Reconnecter" dans Settings → Intégrations POS |

---

## Tables de données

| Table | Contenu |
|---|---|
| `pos_connections` | Connexions OAuth par établissement (tokens chiffrés côté serveur) |
| `pos_items` | Catalogue des plats POS (sync quotidienne) |
| `pos_sales` | Ventes agrégées par plat par jour |
| `pos_item_recipe_mapping` | Liens plats POS ↔ recettes Samper |
| `pos_sync_logs` | Journal des synchronisations |

*Dernière mise à jour : J5 — 2026-05-23*
