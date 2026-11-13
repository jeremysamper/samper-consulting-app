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

// Statistiques sur une vue préréglée : une famille (sa première mesure) ou des
// mesures nommées, sur une période ('jour', '7j', '30j', 'mois', 'trimestre',
// 'annee', ou { id: 'libre', debut, fin }). Clé ponctuelle lue au montage,
// événement pour un module déjà monté, puis la page. Ce que la personne ne
// voit pas dans le module n'est pas ouvert par le lien.
// S3 : un raccourci d'écran d'analyse peut aussi nommer le pas, la
// comparaison et plusieurs graphiques préréglés (`graphiques`, voir
// statistiques/raccourcisStatistiques.js).
export function ouvrirStatistiques({ famille = null, mesures = [], periode = null, pas = null, comparaison = null, graphiques = null, raccourci = null, vue = null, chiffres = null } = {}) {
  if (famille || (mesures && mesures.length) || (graphiques && graphiques.length)) {
    const demande = { famille, mesures: mesures || [], periode };
    if (pas) demande.pas = pas;
    if (comparaison) demande.comparaison = comparaison;
    if (graphiques && graphiques.length) demande.graphiques = graphiques;
    if (raccourci) { demande.raccourci = raccourci; demande.vue = vue; }
    if (chiffres && chiffres.length) demande.chiffres = chiffres;
    writeJson(UI_STORAGE_KEYS.statistiquesOuvrir, demande);
    const browserWindow = getBrowserWindow();
    browserWindow?.dispatchEvent(new browserWindow.CustomEvent('sc:statistiques-ouvrir', { detail: demande }));
  }
  navigateToPage('statistiques');
}
