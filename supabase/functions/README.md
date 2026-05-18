# Edge functions Supabase — module IA

## `ai-proxy`

Proxy sécurisé entre l'application et le service IA — **multi-fournisseur :
Claude (Anthropic) ou OpenAI**, au choix via un secret. La clé API reste côté
serveur, jamais incluse dans le bundle client.

### Déploiement (Dashboard Supabase, clic-par-clic)

1. **Créer une clé API** chez le fournisseur choisi
   - Anthropic : https://console.anthropic.com → *API Keys* → *Create Key* (`sk-ant-...`).
   - OpenAI : https://platform.openai.com/api-keys → *Create new secret key* (`sk-...`).
   - Garde la clé de côté, ne la commite jamais.

2. **Créer l'edge function**
   - Supabase Dashboard → projet `samperconsulting-app` → **Edge Functions**.
   - **Deploy a new function** → nom exact : `ai-proxy`.
   - Colle le contenu de `supabase/functions/ai-proxy/index.ts` dans l'éditeur.
   - **Deploy**.
   - Laisse l'option *Verify JWT* **activée** (défaut) : seuls les utilisateurs
     connectés peuvent appeler la fonction.

3. **Configurer les secrets** (Edge Functions → **Manage secrets**)
   - `AI_PROVIDER` = `anthropic` (défaut) **ou** `openai`.
   - Selon le fournisseur : `ANTHROPIC_API_KEY` **ou** `OPENAI_API_KEY` = la clé
     de l'étape 1.
   - (Optionnel) `AI_MODEL` = id de modèle ; **doit correspondre au fournisseur**
     (ex. un modèle Claude si `AI_PROVIDER=anthropic`). Sans ce secret, un défaut
     par fournisseur est utilisé (voir `PROVIDERS` dans `index.ts`). Pour réduire
     le coût, mettre un modèle « mini / haiku ».
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` sont injectés automatiquement.

4. **Vérifier**
   - OCR : module d'import de recettes → option « Photo ».
   - Allergènes : éditeur de recette → carte Allergènes → bouton « Détecter (IA) ».
   - En cas d'erreur, voir les logs : Edge Functions → `ai-proxy` → *Logs*.

### Changer de fournisseur

Il suffit de modifier le secret `AI_PROVIDER` (et de fournir la clé
correspondante) puis de redéployer — aucun changement de code applicatif.

### Coût

Facturation au token chez les deux fournisseurs (aucun n'est gratuit ;
l'abonnement ChatGPT ne donne pas accès à l'API). Ordre de grandeur :
~0,01–0,03 USD par photo, ~0,002 USD par détection d'allergènes. Le levier
d'économie principal : choisir un petit modèle via `AI_MODEL`. Surveille la
consommation sur la console du fournisseur.

### Tâches supportées

| Tâche              | Phase | Description                                          |
|--------------------|-------|------------------------------------------------------|
| `ocr-recipe`       | 1     | Extraction d'une recette depuis une image            |
| `detect-allergens` | 2     | Déduction des allergènes depuis une liste d'ingrédients |

Les phases suivantes (génération HACCP, suggestions de complétion) ajouteront
de nouvelles tâches à la même fonction.
