# Brief — Intégration IA dans l'application Samper Consulting

Sprint 4 · Chantier 4 · Document de cadrage (aucun code, préparation d'un sprint IA futur).

Ce document prépare l'intégration d'une IA dans l'application. Il est conçu pour qu'un
futur « Sprint IA » puisse démarrer sans cadrage supplémentaire. Il croise les besoins
réels constatés sur les chantiers 1 à 3 du Sprint 4.

---

## Section 1 — Cas d'usage potentiels identifiés

### 1.1 — OCR + parsing intelligent des photos de recettes papier

- **Besoin** : prolonge le Chantier 2. Le module d'import gère PDF texte, Excel et CSV ;
  les recettes photographiées ou scannées (PDF image) ne sont pas exploitables. Un
  message « image scannée, conversion IA prochainement » est déjà affiché.
- **Stack possible** : Anthropic Claude (vision), OpenAI GPT-4o (vision), Google Cloud Vision.
- **Workflow** : photo uploadée → l'API vision extrait le texte et la structure
  (titre / ingrédients / étapes) → `UnitParser` normalise les unités → écran
  `ImportPreview` existant pour validation utilisateur.
- **Coût estimé** : ~0,01 USD par photo selon le fournisseur.
- **Complexité** : faible — les API existent, le pipeline d'aval (UnitParser, preview) est déjà en place.

### 1.2 — Auto-matching sémantique avancé

- **Besoin** : prolonge le Chantier 3. Le matching actuel (exact / Levenshtein / Jaccard)
  échoue sur les écarts sémantiques (« blanc de volaille » vs « escalope de poulet »).
- **Stack possible** : embeddings via OpenAI `text-embedding-3-small` + recherche
  vectorielle Supabase `pgvector`.
- **Workflow** : embeddings de tous les produits du catalogue stockés en base. Au
  matching, embedding de l'ingrédient recherché + similarité cosinus. Sert de 4ᵉ passe
  après l'algorithme actuel.
- **Coût estimé** : ~0,001 USD par recherche.
- **Complexité** : moyenne — intégration de `pgvector`.

### 1.3 — Suggestions de complétion intelligentes pendant la saisie

- **Besoin** : confort de saisie dans l'éditeur de recettes (Chantier 1).
- **Stack possible** : LLM léger (Claude Haiku, GPT-4o-mini) avec pour contexte le
  catalogue et les recettes existantes de l'établissement.
- **Workflow** : suggestions d'ingrédients / d'étapes au fil de la frappe, basées sur
  les habitudes de l'établissement.
- **Coût estimé** : ~0,005 USD par recette complétée.
- **Complexité** : moyenne.

### 1.4 — Génération automatique de fiches HACCP à partir d'une recette

- **Besoin** : la rédaction HACCP est aujourd'hui chronophage. Fort impact métier.
- **Stack possible** : LLM avec prompt structuré (Claude Sonnet).
- **Workflow** : recette créée → bouton « Générer fiche HACCP » → le LLM identifie les
  points critiques et propose un plan de contrôle, validé par l'utilisateur.
- **Coût estimé** : ~0,05 USD par fiche.
- **Complexité** : moyenne-élevée (prompt engineering, validation métier).

### 1.5 — Génération de variantes de recettes

- **Besoin** : décliner une recette (sans gluten, végétarien, sans lactose, portions
  différentes).
- **Stack possible** : LLM avec la recette source en contexte (Claude Sonnet / Haiku).
- **Workflow** : recette source → bouton « Créer une variante… » → le LLM propose des
  substitutions, validées par l'utilisateur.
- **Coût estimé** : ~0,02 USD par variante.
- **Complexité** : faible.

---

## Section 2 — Recommandations stratégiques

- **Fournisseur à privilégier** : **Anthropic (Claude API)** pour la cohérence avec
  l'écosystème Samper (déjà outillé avec Claude Code). Solution de repli : OpenAI pour
  la vision (souvent plus rapide sur l'OCR).
- **Modèles selon le cas** :
  - Vision / OCR : Claude Sonnet (vision) **ou** OpenAI `gpt-4o`.
  - Embeddings : OpenAI `text-embedding-3-small` (peu coûteux, performant).
  - LLM texte : Claude Sonnet (qualité, HACCP) **ou** Claude Haiku (vitesse + coût bas,
    complétion et variantes).
- **Architecture recommandée** : **edge functions Supabase** pour appeler les API IA.
  Les clés ne sont jamais exposées côté client ; les fonctions servent de proxy et
  centralisent le rate-limiting et la journalisation.
- **Budget mensuel estimé** : **20 à 50 USD** pour un usage modéré (Jérémy + 2-3
  établissements clients).
- **RGPD / protection des données** : les recettes peuvent contenir des données
  confidentielles client. Privilégier les fournisseurs qui **ne réutilisent pas les
  données d'API pour l'entraînement** (c'est le cas d'Anthropic et d'OpenAI sur leurs
  offres API). Documenter ce point dans les CGU clients.

---

## Section 3 — Priorisation suggérée

Ordre de mise en œuvre recommandé pour le futur Sprint IA :

1. **Embeddings + matching sémantique** (§1.2) — quick win, peu coûteux, gain quotidien,
   prolonge directement le Chantier 3.
2. **OCR des photos de recettes papier** (§1.1) — débloque un cas d'usage déjà
   identifié et matérialisé dans l'UI (message « prochainement »).
3. **Suggestions de complétion** (§1.3) — confort de saisie.
4. **Génération de fiches HACCP** (§1.4) — fort impact métier (gain de temps important).
5. **Génération de variantes** (§1.5) — confort, à arbitrer selon le besoin réel.

---

## Section 4 — Préparation technique en amont

À faire **sans coder l'IA maintenant**, pour préparer le terrain :

- **pgvector** : vérifier / activer l'extension `pgvector` sur le projet Supabase
  (`CREATE EXTENSION IF NOT EXISTS vector;`). Nécessaire pour §1.2.
- **Variables d'environnement** : préparer `ANTHROPIC_API_KEY` et `OPENAI_API_KEY`
  (laissées vides pour l'instant, renseignées au Sprint IA). Ne jamais les exposer
  côté client — uniquement dans les edge functions Supabase.
- **Schéma recettes** : prévoir un champ `embedding_vector` (nullable, type `vector`),
  rempli au Sprint IA. Idem côté `produits` pour le matching sémantique.
- **Points d'extension dans le code** : marquer les emplacements d'intégration future
  par des commentaires `// AI_HOOK:` (ex : pipeline d'import pour l'OCR, service de
  matching pour la passe sémantique, éditeur pour la complétion).

---

## Section 5 — Risques à anticiper

- **Dérive des coûts** : prévoir un rate-limiter avec budget mensuel par utilisateur,
  géré dans les edge functions. Journaliser chaque appel (coût, modèle, utilisateur).
- **Latence** : un appel LLM prend 1 à 5 secondes. Toujours en asynchrone, jamais
  bloquer l'UI ; afficher un état de chargement explicite.
- **Hallucinations** : pour les unités et quantités, **toujours faire valider par
  l'utilisateur**. Ne jamais faire confiance aveuglément à l'IA — réutiliser les écrans
  de prévisualisation / validation déjà construits (`ImportPreview`, `AmbiguousMatchReview`).
- **Repli (fallback)** : si l'IA ne répond pas (timeout, erreur, budget épuisé),
  l'application doit continuer à fonctionner normalement, sans dégrader l'expérience
  principale. L'IA est un confort, jamais un point de défaillance unique.
