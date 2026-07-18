import React from 'react';

class ModuleErrorBoundary extends React.Component {
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
        <section className="module-placeholder">
          <div className="form-alert error">
            Le module {this.props.name || 'courant'} a rencontre une erreur :{' '}
            {this.state.error.message || String(this.state.error)}
          </div>
          <button
            type="button"
            className="ghost-button compact"
            style={{ marginTop: 12 }}
            onClick={() => window.location.reload()}
          >
            Recharger la page
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

export default function SafeModule({ name, children }) {
  return <ModuleErrorBoundary name={name}>{children}</ModuleErrorBoundary>;
}
