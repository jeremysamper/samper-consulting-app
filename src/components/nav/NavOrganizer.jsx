import React from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Mode « Organiser le menu » (consultant) : remplace la liste de navigation de
// la barre latérale ou du tiroir, le temps de ranger les modules.
//
//   - glisser la poignée pour déplacer un module, y compris vers une autre
//     rubrique ;
//   - ou les flèches ↑ ↓ (au clavier aussi : flèches haut/bas sur la poignée) ;
//     en haut ou en bas d'une rubrique, la flèche fait passer le module dans
//     la rubrique voisine ;
//   - les flèches d'une rubrique la déplacent en bloc.
//
// Glisser-déposer en Pointer Events (pas d'API HTML5, morte au doigt) : les
// écouteurs sont posés dans le pointerdown, la position est portée par le
// geste et non relue dans l'état React.
// ─────────────────────────────────────────────────────────────────────────────

function buildGroups(items, defaultGroups) {
  const names = [];
  items.forEach((item) => { if (!names.includes(item.group)) names.push(item.group); });
  defaultGroups.forEach((g) => { if (!names.includes(g)) names.push(g); });
  return names.map((name) => ({ name, ids: items.filter((i) => i.group === name).map((i) => i.id) }));
}

function moveItem(groups, id, toGroupIndex, toIndex) {
  const next = groups.map((g) => ({ ...g, ids: g.ids.filter((x) => x !== id) }));
  const target = next[toGroupIndex];
  const at = Math.max(0, Math.min(toIndex, target.ids.length));
  target.ids = [...target.ids.slice(0, at), id, ...target.ids.slice(at)];
  return next;
}

export default function NavOrganizer({ items, defaultGroups, getLabel, onSave, onCancel, onReset, variant = 'desktop' }) {
  const [groups, setGroups] = React.useState(() => buildGroups(items, defaultGroups));
  const [dragId, setDragId] = React.useState(null);
  const [slot, setSlot] = React.useState(null); // { g, i } emplacement de dépôt
  const [saving, setSaving] = React.useState(false);
  const listRef = React.useRef(null);
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const mobile = variant === 'mobile';

  const locate = (id) => {
    for (let g = 0; g < groups.length; g += 1) {
      const i = groups[g].ids.indexOf(id);
      if (i !== -1) return { g, i };
    }
    return null;
  };

  const step = (id, dir) => {
    const at = locate(id);
    if (!at) return;
    const { g, i } = at;
    if (dir < 0) {
      if (i > 0) setGroups((prev) => moveItem(prev, id, g, i - 1));
      else if (g > 0) setGroups((prev) => moveItem(prev, id, g - 1, prev[g - 1].ids.length));
    } else if (i < groups[g].ids.length - 1) {
      setGroups((prev) => moveItem(prev, id, g, i + 1));
    } else if (g < groups.length - 1) {
      setGroups((prev) => moveItem(prev, id, g + 1, 0));
    }
    // Le focus suit le module déplacé (le bouton est recréé à sa nouvelle place).
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-grip="${id}"]`)?.focus());
  };

  const stepGroup = (g, dir) => {
    const to = g + dir;
    if (to < 0 || to >= groups.length) return;
    setGroups((prev) => {
      const next = [...prev];
      [next[g], next[to]] = [next[to], next[g]];
      return next;
    });
  };

  // Emplacements de dépôt : avant chaque module et en fin de rubrique.
  const computeSlot = (clientY, draggedId) => {
    const root = listRef.current;
    if (!root) return null;
    let best = null;
    root.querySelectorAll('[data-group-index]').forEach((section) => {
      const g = Number(section.dataset.groupIndex);
      const rows = [...section.querySelectorAll('[data-item-id]')].filter((r) => r.dataset.itemId !== draggedId);
      const header = section.querySelector('[data-group-header]').getBoundingClientRect();
      const ys = rows.map((r) => r.getBoundingClientRect().top);
      ys.push(rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : header.bottom);
      ys.forEach((y, i) => {
        const d = Math.abs(y - clientY);
        if (!best || d < best.d) best = { g, i, d };
      });
    });
    return best && { g: best.g, i: best.i };
  };

  const onGripPointerDown = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    const scroller = listRef.current?.closest('[data-nav-scroll]');
    let current = null;
    let lastY = e.clientY;
    let raf = null;
    setDragId(id);

    const autoScroll = () => {
      if (!scroller) return;
      const r = scroller.getBoundingClientRect();
      if (lastY < r.top + 40) scroller.scrollTop -= 8;
      else if (lastY > r.bottom - 40) scroller.scrollTop += 8;
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);

    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      lastY = ev.clientY;
      current = computeSlot(ev.clientY, id);
      setSlot(current);
    };
    const up = (ev) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      if (current && ev.type === 'pointerup') {
        const target = current;
        setGroups((prev) => moveItem(prev, id, target.g, target.i));
      }
      setDragId(null);
      setSlot(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(groups.flatMap((g) => g.ids.map((id) => ({ id, group: g.name }))));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`nav-organizer${mobile ? ' is-mobile' : ''}`} ref={listRef}>
      <div className="nav-organizer-intro">
        Glissez les modules par la poignée, ou utilisez les flèches. Le nouvel ordre s'applique à tous les comptes.
      </div>
      {groups.map((group, g) => (
        <div key={group.name} className="nav-organizer-group" data-group-index={g}>
          <div className="nav-organizer-header" data-group-header>
            <span>{group.name}</span>
            <span className="nav-organizer-arrows">
              <button type="button" className="mini" onClick={() => stepGroup(g, -1)} disabled={g === 0} aria-label={`Monter la rubrique ${group.name}`}><ChevronUp size={14} /></button>
              <button type="button" className="mini" onClick={() => stepGroup(g, 1)} disabled={g === groups.length - 1} aria-label={`Descendre la rubrique ${group.name}`}><ChevronDown size={14} /></button>
            </span>
          </div>
          {group.ids.length === 0 && <div className="nav-organizer-empty">Rubrique vide : déposez un module ici</div>}
          {group.ids.map((id, i) => {
            const item = byId.get(id);
            if (!item) return null;
            const label = getLabel(item.id, item.label);
            const isFirst = g === 0 && i === 0;
            const isLast = g === groups.length - 1 && i === group.ids.length - 1;
            return (
              <React.Fragment key={id}>
                {slot && dragId !== id && slot.g === g && slot.i === group.ids.filter((x) => x !== dragId).indexOf(id) && <div className="nav-organizer-drop" aria-hidden="true" />}
                <div className={`nav-organizer-row${dragId === id ? ' is-dragging' : ''}`} data-item-id={id}>
                  <button
                    type="button"
                    className="nav-organizer-grip mini"
                    data-grip={id}
                    onPointerDown={(e) => onGripPointerDown(e, id)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); step(id, -1); }
                      if (e.key === 'ArrowDown') { e.preventDefault(); step(id, 1); }
                    }}
                    aria-label={`Déplacer ${label} (flèches haut et bas)`}
                  >
                    <GripVertical size={16} aria-hidden="true" />
                  </button>
                  <span className="nav-organizer-label">{label}</span>
                  <span className="nav-organizer-arrows">
                    <button type="button" className="mini" onClick={() => step(id, -1)} disabled={isFirst} aria-label={`Monter ${label}`}><ChevronUp size={14} /></button>
                    <button type="button" className="mini" onClick={() => step(id, 1)} disabled={isLast} aria-label={`Descendre ${label}`}><ChevronDown size={14} /></button>
                  </span>
                </div>
              </React.Fragment>
            );
          })}
          {slot && slot.g === g && slot.i === group.ids.filter((x) => x !== dragId).length && <div className="nav-organizer-drop" aria-hidden="true" />}
        </div>
      ))}
      <div className="nav-organizer-actions">
        <button type="button" className="nav-organizer-save" onClick={handleSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Terminé'}
        </button>
        <button type="button" className="nav-organizer-ghost" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="button" className="nav-organizer-ghost" onClick={onReset} disabled={saving}>Ordre par défaut</button>
      </div>
    </div>
  );
}
