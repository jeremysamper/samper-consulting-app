import React from 'react';
import { flushSync } from 'react-dom';
import { getDemoData, canManageModule } from '../../data/demoData.js';
import { alertLegacy, confirmLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { CRENEAUX_PRESETS, CTRL_TYPES, ECRANS_HACCP, INITIAL_CONTROLS, INITIAL_CTRL_TPL, INITIAL_RELEVES, INITIAL_ZONES, ZONE_TYPES } from './HACCP.constants.js';
import { CreneauForm, CtrlForm, ZoneForm } from './ZoneForms.jsx';
import ZoneTile from './ZoneTile.jsx';
import { hcfg, hs } from './HACCP.styles.js';
import { isReleveConforme, parseHaccpNumber, trierCreneaux } from './HACCP.utils.js';
import { commentaireActions, compteControles, etatDuJour, verdictReleve } from './haccpJour.js';
import { zurichAjouterJours, zurichClock, zurichToday } from '../../utils/zurichTime.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';
import { exportRowsToXlsx } from '../../utils/exportXlsx.js';
import { userDisplay } from '../../utils/userDisplay.js';
import AccueilHaccp from './AccueilHaccp.jsx';
import MaintenantHaccp, { useTicMinute } from './MaintenantHaccp.jsx';
import AideHaccp, { useAideHaccp } from './AideHaccp.jsx';
import ProgrammeDuJour from './ProgrammeDuJour.jsx';
import ProblemesHaccp from './ProblemesHaccp.jsx';
import RegistreHaccp from './RegistreHaccp.jsx';
import ReleveGuide from './ReleveGuide.jsx';
import ControlesDuJour, { HistoriqueControles } from './ControlesDuJour.jsx';
import { Mesure, PlageTexte } from './ActionsCorrectives.jsx';
import BandeauNonActualise from '../previsions/BandeauNonActualise.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import { BoutonActions } from '../../components/ui/Fenetres.jsx';
import Tracabilite from './Tracabilite.jsx';
import EtiquettesDlc from './EtiquettesDlc.jsx';
import { messageErreur } from '../../utils/messageErreur.js';
import { encadreStyle, encadreTitreStyle } from '../../components/ui/index.jsx';


// ─────────────────────────────────────────────────────
// MODULE HACCP : relevés, contrôles hygiène, config consultant
// ─────────────────────────────────────────────────────

// toLocaleDateString('fr-CH') rend les libellés en minuscules ("jeudi 10 juillet")
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Nombres, heures et données dans leurs propres nœuds : la phrase autour
// reste une entrée du glossaire.
const N = ({ children }) => <span data-no-translate="">{children}</span>;

const valeurLisible = (v) => v !== '' && v != null && !Number.isNaN(parseHaccpNumber(v));

// Toast d'un lot de relevés. Un toast part tel quel (pas de nœuds séparés) :
// nombres et heure restent dans le message, comme avant.
function messageReleves(n, heure, horsPlage) {
  const base = `${n} relevé${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''} à ${heure}`;
  return horsPlage > 0 ? `${base}, ${horsPlage} trop chaud ou trop froid : prévenez le chef` : base;
}

const TABLES_HACCP = ['haccp_zones', 'haccp_ctrl_templates', 'haccp_releves', 'haccp_controls', 'haccp_creneaux'];

// Délai pendant lequel un « C'est fait » se rattrape par « Annuler ».
const ANNULATION_CONTROLE_MS = 2 * 60 * 1000;

const HACCP = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [zones, setZones]       = React.useState([]);
  const [ctrlTpls, setCtrlTpls] = React.useState([]);
  const [releves, setReleves]   = React.useState([]);
  const [controls, setControls] = React.useState([]);
  const [creneaux, setCreneaux] = React.useState([]);

  // ─── Lecture : chargement | pret | echec (premier chargement sans donnée) ───
  // Une relecture en échec garde les données à l'écran et pose le bandeau
  // « Actualisation impossible » (enEchecRelecture) : jamais une liste vide,
  // jamais « Tout est à jour » sur des données qu'on n'a pas pu lire.
  const [lecture, setLecture] = React.useState('chargement');
  const [enEchecRelecture, setEnEchecRelecture] = React.useState(false);
  const [derniereMaj, setDerniereMaj] = React.useState(null);
  const aDesDonneesRef = React.useRef(false);
  const lectures = useOrdreLectures();

  // Un tic par minute : jour et heure de Zurich recalculés à chaque rendu.
  // Le jour courant est celui de Zurich, pas la date UTC du device : après
  // 22h en été, toISOString() bascule déjà au lendemain et le registre du soir
  // se serait rangé sur le mauvais jour.
  useTicMinute();
  const todayStr = zurichToday();
  const maintenant = zurichClock();

  // Jour regardé dans le registre et les contrôles (l'accueil est toujours
  // sur aujourd'hui).
  const [dateFilter, setDateFilter] = React.useState(todayStr);

  // Modals
  const [showReleve, setShowReleve]     = React.useState(false);
  const [showControl, setShowControl]   = React.useState(false);
  const [zoneModal, setZoneModal]       = React.useState(null);
  const [ctrlModal, setCtrlModal]       = React.useState(null);
  const [creneauModal, setCreneauModal] = React.useState(null);

  // Forms
  const [formRel, setFormRel]   = React.useState({ zoneId:'', date: todayStr, heure:'', valeur:'', commentaire:'' });
  const [formCtrl, setFormCtrl] = React.useState({ templateId:'', date: todayStr, heure:'', statut:'conforme', notes:'' });

  // Minuit passé sur une tablette restée ouverte : ce qui regardait la veille
  // (registre, contrôles, dates des formulaires) passe au nouveau jour, sinon
  // l'écran des contrôles resterait sur la veille, sans bouton « C'est fait ».
  // Un autre jour choisi exprès dans le registre reste choisi.
  const jourRef = React.useRef(todayStr);
  React.useEffect(() => {
    const veille = jourRef.current;
    if (veille === todayStr) return;
    jourRef.current = todayStr;
    setDateFilter(d => (d === veille ? todayStr : d));
    setFormRel(f => (f.date === veille ? { ...f, date: todayStr } : f));
    setFormCtrl(f => (f.date === veille ? { ...f, date: todayStr } : f));
  }, [todayStr]);

  // ─── Relever une seule zone, sur sa ligne de l'accueil ───
  const [inlineReleve, setInlineReleve] = React.useState(null);
  const [inlineTempInput, setInlineTempInput] = React.useState('');
  const [inlineChoix, setInlineChoix] = React.useState({ choisies: [], autre: '' });
  const [inlineEnCours, setInlineEnCours] = React.useState(false);

  // ─── Relevé guidé (écran « tournee ») ───
  // Le brouillon vit ici, pas dans l'écran : Retour, le geste retour ou Échap
  // ne perdent pas les chiffres tapés tant que le module reste ouvert. Vidé
  // après un enregistrement réussi.
  //   brouillon = { [zoneId]: { valeur, choisies, autre } }
  //   etatLignes = { [zoneId]: 'ok' | 'echec' } après un enregistrement partiel
  const [brouillon, setBrouillon] = React.useState({});
  const [etatLignes, setEtatLignes] = React.useState({});
  const [guideEnCours, setGuideEnCours] = React.useState(false);
  // Jour et tournée du brouillon : il ne vaut que pour eux. Rouvert sur une
  // autre tournée ou un autre jour, le relevé repart vide (un chiffre du matin
  // ne repart jamais avec l'heure du soir).
  const brouillonCleRef = React.useRef(null);

  // Contrôles marqués « C'est fait » ici, qu'on peut encore annuler :
  // { [id]: fin en ms }. Un toucher sur le mauvais « C'est fait » ne laisse
  // pas un faux « Bon » au registre. Annuler supprime : réservé à qui gère le
  // HACCP (canManage), comme toute suppression d'un contrôle.
  const [annulables, setAnnulables] = React.useState({});
  // Le bouton disparaît à l'échéance, pas au tic suivant de la minute.
  React.useEffect(() => {
    const fins = Object.values(annulables);
    if (!fins.length) return undefined;
    const attente = Math.max(0, Math.min(...fins) - Date.now()) + 50;
    const id = setTimeout(() => {
      const t = Date.now();
      setAnnulables(prev => {
        const n = {};
        Object.keys(prev).forEach(k => { if (prev[k] > t) n[k] = prev[k]; });
        return n;
      });
    }, attente);
    return () => clearTimeout(id);
  }, [annulables]);

  // Contrôles marqués « C'est fait » dont l'écriture est en cours.
  const [controlesEnCours, setControlesEnCours] = React.useState(() => new Set());

  // ─── Export des relevés : choix de période (journalier / mensuel) ───
  // 'print' | 'pdf' = action demandée ; null = modale fermée.
  const [exportRelevesMode, setExportRelevesMode] = React.useState(null);
  const [exportRelevesBusy, setExportRelevesBusy] = React.useState(false);

  // ─── Traçabilité : trigger de capture enregistré par le sous-composant ───
  // (ref stable pour éviter une boucle de re-render : Tracabilite ré-enregistre
  // sa fonction à chaque changement de référence de registerCaptureTrigger)
  const [triggerCapture, setTriggerCapture] = React.useState(null);
  const registerCaptureTrigger = React.useCallback(fn => setTriggerCapture(() => fn), []);

  const isConsultant = user.role === 'consultant';
  const canWrite = ['consultant', 'patron', 'resp_cuisine', 'cuisinier'].includes(user.role);
  const canManage = canManageModule(user.role, 'haccp');
  const sel = useSelection();
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const aide = useAideHaccp(user?.id);

  // Écritures finies après le départ du module : elles notifient leur issue
  // en toast mais ne pilotent plus l'écran.
  const monteRef = React.useRef(true);
  React.useEffect(() => { monteRef.current = true; return () => { monteRef.current = false; }; }, []);

  // ─── Un écran par tâche (useEcranModule) ───
  // L'accueil : la carte « Maintenant » (l'entrée du relevé des températures),
  // l'aide la première fois, les tuiles, la barre Exporter, puis le tableau du
  // jour (programme, zones avec « Relever », à surveiller). Puis un écran par
  // tâche : relevé guidé, étiquettes, photos, contrôles, registre, réglages.
  // Aucun écran n'est repris d'une ouverture à l'autre, le module s'ouvre
  // toujours sur l'accueil. Revenir à l'accueil referme les fenêtres de
  // l'écran quitté, sauf pendant un export ; le brouillon du relevé reste.
  const { ecran, setEcran, retourAccueil } = useEcranModule('haccp', {
    surRetour: () => {
      setShowReleve(false);
      setShowControl(false);
      setZoneModal(null);
      setCtrlModal(null);
      setCreneauModal(null);
      if (!exportRelevesBusy) setExportRelevesMode(null);
    },
  });
  const ecranRef = React.useRef(ecran);
  ecranRef.current = ecran;
  const activeTab = ecran === ECRAN_ACCUEIL ? 'tableau' : ecran;

  // ═══ Chargement depuis Supabase + Realtime ═══
  // Lectures strictes : une erreur remonte au lieu d'une liste vide. L'ordre
  // des réponses est tenu par useOrdreLectures (une réponse lente ne repeint
  // jamais un écran plus frais) ; relecture au réveil par useResumeRefresh.
  const recharger = async () => {
    if (!legacySB) {
      // Fallback : données initiales locales (au moins pour ne pas casser l'affichage)
      setZones(INITIAL_ZONES.filter(z => (z.etablissementId || 'etab-1') === etabId));
      setCtrlTpls(INITIAL_CTRL_TPL.filter(c => (c.etablissementId || 'etab-1') === etabId));
      setReleves(INITIAL_RELEVES);
      setControls(INITIAL_CONTROLS);
      setCreneaux([]);
      setLecture('pret');
      return;
    }
    const lect = lectures.lancer(etabId);
    try {
      const [zs, ts, rs, cs, crs] = await Promise.all([
        legacySB.db.listHaccpZones(etabId, { strict: true }),
        legacySB.db.listHaccpTpls(etabId, { strict: true }),
        legacySB.db.listHaccpReleves(etabId, { strict: true }),
        legacySB.db.listHaccpControls(etabId, { strict: true }),
        // Créneaux facultatifs : un bridge antérieur à cette version renvoie
        // une liste vide, une table pas encore créée aussi (relation absente).
        legacySB.db.listHaccpCreneaux ? legacySB.db.listHaccpCreneaux(etabId, { strict: true }) : [],
      ]);
      if (!lect.appliquer()) return;
      setZones(zs);
      setCtrlTpls(ts);
      setReleves(rs);
      setControls(cs);
      setCreneaux(crs || []);
      aDesDonneesRef.current = true;
      setLecture('pret');
      setEnEchecRelecture(false);
      setDerniereMaj(zurichClock());
    } catch (err) {
      console.error('[HACCP load]', err);
      if (!lect.signalerEchec()) return;
      if (aDesDonneesRef.current) setEnEchecRelecture(true);
      else setLecture('echec');
    }
  };
  const rechargerRef = React.useRef(recharger);
  rechargerRef.current = recharger;
  const relire = React.useCallback(() => rechargerRef.current(), []);

  React.useEffect(() => {
    relire();
    if (!legacySB) return undefined;
    const unsub = legacySB.realtime.subscribeReload(TABLES_HACCP, relire);
    return () => { if (unsub) unsub(); };
  }, [etabId]);

  useResumeRefresh(relire);

  // Échap sur un écran de tâche ramène à l'accueil (useEcranModule), sauf sous
  // une fenêtre du module (relevé, contrôle, export, zone, étiquette maison,
  // photo) : ce ne sont pas des Fenetre, on les reconnaît à leur voile fixe
  // posé dans <main>. Échap n'y fait alors rien, comme avant les écrans.
  // Phase de capture : passe avant useEcranModule, qui laisse la main à un
  // Échap déjà traité.
  React.useEffect(() => {
    if (ecran === ECRAN_ACCUEIL) return undefined;
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('main [style*="position: fixed"]')) e.preventDefault();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [ecran]);

  // ─── Tendance par zone : moyenne des 7 derniers jours vs les 7 jours précédents ───
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

  // Conformité centralisée dans HACCP.utils.js (gère virgules FR, minus Unicode, auto-swap min/max)
  const isConforme = isReleveConforme;

  const activeZones = zones.filter(z=>z.actif);
  const activeTpls  = ctrlTpls.filter(t=>t.actif);
  const activeCreneaux = trierCreneaux(creneaux.filter(c => c.actif));
  const aDesCreneaux   = activeCreneaux.length > 0;
  const pret = lecture === 'pret';

  // ─── La journée d'aujourd'hui (haccpJour.js) ───
  const etatJour = pret ? etatDuJour({ creneaux, zones, releves, today: todayStr, maintenant }) : null;
  const compte = pret ? compteControles(ctrlTpls, controls, todayStr) : null;
  const relevesDuJour = releves.filter(r => r.date === todayStr);
  // Tournée du relevé guidé : celle du créneau le plus proche de maintenant,
  // la même que celle à laquelle le relevé sera rattaché (règle commune avec
  // le tableau de bord, voir le test croisé de haccpJour.test.mjs).
  const tourneeGuide = etatJour?.courante || null;
  const cleBrouillon = `${todayStr}|${tourneeGuide?.id || 'jour'}`;

  // « À surveiller » sur l'accueil : hors plage et problèmes de contrôle
  // d'aujourd'hui et d'hier. La liste du mois vit dans le registre.
  const hier = zurichAjouterJours(todayStr, -1);
  const recent = (d) => d === todayStr || d === hier;
  const horsPlageRecents = releves.filter(r => !r.conforme && recent(r.date));
  const problemesCtrlRecents = controls.filter(c => c.statut !== 'conforme' && recent(c.date));

  // ─── Périodes d'export des relevés : jour sélectionné / mois du jour sélectionné ───
  const todayReleves = releves.filter(r=>r.date===dateFilter);
  const monthKey = dateFilter.slice(0, 7); // 'YYYY-MM'
  const monthReleves = releves.filter(r => (r.date || '').startsWith(monthKey));
  const fmtJour = (d, withYear = true) => new Date(d + 'T12:00:00')
    .toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) });
  const moisLabel = new Date(dateFilter + 'T12:00:00').toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });

  const latestByZone = {};
  (zones || []).forEach(z=>{
    const last = releves.filter(r=>r.zoneId===z.id).sort((a,b)=>b.date.localeCompare(a.date)||String(b.heure).localeCompare(String(a.heure)))[0];
    latestByZone[z.id] = last||null;
  });

  const submitReleve = async () => {
    if (!formRel.valeur || !formRel.heure) { alertLegacy('Remplissez tous les champs obligatoires.'); return; }
    if (!formRel.zoneId) { alertLegacy('Choisissez un frigo ou appareil.'); return; }
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
      } catch (err) { notifyLegacy(messageErreur(err, 'haccp'), 'error'); return; }
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
      } catch (err) { notifyLegacy(messageErreur(err, 'haccp'), 'error'); return; }
    } else {
      setControls([{ id: 'ct' + Date.now(), ...newCtrl }, ...controls]);
    }
    setShowControl(false);
    setFormCtrl({ templateId: activeTpls[0]?.id || '', date: todayStr, heure:'', statut:'conforme', notes:'' });
  };

  // ─── Contrôle « C'est fait » : écrit tout de suite, aujourd'hui, heure
  // réelle, statut bon. « Un problème » ouvre le formulaire d'avant, statut
  // problème présélectionné et heure pré-remplie. ───
  const controleFait = async (tpl) => {
    if (controlesEnCours.has(tpl.id)) return;
    setControlesEnCours(prev => new Set(prev).add(tpl.id));
    const nouveau = {
      etablissementId: etabId, templateId: tpl.id, date: zurichToday(), heure: zurichClock(),
      statut: 'conforme', operateur: user.id, notes: '',
    };
    try {
      const saved = legacySB ? await legacySB.db.upsertHaccpControl(nouveau) : { id: 'ct' + Date.now(), ...nouveau };
      setControls(prev => [saved, ...prev]);
      if (canManage) setAnnulables(prev => ({ ...prev, [saved.id]: Date.now() + ANNULATION_CONTROLE_MS }));
      notifyLegacy('Contrôle noté', 'success');
    } catch (err) {
      notifyLegacy(messageErreur(err, 'haccp'), 'error');
    } finally {
      setControlesEnCours(prev => { const n = new Set(prev); n.delete(tpl.id); return n; });
    }
  };
  // « Annuler » d'un « C'est fait » touché par erreur, par qui gère le HACCP
  // (canManage, seul à pouvoir supprimer un contrôle), deux minutes
  // seulement ; ensuite, la suppression de l'historique. La suppression est
  // vérifiée par une relecture : une suppression refusée par la base ne rend
  // pas d'erreur, et l'écran ne doit pas faire croire qu'elle a eu lieu.
  const [annulationEnCours, setAnnulationEnCours] = React.useState(null);
  const oublierAnnulable = (id) => setAnnulables(prev => { const n = { ...prev }; delete n[id]; return n; });
  const annulerControle = async (id) => {
    if (annulationEnCours || !canManage) return;
    if (!(annulables[id] > Date.now())) {
      oublierAnnulable(id);
      notifyLegacy("Trop tard pour annuler : supprimez-le dans l'historique.", 'warning');
      return;
    }
    setAnnulationEnCours(id);
    try {
      if (legacySB) {
        await legacySB.db.deleteHaccpControl(id);
        const restants = await legacySB.db.listHaccpControls(etabId, { strict: true });
        if (restants.some(c => c.id === id)) {
          oublierAnnulable(id);
          notifyLegacy('Pas annulé : la suppression a été refusée.', 'error');
          return;
        }
      }
      setControls(prev => prev.filter(c => c.id !== id));
      oublierAnnulable(id);
      notifyLegacy('Contrôle annulé', 'success');
    } catch (err) {
      notifyLegacy(messageErreur(err, 'haccp'), 'error');
    } finally {
      setAnnulationEnCours(null);
    }
  };
  const idsAnnulables = new Set(Object.keys(annulables).filter(id => annulables[id] > Date.now()));
  const controleProbleme = (tpl) => {
    setFormCtrl({ templateId: tpl.id, date: todayStr, heure: zurichClock(), statut: 'non-conforme', notes: '' });
    setShowControl(true);
  };

  const saveZone = async (z) => {
    const payload = { ...z, etablissementId: etabId };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertHaccpZone(payload);
        setZones(prev => prev.find(x => x.id === saved.id) ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]);
      } catch (err) { notifyLegacy('Frigo ou appareil non enregistré. ' + messageErreur(err, 'haccp'), 'error'); return; }
    } else {
      setZones(prev => prev.find(x=>x.id===z.id) ? prev.map(x=>x.id===z.id?z:x) : [...prev,z]);
    }
    setZoneModal(null);
  };
  const deleteZone = async (id) => {
    if (!confirmLegacy('Supprimer ce frigo ou appareil ? Ses relevés seront aussi supprimés.')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpZone(id); }
      catch (err) { notifyLegacy(messageErreur(err, 'haccp'), 'error'); return; }
    }
    setZones(prev=>prev.filter(z=>z.id!==id));
  };
  // Bascule actif/inactif persistée immédiatement : la configuration est lue
  // par toute la brigade, un toggle qui ne vivrait qu'en mémoire mentirait au
  // consultant qui quitte l'onglet - et le realtime le rembobinerait sous ses yeux.
  const toggleZone = async (z) => {
    await saveZone({ ...z, actif: !z.actif });
  };
  const saveCtrl = async (c) => {
    const payload = { ...c, etablissementId: etabId };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertHaccpTpl(payload);
        setCtrlTpls(prev => prev.find(x => x.id === saved.id) ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]);
      } catch (err) { notifyLegacy(messageErreur(err, 'haccp'), 'error'); return; }
    } else {
      setCtrlTpls(prev=>prev.find(x=>x.id===c.id)?prev.map(x=>x.id===c.id?c:x):[...prev,c]);
    }
    setCtrlModal(null);
  };
  const deleteCtrl = async (id) => {
    if (!confirmLegacy('Supprimer ce contrôle ?')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpTpl(id); }
      catch (err) { notifyLegacy(messageErreur(err, 'haccp'), 'error'); return; }
    }
    setCtrlTpls(prev=>prev.filter(c=>c.id!==id));
  };
  const toggleCtrl = async (c) => {
    await saveCtrl({ ...c, actif: !c.actif });
  };

  // ─── Créneaux de relevé ───
  const saveCreneau = async (c) => {
    const payload = { ...c, etablissementId: etabId };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertHaccpCreneau(payload);
        setCreneaux(prev => prev.find(x => x.id === saved.id) ? prev.map(x => x.id === saved.id ? saved : x) : [...prev, saved]);
      } catch (err) { notifyLegacy('Créneau non enregistré. ' + messageErreur(err, 'haccp'), 'error'); return; }
    } else {
      setCreneaux(prev => prev.find(x => x.id === c.id) ? prev.map(x => x.id === c.id ? c : x) : [...prev, c]);
    }
    setCreneauModal(null);
  };

  const deleteCreneau = async (id) => {
    if (!confirmLegacy('Supprimer ce créneau ? Les relevés déjà enregistrés sont conservés.')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpCreneau(id); }
      catch (err) { notifyLegacy(messageErreur(err, 'haccp'), 'error'); return; }
    }
    setCreneaux(prev => prev.filter(c => c.id !== id));
  };

  // Bascule actif/inactif persistée immédiatement : la grille horaire est lue
  // par toute la brigade, un toggle qui ne vivrait qu'en mémoire mentirait au
  // consultant qui quitte l'onglet.
  const toggleCreneau = async (c) => {
    await saveCreneau({ ...c, actif: !c.actif });
  };

  // Application d'un modèle (service unique / double service) quand aucun
  // créneau n'existe encore. Chaque créneau reste modifiable ensuite.
  const appliquerPresetCreneaux = async (preset) => {
    const nouveaux = preset.creneaux.map((c, i) => ({
      id: 'hcr-' + Date.now() + '-' + i,
      etablissementId: etabId,
      label: c.label,
      heure: c.heure,
      actif: true,
    }));
    if (!legacySB) { setCreneaux(prev => [...prev, ...nouveaux]); return; }
    const created = [];
    for (const c of nouveaux) {
      try { created.push(await legacySB.db.upsertHaccpCreneau(c)); }
      catch (err) { console.error('[appliquerPresetCreneaux]', c.label, err); }
    }
    if (created.length === 0) { notifyLegacy('Aucun créneau créé.', 'error'); return; }
    setCreneaux(prev => [...prev, ...created]);
    notifyLegacy(`${created.length} créneaux créés (${preset.label}).`, 'success');
  };

  const deleteReleve = async (id) => {
    if (!canManage) return;
    if (!confirmLegacy('Supprimer ce relevé ?')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpReleve(id); }
      catch (err) { notifyLegacy(messageErreur(err, 'haccp'), 'error'); return; }
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
      return [
        zone ? zone.nom : r.zoneId, r.date, r.heure,
        `${r.valeur}${zone ? (zone.unite || '') : ''}`,
        userDisplay(r.operateur).name,
        r.conforme ? 'Conforme' : 'Anomalie', r.commentaire || '',
      ];
    });
    try {
      await exportRowsToXlsx(`haccp-releves-${todayStr}.xlsx`, 'Relevés HACCP', headers, data, [22, 12, 8, 12, 22, 12, 32]);
      notifyLegacy(`${rows.length} relevé(s) exporté(s) en Excel.`, 'success');
    } catch (err) {
      notifyLegacy('Export impossible. ' + messageErreur(err, 'haccp'), 'error');
    }
    setBulkBusy(false);
  };

  // ─── Export/impression des relevés en registre PDF natif (journalier ou mensuel) ───
  // Le document est généré en vectoriel par pdfUtils.exportHaccpRelevesPdf :
  // relevés groupés par jour, anomalies en rouge, stats de conformité en tête.
  const runRelevesExport = async (period) => {
    const source = period === 'jour' ? todayReleves : monthReleves;
    if (!source.length) { notifyLegacy('Aucun relevé pour cette période.', 'warning'); return; }
    const rows = source.slice().sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') || (a.heure || '').localeCompare(b.heure || ''));
    const byDate = new Map();
    rows.forEach(r => { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); });
    const days = [...byDate.entries()].map(([date, list]) => ({
      dateLabel: capitalize(fmtJour(date, period === 'jour')),
      rows: list.map(r => {
        const zone = zones.find(z => z.id === r.zoneId);
        return {
          zone: zone ? zone.nom : (r.zoneId || ''),
          heure: r.heure || '',
          valeur: `${r.valeur}${zone?.unite || ''}`,
          operateur: userDisplay(r.operateur).name,
          conforme: !!r.conforme,
          commentaire: r.commentaire || '',
        };
      }),
    }));
    const nbAnomalies = rows.filter(r => !r.conforme).length;
    const payload = {
      periodeLabel: period === 'jour' ? capitalize(fmtJour(dateFilter)) : capitalize(moisLabel),
      stats: {
        total: rows.length,
        conformes: rows.length - nbAnomalies,
        anomalies: nbAnomalies,
        taux: Math.round((rows.length - nbAnomalies) / rows.length * 100),
      },
      days,
    };
    setExportRelevesBusy(true);
    try {
      await pdfUtils.exportHaccpRelevesPdf(payload, {
        etablissement,
        autoPrint: exportRelevesMode === 'print',
        filename: `releves-haccp-${period === 'jour' ? dateFilter : monthKey}.pdf`,
      });
      setExportRelevesMode(null);
    } catch (e) { /* notify déjà géré dans le service */ }
    finally { setExportRelevesBusy(false); }
  };
  const deleteControlRecord = async (id) => {
    if (!canManage) return;
    if (!confirmLegacy('Supprimer ce contrôle enregistré ?')) return;
    if (legacySB) {
      try { await legacySB.db.deleteHaccpControl(id); }
      catch (err) { notifyLegacy(messageErreur(err, 'haccp'), 'error'); return; }
    }
    setControls(prev => prev.filter(c => c.id !== id));
  };

  // ─── Relever une zone sur sa ligne : heure réelle, actions choisies dans
  // le commentaire du même INSERT, toast avec l'issue ───
  const ouvrirInline = (zoneId) => {
    setInlineReleve(zoneId);
    setInlineTempInput('');
    setInlineChoix({ choisies: [], autre: '' });
  };
  const submitInlineReleve = async (zone) => {
    const valeur = inlineTempInput;
    const parsed = parseHaccpNumber(valeur);
    if (Number.isNaN(parsed) || inlineEnCours) return;
    // Relevé ponctuel : on enregistre l'heure réelle, pas celle du créneau.
    // Le rattachement à la tournée la plus proche se fait à l'affichage.
    const today = zurichToday();
    const heure = zurichClock();
    const conforme = isConforme(zone, valeur);
    const newReleve = {
      etablissementId: etabId, zoneId: zone.id,
      date: today, heure, valeur: parsed,
      operateur: user.id, conforme,
      commentaire: conforme ? '' : commentaireActions(inlineChoix.choisies, inlineChoix.autre),
    };
    setInlineEnCours(true);
    try {
      const saved = legacySB ? await legacySB.db.upsertHaccpReleve(newReleve) : { id: 'r' + Date.now(), ...newReleve };
      setReleves(prev => [saved, ...prev]);
    } catch (err) {
      notifyLegacy(messageErreur(err, 'haccp'), 'error');
      setInlineEnCours(false);
      return;
    }
    setInlineEnCours(false);
    setInlineReleve(cur => (cur === zone.id ? null : cur));
    setInlineTempInput('');
    notifyLegacy(messageReleves(1, heure, conforme ? 0 : 1), conforme ? 'success' : 'warning');
  };

  // ─── Relevé guidé ───
  // Rendu synchrone dans le toucher : l'autoFocus du premier champ vide
  // s'applique dans le geste de l'utilisateur, le clavier s'ouvre sur iOS.
  // Le brouillon ne vaut que pour son jour et sa tournée : rouvert ailleurs,
  // le relevé repart vide. Rouvert sur la même tournée après un
  // enregistrement partiel, les lignes enregistrées (en base, « Déjà relevé
  // à ») se libèrent ; celles en échec gardent leur chiffre pour Réessayer.
  const ouvrirReleveGuide = () => {
    flushSync(() => {
      if (brouillonCleRef.current !== cleBrouillon) {
        setBrouillon({});
        setEtatLignes({});
      } else {
        const enregistrees = Object.keys(etatLignes).filter(id => etatLignes[id] === 'ok');
        if (enregistrees.length) {
          const sans = (prev) => { const n = { ...prev }; enregistrees.forEach(id => { delete n[id]; }); return n; };
          setBrouillon(sans);
          setEtatLignes(sans);
        }
      }
      brouillonCleRef.current = cleBrouillon;
      setEcran('tournee');
    });
  };
  const majLigne = (zoneId, patch) => setBrouillon(prev => ({ ...prev, [zoneId]: { ...prev[zoneId], ...patch } }));

  // Une écriture par ligne remplie, même date (aujourd'hui) et même heure
  // (réelle, au moment d'« Enregistrer ») pour tout le lot : il se lit comme
  // un bloc dans le registre. Succès complet : retour à l'accueil et toast.
  // Échec partiel : on reste sur l'écran, lignes enregistrées marquées, les
  // autres gardent leur chiffre ; « Réessayer » ne renvoie que celles-là.
  const enregistrerReleveGuide = async () => {
    if (guideEnCours) return;
    const lignes = activeZones.filter(z => etatLignes[z.id] !== 'ok' && valeurLisible(brouillon[z.id]?.valeur));
    if (!lignes.length) return;
    setGuideEnCours(true);
    // Les marques « Enregistré » / « Pas enregistré » qui suivent valent pour
    // la tournée affichée au moment d'enregistrer.
    brouillonCleRef.current = cleBrouillon;
    const date = zurichToday();
    const heure = zurichClock();
    const crees = [];
    const ok = [];
    const echecs = [];
    let horsPlage = 0;
    for (const z of lignes) {
      const l = brouillon[z.id];
      const conforme = isConforme(z, l.valeur);
      const nouveau = {
        etablissementId: etabId, zoneId: z.id, date, heure,
        valeur: parseHaccpNumber(l.valeur), operateur: user.id, conforme,
        commentaire: conforme ? '' : commentaireActions(l.choisies, l.autre),
      };
      try {
        const saved = legacySB ? await legacySB.db.upsertHaccpReleve(nouveau) : { id: 'r' + Date.now() + Math.random(), ...nouveau };
        crees.push(saved);
        ok.push(z.id);
        if (!conforme) horsPlage += 1;
      } catch (err) {
        console.error('[releveGuide]', z.nom, err);
        echecs.push(z.id);
      }
    }
    if (crees.length) setReleves(prev => [...crees, ...prev]);
    setGuideEnCours(false);
    if (!echecs.length) {
      setBrouillon({});
      setEtatLignes({});
      notifyLegacy(messageReleves(crees.length, heure, horsPlage), horsPlage ? 'warning' : 'success');
      if (monteRef.current && ecranRef.current === 'tournee') retourAccueil();
      return;
    }
    setEtatLignes(prev => {
      const n = { ...prev };
      ok.forEach(id => { n[id] = 'ok'; });
      echecs.forEach(id => { n[id] = 'echec'; });
      return n;
    });
    const s = (n) => (n > 1 ? 's' : '');
    notifyLegacy(`${crees.length} relevé${s(crees.length)} enregistré${s(crees.length)}, ${echecs.length} pas enregistré${s(echecs.length)}`, 'warning');
  };

  // Le registre et les contrôles s'ouvrent depuis l'accueil sur aujourd'hui :
  // un autre jour choisi lors d'une visite précédente ne se garde pas.
  const ouvrirEcran = (id) => {
    if (id === 'controles' || id === 'releves') setDateFilter(zurichToday());
    setEcran(id);
  };

  // ─── Barres d'actions ───
  const boutonExporter = (cible) => (
    <BoutonActions
      id="haccp-exporter"
      label="Exporter"
      style={hs.exportBtn}
      titre="Exporter le registre"
      sections={[{ items: [
        { titre: 'Télécharger le PDF', detail: cible === 'releves' ? 'Journalier ou mensuel, au choix ensuite.' : 'La vue affichée.', onClick: () => cible === 'releves' ? setExportRelevesMode('pdf') : pdfUtils?.exportElementToPdf(cible, 'registre-haccp.pdf') },
        { titre: 'Imprimer', detail: 'Le même registre, envoyé à l\'imprimante.', onClick: () => cible === 'releves' ? setExportRelevesMode('print') : pdfUtils?.printElement(cible, 'Registre HACCP') },
      ] }]}
    />
  );

  let actions = null;
  if (activeTab === 'releves') {
    // zoneId par défaut à l'ouverture : sans ça le select AFFICHE la première
    // option mais le state reste vide. Heure pré-remplie à maintenant ; date
    // et heure restent libres (rattrapage par un responsable).
    actions = (
      <>
        <button style={hs.addBtn} onClick={()=>{setFormRel(f=>({...f, zoneId: f.zoneId || activeZones[0]?.id || '', heure: f.heure || zurichClock()}));setShowReleve(true);}}>Ajouter un relevé à la main</button>
        {boutonExporter('releves')}
      </>
    );
  } else if (activeTab === 'controles') {
    actions = (
      <>
        <button style={hs.addBtn} onClick={()=>{setFormCtrl(f=>({...f, templateId: f.templateId || activeTpls[0]?.id || '', heure: f.heure || zurichClock()}));setShowControl(true);}}>Enregistrer un contrôle</button>
        {boutonExporter('haccp-controls-print')}
      </>
    );
  } else if (activeTab === 'tracabilite' && canWrite) {
    actions = <button style={hs.addBtn} onClick={()=>triggerCapture && triggerCapture()}>Prendre une photo</button>;
  } else if (activeTab === 'config' && isConsultant) {
    actions = (
      <>
        <button style={hs.addBtn} onClick={()=>setZoneModal('new')}>Ajouter un frigo ou appareil</button>
        <button style={hs.exportBtn} onClick={()=>setCtrlModal('new')}>Ajouter un contrôle</button>
      </>
    );
  }

  // ─── Titre et ligne d'état de chaque écran ───
  const titresEcran = {
    tournee: tourneeGuide
      ? <>Relevé de <N>{tourneeGuide.heure}</N>{tourneeGuide.etat === 'en_retard' && <>, en retard</>}</>
      : ECRANS_HACCP.tournee,
  };
  const etatsEcran = {
    tournee: tourneeGuide
      ? <><N>{tourneeGuide.label}</N>, <N>{activeZones.length}</N> frigos et appareils</>
      : <><N>{activeZones.length}</N> frigos et appareils</>,
    etiquettes: <>Choisissez la préparation et imprimez : la date limite de consommation (DLC) se calcule toute seule.</>,
    tracabilite: canWrite
      ? <>Photographiez l'étiquette d'un produit reçu ou ouvert : on la retrouve ici en cas de contrôle.</>
      : <>Les photos des étiquettes des produits reçus ou ouverts.</>,
    controles: <>Cochez chaque contrôle quand il est fait.</>,
    releves: <>Les relevés jour par jour, à montrer en cas de contrôle.</>,
    config: <>Les frigos à relever, les heures de relevé et les contrôles de cet établissement.</>,
  };

  // Écrans qui lisent les données du module : rien n'y est affiché tant que
  // la lecture n'a pas abouti (jamais une liste vide à la place d'un échec).
  const blocLecture = (
    <MaintenantHaccp lecture={lecture === 'echec' ? 'echec' : 'chargement'} onReessayer={relire} />
  );

  const champDate = (
    <input type="date" aria-label="Jour" style={{ ...hs.datePicker, minHeight: 44, minWidth: 200, alignSelf: 'flex-start' }} value={dateFilter} onChange={e => e.target.value && setDateFilter(e.target.value)} />
  );

  return (
    <div style={hs.root}>
      {enEchecRelecture && <BandeauNonActualise onRetry={relire} />}

      {ecran === ECRAN_ACCUEIL ? (
        <>
          <MaintenantHaccp
            lecture={lecture}
            enEchecRelecture={enEchecRelecture}
            derniereMaj={derniereMaj}
            etat={etatJour}
            maintenant={maintenant}
            canWrite={canWrite}
            isConsultant={isConsultant}
            onReleve={ouvrirReleveGuide}
            onReglages={() => setEcran('config')}
            onReessayer={relire}
          />
          {aide.visible && <AideHaccp onFermer={aide.fermer} />}
          <AccueilHaccp controles={compte} canWrite={canWrite} onOuvrir={ouvrirEcran} />
          {(pret || isConsultant) && (
            <div className="module-toolbar">
              <div className="module-actions">
                {pret && boutonExporter('haccp-dashboard-print')}
                {/* Réglages du consultant : un bouton discret plutôt qu'une
                    cinquième tuile seule sur sa rangée. data-tuile : même
                    crochet du banc qu'avant. */}
                {isConsultant && (
                  <button type="button" data-tuile="config" style={hs.exportBtn} onClick={() => setEcran('config')}>Réglages</button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <EcranTache titre={titresEcran[ecran] || ECRANS_HACCP[ecran]} etat={etatsEcran[ecran]} onRetour={retourAccueil} actions={actions} />
      )}

      {/* ── LE JOUR (sur l'accueil) : programme, zones, à surveiller ── */}
      {activeTab==='tableau' && pret && (
        <div style={{display:'flex',flexDirection:'column',gap:18}} id="haccp-dashboard-print">
          <ProgrammeDuJour tournees={etatJour.tournees} titre="Le programme du jour" />
          {activeZones.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Frigos et appareils</div>
              <div style={hs.zoneGrid}>
                {activeZones.map(z => (
                  <ZoneTile
                    key={z.id} zone={z} last={latestByZone[z.id]} today={todayStr} trend={trendByZone[z.id]}
                    canWrite={canWrite} actif={inlineReleve === z.id} valeur={inlineTempInput} choix={inlineChoix}
                    enCours={inlineEnCours && inlineReleve === z.id}
                    onOuvrir={() => ouvrirInline(z.id)}
                    onFermer={() => setInlineReleve(null)}
                    onValeur={setInlineTempInput}
                    onChoix={setInlineChoix}
                    onEnregistrer={() => submitInlineReleve(z)}
                  />
                ))}
              </div>
            </section>
          )}
          <ProblemesHaccp
            titre="À surveiller"
            releves={horsPlageRecents}
            controles={problemesCtrlRecents}
            zones={zones}
            tpls={ctrlTpls}
            today={todayStr}
          />
        </div>
      )}
      {activeTab==='tableau' && !aide.visible && (
        <div>
          <button type="button" style={hs.lienAide} onClick={aide.revoir}>Revoir l'aide</button>
        </div>
      )}

      {/* ── RELEVÉ GUIDÉ ── */}
      {activeTab==='tournee' && canWrite && (pret ? (
        <ReleveGuide
          zones={activeZones}
          creneaux={activeCreneaux}
          tournee={tourneeGuide}
          relevesDuJour={relevesDuJour}
          brouillon={brouillon}
          etatLignes={etatLignes}
          enregistrement={guideEnCours}
          onLigne={majLigne}
          onEnregistrer={enregistrerReleveGuide}
        />
      ) : blocLecture)}

      {/* ── LE REGISTRE ── */}
      {activeTab==='releves' && (pret ? (
        <RegistreHaccp
          date={dateFilter}
          setDate={setDateFilter}
          today={todayStr}
          maintenant={maintenant}
          zones={zones}
          releves={releves}
          creneaux={creneaux}
          tpls={ctrlTpls}
          controls={controls}
          canManage={canManage}
          sel={sel}
          bulkBusy={bulkBusy}
          onSupprimer={deleteReleve}
          onSupprimerSelection={supprimerRelevesSelection}
          onExporterSelection={exporterRelevesSelection}
        />
      ) : blocLecture)}

      {/* ── CONTRÔLES ── */}
      {activeTab==='controles' && (pret ? (
        <div style={{display:'flex',flexDirection:'column',gap:16,minWidth:0}}>
          {champDate}
          <div style={{display:'flex',flexDirection:'column',gap:18,minWidth:0}} id="haccp-controls-print">
            <ControlesDuJour
              tpls={activeTpls}
              controls={controls}
              date={dateFilter}
              today={todayStr}
              enCours={controlesEnCours}
              onFait={controleFait}
              onProbleme={controleProbleme}
              annulables={idsAnnulables}
              annulationEnCours={annulationEnCours}
              onAnnuler={annulerControle}
            />
            <HistoriqueControles
              tpls={ctrlTpls}
              controls={controls}
              today={todayStr}
              canManage={canManage}
              onSupprimer={deleteControlRecord}
            />
          </div>
        </div>
      ) : blocLecture)}

      {/* ── TRAÇABILITÉ ── */}
      {activeTab==='tracabilite' && (
        <Tracabilite
          etabId={etabId}
          legacySB={legacySB}
          user={user}
          demoData={demoData}
          canWrite={canWrite}
          canManage={canManage}
          registerCaptureTrigger={registerCaptureTrigger}
        />
      )}

      {/* ── ÉTIQUETTES DLC ── */}
      {activeTab==='etiquettes' && canWrite && (
        <EtiquettesDlc etabId={etabId} legacySB={legacySB} user={user} />
      )}

      {/* ── CONFIG CONSULTANT ── */}
      {activeTab==='config' && isConsultant && !pret && blocLecture}
      {activeTab==='config' && isConsultant && pret && (
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          {/* Banner */}
          <div style={{background:'var(--nav)',borderRadius:10,padding:'16px 20px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:220}}>
              <div style={{color:'var(--nav-text-active)',fontWeight:700,fontSize:15,fontFamily:'var(--font-serif)'}}>Configuration HACCP, réservée au consultant</div>
              <div style={{color:'var(--nav-text)',fontSize:12,marginTop:3}}>Ces réglages valent pour toute l'équipe de l'établissement.</div>
            </div>
          </div>

          {/* Créneaux de relevé - grille horaire propre à l'établissement */}
          <div style={hcfg.section}>
            <div style={hcfg.sectionHeader}>
              <div>
                <div style={hcfg.sectionTitle}>Heures de relevé</div>
                <div style={hcfg.sectionSub}>
                  {creneaux.length === 0
                    ? <>Aucune heure réglée : l'équipe relève une fois par jour.</>
                    : <><N>{creneaux.length}</N> {creneaux.length>1?'heures réglées':'heure réglée'}, <N>{activeCreneaux.length}</N> {activeCreneaux.length>1?'actives':'active'}</>}
                </div>
              </div>
              <button style={hs.addBtn} onClick={()=>setCreneauModal('new')}>Ajouter une heure de relevé</button>
            </div>

            {creneaux.length === 0 ? (
              <div style={{padding:'16px 18px'}}>
                <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.55,marginBottom:14}}>
                  Les heures de relevé ne sont pas les mêmes d'une maison à l'autre : un seul service qui démarre à 6h ne se relève pas comme un double service midi et soir. Réglez ici les heures de l'établissement : la carte de l'accueil HACCP dit à l'équipe quand relever, et le tableau de bord signale un relevé en retard. Un relevé en dehors de ces heures reste toujours possible.
                </div>
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  {CRENEAUX_PRESETS.map(p=>(
                    <button key={p.id} onClick={()=>appliquerPresetCreneaux(p)} style={{...hs.periodBtn,width:'auto',flex:'1 1 240px',maxWidth:340}}>
                      <span style={{flex:1,minWidth:0}}>
                        <span style={{display:'block',fontSize:13,fontWeight:700,color:'var(--text)'}}>{p.label}</span>
                        <span style={{display:'block',fontSize:11,color:'var(--text2)',marginTop:2}}>{p.sub}</span>
                        <span style={{display:'block',fontSize:11,color:'var(--accent)',marginTop:3,fontWeight:500}}>{p.creneaux.map(c=>c.heure).join(', ')}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:0}}>
                {trierCreneaux(creneaux).map(c=>(
                  <div key={c.id} style={{...hcfg.row, opacity:c.actif?1:0.5}}>
                    <div style={{...hcfg.rowIcon,width:58,fontSize:14,fontWeight:700,fontFamily:'var(--font-num)',color:'var(--accent)'}}>{c.heure}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,color:'var(--text)',display:'flex',alignItems:'center',gap:8}}>
                        {c.label}
                        {!c.actif && <span style={{fontSize:11,fontWeight:500,background:'var(--bg)',color:'var(--text2)',padding:'2px 7px',borderRadius:10}}>Inactif</span>}
                      </div>
                      <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>
                        Relevé de <N>{activeZones.length}</N> {activeZones.length>1?'frigos et appareils':'frigo ou appareil'}
                      </div>
                    </div>
                    <div style={{...hcfg.toggle,background:c.actif?'var(--accent)':'var(--border)'}} onClick={()=>toggleCreneau(c)}>
                      <div style={{...hcfg.toggleThumb,left:c.actif?'calc(100% - 20px)':'2px'}}/>
                    </div>
                    <button style={hcfg.editBtn} onClick={()=>setCreneauModal(c)}>Modifier</button>
                    <button className="btn-suppr-discret" style={hcfg.deleteBtn} onClick={()=>deleteCreneau(c.id)}>Supprimer</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Zones */}
          <div style={hcfg.section}>
            <div style={hcfg.sectionHeader}>
              <div>
                <div style={hcfg.sectionTitle}>Frigos et appareils à relever</div>
                <div style={hcfg.sectionSub}><N>{zones.length}</N> {zones.length>1?'frigos et appareils':'frigo ou appareil'}, <N>{activeZones.length}</N> à relever</div>
              </div>
              <button style={hs.addBtn} onClick={()=>setZoneModal('new')}>Ajouter un frigo ou appareil</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {zones.map(z=>(
                <div key={z.id} style={{...hcfg.row, opacity:z.actif?1:0.5}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:'var(--text)',display:'flex',alignItems:'center',gap:8}}>
                      {z.nom}
                      {!z.actif && <span style={{fontSize:11,fontWeight:500,background:'var(--surface2)',color:'var(--text2)',padding:'2px 7px',borderRadius:10}}>Inactif</span>}
                    </div>
                    <div style={{fontSize:12,color:'var(--text2)',marginTop:2,lineHeight:1.4}}>
                      {ZONE_TYPES.find(t=>t.id===z.type)?.label}. <PlageTexte zone={z} />.
                      {z.cible != null && z.cible !== '' && <> Idéal : <Mesure valeur={z.cible} unite={z.unite || '°C'} />.</>}
                    </div>
                  </div>
                  {/* Toggle actif */}
                  <div style={{...hcfg.toggle,background:z.actif?'var(--accent)':'var(--border)'}}
                    onClick={()=>toggleZone(z)}>
                    <div style={{...hcfg.toggleThumb,left:z.actif?'calc(100% - 20px)':'2px'}}/>
                  </div>
                  <button style={hcfg.editBtn} onClick={()=>setZoneModal(z)}>Modifier</button>
                  <button className="btn-suppr-discret" style={hcfg.deleteBtn} onClick={()=>deleteZone(z.id)}>Supprimer</button>
                </div>
              ))}
            </div>
          </div>

          {/* Contrôles templates */}
          <div style={hcfg.section}>
            <div style={hcfg.sectionHeader}>
              <div>
                <div style={hcfg.sectionTitle}>Contrôles d'hygiène</div>
                <div style={hcfg.sectionSub}>{ctrlTpls.length} contrôle{ctrlTpls.length>1?'s':''} configuré{ctrlTpls.length>1?'s':''}, {activeTpls.length} actif{activeTpls.length>1?'s':''}</div>
              </div>
              <button style={{...hs.addBtn,background:'var(--nav)'}} onClick={()=>setCtrlModal('new')}>Ajouter un contrôle</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {ctrlTpls.map(c=>(
                <div key={c.id} style={{...hcfg.row,opacity:c.actif?1:0.5}}>
                  <div style={{...hcfg.rowIcon,fontSize:16,background:'var(--bg)',color:'var(--text2)'}}>{CTRL_TYPES.find(t=>t.id===c.type)?.label.slice(0,1)||'?'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:'var(--text)',display:'flex',alignItems:'center',gap:8}}>
                      {c.label}
                      {!c.actif&&<span style={{fontSize:11,fontWeight:500,background:'var(--surface2)',color:'var(--text2)',padding:'2px 7px',borderRadius:10}}>Inactif</span>}
                    </div>
                    <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>
                      {CTRL_TYPES.find(t=>t.id===c.type)?.label}, {c.frequence}
                      {c.description&&<span>, <em>{c.description.slice(0,60)}{c.description.length>60?'…':''}</em></span>}
                    </div>
                  </div>
                  <div style={{...hcfg.toggle,background:c.actif?'var(--accent)':'var(--border)'}}
                    onClick={()=>toggleCtrl(c)}>
                    <div style={{...hcfg.toggleThumb,left:c.actif?'calc(100% - 20px)':'2px'}}/>
                  </div>
                  <button style={hcfg.editBtn} onClick={()=>setCtrlModal(c)}>Modifier</button>
                  <button className="btn-suppr-discret" style={hcfg.deleteBtn} onClick={()=>deleteCtrl(c.id)}>Supprimer</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL « AJOUTER UN RELEVÉ À LA MAIN » ── */}
      {showReleve&&(
        <div className="modal-sheet-overlay" style={hs.overlay} onClick={()=>setShowReleve(false)}>
          <div className="modal-sheet" style={hs.modal} onClick={e=>e.stopPropagation()}>
            <div style={hs.modalHeader}><div style={hs.modalTitle}>Ajouter un relevé à la main</div><button type="button" className="ui-fermer" aria-label="Fermer" style={hs.closeBtn} onClick={()=>setShowReleve(false)}>×</button></div>
            <div style={hs.modalBody}>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Frigo ou appareil</label>
                  <select style={hs.fInput} value={formRel.zoneId} onChange={e=>setFormRel({...formRel,zoneId:e.target.value})}>
                    {(activeZones || []).map(z=><option key={z.id} value={z.id}>{z.nom}</option>)}
                  </select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:12}}>
                  <div style={hs.field}><label style={hs.fLabel}>Date</label><input type="date" style={hs.fInput} value={formRel.date} onChange={e=>setFormRel({...formRel,date:e.target.value})}/></div>
                  <div style={hs.field}><label style={hs.fLabel}>Heure *</label><input type="time" style={hs.fInput} value={formRel.heure} onChange={e=>setFormRel({...formRel,heure:e.target.value})}/></div>
                </div>
                {/* Heures de relevé de l'établissement : un tap pose l'heure prévue.
                    Le champ Heure reste modifiable pour un contrôle hors tournée. */}
                {aDesCreneaux && (
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    {activeCreneaux.map(c=>(
                      <button key={c.id} type="button"
                        onClick={()=>setFormRel({...formRel, heure:c.heure})}
                        style={{...hs.creneauChip, ...(formRel.heure===c.heure ? hs.creneauChipOn : {})}}>
                        {c.heure}, {c.label}
                      </button>
                    ))}
                    <button type="button" onClick={()=>setFormRel({...formRel, heure:zurichClock()})} style={hs.creneauChip}>Maintenant</button>
                  </div>
                )}
                {(() => {
                  const zone = zones.find(z=>z.id===formRel.zoneId);
                  const verdict = zone ? verdictReleve(zone, formRel.valeur) : null;
                  return (
                    <div style={hs.field}>
                      <label style={hs.fLabel}>Valeur mesurée * (<N>{zone?.unite}</N>)</label>
                      <input type="number" step="0.1" style={{...hs.fInput,fontSize:22,fontWeight:700,textAlign:'center',color:'var(--accent)'}}
                        placeholder={zone?.cible != null ? String(zone.cible) : ''}
                        value={formRel.valeur} onChange={e=>setFormRel({...formRel,valeur:e.target.value})}/>
                      {zone && verdict && (
                        <div style={{marginTop:8,...encadreStyle(verdict.ton === 'ok'?'succes':'erreur'),...encadreTitreStyle(verdict.ton === 'ok'?'succes':'erreur'),fontSize:13}}>
                          {verdict.mot}. <PlageTexte zone={zone} />.
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={hs.field}><label style={hs.fLabel}>Ce qui a été fait</label><textarea style={{...hs.fInput,resize:'vertical',minHeight:60}} value={formRel.commentaire} onChange={e=>setFormRel({...formRel,commentaire:e.target.value})}/></div>
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
            <div style={hs.modalHeader}><div style={hs.modalTitle}>Enregistrer un contrôle</div><button type="button" className="ui-fermer" aria-label="Fermer" style={hs.closeBtn} onClick={()=>setShowControl(false)}>×</button></div>
            <div style={hs.modalBody}>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Type de contrôle</label>
                  <select style={hs.fInput} value={formCtrl.templateId} onChange={e=>setFormCtrl({...formCtrl,templateId:e.target.value})}>
                    {(activeTpls || []).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:12}}>
                  <div style={hs.field}><label style={hs.fLabel}>Date</label><input type="date" style={hs.fInput} value={formCtrl.date} onChange={e=>setFormCtrl({...formCtrl,date:e.target.value})}/></div>
                  <div style={hs.field}><label style={hs.fLabel}>Heure *</label><input type="time" style={hs.fInput} value={formCtrl.heure} onChange={e=>setFormCtrl({...formCtrl,heure:e.target.value})}/></div>
                </div>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Résultat</label>
                  <div style={{display:'flex',gap:8}}>
                    {['conforme','non-conforme'].map(s=>(
                      <button key={s} onClick={()=>setFormCtrl({...formCtrl,statut:s})} style={{flex:1,minHeight:44,padding:'10px',borderWidth:2,borderStyle:'solid',borderColor:formCtrl.statut===s?(s==='conforme'?'var(--success-text)':'var(--danger-strong)'):'var(--border)',borderRadius:8,background:formCtrl.statut===s?(s==='conforme'?'var(--success-bg)':'var(--danger-bg)'):'var(--surface)',color:formCtrl.statut===s?(s==='conforme'?'var(--success-text)':'var(--danger-strong)'):'var(--text2)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'}}>
                        {s==='conforme'?'Bon':'Un problème'}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={hs.field}><label style={hs.fLabel}>Ce qui a été fait</label><textarea style={{...hs.fInput,resize:'vertical',minHeight:70}} value={formCtrl.notes} onChange={e=>setFormCtrl({...formCtrl,notes:e.target.value})}/></div>
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
      {creneauModal && <CreneauForm creneau={creneauModal==='new'?null:creneauModal} creneaux={creneaux} onSave={saveCreneau} onCancel={()=>setCreneauModal(null)}/>}

      {/* ─── Modale export relevés : période journalière ou mensuelle ─── */}
      {exportRelevesMode && (
        <div className="modal-sheet-overlay" style={hs.overlay} onClick={()=>!exportRelevesBusy && setExportRelevesMode(null)}>
          <div className="modal-sheet" style={{...hs.modal, width: 460}} onClick={e=>e.stopPropagation()}>
            <div style={hs.modalHeader}>
              <div style={hs.modalTitle}>{exportRelevesMode==='print' ? 'Imprimer les relevés' : 'Exporter les relevés en PDF'}</div>
              <button type="button" className="ui-fermer" aria-label="Fermer" style={hs.closeBtn} onClick={()=>!exportRelevesBusy && setExportRelevesMode(null)}>×</button>
            </div>
            <div style={hs.modalBody}>
              <div style={{fontSize:12, color:'var(--text2)', marginBottom:14, lineHeight:1.5}}>
                Choisissez la période du registre. Elle se base sur la date sélectionnée dans la barre d'outils.
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:10}}>
                {[
                  { id:'jour', label:'Journalier', sub:capitalize(fmtJour(dateFilter)), count:todayReleves.length },
                  { id:'mois', label:'Mensuel', sub:capitalize(moisLabel), count:monthReleves.length },
                ].map(opt=>(
                  <button key={opt.id} disabled={exportRelevesBusy}
                    style={{...hs.periodBtn, opacity:(opt.count===0 || exportRelevesBusy) ? 0.55 : 1}}
                    onClick={()=>runRelevesExport(opt.id)}>
                    <span style={{flex:1, minWidth:0}}>
                      <span style={{display:'block', fontSize:14, fontWeight:700, color:'var(--text)'}}>{opt.label}</span>
                      <span style={{display:'block', fontSize:11, color:'var(--text2)', marginTop:2}}>{opt.sub}, {opt.count} relevé{opt.count>1?'s':''}</span>
                    </span>
                    <span style={{color:'var(--text2)', fontSize:18, flexShrink:0}}>›</span>
                  </button>
                ))}
              </div>
              {exportRelevesBusy && <div style={{marginTop:12, fontSize:12, color:'var(--text2)', textAlign:'center'}}>Génération du document…</div>}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default HACCP;
