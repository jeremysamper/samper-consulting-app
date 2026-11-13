import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './statistiques.css';
import { canManageModule, getPermissionsForRole } from '../../data/demoData.js';
import { getBrowserWindow } from '../../legacy/legacyApi.js';
import { useUserSettings } from '../../hooks/useUserSettings.js';
import { UI_STORAGE_KEYS, readJson, removeStorageKeys } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { notify } from '../../components/toast/index.js';
import { Btn, Panneau } from '../../components/ui/index.jsx';
import { Fenetre } from '../../components/ui/Fenetres.jsx';
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
import Graphique from './Graphique.jsx';
import TableauValeurs from './TableauValeurs.jsx';
import PanneauMesures from './PanneauMesures.jsx';
import { telechargerTableaux } from './exportStatistiques.js';
import VuesNommees from './VuesNommees.jsx';
import ChiffresDenses, { TableauDense } from './ChiffresDenses.jsx';
import { perimetreDe } from '../factures-achats/analysesAchats.js';
import { RACCOURCIS, demandeRaccourci } from './raccourcisStatistiques.js';

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
// 30 jours. Période, pas et comparaison sont communs aux graphiques, un à
// quatre côte à côte ; chacun a ses cases (D7).
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
  // Cadre d'un graphique : la primitive Panneau (direction Office), ses
  // réglages d'agencement seulement.
  carte: { padding: 16, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  entete: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minWidth: 0 },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', marginRight: 'auto' },
  note: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.45 },
  etat: { fontSize: 'var(--t2)', color: 'var(--text2)', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  bouton: { minHeight: 44, flexShrink: 0 },
};

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

function Filtres({ vue, bornes, bornesComp, aujourdhui, perimetres, onVue }) {
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

function CarteGraphique({
  rang, nb, graphique, composition, tableau, tranches, mesures, familles, large, etroit, libelleComparaison,
  onChange, onRetirer, onReessayer, onAjouterGraphique, peutAjouter,
}) {
  const [casesOuvertes, setCasesOuvertes] = useState(false);
  const enLigne = large && nb === 1;
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
  return (
    <div data-stat-carte={rang} style={{ minWidth: 0 }}>
    <Panneau style={st.carte}>
      <div style={st.entete}>
        <div style={st.titre}>{nb > 1 ? <><span>Graphique</span> <span data-no-translate>{rang + 1}</span></> : <span>Graphique</span>}</div>
        {!enLigne ? (
          <Btn variant="ghost" onClick={() => setCasesOuvertes(true)} style={st.bouton}>
            <span>Mesures</span> <span data-no-translate>({graphique.mesures.length})</span>
          </Btn>
        ) : null}
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
      <div style={{ display: 'flex', gap: 20, minWidth: 0, alignItems: 'flex-start' }}>
        {enLigne ? <div className="no-print" style={{ flex: '0 0 270px', minWidth: 0, maxHeight: 620, overflowY: 'auto' }}>{panneau}</div> : null}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <Graphique composition={composition} tranches={axe} hauteur={large ? 280 : etroit ? 200 : 220} libelleComparaison={etat ? '' : libelleComparaison} />
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
              <TableauValeurs tableau={tableau} libelleComparaison={etat ? '' : libelleComparaison} />
            </>
          ) : null}
        </div>
      </div>
      {casesOuvertes && !enLigne ? (
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
  const signatureCochees = vue ? [...vue.graphiques.map((g) => g.mesures.join(',')), (vue.chiffres || []).join(','), (vue.tableau?.mesures || []).join(',')].join(';') : '';
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
  useEffect(() => {
    if (!vueJson || sondeEnEchec) return undefined;
    if (derniereEcrite.current === null) { derniereEcrite.current = vueJson; if (JSON.stringify(reglages.settings[CLE_VUE] || null) === vueJson) return undefined; }
    else if (derniereEcrite.current === vueJson) return undefined;
    const minuterie = setTimeout(() => {
      derniereEcrite.current = vueJson;
      Promise.resolve(ecrire(CLE_VUE, JSON.parse(vueJson))).catch((e) => console.warn('[statistiques] vue non enregistrée', e));
    }, 1000);
    return () => clearTimeout(minuterie);
  }, [vueJson, ecrire, sondeEnEchec]);

  // ── Points par famille, par les fonctions d'origine ──
  const etatCompta = compta.etats.resultat;
  const syntheseDe = compta.syntheseDe;
  const sources = useMemo(() => {
    const out = { points: {}, totaux: {}, pointsComparaison: {}, totauxComparaison: {}, etats: {} };
    const entiere = [trancheEntiere(bornes.debut, bornes.fin)];
    const entiereAvant = bornesComp ? [trancheEntiere(bornesComp.debut, bornesComp.fin)] : null;
    const calculer = (id, donnees, donneesAvant) => {
      const f = familleDe(id);
      const ctx = { aujourdhui, role, filtres };
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
  }, [famillesDemandees, lectureDe, etatCompta, syntheseDe, bornes, bornesComp, tranches, tranchesComp, aujourdhui, role, filtres]);

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
    const c = composer({ graphique: { mesures: [m.id], ventilation: '', type: '', choix: {} }, mesures: [m], tranches, tranchesComparaison: tranchesComp, sources, etats: sources.etats, familles: FAMILLES });
    const s = c.series?.[0];
    return { id: m.id, libelle: m.libelle, phrase: m.phrase, unite: m.unite, total: s?.total ?? null, totalComparaison: s?.totalComparaison ?? null, ecart: s?.ecartTotal ?? null };
  }), [vue, mesures, tranches, tranchesComp, sources]);

  // Tableau dense : les catégories et valeurs telles que les rend la fonction
  // d'origine (ventilation sur la période, ou valeurs d'aujourd'hui).
  const tableauDense = useMemo(() => {
    const t = vue?.tableau;
    const ms = (t?.mesures || []).map((id) => mesures.find((m) => m.id === id)).filter(Boolean);
    if (!ms.length) return null;
    const premiere = ms[0];
    const etatF = sources.etats[premiere.famille];
    if (etatF === 'error') return { etat: 'error' };
    const point = sources.totaux[premiere.famille];
    if (etatF === 'loading' || !point) return { etat: 'loading' };
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
    return {
      rangs: lignesDe(premiere).map((l) => ({ cle: l.cle, libelle: l.libelle, brut: !!(l.donnee || l.brut) })),
      colonnes,
      libelleCategories: t.ventilation ? (ventilationDe(premiere)?.libelle || '') : (premiere.libelleCategories || ''),
      libelleTotal: t.ventilation ? 'Total' : (premiere.libelleTotal || 'Total'),
      choix: cleChoix ? { cle: cleChoix, libelle: premiere.choix.libelle, options, valeur: choixValeur } : null,
    };
  }, [vue, mesures, sources]);

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
    const tableaux = compositions.map((c) => c.tableau).filter((t) => t.colonnes.length);
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
  const vuesRaccourci = raccourci && RACCOURCIS[raccourci.id] ? RACCOURCIS[raccourci.id].vues : null;
  const choisirVueRaccourci = (id) => {
    const v = vueDepuisLien(demandeRaccourci(raccourci.id, id), mesures, aujourdhui);
    if (!v) return;
    setVue({ ...v, filtres: vue?.filtres || {} });
    setRaccourci({ id: raccourci.id, vue: id });
  };
  const barreFiltres = vue ? <Filtres vue={vue} bornes={bornes} bornesComp={bornesComp} aujourdhui={aujourdhui} perimetres={perimetres} onVue={setVue} /> : null;
  const periodeChoisie = PERIODES.find((p) => p.id === vue?.periode.id);

  return (
    <section ref={racine} className="statistiques" style={st.page} data-statistiques={vue ? 'pret' : 'attente'} data-stat-familles={signatureFamilles}>
      {!vue ? <div style={st.etat} data-stat-attente="">Lecture en cours</div> : (
        <>
          {vuesRaccourci ? (
            <div data-stat-vues="" style={{ minWidth: 0 }}>
              <SegmentedTabs tabs={vuesRaccourci.map((v) => ({ id: v.id, label: etroit && v.court ? v.court : v.libelle }))} active={raccourci.vue} onChange={choisirVueRaccourci} retourLigne />
            </div>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', minWidth: 0 }}>
            {etroit ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', minWidth: 0, flex: '1 1 auto' }}>
                {/* S3 : la période reste à portée au téléphone (un écran
                    d'analyse devenu raccourci la changeait en un geste). */}
                <label style={st.champ}>
                  <span>Période</span>
                  <select style={st.select} value={vue.periode.id} onChange={(e) => setVue(vueAvecPeriode(vue, e.target.value, bornes, aujourdhui))} data-stat-periode-telephone="">
                    {PERIODES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <ChoixPerimetre vue={vue} perimetres={perimetres} onVue={setVue} />
                <Btn variant="ghost" onClick={() => setFiltresOuverts(true)} style={st.bouton}>Période et filtres</Btn>
                <span style={st.resume}><span>{periodeChoisie?.label}</span>, <span data-no-translate>{bornesTranche(bornes)}</span></span>
              </div>
            ) : <div style={{ flex: '1 1 auto', minWidth: 0 }}>{barreFiltres}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {peutAjouter ? <Btn variant="ghost" onClick={() => setVue(ajouterGraphique(vue))} style={st.bouton}>Ajouter un graphique</Btn> : null}
              <Btn variant="ghost" onClick={() => setVuesOuvertes(true)} style={st.bouton}>Vues enregistrées</Btn>
              <Btn variant="ghost" onClick={exporter} style={st.bouton}>Exporter en Excel</Btn>
              <Btn variant="ghost" onClick={exporterPdf} disabled={pdfEnCours} style={st.bouton}>{pdfEnCours ? 'Export en cours' : 'Exporter en PDF'}</Btn>
            </div>
          </div>
          <ChiffresDenses lignes={lignesChiffres} colonnes={largeur >= 720 ? 2 : 1} libelleComparaison={libelleComparaison} onReessayer={relancer} />
          <TableauDense tableau={tableauDense} onReessayer={relancer} onChoix={(cle, valeur) => setVue({ ...vue, tableau: { ...vue.tableau, choix: { ...(vue.tableau?.choix || {}), [cle]: valeur } } })} />
          <div id="stat-export" style={{ display: 'grid', gridTemplateColumns: colonnes, gap: 16, minWidth: 0 }}>
            {vue.graphiques.map((g, i) => (
              <CarteGraphique
                key={i}
                rang={i}
                nb={vue.graphiques.length}
                graphique={g}
                composition={compositions[i].composition}
                tableau={compositions[i].tableau}
                tranches={tranches}
                mesures={mesures}
                familles={famillesPanneau}
                large={large}
                etroit={etroit}
                libelleComparaison={libelleComparaison}
                onChange={(maj) => setVue(majGraphique(vue, i, maj))}
                onRetirer={() => setVue(retirerGraphique(vue, i))}
                onReessayer={relancer}
                onAjouterGraphique={() => setVue(ajouterGraphique(vue))}
                peutAjouter={peutAjouter}
              />
            ))}
          </div>
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
