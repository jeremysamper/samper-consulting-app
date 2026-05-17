import React from 'react';
import { useDebouncedCallback } from '../../hooks/useDebounce.js';

// Champ de saisie à état local instantané.
//
// La frappe alimente un state local (rendu immédiat, aucun re-render du parent),
// puis la valeur est propagée au parent via `onCommit` débouncée (`delay` ms) et
// systématiquement au blur. Tant que le champ est focalisé, les changements de la
// prop `value` venus de l'extérieur (realtime, conversion d'unité…) sont ignorés
// pour ne pas perturber la frappe ; ils sont adoptés dès que le champ perd le focus.
//
// Props :
//   value     : valeur contrôlée venue du parent
//   onCommit  : (valeur) => void — appelé débouncé + au blur
//   delay     : délai de debounce en ms (défaut 400)
//   as        : 'input' (défaut) | 'textarea'
//   parse     : transforme la chaîne saisie avant `onCommit` (ex: Number)
//   ...rest   : props passées telles quelles à l'élément (style, placeholder, type…)
export function DebouncedField({ value, onCommit, delay = 400, as = 'input', parse, ...rest }) {
  const [local, setLocal] = React.useState(value ?? '');
  const localRef = React.useRef(local);
  localRef.current = local;
  const focusedRef = React.useRef(false);

  const emit = React.useCallback((raw) => {
    onCommit(parse ? parse(raw) : raw);
  }, [onCommit, parse]);

  const [debouncedEmit, flushEmit, cancelEmit] = useDebouncedCallback(emit, delay);

  // Adopte une valeur externe uniquement quand le champ n'est pas en cours de frappe.
  React.useEffect(() => {
    if (!focusedRef.current && value !== localRef.current) {
      setLocal(value ?? '');
    }
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setLocal(raw);
    debouncedEmit(raw);
  };

  const handleFocus = () => { focusedRef.current = true; };

  const handleBlur = () => {
    focusedRef.current = false;
    cancelEmit();
    emit(localRef.current);
  };

  const Tag = as;
  return (
    <Tag
      {...rest}
      value={local}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

export default DebouncedField;
