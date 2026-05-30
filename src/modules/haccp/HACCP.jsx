import React from 'react';
import { getDemoData, canManageModule } from '../../data/demoData.js';
import { alertLegacy, confirmLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { CTRL_TYPES, INITIAL_CONTROLS, INITIAL_CTRL_TPL, INITIAL_RELEVES, INITIAL_ZONES, ZONE_TYPES } from './HACCP.constants.js';
import { CtrlForm, ZoneForm } from './ZoneForms.jsx';
import ZoneTile from './ZoneTile.jsx';
import { hcfg, hs } from './HACCP.styles.js';
import { isReleveConforme, parseHaccpNumber } from './HACCP.utils.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { exportRowsToXlsx } from '../../utils/exportXlsx.js';
import BottomActionBar from '../../components/mobile/BottomActionBar.jsx';
import { FileDown, Plus } from 'lucide-react';


// ─────────────────────────────────────────────────────
// MODULE HACCP — Relevés · Contrôles hygiène · Config consultant
// ─────────────────────────────────────────────────────

const HACCP = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [zones, setZones]       = React.useState([]);
  const [ctrlTpls, setCtrlTpls] = React.useState([]);
  const [releves, setReleves]   = React.useState([]);
  const [controls, setControls] = React.useState([]);
  const [loading, setLoading]   = React.useState(true);

  const todayStr = new Date().toISOString().slice(0, 10);

  const [activeTab, setActiveTab] = React.useState('tableau');
  const [dateFilter, setDateFilter] = React.useState(todayStr);

  // Modals
  const [showReleve, setShowReleve]     = React.useState(false);
  const [showControl, setShowControl]   = React.useState(false);
  const [zoneModal, setZoneModal]       = React.useState(null);
  const [ctrlModal, setCtrlModal]       = React.useState(null);

  // Forms
  const [formRel, setFormRel]   = React.useState({ zoneId:'', date: todayStr, heure:'', valeur:'', commentaire:'' });
  const [formCtrl, setFormCtrl] = React.useState({ templateId:'', date: todayStr, heure:'', statut:'conforme', notes:'' });
  // ─── Saisie inline directement sur la tuile zone ───
  const [inlineReleve, setInlineReleve] = React.useState(null);
  const [inlineTempInput, setInlineTempInput] = React.useState('');

  // ─── Modale "Tout conforme" : saisie groupée matinale ───
  // Map zoneId → valeur saisie. Vide = zone à ignorer (pas de relevé créé).
  const [showQuickReleves, setShowQuickReleves] = React.useState(false);
  const [quickReleves, setQuickReleves] = React.useState({});
  const [quickSaving, setQuickSaving] = React.useState(false);

  const isConsultant = user.role === 'consultant';
  const canWrite = ['consultant', 'patron', 'resp_cuisine', 'cuisinier'].includes(user.role);
  const canManage = canManageModule(user.role, 'haccp');
  const sel = useSelection();
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // ═══ Chargement depuis Supabase + Realtime ═══
  React.useEffect(() => {
    if (!legacySB) {
      // Fallback : données initiales locales (au moins pour ne pas casser l'affichage)
      setZones(INITIAL_ZONES.filter(z => (z.etablissementId || 'etab-1') === etabId));
      setCtrlTpls(INITIAL_CTRL_TPL.filter(c => (c.etablissementId || 'etab-1') === etabId));
      setReleves(INITIAL_RELEVES);
      setControls(INITIAL_CONTROLS);
      setLoading(false);
      return;
    }

    let mounted = true;
    const unsubs = [];

    const reload = async () => {
      try {
        const [zs, ts, rs, cs] = await Promise.all([
          legacySB.db.listHaccpZones(etabId),
          legacySB.db.listHaccpTpls(etabId),
          legacySB.db.listHaccpReleves(etabId),
          legacySB.db.listHaccpControls(etabId),
        ]);
        if (!mounted) return;
        setZones(zs);
        setCtrlTpls(ts);
        setReleves(rs);
        setControls(cs);
      } catch (err) { console.error('[HACCP load]', err); }
      finally { if (mounted) setLoading(false); }
    };

    reload();

    unsubs.push(legacySB.realtime.subscribe('haccp_zones', reload));
    unsubs.push(legacySB.realtime.subscribe('haccp_ctrl_templates', reload));
    unsubs.push(legacySB.realtime.subscribe('haccp_releves', reload));
    unsubs.push(legacySB.realtime.subscribe('haccp_controls', reload));

    return () => { mounted = false; unsubs.forEach(u => u && u()); };
  }, [etabId]);

  // ─── Tendance par zone : moyenne des 7 derniers jours vs les 7 jours précédents ───
  // ATTENTION : ce useMemo DOIT être déclaré AVANT le early return `if (loading)`,
  // sinon React voit "1 hook de moins au premier render" et crash (error #310).
  // Tous les hooks doivent être appelés dans le même ordre à chaque render.
  const trendByZone = React.useMemo(() => {
    const byZone = {};
    const today = new Date();
    const ms14 = 14 * 24 * 3600 * 1000;
    const ms7 = 7 * 24 * 3600 * 1000;
    const cutoff14 = new Date(today.getTime() - ms14);
    const cutoff7 = new Date(today.getTime() - ms7);

    (zones || []).forEach(z => {
      const zReleves = releves.filter(r => r.zoneId === z.id);
      const recent = zReleves.filter(r => new Date(r.date + 'T12:00:00') >= cutoff7);
      const previous = zReleves.filter(r => {
        const d = new Date(r.date + 'T12:00:00');
        return d >= cutoff14 && d < cutoff7;
      });
      // Besoin de min. 2 mesures dans chaque période
      if (recent.length < 2 || previous.length < 2) {
        byZone[z.id] = null;
        return;
      }
      const avgRecent = recent.reduce((s, r) => s + (Number(r.valeur) || 0), 0) / recent.length;
      const avgPrev = previous.reduce((s, r) => s + (Number(r.valeur) || 0), 0) / previous.length;
      const delta = avgRecent - avgPrev;
      const seuilStable = 0.5;
      let direction;
      if (Math.abs(delta) < seuilStable) direction = 'stable';
      else direction = delta > 0 ? 'up' : 'down';
      byZone[z.id] = { direction, delta, avgRecent, avgPrev };
    });
    return byZone;
  }, [releves, zones]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  // Conformité centralisée dans HACCP.utils.js (gère virgules FR, minus Unicode, auto-swap min/max)
  const isConforme = isReleveConforme;

  const activeZones = zones.filter(z=>z.actif);
  const activeTpls  = ctrlTpls.filter(t=>t.actif);

  const anomalies   = releves.filter(r=>!r.conforme);
  const tauxConf    = releves.length > 0 ? Math.round(releves.filter(r=>r.conforme).length/releves.length*100) : 100;
  const todayReleves  = releves.filter(r=>r.date===dateFilter);
  const todayControls = controls.filter(c=>c.date===dateFilter);

  const latestByZone = {};
  (zones || []).forEach(z=>{
    const last = releves.filter(r=>r.zoneId===z.id).sort((a,b)=>b.date.localeCompare(a.date)||b.heure.localeCompare(a.heure))[0];
    latestByZone[z.id] = last||null;
  });

  const submitReleve = async () => {
    if (!formRel.valeur || !formRel.heure) { alertLegacy('Remplissez tous les champs obligatoires.'); return; }
    if (!formRel.zoneId) { alertLegacy('Sélectionnez une zone.'); return; }
    const zone = zones.find(z=>z.id===formRel.zoneId);
    const conforme = isConforme(zone, formRel.valeur);
    const newReleve = {
      etablissementId: etabId,
      zoneId: formRel.zoneId,
      date: formRel.date,
      heure: formRel.heure,
      valeur: parseHaccpNumber(formRel.valeur),
      operateur: user.id,
      conforme,
      commentaire: formRel.commentaire || '',
    };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertHaccpReleve(newReleve);
        setReleves(prev => [saved, ...prev]);
      } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    } else {
      setReleves([{ id: 'r' + Date.now(), ...newReleve }, ...releves]);
    }
    setShowReleve(false);
    setFormRel({ zoneId: activeZones[0]?.id || '', date: todayStr, heure:'', valeur:'', commentaire:'' });
  };

  const submitControl = async () => {
    if (!formCtrl.heure) { alertLegacy('Renseignez l\'heure.'); return; }
    if (!formCtrl.templateId) { alertLegacy('Sélectionnez un contrôle.'); return; }
    const newCtrl = {
      etablissementId: etabId,
      templateId: formCtrl.templateId,
      date: formCtrl.date,
      heure: formCtrl.heure,
      statut: formCtrl.statut,
      operateur: user.id,
      notes: formCtrl.notes,
    };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertHaccpControl(newCtrl);
        setControls(prev => [saved, ...prev]);
      } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    } else {
      setControls([{ id: 'ct' + Date.now(), ...newCtrl }, ...controls]);
    }
    setShowControl(false);
    setFormCtrl({ templateId: activeTpls[0]?.id || '', date: todayStr, heure:'', statut:'conforme', notes:'' });
  };

  const saveZone = async (z) => {
    const payload = { ...z, etablissementId: etabId };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertHaccpZone(payload);
        setZones(prev => prev.find(x => x.id === saved.id) ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]);
      } catch (err) { notifyLegacy('Erreur zone : ' + err.message, 'error'); return; }
    } else {
      setZones(prev => prev.find(x=>x.id===z.id) ? prev.map(x=>x.id===z.id?z:x) : [...prev,z]);
    }
    setZoneModal(null);
  };
  const deleteZone = async (id) => {
    if (!confirmLegacy('Supprimer cette zone ? Les relevés associés seront aussi supprimés.')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpZone(id); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setZones(prev=>prev.filter(z=>z.id!==id));
  };
  const saveCtrl = async (c) => {
    const payload = { ...c, etablissementId: etabId };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertHaccpTpl(payload);
        setCtrlTpls(prev => prev.find(x => x.id === saved.id) ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]);
      } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    } else {
      setCtrlTpls(prev=>prev.find(x=>x.id===c.id)?prev.map(x=>x.id===c.id?c:x):[...prev,c]);
    }
    setCtrlModal(null);
  };
  const deleteCtrl = async (id) => {
    if (!confirmLegacy('Supprimer ce contrôle ?')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpTpl(id); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setCtrlTpls(prev=>prev.filter(c=>c.id!==id));
  };

  const deleteReleve = async (id) => {
    if (!canManage) return;
    if (!confirmLegacy('Supprimer ce relevé ?')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpReleve(id); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setReleves(prev => prev.filter(r => r.id !== id));
  };

  // ─── Mode sélection : suppression et export Excel des relevés en lot ───
  const supprimerRelevesSelection = async () => {
    if (!canManage || sel.count === 0) return;
    if (!confirmLegacy(`Supprimer ${sel.count} relevé(s) ?`)) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of Array.from(sel.ids)) {
      if (legacySB) {
        try { await legacySB.db.deleteHaccpReleve(id); ok += 1; }
        catch (err) { console.error('[deleteHaccpReleve]', err); }
      } else { ok += 1; }
    }
    setReleves(prev => prev.filter(r => !sel.ids.has(r.id)));
    setBulkBusy(false);
    sel.exit();
    notifyLegacy(`${ok} relevé(s) supprimé(s).`, 'success');
  };

  const exporterRelevesSelection = async () => {
    const rows = (releves || []).filter(r => sel.ids.has(r.id));
    if (!rows.length) return;
    setBulkBusy(true);
    const headers = ['Zone', 'Date', 'Heure', 'Valeur', 'Opérateur', 'Statut', 'Commentaire'];
    const data = rows.map(r => {
      const zone = zones.find(z => z.id === r.zoneId);
      const op = demoData.utilisateurs.find(u => u.id === r.operateur);
      return [
        zone ? zone.nom : r.zoneId, r.date, r.heure,
        `${r.valeur}${zone ? (zone.unite || '') : ''}`,
        op ? `${op.prenom || ''} ${op.nom || ''}`.trim() : (r.operateur || ''),
        r.conforme ? 'Conforme' : 'Anomalie', r.commentaire || '',
      ];
    });
    try {
      await exportRowsToXlsx(`haccp-releves-${todayStr}.xlsx`, 'Relevés HACCP', headers, data, [22, 12, 8, 12, 22, 12, 32]);
      notifyLegacy(`${rows.length} relevé(s) exporté(s) en Excel.`, 'success');
    } catch (err) {
      notifyLegacy('Erreur export : ' + err.message, 'error');
    }
    setBulkBusy(false);
  };
  const deleteControlRecord = async (id) => {
    if (!canManage) return;
    if (!confirmLegacy('Supprimer ce contrôle enregistré ?')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpControl(id); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setControls(prev => prev.filter(c => c.id !== id));
  };

  // ─── Saisie inline directement sur la tuile (states définis plus haut) ───

  const submitInlineReleve = async (zone, valeur) => {
    const parsed = parseHaccpNumber(valeur);
    if (Number.isNaN(parsed)) return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const heure = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const conforme = isConforme(zone, valeur);
    const newReleve = {
      etablissementId: etabId, zoneId: zone.id,
      date: today, heure, valeur: parsed,
      operateur: user.id, conforme, commentaire: '',
    };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertHaccpReleve(newReleve);
        setReleves(prev => [saved, ...prev]);
      } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    } else {
      setReleves(prev => [{ id: 'r' + Date.now(), ...newReleve }, ...prev]);
    }
    setInlineReleve(null);
    setInlineTempInput('');
  };

  // ─── Sauvegarde groupée des relevés "Tout conforme" ───
  // Crée un relevé par zone qui a une valeur saisie. Les zones sans valeur
  // sont ignorées (pas de relevé créé). Une seule transaction visuelle pour
  // l'opérateur, mais N appels Supabase séparés.
  const saveQuickReleves = async () => {
    const entries = Object.entries(quickReleves).filter(([_, v]) =>
      v !== '' && v != null && !Number.isNaN(parseHaccpNumber(v))
    );
    if (entries.length === 0) {
      notifyLegacy('Aucune valeur saisie', 'warning');
      return;
    }
    setQuickSaving(true);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const heure = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const created = [];
    const errors = [];
    let nbAnomalies = 0;

    for (const [zoneId, raw] of entries) {
      const zone = zones.find(z => z.id === zoneId);
      if (!zone) continue;
      const valeur = parseHaccpNumber(raw);
      const conforme = isConforme(zone, raw);
      if (!conforme) nbAnomalies++;
      const newReleve = {
        etablissementId: etabId,
        zoneId: zone.id,
        date: today,
        heure,
        valeur,
        operateur: user.id,
        conforme,
        commentaire: '',
      };
      if (legacySB) {
        try {
          const saved = await legacySB.db.upsertHaccpReleve(newReleve);
          created.push(saved);
        } catch (err) {
          errors.push(zone.nom);
          console.error('[saveQuickReleves]', zone.nom, err);
        }
      } else {
        created.push({ id: 'r' + Date.now() + Math.random(), ...newReleve });
      }
    }

    setReleves(prev => [...created, ...prev]);
    setQuickSaving(false);
    setShowQuickReleves(false);
    setQuickReleves({});

    // Feedback
    if (errors.length > 0) {
      notifyLegacy(`⚠ ${created.length} relevés enregistrés, ${errors.length} en erreur`, 'warning');
    } else if (nbAnomalies > 0) {
      notifyLegacy(`✓ ${created.length} relevés enregistrés (${nbAnomalies} anomalie${nbAnomalies > 1 ? 's' : ''})`, 'warning');
    } else {
      notifyLegacy(`✓ ${created.length} relevé${created.length > 1 ? 's' : ''} conforme${created.length > 1 ? 's' : ''} enregistré${created.length > 1 ? 's' : ''}`, 'success');
    }
  };

  const tabs = [
    {id:'tableau',   l:'Tableau de bord'},
    {id:'releves',   l:'Relevés température'},
    {id:'controles', l:'Contrôles hygiène'},
    ...(isConsultant ? [{id:'config', l:'✦ Paramètres'}] : []),
  ];

  return (
    <div style={hs.root}>
      {/* Toolbar */}
      <div style={hs.toolbar}>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {tabs.map(t=>(
            <button key={t.id} style={{...hs.tab, ...(activeTab===t.id?hs.tabActive:{}), ...(t.id==='config'?{color:activeTab==='config'?'#fff':'var(--accent)',borderColor:'var(--accent)'}:{})}} onClick={()=>setActiveTab(t.id)}>{t.l}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}} className="desktop-toolbar">
          {activeTab!=='config' && <input type="date" style={hs.datePicker} value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/>}
          {activeTab==='releves'   && <button style={hs.addBtn} onClick={()=>setShowReleve(true)}>+ Nouveau relevé</button>}
          {activeTab==='controles' && <button style={hs.addBtn} onClick={()=>setShowControl(true)}>+ Enregistrer contrôle</button>}
          {activeTab==='config' && isConsultant && (
            <>
              <button style={hs.addBtn} onClick={()=>setZoneModal('new')}>+ Ajouter zone</button>
              <button style={{...hs.addBtn,background:'var(--nav)'}} onClick={()=>setCtrlModal('new')}>+ Ajouter contrôle</button>
            </>
          )}
          <button style={hs.exportBtn} onClick={()=>pdfUtils?.printElement(activeTab==='releves' ? 'haccp-releves-print' : activeTab==='controles' ? 'haccp-controls-print' : 'haccp-dashboard-print', 'Registre HACCP')}>🖨 Imprimer</button>
          <button style={hs.exportBtn} onClick={()=>pdfUtils?.exportElementToPdf(activeTab==='releves' ? 'haccp-releves-print' : activeTab==='controles' ? 'haccp-controls-print' : 'haccp-dashboard-print', 'registre-haccp.pdf')}>⬇ PDF</button>
        </div>
      </div>

      {/* ── TABLEAU DE BORD ── */}
      {activeTab==='tableau' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}} id="haccp-dashboard-print">
          <div style={hs.kpiRow}>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Taux de conformité</div><div style={{...hs.kpiVal,color:tauxConf>=95?'var(--success-text)':tauxConf>=80?'var(--warning-strong)':'var(--danger-strong)'}}>{tauxConf}%</div></div>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Zones actives</div><div style={hs.kpiVal}>{activeZones.length}</div></div>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Relevés total</div><div style={hs.kpiVal}>{releves.length}</div></div>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Anomalies</div><div style={{...hs.kpiVal,color:(anomalies || []).length>0?'var(--danger-strong)':'var(--success-text)'}}>{(anomalies || []).length}</div></div>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Contrôles aujourd'hui</div><div style={hs.kpiVal}>{todayControls.length}</div></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={hs.sectionTitle}>État actuel des zones</div>
            {canWrite && activeZones.length > 0 && (
              <button
                style={hs.quickBtn}
                onClick={() => {
                  // Préremplir avec les valeurs cibles (cible = température normale de la zone)
                  const initial = {};
                  activeZones.forEach(z => {
                    if (z.cible != null && z.cible !== '') initial[z.id] = String(z.cible);
                  });
                  setQuickReleves(initial);
                  setShowQuickReleves(true);
                }}
                title="Saisir rapidement les températures de toutes les zones"
              >
                ✓ Tout conforme — saisie rapide
              </button>
            )}
          </div>
          <div style={hs.zoneGrid}>{(activeZones || []).map(z=><ZoneTile key={z.id} zone={z} last={latestByZone[z.id]} trend={trendByZone[z.id]} inlineReleve={inlineReleve} inlineTempInput={inlineTempInput} canWrite={canWrite} setInlineReleve={setInlineReleve} setInlineTempInput={setInlineTempInput} submitInlineReleve={submitInlineReleve}/>)}</div>
          {(anomalies || []).length>0&&(
            <div style={hs.anomCard}>
              <div style={hs.anomHeader}>⚠ Anomalies enregistrées</div>
              {(anomalies || []).map(a=>{
                const zone=zones.find(z=>z.id===a.zoneId);
                const op=demoData.utilisateurs.find(u=>u.id===a.operateur);
                return(
                  <div key={a.id} style={hs.anomRow}>
                    <div style={hs.anomIcon}>{zone?.icone}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{zone?.nom}</div>
                      <div style={{fontSize:11,color:'var(--text2)'}}>{a.date} à {a.heure} · {op?.prenom} {op?.nom}</div>
                      {a.commentaire&&<div style={{fontSize:12,color:'var(--danger-strong)',marginTop:2}}>{a.commentaire}</div>}
                    </div>
                    <div style={{fontSize:20,fontWeight:700,color:'var(--danger-strong)',fontFamily:'var(--font-serif)'}}>{a.valeur}{zone?.unite}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── RELEVÉS ── */}
      {activeTab==='releves' && (
        <div style={{display:'flex',flexDirection:'column',gap:12}} id="haccp-releves-print">
          <div style={hs.zoneGrid}>{(activeZones || []).map(z=><ZoneTile key={z.id} zone={z} last={latestByZone[z.id]} trend={trendByZone[z.id]} inlineReleve={inlineReleve} inlineTempInput={inlineTempInput} canWrite={canWrite} setInlineReleve={setInlineReleve} setInlineTempInput={setInlineTempInput} submitInlineReleve={submitInlineReleve}/>)}</div>
          {canManage && !sel.active && todayReleves.length > 0 && (
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={sel.enter}
                style={{ padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >☑ Sélectionner</button>
            </div>
          )}
          {sel.active && (
            <SelectionToolbar
              count={sel.count}
              total={todayReleves.length}
              allSelected={sel.count > 0 && sel.count === todayReleves.length}
              onToggleAll={() => (sel.count === todayReleves.length ? sel.clear() : sel.selectAll(todayReleves.map(r => r.id)))}
              onDelete={supprimerRelevesSelection}
              onExport={exporterRelevesSelection}
              exportLabel="⬇ Exporter Excel"
              onCancel={sel.exit}
              busy={bulkBusy}
            />
          )}
          <div style={hs.tableCard}>
            <div style={hs.tableCardHeader}>Relevés du {new Date(dateFilter+'T12:00:00').toLocaleDateString('fr-CH',{weekday:'long',day:'numeric',month:'long'})}</div>
            {todayReleves.length===0&&<div style={hs.empty}>Aucun relevé pour cette date.</div>}
            <div style={hs.relHead}>{sel.active && <span className="no-print" style={{ flex: '0 0 28px' }} />}<span>Zone</span><span>Heure</span><span style={{textAlign:'right'}}>Valeur</span><span>Opérateur</span><span>Statut</span><span style={{flex:2}}>Commentaire</span>{canManage && <span className="no-print">Action</span>}</div>
            {(todayReleves || []).map(r=>{
              const zone=zones.find(z=>z.id===r.zoneId);
              const op=demoData.utilisateurs.find(u=>u.id===r.operateur);
              return(
                <div key={r.id} style={{...hs.relRow, ...(sel.active && sel.isSelected(r.id) ? { background: 'var(--bg)' } : {})}}>
                  {sel.active && (
                    <span className="no-print" style={{ flex: '0 0 28px', display: 'flex', alignItems: 'center' }}>
                      <input type="checkbox" checked={sel.isSelected(r.id)} onChange={() => sel.toggle(r.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    </span>
                  )}
                  <span style={{fontSize:13,fontWeight:600}}>{zone?.icone} {zone?.nom}</span>
                  <span style={hs.cell}>{r.heure}</span>
                  <span style={{...hs.cell,textAlign:'right',fontWeight:700,color:r.conforme?'var(--success-text)':'var(--danger-strong)',fontSize:15,fontFamily:'var(--font-serif)'}}>{r.valeur}{zone?.unite}</span>
                  <span style={hs.cell}>{op?.prenom} {op?.nom}</span>
                  <span><span style={{...hs.confBadge,background:r.conforme?'var(--success-bg)':'var(--danger-bg)',color:r.conforme?'var(--success-text)':'var(--danger-strong)'}}>{r.conforme?'✓ OK':'✕ Anomalie'}</span></span>
                  <span style={{...hs.cell,flex:2,color:r.commentaire?'var(--danger-strong)':'var(--text2)',fontSize:12}}>{r.commentaire||'—'}</span>
                  {canManage && <span className="no-print"><button style={hcfg.deleteBtn} onClick={()=>deleteReleve(r.id)}>Supprimer</button></span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CONTRÔLES ── */}
      {activeTab==='controles' && (
        <div style={{display:'flex',flexDirection:'column',gap:12}} id="haccp-controls-print">
          <div style={hs.tableCard}>
            <div style={hs.tableCardHeader}>Contrôles — {new Date(dateFilter+'T12:00:00').toLocaleDateString('fr-CH',{weekday:'long',day:'numeric',month:'long'})}</div>
            <div style={{padding:'12px 18px',display:'flex',flexDirection:'column',gap:8}}>
              {(activeTpls || []).map(tpl=>{
                const done=todayControls.find(c=>c.templateId===tpl.id);
                return(
                  <div key={tpl.id} style={{...hs.ctrlRow,background:done?(done.statut==='conforme'?'var(--success-bg-soft)':'var(--danger-bg-soft)'):'var(--bg)',border:`1px solid ${done?(done.statut==='conforme'?'var(--success-bd)':'var(--danger-bd)'):'var(--border)'}`}}>
                    <div style={{...hs.ctrlCheck,background:done?(done.statut==='conforme'?'var(--success-text)':'var(--danger-strong)'):'var(--border)'}}>{done?(done.statut==='conforme'?'✓':'✕'):''}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{tpl.label}</div>
                      <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>{tpl.frequence} · {CTRL_TYPES.find(t=>t.id===tpl.type)?.label}</div>
                      {tpl.description&&<div style={{fontSize:11,color:'var(--text2)',marginTop:2,fontStyle:'italic'}}>{tpl.description}</div>}
                      {done?.notes&&<div style={{fontSize:11,color:done.statut==='conforme'?'var(--text2)':'var(--danger-strong)',marginTop:3,fontStyle:'italic'}}>{done.notes}</div>}
                    </div>
                    {done?(
                      <div style={{textAlign:'right'}}>
                        <div style={{...hs.confBadge,background:done.statut==='conforme'?'var(--success-bg)':'var(--danger-bg)',color:done.statut==='conforme'?'var(--success-text)':'var(--danger-strong)'}}>{done.statut==='conforme'?'Conforme':'Non conforme'}</div>
                        <div style={{fontSize:10,color:'var(--text2)',marginTop:3}}>{done.heure}</div>
                      </div>
                    ):(
                      <button style={hs.doBtn} onClick={()=>{setFormCtrl({...formCtrl,templateId:tpl.id});setShowControl(true);}}>Enregistrer</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={hs.tableCard}>
            <div style={hs.tableCardHeader}>Historique complet</div>
            <div style={hs.relHead}><span style={{flex:2}}>Contrôle</span><span>Date</span><span>Heure</span><span>Opérateur</span><span>Statut</span><span style={{flex:2}}>Notes</span>{canManage && <span className='no-print'>Action</span>}</div>
            {controls.map(c=>{
              const tpl=ctrlTpls.find(t=>t.id===c.templateId);
              const op=demoData.utilisateurs.find(u=>u.id===c.operateur);
              return(
                <div key={c.id} style={hs.relRow}>
                  <span style={{...hs.cell,flex:2,fontWeight:600}}>{tpl?.label}</span>
                  <span style={hs.cell}>{c.date}</span>
                  <span style={hs.cell}>{c.heure}</span>
                  <span style={hs.cell}>{op?.prenom} {op?.nom}</span>
                  <span><span style={{...hs.confBadge,background:c.statut==='conforme'?'var(--success-bg)':'var(--danger-bg)',color:c.statut==='conforme'?'var(--success-text)':'var(--danger-strong)'}}>{c.statut==='conforme'?'✓ Conforme':'✕ Non conforme'}</span></span>
                  <span style={{...hs.cell,flex:2,fontSize:12,color:'var(--text2)'}}>{c.notes||'—'}</span>
                  {canManage && <span className='no-print'><button style={hcfg.deleteBtn} onClick={()=>deleteControlRecord(c.id)}>Supprimer</button></span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CONFIG CONSULTANT ── */}
      {activeTab==='config' && isConsultant && (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          {/* Banner */}
          <div style={{background:'linear-gradient(135deg,var(--nav) 0%,#1a0f00 100%)',borderRadius:10,padding:'16px 20px',display:'flex',alignItems:'center',gap:14}}>
            <span style={{fontSize:28}}>⚙</span>
            <div>
              <div style={{color:'#fff',fontWeight:700,fontSize:15,fontFamily:'var(--font-serif)'}}>Configuration HACCP — Réservé au consultant</div>
              <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginTop:3}}>Gérez les zones de contrôle et les contrôles d'hygiène de l'établissement. Ces paramètres s'appliquent à toute l'équipe.</div>
            </div>
          </div>

          {/* Zones */}
          <div style={hcfg.section}>
            <div style={hcfg.sectionHeader}>
              <div>
                <div style={hcfg.sectionTitle}>Zones & équipements</div>
                <div style={hcfg.sectionSub}>{zones.length} zone{zones.length>1?'s':''} configurée{zones.length>1?'s':''} · {activeZones.length} active{activeZones.length>1?'s':''}</div>
              </div>
              <button style={hs.addBtn} onClick={()=>setZoneModal('new')}>+ Ajouter une zone</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {zones.map(z=>(
                <div key={z.id} style={{...hcfg.row, opacity:z.actif?1:0.5}}>
                  <div style={hcfg.rowIcon}>{z.icone}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)',display:'flex',alignItems:'center',gap:8}}>
                      {z.nom}
                      {!z.actif && <span style={{fontSize:10,fontWeight:600,background:'#f1f5f9',color:'var(--text2)',padding:'2px 7px',borderRadius:10}}>Inactif</span>}
                    </div>
                    <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>
                      {ZONE_TYPES.find(t=>t.id===z.type)?.label} · Cible : {z.cible}{z.unite} · Plage : [{z.min??'—'} ; {z.max??'+∞'}]{z.unite}
                    </div>
                  </div>
                  {/* Toggle actif */}
                  <div style={{...hcfg.toggle,background:z.actif?'var(--accent)':'var(--border)'}}
                    onClick={()=>setZones(prev=>prev.map(x=>x.id===z.id?{...x,actif:!x.actif}:x))}>
                    <div style={{...hcfg.toggleThumb,left:z.actif?'calc(100% - 20px)':'2px'}}/>
                  </div>
                  <button style={hcfg.editBtn} onClick={()=>setZoneModal(z)}>Modifier</button>
                  <button style={hcfg.deleteBtn} onClick={()=>deleteZone(z.id)}>Supprimer</button>
                </div>
              ))}
            </div>
          </div>

          {/* Contrôles templates */}
          <div style={hcfg.section}>
            <div style={hcfg.sectionHeader}>
              <div>
                <div style={hcfg.sectionTitle}>Contrôles d'hygiène</div>
                <div style={hcfg.sectionSub}>{ctrlTpls.length} contrôle{ctrlTpls.length>1?'s':''} configuré{ctrlTpls.length>1?'s':''} · {activeTpls.length} actif{activeTpls.length>1?'s':''}</div>
              </div>
              <button style={{...hs.addBtn,background:'var(--nav)'}} onClick={()=>setCtrlModal('new')}>+ Ajouter un contrôle</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {ctrlTpls.map(c=>(
                <div key={c.id} style={{...hcfg.row,opacity:c.actif?1:0.5}}>
                  <div style={{...hcfg.rowIcon,fontSize:16,background:'var(--bg)',color:'var(--text2)'}}>{CTRL_TYPES.find(t=>t.id===c.type)?.label.slice(0,1)||'?'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)',display:'flex',alignItems:'center',gap:8}}>
                      {c.label}
                      {!c.actif&&<span style={{fontSize:10,fontWeight:600,background:'#f1f5f9',color:'var(--text2)',padding:'2px 7px',borderRadius:10}}>Inactif</span>}
                    </div>
                    <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>
                      {CTRL_TYPES.find(t=>t.id===c.type)?.label} · {c.frequence}
                      {c.description&&<span> · <em>{c.description.slice(0,60)}{c.description.length>60?'…':''}</em></span>}
                    </div>
                  </div>
                  <div style={{...hcfg.toggle,background:c.actif?'var(--accent)':'var(--border)'}}
                    onClick={()=>setCtrlTpls(prev=>prev.map(x=>x.id===c.id?{...x,actif:!x.actif}:x))}>
                    <div style={{...hcfg.toggleThumb,left:c.actif?'calc(100% - 20px)':'2px'}}/>
                  </div>
                  <button style={hcfg.editBtn} onClick={()=>setCtrlModal(c)}>Modifier</button>
                  <button style={hcfg.deleteBtn} onClick={()=>deleteCtrl(c.id)}>Supprimer</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RELEVÉ ── */}
      {showReleve&&(
        <div className="modal-sheet-overlay" style={hs.overlay} onClick={()=>setShowReleve(false)}>
          <div className="modal-sheet" style={hs.modal} onClick={e=>e.stopPropagation()}>
            <div style={hs.modalHeader}><div style={hs.modalTitle}>Nouveau relevé de température</div><button style={hs.closeBtn} onClick={()=>setShowReleve(false)}>✕</button></div>
            <div style={hs.modalBody}>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Zone / Équipement</label>
                  <select style={hs.fInput} value={formRel.zoneId} onChange={e=>setFormRel({...formRel,zoneId:e.target.value})}>
                    {(activeZones || []).map(z=><option key={z.id} value={z.id}>{z.icone} {z.nom}</option>)}
                  </select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div style={hs.field}><label style={hs.fLabel}>Date</label><input type="date" style={hs.fInput} value={formRel.date} onChange={e=>setFormRel({...formRel,date:e.target.value})}/></div>
                  <div style={hs.field}><label style={hs.fLabel}>Heure *</label><input type="time" style={hs.fInput} value={formRel.heure} onChange={e=>setFormRel({...formRel,heure:e.target.value})}/></div>
                </div>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Valeur mesurée * ({zones.find(z=>z.id===formRel.zoneId)?.unite})</label>
                  <input type="number" step="0.1" style={{...hs.fInput,fontSize:22,fontWeight:700,textAlign:'center',color:'var(--accent)'}}
                    placeholder={`Cible : ${zones.find(z=>z.id===formRel.zoneId)?.cible}${zones.find(z=>z.id===formRel.zoneId)?.unite}`}
                    value={formRel.valeur} onChange={e=>setFormRel({...formRel,valeur:e.target.value})}/>
                  {formRel.valeur!==''&&(()=>{
                    const zone=zones.find(z=>z.id===formRel.zoneId);
                    const ok=isConforme(zone,formRel.valeur);
                    return<div style={{marginTop:8,padding:'8px 12px',borderRadius:8,background:ok?'var(--success-bg)':'var(--danger-bg)',color:ok?'var(--success-text)':'var(--danger-strong)',fontSize:13,fontWeight:600,textAlign:'center'}}>
                      {ok?`✓ Conforme — plage autorisée : [${zone.min??'—'} ; ${zone.max??'+∞'}]${zone.unite}`:`✕ Hors plage — [${zone.min??'—'} ; ${zone.max??'+∞'}]${zone.unite}`}
                    </div>;
                  })()}
                </div>
                <div style={hs.field}><label style={hs.fLabel}>Commentaire / action corrective</label><textarea style={{...hs.fInput,resize:'vertical',minHeight:60}} value={formRel.commentaire} onChange={e=>setFormRel({...formRel,commentaire:e.target.value})}/></div>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
                <button style={hs.cancelBtn} onClick={()=>setShowReleve(false)}>Annuler</button>
                <button style={hs.saveBtn} onClick={submitReleve}>Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONTRÔLE ── */}
      {showControl&&(
        <div className="modal-sheet-overlay" style={hs.overlay} onClick={()=>setShowControl(false)}>
          <div className="modal-sheet" style={hs.modal} onClick={e=>e.stopPropagation()}>
            <div style={hs.modalHeader}><div style={hs.modalTitle}>Enregistrer un contrôle</div><button style={hs.closeBtn} onClick={()=>setShowControl(false)}>✕</button></div>
            <div style={hs.modalBody}>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Type de contrôle</label>
                  <select style={hs.fInput} value={formCtrl.templateId} onChange={e=>setFormCtrl({...formCtrl,templateId:e.target.value})}>
                    {(activeTpls || []).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div style={hs.field}><label style={hs.fLabel}>Date</label><input type="date" style={hs.fInput} value={formCtrl.date} onChange={e=>setFormCtrl({...formCtrl,date:e.target.value})}/></div>
                  <div style={hs.field}><label style={hs.fLabel}>Heure *</label><input type="time" style={hs.fInput} value={formCtrl.heure} onChange={e=>setFormCtrl({...formCtrl,heure:e.target.value})}/></div>
                </div>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Résultat</label>
                  <div style={{display:'flex',gap:8}}>
                    {['conforme','non-conforme'].map(s=>(
                      <button key={s} onClick={()=>setFormCtrl({...formCtrl,statut:s})} style={{flex:1,padding:'10px',border:`2px solid ${formCtrl.statut===s?(s==='conforme'?'var(--success-text)':'var(--danger-strong)'):'var(--border)'}`,borderRadius:8,background:formCtrl.statut===s?(s==='conforme'?'var(--success-bg)':'var(--danger-bg)'):'var(--surface)',color:formCtrl.statut===s?(s==='conforme'?'var(--success-text)':'var(--danger-strong)'):'var(--text2)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'}}>
                        {s==='conforme'?'✓ Conforme':'✕ Non conforme'}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={hs.field}><label style={hs.fLabel}>Notes / actions correctives</label><textarea style={{...hs.fInput,resize:'vertical',minHeight:70}} value={formCtrl.notes} onChange={e=>setFormCtrl({...formCtrl,notes:e.target.value})}/></div>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
                <button style={hs.cancelBtn} onClick={()=>setShowControl(false)}>Annuler</button>
                <button style={hs.saveBtn} onClick={submitControl}>Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zone add/edit */}
      {zoneModal && <ZoneForm zone={zoneModal==='new'?null:zoneModal} onSave={saveZone} onCancel={()=>setZoneModal(null)}/>}
      {ctrlModal && <CtrlForm ctrl={ctrlModal==='new'?null:ctrlModal} onSave={saveCtrl} onCancel={()=>setCtrlModal(null)}/>}

      {/* ─── Modale "Tout conforme" — saisie groupée des relevés ─── */}
      {showQuickReleves && (
        <div className="modal-full-overlay" style={hs.qrOverlay} onClick={() => !quickSaving && setShowQuickReleves(false)}>
          <div className="modal-full" style={hs.qrModal} onClick={e => e.stopPropagation()}>
            <div style={hs.qrHeader}>
              <div>
                <div style={hs.qrTitle}>✓ Saisie rapide des relevés</div>
                <div style={hs.qrSubtitle}>
                  Saisissez les températures pour toutes les zones d'un coup. Les valeurs cibles sont pré-remplies — modifiez ce qui doit l'être, laissez vide pour ignorer.
                </div>
              </div>
              <button style={hs.qrCloseBtn} onClick={() => !quickSaving && setShowQuickReleves(false)}>✕</button>
            </div>

            <div style={hs.qrBody}>
              {(activeZones || []).map(zone => {
                const valStr = quickReleves[zone.id] ?? '';
                const valNum = parseFloat(valStr);
                const hasVal = valStr !== '' && !isNaN(valNum);
                const conf = hasVal ? isConforme(zone, valNum) : null;
                return (
                  <div key={zone.id} style={{
                    ...hs.qrZoneRow,
                    background: !hasVal ? 'var(--bg)'
                              : conf ? 'var(--success-bg-soft)'
                              : 'var(--danger-bg-soft)',
                    borderColor: !hasVal ? 'var(--border)'
                               : conf ? 'var(--success-bd)'
                               : 'var(--danger-bd)',
                  }}>
                    <span style={{ fontSize: 22 }}>{zone.icone}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{zone.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                        Cible : {zone.cible}{zone.unite || '°C'}
                        {(zone.min != null && zone.max != null) && ` · plage ${zone.min} → ${zone.max}${zone.unite || '°C'}`}
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      value={valStr}
                      onChange={e => setQuickReleves(prev => ({ ...prev, [zone.id]: e.target.value }))}
                      placeholder={String(zone.cible ?? '')}
                      disabled={quickSaving}
                      style={hs.qrInput}
                    />
                    <span style={{
                      fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: 'center',
                      color: !hasVal ? 'var(--text2)'
                           : conf ? 'var(--success-text)'
                           : 'var(--danger-strong)',
                    }}>
                      {!hasVal ? '—' : conf ? '✓' : '⚠'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={hs.qrFooter}>
              <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>
                {(() => {
                  const filled = Object.values(quickReleves).filter(v => v !== '' && v != null && !isNaN(parseFloat(v))).length;
                  return `${filled} / ${activeZones.length} zone${activeZones.length > 1 ? 's' : ''} renseignée${filled > 1 ? 's' : ''}`;
                })()}
              </span>
              <button style={hs.qrGhostBtn} onClick={() => setShowQuickReleves(false)} disabled={quickSaving}>Annuler</button>
              <button style={hs.qrPrimaryBtn} onClick={saveQuickReleves} disabled={quickSaving}>
                {quickSaving ? '⏳ Enregistrement…' : '✓ Enregistrer les relevés'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomActionBar
        actions={[
          { label: 'Export PDF', icon: FileDown, onClick: () => pdfUtils?.exportElementToPdf(activeTab==='releves' ? 'haccp-releves-print' : activeTab==='controles' ? 'haccp-controls-print' : 'haccp-dashboard-print', 'registre-haccp.pdf') },
        ]}
        primaryAction={
          activeTab==='releves'   ? { label: 'Nouveau relevé', icon: Plus, onClick: () => setShowReleve(true) } :
          activeTab==='controles' ? { label: 'Enregistrer contrôle', icon: Plus, onClick: () => setShowControl(true) } :
          activeTab==='config' && isConsultant ? { label: 'Ajouter zone', icon: Plus, onClick: () => setZoneModal('new') } :
          null
        }
      />
    </div>
  );
};

// ─── Styles ───

export default HACCP;
