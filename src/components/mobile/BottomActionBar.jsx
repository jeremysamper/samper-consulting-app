/**
 * BottomActionBar — Barre d'actions native mobile
 *
 * Visible uniquement sur mobile (< 768px), masquée sur desktop.
 * Position fixed en bas de l'écran avec safe-area-inset.
 * Texte seul — zéro icône/emoji pour respecter la DA de l'app.
 *
 * Props :
 *   actions      : [{ label, onClick, disabled?, variant? }]
 *                  variant = 'default' | 'destructive'
 *                  max 3 actions secondaires recommandé
 *   primaryAction: { label, onClick, disabled? }
 *                  CTA principal (accent, à droite)
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
            type="button"
            aria-label={action.label}
          >
            {action.label}
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
          {primaryAction.label}
        </button>
      )}
    </div>
  );
}
