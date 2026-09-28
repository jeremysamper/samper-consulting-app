import React from 'react';
import { ChevronRight } from 'lucide-react';
import { getRoleInfo } from '../../data/demoData.js';
import { userDisplay } from '../../utils/userDisplay.js';

// ─────────────────────────────────────────────────────────────────────────────
// Briques du tableau de bord : carte de section, pastille, avatar, ligne
// cliquable. Couleurs par jetons de thème uniquement (app.css, tableau.css).
// ─────────────────────────────────────────────────────────────────────────────

export const TONS = {
  danger:  { fond: 'var(--danger-bg-soft)',  texte: 'var(--danger-text)',  barre: 'var(--danger-strong)',  bord: 'var(--danger-bd)' },
  warning: { fond: 'var(--warning-bg-soft)', texte: 'var(--warning-text)', barre: 'var(--warning-strong)', bord: 'var(--warning-bd)' },
  info:    { fond: 'var(--info-bg-soft)',    texte: 'var(--info-text)',    barre: 'var(--info-strong)',    bord: 'var(--info-bd)' },
  success: { fond: 'var(--success-bg-soft)', texte: 'var(--success-text)', barre: 'var(--success-strong)', bord: 'var(--success-bd)' },
  neutre:  { fond: 'var(--surface2)',        texte: 'var(--text2)',        barre: 'var(--border2)',        bord: 'var(--border)' },
};

export function Carte({ icone: Icone, titre, sousTitre, action, children, style, corpsStyle, ton }) {
  return (
    <section style={{ ...t.carte, ...style }}>
      {(titre || action) && (
        <header style={t.carteTete}>
          {Icone && (
            <span aria-hidden="true" style={{ ...t.carteIcone, ...(ton ? { background: TONS[ton].fond, color: TONS[ton].texte } : null) }}>
              <Icone size={17} strokeWidth={1.9} />
            </span>
          )}
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            {titre && <h2 style={t.carteTitre}>{titre}</h2>}
            {sousTitre && <div style={t.carteSousTitre}>{sousTitre}</div>}
          </div>
          {action}
        </header>
      )}
      <div style={corpsStyle}>{children}</div>
    </section>
  );
}

export function Puce({ ton = 'neutre', children, style }) {
  const c = TONS[ton] || TONS.neutre;
  return <span style={{ ...t.puce, background: c.fond, color: c.texte, ...style }}>{children}</span>;
}

export function Avatar({ userId, taille = 30 }) {
  const u = userDisplay(userId);
  const couleur = getRoleInfo(u.role).couleur || 'var(--accent)';
  const initiales = (u.avatar && u.avatar !== '?' ? u.avatar : `${u.prenom?.[0] || ''}${u.nom?.[0] || ''}`) || '?';
  return (
    <span
      aria-hidden="true"
      style={{
        width: taille, height: taille, borderRadius: taille / 2, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: couleur, color: '#fff', fontSize: Math.round(taille * 0.38), fontWeight: 700, letterSpacing: 0.2,
      }}
      data-no-translate
    >
      {String(initiales).slice(0, 2).toUpperCase()}
    </span>
  );
}

// Ligne qui mène à un module quand c'est permis, simple ligne sinon.
export function Ligne({ onClick, children, style, label }) {
  if (!onClick) return <div style={{ ...t.ligne, ...style }}>{children}</div>;
  return (
    <button type="button" className="tdb-lien" onClick={onClick} style={{ ...t.ligne, ...t.ligneBouton, ...style }} aria-label={label}>
      {children}
      <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text3)' }} />
    </button>
  );
}

export function SousTitre({ children, droite }) {
  return (
    <div style={t.sousTitre}>
      <span>{children}</span>
      {droite && <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>{droite}</span>}
    </div>
  );
}

export const t = {
  page: { display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1400, margin: '0 auto', width: '100%', minWidth: 0 },
  carte: {
    background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: 18, minWidth: 0,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', boxShadow: 'var(--sh-xs)',
  },
  carteTete: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  carteIcone: {
    width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--accent-light)', color: 'var(--accent)',
  },
  carteTitre: { margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 19, lineHeight: 1.2, color: 'var(--text)' },
  carteSousTitre: { fontSize: 12.5, color: 'var(--text2)', marginTop: 2 },
  puce: {
    display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap',
    fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
  },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0, boxSizing: 'border-box',
    padding: '8px 10px', minHeight: 48, borderRadius: 12, textAlign: 'left',
    background: 'transparent', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14,
  },
  ligneBouton: { cursor: 'pointer', border: 'none' },
  sousTitre: {
    display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline',
    fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5,
    margin: '14px 0 6px',
  },
  texte2: { fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45 },
  nom: { display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  vide: { fontSize: 13, color: 'var(--text2)', padding: '6px 2px' },
};
