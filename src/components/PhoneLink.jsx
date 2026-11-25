// Numéro de téléphone cliquable (appel direct sur téléphone et tablette).
//
// stopPropagation : posé sur une carte cliquable (shift, ligne), le tap
// ouvrirait la carte au lieu d'appeler. data-no-translate : un numéro ne se
// traduit pas. Cible : 24 px au moins partout (WCAG 2.5.8), 44 px au doigt
// (classe touch-target d'app.css).
export default function PhoneLink({ tel, style }) {
  if (!tel) return null;
  return (
    <a
      href={`tel:${tel.replace(/[^\d+]/g, '')}`}
      className="touch-target"
      style={{ ...s.link, ...style }}
      onClick={(e) => e.stopPropagation()}
      data-no-translate=""
    >
      {tel}
    </a>
  );
}

const s = {
  link: { display: 'inline-flex', alignItems: 'center', minHeight: 24, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap' },
};
