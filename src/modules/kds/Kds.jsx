import React from 'react';
import { createPortal } from 'react-dom';
import { dbService } from '../../services/dbService.js';
import { getReglages, listSuitesLignes } from '../../services/caisseService.js';
import { useReglageModifie } from '../../services/reglagesSignal.js';
import { notify } from '../../components/toast/index.js';
import { navigateToPage } from '../../services/navigationService.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import { UI_STORAGE_KEYS, readText, writeText } from '../../utils/storage.js';
import { pollKdsOrders } from '../pos/lib/posApi.js';
import { fusionnerReglages, libelleMode } from '../caisse/reglages.js';
import { construireBons, rangerBons, lignesALire, estVivant, RANG_TENU } from './bons.js';
import {
  s, bonStyle, enteteStyle, chronoStyle, sectionStyle, platStyle, marqueStyle, qteStyle, nomStyle,
} from './Kds.styles.js';

// KDS - Passe cuisine, couplé à la caisse de la maison.
//
// Deux sources de bons, par établissement, sans réglage à faire :
//   - la caisse native : ses bons arrivent dans kds_orders par la RPC
//     caisse_envoyer_bon, l'écran les reçoit par Supabase Realtime ;
//   - Lightspeed : seulement si la maison y a une connexion (RPC
//     kds_lightspeed_actif). Ce module invoque alors l'edge function
//     pos-orders-poll toutes les ~15 s tant qu'il est affiché (ingestion
//     getCheck -> kds_orders/kds_order_items).
// Une maison sans Lightspeed ne lance aucun poll et ne voit ni accueil ni
// bandeau Lightspeed. Les deux sources peuvent coexister : leurs bons se
// mêlent par heure d'envoi.
//
// Un vrai bon de cuisine, en plus simple (demande du 2026-11-11) :
//   - un bon par table, avec toutes ses suites dans l'ordre et chacune à
//     part : En direct, À suivre, À suivre 2... (rangement : bons.js) ;
//   - la suite en cours est validée d'un seul toucher. Le bon reste, mais il
//     va tout à la fin du rail et laisse la place aux autres directs ;
//   - il revient de lui-même dans la file quand la salle réclame la suite, et
//     il se retrouve en glissant, ou d'un toucher sur « en attente » ;
//   - gros caractères, lignes hautes, plein écran au choix de l'appareil.
// Pensé pour le rush : actions optimistes (aucune attente réseau), une seule
// confirmation, quand on termine un bon dont des suites sont encore tenues.
// L'écran reste allumé (wake lock) tant que le KDS est ouvert.
//
// Écriture uniquement via RPC (kds_bump_item / kds_set_suite / kds_complete_order).
const POLL_MS = 15000;
// Filet de relecture : le temps réel peut se taire (veille, réseau du passe).
const RELECTURE_MS = 30000;
const RELECTURE_ECHEC_MS = 5000;
const AGE_WARN_MIN = 7;
const AGE_LATE_MIN = 12;
// Un bon validé garde sa place ce temps-là : le bon suivant ne glisse pas sous
// le doigt (un double toucher validerait le voisin), et le geste se relit.
const SORTIE_MS = 1500;
// Rail laissé ailleurs qu'au début : il y revient seul. L'écran au repos
// montre toujours les bons les plus anciens, et un nouveau direct ne tombe
// jamais derrière des bons en attente.
const RETOUR_MS = 15000;
const CONNECT_ROLES = ['consultant', 'patron'];

function elapsedLabel(depuis) {
  if (!depuis) return '';
  const sec = Math.max(0, Math.round((Date.now() - depuis) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function timeLabel(quand) {
  if (!quand) return '';
  try { return new Date(quand).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
function niveauAge(depuis) {
  const min = depuis ? (Date.now() - depuis) / 60000 : 0;
  if (min >= AGE_LATE_MIN) return 'retard';
  if (min >= AGE_WARN_MIN) return 'alerte';
  return 'calme';
}

// Plein écran du navigateur, quand il existe et qu'il sert : une app installée
// n'a déjà plus de barre à cacher. Jamais bloquant.
function estInstallee() {
  try {
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  } catch { return false; }
}
function entrerPleinNatif() {
  try {
    const el = document.documentElement;
    if (estInstallee() || !el.requestFullscreen || document.fullscreenElement) return;
    const r = el.requestFullscreen();
    if (r && r.catch) r.catch(() => {});
  } catch { /* refusé : le calque de l'app suffit */ }
}
function sortirPleinNatif() {
  try {
    if (!document.fullscreenElement || !document.exitFullscreen) return;
    const r = document.exitFullscreen();
    if (r && r.catch) r.catch(() => {});
  } catch { /* déjà quitté */ }
}

const Kds = ({ user, etablissement, isActive = true }) => {
  const etabId = etablissement?.id || null;
  const legacySB = dbService.getBridge();
  const canConnect = CONNECT_ROLES.includes(user?.role);

  const [orders, setOrders] = React.useState([]);
  // lignes : suite et ordre de saisie des lignes de caisse (id -> { suite, ordre }).
  const [lignes, setLignes] = React.useState(() => new Map());
  const [reglages, setReglages] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  // lecture : 'echec' quand la dernière lecture du passe n'a pas abouti.
  // L'écran garde alors ses derniers bons au lieu de se vider.
  const [lecture, setLecture] = React.useState('ok');
  // conn : état de la liaison Lightspeed déduit des réponses du poll.
  const [conn, setConn] = React.useState({ state: 'unknown', lastOkAt: null, error: null });
  // lightspeed : la maison a-t-elle une connexion Lightspeed ? null tant que
  // la réponse n'est pas connue (aucun poll dans le doute), puis true ou false.
  const [lightspeed, setLightspeed] = React.useState(null);
  // figes : bons qui viennent d'être validés ici (clé -> { jusqua, depuis }).
  const [figes, setFiges] = React.useState(() => new Map());
  const [plein, setPlein] = React.useState(() => readText(UI_STORAGE_KEYS.kdsPlein, '') === '1');
  // aDroite : bons à faire cachés à droite de l'écran (file plus longue que lui).
  const [aDroite, setADroite] = React.useState(0);
  const [, setTick] = React.useState(0); // re-render 1 s pour les chronos

  const lectures = useOrdreLectures();
  const ecritures = React.useRef(0);
  const bonsRef = React.useRef([]);
  const minuteries = React.useRef(new Map());
  const railRef = React.useRef(null);
  const dernierGeste = React.useRef(0);

  // ── Lecture des commandes (RLS lecture cuisine) ──
  // Une lecture ne repeint jamais par-dessus une écriture en cours : elle
  // montrerait l'état d'avant le geste. L'écriture relit quand elle a fini.
  const reload = React.useCallback(async () => {
    if (!legacySB || !etabId) { setLoading(false); return; }
    if (ecritures.current > 0) return;
    const essai = lectures.lancer(etabId);
    try {
      const rows = (await legacySB.db.listKdsOrders(etabId, { strict: true })) || [];
      const ids = lignesALire(rows);
      const lues = ids.length ? (await listSuitesLignes(ids)).data : null;
      if (ecritures.current > 0 || !essai.appliquer()) return;
      setOrders(rows);
      // Suites illisibles : on garde celles déjà connues, le rangement se replie.
      if (lues) setLignes(lues);
      setLecture('ok');
    } catch (err) {
      console.error('[KDS listKdsOrders]', err);
      if (essai.signalerEchec()) setLecture('echec');
    } finally {
      setLoading(false);
    }
  }, [legacySB, etabId, lectures]);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    reload();
    let unsub = null;
    if (legacySB) {
      unsub = legacySB.realtime.subscribeReload(['kds_orders', 'kds_order_items'], () => { if (mounted) reload(); });
    }
    return () => { mounted = false; unsub && unsub(); };
  }, [reload, legacySB]);

  // Filet : relecture au retour d'onglet, au retour du réseau, et à intervalle
  // (plus serré tant que la dernière lecture a échoué).
  React.useEffect(() => {
    if (!isActive) return undefined;
    const relire = () => { if (!document.hidden) reload(); };
    const id = setInterval(relire, lecture === 'echec' ? RELECTURE_ECHEC_MS : RELECTURE_MS);
    document.addEventListener('visibilitychange', relire);
    window.addEventListener('online', relire);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', relire);
      window.removeEventListener('online', relire);
    };
  }, [isActive, reload, lecture]);

  // ── Noms des suites : ceux que la maison a réglés en caisse ──
  React.useEffect(() => {
    let vivant = true;
    setReglages(null);
    if (!etabId) return undefined;
    getReglages(etabId).then(({ data }) => { if (vivant && data) setReglages(fusionnerReglages(data)); });
    return () => { vivant = false; };
  }, [etabId]);
  // Les noms des modes changés dans la page des réglages (section 'caisse')
  // s'appliquent au passe gardé monté, sans recharger l'app.
  useReglageModifie('caisse', () => {
    if (!etabId) return;
    getReglages(etabId).then(({ data }) => { if (data) setReglages(fusionnerReglages(data)); });
  });

  // ── Source des bons : la maison est-elle reliée à Lightspeed ? ──
  // Un booléen lu en base (aucun jeton). En cas d'échec de lecture, on ne
  // suppose rien : pas de poll, et une nouvelle tentative toutes les 15 s.
  React.useEffect(() => {
    setLightspeed(null);
    setConn({ state: 'unknown', lastOkAt: null, error: null });
    if (!isActive || !etabId || !legacySB) return undefined;
    let stopped = false;
    let timer = null;
    const lire = async () => {
      try {
        const actif = await legacySB.db.kdsLightspeedActif(etabId);
        if (!stopped) setLightspeed(actif);
      } catch (err) {
        console.error('[KDS kdsLightspeedActif]', err);
        if (!stopped) timer = setTimeout(lire, POLL_MS);
      }
    };
    lire();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [isActive, etabId, legacySB]);

  // ── Poll Lightspeed ~15 s tant que l'écran est affiché et visible, pour
  // une maison reliée à Lightspeed seulement ──
  React.useEffect(() => {
    if (!isActive || !etabId || lightspeed !== true) return undefined;
    let stopped = false;

    const doPoll = async () => {
      if (stopped || document.hidden) return;
      try {
        await pollKdsOrders(etabId);
        if (stopped) return;
        setConn({ state: 'ok', lastOkAt: Date.now(), error: null });
      } catch (err) {
        if (stopped) return;
        const p = err.payload || {};
        const msg = p.error || err.message || '';
        if (p.needs_reconnect) {
          setConn({ state: 'needs_reconnect', lastOkAt: null, error: msg });
        } else if (/Aucune connexion|non active|non configur/i.test(msg)) {
          setConn({ state: 'not_connected', lastOkAt: null, error: msg });
        } else {
          setConn((prev) => ({ state: 'error', lastOkAt: prev.lastOkAt, error: msg }));
        }
      }
    };

    doPoll();
    const id = setInterval(doPoll, POLL_MS);
    // Retour d'onglet / réveil tablette : re-poll immédiat, pas d'attente 15 s.
    const onVisible = () => { if (!document.hidden) doPoll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isActive, etabId, lightspeed]);

  // ── Wake lock : l'écran du passe ne se met pas en veille pendant le service ──
  React.useEffect(() => {
    if (!isActive || !navigator.wakeLock) return undefined;
    let lock = null;
    let released = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch { /* refusé (batterie, permission) : non bloquant */ }
    };
    acquire();
    const onVisible = () => { if (!document.hidden && !released) acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { lock && lock.release(); } catch { /* déjà relâché */ }
    };
  }, [isActive]);

  // ── Les bons : un par table, rangés en file, fin et terminées ──
  const bons = React.useMemo(() => construireBons(orders, lignes), [orders, lignes]);
  React.useEffect(() => { bonsRef.current = bons; }, [bons]);
  const { file, fin, terminees } = rangerBons(bons, { figes, maintenant: Date.now() });
  const nbAFaire = file.filter((b) => !b.sortant).length;

  // Bons à faire dont le début est hors de l'écran, à droite. Mesuré sur le
  // rail rendu : c'est lui qui sait ce qui tient.
  const mesurerRail = React.useCallback(() => {
    const rail = railRef.current;
    if (!rail) { setADroite(0); return; }
    const bord = rail.scrollLeft + rail.clientWidth - 48;
    let n = 0;
    rail.querySelectorAll('[data-kds-zone="file"]').forEach((el) => { if (el.offsetLeft > bord) n += 1; });
    setADroite(n);
  }, []);

  // ── Chaque seconde : chronos, horloge, mesure du rail, et retour au début
  // quand il est resté ailleurs sans qu'on y touche ──
  React.useEffect(() => {
    if (!isActive) return undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      mesurerRail();
      const rail = railRef.current;
      if (!rail || rail.scrollLeft <= 0) return;
      if (Date.now() - dernierGeste.current < RETOUR_MS) return;
      rail.scrollTo({ left: 0, behavior: 'smooth' });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, mesurerRail]);

  React.useEffect(() => {
    const enCours = minuteries.current;
    return () => { enCours.forEach((id) => clearTimeout(id)); enCours.clear(); };
  }, []);

  const noterGeste = () => { dernierGeste.current = Date.now(); };
  const surDefilement = () => { noterGeste(); mesurerRail(); };
  const allerAuDebut = () => {
    noterGeste();
    railRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  };
  const allerALaFin = () => {
    noterGeste();
    const rail = railRef.current;
    const debutFin = rail?.querySelector('[data-kds-fin]');
    if (rail && debutFin) rail.scrollTo({ left: Math.max(0, debutFin.offsetLeft - 12), behavior: 'smooth' });
  };
  const avancer = () => {
    noterGeste();
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: rail.clientWidth * 0.9, behavior: 'smooth' });
  };

  // ── Plein écran : un calque au-dessus de la coque, retenu par appareil ──
  const immersif = plein && isActive;
  const basculerPlein = (actif) => {
    setPlein(actif);
    writeText(UI_STORAGE_KEYS.kdsPlein, actif ? '1' : '0');
    if (actif) entrerPleinNatif(); else sortirPleinNatif();
  };
  // Le geste retour quitte le plein écran, pas le module.
  useBackLayer(immersif, () => basculerPlein(false), 'kds-plein-ecran');
  React.useEffect(() => {
    if (!immersif) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setPlein(false);
      writeText(UI_STORAGE_KEYS.kdsPlein, '0');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [immersif]);
  React.useEffect(() => () => sortirPleinNatif(), []);

  // ── Actions optimistes : l'UI répond au toucher, la RPC suit. En cas
  // d'échec, on remet ce qui était vrai avant le geste (relire ne suffit pas
  // quand c'est le réseau qui tombe), puis on relit. ──
  const patchItems = (ids, patch) => {
    setOrders((prev) => prev.map((o) => (o.items.some((i) => ids.has(i.id))
      ? { ...o, items: o.items.map((i) => (ids.has(i.id) ? { ...i, ...patch } : i)) }
      : o)));
  };
  const patchOrders = (ids, patch) => {
    setOrders((prev) => prev.map((o) => (ids.has(o.id) ? { ...o, ...patch } : o)));
  };
  const ecrire = async (fn, message, bon) => {
    const avant = new Map(bon.orders.map((o) => [o.id, o]));
    ecritures.current += 1;
    try {
      await fn();
    } catch (err) {
      console.error('[KDS rpc]', err);
      notify(`${message} : ${err?.message || 'erreur'}`, 'error');
      setOrders((prev) => prev.map((o) => avant.get(o.id) || o));
    } finally {
      ecritures.current -= 1;
      if (ecritures.current === 0) reload();
    }
  };

  const terminerBon = (bon, { confirmer = true } = {}) => {
    const restants = bon.nbAFaire + bon.nbTenus;
    if (confirmer && restants > 0
      && !window.confirm(`${restants} plat(s) pas encore parti(s) - terminer le bon quand même ?`)) return;
    const vivants = bon.vivants;
    if (vivants.length === 0) return;
    patchOrders(new Set(vivants.map((o) => o.id)), { completedAt: new Date().toISOString() });
    ecrire(async () => {
      for (const o of vivants) await legacySB.db.kdsCompleteOrder(o.id, true);
    }, 'Clôture non enregistrée', bon);
  };

  // Garde le bon à sa place le temps du délai. terminer : au bout du délai, un
  // bon où plus rien n'est à faire ni à attendre est terminé de lui-même
  // (tout a été coché à la main) ; un plat décoché entre-temps l'annule.
  const figer = (bon, { terminer = false } = {}) => {
    const { cle } = bon;
    const jusqua = Date.now() + SORTIE_MS;
    setFiges((prev) => new Map(prev).set(cle, { jusqua, depuis: prev.get(cle)?.depuis ?? bon.depuis ?? Date.now() }));
    clearTimeout(minuteries.current.get(cle));
    minuteries.current.set(cle, setTimeout(() => {
      minuteries.current.delete(cle);
      setFiges((prev) => { const m = new Map(prev); m.delete(cle); return m; });
      if (!terminer) return;
      const frais = bonsRef.current.find((b) => b.cle === cle);
      if (frais && frais.etat === 'pret') terminerBon(frais, { confirmer: false });
    }, SORTIE_MS));
  };

  const toggleBump = (bon, plat) => {
    const order = bon.orders.find((o) => o.id === plat.orderId);
    if (!order || !estVivant(order) || (plat.etat !== 'faire' && plat.etat !== 'fait')) return;
    const fait = plat.etat !== 'fait';
    patchItems(new Set([plat.id]), { bumpStatus: fait ? 'bumped' : 'pending', bumpedAt: fait ? new Date().toISOString() : null });
    if (fait) figer(bon, { terminer: true });
    ecrire(() => legacySB.db.kdsBumpItem(plat.id, fait), 'Plat non enregistré', bon);
  };

  // Valider : tout ce qui est à faire sur le bon est parti. S'il reste des
  // suites tenues, le bon va attendre à la fin ; sinon il est terminé.
  const validerBon = (bon) => {
    const aValider = bon.sections.flatMap((x) => x.plats).filter((p) => p.etat === 'faire');
    if (aValider.length === 0) return;
    const fini = bon.nbTenus === 0;
    const quand = new Date().toISOString();
    const vivants = bon.vivants;
    patchItems(new Set(aValider.map((p) => p.id)), { bumpStatus: 'bumped', bumpedAt: quand });
    if (fini) patchOrders(new Set(vivants.map((o) => o.id)), { completedAt: quand });
    figer(bon);
    // L'une après l'autre : chaque plat marqué fait écrit « prêt » sur sa
    // ligne de caisse, et ces écritures se gênent si elles partent ensemble.
    ecrire(async () => {
      for (const p of aValider) await legacySB.db.kdsBumpItem(p.id, true);
      if (fini) for (const o of vivants) await legacySB.db.kdsCompleteOrder(o.id, true);
    }, 'Validation non enregistrée', bon);
  };

  const holdItem = (bon, plat) => {
    patchItems(new Set([plat.id]), { aSuivre: true });
    ecrire(() => legacySB.db.kdsSetSuite(plat.id, true), 'Mise à suivre non enregistrée', bon);
  };

  // La cuisine lance elle-même des plats tenus, sans attendre la réclamation.
  const lancer = (bon, plats) => {
    const tenus = plats.filter((p) => p.etat === 'tenu');
    if (tenus.length === 0) return;
    patchItems(new Set(tenus.map((p) => p.id)), { aSuivre: false });
    ecrire(async () => {
      for (const p of tenus) await legacySB.db.kdsSetSuite(p.id, false);
    }, 'Relance non enregistrée', bon);
  };

  const rouvrirBon = (bon) => {
    const fermes = bon.orders.filter((o) => o.status === 'open' && o.completedAt);
    if (fermes.length === 0) return;
    patchOrders(new Set(fermes.map((o) => o.id)), { completedAt: null });
    ecrire(async () => {
      for (const o of fermes) await legacySB.db.kdsCompleteOrder(o.id, false);
    }, 'Réouverture non enregistrée', bon);
  };

  const openPos = () => navigateToPage('pos');

  // ── Onboarding : caisse pas encore connectée ──
  const renderOnboarding = (reconnect) => (
    <div style={s.onboard}>
      <h3 style={s.onboardTitle}>{reconnect ? 'Reconnexion Lightspeed requise' : 'Connecter la caisse Lightspeed'}</h3>
      <p style={s.onboardSub}>
        {reconnect
          ? 'Le KDS a besoin d’un nouveau droit (commandes en cours). Une reconnexion de 30 secondes suffit.'
          : 'Le KDS affiche les commandes en direct de la caisse. Connexion en 4 étapes, une seule fois.'}
      </p>
      <div style={s.onboardSteps}>
        <div style={s.onboardStep}>
          <span style={s.onboardNum}>1</span>
          <div>
            <div style={s.onboardText}>Ouvrir le module <strong>Ventes POS</strong></div>
            <div style={s.onboardHint}>Bouton ci-dessous - la barre de connexion Lightspeed est en haut du module.</div>
          </div>
        </div>
        <div style={s.onboardStep}>
          <span style={s.onboardNum}>2</span>
          <div>
            <div style={s.onboardText}>Cliquer « {reconnect ? 'Reconnecter' : 'Connecter'} Lightspeed » et valider l’accès</div>
            <div style={s.onboardHint}>
              {canConnect
                ? 'Une fenêtre Lightspeed s’ouvre : accepter les droits ventes + commandes.'
                : 'Réservé au patron ou au consultant - demandez-leur de valider cette étape.'}
            </div>
          </div>
        </div>
        <div style={s.onboardStep}>
          <span style={s.onboardNum}>3</span>
          <div>
            <div style={s.onboardText}>Choisir le restaurant si le compte en a plusieurs</div>
            <div style={s.onboardHint}>Sélecteur affiché automatiquement après l’autorisation.</div>
          </div>
        </div>
        <div style={s.onboardStep}>
          <span style={s.onboardNum}>4</span>
          <div>
            <div style={s.onboardText}>Revenir ici - détection automatique</div>
            <div style={s.onboardHint}>Le KDS vérifie la connexion toutes les 15 secondes, rien d’autre à faire.</div>
          </div>
        </div>
      </div>
      <button style={s.onboardCta} onClick={openPos}>Ouvrir Ventes POS</button>
      {conn.error ? <div style={s.onboardNote}>Détail technique : {conn.error}</div> : null}
    </div>
  );

  // ── Rendu d'un bon ──
  // Le nom d'une suite : celui réglé en caisse (En direct, À suivre, À suivre
  // 2...). Sans suite connue : « À suivre » pour les plats tenus, rien pour
  // les autres (un bon Lightspeed n'a qu'un seul service).
  const nomSection = (section) => {
    if (section.suite != null) return libelleMode(reglages, section.suite);
    return section.rang === RANG_TENU ? 'À suivre' : '';
  };

  // Le nombre, le nom et chaque précision dans leur propre nœud : des chaînes
  // fixes pour la traduction, et les précisions (cuisson, « sans ») une par
  // ligne, dans une couleur à part.
  const renderLibelle = (plat, genre) => (
    <span style={s.texte}>
      <span style={s.ligneNom}>
        {plat.qty != null && <span style={qteStyle(genre)} data-no-translate>{plat.qty}×</span>}
        <span style={nomStyle(genre)}>{plat.nom}</span>
      </span>
      {plat.modifiers.map((m, k) => (
        <span key={k} style={s.mods}>{m.quantity > 1 ? `${m.quantity}× ${m.name}` : m.name}</span>
      ))}
    </span>
  );

  const renderPlat = (bon, section, plat, grand) => {
    if (plat.etat === 'annule') {
      return (
        <div key={plat.id} style={s.voidRow}>
          <span style={s.voidText}>
            {plat.qty != null && <span data-no-translate>{plat.qty}× </span>}
            <span>{plat.nom}</span>
          </span>
          <span style={s.voidTag}>annulé</span>
        </div>
      );
    }
    if (plat.etat === 'tenu') {
      // Sur un bon de la caisse, la suite se lance d'un bloc (bouton de la
      // section). Ailleurs, plat par plat, comme la cuisine les a tenus.
      const unParUn = !bon.caisse || section.etat !== 'attente';
      return (
        <div key={plat.id} style={s.tenuRow} data-cadre="">
          {renderLibelle(plat, 'tenu')}
          {unParUn && <button style={s.relanceBtn} onClick={() => lancer(bon, [plat])}>Relancer</button>}
        </div>
      );
    }
    const fait = plat.etat === 'fait';
    const modifiable = bon.vivants.some((o) => o.id === plat.orderId) && !bon.sortant;
    let genre = 'faire';
    if (fait) genre = grand ? 'fait' : 'parti';
    return (
      <div key={plat.id} style={platStyle(fait, grand)}>
        <button style={s.mainBtn} disabled={!modifiable} onClick={() => toggleBump(bon, plat)}>
          <span style={marqueStyle(fait, grand)} aria-hidden="true">{fait ? '✓' : ''}</span>
          {renderLibelle(plat, genre)}
        </button>
        {/* Tenir un plat à la main : pour un bon sans suites (Lightspeed). Sur
            un bon de la caisse, c'est la salle qui range les suites : un plat
            tenu ici ne pourrait plus être réclamé depuis la caisse. */}
        {!fait && !bon.caisse && (
          <button style={s.tenirBtn} onClick={() => holdItem(bon, plat)}>À suivre</button>
        )}
      </div>
    );
  };

  const renderSection = (bon, section) => {
    const nom = nomSection(section);
    // Une suite déjà partie se replie en lignes basses. Pas pendant le délai
    // de sortie : rien ne bouge sous le doigt.
    const grand = section.etat !== 'fait' || bon.sortant || bon.sections.length === 1;
    let etat = 'fait';
    if (section.etat === 'faire') etat = 'à faire';
    else if (section.etat === 'attente') etat = 'en attente';
    return (
      <div key={section.rang} style={sectionStyle(section.etat)} data-kds-suite={section.suite ?? ''} data-kds-etat={section.etat}>
        {nom && (
          <div style={s.sectionTete}>
            <span style={s.sectionNom(section.etat)}>{nom}</span>
            <span style={s.sectionEtat(section.etat)}>{etat}</span>
            {section.etat === 'attente' && (
              <button style={s.lancerBtn} onClick={() => lancer(bon, section.plats)}>Lancer</button>
            )}
          </div>
        )}
        {section.plats.map((plat) => renderPlat(bon, section, plat, grand))}
      </div>
    );
  };

  const renderTable = (bon, style) => {
    const no = bon.tableNo ? String(bon.tableNo) : '';
    if (!no) return <span style={style}>Sans table</span>;
    // Un numéro seul se lit « Table 12 » ; un nom de table (« Terrasse 3 »,
    // « Direct ») se suffit.
    if (/^\d+$/.test(no)) return <span style={style}><span>Table</span> <span data-no-translate>{no}</span></span>;
    return <span style={style} data-no-translate>{no}</span>;
  };

  const renderBon = (bon, enFile) => {
    const niveau = enFile && !bon.sortant ? niveauAge(bon.depuis) : 'calme';
    const aFaire = bon.sections.filter((x) => x.etat === 'faire');
    const cible = aFaire.length === 1 ? nomSection(aFaire[0]) : '';
    return (
      // data-cadre : le bon garde son cadre (la règle « Plus de carrés » d'app.css
      // l'aplatirait). Au passe, le cadre est ce qui sépare une table de l'autre.
      <div key={bon.cle} style={bonStyle(niveau, enFile)} data-cadre="" data-kds-zone={enFile ? 'file' : 'fin'} data-kds-bon={bon.sortant ? 'sortant' : bon.etat}>
        <div style={enteteStyle(niveau)}>
          {renderTable(bon, s.table)}
          {bon.couverts != null && <span style={s.couv}><span data-no-translate>{bon.couverts}</span> <span>couv.</span></span>}
          {enFile && !bon.sortant && bon.reclame && <span style={s.reclame}>Réclamé</span>}
          <span style={s.enteteDroite}>
            {enFile && !bon.sortant && <span style={chronoStyle(niveau)} data-no-translate>{elapsedLabel(bon.depuis)}</span>}
            {bon.sortant && <span style={s.etatValide}>Validé</span>}
            {!enFile && <span style={s.etatBon}>{bon.etat === 'attente' ? 'en attente' : 'tout est parti'}</span>}
          </span>
        </div>

        {bon.sections.map((section) => renderSection(bon, section))}

        <div style={s.pied}>
          {enFile && !bon.sortant && (
            <button style={s.validerBtn} onClick={() => validerBon(bon)}>
              <span>Valider</span>
              {cible && <span>{cible}</span>}
            </button>
          )}
          {bon.sortant && <div style={s.valideInfo}>Validé</div>}
          {!enFile && bon.etat === 'attente' && (
            <>
              <div style={s.piedTexte}>La suite arrive à la réclamation</div>
              <button style={s.terminerDiscret} onClick={() => terminerBon(bon)}>Terminer le bon</button>
            </>
          )}
          {!enFile && bon.etat === 'pret' && (
            <button style={s.terminerBtn} onClick={() => terminerBon(bon)}>Terminer le bon</button>
          )}
        </div>
      </div>
    );
  };

  // ── États de page ──
  // L'accueil, les bandeaux et le témoin de synchro ne concernent qu'une
  // maison reliée à Lightspeed (dont la liaison peut tomber). Une maison sur
  // la caisse native n'en voit aucun.
  const avecLightspeed = lightspeed === true;
  const auPasse = file.length + fin.length;
  const showOnboarding = avecLightspeed
    && (conn.state === 'not_connected' || conn.state === 'needs_reconnect') && auPasse === 0;

  const contenu = (
    <div
      style={immersif ? s.plein : s.root}
      data-kds-source={lightspeed === null ? 'inconnue' : (avecLightspeed ? 'lightspeed' : 'caisse')}
      data-kds-plein={immersif ? 'oui' : 'non'}
    >
      <div style={s.header}>
        <h2 style={s.title}>KDS Cuisine</h2>
        <button style={s.puce(true)} onClick={allerAuDebut}>
          <span style={s.puceNum} data-no-translate>{nbAFaire}</span>
          <span>à faire</span>
        </button>
        {aDroite > 0 && (
          <button style={s.puce(true)} onClick={avancer}>
            <span style={s.puceNum} data-no-translate>+{aDroite}</span>
            <span>à droite</span>
          </button>
        )}
        {fin.length > 0 && (
          <button style={s.puce(false)} onClick={allerALaFin}>
            <span style={s.puceNum} data-no-translate>{fin.length}</span>
            <span>en attente</span>
          </button>
        )}
        <div style={s.headerDroite}>
          {avecLightspeed && (
            <div style={s.syncWrap}>
              <span style={s.syncDot(conn.state === 'ok')} />
              {conn.state === 'ok' && conn.lastOkAt
                ? <span data-no-translate>sync {timeLabel(conn.lastOkAt)}</span>
                : <span>hors synchro</span>}
            </div>
          )}
          <span style={s.horloge} data-no-translate>{timeLabel(Date.now())}</span>
          <button style={s.pleinBtn} onClick={() => basculerPlein(!plein)}>
            {plein ? 'Quitter le plein écran' : 'Plein écran'}
          </button>
        </div>
      </div>

      {lecture === 'echec' && (
        <div style={s.banner}>
          Connexion perdue - l’écran garde les derniers bons reçus et réessaie tout seul.
          <button style={s.bannerBtn} onClick={reload}>Réessayer</button>
        </div>
      )}
      {avecLightspeed && conn.state === 'error' && (
        <div style={s.banner}>
          Synchronisation Lightspeed en erreur - l’écran continue sur les dernières données.
          <span style={{ fontSize: 13, opacity: 0.8 }}>{conn.error}</span>
        </div>
      )}
      {avecLightspeed && (conn.state === 'not_connected' || conn.state === 'needs_reconnect') && auPasse > 0 && (
        <div style={s.banner}>
          {conn.state === 'needs_reconnect' ? 'Reconnexion Lightspeed requise (droit commandes).' : 'Caisse Lightspeed non connectée.'}
          <button style={s.bannerBtn} onClick={openPos}>Ouvrir Ventes POS</button>
        </div>
      )}

      {loading ? (
        <div style={s.empty}>Chargement du passe…</div>
      ) : showOnboarding ? (
        renderOnboarding(conn.state === 'needs_reconnect')
      ) : auPasse === 0 ? (
        <div style={s.empty}>
          Aucune commande en cours.
          <div style={s.emptySub}>Les bons apparaissent automatiquement dès l’envoi en caisse.</div>
        </div>
      ) : (
        <div ref={railRef} style={s.rail} onScroll={surDefilement} onPointerDown={noterGeste} data-kds-rail="">
          {file.length === 0 && <div style={s.rienAFaire}>Rien à faire pour l’instant</div>}
          {file.map((bon) => renderBon(bon, true))}
          {fin.length > 0 && (
            <div style={s.separateur} data-kds-fin="">
              <span style={s.separateurTexte}>En attente</span>
            </div>
          )}
          {fin.map((bon) => renderBon(bon, false))}
        </div>
      )}

      {terminees.length > 0 && (
        <div style={s.doneWrap}>
          <div style={s.doneHead}>
            <span><span>Terminées</span> <span data-no-translate>({terminees.length})</span></span>
            <span style={s.doneHeadSub}>conservées pour revue</span>
          </div>
          <div style={s.doneGrid}>
            {terminees.map((bon) => (
              <div key={bon.cle} style={s.doneCard}>
                <div style={s.doneCardHead}>
                  {renderTable(bon, s.doneTable)}
                  <span style={s.doneQuand}>
                    {bon.fermeEnCaisse
                      ? 'fermée en caisse'
                      : <span><span>terminée</span> <span data-no-translate>{timeLabel(bon.termineLe)}</span></span>}
                  </span>
                </div>
                {bon.sections.flatMap((x) => x.plats).map((plat) => (
                  <div key={plat.id} style={{ ...s.doneLine, ...(plat.active ? {} : { textDecoration: 'line-through' }) }}>
                    {plat.qty != null && <span data-no-translate>{plat.qty}× </span>}
                    <span>{plat.nom}</span>
                  </div>
                ))}
                {bon.orders.some((o) => o.status === 'open' && o.completedAt) && (
                  <button style={s.reopenBtn} onClick={() => rouvrirBon(bon)}>Rouvrir au passe</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return immersif ? createPortal(contenu, document.body) : contenu;
};

export default Kds;
