// ═══════════════════════════════════════════════════════════════
// DASHBOARD MOBILE - Version dédiée mobile (<768px)
// Priorité : pointage rapide, message consultant, KPIs compacts
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { Btn, Card, SectionHeader } from '../../components/ui/index.jsx';
import { getDemoData } from '../../data/demoData.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { zurichToday, zurichClock, punctualityVsStart } from '../../utils/zurichTime.js';
import { punchOnlineOrQueue } from '../../services/offline/punchSync.js';
import { valeurStockConsolidee } from '../../utils/inventairePerimetres.js';

const DashboardMobile = ({ user, etablissement, setPage }) => {
  // Jour courant à Zurich (et non la date UTC du device) → frontière de minuit correcte.
  const today = zurichToday();
  const etabId = etablissement?.id || 'etab-1';
  const isConsultant = user.role === 'consultant';
  const legacySB = dbService.getBridge();
  const DEMO_DATA = getDemoData();

  const [shifts, setShifts] = React.useState([]);
  const [pertes, setPertes] = React.useState([]);
  const [inventaires, setInventaires] = React.useState([]);
  const [message, setMessage] = React.useState({ message: '', updatedBy: null, updatedAt: null });
  const [editingMessage, setEditingMessage] = React.useState(false);
  // Ref pour éviter une stale closure dans le callback realtime
  const editingMessageRef = React.useRef(false);
  const [messageDraft, setMessageDraft] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [pointageError, setPointageError] = React.useState('');

  React.useEffect(() => {
    if (!legacySB) {
      setShifts(DEMO_DATA.planning.filter(s => (s.etablissementId || 'etab-1') === etabId));
      setPertes(DEMO_DATA.pertes.filter(p => (p.etablissementId || 'etab-1') === etabId));
      setInventaires(DEMO_DATA.inventaires.filter(i => (i.etablissementId || 'etab-1') === etabId));
      setLoading(false);
      return;
    }
    let mounted = true;
    const unsubs = [];
    (async () => {
      try {
        const [shiftRows, pertesRows, invRows, msgRow] = await Promise.all([
          legacySB.db.listShifts(etabId),
          legacySB.db.listPertes(etabId),
          legacySB.db.listInventaires(etabId),
          legacySB.db.getConsultantMessage(etabId),
        ]);
        if (!mounted) return;
        setShifts((shiftRows || []).map(r => legacySB.db.mapShiftFromDB(r)));
        setPertes(pertesRows || []);
        setInventaires(invRows || []);
        // Toujours setter le message, même null : sinon l'ancien message
        // reste affiché quand le nouvel établissement n'en a pas.
        const nextMsg = msgRow || { message: '', updatedBy: null, updatedAt: null };
        setMessage(nextMsg);
        if (!editingMessageRef.current) setMessageDraft(nextMsg.message);
      } catch (err) { console.error('[DashboardMobile]', err); }
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
        if (mounted) {
          const next = m || { message: '', updatedBy: null, updatedAt: null };
          setMessage(next);
          if (!editingMessageRef.current) setMessageDraft(next.message);
        }
      } catch (e) {}
    }));
    return () => { mounted = false; unsubs.forEach(u => u && u()); };
  }, [etabId]);

  const todayShifts = shifts.filter(s => s.date === today);
  const myTodayShifts = todayShifts.filter(s => s.userId === user.id);
  const activePointages = todayShifts.filter(s => s.pointageDebut && !s.pointageFin);
  const manquants = todayShifts.filter(s => !s.pointageDebut);
  const pertesNonVal = pertes.filter(p => !p.valide);
  // Stock valorisé = dernier inventaire de CHAQUE périmètre (cuisine, boissons,
  // matériel...). Le seul inventaire le plus récent ne montrerait que la
  // dernière zone comptée.
  const stockValue = valeurStockConsolidee(inventaires);
  const canNavigate = typeof setPage === 'function';
  const quickActions = [
    { id: 'pointage', label: myTodayShifts.length ? 'Pointer' : 'Planning', sub: myTodayShifts.length ? 'Arrivee / depart' : 'Voir mes horaires', page: 'planning', tone: 'var(--success-strong)' },
    { id: 'haccp', label: 'HACCP', sub: 'Controle rapide', page: 'haccp', tone: 'var(--accent)' },
    { id: 'sop', label: 'SOPs', sub: 'Procedures du jour', page: 'sop', tone: '#1a5276' },
    { id: 'assistant', label: 'Assistant', sub: 'FAQ metier', page: 'faq', tone: '#6c3483' },
  ];

  const dateLabel = new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });

  // Pointage : maj optimiste immédiate (heure Zurich) → confirmation serveur via RPC
  // (qui pose l'heure réelle) → rollback visuel si l'écriture échoue.
  // Défaillance RÉSEAU : pas de rollback, le punch part en file hors-ligne
  // (punchOnlineOrQueue) et sera rejoué au retour du réseau. Ne JAMAIS bloquer.
  const pointer = async (shift, type) => {
    setPointageError('');
    if (!legacySB) { setPointageError('Supabase non configuré'); return; }
    const prevShifts = shifts;
    const optimisticTime = zurichClock();
    const field = type === 'arrivee' ? 'pointageDebut' : 'pointageFin';
    setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, [field]: optimisticTime } : s));
    try {
      const res = await punchOnlineOrQueue({
        call: () => (type === 'arrivee' ? legacySB.db.pointerArrivee(shift.id) : legacySB.db.pointerDepart(shift.id)),
        shiftId: shift.id,
        type,
        userId: user?.id || null,
        etablissementId: shift.etablissementId || null,
      });
      if (res.mode === 'online') {
        const mapped = legacySB.db.mapShiftFromDB(res.row);
        setShifts(prev => prev.map(s => s.id === mapped.id ? mapped : s));
        notifyLegacy(type === 'arrivee' ? `✓ Arrivée pointée à ${mapped.pointageDebut}` : `✓ Départ pointé à ${mapped.pointageFin}`, 'success');
      } else {
        notifyLegacy('Pointage enregistré : il sera synchronisé au retour du réseau', 'warning');
      }
    } catch (err) {
      setShifts(prevShifts); // rollback (erreur métier uniquement)
      setPointageError('Erreur : ' + err.message);
      notifyLegacy('Pointage refusé : ' + err.message, 'error');
    }
  };
  const pointerArrivee = (shift) => pointer(shift, 'arrivee');
  const pointerDepart = (shift) => pointer(shift, 'depart');

  const saveMessage = async () => {
    if (!legacySB || !isConsultant) return;
    try {
      await legacySB.db.setConsultantMessage(etabId, messageDraft, user.id);
      setMessage({ message: messageDraft, updatedBy: user.id, updatedAt: new Date().toISOString() });
      editingMessageRef.current = false;
      setEditingMessage(false);
    }
    catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
  };
  const cancelEdit = () => { setMessageDraft(message.message); editingMessageRef.current = false; setEditingMessage(false); };

  const goTo = (page) => {
    if (typeof setPage === 'function') setPage(page);
  };

  const getUserName = (uid) => {
    const u = (DEMO_DATA.utilisateurs || []).find(u => u.id === uid);
    return u ? `${u.prenom} ${u.nom}` : 'Inconnu';
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;
  }

  return (
    <div style={dm.root}>
      {/* Greeting compact */}
      <div style={dm.greeting}>
        <div style={dm.greetingTitle}>Bonjour, {user.prenom} 👋</div>
        <div style={dm.greetingSub}>{dateLabel}</div>
      </div>

      {/* ═══ POINTAGE PRIORITAIRE - toujours visible ═══ */}
      <div style={dm.pointageBloc}>
        <div style={dm.pointageHead}>⏱ MES HORAIRES AUJOURD'HUI</div>
        {pointageError && <div style={dm.errorBanner}>{pointageError}</div>}
        {(myTodayShifts || []).length === 0 ? (
          <div style={dm.noShiftCard}>
            <div style={{ fontSize: 32, opacity: 0.4, marginBottom: 6 }}>📅</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Pas de shift programmé</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Profitez de votre journée !</div>
            <button style={{ ...dm.bigBtn, background: 'var(--border)', cursor: 'not-allowed', marginTop: 10 }} disabled>
              ⏱ Aucun pointage
            </button>
          </div>
        ) : myTodayShifts.map(shift => {
            const enPoste = shift.pointageDebut && !shift.pointageFin;
            const termine = shift.pointageDebut && shift.pointageFin;
            const pasCommence = !shift.pointageDebut;
            const punct = pasCommence ? punctualityVsStart(shift.debut) : null;
            const punctColor = punct?.key === 'retard' ? 'var(--warning-text)' : punct?.key === 'heure' ? 'var(--success-text)' : 'var(--text2)';
            const label = shift.typeShift === 'midi' ? '☀ Midi' : shift.typeShift === 'soir' ? '🌙 Soir' : 'Service';
            const cardBg = enPoste ? 'var(--success-bg)' : termine ? 'var(--surface2)' : 'var(--warning-bg)';
            const cardBorder = enPoste ? 'var(--success-strong)' : termine ? 'var(--border2)' : 'var(--warning-strong)';

            return (
              <div key={shift.id} style={{ ...dm.pointageCard, background: cardBg, borderColor: cardBorder }}>
                <div style={dm.pointageInfo}>
                  <div style={dm.pointageLabel}>{label}</div>
                  <div style={dm.pointageTime}>{shift.debut} → {shift.fin}</div>
                </div>

                {pasCommence && (
                  <>
                    <div style={dm.pointageStatus}>
                      En attente d'arrivée
                      {punct && <span style={{ color: punctColor, fontWeight: 700 }}> · {punct.label}</span>}
                    </div>
                    <button
                      style={{ ...dm.bigBtn, background: 'var(--success-strong)' }}
                      onClick={() => pointerArrivee(shift)}
                    >
                      ⏱ POINTER MON ARRIVÉE
                    </button>
                  </>
                )}

                {enPoste && (
                  <>
                    <div style={{ ...dm.pointageStatus, color: 'var(--success-text)', fontWeight: 700 }}>✓ En poste depuis {shift.pointageDebut}</div>
                    <button style={{ ...dm.bigBtn, background: 'var(--danger-strong)' }} onClick={() => pointerDepart(shift)}>
                      ⏱ POINTER MON DÉPART
                    </button>
                  </>
                )}

                {termine && (
                  <div style={{ ...dm.pointageStatus, color: 'var(--text2)' }}>
                    ✓ Journée terminée<br/>
                    <span style={{ fontSize: 12 }}>{shift.pointageDebut} → {shift.pointageFin}</span>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Message consultant compact */}
      <div style={dm.messageBloc}>
        <div style={dm.messageHead}>
          <span>💬 Message du consultant</span>
          {isConsultant && !editingMessage && (
            <button style={dm.editMsgBtn} onClick={() => { editingMessageRef.current = true; setEditingMessage(true); }}>
              {message.message ? '✎' : '+'}
            </button>
          )}
        </div>
        {editingMessage ? (
          <div>
            <textarea style={dm.textarea} value={messageDraft} onChange={e => setMessageDraft(e.target.value)}
              placeholder="Message pour l'équipe…" autoFocus rows={3} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={{ ...dm.smallBtn, flex: 1, background: 'var(--bg)', color: 'var(--text)' }} onClick={cancelEdit}>Annuler</button>
              <button style={{ ...dm.smallBtn, flex: 1, background: 'var(--accent)', color: '#fff' }} onClick={saveMessage}>Publier</button>
            </div>
          </div>
        ) : message.message ? (
          <div>
            <div style={dm.messageBody}>{message.message}</div>
            <div style={dm.messageSig}>- Jérémy Samper</div>
          </div>
        ) : (
          <div style={dm.messageEmpty}>Aucun message.</div>
        )}
      </div>

      {/* KPIs en grille 2×2 compacte */}
      <div style={dm.kpiGrid}>
        <div style={{ ...dm.kpi, borderLeft: '3px solid var(--success-strong)' }}>
          <div style={dm.kpiLbl}>En poste</div>
          <div style={{ ...dm.kpiVal, color: 'var(--success-text)' }}>{activePointages.length}</div>
        </div>
        <div style={{ ...dm.kpi, borderLeft: '3px solid var(--warning-strong)' }}>
          <div style={dm.kpiLbl}>Shifts jour</div>
          <div style={{ ...dm.kpiVal, color: 'var(--warning-text)' }}>{(todayShifts || []).length}</div>
        </div>
        <div style={{ ...dm.kpi, borderLeft: '3px solid var(--danger-strong)' }}>
          <div style={dm.kpiLbl}>Pertes</div>
          <div style={{ ...dm.kpiVal, color: 'var(--danger-text)' }}>{(pertesNonVal || []).length}</div>
        </div>
        <div style={{ ...dm.kpi, borderLeft: '3px solid var(--accent)' }}>
          <div style={dm.kpiLbl}>Stock CHF</div>
          <div style={dm.kpiVal}>{Math.round(stockValue).toLocaleString('fr-CH')}</div>
        </div>
      </div>

      {isConsultant && (
      <Card style={dm.quickCard}>
        <SectionHeader title="Actions rapides" sub="Automatisations utiles maintenant" style={{ marginBottom: 10 }} />
        <div style={dm.quickGrid}>
          {quickActions.map(action => (
            <button
              key={action.id}
              type="button"
              style={{ ...dm.quickAction, borderColor: action.tone }}
              onClick={() => goTo(action.page)}
              disabled={!canNavigate}
            >
              <span style={{ ...dm.quickDot, background: action.tone }} />
              <span style={dm.quickLabel}>{action.label}</span>
              <span style={dm.quickSub}>{action.sub}</span>
            </button>
          ))}
        </div>
        <div style={dm.assistantStrip}>
          <div>
            <div style={dm.assistantStripTitle}>FAQ & assistant IA pret</div>
            <div style={dm.assistantStripSub}>Questions metier, procedures et support equipe sans changer les donnees.</div>
          </div>
          <Btn variant="primary" small onClick={() => goTo('faq')} disabled={!canNavigate}>Ouvrir</Btn>
        </div>
      </Card>
      )}

      {/* Planning du jour en liste simple */}
      <div style={dm.section}>
        <div style={dm.sectionTitle}>📅 Aujourd'hui · {(todayShifts || []).length} shift{(todayShifts || []).length > 1 ? 's' : ''}</div>
        {(todayShifts || []).length === 0 ? (
          <div style={dm.emptyHint}>Aucun shift programmé.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(todayShifts || []).sort((a, b) => (a.debut || '').localeCompare(b.debut || '')).map(shift => {
              const enPoste = shift.pointageDebut && !shift.pointageFin;
              const termine = shift.pointageDebut && shift.pointageFin;
              const statut = enPoste ? { c: 'var(--success-text)', b: 'var(--success-bg)', t: 'En poste' }
                          : termine ? { c: 'var(--text2)', b: 'var(--surface2)', t: 'Terminé' }
                          : { c: 'var(--warning-text)', b: 'var(--warning-bg)', t: 'À venir' };
              const typeLabel = shift.typeShift === 'midi' ? '☀' : shift.typeShift === 'soir' ? '🌙' : '';
              return (
                <div key={shift.id} style={dm.shiftRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={dm.shiftName}>{getUserName(shift.userId)}</div>
                    <div style={dm.shiftTime}>
                      {typeLabel && <span style={{ marginRight: 4 }}>{typeLabel}</span>}
                      {shift.debut}–{shift.fin}
                      {shift.poste && <span style={{ color: 'var(--text2)', fontWeight: 400 }}> · {shift.poste}</span>}
                    </div>
                  </div>
                  <div style={{ ...dm.shiftBadge, background: statut.b, color: statut.c }}>{statut.t}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alertes */}
      {(manquants.length > 0 || (pertesNonVal || []).length > 0) && (
        <div style={dm.section}>
          <div style={dm.sectionTitle}>⚠ Alertes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {manquants.slice(0, 2).map(s => (
              <div key={s.id} style={dm.alertRow}>
                <span style={{ color: 'var(--warning-text)', fontWeight: 700, fontSize: 12 }}>Pointage manquant</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{getUserName(s.userId)} · {s.debut}</span>
              </div>
            ))}
            {pertesNonVal.slice(0, 2).map(p => (
              <div key={p.id} style={dm.alertRow}>
                <span style={{ color: 'var(--danger-text)', fontWeight: 700, fontSize: 12 }}>Perte à valider</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{p.produit} · {((p.quantite || 0) * (p.valeurUnit || 0)).toFixed(0)} CHF</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const dm = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },

  greeting: { padding: '4px 2px' },
  greetingTitle: { fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  greetingSub: { fontSize: 12, color: 'var(--text2)', marginTop: 2, textTransform: 'capitalize' },

  // Pointage - bloc en haut, priorité absolue
  pointageBloc: { background: 'var(--success-bg-soft)', border: '1px solid var(--success-bd)', borderRadius: 12, padding: 14 },
  pointageHead: { fontSize: 11, fontWeight: 700, color: 'var(--success-text)', letterSpacing: 0.5, marginBottom: 10 },
  errorBanner: { background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', padding: '8px 10px', borderRadius: 6, fontSize: 12, marginBottom: 10 },
  pointageCard: { background: 'var(--surface)', border: '2px solid', borderRadius: 10, padding: 14, marginBottom: 8 },
  noShiftCard: { background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 10, padding: '18px 14px', textAlign: 'center' },
  pointageInfo: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  pointageLabel: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  pointageTime: { fontSize: 13, fontWeight: 600, color: 'var(--text2)' },
  pointageStatus: { fontSize: 12, color: 'var(--text2)', marginBottom: 10, textAlign: 'center' },
  bigBtn: { display: 'block', width: '100%', padding: '14px 16px', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', letterSpacing: 0.3, minHeight: 48 },
  rangeHint: { fontSize: 10, color: 'var(--text2)', marginTop: 6, textAlign: 'center', fontStyle: 'italic' },

  // Message consultant
  messageBloc: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 },
  messageHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  editMsgBtn: { width: 28, height: 28, border: '1px solid var(--accent)', background: 'none', color: 'var(--accent)', borderRadius: 6, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 700 },
  textarea: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', resize: 'vertical' },
  smallBtn: { padding: '10px 14px', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', minHeight: 40 },
  messageBody: { fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontStyle: 'italic' },
  messageSig: { fontSize: 10, color: 'var(--text2)', marginTop: 6, fontWeight: 600 },
  messageEmpty: { fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' },

  // KPIs 2×2 - toutes les cases ont la même hauteur, contenu centré
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  kpi: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 76, boxSizing: 'border-box' },
  kpiLbl: { fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, lineHeight: 1.3 },
  kpiVal: { fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)', marginTop: 6, color: 'var(--text)', lineHeight: 1 },

  quickCard: { padding: 12, borderRadius: 10 },
  quickGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  quickAction: { minHeight: 70, display: 'grid', gridTemplateColumns: '8px 1fr', gridTemplateRows: 'auto auto', gap: '2px 8px', alignItems: 'center', padding: '10px 11px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface2)', textAlign: 'left', fontFamily: 'var(--font)', cursor: 'pointer' },
  quickDot: { width: 7, height: 7, borderRadius: 99, gridRow: '1 / span 2' },
  quickLabel: { fontSize: 13, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  quickSub: { fontSize: 10, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  assistantStrip: { marginTop: 10, padding: 10, borderRadius: 9, background: 'linear-gradient(135deg,var(--accent-light),var(--surface))', border: '1px solid var(--accent-bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  assistantStripTitle: { fontSize: 12, fontWeight: 800, color: 'var(--text)' },
  assistantStripSub: { fontSize: 10, color: 'var(--text2)', lineHeight: 1.35, marginTop: 2 },

  // Sections
  section: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: 10 },

  shiftRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6 },
  shiftName: { fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  shiftTime: { fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginTop: 2 },
  shiftBadge: { fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' },

  alertRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 8px', background: 'var(--bg)', borderRadius: 4 },

  emptyHint: { padding: 12, textAlign: 'center', color: 'var(--text2)', fontSize: 12, fontStyle: 'italic' },
};

export default DashboardMobile;
