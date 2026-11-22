import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { borneAuLancement } from './modules/planning/borne/borneAppareil.js';
import { initPwa } from './pwa/registerPwa.js';
import { installPreloadErrorRecovery } from './utils/preloadErrorRecovery.js';
import { installBrandPrintStyles } from './design/installPrintStyles.js';
import { appliquerPreferences } from './services/preferencesAppareil.js';
import { appliquerThemeInitial } from './hooks/useTheme.js';
import './styles/fonts.css';
import './styles/app.css';

// Préférences de l'appareil (thème, taille du texte, densité, couleur,
// animations, contraste) posées sur <html> avant le premier rendu.
appliquerThemeInitial();
appliquerPreferences();

// Filet anti-crash après release : un chunk lazy introuvable (ancienne
// version encore ouverte) déclenche un rechargement unique et transparent.
installPreloadErrorRecovery();

// DA d'impression : polices de marque + règles @media print, construites depuis
// src/design/brandTokens.js. Couvre le Ctrl+P sur l'app ; les boutons d'export
// ont leur propre feuille, écrite par pdfUtils dans la fenêtre d'impression.
installBrandPrintStyles();

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  // L'erreur brute part dans la console ; l'écran dit seulement quoi faire.
  componentDidCatch(error, info) {
    console.error('[RootErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="migration-page">
          <section className="migration-panel">
            <h1>L'application a rencontré une erreur.</h1>
            <p className="intro">Rechargez la page ; si cela se reproduit, prévenez votre consultant.</p>
            <button type="button" className="ui-btn ui-btn--primary migration-bouton" onClick={() => window.location.reload()}>Recharger la page</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

// Appareil déclaré comme borne de pointage (Réglages > Planning > Pointage) :
// l'écran de la borne, en plein écran et sans session, à la place de l'app.
const Borne = React.lazy(() => import('./modules/planning/borne/Borne.jsx'));

createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    {borneAuLancement() ? <React.Suspense fallback={null}><Borne /></React.Suspense> : <App />}
  </RootErrorBoundary>
);

// Pré-splash de vite-index.html : fondu puis retrait dès que React a peint son
// premier cadre (le BootScreen partage le même fond, la transition est
// invisible ; le pré-splash ne porte pas de logo).
// Double rAF : le premier se cale sur le cadre en cours, le second garantit que
// le rendu React est bien à l'écran avant de retirer le voile. Un onglet ouvert
// en arrière-plan ne déclenche aucun rAF tant qu'il n'est pas affiché : la
// minuterie sert de repli pour que le voile ne reste jamais posé sur l'app.
const dismissPreSplash = () => {
  const preSplash = document.getElementById('pre-splash');
  if (!preSplash) return;
  preSplash.classList.add('done');
  setTimeout(() => preSplash.remove(), 400);
};
requestAnimationFrame(() => {
  requestAnimationFrame(dismissPreSplash);
});
setTimeout(dismissPreSplash, 1500);

// Service worker PWA : app shell hors-ligne + stratégie de mise à jour 'prompt'.
initPwa();
