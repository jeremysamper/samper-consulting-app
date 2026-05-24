/**
 * BottomActionBar — Barre d'actions native mobile
 *
 * Visible uniquement sur mobile (< 768px), masquée sur desktop.
 * Position fixed en bas de l'écran avec safe-area-inset.
 *
 * Props :
 *   actions      : [{ label, icon, onClick, disabled?, variant? }]
 *                  variant = 'default' | 'destructive'
 *                  max 3 actions secondaires recommandé
 *   primaryAction: { label, icon?, onClick, disabled? }
 *                  CTA principal (vert, à droite)
 */
import React from 'react';

export default function BottomActionBar({ actions = [], primaryAction = null }) {
  if (!actions.length && !primaryAction) return null;

  return (
    <div className="bottom-action-bar" role="toolbar" aria-label="Actions">
      <div className="bab-secondary">
        {actions.map((action, i) => (
          <button
            key={i}
            className={`bab-btn${action.variant === 'destructive' ? ' bab-destructive' : ''}`}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.label}
            type="button"
            aria-label={action.label}
          >
            {action.icon && <span className="bab-icon" aria-hidden="true">{action.icon}</span>}
            {action.label && <span className="bab-label">{action.label}</span>}
          </button>
        ))}
      </div>

      {primaryAction && (
        <button
          className="bab-primary"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          type="button"
          aria-label={primaryAction.label}
        >
          {primaryAction.icon && <span aria-hidden="true">{primaryAction.icon}</span>}
          <span>{primaryAction.label}</span>
        </button>
      )}
    </div>
  );
}
