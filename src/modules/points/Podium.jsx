import React from 'react';
import { formatPoints } from './bareme.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pièces partagées par l'écran de l'employé (MesPoints) et la gestion
// (GestionPoints) : le nombre de points, la médaille et le podium en trois
// cartes distinctes (17.11.2026, choix de Jérémy : médailles, pas de marches).
// ─────────────────────────────────────────────────────────────────────────────

// Nombre de points dans son nœud, le mot à côté (traduction du DOM).
export function NombrePoints({ n, signe = false, style }) {
  const v = Number(n) || 0;
  const texte = (signe && v > 0 ? '+' : '') + formatPoints(v);
  return (
    <span style={{ whiteSpace: 'nowrap', ...style }}>
      <span data-no-translate style={{ fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' }}>{texte}</span>
      {' '}<span>{Math.abs(v) > 1 ? 'points' : 'point'}</span>
    </span>
  );
}

// Médaille : or, argent, bronze selon le rang (deux premiers à égalité : deux
// médailles d'or), le rang écrit dessus. Couleurs par jetons (--medaille-*).
const COULEURS_MEDAILLE = { 1: 'var(--medaille-or)', 2: 'var(--medaille-argent)', 3: 'var(--medaille-bronze)' };
export function Medaille({ rang }) {
  return (
    <svg className="points-medaille" viewBox="0 0 40 50" role="img" aria-label={String(rang)} focusable="false" data-no-translate>
      <path d="M9 0h9l5 17h-9z" style={{ fill: 'var(--medaille-ruban)' }} />
      <path d="M31 0h-9l-5 17h9z" style={{ fill: 'var(--medaille-ruban)', opacity: 0.8 }} />
      <circle cx="20" cy="33" r="16" style={{ fill: COULEURS_MEDAILLE[rang] || 'var(--medaille-bronze)' }} />
      <circle cx="20" cy="33" r="12.5" style={{ fill: 'none', stroke: 'var(--medaille-texte)', strokeOpacity: 0.25, strokeWidth: 1 }} />
      <text x="20" y="33" textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--medaille-texte)', fontFamily: 'var(--font-num)', fontSize: 15, fontWeight: 400 }}>{rang}</text>
    </svg>
  );
}

// Podium : trois cartes distinctes, le 1er au centre, le 2e à gauche, le 3e à
// droite (placement par la feuille ; l'ordre de lecture reste 1, 2, 3).
// `onOuvrir` : la carte devient un bouton (gestion) ; sans lui, une carte
// simple (équipe). `p.moi` ajoute « Vous » sous le prénom.
export function PodiumCartes({ podium, onOuvrir }) {
  if (!podium?.length) return null;
  return (
    <section className="points-podium-section" aria-labelledby="points-podium-titre">
      <h2 id="points-podium-titre" className="points-section-titre">Podium</h2>
      <div className="points-podium">
        {podium.map((p, i) => {
          const contenu = (
            <>
              <Medaille rang={p.rang} />
              <span className="points-podium-prenom" data-no-translate>{p.prenom || 'Personne sans nom'}</span>
              {p.moi && <span className="points-podium-vous">Vous</span>}
              <NombrePoints n={p.solde} style={{ fontSize: 'var(--t1)', color: 'var(--text2)' }} />
            </>
          );
          return onOuvrir ? (
            <button key={p.userId} type="button" className="points-podium-place" data-place={i + 1} data-cadre="" onClick={() => onOuvrir(p)}>{contenu}</button>
          ) : (
            <div key={p.userId} className="points-podium-place" data-place={i + 1} data-cadre="">{contenu}</div>
          );
        })}
      </div>
    </section>
  );
}
