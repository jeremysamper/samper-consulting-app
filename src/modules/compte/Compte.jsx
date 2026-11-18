import React from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Search, X } from 'lucide-react';
import SafeModule from '../../legacy/SafeModule.jsx';
import { getBrowserWindow } from '../../legacy/legacyApi.js';
import { Btn } from '../../components/ui/index.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { goBack } from '../../services/historyNav.js';
import { navigateToPage } from '../../services/navigationService.js';
import { signalerReglage } from '../../services/reglagesSignal.js';
import { getPermissionsForRole } from '../../data/demoData.js';
import { readText, writeText, removeStorageKeys, UI_STORAGE_KEYS } from '../../utils/storage.js';
import { ongletCompteDepuisOutils } from '../moduleConfig.js';
import { chercherRenvois, chercherSections, cheminDe, entreesParGroupe, idEntree, renvoisVisibles, sectionsVisibles, signauxDe } from './registreReglages.js';
import './reglages.css';

// ─────────────────────────────────────────────────────────────────────────────
// PAGE DES RÉGLAGES (page hors menu 'compte') : tout ce qui se règle dans
// l'app, au même endroit. Née le 28.10.2026 comme espace Compte du consultant
// (Paramètres, Rôles & accès, Alertes), elle porte depuis le 12.11.2026 une
// section par réglage (registreReglages.js), chacune sous la garde de son
// module : chaque personne n'y voit que ce qu'elle règle déjà ailleurs.
//
// Hiérarchie (15.11.2026) : quatre espaces (Moi, Cet appareil, La maison, Les
// modules), une entrée par module qui porte ses sections en pilules, et une
// recherche en tête de liste.
//
// Écran large : la liste à gauche, une carte par espace ; l'entrée ouverte à
// droite, son espace au-dessus du titre, ses pilules dessous, la section dans
// une carte (direction Galet, lot 6).
// Écran étroit (téléphone, tablette, ordinateur à barre latérale ouverte sous
// 900 px de contenu) : la liste, puis l'entrée ; le geste retour ramène à la
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
  const [requete, setRequete] = React.useState('');

  // Dernière section ouverte dans chaque entrée de module : rouvrir Planning
  // ramène à la pilule où l'on était.
  const dernieres = React.useRef(new Map());

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

  // Écran étroit : une entrée choisie dans la liste est un niveau de plus, le
  // geste retour ramène à la liste. Ouverte par un raccourci, elle n'empile
  // rien : le geste retour ramène au module.
  const retourListe = React.useCallback(() => setOuverte({ id: null, direct: false }), []);
  // Raccourci d'un module : « Retour » y ramène ; sans page derrière, la liste.
  const retourModule = () => { if (!goBack()) retourListe(); };
  useBackLayer(etroit && Boolean(actif) && !ouverte.direct && isActive, retourListe, 'reglages-section');

  if (!sections.length) return null;

  const groupes = entreesParGroupe(sections);
  const toutesEntrees = groupes.flatMap((g) => g.entrees);
  const section = sections.find((s) => s.id === actif) || null;
  const entree = section ? toutesEntrees.find((e) => e.id === idEntree(section)) : null;
  if (section && entree) dernieres.current.set(entree.id, section.id);
  const resultats = chercherSections(sections, requete);
  // Petits réglages rendus à leur module : trouvés ici, réglés là-bas.
  const renvois = chercherRenvois(renvoisVisibles(ctx), requete);
  const enRecherche = requete.trim().length > 0;

  const choisirSection = (id) => setOuverte({ id, direct: false });
  const choisirEntree = (e) => {
    const derniere = dernieres.current.get(e.id);
    const id = e.sections.some((s) => s.id === derniere) ? derniere : e.sections[0].id;
    choisirSection(id);
  };
  // Une pilule garde la façon dont l'entrée a été ouverte (retour au module).
  const choisirPilule = (id) => setOuverte((o) => ({ id, direct: o.direct }));

  const recherche = (
    <div style={st.recherche} role="search" className="reglages-recherche">
      <Search size={18} strokeWidth={1.75} aria-hidden="true" style={st.rechercheIcone} />
      <input
        type="search"
        value={requete}
        onChange={(e) => setRequete(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && requete) { e.stopPropagation(); setRequete(''); } }}
        placeholder="Chercher un réglage"
        aria-label="Chercher un réglage"
        style={st.rechercheChamp}
        data-reglages-recherche=""
      />
      {enRecherche && (
        <button type="button" onClick={() => setRequete('')} aria-label="Effacer la recherche" style={st.rechercheEffacer}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const boutonEntree = ({ cle, libelle, detail, courant, onClick, nombre, attribut }) => (
    <button
      key={cle}
      type="button"
      data-cadre=""
      {...attribut}
      aria-current={courant ? 'page' : undefined}
      style={{ ...st.entree, ...(etroit ? st.entreeEtroite : null), ...(courant ? st.entreeActive : null) }}
      onClick={onClick}
    >
      <span style={st.entreeTexte}>
        <span style={st.entreeLibelle}>{libelle}</span>
        {detail && (
          <span style={{ ...st.entreeDetail, ...(courant ? st.entreeDetailActive : null) }}>
            {Array.isArray(detail) ? <Morceaux parties={detail} /> : detail}
          </span>
        )}
      </span>
      {!etroit && nombre > 1 && <span style={{ ...st.nombre, ...(courant ? st.nombreActif : null) }} aria-hidden="true" data-no-translate="">{nombre}</span>}
      {etroit && <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" style={st.chevron} />}
    </button>
  );

  const listeEntrees = groupes.map((groupe) => (
    <div key={groupe.id} role="group" aria-label={groupe.label} data-cadre="" style={etroit ? st.groupeEtroit : st.groupe}>
      <div style={etroit ? st.groupeTitreEtroit : st.groupeTitre}>{groupe.label}</div>
      {groupe.entrees.map((e) => boutonEntree({
        cle: e.id,
        libelle: e.libelle,
        detail: etroit ? e.detail : null,
        courant: !etroit && entree?.id === e.id,
        onClick: () => choisirEntree(e),
        nombre: e.sections.length,
        attribut: e.module ? { 'data-reglage-module': e.module } : { 'data-reglage': e.sections[0].id },
      }))}
    </div>
  ));

  const listeResultats = (
    <div role="group" aria-label="Résultats" data-cadre="" style={etroit ? st.groupeEtroit : st.groupe}>
      <div style={etroit ? st.groupeTitreEtroit : st.groupeTitre}>Résultats</div>
      {resultats.length === 0 && renvois.length === 0 && <p style={st.vide}>Aucun réglage ne correspond.</p>}
      {resultats.map((s) => boutonEntree({
        cle: s.id,
        libelle: s.libelle,
        detail: cheminDe(s),
        courant: !etroit && s.id === actif,
        onClick: () => choisirSection(s.id),
        attribut: { 'data-reglage': s.id },
      }))}
      {renvois.map((r) => (
        <button key={r.id} type="button" data-renvoi={r.id} style={{ ...st.entree, ...(etroit ? st.entreeEtroite : null) }} onClick={() => navigateToPage(r.page)}>
          <span style={st.entreeTexte}>
            <span style={st.entreeLibelle}>{r.libelle}</span>
            <span style={st.entreeDetail}>{r.ou}</span>
          </span>
          <span style={st.yAller}>
            <span>Y aller</span>
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  );

  const liste = (
    <nav aria-label="Réglages" style={etroit ? st.listeEtroite : st.liste} data-reglages-liste="">
      {recherche}
      {enRecherche ? listeResultats : listeEntrees}
    </nav>
  );

  // Les pilules d'une entrée à plusieurs sections.
  const pilules = entree && entree.sections.length > 1 ? (
    <SegmentedTabs
      tabs={entree.sections.map((s) => ({ id: s.id, label: s.onglet || s.libelle }))}
      active={actif}
      onChange={choisirPilule}
      retourLigne
    />
  ) : null;
  const titre = entree ? entree.libelle : section?.libelle;
  const espace = section ? cheminDe(section)[0] : '';

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
              <div style={st.titreEtroit}>
                <div style={st.espace}>{espace}</div>
                <div>{titre}</div>
              </div>
              {ouverte.direct && (
                <Btn variant="ghost" onClick={retourListe} style={st.tous}>Tous les réglages</Btn>
              )}
            </div>
            {pilules}
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
          <div style={st.enTeteLarge} className="no-print">
            <div style={st.enTete}>
              {/* Venue d'un module par son raccourci : le bouton y ramène, comme le geste retour. */}
              {ouverte.direct && (
                <Btn variant="ghost" onClick={retourModule} style={st.retour}>
                  <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span>Retour</span>
                </Btn>
              )}
              <div style={st.titreBloc}>
                <div style={st.espace}>{espace}</div>
                <h2 style={st.titre}>{titre}</h2>
              </div>
            </div>
            {pilules}
          </div>
        )}
        {corps}
      </div>
    </div>
  );
}

// Une liste de libellés, chacun dans son nœud : le traducteur les prend un par
// un dans le glossaire au lieu d'envoyer à l'IA chaque assemblage.
function Morceaux({ parties }) {
  return parties.map((partie, i) => (
    <React.Fragment key={partie}>
      {i > 0 && ', '}
      <span>{partie}</span>
    </React.Fragment>
  ));
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
    width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0,
    maxHeight: 'calc(100dvh - var(--app-header-h, 64px) - 48px)', overflowY: 'auto', overscrollBehavior: 'contain',
  },
  listeEtroite: { display: 'flex', flexDirection: 'column', gap: 16, width: '100%', minWidth: 0 },
  // Recherche : une pilule, comme celle de la barre du haut.
  recherche: {
    display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 6px 0 14px', boxSizing: 'border-box',
    background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r-full)',
    flexShrink: 0,
  },
  rechercheIcone: { flexShrink: 0, color: 'var(--text3)' },
  rechercheChamp: {
    flex: 1, minWidth: 0, minHeight: 40, padding: 0, background: 'transparent', borderWidth: 0, borderStyle: 'none',
    outline: 'none', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
  },
  rechercheEffacer: {
    width: 36, height: 36, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', borderWidth: 0, borderStyle: 'none', borderRadius: 'var(--r-full)', color: 'var(--text2)', cursor: 'pointer',
  },
  // Liste seule : une carte par espace ; dedans, une colonne au téléphone,
  // deux ou trois dès que la largeur le permet (tablette, ordinateur à barre
  // latérale ouverte), pour que toutes les entrées tiennent en un écran ou
  // presque.
  groupeEtroit: { ...carte, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 2, padding: 6 },
  groupeTitreEtroit: { gridColumn: '1 / -1', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', padding: '8px 10px 4px' },
  groupe: { ...carte, display: 'flex', flexDirection: 'column', gap: 2, padding: 6, flexShrink: 0 },
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
  entreeDetailActive: { color: 'var(--on-accent)' },
  // Nombre de sections d'une entrée de module : une pastille discrète.
  nombre: {
    flexShrink: 0, minWidth: 22, height: 22, padding: '0 6px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text2)', fontSize: 'var(--t1)', fontFamily: 'var(--font-num)',
  },
  nombreActif: { background: 'transparent', color: 'var(--on-accent)' },
  chevron: { flexShrink: 0, color: 'var(--text3)' },
  yAller: { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--lien)' },
  vide: { margin: 0, padding: '8px 10px 12px', fontSize: 'var(--t2)', color: 'var(--text2)' },
  volet: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  enTeteLarge: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  titreBloc: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  espace: { fontSize: 'var(--t2)', fontWeight: 'var(--g1)', color: 'var(--text3)', lineHeight: 1.3 },
  titre: { margin: 0, fontSize: 'var(--t6)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', color: 'var(--text)', lineHeight: 1.15 },
  enTete: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  retour: { minHeight: 44, flexShrink: 0 },
  tous: { minHeight: 44, flexShrink: 0, marginLeft: 'auto' },
  titreEtroit: { flex: '1 1 160px', minWidth: 0, fontSize: 'var(--t5)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', color: 'var(--text)', lineHeight: 1.15 },
  section: { display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' },
  sectionCarte: { ...carte, display: 'flex', flexDirection: 'column', width: '100%', padding: '20px 22px' },
  attente: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};
