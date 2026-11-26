// Convertit la base de la démo publique en lots SQL pour l'établissement Démo
// de production. Identifiants réécrits (aucune collision avec les autres
// maisons), adresses neutralisées, déclencheurs coupés (replica) à l'écriture,
// chaque ligne inscrite au registre vitrine.lignes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const S = process.argv[2];
const base = JSON.parse(readFileSync(`${S}/base-demo.json`, 'utf8'));
const schema = JSON.parse(readFileSync(`${S}/schema-prod.json`, 'utf8'));

const ETAB_SRC = 'etab-demo';
const ETAB = 'etab-1781452861459';
const U = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tables écartées : vue, réglages globaux, préférences liées à auth.users,
// POS (module à supprimer, et une connexion fictive serait synchronisée).
const ECARTEES = new Set([
  'etablissements', 'user_settings', 'journal_activite_semaine', 'pos_providers',
  'pos_connections', 'pos_items', 'pos_item_recipe_mapping', 'pos_sales',
  // haccp_tracabilite : photo obligatoire en base ; alert_instances : règle obligatoire.
  'haccp_tracabilite', 'alert_instances',
  'permissions', 'permissions_utilisateurs', 'app_settings', 'module_labels', 'resa_clients_stats',
]);
// Groupes de planning déjà créés par le déclencheur de l'établissement.
const GROUPES_EXISTANTS = {
  '00000000-0000-4000-8000-0000000000c1': '19e9011e-a521-4c63-864b-e9c1dbd3bebc',
  '00000000-0000-4000-8000-0000000000c2': 'dde3dbc9-ca17-4195-852d-c1da1f2d62b2',
};
// Fiches déjà présentes dans Démo sous le même nom (import du 15.11) : une fiche par nom.
const RECETTES_EXISTANTES = JSON.parse(readFileSync(`${process.argv[2]}/recettes-existantes.json`, 'utf8'));
const NE_PAS_INSERER = new Set([...Object.keys(GROUPES_EXISTANTS), ...Object.keys(RECETTES_EXISTANTES)]);

const uuidDe = (s) => {
  const h = createHash('md5').update(`vitrine-demo:${s}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// 1. Table des identifiants.
const carte = new Map([...Object.entries(GROUPES_EXISTANTS), ...Object.entries(RECETTES_EXISTANTES)]);
const tables = Object.entries(base).filter(([t, l]) => Array.isArray(l) && l.length && !ECARTEES.has(t));
for (const [t, lignes] of tables) {
  const sc = schema[t];
  if (!sc) throw new Error(`table absente en production : ${t}`);
  const colId = sc.find((c) => c[0] === 'id');
  if (!colId) continue;
  for (const r of lignes) {
    if (r.id == null || carte.has(r.id)) continue;
    if (t === 'profiles') carte.set(r.id, uuidDe(r.id));
    else if (colId[1] === 'uuid' || U.test(r.id)) carte.set(r.id, uuidDe(r.id));
    else carte.set(r.id, `${r.id}-vitrine`);
  }
}

// 2. Réécriture profonde des valeurs.
const remplacements = new Map();
function reecrire(v, ou) {
  if (typeof v === 'string') {
    if (v === ETAB_SRC) return ETAB;
    if (carte.has(v)) {
      if (!/(^|\.)(id|[a-z_]*_id|[a-z_]*_ids|user_id|par|created_by|cree_par|assignee_a|faite_par|fait_par|livree_par|responsable|attribuee_a|ouvert_par|encaisse_par|envoye_par|cloture_par|termine_par|assigne_a|uploaded_by|sender_id|recipient_id|destinataire|emis_par|complement_de|updated_by)(\[\]|\.|$)/.test(ou)) {
        remplacements.set(ou, (remplacements.get(ou) || 0) + 1);
      }
      return carte.get(v);
    }
    let s = v.includes(ETAB_SRC) ? v.split(ETAB_SRC).join(ETAB) : v;
    s = s.replace(/@brasserie-demo\.ch/g, '@brasserie-demo.example').replace(/@([\w.-]*)example\.ch\b/g, '@$1example.test');
    return s;
  }
  if (Array.isArray(v)) return v.map((x) => reecrire(x, `${ou}[]`));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[carte.has(k) ? carte.get(k) : k] = reecrire(x, `${ou}.${k}`);
    return o;
  }
  return v;
}

// 3. Ajustements par table.
const SLUG = 'brasserie-demo';
function ajuster(t, r) {
  if (t === 'alert_instances') delete r.rule_type;
  if (t === 'sop_executions') r.operateur_id = null; // clé vers auth.users
  if (t === 'caisse_commande_qr_parametres' && r.slug) r.slug = SLUG;
  // Valeurs que la base refuse (la démo publique ne vérifie pas les CHECK).
  if (t === 'absences' && r.motif === 'maladie') r.motif = 'absence';
  if (t === 'caisse_paiements' && r.moyen === 'twint') { r.moyen = 'autre'; r.libelle = r.libelle || 'TWINT'; }
  if (t === 'charges_fixes' && r.categorie === 'assurance') r.categorie = 'assurances';
  if (t === 'produit_prix_historique' && r.source === 'facture') r.source = 'scan';
  if (t === 'sops' && typeof r.rappel_heure === 'string' && r.rappel_heure.includes('NaN')) r.rappel_heure = '22:00:00';
  // Sceaux provisoires : la chaîne d'intégrité est recalculée en base
  // (vitrine.resceller) une fois les pièces écrites.
  const ZERO = '0'.repeat(64);
  if (t === 'caisse_tickets' && r.numero != null) { r.empreinte = ZERO; r.empreinte_precedente = ZERO; }
  if (t === 'caisse_clotures') { r.empreinte = ZERO; r.empreinte_precedente = ZERO; if (r.especes_comptees == null) r.especes_comptees = r.fond_caisse ?? 0; }
  return r;
}

// 4. Lots SQL, colonnes regroupées par jeu de clés (une colonne absente garde
// son défaut au lieu de recevoir NULL).
mkdirSync(`${S}/lots`, { recursive: true });
const depots = []; const comptes = {};
for (const [t, lignes] of tables) {
  const sc = schema[t];
  const cols = new Set(sc.map((c) => c[0]));
  const genere = new Set(sc.filter((c) => c[4] === 'ALWAYS').map((c) => c[0]));
  const aId = cols.has('id');
  const parCles = new Map();
  for (const brute of lignes) {
    if (NE_PAS_INSERER.has(brute.id)) continue;
    const r = ajuster(t, reecrire(structuredClone(brute), t));
    for (const k of Object.keys(r)) if (!cols.has(k) || genere.has(k)) delete r[k];
    const cle = Object.keys(r).sort().join(',');
    if (!parCles.has(cle)) parCles.set(cle, []);
    parCles.get(cle).push(r);
  }
  for (const [cle, rs] of parCles) {
    for (let i = 0; i < rs.length; i += 150) {
      const morceau = rs.slice(i, i + 150);
      depots.push({ ordre: depots.length + 1, table_nom: t, colonnes: cle.split(','), lignes: morceau });
      comptes[t] = (comptes[t] || 0) + morceau.length;
    }
  }
}
mkdirSync(`${S}/depots`, { recursive: true });
for (const d of depots) writeFileSync(`${S}/depots/${String(d.ordre).padStart(3, '0')}.json`, JSON.stringify({ p_secret: '__SECRET__', p_ordre: d.ordre, p_table: d.table_nom, p_colonnes: d.colonnes, p_lignes: d.lignes }));
writeFileSync(`${S}/comptes.json`, JSON.stringify(comptes, null, 1));
const tailles = depots.map((d) => JSON.stringify(d).length);
console.log('dépôts', depots.length, 'plus gros', Math.round(Math.max(...tailles) / 1024), 'Ko', 'total', Math.round(tailles.reduce((a, b) => a + b, 0) / 1024), 'Ko');
console.log('lignes', Object.values(comptes).reduce((a, b) => a + b, 0), 'tables', Object.keys(comptes).length);
console.log('remplacements hors colonnes d\'identifiant :', [...remplacements].slice(0, 40));
