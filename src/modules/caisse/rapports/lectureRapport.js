// ─────────────────────────────────────────────────────────────────────────────
// Lecture des rapports de la caisse et production des fichiers, côté
// navigateur. Les calculs sont dans calculRapports.js, les feuilles dans
// exportsRapport.js, le PDF dans pdfRapport.js : ici, seulement l'enchaînement
// (lire par tranches, calculer, construire, télécharger).
// ─────────────────────────────────────────────────────────────────────────────

import * as caisse from '../../../services/caisseService.js';
import { telechargerFichier } from '../../inventaire/exportXlsxInventaire.js';
import { comparaison, fusionnerDonnees, rapportCaisse } from './calculRapports.js';
import { nomFichierDossier, nomFichierRapport, csvRapport, xlsxRapport, zipCsvRapport, zipDossier } from './exportsRapport.js';
import { clePeriode, periodeLibre, periodePrecedente, tranches } from './periodesCaisse.js';

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Toutes les données d'une fenêtre, tranche après tranche (la base refuse
// plus de 62 jours d'un coup). → { data, error } ; jamais des données
// partielles : une tranche en échec fait échouer la lecture.
export async function lireFenetre(etablissementId, debut, fin) {
  const morceaux = [];
  for (const t of tranches(debut, fin, 31)) {
    const { data, error } = await caisse.rapportDonnees(etablissementId, t.debut, t.fin);
    if (error) return { data: null, error };
    morceaux.push(data);
  }
  return { data: fusionnerDonnees(morceaux), error: null };
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
