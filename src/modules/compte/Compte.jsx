import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import SafeModule from '../../legacy/SafeModule.jsx';
import { getBrowserWindow } from '../../legacy/legacyApi.js';
import { Btn } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { goBack } from '../../services/historyNav.js';
import { signalerReglage } from '../../services/reglagesSignal.js';
import { getPermissionsForRole } from '../../data/demoData.js';
import { readText, writeText, removeStorageKeys, UI_STORAGE_KEYS } from '../../utils/storage.js';
import { ongletCompteDepuisOutils } from '../moduleConfig.js';
import { sectionsParGroupe, sectionsVisibles, signauxDe } from './registreReglages.js';
import './reglages.css';

// ─────────────────────────────────────────────────────────────────────────────
// PAGE DES RÉGLAGES (page hors menu 'compte') : tout ce qui se règle dans
// l'app, au même endroit. Née le 28.10.2026 comme espace Compte du consultant
// (Paramètres, Rôles & accès, Alertes), elle porte depuis le 12.11.2026 une
// section par réglage (registreReglages.js), chacune sous la garde de son
// module : chaque personne n'y voit que ce qu'elle règle déjà ailleurs.
//
// Écran large : la liste des sections à gauche, une carte par famille ; la
// section ouverte à droite, dans une carte (direction Galet, lot 6).
// Écran étroit (téléphone, tablette, ordinateur à barre latérale ouverte sous
// 900 px de contenu) : la liste, puis la section ; le geste retour ramène à la
// liste. Une section ouverte par le raccourci d'un module (ouvrirCompte) s'ouvre
// directement : le geste retour ramène au module.
//
// Chaque section monte l'écran d'origine tel quel, dans un SafeModule. En la
// quittant, la page signale son réglage : le module d'origine relit
// (services/reglagesSignal.js).
//
// Clés et événement inchangés : sc_compte_tab (ponctuelle), sc_compte_last_tab,
// 'sc:compte-tab' ; 'parametres', 'roles' et 'alertes' sont trois sections.
// ─────────────────────────────────────────────────────────────────────────────

const LARGEUR_DEUX_VOLETS = 900;
// La section ouverte ne se pose dans une carte qu'à partir de cette largeur de
// contenu : en dessous, le retrait de la carte faisait perdre sa colonne à une
// grille de section (réservation en ligne, deux colonnes de 340 px à la
// tablette), mesuré au banc. La section reste alors posée sur la page.
const LARGEUR_CARTE_SECTION = 1100;

// Le changement d'une section, signalé à ses lecteurs (son module d'origine).
const signalerSection = (id) => signauxDe(id).forEach(signalerReglage);

// Un composant paresseux par section, créé une fois.
const composants = new Map();
function composantDe(section) {
  if (!composants.has(section.id)) composants.set(section.id, React.lazy(section.charger));
  return composants.get(section.id);
}

// Section demandée par un raccourci (clé ponctuelle). Lecture seule : React
// peut rejouer un premier rendu avant de l'afficher (une section paresseuse
// qui charge), la clé n'est donc effacée qu'une fois la page montée.
function sectionDemandee(ids) {
  try {
    const pre = readText(UI_STORAGE_KEYS.compteTab, '');
    if (pre && ids.includes(pre)) return pre;
  } catch (e) { /* stockage indisponible */ }
  return null;
}

// Section rouverte à l'arrivée par le bouton « Réglages » (deux volets) :
// dernière section visitée > section d'administration où l'on travaillait dans
// les Outils consultant (première ouverture) > première de la liste.
function sectionParDefaut(ids) {
  try {
    const last = readText(UI_STORAGE_KEYS.compteLastTab, '');
    if (ids.includes(last)) return last;
    const depuisOutils = ongletCompteDepuisOutils(readText(UI_STORAGE_KEYS.consultantToolsLastTab, ''));
    if (ids.includes(depuisOutils)) return depuisOutils;
  } catch (e) { /* stockage indisponible : première section */ }
  return ids[0] || null;
}

function largeurInitiale() {
  const w = getBrowserWindow();
  // Avant la première mesure : la fenêtre moins la barre latérale et les marges.
  return w ? w.innerWidth - 290 : LARGEUR_DEUX_VOLETS;
}

export default function Compte({ user, etablissement, shellMode = 'ordinateur', isActive = true }) {
  const permissions = getPermissionsForRole(user?.role);
  const ctx = { user, permissions, etablissement, shellMode };
  const sections = sectionsVisibles(ctx);
  const ids = sections.map((s) => s.id);
  const idsCle = ids.join('|');
  const idsRef = React.useRef(ids);
  idsRef.current = ids;

  // Largeur du contenu : elle décide entre deux volets et « liste puis section ».
  const racineRef = React.useRef(null);
  const [largeur, setLargeur] = React.useState(largeurInitiale);
  React.useLayoutEffect(() => {
    const el = racineRef.current;
    if (!el) return undefined;
    const mesurer = () => { if (el.offsetWidth > 0) setLargeur(el.offsetWidth); };
    mesurer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const etroit = shellMode === 'telephone' || largeur < LARGEUR_DEUX_VOLETS;
  const enCarte = !etroit && largeur >= LARGEUR_CARTE_SECTION;

  // { id, direct } : direct = ouverte par un raccourci (retour = le module),
  // sinon choisie dans la liste (retour = la liste, sur écran étroit).
  const [ouverte, setOuverte] = React.useState(() => {
    const demandee = sectionDemandee(ids);
    if (demandee) return { id: demandee, direct: true };
    return { id: etroit ? null : sectionParDefaut(ids), direct: false };
  });
  const actif = ids.includes(ouverte.id) ? ouverte.id : null;
  React.useEffect(() => { removeStorageKeys([UI_STORAGE_KEYS.compteTab]); }, []);

  // Deux volets : jamais de volet vide. Une section perdue (droit retiré,
  // établissement sans le module) laisse la place à la section par défaut.
  React.useEffect(() => {
    if (etroit || actif) return;
    const defaut = sectionParDefaut(idsRef.current);
    if (defaut) setOuverte({ id: defaut, direct: false });
  }, [etroit, actif, idsCle]);

  React.useEffect(() => { if (actif) writeText(UI_STORAGE_KEYS.compteLastTab, actif); }, [actif]);

  // Page déjà montée (keep-alive) : ouvrirCompte prévient par un événement.
  React.useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return undefined;
    const surSection = (event) => {
      const tab = event?.detail?.tab;
      if (!idsRef.current.includes(tab)) return;
      removeStorageKeys([UI_STORAGE_KEYS.compteTab]);
      setOuverte({ id: tab, direct: true });
    };
    browserWindow.addEventListener('sc:compte-tab', surSection);
    return () => browserWindow.removeEventListener('sc:compte-tab', surSection);
  }, []);

  // Section quittée (autre section, autre page, page démontée) : son module
  // d'origine relit, la nouvelle valeur s'y applique sans recharger l'app.
  React.useEffect(() => {
    if (!isActive || !actif) return undefined;
    return () => signalerSection(actif);
  }, [actif, isActive]);

  // Écran étroit : une section choisie dans la liste est un niveau de plus, le
  // geste retour ramène à la liste. Ouverte par un raccourci, elle n'empile
  // rien : le geste retour ramène au module.
  const retourListe = React.useCallback(() => setOuverte({ id: null, direct: false }), []);
  // Raccourci d'un module : « Retour » y ramène ; sans page derrière, la liste.
  const retourModule = () => { if (!goBack()) retourListe(); };
  useBackLayer(etroit && Boolean(actif) && !ouverte.direct && isActive, retourListe, 'reglages-section');

  if (!sections.length) return null;

  const groupes = sectionsParGroupe(sections);
  const section = sections.find((s) => s.id === actif) || null;
  const choisir = (id) => setOuverte({ id, direct: false });

  const liste = (
    <nav aria-label="Réglages" style={etroit ? st.listeEtroite : st.liste} data-reglages-liste="">
      {groupes.map((groupe) => (
        <div key={groupe.id} role="group" aria-label={groupe.label} data-cadre="" style={etroit ? st.groupeEtroit : st.groupe}>
          <div style={etroit ? st.groupeTitreEtroit : st.groupeTitre}>{groupe.label}</div>
          {groupe.sections.map((s) => {
            const courant = !etroit && s.id === actif;
            return (
              <button
                key={s.id}
                type="button"
                data-cadre=""
                data-reglage={s.id}
                aria-current={courant ? 'page' : undefined}
                style={{ ...st.entree, ...(etroit ? st.entreeEtroite : null), ...(courant ? st.entreeActive : null) }}
                onClick={() => choisir(s.id)}
              >
                <span style={st.entreeTexte}>
                  <span style={st.entreeLibelle}>{s.libelle}</span>
                  {etroit && s.detail && <span style={st.entreeDetail}>{s.detail}</span>}
                </span>
                {etroit && <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" style={st.chevron} />}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const corps = section ? (
    <SectionMontee
      key={section.id}
      section={section}
      user={user}
      etablissement={etablissement}
      permissions={permissions}
      shellMode={shellMode}
      revenir={ouverte.direct ? retourModule : undefined}
      enCarte={enCarte}
    />
  ) : null;

  if (etroit) {
    return (
      <div ref={racineRef} style={st.racineEtroite} data-reglages="etroit">
        {!section && liste}
        {section && (
          <>
            <div style={st.enTete} className="no-print">
              <Btn variant="ghost" onClick={ouverte.direct ? retourModule : retourListe} style={st.retour}>
                <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>Retour</span>
              </Btn>
              <div style={st.titreEtroit}>{section.libelle}</div>
              {ouverte.direct && (
                <Btn variant="ghost" onClick={retourListe} style={st.tous}>Tous les réglages</Btn>
              )}
            </div>
            {corps}
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={racineRef} style={st.racine} data-reglages="large">
      {liste}
      <div style={st.volet}>
        {section && (
          <div style={st.enTete} className="no-print">
            {/* Venue d'un module par son raccourci : le bouton y ramène, comme le geste retour. */}
            {ouverte.direct && (
              <Btn variant="ghost" onClick={retourModule} style={st.retour}>
                <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>Retour</span>
              </Btn>
            )}
            <h2 style={st.titre}>{section.libelle}</h2>
          </div>
        )}
        {corps}
      </div>
    </div>
  );
}

// La section : l'écran d'origine, isolé (un écran qui plante ne fait pas
// tomber la page). Une section dont l'écran est une fenêtre la pose elle-même
// en ligne (EnSection, Fenetres.jsx) ; les fenêtres que les autres écrans
// ouvrent restent de vraies fenêtres. `revenir` n'est donné qu'à une section
// ouverte par le raccourci d'un module : un bouton qui fermait la fenêtre
// d'origine (« Enregistrer » des textes de facture) y ramène.
function SectionMontee({ section, user, etablissement, permissions, shellMode, revenir, enCarte = false }) {
  const Composant = composantDe(section);
  const signaler = React.useCallback(() => signalerSection(section.id), [section.id]);
  return (
    <div
      style={enCarte ? st.sectionCarte : st.section}
      className={enCarte ? 'reglages-section' : undefined}
      data-cadre={enCarte ? '' : undefined}
      data-section={section.id}
    >
      <SafeModule name={section.libelle}>
        <React.Suspense fallback={<p style={st.attente}>Chargement…</p>}>
          <Composant
            user={user}
            etablissement={etablissement}
            permissions={permissions}
            shellMode={shellMode}
            signaler={signaler}
            revenir={revenir}
          />
        </React.Suspense>
      </SafeModule>
    </div>
  );
}

// Direction Galet : une carte blanche par famille de sections (fond --zone,
// filet --rule-soft, rayon --r-lg, ombre --sh), ses entrées en lignes ; la
// section choisie en aplat sombre, comme l'entrée choisie d'un menu. La
// section ouverte est une carte à son tour dès 1100 px de contenu
// (reglages.css retire l'ombre des cartes que l'écran d'origine pose dedans).
const carte = {
  background: 'var(--zone)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)', boxSizing: 'border-box', minWidth: 0,
};

const st = {
  racine: { display: 'flex', alignItems: 'flex-start', gap: 24, minWidth: 0, width: '100%' },
  racineEtroite: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%' },
  // Deux volets : la liste reste en vue quand la section défile, et défile
  // seule si elle dépasse l'écran (--app-header-h : la barre du haut).
  liste: {
    width: 236, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0,
    maxHeight: 'calc(100dvh - var(--app-header-h, 64px) - 48px)', overflowY: 'auto', overscrollBehavior: 'contain',
  },
  listeEtroite: { display: 'flex', flexDirection: 'column', gap: 16, width: '100%', minWidth: 0 },
  // Liste seule : une carte par famille ; dedans, une colonne au téléphone,
  // deux ou trois dès que la largeur le permet (tablette, ordinateur à barre
  // latérale ouverte), pour que toutes les sections tiennent en un écran ou
  // presque.
  groupeEtroit: { ...carte, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 2, padding: 6 },
  groupeTitreEtroit: { gridColumn: '1 / -1', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', padding: '8px 10px 4px' },
  groupe: { ...carte, display: 'flex', flexDirection: 'column', gap: 2, padding: 6 },
  groupeTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', padding: '8px 10px 4px' },
  entree: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '8px 10px',
    background: 'transparent', border: 'none', borderRadius: 'var(--r)', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g1)', lineHeight: 1.25, textAlign: 'left', cursor: 'pointer',
  },
  entreeEtroite: { minHeight: 56, padding: '10px 12px', fontSize: 'var(--t2)' },
  entreeActive: { background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 'var(--g2)' },
  entreeTexte: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  entreeLibelle: { display: 'block' },
  entreeDetail: { display: 'block', fontSize: 'var(--t1)', fontWeight: 'var(--g1)', color: 'var(--text2)', lineHeight: 1.35 },
  chevron: { flexShrink: 0, color: 'var(--text3)' },
  volet: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  titre: { margin: 0, fontSize: 'var(--t6)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', color: 'var(--text)', lineHeight: 1.15 },
  enTete: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  retour: { minHeight: 44, flexShrink: 0 },
  tous: { minHeight: 44, flexShrink: 0, marginLeft: 'auto' },
  titreEtroit: { flex: '1 1 160px', minWidth: 0, fontSize: 'var(--t5)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', color: 'var(--text)', lineHeight: 1.15 },
  section: { display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' },
  sectionCarte: { ...carte, display: 'flex', flexDirection: 'column', width: '100%', padding: '20px 22px' },
  attente: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};
