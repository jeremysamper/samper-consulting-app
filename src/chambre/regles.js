// Demande de l'hôte par le QR de la chambre (lot 17 du panel) : règles pures,
// partagées par la page publique (/chambre/<jeton>), sa démo et les réglages.
//
// Le serveur (demande_chambre_envoyer, migration 20261125_lot17) revérifie
// tout : ces règles guident la page avant l'envoi et rejouent la base en démo.

export const LIMITES = { note: 140, ouvertes: 6 };

const JETON = /^[0-9a-f]{32}$/;

// Le jeton d'une chambre : 32 signes hexadécimaux en minuscules.
export const jetonValide = (jeton) => typeof jeton === 'string' && JETON.test(jeton);

// Un jeton « demo... » ne touche jamais la base.
export const estJetonDemo = (jeton) => typeof jeton === 'string' && jeton.startsWith('demo');

// Note de l'hôte : caractères de contrôle retirés, espaces resserrés,
// coupée à 140 signes. Même règle que la fonction d'envoi.
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/g;
export function notePropre(texte) {
  return String(texte ?? '')
    .replace(CONTROLE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITES.note)
    .trim();
}

const champ = (s, camel, snake) => (s?.[camel] !== undefined ? s[camel] : s?.[snake]);

// Séjour retenu pour un QR (décision D4) : en maison et pas encore parti (le
// jour du départ compris), le plus récent par arrivée ; à défaut, un séjour
// prévu dont l'arrivée est passée et le départ à venir. jour : 'YYYY-MM-DD',
// date de Zurich. Lignes en camelCase ou en snake_case.
export function sejourPourQr(sejours, chambreId, jour) {
  const liste = (sejours || []).filter((s) => champ(s, 'chambreId', 'chambre_id') === chambreId);
  const parArrivee = (a, b) => String(b.arrivee).localeCompare(String(a.arrivee));
  const enMaison = liste
    .filter((s) => s.statut === 'en_maison' && String(s.depart) >= jour)
    .sort(parArrivee);
  if (enMaison.length) return enMaison[0];
  const prevus = liste
    .filter((s) => s.statut === 'prevu' && String(s.arrivee) <= jour && String(s.depart) > jour)
    .sort(parArrivee);
  return prevus[0] || null;
}

// État d'une demande, vu par l'hôte.
export function etatPourHote(statut) {
  if (statut === 'ouverte') return 'recue';
  if (statut === 'en_cours') return 'prise';
  return statut;
}

const cle = (t) => String(t ?? '').trim().toLowerCase();

// Les demandes courantes ouvertes aux hôtes, dans l'ordre de la maison. Un
// libellé ouvert mais disparu des demandes courantes n'apparaît pas.
export function demandesOuvertesAuxHotes(categories, libelles) {
  const ouverts = new Set((libelles || []).map(cle));
  const vus = new Set();
  return (categories || []).filter((c) => {
    const k = cle(c?.libelle);
    if (!k || !ouverts.has(k) || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
}
