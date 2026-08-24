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
      {/* Double halo : un large et diffus (atmosphère), un serré et plus vif
          (la « gemme » qui éclaire le monogramme). Même classe : les deux
          respirent ensemble et s'éteignent ensemble en mouvement réduit. */}
      <div className="splash-aura" style={s.auraWide} aria-hidden="true" />
      <div className="splash-aura" style={s.aura} aria-hidden="true" />

      <div style={s.core}>
        <SamperMark className="splash-mark" size={118} background="none" scale={1.08} title={null} />

        <div className="splash-word" style={s.word}>
          <div style={s.name} data-no-translate="">Samper Consulting</div>
          <div style={s.rule} aria-hidden="true" />
          <div style={s.tagline}>Gestion culinaire</div>
        </div>
      </div>

      {/* Pied éditorial : l'état de chargement à gauche, la piste à droite —
          la tension gauche/droite ancre la composition dans les bords. */}
      <div style={s.foot}>
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
const AURA_WIDE_SIZE = 780;

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
    background: 'radial-gradient(circle, rgba(155,199,219,0.15) 0%, rgba(155,199,219,0) 66%)',
    pointerEvents: 'none',
  },
  auraWide: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: AURA_WIDE_SIZE,
    height: AURA_WIDE_SIZE,
    marginTop: -(AURA_WIDE_SIZE / 2) - 40,
    marginLeft: -(AURA_WIDE_SIZE / 2),
    background: 'radial-gradient(circle, rgba(23,92,130,0.22) 0%, rgba(23,92,130,0) 62%)',
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
    marginTop: 30,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  name: {
    // Voix éditoriale : serif d'affichage, grand corps, tracking resserré.
    fontSize: 'clamp(27px, 6vw, 38px)',
    fontWeight: 400,
    color: '#f1ebe1',
    fontFamily: 'var(--font-serif)',
    letterSpacing: '-0.02em',
    lineHeight: 1.05,
  },
  rule: {
    width: 46,
    height: 1,
    margin: '15px 0 12px',
    background: 'linear-gradient(90deg, rgba(201,188,163,0) 0%, rgba(201,188,163,0.85) 50%, rgba(201,188,163,0) 100%)',
  },
  tagline: {
    fontSize: 10.5,
    fontWeight: 600,
    color: 'rgba(241,235,225,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 3.2,
  },
  foot: {
    position: 'absolute',
    left: 'max(26px, env(safe-area-inset-left))',
    right: 'max(26px, env(safe-area-inset-right))',
    bottom: 'calc(26px + env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  status: {
    fontSize: 12,
    color: 'rgba(241,235,225,0.62)',
    minHeight: 16,
    textAlign: 'left',
  },
  track: {
    width: 132,
    flexShrink: 0,
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
