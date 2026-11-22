import React from 'react';
import { createRoot } from 'react-dom/client';
import CommandeQr from './CommandeQr.jsx';
import '../styles/fonts.css';

// Page publique de commande par QR (/commande/<adresse>, lot L3). Entrée à
// part (commande.html) : ni le bundle de l'app, ni app.css, ni session.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CommandeQr />
  </React.StrictMode>
);
