// ═══════════════════════════════════════════════════════════════
// DASHBOARD — Vue d'ensemble + pointage rapide + message consultant
// ═══════════════════════════════════════════════════════════════

const Dashboard = ({ user, etablissement }) => {
  const today = new Date().toISOString().slice(0, 10);
  const etabId = etablissement?.id || 'etab-1';
  const isConsultant = user.role === 'consultant';

  const [shifts, setShifts] = React.useState([]);
  const [pertes, setPertes] = React.useState([]);
  const [inventaires, setInventaires] = React.useState([]);
  const [message, setMessage] = React.useState({ message: '', updatedBy: null, updatedAt: null });
  const [editingMessage, setEditingMessage] = React.useState(false);
  const [messageDraft, setMessageDraft] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [pointageError, setPointageError] = React.useState('');

  React.useEffect(() => {
    if (!window.SB) {
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
          window.SB.db.listShifts(etabId),
          window.SB.db.listPertes(etabId),
          window.SB.db.listInventaires(etabId),
          window.SB.db.getConsultantMessage(etabId),
        ]);
        if (!mounted) return;
        setShifts((shiftRows || []).map(r => window.SB.db.mapShiftFromDB(r)));
        setPertes(pertesRows || []);
        setInventaires(invRows || []);
        if (msgRow) {
          setMessage(msgRow);
          setMessageDraft(msgRow.message);
        }
      } catch (err) { console.error('[Dashboard load]', err); }
      finally { if (mounted) setLoading(false); }
    })();

    unsubs.push(window.SB.realtime.subscribe('shifts', async () => {
      try { const rows = await window.SB.db.listShifts(etabId); if (mounted) setShifts((rows || []).map(r => window.SB.db.mapShiftFromDB(r))); } catch (e) {}
    }));
    unsubs.push(window.SB.realtime.subscribe('pertes', async () => {
      try { const rows = await window.SB.db.listPertes(etabId); if (mounted) setPertes(rows || []); } catch (e) {}
    }));
    unsubs.push(window.SB.realtime.subscribe('consultant_messages', async () => {
      try {
        const m = await window.SB.db.getConsultantMessage(etabId);
        if (mounted && m) { setMessage(m); if (!editingMessage) setMessageDraft(m.message); }
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

  const dateLabel = new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hourLabel = new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

  const pointerArrivee = async (shift) => {
    setPointageError('');
    if (!window.SB) { setPointageError('Supabase non configuré'); return; }
    try { await window.SB.db.pointerArrivee(shift.id); }
    catch (err) { setPointageError('Erreur arrivée : ' + err.message); }
  };

  const pointerDepart = async (shift) => {
    setPointageError('');
    if (!window.SB) { setPointageError('Supabase non configuré'); return; }
    try { await window.SB.db.pointerDepart(shift.id); }
    catch (err) { setPointageError('Erreur départ : ' + err.message); }
  };

  const saveMessage = async () => {
    if (!window.SB || !isConsultant) return;
    try {
      await window.SB.db.setConsultantMessage(etabId, messageDraft, user.id);
      setEditingMessage(false);
    } catch (err) { window.notify('Erreur sauvegarde message : ' + err.message, 'error'); }
  };

  const cancelEdit = () => {
    setMessageDraft(message.message);
    setEditingMessage(false);
  };

  const getUserName = (uid) => {
    const u = DEMO_DATA.utilisateurs.find(u => u.id === uid);
    return u ? `${u.prenom} ${u.nom}` : 'Inconnu';
  };

  const isNowInRange = (debut, fin) => {
    const [dh, dm] = (debut || '00:00').split(':').map(Number);
    const [fh, fm] = (fin || '23:59').split(':').map(Number);
    const n = new Date();
    const nm = n.getHours() * 60 + n.getMinutes();
    return nm >= (dh * 60 + dm - 30) && nm <= (fh * 60 + fm + 30);
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
        {etablissement && <div style={ds.etabBadge}>{etablissement.nom}</div>}
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
            <button style={{ ...ds.bigActionBtn, background: '#d1d5db', cursor: 'not-allowed', marginTop: 14 }} disabled>
              ⏱ Aucun pointage à effectuer
            </button>
          </div>
        ) : (
          <div style={ds.myShiftsRow}>
            {(myTodayShifts || []).map(shift => {
              const enPoste = shift.pointageDebut && !shift.pointageFin;
              const termine = shift.pointageDebut && shift.pointageFin;
              const pasCommence = !shift.pointageDebut;
              const inRange = isNowInRange(shift.debut, shift.fin);
              const shiftLabel = shift.typeShift === 'midi' ? '☀ Service midi' : shift.typeShift === 'soir' ? '🌙 Service soir' : 'Service';

              const cardStyle = {
                ...ds.myShiftCard,
                background: enPoste ? '#dcfce7' : termine ? '#f3f4f6' : pasCommence ? '#fef3c7' : 'var(--surface)',
                borderColor: enPoste ? '#16a34a' : termine ? '#9ca3af' : pasCommence ? '#f59e0b' : 'var(--border)',
              };

              return (
                <div key={shift.id} style={cardStyle}>
                  <div style={ds.myShiftHead}>
                    <div style={ds.myShiftLabel}>{shiftLabel}</div>
                    <div style={ds.myShiftRange}>{shift.debut}–{shift.fin}</div>
                  </div>

                  {pasCommence && (
                    <div>
                      <div style={ds.statusText}>En attente d'arrivée</div>
                      <button
                        style={{ ...ds.bigActionBtn, background: inRange ? '#16a34a' : '#d1d5db', cursor: inRange ? 'pointer' : 'not-allowed' }}
                        onClick={() => inRange && pointerArrivee(shift)}
                        disabled={!inRange}
                        title={inRange ? '' : 'Disponible dans la fenêtre de ±30 min autour du shift'}
                      >
                        ⏱ Pointer mon arrivée
                      </button>
                      {!inRange && <div style={ds.hintText}>Disponible dès 30 min avant le début</div>}
                    </div>
                  )}

                  {enPoste && (
                    <div>
                      <div style={{ ...ds.statusText, color: '#15803d', fontWeight: 700 }}>✓ En poste depuis {shift.pointageDebut}</div>
                      <button style={{ ...ds.bigActionBtn, background: '#dc2626' }} onClick={() => pointerDepart(shift)}>
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
            <button style={ds.editMessageBtn} onClick={() => setEditingMessage(true)}>
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

      {/* KPIs */}
      <div style={ds.kpiGrid}>
        <div style={{ ...ds.kpiCard, borderLeft: '3px solid #16a34a' }}>
          <div style={ds.kpiLabel}>En poste maintenant</div>
          <div style={{ ...ds.kpiValue, color: '#15803d' }}>{(activePointages || []).length}</div>
          <div style={ds.kpiSub}>{(activePointages || []).length > 0 ? (activePointages || []).map(s => getUserName(s.userId)).join(', ') : 'Personne'}</div>
        </div>
        <div style={{ ...ds.kpiCard, borderLeft: '3px solid #f59e0b' }}>
          <div style={ds.kpiLabel}>Shifts aujourd'hui</div>
          <div style={{ ...ds.kpiValue, color: '#92400e' }}>{(todayShifts || []).length}</div>
          <div style={ds.kpiSub}>{(manquants || []).length} en attente</div>
        </div>
        <div style={{ ...ds.kpiCard, borderLeft: '3px solid #dc2626' }}>
          <div style={ds.kpiLabel}>Pertes à valider</div>
          <div style={{ ...ds.kpiValue, color: '#991b1b' }}>{(pertesNonVal || []).length}</div>
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
              const statut = enPoste ? { label: '✓ En poste', color: '#15803d', bg: '#dcfce7' }
                          : termine ? { label: 'Terminé', color: '#6b7280', bg: '#f3f4f6' }
                          : { label: 'À venir', color: '#92400e', bg: '#fef3c7' };
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
                <span style={{ color: '#92400e', fontWeight: 700 }}>Pointage manquant</span>
                <span style={{ color: 'var(--text2)' }}> — {getUserName(s.userId)} devait commencer à {s.debut}</span>
              </div>
            ))}
            {(pertesNonVal || []).slice(0, 3).map(p => (
              <div key={p.id} style={ds.alertItem}>
                <span style={{ color: '#991b1b', fontWeight: 700 }}>Perte à valider</span>
                <span style={{ color: 'var(--text2)' }}> — {p.produit} ({p.quantite} {p.unite}, {((p.quantite || 0) * (p.valeurUnit || 0)).toFixed(2)} CHF)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ds = {
  root: { display: 'flex', flexDirection: 'column', gap: 20 },

  greeting: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  greetingTitle: { fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  greetingSub: { fontSize: 13, color: 'var(--text2)', marginTop: 4, textTransform: 'capitalize' },
  etabBadge: { padding: '6px 14px', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 20, fontSize: 12, fontWeight: 600 },

  pointageSection: { background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #86efac', borderRadius: 12, padding: 18 },
  pointageSectionTitle: { fontSize: 13, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12 },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 10 },
  myShiftsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 },
  noShiftCard: { background: 'var(--surface)', border: '2px dashed #d1d5db', borderRadius: 10, padding: '22px 18px', textAlign: 'center' },
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

Object.assign(window, { Dashboard });
