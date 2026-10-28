import React from 'react';
import { Building2, CreditCard, LayoutGrid, PencilLine, RotateCcw } from 'lucide-react';
import { getDemoData } from '../../data/demoData.js';
import { alertLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import {
  navItems as NAV_ITEMS, defaultEtabModuleKeys, etabToggleableModules, optInModuleKeys,
  TYPES_ETABLISSEMENT, estTypeSpa, estTypeHotel, modulesParDefautDuType,
} from '../../modules/moduleConfig.js';
import { useModuleLabels } from '../../hooks/useModuleLabels.js';
import PosIntegrationsCard from './PosIntegrationsCard.jsx';
import { BoutonActions } from '../../components/ui/Fenetres.jsx';
import { messageErreur } from '../../utils/messageErreur.js';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { useEcranModule, ECRAN_ACCUEIL } from '../../components/parcours/useEcranModule.js';
import Interrupteur from '../roles/Interrupteur.jsx';

// ─────────────────────────────────────────────────────
// PARAMÈTRES - Gestion des établissements (Consultant)
// + Maintenance des données
//
// Accueil par tâche : la liste des établissements reste le premier écran
// (la tâche principale, aucun geste de plus), et le compte du consultant
// dessous, comme avant ; les autres tâches en gros boutons au-dessus,
// chacune sur son écran : les modules d'un établissement en interrupteurs,
// les noms des modules, la caisse, la remise à zéro.
// ─────────────────────────────────────────────────────

const ALL_MODULE_KEYS = etabToggleableModules.map((item) => item.permKey);
const MODULE_GROUPS = [...new Set(etabToggleableModules.map((item) => item.group))];

// Exactement les modules standard = null : les modules ajoutés plus tard à
// l'app apparaîtront d'office pour cet établissement, comme avant le réglage.
const normaliserModules = (keys) => {
  const next = ALL_MODULE_KEYS.filter((key) => keys.includes(key));
  const standard = next.length === defaultEtabModuleKeys.length
    && defaultEtabModuleKeys.every((key) => next.includes(key));
  return standard ? null : next;
};

// Ligne envoyée à upsertEtablissement : la même pour « Enregistrer » de la
// fenêtre et pour un interrupteur de module. modulesReady : sans la colonne
// en base, la colonne n'est pas envoyée (voir mapEtabFromRow).
const payloadEtab = (etab, modulesReady) => {
  const payload = {
    id: etab.id,
    nom: etab.nom,
    type: etab.type || 'Restaurant',
    adresse: etab.adresse || null,
    tel: etab.tel || null,
    email: etab.email || null,
    couleur: etab.couleur || '#003042',
    actif: etab.actif !== false,
    notes: etab.notes || null,
    ccnt_heures_semaine: etab.ccntHeuresSemaine || 42,
  };
  if (modulesReady) payload.modules_actifs = Array.isArray(etab.modulesActifs) ? etab.modulesActifs : null;
  return payload;
};

// hasModulesColumn : la ligne porte la colonne modules_actifs (migration
// 20260927 appliquée). Sans elle, Paramètres n'envoie pas la colonne : un
// upsert avec une colonne inconnue ferait échouer toute la sauvegarde.
const mapEtabFromRow = (r) => ({
  id: r.id,
  nom: r.nom,
  type: r.type,
  adresse: r.adresse,
  tel: r.tel,
  email: r.email,
  couleur: r.couleur,
  actif: r.actif,
  notes: r.notes,
  ccntHeuresSemaine: r.ccnt_heures_semaine,
  modulesActifs: Array.isArray(r.modules_actifs) ? r.modules_actifs : null,
  hasModulesColumn: Object.prototype.hasOwnProperty.call(r, 'modules_actifs'),
});

const moduleCountLabel = (modulesActifs) => {
  if (!Array.isArray(modulesActifs)) return 'Tous les modules standard';
  const n = ALL_MODULE_KEYS.filter((key) => modulesActifs.includes(key)).length;
  return n === 1 ? '1 module activé' : `${n} modules activés`;
};

const EtabModulesPicker = ({ value, onChange, getLabel, sansTableauDeBord = false }) => {
  // null = tous les modules standard : tout coché sauf les modules « à
  // activer » (spa), qui ne s'affichent que cochés explicitement.
  const selected = Array.isArray(value) ? value : defaultEtabModuleKeys;
  const set = (keys) => onChange(normaliserModules(keys));
  // « Tout cocher » = tous les modules standard ; un module à activer déjà
  // coché le reste, mais n'est jamais coché en masse.
  const toutCocher = () => set([...defaultEtabModuleKeys, ...selected.filter((key) => optInModuleKeys.includes(key))]);
  const toggle = (key) => set(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <div style={ps.field}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
        <label style={ps.fLabel}>Modules affichés dans le menu</label>
        <div style={{ display:'flex', gap:6 }}>
          <button type="button" style={ps.linkBtn} onClick={toutCocher}>Tout cocher</button>
          <button type="button" style={ps.linkBtn} onClick={() => set([])}>Tout décocher</button>
        </div>
      </div>
      <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>
        L'équipe ne voit que les modules cochés, en plus des droits de son rôle.
        {sansTableauDeBord ? ' Vos outils consultant restent toujours affichés.' : ' Le tableau de bord et vos outils consultant restent toujours affichés.'}
      </div>
      {MODULE_GROUPS.map((group) => (
        <div key={group} style={{ marginTop:6 }}>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>{group}</div>
          <div style={ps.moduleGrid}>
            {etabToggleableModules.filter((item) => item.group === group).map((item) => {
              const checked = selected.includes(item.permKey);
              return (
                <label key={item.id} style={{ ...ps.moduleChip, ...(checked ? ps.moduleChipOn : null) }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item.permKey)}
                    style={{ width:18, height:18, margin:0, flexShrink:0, accentColor:'var(--accent)' }}
                  />
                  <span style={{ minWidth:0 }}>
                    {getLabel ? getLabel(item.id, item.label) : item.label}
                    {optInModuleKeys.includes(item.permKey) && <span style={{ color:'var(--text3)' }}> (à activer)</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize:12, color:'var(--text2)', marginTop:4 }}>{moduleCountLabel(value)}</div>
    </div>
  );
};

const EtabForm = ({ etab, onSave, onCancel, modulesReady, getLabel }) => {
  const [f, setF] = React.useState(etab || {
    id:'', nom:'', type:'Restaurant', adresse:'', tel:'', email:'',
    couleur:'#003042', actif:true, notes:'', modulesActifs:null
  });

  // Un type ancien ou saisi ailleurs reste proposé tel quel.
  const TYPES = TYPES_ETABLISSEMENT.includes(f.type) || !f.type ? TYPES_ETABLISSEMENT : [f.type, ...TYPES_ETABLISSEMENT];
  // Choisir « Spa » coche d'office Spa & clients + Planning & Pointage ; un type
  // hôtel coche les modules standard plus Hébergement et Étages ; quitter l'un
  // de ces types rend les modules standard.
  const typeAvecDefauts = (type) => estTypeSpa(type) || estTypeHotel(type);
  const changerType = (type) => setF((prec) => {
    if (typeAvecDefauts(type)) return { ...prec, type, modulesActifs: modulesParDefautDuType(type) };
    if (typeAvecDefauts(prec.type)) return { ...prec, type, modulesActifs: null };
    return { ...prec, type };
  });
  const COULEURS = ['#003042','#1a5276','#1e6b40','#6c3483','#2e7ab8','#c0392b','#16a085','#7f8c8d'];

  const handleSave = () => {
    if (!f.nom.trim()) { alertLegacy('Le nom est obligatoire.'); return; }
    onSave({ ...f, id: f.id || 'etab-' + Date.now() });
  };

  return (
    <div className="modal-full-overlay" style={ps.overlay} onClick={onCancel}>
      <div className="modal-full" style={ps.modal} onClick={e => e.stopPropagation()}>
        <div style={ps.modalHeader}>
          <div style={ps.modalTitle}>{etab?.id ? 'Modifier l\'établissement' : 'Ajouter un établissement'}</div>
          <button type="button" className="ui-fermer" aria-label="Fermer" style={ps.closeBtn} onClick={onCancel}>×</button>
        </div>
        <div style={ps.modalBody}>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={ps.field}>
              <label style={ps.fLabel}>Nom de l'établissement *</label>
              <input type="text" style={ps.fInput} value={f.nom} onChange={e=>setF({...f,nom:e.target.value})} placeholder="Hôtel Panorama"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={ps.field}>
                <label style={ps.fLabel}>Type</label>
                <select style={ps.fInput} value={f.type} onChange={e=>changerType(e.target.value)}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={ps.field}>
                <label style={ps.fLabel}>Couleur</label>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {COULEURS.map(c => (
                    <button key={c} type="button"
                      onClick={()=>setF({...f,couleur:c})}
                      style={{ width:24, height:24, borderRadius:6, background:c, border: f.couleur===c?'2px solid var(--text)':'1px solid var(--border)', cursor:'pointer' }}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>Adresse</label>
              <input type="text" style={ps.fInput} value={f.adresse} onChange={e=>setF({...f,adresse:e.target.value})} placeholder="Rue et ville"/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={ps.field}>
                <label style={ps.fLabel}>Téléphone</label>
                <input type="tel" style={ps.fInput} value={f.tel} onChange={e=>setF({...f,tel:e.target.value})} placeholder="+41 ..."/>
              </div>
              <div style={ps.field}>
                <label style={ps.fLabel}>E-mail</label>
                <input type="email" style={ps.fInput} value={f.email||''} onChange={e=>setF({...f,email:e.target.value})} placeholder="contact@..."/>
              </div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>Notes internes (consultant)</label>
              <textarea style={{...ps.fInput, resize:'vertical', minHeight:64}}
                placeholder="Informations de suivi, contexte de la mission…"
                value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{...ps.toggle, background:f.actif?'var(--accent)':'var(--border)'}} onClick={()=>setF({...f,actif:!f.actif})}>
                <div style={{...ps.toggleThumb, left:f.actif?'calc(100% - 20px)':'2px'}}/>
              </div>
              <span style={{ fontSize:13, color:'var(--text)', fontWeight:500 }}>Établissement actif (visible dans l'application)</span>
            </div>
            {estTypeSpa(f.type) && (
              <div style={{ fontSize:12, lineHeight:1.5, padding: '10px 0 10px 12px',   color:'var(--info-text)', borderLeft: '2px solid var(--info-bd)' }}>
                Spa : seuls « Spa & clients » et « Planning & Pointage » sont activés, et il n'y a pas de tableau de bord. L'équipe arrive directement sur le spa.
              </div>
            )}
            {modulesReady ? (
              <EtabModulesPicker
                value={f.modulesActifs ?? null}
                onChange={(modulesActifs) => setF({ ...f, modulesActifs })}
                getLabel={getLabel}
                sansTableauDeBord={estTypeSpa(f.type)}
              />
            ) : (
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>
                Choix des modules par établissement : disponible une fois la migration 20260927_etablissements_modules_actifs appliquée.
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button style={ps.cancelBtn} onClick={onCancel}>Annuler</button>
            <button style={ps.saveBtn} onClick={handleSave}>{etab?.id ? 'Enregistrer' : 'Créer'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Parametres = ({ user, etablissement }) => {
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [etablissements, setEtablissements] = React.useState(demoData.etablissements || []);
  const [showForm, setShowForm] = React.useState(false);
  const [editEtab, setEditEtab] = React.useState(null);
  const [showConfirm, setShowConfirm] = React.useState(null);

  const canEdit = user.role === 'consultant';
  // Labels de modules configurables : consultant + patron
  const canEditLabels = ['consultant', 'patron'].includes(user?.role);
  const { getLabelForModule, updateLabel, resetLabel, labels: customLabels } = useModuleLabels();
  const [editingLabelKey, setEditingLabelKey] = React.useState(null);
  const [editingLabelValue, setEditingLabelValue] = React.useState('');
  const [labelSaving, setLabelSaving] = React.useState(false);

  // Écran de tâche : l'accueil (établissements et gros boutons) ou une tâche.
  const [etabModulesId, setEtabModulesId] = React.useState(null);
  const { ecran, setEcran, retourAccueil } = useEcranModule('parametres', {
    surRetour: () => { setEtabModulesId(null); setEditingLabelKey(null); },
  });
  // Échap sous une fenêtre de la caisse (voile fixe dans la page, sans
  // rôle de fenêtre) : la fenêtre reste, l'écran aussi.
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    if (ecran === ECRAN_ACCUEIL) return undefined;
    const garde = (e) => {
      if (e.key === 'Escape' && rootRef.current?.querySelector('[style*="position: fixed"]')) e.preventDefault();
    };
    document.addEventListener('keydown', garde, true);
    return () => document.removeEventListener('keydown', garde, true);
  }, [ecran]);

  const startEditLabel = (item) => {
    setEditingLabelKey(item.id);
    setEditingLabelValue(getLabelForModule(item.id, item.label));
  };

  const saveLabelEdit = async () => {
    if (!editingLabelKey) return;
    setLabelSaving(true);
    const { error } = await updateLabel(editingLabelKey, editingLabelValue);
    setLabelSaving(false);
    if (error) { notifyLegacy(error, 'error'); return; }
    notifyLegacy('Label mis à jour.', 'success');
    setEditingLabelKey(null);
  };

  const resetLabelItem = async (key) => {
    const { error } = await resetLabel(key);
    if (error) { notifyLegacy(error, 'error'); return; }
    notifyLegacy('Label réinitialisé.', 'success');
    if (editingLabelKey === key) setEditingLabelKey(null);
  };

  // Charger depuis Supabase + realtime
  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    let unsub = null;

    const reload = async () => {
      try {
        const rows = await legacySB.db.listEtablissements();
        if (!mounted) return;
        const mapped = (rows || []).map(mapEtabFromRow);
        setEtablissements(mapped);
        demoData.etablissements = mapped;
      } catch (err) { console.error('[Parametres load]', err); }
    };

    reload();
    unsub = legacySB.realtime.subscribeReload('etablissements', reload);
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  // Colonne modules_actifs présente en base (lue sur n'importe quelle ligne).
  const modulesReady = etablissements.some((e) => e.hasModulesColumn);

  const openAdd = () => { if (!canEdit) return; setEditEtab(null); setShowForm(true); };
  const openEdit = (e) => { if (!canEdit) return; setEditEtab(e); setShowForm(true); };

  const save = async (etab) => {
    if (!canEdit) {
      alertLegacy("Vous n'avez pas les droits pour modifier les établissements (rôle consultant requis).");
      return;
    }
    // Si nouvel établissement, générer un ID propre
    if (!etab.id) {
      etab.id = 'etab-' + Date.now();
    }
    const payload = payloadEtab(etab, modulesReady);
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertEtablissement(payload);
        if (!saved || !saved.id) {
          // Écriture refusée sans erreur (RLS) : le détail reste en console.
          console.error('[Parametres] upsertEtablissement sans ligne renvoyée', payload);
          notifyLegacy("L'établissement n'a pas été enregistré. Réessayez ; si cela se reproduit, vérifiez vos droits sur cet établissement.", 'error');
          return;
        }
        // Force un reload local pour ne pas attendre le realtime
        try {
          const rows = await legacySB.db.listEtablissements();
          const mapped = (rows || []).map(mapEtabFromRow);
          setEtablissements(mapped);
          demoData.etablissements = mapped;
        } catch (e) { console.warn('[Parametres] reload fail', e); }
      } catch (err) {
        console.error('[Parametres save]', err);
        notifyLegacy('Enregistrement impossible. ' + messageErreur(err, 'paramètres'), 'error');
        return;
      }
    } else {
      setEtablissements(prev => prev.find(x=>x.id===etab.id) ? prev.map(x=>x.id===etab.id?etab:x) : [...prev, etab]);
    }
    setShowForm(false);
  };

  const confirmDelete = async (id) => {
    if (!canEdit) return;
    if (legacySB) {
      try {
        await legacySB.db.deleteEtablissement(id);
        // Cascade automatique : toutes les données liées (shifts, recettes, pertes, HACCP, etc.) sont supprimées via ON DELETE CASCADE
      } catch (err) { notifyLegacy('Suppression impossible. ' + messageErreur(err, 'paramètres'), 'error'); return; }
    } else {
      setEtablissements(prev => prev.filter(e=>e.id!==id));
    }
    setShowConfirm(null);
  };

  const handleReset = () => {
    if (typeof scResetAllData === 'function') scResetAllData();
  };

  // ── Modules d'un établissement en interrupteurs ──
  // Chaque interrupteur écrit tout de suite, par le même upsertEtablissement
  // et la même ligne que « Enregistrer » de la fenêtre pour ce seul
  // changement. Les écritures partent l'une après l'autre, chacune avec
  // l'état voulu le plus récent ; tant qu'une écriture attend, l'écran montre
  // l'état voulu, puis la ligne enregistrée. Échec : l'état d'avant revient de
  // lui-même (la liste n'est changée qu'au succès), sans relecture.
  const etablissementsRef = React.useRef(etablissements);
  etablissementsRef.current = etablissements;
  const enCoursRef = React.useRef({});
  const fileModulesRef = React.useRef(Promise.resolve());
  const [, rafraichir] = React.useReducer((n) => n + 1, 0);
  const modulesDe = (etab) => (enCoursRef.current[etab.id] ? enCoursRef.current[etab.id].valeur : etab.modulesActifs);

  function basculerModule(etab, key) {
    if (!canEdit || !legacySB) return;
    const avant = modulesDe(etab);
    const selected = Array.isArray(avant) ? avant : defaultEtabModuleKeys;
    const valeur = normaliserModules(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
    enCoursRef.current[etab.id] = { valeur, n: (enCoursRef.current[etab.id]?.n || 0) + 1 };
    rafraichir();
    fileModulesRef.current = fileModulesRef.current.then(async () => {
      const courant = etablissementsRef.current.find((e) => e.id === etab.id) || etab;
      const voulu = enCoursRef.current[etab.id]?.valeur ?? null;
      try {
        const saved = await legacySB.db.upsertEtablissement(payloadEtab({ ...courant, modulesActifs: voulu }, modulesReady));
        if (!saved || !saved.id) throw new Error("L'établissement n'a pas été enregistré.");
        setEtablissements((prev) => {
          const suite = prev.map((e) => (e.id === saved.id ? mapEtabFromRow(saved) : e));
          demoData.etablissements = suite;
          return suite;
        });
      } catch (err) {
        console.error('[Parametres modules]', err);
        notifyLegacy(`Modules non enregistrés. ${messageErreur(err, 'paramètres')}`, 'error');
      } finally {
        const attente = enCoursRef.current[etab.id];
        if (attente) { attente.n -= 1; if (!attente.n) delete enCoursRef.current[etab.id]; }
        rafraichir();
      }
    });
  }

  const nbNomsPerso = NAV_ITEMS.filter((item) => customLabels[item.id]).length;
  const tuiles = [
    { id: 'modules', libelle: "Les modules de l'établissement", Icone: LayoutGrid, visible: canEdit, onClick: () => setEcran('modules') },
    {
      id: 'noms', libelle: 'Les noms des modules', Icone: PencilLine, visible: canEditLabels, onClick: () => setEcran('noms'),
      etat: nbNomsPerso ? <><span>{nbNomsPerso}</span> <span>{nbNomsPerso > 1 ? 'personnalisés' : 'personnalisé'}</span></> : 'par défaut',
    },
    { id: 'caisse', libelle: 'La caisse', Icone: CreditCard, onClick: () => setEcran('caisse') },
    { id: 'donnees', libelle: 'Remettre à zéro', Icone: RotateCcw, onClick: () => setEcran('donnees') },
  ];

  // Un seul établissement : pas de choix à faire.
  const etabModules = etablissements.find((e) => e.id === etabModulesId) || (etablissements.length === 1 ? etablissements[0] : null);
  const nbModules = (valeur) => {
    if (!Array.isArray(valeur)) return 'Tous les modules standard';
    const n = ALL_MODULE_KEYS.filter((key) => valeur.includes(key)).length;
    return <><span>{n}</span> <span>{n === 1 ? 'module activé' : 'modules activés'}</span></>;
  };
  let ecranModules = null;
  if (ecran === 'modules') {
    if (!modulesReady) {
      ecranModules = (
        <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>
          Choix des modules par établissement : disponible une fois la migration 20260927_etablissements_modules_actifs appliquée.
        </div>
      );
    } else if (!etabModules) {
      ecranModules = (
        <AccueilModule tuiles={etablissements.map((e) => ({
          id: e.id, libelle: e.nom, brut: true, Icone: Building2, etat: nbModules(modulesDe(e)), onClick: () => setEtabModulesId(e.id),
        }))} />
      );
    } else {
      const valeur = modulesDe(etabModules);
      const selected = Array.isArray(valeur) ? valeur : defaultEtabModuleKeys;
      ecranModules = (
        <div style={ps.listCard}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>
            L'équipe ne voit que les modules ouverts, en plus des droits de son rôle. Chaque interrupteur s'enregistre tout de suite.
            {estTypeSpa(etabModules.type) ? ' Vos outils consultant restent toujours affichés.' : ' Le tableau de bord et vos outils consultant restent toujours affichés.'}
          </div>
          {MODULE_GROUPS.map((group) => (
            <div key={group}>
              <div style={ps.groupeModules}>{group}</div>
              {etabToggleableModules.filter((item) => item.group === group).map((item) => {
                const label = getLabelForModule(item.id, item.label);
                return (
                  <div key={item.id} style={ps.moduleLigne}>
                    <span style={{ flex:1, minWidth:0, fontSize:14, color:'var(--text)' }}>
                      {label}
                      {optInModuleKeys.includes(item.permKey) && <span style={{ color:'var(--text3)' }}> (à activer)</span>}
                    </span>
                    <Interrupteur
                      checked={selected.includes(item.permKey)}
                      disabled={!canEdit}
                      label={label}
                      onChange={() => basculerModule(etabModules, item.permKey)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ padding:'12px 20px', fontSize:12, color:'var(--text2)' }}>{nbModules(valeur)}</div>
        </div>
      );
    }
  }

  return (
    <div style={ps.root} ref={rootRef}>
      {ecran === ECRAN_ACCUEIL && (<>
      <div style={ps.banner}>
        <div>
          <div style={ps.bannerTitle}>Gestion des établissements</div>
          <div style={ps.bannerSub}>Ajoutez, modifiez ou archivez les établissements de votre portefeuille clients.</div>
        </div>
        <button style={ps.addBtn} onClick={openAdd}>Ajouter un établissement</button>
      </div>

      <AccueilModule tuiles={tuiles} />

      {/* Les chiffres (total, actifs ; « en suivi consultant » était le total)
          passent dans l'en-tête de la liste : avec les gros boutons au-dessus,
          le dernier établissement reste à l'écran sans défiler. */}
      <div style={ps.listCard}>
        <div style={{ ...ps.listHeader, display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div style={ps.listTitle}>Tous les établissements</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>
            <span style={ps.compte}>{etablissements.length}</span> <span>au total</span>, <span style={{ ...ps.compte, color:'var(--success-text)' }}>{etablissements.filter(e=>e.actif!==false).length}</span> <span>actifs</span>
          </div>
        </div>
        {etablissements.length === 0 && (
          <div style={{padding:24, textAlign:'center', color:'var(--text2)', fontSize:13}}>Aucun établissement. Cliquez sur "Ajouter un établissement" pour commencer.</div>
        )}
        {(etablissements || []).map(etab => (
          <div key={etab.id} style={{...ps.etabRow, opacity: etab.actif===false?0.5:1}}>
            <div style={{...ps.etabColor, background:etab.couleur||'var(--accent)'}}/>
            <div style={ps.etabInfo}>
              <div style={ps.etabNom}>
                <span data-no-translate>{etab.nom}</span>
                {etab.actif===false && <span style={ps.inactifBadge}>Inactif</span>}
              </div>
              <div style={ps.etabMeta}>{etab.type}, {etab.adresse || 'Adresse non renseignée'}</div>
              {etab.tel && <div style={ps.etabMeta}>{etab.tel}{etab.email && `, ${etab.email}`}</div>}
              {modulesReady && <div style={ps.etabMeta}>{nbModules(modulesDe(etab))}</div>}
            </div>
            <BoutonActions
              id={`etab-gerer-${etab.id}`}
              label="Gérer"
              style={ps.ghostBtn}
              titre={etab.nom}
              sousTitre={etab.type}
              sections={[
                { items: [{ titre: 'Modifier', detail: 'Nom, type, adresse, contact, couleur et modules actifs.', onClick: () => openEdit(etab) }] },
                { items: [{ titre: 'Supprimer l\'établissement', danger: true, onClick: () => setShowConfirm(etab.id) }] },
              ]}
            />
          </div>
        ))}
      </div>
      </>)}

      {ecran === 'modules' && (
        <EcranTache
          titre="Les modules de l'établissement"
          etat={etabModules ? <span data-no-translate>{etabModules.nom}</span> : 'Choisissez un établissement'}
          onRetour={retourAccueil}
          actions={etabModules && etablissements.length > 1 ? (
            <button type="button" style={{ ...ps.ghostBtn, minHeight:44 }} onClick={() => setEtabModulesId(null)}>Un autre établissement</button>
          ) : null}
        >
          {ecranModules}
        </EcranTache>
      )}

      {/* Compte consultant : sous la liste, comme avant (lecture seule). */}
      {ecran === ECRAN_ACCUEIL && (
      <div style={ps.listCard}>
        <div style={ps.listHeader}>
          <div style={ps.listTitle}>Mon compte consultant</div>
        </div>
        <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={ps.field}>
              <label style={ps.fLabel}>Nom</label>
              <div style={ps.readField}>{user.prenom} {user.nom}</div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>Rôle</label>
              <div style={ps.readField}>{demoData.roles[user.role]?.label}</div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>E-mail principal</label>
              <div style={ps.readField}>{user.email}</div>
            </div>
            <div style={ps.field}>
              <label style={ps.fLabel}>Poste</label>
              <div style={ps.readField}>{user.poste}</div>
            </div>
          </div>
          <div style={{  borderLeft: '2px solid var(--warning-bd)',  padding: '10px 0 10px 12px', fontSize:12, color:'var(--warning-text)' }}>
            Mot de passe et identifiants gérés par l'administrateur Samper Consulting.
          </div>
        </div>
      </div>
      )}

      {/* Intégrations POS */}
      {ecran === 'caisse' && (
        <EcranTache titre="La caisse" onRetour={retourAccueil}>
          <PosIntegrationsCard etablissement={etablissement} user={user} />
        </EcranTache>
      )}

      {/* Personnalisation des modules */}
      {ecran === 'noms' && canEditLabels && (
        <EcranTache titre="Les noms des modules" onRetour={retourAccueil}>
        <div style={ps.listCard}>
          <div style={ps.listHeader}>
            <div>
              <div style={ps.listTitle}>Personnalisation des modules</div>
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:4, fontWeight:400, textTransform:'none', letterSpacing:0 }}>
                Renommez les modules dans la navigation : le changement s'applique à tous les établissements. Les clés techniques ne changent pas.
              </div>
            </div>
          </div>

          {NAV_ITEMS.map((item) => {
            const isEditing = editingLabelKey === item.id;
            const customLabel = customLabels[item.id];
            const isCustomised = Boolean(customLabel);
            const displayLabel = customLabel || item.label;

            return (
              <div key={item.id} style={{
                display:'flex', alignItems:'center', gap:12, padding:'12px 20px',
                borderBottom:'1px solid var(--border)', flexWrap:'wrap',
              }}>
                <div style={{ flex:1, minWidth:160 }}>
                  {isEditing ? (
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <input
                        type="text"
                        value={editingLabelValue}
                        onChange={(e) => setEditingLabelValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveLabelEdit(); if (e.key === 'Escape') setEditingLabelKey(null); }}
                        autoFocus
                        style={{ ...ps.fInput, maxWidth:240, padding:'6px 10px' }}
                      />
                      <button style={{ ...ps.saveBtn, padding:'6px 14px', fontSize:12 }} onClick={saveLabelEdit} disabled={labelSaving}>
                        {labelSaving ? '…' : 'Enregistrer'}
                      </button>
                      <button style={{ ...ps.cancelBtn, padding:'6px 12px', fontSize:12 }} onClick={() => setEditingLabelKey(null)}>
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{displayLabel}</span>
                      {isCustomised && (
                        <span style={{ fontSize:11, fontWeight:500, color:'var(--info-text)' }}>
                          personnalisé
                        </span>
                      )}
                      {!isCustomised && (
                        <span style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>par défaut</span>
                      )}
                    </div>
                  )}
                  {!isEditing && (
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                      clé : <code style={{ fontSize:11 }}>{item.id}</code>
                    </div>
                  )}
                </div>
                {/* Actions */}
                {!isEditing && (
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button style={ps.ghostBtn} onClick={() => startEditLabel(item)}>
                      Renommer
                    </button>
                    {isCustomised && (
                      <button
                        style={ps.ghostBtn}
                        onClick={() => resetLabelItem(item.id)}
                        title={`Rétablir "${item.label}"`}
                      >
                        Réinitialiser
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </EcranTache>
      )}

      {/* Maintenance */}
      {ecran === 'donnees' && (
      <EcranTache titre="Remettre à zéro" onRetour={retourAccueil}>
      <div style={ps.listCard}>
        <div style={ps.listHeader}>
          <div style={ps.listTitle}>Maintenance des données</div>
        </div>
        <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>
            Réinitialiser toutes les données de l'application aux valeurs de démonstration : planning, recettes, inventaires, pertes, utilisateurs, établissements, permissions, HACCP, fiches salle. Le logo personnalisé sera également supprimé.
          </div>
          <div style={{  borderLeft: '2px solid var(--danger-bd)',  padding: '10px 0 10px 12px', fontSize:12, color:'var(--danger-text)' }}>
            <strong>Action irréversible.</strong> Toutes les données saisies seront effacées. Exportez vos documents importants avant de continuer.
          </div>
          <div>
            <button style={{...ps.saveBtn, background:'var(--danger-strong)', width:'auto', padding:'10px 20px'}} onClick={handleReset}>
              Réinitialiser toutes les données
            </button>
          </div>
        </div>
      </div>
      </EcranTache>
      )}

      {showForm && <EtabForm etab={editEtab} onSave={save} onCancel={()=>setShowForm(false)} modulesReady={modulesReady} getLabel={getLabelForModule}/>}

      {showConfirm && (
        <div className="modal-sheet-overlay" style={ps.overlay} onClick={()=>setShowConfirm(null)}>
          <div className="modal-sheet" style={{...ps.modal, width:420}} onClick={e=>e.stopPropagation()}>
            <div style={ps.modalHeader}>
              <div style={ps.modalTitle}>Confirmer la suppression</div>
              <button type="button" className="ui-fermer" aria-label="Fermer" style={ps.closeBtn} onClick={()=>setShowConfirm(null)}>×</button>
            </div>
            <div style={ps.modalBody}>
              <div style={{fontSize:14,color:'var(--text)',lineHeight:1.6,marginBottom:20}}>
                Voulez-vous vraiment supprimer <strong>{etablissements.find(e=>e.id===showConfirm)?.nom}</strong> ?<br/>
                <span style={{color:'var(--danger-strong)',fontSize:13}}>Cette action est irréversible. Les données associées (planning, recettes, inventaires) seront dissociées.</span>
              </div>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button style={ps.cancelBtn} onClick={()=>setShowConfirm(null)}>Annuler</button>
                <button style={{...ps.saveBtn,background:'var(--danger-strong)'}} onClick={()=>confirmDelete(showConfirm)}>Supprimer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ps = {
  root: { display:'flex', flexDirection:'column', gap:16 },
  banner: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, padding:'4px 0', flexWrap:'wrap' },
  bannerTitle: { fontSize:20, fontWeight:700, fontFamily:'var(--font-serif)', color:'var(--text)' },
  bannerSub: { fontSize:13, color:'var(--text2)', marginTop:4 },
  addBtn: { padding:'10px 18px', background:'var(--accent)', color:'var(--on-accent)', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'var(--font)' },
  listCard: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r)', boxShadow: 'var(--sh-xs)', overflow:'hidden' },
  listHeader: { padding:'14px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg)' },
  compte: { fontFamily:'var(--font-num)', fontWeight:700, color:'var(--text)' },
  listTitle: { fontSize:13, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:0.4 },
  etabRow: { display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap' },
  etabColor: { width:6, height:38, borderRadius:3, flexShrink:0 },
  etabInfo: { flex:1, minWidth:200 },
  etabNom: { fontSize:14, fontWeight:500, color:'var(--text)', display:'flex', alignItems:'center', gap:8 },
  etabMeta: { fontSize:12, color:'var(--text2)', marginTop:2 },
  inactifBadge: { fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'var(--surface2)', color:'var(--text2)' },
  ghostBtn: { padding:'7px 14px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'var(--font)' },
  field: { display:'flex', flexDirection:'column', gap:4 },
  fLabel: { fontSize:11, fontWeight:500, color:'var(--text2)', textTransform:'uppercase', letterSpacing:0.4 },
  fInput: { padding:'9px 12px', border:'1px solid var(--border)', borderRadius:8, fontSize:13, color:'var(--text)', background:'var(--bg)', fontFamily:'var(--font)', boxSizing:'border-box', outline:'none', width:'100%' },
  readField: { padding:'9px 12px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, fontSize:13, color:'var(--text)' },
  toggle: { width:40, height:22, borderRadius:11, position:'relative', cursor:'pointer', transition:'background .15s' },
  toggleThumb: { position:'absolute', top:2, width:18, height:18, background:'#fff', borderRadius:'50%', transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:12 },
  modal: { background:'var(--surface)', borderRadius:14, width:560, maxWidth:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 22px', borderBottom:'1px solid var(--border)' },
  modalTitle: { fontWeight:700, fontSize:16, fontFamily:'var(--font-serif)' },
  closeBtn: { background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--text2)' },
  modalBody: { padding:'22px' },
  cancelBtn: { padding:'9px 16px', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:8, fontSize:13, cursor:'pointer', fontFamily:'var(--font)' },
  linkBtn: { padding:'6px 10px', background:'none', border:'none', color:'var(--accent)', fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'var(--font)' },
  moduleGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))', gap:8 },
  // Base en borderWidth/Style/Color : l'état coché ne surcharge que borderColor.
  moduleChip: { display:'flex', alignItems:'center', gap:8, minHeight:44, padding:'8px 12px', borderWidth:1, borderStyle:'solid', borderColor:'var(--border)', borderRadius:8, background:'var(--bg)', fontSize:13, color:'var(--text2)', cursor:'pointer', boxSizing:'border-box', minWidth:0 },
  moduleChipOn: { borderColor:'var(--accent)', background:'var(--surface)', color:'var(--text)' },
  // Modules d'un établissement : un groupe, puis une ligne par module (nom, interrupteur).
  groupeModules: { padding:'12px 20px 4px', fontSize:12, fontWeight:500, color:'var(--text2)' },
  moduleLigne: { display:'flex', alignItems:'center', gap:12, padding:'2px 12px 2px 20px', borderBottom:'1px solid var(--border)', minHeight:48 },
  saveBtn: { padding:'9px 18px', background:'var(--accent)', color:'var(--on-accent)', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'var(--font)' },
};

export default Parametres;
