// Numéro de téléphone cliquable (appel direct sur téléphone et tablette).
//
// stopPropagation : posé sur une carte cliquable (shift, ligne), le tap
// ouvrirait la carte au lieu d'appeler. data-no-translate : un numéro ne se
// traduit pas.
export default function PhoneLink({ tel, style }) {
  if (!tel) return null;
  return (
    <a
      href={`tel:${tel.replace(/[^\d+]/g, '')}`}
      style={{ ...s.link, ...style }}
      onClick={(e) => e.stopPropagation()}
      data-no-translate=""
    >
      {tel}
    </a>
  );
}

const s = {
  link: { color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' },
};
