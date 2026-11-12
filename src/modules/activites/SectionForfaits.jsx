import ForfaitsGestion from './ForfaitsGestion.jsx';
import { useForfaitDroits, useForfaits } from '../hebergement/hotelData.js';

// Section « Activités : forfaits » de la page des réglages : monte
// ForfaitsGestion tel quel, avec les mêmes lectures que le module (forfaits
// et leurs droits).
export default function SectionForfaits({ etablissement }) {
  const etabId = etablissement?.id || null;
  const forfaits = useForfaits(etabId);
  const droits = useForfaitDroits(etabId);
  if (!etabId) return null;
  return (
    <section className="activites" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      <ForfaitsGestion forfaits={forfaits} droits={droits} />
    </section>
  );
}
