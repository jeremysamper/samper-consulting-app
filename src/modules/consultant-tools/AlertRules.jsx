import React from 'react';
import { useAlertRules } from '../../hooks/useAlertRules.js';
import { notify } from '../../components/toast/index.js';
import { confirmLegacy } from '../../legacy/legacyApi.js';
import { cts } from './ConsultantTools.styles.js';
import AlertRuleForm from './AlertRuleForm.jsx';

// ─── Configs d'affichage ──────────────────────────────────────────
const RULE_TYPE_LABELS = {
  pointage_manquant:          'Pointage manquant',
  haccp_manquant:             'Relevé HACCP manquant',
  reservation_non_confirmee:  'Réservation non confirmée',
  stock_critique:             'Stock critique',
  ventes_inactives:           'Ventes inactives',
  pertes_elevees:             'Pertes élevées',
  personnalisee:              'Rappel personnalisé',
};

const SEVERITY_CONFIG = {
  info:     { label: 'Info',      color: 'var(--color-info, var(--info-strong))',    bg: 'rgba(59,130,246,.1)' },
  warning:  { label: 'Attention', color: 'var(--color-warning, var(--warning-strong))', bg: 'rgba(245,158,11,.1)' },
  critical: { label: 'Critique',  color: 'var(--color-error, var(--danger-strong))',   bg: 'rgba(239,68,68,.1)'  },
};

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? 's' : ''}`;
}

function scheduleLabel(rule) {
  if (rule.schedule_type === 'hourly') return 'Évaluation horaire';
  const time = (rule.schedule_time || '00:00:00').slice(0, 5);
  return `Quotidienne à ${time} UTC`;
}

// ─── AlertRuleCard ───────────────────────────────────────────────
function AlertRuleCard({ rule, onEdit, onDelete, onToggle }) {
  const sev = SEVERITY_CONFIG[rule.severity] || SEVERITY_CONFIG.warning;
  const typeLabel = RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type;
  const lastInfo = rule.last_triggered_at
    ? `Dernière alerte : ${formatRelativeTime(rule.last_triggered_at)}`
    : 'Jamais déclenchée';

  return (
    <div style={{
      display: 'flex', gap: 14, padding: '14px 16px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, borderLeft: `3px solid ${sev.color}`,
      opacity: rule.is_active ? 1 : 0.6,
      transition: 'opacity .15s',
    }}>
      {/* Indicateur actif/inactif */}
      <div style={{ fontSize: 16, marginTop: 3, color: rule.is_active ? sev.color : 'var(--text3)', flexShrink: 0 }}>
        {rule.is_active ? '●' : '○'}
      </div>

      {/* Contenu principal */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-serif)' }}>
            {rule.name}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: sev.bg, color: sev.color,
          }}>
            {sev.label}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 99,
            background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)',
          }}>
            {typeLabel}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          {scheduleLabel(rule)} · {lastInfo}
        </div>
        {rule.description && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{rule.description}</div>
        )}
      </div>

      {/* Boutons action */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0, flexWrap: 'wrap' }}>
        <button style={{ ...cts.ghostBtn, fontSize: 12, padding: '5px 10px' }} onClick={onEdit}>
          ✏ Éditer
        </button>
        <button
          style={{ ...cts.ghostBtn, fontSize: 12, padding: '5px 10px', color: rule.is_active ? 'var(--warning-strong)' : 'var(--success-strong)' }}
          onClick={onToggle}
        >
          {rule.is_active ? 'Désactiver' : 'Activer'}
        </button>
        <button
          style={{ ...cts.ghostBtn, fontSize: 12, padding: '5px 10px', color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)' }}
          onClick={onDelete}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── AlertRules principal ─────────────────────────────────────────
export default function AlertRules({ etablissement }) {
  const etabId = etablissement?.id;
  const {
    rules,
    createRule,
    updateRule,
    deleteRule,
    toggleActive,
    loading,
  } = useAlertRules(etabId);

  const [showForm, setShowForm] = React.useState(false);
  const [editRule, setEditRule] = React.useState(null);
  const [filterSeverity, setFilterSeverity] = React.useState('all');
  const [filterActive, setFilterActive] = React.useState('all');

  const openCreate = () => { setEditRule(null); setShowForm(true); };
  const openEdit = (rule) => { setEditRule(rule); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditRule(null); };

  const handleDelete = async (id) => {
    if (!confirmLegacy('Supprimer cette règle d\'alerte ? Les instances actives liées seront également supprimées.')) return;
    const { error } = await deleteRule(id);
    if (error) notify(error, 'error');
    else notify('Règle supprimée.', 'success');
  };

  const handleToggle = async (id) => {
    const { error } = await toggleActive(id);
    if (error) notify(error, 'error');
  };

  const handleSave = async (data) => {
    if (editRule) {
      const { error } = await updateRule(editRule.id, data);
      if (error) { notify(error, 'error'); return false; }
      notify('Règle mise à jour.', 'success');
    } else {
      const { error } = await createRule(data);
      if (error) { notify(error, 'error'); return false; }
      notify('Règle créée.', 'success');
    }
    closeForm();
    return true;
  };

  // Filtrage
  const filtered = rules.filter((r) => {
    if (filterSeverity !== 'all' && r.severity !== filterSeverity) return false;
    if (filterActive === 'active' && !r.is_active) return false;
    if (filterActive === 'inactive' && r.is_active) return false;
    return true;
  });

  const filterBtnBase = {
    padding: '5px 14px', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 99, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)',
    color: 'var(--text2)', transition: 'all .12s',
  };
  const filterBtnActive = { background: 'var(--accent-light)', color: 'var(--accent)', borderColor: 'var(--accent-bd)' };

  return (
    <div style={{ maxWidth: 860 }}>

      {/* ─── En-tête ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            Alertes configurées
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
            Règles d'alerte évaluées automatiquement par le cron horaire.
          </div>
        </div>
        <button style={cts.newBtn} onClick={openCreate}>+ Nouvelle règle</button>
      </div>

      {/* ─── Filtres ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'info', 'warning', 'critical'].map((sev) => (
          <button
            key={sev}
            style={{ ...filterBtnBase, ...(filterSeverity === sev ? filterBtnActive : {}) }}
            onClick={() => setFilterSeverity(sev)}
          >
            {sev === 'all' ? 'Toutes' : (SEVERITY_CONFIG[sev]?.label || sev)}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            style={{ ...cts.input, padding: '5px 10px', fontSize: 12, width: 'auto' }}
          >
            <option value="all">Toutes les règles</option>
            <option value="active">Actives seulement</option>
            <option value="inactive">Inactives seulement</option>
          </select>
        </div>
      </div>

      {/* ─── Chargement ─── */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
          Chargement…
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!loading && rules.length === 0 && (
        <div style={cts.emptyState}>
          <div style={{ fontSize: 40, opacity: 0.3 }}>🔔</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            Aucune règle d'alerte configurée
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', maxWidth: 360, lineHeight: 1.5 }}>
            Créez votre première alerte pour surveiller automatiquement vos équipes.
          </div>
          <button style={cts.newBtn} onClick={openCreate}>+ Créer une alerte</button>
        </div>
      )}

      {/* ─── Aucun résultat pour les filtres ─── */}
      {!loading && rules.length > 0 && filtered.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
          Aucune règle ne correspond aux filtres sélectionnés.
        </div>
      )}

      {/* ─── Cartes ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((rule) => (
          <AlertRuleCard
            key={rule.id}
            rule={rule}
            onEdit={() => openEdit(rule)}
            onDelete={() => handleDelete(rule.id)}
            onToggle={() => handleToggle(rule.id)}
          />
        ))}
      </div>

      {/* ─── Formulaire ─── */}
      {showForm && (
        <AlertRuleForm
          initialData={editRule}
          etablissementId={etabId}
          onSave={handleSave}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
