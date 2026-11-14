import React from 'react';
import { BookOpen, CalendarRange, ChefHat } from 'lucide-react';
import { CarteRepere } from '../../components/ui/index.jsx';
import { metaStatut } from './typesGroupe.js';
import './groupes.css';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil des Groupes (direction Galet) : la rangée de repères, posée par
// Groupes.jsx au-dessus du calendrier. Rien n'est lu en plus : les groupes
// déjà chargés, comptés par reperesGroupes (accueilGroupes.js). Aucun montant.
//   groupes à venir et leurs pax ; à lire (pas encore lus par la brigade) ;
//   lus, à préparer. Les deux derniers reprennent les mots de la légende.
// Nombres dans leurs propres nœuds : la phrase autour reste une entrée du
// glossaire. Crochets du banc : data-groupes-reperes, data-repere.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

export default function ReperesGroupes({ reperes }) {
  const lire = metaStatut('a_lire');
  const preparer = metaStatut('lu');
  return (
    <div className="grp-reperes" data-groupes-reperes="">
      {reperes.aVenir ? (
        <CarteRepere
          data-repere="a-venir"
          Icone={CalendarRange}
          valeur={reperes.aVenir}
          libelle={reperes.aVenir > 1 ? 'groupes à venir' : 'groupe à venir'}
          detail={<N>{reperes.pax} pax</N>}
        />
      ) : (
        <CarteRepere data-repere="a-venir" Icone={CalendarRange} texte="Aucun groupe à venir" />
      )}
      <CarteRepere data-repere="a-lire" Icone={BookOpen} valeur={reperes.aLire} libelle={lire.label} detail={lire.detail} />
      <CarteRepere data-repere="a-preparer" Icone={ChefHat} valeur={reperes.aPreparer} libelle={preparer.label} detail={preparer.detail} />
    </div>
  );
}
