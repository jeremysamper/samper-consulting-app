// « Voir en tant que » du consultant : un bouton rond en bas à gauche (calé à
// droite du menu de l'ordinateur), qui s'ouvre sur la liste des rôles ; tant
// qu'une autre vue est active, un bandeau le dit, rappelle que les données et
// les actions restent celles du consultant, et ramène à sa vue. Modèle : le
// bandeau de la démo (src/demo/BandeauDemo.jsx). Rendu seulement pour un
// consultant confirmé (useVueRole).
import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { ROLES_VUE, libelleRole } from '../../services/vueRole.js';

const base = {
  position: 'fixed',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
  zIndex: 900,
  fontFamily: 'var(--font)',
  fontSize: 'var(--t2)',
  lineHeight: 1.3,
  background: 'var(--toast-fond)',
  color: 'var(--toast-texte)',
  boxShadow: 'var(--sh-lg)',
};

const st = {
  rond: {
    ...base,
    width: 44,
    height: 44,
    borderRadius: 'var(--r-full)',
    borderWidth: 0,
    borderStyle: 'solid',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  bloc: {
    ...base,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px 10px 10px 16px',
    borderRadius: 'var(--r-lg)',
    maxWidth: 'min(640px, calc(100vw - 24px))',
  },
  ligne: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  libelle: { fontWeight: 'var(--g2)', whiteSpace: 'nowrap' },
  aide: { margin: 0, fontSize: 'var(--t1)', opacity: 0.85 },
  choix: {
    minHeight: 44,
    borderRadius: 'var(--r-full)',
    borderWidth: 0,
    borderStyle: 'solid',
    padding: '0 12px',
    fontFamily: 'var(--font)',
    fontSize: 'var(--t2)',
    background: 'var(--surface)',
    color: 'var(--text)',
    cursor: 'pointer',
    maxWidth: 240,
  },
  bouton: {
    minHeight: 44,
    borderRadius: 'var(--r-full)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    padding: '0 14px',
    fontFamily: 'var(--font)',
    fontSize: 'var(--t2)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  fermer: {
    width: 44,
    height: 44,
    borderRadius: 'var(--r-full)',
    borderWidth: 0,
    borderStyle: 'solid',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

// Largeur du menu de l'ordinateur, posée par la coque sur sa racine (0 sur la
// coque tactile) : le bouton se cale à sa droite, sans couvrir le rail.
function useLargeurMenu() {
  const [largeur, setLargeur] = useState('0px');
  useEffect(() => {
    const lire = () => {
      const el = document.querySelector('[style*="--largeur-menu"]');
      const v = el ? getComputedStyle(el).getPropertyValue('--largeur-menu').trim() : '';
      setLargeur(v || '0px');
    };
    lire();
    const id = setInterval(lire, 700);
    return () => clearInterval(id);
  }, []);
  return largeur;
}

function ChoixRole({ valeur, onChoisir }) {
  return (
    <select style={st.choix} value={valeur} onChange={(e) => onChoisir(e.target.value)} aria-label="Voir l'app en tant que">
      {ROLES_VUE.map((r) => <option key={r} value={r}>{libelleRole(r)}</option>)}
    </select>
  );
}

export default function VueRole({ roleVu, autreVue, onChoisir }) {
  const [ouvert, setOuvert] = useState(false);
  const largeurMenu = useLargeurMenu();
  // Sur /demo, le bandeau de la démo tient déjà ce coin : le bouton passe au-dessus.
  const auDessus = typeof document !== 'undefined' && document.getElementById('demo-bandeau') ? 68 : 12;
  const gauche = { left: `calc(${largeurMenu} + 12px)`, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${auDessus}px)` };

  const choisir = (role) => {
    setOuvert(false);
    onChoisir(role);
  };

  if (autreVue) {
    return (
      <div style={{ ...st.bloc, ...gauche }} role="region" aria-label="Vue d'un autre rôle" data-vue-role="">
        <div style={st.ligne}>
          <span style={st.libelle}>Vous voyez l'app comme :</span>
          <ChoixRole valeur={roleVu} onChoisir={choisir} />
          <button type="button" style={st.bouton} onClick={() => choisir('consultant')}>Revenir à ma vue</button>
        </div>
        <p style={st.aide}>Aperçu : les données restent celles de votre compte, et vos actions sont faites à votre nom.</p>
      </div>
    );
  }

  if (!ouvert) {
    return (
      <button type="button" style={{ ...st.rond, ...gauche }} onClick={() => setOuvert(true)} aria-label="Voir l'app en tant que" title="Voir l'app en tant que" data-vue-role="">
        <Eye size={20} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div style={{ ...st.bloc, ...gauche, padding: '6px 6px 6px 16px' }} role="region" aria-label="Voir l'app en tant que" data-vue-role="">
      <div style={st.ligne}>
        <span style={st.libelle}>Voir l'app en tant que</span>
        <ChoixRole valeur={roleVu} onChoisir={choisir} />
        <button type="button" style={st.fermer} onClick={() => setOuvert(false)} aria-label="Fermer" title="Fermer">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
