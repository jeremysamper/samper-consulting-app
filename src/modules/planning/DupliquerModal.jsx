import React from 'react';
import { Choix, Fenetre, Options, st } from './planningUi.jsx';
import { ajouterJours } from './planningModeles.js';
import { libellePeriode } from './planningExport.js';
import { accord, planDuplication, planReprendre, planSemaines, planVersSuivante, resumeDuplication } from './planningDuplication.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dupliquer : le cas fréquent en un geste, le reste rangé.
//
// En tête, deux actions immédiates qui disent d'où vers où, chacune avec son
// résumé déjà calculé (toucher l'action EST la confirmation) :
// 1. « Reprendre la semaine du … » : la semaine d'avant SUR la semaine affichée ;
// 2. « Copier cette semaine sur la suivante » : la semaine affichée sur celle
//    d'après (la grille y passe ensuite, pour montrer le résultat).
// Toujours en mode garder : rien n'est effacé. Une action qui ne copierait rien
// est grisée avec sa raison. Le reste (une personne, une journée, toute la
// semaine vers une ou plusieurs semaines, Garder ou Remplacer) est dans
// « Autres copies ». Tant que la dernière lecture des horaires a échoué
// (nonActualise), rien ne se copie : les plans seraient faux.
//
// Plans et règles : planningDuplication.js (pur, testé). La fermeture n'est
// jamais bloquée : pendant l'écriture, « Annuler » devient « Fermer » ; une
// écriture finie après fermeture affiche son issue (bandeau ou toast) sans
// piloter la fenêtre.
// ─────────────────────────────────────────────────────────────────────────────

const jourCourt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(',', '');
const jourLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
const periode = (debut) => libellePeriode(debut, ajouterJours(debut, 6));
// « 26 octobre au 1er novembre 2026 » : la période sans son « du » d'ouverture,
// pour « Reprendre la semaine du … ». « Du 9 au 15 novembre 2026 » reste en un
// seul nœud : « Du » seul (deux lettres) ne serait jamais traduit.
const periodeNue = (debut) => periode(debut).replace(/^du /, '');
const periodeDu = (debut) => periode(debut).replace(/^du /, 'Du ');

// Résumé d'un plan : chaque nombre dans son propre nœud, la phrase autour
// reste une entrée du glossaire.
export function Resume({ parts }) {
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={p.cle}>{i > 0 && ', '}<span>{p.n}</span> {p.texte}</React.Fragment>
      ))}.
    </>
  );
}

const COPIES_SEMAINE = ['horaire sera copié sur cette semaine', 'horaires seront copiés sur cette semaine'];
const COPIES = ['horaire sera copié', 'horaires seront copiés'];
const CREES = ['horaire sera créé', 'horaires seront créés'];
const REMPLACES = ['horaire existant sera remplacé', 'horaires existants seront remplacés'];
const NON_ACTUALISE = 'Planning non actualisé : réessayez.';

export default function DupliquerModal({ semaine, existants, employees, estAbsent, nonActualise = false, etablissementId, onDupliquer, onFait, onClose }) {
  const ouvertRef = React.useRef(true);
  React.useEffect(() => { ouvertRef.current = true; return () => { ouvertRef.current = false; }; }, []);
  const [enCours, setEnCours] = React.useState(null); // 'reprendre' | 'suivante' | 'autres' | null
  const [autres, setAutres] = React.useState(false);
  const [quoi, setQuoi] = React.useState('personne'); // personne | jour | semaine
  const [personneId, setPersonneId] = React.useState(employees[0]?.id || '');
  const [jourSource, setJourSource] = React.useState(semaine);
  // « Vers » de la semaine d'une personne comme de toute la semaine : 1 = la suivante.
  const [nbSemaines, setNbSemaines] = React.useState(1);
  const [joursCibles, setJoursCibles] = React.useState(new Set());
  const [remplacer, setRemplacer] = React.useState(false);

  const semainePrec = ajouterJours(semaine, -7);
  const semaineSuiv = ajouterJours(semaine, 7);
  const joursSemaine = React.useMemo(() => Array.from({ length: 7 }, (_, i) => ajouterJours(semaine, i)), [semaine]);

  // Plans mémorisés : une mise à jour realtime ou un choix dans la fenêtre ne
  // refait que ce qui a changé (existants et estAbsent restent les mêmes objets
  // côté Planning.jsx tant que les horaires et les absences ne bougent pas).
  const reprendre = React.useMemo(() => planReprendre({ semaine, existants, estAbsent, etablissementId }), [semaine, existants, estAbsent, etablissementId]);
  const suivante = React.useMemo(() => planVersSuivante({ semaine, existants, estAbsent, etablissementId }), [semaine, existants, estAbsent, etablissementId]);

  // « Autres copies » : calculé seulement quand la section est ouverte.
  const autre = React.useMemo(() => {
    if (!autres) return null;
    if (quoi === 'jour') {
      const dates = [...joursCibles].filter(d => d !== jourSource);
      return planDuplication({ sources: existants.filter(s => s.date === jourSource), cibles: () => dates, existants, remplacer, estAbsent, etablissementId });
    }
    return planSemaines({
      debutSource: semaine,
      offsets: Array.from({ length: nbSemaines }, (_, i) => 7 * (i + 1)),
      existants,
      personneId: quoi === 'personne' ? personneId : null,
      remplacer,
      estAbsent,
      etablissementId,
    });
  }, [autres, quoi, joursCibles, jourSource, semaine, nbSemaines, personneId, remplacer, existants, estAbsent, etablissementId]);

  const lancer = async (action, plan) => {
    if (!plan || !plan.aCreer.length || enCours || nonActualise) return;
    setEnCours(action);
    try {
      await onDupliquer({ aCreer: plan.aCreer, aSupprimer: plan.aSupprimer });
      if (ouvertRef.current) {
        onFait?.(action);
        onClose();
      }
    } catch {
      // Message déjà affiché ; la fenêtre reste ouverte pour réessayer.
    } finally {
      if (ouvertRef.current) setEnCours(null);
    }
  };

  // Lecture en échec : une semaine « vide » peut ne pas l'être, rien ne se copie.
  const raisonReprendre = nonActualise ? NON_ACTUALISE
    : reprendre.sources.length === 0 ? 'Rien à reprendre : cette semaine-là est vide.'
      : reprendre.aCreer.length === 0 ? 'Tout est déjà en place, rien ne sera copié.' : null;
  const raisonSuivante = nonActualise ? NON_ACTUALISE
    : suivante.sources.length === 0 ? 'Cette semaine est vide, rien à copier.'
      : suivante.aCreer.length === 0 ? 'Tout est déjà en place, rien ne sera copié.' : null;

  // Jours proposés comme cibles d'une journée : les deux semaines qui suivent le jour source.
  const joursProposes = Array.from({ length: 14 }, (_, i) => ajouterJours(jourSource, i + 1));
  const basculerJour = (d) => setJoursCibles(prev => {
    const n = new Set(prev);
    if (n.has(d)) n.delete(d); else n.add(d);
    return n;
  });
  const nAutre = autre && !nonActualise ? autre.aCreer.length : 0;

  return (
    <Fenetre
      id="planning-dupliquer"
      titre="Dupliquer des horaires"
      sousTitre={<>Semaine affichée : <span>{periode(semaine)}</span></>}
      onClose={onClose}
      largeur={520}
      pied={autres ? (
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>{enCours ? 'Fermer' : 'Annuler'}</button>
          <button type="button" style={{ ...st.primaire, opacity: nAutre && !enCours ? 1 : 0.5 }} onClick={() => lancer('autres', autre)} disabled={!nAutre || !!enCours}>
            {enCours === 'autres' ? 'Duplication…' : nAutre ? <>Dupliquer (<span>{nAutre}</span>)</> : 'Dupliquer'}
          </button>
        </>
      ) : (
        <button type="button" style={st.secondaire} onClick={onClose}>Fermer</button>
      )}
    >
      <div style={s.actions}>
        <Choix
          titre={<>Reprendre la semaine du <span>{periodeNue(semainePrec)}</span></>}
          detail={enCours === 'reprendre' ? 'Copie en cours…' : raisonReprendre || <Resume parts={resumeDuplication(reprendre, { copies: COPIES_SEMAINE })} />}
          onClick={() => lancer('reprendre', reprendre)}
          disabled={Boolean(raisonReprendre) || Boolean(enCours)}
        />
        <Choix
          titre="Copier cette semaine sur la suivante"
          detail={enCours === 'suivante'
            ? 'Copie en cours…'
            : raisonSuivante || <><span>{periodeDu(semaineSuiv)}</span> : <Resume parts={resumeDuplication(suivante, { copies: COPIES })} /></>}
          onClick={() => lancer('suivante', suivante)}
          disabled={Boolean(raisonSuivante) || Boolean(enCours)}
        />
        <div style={st.remarque}>Rien n'est effacé : un horaire déjà prévu reste en place, un jour d'absence est sauté, les pointages ne sont jamais copiés.</div>
      </div>

      <button type="button" style={{ ...st.secondaire, alignSelf: 'flex-start' }} onClick={() => setAutres(v => !v)} aria-expanded={autres}>
        {autres ? 'Moins d\'options' : 'Autres copies'}
      </button>

      {autres && (
        <>
          <div>
            <div style={st.label}>Quoi</div>
            <Options
              nom="dupliquer-quoi"
              valeur={quoi}
              onChange={setQuoi}
              options={[
                { v: 'personne', label: 'La semaine d\'une personne' },
                { v: 'jour', label: 'Une journée', detail: 'Les horaires de toute l\'équipe ce jour-là, vers d\'autres jours.' },
                { v: 'semaine', label: 'Toute la semaine' },
              ]}
            />
          </div>

          {quoi === 'personne' && (
            <div>
              <label style={st.label} htmlFor="dupliquer-personne">Personne</label>
              <select id="dupliquer-personne" style={{ ...st.champ, marginTop: 4 }} value={personneId} onChange={e => setPersonneId(e.target.value)}>
                {employees.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
              </select>
            </div>
          )}

          {quoi === 'jour' && (
            <>
              <div>
                <label style={st.label} htmlFor="dupliquer-jour">Journée à recopier</label>
                <select id="dupliquer-jour" style={{ ...st.champ, marginTop: 4 }} value={jourSource} onChange={e => { setJourSource(e.target.value); setJoursCibles(new Set()); }}>
                  {joursSemaine.map(d => <option key={d} value={d}>{jourLong(d)}</option>)}
                </select>
              </div>
              <div>
                <div style={st.label}>Vers ces jours</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {joursProposes.map(d => {
                    const actif = joursCibles.has(d);
                    return (
                      <button key={d} type="button" onClick={() => basculerJour(d)} aria-pressed={actif}
                        style={{ padding: '8px 10px', minHeight: 40, borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', borderWidth: 1, borderStyle: 'solid', borderColor: actif ? 'var(--accent)' : 'var(--border)', background: actif ? 'var(--accent)' : 'var(--surface)', color: actif ? 'var(--on-accent)' : 'var(--text)' }}>
                        {jourCourt(d)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {quoi !== 'jour' && (
            <div>
              <label style={st.label} htmlFor="dupliquer-nb">Vers</label>
              <select id="dupliquer-nb" style={{ ...st.champ, marginTop: 4 }} value={nbSemaines} onChange={e => setNbSemaines(Number(e.target.value))}>
                <option value={1}>La semaine suivante</option>
                {[2, 3, 4, 6, 8].map(n => <option key={n} value={n}>Les {n} semaines suivantes</option>)}
              </select>
            </div>
          )}

          <div>
            <div style={st.label}>Si quelqu'un a déjà un horaire</div>
            <Options
              nom="dupliquer-existants"
              valeur={remplacer ? 'remplacer' : 'garder'}
              onChange={v => setRemplacer(v === 'remplacer')}
              options={[
                { v: 'garder', label: 'Garder l\'existant', detail: 'Seuls les créneaux libres sont remplis.' },
                { v: 'remplacer', label: quoi === 'jour' ? 'Remplacer les créneaux qui se chevauchent' : 'Remplacer ses horaires de la semaine', detail: 'Les horaires déjà pointés restent en place.' },
              ]}
            />
          </div>

          <div style={st.apercu} aria-live="polite">
            {nonActualise
              ? NON_ACTUALISE
              : autre.sources.length === 0
              ? 'Rien à dupliquer ici.'
              : autre.aCreer.length === 0
                ? (quoi === 'jour' && joursCibles.size === 0 ? 'Choisissez au moins un jour.' : 'Tout est déjà en place, rien ne sera copié.')
                : <ApercuAutre plan={autre} />}
          </div>
        </>
      )}
    </Fenetre>
  );
}

// « 12 horaires seront créés, … » puis « 1 personne, 6 jours. »
function ApercuAutre({ plan }) {
  const personnes = new Set(plan.aCreer.map(c => c.userId)).size;
  const jours = new Set(plan.aCreer.map(c => c.date)).size;
  return (
    <>
      <Resume parts={resumeDuplication(plan, { copies: CREES, remplaces: REMPLACES })} />
      <div style={{ ...st.remarque, marginTop: 4 }}>
        <span>{personnes}</span> {accord(personnes, 'personne', 'personnes')}, <span>{jours}</span> {accord(jours, 'jour', 'jours')}.
      </div>
    </>
  );
}

const s = {
  actions: { display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 },
};
