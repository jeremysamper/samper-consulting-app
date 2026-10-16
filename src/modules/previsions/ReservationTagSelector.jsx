import { useState } from 'react';

const TAG_GROUPS = [
  {
    label: 'Allergènes', type_tag: 'allergene',
    color:       { bg: 'var(--danger-bg-soft)', text: 'var(--danger-text)', border: 'var(--danger-bd)' },
    colorActive: { bg: 'var(--danger-text)', text: 'var(--surface)',    border: 'var(--danger-text)' },
    tags: ['gluten', 'lactose', 'noix', 'fruits_de_mer'],
  },
  {
    label: 'Régimes', type_tag: 'regime',
    color:       { bg: 'var(--success-bg-soft)', text: 'var(--success-text)', border: 'var(--success-bd)' },
    colorActive: { bg: 'var(--success-text)', text: 'var(--surface)',    border: 'var(--success-text)' },
    tags: ['vegetarien', 'vegan'],
  },
  {
    label: 'Occasions', type_tag: 'occasion',
    color:       { bg: 'var(--ai-bg-soft)', text: 'var(--ai-text)', border: 'var(--ai-bd)' },
    colorActive: { bg: 'var(--ai-text)', text: 'var(--surface)',    border: 'var(--ai-text)' },
    tags: ['anniversaire', 'menu_fixe'],
  },
];

const TYPE_OPTIONS = ['allergene', 'regime', 'occasion', 'autre'];
const TYPE_LABELS  = { allergene: 'Allergène', regime: 'Régime', occasion: 'Occasion', autre: 'Autre' };

// Libellé affiché d'un tag prédéfini ; la valeur enregistrée ne change pas.
const LIBELLES = { fruits_de_mer: 'fruits de mer', vegetarien: 'végétarien', menu_fixe: 'menu fixe' };
const libelleTag = (valeur) => LIBELLES[valeur] || String(valeur).replace(/_/g, ' ');

// compact (téléphone) : un seul nuage de tags en cases tactiles, sans titres
// de groupe ; la couleur dit le groupe (rouge allergène, vert régime).
export default function ReservationTagSelector({ value = [], onChange, compact = false }) {
  const [showDialog, setShowDialog] = useState(false);
  const [customValeur, setCustomValeur] = useState('');
  const [customType, setCustomType] = useState('allergene');

  function isSelected(type_tag, valeur) {
    return value.some((t) => t.type_tag === type_tag && t.valeur === valeur);
  }

  function toggleTag(type_tag, valeur, libre = false) {
    if (isSelected(type_tag, valeur)) {
      onChange(value.filter((t) => !(t.type_tag === type_tag && t.valeur === valeur)));
    } else {
      onChange([...value, { type_tag, valeur, libre }]);
    }
  }

  function addCustom() {
    const v = customValeur.trim();
    if (!v) return;
    if (!isSelected(customType, v)) onChange([...value, { type_tag: customType, valeur: v, libre: true }]);
    setCustomValeur('');
    setCustomType('allergene');
    setShowDialog(false);
  }

  const dialogue = showDialog && (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}
      onClick={() => setShowDialog(false)}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, width: 300, maxWidth: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: 'var(--text)' }}>Tag personnalisé</div>
        <input
          autoFocus
          placeholder="ex: allergie au céleri"
          value={customValeur}
          onChange={(e) => setCustomValeur(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {TYPE_OPTIONS.map((t) => (
            <button key={t} type="button" onClick={() => setCustomType(t)}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)',
                border: '1px solid transparent',
                background: customType === t ? 'var(--accent)' : 'var(--surface)',
                color:      customType === t ? 'var(--on-accent)' : 'var(--text)',
              }}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => setShowDialog(false)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 }}>
            Annuler
          </button>
          <button type="button" onClick={addCustom}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700 }}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );

  if (compact) {
    const autres = value.filter((t) => t.type_tag === 'autre');
    const puce = (key, on, libre, couleurs, label, onClick) => (
      <button key={key} type="button" aria-pressed={on} onClick={onClick}
        style={{
          minHeight: 44, padding: '0 14px', borderRadius: 22, cursor: 'pointer',
          fontSize: 14, fontWeight: 500, fontFamily: 'var(--font)',
          borderWidth: 1, borderStyle: libre ? 'dashed' : 'solid',
          borderColor: on ? couleurs.on.border : couleurs.off.border,
          background:  on ? couleurs.on.bg : couleurs.off.bg,
          color:       on ? couleurs.on.text : couleurs.off.text,
        }}>
        {label}
      </button>
    );
    return (
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TAG_GROUPS.flatMap((group) => {
            const couleurs = { off: group.color, on: group.colorActive };
            const libres = value.filter((t) => t.type_tag === group.type_tag && t.libre);
            return [
              ...group.tags.map((v) => puce(`${group.type_tag}-${v}`, isSelected(group.type_tag, v), false, couleurs, libelleTag(v), () => toggleTag(group.type_tag, v, false))),
              ...libres.map((t) => puce(`${group.type_tag}-libre-${t.valeur}`, true, true, couleurs, t.valeur, () => toggleTag(group.type_tag, t.valeur, true))),
            ];
          })}
          {autres.map((t) => puce(
            `autre-${t.valeur}`, true, true,
            { on: { bg: 'var(--surface2)', text: 'var(--text)', border: 'var(--border)' }, off: { bg: 'var(--surface)', text: 'var(--text)', border: 'var(--border)' } },
            t.valeur, () => toggleTag('autre', t.valeur, true),
          ))}
          <button type="button" onClick={() => setShowDialog(true)}
            style={{ minHeight: 44, padding: '0 14px', borderRadius: 22, cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'var(--font)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--accent)' }}>
            Autre
          </button>
        </div>
        {dialogue}
      </div>
    );
  }

  return (
    <div>
      {TAG_GROUPS.map((group) => {
        const libresInGroup = value.filter((t) => t.type_tag === group.type_tag && t.libre);
        const allTags = [
          ...group.tags.map((v) => ({ valeur: v, libre: false })),
          ...libresInGroup.map((t) => ({ valeur: t.valeur, libre: true })),
        ];
        return (
          <div key={group.type_tag} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 5 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allTags.map(({ valeur, libre }) => {
                const on = isSelected(group.type_tag, valeur);
                return (
                  <button key={valeur} type="button" onClick={() => toggleTag(group.type_tag, valeur, libre)}
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font)',
                      border: `1px ${libre ? 'dashed' : 'solid'} ${on ? group.colorActive.border : group.color.border}`,
                      background: on ? group.colorActive.bg : group.color.bg,
                      color:      on ? group.colorActive.text : group.color.text,
                    }}>
                    {libre ? valeur : libelleTag(valeur)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Tags 'autre' libres */}
      {value.filter((t) => t.type_tag === 'autre').length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 5 }}>
            Autres
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {value.filter((t) => t.type_tag === 'autre').map(({ valeur }) => (
              <button key={valeur} type="button" onClick={() => toggleTag('autre', valeur, true)}
                style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px dashed var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)' }}>
                {valeur} ×
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={() => setShowDialog(true)}
        style={{ marginTop: 4, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--font)', fontWeight: 500 }}>
        Tag personnalisé
      </button>

      {dialogue}
    </div>
  );
}
