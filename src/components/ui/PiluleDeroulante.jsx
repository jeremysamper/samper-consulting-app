import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// PiluleDeroulante : une pilule qui montre le choix en cours et ouvre la
// liste des choix sous elle. Elle remplace une rangée de pilules quand la
// rangée s'allonge (cartes, salles, listes de la commande) : une seule ligne,
// quelle que soit la longueur des noms et leur nombre.
//
// Direction Galet : la pilule est un bouton secondaire (--btn-fond,
// --btn-texte, contour --btn-bord), le chevron dit qu'elle s'ouvre. La liste
// est un menu flottant (--surface, rayon --r-lg, ombre --sh-lg), le choix en
// cours y est une ligne en --selection avec sa coche, comme la liste des
// établissements de la barre du haut. Le menu porte role="menu" : il s'ouvre
// depuis son bord haut (mvt-menu, app.css), sans une ligne de plus.
//
// La liste est posée dans un portail, en position fixe, au-dessus des
// fenêtres et des feuilles de la caisse (z-index 1400) : un cadre qui rogne
// son contenu ne la coupe pas. Un clic dans le portail ne remonte pas
// jusqu'aux ancêtres React (un voile qui ferme au clic fermerait tout).
// Elle se referme au toucher hors d'elle, sur Échap (qui ne ferme pas la
// fenêtre dessous), sur Tab, au défilement de la page et quand la fenêtre
// change de taille.
//
// Props :
//   options  : [{ id, label }] ou { divider: true } (filet entre deux groupes)
//   valeur   : id du choix en cours
//   onChange : (id) => void, appelé seulement quand le choix change
//   titre    : en-tête facultatif de la liste, et nom du menu
//   intitule : texte facultatif posé devant la valeur, dans la pilule
//   size     : 'sm' pour une pilule plus compacte
// ─────────────────────────────────────────────────────────────────────────────

const MARGE = 8;
const ECART = 6;
const LARGEUR_MIN = 220;
const LARGEUR_MAX = 340;
const HAUTEUR_MAX = 420;

export default function PiluleDeroulante({ options, valeur, onChange, titre, intitule, size, className = '', style = {} }) {
  const liste = Array.isArray(options) ? options : [];
  const choix = liste.filter((o) => o && !o.divider);
  const enCours = choix.find((o) => o.id === valeur) || null;
  const [ouvert, setOuvert] = React.useState(false);
  const [place, setPlace] = React.useState(null);
  const boutonRef = React.useRef(null);
  const menuRef = React.useRef(null);

  const fermer = React.useCallback((rendreFocus) => {
    setOuvert(false);
    if (rendreFocus) boutonRef.current?.focus();
  }, []);

  // Place de la liste : sous la pilule, ou au-dessus quand la place manque
  // dessous ; bornée à la largeur de l'écran.
  React.useLayoutEffect(() => {
    if (!ouvert) { setPlace(null); return; }
    const b = boutonRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const largeur = Math.min(Math.max(b.width, LARGEUR_MIN), LARGEUR_MAX, vw - 2 * MARGE);
    const gauche = Math.min(Math.max(b.left, MARGE), vw - largeur - MARGE);
    const dessous = vh - b.bottom - ECART - MARGE;
    const dessus = b.top - ECART - MARGE;
    const enHaut = dessous < 200 && dessus > dessous;
    setPlace(enHaut
      ? { left: gauche, width: largeur, bottom: vh - b.top + ECART, maxHeight: Math.min(dessus, HAUTEUR_MAX), transformOrigin: 'bottom center' }
      : { left: gauche, width: largeur, top: b.bottom + ECART, maxHeight: Math.min(dessous, HAUTEUR_MAX) });
  }, [ouvert]);

  // Liste ouverte : le choix en cours prend le focus.
  React.useEffect(() => {
    if (!ouvert || !place) return;
    const menu = menuRef.current;
    if (!menu) return;
    const cible = menu.querySelector('[aria-checked="true"]') || menu.querySelector('[role="menuitemradio"]');
    cible?.focus({ preventScroll: true });
    cible?.scrollIntoView?.({ block: 'nearest' });
  }, [ouvert, place]);

  // Fermetures : toucher dehors (capture : le toucher ne déclenche pas ce
  // qu'il vise sous la liste), défilement hors de la liste, taille de la
  // fenêtre.
  React.useEffect(() => {
    if (!ouvert) return undefined;
    const dedans = (n) => boutonRef.current?.contains(n) || menuRef.current?.contains(n);
    const toucher = (e) => { if (!dedans(e.target)) fermer(false); };
    const defile = (e) => { if (!menuRef.current?.contains(e.target)) fermer(false); };
    const taille = () => fermer(false);
    document.addEventListener('pointerdown', toucher, true);
    window.addEventListener('scroll', defile, true);
    window.addEventListener('resize', taille);
    return () => {
      document.removeEventListener('pointerdown', toucher, true);
      window.removeEventListener('scroll', defile, true);
      window.removeEventListener('resize', taille);
    };
  }, [ouvert, fermer]);

  // Clavier dans la liste, écouté sur la liste elle-même : Échap s'arrête là
  // et ne ferme pas la fenêtre posée dessous (son écouteur est sur document).
  React.useEffect(() => {
    const menu = menuRef.current;
    if (!ouvert || !menu) return undefined;
    const clavier = (e) => {
      const items = [...menu.querySelectorAll('[role="menuitemradio"]')];
      const i = items.indexOf(document.activeElement);
      const aller = (n) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(true); }
      else if (e.key === 'Tab') { e.preventDefault(); fermer(true); }
      else if (e.key === 'ArrowDown') aller(i + 1);
      else if (e.key === 'ArrowUp') aller(i < 0 ? items.length - 1 : i - 1);
      else if (e.key === 'Home') aller(0);
      else if (e.key === 'End') aller(items.length - 1);
    };
    menu.addEventListener('keydown', clavier);
    return () => menu.removeEventListener('keydown', clavier);
  }, [ouvert, place, fermer]);

  const choisir = (id) => {
    fermer(true);
    if (id !== valeur) onChange?.(id);
  };

  const sm = size === 'sm';
  return (
    <>
      <button
        ref={boutonRef}
        type="button"
        className={`pilule-deroulante no-print${sm ? ' pilule-deroulante--sm' : ''}${className ? ' ' + className : ''}`}
        style={style}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !ouvert) { e.preventDefault(); setOuvert(true); }
        }}
      >
        {intitule ? <span className="pilule-deroulante-intitule">{intitule}</span> : null}
        <span className="pilule-deroulante-valeur">{enCours ? enCours.label : (choix[0]?.label ?? '')}</span>
        <ChevronDown size={sm ? 14 : 16} aria-hidden="true" className="pilule-deroulante-chevron" />
      </button>
      {ouvert && place && createPortal(
        // L'enveloppe arrête la remontée des événements du portail vers les
        // ancêtres React de la pilule.
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <div
            ref={menuRef}
            role="menu"
            aria-label={typeof titre === 'string' ? titre : undefined}
            className="pilule-deroulante-menu"
            style={place}
          >
            {titre ? <div className="pilule-deroulante-titre" aria-hidden="true">{titre}</div> : null}
            {liste.map((o, i) => {
              if (!o) return null;
              if (o.divider) return <div key={'filet-' + i} role="separator" className="pilule-deroulante-filet" />;
              const actif = o.id === valeur;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={actif}
                  tabIndex={-1}
                  className="sc-pop-item pilule-deroulante-item"
                  onClick={() => choisir(o.id)}
                >
                  <span className="pilule-deroulante-nom">{o.label}</span>
                  {actif ? <Check size={16} aria-hidden="true" className="pilule-deroulante-coche" /> : null}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
