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

// Service worker PWA : app shell hors-ligne + stratégie de mise à jour 'prompt'.
initPwa();
