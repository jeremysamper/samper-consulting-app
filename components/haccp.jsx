
// ─────────────────────────────────────────────────────
// MODULE HACCP — Relevés · Contrôles hygiène · Config consultant
// ─────────────────────────────────────────────────────

const ZONE_TYPES = [
  { id:'froid',   label:'Froid positif',  icones:['❄','🧊','🏪'] },
  { id:'negatif', label:'Froid négatif',  icones:['🧊','❄','🔵'] },
  { id:'chaud',   label:'Chaud / cuisson',icones:['🔥','🍲','♨'] },
  { id:'hygiene', label:'Hygiène',        icones:['🧼','🚿','💧'] },
  { id:'friture', label:'Friture',        icones:['🍟','🫕','🔥'] },
  { id:'four',    label:'Four',           icones:['🟠','🔴','♨'] },
  { id:'custom',  label:'Personnalisé',   icones:['⬡','◎','◉'] },
];

const CTRL_TYPES = [
  { id:'temperature', label:'Température' },
  { id:'hygiene',     label:'Hygiène / nettoyage' },
  { id:'reception',   label:'Réception marchandises' },
  { id:'dlc',         label:'DLC / DLUO' },
  { id:'personnel',   label:'Personnel' },
  { id:'equipement',  label:'Équipement' },
  { id:'custom',      label:'Autre' },
];

const FREQ_OPTIONS = [
  'À chaque livraison','Avant chaque service','Après chaque service',
  '2× / jour','Quotidien','Hebdomadaire','Mensuel','Sur demande',
];

const INITIAL_ZONES = [
  { id:'z1', nom:'Chambre froide positive 1', type:'froid',   cible:4,   min:0,   max:6,   unite:'°C', icone:'❄', actif:true },
  { id:'z2', nom:'Chambre froide positive 2', type:'froid',   cible:3,   min:0,   max:6,   unite:'°C', icone:'❄', actif:true },
  { id:'z3', nom:'Chambre froide négative',   type:'negatif', cible:-18, min:-22, max:-15, unite:'°C', icone:'🧊', actif:true },
  { id:'z4', nom:'Zone de préparation chaude',type:'chaud',   cible:75,  min:63,  max:null,unite:'°C', icone:'🔥', actif:true },
  { id:'z5', nom:'Bain-marie service',        type:'chaud',   cible:65,  min:63,  max:null,unite:'°C', icone:'🍲', actif:true },
  { id:'z6', nom:'Lave-vaisselle (rinçage)', type:'hygiene',  cible:85,  min:82,  max:null,unite:'°C', icone:'🧼', actif:true },
];

const INITIAL_CTRL_TPL = [
  { id:'c1', label:'Réception marchandises',              frequence:'À chaque livraison',   type:'reception',   actif:true },
  { id:'c2', label:'Contrôle température avant service',  frequence:'Avant chaque service', type:'temperature', actif:true },
  { id:'c3', label:'Nettoyage & désinfection surfaces',   frequence:'Quotidien',            type:'hygiene',     actif:true },
  { id:'c4', label:'Contrôle DLC / DLUO produits',        frequence:'Quotidien',            type:'dlc',         actif:true },
  { id:'c5', nom:'Vérification chaîne du froid',          frequence:'2× / jour',            type:'temperature', actif:true, label:'Vérification chaîne du froid' },
  { id:'c6', label:'Hygiène du personnel',                frequence:'Début de service',     type:'personnel',   actif:true },
];

const INITIAL_RELEVES = [
  { id:'r1', zoneId:'z1', date:'2026-04-21', heure:'07:15', valeur:3.8,   operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r2', zoneId:'z2', date:'2026-04-21', heure:'07:15', valeur:4.2,   operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r3', zoneId:'z3', date:'2026-04-21', heure:'07:15', valeur:-19.1, operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r4', zoneId:'z5', date:'2026-04-21', heure:'11:45', valeur:67.0,  operateur:'u3', conforme:true,  commentaire:'' },
  { id:'r5', zoneId:'z1', date:'2026-04-20', heure:'07:10', valeur:7.2,   operateur:'u6', conforme:false, commentaire:'Alerte — porte mal fermée, corrigé immédiatement' },
  { id:'r6', zoneId:'z2', date:'2026-04-20', heure:'07:10', valeur:5.1,   operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r7', zoneId:'z3', date:'2026-04-20', heure:'07:10', valeur:-18.3, operateur:'u6', conforme:true,  commentaire:'' },
  { id:'r8', zoneId:'z5', date:'2026-04-20', heure:'18:30', valeur:64.0,  operateur:'u4', conforme:true,  commentaire:'' },
  { id:'r9', zoneId:'z6', date:'2026-04-20', heure:'09:00', valeur:83.5,  operateur:'u3', conforme:true,  commentaire:'' },
];

const INITIAL_CONTROLS = [
  { id:'ct1', templateId:'c1', date:'2026-04-21', heure:'08:00', operateur:'u3', statut:'conforme',     notes:'Livraison Metro — températures OK à réception' },
  { id:'ct2', templateId:'c3', date:'2026-04-21', heure:'14:00', operateur:'u6', statut:'conforme',     notes:'' },
  { id:'ct3', templateId:'c4', date:'2026-04-21', heure:'07:30', operateur:'u3', statut:'conforme',     notes:'' },
  { id:'ct4', templateId:'c2', date:'2026-04-20', heure:'11:30', operateur:'u4', statut:'non-conforme', notes:'Bain-marie à 61°C — réglage effectué, refait le contrôle à 12h (OK)' },
  { id:'ct5', templateId:'c5', date:'2026-04-20', heure:'07:15', operateur:'u6', statut:'conforme',     notes:'' },
  { id:'ct6', templateId:'c6', date:'2026-04-21', heure:'09:00', operateur:'u3', statut:'conforme',     notes:'' },
];

// ─── Formulaire zone (add/edit) ───
const ZoneForm = ({ zone, onSave, onCancel }) => {
  const [f, setF] = React.useState(zone || { nom:'', type:'froid', cible:'', min:'', max:'', unite:'°C', icone:'❄', actif:true });
  const typeInfo = ZONE_TYPES.find(t=>t.id===f.type) || ZONE_TYPES[0];

  const handleSave = () => {
    if (!f.nom.trim() || f.cible === '') { alert('Nom et température cible obligatoires.'); return; }
    onSave({
      ...f,
      id: f.id || 'z'+Date.now(),
      cible: parseFloat(f.cible),
      min: f.min !== '' ? parseFloat(f.min) : null,
      max: f.max !== '' ? parseFloat(f.max) : null,
    });
  };

  return (
    <div style={hs.overlay} onClick={onCancel}>
      <div style={{...hs.modal, width:520}} onClick={e=>e.stopPropagation()}>
        <div style={hs.modalHeader}>
          <div style={hs.modalTitle}>{zone?.id ? 'Modifier la zone' : 'Ajouter une zone'}</div>
          <button style={hs.closeBtn} onClick={onCancel}>✕</button>
        </div>
        <div style={hs.modalBody}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>

            {/* Nom */}
            <div style={hs.field}>
              <label style={hs.fLabel}>Nom de la zone / équipement *</label>
              <input style={hs.fInput} placeholder="ex. Friteuse 1, Vitrine réfrigérée…"
                value={f.nom} onChange={e=>setF({...f,nom:e.target.value})}/>
            </div>

            {/* Type + icône */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={hs.field}>
                <label style={hs.fLabel}>Type d'équipement</label>
                <select style={hs.fInput} value={f.type} onChange={e=>setF({...f,type:e.target.value,icone:ZONE_TYPES.find(t=>t.id===e.target.value)?.icones[0]||'◉'})}>
                  {ZONE_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div style={hs.field}>
                <label style={hs.fLabel}>Icône</label>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {(typeInfo.icones||['◉','◎','⊕']).map(ic=>(
                    <button key={ic} onClick={()=>setF({...f,icone:ic})}
                      style={{width:36,height:36,fontSize:20,border:`2px solid ${f.icone===ic?'var(--accent)':'var(--border)'}`,borderRadius:8,background:f.icone===ic?'var(--accent-light)':'var(--surface)',cursor:'pointer'}}>
                      {ic}
                    </button>
                  ))}
                  <input style={{...hs.fInput,width:60,textAlign:'center',fontSize:18}} maxLength={2} value={f.icone} onChange={e=>setF({...f,icone:e.target.value})} title="Saisir un emoji personnalisé"/>
                </div>
              </div>
            </div>

            {/* Températures */}
            <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:10,padding:'14px'}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,marginBottom:12}}>Plage de conformité</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 80px',gap:10}}>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Cible *</label>
                  <input type="number" step="0.5" style={hs.fInput} placeholder="ex. 4"
                    value={f.cible} onChange={e=>setF({...f,cible:e.target.value})}/>
                </div>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Min autorisé</label>
                  <input type="number" step="0.5" style={hs.fInput} placeholder="ex. 0"
                    value={f.min??''} onChange={e=>setF({...f,min:e.target.value})}/>
                </div>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Max autorisé</label>
                  <input type="number" step="0.5" style={hs.fInput} placeholder="ex. 6 (vide = aucun)"
                    value={f.max??''} onChange={e=>setF({...f,max:e.target.value})}/>
                </div>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Unité</label>
                  <select style={hs.fInput} value={f.unite} onChange={e=>setF({...f,unite:e.target.value})}>
                    {['°C','°F','%','bar','pH'].map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              {/* Aperçu plage */}
              {f.cible !== '' && (
                <div style={{marginTop:10,padding:'8px 12px',background:'var(--surface)',borderRadius:8,fontSize:12,color:'var(--text2)',display:'flex',gap:16}}>
                  <span>Cible : <strong style={{color:'var(--accent)'}}>{f.cible}{f.unite}</strong></span>
                  <span>Plage : <strong>[{f.min!==''?f.min:'—'} ; {f.max!==''?f.max:'+∞'}]{f.unite}</strong></span>
                </div>
              )}
            </div>

            {/* Actif */}
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{...hcfg.toggle,background:f.actif?'var(--accent)':'var(--border)'}} onClick={()=>setF({...f,actif:!f.actif})}>
                <div style={{...hcfg.toggleThumb,left:f.actif?'calc(100% - 20px)':'2px'}}/>
              </div>
              <span style={{fontSize:13,color:'var(--text)',fontWeight:500}}>Zone active (visible dans les relevés)</span>
            </div>
          </div>

          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
            <button style={hs.cancelBtn} onClick={onCancel}>Annuler</button>
            <button style={hs.saveBtn} onClick={handleSave}>{zone?.id ? 'Enregistrer' : 'Ajouter la zone'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Formulaire contrôle (add/edit) ───
const CtrlForm = ({ ctrl, onSave, onCancel }) => {
  const [f, setF] = React.useState(ctrl || { label:'', type:'hygiene', frequence:'Quotidien', actif:true, description:'' });

  const handleSave = () => {
    if (!f.label.trim()) { alert('Intitulé obligatoire.'); return; }
    onSave({ ...f, id: f.id || 'c'+Date.now() });
  };

  return (
    <div style={hs.overlay} onClick={onCancel}>
      <div style={{...hs.modal,width:480}} onClick={e=>e.stopPropagation()}>
        <div style={hs.modalHeader}>
          <div style={hs.modalTitle}>{ctrl?.id ? 'Modifier le contrôle' : 'Ajouter un contrôle'}</div>
          <button style={hs.closeBtn} onClick={onCancel}>✕</button>
        </div>
        <div style={hs.modalBody}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div style={hs.field}>
              <label style={hs.fLabel}>Intitulé du contrôle *</label>
              <input style={hs.fInput} placeholder="ex. Nettoyage friteuse, Relevé huile friture…"
                value={f.label} onChange={e=>setF({...f,label:e.target.value})}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div style={hs.field}>
                <label style={hs.fLabel}>Catégorie</label>
                <select style={hs.fInput} value={f.type} onChange={e=>setF({...f,type:e.target.value})}>
                  {CTRL_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div style={hs.field}>
                <label style={hs.fLabel}>Fréquence</label>
                <select style={hs.fInput} value={f.frequence} onChange={e=>setF({...f,frequence:e.target.value})}>
                  {FREQ_OPTIONS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div style={hs.field}>
              <label style={hs.fLabel}>Description / procédure (optionnel)</label>
              <textarea style={{...hs.fInput,resize:'vertical',minHeight:72}}
                placeholder="Détail du contrôle, méthode, seuils attendus…"
                value={f.description||''} onChange={e=>setF({...f,description:e.target.value})}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{...hcfg.toggle,background:f.actif?'var(--accent)':'var(--border)'}} onClick={()=>setF({...f,actif:!f.actif})}>
                <div style={{...hcfg.toggleThumb,left:f.actif?'calc(100% - 20px)':'2px'}}/>
              </div>
              <span style={{fontSize:13,color:'var(--text)',fontWeight:500}}>Contrôle actif</span>
            </div>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
            <button style={hs.cancelBtn} onClick={onCancel}>Annuler</button>
            <button style={hs.saveBtn} onClick={handleSave}>{ctrl?.id ? 'Enregistrer' : 'Ajouter le contrôle'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── MODULE PRINCIPAL ───
// ─── ZoneTile : composant global (PAS imbriqué dans HACCP) ───
// Reçoit toutes ses données via props pour éviter le problème des hooks inline
const ZoneTile = ({ zone, last, trend, inlineReleve, inlineTempInput, canWrite, setInlineReleve, setInlineTempInput, submitInlineReleve }) => {
  const conforme = last ? last.conforme : null;
  const isActive = inlineReleve === zone.id;

  let delaiLabel = null, delaiAlert = false;
  if (last) {
    const lastDt = new Date(`${last.date}T${last.heure}`);
    const diffH = (Date.now() - lastDt.getTime()) / 3600000;
    if (diffH < 1) delaiLabel = `Il y a ${Math.round(diffH * 60)} min`;
    else if (diffH < 24) {
      delaiLabel = `Il y a ${Math.floor(diffH)}h`;
      if (zone.type === 'froid' && diffH > 4) delaiAlert = true;
    } else {
      delaiLabel = `${Math.floor(diffH / 24)}j`;
      delaiAlert = true;
    }
  }

  // ─── Indicateur de tendance (vs 7 jours précédents) ───
  // up   = ↗ (température monte)
  // down = ↘ (température baisse)
  // stable = → (pas de variation significative)
  // Pour une zone froide, ↗ est mauvais ; pour une zone chaude, ↘ est mauvais.
  let trendIcon = null, trendColor = null, trendLabel = null;
  if (trend) {
    if (trend.direction === 'up') {
      trendIcon = '↗';
      trendColor = zone.type === 'froid' ? '#dc2626' : '#d97706';
      trendLabel = `+${trend.delta.toFixed(1)}${zone.unite} vs sem. dernière`;
    } else if (trend.direction === 'down') {
      trendIcon = '↘';
      trendColor = zone.type === 'chaud' ? '#dc2626' : '#16a34a';
      trendLabel = `${trend.delta.toFixed(1)}${zone.unite} vs sem. dernière`;
    } else {
      trendIcon = '→';
      trendColor = 'var(--text2)';
      trendLabel = 'stable vs sem. dernière';
    }
  }

  const bg = conforme===null ? 'var(--surface)' : conforme ? '#f0fdf4' : '#fef2f2';
  const bc = conforme===null ? 'var(--border)'  : conforme ? '#86efac' : '#fca5a5';
  const vc = conforme===null ? 'var(--text2)'   : conforme ? '#15803d' : '#dc2626';

  return (
    <div style={{ ...hs.zoneTile, background: bg, border: `2px solid ${bc}`, flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${bc}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{zone.icone}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{zone.nom}</div>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>Cible {zone.cible}{zone.unite} · [{zone.min ?? '—'}–{zone.max ?? '+∞'}]</div>
          </div>
        </div>
        {last ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)', color: vc, display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
              {last.valeur}{zone.unite}
              {trendIcon && (
                <span
                  style={{ fontSize: 14, color: trendColor, fontWeight: 700 }}
                  title={trendLabel}
                >{trendIcon}</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: delaiAlert ? '#dc2626' : 'var(--text2)', fontWeight: delaiAlert ? 700 : 400 }}>
              {delaiAlert ? '⚠ ' : ''}{delaiLabel}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>Aucun relevé</div>
        )}
      </div>
      <div style={{ padding: '10px 14px' }}>
        {!isActive ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div>
              {last && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                  background: conforme ? '#dcfce7' : '#fee2e2', color: conforme ? '#15803d' : '#dc2626' }}>
                  {conforme ? '✓ Conforme' : '✕ Non conforme'}
                </span>
              )}
              {delaiAlert && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 4, fontWeight: 600 }}>⚠ Relevé en retard !</div>}
            </div>
            {canWrite && (
              <button
                style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700 }}
                onClick={() => { setInlineReleve(zone.id); setInlineTempInput(''); }}
              >+ Relever</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              autoFocus type="number" step="0.1"
              value={inlineTempInput}
              onChange={e => setInlineTempInput(e.target.value)}
              placeholder={`${zone.cible}${zone.unite}`}
              style={{ flex: 1, padding: '8px 10px', border: '2px solid var(--accent)', borderRadius: 7, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)' }}
              onKeyDown={e => {
                if (e.key === 'Enter') submitInlineReleve(zone, inlineTempInput);
                if (e.key === 'Escape') setInlineReleve(null);
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)' }}>{zone.unite}</span>
            <button style={{ padding: '8px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
              onClick={() => submitInlineReleve(zone, inlineTempInput)}>✓</button>
            <button style={{ padding: '8px 10px', background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}
              onClick={() => setInlineReleve(null)}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
};

const HACCP = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
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
  const canManage = ['consultant', 'patron', 'resp_cuisine'].includes(user.role);

  // ═══ Chargement depuis Supabase + Realtime ═══
  React.useEffect(() => {
    if (!window.SB) {
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
          window.SB.db.listHaccpZones(etabId),
          window.SB.db.listHaccpTpls(etabId),
          window.SB.db.listHaccpReleves(etabId),
          window.SB.db.listHaccpControls(etabId),
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

    unsubs.push(window.SB.realtime.subscribe('haccp_zones', reload));
    unsubs.push(window.SB.realtime.subscribe('haccp_ctrl_templates', reload));
    unsubs.push(window.SB.realtime.subscribe('haccp_releves', reload));
    unsubs.push(window.SB.realtime.subscribe('haccp_controls', reload));

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

  const isConforme = (zone, valeur) => {
    const v = parseFloat(valeur);
    if (isNaN(v)) return null;
    if (zone.min !== null && zone.min !== undefined && zone.min !== '' && v < parseFloat(zone.min)) return false;
    if (zone.max !== null && zone.max !== undefined && zone.max !== '' && v > parseFloat(zone.max)) return false;
    return true;
  };

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
    if (!formRel.valeur || !formRel.heure) { alert('Remplissez tous les champs obligatoires.'); return; }
    if (!formRel.zoneId) { alert('Sélectionnez une zone.'); return; }
    const zone = zones.find(z=>z.id===formRel.zoneId);
    const conforme = isConforme(zone, formRel.valeur);
    const newReleve = {
      etablissementId: etabId,
      zoneId: formRel.zoneId,
      date: formRel.date,
      heure: formRel.heure,
      valeur: parseFloat(formRel.valeur),
      operateur: user.id,
      conforme,
      commentaire: formRel.commentaire || '',
    };
    if (window.SB) {
      try {
        const saved = await window.SB.db.upsertHaccpReleve(newReleve);
        setReleves(prev => [saved, ...prev]);
      } catch (err) { window.notify('Erreur : ' + err.message, 'error'); return; }
    } else {
      setReleves([{ id: 'r' + Date.now(), ...newReleve }, ...releves]);
    }
    setShowReleve(false);
    setFormRel({ zoneId: activeZones[0]?.id || '', date: todayStr, heure:'', valeur:'', commentaire:'' });
  };

  const submitControl = async () => {
    if (!formCtrl.heure) { alert('Renseignez l\'heure.'); return; }
    if (!formCtrl.templateId) { alert('Sélectionnez un contrôle.'); return; }
    const newCtrl = {
      etablissementId: etabId,
      templateId: formCtrl.templateId,
      date: formCtrl.date,
      heure: formCtrl.heure,
      statut: formCtrl.statut,
      operateur: user.id,
      notes: formCtrl.notes,
    };
    if (window.SB) {
      try {
        const saved = await window.SB.db.upsertHaccpControl(newCtrl);
        setControls(prev => [saved, ...prev]);
      } catch (err) { window.notify('Erreur : ' + err.message, 'error'); return; }
    } else {
      setControls([{ id: 'ct' + Date.now(), ...newCtrl }, ...controls]);
    }
    setShowControl(false);
    setFormCtrl({ templateId: activeTpls[0]?.id || '', date: todayStr, heure:'', statut:'conforme', notes:'' });
  };

  const saveZone = async (z) => {
    const payload = { ...z, etablissementId: etabId };
    if (window.SB) {
      try {
        const saved = await window.SB.db.upsertHaccpZone(payload);
        setZones(prev => prev.find(x => x.id === saved.id) ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]);
      } catch (err) { window.notify('Erreur zone : ' + err.message, 'error'); return; }
    } else {
      setZones(prev => prev.find(x=>x.id===z.id) ? prev.map(x=>x.id===z.id?z:x) : [...prev,z]);
    }
    setZoneModal(null);
  };
  const deleteZone = async (id) => {
    if (!window.confirm('Supprimer cette zone ? Les relevés associés seront aussi supprimés.')) return;
    if (window.SB) {
      try { await window.SB.db.deleteHaccpZone(id); }
      catch (err) { window.notify('Erreur : ' + err.message, 'error'); return; }
    }
    setZones(prev=>prev.filter(z=>z.id!==id));
  };
  const saveCtrl = async (c) => {
    const payload = { ...c, etablissementId: etabId };
    if (window.SB) {
      try {
        const saved = await window.SB.db.upsertHaccpTpl(payload);
        setCtrlTpls(prev => prev.find(x => x.id === saved.id) ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]);
      } catch (err) { window.notify('Erreur : ' + err.message, 'error'); return; }
    } else {
      setCtrlTpls(prev=>prev.find(x=>x.id===c.id)?prev.map(x=>x.id===c.id?c:x):[...prev,c]);
    }
    setCtrlModal(null);
  };
  const deleteCtrl = async (id) => {
    if (!window.confirm('Supprimer ce contrôle ?')) return;
    if (window.SB) {
      try { await window.SB.db.deleteHaccpTpl(id); }
      catch (err) { window.notify('Erreur : ' + err.message, 'error'); return; }
    }
    setCtrlTpls(prev=>prev.filter(c=>c.id!==id));
  };

  const deleteReleve = async (id) => {
    if (!canManage) return;
    if (!window.confirm('Supprimer ce relevé ?')) return;
    if (window.SB) {
      try { await window.SB.db.deleteHaccpReleve(id); }
      catch (err) { window.notify('Erreur : ' + err.message, 'error'); return; }
    }
    setReleves(prev => prev.filter(r => r.id !== id));
  };
  const deleteControlRecord = async (id) => {
    if (!canManage) return;
    if (!window.confirm('Supprimer ce contrôle enregistré ?')) return;
    if (window.SB) {
      try { await window.SB.db.deleteHaccpControl(id); }
      catch (err) { window.notify('Erreur : ' + err.message, 'error'); return; }
    }
    setControls(prev => prev.filter(c => c.id !== id));
  };

  // ─── Saisie inline directement sur la tuile (states définis plus haut) ───

  const submitInlineReleve = async (zone, valeur) => {
    if (!valeur || isNaN(parseFloat(valeur))) return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const heure = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const conforme = isConforme(zone, valeur);
    const newReleve = {
      etablissementId: etabId, zoneId: zone.id,
      date: today, heure, valeur: parseFloat(valeur),
      operateur: user.id, conforme, commentaire: '',
    };
    if (window.SB) {
      try {
        const saved = await window.SB.db.upsertHaccpReleve(newReleve);
        setReleves(prev => [saved, ...prev]);
      } catch (err) { window.notify('Erreur : ' + err.message, 'error'); return; }
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
      v !== '' && v != null && !isNaN(parseFloat(v))
    );
    if (entries.length === 0) {
      window.notify('Aucune valeur saisie', 'warning');
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
      const valeur = parseFloat(raw);
      const conforme = isConforme(zone, valeur);
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
      if (window.SB) {
        try {
          const saved = await window.SB.db.upsertHaccpReleve(newReleve);
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
      window.notify(`⚠ ${created.length} relevés enregistrés, ${errors.length} en erreur`, 'warning');
    } else if (nbAnomalies > 0) {
      window.notify(`✓ ${created.length} relevés enregistrés (${nbAnomalies} anomalie${nbAnomalies > 1 ? 's' : ''})`, 'warning');
    } else {
      window.notify(`✓ ${created.length} relevé${created.length > 1 ? 's' : ''} conforme${created.length > 1 ? 's' : ''} enregistré${created.length > 1 ? 's' : ''}`, 'success');
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
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {activeTab!=='config' && <input type="date" style={hs.datePicker} value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/>}
          {activeTab==='releves'   && <button style={hs.addBtn} onClick={()=>setShowReleve(true)}>+ Nouveau relevé</button>}
          {activeTab==='controles' && <button style={hs.addBtn} onClick={()=>setShowControl(true)}>+ Enregistrer contrôle</button>}
          {activeTab==='config' && isConsultant && (
            <>
              <button style={hs.addBtn} onClick={()=>setZoneModal('new')}>+ Ajouter zone</button>
              <button style={{...hs.addBtn,background:'var(--nav)'}} onClick={()=>setCtrlModal('new')}>+ Ajouter contrôle</button>
            </>
          )}
          <button style={hs.exportBtn} onClick={()=>PDFUtils.printElement(activeTab==='releves' ? 'haccp-releves-print' : activeTab==='controles' ? 'haccp-controls-print' : 'haccp-dashboard-print', 'Registre HACCP')}>🖨 Imprimer</button>
          <button style={hs.exportBtn} onClick={()=>PDFUtils.exportElementToPdf(activeTab==='releves' ? 'haccp-releves-print' : activeTab==='controles' ? 'haccp-controls-print' : 'haccp-dashboard-print', 'registre-haccp.pdf')}>⬇ PDF</button>
        </div>
      </div>

      {/* ── TABLEAU DE BORD ── */}
      {activeTab==='tableau' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}} id="haccp-dashboard-print">
          <div style={hs.kpiRow}>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Taux de conformité</div><div style={{...hs.kpiVal,color:tauxConf>=95?'#15803d':tauxConf>=80?'#d97706':'#dc2626'}}>{tauxConf}%</div></div>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Zones actives</div><div style={hs.kpiVal}>{activeZones.length}</div></div>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Relevés total</div><div style={hs.kpiVal}>{releves.length}</div></div>
            <div style={hs.kpiCard}><div style={hs.kpiLbl}>Anomalies</div><div style={{...hs.kpiVal,color:(anomalies || []).length>0?'#dc2626':'#15803d'}}>{(anomalies || []).length}</div></div>
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
                const op=DEMO_DATA.utilisateurs.find(u=>u.id===a.operateur);
                return(
                  <div key={a.id} style={hs.anomRow}>
                    <div style={hs.anomIcon}>{zone?.icone}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{zone?.nom}</div>
                      <div style={{fontSize:11,color:'var(--text2)'}}>{a.date} à {a.heure} · {op?.prenom} {op?.nom}</div>
                      {a.commentaire&&<div style={{fontSize:12,color:'#dc2626',marginTop:2}}>{a.commentaire}</div>}
                    </div>
                    <div style={{fontSize:20,fontWeight:700,color:'#dc2626',fontFamily:'var(--font-serif)'}}>{a.valeur}{zone?.unite}</div>
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
          <div style={hs.tableCard}>
            <div style={hs.tableCardHeader}>Relevés du {new Date(dateFilter+'T12:00:00').toLocaleDateString('fr-CH',{weekday:'long',day:'numeric',month:'long'})}</div>
            {todayReleves.length===0&&<div style={hs.empty}>Aucun relevé pour cette date.</div>}
            <div style={hs.relHead}><span>Zone</span><span>Heure</span><span style={{textAlign:'right'}}>Valeur</span><span>Opérateur</span><span>Statut</span><span style={{flex:2}}>Commentaire</span>{(isConsultant || user.role==='patron' || user.role==='resp_cuisine') && <span className="no-print">Action</span>}</div>
            {(todayReleves || []).map(r=>{
              const zone=zones.find(z=>z.id===r.zoneId);
              const op=DEMO_DATA.utilisateurs.find(u=>u.id===r.operateur);
              return(
                <div key={r.id} style={hs.relRow}>
                  <span style={{fontSize:13,fontWeight:600}}>{zone?.icone} {zone?.nom}</span>
                  <span style={hs.cell}>{r.heure}</span>
                  <span style={{...hs.cell,textAlign:'right',fontWeight:700,color:r.conforme?'#15803d':'#dc2626',fontSize:15,fontFamily:'var(--font-serif)'}}>{r.valeur}{zone?.unite}</span>
                  <span style={hs.cell}>{op?.prenom} {op?.nom}</span>
                  <span><span style={{...hs.confBadge,background:r.conforme?'#dcfce7':'#fee2e2',color:r.conforme?'#15803d':'#dc2626'}}>{r.conforme?'✓ OK':'✕ Anomalie'}</span></span>
                  <span style={{...hs.cell,flex:2,color:r.commentaire?'#dc2626':'var(--text2)',fontSize:12}}>{r.commentaire||'—'}</span>
                  {(isConsultant || user.role==='patron' || user.role==='resp_cuisine') && <span className="no-print"><button style={hcfg.deleteBtn} onClick={()=>deleteReleve(r.id)}>Supprimer</button></span>}
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
                  <div key={tpl.id} style={{...hs.ctrlRow,background:done?(done.statut==='conforme'?'#f0fdf4':'#fef2f2'):'var(--bg)',border:`1px solid ${done?(done.statut==='conforme'?'#bbf7d0':'#fca5a5'):'var(--border)'}`}}>
                    <div style={{...hs.ctrlCheck,background:done?(done.statut==='conforme'?'#15803d':'#dc2626'):'var(--border)'}}>{done?(done.statut==='conforme'?'✓':'✕'):''}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{tpl.label}</div>
                      <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>{tpl.frequence} · {CTRL_TYPES.find(t=>t.id===tpl.type)?.label}</div>
                      {tpl.description&&<div style={{fontSize:11,color:'var(--text2)',marginTop:2,fontStyle:'italic'}}>{tpl.description}</div>}
                      {done?.notes&&<div style={{fontSize:11,color:done.statut==='conforme'?'var(--text2)':'#dc2626',marginTop:3,fontStyle:'italic'}}>{done.notes}</div>}
                    </div>
                    {done?(
                      <div style={{textAlign:'right'}}>
                        <div style={{...hs.confBadge,background:done.statut==='conforme'?'#dcfce7':'#fee2e2',color:done.statut==='conforme'?'#15803d':'#dc2626'}}>{done.statut==='conforme'?'Conforme':'Non conforme'}</div>
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
            <div style={hs.relHead}><span style={{flex:2}}>Contrôle</span><span>Date</span><span>Heure</span><span>Opérateur</span><span>Statut</span><span style={{flex:2}}>Notes</span>{(isConsultant || user.role==='patron' || user.role==='resp_cuisine') && <span className='no-print'>Action</span>}</div>
            {controls.map(c=>{
              const tpl=ctrlTpls.find(t=>t.id===c.templateId);
              const op=DEMO_DATA.utilisateurs.find(u=>u.id===c.operateur);
              return(
                <div key={c.id} style={hs.relRow}>
                  <span style={{...hs.cell,flex:2,fontWeight:600}}>{tpl?.label}</span>
                  <span style={hs.cell}>{c.date}</span>
                  <span style={hs.cell}>{c.heure}</span>
                  <span style={hs.cell}>{op?.prenom} {op?.nom}</span>
                  <span><span style={{...hs.confBadge,background:c.statut==='conforme'?'#dcfce7':'#fee2e2',color:c.statut==='conforme'?'#15803d':'#dc2626'}}>{c.statut==='conforme'?'✓ Conforme':'✕ Non conforme'}</span></span>
                  <span style={{...hs.cell,flex:2,fontSize:12,color:'var(--text2)'}}>{c.notes||'—'}</span>
                  {(isConsultant || user.role==='patron' || user.role==='resp_cuisine') && <span className='no-print'><button style={hcfg.deleteBtn} onClick={()=>deleteControlRecord(c.id)}>Supprimer</button></span>}
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
        <div style={hs.overlay} onClick={()=>setShowReleve(false)}>
          <div style={hs.modal} onClick={e=>e.stopPropagation()}>
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
                    return<div style={{marginTop:8,padding:'8px 12px',borderRadius:8,background:ok?'#dcfce7':'#fee2e2',color:ok?'#15803d':'#dc2626',fontSize:13,fontWeight:600,textAlign:'center'}}>
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
        <div style={hs.overlay} onClick={()=>setShowControl(false)}>
          <div style={hs.modal} onClick={e=>e.stopPropagation()}>
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
                      <button key={s} onClick={()=>setFormCtrl({...formCtrl,statut:s})} style={{flex:1,padding:'10px',border:`2px solid ${formCtrl.statut===s?(s==='conforme'?'#15803d':'#dc2626'):'var(--border)'}`,borderRadius:8,background:formCtrl.statut===s?(s==='conforme'?'#dcfce7':'#fee2e2'):'var(--surface)',color:formCtrl.statut===s?(s==='conforme'?'#15803d':'#dc2626'):'var(--text2)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'}}>
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
        <div style={hs.qrOverlay} onClick={() => !quickSaving && setShowQuickReleves(false)}>
          <div style={hs.qrModal} onClick={e => e.stopPropagation()}>
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
                              : conf ? '#f0fdf4'
                              : '#fef2f2',
                    borderColor: !hasVal ? 'var(--border)'
                               : conf ? '#86efac'
                               : '#fca5a5',
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
                           : conf ? '#15803d'
                           : '#dc2626',
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
    </div>
  );
};

// ─── Styles ───
const hs = {
  root:{display:'flex',flexDirection:'column',gap:14},
  toolbar:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'},
  tab:{padding:'8px 16px',border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text2)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  tabActive:{background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'},
  datePicker:{padding:'7px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',fontFamily:'var(--font)'},
  addBtn:{padding:'8px 16px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  exportBtn:{padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'var(--font)'},
  kpiRow:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12},
  kpiCard:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px'},
  kpiLbl:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,marginBottom:6},
  kpiVal:{fontSize:26,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  sectionTitle:{fontSize:12,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.5},
  zoneGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:10},
  zoneTile:{borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:12},
  zoneIcon:{fontSize:24,flexShrink:0},
  zoneInfo:{flex:1,minWidth:0},
  zoneName:{fontSize:13,fontWeight:600,color:'var(--text)',lineHeight:1.3},
  zoneCible:{fontSize:10,color:'var(--text2)',marginTop:3},
  zoneVal:{textAlign:'right',flexShrink:0},
  confBadge:{display:'inline-block',padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600},
  anomCard:{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:10,overflow:'hidden'},
  anomHeader:{padding:'12px 16px',fontWeight:700,fontSize:13,color:'#dc2626',borderBottom:'1px solid #fca5a5'},
  anomRow:{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 16px',borderBottom:'1px solid #fca5a5'},
  anomIcon:{fontSize:20,flexShrink:0,marginTop:2},
  tableCard:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'},
  tableCardHeader:{padding:'13px 18px',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:700,color:'var(--text)',background:'var(--bg)'},
  empty:{padding:'18px',color:'var(--text2)',fontSize:13},
  relHead:{display:'grid',gridTemplateColumns:'2fr 60px 90px 120px 110px 2fr',padding:'8px 18px',background:'var(--bg)',fontSize:10,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,borderBottom:'1px solid var(--border)',gap:10},
  relRow:{display:'grid',gridTemplateColumns:'2fr 60px 90px 120px 110px 2fr',padding:'11px 18px',borderBottom:'1px solid var(--border)',gap:10,alignItems:'center'},
  cell:{fontSize:13,color:'var(--text)'},
  ctrlRow:{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,marginBottom:4},
  ctrlCheck:{width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:12,flexShrink:0},
  doBtn:{padding:'6px 14px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)',flexShrink:0},
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16},
  modal:{background:'var(--surface)',borderRadius:14,width:500,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',maxHeight:'90vh',overflowY:'auto'},
  modalHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:2},
  modalTitle:{fontWeight:700,fontSize:16,fontFamily:'var(--font-serif)',color:'var(--text)'},
  closeBtn:{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)'},
  modalBody:{padding:'20px 22px'},
  field:{display:'flex',flexDirection:'column',gap:6},
  fLabel:{fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4},
  fInput:{padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--bg)',fontFamily:'var(--font)',outline:'none',width:'100%',boxSizing:'border-box'},
  cancelBtn:{padding:'8px 16px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  saveBtn:{padding:'9px 20px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
};

const hcfg = {
  section:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'},
  sectionHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'1px solid var(--border)',background:'var(--bg)'},
  sectionTitle:{fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'var(--font-serif)'},
  sectionSub:{fontSize:12,color:'var(--text2)',marginTop:2},
  row:{display:'flex',alignItems:'center',gap:12,padding:'12px 18px',borderBottom:'1px solid var(--border)',transition:'background .12s'},
  rowIcon:{width:36,height:36,borderRadius:8,background:'var(--accent-light)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0},
  toggle:{width:40,height:22,borderRadius:11,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0},
  toggleThumb:{position:'absolute',top:2,width:18,height:18,borderRadius:9,background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'},
  editBtn:{padding:'5px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:7,fontSize:12,fontWeight:600,color:'var(--text)',cursor:'pointer',fontFamily:'var(--font)'},
  deleteBtn:{padding:'5px 12px',background:'none',border:'1px solid #fca5a5',borderRadius:7,fontSize:12,fontWeight:600,color:'#dc2626',cursor:'pointer',fontFamily:'var(--font)'},

  // ─── Bouton "Tout conforme" + modale de saisie groupée ───
  quickBtn: { padding:'8px 14px', background:'#15803d', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' },
  qrOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:12 },
  qrModal: { background:'var(--surface)', borderRadius:12, width:560, maxWidth:'94vw', maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 10px 40px rgba(0,0,0,0.2)' },
  qrHeader: { padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 },
  qrTitle: { fontWeight:700, fontSize:16, fontFamily:'var(--font-serif)' },
  qrSubtitle: { fontSize:11, color:'var(--text2)', marginTop:6, lineHeight:1.4 },
  qrCloseBtn: { background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text2)', flexShrink:0 },
  qrBody: { flex:1, overflowY:'auto', padding:'12px 20px', display:'flex', flexDirection:'column', gap:8 },
  qrZoneRow: { display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:'1px solid', borderRadius:8, transition:'background .15s, border-color .15s' },
  qrInput: { width:80, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:7, fontSize:13, color:'var(--text)', background:'var(--bg)', fontFamily:'var(--font)', outline:'none', textAlign:'right' },
  qrFooter: { padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' },
  qrPrimaryBtn: { padding:'9px 16px', background:'#15803d', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'var(--font)', fontSize:13, fontWeight:600 },
  qrGhostBtn: { padding:'8px 14px', background:'none', color:'var(--text)', border:'1px solid var(--border)', borderRadius:7, cursor:'pointer', fontFamily:'var(--font)', fontSize:13 },
};

Object.assign(window, { HACCP });
