// ════════════════════════════════════════════════════════════════
// Edge function « ai-proxy » — proxy IA multi-fournisseur (Claude / OpenAI).
//
// La clé API reste 100 % côté serveur — jamais exposée au client. Le client
// appelle cette fonction avec son jeton de session Supabase ; la fonction
// vérifie l'authentification avant tout appel IA.
//
// Secrets (Supabase Dashboard → Edge Functions → Manage secrets) :
//   AI_PROVIDER         (optionnel) — 'anthropic' (défaut) | 'openai'
//   ANTHROPIC_API_KEY   (requis si provider = anthropic)
//   OPENAI_API_KEY      (requis si provider = openai)
//   AI_MODEL            (optionnel) — id de modèle ; doit correspondre au
//                       fournisseur choisi. Sinon défaut par fournisseur.
// SUPABASE_URL / SUPABASE_ANON_KEY sont injectés automatiquement.
//
// Tâches : 'ocr-recipe' (vision), 'detect-allergens', 'generate-haccp',
//          'suggest-recipe', 'match-product', 'generate-fiche-salle',
//          'parse-catalogue', 'dedupe-commande' (texte).
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PROVIDERS = {
  anthropic: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-5' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Lit un secret en retirant espaces et guillemets parasites éventuels
// (erreurs de copier-coller fréquentes dans le dashboard).
const env = (name: string): string | undefined => {
  const v = Deno.env.get(name);
  if (v == null) return undefined;
  return v.trim().replace(/^["']|["']$/g, '').trim();
};

// ── Consignes système par tâche ──
const OCR_SYSTEM = `Tu extrais des recettes de cuisine depuis une image (photo ou scan d'une fiche papier).
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format exact :
{"recipes":[{"nom":"...","categorie":"Plats","portions":4,"ingredients":[{"nom":"Farine","quantite":200,"unite":"g"}],"etapes":["Étape 1...","Étape 2..."]}]}
Règles :
- une image peut contenir plusieurs recettes (renvoie-les toutes dans "recipes")
- "categorie" parmi : Entrées, Plats, Desserts, Fromages, Sauces, Fonds, Amuse-bouches, Garnitures
- "quantite" est un nombre ; si non précisée, mets 0
- "unite" parmi : g, kg, ml, L, pcs, cs, cc, pincée — sinon l'unité la plus proche
- "portions" est un entier ; si absent, mets 4
- conserve la formulation des étapes le plus fidèlement possible
- si l'image ne contient aucune recette lisible, renvoie {"recipes":[]}`;

const ALLERGEN_SYSTEM = `Tu analyses la liste d'ingrédients d'une recette et identifies les allergènes réglementaires (UE) présents.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{"allergenes":["gluten","lactose"],"incertains":["soja"],"note":""}
- "allergenes" : identifiants des allergènes certainement présents
- "incertains" : identifiants possiblement présents selon la préparation (à vérifier)
- "note" : courte explication si utile (1 phrase max), sinon ""
Les identifiants doivent provenir EXCLUSIVEMENT de cette liste (n'en invente aucun) :
gluten, lactose, oeufs, poissons, crustaces, fruits_coque, sulfites, arachides, soja, celeri, moutarde, sesame, mollusques, lupin
Si aucun allergène, renvoie {"allergenes":[],"incertains":[],"note":""}.`;

const HACCP_SYSTEM = `Tu es un expert en sécurité alimentaire et méthode HACCP. À partir d'une recette (ingrédients + étapes), tu produis une analyse des dangers et des points de maîtrise.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{"points":[{"etape":"Cuisson","danger":"Survie de pathogènes","type":"biologique","mesure":"Cuisson à cœur","limiteCritique":"≥ 75°C à cœur","surveillance":"Sonde en fin de cuisson","ccp":true}],"conservation":"...","remarques":"..."}
Règles :
- "type" parmi : biologique, chimique, physique, allergène
- "ccp" : true si c'est un point critique pour la maîtrise (CCP), false sinon
- "limiteCritique" : valeur mesurable quand applicable (ex "≥ 63°C"), sinon ""
- "surveillance" : comment surveiller concrètement, sinon ""
- "conservation" : recommandation de conservation du produit fini
- "remarques" : conseils complémentaires (1 à 3 phrases)
- couvre les étapes sensibles : réception, stockage, préparation, cuisson, refroidissement, conservation
Base-toi sur les bonnes pratiques d'hygiène. Cette analyse est une aide à valider par un responsable.`;

const SUGGEST_SYSTEM = `Tu aides un chef à compléter une recette en cours de rédaction.
On te fournit le nom de la recette, sa catégorie, ses ingrédients et étapes actuels, et une liste de produits du catalogue.
Suggère UNIQUEMENT des AJOUTS pertinents — ingrédients manquants et étapes de préparation — sans jamais répéter l'existant.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{"ingredients":[{"nom":"Beurre","quantite":50,"unite":"g"}],"etapes":["Préchauffer le four à 180°C","..."]}
Règles :
- privilégie des ingrédients présents dans le catalogue fourni (reprends leur formulation)
- "unite" parmi : g, kg, ml, L, pcs, cs, cc, pincée
- "quantite" : estimation raisonnable pour la recette, sinon 0
- propose les étapes dans l'ordre logique de préparation
- reste sobre : 3 à 8 ingrédients et 3 à 8 étapes maximum
- si la recette paraît déjà complète, renvoie {"ingredients":[],"etapes":[]}`;

const MATCH_SYSTEM = `Tu rapproches un ingrédient de recette du produit le plus pertinent d'un catalogue.
On te donne le nom d'un ingrédient et une liste de produits (identifiant + nom).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :
{"produitId":"<id ou null>","confidence":85,"raison":"..."}
- "produitId" : l'identifiant EXACT d'un produit de la liste, ou null si aucun ne correspond raisonnablement
- "confidence" : entier 0-100 (ta certitude)
- "raison" : courte justification (1 phrase)
Ne retiens un produit que s'il s'agit bien du même ingrédient (variante proche acceptée :
"blanc de poulet" ↔ "escalope de poulet" = oui ; "poulet" ↔ "bouillon de poulet" = non).`;

const FICHE_SALLE_SYSTEM = `Tu es un expert de la restauration. À partir d'une recette, tu rédiges sa FICHE SALLE destinée à l'équipe de service pour conseiller les clients.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{"descriptionService":"...","temperatureService":"...","dressageNotes":"","infosService":"...","tempsPreparation":"...","accords":[{"type":"vin","nom":"...","region":"...","alternative":"...","notes":"..."}],"accordsGeneraux":["Vin rouge corsé","Vin blanc sec"]}
- "descriptionService" : Tu décris un plat pour un serveur de salle qui doit pouvoir l'expliquer à un client et répondre à ses questions.
  Règles :
  1. Mentionner la technique de cuisson et le temps si pertinent
  2. Citer les ingrédients principaux avec leur préparation exacte
  3. Inclure 1 détail concret qui distingue le plat
     (origine d'un produit, association inattendue, geste de finition)
  4. Zéro adjectif subjectif : interdit de dire "délicat", "savoureux",
     "raffiné", "généreux", "exquis", "subtil", "onctueux", "fin",
     "gourmand", "tendre", "riche", "parfait", "magnifique"
  5. Zéro phrase de compliment sur le plat
  6. 2 phrases. 40-55 mots. Ton direct, professionnel.
  EXEMPLES :
  Plat : Joue de bœuf, aubergine grillée, sarrasin soufflé, citron confit
  → "Joue de bœuf braisée 6h au vin rouge, effilochée, servie avec de l'aubergine grillée au feu et du sarrasin soufflé pour le croustillant. Le citron confit apporte une touche d'acidité qui équilibre la puissance de la viande."
  Plat : Filet de perche, poivron doux, citron vert, riz soufflé
  → "Filet de perche du lac poêlé à la minute, côté peau croustillant, accompagné de poivron doux confit et de riz soufflé. Quelques gouttes de citron vert finissent le plat devant vous."
  Plat : Caille rôtie, orge croustillante, fenouil, fromage frais herbes
  → "Caille entière rôtie 12 minutes, désossée en cuisine, servie sur un lit d'orge croustillante et de fenouil braisé. Le fromage frais aux herbes alpines est déposé à la dernière minute."
  Plat : Sérac croustillant, sauce herbes, basilic, jeunes pousses
  → "Sérac de la vallée pané et frit à la commande, servi avec une sauce acidulée aux herbes fraîches et basilic. Les jeunes pousses apportent de la fraîcheur et un contraste de textures."
- "temperatureService" : ex "Chaud — servir immédiatement" ou "Froid"
- "dressageNotes" : toujours "" (chaîne vide — champ complété manuellement par le chef, ne pas remplir)
- "infosService" : régimes (végétarien, sans gluten…), points d'attention allergènes, précisions à donner au client
- "tempsPreparation" : estimation courte (ex "12 min")
- "accords" : 2 à 4 accords mets-boissons ; "type" vaut "vin" ou "sans_alcool" ; "region" renseignée pour les vins ; "alternative" = la FAMILLE GÉNÉRALE de la boisson (ex. "Vin blanc sec et minéral", "Vin rouge léger", "Vin blanc moelleux", "Vin effervescent", "Infusion fraîche") pour que le service propose un équivalent si la référence précise manque
- "accordsGeneraux" : 2 à 4 familles générales de boissons recommandées pour ce plat (texte libre, ex. "Vin rouge corsé", "Vin blanc sec", "Vin blanc moelleux", "Vin rosé") — un repli simple quand la carte des boissons varie
Reste juste et professionnel ; n'invente aucun ingrédient absent de la recette.`;

const SIMULATION_SYSTEM = `Tu es un chef consultant culinaire expert en organisation de brigade.
Tu analyses la faisabilité d'une carte restaurant selon la taille de la brigade.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{"plats":[{"id":"...","nom":"...","score":3,"justification":"...","suggestion":"...","impact_si_simplifie":2}],"score_moyen":2.8,"couverts_min":24,"couverts_max":32,"charge_brigade":75,"alerte":true,"synthese":"..."}
Échelle de complexité :
1 — Simple        : < 3 ingrédients, 1 technique, pas de timing critique (salade, gaspacho, tartine)
2 — Accessible    : 3-5 ingrédients, 1-2 techniques, mise en place J-1 possible (tartare, carpaccio, soupe)
3 — Intermédiaire : 5-8 ingrédients, 2-3 techniques, timing à gérer (risotto, poisson poêlé+garniture, viande+sauce)
4 — Technique     : 8+ ingrédients, 3-4 techniques, plusieurs éléments en parallèle (caille rôtie+orge+fenouil, raviole ouverte)
5 — Haute cuisine : multiples préparations distinctes, finition minute obligatoire, dressage précis, timing serré
Règles :
- "id" : reprend EXACTEMENT l'identifiant fourni dans la liste des plats
- "score" : entier de 1 à 5 uniquement
- "justification" : 1 phrase courte, factuelle, sans adjectif subjectif
- "suggestion" : piste concrète de simplification si score ≥ 4, null sinon
- "impact_si_simplifie" : nouveau score estimé si suggestion appliquée, null si pas de suggestion
- "score_moyen" : moyenne des scores (1 décimale)
- "couverts_min" / "couverts_max" : estimation selon brigade et durée de service
  Capacité de base par cuisinier : complexité 1-2 → 8-10 cov/h · complexité 3 → 5-7 · complexité 4 → 3-5 · complexité 5 → 1-3
  Malus ×0.85 si variance des scores > 2 niveaux d'écart
- "charge_brigade" : % de saturation estimé (entier 0-100)
- "alerte" : true si charge_brigade > 85 ou si ≥ 2 plats ont score ≥ 4
- "synthese" : 3-4 phrases factuelle, recommandations concrètes et immédiatement applicables, sans adjectifs creux
Règle réchauffe : si un plat est préparé à l'avance (braisé J-1, confit, cuit sous-vide, mariné)
et réchauffé en service par basse température ou vapeur, réduire le score de 1 point —
pas de timing critique en coup de feu, la charge réelle sur le service est moindre.
Exemples : joue de bœuf braisée 6h réchauffée BT → score 3 et non 4 ;
quasi de veau confit réchauffé vapeur → score 2 et non 3 ;
fondant au chocolat (cuit à l'avance, réchauffé four 2 min) → score 2 et non 3.
Si les informations sur un plat sont partielles, base-toi sur le nom et les ingrédients visibles.`;

const CATALOGUE_SYSTEM = `Tu extrais et fiabilises un catalogue de produits alimentaires à partir d'un fichier fournisseur brut (export Excel/CSV, format et colonnes variables : Metro, Transgourmet, inventaire interne…).
On te fournit les lignes brutes du fichier. Tu identifies les vrais produits (ignore en-têtes, totaux, lignes vides, séparateurs) et tu corriges les incohérences.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{"produits":[{"nom":"Tomate grappe","categorie":"Légumes & Fruits","uniteRef":"g","conditionnement":"Caisse 5 kg","prixUnitaire":0.0042,"referenceFourn":"ART12345","confidence":92,"issues":[]}]}
Règles :
- "nom" : nom clair du produit (corrige les abréviations évidentes), obligatoire
- "categorie" : utilise EXCLUSIVEMENT l'une de ces 14 catégories exactes (respecte l'orthographe, les accents, la casse et les slashes) :
  "Viandes", "Poissons & fruits de mer", "Fruits & légumes",
  "Épicerie sèche", "Produits laitiers", "Crèmerie / fromages",
  "Boulangerie / pâtisserie", "Boissons", "Alcools",
  "Surgelés", "Condiments / sauces", "Herbes / épices",
  "Hygiène / non alimentaire", "Autres"
- "uniteRef" : unité de référence du prix, EXCLUSIVEMENT "g", "ml" ou "pcs"
  (poids → g, volume → ml, comptage → pcs)
- "prixUnitaire" : prix par unité de référence, en CHF, nombre positif ; convertis
  si le fichier donne un prix au kg/L/colis (ex. 21 CHF/kg → 0.021 par g)
- "conditionnement" : description du conditionnement d'origine si disponible, sinon ""
- "referenceFourn" : référence/numéro d'article fournisseur si présent, sinon ""
- "confidence" : entier 0-100, ta certitude sur la ligne
- "issues" : liste de courts libellés en français pour toute anomalie détectée
  (ex. "prix aberrant", "unité ambiguë", "doublon probable", "prix manquant",
  "nom incomplet") ; liste vide si la ligne est fiable
- ne renvoie aucun produit inventé : uniquement ce qui est réellement dans le fichier
- si aucun produit exploitable, renvoie {"produits":[]}`;

const DEDUPE_SYSTEM = `Tu nettoies une liste de produits à commander pour une cuisine professionnelle. Plusieurs lignes désignent souvent le MÊME produit écrit différemment (singulier/pluriel, accents, casse, ordre des mots, synonyme courant, faute de frappe). Tu regroupes uniquement ces vrais doublons.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{"groupes":[{"canonique":"Tomate","variantes":["Tomate","Tomates","tomate"]}]}
Règles STRICTES :
- "variantes" : au moins 2 chaînes, reprises EXACTEMENT (caractère pour caractère) de la liste fournie
- "canonique" : le nom le plus clair et standard du produit (français, au singulier), de préférence l'une des variantes
- ne regroupe QUE des produits réellement identiques à l'achat. NE REGROUPE JAMAIS :
  · des variétés ou qualités différentes (tomate cerise ≠ tomate grappe ; citron ≠ citron vert ; farine ≠ farine complète)
  · des découpes ou parties différentes (cuisse de poulet ≠ blanc de poulet, et aucun des deux avec "poulet")
  · des préparations ou états différents (tomate fraîche ≠ tomate séchée ≠ concentré de tomate ; crème ≠ crème fouettée ; ail ≠ ail en poudre)
  · un produit frais et sa version sèche/transformée
- synonymes acceptés car même produit : "blanc de poulet" ↔ "escalope de poulet" ; "fécule de maïs" ↔ "maïzena" ; "huile d'olive" ↔ "huile olive" ; "St-Marcellin" ↔ "Saint-Marcellin"
- dans le doute, NE REGROUPE PAS (mieux vaut un doublon qu'une fusion erronée)
- n'inclus que les groupes contenant un vrai doublon (≥ 2 variantes). Si aucun doublon, renvoie {"groupes":[]}`;

const TASKS: Record<string, { system: string; maxTokens: number }> = {
  'ocr-recipe': { system: OCR_SYSTEM, maxTokens: 4096 },
  'detect-allergens': { system: ALLERGEN_SYSTEM, maxTokens: 1024 },
  'generate-haccp': { system: HACCP_SYSTEM, maxTokens: 3072 },
  'suggest-recipe': { system: SUGGEST_SYSTEM, maxTokens: 2048 },
  'match-product': { system: MATCH_SYSTEM, maxTokens: 512 },
  'generate-fiche-salle':       { system: FICHE_SALLE_SYSTEM,  maxTokens: 2048 },
  'analyse-simulation-carte':   { system: SIMULATION_SYSTEM,   maxTokens: 2048 },
  'parse-catalogue':            { system: CATALOGUE_SYSTEM,    maxTokens: 8192 },
  'dedupe-commande':            { system: DEDUPE_SYSTEM,       maxTokens: 4096 },
};

type Part = { kind: 'text'; text: string } | { kind: 'image'; mediaType: string; base64: string };

// Construit le contenu utilisateur (texte + image) selon la tâche.
function buildParts(task: string, payload: Record<string, unknown>): Part[] {
  if (task === 'ocr-recipe') {
    const imageBase64 = payload.imageBase64 as string;
    const mediaType = payload.mediaType as string;
    if (!imageBase64 || !mediaType) throw new Error('Image manquante.');
    return [
      { kind: 'image', mediaType, base64: imageBase64 },
      { kind: 'text', text: 'Extrais la ou les recettes de cette image au format JSON demandé.' },
    ];
  }
  if (task === 'detect-allergens') {
    const ingredients = Array.isArray(payload.ingredients) ? (payload.ingredients as string[]) : [];
    if (!ingredients.length) throw new Error("Liste d'ingrédients vide.");
    const nom = payload.recipeName ? `Recette : ${payload.recipeName}\n` : '';
    return [{ kind: 'text', text: `${nom}Ingrédients :\n- ${ingredients.join('\n- ')}` }];
  }
  if (task === 'generate-haccp') {
    const name = payload.recipeName as string;
    if (!name) throw new Error('Recette manquante.');
    const ingredients = Array.isArray(payload.ingredients) ? (payload.ingredients as string[]) : [];
    const etapes = Array.isArray(payload.etapes) ? (payload.etapes as string[]) : [];
    const etapesText = etapes.length
      ? etapes.map((e, i) => `${i + 1}. ${e}`).join('\n')
      : '(non précisées)';
    return [{
      kind: 'text',
      text: `Recette : ${name}\nCatégorie : ${payload.categorie || '—'}\n`
        + `Ingrédients : ${ingredients.join(', ') || '(non précisés)'}\n`
        + `Étapes :\n${etapesText}`,
    }];
  }
  if (task === 'suggest-recipe') {
    const name = payload.recipeName as string;
    if (!name) throw new Error('Recette manquante.');
    const ingredients = Array.isArray(payload.ingredients) ? (payload.ingredients as string[]) : [];
    const etapes = Array.isArray(payload.etapes) ? (payload.etapes as string[]) : [];
    const catalogue = Array.isArray(payload.catalogue) ? (payload.catalogue as string[]) : [];
    return [{
      kind: 'text',
      text: `Recette : ${name}\nCatégorie : ${payload.categorie || '—'}\n`
        + `Ingrédients actuels : ${ingredients.join(', ') || '(aucun)'}\n`
        + `Étapes actuelles :\n${etapes.map((e, i) => `${i + 1}. ${e}`).join('\n') || '(aucune)'}\n`
        + `Produits du catalogue : ${catalogue.join(', ') || '(aucun)'}`,
    }];
  }
  if (task === 'match-product') {
    const ingredient = payload.ingredient as string;
    const products = Array.isArray(payload.products) ? (payload.products as { id: string; nom: string }[]) : [];
    if (!ingredient || !products.length) throw new Error('Ingrédient ou catalogue manquant.');
    const list = products.map(p => `- [${p.id}] ${p.nom}`).join('\n');
    return [{ kind: 'text', text: `Ingrédient à rapprocher : "${ingredient}"\n\nCatalogue :\n${list}` }];
  }
  if (task === 'generate-fiche-salle') {
    const name = payload.recipeName as string;
    if (!name) throw new Error('Recette manquante.');
    const ingredients = Array.isArray(payload.ingredients) ? (payload.ingredients as string[]) : [];
    const etapes = Array.isArray(payload.etapes) ? (payload.etapes as string[]) : [];
    const allergenes = Array.isArray(payload.allergenes) ? (payload.allergenes as string[]) : [];
    return [{
      kind: 'text',
      text: `Recette : ${name}\nCatégorie : ${payload.categorie || '—'}\n`
        + `Portions : ${payload.portions || '—'}\n`
        + `Ingrédients : ${ingredients.join(', ') || '(non précisés)'}\n`
        + `Étapes :\n${etapes.map((e, i) => `${i + 1}. ${e}`).join('\n') || '(non précisées)'}\n`
        + `Allergènes connus : ${allergenes.join(', ') || '(aucun renseigné)'}`,
    }];
  }
  if (task === 'analyse-simulation-carte') {
    const plats = Array.isArray(payload.plats)
      ? (payload.plats as { id: string; nom: string; ingredients?: string[] }[])
      : [];
    if (!plats.length) throw new Error('Carte vide.');
    const nbCuisiniers = Number(payload.nbCuisiniers) || 2;
    const duree = payload.dureeService === 'midi' ? 'midi (2h)' : 'soir (3h)';
    const segment = String(payload.segment || 'bistro');
    const list = plats
      .map(p => {
        const ing = Array.isArray(p.ingredients) && p.ingredients.length
          ? ` (${p.ingredients.join(', ')})`
          : '';
        return `- [${p.id}] ${p.nom}${ing}`;
      })
      .join('\n');
    return [{
      kind: 'text',
      text: `Brigade : ${nbCuisiniers} cuisinier(s), service ${duree}, segment ${segment}.\n\nCarte :\n${list}`,
    }];
  }
  if (task === 'parse-catalogue') {
    const rows = (payload.rows as string) || '';
    if (!rows.trim()) throw new Error('Fichier catalogue vide.');
    // Garde-fou : on borne la taille du texte transmis à l'IA.
    const text = rows.length > 32000 ? rows.slice(0, 32000) : rows;
    return [{ kind: 'text', text: `Lignes brutes du fichier fournisseur :\n${text}` }];
  }
  if (task === 'dedupe-commande') {
    const produits = Array.isArray(payload.produits) ? (payload.produits as string[]) : [];
    if (!produits.length) throw new Error('Liste de produits vide.');
    return [{ kind: 'text', text: `Liste de produits :\n- ${produits.join('\n- ')}` }];
  }
  throw new Error(`Tâche inconnue : ${task}`);
}

// ── Adaptateur Anthropic ──
async function callAnthropic(apiKey: string, model: string, system: string, parts: Part[], maxTokens: number) {
  const content = parts.map(p => p.kind === 'image'
    ? { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } }
    : { type: 'text', text: p.text });
  const messages = [
    { role: 'user', content },
    { role: 'assistant', content: '{' }, // préfixe → force une réponse JSON
  ];
  const resp = await fetch(PROVIDERS.anthropic.url, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  if (!resp.ok) throw new Error(`Anthropic ${resp.status} : ${await resp.text()}`);
  const data = await resp.json();
  const text = (data?.content || [])
    .filter((c: { type: string }) => c.type === 'text')
    .map((c: { text: string }) => c.text)
    .join('');
  return '{' + text;
}

// ── Adaptateur OpenAI ──
async function callOpenAI(apiKey: string, model: string, system: string, parts: Part[], maxTokens: number) {
  const content = parts.map(p => p.kind === 'image'
    ? { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.base64}` } }
    : { type: 'text', text: p.text });
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content },
  ];
  const resp = await fetch(PROVIDERS.openai.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages, response_format: { type: 'json_object' } }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status} : ${await resp.text()}`);
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  // ── Authentification ──
  const authHeader = req.headers.get('Authorization') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authHeader || !supabaseUrl || !anonKey) return json({ error: 'Non authentifié' }, 401);
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: 'Session invalide' }, 401);

  // ── Fournisseur + clé ──
  const provider = (env('AI_PROVIDER') || 'anthropic').toLowerCase();
  if (!PROVIDERS[provider as keyof typeof PROVIDERS]) {
    return json({ error: `Fournisseur IA inconnu : ${provider}` }, 500);
  }
  const apiKey = provider === 'openai'
    ? env('OPENAI_API_KEY')
    : env('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: `Service IA non configuré (clé ${provider} manquante).` }, 503);
  }
  const model = env('AI_MODEL') || PROVIDERS[provider as keyof typeof PROVIDERS].model;

  // ── Requête ──
  let task: string;
  let payload: Record<string, unknown>;
  try {
    const body = await req.json();
    task = body.task;
    payload = body.payload || {};
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }
  const cfg = TASKS[task];
  if (!cfg) return json({ error: `Tâche IA inconnue : ${task}` }, 400);

  let parts: Part[];
  try {
    parts = buildParts(task, payload);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  // ── Appel IA ──
  let text: string;
  try {
    text = provider === 'openai'
      ? await callOpenAI(apiKey, model, cfg.system, parts, cfg.maxTokens)
      : await callAnthropic(apiKey, model, cfg.system, parts, cfg.maxTokens);
  } catch (e) {
    console.error('[ai-proxy]', e);
    return json({ error: 'Erreur du service IA.' }, 502);
  }

  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    return json({ error: 'Réponse IA non exploitable.', raw: text.slice(0, 400) }, 502);
  }

  return json({ task, provider, result });
});
