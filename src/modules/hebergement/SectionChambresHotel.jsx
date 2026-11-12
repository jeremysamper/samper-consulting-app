import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import ChambresGestion from './ChambresGestion.jsx';
import { useChambres } from './hotelData.js';

// Section « Hébergement : chambres » de la page des réglages : monte
// ChambresGestion tel quel, avec la même lecture et les mêmes écritures que
// le module (droit « Modifier » de l'Hébergement pour créer et modifier).
export default function SectionChambresHotel({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const chambres = useChambres(etabId);
  if (!etabId) return null;
  return (
    <section className="hebergement" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      <ChambresGestion
        chambres={chambres}
        peutGerer={canManageModule(user?.role, 'hebergement')}
        onCreer={(valeurs) => chambres.inserer(valeurs).then((r) => { if (!r.error) notify('Chambre créée.', 'success'); return r; })}
        onModifier={(id, valeurs) => chambres.modifier(id, valeurs).then((r) => { if (!r.error) notify('Chambre modifiée.', 'success'); return r; })}
      />
    </section>
  );
}
