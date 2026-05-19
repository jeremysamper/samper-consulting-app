import React from 'react';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { canManageModule } from '../../data/demoData.js';

// ═══════════════════════════════════════════════════════════════
// SAMPER CONSULTING — MODULE SOP & CHECKLISTS
// ═══════════════════════════════════════════════════════════════

const SOP_CATEGORIES = ['Service', 'Ouverture / Fermeture', 'Hygiène', 'Stock', 'HACCP', 'Sécurité', 'Autre'];
const SOP_FREQUENCES = [
  { id: 'quotidienne',   label: 'Quotidienne',   couleur: '#16a34a' },
  { id: 'hebdomadaire',  label: 'Hebdomadaire',  couleur: '#0ea5e9' },
  { id: 'mensuelle',     label: 'Mensuelle',     couleur: '#a855f7' },
  { id: 'ponctuelle',    label: 'Ponctuelle',    couleur: '#64748b' },
];

const FREQ_MAP = Object.fromEntries(SOP_FREQUENCES.map(f => [f.id, f]));

// ─── Composant racine ───
const SOP = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const browserWindow = getBrowserWindow();
  const isMobile = (browserWindow?.innerWidth || 1024) < 768;
  const canManage = canManageModule(user.role, 'sop');

  const [sops, setSops] = React.useState([]);
  const [sopTemplates, setSopTemplates] = React.useState([]);
  const [executions, setExecutions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('liste'); // liste | historique
  const [selectedSop, setSelectedSop] = React.useState(null);  // pour éditer
  const [runningExec, setRunningExec] = React.useState(null);  // pour exécuter
  const [showTemplates, setShowTemplates] = React.useState(false);

  // Chargement initial + realtime
  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return; }
    let mounted = true;

    const refresh = async () => {
      try {
        const [sopsList, execList, tplList] = await Promise.all([
          legacySB.db.listSops(etabId),
          legacySB.db.listSopExecutions(etabId, { limit: 100 }),
          legacySB.db.listSopTemplates(),
        ]);
        if (mounted) {
          setSops(sopsList);
          setExecutions(execList);
          setSopTemplates(Array.isArray(tplList) ? tplList : []);
          setLoading(false);
        }
      } catch (err) { console.error('[SOP load]', err); if (mounted) setLoading(false); }
    };
    refresh();

    const u1 = legacySB.realtime.subscribe('sops', refresh);
    const u2 = legacySB.realtime.subscribe('sop_executions', refresh);
    return () => { mounted = false; u1 && u1(); u2 && u2(); };
  }, [etabId]);

  // Place une SOP existante dans la bibliothèque de templates (copie, is_template).
  const addToTemplates = async (sop) => {
    if (!legacySB || !sop) return;
    const key = (sop.titre || '').trim().toLowerCase();
    if (sopTemplates.some(t => (t.titre || '').trim().toLowerCase() === key)) {
      notifyLegacy('Cette SOP est déjà dans la bibliothèque de templates.', 'info');
      return;
    }
    try {
      await legacySB.db.upsertSop({
        etablissementId: sop.etablissementId || etabId,
        titre: sop.titre,
        description: sop.description,
        categorie: sop.categorie,
        frequence: sop.frequence,
        sections: sop.sections,
        tags: sop.tags,
        isTemplate: true,
        sourceTemplate: sop.id || null,
        actif: true,
      });
      notifyLegacy('SOP ajoutée à la bibliothèque de templates.', 'success');
    } catch (err) {
      notifyLegacy('Erreur : ' + err.message, 'error');
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  // ─── Vue : exécution en cours d'une SOP ───
  if (runningExec) {
    return <SopChecklist
      execution={runningExec}
      sop={sops.find(s => s.id === runningExec.sopId)}
      user={user}
      etablissement={etablissement}
      onBack={() => setRunningExec(null)}
    />;
  }

  // ─── Vue : édition d'une SOP ───
  if (selectedSop !== null && canManage) {
    return <SopEditor
      sop={selectedSop}
      etabId={etabId}
      onBack={() => setSelectedSop(null)}
      onSaved={(saved) => { setSelectedSop(null); }}
    />;
  }

  return (
    <div style={ss.root}>
      {/* Header */}
      <div style={ss.header}>
        <div>
          <h1 style={ss.title}>SOPs & Checklists</h1>
          <div style={ss.subtitle}>
            {sops.filter(s => s.actif).length} procédure{sops.filter(s => s.actif).length > 1 ? 's' : ''}
            {' · '}{executions.filter(e => e.statut === 'terminee').length} exécution{executions.filter(e => e.statut === 'terminee').length > 1 ? 's' : ''} terminée{executions.filter(e => e.statut === 'terminee').length > 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canManage && (
            <>
              <button style={ss.ghostBtn} onClick={() => setShowTemplates(true)}>📚 Templates</button>
              <button style={ss.primaryBtn} onClick={() => setSelectedSop({})}>+ Nouvelle SOP</button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={ss.tabs}>
        <button style={{ ...ss.tab, ...(activeTab === 'liste' ? ss.tabActive : {}) }} onClick={() => setActiveTab('liste')}>
          Mes procédures
        </button>
        <button style={{ ...ss.tab, ...(activeTab === 'historique' ? ss.tabActive : {}) }} onClick={() => setActiveTab('historique')}>
          Historique
        </button>
      </div>

      {activeTab === 'liste' ? (
        <SopList
          sops={sops}
          sopTemplates={sopTemplates}
          executions={executions}
          user={user}
          canManage={canManage}
          etabId={etabId}
          legacySB={legacySB}
          onEdit={(s) => setSelectedSop(s)}
          onAddToTemplates={addToTemplates}
          onStart={async (sop) => {
            try {
              const exec = await legacySB.db.startSopExecution({
                sopId: sop.id, etabId, userId: user.id, userName: user.nom || user.email
              });
              setRunningExec(exec);
            } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
          }}
        />
      ) : (
        <SopHistory executions={executions} sops={sops} user={user} canManage={canManage} />
      )}

      {/* Modale templates */}
      {showTemplates && (
        <SopTemplatesModal
          etabId={etabId}
          existingSops={sops}
          dbTemplates={sopTemplates}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
};

// ─── Liste des SOPs ───
const SopList = ({ sops, sopTemplates = [], executions = [], user, canManage, etabId, legacySB, onEdit, onStart, onAddToTemplates }) => {
  const [search, setSearch] = React.useState('');
  const sel = useSelection();
  const [bulkBusy, setBulkBusy] = React.useState(false);
  // Titres déjà présents dans la bibliothèque de templates (pour le badge des cartes).
  const templateTitles = React.useMemo(
    () => new Set((sopTemplates || []).map(t => (t.titre || '').trim().toLowerCase())),
    [sopTemplates],
  );

  // ─── Mode sélection : suppression et ajout aux templates en lot ───
  const bulkDelete = async () => {
    if (sel.count === 0) return;
    if (!confirmLegacy(`Supprimer ${sel.count} SOP sélectionnée(s) ?`)) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of Array.from(sel.ids)) {
      if (legacySB) {
        try { await legacySB.db.deleteSop(id); ok += 1; }
        catch (err) { console.error('[deleteSop]', err); }
      } else { ok += 1; }
    }
    setBulkBusy(false);
    sel.exit();
    notifyLegacy(`${ok} SOP supprimée(s).`, 'success');
  };

  const bulkAddToTemplates = async () => {
    if (sel.count === 0 || !legacySB) return;
    setBulkBusy(true);
    let ok = 0;
    let skip = 0;
    for (const id of Array.from(sel.ids)) {
      const sop = sops.find(s => s.id === id);
      if (!sop) continue;
      if (templateTitles.has((sop.titre || '').trim().toLowerCase())) { skip += 1; continue; }
      try {
        await legacySB.db.upsertSop({
          etablissementId: sop.etablissementId || etabId,
          titre: sop.titre,
          description: sop.description,
          categorie: sop.categorie,
          frequence: sop.frequence,
          sections: sop.sections,
          tags: sop.tags,
          isTemplate: true,
          sourceTemplate: sop.id || null,
          actif: true,
        });
        ok += 1;
      } catch (err) { console.error('[bulkAddToTemplates]', err); }
    }
    setBulkBusy(false);
    sel.exit();
    notifyLegacy(
      `${ok} SOP ajoutée(s) aux templates${skip > 0 ? ` (${skip} déjà présente(s))` : ''}.`,
      'success',
    );
  };
  const [filterFreq, setFilterFreq] = React.useState('all');
  // Mode "nouveau cuisinier" : ne montre que les SOPs taggées 'essentielle'
  const [onboardingMode, setOnboardingMode] = React.useState(false);

  // Tag conventionnel pour marquer une SOP "à faire pour un nouveau cuisinier"
  const ONBOARDING_TAG = 'essentielle';

  // ─── Carte des SOPs déjà exécutées (terminées) aujourd'hui ───
  // Permet d'afficher un badge "Fait aujourd'hui" et d'éviter les doublons accidentels.
  // On ne compte que les exécutions au statut 'terminee' du jour courant.
  const todayStr = new Date().toISOString().slice(0, 10);
  const doneTodayMap = React.useMemo(() => {
    const map = {};
    (executions || []).forEach(e => {
      if (e.statut !== 'terminee') return;
      if ((e.dateExecution || '').slice(0, 10) !== todayStr) return;
      // On garde la dernière exécution du jour
      if (!map[e.sopId] || new Date(e.heureFin || e.heureDebut) > new Date(map[e.sopId].heureFin || map[e.sopId].heureDebut)) {
        map[e.sopId] = e;
      }
    });
    return map;
  }, [executions, todayStr]);

  // Wrapper onStart qui demande confirmation si déjà fait aujourd'hui (pour SOPs quotidiennes)
  const handleStart = (sop) => {
    const alreadyDone = doneTodayMap[sop.id];
    if (alreadyDone && sop.frequence === 'quotidien') {
      const heure = new Date(alreadyDone.heureFin || alreadyDone.heureDebut)
        .toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
      const op = alreadyDone.operateurNom || 'Quelqu\'un';
      if (!confirmLegacy(
        `Cette procédure quotidienne a déjà été validée aujourd'hui à ${heure} par ${op}.\n\nVoulez-vous vraiment la relancer ?`
      )) return;
    }
    onStart(sop);
  };

  const filtered = sops.filter(s => {
    if (!s.actif) return false;
    if (search !== '' && !s.titre.toLowerCase().includes(search.toLowerCase())) return false;
    if (onboardingMode && !(s.tags || []).includes(ONBOARDING_TAG)) return false;
    if (!onboardingMode && filterFreq !== 'all' && s.frequence !== filterFreq) return false;
    return true;
  });

  // Compteur de SOPs essentielles disponibles (pour afficher "(N)" sur le bouton)
  const essentialCount = sops.filter(s => s.actif && (s.tags || []).includes(ONBOARDING_TAG)).length;

  // Grouper par fréquence
  const byFreq = {};
  filtered.forEach(s => { (byFreq[s.frequence] = byFreq[s.frequence] || []).push(s); });

  return (
    <div>
      {/* Filtres */}
      <div style={ss.filtersBar}>
        <input
          type="text"
          placeholder="Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={ss.searchInput}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Mode nouveau cuisinier — toggle dédié */}
          {essentialCount > 0 && (
            <button
              style={{
                ...ss.chip,
                ...(onboardingMode ? { background: '#92400e', color: '#fff', borderColor: '#92400e' } : {}),
              }}
              onClick={() => setOnboardingMode(prev => !prev)}
              title="Afficher uniquement les SOPs taggées 'essentielle'"
            >
              🆕 Nouveau cuisinier ({essentialCount})
            </button>
          )}
          {!onboardingMode && (
            <>
              <button style={{ ...ss.chip, ...(filterFreq === 'all' ? ss.chipActive : {}) }} onClick={() => setFilterFreq('all')}>Toutes</button>
              {SOP_FREQUENCES.map(f => (
                <button key={f.id}
                  style={{ ...ss.chip, ...(filterFreq === f.id ? ss.chipActive : {}) }}
                  onClick={() => setFilterFreq(f.id)}
                >{f.label}</button>
              ))}
            </>
          )}
          {canManage && !sel.active && (
            <button style={ss.chip} onClick={sel.enter} title="Sélectionner plusieurs SOP">☑ Sélectionner</button>
          )}
        </div>
      </div>

      {/* Barre d'outils du mode sélection */}
      {sel.active && (
        <SelectionToolbar
          count={sel.count}
          total={filtered.length}
          allSelected={sel.count > 0 && sel.count === filtered.length}
          onToggleAll={() => (sel.count === filtered.length ? sel.clear() : sel.selectAll(filtered.map(s => s.id)))}
          onDelete={bulkDelete}
          onExport={bulkAddToTemplates}
          exportLabel="📚 Ajouter aux templates"
          onCancel={sel.exit}
          busy={bulkBusy}
        />
      )}

      {/* Bandeau d'info quand mode nouveau cuisinier actif */}
      {onboardingMode && (
        <div style={{
          padding:'10px 14px', background:'#fef3c7', border:'1px solid #fde68a',
          borderRadius:8, marginBottom:12, fontSize:12, color:'#78350f', lineHeight:1.5,
        }}>
          <strong>🆕 Mode "Nouveau cuisinier"</strong> — Voici les {essentialCount} procédure{essentialCount>1?'s':''} essentielle{essentialCount>1?'s':''} à exécuter en priorité. Pour qu'une SOP apparaisse ici, ajoutez-lui le tag <code>essentielle</code> dans son éditeur.
        </div>
      )}

      {filtered.length === 0 && (
        <div style={ss.empty}>
          <div style={{ fontSize: 40, opacity: 0.3 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>
            {sops.length === 0 ? 'Aucune procédure' : 'Aucun résultat'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            {sops.length === 0 ? 'Créez une SOP avec "+ Nouvelle SOP", ou importez-en une depuis "📚 Templates".' : 'Modifiez vos filtres.'}
          </div>
        </div>
      )}

      {SOP_FREQUENCES.filter(f => byFreq[f.id]?.length > 0).map(freq => (
        <div key={freq.id} style={{ marginBottom: 24 }}>
          <div style={ss.groupHeader}>
            <span style={{ ...ss.freqDot, background: freq.couleur }} />
            <span style={ss.groupTitle}>{freq.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>({byFreq[freq.id].length})</span>
          </div>
          <div style={ss.cardsGrid}>
            {byFreq[freq.id].map(sop => {
              const totalSteps = (sop.sections || []).reduce((s, sec) => s + (sec.etapes || []).length, 0);
              const doneToday = doneTodayMap[sop.id];
              const inTemplates = templateTitles.has((sop.titre || '').trim().toLowerCase());
              return (
                <div key={sop.id} style={{
                  ...ss.sopCard,
                  ...(doneToday ? { borderColor: '#86efac', background: '#f0fdf4' } : {}),
                  ...(sel.active && sel.isSelected(sop.id) ? { borderColor: 'var(--accent)', background: 'var(--bg)' } : {}),
                }}>
                  {sel.active && (
                    <input
                      type="checkbox"
                      checked={sel.isSelected(sop.id)}
                      onChange={() => sel.toggle(sop.id)}
                      style={{ width: 18, height: 18, cursor: 'pointer', alignSelf: 'center', marginRight: 4, flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ss.sopCardTitle}>{sop.titre}</div>
                    {sop.description && <div style={ss.sopCardDesc}>{sop.description}</div>}
                    <div style={ss.sopCardMeta}>
                      <span style={{ ...ss.miniBadge, background: '#f1f5f9', color: 'var(--text2)' }}>{sop.categorie}</span>
                      <span style={ss.sopCardSteps}>{totalSteps} étape{totalSteps > 1 ? 's' : ''}</span>
                      {(sop.tags || []).map(t => (
                        <span key={t} style={{ ...ss.miniBadge, background: '#fef3c7', color: '#92400e' }}>{t}</span>
                      ))}
                      {doneToday && (
                        <span
                          style={{ ...ss.miniBadge, background: '#16a34a', color: '#fff' }}
                          title={`Validée à ${new Date(doneToday.heureFin || doneToday.heureDebut).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })} par ${doneToday.operateurNom || '—'}`}
                        >✓ Fait aujourd'hui</span>
                      )}
                    </div>
                  </div>
                  <div style={ss.sopCardActions}>
                    {canManage && (
                      <button style={ss.iconBtn} onClick={() => onEdit(sop)} title="Modifier">✎</button>
                    )}
                    {canManage && (
                      inTemplates ? (
                        <button
                          style={{ ...ss.iconBtn, color: '#15803d', borderColor: '#86efac', cursor: 'default' }}
                          title="Déjà dans la bibliothèque de templates"
                          disabled
                        >📚✓</button>
                      ) : (
                        <button
                          style={ss.iconBtn}
                          onClick={() => onAddToTemplates && onAddToTemplates(sop)}
                          title="Ajouter à la bibliothèque de templates (pour export vers d'autres établissements)"
                        >📚+</button>
                      )
                    )}
                    <button
                      style={{
                        ...ss.startBtn,
                        ...(doneToday && sop.frequence === 'quotidien'
                            ? { background: 'var(--surface)', color: 'var(--text2)', border: '1px solid var(--border)' }
                            : {}),
                      }}
                      onClick={() => handleStart(sop)}
                      title={doneToday && sop.frequence === 'quotidien'
                        ? "Relancer (déjà validée aujourd'hui)"
                        : "Lancer la checklist"}
                    >▶ {doneToday && sop.frequence === 'quotidien' ? 'Relancer' : 'Lancer'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Vue checklist mobile-first (exécution en cours) ───
const SopChecklist = ({ execution, sop, user, etablissement, onBack }) => {
  const legacySB = dbService.getBridge();
  const [stepStates, setStepStates] = React.useState({});  // { 'sectionId:stepId' : { cochee, note } }
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // Charger états initiaux
  React.useEffect(() => {
    if (!legacySB || !execution) return;
    legacySB.db.listSopStepStates(execution.id).then(states => {
      const map = {};
      states.forEach(s => { map[s.stepPath] = { cochee: s.cochee, note: s.note }; });
      setStepStates(map);
    }).catch(() => {});
    setNotes(execution.notes || '');
  }, [execution?.id]);

  if (!sop) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>
      SOP introuvable. <button onClick={onBack} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>← Retour</button>
    </div>
  );

  const allEtapes = (sop.sections || []).flatMap(sec =>
    (sec.etapes || []).map(e => ({ ...e, sectionId: sec.id, sectionTitre: sec.titre }))
  );
  const totalSteps = allEtapes.length;
  const checkedSteps = allEtapes.filter(e => stepStates[`${e.sectionId}:${e.id}`]?.cochee).length;
  const progress = totalSteps > 0 ? Math.round(checkedSteps / totalSteps * 100) : 0;

  const toggleStep = async (sectionId, stepId) => {
    const path = `${sectionId}:${stepId}`;
    const current = stepStates[path] || { cochee: false, note: '' };
    const newState = { ...current, cochee: !current.cochee };
    setStepStates({ ...stepStates, [path]: newState });
    if (legacySB) {
      try {
        await legacySB.db.toggleSopStep({
          executionId: execution.id, stepPath: path,
          cochee: newState.cochee, note: newState.note,
        });
      } catch (err) { console.error(err); }
    }
  };

  const finish = async (statut) => {
    if (busy) return;
    if (statut === 'abandonnee' && !confirmLegacy('Abandonner cette exécution ? Les cases cochées seront conservées dans l\'historique.')) return;
    if (statut === 'terminee' && checkedSteps < totalSteps && !confirmLegacy(`${totalSteps - checkedSteps} étape(s) non cochée(s). Valider quand même ?`)) return;
    setBusy(true);
    try {
      await legacySB.db.finishSopExecution(execution.id, {
        totalEtapes: totalSteps, etapesCochees: checkedSteps, notes, statut,
      });
      onBack();
    } catch (err) {
      notifyLegacy('Erreur : ' + err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <div style={ss.checklistRoot}>
      {/* Header sticky */}
      <div style={ss.checklistHeader}>
        <button style={ss.backBtn} onClick={onBack}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sop.titre}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            {new Date(execution.heureDebut).toLocaleString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {execution.operateurNom && ` · ${execution.operateurNom}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: progress === 100 ? '#16a34a' : 'var(--accent)', fontFamily: 'var(--font-serif)' }}>
            {checkedSteps}/{totalSteps}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)' }}>{progress}%</div>
        </div>
      </div>

      {/* Barre de progression */}
      <div style={ss.progressBarOuter}>
        <div style={{ ...ss.progressBarInner, width: `${progress}%`, background: progress === 100 ? '#16a34a' : 'var(--accent)' }} />
      </div>

      {/* Sections + étapes */}
      <div style={{ padding: '12px 16px 100px' }}>
        {(sop.sections || []).map(section => {
          const sectionSteps = section.etapes || [];
          const sectionChecked = sectionSteps.filter(e => stepStates[`${section.id}:${e.id}`]?.cochee).length;
          return (
            <div key={section.id} style={ss.sectionBlock}>
              {section.titre && (
                <div style={ss.sectionHeader}>
                  <span style={ss.sectionTitle}>{section.titre}</span>
                  <span style={ss.sectionCount}>{sectionChecked}/{sectionSteps.length}</span>
                </div>
              )}
              {sectionSteps.map(etape => {
                const path = `${section.id}:${etape.id}`;
                const state = stepStates[path] || {};
                return (
                  <div key={etape.id}
                    style={{ ...ss.etapeRow, ...(state.cochee ? ss.etapeRowChecked : {}) }}
                    onClick={() => toggleStep(section.id, etape.id)}
                  >
                    <div style={{ ...ss.checkbox, ...(state.cochee ? ss.checkboxChecked : {}) }}>
                      {state.cochee && <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...ss.etapeLabel, ...(state.cochee ? ss.etapeLabelChecked : {}) }}>
                        {etape.critique && <span style={ss.criticalDot} title="Étape critique">●</span>}
                        {etape.label}
                      </div>
                      {etape.info && (
                        <div style={ss.etapeInfo}>ℹ {etape.info}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Notes */}
        <div style={{ marginTop: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Notes (optionnel)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anomalies, remarques, observations…"
            rows={3}
            style={ss.notesInput}
          />
        </div>
      </div>

      {/* Barre d'action sticky en bas */}
      <div style={ss.checklistFooter}>
        <button style={ss.abandonBtn} onClick={() => finish('abandonnee')} disabled={busy}>Abandonner</button>
        <button style={ss.validateBtn} onClick={() => finish('terminee')} disabled={busy}>
          {busy ? '...' : `✓ Valider (${checkedSteps}/${totalSteps})`}
        </button>
      </div>
    </div>
  );
};

// ─── Historique des exécutions ───
const SopHistory = ({ executions, sops, user, canManage }) => {
  const sopMap = Object.fromEntries(sops.map(s => [s.id, s]));
  const sorted = [...executions].sort((a, b) => new Date(b.heureDebut) - new Date(a.heureDebut));

  // ─── Export PDF d'une exécution ───
  // Génère un document A4 propre avec : titre SOP, date, opérateur, étapes cochées/non cochées,
  // notes éventuelles. Utile pour audits HACCP / ISO.
  const exportExecutionPDF = (exec) => {
    const sop = sopMap[exec.sopId];
    if (!sop) {
      notifyLegacy('SOP introuvable pour cette exécution', 'error');
      return;
    }

    // Reconstruire la liste des étapes avec leur état coché
    // sop.sections = [{titre, etapes: [{id, libelle, ...}]}]
    // exec.stepStates = { etapeId: true/false }
    const stepStates = exec.stepStates || {};
    const sections = sop.sections || [];

    const escapeHtml = (s) => String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const dateLabel = new Date(exec.dateExecution + 'T12:00:00').toLocaleDateString('fr-CH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const heureDebut = new Date(exec.heureDebut).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
    const heureFin = exec.heureFin ? new Date(exec.heureFin).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }) : '—';

    // Compter étapes / cochées
    const allEtapes = sections.flatMap(s => s.etapes || []);
    const total = allEtapes.length;
    const cochees = allEtapes.filter(e => stepStates[e.id]).length;
    const tauxConf = total > 0 ? Math.round(cochees / total * 100) : 0;
    const statutLabel = exec.statut === 'terminee' ? '✓ Terminée'
                      : exec.statut === 'abandonnee' ? 'Abandonnée'
                      : 'En cours';

    // Construire le HTML des sections
    let sectionsHtml = '';
    sections.forEach(sec => {
      sectionsHtml += `<h3 style="margin:14px 0 6px 0;font-size:12pt;color:#92702A;border-bottom:1px solid #d4c8a0;padding-bottom:3px;">${escapeHtml(sec.titre || 'Étapes')}</h3>`;
      sectionsHtml += '<ul style="list-style:none;padding-left:0;margin:0;">';
      (sec.etapes || []).forEach(et => {
        const checked = !!stepStates[et.id];
        const checkbox = checked ? '☑' : '☐';
        const color = checked ? '#15803d' : '#666';
        const critical = et.critique ? ' <span style="color:#dc2626;font-size:8pt;font-weight:700;">● CRITIQUE</span>' : '';
        sectionsHtml += `<li style="padding:4px 0;font-size:10pt;color:${color};border-bottom:1px dotted #eee;">
          <span style="font-size:13pt;margin-right:6px;">${checkbox}</span>
          ${escapeHtml(et.libelle || '')}${critical}
        </li>`;
      });
      sectionsHtml += '</ul>';
    });

    // Métadonnées en haut
    const metaHtml = `
      <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:16px;font-size:10pt;">
        <div>
          <div><strong>Date :</strong> ${dateLabel}</div>
          <div><strong>Horaire :</strong> ${heureDebut} → ${heureFin}</div>
          <div><strong>Opérateur :</strong> ${escapeHtml(exec.operateurNom || '—')}</div>
        </div>
        <div style="text-align:right;">
          <div><strong>Statut :</strong> ${statutLabel}</div>
          <div><strong>Progression :</strong> ${cochees} / ${total} (${tauxConf}%)</div>
          ${exec.notes ? `<div style="margin-top:6px;font-style:italic;color:#666;">📝 ${escapeHtml(exec.notes)}</div>` : ''}
        </div>
      </div>
    `;

    // Construire un élément temporaire pour PDFUtils
    const tempId = 'sop-export-' + Date.now();
    const tempDiv = document.createElement('div');
    tempDiv.id = tempId;
    tempDiv.style.display = 'none';
    tempDiv.innerHTML = `${metaHtml}${sectionsHtml}`;
    document.body.appendChild(tempDiv);

    try {
      pdfUtils.printElement(tempId, sop.titre, { noBrandHeader: false });
    } catch (err) {
      notifyLegacy('Erreur lors de la génération PDF', 'error');
      console.error('[exportExecutionPDF]', err);
    } finally {
      // Cleanup après un délai pour laisser printElement faire son travail
      setTimeout(() => { tempDiv.remove(); }, 2000);
    }
  };

  if (sorted.length === 0) return (
    <div style={ss.empty}>
      <div style={{ fontSize: 40, opacity: 0.3 }}>📊</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>Aucune exécution enregistrée</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>L'historique apparaîtra ici dès la première checklist validée.</div>
    </div>
  );

  // Grouper par date
  const byDate = {};
  sorted.forEach(e => {
    const d = e.dateExecution;
    (byDate[d] = byDate[d] || []).push(e);
  });

  return (
    <div>
      {Object.keys(byDate).map(date => (
        <div key={date} style={{ marginBottom: 20 }}>
          <div style={ss.histDate}>
            {new Date(date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {byDate[date].map(exec => {
            const sop = sopMap[exec.sopId];
            const totalProgress = exec.totalEtapes > 0 ? Math.round(exec.etapesCochees / exec.totalEtapes * 100) : 0;
            const couleur = exec.statut === 'terminee'
              ? (totalProgress === 100 ? '#16a34a' : '#d97706')
              : exec.statut === 'abandonnee' ? '#dc2626' : '#0ea5e9';
            return (
              <div key={exec.id} style={ss.histRow}>
                <div style={{ width: 4, height: 36, background: couleur, borderRadius: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {sop ? sop.titre : '(SOP supprimée)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                    {new Date(exec.heureDebut).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}
                    {exec.heureFin && ` → ${new Date(exec.heureFin).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}`}
                    {exec.operateurNom && ` · ${exec.operateurNom}`}
                  </div>
                  {exec.notes && (
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' }}>📝 {exec.notes}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: couleur }}>{exec.etapesCochees}/{exec.totalEtapes}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {exec.statut === 'terminee' ? '✓ Terminée' : exec.statut === 'abandonnee' ? 'Abandonnée' : 'En cours'}
                  </div>
                  <button
                    style={{
                      marginTop: 4, padding: '3px 8px',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 6, fontSize: 10, fontWeight: 600, color: 'var(--text2)',
                      cursor: 'pointer', fontFamily: 'var(--font)',
                    }}
                    onClick={(e) => { e.stopPropagation(); exportExecutionPDF(exec); }}
                    title="Exporter cette exécution en PDF (audit)"
                  >📄 PDF</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ─── Modale bibliothèque de templates SOP ───
// Bibliothèque gérable (templates en base) + modèles Samper prêts à l'emploi.
// Permet d'importer une SOP dans l'établissement courant et de retirer un
// template de la bibliothèque.
const SopTemplatesModal = ({ etabId, existingSops, dbTemplates = [], onClose }) => {
  const legacySB = dbService.getBridge();
  const [selected, setSelected] = React.useState(new Set());
  const [busy, setBusy] = React.useState(false);

  // SOP déjà présentes dans l'établissement courant (par titre normalisé).
  const existingTitles = new Set((existingSops || []).map(s => (s.titre || '').trim().toLowerCase()));

  // Items de la bibliothèque de templates (en base, éditables).
  const dbItems = (dbTemplates || []).map(t => ({ key: 'db:' + t.id, source: 'db', tpl: t }));

  const importSelected = async () => {
    setBusy(true);
    let count = 0;
    for (const item of dbItems) {
      if (!selected.has(item.key)) continue;
      const tpl = item.tpl;
      try {
        await legacySB.db.upsertSop({
          etablissementId: etabId,
          titre: tpl.titre,
          description: tpl.description,
          categorie: tpl.categorie,
          frequence: tpl.frequence,
          sections: tpl.sections,
          tags: tpl.tags,
          isTemplate: false,
          sourceTemplate: tpl.id,
          actif: true,
        });
        count += 1;
      } catch (err) { console.error('[importSop]', err); }
    }
    setBusy(false);
    alertLegacy(`${count} SOP importée${count > 1 ? 's' : ''} dans cet établissement.`);
    onClose();
  };

  const removeTemplate = async (tpl) => {
    if (!confirmLegacy(
      `Retirer « ${tpl.titre} » de la bibliothèque de templates ?\n\n` +
      'Les SOP déjà importées dans les établissements ne sont pas affectées.'
    )) return;
    try {
      await legacySB.db.deleteSop(tpl.id);
      notifyLegacy('Template retiré de la bibliothèque.', 'success');
    } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
  };

  // Templates de la bibliothèque (en base) actuellement cochés — supprimables en lot.
  const selectedDbItems = dbItems.filter(it => selected.has(it.key));

  const removeSelected = async () => {
    if (!selectedDbItems.length) return;
    if (!confirmLegacy(
      `Retirer ${selectedDbItems.length} template(s) de la bibliothèque ?\n\n` +
      'Les SOP déjà importées dans les établissements ne sont pas affectées.'
    )) return;
    setBusy(true);
    let count = 0;
    for (const item of selectedDbItems) {
      try { await legacySB.db.deleteSop(item.tpl.id); count += 1; }
      catch (err) { console.error('[removeSop]', err); }
    }
    setBusy(false);
    setSelected(prev => {
      const next = new Set(prev);
      selectedDbItems.forEach(item => next.delete(item.key));
      return next;
    });
    notifyLegacy(`${count} template(s) retiré(s) de la bibliothèque.`, 'success');
  };

  const renderItem = (item) => {
    const tpl = item.tpl;
    const alreadyExists = existingTitles.has((tpl.titre || '').trim().toLowerCase());
    const checked = selected.has(item.key);
    const totalSteps = (tpl.sections || []).reduce((s, sec) => s + (sec.etapes || []).length, 0);
    return (
      <div key={item.key}
        style={{
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
          cursor: alreadyExists ? 'default' : 'pointer',
          opacity: alreadyExists ? 0.5 : 1,
          background: checked ? 'var(--accent-light)' : 'transparent',
        }}
        onClick={() => {
          if (alreadyExists) return;
          const next = new Set(selected);
          checked ? next.delete(item.key) : next.add(item.key);
          setSelected(next);
        }}
      >
        <input type="checkbox" checked={checked} disabled={alreadyExists} readOnly
          style={{ width: 18, height: 18, accentColor: 'var(--accent)', marginTop: 2 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{tpl.titre}</div>
          {tpl.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{tpl.description}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ ...ss.miniBadge, background: '#f1f5f9', color: 'var(--text2)' }}>{tpl.categorie}</span>
            <span style={{ ...ss.miniBadge, background: FREQ_MAP[tpl.frequence]?.couleur + '22', color: FREQ_MAP[tpl.frequence]?.couleur }}>{FREQ_MAP[tpl.frequence]?.label}</span>
            <span style={{ ...ss.miniBadge, background: 'var(--bg)', color: 'var(--text2)' }}>{totalSteps} étapes · {(tpl.sections || []).length} sections</span>
            {(tpl.tags || []).map(t => (
              <span key={t} style={{ ...ss.miniBadge, background: '#fef3c7', color: '#92400e' }}>{t}</span>
            ))}
          </div>
          {alreadyExists && <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, marginTop: 4 }}>✓ Déjà dans cet établissement</div>}
        </div>
        {item.source === 'db' && (
          <button
            onClick={(e) => { e.stopPropagation(); removeTemplate(tpl); }}
            title="Retirer de la bibliothèque de templates"
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: '#dc2626', fontSize: 13, padding: '4px 8px' }}
          >🗑</button>
        )}
      </div>
    );
  };

  return (
    <div style={ss.overlay} onClick={onClose}>
      <div style={ss.modal} onClick={e => e.stopPropagation()}>
        <div style={ss.modalHeader}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>📚 Bibliothèque de templates SOP</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              Importez des SOP dans cet établissement. Pour partager une SOP, ajoutez-la
              à la bibliothèque via le bouton 📚+ sur sa carte.
            </div>
          </div>
          <button style={ss.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {dbItems.length === 0 && (
            <div style={{ padding: '24px 18px', fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', textAlign: 'center' }}>
              Aucun template dans la bibliothèque. Utilisez le bouton 📚+ sur une SOP pour l'ajouter ici.
            </div>
          )}
          {dbItems.map(renderItem)}
        </div>
        <div style={ss.modalFooter}>
          <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>
            {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
          </span>
          {selectedDbItems.length > 0 && (
            <button
              style={{
                padding: '8px 14px', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)',
                cursor: busy ? 'default' : 'pointer', background: '#fef2f2',
                border: '1px solid #fca5a5', color: '#b91c1c', opacity: busy ? 0.5 : 1,
              }}
              onClick={removeSelected}
              disabled={busy}
            >
              🗑 Supprimer ({selectedDbItems.length})
            </button>
          )}
          <button style={ss.ghostBtn} onClick={onClose}>Fermer</button>
          <button
            style={{ ...ss.primaryBtn, opacity: selected.size === 0 || busy ? 0.5 : 1 }}
            onClick={importSelected}
            disabled={selected.size === 0 || busy}
          >
            {busy ? 'Import…' : `Importer ici (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Éditeur de SOP ───
const SopEditor = ({ sop, etabId, onBack, onSaved }) => {
  const isNew = !sop?.id;
  const [data, setData] = React.useState({
    titre: '', categorie: 'Service', frequence: 'ponctuelle', description: '',
    sections: [{ id: 's-' + Date.now(), titre: '', etapes: [] }],
    tags: [], actif: true,
    ...sop,
  });
  const [saving, setSaving] = React.useState(false);

  const setField = (k, v) => setData(prev => ({ ...prev, [k]: v }));

  const addSection = () => {
    setData(prev => ({ ...prev, sections: [...prev.sections, { id: 's-' + Date.now(), titre: '', etapes: [] }] }));
  };
  const removeSection = (idx) => {
    if ((data.sections || []).length <= 1) { alertLegacy('Au moins une section.'); return; }
    setData(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== idx) }));
  };
  const updateSection = (idx, patch) => {
    setData(prev => ({ ...prev, sections: prev.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) }));
  };
  const addEtape = (sectionIdx) => {
    setData(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === sectionIdx
        ? { ...s, etapes: [...(s.etapes || []), { id: 'e-' + Date.now(), label: '', critique: false, info: '' }] }
        : s),
    }));
  };
  const removeEtape = (sectionIdx, etapeIdx) => {
    setData(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === sectionIdx
        ? { ...s, etapes: s.etapes.filter((_, j) => j !== etapeIdx) }
        : s),
    }));
  };
  const updateEtape = (sectionIdx, etapeIdx, patch) => {
    setData(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => i === sectionIdx
        ? { ...s, etapes: s.etapes.map((e, j) => j === etapeIdx ? { ...e, ...patch } : e) }
        : s),
    }));
  };

  const save = async () => {
    if (!data.titre?.trim()) { alertLegacy('Titre obligatoire.'); return; }
    const totalSteps = (data.sections || []).reduce((s, sec) => s + (sec.etapes || []).length, 0);
    if (totalSteps === 0) { alertLegacy('Ajoutez au moins une étape.'); return; }
    setSaving(true);
    try {
      const saved = await legacySB.db.upsertSop({ ...data, etablissementId: etabId });
      onSaved(saved);
    } catch (err) {
      notifyLegacy('Erreur : ' + err.message, 'error');
      setSaving(false);
    }
  };

  const deleteSop = async () => {
    if (!data.id) return;
    if (!confirmLegacy(`Supprimer la SOP "${data.titre}" ? L'historique d'exécution sera également supprimé.`)) return;
    try {
      await legacySB.db.deleteSop(data.id);
      onBack();
    } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
  };

  return (
    <div style={ss.editorRoot}>
      {/* Header */}
      <div style={ss.editorHeader}>
        <button style={ss.backBtn} onClick={onBack}>← Retour</button>
        <div style={{ flex: 1 }} />
        {!isNew && (
          <button style={{ ...ss.ghostBtn, color: '#dc2626', borderColor: '#fca5a5' }} onClick={deleteSop}>🗑 Supprimer</button>
        )}
        <button style={ss.primaryBtn} onClick={save} disabled={saving}>
          {saving ? '...' : (isNew ? 'Créer' : 'Enregistrer')}
        </button>
      </div>

      <div style={ss.editorBody}>
        {/* Métadonnées */}
        <div style={ss.editorCard}>
          <input
            type="text"
            value={data.titre}
            onChange={e => setField('titre', e.target.value)}
            placeholder="Titre de la SOP"
            style={ss.bigTitle}
          />
          <textarea
            value={data.description}
            onChange={e => setField('description', e.target.value)}
            placeholder="Description courte (optionnelle)"
            rows={2}
            style={{ ...ss.notesInput, marginTop: 8 }}
          />
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={ss.fieldLabel}>Catégorie</label>
              <select value={data.categorie} onChange={e => setField('categorie', e.target.value)} style={ss.select}>
                {SOP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={ss.fieldLabel}>Fréquence</label>
              <select value={data.frequence} onChange={e => setField('frequence', e.target.value)} style={ss.select}>
                {SOP_FREQUENCES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Sections */}
        {(data.sections || []).map((section, sIdx) => (
          <div key={section.id} style={ss.editorCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                value={section.titre}
                onChange={e => updateSection(sIdx, { titre: e.target.value })}
                placeholder={`Titre section ${sIdx + 1} (optionnel pour SOP simple)`}
                style={{ ...ss.input, flex: 1, fontWeight: 600 }}
              />
              <button style={ss.iconBtnDanger} onClick={() => removeSection(sIdx)} title="Supprimer la section">✕</button>
            </div>
            {(section.etapes || []).map((etape, eIdx) => (
              <div key={etape.id} style={ss.etapeEditRow}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input
                    type="text"
                    value={etape.label}
                    onChange={e => updateEtape(sIdx, eIdx, { label: e.target.value })}
                    placeholder={`Étape ${eIdx + 1}`}
                    style={ss.input}
                  />
                  <input
                    type="text"
                    value={etape.info || ''}
                    onChange={e => updateEtape(sIdx, eIdx, { info: e.target.value })}
                    placeholder="Info / aide-mémoire (optionnel)"
                    style={{ ...ss.input, fontSize: 11, color: 'var(--text2)' }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!etape.critique}
                    onChange={e => updateEtape(sIdx, eIdx, { critique: e.target.checked })}
                    style={{ accentColor: '#dc2626' }}/>
                  Critique
                </label>
                <button style={ss.iconBtnDanger} onClick={() => removeEtape(sIdx, eIdx)}>✕</button>
              </div>
            ))}
            <button style={ss.addStepBtn} onClick={() => addEtape(sIdx)}>+ Étape</button>
          </div>
        ))}

        <button style={{ ...ss.ghostBtn, width: '100%' }} onClick={addSection}>+ Nouvelle section</button>
      </div>
    </div>
  );
};

// ─── Styles ───
const ss = {
  root: { padding: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  title: { fontSize: 24, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', margin: 0 },
  subtitle: { fontSize: 12, color: 'var(--text2)', marginTop: 4 },
  primaryBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 },
  ghostBtn: { padding: '7px 14px', background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 },
  tabs: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' },
  tab: { padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text2)', borderBottom: '2px solid transparent' },
  tabActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)', fontWeight: 600 },
  filtersBar: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  searchInput: { flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)' },
  chip: { padding: '5px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text2)' },
  chipActive: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' },
  empty: { padding: 40, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  groupHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  freqDot: { width: 10, height: 10, borderRadius: '50%' },
  groupTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 },
  sopCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 10 },
  sopCardTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  sopCardDesc: { fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.4 },
  sopCardMeta: { display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' },
  sopCardSteps: { fontSize: 10, color: 'var(--text2)' },
  sopCardActions: { display: 'flex', gap: 4, flexShrink: 0 },
  startBtn: { padding: '6px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
  iconBtn: { width: 30, height: 30, padding: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text2)' },
  iconBtnDanger: { width: 28, height: 28, padding: 0, background: 'none', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: '#dc2626', flexShrink: 0 },
  miniBadge: { fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4 },

  // Checklist
  checklistRoot: { background: 'var(--bg)', minHeight: '100vh', position: 'relative' },
  checklistHeader: { position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, padding: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  progressBarOuter: { height: 4, background: 'var(--bg)', position: 'sticky', top: 60, zIndex: 9 },
  progressBarInner: { height: '100%', transition: 'width 0.3s, background 0.3s' },
  sectionBlock: { marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, overflow: 'hidden' },
  sectionHeader: { padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionCount: { fontSize: 11, color: 'var(--text2)', fontWeight: 600 },
  etapeRow: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  etapeRowChecked: { background: '#f0fdf4' },
  checkbox: { width: 26, height: 26, borderRadius: 6, border: '2px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  checkboxChecked: { background: '#16a34a', borderColor: '#16a34a' },
  etapeLabel: { fontSize: 14, color: 'var(--text)', lineHeight: 1.4 },
  etapeLabelChecked: { textDecoration: 'line-through', color: 'var(--text2)' },
  criticalDot: { color: '#dc2626', marginRight: 6, fontSize: 8 },
  etapeInfo: { fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', marginTop: 4, paddingLeft: 4 },
  notesInput: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', resize: 'vertical', marginTop: 4 },
  checklistFooter: { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', gap: 10, zIndex: 10 },
  abandonBtn: { flex: 1, padding: '12px', background: 'none', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 },
  validateBtn: { flex: 2, padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 700 },

  // Historique
  histDate: { fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  histRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 },

  // Éditeur
  editorRoot: { background: 'var(--bg)', minHeight: '100vh' },
  editorHeader: { position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 },
  editorBody: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800, margin: '0 auto' },
  editorCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 },
  bigTitle: { width: '100%', padding: '10px 0', border: 'none', borderBottom: '2px solid var(--border)', fontSize: 22, fontFamily: 'var(--font-serif)', fontWeight: 700, color: 'var(--text)', background: 'transparent', outline: 'none' },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 4 },
  input: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' },
  select: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', width: '100%', cursor: 'pointer', boxSizing: 'border-box' },
  etapeEditRow: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px dashed var(--border)' },
  addStepBtn: { width: '100%', padding: '8px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', marginTop: 6 },

  // Modale
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 },
  modal: { background: 'var(--surface)', borderRadius: 12, width: 700, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalFooter: { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' },
};

export default SOP;
