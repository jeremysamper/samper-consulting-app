import React from 'react';
import { cts } from './ConsultantTools.styles.js';
import { dbService } from '../../services/dbService.js';

// ─── Constantes ───────────────────────────────────────────────────
const RULE_TYPES = [
  { id: 'pointage_manquant',         label: 'Pointage manquant',         icon: '🕐' },
  { id: 'haccp_manquant',            label: 'Relevé HACCP manquant',     icon: '🌡' },
  { id: 'reservation_non_confirmee', label: 'Réservation non confirmée', icon: '📅' },
  { id: 'stock_critique',            label: 'Stock critique',            icon: '📦' },
  { id: 'ventes_inactives',          label: 'Ventes inactives',          icon: '📊' },
  { id: 'pertes_elevees',            label: 'Pertes élevées',            icon: '⚠' },
  { id: 'personnalisee',             label: 'Rappel personnalisé',       icon: '📝' },
];

const SEVERITIES = [
  { id: 'info',     label: 'Info',     color: 'var(--color-info, var(--info-strong))'    },
  { id: 'warning',  label: 'Attention',color: 'var(--color-warning, var(--warning-strong))' },
  { id: 'critical', label: 'Critique', color: 'var(--color-error, var(--danger-strong))'   },
];

const DAYS = [
  { id: 1, label: 'Lun' }, { id: 2, label: 'Mar' }, { id: 3, label: 'Mer' },
  { id: 4, label: 'Jeu' }, { id: 5, label: 'Ven' }, { id: 6, label: 'Sam' },
  { id: 7, label: 'Dim' },
];

const ROLES_OPTIONS = [
  { id: 'consultant',   label: 'Consultant'    },
  { id: 'patron',       label: 'Patron'        },
  { id: 'resp_cuisine', label: 'Resp. cuisine' },
  { id: 'cuisinier',    label: 'Chef'          },
  { id: 'serveur',      label: 'Service'       },
];

const TOTAL_STEPS = 4;

// ─── Helper UI ────────────────────────────────────────────────────
function Field({ label, children, required }) {
  return (
    <div style={{ ...cts.field, marginBottom: 14 }}>
      <label style={cts.label}>{label}{required && <span style={{ color: 'var(--color-error, var(--danger-strong))' }}> *</span>}</label>
      {children}
    </div>
  );
}

// ─── Ligne à cocher (cible tactile 44px, cf. contrainte iPad) ────
function CheckRow({ checked, onToggle, title, subtitle, disabled }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        minHeight: 44, flexShrink: 0, padding: '6px 10px',
        borderRadius: 8, border: '2px solid',
        borderColor: checked ? 'var(--accent)' : 'var(--border)',
        background: checked ? 'var(--accent-light)' : 'var(--surface)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        style={{ width: 18, height: 18, flexShrink: 0, accentColor: 'var(--accent)', cursor: 'inherit' }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 13, lineHeight: 1.3,
          fontWeight: checked ? 600 : 400,
          color: checked ? 'var(--accent)' : 'var(--text)',
        }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
            {subtitle}
          </span>
        )}
      </span>
    </label>
  );
}

// ─── Sélecteur de zones HACCP ────────────────────────────────────
// Les ids de zones sont générés ("z1778761664397") : personne ne peut
// les taper. On liste les zones réelles de l'établissement à cocher.
function ZonePicker({ etablissementId, selected, onChange }) {
  const [zones, setZones]   = React.useState(null); // null = en cours de chargement
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    if (!etablissementId) { setZones([]); return undefined; }

    setZones(null);
    setFailed(false);

    (async () => {
      try {
        const list = await dbService.getDb()?.listHaccpZones(etablissementId);
        if (!mounted) return;
        setZones(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('[AlertRuleForm] listHaccpZones', err);
        if (mounted) { setZones([]); setFailed(true); }
      }
    })();

    return () => { mounted = false; };
  }, [etablissementId]);

  const toggle = (zoneId) => {
    onChange(selected.includes(zoneId)
      ? selected.filter((id) => id !== zoneId)
      : [...selected, zoneId]);
  };

  if (zones === null) {
    return <div style={{ fontSize: 12, color: 'var(--text2)', padding: '8px 0' }}>Chargement des zones…</div>;
  }

  const actives = zones.filter((z) => z.actif !== false);
  // Zone cochée puis désactivée/supprimée : on la garde visible pour pouvoir la décocher.
  const orphelines = selected
    .filter((id) => !actives.some((z) => z.id === id))
    .map((id) => ({ id, nom: zones.find((z) => z.id === id)?.nom || 'Zone supprimée', orpheline: true }));

  const rows = [...actives, ...orphelines];

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, padding: '8px 0' }}>
        {failed
          ? 'Impossible de charger les zones HACCP. Réessayez dans un instant.'
          : 'Aucune zone HACCP configurée pour cet établissement. Créez-les d\'abord dans le module HACCP.'}
      </div>
    );
  }

  const allSelected = actives.length > 0 && actives.every((z) => selected.includes(z.id));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          type="button"
          style={{ ...cts.ghostBtn, fontSize: 12, padding: '4px 10px' }}
          onClick={() => onChange(allSelected ? [] : actives.map((z) => z.id))}
        >
          {allSelected ? 'Tout décocher' : 'Toutes les zones'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((z) => (
          <CheckRow
            key={z.id}
            checked={selected.includes(z.id)}
            onToggle={() => toggle(z.id)}
            title={`${z.icone ? z.icone + ' ' : ''}${z.nom}`}
            subtitle={z.orpheline
              ? 'Zone désactivée ou supprimée - décochez-la'
              : [z.cible != null ? `cible ${z.cible}${z.unite || ''}` : null,
                 z.min != null || z.max != null
                   ? `tolérance ${z.min ?? '−∞'} → ${z.max ?? '+∞'}${z.unite || ''}`
                   : null].filter(Boolean).join(' · ') || null}
          />
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
        Une alerte distincte par zone sans relevé, nommée par la zone.
      </div>
    </>
  );
}

// ─── Champs dynamiques selon rule_type (Étape 3) ─────────────────
function ConfigFields({ ruleType, config, onChange, etablissementId }) {
  const set = (key, value) => onChange({ ...config, [key]: value });

  switch (ruleType) {
    case 'pointage_manquant':
      return (
        <>
          <Field label="Délai après le début du shift (minutes)" required>
            <input type="number" min={5} max={480} style={cts.input}
              value={config.delay_minutes ?? 30}
              onChange={(e) => set('delay_minutes', Number(e.target.value))} />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
              Déclenche l'alerte si un employé n'a pas pointé X minutes après le début de son shift.
            </div>
          </Field>
          <Field label="Destinataires">
            <CheckRow
              checked={config.notify_employee !== false}
              onToggle={() => set('notify_employee', config.notify_employee === false)}
              title="Prévenir aussi l'employé concerné"
              subtitle="Il reçoit uniquement son alerte, pas celles de ses collègues."
            />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 }}>
              L'alerte est nominative : une par employé qui n'a pas pointé. Les rôles choisis
              à l'étape suivante (patron…) les voient toutes.
            </div>
          </Field>
        </>
      );

    case 'haccp_manquant':
      return (
        <>
          <Field label="Zones HACCP à surveiller" required>
            <ZonePicker
              etablissementId={etablissementId}
              selected={config.zone_ids ?? []}
              onChange={(ids) => onChange({ ...config, zone_ids: ids, zone_id: undefined })}
            />
          </Field>
          <Field label="Contrôle attendu avant (heure de Zurich)" required>
            <input type="time" style={cts.input}
              value={config.expected_by ?? '12:00'}
              onChange={(e) => set('expected_by', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
              L'alerte se déclenche si aucun relevé n'est enregistré après cette heure.
            </div>
          </Field>
        </>
      );

    case 'reservation_non_confirmee':
      return (
        <Field label="Délai sans confirmation (heures)" required>
          <input type="number" min={1} max={168} style={cts.input}
            value={config.delay_hours ?? 24}
            onChange={(e) => set('delay_hours', Number(e.target.value))} />
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
            Déclenche si une réservation reste non confirmée plus de X heures.
          </div>
        </Field>
      );

    case 'stock_critique':
      return (
        <>
          <Field label="Nom exact du produit (tel que dans l'inventaire)" required>
            <input type="text" style={cts.input}
              value={config.product_name ?? ''}
              onChange={(e) => set('product_name', e.target.value)}
              placeholder="ex: Farine T55" />
          </Field>
          <Field label="Seuil critique" required>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min={0} style={{ ...cts.input, flex: 1 }}
                value={config.threshold ?? 5}
                onChange={(e) => set('threshold', Number(e.target.value))} />
              <input type="text" style={{ ...cts.input, width: 80 }}
                value={config.unite ?? ''}
                onChange={(e) => set('unite', e.target.value)}
                placeholder="kg" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
              Déclenche si le stock réel est inférieur à ce seuil dans le dernier inventaire validé.
            </div>
          </Field>
        </>
      );

    case 'ventes_inactives':
      return (
        <Field label="Aucune vente depuis (jours)" required>
          <input type="number" min={1} max={30} style={cts.input}
            value={config.inactive_days ?? 2}
            onChange={(e) => set('inactive_days', Number(e.target.value))} />
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
            Déclenche si aucune vente POS n'a été enregistrée depuis X jours. Nécessite une connexion POS active.
          </div>
        </Field>
      );

    case 'pertes_elevees':
      return (
        <>
          <Field label="Seuil de pertes (CHF)" required>
            <input type="number" min={0} style={cts.input}
              value={config.threshold_chf ?? 200}
              onChange={(e) => set('threshold_chf', Number(e.target.value))} />
          </Field>
          <Field label="Période d'analyse (jours)" required>
            <input type="number" min={1} max={90} style={cts.input}
              value={config.period_days ?? 7}
              onChange={(e) => set('period_days', Number(e.target.value))} />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
              Déclenche si le total des pertes dépasse le seuil sur la période.
            </div>
          </Field>
        </>
      );

    case 'personnalisee':
      return (
        <>
          <Field label="Titre de l'alerte">
            <input type="text" style={cts.input}
              value={config.title ?? ''}
              onChange={(e) => set('title', e.target.value)}
              placeholder="ex: Rappel fermeture" />
          </Field>
          <Field label="Message" required>
            <textarea
              style={{ ...cts.textarea }}
              value={config.message ?? ''}
              onChange={(e) => set('message', e.target.value)}
              rows={3}
              placeholder="ex: Vérifier les congélateurs avant de partir." />
          </Field>
        </>
      );

    default:
      return (
        <div style={{ padding: 16, color: 'var(--text2)', fontSize: 13 }}>
          Sélectionnez un type de condition à l'étape précédente.
        </div>
      );
  }
}

// ─── Stepper visuel ───────────────────────────────────────────────
function Stepper({ current, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 24 }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: active ? 'var(--accent)' : done ? 'var(--accent-light)' : 'var(--bg)',
              border: `2px solid ${active || done ? 'var(--accent)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              color: active ? '#fff' : done ? 'var(--accent)' : 'var(--text3)',
              flexShrink: 0,
            }}>
              {done ? '✓' : n}
            </div>
            {n < total && (
              <div style={{
                width: 32, height: 2, flexShrink: 0,
                background: done ? 'var(--accent)' : 'var(--border)',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────
/** Règles créées avant le sélecteur de zones : { zone_id } → { zone_ids }. */
function normalizeConfig(config) {
  const c = { ...(config ?? {}) };
  if (!Array.isArray(c.zone_ids) && c.zone_id) c.zone_ids = [c.zone_id];
  delete c.zone_id;
  return c;
}

/**
 * @param {{ initialData?: object, etablissementId?: string, onSave: (data) => Promise<boolean>, onClose: () => void }} props
 * - initialData      : règle existante en mode édition, null en mode création
 * - etablissementId  : établissement courant (sélecteur de zones HACCP)
 * - onSave           : appelé avec les données finales ; retourne true si succès
 * - onClose          : ferme le formulaire
 */
export default function AlertRuleForm({ initialData, etablissementId, onSave, onClose }) {
  const isEdit = Boolean(initialData);
  const [step, setStep] = React.useState(1);
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    name:          initialData?.name          ?? '',
    description:   initialData?.description   ?? '',
    severity:      initialData?.severity      ?? 'warning',
    rule_type:     initialData?.rule_type     ?? '',
    rule_config:   normalizeConfig(initialData?.rule_config),
    schedule_type: initialData?.schedule_type ?? 'hourly',
    schedule_time: (initialData?.schedule_time ?? '08:00:00').slice(0, 5),
    schedule_days: initialData?.schedule_days ?? [1, 2, 3, 4, 5],
    target_roles:  initialData?.target_roles  ?? ['consultant', 'patron'],
  });

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // ── Validation par étape ────────────────────────────────────────
  const canProceed = () => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 2) return form.rule_type !== '';
    if (step === 3) {
      const c = form.rule_config;
      switch (form.rule_type) {
        case 'personnalisee':              return (c.message ?? '').trim().length > 0;
        case 'stock_critique':             return (c.product_name ?? '').trim().length > 0;
        case 'haccp_manquant':             return (c.zone_ids ?? []).length > 0;
        case 'reservation_non_confirmee':  return (c.delay_hours ?? 0) > 0;
        case 'ventes_inactives':           return (c.inactive_days ?? 0) > 0;
        case 'pertes_elevees':             return (c.threshold_chf ?? 0) > 0;
        default:                           return true;
      }
    }
    return true;
  };

  // ── Soumission ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true);
    const payload = {
      name:          form.name.trim(),
      description:   form.description.trim() || null,
      severity:      form.severity,
      rule_type:     form.rule_type,
      rule_config:   normalizeConfig(form.rule_config),
      schedule_type: form.schedule_type,
      schedule_time: form.schedule_type === 'daily' ? form.schedule_time + ':00' : null,
      schedule_days: form.schedule_type === 'daily' && form.schedule_days.length ? form.schedule_days : null,
      target_roles:  form.target_roles.length ? form.target_roles : ['consultant', 'patron'],
      is_active:     initialData?.is_active ?? true,
    };
    await onSave(payload);
    setSaving(false);
  };

  // ── Bascule de rôle ─────────────────────────────────────────────
  const toggleRole = (roleId) => {
    set('target_roles', form.target_roles.includes(roleId)
      ? form.target_roles.filter((r) => r !== roleId)
      : [...form.target_roles, roleId]);
  };

  // ── Bascule de jour ─────────────────────────────────────────────
  const toggleDay = (dayId) => {
    set('schedule_days', form.schedule_days.includes(dayId)
      ? form.schedule_days.filter((d) => d !== dayId)
      : [...form.schedule_days, dayId]);
  };

  // ── Classes modales selon l'étape (mobile responsive) ──────────
  // Étapes 1-2 (contenu court) → bottom sheet
  // Étapes 3-4 (contenu variable) → fullscreen
  const overlayClass = step <= 2 ? 'modal-sheet-overlay' : 'modal-full-overlay';
  const modalClass   = step <= 2 ? 'modal-sheet'         : 'modal-full';

  const stepTitles = ['Identifier', 'Type de condition', 'Configuration', 'Planification'];

  return (
    // Styles inline = desktop/tablette (les classes modal-* ne stylent qu'en
    // mobile ≤767px) ; sans eux la modale se rendait dans le flux de la page.
    <div
      className={overlayClass}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div className={modalClass} onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, width: 560, maxWidth: '94vw', maxHeight: '90vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
        }}>

        {/* ── Titre ── */}
        <div style={{
          padding: '18px 20px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
              {isEdit ? 'Modifier la règle' : 'Nouvelle règle d\'alerte'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Étape {step} / {TOTAL_STEPS} - {stepTitles[step - 1]}</div>
          </div>
          <button
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)', padding: 4 }}
            onClick={onClose}
            aria-label="Fermer"
          >×</button>
        </div>

        {/* ── Stepper ── */}
        <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
          <Stepper current={step} total={TOTAL_STEPS} />
        </div>

        {/* ── Contenu défilant ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 8px' }}>

          {/* ─── Étape 1 - Nom + Sévérité ──────────────────────── */}
          {step === 1 && (
            <>
              <Field label="Nom de la règle" required>
                <input
                  type="text"
                  style={cts.input}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="ex: Patrick n'a pas pointé au midi"
                  autoFocus
                />
              </Field>
              <Field label="Description (optionnel)">
                <textarea
                  style={{ ...cts.textarea }}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  placeholder="Notes internes…"
                />
              </Field>
              <Field label="Sévérité" required>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {SEVERITIES.map((sev) => (
                    <button
                      key={sev.id}
                      type="button"
                      style={{
                        padding: '8px 18px', borderRadius: 8, border: `2px solid ${form.severity === sev.id ? sev.color : 'var(--border)'}`,
                        background: form.severity === sev.id ? 'rgba(0,0,0,0.04)' : 'var(--surface)',
                        color: form.severity === sev.id ? sev.color : 'var(--text2)',
                        fontWeight: form.severity === sev.id ? 700 : 400,
                        cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, transition: 'all .12s',
                      }}
                      onClick={() => set('severity', sev.id)}
                    >
                      {sev.label}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {/* ─── Étape 2 - Type de condition ────────────────────── */}
          {step === 2 && (
            <Field label="Quel événement surveiller ?" required>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {RULE_TYPES.map((rt) => (
                  <button
                    key={rt.id}
                    type="button"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', borderRadius: 8, textAlign: 'left',
                      border: `2px solid ${form.rule_type === rt.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: form.rule_type === rt.id ? 'var(--accent-light)' : 'var(--surface)',
                      color: form.rule_type === rt.id ? 'var(--accent)' : 'var(--text)',
                      cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13,
                      fontWeight: form.rule_type === rt.id ? 600 : 400, transition: 'all .12s',
                    }}
                    onClick={() => { set('rule_type', rt.id); set('rule_config', {}); }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{rt.icon}</span>
                    <span style={{ lineHeight: 1.3 }}>{rt.label}</span>
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* ─── Étape 3 - Configuration dynamique ─────────────── */}
          {step === 3 && (
            <ConfigFields
              ruleType={form.rule_type}
              config={form.rule_config}
              onChange={(cfg) => set('rule_config', cfg)}
              etablissementId={etablissementId}
            />
          )}

          {/* ─── Étape 4 - Planification ────────────────────────── */}
          {step === 4 && (
            <>
              <Field label="Fréquence d'évaluation" required>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { id: 'hourly', label: 'En continu', sub: 'Évaluée toutes les heures' },
                    { id: 'daily',  label: 'Quotidienne', sub: 'Évaluée à une heure fixe' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                        borderRadius: 8, border: `2px solid ${form.schedule_type === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                        background: form.schedule_type === opt.id ? 'var(--accent-light)' : 'var(--surface)',
                        cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
                      }}
                      onClick={() => set('schedule_type', opt.id)}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${form.schedule_type === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                        background: form.schedule_type === opt.id ? 'var(--accent)' : 'transparent',
                      }} />
                      <div>
                        <div style={{ fontWeight: 600, color: form.schedule_type === opt.id ? 'var(--accent)' : 'var(--text)', fontSize: 13 }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{opt.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </Field>

              {form.schedule_type === 'daily' && (
                <>
                  <Field label="Heure d'évaluation (UTC)">
                    <input type="time" style={cts.input}
                      value={form.schedule_time}
                      onChange={(e) => set('schedule_time', e.target.value)} />
                  </Field>
                  <Field label="Jours d'évaluation (laisser vide = tous les jours)">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {DAYS.map((day) => (
                        <button
                          key={day.id}
                          type="button"
                          style={{
                            width: 40, height: 40, borderRadius: 8, border: '2px solid',
                            borderColor: form.schedule_days.includes(day.id) ? 'var(--accent)' : 'var(--border)',
                            background: form.schedule_days.includes(day.id) ? 'var(--accent)' : 'var(--surface)',
                            color: form.schedule_days.includes(day.id) ? '#fff' : 'var(--text2)',
                            cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600,
                          }}
                          onClick={() => toggleDay(day.id)}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}

              <Field label="Qui doit voir cette alerte ?">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ROLES_OPTIONS.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: '2px solid',
                        borderColor: form.target_roles.includes(role.id) ? 'var(--accent)' : 'var(--border)',
                        background: form.target_roles.includes(role.id) ? 'var(--accent-light)' : 'var(--surface)',
                        color: form.target_roles.includes(role.id) ? 'var(--accent)' : 'var(--text2)',
                        cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12,
                        fontWeight: form.target_roles.includes(role.id) ? 600 : 400,
                      }}
                      onClick={() => toggleRole(role.id)}
                    >
                      {role.label}
                    </button>
                  ))}
                </div>
                {form.target_roles.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--color-error, var(--danger-strong))', marginTop: 4 }}>
                    Sélectionnez au moins un rôle.
                  </div>
                )}
              </Field>
            </>
          )}
        </div>

        {/* ── Footer navigation ── */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0, gap: 8,
        }}>
          <button style={{ ...cts.ghostBtn, fontSize: 13 }} onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 && (
              <button style={{ ...cts.ghostBtn, fontSize: 13 }} onClick={() => setStep(step - 1)} disabled={saving}>
                ← Précédent
              </button>
            )}
            {step < TOTAL_STEPS ? (
              <button
                style={{ ...cts.newBtn, opacity: canProceed() ? 1 : 0.5 }}
                onClick={() => canProceed() && setStep(step + 1)}
                disabled={!canProceed()}
              >
                Suivant →
              </button>
            ) : (
              <button
                style={{ ...cts.newBtn, opacity: (canProceed() && !saving && form.target_roles.length > 0) ? 1 : 0.5 }}
                onClick={handleSubmit}
                disabled={saving || !canProceed() || form.target_roles.length === 0}
              >
                {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer l\'alerte'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
