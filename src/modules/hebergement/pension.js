// Règle de pension de l'hôtel, en fonctions pures (sans React ni Supabase) :
// elle se charge sous Node, contrairement à hotelData.js qui lit sa
// configuration au chargement. Lue par hotelData.js (Repas hôtel) et par la
// prévision des couverts (src/modules/previsions/previsionCouverts.js).
// Tests : pension.test.mjs.

// Ce qu'une pension comprend : demi-pension = petit-déjeuner et dîner.
export function pensionComprend(pension, repas) {
  if (pension === 'aucune') return false;
  if (repas === 'petit_dejeuner') return true;
  if (pension === 'petit_dejeuner') return false;
  if (pension === 'demi') return repas === 'diner';
  return true;
}

// Un séjour prend-il ce repas ce jour-là ? Séjours prévus ou en maison dont
// la pension comprend le repas et qui dorment la nuit concernée :
// petit-déjeuner du jour J = nuit J-1 (arrivée avant J, départ >= J) ;
// déjeuner et dîner du jour J = présents la nuit J (arrivée <= J, départ > J).
// Ne lit que statut, pension, arrivee et depart (dates AAAA-MM-JJ), communs
// aux lignes brutes de la base et aux lignes mappées.
export function sejourMange(sejour, jour, repas) {
  if (!sejour || (sejour.statut !== 'en_maison' && sejour.statut !== 'prevu')) return false;
  if (!pensionComprend(sejour.pension, repas)) return false;
  if (repas === 'petit_dejeuner') return sejour.arrivee < jour && sejour.depart >= jour;
  return sejour.arrivee <= jour && sejour.depart > jour;
}
