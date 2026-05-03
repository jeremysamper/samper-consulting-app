// ═══════════════════════════════════════════════════════════════
// SAMPER CONSULTING — KIT CUISINIER (V1)
// ═══════════════════════════════════════════════════════════════
// Bibliothèque centralisée : fiches libres + références SOP/recettes/documents

const KIT_TYPES = [
  { id: 'haccp',         label: 'HACCP',          icon: '🛡',  color: '#dc2626' },
  { id: 'preparation',   label: 'Préparation',    icon: '🔪',  color: '#d97706' },
  { id: 'service',       label: 'Service',        icon: '🍽',  color: '#0ea5e9' },
  { id: 'mise_en_place', label: 'Mise en place',  icon: '📋',  color: '#16a34a' },
  { id: 'stockage',      label: 'Stockage',       icon: '❄',  color: '#0284c7' },
  { id: 'recette',       label: 'Recette',        icon: '🍳',  color: '#92400e' },
  { id: 'sop',           label: 'SOP',            icon: '☑',  color: '#7c3aed' },
  { id: 'document',      label: 'Document',       icon: '📄',  color: '#64748b' },
  { id: 'custom',        label: 'Fiche libre',    icon: '📝',  color: '#475569' },
];

const KIT_TYPE_MAP = Object.fromEntries(KIT_TYPES.map(t => [t.id, t]));

// ─── Composant racine ───
const KitCuisinier = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const canManage = ['consultant', 'patron', 'resp_cuisine'].includes(user.role);

  const [items, setItems] = React.useState([]);
  const [sops, setSops] = React.useState([]);
  const [recettes, setRecettes] = React.useState([]);
  const [docs, setDocs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const [search, setSearch] = React.useState('');
  const [filterType, setFilterType] = React.useState('all');
  const [filterEssential, setFilterEssential] = React.useState(false);
  const [editing, setEditing] = React.useState(null);  // null | item à éditer | {} pour nouveau
  const [viewing, setViewing] = React.useState(null);  // item en mode lecture

  // Chargement initial + realtime
  React.useEffect(() => {
    if (!window.SB) { setLoading(false); return; }
    let mounted = true;

    const refresh = async () => {
      try {
        const [its, sps, rcs, dcs] = await Promise.all([
          window.SB.db.listKitItems(etabId),
          window.SB.db.listSops(etabId).catch(() => []),
          window.SB.db.listRecettes(etabId).catch(() => []),
          window.SB.db.listDocuments(etabId).catch(() => []),
        ]);
        if (mounted) {
          setItems(its);
          setSops(sps);
          setRecettes(rcs);
          setDocs(dcs);
          setLoading(false);
        }
      } catch (err) {
        console.error('[KitCuisinier]', err);
        if (mounted) setLoading(false);
      }
    };
    refresh();

    const u1 = window.SB.realtime.subscribe('kit_items', refresh);
    return () => { mounted = false; u1 && u1(); };
  }, [etabId]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  // Filtres
  const filtered = items.filter(it => {
    if (filterEssential && !it.isEssential) return false;
    if (filterType !== 'all' && it.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!it.title.toLowerCase().includes(q)
        && !(it.description || '').toLowerCase().includes(q)
        && !(it.tags || []).some(t => t.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // Grouper par type
  const byType = {};
  filtered.forEach(it => { (byType[it.type] = byType[it.type] || []).push(it); });

  // Mode édition
  if (editing !== null && canManage) {
    return <KitItemEditor
      item={editing}
      etabId={etabId}
      sops={sops} recettes={recettes} docs={docs}
      onBack={() => setEditing(null)}
    />;
  }

  // Mode lecture détail
  if (viewing !== null) {
    return <KitItemViewer
      item={viewing}
      sops={sops} recettes={recettes} docs={docs}
      canManage={canManage}
      onEdit={() => { setViewing(null); setEditing(viewing); }}
      onBack={() => setViewing(null)}
    />;
  }

  return (
    <div style={ks.root}>
      {/* Header */}
      <div style={ks.header}>
        <div>
          <h1 style={ks.title}>🍳 Kit cuisinier</h1>
          <div style={ks.subtitle}>
            {items.length} fiche{items.length > 1 ? 's' : ''}
            {items.filter(i => i.isEssential).length > 0 && ` · ${items.filter(i => i.isEssential).length} essentielle${items.filter(i => i.isEssential).length > 1 ? 's' : ''}`}
          </div>
        </div>
        {canManage && (
          <button style={ks.primaryBtn} onClick={() => setEditing({})}>+ Nouvelle fiche</button>
        )}
      </div>

      {/* Filtres */}
      <div style={ks.filtersBar}>
        <input
          type="text"
          placeholder="Rechercher dans le kit…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={ks.searchInput}
        />
        <button
          style={{ ...ks.essentialChip, ...(filterEssential ? ks.essentialChipActive : {}) }}
          onClick={() => setFilterEssential(!filterEssential)}
        >
          ⭐ Essentielles
        </button>
      </div>

      <div style={ks.typeChips}>
        <button
          style={{ ...ks.chip, ...(filterType === 'all' ? ks.chipActive : {}) }}
          onClick={() => setFilterType('all')}
        >Tous</button>
        {KIT_TYPES.map(t => {
          const count = items.filter(i => i.type === t.id).length;
          if (count === 0) return null;
          return (
            <button key={t.id}
              style={{
                ...ks.chip,
                ...(filterType === t.id ? { ...ks.chipActive, background: t.color, borderColor: t.color } : {})
              }}
              onClick={() => setFilterType(t.id)}
            >
              {t.icon} {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={ks.empty}>
          <div style={{ fontSize: 40, opacity: 0.3 }}>📚</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>
            {items.length === 0 ? 'Kit vide' : 'Aucun résultat'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            {items.length === 0
              ? 'Créez votre première fiche en cliquant "+ Nouvelle fiche"'
              : 'Modifiez vos filtres'}
          </div>
        </div>
      )}

      {/* Cards par type */}
      {KIT_TYPES.filter(t => byType[t.id]?.length > 0).map(typ => (
        <div key={typ.id} style={{ marginBottom: 24 }}>
          <div style={ks.groupHeader}>
            <span style={{ ...ks.typeDot, background: typ.color }}>{typ.icon}</span>
            <span style={ks.groupTitle}>{typ.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>({byType[typ.id].length})</span>
          </div>
          <div style={ks.cardsGrid}>
            {byType[typ.id].map(item => (
              <KitCard
                key={item.id}
                item={item}
                onClick={() => setViewing(item)}
                canManage={canManage}
                sops={sops} recettes={recettes} docs={docs}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Carte d'un item ───
const KitCard = ({ item, onClick, canManage, sops, recettes, docs }) => {
  const typeMeta = KIT_TYPE_MAP[item.type] || KIT_TYPE_MAP.custom;

  // Résoudre le nom de l'objet lié si applicable
  let linkedName = null;
  if (item.linkedType && item.linkedId) {
    if (item.linkedType === 'sop') linkedName = sops.find(s => s.id === item.linkedId)?.titre;
    else if (item.linkedType === 'recette') linkedName = recettes.find(r => r.id === item.linkedId)?.nom;
    else if (item.linkedType === 'document') linkedName = docs.find(d => d.id === item.linkedId)?.nom;
  }

  return (
    <div style={ks.card} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>{typeMeta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={ks.cardTitle}>
            {item.isEssential && <span style={{ color: '#f59e0b', marginRight: 4 }}>⭐</span>}
            {item.title}
          </div>
          {item.description && (
            <div style={ks.cardDesc}>
              {item.description.slice(0, 100)}{item.description.length > 100 ? '…' : ''}
            </div>
          )}
        </div>
      </div>
      {linkedName && (
        <div style={ks.cardLink}>
          → Lié à : <strong>{linkedName}</strong>
        </div>
      )}
      {(item.tags || []).length > 0 && (
        <div style={ks.cardTags}>
          {item.tags.slice(0, 4).map(t => (
            <span key={t} style={ks.tag}>{t}</span>
          ))}
          {item.tags.length > 4 && <span style={{ fontSize: 10, color: 'var(--text2)' }}>+{item.tags.length - 4}</span>}
        </div>
      )}
    </div>
  );
};

// ─── Vue lecture détail ───
const KitItemViewer = ({ item, sops, recettes, docs, canManage, onEdit, onBack }) => {
  const typeMeta = KIT_TYPE_MAP[item.type] || KIT_TYPE_MAP.custom;

  // Résoudre l'objet lié pour navigation
  let linkedName = null;
  let linkedDestPage = null;
  if (item.linkedType && item.linkedId) {
    if (item.linkedType === 'sop') {
      linkedName = sops.find(s => s.id === item.linkedId)?.titre;
      linkedDestPage = 'sop';
    } else if (item.linkedType === 'recette') {
      linkedName = recettes.find(r => r.id === item.linkedId)?.nom;
      linkedDestPage = 'cartes';
    } else if (item.linkedType === 'document') {
      linkedName = docs.find(d => d.id === item.linkedId)?.nom;
      linkedDestPage = 'documents';
    }
  }

  return (
    <div style={ks.viewerRoot}>
      <div style={ks.viewerHeader}>
        <button style={ks.backBtn} onClick={onBack}>← Retour</button>
        <div style={{ flex: 1 }} />
        {canManage && (
          <button style={ks.ghostBtn} onClick={onEdit}>✎ Modifier</button>
        )}
      </div>

      <div style={ks.viewerBody}>
        {/* Titre + métadonnées */}
        <div style={ks.viewerTitleBlock}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ ...ks.typeDot, background: typeMeta.color, fontSize: 18 }}>{typeMeta.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: typeMeta.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {typeMeta.label}
            </span>
            {item.isEssential && (
              <span style={{ ...ks.essentialBadge, fontSize: 11 }}>⭐ Essentielle</span>
            )}
          </div>
          <h1 style={ks.viewerTitle}>{item.title}</h1>
          {(item.tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              {item.tags.map(t => <span key={t} style={ks.tag}>{t}</span>)}
            </div>
          )}
        </div>

        {/* Lien vers objet existant */}
        {linkedName && (
          <div style={ks.linkedBlock}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Référence externe
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                → {linkedName}
              </div>
              {linkedDestPage && (
                <button
                  style={ks.primaryBtn}
                  onClick={() => {
                    // Navigation vers le module concerné
                    if (window.setPage) window.setPage(linkedDestPage);
                    else { localStorage.setItem('sc_page', linkedDestPage); window.location.reload(); }
                  }}
                >
                  Ouvrir →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Description / contenu (markdown simple) */}
        {item.description && (
          <div style={ks.viewerContent}>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              {item.description}
            </div>
          </div>
        )}

        {!item.description && !linkedName && (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text2)', fontSize: 13, fontStyle: 'italic' }}>
            Cette fiche n'a pas encore de contenu. {canManage ? 'Cliquez "✎ Modifier" pour l\'enrichir.' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Éditeur ───
const KitItemEditor = ({ item, etabId, sops, recettes, docs, onBack }) => {
  const isNew = !item?.id;
  const [data, setData] = React.useState({
    title: '',
    description: '',
    type: 'custom',
    linkedType: null,
    linkedId: null,
    tags: [],
    isEssential: false,
    actif: true,
    ...item,
  });
  const [tagInput, setTagInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const setField = (k, v) => setData(prev => ({ ...prev, [k]: v }));

  // Liste des objets liables selon le type sélectionné
  const linkableObjects = (() => {
    if (data.linkedType === 'sop') return sops.map(s => ({ id: s.id, label: s.titre }));
    if (data.linkedType === 'recette') return recettes.map(r => ({ id: r.id, label: r.nom }));
    if (data.linkedType === 'document') return docs.filter(d => d.type === 'file').map(d => ({ id: d.id, label: d.nom }));
    return [];
  })();

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if ((data.tags || []).includes(t)) { setTagInput(''); return; }
    setField('tags', [...(data.tags || []), t]);
    setTagInput('');
  };
  const removeTag = (t) => setField('tags', (data.tags || []).filter(x => x !== t));

  const save = async () => {
    if (!data.title?.trim()) { alert('Titre obligatoire.'); return; }
    if (data.linkedType && !data.linkedId) {
      alert('Sélectionnez l\'élément à lier ou choisissez "Aucun" comme type de lien.');
      return;
    }
    setSaving(true);
    try {
      await window.SB.db.upsertKitItem({ ...data, etablissementId: etabId });
      onBack();
    } catch (err) {
      window.notify('Erreur : ' + err.message, 'error');
      setSaving(false);
    }
  };

  const deleteItem = async () => {
    if (!data.id) return;
    if (!window.confirm(`Supprimer la fiche "${data.title}" ?`)) return;
    try {
      await window.SB.db.deleteKitItem(data.id);
      onBack();
    } catch (err) { window.notify('Erreur : ' + err.message, 'error'); }
  };

  return (
    <div style={ks.viewerRoot}>
      <div style={ks.viewerHeader}>
        <button style={ks.backBtn} onClick={onBack}>← Annuler</button>
        <div style={{ flex: 1 }} />
        {!isNew && (
          <button style={{ ...ks.ghostBtn, color: '#dc2626', borderColor: '#fca5a5' }} onClick={deleteItem}>🗑 Supprimer</button>
        )}
        <button style={ks.primaryBtn} onClick={save} disabled={saving}>
          {saving ? '...' : (isNew ? 'Créer' : 'Enregistrer')}
        </button>
      </div>

      <div style={ks.viewerBody}>
        <div style={ks.editorCard}>
          <input
            type="text"
            value={data.title}
            onChange={e => setField('title', e.target.value)}
            placeholder="Titre de la fiche"
            style={ks.bigTitle}
          />

          {/* Type + Essentielle */}
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={ks.fieldLabel}>Catégorie</label>
              <select value={data.type} onChange={e => setField('type', e.target.value)} style={ks.select}>
                {KIT_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: data.isEssential ? '#fef3c7' : 'var(--bg)', border: `1px solid ${data.isEssential ? '#fde68a' : 'var(--border)'}`, borderRadius: 7, cursor: 'pointer' }}>
              <input type="checkbox"
                checked={data.isEssential}
                onChange={e => setField('isEssential', e.target.checked)}
                style={{ accentColor: '#f59e0b', width: 16, height: 16 }}/>
              <span style={{ fontSize: 13, fontWeight: 600, color: data.isEssential ? '#92400e' : 'var(--text)' }}>
                ⭐ Essentielle
              </span>
            </label>
          </div>
        </div>

        {/* Lien vers un objet existant */}
        <div style={ks.editorCard}>
          <label style={ks.fieldLabel}>Lier à un élément existant (optionnel)</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <select
              value={data.linkedType || ''}
              onChange={e => setField('linkedType', e.target.value || null) || setField('linkedId', null)}
              style={{ ...ks.select, flex: 1, minWidth: 130 }}
            >
              <option value="">— Aucun lien —</option>
              <option value="sop">📋 SOP</option>
              <option value="recette">🍳 Recette</option>
              <option value="document">📄 Document</option>
            </select>
            {data.linkedType && (
              <select
                value={data.linkedId || ''}
                onChange={e => setField('linkedId', e.target.value || null)}
                style={{ ...ks.select, flex: 2, minWidth: 200 }}
              >
                <option value="">— Choisir —</option>
                {linkableObjects.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
            Pas de duplication : si vous liez une SOP/recette/document, les modifications de l'original seront automatiquement reflétées ici.
          </div>
        </div>

        {/* Description / contenu */}
        <div style={ks.editorCard}>
          <label style={ks.fieldLabel}>Contenu de la fiche {data.linkedType && '(optionnel — utile pour ajouter du contexte)'}</label>
          <textarea
            value={data.description || ''}
            onChange={e => setField('description', e.target.value)}
            placeholder={data.linkedType
              ? "Notes complémentaires, contexte, points d'attention…"
              : "Rédigez la fiche technique : procédure, points clés, températures cibles, etc."}
            rows={10}
            style={ks.textarea}
          />
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
            Les retours à la ligne sont préservés. Markdown basique pas encore supporté (V2).
          </div>
        </div>

        {/* Tags */}
        <div style={ks.editorCard}>
          <label style={ks.fieldLabel}>Tags</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, marginBottom: 8 }}>
            {(data.tags || []).map(t => (
              <span key={t} style={{ ...ks.tag, display: 'flex', alignItems: 'center', gap: 4 }}>
                {t}
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 11, padding: 0, marginLeft: 2 }}
                  onClick={() => removeTag(t)}
                >×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="Ajouter un tag (Entrée pour valider)"
              style={{ ...ks.input, flex: 1 }}
            />
            <button style={ks.ghostBtn} onClick={addTag}>+</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Styles ───
const ks = {
  root: { padding: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  title: { fontSize: 24, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', margin: 0 },
  subtitle: { fontSize: 12, color: 'var(--text2)', marginTop: 4 },
  primaryBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 },
  ghostBtn: { padding: '7px 14px', background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 },
  backBtn: { padding: '7px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)' },

  // Filtres
  filtersBar: { display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' },
  searchInput: { flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)' },
  essentialChip: { padding: '7px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text2)', whiteSpace: 'nowrap' },
  essentialChipActive: { background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e', fontWeight: 700 },
  typeChips: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  chip: { padding: '5px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text2)' },
  chipActive: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' },

  // Empty
  empty: { padding: 40, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },

  // Group header
  groupHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  typeDot: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, flexShrink: 0 },
  groupTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 },

  // Grid
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.1s' },
  cardTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  cardDesc: { fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.4 },
  cardLink: { fontSize: 11, color: 'var(--accent)', marginTop: 6, padding: '4px 8px', background: 'var(--accent-light)', borderRadius: 5, display: 'inline-block' },
  cardTags: { display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  tag: { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: 'var(--text2)', fontWeight: 500 },
  essentialBadge: { padding: '3px 8px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontWeight: 700 },

  // Viewer
  viewerRoot: { background: 'var(--bg)', minHeight: '100vh' },
  viewerHeader: { position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 },
  viewerBody: { padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800, margin: '0 auto' },
  viewerTitleBlock: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 },
  viewerTitle: { fontSize: 24, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', margin: 0, lineHeight: 1.2 },
  linkedBlock: { background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 10, padding: 14 },
  viewerContent: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 },

  // Editor
  editorCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 },
  bigTitle: { width: '100%', padding: '10px 0', border: 'none', borderBottom: '2px solid var(--border)', fontSize: 22, fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--text)', background: 'transparent', outline: 'none' },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 4 },
  input: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' },
  select: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical', marginTop: 4 },
};

Object.assign(window, { KitCuisinier });
