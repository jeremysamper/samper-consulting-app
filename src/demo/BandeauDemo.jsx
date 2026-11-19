// Bandeau de la démo : rappelle que les données sont fictives, change de rôle
// (la page se recharge sur la personne de ce rôle) et remet la démo à zéro.
import { useEffect, useState } from 'react';
import { ROLES_DEMO } from './donnees/base.js';
import { choisirRole, roleCourant, oublierBase } from './fauxSupabase.js';
import { effacerStockageDemo, effacerBasesLocales } from './isolation.js';

const CLES_PAR_ROLE = ['samper-auth', 'sc_profile_snapshot', 'sc_page', 'sc_permissions_perso'];

const styles = {
  bandeau: {
    position: 'fixed',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 6px 6px 14px',
    borderRadius: 'var(--r-full)',
    background: 'var(--toast-fond)',
    color: 'var(--toast-texte)',
    boxShadow: 'var(--sh-lg)',
    fontFamily: 'var(--font)',
    fontSize: 'var(--t1)',
    lineHeight: 1.2,
    maxWidth: 'calc(100vw - 24px)',
  },
  libelle: { whiteSpace: 'nowrap', fontWeight: 'var(--g2)' },
  choix: {
    height: 32,
    borderRadius: 'var(--r-full)',
    borderWidth: 0,
    borderStyle: 'solid',
    padding: '0 10px',
    fontFamily: 'var(--font)',
    fontSize: 'var(--t1)',
    background: 'var(--surface)',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  bouton: {
    height: 32,
    borderRadius: 'var(--r-full)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    padding: '0 12px',
    fontFamily: 'var(--font)',
    fontSize: 'var(--t1)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  replier: {
    width: 32,
    height: 32,
    borderRadius: 'var(--r-full)',
    borderWidth: 0,
    borderStyle: 'solid',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 'var(--t2)',
  },
};

// Largeur du menu de l'ordinateur, posée par la coque sur sa racine (0 sur la
// coque tactile) : le bandeau se cale à sa droite, sans couvrir le rail.
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

// Écran étroit (téléphone, iframe du site) : bandeau resserré.
function useEtroit() {
  const requete = '(max-width: 599px)';
  const [etroit, setEtroit] = useState(() => window.matchMedia(requete).matches);
  useEffect(() => {
    const mq = window.matchMedia(requete);
    const suivre = () => setEtroit(mq.matches);
    mq.addEventListener('change', suivre);
    return () => mq.removeEventListener('change', suivre);
  }, []);
  return etroit;
}

export default function BandeauDemo() {
  const [role, setRole] = useState(roleCourant);
  const [replie, setReplie] = useState(false);
  const largeurMenu = useLargeurMenu();
  const etroit = useEtroit();
  const style = { ...styles.bandeau, left: `calc(${largeurMenu} + 12px)`, ...(etroit ? { gap: 6, padding: '4px 4px 4px 12px' } : null) };

  const changer = (suivant) => {
    setRole(suivant);
    choisirRole(suivant);
    CLES_PAR_ROLE.forEach((k) => window.localStorage.removeItem(k));
    window.location.reload();
  };

  const reinitialiser = async () => {
    const garde = roleCourant();
    oublierBase();
    effacerStockageDemo();
    await effacerBasesLocales();
    choisirRole(garde);
    window.location.reload();
  };

  if (replie) {
    return (
      <div style={style} role="region" aria-label="Démo">
        <button type="button" style={{ ...styles.bouton, borderWidth: 0 }} onClick={() => setReplie(false)}>Démo</button>
      </div>
    );
  }

  return (
    <div style={style} role="region" aria-label="Démo">
      <span style={styles.libelle}>{etroit ? 'Démo' : 'Démo, données fictives'}</span>
      <select style={{ ...styles.choix, ...(etroit ? { maxWidth: 150, fontSize: 'var(--t1)' } : null) }} value={role} onChange={(e) => changer(e.target.value)} aria-label="Voir l'application en tant que">
        {ROLES_DEMO.map((r) => <option key={r.role} value={r.role}>{r.libelle}</option>)}
      </select>
      <button type="button" style={styles.bouton} onClick={reinitialiser} title="Remettre les données de démonstration à zéro">{etroit ? 'Remettre' : 'Réinitialiser'}</button>
      <button type="button" style={styles.replier} onClick={() => setReplie(true)} aria-label="Réduire le bandeau de la démo" title="Réduire">×</button>
    </div>
  );
}
