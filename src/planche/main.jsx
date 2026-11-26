import React from 'react';
import { createRoot } from 'react-dom/client';
import PlancheMouvement from './PlancheMouvement.jsx';
import { installerAppui } from '../utils/mouvement.js';
import '../styles/fonts.css';
import '../styles/app.css';

// Planche de mouvement (planche-mouvement.html) : page de décision, hors de
// l'app. Elle lit la vraie feuille de l'app et ses primitives, pour montrer
// les mouvements tels qu'ils seront. Ni session, ni base : elle n'importe
// rien du pont de données (les services de thème et de préférences
// l'amèneraient avec eux). Le thème et les animations réduites choisis dans
// l'app sur ce poste sont relus ici à la main, dans leurs deux clés.
function lireCle(cle) {
  try { return window.localStorage.getItem(cle); } catch { return null; }
}
const theme = lireCle('sc_theme');
if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
if (lireCle('sc_pref_mouvement') === 'reduit') document.documentElement.setAttribute('data-mouvement', 'reduit');

installerAppui();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PlancheMouvement />
  </React.StrictMode>
);
