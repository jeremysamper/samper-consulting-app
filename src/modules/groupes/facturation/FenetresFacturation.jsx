import { useCallback, useState } from 'react';
import DevisEditeur from './DevisEditeur.jsx';
import FactureFenetre from './FactureFenetre.jsx';
import PlanFacturation from './PlanFacturation.jsx';
import { notify } from '../../../components/toast/index.js';

// Les fenêtres des devis et des factures, ouvertes depuis l'onglet « Devis et
// factures » comme depuis la fiche d'un groupe. Une seule à la fois, sauf le
// plan de facturation posé sur son devis ; passer de l'une à l'autre en ferme
// une et en ouvre une (une entrée d'historique chacune, via Fenetre).

export function useFenetresFacturation() {
  const [ouvert, setOuvert] = useState(null); // { type: 'devis' | 'facture' | 'plan', doc }
  const fermer = useCallback(() => setOuvert(null), []);
  return {
    ouvert,
    fermer,
    ouvrirDevis: useCallback((doc) => setOuvert({ type: 'devis', doc }), []),
    ouvrirFacture: useCallback((doc) => setOuvert({ type: 'facture', doc }), []),
  };
}

export default function FenetresFacturation({ fenetres, ctx }) {
  const { ouvert, fermer, ouvrirDevis, ouvrirFacture } = fenetres;
  const [plan, setPlan] = useState(null);
  if (!ouvert && !plan) return null;

  return (
    <>
      {ouvert?.type === 'devis' && (
        <DevisEditeur
          key={ouvert.doc?.id || 'nouveau'}
          devis={ouvert.doc}
          ctx={ctx}
          onClose={(r) => (r?.rouvrir ? ouvrirDevis(r.rouvrir) : fermer())}
          onFacturer={(d) => setPlan(d)}
          onOuvrirFacture={ouvrirFacture}
        />
      )}
      {ouvert?.type === 'facture' && (
        <FactureFenetre key={ouvert.doc.id} facture={ouvert.doc} ctx={ctx} onClose={fermer} />
      )}
      {plan && (
        <PlanFacturation
          devis={plan}
          ctx={ctx}
          onClose={() => setPlan(null)}
          onCree={(factures) => {
            setPlan(null);
            // Une facture créée seule s'ouvre (un solde à ajuster, une facture
            // à envoyer) ; plusieurs : le devis reste ouvert sur son suivi.
            if (factures.length === 1) ouvrirFacture(factures[0]);
            else if (!factures.length) notify('Aucune facture créée.', 'warning');
          }}
        />
      )}
    </>
  );
}
