import React from 'react';
import { CircleCheck } from 'lucide-react';
import { getModuleIcon } from '../moduleIcons.js';
import { LigneAction, Section } from './tableauBriques.jsx';
import { Btn } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// À faire maintenant : ce qui attend quelqu'un, du plus urgent au moins
// urgent (relevés HACCP en retard, groupes à lire ou à préparer, retards de
// pointage, pertes à valider, messages). Chaque ligne porte le pictogramme
// de son module (le même que sur l'accueil tactile) et mène au module quand
// le rôle y a accès. Titres et détails tels que aFaire() les écrit. Le
// nombre de lignes visibles suit la taille du widget (max) ; la suite reste
// derrière « Voir N autres points ».
// ─────────────────────────────────────────────────────────────────────────────

const MAX = 6;
const COULEURS = { danger: 'var(--danger-text)', warning: 'var(--warning-text)', info: 'var(--lien)' };

// Plan 15, lot 5 : une ligne qui porte une action (`item.action`, « Remettre »
// un cadeau, « Lancer » ou « Reprendre » une procédure) la fait en une touche,
// par son bouton : la ligne elle-même n'est plus un bouton (S4, un seul
// contrôle par ligne). Le bouton reste éteint le temps de l'écriture.
function BoutonAction({ action }) {
  const [enCours, setEnCours] = React.useState(false);
  const vivant = React.useRef(true);
  React.useEffect(() => () => { vivant.current = false; }, []);
  return (
    <Btn
      variant="ghost"
      disabled={enCours}
      style={{ minHeight: 44, flexShrink: 0 }}
      onClick={async () => {
        setEnCours(true);
        try { await action.faire(); } finally { if (vivant.current) setEnCours(false); }
      }}
    >
      {action.libelle}
    </Btn>
  );
}

export default function AFaire({ items, max = MAX, peutOuvrir, ouvrir }) {
  const [tout, setTout] = React.useState(false);
  const urgents = items.filter((i) => i.ton === 'danger').length;
  const visibles = tout ? items : items.slice(0, max);

  // « 5 points à traiter, dont 1 urgent » : nombres et mots dans leurs nœuds.
  const sousTitre = items.length ? (
    <>
      <span data-no-translate>{items.length}</span>{' '}
      <span>{items.length > 1 ? 'points à traiter' : 'point à traiter'}</span>
      {urgents > 0 && (
        <>
          <span>, dont</span>{' '}
          <span data-no-translate style={{ color: 'var(--danger-text)', fontWeight: 'var(--g3)' }}>{urgents}</span>{' '}
          <span style={{ color: 'var(--danger-text)', fontWeight: 'var(--g3)' }}>{urgents > 1 ? 'urgents' : 'urgent'}</span>
        </>
      )}
    </>
  ) : <span>Rien en attente</span>;

  return (
    <Section id="tdb-afaire" titre="À faire maintenant" sousTitre={sousTitre}>
      {!items.length && (
        <p style={s.vide}>
          <CircleCheck size={20} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--success-strong)', flexShrink: 0 }} />
          <span>Rien en attente pour l&apos;instant. Bon service !</span>
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {visibles.map((item) => (
          <LigneAction
            key={item.id}
            icone={getModuleIcon(item.page === 'pointage' ? 'planning' : item.page)}
            couleur={COULEURS[item.ton] || 'var(--lien)'}
            titre={item.titre}
            titreBrut={item.brut}
            detail={item.detail}
            droite={item.action ? <BoutonAction action={item.action} />
              : item.ton === 'danger' ? <span style={s.urgent}>Urgent</span> : null}
            onClick={!item.action && peutOuvrir(item.page) ? () => ouvrir(item.page) : null}
          />
        ))}
      </div>
      {items.length > max && (
        <button type="button" className="tdb-lien" onClick={() => setTout((v) => !v)} style={s.plus}>
          {tout ? <span>Réduire</span>
            : items.length - max === 1 ? <span>Voir le dernier point</span>
              : <><span>Voir</span>{' '}<span data-no-translate>{items.length - max}</span>{' '}<span>autres points</span></>}
        </button>
      )}
    </Section>
  );
}

const s = {
  vide: { display: 'flex', alignItems: 'center', gap: 10, margin: 0, padding: '8px 0', fontSize: 'var(--t2)', lineHeight: 1.5, color: 'var(--text)' },
  urgent: { flexShrink: 0, whiteSpace: 'nowrap', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--danger-text)' },
  plus: {
    alignSelf: 'flex-start', minHeight: 44, padding: '0 6px', marginTop: 4, cursor: 'pointer',
    borderRadius: 'var(--r-sm)',
    fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--lien)',
  },
};
