/**
 * BottomActionBar — Barre d'actions native mobile
 *
 * Visible uniquement sur mobile (< 768px), masquée sur desktop (cf. app.css).
 * Position fixed en bas de l'écran avec safe-area-inset iOS.
 *
 * Icônes vectorielles lucide-react (jamais d'emoji). La barre ne déborde
 * jamais : au-delà de `maxVisible` actions secondaires, le surplus bascule
 * dans une feuille « Plus » (overflow).
 *
 * Props :
 *   actions       : [{ label, onClick, disabled?, variant?, icon? }]
 *                   variant = 'default' | 'destructive' | 'danger'
 *                   icon    = composant lucide-react (ex: FileDown)
 *   primaryAction : { label, onClick, disabled?, icon? }
 *                   CTA principal (accent, prend l'espace restant à gauche)
 *   maxVisible    : nb max d'icônes secondaires avant débordement (défaut 3)
 */
import React, { useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';

const isDanger = (v) => v === 'destructive' || v === 'danger';

export default function BottomActionBar({ actions = [], primaryAction = null, maxVisible = 3 }) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  if (!actions.length && !primaryAction) return null;

  const visible = actions.slice(0, maxVisible);
  const overflow = actions.slice(maxVisible);
  const hasOverflow = overflow.length > 0;

  const closeSheet = () => setOverflowOpen(false);

  return (
    <>
      {/* Voile + feuille de débordement */}
      {overflowOpen && hasOverflow && (
        <>
          <div className="bab-overlay" onClick={closeSheet} />
          <div className="bab-sheet" role="menu" aria-label="Plus d'actions">
            <div className="bab-sheet-head">
              <span className="bab-sheet-title">Plus d'actions</span>
              <button
                type="button"
                className="bab-sheet-close"
                onClick={closeSheet}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            {overflow.map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={i}
                  type="button"
                  className={`bab-sheet-btn${isDanger(action.variant) ? ' bab-destructive' : ''}`}
                  onClick={() => { action.onClick?.(); closeSheet(); }}
                  disabled={action.disabled}
                >
                  {Icon && <Icon size={20} strokeWidth={1.75} />}
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* La barre */}
      <div className="bottom-action-bar" role="toolbar" aria-label="Actions">
        {/* CTA principal — prend l'espace restant */}
        {primaryAction && (
          <button
            type="button"
            className="bab-primary"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            aria-label={primaryAction.label}
          >
            {primaryAction.icon && <primaryAction.icon size={20} strokeWidth={2} />}
            <span className="bab-primary-label">{primaryAction.label}</span>
          </button>
        )}

        {/* Actions secondaires — icônes empilées, largeur fixe */}
        <div className="bab-secondary">
          {visible.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={i}
                type="button"
                className={`bab-btn${isDanger(action.variant) ? ' bab-destructive' : ''}`}
                onClick={action.onClick}
                disabled={action.disabled}
                aria-label={action.label}
              >
                {Icon && <Icon size={22} strokeWidth={1.75} />}
                <span className="bab-btn-label">{action.label}</span>
              </button>
            );
          })}

          {/* Débordement */}
          {hasOverflow && (
            <button
              type="button"
              className="bab-btn bab-more"
              onClick={() => setOverflowOpen((v) => !v)}
              aria-label="Plus d'actions"
              aria-expanded={overflowOpen}
            >
              <MoreHorizontal size={22} strokeWidth={1.75} />
              <span className="bab-btn-label">Plus</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
