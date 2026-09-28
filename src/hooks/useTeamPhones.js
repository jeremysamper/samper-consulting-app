import React from 'react';
import { profileService } from '../services/supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Téléphones de l'équipe, saisis par chacun dans « Mon compte »
// (table profile_contacts). → { [userId]: tel }
//
// La RLS n'en montre qu'au consultant (tous) et au patron (ses établissements) :
// pour les autres rôles on ne les demande même pas, ils ne liraient que le leur.
// Un échec de lecture laisse simplement la carte vide, jamais une erreur à
// l'écran : le numéro est un confort, pas une donnée du module.
// ─────────────────────────────────────────────────────────────────────────────

export const canSeeTeamPhones = (role) => role === 'consultant' || role === 'patron';

export function useTeamPhones(role) {
  const enabled = canSeeTeamPhones(role);
  const [phones, setPhones] = React.useState({});

  React.useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    profileService.listContacts()
      .then((map) => { if (alive) setPhones(map); })
      .catch((err) => console.warn('[useTeamPhones]', err));
    return () => { alive = false; };
  }, [enabled]);

  return enabled ? phones : {};
}
