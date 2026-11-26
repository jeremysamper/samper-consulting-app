import { useEffect, useState } from 'react';
import Coche from '../ui/Coche.jsx';

let toasts = [];
let nextId = 1;
let listeners = [];

// Temps laissé à un message pour s'effacer avant son retrait (.mvt-depart,
// app.css). Un délai, pas la fin de l'animation : le navigateur peut figer
// les images, le message doit partir quand même.
const DELAI_SORTIE = 180;

function emit() {
  listeners.forEach((listener) => listener(toasts));
}

export function subscribeToasts(listener) {
  listeners.push(listener);
  listener(toasts);

  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

// Le message s'efface, puis il est retiré. Un second appel pendant la sortie
// ne fait rien.
export function dismissNotify(id) {
  const toast = toasts.find((item) => item.id === id);
  if (!toast || toast.part) return;
  toasts = toasts.map((item) => (item.id === id ? { ...item, part: true } : item));
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((item) => item.id !== id);
    emit();
  }, DELAI_SORTIE);
}

export function notify(message, type = 'success', opts = {}) {
  const id = nextId++;
  const duration = typeof opts.duration === 'number' ? opts.duration : 3500;
  const safeType = ['info', 'success', 'error', 'warning'].includes(type) ? type : 'info';

  toasts = [
    ...toasts,
    {
      id,
      message: String(message || ''),
      type: safeType,
      createdAt: Date.now()
    }
  ];

  emit();

  if (duration > 0) {
    window.setTimeout(() => dismissNotify(id), duration);
  }

  return id;
}

export function installToastGlobals() {
  if (typeof window === 'undefined') return;

  window.notify = notify;
  window.dismissNotify = dismissNotify;
}

export function ToastContainer() {
  const [list, setList] = useState([]);

  useEffect(() => subscribeToasts(setList), []);

  if (list.length === 0) return null;

  return (
    <div className="toast-stack">
      {list.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast-${toast.type} ${toast.part ? 'mvt-depart' : 'toast-entre'}`}
          onClick={() => dismissNotify(toast.id)}
          role="status"
          aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
        >
          <span className="toast-icon">{getIcon(toast.type)}</span>
          <span className="toast-message">{toast.message}</span>
          <span className="toast-dismiss" aria-hidden="true">x</span>
        </button>
      ))}
    </div>
  );
}

// Un message de réussite porte la coche qui se trace (réponse visible d'une
// validation, partout dans l'app) ; les autres gardent leur signe.
function getIcon(type) {
  if (type === 'success') return <Coche taille={16} epaisseur={2.8} />;
  if (type === 'error') return '!';
  if (type === 'warning') return '!';
  return 'i';
}
