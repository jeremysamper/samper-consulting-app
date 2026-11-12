import TarifsGestion from './TarifsGestion.jsx';
import { useChambres, useReglagesHotel, useTarifs } from './hotelData.js';
import { Vide } from './hotelUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Hébergement : tarifs et taxes » de la page des réglages : monte
// TarifsGestion tel quel, avec les mêmes lectures que le module (tarifs,
// réglages de l'hôtel, chambres pour les catégories).
//
// L'écran n'est rendu qu'une fois tarifs et réglages lus : un formulaire de
// réglages ouvert avant la lecture enregistrerait une seconde ligne au lieu de
// modifier celle de l'établissement.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionTarifsHotel({ etablissement }) {
  const etabId = etablissement?.id || null;
  const tarifs = useTarifs(etabId);
  const reglages = useReglagesHotel(etabId);
  const chambres = useChambres(etabId);
  if (!etabId) return null;
  const enLecture = [tarifs, reglages].some((t) => t.status === 'loading');
  return (
    <section className="hebergement" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      {enLecture
        ? <Vide>Chargement…</Vide>
        : <TarifsGestion tarifs={tarifs} reglages={reglages} chambres={chambres.rows} etabId={etabId} />}
    </section>
  );
}
