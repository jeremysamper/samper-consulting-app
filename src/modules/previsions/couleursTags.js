// Couleurs des étiquettes d'une réservation, par type (reservation_tags.type_tag).
// Partagées par la carte du jour (VueJour.jsx) et le détail
// (ReservationDetailModal.jsx) : une réponse à une question de la maison
// (type « autre », lot 18) ne se lit jamais comme une allergie.
export const TAG_COLORS = {
  allergene: { bg: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: 'var(--danger-bd)' },
  regime:    { bg: 'var(--success-bg-soft)', color: 'var(--success-text)', border: 'var(--success-bd)' },
  occasion:  { bg: 'var(--ai-bg-soft)', color: 'var(--ai-text)', border: 'var(--ai-bd)' },
  autre:     { bg: 'var(--surface)', color: 'var(--text)', border: 'var(--border)' },
};

export const couleursTag = (type) => TAG_COLORS[type] || TAG_COLORS.autre;
