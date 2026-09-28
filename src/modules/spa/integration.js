// ─────────────────────────────────────────────────────────────────────────────
// Liens et codes d'intégration de la réservation en ligne d'un spa.
//
// Partagés par l'onglet « En ligne » du module et par le guide public
// d'installation (/reserver/<adresse>/integrer), pour que la personne qui gère
// le site copie exactement ce que le spa voit dans l'app.
//
// L'origine est toujours la production : le site du spa doit pointer vers
// samperconsulting-app.com, même si le réglage est fait depuis une préversion.
// ─────────────────────────────────────────────────────────────────────────────

export const ORIGINE_PUBLIQUE = 'https://samperconsulting-app.com';
export const COULEUR_DEFAUT = '#2f6f77';

const COULEUR_OK = /^#[0-9a-f]{6}$/i;
const attrCouleur = (couleur) => (
  couleur && COULEUR_OK.test(couleur) && couleur.toLowerCase() !== COULEUR_DEFAUT ? ` data-couleur="${couleur.toLowerCase()}"` : ''
);

export const lienReservation = (slug) => `${ORIGINE_PUBLIQUE}/reserver/${slug}`;

export function lienGuide(slug, couleur) {
  const c = couleur && COULEUR_OK.test(couleur) && couleur.toLowerCase() !== COULEUR_DEFAUT
    ? `?couleur=${couleur.slice(1).toLowerCase()}` : '';
  return `${ORIGINE_PUBLIQUE}/reserver/${slug}/integrer${c}`;
}

// Bouton « Réserver un soin » placé là où le code est collé.
export const codeBouton = (slug, couleur) => (
  `<script src="${ORIGINE_PUBLIQUE}/widget-spa.js" data-spa="${slug}"${attrCouleur(couleur)} async></script>`
);

// Réservation affichée directement dans la page.
export const codeIntegre = (slug, couleur) => (
  `<div id="reservation-spa"></div>\n<script src="${ORIGINE_PUBLIQUE}/widget-spa.js" data-spa="${slug}" data-mode="integre" data-cible="#reservation-spa"${attrCouleur(couleur)} async></script>`
);

// Sans bouton ajouté : les boutons et liens du site qui mènent au lien de
// réservation l'ouvrent par-dessus le site au lieu de changer de page. À
// placer une fois pour tout le site (pied de page).
export const codeLiens = (slug, couleur) => (
  `<script src="${ORIGINE_PUBLIQUE}/widget-spa.js" data-spa="${slug}" data-bouton="non"${attrCouleur(couleur)} async></script>`
);

// E-mail préécrit pour la personne qui gère le site du spa.
export function messageWebmaster({ nomSpa, slug, couleur }) {
  const nom = nomSpa || 'le spa';
  return {
    sujet: `Réservation en ligne ${nom} : à ajouter sur le site`,
    corps: [
      'Bonjour,',
      '',
      `Nous ouvrons la réservation en ligne de nos soins (${nom}). Pourriez-vous l'ajouter sur notre site ?`,
      '',
      'Le plus simple : mettre ce lien sur le bouton « Réserver » du site, et dans le menu :',
      lienReservation(slug),
      '',
      'Pour aller plus loin (réservation par-dessus le site, ou dans une page), tout est expliqué pas à pas ici, pour WordPress, Wix, Squarespace, Webflow et les autres sites :',
      lienGuide(slug, couleur),
      '',
      'Merci beaucoup,',
    ].join('\n'),
  };
}

// Brouillon Gmail préécrit (même principe que les factures), mailto en repli.
export function lienGmail({ a = '', sujet, corps }) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', tf: '1', to: a, su: sujet, body: corps });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
export function lienMailto({ a = '', sujet, corps }) {
  return `mailto:${encodeURIComponent(a)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}
