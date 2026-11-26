import React from 'react';
import { createRoot } from 'react-dom/client';
import DemandeChambre from './DemandeChambre.jsx';
import '../styles/fonts.css';

// Page publique de la demande par le QR de la chambre (/chambre/<jeton>,
// lot 17). Entrée à part (chambre.html) : ni le bundle de l'app, ni app.css,
// ni session.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DemandeChambre />
  </React.StrictMode>
);
