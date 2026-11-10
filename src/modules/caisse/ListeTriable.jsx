import React from 'react';
import { GripVertical } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Liste verticale réordonnable au glisser (réglages de la caisse : ordre des
// catégories, des produits d'une catégorie, des moyens de paiement).
//
// Règles du projet pour tout glisser-déposer :
//   - Pointer Events, jamais l'API HTML5 (elle ne fait rien au doigt sur iOS) ;
//   - écouteurs posés sur window DANS le pointerdown : un effet React
//     arriverait après le premier pointermove d'un geste vif ;
//   - l'ordre déposé est porté par le geste (une ref), jamais relu dans
//     l'état React au moment du dépôt ;
//   - touch-action none sur la poignée seulement : la liste reste défilable.
// Au clavier, la poignée se déplace avec les flèches haut et bas.
//
//   <ListeTriable items={[...]} cle={(x) => x.id} onOrdonner={(ids) => ...}
//     rendu={(item) => <...le contenu du rang...>} />
// ─────────────────────────────────────────────────────────────────────────────

const ECART = 6;

function deplacer(liste, de, vers) {
  const suite = [...liste];
  const [x] = suite.splice(de, 1);
  suite.splice(vers, 0, x);
  return suite;
}

export default function ListeTriable({ items, cle, onOrdonner, rendu, desactive = false }) {
  const ids = (items || []).map(cle);
  const signature = JSON.stringify(ids);
  const [ordre, setOrdre] = React.useState(ids);
  // Rang en cours de glisser : { id, decalage } pour le suivre sous le doigt.
  const [glisse, setGlisse] = React.useState(null);
  const geste = React.useRef(null);

  // La liste suit ses données, sauf pendant un geste.
  React.useEffect(() => {
    if (!geste.current) setOrdre(JSON.parse(signature));
  }, [signature]);

  const parId = new Map((items || []).map((x) => [String(cle(x)), x]));
  const visibles = ordre.filter((id) => parId.has(String(id)));

  function appui(e, id) {
    if (desactive || (e.button != null && e.button !== 0)) return;
    const rang = e.currentTarget.closest('[data-rang-triable]');
    if (!rang) return;
    e.preventDefault();
    const depart = visibles.indexOf(id);
    geste.current = {
      id, y0: e.clientY, depart, index: depart,
      pas: rang.offsetHeight + ECART, ordre: [...visibles], initial: JSON.stringify(visibles),
    };
    setGlisse({ id, decalage: 0 });

    const bouge = (ev) => {
      const g = geste.current;
      if (!g) return;
      const dy = ev.clientY - g.y0;
      const cible = Math.max(0, Math.min(g.ordre.length - 1, g.depart + Math.round(dy / g.pas)));
      if (cible !== g.index) {
        g.ordre = deplacer(g.ordre, g.index, cible);
        g.index = cible;
        setOrdre(g.ordre);
      }
      setGlisse({ id: g.id, decalage: dy - (g.index - g.depart) * g.pas });
    };
    const fin = () => {
      window.removeEventListener('pointermove', bouge);
      window.removeEventListener('pointerup', fin);
      window.removeEventListener('pointercancel', fin);
      const g = geste.current;
      geste.current = null;
      setGlisse(null);
      if (g && JSON.stringify(g.ordre) !== g.initial) onOrdonner?.(g.ordre);
    };
    window.addEventListener('pointermove', bouge);
    window.addEventListener('pointerup', fin);
    window.addEventListener('pointercancel', fin);
  }

  function clavier(e, id) {
    if (desactive || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const de = visibles.indexOf(id);
    const vers = de + (e.key === 'ArrowUp' ? -1 : 1);
    if (vers < 0 || vers >= visibles.length) return;
    const suite = deplacer(visibles, de, vers);
    setOrdre(suite);
    onOrdonner?.(suite);
  }

  return (
    <div style={st.liste}>
      {visibles.map((id) => {
        const item = parId.get(String(id));
        const enMain = glisse?.id === id;
        return (
          <div
            key={id}
            data-rang-triable={id}
            style={{
              ...st.rang,
              ...(enMain ? { transform: `translateY(${glisse.decalage}px)`, zIndex: 2, boxShadow: 'var(--sh-lg)', background: 'var(--surface)' } : null),
            }}
          >
            {!desactive && (
              <button
                type="button"
                aria-label="Glisser pour changer l'ordre"
                title="Glisser pour changer l'ordre"
                style={st.poignee}
                onPointerDown={(e) => appui(e, id)}
                onKeyDown={(e) => clavier(e, id)}
              >
                <GripVertical size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
            <div style={st.contenu}>{rendu(item)}</div>
          </div>
        );
      })}
    </div>
  );
}

const st = {
  liste: { display: 'flex', flexDirection: 'column', gap: ECART },
  rang: {
    display: 'flex', alignItems: 'center', gap: 4, minHeight: 52, position: 'relative',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  // touch-action none ICI seulement : posé sur le rang, il bloquerait le
  // défilement de la liste au doigt.
  poignee: {
    width: 44, minHeight: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', color: 'var(--text2)', cursor: 'grab', touchAction: 'none', padding: 0,
  },
  contenu: { flex: 1, minWidth: 0 },
};
