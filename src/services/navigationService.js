import { getBrowserWindow } from '../legacy/legacyApi.js';
import { getConsultantToolsTabForPage, normalizePage } from '../modules/moduleConfig.js';
import { UI_STORAGE_KEYS, writeJson, writeText } from '../utils/storage.js';

let navigationHandler = null;

function notifyConsultantToolsTab(tab) {
  const browserWindow = getBrowserWindow();
  if (!browserWindow || !tab) return;

  browserWindow.dispatchEvent(new browserWindow.CustomEvent('sc:consultant-tools-tab', {
    detail: { tab }
  }));
}

export function setNavigationHandler(handler) {
  navigationHandler = typeof handler === 'function' ? handler : null;
}

export function navigateToPage(page, options) {
  if (!page) return;

  if (navigationHandler) {
    const consultantToolsTab = getConsultantToolsTabForPage(page);
    if (consultantToolsTab) {
      writeText(UI_STORAGE_KEYS.consultantToolsTab, consultantToolsTab);
      notifyConsultantToolsTab(consultantToolsTab);
    }
    navigationHandler(page, options);
    return;
  }

  const consultantToolsTab = getConsultantToolsTabForPage(page);
  if (consultantToolsTab) {
    writeText(UI_STORAGE_KEYS.consultantToolsTab, consultantToolsTab);
  }
  writeText(UI_STORAGE_KEYS.page, normalizePage(page));
  getBrowserWindow()?.location?.reload();
}

// Page des réglages sur une section donnée : clé ponctuelle lue au montage,
// événement pour une page déjà montée (keep-alive), puis la page. Les anciens
// onglets ('parametres', 'roles', 'alertes') sont trois de ses sections.
//
// C'est le raccourci des modules : leur entrée « Réglages » appelle
// ouvrirCompte('<section>'), le geste retour ramène au module. parDessus : à
// passer quand le raccourci part d'un écran de travail (un ticket ouvert), pour
// que cet écran garde son entrée d'historique.
export function ouvrirCompte(onglet, { parDessus = false } = {}) {
  if (onglet) {
    writeText(UI_STORAGE_KEYS.compteTab, onglet);
    const browserWindow = getBrowserWindow();
    browserWindow?.dispatchEvent(new browserWindow.CustomEvent('sc:compte-tab', { detail: { tab: onglet, raccourci: true } }));
  }
  navigateToPage('compte', parDessus ? { parDessus: true } : undefined);
}

// Fiche d'un groupe dans Groupes (réservation tenue à jour par un groupe) :
// clé ponctuelle lue au montage, événement pour un Groupes déjà monté, puis la
// page. La date sert à élargir la lecture à un groupe plus ancien.
export function ouvrirGroupe(id, date) {
  if (id) {
    const demande = { id, date: date || null };
    writeJson(UI_STORAGE_KEYS.groupesOuvrir, demande);
    const browserWindow = getBrowserWindow();
    browserWindow?.dispatchEvent(new browserWindow.CustomEvent('sc:groupes-ouvrir', { detail: demande }));
  }
  navigateToPage('groupes');
}

// Plan 15, lot 5 : trois raccourcis sur le modèle d'ouvrirGroupe (clé
// ponctuelle lue au montage, événement pour un module déjà monté, puis la
// page). Ce que la personne n'a pas le droit de voir reste fermé à l'arrivée :
// le module applique ses gardes, le lien ne les contourne pas.
function ouvrirAvec(cle, evenement, page, demande) {
  writeJson(cle, demande);
  const browserWindow = getBrowserWindow();
  browserWindow?.dispatchEvent(new browserWindow.CustomEvent(evenement, { detail: demande }));
  navigateToPage(page);
}

// Un fil d'équipe de Messages, avec un brouillon (texte d'une alerte) ou les
// noms de l'équipe du soir (soir: true).
export function ouvrirFilEquipe({ canal = 'tous', texte = '', soir = false } = {}) {
  ouvrirAvec(UI_STORAGE_KEYS.messagesOuvrir, 'sc:messages-ouvrir', 'messages', { canal, texte: String(texte || '').slice(0, 1000), soir: Boolean(soir) });
}

// Une procédure à lancer (sopId) ou une exécution à reprendre (execId).
export function ouvrirSop({ sopId = null, execId = null } = {}) {
  ouvrirAvec(UI_STORAGE_KEYS.sopOuvrir, 'sc:sop-ouvrir', 'sop', { sopId, execId });
}

// Factures & achats sur « Vérifier la lecture » de ces factures (ids), dans
// l'ordre : la Comptabilité y envoie une facture sans montant hors TVA ou
// sans taux.
export function ouvrirVerificationAchats(ids) {
  ouvrirAvec(UI_STORAGE_KEYS.achatsVerifier, 'sc:achats-verifier', 'achats', { ids: (ids || []).slice(0, 200) });
}

// Un dossier de Documents, trouvé par son nom (casse et accents ignorés).
export function ouvrirDossier(nom) {
  ouvrirAvec(UI_STORAGE_KEYS.documentsOuvrir, 'sc:documents-ouvrir', 'documents', { nom: String(nom || '') });
}

// Statistiques sur une vue préréglée : une famille (sa première mesure) ou des
// mesures nommées, sur une période ('jour', '7j', '30j', 'mois', 'trimestre',
// 'annee', ou { id: 'libre', debut, fin }). Clé ponctuelle lue au montage,
// événement pour un module déjà monté, puis la page. Ce que la personne ne
// voit pas dans le module n'est pas ouvert par le lien.
// S3 : un raccourci d'écran d'analyse peut aussi nommer le pas, la
// comparaison et plusieurs graphiques préréglés (`graphiques`, voir
// statistiques/raccourcisStatistiques.js).
export function ouvrirStatistiques({ famille = null, mesures = [], periode = null, pas = null, comparaison = null, graphiques = null, raccourci = null, vue = null, chiffres = null, tableaux = null, explications = false } = {}) {
  if (famille || (mesures && mesures.length) || (graphiques && graphiques.length)) {
    const demande = { famille, mesures: mesures || [], periode };
    if (pas) demande.pas = pas;
    if (comparaison) demande.comparaison = comparaison;
    if (graphiques && graphiques.length) demande.graphiques = graphiques;
    if (raccourci) { demande.raccourci = raccourci; demande.vue = vue; }
    if (chiffres && chiffres.length) demande.chiffres = chiffres;
    if (tableaux && tableaux.length) demande.tableaux = tableaux;
    if (explications) demande.explications = true;
    writeJson(UI_STORAGE_KEYS.statistiquesOuvrir, demande);
    const browserWindow = getBrowserWindow();
    browserWindow?.dispatchEvent(new browserWindow.CustomEvent('sc:statistiques-ouvrir', { detail: demande }));
  }
  navigateToPage('statistiques');
}
