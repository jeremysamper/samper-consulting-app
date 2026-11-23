import { useCallback, useEffect, useMemo, useState } from 'react';
import { profileService } from '../services/supabase.js';
import { ROLE_CONSULTANT, ecrireChoix, effacerChoix, lireChoix, peutChangerDeVue, profilAffiche } from '../services/vueRole.js';

// « Voir en tant que » du consultant (src/services/vueRole.js pour la règle).
// profil : le profil chargé par useAuth ; loading : l'auth n'a pas fini.
// Rend le profil que voit l'interface (profilVu), la possibilité de changer de
// vue, et choisir(role) ('consultant' = revenir à sa vue).
export function useVueRole(profil, loading) {
  const [choix, setChoix] = useState(() => lireChoix());
  // Rôle relu sur le serveur pour ce compte : seul un consultant confirmé
  // change de vue (une copie locale du profil, au démarrage hors ligne, ne
  // suffit pas).
  const [confirme, setConfirme] = useState({ id: null, ok: false });
  const id = profil?.id || null;
  const estConsultant = profil?.role === ROLE_CONSULTANT;

  useEffect(() => {
    if (!id || !estConsultant) return undefined;
    let actif = true;
    profileService.getProfile(id)
      .then((frais) => { if (actif) setConfirme({ id, ok: frais?.role === ROLE_CONSULTANT }); })
      .catch(() => { if (actif) setConfirme({ id, ok: false }); });
    return () => { actif = false; };
  }, [id, estConsultant]);

  // Déconnexion (plus de profil une fois l'auth chargée) : le choix s'efface.
  useEffect(() => {
    if (loading || profil) return;
    effacerChoix();
    setChoix(null);
  }, [loading, profil]);

  const ok = confirme.id === id && confirme.ok;
  const possible = peutChangerDeVue(profil, ok);
  const profilVu = useMemo(() => profilAffiche(profil, choix, ok), [profil, choix, ok]);

  const choisir = useCallback((role) => {
    if (!possible) return;
    setChoix(ecrireChoix(id, role));
  }, [possible, id]);

  return { profilVu, possible, choisir, roleVu: profilVu?.role || null, autreVue: Boolean(profilVu?.roleReel) };
}
