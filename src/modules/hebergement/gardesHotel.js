// La direction de l'hôtel : chambres, tarifs et taxes, registre, forfaits.
// Comme la RLS de tarifs, hotel_reglages et forfaits (consultant et patron).
// Rangé à part des modules de la branche Hôtel pour que la page des réglages
// lise la même garde sans charger leurs écrans.
export const estDirectionHotel = (role) => role === 'consultant' || role === 'patron';
