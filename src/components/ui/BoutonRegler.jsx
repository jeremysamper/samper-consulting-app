import React from 'react';
import { Btn } from './index.jsx';
import { getPermissionsForRole } from '../../data/demoData.js';
import { useShell } from '../../layouts/ShellContext.js';
import { ouvrirCompte } from '../../services/navigationService.js';
import { SECTIONS } from '../../modules/compte/registreReglages.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Régler » : le raccourci d'un module vers sa section de la page des
// réglages, en une touche (plan 15, lot 2). Rendu seulement pour qui ouvre
// cette section : la garde est celle du registre, jamais recopiée. Le geste
// retour ramène au module. parDessus : depuis un écran de travail, pour que
// cet écran garde son entrée d'historique.
// ─────────────────────────────────────────────────────────────────────────────

export function peutOuvrirSection(sectionId, { user, etablissement, shellMode }) {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section || !user) return false;
  try {
    return section.garde({ user, permissions: getPermissionsForRole(user.role), etablissement, shellMode }) === true;
  } catch {
    return false;
  }
}

// Une rangée qui ne porte que « Régler » : rendue seulement si le bouton
// l'est, pour ne pas laisser un vide qui repousse l'écran chez qui ne règle pas.
export function LigneRegler({ section, user, etablissement, className = 'module-actions no-print', style }) {
  const shell = useShell();
  if (!peutOuvrirSection(section, { user, etablissement, shellMode: shell?.mode || 'ordinateur' })) return null;
  return (
    <div className={className} style={style}>
      <BoutonRegler section={section} user={user} etablissement={etablissement} />
    </div>
  );
}

export default function BoutonRegler({ section, user, etablissement, parDessus = false, style }) {
  const shell = useShell();
  if (!peutOuvrirSection(section, { user, etablissement, shellMode: shell?.mode || 'ordinateur' })) return null;
  return (
    <Btn
      variant="ghost"
      onClick={() => ouvrirCompte(section, { parDessus })}
      style={{ minHeight: 44, flexShrink: 0, ...style }}
    >
      Régler
    </Btn>
  );
}
