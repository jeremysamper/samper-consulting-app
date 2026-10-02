import { useCallback, useEffect, useRef, useState } from 'react';
import BoiteEnvoi from '../spa/BoiteEnvoi.jsx';
import { appelerMailer } from '../spa/spaData.js';
import '../spa/spa.css';

// ─────────────────────────────────────────────────────────────────────────────
// Boîte d'envoi du restaurant, dans les réglages du module Réservations.
//
// C'est la même boîte que celle du Spa (une par établissement, spa-mailer) :
// les confirmations de réservation et leur récapitulatif en partent. Le
// composant vient du module Spa ; la classe .spa lui donne ses couleurs, le
// fond reste celui des réglages.
// ─────────────────────────────────────────────────────────────────────────────

export default function BoiteEnvoiReservations({ etablissementId, consultant = false }) {
  const [etat, setEtat] = useState(null); // réponse de spa-mailer « etat », null = inconnu
  const [erreurService, setErreurService] = useState(null);
  const demande = useRef(0);

  // Relue aussi après une connexion ou une déconnexion.
  const chargerEtat = useCallback(() => {
    if (!etablissementId) return;
    const n = ++demande.current;
    appelerMailer('etat', { etablissementId }).then(({ data, error }) => {
      if (n !== demande.current) return;
      setErreurService(error || null);
      if (!error) setEtat(data);
    });
  }, [etablissementId]);

  useEffect(() => {
    setEtat(null);
    chargerEtat();
    return () => { demande.current += 1; };
  }, [chargerEtat]);

  return (
    <div className="spa" style={{ background: 'transparent' }}>
      <BoiteEnvoi
        etablissementId={etablissementId}
        etat={etat}
        erreurService={erreurService}
        onRecharger={chargerEtat}
        consultant={consultant}
        contexte="restaurant"
      />
    </div>
  );
}
