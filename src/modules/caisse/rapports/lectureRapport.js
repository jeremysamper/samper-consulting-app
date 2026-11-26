// ─────────────────────────────────────────────────────────────────────────────
// Lecture des rapports de la caisse et production des fichiers, côté
// navigateur. Les calculs sont dans calculRapports.js, les feuilles dans
// exportsRapport.js, le PDF dans pdfRapport.js : ici, seulement l'enchaînement
// (lire par tranches, calculer, construire, télécharger).
// ─────────────────────────────────────────────────────────────────────────────

import * as caisse from '../../../services/caisseService.js';
import * as tpe from '../../../services/caisseTpeService.js';
import { listMouvementsRapport } from '../../../services/caisseBonsCadeauxService.js';
import { telechargerFichier } from '../../inventaire/exportXlsxInventaire.js';
import { comparaison, fusionnerDonnees, rapportCaisse } from './calculRapports.js';
import { nomFichierDossier, nomFichierRapport, csvRapport, xlsxRapport, zipCsvRapport, zipDossier } from './exportsRapport.js';
import { clePeriode, periodeLibre, periodePrecedente, tranches } from './periodesCaisse.js';
import { lirePeriode } from '../../planning/contratsService.js';
import { heuresFaites } from '../../planning/soldesHeures.js';
import { findUtilisateur, userDisplayName } from '../../../utils/userDisplay.js';
import { repartirPourboires } from '../pourboires.js';

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Toutes les données d'une fenêtre, tranche après tranche (la base refuse
// plus de 62 jours d'un coup). → { data, error } ; jamais des données
// partielles : une tranche en échec fait échouer la lecture.
export async function lireFenetre(etablissementId, debut, fin) {
  const morceaux = [];
  for (const t of tranches(debut, fin, 31)) {
    const { data, error } = await caisse.rapportDonnees(etablissementId, t.debut, t.fin);
    if (error) return { data: null, error };
    // v9 : pour la direction, les paiements passés par un terminal relié
    // sont marqués (relie). La base ne rend ces liens qu'à consultant et
    // patron ; une lecture en échec fait échouer le rapport, pour ne jamais
    // compter une carte reliée comme une carte saisie à la main.
    if (data?.niveau === 'direction' && (data.paiements || []).length) {
      const liens = await tpe.rapportTpe(etablissementId, t.debut, t.fin);
      if (liens.error) return { data: null, error: liens.error };
      const parPaiement = new Map((liens.data?.liens || []).map((l) => [l.paiement_id, l]));
      data.paiements = data.paiements.map((p) => (parPaiement.has(p.id)
        ? { ...p, relie: true, terminal_id: parPaiement.get(p.id).terminal_id }
        : p));
    }
    morceaux.push(data);
  }
  const donnees = fusionnerDonnees(morceaux);
  // Bons cadeaux (19.11.2026), direction seulement, comme les paiements : le
  // registre jusqu'à la fin de la fenêtre (en circulation se rejoue depuis
  // l'origine). Une lecture en échec fait échouer le rapport, comme les liens
  // des terminaux : jamais une dette de bons comptée à moitié.
  if (donnees?.niveau === 'direction') {
    const bons = await listMouvementsRapport(etablissementId, fin);
    if (bons.error) return { data: null, error: bons.error };
    donnees.bons = bons.data;
  }
  return { data: donnees, error: null };
}

// Le rapport d'une période, et sa comparaison quand elle a un sens : la
// période précédente n'est lue que si la période affichée est finie.
//   → { data: { donnees, rapport, comparaison }, error }
export async function lireRapport(etablissementId, periode) {
  const { data: donnees, error } = await lireFenetre(etablissementId, periode.debut, periode.fin);
  if (error) return { data: null, error };
  const rapport = rapportCaisse(donnees, periode);
  let compare = null;
  if (rapport.jourCourant && periode.fin < rapport.jourCourant && !rapport.provisoire && donnees.premier_jour) {
    const avant = periodePrecedente(periode);
    if (avant && donnees.premier_jour <= avant.debut) {
      const lu = await lireFenetre(etablissementId, avant.debut, avant.fin);
      // La comparaison est un plus : son échec ne retire pas le rapport.
      if (!lu.error) compare = comparaison(rapport, rapportCaisse(lu.data, avant), donnees.premier_jour);
    }
  }
  return { data: { donnees, rapport, comparaison: compare }, error: null };
}

// ── Partage des pourboires d'une période (lot 11 du panel) ──
// Les horaires de la période (lirePeriode, lecture stricte qui lève une
// exception), les heures pointées retenues de chacun (heuresFaites), son nom
// et son groupe (groupeDe du crochet usePlanningGroupes), puis le partage du
// total du rapport. Sans règle, rien n'est lu. Une personne absente de la
// liste des utilisateurs (partie de la maison) passe avec son seul
// identifiant : rangée par son affectation si elle en a une, sinon hors
// partage. Une lecture en échec rend une erreur, jamais un partage vide.
//   → { data: partage (repartirPourboires), error }
export async function lirePartagePourboires(etablissementId, periode, { regle, total, groupes, groupeDe }) {
  if (!regle) return { data: repartirPourboires({ total, regle: null, personnes: [], groupes }), error: null };
  let shifts;
  try {
    ({ shifts } = await lirePeriode(etablissementId, periode.debut, periode.fin));
  } catch (e) {
    console.error('[caisse] heures du partage des pourboires', e);
    return { data: null, error: "Les heures pointées n'ont pas pu être lues. Réessayez." };
  }
  const parPersonne = new Map();
  (shifts || []).forEach((s) => {
    if (!s?.userId || !s.pointageDebut || !s.pointageFin) return;
    if (!parPersonne.has(s.userId)) parPersonne.set(s.userId, []);
    parPersonne.get(s.userId).push(s);
  });
  const personnes = [...parPersonne.entries()].map(([id, liste]) => {
    const u = findUtilisateur(id);
    return {
      id,
      nom: userDisplayName(id),
      groupeId: typeof groupeDe === 'function' ? groupeDe(u ? { id, role: u.role } : { id }) : null,
      heures: heuresFaites(liste),
    };
  });
  return { data: repartirPourboires({ total, regle, personnes, groupes }), error: null };
}

// ── Fichiers d'un rapport déjà à l'écran ──
export function telechargerExcel(rapport, options) {
  telechargerFichier(xlsxRapport(rapport, options), nomFichierRapport(rapport.periode, 'xlsx'), MIME_XLSX);
}
export function telechargerCsvZip(rapport, options) {
  telechargerFichier(zipCsvRapport(rapport, options), nomFichierRapport(rapport.periode, 'csv'), 'application/zip');
}
export function telechargerCsv(rapport, id, options) {
  const texte = csvRapport(rapport, id, options);
  if (texte == null) return false;
  telechargerFichier(new TextEncoder().encode(texte), `caisse_${clePeriode(rapport.periode)}_${id}.csv`, 'text/csv;charset=utf-8');
  return true;
}
export async function construirePdf({ rapport, etablissement, reglages, comparaison: compare = null, noShow = null }) {
  const { construireSynthese } = await import('./pdfRapport.js');
  return construireSynthese({ rapport, etablissement, reglages, comparaison: compare, noShow });
}

// ── Dossier fiduciaire d'une période, en un geste ──
// Lit la période (direction seulement : la base refuse les autres), lance le
// contrôle de la chaîne d'intégrité, construit la synthèse en PDF et rend le
// zip. Un contrôle de chaîne en échec ne bloque pas le dossier : le fichier
// integrite.txt le dit.
//   → { data: { octets, nom, rapport }, error }
export async function construireDossier({ etablissement, reglages, debut, fin }) {
  const periode = periodeLibre(debut, fin);
  if (!periode) return { data: null, error: 'Choisissez deux dates.' };
  const etabId = etablissement?.id;
  const { data: donnees, error } = await lireFenetre(etabId, periode.debut, periode.fin);
  if (error) return { data: null, error };
  if (donnees.niveau !== 'direction') return { data: null, error: "Vous n'avez pas les droits pour cette action." };
  const rapport = rapportCaisse(donnees, periode);
  const { data: chaine } = await caisse.verifierChaine(etabId);
  let pdf = null;
  try {
    const doc = await construirePdf({ rapport, etablissement, reglages });
    pdf = new Uint8Array(doc.output('arraybuffer'));
  } catch (e) {
    console.error('[caisse] synthèse du dossier', e);
  }
  const octets = zipDossier({ donnees, rapport, chaine: chaine || null, pdf, etablissement: etablissement?.nom || '' });
  return { data: { octets, nom: nomFichierDossier(periode), rapport }, error: null };
}

export async function telechargerDossier(args) {
  const { data, error } = await construireDossier(args);
  if (error) return { data: null, error };
  telechargerFichier(data.octets, data.nom, 'application/zip');
  return { data, error: null };
}
