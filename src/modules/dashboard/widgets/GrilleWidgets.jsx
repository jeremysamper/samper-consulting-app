import React from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Plus, X } from 'lucide-react';
import { Btn } from '../../../components/ui/index.jsx';
import { Fenetre, st } from '../../../components/ui/Fenetres.jsx';
import { useBackLayer } from '../../../hooks/useBackLayer.js';
import { NOMS_TAILLES } from './catalogue.js';
import { REGISTRE_PAR_ID } from './registre.js';
import {
  ajouter, changerTaille, deplacer, deplacerA, estVisible, memeListe, origine, retirer,
} from './dispositionLogique.js';
import { ChoixRaccourcis, Galerie } from './Galerie.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Grille des widgets du tableau de bord, et son mode « Personnaliser ».
//
// La grille range seule, dans l'ordre de la liste, en comblant les trous
// (tableau.css : grid-auto-flow dense, deux colonnes au téléphone, quatre
// ailleurs, deux quand le conteneur passe sous 760 px). Un widget que la garde
// refuse ne se rend pas et garde sa place dans la liste. Un toucher sur un
// widget, hors de ses boutons, ouvre son module quand la personne y a droit.
//
// Mode « Personnaliser » : chaque widget porte une poignée (glisser, ou
// flèches au clavier), deux flèches, ses tailles en pilules et « Retirer » ;
// leur contenu est inerte. Rien n'est enregistré avant « Terminé ». Le geste
// retour et Échap quittent le mode, en demandant s'il y a des changements.
// Glisser en Pointer Events, écouteurs posés dans le pointerdown (comme le
// rangement du menu), la position portée par le geste, jamais relue dans
// l'état React.
// ─────────────────────────────────────────────────────────────────────────────

const INTERACTIF = 'button, a, input, textarea, select, label, summary, [role="button"], [role="tab"], [contenteditable="true"]';

export default function GrilleWidgets({ t, poste, ctx, disposition, enregistrer, mode, onQuitterMode }) {
  const listeGardee = disposition && disposition[poste];
  const liste = listeGardee || origine(poste, ctx);
  const vu = React.useCallback((id) => estVisible(id, ctx), [ctx]);

  if (mode) {
    return (
      <ModePersonnaliser
        t={t}
        poste={poste}
        ctx={ctx}
        vu={vu}
        disposition={disposition}
        listeDepart={listeGardee || null}
        enregistrer={enregistrer}
        onQuitter={onQuitterMode}
      />
    );
  }
  return (
    <div className="tdb-grille" data-tdb-disposition={listeGardee ? 'gardee' : 'origine'}>
      {liste.filter((x) => vu(x.id)).map((x) => <Cellule key={x.id} t={t} item={x} />)}
    </div>
  );
}

function Cellule({ t, item, mode = false, children }) {
  const w = REGISTRE_PAR_ID.get(item.id);
  const ouvrable = !mode && w.page && t.peutOuvrir(w.page);
  const surClic = (e) => {
    if (!ouvrable || e.defaultPrevented) return;
    if (e.target.closest(INTERACTIF)) return;
    if (window.getSelection && String(window.getSelection()).length) return;
    t.ouvrir(w.page);
  };
  const { Composant } = w;
  return (
    <div
      className={`tdb-widget tdb-widget--${item.taille}${ouvrable ? ' tdb-widget--ouvrable' : ''}${mode ? ' tdb-widget--edition' : ''}`}
      data-widget={item.id}
      data-taille={item.taille}
      onClick={ouvrable ? surClic : undefined}
    >
      {children}
      <div className="tdb-widget-contenu" inert={mode ? '' : undefined} aria-hidden={mode ? 'true' : undefined}>
        <Composant t={t} taille={item.taille} id={item.id} />
      </div>
    </div>
  );
}

function ModePersonnaliser({ t, poste, ctx, vu, disposition, listeDepart, enregistrer, onQuitter }) {
  // Brouillon : la liste du poste (null : l'origine, qui suit les gardes) et
  // les raccourcis (null : les premiers modules du menu).
  const [brouillon, setBrouillon] = React.useState(listeDepart);
  const [raccourcis, setRaccourcis] = React.useState(disposition?.raccourcis ?? null);
  const [galerie, setGalerie] = React.useState(false);
  const [choixRaccourcis, setChoixRaccourcis] = React.useState(false);
  const [confirmer, setConfirmer] = React.useState(false);
  const [enCours, setEnCours] = React.useState(false);
  const [glisse, setGlisse] = React.useState(null); // { id, cible }
  const [annonce, setAnnonce] = React.useState(null);
  const [retour, setRetour] = React.useState(0);
  const grilleRef = React.useRef(null);

  const liste = brouillon || origine(poste, ctx);
  const change = !memeListe(brouillon, listeDepart) || !memeListe(raccourcis, disposition?.raccourcis ?? null);
  const modifier = (f) => setBrouillon((prec) => f(prec || origine(poste, ctx)));

  const nomDe = (id) => REGISTRE_PAR_ID.get(id)?.nom || id;
  const focaliser = (id, quoi = 'grip') => requestAnimationFrame(() => {
    grilleRef.current?.querySelector(`[data-${quoi}="${id}"]`)?.focus();
  });

  const avancer = (id, sens) => {
    modifier((l) => deplacer(l, id, sens, vu));
    setAnnonce({ nom: nomDe(id), verbe: sens < 0 ? 'déplacé avant' : 'déplacé après' });
    focaliser(id);
  };

  const terminer = async () => {
    if (!change) { onQuitter(); return; }
    const suivante = { ...(disposition || {}), v: 1 };
    if (brouillon) suivante[poste] = brouillon; else delete suivante[poste];
    if (raccourcis) suivante.raccourcis = raccourcis; else delete suivante.raccourcis;
    setEnCours(true);
    await enregistrer(suivante);
    setEnCours(false);
    onQuitter();
  };

  // Retour (geste, Alt+←) et Échap : quitter le mode, en demandant s'il y a
  // des changements. L'entrée d'historique se repose si la personne reste.
  const demanderSortie = () => { if (change) setConfirmer(true); else onQuitter(); };
  useBackLayer(!confirmer, () => demanderSortie(), `tdb-personnaliser-${retour}`);
  React.useEffect(() => {
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[data-fenetre]')) return;
      e.preventDefault();
      demanderSortie();
    };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  });

  // ── Glisser ──
  const surPoignee = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    let cible = null;
    let dernierY = e.clientY;
    let raf = null;
    const defileur = (() => {
      let n = grilleRef.current?.parentElement;
      while (n && n !== document.body) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
        n = n.parentElement;
      }
      return document.scrollingElement;
    })();
    setGlisse({ id, cible: null });
    const defiler = () => {
      const r = defileur === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : defileur.getBoundingClientRect();
      if (dernierY < r.top + 48) defileur.scrollTop -= 10;
      else if (dernierY > r.bottom - 48) defileur.scrollTop += 10;
      raf = requestAnimationFrame(defiler);
    };
    raf = requestAnimationFrame(defiler);
    const bouger = (ev) => {
      if (ev.pointerId !== pointerId) return;
      dernierY = ev.clientY;
      const sous = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-widget]');
      const nouvelle = sous && sous.dataset.widget !== id ? sous.dataset.widget : null;
      if (nouvelle !== cible) { cible = nouvelle; setGlisse({ id, cible }); }
    };
    const lacher = (ev) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', lacher);
      if (raf) cancelAnimationFrame(raf);
      if (cible && ev.type === 'pointerup') {
        const vers = cible;
        modifier((l) => deplacerA(l, id, vers));
        setAnnonce({ nom: nomDe(id), verbe: 'déplacé' });
        focaliser(id);
      }
      setGlisse(null);
    };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
  };

  const surClavierPoignee = (e, id) => {
    const sens = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (!sens) return;
    e.preventDefault();
    avancer(id, sens);
  };

  const visibles = liste.filter((x) => vu(x.id));

  return (
    <>
      <div className="tdb-mode-barre" role="toolbar" aria-label="Personnaliser le tableau de bord">
        <p className="tdb-mode-aide">Glissez un widget par sa poignée, ou utilisez les flèches. Rien n&apos;est enregistré avant « Terminé ».</p>
        <div className="tdb-mode-actions">
          <Btn variant="primary" onClick={() => setGalerie(true)}><Plus size={16} strokeWidth={2} aria-hidden="true" />Ajouter un widget</Btn>
          <Btn onClick={() => { setBrouillon(null); setRaccourcis(null); setAnnonce({ verbe: 'Disposition d\'origine rétablie' }); }}>Rétablir</Btn>
          <Btn onClick={onQuitter} disabled={enCours}>Annuler</Btn>
          <Btn onClick={terminer} disabled={enCours}>Terminé</Btn>
        </div>
      </div>
      <p aria-live="polite" style={srOnly}>{annonce && <>{annonce.nom && <><span>{annonce.nom}</span>{' : '}</>}<span>{annonce.verbe}</span></>}</p>

      <div ref={grilleRef} className="tdb-grille tdb-grille--edition" data-tdb-disposition="edition">
        {!visibles.length && <p className="tdb-mode-vide">Aucun widget. « Ajouter un widget » ouvre la galerie.</p>}
        {visibles.map((x, i) => {
          const w = REGISTRE_PAR_ID.get(x.id);
          const classes = [glisse?.id === x.id ? 'est-souleve' : '', glisse?.cible === x.id ? 'est-cible' : ''].filter(Boolean).join(' ');
          return (
            <Cellule key={x.id} t={t} item={x} mode>
              <div className={`tdb-widget-barre ${classes}`}>
                <div className="tdb-widget-barre-ligne">
                  <button
                    type="button"
                    className="tdb-cercle tdb-poignee"
                    data-grip={x.id}
                    aria-labelledby={`tdb-wa-grip-${x.id} tdb-wn-${x.id}`}
                    title="Glisser pour déplacer"
                    onPointerDown={(e) => surPoignee(e, x.id)}
                    onKeyDown={(e) => surClavierPoignee(e, x.id)}
                  >
                    <GripVertical size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span id={`tdb-wa-grip-${x.id}`} style={srOnly}>Déplacer</span>
                  </button>
                  <span className="tdb-widget-nom" id={`tdb-wn-${x.id}`}>{w.nom}</span>
                  <button
                    type="button"
                    className="tdb-cercle"
                    data-retirer={x.id}
                    aria-labelledby={`tdb-wa-retirer-${x.id} tdb-wn-${x.id}`}
                    title="Retirer"
                    onClick={() => {
                      const voisin = visibles[i + 1]?.id || visibles[i - 1]?.id;
                      modifier((l) => retirer(l, x.id));
                      setAnnonce({ nom: w.nom, verbe: 'retiré' });
                      if (voisin) focaliser(voisin);
                    }}
                  >
                    <X size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span id={`tdb-wa-retirer-${x.id}`} style={srOnly}>Retirer</span>
                  </button>
                </div>
                <div className="tdb-widget-barre-ligne tdb-widget-barre-ligne--reglages">
                  <button type="button" className="tdb-cercle" onClick={() => avancer(x.id, -1)} disabled={i === 0} aria-labelledby={`tdb-wa-avant-${x.id} tdb-wn-${x.id}`}>
                    <ChevronLeft size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span id={`tdb-wa-avant-${x.id}`} style={srOnly}>Déplacer avant</span>
                  </button>
                  <button type="button" className="tdb-cercle" onClick={() => avancer(x.id, 1)} disabled={i === visibles.length - 1} aria-labelledby={`tdb-wa-apres-${x.id} tdb-wn-${x.id}`}>
                    <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" />
                    <span id={`tdb-wa-apres-${x.id}`} style={srOnly}>Déplacer après</span>
                  </button>
                  {w.tailles.length > 1 && (
                    <span className="tdb-tailles" role="group" aria-labelledby={`tdb-wa-taille-${x.id} tdb-wn-${x.id}`}>
                      <span id={`tdb-wa-taille-${x.id}`} style={srOnly}>Taille</span>
                      {w.tailles.map((taille) => (
                        <button
                          key={taille}
                          type="button"
                          className={`tdb-taille${x.taille === taille ? ' is-actif' : ''}`}
                          aria-pressed={x.taille === taille}
                          onClick={() => { modifier((l) => changerTaille(l, x.id, taille)); setAnnonce({ nom: w.nom, verbe: NOMS_TAILLES[taille] }); }}
                        >
                          {NOMS_TAILLES[taille]}
                        </button>
                      ))}
                    </span>
                  )}
                  {x.id === 'raccourcis' && (
                    <button type="button" className="tdb-taille" onClick={() => setChoixRaccourcis(true)}>Choisir les raccourcis</button>
                  )}
                </div>
              </div>
            </Cellule>
          );
        })}
      </div>

      {galerie && (
        <Galerie
          ctx={ctx}
          poste={poste}
          poses={new Set(liste.map((x) => x.id))}
          onAjouter={(id) => {
            modifier((l) => ajouter(l, id, poste));
            setGalerie(false);
            setAnnonce({ nom: nomDe(id), verbe: 'ajouté' });
            requestAnimationFrame(() => {
              const el = grilleRef.current?.querySelector(`[data-widget="${id}"]`);
              el?.scrollIntoView?.({ block: 'nearest' });
              el?.querySelector('[data-grip]')?.focus();
            });
          }}
          onClose={() => setGalerie(false)}
        />
      )}
      {choixRaccourcis && (
        <ChoixRaccourcis
          modules={ctx.modulesDuMenu}
          choisis={raccourcis}
          onChange={setRaccourcis}
          onClose={() => setChoixRaccourcis(false)}
        />
      )}
      {confirmer && (
        <Fenetre
          id="tdb-quitter-personnaliser"
          titre="Quitter sans enregistrer ?"
          onClose={() => { setConfirmer(false); setRetour((n) => n + 1); }}
          pied={(
            <>
              <button type="button" style={st.secondaire} onClick={() => { setConfirmer(false); setRetour((n) => n + 1); }}>Continuer</button>
              <button type="button" style={st.primaire} onClick={() => { setConfirmer(false); onQuitter(); }}>Quitter sans enregistrer</button>
            </>
          )}
        >
          <p style={{ margin: 0, fontSize: 'var(--t2)', lineHeight: 1.5, color: 'var(--text2)' }}>Vos changements du tableau de bord seront perdus.</p>
        </Fenetre>
      )}
    </>
  );
}

const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
