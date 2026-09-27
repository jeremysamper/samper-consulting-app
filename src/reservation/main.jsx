import React from 'react';
import { createRoot } from 'react-dom/client';
import ReservationEnLigne from './ReservationEnLigne.jsx';

// Page publique de réservation d'un spa (/reserver/<adresse>), affichée seule
// ou dans le site du client via widget-spa.js. Aucune session, aucun accès
// direct à la base : tout passe par l'Edge Function spa-mailer (public_*).
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ReservationEnLigne />
  </React.StrictMode>
);
