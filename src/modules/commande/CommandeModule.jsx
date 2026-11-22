import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { readText, writeText } from '../../utils/storage.js';
import CommandeFournisseurs from './CommandeFournisseurs.jsx';
import CommandeParCarte from './Commande.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Module Commande : la commande par fournisseur (Commande V1, plan 15 lot 4)
// à l'ouverture ; la liste par carte d'avant reste à un toucher (« Liste par
// carte »), pour qui prépare encore depuis les fiches. Le choix est gardé sur
// le poste.
// ─────────────────────────────────────────────────────────────────────────────

const cleVue = (etabId) => 'sc_commande_vue_' + etabId;

export default function CommandeModule(props) {
  const etabId = props.etablissement?.id || 'etab-1';
  const [vue, setVue] = React.useState(() => readText(cleVue(etabId), 'fournisseurs'));
  React.useEffect(() => { setVue(readText(cleVue(etabId), 'fournisseurs')); }, [etabId]);
  const choisir = (v) => { setVue(v); writeText(cleVue(etabId), v); };

  if (vue === 'cartes') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div className="no-print">
          <Btn variant="ghost" onClick={() => choisir('fournisseurs')}>
            <ArrowLeft size={16} aria-hidden="true" /> Commandes par fournisseur
          </Btn>
        </div>
        <CommandeParCarte {...props} />
      </div>
    );
  }
  return <CommandeFournisseurs {...props} onParCarte={() => choisir('cartes')} />;
}
