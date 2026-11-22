import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { reglerGroupes } from './typesGroupe.js';

// Réglages de la maison pour les Groupes (Réglages > Groupes) : lus une fois
// par l'écran qui les applique, posés dans le référentiel (typesGroupe.js)
// avant que l'écran ne lise un libellé, un type ou le délai d'alerte.
export function useReglagesGroupes(etabId) {
  const { reglages, status } = useReglagesModule(etabId, 'groupes');
  reglerGroupes(reglages);
  return { reglages, status };
}
