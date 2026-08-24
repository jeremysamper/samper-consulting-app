import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initPwa } from './pwa/registerPwa.js';
import { installPreloadErrorRecovery } from './utils/preloadErrorRecovery.js';
import { installBrandPrintStyles } from './design/installPrintStyles.js';
import './styles/app.css';

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

  render() {
    if (this.state.error) {
      return (
        <main className="migration-page">
          <section className="migration-panel">
            <p className="eyebrow">Migration Vite</p>
            <h1>Une erreur a interrompu le rendu.</h1>
            <pre className="error-box">{String(this.state.error?.message || this.state.error)}</pre>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);

// Pré-splash de vite-index.html : fondu puis retrait dès que React a peint son
// premier cadre (le BootScreen partage le même fond, la transition est invisible).
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
