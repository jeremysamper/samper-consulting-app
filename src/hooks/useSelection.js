import { useCallback, useState } from 'react';

// Mode sélection multiple réutilisable (cocher des éléments d'une liste pour
// les supprimer ou les exporter en lot).
//
// Retour :
//   active        : booléen — le mode sélection est-il activé
//   ids           : Set des identifiants sélectionnés
//   count         : nombre d'éléments sélectionnés
//   enter()       : active le mode sélection
//   exit()        : désactive le mode et vide la sélection
//   toggleMode()  : bascule le mode
//   toggle(id)    : (dé)sélectionne un élément
//   isSelected(id): l'élément est-il sélectionné
//   selectAll(ids): sélectionne tous les ids fournis
//   clear()       : vide la sélection (sans quitter le mode)
export function useSelection() {
  const [active, setActive] = useState(false);
  const [ids, setIds] = useState(() => new Set());

  const enter = useCallback(() => setActive(true), []);
  const exit = useCallback(() => { setActive(false); setIds(new Set()); }, []);
  const toggleMode = useCallback(() => {
    setActive(prev => {
      if (prev) setIds(new Set());
      return !prev;
    });
  }, []);

  const toggle = useCallback((id) => {
    setIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((allIds) => setIds(new Set(allIds || [])), []);
  const clear = useCallback(() => setIds(new Set()), []);
  const isSelected = useCallback((id) => ids.has(id), [ids]);

  return { active, ids, count: ids.size, enter, exit, toggleMode, toggle, isSelected, selectAll, clear };
}
