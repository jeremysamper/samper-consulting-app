import React from 'react';
import { Btn } from '../components/ui/index.jsx';

class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  // Le message brut part dans la console seulement : à l'écran, la brigade
  // n'en tirerait rien.
  componentDidCatch(error, info) {
    console.error(`[SafeModule] ${this.props.name || 'module'}`, error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="module-placeholder">
          <p>Ce module n'a pas pu s'afficher. Rechargez la page ; si cela se reproduit, prévenez votre consultant.</p>
          <div>
            <Btn variant="primary" onClick={() => window.location.reload()}>Recharger la page</Btn>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

export default function SafeModule({ name, children }) {
  return <ModuleErrorBoundary name={name}>{children}</ModuleErrorBoundary>;
}
