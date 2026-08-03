import SamperMark from './SamperMark.jsx';

/**
 * Écran de démarrage de l'application.
 *
 * Fond bleu pétrole #003042 : c'est exactement le `background_color` du
 * manifest, donc sur Android le passage de l'écran natif d'ouverture à cet
 * écran-ci ne se voit pas, c'est le même fond et le même logo qui reste en
 * place. Ensuite, halo respirant, logo qui se pose et se révèle pale par pale
 * dans le sens horaire, nom qui monte, puis la ligne de balayage.
 *
 * La chorégraphie vit dans app.css (@keyframes splash*) : elle dure ~700 ms au
 * total pour qu'un démarrage rapide ne laisse pas voir un logo à moitié
 * dessiné, et elle se désactive sous prefers-reduced-motion.
 *
 * @param {string} title ligne d'état sous le nom (étape de démarrage en cours)
 */
export default function BootScreen({ title = 'Connexion à votre espace' }) {
  return (
    <main style={s.root}>
      <div className="splash-aura" style={s.aura} aria-hidden="true" />

      <div style={s.core}>
        <SamperMark className="splash-mark" size={112} background="none" scale={1.08} title={null} />

        <div className="splash-word" style={s.word}>
          <div style={s.name} data-no-translate="">Samper Consulting</div>
          <div style={s.rule} aria-hidden="true" />
          <div style={s.tagline}>Gestion culinaire</div>
        </div>

        <div className="splash-status" style={s.status} role="status" aria-live="polite">
          {title}
        </div>

        <div className="splash-track" style={s.track} aria-hidden="true">
          <div className="splash-sweep" style={s.sweep} />
        </div>
      </div>
    </main>
  );
}

const AURA_SIZE = 460;

const s = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Le coeur du dégradé est le pétrole de marque exact : le logo, rendu sans
    // fond, repose donc sur le champ pour lequel il a été dessiné (sa pale
    // d'ombre garde sa lecture). L'écran s'assombrit vers les bords.
    background: 'radial-gradient(120% 95% at 50% 36%, #00394c 0%, #003042 38%, #001620 100%)',
    fontFamily: 'var(--font)',
    zIndex: 9999,
    overflow: 'hidden',
  },
  aura: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: AURA_SIZE,
    height: AURA_SIZE,
    // Centrage aux marges (pas au transform) : le transform reste libre pour
    // l'animation de respiration, et le mode « mouvement réduit » peut le
    // neutraliser sans décaler le halo.
    marginTop: -(AURA_SIZE / 2) - 70,
    marginLeft: -(AURA_SIZE / 2),
    background: 'radial-gradient(circle, rgba(155,199,219,0.13) 0%, rgba(155,199,219,0) 66%)',
    pointerEvents: 'none',
  },
  core: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '0 24px',
    textAlign: 'center',
  },
  word: {
    marginTop: 26,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  name: {
    fontSize: 21,
    fontWeight: 400,
    color: '#f1ebe1',
    fontFamily: 'var(--font-serif)',
    letterSpacing: 0.6,
    lineHeight: 1.2,
  },
  rule: {
    width: 34,
    height: 1,
    margin: '13px 0 11px',
    background: 'linear-gradient(90deg, rgba(201,188,163,0) 0%, rgba(201,188,163,0.85) 50%, rgba(201,188,163,0) 100%)',
  },
  tagline: {
    fontSize: 10,
    fontWeight: 600,
    color: 'rgba(241,235,225,0.52)',
    textTransform: 'uppercase',
    letterSpacing: 2.6,
  },
  status: {
    marginTop: 34,
    fontSize: 12.5,
    color: 'rgba(241,235,225,0.62)',
    minHeight: 16,
  },
  track: {
    marginTop: 16,
    width: 116,
    height: 2,
    background: 'rgba(241,235,225,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  sweep: {
    height: '100%',
    width: '40%',
    background: 'linear-gradient(90deg, rgba(201,188,163,0) 0%, #c9bca3 50%, rgba(201,188,163,0) 100%)',
    borderRadius: 2,
  },
};
