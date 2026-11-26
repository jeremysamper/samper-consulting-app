import React from 'react';
import { useBackLayer } from '../hooks/useBackLayer.js';
import { useShell } from './ShellContext.js';
import { GrilleModules } from './AccueilTactile.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Tiroir des modules de la tablette (26.11.2026, à la place du bouton « Tout »
// de la barre de raccourcis) : un doigt posé en bas de l'écran et tiré vers le
// haut fait monter la liste complète des modules, les tuiles de l'accueil. La
// feuille suit le doigt ; lâchée assez haut, ou d'un coup sec, elle s'ouvre,
// sinon elle redescend. Elle se referme par son voile, par sa poignée (un
// toucher, ou tirée vers le bas), par Échap et par le geste retour.
//
// Le départ se prend dans une bande de BANDE px posée sur la zone de sécurité
// du bas (#root la porte) : l'indicateur d'accueil d'iPadOS garde son geste,
// qui renvoie à l'écran d'accueil de l'appareil. Une petite poignée, posée là
// sans capter le doigt (pointer-events: none), signale le geste.
//
// Rien ne part d'un champ, d'une fenêtre ouverte (aria-modal), d'une zone
// marquée data-no-tiroir, ni clavier logiciel ouvert, ni de la page d'accueil,
// qui est déjà la liste. Écouteurs tactiles natifs, comme EdgeSwipeBack :
// touchmove non passif pour bloquer le défilement dès que le geste est engagé.
// Un toucher qui ne bouge pas reste un toucher : les boutons du bas de
// l'écran ne perdent rien.
//
// Position et opacité sont posées à la main sur les nœuds (le doigt les mène
// image par image) ; les transitions lisent les jetons du mouvement, mis à
// zéro par les animations réduites. La fin d'une sortie ne dépend que d'un
// délai de garde.
// ─────────────────────────────────────────────────────────────────────────────

const BANDE = 32;          // hauteur de la bande de départ, en px
const ENGAGE = 10;         // déplacement avant de décider vertical ou non
const OUVRE = 80;          // distance qui ouvre
const COUP_SEC = 0.5;      // px/ms : un coup sec suffit à mi-distance
const FERME = 90;          // poignée tirée vers le bas : distance qui referme
const GARDE_SORTIE = 320;  // délai de garde de la sortie (transition en --mvt-2)

const REFUS = 'input, textarea, select, [contenteditable="true"], [data-no-tiroir], [aria-modal="true"]';

function basSecurite() {
  try {
    const root = document.getElementById('root');
    return root ? parseFloat(getComputedStyle(root).paddingBottom) || 0 : 0;
  } catch {
    return 0;
  }
}

function clavierOuvert() {
  const vv = window.visualViewport;
  return Boolean(vv && vv.height < window.innerHeight * 0.75);
}

function animer(feuille, voile, ouvrir) {
  const duree = ouvrir ? 'var(--mvt-3)' : 'var(--mvt-2)';
  const courbe = ouvrir ? 'var(--courbe)' : 'var(--courbe-depart)';
  feuille.style.transition = `transform ${duree} ${courbe}`;
  feuille.style.transform = ouvrir ? 'translateY(0px)' : 'translateY(100%)';
  voile.style.transition = `opacity ${duree} ${courbe}`;
  voile.style.opacity = ouvrir ? '1' : '0';
}

export default function TiroirModules({ actif, page }) {
  const shell = useShell();
  // 'ferme' | 'tire' (la feuille suit le doigt) | 'ouvert' | 'sortie'
  const [etat, setEtat] = React.useState('ferme');
  const etatRef = React.useRef(etat);
  etatRef.current = etat;
  const pageRef = React.useRef(page);
  pageRef.current = page;
  const feuilleRef = React.useRef(null);
  const voileRef = React.useRef(null);
  const tireRef = React.useRef(0);
  const minuterie = React.useRef(null);
  const poigneeRef = React.useRef(null);

  // La feuille montée de `tire` px au-dessus du bas de l'écran.
  const poser = React.useCallback((tire) => {
    tireRef.current = tire;
    const f = feuilleRef.current;
    const v = voileRef.current;
    if (!f || !v) return;
    const h = f.offsetHeight || 1;
    f.style.transform = `translateY(${Math.max(0, h - tire)}px)`;
    v.style.opacity = String(Math.min(1, tire / h));
  }, []);

  const fermer = React.useCallback(() => {
    if (etatRef.current === 'ferme' || etatRef.current === 'sortie') return;
    setEtat('sortie');
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setEtat('ferme'), GARDE_SORTIE);
  }, []);

  React.useEffect(() => () => clearTimeout(minuterie.current), []);

  React.useLayoutEffect(() => {
    const f = feuilleRef.current;
    const v = voileRef.current;
    if (!f || !v) return;
    if (etat === 'tire') {
      f.style.transition = 'none';
      v.style.transition = 'none';
      poser(tireRef.current);
    } else if (etat === 'ouvert') {
      // Une feuille montée dans le même rendu part de sa place d'origine.
      void f.offsetHeight;
      animer(f, v, true);
      f.focus({ preventScroll: true });
    } else if (etat === 'sortie') {
      animer(f, v, false);
    }
  }, [etat, poser]);

  // Le geste retour referme le tiroir au lieu de changer de module.
  useBackLayer(etat === 'ouvert', fermer, 'tiroir-modules');

  React.useEffect(() => {
    if (etat !== 'ouvert') return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); fermer(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [etat, fermer]);

  // Le geste de départ : bande du bas, vers le haut.
  React.useEffect(() => {
    if (!actif) return undefined;
    let g = null;

    const start = (e) => {
      g = null;
      if (etatRef.current !== 'ferme' || pageRef.current === 'accueil') return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientY < window.innerHeight - basSecurite() - BANDE) return;
      if (e.target?.closest?.(REFUS) || document.querySelector('[aria-modal="true"]') || clavierOuvert()) return;
      g = { x0: t.clientX, y0: t.clientY, engage: false, tire: 0, lastY: t.clientY, lastT: e.timeStamp, v: 0 };
    };

    const move = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dy = g.y0 - t.clientY;
      const dx = t.clientX - g.x0;
      if (!g.engage) {
        if (Math.abs(dx) < ENGAGE && Math.abs(dy) < ENGAGE) return;
        // Vers le bas ou de côté : ce n'est pas le geste, on laisse faire.
        if (dy <= 0 || Math.abs(dx) > dy) { g = null; return; }
        g.engage = true;
        tireRef.current = 0;
        setEtat('tire');
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - g.lastT;
      if (dt > 0) g.v = (g.lastY - t.clientY) / dt;
      g.lastY = t.clientY;
      g.lastT = e.timeStamp;
      g.tire = Math.max(0, dy);
      poser(g.tire);
    };

    const end = () => {
      if (!g) return;
      const { engage, tire, v } = g;
      g = null;
      if (!engage) return;
      if (tire >= OUVRE || (tire > OUVRE / 2 && v > COUP_SEC)) setEtat('ouvert');
      else fermer();
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, [actif, fermer, poser]);

  // Poignée de la feuille ouverte : tirée vers le bas, elle referme.
  const onPoigneeDown = (e) => {
    if (etatRef.current !== 'ouvert') return;
    poigneeRef.current = { y0: e.clientY, dy: 0, bouge: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPoigneeMove = (e) => {
    const p = poigneeRef.current;
    const f = feuilleRef.current;
    if (!p || p.fini || !f) return;
    p.dy = Math.max(0, e.clientY - p.y0);
    if (p.dy > ENGAGE) p.bouge = true;
    f.style.transition = 'none';
    f.style.transform = `translateY(${p.dy}px)`;
  };
  const onPoigneeUp = () => {
    const p = poigneeRef.current;
    // Un simple toucher : le clic referme. Après un glissé, la poignée reste
    // marquée « bougée » pour que le clic qui suit ne referme pas.
    if (!p || !p.bouge || p.fini) return;
    p.fini = true;
    if (p.dy >= FERME) fermer();
    else if (feuilleRef.current && voileRef.current) animer(feuilleRef.current, voileRef.current, true);
  };
  const onPoigneeClick = () => {
    const p = poigneeRef.current;
    poigneeRef.current = null;
    if (p?.bouge) return;
    fermer();
  };

  if (!actif || !shell) return null;
  const { groupedNav, badges, getLabelForModule, setPage } = shell;

  return (
    <>
      {etat === 'ferme' && page !== 'accueil' && <div className="sc-tiroir-indice no-print" aria-hidden="true" />}
      {etat !== 'ferme' && (
        <div style={st.couche} className="no-print">
          <div ref={voileRef} style={st.voile} onClick={fermer} aria-hidden="true" />
          <section
            ref={feuilleRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tiroir-modules-titre"
            tabIndex={-1}
            style={st.feuille}
            data-tiroir-modules=""
          >
            <button
              type="button"
              style={st.poignee}
              aria-label="Fermer"
              onPointerDown={onPoigneeDown}
              onPointerMove={onPoigneeMove}
              onPointerUp={onPoigneeUp}
              onPointerCancel={onPoigneeUp}
              onClick={onPoigneeClick}
            >
              <span style={st.poigneeTrait} aria-hidden="true" />
            </button>
            <h2 id="tiroir-modules-titre" style={st.titre}>Tous les modules</h2>
            <div style={st.defilement}>
              <GrilleModules
                groupedNav={groupedNav}
                badges={badges}
                getLabelForModule={getLabelForModule}
                onChoisir={(id) => { setPage(id); fermer(); }}
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}

const st = {
  // Au-dessus de la coque et des écrans de travail, sous les fenêtres
  // partagées (Fenetre, 1000) : une fenêtre ouverte refuse le geste.
  couche: { position: 'fixed', inset: 0, zIndex: 980 },
  voile: { position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.45)', opacity: 0 },
  // Fond de page : les tuiles y sont les cartes blanches de l'accueil.
  feuille: {
    position: 'absolute', left: 0, right: 0, bottom: 0, marginLeft: 'auto', marginRight: 'auto',
    maxWidth: 960, maxHeight: 'calc(100% - 56px)', display: 'flex', flexDirection: 'column', minWidth: 0,
    background: 'var(--bg)', borderRadius: 'var(--r-xl) var(--r-xl) 0 0', boxShadow: 'var(--sh-lg)',
    transform: 'translateY(100%)', outline: 'none',
  },
  poignee: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 32, flexShrink: 0,
    padding: 0, background: 'transparent', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent',
    cursor: 'grab', touchAction: 'none',
  },
  poigneeTrait: { width: 44, height: 5, borderRadius: 'var(--r-full)', background: 'var(--border)' },
  titre: { margin: '0 var(--marge) 12px', fontSize: 'var(--t4)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  defilement: {
    display: 'flex', flexDirection: 'column', gap: 22, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
    padding: '0 var(--marge) calc(var(--marge) + env(safe-area-inset-bottom))',
  },
};
