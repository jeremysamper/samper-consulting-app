import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import ReservationEnLigne from './ReservationEnLigne.jsx';
import { installDigitFont } from '../design/installDigitFont.js';

// Guide d'installation, chargé seulement sur son adresse.
const GuideIntegration = lazy(() => import('./GuideIntegration.jsx'));

// Page publique de réservation d'un spa (/reserver/<adresse>), affichée seule
// ou dans le site du client via widget-spa.js. Aucune session, aucun accès
// direct à la base : tout passe par l'Edge Function spa-mailer (public_*).
// /reserver/<adresse>/integrer : guide d'installation pour la personne qui
// gère le site du spa.
const guide = /\/reserver\/[a-z0-9-]+\/integrer\/?$/i.test(window.location.pathname);

// Chiffres des titres (Zodiak) rendus en Satoshi, comme dans l'app.
installDigitFont();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {guide ? (
      <Suspense fallback={null}>
        <GuideIntegration />
      </Suspense>
    ) : (
      <ReservationEnLigne />
    )}
  </React.StrictMode>
);
