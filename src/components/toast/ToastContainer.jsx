import { useEffect, useState } from 'react';

let toasts = [];
let nextId = 1;
let listeners = [];

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

export function dismissNotify(id) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
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
          className={`toast toast-${toast.type}`}
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

function getIcon(type) {
  if (type === 'success') return 'OK';
  if (type === 'error') return '!';
  if (type === 'warning') return '!';
  return 'i';
}
