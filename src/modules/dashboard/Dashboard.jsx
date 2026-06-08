// ═══════════════════════════════════════════════════════════════
// DASHBOARD — Vue d'ensemble + pointage rapide + message consultant
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { Btn, Card, KpiCard, SectionHeader } from '../../components/ui/index.jsx';
import { getDemoData } from '../../data/demoData.js';
import { notifyLegacy, readLegacyStorage } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { zurichToday, zurichClock, punctualityVsStart } from '../../utils/zurichTime.js';

const Dashboard = ({ user, etablissement, setPage }) => {
  // Jour courant à Zurich (et non la date UTC du device) → frontière de minuit correcte.
  const today = zurichToday();
  const etabId = etablissement?.id || 'etab-1';
  const isConsultant = user.role === 'consultant';
  const legacySB = dbService.getBridge();
  const DEMO_DATA = getDemoData();

  const [shifts, setShifts] = React.useState([]);
  const [pertes, setPertes] = React.useState([]);
  const [inventaires, setInventaires] = React.useState([]);
  const [haccpControls, setHaccpControls] = React.useState([]);
  const [haccpReleves, setHaccpReleves] = React.useState([]);
  const [sops, setSops] = React.useState([]);
  const [sopExecutions, setSopExecutions] = React.useState([]);
  const [message, setMessage] = React.useState({ message: '', updatedBy: null, updatedAt: null });
  const [editingMessage, setEditingMessage] = React.useState(false);
  // Ref pour éviter une stale closure dans le callback realtime
  const editingMessageRef = React.useRef(false);
  const [messageDraft, setMessageDraft] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [pointageError, setPointageError] = React.useState('');

  React.useEffect(() => {
    if (!legacySB) {
      setShifts((DEMO_DATA.planning || []).filter(s => (s.etablissementId || 'etab-1') === etabId));
      setPertes((DEMO_DATA.pertes || []).filter(p => (p.etablissementId || 'etab-1') === etabId));
      setInventaires((DEMO_DATA.inventaires || []).filter(i => (i.etablissementId || 'etab-1') === etabId));
      setHaccpControls(toList(readLegacyStorage('sc_haccp_controls', [])).filter(c => (c.etablissementId || 'etab-1') === etabId));
      setHaccpReleves(toList(readLegacyStorage('sc_haccp_releves', [])).filter(r => (r.etablissementId || 'etab-1') === etabId));
      setSops(toList(readLegacyStorage('sc_sops', [])).filter(s => (s.etablissementId || 'etab-1') === etabId));
      setSopExecutions(toList(readLegacyStorage('sc_sop_executions', [])).filter(s => (s.etablissementId || 'etab-1') === etabId));
      setLoading(false);
      return;
    }

    let mounted = true;
    const unsubs = [];

    (async () => {
      try {
        const [shiftRows, pertesRows, invRows, msgRow, haccpControlsRows, haccpRelevesRows, sopRows, sopExecutionRows] = await Promise.all([
          legacySB.db.listShifts(etabId),
          legacySB.db.listPertes(etabId),
          legacySB.db.listInventaires(etabId),
          legacySB.db.getConsultantMessage(etabId),
          legacySB.db.listHaccpControls?.(etabId) || Promise.resolve(readLegacyStorage('sc_haccp_controls', [])),
          legacySB.db.listHaccpReleves?.(etabId) || Promise.resolve(readLegacyStorage('sc_haccp_releves', [])),
          legacySB.db.listSops?.(etabId) || Promise.resolve(readLegacyStorage('sc_sops', [])),
          legacySB.db.listSopExecutions?.(etabId) || Promise.resolve(readLegacyStorage('sc_sop_executions', [])),
        ]);
        if (!mounted) return;
        setShifts((shiftRows || []).map(r => legacySB.db.mapShiftFromDB(r)));
        setPertes(pertesRows || []);
        setInventaires(invRows || []);
        setHaccpControls(haccpControlsRows || []);
        setHaccpReleves(haccpRelevesRows || []);
        setSops(sopRows || []);
        setSopExecutions(sopExecutionRows || []);
        if (msgRow) {
          setMessage(msgRow);
          setMessageDraft(msgRow.message);
        }
      } catch (err) { console.error('[Dashboard load]', err); }
      finally { if (mounted) setLoading(false); }
    })();

    unsubs.push(legacySB.realtime.subscribeReload('shifts', async () => {
      try { const rows = await legacySB.db.listShifts(etabId); if (mounted) setShifts((rows || []).map(r => legacySB.db.mapShiftFromDB(r))); } catch (e) {}
    }));
    unsubs.push(legacySB.realtime.subscribeReload('pertes', async () => {
      try { const rows = await legacySB.db.listPertes(etabId); if (mounted) setPertes(rows || []); } catch (e) {}
    }));
    unsubs.push(legacySB.realtime.subscribeReload('consultant_messages', async () => {
      try {
        const m = await legacySB.db.getConsultantMessage(etabId);
        if (mounted && m) { setMessage(m); if (!editingMessageRef.current) setMessageDraft(m.message); }
      } catch (e) {}
    }));

    return () => { mounted = false; unsubs.forEach(u => u && u()); };
  }, [etabId]);

  const todayShifts = shifts.filter(s => s.date === today);
  const myTodayShifts = todayShifts.filter(s => s.userId === user.id);
  const activePointages = todayShifts.filter(s => s.pointageDebut && !s.pointageFin);
  const manquants = todayShifts.filter(s => !s.pointageDebut);
  const pertesNonVal = pertes.filter(p => !p.valide);
  const pertesTotal = pertes.reduce((s, p) => s + (p.quantite || 0) * (p.valeurUnit || 0), 0);
  const inv = inventaires[0];
  const controlsToday = (Array.isArray(haccpControls) ? haccpControls : []).filter(c => c.date === today);
  const relevesToday = (Array.isArray(haccpReleves) ? haccpReleves : []).filter(r => r.date === today);
  const haccpAlerts = [
    ...controlsToday.filter(c => c.statut && c.statut !== 'conforme'),
    ...relevesToday.filter(r => r.conforme === false || r.horsPlage || r.alerte),
  ];
  const activeSops = (Array.isArray(sops) ? sops : []).filter(s => s.actif !== false);
  const sopExecToday = (Array.isArray(sopExecutions) ? sopExecutions : []).filter(e => (e.dateExecution || e.date_execution || e.date) === today);
  const sopDoneToday = sopExecToday.filter(e => ['terminee', 'terminée', 'done', 'completed'].includes(String(e.statut || '').toLowerCase())).length;
  const plannedMinutes = todayShifts.reduce((total, shift) => total + getShiftMinutes(shift.debut, shift.fin), 0);
  const plannedHours = Math.round((plannedMinutes / 60) * 10) / 10;
  const stockValue = Number(inv?.valeurTotale || inv?.valeur_totale || 0);
  const weekShiftLoad = getWeekShiftLoad(shifts);
  const canNavigate = typeof setPage === 'function';
  const automationItems = buildAutomationItems({
    user,
    manquants,
    pertesNonVal,
    haccpAlerts,
    activeSops,
    sopDoneToday,
    canNavigate,
  });

  const dateLabel = new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hourLabel = new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

  // Pointage : maj optimiste immédiate (heure Zurich) → confirmation serveur via RPC
  // (qui pose l'heure réelle) → rollback visuel si l'écriture échoue.
  const pointerArrivee = async (shift) => {
    setPointageError('');
    if (!legacySB) { setPointageError('Supabase non configuré'); return; }
    const prevShifts = shifts;
    const optimisticTime = zurichClock();
    setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, pointageDebut: optimisticTime } : s));
    try {
      const row = await legacySB.db.pointerArrivee(shift.id);
      const mapped = legacySB.db.mapShiftFromDB(row);
      setShifts(prev => prev.map(s => s.id === mapped.id ? mapped : s));
      notifyLegacy(`✓ Arrivée pointée à ${mapped.pointageDebut}`, 'success');
    } catch (err) {
      setShifts(prevShifts); // rollback
      setPointageError('Erreur arrivée : ' + err.message);
      notifyLegacy('Pointage refusé : ' + err.message, 'error');
    }
  };

  const pointerDepart = async (shift) => {
    setPointageError('');
    if (!legacySB) { setPointageError('Supabase non configuré'); return; }
    const prevShifts = shifts;
    const optimisticTime = zurichClock();
    setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, pointageFin: optimisticTime } : s));
    try {
      const row = await legacySB.db.pointerDepart(shift.id);
      const mapped = legacySB.db.mapShiftFromDB(row);
      setShifts(prev => prev.map(s => s.id === mapped.id ? mapped : s));
      notifyLegacy(`✓ Départ pointé à ${mapped.pointageFin}`, 'success');
    } catch (err) {
      setShifts(prevShifts); // rollback
      setPointageError('Erreur départ : ' + err.message);
      notifyLegacy('Pointage refusé : ' + err.message, 'error');
    }
  };

  const saveMessage = async () => {
    if (!legacySB || !isConsultant) return;
    try {
      await legacySB.db.setConsultantMessage(etabId, messageDraft, user.id);
      editingMessageRef.current = false;
      setEditingMessage(false);
    } catch (err) { notifyLegacy('Erreur sauvegarde message : ' + err.message, 'error'); }
  };

  const cancelEdit = () => {
    setMessageDraft(message.message);
    editingMessageRef.current = false;
    setEditingMessage(false);
  };

  const getUserName = (uid) => {
    const u = (DEMO_DATA.utilisateurs || []).find(u => u.id === uid);
    return u ? `${u.prenom} ${u.nom}` : 'Inconnu';
  };

  const goTo = (page) => {
    if (typeof setPage === 'function') setPage(page);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;
  }

  return (
    <div style={ds.root}>
      {/* Greeting */}
      <div style={ds.greeting}>
        <div>
          <div style={ds.greetingTitle}>Bonjour, {user.prenom} 👋</div>
          <div style={ds.greetingSub}>{dateLabel} · {hourLabel}</div>
        </div>
        <div style={ds.headerRight}>
          <Btn variant="ghost" small onClick={() => goTo('documents')} disabled={!canNavigate}>Rapport</Btn>
          {isConsultant && <Btn variant="primary" small onClick={() => goTo('faq')} disabled={!canNavigate}>Assistant</Btn>}
          {etablissement && <div style={ds.etabBadge}>{etablissement.nom}</div>}
        </div>
      </div>

      {/* Pointage rapide — toujours visible */}
      <div style={ds.pointageSection}>
        <div style={ds.pointageSectionTitle}>⏱ Mes horaires aujourd'hui</div>
        {pointageError && <div style={ds.errorBanner}>{pointageError}</div>}
        {myTodayShifts.length === 0 ? (
          <div style={ds.noShiftCard}>
            <div style={{ fontSize: 38, opacity: 0.4, marginBottom: 8 }}>📅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Pas de shift programmé aujourd'hui</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Profitez bien de votre journée !</div>
            <button style={{ ...ds.bigActionBtn, background: 'var(--border)', cursor: 'not-allowed', marginTop: 14 }} disabled>
              ⏱ Aucun pointage à effectuer
            </button>
          </div>
        ) : (
          <div style={ds.myShiftsRow}>
            {(myTodayShifts || []).map(shift => {
              const enPoste = shift.pointageDebut && !shift.pointageFin;
              const termine = shift.pointageDebut && shift.pointageFin;
              const pasCommence = !shift.pointageDebut;
              const punct = pasCommence ? punctualityVsStart(shift.debut) : null;
              const punctColor = punct?.key === 'retard' ? 'var(--warning-text)' : punct?.key === 'heure' ? 'var(--success-text)' : 'var(--text2)';
              const shiftLabel = shift.typeShift === 'midi' ? '☀ Service midi' : shift.typeShift === 'soir' ? '🌙 Service soir' : 'Service';

              const cardStyle = {
                ...ds.myShiftCard,
                background: enPoste ? 'var(--success-bg)' : termine ? 'var(--surface2)' : pasCommence ? 'var(--warning-bg)' : 'var(--surface)',
                borderColor: enPoste ? 'var(--success-strong)' : termine ? 'var(--border2)' : pasCommence ? 'var(--warning-strong)' : 'var(--border)',
              };

              return (
                <div key={shift.id} style={cardStyle}>
                  <div style={ds.myShiftHead}>
                    <div style={ds.myShiftLabel}>{shiftLabel}</div>
                    <div style={ds.myShiftRange}>{shift.debut}–{shift.fin}</div>
                  </div>

                  {pasCommence && (
                    <div>
                      <div style={ds.statusText}>
                        En attente d'arrivée
                        {punct && <span style={{ color: punctColor, fontWeight: 700 }}> · {punct.label}</span>}
                      </div>
                      <button
                        style={{ ...ds.bigActionBtn, background: 'var(--success-strong)', cursor: 'pointer' }}
                        onClick={() => pointerArrivee(shift)}
                      >
                        ⏱ Pointer mon arrivée
                      </button>
                    </div>
                  )}

                  {enPoste && (
                    <div>
                      <div style={{ ...ds.statusText, color: 'var(--success-text)', fontWeight: 700 }}>✓ En poste depuis {shift.pointageDebut}</div>
                      <button style={{ ...ds.bigActionBtn, background: 'var(--danger-strong)' }} onClick={() => pointerDepart(shift)}>
                        ⏱ Pointer mon départ
                      </button>
                    </div>
                  )}

                  {termine && (
                    <div style={{ ...ds.statusText, color: 'var(--text2)' }}>
                      ✓ Journée terminée : {shift.pointageDebut} → {shift.pointageFin}
                    </div>
                  )}

                  {shift.poste && <div style={ds.posteHint}>{shift.poste}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Message consultant */}
      <div style={ds.messageSection}>
        <div style={ds.messageHeader}>
          <div style={ds.messageTitle}><span style={{ fontSize: 18, marginRight: 6 }}>💬</span>Message du consultant</div>
          {isConsultant && !editingMessage && (
            <button style={ds.editMessageBtn} onClick={() => { editingMessageRef.current = true; setEditingMessage(true); }}>
              {message.message ? '✎ Modifier' : '+ Écrire un message'}
            </button>
          )}
        </div>

        {editingMessage ? (
          <div>
            <textarea
              style={ds.messageTextarea}
              value={messageDraft}
              onChange={e => setMessageDraft(e.target.value)}
              placeholder="Laissez un message à destination de toute l'équipe…"
              autoFocus
              rows={4}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button style={ds.ghostBtn} onClick={cancelEdit}>Annuler</button>
              <button style={ds.primaryBtn} onClick={saveMessage}>Publier</button>
            </div>
          </div>
        ) : message.message ? (
          <div>
            <div style={ds.messageBody}>{message.message}</div>
            <div style={ds.messageMeta}>
              — Jérémy Samper · {message.updatedAt ? new Date(message.updatedAt).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
            </div>
          </div>
        ) : (
          <div style={ds.messageEmpty}>
            {isConsultant
              ? 'Aucun message. Cliquez sur "Écrire un message" pour partager une note avec l\'équipe.'
              : 'Aucun message pour l\'instant.'}
          </div>
        )}
      </div>

      <div style={ds.pilotageGrid}>
        <KpiCard
          label="Equipe en poste"
          value={(activePointages || []).length}
          color="var(--success-text)"
          sub={(activePointages || []).length > 0 ? (activePointages || []).map(s => getUserName(s.userId)).join(', ') : 'Personne en poste'}
          chart={<MiniBars data={weekShiftLoad} labels={['L', 'M', 'M', 'J', 'V', 'S', 'D']} color="var(--success-text)" />}
        />
        <KpiCard
          label="Heures planifiees"
          value={`${plannedHours}h`}
          color="var(--warning-text)"
          sub={`${(todayShifts || []).length} shift${(todayShifts || []).length > 1 ? 's' : ''} aujourd'hui, ${(manquants || []).length} en attente`}
          chart={<ProgressLine value={todayShifts.length ? activePointages.length / todayShifts.length : 0} color="var(--warning-strong)" />}
        />
        <KpiCard
          label="Pertes du mois"
          value={`CHF ${pertesTotal.toLocaleString('fr-CH', { maximumFractionDigits: 0 })}`}
          color={(pertesNonVal || []).length ? 'var(--danger-text)' : 'var(--success-text)'}
          sub={`${(pertesNonVal || []).length} perte${(pertesNonVal || []).length > 1 ? 's' : ''} a valider`}
          chart={<ProgressLine value={pertesNonVal.length ? 0.78 : 0.22} color={(pertesNonVal || []).length ? 'var(--danger-strong)' : 'var(--success-strong)'} />}
        />
        <KpiCard
          label="SOP / HACCP"
          value={`${sopDoneToday}/${Math.max(activeSops.length, sopDoneToday) || 0}`}
          color={haccpAlerts.length ? 'var(--danger-text)' : 'var(--accent)'}
          sub={`${haccpAlerts.length} alerte${haccpAlerts.length > 1 ? 's' : ''} HACCP, stock CHF ${stockValue.toLocaleString('fr-CH', { maximumFractionDigits: 0 })}`}
          chart={<ProgressLine value={activeSops.length ? sopDoneToday / activeSops.length : 0} color={haccpAlerts.length ? 'var(--danger-strong)' : 'var(--accent)'} />}
        />
      </div>

      {isConsultant && (
      <div style={ds.midGrid}>
        <Card>
          <SectionHeader
            title="Automatisations recommandees"
            sub="Actions rapides selon le role et les alertes du jour"
            action={<Btn variant="ghost" small onClick={() => goTo('faq')} disabled={!canNavigate}>FAQ</Btn>}
          />
          <div style={ds.automationList}>
            {automationItems.slice(0, 6).map(item => (
              <button
                key={item.id}
                type="button"
                style={{ ...ds.automationItem, borderColor: getToneColor(item.tone) }}
                onClick={() => goTo(item.page)}
                disabled={item.disabled}
              >
                <span style={{ ...ds.automationDot, background: getToneColor(item.tone) }} />
                <span style={ds.automationBody}>
                  <span style={ds.automationTitle}>{item.title}</span>
                  <span style={ds.automationDetail}>{item.detail}</span>
                </span>
                <span style={ds.automationImpact}>{item.impact}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Assistant & FAQ"
            sub="Terrain pret pour connecter un assistant IA plus tard"
            action={<Btn variant="primary" small onClick={() => goTo('faq')} disabled={!canNavigate}>Ouvrir</Btn>}
          />
          <div style={ds.assistantPreview}>
            <div style={ds.assistantBadge}>JS</div>
            <div>
              <div style={ds.assistantTitle}>Questions recurrentes, procedures et aide metier</div>
              <div style={ds.assistantText}>
                Le module est isole: il pourra utiliser une fonction serveur IA plus tard sans exposer de donnees sensibles dans le navigateur.
              </div>
            </div>
          </div>
          <div style={ds.faqChips}>
            {['Food cost', 'HACCP', 'Pertes', 'SOP', 'Factures'].map(label => <span key={label} style={ds.faqChip}>{label}</span>)}
          </div>
        </Card>
      </div>
      )}

      {/* KPIs */}
      <div style={ds.kpiGrid}>
        <div style={{ ...ds.kpiCard, borderLeft: '3px solid var(--success-strong)' }}>
          <div style={ds.kpiLabel}>En poste maintenant</div>
          <div style={{ ...ds.kpiValue, color: 'var(--success-text)' }}>{(activePointages || []).length}</div>
          <div style={ds.kpiSub}>{(activePointages || []).length > 0 ? (activePointages || []).map(s => getUserName(s.userId)).join(', ') : 'Personne'}</div>
        </div>
        <div style={{ ...ds.kpiCard, borderLeft: '3px solid var(--warning-strong)' }}>
          <div style={ds.kpiLabel}>Shifts aujourd'hui</div>
          <div style={{ ...ds.kpiValue, color: 'var(--warning-text)' }}>{(todayShifts || []).length}</div>
          <div style={ds.kpiSub}>{(manquants || []).length} en attente</div>
        </div>
        <div style={{ ...ds.kpiCard, borderLeft: '3px solid var(--danger-strong)' }}>
          <div style={ds.kpiLabel}>Pertes à valider</div>
          <div style={{ ...ds.kpiValue, color: 'var(--danger-text)' }}>{(pertesNonVal || []).length}</div>
          <div style={ds.kpiSub}>{pertesTotal.toFixed(2)} CHF au total</div>
        </div>
        <div style={{ ...ds.kpiCard, borderLeft: '3px solid var(--accent)' }}>
          <div style={ds.kpiLabel}>Stock valorisé</div>
          <div style={ds.kpiValue}>CHF {(inv?.valeurTotale || 0).toLocaleString('fr-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div style={ds.kpiSub}>{inv ? `Au ${new Date(inv.date + 'T12:00:00').toLocaleDateString('fr-CH')}` : 'Aucun inventaire'}</div>
        </div>
      </div>

      {/* Planning du jour */}
      <div style={ds.section}>
        <div style={ds.sectionHeader}>
          <div style={ds.sectionTitle}>📅 Planning du jour</div>
          <div style={ds.sectionSub}>{(todayShifts || []).length} horaire{(todayShifts || []).length > 1 ? 's' : ''} programmé{(todayShifts || []).length > 1 ? 's' : ''}</div>
        </div>
        {(todayShifts || []).length === 0 ? (
          <div style={ds.emptyBox}>Aucun shift programmé aujourd'hui.</div>
        ) : (
          <div style={ds.shiftGrid}>
            {(todayShifts || []).sort((a, b) => (a.debut || '').localeCompare(b.debut || '')).map(shift => {
              const enPoste = shift.pointageDebut && !shift.pointageFin;
              const termine = shift.pointageDebut && shift.pointageFin;
              const statut = enPoste ? { label: '✓ En poste', color: 'var(--success-text)', bg: 'var(--success-bg)' }
                          : termine ? { label: 'Terminé', color: 'var(--text2)', bg: 'var(--surface2)' }
                          : { label: 'À venir', color: 'var(--warning-text)', bg: 'var(--warning-bg)' };
              const typeLabel = shift.typeShift === 'midi' ? '☀' : shift.typeShift === 'soir' ? '🌙' : '';
              return (
                <div key={shift.id} style={ds.shiftCard}>
                  <div style={ds.shiftHead}>
                    <div style={ds.shiftName}>{getUserName(shift.userId)}</div>
                    <div style={{ ...ds.shiftBadge, background: statut.bg, color: statut.color }}>{statut.label}</div>
                  </div>
                  <div style={ds.shiftTime}>
                    {typeLabel && <span style={{ marginRight: 4 }}>{typeLabel}</span>}
                    {shift.debut}–{shift.fin}
                    {shift.poste && <span style={ds.shiftPoste}> · {shift.poste}</span>}
                  </div>
                  {(shift.pointageDebut || shift.pointageFin) && (
                    <div style={ds.shiftPointage}>
                      ⏱ Arrivée : {shift.pointageDebut || '—'}
                      {shift.pointageFin && ` · Départ : ${shift.pointageFin}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alertes */}
      {((pertesNonVal || []).length > 0 || (manquants || []).length > 0) && (
        <div style={ds.section}>
          <div style={ds.sectionHeader}>
            <div style={ds.sectionTitle}>⚠ Alertes</div>
          </div>
          <div style={ds.alertList}>
            {(manquants || []).slice(0, 3).map(s => (
              <div key={s.id} style={ds.alertItem}>
                <span style={{ color: 'var(--warning-text)', fontWeight: 700 }}>Pointage manquant</span>
                <span style={{ color: 'var(--text2)' }}> — {getUserName(s.userId)} devait commencer à {s.debut}</span>
              </div>
            ))}
            {(pertesNonVal || []).slice(0, 3).map(p => (
              <div key={p.id} style={ds.alertItem}>
                <span style={{ color: 'var(--danger-text)', fontWeight: 700 }}>Perte à valider</span>
                <span style={{ color: 'var(--text2)' }}> — {p.produit} ({p.quantite} {p.unite}, {((p.quantite || 0) * (p.valeurUnit || 0)).toFixed(2)} CHF)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function getShiftMinutes(debut, fin) {
  const [dh, dm] = String(debut || '00:00').split(':').map(Number);
  const [fh, fm] = String(fin || '00:00').split(':').map(Number);
  const start = (Number.isFinite(dh) ? dh : 0) * 60 + (Number.isFinite(dm) ? dm : 0);
  let end = (Number.isFinite(fh) ? fh : 0) * 60 + (Number.isFinite(fm) ? fm : 0);
  if (end < start) end += 24 * 60;
  return Math.max(0, end - start);
}

function toList(value) {
  return Array.isArray(value) ? value : [];
}

function getWeekShiftLoad(shifts) {
  const safeShifts = Array.isArray(shifts) ? shifts : [];
  const now = new Date();
  const monday = new Date(now);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return safeShifts.filter(shift => shift.date === iso).length;
  });
}

function getToneColor(tone) {
  if (tone === 'danger') return 'var(--danger-strong)';
  if (tone === 'warn') return 'var(--warning-strong)';
  if (tone === 'ok') return 'var(--success-strong)';
  return 'var(--accent)';
}

function MiniBars({ data, labels, color }) {
  const safeData = Array.isArray(data) ? data : [];
  const max = Math.max(1, ...safeData.map(Number));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${safeData.length || 1}, 1fr)`, gap: 5, alignItems: 'end', minHeight: 48 }}>
      {safeData.map((value, index) => (
        <div key={`${labels?.[index] || index}-${index}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div
            style={{
              width: '100%',
              minHeight: 6,
              height: `${Math.max(10, (Number(value) / max) * 42)}px`,
              borderRadius: 5,
              background: color || 'var(--accent)',
              opacity: 0.25 + (Number(value) / max) * 0.75,
            }}
          />
          <span style={{ fontSize: 9, color: 'var(--text2)' }}>{labels?.[index] || ''}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressLine({ value, color }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <div style={{ height: 7, borderRadius: 999, background: 'var(--surface2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color || 'var(--accent)', borderRadius: 999 }} />
    </div>
  );
}

function buildAutomationItems({ user, manquants, pertesNonVal, haccpAlerts, activeSops, sopDoneToday, canNavigate }) {
  const role = user?.role || 'employe';
  const items = [
    {
      id: 'pointage',
      title: 'Pointages a securiser',
      detail: manquants.length ? `${manquants.length} arrivee(s) manquante(s) a verifier.` : 'Aucun pointage critique pour le moment.',
      impact: 'Temps gagne: controle planning',
      page: 'planning',
      tone: manquants.length ? 'warn' : 'ok',
    },
    {
      id: 'pertes',
      title: 'Pertes a traiter',
      detail: pertesNonVal.length ? `${pertesNonVal.length} perte(s) a valider avant cloture.` : 'Pertes sous controle.',
      impact: 'Temps gagne: validation matiere',
      page: 'pertes',
      tone: pertesNonVal.length ? 'danger' : 'ok',
    },
    {
      id: 'haccp',
      title: 'HACCP express',
      detail: haccpAlerts.length ? `${haccpAlerts.length} anomalie(s) ou controle(s) a reprendre.` : 'Aucune anomalie HACCP remontee.',
      impact: 'Temps gagne: audit quotidien',
      page: 'haccp',
      tone: haccpAlerts.length ? 'danger' : 'ok',
    },
    {
      id: 'sop',
      title: 'SOPs du jour',
      detail: activeSops.length ? `${sopDoneToday}/${activeSops.length} procedure(s) terminee(s).` : 'Bibliotheque SOP prete a completer.',
      impact: 'Temps gagne: routines equipe',
      page: 'sop',
      tone: activeSops.length && sopDoneToday < activeSops.length ? 'warn' : 'ok',
    },
  ];

  if (role === 'consultant') {
    items.unshift({
      id: 'consultant',
      title: 'Pilotage consultant',
      detail: 'Ouvrir les outils pour ajuster recettes, carte, etablissements ou factures.',
      impact: 'Temps gagne: diagnostic client',
      page: 'consultant_tools',
      tone: 'accent',
    });
    items.push({
      id: 'faq',
      title: 'FAQ & assistant',
      detail: 'Base d aide prete pour transformer les questions recurrentes en reponses rapides.',
      impact: 'Temps gagne: support equipe',
      page: 'faq',
      tone: 'accent',
    });
  } else if (role === 'patron' || role === 'resp_cuisine') {
    items.push({
      id: 'catalogue',
      title: 'Catalogue a jour',
      detail: 'Verifier prix, fournisseurs et produits sensibles.',
      impact: 'Temps gagne: achats',
      page: 'catalogue',
      tone: 'accent',
    });
  } else {
    items.push({
      id: 'sop',
      title: 'SOPs du service',
      detail: 'Acces rapide aux procedures et checklists actives.',
      impact: 'Temps gagne: execution',
      page: 'sop',
      tone: 'accent',
    });
  }

  return items.map(item => ({ ...item, disabled: !canNavigate }));
}

const ds = {
  root: { display: 'flex', flexDirection: 'column', gap: 20 },

  greeting: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  greetingTitle: { fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  greetingSub: { fontSize: 13, color: 'var(--text2)', marginTop: 4, textTransform: 'capitalize' },
  headerRight: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  etabBadge: { padding: '6px 14px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 20, fontSize: 12, fontWeight: 600 },

  pointageSection: { background: 'var(--success-bg-soft)', border: '1px solid var(--success-bd)', borderRadius: 12, padding: 18 },
  pointageSectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--success-text)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 },
  errorBanner: { background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 },
  myShiftsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 },
  noShiftCard: { background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 10, padding: '22px 18px', textAlign: 'center' },
  myShiftCard: { background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 10, padding: 16, transition: 'border 0.15s' },
  myShiftHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 6 },
  myShiftLabel: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  myShiftRange: { fontSize: 13, fontWeight: 600, color: 'var(--text2)' },
  statusText: { fontSize: 12, color: 'var(--text2)', marginBottom: 10 },
  hintText: { fontSize: 11, color: 'var(--text2)', marginTop: 6, fontStyle: 'italic', textAlign: 'center' },
  posteHint: { fontSize: 11, color: 'var(--text2)', marginTop: 8 },
  bigActionBtn: { display: 'block', width: '100%', padding: '12px 16px', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)' },

  messageSection: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
  messageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  messageTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center' },
  editMessageBtn: { background: 'none', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  messageTextarea: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 },
  messageBody: { fontSize: 14, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontStyle: 'italic', padding: '4px 0' },
  messageMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 10, fontWeight: 600 },
  messageEmpty: { fontSize: 13, color: 'var(--text2)', fontStyle: 'italic', padding: '8px 0' },

  pilotageGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  midGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 0.75fr)', gap: 12 },
  automationList: { display: 'flex', flexDirection: 'column', gap: 8 },
  automationItem: { width: '100%', display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)' },
  automationDot: { width: 8, height: 8, borderRadius: 999 },
  automationBody: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  automationTitle: { fontSize: 13, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  automationDetail: { fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  automationImpact: { fontSize: 10, color: 'var(--text2)', fontWeight: 700, whiteSpace: 'nowrap' },
  assistantPreview: { display: 'flex', gap: 12, padding: 12, borderRadius: 8, background: 'linear-gradient(135deg,var(--accent-light),var(--surface))', border: '1px solid var(--accent-bd)' },
  assistantBadge: { width: 38, height: 38, borderRadius: 9, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0 },
  assistantTitle: { fontSize: 13, fontWeight: 800, color: 'var(--text)' },
  assistantText: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginTop: 4 },
  faqChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  faqChip: { padding: '5px 9px', borderRadius: 999, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text2)', fontWeight: 700 },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  kpiCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' },
  kpiLabel: { fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 },
  kpiValue: { fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-serif)', marginTop: 4, color: 'var(--text)' },
  kpiSub: { fontSize: 11, color: 'var(--text2)', marginTop: 4 },

  section: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  sectionSub: { fontSize: 11, color: 'var(--text2)', fontWeight: 600 },

  shiftGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 },
  shiftCard: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 },
  shiftHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  shiftName: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  shiftBadge: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
  shiftTime: { fontSize: 12, color: 'var(--text2)', fontWeight: 600 },
  shiftPoste: { color: 'var(--text2)', fontWeight: 400 },
  shiftPointage: { fontSize: 10, color: 'var(--text2)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' },

  emptyBox: { padding: 20, textAlign: 'center', color: 'var(--text2)', fontSize: 13, fontStyle: 'italic' },

  alertList: { display: 'flex', flexDirection: 'column', gap: 8 },
  alertItem: { padding: 10, background: 'var(--bg)', borderRadius: 6, fontSize: 13 },

  ghostBtn: { padding: '8px 14px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  primaryBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
};

export default Dashboard;
