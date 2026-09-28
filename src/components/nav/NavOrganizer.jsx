import React from 'react';
import { ChevronDown, ChevronUp, GripVertical, Pencil, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Mode « Organiser le menu » (consultant) : remplace la liste de navigation de
// la barre latérale ou du tiroir, le temps de ranger les modules.
//
//   - glisser la poignée pour déplacer un module, y compris vers une autre
//     rubrique ;
//   - ou les flèches ↑ ↓ (au clavier aussi : flèches haut/bas sur la poignée) ;
//     en haut ou en bas d'une rubrique, la flèche fait passer le module dans
//     la rubrique voisine ;
//   - les flèches d'une rubrique la déplacent en bloc ;
//   - les rubriques se renomment (crayon), s'ajoutent (« Ajouter une
//     rubrique ») et se suppriment (×) : leurs modules passent alors dans la
//     rubrique voisine. Rien n'est enregistré avant « Terminé ».
//
// Le nom d'une rubrique n'existe que dans l'ordre enregistré
// (app_settings.nav_order : [{ id, group }]) : renommer ne touche pas la base
// au-delà de cette valeur. Une rubrique restée vide n'est pas enregistrée.
//
// Glisser-déposer en Pointer Events (pas d'API HTML5, morte au doigt) : les
// écouteurs sont posés dans le pointerdown, la position est portée par le
// geste et non relue dans l'état React.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_GROUP_NAME = 40;

// key stable (le nom change) ; origName = nom à l'ouverture, pour transmettre
// les renommages aux modules que le consultant ne voit pas ici.
function buildGroups(items) {
  const names = [];
  items.forEach((item) => { if (!names.includes(item.group)) names.push(item.group); });
  return names.map((name, index) => ({
    key: `g${index}`,
    name,
    origName: name,
    ids: items.filter((i) => i.group === name).map((i) => i.id),
  }));
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, ' ').slice(0, MAX_GROUP_NAME);
}

function moveItem(groups, id, toGroupIndex, toIndex) {
  const next = groups.map((g) => ({ ...g, ids: g.ids.filter((x) => x !== id) }));
  const target = next[toGroupIndex];
  const at = Math.max(0, Math.min(toIndex, target.ids.length));
  target.ids = [...target.ids.slice(0, at), id, ...target.ids.slice(at)];
  return next;
}

export default function NavOrganizer({ items, getLabel, onSave, onCancel, onReset, variant = 'desktop' }) {
  const [groups, setGroups] = React.useState(() => buildGroups(items));
  const [editing, setEditing] = React.useState(null); // { key, draft, error }
  const newKeyRef = React.useRef(0);
  // Rubrique supprimée → rubrique qui a repris ses modules (clé → clé).
  const mergedRef = React.useRef({});
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

  // ── Rubriques : renommer, ajouter, supprimer ───────────────────────
  const nameTaken = (name, exceptKey) => groups.some(
    (grp) => grp.key !== exceptKey && grp.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'),
  );

  const startRename = (grp) => setEditing({ key: grp.key, draft: grp.name, error: '' });

  // Entrée : un nom vide ou déjà pris affiche l'erreur et garde la saisie.
  // Sortie du champ : un nom invalide est simplement abandonné.
  const commitRename = ({ keepOnError }) => {
    if (!editing) return;
    const name = cleanName(editing.draft);
    const error = !name ? 'Le nom ne peut pas être vide.'
      : nameTaken(name, editing.key) ? 'Une rubrique porte déjà ce nom.' : '';
    if (error) {
      if (keepOnError) setEditing({ ...editing, error });
      else setEditing(null);
      return;
    }
    setGroups((prev) => prev.map((grp) => (grp.key === editing.key ? { ...grp, name } : grp)));
    setEditing(null);
  };

  const addGroup = () => {
    let name = 'Nouvelle rubrique';
    for (let n = 2; nameTaken(name); n += 1) name = `Nouvelle rubrique ${n}`;
    newKeyRef.current += 1;
    const key = `n${newKeyRef.current}`;
    setGroups((prev) => [...prev, { key, name, origName: null, ids: [] }]);
    setEditing({ key, draft: name, error: '' });
  };

  // Les modules d'une rubrique supprimée rejoignent la rubrique du dessus (ou
  // celle du dessous pour la première) : rien ne disparaît du menu.
  const removeGroup = (g) => {
    if (groups.length < 2) return;
    const target = g > 0 ? g - 1 : 1;
    const removed = groups[g];
    mergedRef.current[removed.key] = groups[target].key;
    setGroups((prev) => prev
      .map((grp, index) => {
        if (index !== target) return grp;
        return { ...grp, ids: target < g ? [...grp.ids, ...removed.ids] : [...removed.ids, ...grp.ids] };
      })
      .filter((_, index) => index !== g));
    if (editing?.key === removed.key) setEditing(null);
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

  // Ancien nom → nouveau, pour chaque rubrique d'origine renommée ou fondue
  // dans une autre : les modules masqués ici (inactifs dans cet établissement)
  // suivent leur rubrique au lieu d'en recréer une sous l'ancien nom.
  const collectRenames = () => {
    const nameByKey = new Map(groups.map((grp) => [grp.key, grp.name]));
    const resolve = (key) => {
      let k = key;
      for (let guard = 0; !nameByKey.has(k) && mergedRef.current[k] && guard < 50; guard += 1) k = mergedRef.current[k];
      return nameByKey.get(k);
    };
    const renames = Object.create(null);
    buildGroups(items).forEach((orig) => {
      const now = resolve(orig.key);
      if (now && now !== orig.origName) renames[orig.origName] = now;
    });
    return renames;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(groups.flatMap((g) => g.ids.map((id) => ({ id, group: g.name }))), collectRenames());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`nav-organizer${mobile ? ' is-mobile' : ''}`} ref={listRef}>
      <div className="nav-organizer-intro">
        Glissez les modules par la poignée, ou utilisez les flèches. Le crayon renomme une rubrique. Le nouvel ordre s'applique à tous les comptes.
      </div>
      {groups.map((group, g) => (
        <div key={group.key} className="nav-organizer-group" data-group-index={g}>
          <div className="nav-organizer-header" data-group-header>
            {editing?.key === group.key ? (
              <input
                className="nav-organizer-input"
                value={editing.draft}
                maxLength={MAX_GROUP_NAME}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => setEditing({ ...editing, draft: e.target.value, error: '' })}
                onKeyDown={(e) => {
                  // preventDefault : l'Échap global de la coque refermerait
                  // sinon le tiroir mobile en même temps que la saisie.
                  if (e.key === 'Enter') { e.preventDefault(); commitRename({ keepOnError: true }); }
                  if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
                }}
                onBlur={() => commitRename({ keepOnError: false })}
                aria-label="Nom de la rubrique"
                aria-invalid={editing.error ? 'true' : undefined}
              />
            ) : (
              <span className="nav-organizer-name">{group.name}</span>
            )}
            <span className="nav-organizer-arrows">
              {editing?.key !== group.key && (
                <button type="button" className="mini" onClick={() => startRename(group)} aria-label={`Renommer la rubrique ${group.name}`} title="Renommer"><Pencil size={13} /></button>
              )}
              <button type="button" className="mini" onClick={() => stepGroup(g, -1)} disabled={g === 0} aria-label={`Monter la rubrique ${group.name}`}><ChevronUp size={14} /></button>
              <button type="button" className="mini" onClick={() => stepGroup(g, 1)} disabled={g === groups.length - 1} aria-label={`Descendre la rubrique ${group.name}`}><ChevronDown size={14} /></button>
              <button type="button" className="mini" onClick={() => removeGroup(g)} disabled={groups.length < 2} aria-label={`Supprimer la rubrique ${group.name}`} title="Supprimer la rubrique (ses modules passent dans la voisine)"><X size={14} /></button>
            </span>
          </div>
          {editing?.key === group.key && editing.error && (
            <div className="nav-organizer-error" role="alert">{editing.error}</div>
          )}
          {group.ids.length === 0 && <div className="nav-organizer-empty">Rubrique vide : déposez-y un module, sinon elle ne sera pas gardée.</div>}
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
      <button type="button" className="nav-organizer-add" onClick={addGroup} disabled={saving}>
        Ajouter une rubrique
      </button>
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
