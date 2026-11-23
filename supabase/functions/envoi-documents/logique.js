// SAMPER CONSULTING - envoi-documents : règles pures (sans Deno, sans réseau)
//
// Tout ce qui décide d'un envoi sans parler à Brevo ni à Supabase vit ici,
// pour être essayé sous Node (logique.test.mjs) : lecture des adresses,
// choix entre pièce jointe et lien, corps du message envoyé à Brevo.

// Brevo ne publie pas de plafond clair pour une pièce jointe en base64 sur
// l'envoi transactionnel ; 4 Mo est le plafond de ses campagnes. Au-delà, le
// message porte un lien signé vers le fichier au lieu de la pièce.
export const TAILLE_PIECE_MAX = 4 * 1024 * 1024;

// Extensions que Brevo accepte en pièce jointe et que Documents produit. Un
// autre format (WebP, HEIC) part en lien, Brevo refuserait l'envoi entier.
const EXTENSIONS_JOINTES = new Set(['pdf', 'jpg', 'jpeg', 'png', 'gif', 'csv', 'txt', 'doc', 'docx', 'xls', 'xlsx', 'odt']);

export const DESTINATAIRES_MAX = 10;
export const OBJET_MAX = 200;
export const MESSAGE_MAX = 20000;
export const LIEN_JOURS = 7;

const ADRESSE = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;

// « a@x.ch, b@y.ch ; c@z.ch » ou une liste : adresses nettoyées, en minuscules,
// sans doublon. Une adresse mal formée est rendue à part pour être nommée.
export function lireAdresses(valeur) {
  const brut = Array.isArray(valeur) ? valeur : String(valeur ?? '').split(/[,;\n]/);
  const valides = [];
  const invalides = [];
  for (const morceau of brut) {
    const adresse = String(morceau ?? '').trim().toLowerCase();
    if (!adresse) continue;
    if (!ADRESSE.test(adresse)) { invalides.push(adresse); continue; }
    if (!valides.includes(adresse)) valides.push(adresse);
  }
  return { valides, invalides };
}

// Contrôle de la demande avant toute lecture de fichier. Rend { erreur } ou
// la demande propre { a, cc, objet, message }.
export function verifierDemande({ a, cc, objet, message }) {
  const dest = lireAdresses(a);
  const copie = lireAdresses(cc);
  const invalides = [...dest.invalides, ...copie.invalides];
  if (invalides.length) return { erreur: `Adresse e-mail non valable : ${invalides.join(', ')}` };
  if (!dest.valides.length) return { erreur: 'Indiquez au moins un destinataire.' };
  const ccSansDoublon = copie.valides.filter((x) => !dest.valides.includes(x));
  if (dest.valides.length + ccSansDoublon.length > DESTINATAIRES_MAX) {
    return { erreur: `${DESTINATAIRES_MAX} destinataires au plus par envoi.` };
  }
  const objetPropre = String(objet ?? '').replace(/\s+/g, ' ').trim();
  if (!objetPropre) return { erreur: "Indiquez l'objet du message." };
  if (objetPropre.length > OBJET_MAX) return { erreur: `L'objet dépasse ${OBJET_MAX} caractères.` };
  const messagePropre = String(message ?? '').replace(/\r\n/g, '\n').trim();
  if (messagePropre.length > MESSAGE_MAX) return { erreur: 'Le message est trop long.' };
  return { a: dest.valides, cc: ccSansDoublon, objet: objetPropre, message: messagePropre };
}

function extension(nom) {
  const m = /\.([a-z0-9]+)$/i.exec(String(nom ?? ''));
  return m ? m[1].toLowerCase() : '';
}

// Pièce jointe si Brevo l'accepte et si elle tient sous le plafond, lien sinon.
export function modePiece({ nom, taille }) {
  if (!EXTENSIONS_JOINTES.has(extension(nom))) return 'lien';
  const t = Number(taille);
  if (!Number.isFinite(t) || t <= 0 || t > TAILLE_PIECE_MAX) return 'lien';
  return 'jointe';
}

export function echapperHtml(texte) {
  return String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Corps de la requête POST /v3/smtp/email. `piece` : { nom, contenu } en
// base64, ou null ; `lien` : URL signée quand le fichier part en lien.
export function construireCourriel({ expediteur, a, cc, objet, message, piece, lien, nomFichier }) {
  let texte = message || '';
  if (lien) {
    const ajout = `Le document « ${nomFichier} » est à télécharger ici (lien valable ${LIEN_JOURS} jours) :\n${lien}`;
    texte = texte ? `${texte}\n\n${ajout}` : ajout;
  }
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55">${echapperHtml(texte).replace(/\n/g, '<br>')}</div>`;
  const corps = {
    sender: { name: expediteur.name, email: expediteur.email },
    replyTo: { name: expediteur.name, email: expediteur.email },
    to: a.map((email) => ({ email })),
    subject: objet,
    textContent: texte || objet,
    htmlContent: html,
    tags: ['app-documents'],
  };
  // Brevo refuse une liste vide : la copie n'est posée que si elle existe.
  if (cc.length) corps.cc = cc.map((email) => ({ email }));
  if (piece) corps.attachment = [{ name: piece.nom, content: piece.contenu }];
  return corps;
}
