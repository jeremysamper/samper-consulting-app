import React from 'react';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import SafeModule from '../../legacy/SafeModule.jsx';
import { getBrowserWindow } from '../../legacy/legacyApi.js';
import { Btn } from '../../components/ui/index.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { goBack } from '../../services/historyNav.js';
import { navigateToPage } from '../../services/navigationService.js';
import { signalerReglage } from '../../services/reglagesSignal.js';
import { getPermissionsForRole } from '../../data/demoData.js';
import { readText, removeStorageKeys, UI_STORAGE_KEYS } from '../../utils/storage.js';
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
// Grille (26.11.2026) : à l'arrivée, tous les réglages en tuiles, rangés par
// espace, chaque tuile avec sa ligne d'explication ; une recherche en tête.
// Une tuile ouvre son entrée sur toute la largeur (ses pilules dessous, la
// section dans une carte dès que la place le permet) ; « Retour » et le geste
// retour ramènent à la grille. Une section ouverte par le raccourci d'un
// module (ouvrirCompte) s'ouvre directement : le geste retour ramène au module.
//
// Chaque section monte l'écran d'origine tel quel, dans un SafeModule. En la
// quittant, la page signale son réglage : le module d'origine relit
// (services/reglagesSignal.js).
//
// Clé et événement inchangés : sc_compte_tab (ponctuelle), 'sc:compte-tab' ; 'parametres', 'roles' et 'alertes' sont trois sections.
// ─────────────────────────────────────────────────────────────────────────────

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

function largeurInitiale() {
  const w = getBrowserWindow();
  // Avant la première mesure : la fenêtre moins la barre latérale et les marges.
  return w ? w.innerWidth - 290 : LARGEUR_CARTE_SECTION;
}

export default function Compte({ user, etablissement, shellMode = 'ordinateur', isActive = true }) {
  const permissions = getPermissionsForRole(user?.role);
  const ctx = { user, permissions, etablissement, shellMode };
  const sections = sectionsVisibles(ctx);
  const ids = sections.map((s) => s.id);
  const idsCle = ids.join('|');
  const idsRef = React.useRef(ids);
  idsRef.current = ids;

  // Largeur du contenu : elle décide si la section ouverte se pose dans une carte.
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
  const enCarte = shellMode !== 'telephone' && largeur >= LARGEUR_CARTE_SECTION;

  // { id, direct } : direct = ouverte par un raccourci (retour = le module),
  // sinon choisie dans la grille (retour = la grille).
  const [ouverte, setOuverte] = React.useState(() => {
    const demandee = sectionDemandee(ids);
    return { id: demandee, direct: Boolean(demandee) };
  });
  const actif = ids.includes(ouverte.id) ? ouverte.id : null;
  const [requete, setRequete] = React.useState('');

  // Dernière section ouverte dans chaque entrée de module : rouvrir Planning
  // ramène à la pilule où l'on était.
  const dernieres = React.useRef(new Map());

  React.useEffect(() => { removeStorageKeys([UI_STORAGE_KEYS.compteTab]); }, []);

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

  // Une entrée choisie dans la grille est un niveau de plus, le geste retour
  // ramène à la grille. Ouverte par un raccourci, elle n'empile
  // rien : le geste retour ramène au module.
  const retourListe = React.useCallback(() => setOuverte({ id: null, direct: false }), []);
  // Raccourci d'un module : « Retour » y ramène ; sans page derrière, la grille.
  const retourModule = () => { if (!goBack()) retourListe(); };
  useBackLayer(Boolean(actif) && !ouverte.direct && isActive, retourListe, 'reglages-section');

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

  // Une tuile par réglage : son nom, puis une fine ligne qui dit ce qu'on y
  // règle. Le survol et le focus vivent dans reglages.css (.reglages-tuile).
  const tuile = ({ cle, libelle, detail, onClick, attribut }) => (
    <button key={cle} type="button" data-cadre="" className="reglages-tuile" {...attribut} style={st.tuile} onClick={onClick}>
      <span style={st.tuileLibelle}>{libelle}</span>
      {detail && (
        <span style={st.tuileDetail}>
          {Array.isArray(detail) ? <Morceaux parties={detail} /> : detail}
        </span>
      )}
    </button>
  );

  const listeEntrees = groupes.map((groupe) => (
    <section key={groupe.id} aria-label={groupe.label} style={st.groupe}>
      <h2 style={st.groupeTitre}>{groupe.label}</h2>
      <div style={st.grille}>
        {groupe.entrees.map((e) => tuile({
          cle: e.id,
          libelle: e.libelle,
          detail: e.detail,
          onClick: () => choisirEntree(e),
          attribut: e.module ? { 'data-reglage-module': e.module } : { 'data-reglage': e.sections[0].id },
        }))}
      </div>
    </section>
  ));

  const listeResultats = (
    <section aria-label="Résultats" style={st.groupe}>
      <h2 style={st.groupeTitre}>Résultats</h2>
      {resultats.length === 0 && renvois.length === 0 && <p style={st.vide}>Aucun réglage ne correspond.</p>}
      <div style={st.grille}>
        {resultats.map((s) => tuile({
          cle: s.id,
          libelle: s.libelle,
          detail: s.detail || cheminDe(s),
          onClick: () => choisirSection(s.id),
          attribut: { 'data-reglage': s.id },
        }))}
        {renvois.map((r) => (
          <button key={r.id} type="button" data-cadre="" className="reglages-tuile" data-renvoi={r.id} style={st.tuile} onClick={() => navigateToPage(r.page)}>
            <span style={st.tuileLibelle}>{r.libelle}</span>
            <span style={st.tuileDetail}>{r.ou}</span>
            <span style={st.yAller}>
              <span>Y aller</span>
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );

  const liste = (
    <nav aria-label="Réglages" style={st.liste} data-reglages-liste="">
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

  return (
    <div ref={racineRef} style={st.racine} data-reglages={section ? 'section' : 'grille'}>
      {!section && liste}
      {section && (
        <>
          <div style={st.enTete} className="no-print">
            <Btn variant="ghost" onClick={ouverte.direct ? retourModule : retourListe} style={st.retour}>
              <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Retour</span>
            </Btn>
            <div style={st.titreBloc}>
              <div style={st.espace}>{espace}</div>
              <h2 style={st.titre}>{titre}</h2>
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

const { background: _fondCarte, ...carteSansFond } = carte;

const st = {
  racine: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%' },
  liste: { display: 'flex', flexDirection: 'column', gap: 24, width: '100%', minWidth: 0 },
  // Recherche : une pilule, comme celle de la barre du haut.
  recherche: {
    display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 6px 0 14px', boxSizing: 'border-box',
    width: '100%', maxWidth: 420,
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
  // Un espace : son titre posé sur la page, puis ses tuiles en grille (une
  // colonne au téléphone, autant que la largeur en donne ailleurs).
  groupe: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  groupeTitre: { margin: 0, fontSize: 'var(--t3)', fontWeight: 'var(--g3)', fontFamily: 'var(--font)', color: 'var(--text)', lineHeight: 1.25 },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: 12, minWidth: 0 },
  // Le fond de la tuile vient de reglages.css, pour que le survol le change.
  tuile: {
    ...carteSansFond, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    width: '100%', minHeight: 84, padding: '14px 16px', color: 'var(--text)',
    fontFamily: 'var(--font)', textAlign: 'left', cursor: 'pointer',
  },
  tuileLibelle: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', lineHeight: 1.25 },
  tuileDetail: { display: 'block', fontSize: 'var(--t1)', fontWeight: 'var(--g1)', color: 'var(--text2)', lineHeight: 1.4 },
  yAller: { display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 'auto', paddingTop: 4, fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--lien)' },
  vide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  titreBloc: { flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  espace: { fontSize: 'var(--t2)', fontWeight: 'var(--g1)', color: 'var(--text3)', lineHeight: 1.3 },
  titre: { margin: 0, fontSize: 'var(--t5)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', color: 'var(--text)', lineHeight: 1.15 },
  enTete: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  retour: { minHeight: 44, flexShrink: 0 },
  tous: { minHeight: 44, flexShrink: 0, marginLeft: 'auto' },
  section: { display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' },
  sectionCarte: { ...carte, display: 'flex', flexDirection: 'column', width: '100%', padding: '20px 22px' },
  attente: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};
