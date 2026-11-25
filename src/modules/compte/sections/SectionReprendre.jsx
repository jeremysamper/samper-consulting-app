import React from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import { notify } from '../../../components/toast/index.js';
import { supabase, etablissementService } from '../../../services/supabase.js';
import { signalerReglage } from '../../../services/reglagesSignal.js';
import { getDemoData } from '../../../data/demoData.js';
import { ecrireBlocMaison } from '../../../hooks/useReglagesMaison.js';
import { ecrireConfigModule } from '../../../hooks/useReglagesModule.js';
import { normaliserFermetures } from '../../../utils/reglagesMaison.js';
import { FORMATS_EXPORT_JOURNAL, ROLES_VALIDEURS, VUES_JOURNAL } from '../../../utils/reglagesModules.js';
import { zurichToday } from '../../../utils/zurichTime.js';
import { synchroniserFermeturesEnLigne } from '../../previsions/fermeturesEnLigne.js';
import { STATUT_META, TYPES_GROUPE } from '../../groupes/typesGroupe.js';
import { OPTIONS_VUE_MAISON } from '../../statistiques/questionsStatistiques.js';
import { SECTIONS, sectionsNonReprises, sectionsReprenables, signauxDe } from '../registreReglages.js';
import { apercu, brutDe, idsSources, maisonsSources, valeurAEcrire } from '../reprise/repriseReglages.js';
import { lireReglagesEtab } from '../reprise/lectureReprise.js';
import { ChoixPilules, Ligne, ui } from './reglagesUi.jsx';
import { CaseReglage } from './reglagesModulesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Reprendre d'un autre établissement » (lot 02 du panel, 25.11.2026), dans
// « La maison ». Trois temps, en ligne dans le volet : choisir l'établissement
// source, voir section par section ce qui diffère et cocher, puis reprendre
// et lire le compte rendu. Une copie à un instant : rien n'est lié ensuite.
//
// Chaque ligne garde la garde de sa section d'origine (registre). Lecture et
// écriture passent par le client de l'app, sous la RLS ; l'écriture prend le
// chemin des sections d'origine (ecrireBlocMaison, ecrireConfigModule), sur
// l'établissement affiché seul, figé au début de la reprise.
// ─────────────────────────────────────────────────────────────────────────────

const JOURS = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' };
const SERVICES = { brunch: 'Brunch', midi: 'Midi', soir: 'Soir' };
const AVANCE = { pointee: 'Comptée dès le pointage', prevue: "Comptée dès l'heure prévue" };
const CHAMPS_FICHE = [['temps', 'Temps de préparation'], ['accords', 'Accords mets & boissons'], ['allergenes', 'Allergènes']];
const libelleDe = (liste, id) => liste.find((x) => x.id === id)?.label || null;
const dateCH = (iso) => String(iso).split('-').reverse().join('.');

const t = (texte) => ({ t: texte });
const b = (texte) => ({ b: String(texte) });
const nombre = (n, unite) => [{ n }, ...(unite ? [t(unite)] : [])];
const aucun = [[t('Aucun')]];

// Une valeur lisible en éléments à montrer : chaque élément est une suite de
// morceaux (t : à traduire, b : saisi ou propre à la maison, jamais traduit,
// n : un nombre dans son propre noeud). Rien n'est assemblé en une phrase.
function elements(format, v) {
  switch (format) {
    case 'jours': return v?.length ? v.map((j) => [t(JOURS[j])]) : aucun;
    case 'servicesFermes': {
      const jours = Object.keys(v || {}).sort();
      return jours.length ? jours.map((j) => [t(JOURS[j]), ...v[j].map((s) => t(SERVICES[s]))]) : aucun;
    }
    case 'periodes':
      return v?.length ? v.map((p) => [b(`${dateCH(p.du)} au ${dateCH(p.au)}`), ...(p.motif ? [b(p.motif)] : [])]) : aucun;
    case 'arrondi': return v ? [nombre(v, 'min')] : [[t('À la minute')]];
    case 'avance': return [[t(AVANCE[v] || AVANCE.pointee)]];
    case 'cloture': return v == null ? [[t('Jamais')]] : [nombre(v, 'h')];
    case 'pct': return v == null ? [[t('Aucun objectif')]] : [nombre(v, '%')];
    case 'chf': return v == null ? [[t('Aucun objectif')]] : [nombre(v, 'CHF')];
    case 'textes': return v?.length ? v.map((x) => [b(x)]) : aucun;
    case 'roles':
      if (v == null) return [[t('Non réglé')]];
      return v.length ? v.map((r) => [t(libelleDe(ROLES_VALIDEURS, r) || r)]) : aucun;
    case 'jours_nombre': return [nombre(v, 'jours')];
    case 'statutsGroupe': {
      const actifs = Object.keys(STATUT_META).filter((id) => v?.[id]?.actif !== false);
      return actifs.map((id) => (v?.[id]?.libelle ? [b(v[id].libelle)] : [t(STATUT_META[id].label)]));
    }
    case 'typesGroupe': return v?.length ? v.map((id) => [t(TYPES_GROUPE.find((x) => x.id === id)?.label || id)]) : aucun;
    case 'champsFiche': {
      const vus = CHAMPS_FICHE.filter(([id]) => v?.[id] !== false);
      return vus.length ? vus.map(([, l]) => [t(l)]) : aucun;
    }
    case 'ouiNon': return [[t(v ? 'Oui' : 'Non')]];
    case 'minutes': return [nombre(v, 'min')];
    case 'categoriesDemande': return v?.length ? v.map((c) => [b(c.libelle)]) : aucun;
    case 'vueJournal': return [[t(libelleDe(VUES_JOURNAL, v) || v)]];
    case 'exportJournal': return [[t(libelleDe(FORMATS_EXPORT_JOURNAL, v) || v)]];
    case 'vueStatistiques': return [[t(libelleDe(OPTIONS_VUE_MAISON, v || 'app') || "La vue de l'app")]];
    default: return [[b(JSON.stringify(v))]];
  }
}

function Valeur({ format, valeur }) {
  return (
    <span style={st.valeur}>
      {elements(format, valeur).map((el, i) => (
        <span key={i} style={st.element}>
          {el.map((m, j) => {
            if ('n' in m) return <span key={j} data-no-translate="">{m.n}</span>;
            if ('b' in m) return <span key={j} data-no-translate="">{m.b}</span>;
            return <span key={j}>{m.t}</span>;
          })}
        </span>
      ))}
    </span>
  );
}

const ETATS = { identique: 'Identique', different: 'Différent', non_regle_la_bas: 'Non réglé là-bas' };
const libelleSection = (id) => SECTIONS.find((s) => s.id === id)?.libelle || id;

export default function SectionReprendre({ user, etablissement, permissions, shellMode }) {
  const etabId = etablissement?.id || null;
  const ctx = React.useMemo(() => ({ user, permissions, etablissement, shellMode }), [user, permissions, etablissement, shellMode]);
  const entrees = React.useMemo(() => sectionsReprenables(ctx), [ctx]);
  const nonReprises = React.useMemo(() => sectionsNonReprises(ctx), [ctx]);
  const avecObjectifs = entrees.some((e) => e.bloc === 'objectifs');
  const modules = React.useMemo(() => entrees.filter((e) => e.module).map((e) => e.module), [entrees]);

  // Noms : la liste déjà chargée par la coque ; si un établissement du profil
  // y manque, la lecture des établissements (mise en cache au démarrage).
  const ids = idsSources(user, etabId);
  const [etabsLus, setEtabsLus] = React.useState(null);
  const connus = getDemoData()?.etablissements || [];
  const maisons = maisonsSources(user, etabsLus || connus, etabId);
  const manque = maisonsSources(user, connus, etabId).length < ids.length;
  React.useEffect(() => {
    if (!manque || etabsLus) return undefined;
    let vivant = true;
    etablissementService.listForUser(user).then((l) => { if (vivant) setEtabsLus(l || []); }).catch(() => {});
    return () => { vivant = false; };
  }, [manque, etabsLus, user]);

  const [source, setSource] = React.useState(null);
  const [lecture, setLecture] = React.useState({ etat: 'repos' });
  const [coches, setCoches] = React.useState(() => new Set());
  const [enCours, setEnCours] = React.useState(false);
  const [compteRendu, setCompteRendu] = React.useState(null);
  const tour = React.useRef(0);
  const enVol = React.useRef(false);
  const vivant = React.useRef(true);
  const etabAffiche = React.useRef(etabId);
  etabAffiche.current = etabId;
  React.useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);

  const lire = React.useCallback(async (idSource) => {
    const n = ++tour.current;
    setLecture({ etat: 'lecture' });
    const [la, ici] = await Promise.all([
      lireReglagesEtab(supabase, idSource, { avecObjectifs, modules }),
      lireReglagesEtab(supabase, etabId, { avecObjectifs, modules }),
    ]);
    if (!vivant.current || n !== tour.current) return;
    setLecture({ etat: 'lu', la, ici });
  }, [avecObjectifs, modules, etabId]);

  // Un autre établissement affiché : on repart du choix de la source.
  React.useEffect(() => {
    tour.current += 1;
    setSource(null); setLecture({ etat: 'repos' }); setCoches(new Set()); setCompteRendu(null);
  }, [etabId]);

  const choisir = (id) => {
    if (enVol.current) return;
    setSource(id); setCoches(new Set()); setCompteRendu(null);
    lire(id);
  };

  const vue = lecture.etat === 'lu' ? apercu(entrees, lecture.la, lecture.ici) : null;

  const basculer = (section, oui) => setCoches((c) => {
    const s = new Set(c);
    if (oui) s.add(section); else s.delete(section);
    return s;
  });

  const reprendre = async () => {
    if (enVol.current || !vue || vue.echec || !coches.size) return;
    enVol.current = true;
    setEnCours(true);
    const cible = etabId;
    const lectureSource = lecture.la;
    const resultats = [];
    for (const entree of entrees) {
      if (!coches.has(entree.section)) continue;
      // Quitter la section n'interrompt pas l'écriture en vol, mais ne lance
      // pas les suivantes ; un autre établissement affiché non plus.
      if (!vivant.current) break;
      if (etabAffiche.current !== cible) {
        resultats.push({ section: entree.section, ok: false, message: "L'établissement affiché a changé. Cette section n'a pas été écrite." });
        continue;
      }
      const ici = await lireReglagesEtab(supabase, cible, {
        avecObjectifs: entree.bloc === 'objectifs',
        modules: entree.module ? [entree.module] : [],
      });
      if (!ici.ok) { resultats.push({ section: entree.section, ok: false, message: 'La lecture a échoué. Réessayez.' }); continue; }
      const brutIci = brutDe(entree, ici);
      const valeur = valeurAEcrire(entree, brutDe(entree, lectureSource), brutIci);
      if (valeur == null) { resultats.push({ section: entree.section, ok: false, message: 'Non réglé là-bas' }); continue; }
      const r = entree.module
        ? await ecrireConfigModule(cible, entree.module, valeur, brutIci)
        : await ecrireBlocMaison(cible, entree.bloc, valeur);
      if (r.error) { resultats.push({ section: entree.section, ok: false, message: r.error }); continue; }
      signauxDe(entree.section).forEach(signalerReglage);
      if (entree.bloc === 'fermetures') {
        // La réservation en ligne lit ses jours fermés ici : sa page publique
        // suit, comme depuis la section Horaires et fermetures.
        const sync = await synchroniserFermeturesEnLigne(cible, normaliserFermetures(brutIci), valeur, zurichToday());
        if (sync.error) {
          console.error('[reprise] fermetures, réservation en ligne', sync.error);
          notify('Les fermetures sont enregistrées. La réservation en ligne les prendra à son prochain enregistrement.', 'warning');
        }
      }
      resultats.push({ section: entree.section, ok: true });
    }
    enVol.current = false;
    if (!vivant.current) return;
    setEnCours(false);
    setCompteRendu(resultats);
    setCoches(new Set());
    if (etabAffiche.current === cible && source) lire(source);
  };

  if (!etabId) return null;
  if (!maisons.length) {
    return <p style={st.note}>{manque && !etabsLus ? 'Chargement…' : 'Aucun autre établissement à proposer.'}</p>;
  }

  return (
    <div style={ui.liste} data-reprise="">
      <p style={st.intro}>
        Les réglages cochés sont copiés ici. Rien n'est lié ensuite : chaque établissement garde la main sur ses réglages.
      </p>
      <Ligne colonne titre="Reprendre depuis" aide="Choisissez l'établissement dont vous reprenez les réglages.">
        <ChoixPilules
          label="Reprendre depuis"
          valeur={source}
          options={maisons.map((m) => ({ id: m.id, label: <span data-no-translate="">{m.nom}</span> }))}
          onChange={choisir}
        />
      </Ligne>

      {lecture.etat === 'lecture' && <p style={st.note}>Chargement…</p>}

      {vue?.echec && (
        <div style={st.echec} data-reprise-echec="">
          <p style={st.note}>La lecture a échoué. Réessayez.</p>
          <Btn variant="ghost" style={ui.btn44} onClick={() => source && lire(source)}>Réessayer</Btn>
        </div>
      )}

      {compteRendu && (
        <div style={st.bloc} data-reprise-compte-rendu="">
          <div style={ui.titre}>Compte rendu</div>
          {compteRendu.length === 0 && <p style={st.note}>Aucune section n'a été écrite.</p>}
          {compteRendu.map((r) => (
            <div key={r.section} style={st.ligneCompte} data-reprise-resultat={r.ok ? 'reprise' : 'non_reprise'}>
              <span style={st.nomSection}>{libelleSection(r.section)}</span>
              <span style={st.etat}>{r.ok ? 'Reprise' : 'Non reprise'}</span>
              {r.message && <span style={st.message}>{r.message}</span>}
            </div>
          ))}
        </div>
      )}

      {vue && !vue.echec && (
        <div style={st.bloc} data-reprise-apercu="">
          {vue.lignes.map((l) => (
            <div key={l.entree.section} style={st.ligne} data-reprise-ligne={l.entree.section} data-reprise-etat={l.etat}>
              {l.cochable ? (
                <CaseReglage
                  libelle={libelleSection(l.entree.section)}
                  aide={ETATS[l.etat]}
                  coche={coches.has(l.entree.section)}
                  desactive={enCours}
                  onChange={(oui) => basculer(l.entree.section, oui)}
                />
              ) : (
                <div style={st.entete}>
                  <span style={st.nomSection}>{libelleSection(l.entree.section)}</span>
                  <span style={st.etat}>{ETATS[l.etat]}</span>
                </div>
              )}
              {l.ecarts.length > 0 && (
                <div style={st.ecarts}>
                  {l.ecarts.map((e) => (
                    <div key={e.cle} style={st.ecart} data-reprise-ecart={e.cle}>
                      <div style={st.libelleEcart}>{e.libelle}</div>
                      <div style={st.cote}><span style={st.cle}>Ici</span><Valeur format={e.format} valeur={e.ici} /></div>
                      <div style={st.cote}><span style={st.cle}>Là-bas</span><Valeur format={e.format} valeur={e.labas} /></div>
                    </div>
                  ))}
                </div>
              )}
              {l.entree.bloc === 'pointage' && (
                <p style={st.message}>Le pointage à la borne seulement n'est jamais repris : le réglage d'ici reste.</p>
              )}
            </div>
          ))}
          {nonReprises.map((n) => (
            <div key={n.section} style={st.ligne} data-reprise-non={n.section}>
              <div style={st.entete}>
                <span style={st.nomSection}>{libelleSection(n.section)}</span>
                <span style={st.etat}>Propre à cette maison, non reprise.</span>
              </div>
            </div>
          ))}
          {coches.size > 0 && (
            <div style={ui.pied}>
              <Btn variant="primary" disabled={enCours} style={ui.btn44} onClick={reprendre} data-reprise-confirmer="">
                Reprendre les réglages cochés
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const st = {
  intro: { margin: '0 0 4px', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
  note: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)', padding: '12px 0' },
  echec: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  bloc: { display: 'flex', flexDirection: 'column', minWidth: 0, paddingTop: 8 },
  ligne: {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  entete: { display: 'flex', flexDirection: 'column', gap: 2, minHeight: 44, justifyContent: 'center', minWidth: 0 },
  nomSection: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  etat: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  message: { margin: 0, fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4 },
  ligneCompte: {
    display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  ecarts: { display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 36, minWidth: 0 },
  ecart: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  libelleEcart: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  cote: { display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0, flexWrap: 'wrap' },
  cle: { flex: '0 0 56px', fontSize: 'var(--t1)', color: 'var(--text3)' },
  valeur: { display: 'flex', flexWrap: 'wrap', gap: '4px 12px', minWidth: 0, flex: '1 1 160px', fontSize: 'var(--t2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  element: { display: 'inline-flex', gap: 4, flexWrap: 'wrap', minWidth: 0 },
};
