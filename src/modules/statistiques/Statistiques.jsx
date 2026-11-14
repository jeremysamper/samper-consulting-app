import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './statistiques.css';
import { canManageModule, getPermissionsForRole } from '../../data/demoData.js';
import { getBrowserWindow } from '../../legacy/legacyApi.js';
import { useUserSettings } from '../../hooks/useUserSettings.js';
import { UI_STORAGE_KEYS, readJson, removeStorageKeys } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { notify } from '../../components/toast/index.js';
import { Btn, Panneau } from '../../components/ui/index.jsx';
import { BoutonActions, Fenetre, st as stFenetre } from '../../components/ui/Fenetres.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { useCompta } from '../comptabilite/useCompta.js';
import { estDirection } from '../comptabilite/gardesCompta.js';
import { FAMILLES, MESURES, familleDe, mesuresVisibles } from './catalogueMesures.js';
import { LECTURES, famillesVisibles } from './lecturesFamilles.js';
import { useLectureStatistiques } from './useLectureStatistiques.js';
import { PAS, bornesTranche, pasPossibles, trancheEntiere, tranchesDe } from './agregation.js';
import {
  CLE_VUE, CLE_VUES, COMPARAISONS, MAX_GRAPHIQUES, PERIODES, ajouterGraphique, bornesDe, bornesDeComparaison, filtresEffectifs, majGraphique, nettoyerVue, vueAvecBornes,
  retirerGraphique, vueDepuisLien, vuesNommeesLues,
} from './vueStatistiques.js';
import { composer, tableauDe } from './composition.js';
import Graphique, { Valeur } from './Graphique.jsx';
import TableauValeurs from './TableauValeurs.jsx';
import PanneauMesures from './PanneauMesures.jsx';
import { telechargerTableaux } from './exportStatistiques.js';
import VuesNommees from './VuesNommees.jsx';
import ChiffresDenses, { Ecart, TableauDense } from './ChiffresDenses.jsx';
import TuilesMesures from './TuilesMesures.jsx';
import { perimetreDe } from '../factures-achats/analysesAchats.js';
import { SERVICES_LABELS } from '../previsions/rapport/computeReservationStats.js';
import { dateComparable } from '../previsions/rapport/periodesRapport.js';
import { ORDRE_ANALYSES, RACCOURCIS, demandeRaccourci } from './raccourcisStatistiques.js';

// Le rapport complet de la caisse, chargé à sa première ouverture.
const RapportCaisse = lazy(() => import('./RapportCaisse.jsx'));

// ═════════════════════════════════════════════════════════════════════
// Statistiques : tous les chiffres que la personne voit ailleurs dans l'app,
// sur un graphique qui se recompose selon les cases cochées et les filtres.
//
// Le module ne calcule rien : le catalogue (catalogueMesures.js) lit des
// points rendus par les fonctions des modules d'origine, sur des lectures
// d'origine (lecturesFamilles.js). Les chiffres sont donc ceux des écrans
// d'origine, et une famille n'apparaît que pour qui voit son écran (D11).
//
// Il s'ouvre sur le graphique (D13) : la dernière vue de la personne
// (user_settings, clé statistiques_vue), sinon la première mesure visible sur
// 30 jours. Période, pas et comparaison sont communs aux graphiques ; chacun a
// ses cases (D7).
//
// Composition (14.11.2026) : le premier graphique prend toute la largeur et
// une grande part de la hauteur ; période, pas, comparaison et actions sont
// dans sa carte. Dessous, les tuiles de chiffres (TuilesMesures), puis les
// valeurs exactes, les lignes denses et les tableaux. En tête, une pilule par
// analyse venue d'un module (raccourcisStatistiques.js) et « Ma vue », la vue
// libre de la personne : une analyse ouverte ne remplace jamais « Ma vue ».
//
// Une lecture en échec s'affiche « non lu » avec « Réessayer », jamais comme
// un zéro (D9). Pas d'IA ici (D19).
// ═════════════════════════════════════════════════════════════════════

const SANS_INVENTAIRES = { data: [], status: 'ready' };
const EVENEMENT_LIEN = 'sc:statistiques-ouvrir';

const st = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' },
  barre: { display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-end', minWidth: 0 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t1)', color: 'var(--text2)', minWidth: 0 },
  select: { minHeight: 44, padding: '8px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--t2)', fontFamily: 'var(--font)', maxWidth: '100%', minWidth: 0 },
  resume: { fontSize: 'var(--t1)', color: 'var(--text2)', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
  // Cadre d'un graphique : la primitive Panneau, ses réglages d'agencement
  // seulement.
  carte: { padding: '20px 22px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 },
  // En-tête d'une carte : le titre (et la valeur de la période quand une seule
  // série est tracée) à gauche, les réglages à droite ; ils passent dessous
  // quand la place manque.
  tete: { display: 'flex', flexWrap: 'wrap', gap: '12px 20px', alignItems: 'flex-start', minWidth: 0 },
  teteTitre: { flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  titre: { fontSize: 'var(--t4)', fontWeight: 'var(--g3)', color: 'var(--text)', minWidth: 0 },
  vedette: { display: 'flex', alignItems: 'baseline', gap: '4px 10px', flexWrap: 'wrap', minWidth: 0 },
  grandChiffre: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t6)', lineHeight: 1.1, color: 'var(--text)' },
  options: { display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-end', justifyContent: 'flex-end', minWidth: 0, flex: '3 1 480px' },
  note: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.45 },
  etat: { fontSize: 'var(--t2)', color: 'var(--text2)', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  bouton: { minHeight: 44, flexShrink: 0 },
  menu: { ...stFenetre.secondaire, minHeight: 44, flexShrink: 0 },
};

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

// Tuiles sous le graphique principal : quatre au plus.
const MAX_TUILES = 4;
// Une mesure d'aujourd'hui (état) ou à choix (une zone, un produit) n'a pas de
// tuile : sa série n'est pas une valeur par tranche lisible sans son choix.
const aTuile = (m) => m.nature !== 'etat' && !m.choix;

// Hauteur de la fenêtre, pour donner au graphique principal une grande part
// de l'écran ; elle suit un redimensionnement.
function useHauteurFenetre() {
  const [hauteur, setHauteur] = useState(() => getBrowserWindow()?.innerHeight || 800);
  useEffect(() => {
    const w = getBrowserWindow();
    if (!w) return undefined;
    const maj = () => setHauteur(w.innerHeight || 800);
    w.addEventListener('resize', maj);
    return () => w.removeEventListener('resize', maj);
  }, []);
  return hauteur;
}

function useLargeur(ref) {
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver((entrees) => setLargeur(Math.round(entrees[0].contentRect.width)));
    obs.observe(el);
    setLargeur(Math.round(el.getBoundingClientRect().width));
    return () => obs.disconnect();
  }, [ref]);
  return largeur;
}

// Période, pas et comparaison : dans la page à l'ordinateur, dans une feuille
// au téléphone (D16).
// La vue sur une autre période ; le pas suit s'il n'est plus possible.
function vueAvecPeriode(vue, id, bornes, aujourdhui) {
  return vueAvecBornes(vue, id === 'libre' ? { id, debut: bornes.debut, fin: bornes.fin } : { id }, aujourdhui);
}

// Raccourci nommé par une demande d'ouverture, ou rien.
const raccourciDe = (demande) => (demande?.raccourci ? { id: demande.raccourci, vue: demande.vue } : null);

// Sélecteur du périmètre des achats (S3) ; rien s'il n'y en a qu'un.
function ChoixPerimetre({ vue, perimetres, onVue }) {
  if (!perimetres || perimetres.length < 2) return null;
  const valeur = perimetres.includes(vue.filtres?.perimetre) ? vue.filtres.perimetre : '';
  return (
    <label style={st.champ}>
      <span>Périmètre</span>
      <select style={st.select} value={valeur} onChange={(e) => onVue({ ...vue, filtres: { ...(vue.filtres || {}), perimetre: e.target.value } })} data-stat-perimetre="">
        <option value="">Tous les périmètres</option>
        {perimetres.map((p) => <option key={p} value={p} data-no-translate>{p}</option>)}
      </select>
    </label>
  );
}

// Service des réservations (S3, le filtre du rapport) ; seulement quand une
// mesure des réservations est tracée.
function ChoixService({ vue, services, onVue }) {
  if (!services || !services.length) return null;
  const valeur = services.includes(vue.filtres?.service) ? vue.filtres.service : '';
  return (
    <label style={st.champ}>
      <span>Service</span>
      <select style={st.select} value={valeur} onChange={(e) => onVue({ ...vue, filtres: { ...(vue.filtres || {}), service: e.target.value } })} data-stat-service="">
        <option value="">Tous les services</option>
        {services.map((s) => <option key={s} value={s}>{SERVICES_LABELS[s]}</option>)}
      </select>
    </label>
  );
}

function Filtres({ vue, bornes, bornesComp, aujourdhui, perimetres, services, onVue }) {
  const possibles = pasPossibles(bornes.debut, bornes.fin);
  const changerPeriode = (id) => onVue(vueAvecPeriode(vue, id, bornes, aujourdhui));
  const changerDate = (champ, valeur) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return;
    const b = bornesDe({ id: 'libre', debut: bornes.debut, fin: bornes.fin, [champ]: valeur }, aujourdhui);
    onVue(vueAvecBornes(vue, { id: 'libre', ...b }, aujourdhui));
  };
  return (
    <div className="statistiques-filtres" style={st.barre} data-stat-filtres="">
      <label style={st.champ}>
        <span>Période</span>
        <select style={st.select} value={vue.periode.id} onChange={(e) => changerPeriode(e.target.value)} data-stat-periode-choix="">
          {PERIODES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      {vue.periode.id === 'libre' ? (
        <>
          <label style={st.champ}>
            <span>Début</span>
            <input type="date" style={st.select} value={bornes.debut} onChange={(e) => changerDate('debut', e.target.value)} />
          </label>
          <label style={st.champ}>
            <span>Fin</span>
            <input type="date" style={st.select} value={bornes.fin} onChange={(e) => changerDate('fin', e.target.value)} />
          </label>
        </>
      ) : null}
      <ChoixPerimetre vue={vue} perimetres={perimetres} onVue={onVue} />
      <ChoixService vue={vue} services={services} onVue={onVue} />
      <div style={st.champ}>
        <span>Pas</span>
        <SegmentedTabs tabs={PAS.filter((p) => possibles.includes(p.id))} active={vue.pas} onChange={(pas) => onVue({ ...vue, pas })} />
      </div>
      <label style={st.champ}>
        <span>Comparer avec</span>
        <select style={st.select} value={vue.comparaison} onChange={(e) => onVue({ ...vue, comparaison: e.target.value })} data-stat-comparaison-choix="">
          {COMPARAISONS.map((c) => <option key={c.id || 'sans'} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <div style={{ ...st.resume, alignSelf: 'center' }} data-no-translate data-stat-bornes="">
        {bornesTranche(bornes)}{bornesComp ? ` / ${bornesTranche(bornesComp)}` : ''}
      </div>
    </div>
  );
}

// Une carte de graphique. La première (rang 0) est le graphique principal :
// pleine largeur, plus haute, et son en-tête porte `options`, les réglages
// communs à tous les graphiques (période, pas, comparaison, actions).
//   tableauDedans : les valeurs exactes sous le tracé, dans la carte ; sinon
//   l'appelant les pose dans leur propre carte, sous les tuiles.
function CarteGraphique({
  rang, nb, graphique, composition, tableau, tranches, mesures, familles, hauteur, libelleComparaison, options = null, resume = null, compact = false, tableauDedans = true,
  onChange, onRetirer, onReessayer, onAjouterGraphique, peutAjouter,
}) {
  const [casesOuvertes, setCasesOuvertes] = useState(false);
  const seule = graphique.mesures.length === 1 ? mesures.find((m) => m.id === graphique.mesures[0]) : null;
  const disponibles = composition.ventilationsDisponibles;
  const ventilations = (seule?.ventilations || []).filter((v) => !disponibles || disponibles.includes(v.id) || v.id === graphique.ventilation);
  const panneau = (
    <PanneauMesures
      familles={familles}
      mesures={mesures}
      cochees={graphique.mesures}
      onChange={(ids) => onChange({ mesures: ids, ...(ids.length !== 1 ? { ventilation: '' } : null) })}
      onReessayer={onReessayer}
      onAjouterGraphique={onAjouterGraphique}
      peutAjouter={peutAjouter}
    />
  );
  const LIBELLE_TYPE = { courbe: 'Courbe', barres: 'Barres', empile: 'Barres empilées' };
  // Valeurs d'aujourd'hui : leurs catégories (plats, fiches) tiennent lieu de
  // tranches, la période et le pas ne s'appliquent pas.
  const etat = !!composition.etat;
  const axe = etat ? composition.tranches : tranches;
  const coupees = !etat && tranches.some((t) => !t.complet);
  // Une seule série dans le temps : sa valeur de période en grand, sous le
  // titre (la même que la légende, celle de la fonction d'origine).
  const vedette = rang === 0 && !etat && !composition.ventilation && composition.series.length === 1 ? composition.series[0] : null;
  return (
    <div data-stat-carte={rang} style={{ minWidth: 0, ...(rang === 0 ? { gridColumn: '1 / -1' } : null) }}>
    <Panneau style={compact ? { ...st.carte, padding: 16 } : st.carte}>
      <div style={st.tete}>
        <div style={st.teteTitre}>
          <div style={st.titre} data-stat-titre="">
            {seule ? <span>{seule.libelle}</span> : (nb > 1 ? <><span>Graphique</span> <span data-no-translate>{rang + 1}</span></> : <span>Graphique</span>)}
          </div>
          {vedette && estNombre(vedette.total) ? (
            <div style={st.vedette} data-stat-vedette="">
              <span style={st.grandChiffre}><Valeur v={vedette.total} unite={vedette.unite} /></span>
              {libelleComparaison && estNombre(vedette.totalComparaison) ? (
                <span style={st.note}><span>{libelleComparaison}</span> : <span data-no-translate><Ecart e={vedette.ecartTotal} unite={vedette.unite} /></span></span>
              ) : null}
            </div>
          ) : null}
          {resume}
        </div>
        <div className="no-print" style={compact ? { ...st.options, justifyContent: 'flex-start', flex: '1 1 100%' } : st.options}>
        {options}
        <Btn variant="ghost" onClick={() => setCasesOuvertes(true)} style={st.bouton}>
          <span>Mesures</span> <span data-no-translate>({graphique.mesures.length})</span>
        </Btn>
        {ventilations.length ? (
          <select className="no-print" style={st.select} value={graphique.ventilation} onChange={(e) => onChange({ ventilation: e.target.value, type: '' })} aria-label="Ventilation" data-stat-ventilation="">
            <option value="">Sans ventilation</option>
            {ventilations.map((v) => <option key={v.id} value={v.id}>{v.libelle}</option>)}
          </select>
        ) : null}
        {(composition.choix || []).filter((c) => c.options.length).map((c) => (
          <select key={c.mesure} className="no-print" style={st.select} value={c.valeur || ''} onChange={(e) => onChange({ choix: { ...(graphique.choix || {}), [c.cle]: e.target.value } })} aria-label={c.libelle} data-stat-choix={c.mesure}>
            {c.options.map((o) => <option key={o.cle} value={o.cle} {...(o.traduire ? {} : { 'data-no-translate': '' })}>{o.libelle}</option>)}
          </select>
        ))}
        {composition.types.length > 1 ? (
          <SegmentedTabs tabs={composition.types.map((t) => ({ id: t, label: LIBELLE_TYPE[t] }))} active={composition.type} onChange={(type) => onChange({ type })} />
        ) : null}
        {nb > 1 ? <Btn variant="ghost" onClick={onRetirer} style={st.bouton}>Retirer</Btn> : null}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {composition.vide ? <div style={st.etat}>Cochez une mesure pour tracer le graphique.</div> : null}
          {composition.nonLues.map((id) => (
            <div key={id} style={st.etat} data-stat-non-lu={id}>
              <span>{familleDe(id)?.libelle}</span> <span>: non lu.</span>
              <Btn variant="ghost" onClick={() => onReessayer(id)} style={st.bouton}>Réessayer</Btn>
            </div>
          ))}
          {composition.enAttente.length ? <div style={st.etat} data-stat-attente="">Lecture en cours</div> : null}
          {composition.series.length ? (
            <>
              <Graphique composition={composition} tranches={axe} hauteur={hauteur} libelleComparaison={etat ? '' : libelleComparaison} />
              <div style={st.note} data-stat-phrases="">
                {composition.phrases.map((p) => (
                  <div key={p.id}><strong style={{ fontWeight: 'var(--g3)' }}>{p.libelle}</strong> : <span>{p.phrase}</span></div>
                ))}
                {composition.journees.length > 1 ? <div data-stat-journees=""><span>Ces mesures ne comptent pas la même journée :</span> {composition.journees.map((j, i) => <span key={j}>{i ? ', ' : ''}<span>{j}</span></span>)}.</div> : null}
                {composition.type === 'empile' ? <div>Les barres s'empilent de bas en haut, dans l'ordre de la légende.</div> : null}
                {composition.nonTracees > 0 ? <div data-stat-non-tracees=""><span>Catégories non tracées :</span> <span data-no-translate>{composition.nonTracees}</span>. <span>Un graphique porte six séries au plus, et une moyenne ou un relevé ne se regroupe pas.</span></div> : null}
                {composition.ventilation && libelleComparaison ? <div>Avec une ventilation, la comparaison se lit dans le tableau, sur la période entière.</div> : null}
                {coupees ? <div>La première ou la dernière tranche est coupée par la période : elle compte moins de jours.</div> : null}
                {etat ? <div data-stat-etat="">Valeurs d'aujourd'hui, aux prix et coûts actuels : la période et le pas ne s'appliquent pas.</div> : null}
                {etat && libelleComparaison ? <div>La comparaison est sans objet pour une valeur d'aujourd'hui.</div> : null}
              </div>
              {tableauDedans ? <TableauValeurs tableau={tableau} libelleComparaison={etat ? '' : libelleComparaison} /> : null}
            </>
          ) : null}
        </div>
      </div>
      {casesOuvertes ? (
        <Fenetre id={`stat-cases-${rang}`} titre="Mesures du graphique" sousTitre="Cochez ce que le graphique trace." onClose={() => setCasesOuvertes(false)} largeur={460}>
          {panneau}
        </Fenetre>
      ) : null}
    </Panneau>
    </div>
  );
}

export default function Statistiques({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const aujourdhui = zurichToday();
  const direction = estDirection(role);
  // « Régler les factures » : règlements et délai de paiement des achats, comme
  // l'écran des factures de l'Inventaire.
  const regleFactures = canManageModule(role, 'factures_achat');
  const racine = useRef(null);
  const largeur = useLargeur(racine);
  const etroit = largeur > 0 && largeur < 720;
  const large = largeur >= 1000;
  // Le graphique principal prend une grande part de l'écran ; au téléphone il
  // garde sa hauteur d'avant, pour ne pas repousser ce qui suit.
  const hauteurFenetre = useHauteurFenetre();
  const hauteurPrincipale = etroit ? 200 : Math.min(560, Math.max(large ? 300 : 240, Math.round(hauteurFenetre * (large ? 0.46 : 0.36))));
  const hauteurAutres = large ? 280 : etroit ? 200 : 220;

  // ── Accès (D11) ──
  const idsFamilles = famillesVisibles({ role, permissions: getPermissionsForRole(role), etablissement });
  const signatureFamilles = idsFamilles.join(',');

  const [vue, setVue] = useState(null);
  // Raccourci d'un écran d'analyse parti (S3) : ses vues en puces, la
  // vue choisie. Rien d'enregistré : il dure le temps de la visite.
  const [raccourci, setRaccourci] = useState(null);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [vuesOuvertes, setVuesOuvertes] = useState(false);
  const [pdfEnCours, setPdfEnCours] = useState(false);
  const reglages = useUserSettings([CLE_VUE, CLE_VUES]);
  const vuesNommees = useMemo(() => vuesNommeesLues(reglages.settings[CLE_VUES]), [reglages.settings]);

  const bornes = useMemo(() => bornesDe(vue?.periode || { id: '30j' }, aujourdhui), [vue?.periode, aujourdhui]);
  const bornesComp = useMemo(() => bornesDeComparaison(bornes, vue?.comparaison || ''), [bornes, vue?.comparaison]);
  const pas = vue?.pas || 'jour';
  const tranches = useMemo(() => tranchesDe(bornes.debut, bornes.fin, pas), [bornes, pas]);
  const tranchesComp = useMemo(() => (bornesComp ? tranchesDe(bornesComp.debut, bornesComp.fin, pas) : null), [bornesComp, pas]);

  // Familles à lire : celles des mesures cochées, parmi les familles visibles.
  const signatureCochees = vue ? [...vue.graphiques.map((g) => g.mesures.join(',')), (vue.chiffres || []).join(','), ...(vue.tableaux || []).map((t) => t.mesures.join(','))].join(';') : '';
  const famillesDemandees = useMemo(() => {
    const ouvertes = signatureFamilles ? signatureFamilles.split(',') : [];
    const ids = new Set();
    signatureCochees.split(/[;,]/).filter(Boolean).forEach((id) => {
      const m = MESURES.find((x) => x.id === id);
      if (m && ouvertes.includes(m.famille)) ids.add(m.famille);
    });
    return [...ids];
  }, [signatureCochees, signatureFamilles]);
  const demandes = useMemo(() => famillesDemandees.filter((f) => !LECTURES[f].parHook).flatMap((famille) => [
    { famille, debut: bornes.debut, fin: bornes.fin },
    ...(bornesComp ? [{ famille, debut: bornesComp.debut, fin: bornesComp.fin }] : []),
  ]), [famillesDemandees, bornes, bornesComp]);

  const { sondes, lectureDe, reessayer } = useLectureStatistiques({ etabId, aujourdhui, visibles: idsFamilles, demandes });

  // Filtres de famille (S3) : le périmètre des achats, comme les Analyses des
  // dépenses ; proposé dès que les pièces lues en portent plus d'un.
  const filtresCle = JSON.stringify(vue?.filtres || {});
  const vueComparaison = vue?.comparaison || '';
  const luAchats = famillesDemandees.includes('achats') ? lectureDe('achats', bornes.debut, bornes.fin) : null;
  const docsAchats = luAchats?.data?.docs;
  const perimetres = useMemo(() => [...new Set((docsAchats || []).map(perimetreDe))].sort((a, b) => a.localeCompare(b, 'fr')), [docsAchats]);
  const achatsLus = luAchats?.status === 'ready';
  const filtres = useMemo(() => filtresEffectifs(JSON.parse(filtresCle), perimetres, achatsLus), [filtresCle, perimetres, achatsLus]);
  const niveauCaisse = sondes.caisse?.status === 'ready' ? sondes.caisse.niveau : null;
  const mesures = useMemo(
    () => mesuresVisibles({ familles: signatureFamilles ? signatureFamilles.split(',') : [], niveauCaisse, direction, droits: { factures_achat: regleFactures } }),
    [signatureFamilles, niveauCaisse, direction, regleFactures],
  );
  const sondesPretes = idsFamilles.filter((f) => LECTURES[f].sonder).every((f) => ['ready', 'error'].includes(sondes[f]?.status));

  // ── Comptabilité : sa lecture est son hook, lancé seulement si demandé ──
  const comptaDemandee = famillesDemandees.includes('comptabilite');
  const periodeCompta = useMemo(() => ({ type: 'libre', debut: bornes.debut, fin: bornes.fin }), [bornes]);
  const precedenteCompta = useMemo(() => (bornesComp ? { type: 'libre', debut: bornesComp.debut, fin: bornesComp.fin } : null), [bornesComp]);
  const compta = useCompta({
    etablissement, periode: periodeCompta, precedente: precedenteCompta, aujourdhui, inventaires: SANS_INVENTAIRES, direction, banque: false, actif: comptaDemandee,
  });

  // ── Vue : lien d'entrée, sinon dernière vue, sinon vue par défaut (D13) ──
  const prendreLien = useCallback(() => {
    const demande = readJson(UI_STORAGE_KEYS.statistiquesOuvrir, null);
    removeStorageKeys([UI_STORAGE_KEYS.statistiquesOuvrir]);
    return demande;
  }, []);
  useEffect(() => {
    if (vue || !etabId || reglages.loading || !sondesPretes) return;
    const demande = prendreLien();
    const depuisLien = vueDepuisLien(demande, mesures, aujourdhui);
    setRaccourci(depuisLien ? raccourciDe(demande) : null);
    setVue(depuisLien || nettoyerVue(reglages.settings[CLE_VUE], mesures, aujourdhui));
  }, [vue, etabId, reglages.loading, reglages.settings, sondesPretes, mesures, aujourdhui, prendreLien]);
  // Module déjà monté (gardé en arrière-plan) : le lien prévient par un événement.
  useEffect(() => {
    const w = getBrowserWindow();
    if (!w) return undefined;
    const surLien = () => {
      const demande = prendreLien();
      const v = vueDepuisLien(demande, mesures, aujourdhui);
      if (v) { setVue(v); setRaccourci(raccourciDe(demande)); }
    };
    w.addEventListener(EVENEMENT_LIEN, surLien);
    return () => w.removeEventListener(EVENEMENT_LIEN, surLien);
  }, [mesures, aujourdhui, prendreLien]);

  // Dernière vue retenue par personne, une seconde après le dernier geste.
  const vueJson = vue ? JSON.stringify(vue) : '';
  const derniereEcrite = useRef(null);
  const ecrire = reglages.setSetting;
  // Une sonde en échec retire des mesures de la vue affichée : cette vue
  // réduite ne remplace pas la vue retenue de la personne.
  const sondeEnEchec = idsFamilles.some((f) => sondes[f]?.status === 'error');
  // « Ma vue » : la vue libre de la personne. Une analyse ouverte (raccourci)
  // dure le temps de la visite : elle n'est ni retenue ni mise à sa place.
  const maVue = useRef(null);
  const analyseOuverte = !!raccourci;
  useEffect(() => { if (vue && !analyseOuverte) maVue.current = vue; }, [vue, analyseOuverte]);
  useEffect(() => {
    if (!vueJson || sondeEnEchec || analyseOuverte) return undefined;
    if (derniereEcrite.current === null) { derniereEcrite.current = vueJson; if (JSON.stringify(reglages.settings[CLE_VUE] || null) === vueJson) return undefined; }
    else if (derniereEcrite.current === vueJson) return undefined;
    const minuterie = setTimeout(() => {
      derniereEcrite.current = vueJson;
      Promise.resolve(ecrire(CLE_VUE, JSON.parse(vueJson))).catch((e) => console.warn('[statistiques] vue non enregistrée', e));
    }, 1000);
    return () => clearTimeout(minuterie);
  }, [vueJson, ecrire, sondeEnEchec, analyseOuverte]);

  // ── Points par famille, par les fonctions d'origine ──
  const etatCompta = compta.etats.resultat;
  const syntheseDe = compta.syntheseDe;
  const sources = useMemo(() => {
    const out = { points: {}, totaux: {}, pointsComparaison: {}, totauxComparaison: {}, etats: {} };
    const entiere = [trancheEntiere(bornes.debut, bornes.fin)];
    const entiereAvant = bornesComp ? [trancheEntiere(bornesComp.debut, bornesComp.fin)] : null;
    const calculer = (id, donnees, donneesAvant) => {
      const f = familleDe(id);
      // Date comparable (carnet à venir) : celle de la comparaison de la vue,
      // comme le rapport des réservations.
      const reference = bornesComp && vueComparaison ? dateComparable(aujourdhui, bornes, vueComparaison) : aujourdhui;
      const ctx = { aujourdhui, role, filtres, reference };
      try {
        out.points[id] = f.calculer(donnees, tranches, ctx);
        out.totaux[id] = f.calculer(donnees, entiere, ctx)[0];
        if (tranchesComp && donneesAvant) {
          out.pointsComparaison[id] = f.calculer(donneesAvant, tranchesComp, ctx);
          out.totauxComparaison[id] = f.calculer(donneesAvant, entiereAvant, ctx)[0];
        }
        out.etats[id] = 'ready';
      } catch (e) {
        console.error('[statistiques] calcul', id, e);
        delete out.points[id];
        out.etats[id] = 'error';
      }
    };
    famillesDemandees.forEach((id) => {
      if (LECTURES[id].parHook) {
        out.etats[id] = etatCompta === 'ready' ? 'ready' : (etatCompta === 'error' ? 'error' : 'loading');
        if (out.etats[id] === 'ready') calculer(id, { syntheseDe }, { syntheseDe });
        return;
      }
      const lu = lectureDe(id, bornes.debut, bornes.fin);
      const luAvant = bornesComp ? lectureDe(id, bornesComp.debut, bornesComp.fin) : null;
      const statuts = [lu?.status || 'loading', ...(bornesComp ? [luAvant?.status || 'loading'] : [])];
      out.etats[id] = statuts.includes('error') ? 'error' : (statuts.includes('loading') ? 'loading' : 'ready');
      if (out.etats[id] === 'ready') calculer(id, lu.data, luAvant?.data || null);
    });
    return out;
  }, [famillesDemandees, lectureDe, etatCompta, syntheseDe, bornes, bornesComp, tranches, tranchesComp, aujourdhui, role, filtres, vueComparaison]);

  const compositions = useMemo(() => (vue ? vue.graphiques.map((g) => {
    const cochees = g.mesures.map((id) => mesures.find((m) => m.id === id)).filter(Boolean);
    const c = composer({ graphique: g, mesures: cochees, tranches, tranchesComparaison: tranchesComp, sources, etats: sources.etats, familles: FAMILLES });
    return { composition: c, tableau: tableauDe(c, c.etat ? c.tranches : tranches) };
  }) : []), [vue, mesures, tranches, tranchesComp, sources]);

  // Présentation dense : une composition d'une seule mesure par ligne, le
  // total de la période et son écart (aucun calcul de plus).
  const lignesChiffres = useMemo(() => (vue?.chiffres || []).map((id) => mesures.find((m) => m.id === id)).filter(Boolean).map((m) => {
    const etatFamille = sources.etats[m.famille];
    const etat = etatFamille === 'error' ? 'error' : ((etatFamille === 'loading' || !sources.points[m.famille]) ? 'loading' : null);
    if (etat) return { id: m.id, libelle: m.libelle, phrase: m.phrase, unite: m.unite, etat };
    const detail = m.detail ? m.detail(sources.totaux[m.famille]) : null;
    const aide = m.aide ? m.aide(sources.totaux[m.famille]) : null;
    const c = composer({ graphique: { mesures: [m.id], ventilation: '', type: '', choix: {} }, mesures: [m], tranches, tranchesComparaison: tranchesComp, sources, etats: sources.etats, familles: FAMILLES });
    const s = c.series?.[0];
    return { id: m.id, libelle: m.libelle, phrase: m.phrase, unite: m.unite, detail, aide, total: s?.total ?? null, totalComparaison: s?.totalComparaison ?? null, ecart: s?.ecartTotal ?? null };
  }), [vue, mesures, tranches, tranchesComp, sources]);

  // Tuiles sous le graphique principal : ses mesures tracées, puis leurs
  // voisines de la même famille. Aucune quand la vue porte déjà ses lignes de
  // chiffres (une analyse venue d'un module), ni pour des valeurs d'aujourd'hui.
  const tuiles = useMemo(() => {
    const g = vue?.graphiques[0];
    if (!g || (vue.chiffres || []).length) return [];
    const tracees = g.mesures.map((id) => mesures.find((m) => m.id === id)).filter(Boolean);
    if (!tracees.length || !tracees.every(aTuile)) return [];
    const famillesTracees = [...new Set(tracees.map((m) => m.famille))];
    const voisines = famillesTracees.length === 1
      ? mesures.filter((m) => m.famille === famillesTracees[0] && aTuile(m) && m.pas.includes(pas) && !g.mesures.includes(m.id))
      : [];
    return [...tracees, ...voisines].slice(0, MAX_TUILES).map((m) => {
      if (sources.etats[m.famille] !== 'ready' || !sources.points[m.famille]) return null;
      const c = composer({ graphique: { mesures: [m.id], ventilation: '', type: '', choix: {} }, mesures: [m], tranches, tranchesComparaison: tranchesComp, sources, etats: sources.etats, familles: FAMILLES });
      const s = c.series?.[0];
      if (!s) return null;
      const rang = tracees.indexOf(m);
      // Avec une ventilation, les séries tracées sont des catégories : la tuile
      // de la mesure ne porte pas de marqueur de série.
      return { id: m.id, libelle: m.libelle, unite: m.unite, total: s.total, totalComparaison: s.totalComparaison, ecart: s.ecartTotal, valeurs: s.valeurs, tracee: rang >= 0, rang: rang >= 0 && !g.ventilation ? rang : null };
    }).filter(Boolean);
  }, [vue, mesures, pas, tranches, tranchesComp, sources]);

  // Tableau dense : les catégories et valeurs telles que les rend la fonction
  // d'origine (ventilation sur la période, ou valeurs d'aujourd'hui).
  const tableauxDenses = useMemo(() => (vue?.tableaux || []).map((t) => {
    const ms = (t?.mesures || []).map((id) => mesures.find((m) => m.id === id)).filter(Boolean);
    if (!ms.length) return null;
    const premiere = ms[0];
    const titre = t.titre || '';
    const etatF = sources.etats[premiere.famille];
    if (etatF === 'error') return { etat: 'error', titre };
    const point = sources.totaux[premiere.famille];
    if (etatF === 'loading' || !point) return { etat: 'loading', titre };
    const cleChoix = premiere.choix ? (premiere.choix.cle || premiere.id) : null;
    const options = cleChoix ? (premiere.choix.options(point) || []) : [];
    const choixValeur = cleChoix ? ((options.find((o) => o.cle === t.choix?.[cleChoix]) || options[0])?.cle ?? null) : null;
    const ventilationDe = (m) => (m.ventilations || []).find((v) => v.id === t.ventilation);
    const lignesDe = (m) => (t.ventilation ? (ventilationDe(m)?.parts(sources.totaux[m.famille]) || []) : (m.lignes(sources.totaux[m.famille], choixValeur) || []));
    const colonnes = ms.map((m) => ({
      id: m.id, libelle: m.libelle, unite: m.unite,
      parCle: new Map(lignesDe(m).map((l) => [l.cle, l.valeur])),
      total: t.ventilation ? m.valeur(sources.totaux[m.famille]) : (m.total ? m.total(sources.totaux[m.famille], choixValeur) : null),
    }));
    let rangs = lignesDe(premiere).map((l) => ({ cle: l.cle, libelle: l.libelle, brut: !!(l.donnee || l.brut), ...(l.parties ? { parties: l.parties } : {}) }));
    // Période comparée (classement des ventes) : la valeur d'avant et l'écart
    // de la première mesure, en colonnes ; une catégorie vendue seulement
    // avant compte zéro sur la période.
    const avant = sources.totauxComparaison?.[premiere.famille];
    if (t.comparaison && t.ventilation && avant && colonnes.length) {
      const c0 = colonnes[0];
      const partsAvant = ventilationDe(premiere)?.parts(avant) || [];
      const parAvant = new Map(partsAvant.map((l) => [l.cle, l.valeur]));
      partsAvant.forEach((l) => {
        if (!c0.parCle.has(l.cle)) { c0.parCle.set(l.cle, 0); rangs.push({ cle: l.cle, libelle: l.libelle, brut: !!(l.donnee || l.brut) }); }
      });
      const ecart = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? (a - b) / b : null);
      const totalAvant = premiere.valeur(avant);
      const nouveaux = new Set(rangs.filter((r) => (c0.parCle.get(r.cle) || 0) > 0 && !(parAvant.get(r.cle) > 0)).map((r) => r.cle));
      colonnes.splice(1, 0,
        { id: 'avant', libelle: 'Préc.', unite: c0.unite, parCle: new Map(rangs.map((r) => [r.cle, parAvant.get(r.cle) ?? 0])), total: totalAvant },
        { id: 'variation', libelle: 'Variation', unite: 'pct', signe: true, nouveaux, parCle: new Map(rangs.map((r) => [r.cle, ecart(c0.parCle.get(r.cle), parAvant.get(r.cle))])), total: ecart(c0.total, totalAvant) });
    }
    // Classement : la première mesure décroissante, puis le nom, comme l'ancien classement de Ventes POS, parti en S3.
    if (t.tri === 'decroissant') {
      const v = (r) => (Number.isFinite(colonnes[0].parCle.get(r.cle)) ? colonnes[0].parCle.get(r.cle) : -Infinity);
      rangs = [...rangs].sort((a, b) => v(b) - v(a) || String(a.libelle).localeCompare(String(b.libelle), 'fr'));
    }
    if (t.part && colonnes.length) {
      const c0 = colonnes[0];
      const somme = [...c0.parCle.values()].reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0);
      colonnes.splice(1, 0, { id: 'part', libelle: 'Part', unite: 'pct', parCle: new Map([...c0.parCle.entries()].map(([k, v]) => [k, somme > 0 && Number.isFinite(v) ? v / somme : null])), total: somme > 0 ? 1 : null });
    }
    return {
      titre,
      rangs,
      colonnes,
      libelleCategories: t.ventilation ? (ventilationDe(premiere)?.libelle || '') : (premiere.libelleCategories || ''),
      libelleTotal: t.ventilation ? 'Total' : (premiere.libelleTotal || 'Total'),
      choix: cleChoix ? { cle: cleChoix, libelle: premiere.choix.libelle, options, valeur: choixValeur } : null,
    };
  }), [vue, mesures, sources]);

  // Services proposés : midi et soir, le brunch quand la maison en fait (vu
  // dans les points lus) ou qu'il est choisi.
  const avecBrunch = (sources.points?.reservations || []).some((p) => (p.services || []).some((x) => x.service === 'brunch')) || vue?.filtres?.service === 'brunch';
  const servicesResa = famillesDemandees.includes('reservations') ? (avecBrunch ? ['midi', 'soir', 'brunch'] : ['midi', 'soir']) : null;

  const comparaisonChoisie = COMPARAISONS.find((c) => c.id === (vue?.comparaison || ''));
  const libelleComparaison = bornesComp ? comparaisonChoisie?.label || '' : '';

  // Familles visibles et leur état, pour les cases.
  const famillesPanneau = FAMILLES.filter((f) => idsFamilles.includes(f.id)).map((f) => ({
    id: f.id,
    libelle: f.libelle,
    etat: sondes[f.id]?.status === 'error' ? 'error' : (sondes[f.id]?.status === 'loading' ? 'loading' : (sources.etats[f.id] || 'ready')),
  }));
  const relancer = useCallback((id) => {
    if (LECTURES[id]?.parHook) { compta.reloadTout(); return; }
    reessayer(id);
  }, [compta, reessayer]);

  const exporter = () => {
    // Les graphiques, puis les tableaux denses lus (le détail par jour du
    // rapport partait en CSV) : une feuille chacun.
    const denses = tableauxDenses.filter((t) => t && !t.etat && t.colonnes.length).map((t, i) => ({
      categories: true,
      nomFeuille: `Tableau ${i + 1}`,
      libelleCategories: t.titre || t.libelleCategories,
      libelleTotal: t.libelleTotal,
      colonnes: t.colonnes.map((c) => ({ id: c.id, libelle: c.libelle, unite: c.unite })),
      lignes: t.rangs.map((r) => ({ tranche: { pas: 'categorie', cle: r.cle, libelle: String(r.libelle) }, valeurs: t.colonnes.map((c) => c.parCle.get(r.cle) ?? null), avant: t.colonnes.map(() => null) })),
      periode: { valeurs: t.colonnes.map((c) => c.total ?? null), avant: t.colonnes.map(() => null) },
      arrondis: [],
      sansTotal: !t.colonnes.some((c) => typeof c.total === 'number' && Number.isFinite(c.total)),
    }));
    const tableaux = [...compositions.map((c) => c.tableau).filter((t) => t.colonnes.length), ...denses];
    if (!tableaux.length) { notify('Rien à exporter : cochez une mesure.', 'info'); return; }
    try {
      telechargerTableaux(tableaux, {
        titre: `Statistiques, ${etablissement?.nom || ''}, ${bornesTranche(bornes)}`,
        nomFichier: `statistiques_${bornes.debut}_${bornes.fin}.xlsx`,
        libelleComparaison,
      });
    } catch (e) {
      console.error('[statistiques] export', e);
      notify('Le fichier n\'a pas pu être produit. Réessayez.', 'error');
    }
  };

  // Export PDF du graphique et de son tableau, par le service partagé
  // (pdfUtils.exportElementToPdf) : il clone la zone, retire boutons et
  // .no-print, remplace les listes par leur valeur et redéfinit les jetons en
  // hexadécimal (html2canvas ne lit pas oklch). Chargé au premier export.
  const exporterPdf = async () => {
    if (!compositions.some((c) => c.tableau.colonnes.length)) { notify('Rien à exporter : cochez une mesure.', 'info'); return; }
    setPdfEnCours(true);
    try {
      const { pdfUtils } = await import('../../services/pdf.js');
      await pdfUtils.exportElementToPdf('stat-export', `statistiques_${bornes.debut}_${bornes.fin}.pdf`, {
        title: `Statistiques, ${bornesTranche(bornes)}`,
        etablissement,
        orientation: 'landscape',
      });
    } catch (e) {
      console.error('[statistiques] export PDF', e);
    } finally {
      setPdfEnCours(false);
    }
  };

  const colonnes = vue && vue.graphiques.length > 1 && largeur >= 900 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)';
  const peutAjouter = !!vue && vue.graphiques.length < MAX_GRAPHIQUES;
  // Puces du raccourci : chaque vue reprend un bloc de l'écran d'origine ; le
  // filtre de périmètre choisi reste.
  // Une vue dont aucune mesure n'est visible pour la personne n'est pas
  // proposée (les paiements de la caisse pour le niveau cuisine).
  const vueVisible = useCallback((id, v) => !!vueDepuisLien(demandeRaccourci(id, v.id), mesures, aujourdhui), [mesures, aujourdhui]);
  const vuesRaccourci = raccourci && RACCOURCIS[raccourci.id] ? RACCOURCIS[raccourci.id].vues.filter((v) => vueVisible(raccourci.id, v)) : null;
  // Écran d'origine monté tel quel à la place du graphique (le rapport complet
  // de la caisse).
  const ecranMonte = (vuesRaccourci || []).find((v) => v.id === raccourci?.vue)?.ecran || null;
  const choisirVueRaccourci = (id) => {
    const v = vueDepuisLien(demandeRaccourci(raccourci.id, id), mesures, aujourdhui);
    if (!v) return;
    setVue({ ...v, filtres: vue?.filtres || {} });
    setRaccourci({ id: raccourci.id, vue: id });
  };
  const tableauDense = (t, i) => (
    <TableauDense key={`t${i}`} tableau={t} onReessayer={relancer} onChoix={(cle, valeur) => setVue({ ...vue, tableaux: vue.tableaux.map((x, k) => (k === i ? { ...x, choix: { ...(x.choix || {}), [cle]: valeur } } : x)) })} />
  );
  const barreFiltres = vue ? <Filtres vue={vue} bornes={bornes} bornesComp={bornesComp} aujourdhui={aujourdhui} perimetres={perimetres} services={servicesResa} onVue={setVue} /> : null;
  const periodeChoisie = PERIODES.find((p) => p.id === vue?.periode.id);

  // Pilules d'analyses : « Ma vue », puis une par analyse venue d'un module,
  // pour qui voit sa famille et au moins une de ses mesures (D11).
  const analyses = useMemo(() => {
    const ouvertes = signatureFamilles ? signatureFamilles.split(',') : [];
    return ORDRE_ANALYSES
      .filter((id) => RACCOURCIS[id] && ouvertes.includes(RACCOURCIS[id].famille) && RACCOURCIS[id].vues.some((v) => vueVisible(id, v)))
      .map((id) => ({ id, label: RACCOURCIS[id].libelle }));
  }, [signatureFamilles, vueVisible]);
  const choisirAnalyse = (id) => {
    if (id === 'libre') {
      setRaccourci(null);
      setVue(maVue.current || nettoyerVue(reglages.settings[CLE_VUE], mesures, aujourdhui));
      return;
    }
    // La première vue de l'analyse que la personne voit.
    const premiere = RACCOURCIS[id]?.vues.find((x) => vueVisible(id, x));
    const v = premiere ? vueDepuisLien(demandeRaccourci(id, premiere.id), mesures, aujourdhui) : null;
    if (!v) return;
    setVue(v);
    setRaccourci({ id, vue: premiere.id });
  };
  // Retour du rapport monté : la première vue tracée de son analyse.
  const quitterEcranMonte = () => {
    const tracee = (vuesRaccourci || []).find((v) => !v.ecran);
    if (tracee) choisirVueRaccourci(tracee.id); else choisirAnalyse('libre');
  };
  const choisirTuile = (id) => setVue(majGraphique(vue, 0, { mesures: [id], ventilation: '', type: '', choix: {} }));
  const seul = !!vue && vue.graphiques.length === 1;
  const rangeeTuiles = <TuilesMesures tuiles={tuiles} colonnes={largeur >= 900 ? 4 : 2} libelleComparaison={libelleComparaison} onChoisir={choisirTuile} />;

  // Réglages communs, dans la carte du graphique principal : période, pas,
  // comparaison, puis un seul menu pour les actions rares (ajouter un
  // graphique, vues enregistrées, exports).
  const optionsPrincipales = vue ? (
    <>
      {etroit ? (
        <>
          {/* S3 : la période reste à portée au téléphone (un écran
              d'analyse devenu raccourci la changeait en un geste). */}
          <label style={st.champ}>
            <span>Période</span>
            <select style={st.select} value={vue.periode.id} onChange={(e) => setVue(vueAvecPeriode(vue, e.target.value, bornes, aujourdhui))} data-stat-periode-telephone="">
              {PERIODES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <ChoixPerimetre vue={vue} perimetres={perimetres} onVue={setVue} />
          <ChoixService vue={vue} services={servicesResa} onVue={setVue} />
          <Btn variant="ghost" onClick={() => setFiltresOuverts(true)} style={st.bouton}>Période et filtres</Btn>
        </>
      ) : barreFiltres}
      <BoutonActions
        id="stat-actions"
        label={pdfEnCours ? 'Export en cours' : 'Actions'}
        disabled={pdfEnCours}
        style={st.menu}
        titre="Actions"
        sections={[{ items: [
          peutAjouter ? { titre: 'Ajouter un graphique', onClick: () => setVue(ajouterGraphique(vue)) } : null,
          { titre: 'Vues enregistrées', onClick: () => setVuesOuvertes(true) },
          { titre: 'Exporter en Excel', onClick: exporter },
          { titre: 'Exporter en PDF', onClick: exporterPdf },
        ] }]}
      />
    </>
  ) : null;

  return (
    <section ref={racine} className="statistiques" style={st.page} data-statistiques={vue ? 'pret' : 'attente'} data-stat-familles={signatureFamilles}>
      {!vue ? <div style={st.etat} data-stat-attente="">Lecture en cours</div> : (
        <>
          {analyses.length ? (
            <div data-stat-analyses="" style={{ minWidth: 0 }}>
              <SegmentedTabs tabs={[{ id: 'libre', label: 'Ma vue' }, ...analyses]} active={raccourci && RACCOURCIS[raccourci.id] ? raccourci.id : 'libre'} onChange={choisirAnalyse} retourLigne />
            </div>
          ) : null}
          {vuesRaccourci && vuesRaccourci.length > 1 ? (
            <div data-stat-vues="" style={{ minWidth: 0 }}>
              <SegmentedTabs tabs={vuesRaccourci.map((v) => ({ id: v.id, label: !large && v.court ? v.court : v.libelle }))} active={raccourci.vue} onChange={choisirVueRaccourci} retourLigne />
            </div>
          ) : null}
          {ecranMonte === 'rapport_caisse' ? (
            <Suspense fallback={<div style={st.etat}>Lecture en cours</div>}>
              <RapportCaisse etablissement={etablissement} onRetour={quitterEcranMonte} />
            </Suspense>
          ) : (
          <>
          {/* Zone de l'export PDF : les cartes des graphiques et les valeurs
              exactes. Les tuiles (no-print) n'y entrent pas. */}
          <div id="stat-export" style={{ display: 'grid', gridTemplateColumns: colonnes, gap: 20, minWidth: 0 }}>
            {vue.graphiques.map((g, i) => (
              <Fragment key={i}>
                <CarteGraphique
                  rang={i}
                  nb={vue.graphiques.length}
                  graphique={g}
                  composition={compositions[i].composition}
                  tableau={compositions[i].tableau}
                  tranches={tranches}
                  mesures={mesures}
                  familles={famillesPanneau}
                  hauteur={i === 0 ? hauteurPrincipale : hauteurAutres}
                  options={i === 0 ? optionsPrincipales : null}
                  resume={i === 0 && etroit ? <span style={st.resume}><span>{periodeChoisie?.label}</span>, <span data-no-translate>{bornesTranche(bornes)}</span></span> : null}
                  compact={etroit}
                  tableauDedans={!(i === 0 && seul)}
                  libelleComparaison={libelleComparaison}
                  onChange={(maj) => setVue(majGraphique(vue, i, maj))}
                  onRetirer={() => setVue(retirerGraphique(vue, i))}
                  onReessayer={relancer}
                  onAjouterGraphique={() => setVue(ajouterGraphique(vue))}
                  peutAjouter={peutAjouter}
                />
                {i === 0 && seul ? rangeeTuiles : null}
                {i === 0 && seul && compositions[0].tableau.colonnes.length ? (
                  <div data-stat-carte-valeurs="" style={{ minWidth: 0 }}>
                    <Panneau style={st.carte}>
                      <div style={st.titre}>Valeurs exactes</div>
                      <TableauValeurs tableau={compositions[0].tableau} libelleComparaison={compositions[0].composition.etat ? '' : libelleComparaison} />
                    </Panneau>
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>
          {seul ? null : rangeeTuiles}
          {/* Les lignes de chiffres et les tableaux d'une analyse, sous le
              graphique qu'ils détaillent. */}
          <ChiffresDenses lignes={lignesChiffres} colonnes={largeur >= 720 ? 2 : 1} libelleComparaison={libelleComparaison} explications={!!vue.explications} onReessayer={relancer} />
          {tableauxDenses.map((t, i) => (t && !vue.tableaux[i]?.apres ? tableauDense(t, i) : null))}
          {tableauxDenses.map((t, i) => (t && vue.tableaux[i]?.apres ? tableauDense(t, i) : null))}
          </>
          )}
          {vuesOuvertes ? (
            <VuesNommees
              vues={vuesNommees}
              vue={vue}
              ecrire={(liste) => reglages.setSetting(CLE_VUES, liste)}
              ouvrir={(v) => setVue(nettoyerVue(v, mesures, aujourdhui))}
              onClose={() => setVuesOuvertes(false)}
            />
          ) : null}
          {filtresOuverts && etroit ? (
            <Fenetre id="stat-filtres" titre="Période et filtres" onClose={() => setFiltresOuverts(false)} largeur={460}>
              {barreFiltres}
            </Fenetre>
          ) : null}
        </>
      )}
    </section>
  );
}
