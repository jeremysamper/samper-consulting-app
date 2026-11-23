// Moteur du bouton « Voir » du tour des nouveautés : change de rôle ou de coque
// si besoin (la page se recharge, le tour reprend), ouvre la page, joue les
// touches de l'étape et met l'élément en évidence.
import { navigateToPage, ouvrirCompte } from '../../services/navigationService.js';
import { choisirRole, roleCourant } from '../fauxSupabase.js';
import { STOCKAGE, PREFIXE } from '../isolation.js';

const CLE_ETAT = PREFIXE + 'tour';
const CLES_PAR_ROLE = ['samper-auth', 'sc_profile_snapshot', 'sc_page', 'sc_permissions_perso'];
export const RACINE_TOUR = 'demo-nouveautes';

// ── État du tour, gardé dans le stockage de l'onglet ─────────────────────────

const ETAT_DE_DEPART = { ouvert: true, mode: 'liste', courant: null, vues: [], avant: false, attente: null, coqueAvant: null, defilement: 0, lot: 'tous' };

export function lireEtat() {
  try {
    return { ...ETAT_DE_DEPART, ...(JSON.parse(STOCKAGE.getItem(CLE_ETAT) || 'null') || {}) };
  } catch {
    return { ...ETAT_DE_DEPART };
  }
}

export function ecrireEtat(etat) {
  try { STOCKAGE.setItem(CLE_ETAT, JSON.stringify(etat)); } catch { /* stockage plein : l'état reste en mémoire */ }
}

// ── Recherche d'un élément par son texte ─────────────────────────────────────

const norm = (s) => String(s || '').replace(/[\s  ]+/g, ' ').trim().toLowerCase();

// Ni le panneau, ni le bandeau de la démo, ni le menu de la coque (un nom de
// module y redit souvent le texte cherché).
function horsDuTour(el) {
  return !el.closest(`#${RACINE_TOUR}, #demo-bandeau, [class*="sc-nav"]`);
}

function estVisible(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
}

// L'élément visible le plus profond dont le texte contient la cible (ou, en
// mode exact, vaut la cible). Une cible peut aussi être un sélecteur CSS.
// dans : texte d'une ligne voisine ; la cible est cherchée dans le plus proche
// bloc qui contient cette ligne (le « Gérer » d'un frigo précis, par exemple).
export function trouver(cible) {
  if (!cible) return null;
  const { texte, selecteur, exact = false, rang = 0, dans = null } = typeof cible === 'string' ? { texte: cible } : cible;
  if (dans) {
    let bloc = trouver(dans);
    for (let i = 0; bloc && i < 8; i += 1, bloc = bloc.parentElement) {
      const ici = [...bloc.querySelectorAll('*')].filter((el) => horsDuTour(el) && estVisible(el) && (exact ? norm(el.textContent) === norm(texte) : norm(el.textContent).includes(norm(texte))) && ![...el.children].some((c) => norm(c.textContent).includes(norm(texte))));
      if (ici.length) return ici[rang] || ici[0];
    }
    return null;
  }
  let candidats;
  if (selecteur) {
    candidats = [...document.querySelectorAll(selecteur)].filter((el) => !el.closest(`#${RACINE_TOUR}`) && estVisible(el));
    if (texte) candidats = candidats.filter((el) => norm(el.textContent).includes(norm(texte)));
    return candidats[rang] || null;
  }
  const aiguille = norm(texte);
  // Une liste déroulante se lit par son choix affiché, pas par toutes ses options.
  const texteDe = (el) => (el.tagName === 'SELECT'
    ? (el.selectedOptions?.[0]?.textContent || '')
    : (el.textContent || el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || ''));
  const accepte = (el) => {
    const t = norm(texteDe(el));
    return exact ? t === aiguille : t.includes(aiguille);
  };
  const ignores = ['SCRIPT', 'STYLE', 'svg', 'path', 'OPTION', 'OPTGROUP'];
  const tous = [...document.body.querySelectorAll('*')].filter((el) => !ignores.includes(el.tagName) && horsDuTour(el));
  const trouves = tous.filter((el) => accepte(el) && ![...el.children].some((c) => !ignores.includes(c.tagName) && accepte(c)) && estVisible(el));
  const sansTexte = !trouves.length ? tous.filter((el) => norm(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title')).includes(aiguille) && estVisible(el)) : [];
  return (trouves.length ? trouves : sansTexte)[rang] || null;
}

const CLIQUABLE = 'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, label, select';

function attendre(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function attendreElement(cible, delai = 7000) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    const el = trouver(cible);
    if (el) return el;
    await attendre(150);
  }
  return null;
}

function cliquer(el) {
  const cible = el.closest(CLIQUABLE) || el;
  cible.scrollIntoView({ block: 'center', inline: 'nearest' });
  const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  cible.dispatchEvent(new window.PointerEvent('pointerdown', opts));
  cible.dispatchEvent(new window.MouseEvent('mousedown', opts));
  cible.dispatchEvent(new window.PointerEvent('pointerup', opts));
  cible.dispatchEvent(new window.MouseEvent('mouseup', opts));
  cible.click();
}

// ── Mise en évidence ─────────────────────────────────────────────────────────

let anneau = null;
let suivi = null;

export function effacerEvidence() {
  if (suivi) cancelAnimationFrame(suivi);
  suivi = null;
  anneau?.remove();
  anneau = null;
}

const encadre = (el) => el.closest('button, a, [role="tab"], [role="button"]') || el;

// L'anneau suit l'élément ; si l'écran le redessine (nouvel élément pour le
// même texte), il le retrouve par la même cible.
export function mettreEnEvidence(el, spec = null) {
  effacerEvidence();
  if (!el) return;
  let cible = encadre(el);
  cible.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  anneau = document.createElement('div');
  anneau.setAttribute('aria-hidden', 'true');
  anneau.dataset.tourAnneau = '';
  Object.assign(anneau.style, {
    position: 'fixed', zIndex: '2147483000', pointerEvents: 'none', borderRadius: 'var(--r)',
    borderWidth: '3px', borderStyle: 'solid', borderColor: 'var(--focus-ring)', boxShadow: 'var(--sh-lg)',
    transition: 'top 0.15s, left 0.15s, width 0.15s, height 0.15s',
  });
  document.body.appendChild(anneau);
  const debut = Date.now();
  let derniereRecherche = 0;
  const placer = () => {
    if (!anneau) return;
    if (Date.now() - debut > 120000) { effacerEvidence(); return; }
    if (!cible.isConnected) {
      anneau.style.display = 'none';
      if (spec && Date.now() - derniereRecherche > 400) {
        derniereRecherche = Date.now();
        const autre = trouver(spec);
        if (autre) cible = encadre(autre);
      }
      suivi = requestAnimationFrame(placer);
      return;
    }
    anneau.style.display = '';
    const r = cible.getBoundingClientRect();
    Object.assign(anneau.style, { top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    suivi = requestAnimationFrame(placer);
  };
  placer();
}

// ── Coque et rôle ────────────────────────────────────────────────────────────

const coqueCourante = () => window.localStorage.getItem('sc_shell') || '';

function coqueVoulue(item, etat) {
  if (item.coque) return item.coque;
  return etat.coqueAvant != null ? etat.coqueAvant : coqueCourante();
}

// La coque de l'app est montée (le gestionnaire de navigation est posé au même
// moment) : sans elle, navigateToPage rechargerait la page.
async function attendreApp() {
  const fin = Date.now() + 15000;
  while (Date.now() < fin) {
    if (document.querySelector('main:not(.migration-page)') && !document.getElementById('pre-splash')) return true;
    await attendre(150);
  }
  return false;
}

// Ferme une fenêtre ou un menu restés ouverts par la nouveauté précédente.
async function fermerCalques() {
  for (let i = 0; i < 2; i += 1) {
    document.activeElement?.blur?.();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    await attendre(120);
  }
}

// Démo rouverte sans ?nouveautes=1 dans le même onglet : la coque que le tour
// avait imposée (tablette du lot 3) est rendue.
export function rendreLaCoque() {
  const etat = lireEtat();
  if (etat.coqueAvant == null) return;
  if (etat.coqueAvant) window.localStorage.setItem('sc_shell', etat.coqueAvant);
  else window.localStorage.removeItem('sc_shell');
  ecrireEtat({ ...etat, coqueAvant: null });
}

// Ce que demande la nouveauté qui ne peut pas se faire sans recharger.
export function rechargementNecessaire(item) {
  const etat = lireEtat();
  return roleCourant() !== item.role || coqueVoulue(item, etat) !== coqueCourante();
}

function preparerRechargement(item) {
  const etat = lireEtat();
  const voulue = coqueVoulue(item, etat);
  if (item.coque && etat.coqueAvant == null) etat.coqueAvant = coqueCourante();
  if (!item.coque) etat.coqueAvant = null;
  etat.attente = { id: item.id };
  ecrireEtat(etat);
  if (roleCourant() !== item.role) {
    choisirRole(item.role);
    CLES_PAR_ROLE.forEach((k) => window.localStorage.removeItem(k));
  }
  if (voulue) window.localStorage.setItem('sc_shell', voulue);
  else window.localStorage.removeItem('sc_shell');
  // La page de la nouveauté s'ouvre dès le lancement.
  window.localStorage.setItem('sc_page', item.page);
  if (item.reglages) window.localStorage.setItem('sc_compte_tab', item.reglages);
  window.location.reload();
}

// Joue une nouveauté. Rend { ok, element, etape } : etape nomme la touche ou
// l'élément introuvable quand ok est faux. apresRechargement : la page de la
// nouveauté a été posée avant le rechargement et s'ouvre au lancement ; ne pas
// naviguer tant que l'app n'a peut-être pas posé son gestionnaire.
export async function voir(item, { recharger = true, apresRechargement = false } = {}) {
  effacerEvidence();
  if (rechargementNecessaire(item)) {
    if (!recharger) return { ok: false, etape: 'rechargement' };
    preparerRechargement(item);
    return { ok: true, recharge: true };
  }
  if (!(await attendreApp())) return { ok: false, etape: 'application' };
  const dejaOuverte = apresRechargement && window.localStorage.getItem('sc_page') === item.page;
  if (dejaOuverte) await attendre(600);
  else {
    await fermerCalques();
    if (item.reglages) ouvrirCompte(item.reglages);
    else navigateToPage(item.page);
    await attendre(450);
  }
  for (const touche of item.etapes || []) {
    const el = await attendreElement(touche);
    if (!el) return { ok: false, etape: typeof touche === 'string' ? touche : (touche.texte || touche.selecteur) };
    cliquer(el);
    await attendre(500);
  }
  const el = await attendreElement(item.cible, 8000);
  if (!el) return { ok: false, etape: typeof item.cible === 'string' ? item.cible : (item.cible?.texte || item.cible?.selecteur) };
  mettreEnEvidence(el, item.cible);
  return { ok: true, element: el };
}
