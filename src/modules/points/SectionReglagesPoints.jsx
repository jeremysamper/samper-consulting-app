import React from 'react';
import { canManageModule } from '../../data/demoData.js';
import { usePointsEtat } from './pointsEtat.js';
import { OngletReglages } from './GestionPoints.jsx';
import './points.css';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Points » de la page des réglages (plan 15, lot 2) : l'onglet
// « Réglages » du module, tel quel (allumer, barème, plafonds, participants).
// Même garde qu'avant : qui gère les points (direction et droit « gérer »).
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionReglagesPoints({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const etat = usePointsEtat(etabId, user?.id, { gereFront: canManageModule(user?.role, 'points'), role: user?.role });
  if (!etabId) return null;
  if (!etat.pret) return <p className="points-aide">Chargement…</p>;
  if (!etat.gere) return <p className="points-aide">Les points se règlent par la direction de la maison.</p>;
  return <OngletReglages etabId={etabId} user={user} etat={etat} etablissement={etablissement} />;
}
