# Edge functions Supabase — module IA

## `ai-proxy`

Proxy sécurisé entre l'application et l'API Claude (Anthropic). La clé API
reste un secret côté serveur — elle n'est jamais incluse dans le bundle client.

### Déploiement (Dashboard Supabase, clic-par-clic)

1. **Créer une clé API Anthropic**
   - Va sur https://console.anthropic.com → *API Keys* → *Create Key*.
   - Copie la clé (commence par `sk-ant-...`). Garde-la de côté, ne la commite jamais.

2. **Créer l'edge function**
   - Supabase Dashboard → projet `samperconsulting-app` → **Edge Functions**.
   - **Deploy a new function** → nom exact : `ai-proxy`.
   - Colle le contenu de `supabase/functions/ai-proxy/index.ts` dans l'éditeur.
   - **Deploy**.
   - Laisse l'option *Verify JWT* **activée** (défaut) : seuls les utilisateurs
     connectés peuvent appeler la fonction.

3. **Configurer les secrets**
   - Edge Functions → **Manage secrets** (ou *Secrets*).
   - Ajoute : `ANTHROPIC_API_KEY` = la clé de l'étape 1.
   - (Optionnel) `AI_MODEL` = id d'un modèle Claude récent et compatible vision,
     si tu veux fixer un modèle précis. Sans ce secret, le défaut du code est
     utilisé — voir `DEFAULT_MODEL` dans `index.ts`.
   - `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont injectés automatiquement, rien à faire.

4. **Vérifier**
   - Dans l'app, le module d'import de recettes propose désormais l'option
     « Photo ». Importe une photo de recette : si la fonction répond, l'OCR
     fonctionne. Sinon, voir les logs : Edge Functions → `ai-proxy` → *Logs*.

### Coût

Chaque analyse de photo = un appel au modèle (~0,01–0,03 USD selon la taille
de l'image et la longueur de la recette). Surveille la consommation sur
console.anthropic.com.

### Tâches supportées

| Tâche         | Phase | Description                                  |
|---------------|-------|----------------------------------------------|
| `ocr-recipe`  | 1     | Extraction d'une recette depuis une image    |

Les phases suivantes (génération HACCP, détection d'allergènes, suggestions
de complétion) ajouteront de nouvelles tâches à la même fonction.
