import { Cake, Check, Gift } from 'lucide-react';
import { dateLongue, st } from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Un bon cadeau dessiné comme une carte : papier chaud, bordure laiton, code
// dans un cadre en pointillés. Même allure dans l'onglet Bons et sur la fiche
// du client, et proche de l'e-mail que le client a reçu.
// ─────────────────────────────────────────────────────────────────────────────

export function etatBon(b, aujourdhui) {
  if (b.utiliseAt) return { id: 'utilise', label: 'Utilisé', fond: 'var(--spa-sunken)', texte: 'var(--spa-ink2)' };
  if (b.valableJusqu && b.valableJusqu < aujourdhui) return { id: 'expire', label: 'Expiré', fond: 'var(--spa-sakura-soft)', texte: 'var(--spa-sakura)' };
  return { id: 'valable', label: 'Valable', fond: 'var(--spa-matcha-soft)', texte: 'var(--spa-matcha)' };
}

export default function BonCarte({ bon: b, aujourdhui, nomClient: nom, onClient, onBasculer, compact = false }) {
  const e = etatBon(b, aujourdhui);
  const Icone = b.motif === 'anniversaire' ? Cake : Gift;
  const eteint = e.id !== 'valable';
  return (
    <article style={{ ...s.carte, opacity: eteint ? 0.72 : 1 }}>
      <span aria-hidden="true" style={{ ...s.encoche, left: -9 }} />
      <span aria-hidden="true" style={{ ...s.encoche, right: -9 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={s.surTitre}>
          <Icone size={14} strokeWidth={1.8} aria-hidden="true" />
          {b.motif === 'anniversaire' ? 'Bon d\'anniversaire' : 'Bon cadeau'}
        </span>
        <span style={{ ...st.puce, background: e.fond, color: e.texte }}>{e.label}</span>
      </div>
      <div style={{ ...s.valeur, fontSize: compact ? 18 : 21 }}>{b.valeur}</div>
      {b.message && !compact && <div style={s.message}>{b.message}</div>}
      <div style={s.code} data-no-translate>{b.code}</div>
      <div style={s.pied}>
        <span style={{ minWidth: 0 }}>
          {nom && onClient && (
            <button type="button" onClick={onClient} style={{ ...st.lien, padding: 0, minHeight: 28, color: 'var(--spa-kin)' }} data-no-translate>{nom}</button>
          )}
          <span style={{ display: 'block', fontSize: 12, color: 'var(--spa-ink2)' }}>
            {b.utiliseAt
              ? `Utilisé le ${dateLongue(String(b.utiliseAt).slice(0, 10))}`
              : b.valableJusqu ? `Valable jusqu'au ${dateLongue(b.valableJusqu)}` : 'Sans date limite'}
          </span>
        </span>
        {onBasculer && (
          <button
            type="button"
            onClick={onBasculer}
            style={{ ...(b.utiliseAt ? st.discret : st.secondaire), minHeight: 40, padding: '8px 14px', fontSize: 13 }}
          >
            {b.utiliseAt ? 'Annuler l\'utilisation' : <><Check size={15} strokeWidth={2} aria-hidden="true" /> Marquer utilisé</>}
          </button>
        )}
      </div>
    </article>
  );
}

const s = {
  carte: {
    position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
    padding: '18px 20px', borderRadius: 'var(--spa-r)', background: 'var(--spa-gift)',
    border: '1px solid var(--spa-kin-line)', boxShadow: 'var(--spa-shadow)', color: 'var(--spa-ink)',
  },
  // Encoches de ticket, découpées dans le fond de la page.
  encoche: {
    position: 'absolute', top: '50%', marginTop: -9, width: 18, height: 18, borderRadius: 9,
    background: 'var(--spa-bg)', border: '1px solid var(--spa-kin-line)',
  },
  surTitre: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--spa-kin)',
  },
  valeur: { fontFamily: 'var(--font-serif)', lineHeight: 1.3, color: 'var(--spa-ink)' },
  message: { fontSize: 13, lineHeight: 1.5, color: 'var(--spa-ink2)' },
  code: {
    alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 10, border: '1px dashed var(--spa-kin)',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 16, letterSpacing: '0.12em',
    color: 'var(--spa-ink)', background: 'var(--spa-surface)',
  },
  pied: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
};
