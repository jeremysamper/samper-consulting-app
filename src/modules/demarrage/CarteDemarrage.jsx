import React from 'react';
import { t } from '../dashboard/tableauUi.jsx';
import { peutOuvrirDemarrage } from '../moduleConfig.js';
import { ETAPES, lireMiseEnRoute } from './demarrageService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Carte « Mise en route » en tête du tableau de bord : consultant et patron
// d'un établissement qui n'a pas encore sa ligne « termine ». Les
// établissements en service l'ont reçue par la migration : une lecture, rien
// d'affiché. En cas d'erreur de lecture, rien non plus (jamais montrée par
// défaut). Aucune redirection : le bouton mène à la page `demarrage`.
//
// Le tableau de bord reste monté en arrière-plan (keep-alive) : la carte se
// relit quand elle redevient visible et à l'événement `sc:demarrage` envoyé
// par la page de mise en route.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENEMENT_DEMARRAGE = 'sc:demarrage';

export default function CarteDemarrage({ user, etablissement, setPage }) {
  const etabId = etablissement?.id || null;
  const autorise = peutOuvrirDemarrage(user);
  const [etat, setEtat] = React.useState(null);
  const refElement = React.useRef(null);

  const relire = React.useCallback(async () => {
    if (!autorise || !etabId) { setEtat(null); return; }
    try {
      const e = await lireMiseEnRoute(etabId);
      setEtat(e.termine ? null : { etabId, ...e });
    } catch (err) {
      console.warn('[CarteDemarrage] lecture', err);
      setEtat(null);
    }
  }, [autorise, etabId]);

  React.useEffect(() => {
    setEtat(null);
    relire();
    window.addEventListener(EVENEMENT_DEMARRAGE, relire);
    return () => window.removeEventListener(EVENEMENT_DEMARRAGE, relire);
  }, [relire]);

  const visible = Boolean(etat && etat.etabId === etabId);
  React.useEffect(() => {
    const el = refElement.current;
    if (!visible || !el || typeof IntersectionObserver === 'undefined') return undefined;
    let deja = true;
    const io = new IntersectionObserver(([entree]) => {
      if (!entree?.isIntersecting) { deja = false; return; }
      if (!deja) relire();
      deja = true;
    });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, relire]);

  if (!visible) return null;
  const n = ETAPES.filter((e) => etat.faites.has(e)).length;
  const exempleCharge = etat.registre.length > 0;

  return (
    <section ref={refElement} style={{ ...t.carte, ...s.carte }} aria-labelledby="carte-demarrage-titre">
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <h2 id="carte-demarrage-titre" style={t.carteTitre}>Mise en route</h2>
        <p style={s.compte}>
          <span style={s.chiffre}>{n}</span> {n > 1 ? 'étapes' : 'étape'} sur 5
        </p>
        <div style={s.barre} aria-hidden="true">
          <div style={{ ...s.remplie, width: `${(n / 5) * 100}%` }} />
        </div>
        <p style={s.texte}>
          {exempleCharge
            ? "L'exemple est encore chargé. Effacez-le depuis la mise en route quand vos données sont là."
            : "L'établissement, les recettes, le catalogue et le planning, pour que l'équipe trouve l'app prête."}
        </p>
      </div>
      {typeof setPage === 'function' && (
        <button type="button" onClick={() => setPage('demarrage')} style={s.bouton}>Continuer</button>
      )}
    </section>
  );
}

const s = {
  carte: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderColor: 'var(--accent-bd)' },
  compte: { margin: '6px 0 0', fontSize: 14, color: 'var(--text2)' },
  chiffre: { fontFamily: 'var(--font-num)', fontSize: 16, color: 'var(--text)' },
  barre: { marginTop: 10, height: 6, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden', maxWidth: 420 },
  remplie: { height: '100%', borderRadius: 3, background: 'var(--accent)' },
  texte: { margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--text2)', maxWidth: 640 },
  bouton: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '10px 18px',
    borderRadius: 'var(--r-sm)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700,
    background: 'var(--accent)', color: 'var(--on-accent)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)', flexShrink: 0,
  },
};
