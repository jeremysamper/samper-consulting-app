// ════════════════════════════════════════════════════════════════
// Edge function « ai-proxy » - proxy IA multi-fournisseur (Claude / OpenAI).
//
// La clé API reste 100 % côté serveur - jamais exposée au client. Le client
// appelle cette fonction avec son jeton de session Supabase ; la fonction
// vérifie l'authentification avant tout appel IA.
//
// Secrets (Supabase Dashboard → Edge Functions → Manage secrets) :
//   AI_PROVIDER         (optionnel) - 'anthropic' (défaut) | 'openai'
//   ANTHROPIC_API_KEY   (requis si provider = anthropic)
//   OPENAI_API_KEY      (requis si provider = openai)
//   AI_MODEL            (optionnel) - id de modèle ; doit correspondre au
//                       fournisseur choisi. Sinon défaut par fournisseur.
//   AI_MODEL_FACTURE    (optionnel) - modèle Anthropic de la lecture des factures
//                       et bons (parse-facture). Sinon MODELE_FACTURE_ANTHROPIC.
// SUPABASE_URL / SUPABASE_ANON_KEY sont injectés automatiquement.
//
// Tâches : 'ocr-recipe' (vision), 'parse-facture' (vision), 'detect-allergens',
//          'generate-haccp', 'suggest-recipe', 'match-product',
//          'generate-fiche-salle', 'parse-catalogue', 'dedupe-commande',
//          'translate' (texte ; payload.target = 'en' par défaut, ou 'es'),
//          'orientation-document' (vision : quatre rotations d'une photo, celle à l'endroit).
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { appliquerCors } from '../_shared/cors.ts';

const PROVIDERS = {
  anthropic: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-5' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
};

const corsHeaders = {
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
- "unite" parmi : g, kg, ml, L, pcs, cs, cc, pincée - sinon l'unité la plus proche
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
Suggère UNIQUEMENT des AJOUTS pertinents - ingrédients manquants et étapes de préparation - sans jamais répéter l'existant.
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
- "temperatureService" : ex "Chaud - servir immédiatement" ou "Froid"
- "dressageNotes" : toujours "" (chaîne vide - champ complété manuellement par le chef, ne pas remplir)
- "infosService" : régimes (végétarien, sans gluten…), points d'attention allergènes, précisions à donner au client
- "tempsPreparation" : estimation courte (ex "12 min")
- "accords" : 2 à 4 accords mets-boissons ; "type" vaut "vin" ou "sans_alcool" ; "region" renseignée pour les vins ; "alternative" = la FAMILLE GÉNÉRALE de la boisson (ex. "Vin blanc sec et minéral", "Vin rouge léger", "Vin blanc moelleux", "Vin effervescent", "Infusion fraîche") pour que le service propose un équivalent si la référence précise manque
- "accordsGeneraux" : 2 à 4 familles générales de boissons recommandées pour ce plat (texte libre, ex. "Vin rouge corsé", "Vin blanc sec", "Vin blanc moelleux", "Vin rosé") - un repli simple quand la carte des boissons varie
Reste juste et professionnel ; n'invente aucun ingrédient absent de la recette.`;

const SIMULATION_SYSTEM = `Tu es un chef consultant culinaire expert en organisation de brigade.
Tu analyses la faisabilité d'une carte restaurant selon la taille de la brigade.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format :
{"plats":[{"id":"...","nom":"...","score":3,"justification":"...","suggestion":"...","impact_si_simplifie":2}],"score_moyen":2.8,"couverts_min":24,"couverts_max":32,"charge_brigade":75,"alerte":true,"synthese":"..."}
Échelle de complexité :
1 - Simple        : < 3 ingrédients, 1 technique, pas de timing critique (salade, gaspacho, tartine)
2 - Accessible    : 3-5 ingrédients, 1-2 techniques, mise en place J-1 possible (tartare, carpaccio, soupe)
3 - Intermédiaire : 5-8 ingrédients, 2-3 techniques, timing à gérer (risotto, poisson poêlé+garniture, viande+sauce)
4 - Technique     : 8+ ingrédients, 3-4 techniques, plusieurs éléments en parallèle (caille rôtie+orge+fenouil, raviole ouverte)
5 - Haute cuisine : multiples préparations distinctes, finition minute obligatoire, dressage précis, timing serré
Règles :
- "id" : reprend EXACTEMENT l'identifiant fourni dans la liste des plats
- "score" : entier de 1 à 5 uniquement
- "justification" : 1 phrase courte, factuelle, sans adjectif subjectif
- "suggestion" : piste concrète de simplification si score ≥ 4, null sinon
- "impact_si_simplifie" : nouveau score estimé si suggestion appliquée, null si pas de suggestion
- "score_moyen" : moyenne des scores (1 décimale)
- "couverts_min" / "couverts_max" : estimation selon brigade et durée de service
  Capacité de base par cuisinier : complexité 1-2 → 8-10 cov/h, complexité 3 → 5-7, complexité 4 → 3-5, complexité 5 → 1-3
  Malus ×0.85 si variance des scores > 2 niveaux d'écart
- "charge_brigade" : % de saturation estimé (entier 0-100)
- "alerte" : true si charge_brigade > 85 ou si ≥ 2 plats ont score ≥ 4
- "synthese" : 3-4 phrases factuelle, recommandations concrètes et immédiatement applicables, sans adjectifs creux
Règle réchauffe : si un plat est préparé à l'avance (braisé J-1, confit, cuit sous-vide, mariné)
et réchauffé en service par basse température ou vapeur, réduire le score de 1 point -
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

const FACTURE_SYSTEM = `Tu lis une facture, un bon de livraison ou une confirmation de commande d'un fournisseur alimentaire suisse (montants en CHF), en français ou en allemand, et tu en extrais les lignes de produits.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{"fournisseur":"...","numeroFacture":"...","dateFacture":"AAAA-MM-JJ","dateEcheance":null,"delaiPaiementJours":null,"totalHT":0,"totalTTC":null,"devise":"CHF","tauxTva":null,"lisibilite":"bonne","remarqueLecture":"","colonnes":["Art.-Nr.","Bezeichnung","Menge","Einheit","Preis","Betrag"],"lignes":[{"brut":"...","libelle":"...","referenceFourn":null,"quantite":1,"conditionnement":null,"quantiteTotale":0,"uniteTotale":"g","montantLigne":0,"confidence":90,"issues":[]}]}
Les valeurs ci-dessus ne montrent que la forme. Ne recopie jamais un exemple de cette consigne : tout ce que tu renvoies doit être lu sur le document fourni.

MÉTHODE, dans cet ordre :
1. Repère le tableau des articles et relève les titres de ses colonnes tels qu'imprimés dans "colonnes"
   (par exemple "Art.-Nr.", "Artikel", "Bezeichnung", "Menge", "ME", "Einheit", "Preis", "Betrag",
   "Désignation", "Quantité", "Prix unitaire", "Montant"). Note dans quelle colonne se trouve chaque nombre.
2. Parcours le tableau ligne imprimée par ligne imprimée, de la première à la dernière, sans en sauter.
   Une ligne d'article = une entrée dans "lignes". Une désignation qui continue sur la ligne du dessous
   (deuxième ligne de texte sans prix) appartient à l'article du dessus.
3. Pour chaque article, recopie d'abord dans "brut" le texte COMPLET de la ligne imprimée, toutes
   colonnes comprises, de gauche à droite, chiffres compris, sans rien corriger. Remplis ensuite les
   autres champs UNIQUEMENT à partir de ce texte et des titres de colonnes.
4. Lis l'en-tête et les totaux.

Champs de l'en-tête (null si absent ou illisible, jamais deviné) :
- "fournisseur" : raison sociale de l'émetteur du document (logo, en-tête, pied de page), pas du destinataire
- "numeroFacture" : numéro de facture, de bon de livraison ("Lieferschein") ou de commande
- "dateFacture" : date du document au format ISO AAAA-MM-JJ. Les dates suisses s'écrivent
  JJ.MM.AAAA : 05.08.2026 devient "2026-08-05". Ne confonds jamais jour et mois.
- "dateEcheance" : date limite de paiement au format ISO AAAA-MM-JJ, seulement si une DATE est
  imprimée ("échéance", "payable jusqu'au", "zahlbar bis", "fällig am"). Ne la calcule jamais.
- "delaiPaiementJours" : si le document ne donne qu'un délai ("30 jours net", "payable à 10 jours",
  "zahlbar innert 30 Tagen"), ce nombre de jours, entier. null si une date est imprimée ou si
  rien n'est indiqué. Les deux champs sont null sur un bon de livraison ou de commande.
- "totalHT" : total hors taxes de la marchandise ("Total HT", "Netto", "Total exkl. MWST", "Warenwert").
  Jamais le TTC, jamais un sous-total de page. Quand le pied du document montre un "Sous-total" ou
  "Sub-total", puis des lignes de TVA, puis un "Total", le sous-total est le totalHT et le "Total" le
  totalTTC. "tauxTva" : taux appliqué (2.6 pour l'alimentaire, 8.1 sinon)
- "totalTTC" : le MONTANT À PAYER, TVA comprise : la dernière ligne du total, souvent intitulée
  "Total", "Total TTC", "Montant à payer", "Endbetrag", "Total CHF inkl. MWST", ou le montant du
  bulletin de versement / QR-facture. Ce n'est jamais un sous-total. null si absent (bon de
  livraison sans prix, par exemple).
- "devise" : "CHF" sauf mention contraire explicite
- "lisibilite" : "bonne", "moyenne" ou "mauvaise", ta capacité réelle à lire les chiffres du tableau
  (photo floue, de travers, coupée, reflets, pli, texte trop petit).
- "remarqueLecture" : une phrase courte en français quand la lisibilité n'est pas bonne
  ("bas de page coupé", "photo floue sur la colonne des montants"), sinon "".

Champs par ligne :
- "brut" : voir la méthode, le texte complet de la ligne imprimée.
- "libelle" : la désignation du produit EXACTEMENT telle qu'imprimée, abréviations, majuscules et
  conditionnement compris, SANS le numéro d'article de la colonne de référence, sans la quantité
  livrée et sans les prix. Ne la corrige pas, ne la traduis pas, ne la complète pas : elle sert
  à reconnaître le produit d'un document à l'autre.
- "referenceFourn" : numéro d'article du fournisseur (colonne "Art.-Nr.", "Artikel-Nr.", "Réf.",
  "Code") si imprimé, sinon null
- "quantite" : nombre de colis, cartons, sacs, pièces ou kilos livrés, lu dans la colonne de quantité
  ("Menge", "Quantité", "Qté", "Liefermenge"), pas dans la désignation
- "conditionnement" : le conditionnement tel qu'écrit, le plus souvent DANS la désignation
  ("6 x 850 g", "2 x 2.5 kg", "10 kg", "250g", "Krt à 12"), sinon null

LES DEUX CHAMPS QUI COMPTENT LE PLUS, lis attentivement :

- "montantLigne" : le TOTAL de la ligne, hors taxes. C'est la colonne la plus à droite,
  souvent intitulée "Montant", "Total", "Betrag" ou "Somme". PAS le prix unitaire. Ce nombre doit
  figurer tel quel dans "brut".
- "quantiteTotale" + "uniteTotale" : la quantité TOTALE de marchandise de cette ligne,
  ramenée en unité de base. "uniteTotale" vaut obligatoirement "g", "ml" ou "pcs".
  Convertis toi-même : 1 kg = 1000 g, 1 L = 1000 ml, 1 dl = 100 ml, 1 cl = 10 ml.

  Exemples de calcul (ces produits n'existent pas sur ton document, ne les renvoie jamais) :
  - "Purée de tomates, 6 x 850 g", 1 carton -> 1 x 6 x 850 = quantiteTotale 5100, uniteTotale "g"
  - "Cuisse de poulet surg., 10 kg", 1 carton -> quantiteTotale 10000, uniteTotale "g"
  - "Petits pois, 2 x 2.5 kg", 1 carton -> 2 x 2.5 kg = quantiteTotale 5000, uniteTotale "g"
  - "Amandes moulues, 1 kg", 2 sacs -> quantiteTotale 2000, uniteTotale "g"
  - "Sirop de sureau, 5 dl", 1 bouteille -> quantiteTotale 500, uniteTotale "ml"
  - "Concombres CH pc", 1 pièce -> quantiteTotale 1, uniteTotale "pcs"
  - "Viande hachée de boeuf", quantité 3.45, unité "kg" dans la colonne d'unité -> la quantité est
    déjà en kilos : quantiteTotale 3450, uniteTotale "g". Quand la colonne d'unité dit "kg"
    ou "l", la quantité livrée est un poids ou un volume, pas un nombre de colis.
  - "Mini quiches 18 g", 2 cartons de 50 pièces -> 18 g est le poids d'UNE pièce : quantiteTotale 100,
    uniteTotale "pcs". Si le nombre de pièces par colis n'est pas imprimé, quantiteTotale null et
    "conditionnement illisible" dans issues. Ne multiplie jamais le poids d'une pièce par le nombre
    de colis.

  PIÈGE À ÉVITER ABSOLUMENT : un nombre suivi de "/kg", "/l", "/pce", "/Stk", "par kg",
  "le kg", "CHF/kg" est un PRIX par unité, jamais un poids ni une quantité : "ROSTI 2.20/kg"
  ne pèse pas 2,2 kg. De même, la colonne "Prix" est le prix de l'unité livrée, et cette unité change
  d'une ligne à l'autre : tantôt le kilo, tantôt la bouteille, tantôt le sac entier. Ne la prends
  jamais pour le prix du colis. Ne renseigne que "montantLigne", le total.
  Contrôle systématique : montantLigne doit valoir prix unitaire x quantité de la colonne
  d'unité livrée. Si ça ne tombe pas juste, mets "montant incoherent" dans issues.

- "confidence" : entier 0-100, ta certitude sur cette ligne. Au-dessus de 80 seulement si tu lis
  nettement chaque chiffre de la ligne.
- "issues" : libellés courts en français pour toute anomalie ("montant illisible",
  "quantite ambigue", "conditionnement illisible", "ligne partiellement masquee",
  "montant incoherent", "prix absent", "ligne non produit"). Liste vide si la ligne est fiable.

Règles STRICTES :
- N'invente RIEN. Chaque ligne renvoyée correspond à une ligne réellement imprimée, que tu as
  recopiée dans "brut". Un champ que tu ne lis pas est null, accompagné d'une entrée dans "issues".
  Une valeur plausible mais devinée est pire qu'un null : elle ira écraser un prix en base.
  Une photo illisible donne peu de lignes ou aucune, avec "lisibilite" "mauvaise", jamais des lignes
  imaginées.
- Un bon de livraison sans colonne de prix : montantLigne à null et "prix absent" dans issues,
  totalHT et totalTTC à null.
- "Prix s.d.", "sur demande", un montant vide ou une quantité 0 signifient qu'il n'y a pas de
  prix : montantLigne à null et "prix absent" dans issues.
- Ignore les lignes qui ne sont pas des produits : frais de port, consigne, emballage, remise
  globale, acompte, arrondi, sous-totaux, lignes de TVA et total général. En cas de doute,
  garde la ligne et marque-la "ligne non produit" dans issues.
- Les montants sont des nombres sans symbole ni séparateur de milliers. La virgule décimale
  suisse devient un point : 1'234,50 devient 1234.50
- Si plusieurs images ou plusieurs pages sont fournies, c'est un SEUL document : renvoie un
  seul en-tête et la totalité des lignes, dans l'ordre.
- Vérifie enfin que la somme des "montantLigne" (lignes non produit comprises si elles entrent dans
  le total) est proche de "totalHT". Si l'écart dépasse quelques centimes, relis le tableau : une ligne
  est oubliée, mal lue, ou le total lu n'est pas le bon (le TTC pris pour le HT, le plus souvent).
  Ne change JAMAIS un montant ou une quantité lus pour faire tomber la somme juste : recopie ce qui
  est imprimé. S'il reste un écart, garde-le et baisse la confidence des lignes douteuses.
- Si aucune ligne de produit n'est lisible, renvoie {"lignes":[]} avec l'en-tête que tu as pu lire.`;

const DEDUPE_SYSTEM = `Tu nettoies une liste de produits à commander pour une cuisine professionnelle. Plusieurs lignes désignent souvent le MÊME produit écrit différemment (singulier/pluriel, accents, casse, ordre des mots, synonyme courant, faute de frappe). Tu regroupes uniquement ces vrais doublons.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{"groupes":[{"canonique":"Tomate","variantes":["Tomate","Tomates","tomate"]}]}
Règles STRICTES :
- "variantes" : au moins 2 chaînes, reprises EXACTEMENT (caractère pour caractère) de la liste fournie
- "canonique" : le nom le plus clair et standard du produit (français, au singulier), de préférence l'une des variantes
- ne regroupe QUE des produits réellement identiques à l'achat. NE REGROUPE JAMAIS :
  - des variétés ou qualités différentes (tomate cerise ≠ tomate grappe ; citron ≠ citron vert ; farine ≠ farine complète)
  - des découpes ou parties différentes (cuisse de poulet ≠ blanc de poulet, et aucun des deux avec "poulet")
  - des préparations ou états différents (tomate fraîche ≠ tomate séchée ≠ concentré de tomate ; crème ≠ crème fouettée ; ail ≠ ail en poudre)
  - un produit frais et sa version sèche/transformée
- synonymes acceptés car même produit : "blanc de poulet" ↔ "escalope de poulet" ; "fécule de maïs" ↔ "maïzena" ; "huile d'olive" ↔ "huile olive" ; "St-Marcellin" ↔ "Saint-Marcellin"
- dans le doute, NE REGROUPE PAS (mieux vaut un doublon qu'une fusion erronée)
- n'inclus que les groupes contenant un vrai doublon (≥ 2 variantes). Si aucun doublon, renvoie {"groupes":[]}`;

const TRANSLATE_SYSTEM = `Tu traduis du français vers l'anglais les textes d'une application de gestion de cuisine professionnelle (restauration, HACCP, recettes, planning, inventaire).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{"t":["Delete","Recipes"]}
Règles :
- "t" contient EXACTEMENT autant d'éléments que la liste fournie, dans le MÊME ordre. C'est impératif : un décalage casse l'affichage.
- traduis chaque entrée indépendamment ; n'en fusionne, n'en ajoute et n'en supprime aucune
- registre : anglais de cuisine professionnelle, concis, ton d'interface logicielle (pas de phrase explicative)
- garde TEL QUEL : noms propres, noms de personnes, d'établissements, de lieux et de plats signature, marques (Lightspeed, Metro, Transgourmet), sigles (HACCP, DLC, SOP, POS, KDS, MEP, CHF, TVA), unités (g, kg, ml, L, pcs, cs, cc), nombres, dates, heures et prix
- conserve la casse d'origine (une entrée TOUT EN MAJUSCULES le reste) et la ponctuation finale
- si une entrée est déjà en anglais, ou n'a rien à traduire, renvoie-la à l'identique
- vocabulaire métier imposé : "mise en place" → "mise en place" ; "brigade" → "brigade" ; "carte" → "menu" ; "fiche technique" → "spec sheet" ; "fiche salle" → "service sheet" ; "perte" → "waste" ; "pointage" → "time clock" ; "inventaire" → "inventory" ; "établissement" → "site" ; "commande" → "ordering" ; "prévisions" → "forecasts" ; "dressage" → "plating" ; "conservation" → "storage" ; "régénération" → "reheating"
- ne commente jamais, ne pose jamais de question : traduis.`;

// Même contrat que TRANSLATE_SYSTEM, cible espagnole. Vocabulaire aligné sur le
// glossaire statique du front (src/i18n/glossaryEs.js).
const TRANSLATE_SYSTEM_ES = `Tu traduis du français vers l'espagnol les textes d'une application de gestion de cuisine professionnelle (restauration, HACCP, recettes, planning, inventaire).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact :
{"t":["Eliminar","Recetas"]}
Règles :
- "t" contient EXACTEMENT autant d'éléments que la liste fournie, dans le MÊME ordre. C'est impératif : un décalage casse l'affichage.
- traduis chaque entrée indépendamment ; n'en fusionne, n'en ajoute et n'en supprime aucune
- registre : espagnol de cuisine professionnelle (castillan), compréhensible par un cuisinier latino-américain ; concis, ton d'interface logicielle (pas de phrase explicative) ; actions et boutons à l'infinitif ("Guardar", "Eliminar") ; tutoiement ("tú") quand le texte s'adresse à l'utilisateur, jamais "vosotros"
- garde TEL QUEL : noms propres, noms de personnes, d'établissements, de lieux et de plats signature, marques (Lightspeed, Metro, Transgourmet), sigles (HACCP, DLC, SOP, POS, KDS, MEP, CHF, TVA), unités (g, kg, ml, L, pcs, cs, cc), nombres, dates, heures et prix
- conserve la casse d'origine (une entrée TOUT EN MAJUSCULES le reste) et la ponctuation finale
- si une entrée est déjà en espagnol, ou n'a rien à traduire, renvoie-la à l'identique
- vocabulaire métier imposé : "mise en place" → "mise en place" ; "brigade" → "brigada" ; "carte" → "carta" ; "fiche technique" → "ficha técnica" ; "fiche salle" → "ficha de sala" ; "perte" → "merma" ; "pointage" → "fichaje" ; "inventaire" → "inventario" ; "établissement" → "establecimiento" ; "commande" → "pedido" ; "prévisions" → "previsiones" ; "dressage" → "emplatado" ; "conservation" → "conservación" ; "régénération" → "regeneración" ; "portion" → "ración" ; "préparation" (recette de base) → "elaboración" ; "chef de partie" → "jefe de partida" ; "commis" → "ayudante de cocina"
- ne commente jamais, ne pose jamais de question : traduis.`;

// Langues cibles de la tâche translate. `target` absent = 'en' : les fronts
// déjà ouverts (qui envoient 'en' ou rien) gardent exactement leur comportement.
const TRANSLATE_TARGETS: Record<string, { system: string; nom: string }> = {
  en: { system: TRANSLATE_SYSTEM, nom: 'anglais' },
  es: { system: TRANSLATE_SYSTEM_ES, nom: 'espagnol' },
};

// Sens d'une photo de document. Une facture photographiée à plat sur un plan de
// travail sort souvent de côté ou à l'envers : lue telle quelle, le modèle
// invente des lignes en se disant sûr de lui (constaté le 18.11.2026 sur trois
// photos prises de côté). Le front envoie la même photo sous ses quatre
// rotations et le modèle désigne celle qui se lit à l'endroit : comparer est
// fiable là où une question sur une seule image (« dans quel sens ? »)
// confondait un quart de tour à gauche et un quart de tour à droite (essai du
// 18.11.2026 : quatre sens sur quatre, et les trois photos du jour).
const ORIENTATION_SYSTEM = `On te montre la même photo d'un document papier (facture, bon de livraison, ticket) sous
quatre rotations, numérotées 1, 2, 3 et 4 dans l'ordre des images. Une seule montre le document à l'endroit :
les lignes du texte principal sont horizontales et se lisent normalement, de gauche à droite, l'en-tête en haut
et les totaux en bas. Les trois autres le montrent de côté ou à l'envers.
Compare les quatre images et désigne celle qui est à l'endroit. Tu ne lis pas le contenu du document.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour : {"image":1}, {"image":2}, {"image":3} ou {"image":4}`;

function translateTarget(payload: Record<string, unknown>): string {
  const raw = payload.target;
  const target = raw === undefined || raw === null || raw === '' ? 'en' : String(raw);
  if (!Object.prototype.hasOwnProperty.call(TRANSLATE_TARGETS, target)) {
    throw new Error(`Langue cible non prise en charge : ${target}`);
  }
  return target;
}

const TASKS: Record<string, { system: string; maxTokens: number }> = {
  'ocr-recipe': { system: OCR_SYSTEM, maxTokens: 4096 },
  'detect-allergens': { system: ALLERGEN_SYSTEM, maxTokens: 1024 },
  'generate-haccp': { system: HACCP_SYSTEM, maxTokens: 3072 },
  'suggest-recipe': { system: SUGGEST_SYSTEM, maxTokens: 2048 },
  'match-product': { system: MATCH_SYSTEM, maxTokens: 512 },
  'generate-fiche-salle':       { system: FICHE_SALLE_SYSTEM,  maxTokens: 2048 },
  'analyse-simulation-carte':   { system: SIMULATION_SYSTEM,   maxTokens: 2048 },
  'parse-catalogue':            { system: CATALOGUE_SYSTEM,    maxTokens: 8192 },
  'parse-facture':              { system: FACTURE_SYSTEM,      maxTokens: 16000 },
  'orientation-document':       { system: ORIENTATION_SYSTEM,  maxTokens: 64 },
  'dedupe-commande':            { system: DEDUPE_SYSTEM,       maxTokens: 4096 },
  'translate':                  { system: TRANSLATE_SYSTEM,    maxTokens: 4096 },
};

// Contrôle d'accès par rôle, appliqué côté serveur (le gate client ne suffit pas :
// n'importe quel utilisateur connecté pouvait appeler ai-proxy directement).
// - Authoring recette : rôles qui peuvent écrire une recette (canManageCartes).
// - Outils consultant : réservé au consultant.
const AUTHORING_ROLES = ['consultant', 'patron', 'resp_cuisine'];
const CONSULTANT_ONLY = ['consultant'];
// Traduction : ouverte à tous les rôles connectés. C'est le sens même du mode
// English / Español - qu'un cuisinier anglophone ou hispanophone puisse lire
// recettes, MEP et HACCP.
const ALL_ROLES = [
  'consultant', 'patron', 'resp_cuisine', 'cuisinier', 'serveur', 'hote', 'praticien_spa',
  // Branche Hôtel (lot H1).
  'receptionniste', 'gouvernante', 'femme_de_chambre', 'technicien',
];
const TASK_ROLES: Record<string, string[]> = {
  'ocr-recipe':               AUTHORING_ROLES,
  'detect-allergens':         AUTHORING_ROLES,
  'generate-haccp':           AUTHORING_ROLES,
  'suggest-recipe':           AUTHORING_ROLES,
  'match-product':            AUTHORING_ROLES,
  'generate-fiche-salle':     CONSULTANT_ONLY,
  'analyse-simulation-carte': CONSULTANT_ONLY,
  'parse-catalogue':          CONSULTANT_ONLY,
  // Lecture des factures et bons de l'onglet Achats de l'inventaire : ouverte
  // à toute l'équipe (demande de Jérémy, octobre 2026).
  'parse-facture':            ALL_ROLES,
  // Sens d'une photo de document, demandé avant sa lecture (parse-facture).
  'orientation-document':     ALL_ROLES,
  'dedupe-commande':          CONSULTANT_ONLY,
  'translate':                ALL_ROLES,
};

type Part = { kind: 'text'; text: string } | { kind: 'image'; mediaType: string; base64: string };

// Garde-fou sur le nombre de pages d'une facture transmises en un appel : au-delà,
// la charge utile devient énorme et le modèle perd en précision sur les montants.
const MAX_PAGES_FACTURE = 5;

// Lecture des factures et bons : la tâche où une erreur coûte le plus (elle finit
// en prix et en quantités), confiée au modèle le plus sûr en lecture d'images.
const MODELE_FACTURE_ANTHROPIC = 'claude-opus-5-5';

// Une relecture n'est lancée que si la première lecture a pris moins que ce
// délai : les deux doivent tenir dans le délai de réponse de la fonction (150 s).
const DELAI_RELECTURE_MS = 60_000;

// Écart entre la somme des lignes lues et le total HT lu, arrondi au centime.
// null quand le document ne donne pas de total (bon de livraison sans prix).
// deno-lint-ignore no-explicit-any
function ecartFacture(r: any): number | null {
  const total = Number(r?.totalHT);
  if (!r || !Array.isArray(r.lignes) || !Number.isFinite(total) || total <= 0) return null;
  // deno-lint-ignore no-explicit-any
  const somme = r.lignes.reduce((s: number, l: any) => s + (Number(l?.montantLigne) || 0), 0);
  return Math.round((somme - total) * 100) / 100;
}

// Tolérance : 10 centimes, ou un demi pour cent du total (arrondis par ligne).
// deno-lint-ignore no-explicit-any
const ecartAdmis = (r: any, ecart: number | null) =>
  ecart == null || Math.abs(ecart) <= Math.max(0.1, Number(r.totalHT) * 0.005);

// Seconde passe sur une facture dont les lignes ne recoupent pas le total : le
// modèle reçoit le même document, sa première lecture et l'écart chiffré, et
// relit le tableau. La relecture n'est gardée que si elle réduit l'écart ; le
// résultat dit dans `verification` ce qui a été fait. Un échec garde la première.
async function relireFacture(
  premiere: unknown,
  parts: Part[],
  appeler: (sys: string, p: Part[]) => Promise<string>,
): Promise<unknown> {
  // deno-lint-ignore no-explicit-any
  const r = premiere as any;
  const ecart = ecartFacture(r);
  if (ecartAdmis(r, ecart)) return premiere;
  const total = Number(r.totalHT);
  const somme = Math.round((total + (ecart as number)) * 100) / 100;
  const consigne = `Première lecture de ce document : ${JSON.stringify(r)}\n\n`
    + `Contrôle : la somme des montantLigne fait ${somme} CHF et le total HT lu ${total} CHF, `
    + `soit un écart de ${ecart} CHF. Cette lecture est fausse quelque part. Reprends le document `
    + `depuis le titre des colonnes, ligne imprimée par ligne imprimée : ajoute les lignes oubliées, `
    + `corrige les montants et les quantités mal lus, retire toute ligne qui n'est pas imprimée, et `
    + `vérifie que le total HT retenu est le total hors taxes de la marchandise, pas un sous-total ni `
    + `le TTC. Si un écart reste après relecture, garde-le et baisse la confidence des lignes douteuses. `
    + `Renvoie le JSON complet corrigé, au même format.`;
  try {
    const seconde = JSON.parse(await appeler(FACTURE_SYSTEM, [...parts, { kind: 'text', text: consigne }]));
    const ecart2 = ecartFacture(seconde);
    const relue = Array.isArray(seconde?.lignes) && ecart2 != null && Math.abs(ecart2) < Math.abs(ecart as number);
    return { ...(relue ? seconde : r), verification: { ecartAvant: ecart, ecartApres: ecart2, relue } };
  } catch (e) {
    console.error('[ai-proxy] relecture de facture', e);
    return { ...r, verification: { ecartAvant: ecart, ecartApres: null, relue: false } };
  }
}

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
  if (task === 'parse-facture') {
    // L'indice de fournisseur n'impose rien : le modèle lit ce qui est imprimé.
    // Il sert à lever une ambiguïté quand l'en-tête est coupé ou illisible.
    const indice = payload.fournisseurHint
      ? `\nFournisseur probable, à confirmer sur le document : ${String(payload.fournisseurHint)}`
      : '';

    // Voie TEXTE : le document est un PDF natif dont le texte est extractible.
    // On ne passe alors pas par la vision : c'est plus fidèle sur les chiffres,
    // et une colonne de montants mal alignée à l'oeil reste juste dans le texte.
    const texte = typeof payload.texte === 'string' ? payload.texte.trim() : '';
    if (texte) {
      const borne = texte.length > 32000 ? texte.slice(0, 32000) : texte;
      return [{
        kind: 'text',
        text: `Texte extrait d'un document fournisseur, ligne par ligne, colonnes séparées `
          + `par des espaces. Extrais l'en-tête et les lignes de produits.${indice}\n\n${borne}`,
      }];
    }

    // Voie VISION : photo ou PDF scanné, rendu page par page. Une facture tient
    // rarement sur une page, l'en-tête est sur la première et la suite des lignes
    // sur les autres : on envoie tout dans un seul appel.
    const brut = Array.isArray(payload.images)
      ? (payload.images as { imageBase64?: string; mediaType?: string }[])
      : (payload.imageBase64 ? [{ imageBase64: payload.imageBase64 as string, mediaType: payload.mediaType as string }] : []);
    const pages = brut
      .filter(p => p && p.imageBase64 && p.mediaType)
      .slice(0, MAX_PAGES_FACTURE);
    if (!pages.length) throw new Error('Aucune image ni texte de facture exploitable.');

    const parts: Part[] = pages.map(p => ({
      kind: 'image' as const,
      mediaType: p.mediaType as string,
      base64: p.imageBase64 as string,
    }));
    parts.push({
      kind: 'text',
      text: pages.length > 1
        ? `Ces ${pages.length} images sont les pages d'un seul et même document, dans l'ordre. `
          + `Extrais l'en-tête une seule fois et toutes les lignes de produits.${indice}`
        : `Extrais l'en-tête et les lignes de produits de ce document.${indice}`,
    });
    return parts;
  }
  if (task === 'orientation-document') {
    // Les quatre rotations de la même photo, dans l'ordre (0, 90, 180, 270 degrés).
    const images = (Array.isArray(payload.images) ? payload.images as { imageBase64?: string; mediaType?: string }[] : [])
      .filter(p => p && p.imageBase64 && p.mediaType);
    if (images.length !== 4) throw new Error('Quatre images attendues.');
    const parts: Part[] = [];
    images.forEach((p, i) => {
      parts.push({ kind: 'text', text: `Image ${i + 1} :` });
      parts.push({ kind: 'image', mediaType: p.mediaType as string, base64: p.imageBase64 as string });
    });
    parts.push({ kind: 'text', text: "Laquelle de ces quatre images montre le document à l'endroit ?" });
    return parts;
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
      text: `Recette : ${name}\nCatégorie : ${payload.categorie || '-'}\n`
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
      text: `Recette : ${name}\nCatégorie : ${payload.categorie || '-'}\n`
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
      text: `Recette : ${name}\nCatégorie : ${payload.categorie || '-'}\n`
        + `Portions : ${payload.portions || '-'}\n`
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
  if (task === 'translate') {
    const { nom } = TRANSLATE_TARGETS[translateTarget(payload)];
    const texts = Array.isArray(payload.texts) ? (payload.texts as string[]) : [];
    const list = texts.map(t => String(t || '')).filter(Boolean).slice(0, 60);
    if (!list.length) throw new Error('Rien à traduire.');
    return [{
      kind: 'text',
      text: `Traduis en ${nom} ces ${list.length} entrées, dans le même ordre :\n`
        + list.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    }];
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

Deno.serve(async (req: Request) => appliquerCors(req, await traiter(req)));

async function traiter(req: Request): Promise<Response> {
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
    return json({ error: `Fournisseur inconnu : ${provider}` }, 500);
  }
  const apiKey = provider === 'openai'
    ? env('OPENAI_API_KEY')
    : env('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: `Service de lecture non configuré (clé ${provider} manquante).` }, 503);
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
  if (!cfg) return json({ error: `Tâche inconnue : ${task}` }, 400);

  // ── Contrôle d'accès par rôle ──
  // L'utilisateur peut lire sa propre ligne profiles via RLS (id = auth.uid()::text),
  // y compris quand son compte est désactivé : actif est donc relu ici, et un compte
  // désactivé n'a aucun rôle.
  const { data: profile } = await supabase
    .from('profiles').select('role, actif').eq('id', user.id).maybeSingle();
  const role = profile && profile.actif !== false ? (profile.role ?? '') : '';
  const allowedRoles = TASK_ROLES[task] ?? CONSULTANT_ONLY;
  if (!allowedRoles.includes(role)) {
    return json({ error: 'Accès refusé : rôle non autorisé pour cette tâche.' }, 403);
  }

  let parts: Part[];
  let system = cfg.system;
  let target: string | undefined;
  try {
    parts = buildParts(task, payload);
    // La langue cible choisit le prompt système (validée par buildParts).
    if (task === 'translate') {
      target = translateTarget(payload);
      system = TRANSLATE_TARGETS[target].system;
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  // ── Appel IA ──
  // Lecture des factures et bons : modèle dédié (AI_MODEL_FACTURE, sinon
  // MODELE_FACTURE_ANTHROPIC). Un modèle que le compte refuse retombe sur le
  // modèle général au lieu de bloquer la lecture.
  const modeleTache = (task === 'parse-facture' || task === 'orientation-document') && provider === 'anthropic'
    ? (env('AI_MODEL_FACTURE') || MODELE_FACTURE_ANTHROPIC)
    : model;
  const appeler = async (sys: string, p: Part[]): Promise<string> => {
    if (provider === 'openai') return await callOpenAI(apiKey, model, sys, p, cfg.maxTokens);
    try {
      return await callAnthropic(apiKey, modeleTache, sys, p, cfg.maxTokens);
    } catch (e) {
      const m = (e as Error).message || '';
      if (modeleTache === model || !/^Anthropic (400|404) /.test(m) || !/model/i.test(m)) throw e;
      console.error('[ai-proxy] modèle de lecture refusé, repli sur le modèle général', m.slice(0, 200));
      return await callAnthropic(apiKey, model, sys, p, cfg.maxTokens);
    }
  };

  const debut = Date.now();
  let text: string;
  try {
    text = await appeler(system, parts);
  } catch (e) {
    console.error('[ai-proxy]', e);
    return json({ error: 'Erreur du service de lecture.' }, 502);
  }

  let result: unknown;
  try {
    result = JSON.parse(text);
  } catch {
    return json({ error: 'Réponse non exploitable.', raw: text.slice(0, 400) }, 502);
  }

  // Facture dont les lignes ne recoupent pas le total : une relecture, si la
  // première lecture a laissé le temps d'en faire une avant le délai de la fonction.
  if (task === 'parse-facture' && Date.now() - debut < DELAI_RELECTURE_MS) {
    result = await relireFacture(result, parts, appeler);
  }

  // `target` renvoyé pour translate : le front vérifie que la langue traitée est
  // bien celle demandée avant de mettre en cache (une version antérieure de la
  // fonction répondait toujours en anglais).
  return json(target ? { task, provider, target, result } : { task, provider, result });
}
