import React from 'react';
import { alertLegacy } from '../../legacy/legacyApi.js';
import { CRENEAU_LABELS, CTRL_TYPES, FREQ_OPTIONS, ZONE_TYPES } from './HACCP.constants.js';
import { hcfg, hs } from './HACCP.styles.js';
import { heureEnMinutes } from './HACCP.utils.js';

export const ZoneForm = ({ zone, onSave, onCancel }) => {
  const [f, setF] = React.useState(zone || { nom:'', type:'froid', cible:'', min:'', max:'', unite:'°C', icone:'❄', actif:true });
  const typeInfo = ZONE_TYPES.find(t=>t.id===f.type) || ZONE_TYPES[0];

  const handleSave = () => {
    if (!f.nom.trim() || f.cible === '') { alertLegacy('Nom et température cible obligatoires.'); return; }
    onSave({
      ...f,
      id: f.id || 'z'+Date.now(),
      cible: parseFloat(f.cible),
      min: f.min !== '' ? parseFloat(f.min) : null,
      max: f.max !== '' ? parseFloat(f.max) : null,
    });
  };

  return (
    <div className="modal-full-overlay" style={hs.overlay} onClick={onCancel}>
      <div className="modal-full" style={{...hs.modal, width:520}} onClick={e=>e.stopPropagation()}>
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
                  <span>Plage : <strong>[{f.min!==''?f.min:'-'} ; {f.max!==''?f.max:'+∞'}]{f.unite}</strong></span>
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
export const CtrlForm = ({ ctrl, onSave, onCancel }) => {
  const [f, setF] = React.useState(ctrl || { label:'', type:'hygiene', frequence:'Quotidien', actif:true, description:'' });

  const handleSave = () => {
    if (!f.label.trim()) { alertLegacy('Intitulé obligatoire.'); return; }
    onSave({ ...f, id: f.id || 'c'+Date.now() });
  };

  return (
    <div className="modal-full-overlay" style={hs.overlay} onClick={onCancel}>
      <div className="modal-full" style={{...hs.modal,width:480}} onClick={e=>e.stopPropagation()}>
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

// ─── Formulaire créneau de relevé (add/edit) ───
// L'unicité de l'heure est garantie en base (uq_haccp_creneaux_etab_heure) ;
// on la vérifie aussi ici pour rendre un message lisible plutôt qu'une erreur
// Postgres brute en pleine configuration.
export const CreneauForm = ({ creneau, creneaux = [], onSave, onCancel }) => {
  const [f, setF] = React.useState(creneau || { label: '', heure: '', actif: true });

  const handleSave = () => {
    if (!f.label.trim()) { alertLegacy('Nom du créneau obligatoire.'); return; }
    if (heureEnMinutes(f.heure) == null) { alertLegacy('Renseignez une heure valide.'); return; }
    const doublon = creneaux.find(c => c.id !== f.id && c.heure === f.heure);
    if (doublon) { alertLegacy(`Un créneau existe déjà à ${f.heure} (« ${doublon.label} »).`); return; }
    onSave({ ...f, label: f.label.trim(), id: f.id || 'hcr-' + Date.now() });
  };

  return (
    <div className="modal-full-overlay" style={hs.overlay} onClick={onCancel}>
      <div className="modal-full" style={{ ...hs.modal, width: 440 }} onClick={e => e.stopPropagation()}>
        <div style={hs.modalHeader}>
          <div style={hs.modalTitle}>{creneau?.id ? 'Modifier le créneau' : 'Ajouter un créneau'}</div>
          <button style={hs.closeBtn} onClick={onCancel}>✕</button>
        </div>
        <div style={hs.modalBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={hs.field}>
              <label style={hs.fLabel}>Nom de la tournée *</label>
              <input style={hs.fInput} placeholder="ex. Ouverture, Avant service du soir…"
                value={f.label} onChange={e => setF({ ...f, label: e.target.value })} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {CRENEAU_LABELS.map(l => (
                  <button key={l} onClick={() => setF({ ...f, label: l })}
                    style={{
                      padding: '5px 10px', fontSize: 11, borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font)',
                      border: `1px solid ${f.label === l ? 'var(--accent)' : 'var(--border)'}`,
                      background: f.label === l ? 'var(--accent-light)' : 'var(--surface)',
                      color: f.label === l ? 'var(--accent)' : 'var(--text2)',
                    }}>{l}</button>
                ))}
              </div>
            </div>

            <div style={hs.field}>
              <label style={hs.fLabel}>Heure prévue *</label>
              <input type="time" style={{ ...hs.fInput, fontSize: 18, fontWeight: 700, textAlign: 'center', color: 'var(--accent)' }}
                value={f.heure} onChange={e => setF({ ...f, heure: e.target.value })} />
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 }}>
                Heure locale de l'établissement. Elle sert à pré-remplir la saisie et
                à lister ce qui reste à relever : un relevé hors créneau reste possible.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ ...hcfg.toggle, background: f.actif ? 'var(--accent)' : 'var(--border)' }} onClick={() => setF({ ...f, actif: !f.actif })}>
                <div style={{ ...hcfg.toggleThumb, left: f.actif ? 'calc(100% - 20px)' : '2px' }} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>Créneau actif (proposé à la saisie)</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={hs.cancelBtn} onClick={onCancel}>Annuler</button>
            <button style={hs.saveBtn} onClick={handleSave}>{creneau?.id ? 'Enregistrer' : 'Ajouter le créneau'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── MODULE PRINCIPAL ───
// ─── ZoneTile : composant global (PAS imbriqué dans HACCP) ───
// Reçoit toutes ses données via props pour éviter le problème des hooks inline
