import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import SegmentedTabs from '../../../components/ui/SegmentedTabs.jsx';
import BandeauNonActualise from '../BandeauNonActualise.jsx';
import { zurichToday } from '../../../utils/zurichTime.js';
import { useRapportReservations } from './useRapportReservations.js';
import {
  computeReservationStats, aDuBrunch, SERVICES_LABELS,
} from './computeReservationStats.js';
import {
  PERIODES, COMPARAISONS, bornesPeriode, bornesComparaison, dateComparable, fenetreLecture, dateCh, debutMois, jourIso,
} from './periodesRapport.js';
import { BarresEmpilees, BarresMoyenne, BarresHorizontales, CarteChaleur, COULEURS_SERVICES } from './RapportGraphiques.jsx';
import RapportTableau, { exporterCsv } from './RapportTableau.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// Onglet Rapport du module Réservations : l'activité de la période, en
// lecture seule (couverts, canaux, temporalité, anticipation, composition des
// tables, clientèle, détail exportable).
//
// Les chiffres viennent tous de computeReservationStats ; ce fichier ne fait
// que les mettre en page. Mots et nombres sont rendus en nœuds séparés : la
// traduction de l'écran (English, Español) ne voit que des libellés fixes, pas
// une phrase différente pour chaque chiffre.
// ═══════════════════════════════════════════════════════════════════════════

const nf0 = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const absent = (v) => v === null || v === undefined || !Number.isFinite(v);
const entier = (v) => (absent(v) ? 'n/a' : nf0.format(Math.round(v)));
const decimal = (v) => (absent(v) ? 'n/a' : nf1.format(v));
const pct = (v) => (absent(v) ? 'n/a' : `${nf0.format(v * 100)} %`);
const jours = (v) => (absent(v) ? 'n/a' : `${nf1.format(v)} j`);
const pl = (n, un, plusieurs) => (Math.abs(Math.round(n || 0)) > 1 ? plusieurs : un);

const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_LONGS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const moisCourt = new Intl.DateTimeFormat('fr-CH', { month: 'short', timeZone: 'UTC' });
const moisLong = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateDuMois = (m) => new Date(`${m}-01T00:00:00Z`);
const jourLong = (d) => JOURS_LONGS[jourIso(d) - 1];

// Définitions affichées (infobulles des chiffres clés et « Comment lire ce
// rapport »). Elles disent exactement ce que calcule computeReservationStats.
const DEF = {
  couverts: "Couverts du rapport : honorés (arrivé ou parti), non pointés (date passée, réservation encore « attendu » ou « à confirmer ») et prévus (aujourd'hui et après). Annulations et no-show exclus.",
  tables: 'Une table est une réservation non annulée, quel que soit le nombre de tables physiques. No-show compris.',
  jourOuverture: "Couverts du rapport divisés par les jours d'ouverture : jours où au moins un service est ouvert selon les horaires de la réservation en ligne, jours fermés exclus. Sans horaires réglés, les jours avec au moins une réservation.",
  semaine: 'Couverts du rapport divisés par le nombre de jours de la période, multiplié par 7.',
  taille: 'Couverts du rapport divisés par le nombre de réservations comptées (no-show exclus).',
  occupation: "Couverts du rapport divisés par la capacité théorique : pour chaque service ouvert, la capacité du jour réglée dans la réservation en ligne, sinon la capacité par service. Les fermetures de service passées ne sont pas gardées : une période passée ne retire que les jours fermés en entier.",
  annulation: 'Réservations annulées sur toutes les réservations de la période, en tables (et en couverts).',
  noShow: 'No-show sur les réservations échues (honorées, no-show et non pointées).',
  nonPointe: "Réservations passées restées « attendu » ou « à confirmer », sur les réservations échues. Elles comptent dans les couverts, mais on ne sait pas si les clients sont venus : pointer les arrivées fiabilise le rapport.",
};

const s = {
  filtres: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginTop: 16 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', flex: '1 1 160px', minWidth: 0, maxWidth: 260 },
  select: {
    height: 40, padding: '0 10px', borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, width: '100%', minWidth: 0,
  },
  resume: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, fontSize: 13, color: 'var(--text2)' },
  boutons: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  btn: {
    padding: '9px 16px', borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
  },
  attente: { marginTop: 28, fontSize: 14, color: 'var(--text2)' },
  vide: { marginTop: 24, fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))', gap: '22px 18px', marginTop: 22 },
  titreSection: { margin: '0 0 4px', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, lineHeight: 1.2, color: 'var(--text)' },
  sousTitreSection: { margin: '0 0 12px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
  titreBloc: { margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text2)', fontFamily: 'var(--font)' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '26px 36px' },
  note: { margin: '8px 0 0', fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 },
  alerte: { marginTop: 16, fontSize: 13, color: 'var(--warning-text)', lineHeight: 1.5 },
  th: { fontWeight: 600, fontSize: 12, color: 'var(--text2)', padding: '5px 6px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' },
  td: { padding: '6px', fontSize: 13, color: 'var(--text)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' },
};

function Section({ titre, sousTitre, children }) {
  return (
    <section style={{ marginTop: 36, minWidth: 0 }}>
      <h3 style={s.titreSection}>{titre}</h3>
      {sousTitre ? <p style={s.sousTitreSection}>{sousTitre}</p> : <div style={{ height: 10 }} />}
      {children}
    </section>
  );
}

function Bloc({ titre, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <h4 style={s.titreBloc}>{titre}</h4>
      {children}
    </div>
  );
}

function Ligne({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '6px 0', fontSize: 13, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' }}>
      <span style={{ color: 'var(--text2)', minWidth: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{children}</span>
    </div>
  );
}

// colonnes : [{ cle, label, texte?, sansTraduction? }] ; lignes : [{ cle, [col]: contenu }]
function MiniTableau({ colonnes, lignes, vide = 'Rien à afficher sur la période' }) {
  if (!lignes.length) return <div style={{ fontSize: 12, color: 'var(--text2)' }}>{vide}</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
      <thead>
        <tr>
          {colonnes.map((c) => <th key={c.cle} style={{ ...s.th, textAlign: c.texte ? 'left' : 'right' }}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.cle}>
            {colonnes.map((c) => (
              <td
                key={c.cle}
                data-no-translate={c.sansTraduction ? '' : undefined}
                style={{ ...s.td, textAlign: c.texte ? 'left' : 'right', whiteSpace: c.texte ? 'normal' : 'nowrap', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}
              >
                {l[c.cle]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Un chiffre clé : libellé, valeur, variation contre la comparaison, une ligne
// d'explication. sens : 1 = la hausse est bonne, -1 = mauvaise, 0 = neutre.
function Kpi({ label, valeur, variation, unite, sens, aide, definition, alerte, libelleComparaison }) {
  let couleur = 'var(--text3)';
  if (!absent(variation) && variation !== 0 && sens) {
    couleur = (variation > 0) === (sens > 0) ? 'var(--success-text)' : 'var(--danger-text)';
  }
  const Fleche = variation > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div title={definition} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, fontFamily: 'var(--font-num)', lineHeight: 1.1, color: alerte ? 'var(--warning-text)' : 'var(--text)' }}>
        {valeur}
      </div>
      <div style={{ fontSize: 12, color: couleur, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {absent(variation) ? (
          <span>n/a</span>
        ) : (
          <>
            {variation !== 0 && <Fleche size={13} aria-hidden="true" />}
            <span>{variation > 0 ? '+' : ''}{unite === 'pts' ? nf1.format(variation) : nf0.format(variation)} {unite === 'pts' ? 'pts' : '%'}</span>
          </>
        )}
        <span style={{ color: 'var(--text3)' }}>{libelleComparaison}</span>
      </div>
      {aide ? <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.4 }}>{aide}</div> : null}
    </div>
  );
}

function ChiffresCles({ stats, libelleComparaison }) {
  const c = stats.chiffres;
  const v = stats.variations;
  const items = [
    {
      id: 'couverts', label: 'Couverts', valeur: entier(c.couverts), variation: v.couverts, sens: 1, definition: DEF.couverts,
      aide: <>{entier(c.honoreesCouverts)} honorés, {entier(c.nonPointeesCouverts)} non pointés, {entier(c.prevuesCouverts)} prévus</>,
    },
    {
      id: 'tables', label: 'Tables', valeur: entier(c.tables), variation: v.tables, sens: 1, definition: DEF.tables,
      aide: <>réservations valides, dont {entier(c.noShowTables)} no-show</>,
    },
    {
      id: 'jour', label: "Couverts par jour d'ouverture", valeur: decimal(c.couvertsParJourOuverture),
      variation: v.couvertsParJourOuverture, sens: 1, definition: DEF.jourOuverture,
      aide: c.joursOuvertureEstimes
        ? <>{entier(c.joursOuverture)} {pl(c.joursOuverture, 'jour', 'jours')} avec activité (horaires non réglés)</>
        : <>{entier(c.joursOuverture)} {pl(c.joursOuverture, "jour d'ouverture", "jours d'ouverture")}, {decimal(c.couvertsParJourActivite)} par jour avec activité</>,
    },
    {
      id: 'semaine', label: 'Couverts par semaine', valeur: decimal(c.couvertsParSemaine),
      variation: v.couvertsParSemaine, sens: 1, definition: DEF.semaine,
      aide: <>période de {entier(c.nbJours)} jours</>,
    },
    {
      id: 'taille', label: 'Couverts par table', valeur: decimal(c.tailleMoyenne),
      variation: v.tailleMoyenne, sens: 0, definition: DEF.taille,
      aide: <>taille moyenne d'une réservation</>,
    },
    {
      id: 'occupation', label: "Taux d'occupation", valeur: pct(c.occupation), unite: 'pts',
      variation: v.occupation, sens: 1, definition: DEF.occupation,
      aide: c.capacite === null
        ? <>capacité non réglée (réservation en ligne)</>
        : <>{entier(c.couverts)} couverts pour {entier(c.capacite)} places</>,
    },
    {
      id: 'annulation', label: "Taux d'annulation", valeur: pct(c.tauxAnnulationTables), unite: 'pts',
      variation: v.tauxAnnulationTables, sens: -1, definition: DEF.annulation,
      aide: <>{entier(c.annuleesTables)} {pl(c.annuleesTables, 'table annulée', 'tables annulées')}, {pct(c.tauxAnnulationCouverts)} des couverts</>,
    },
    {
      id: 'noshow', label: 'Taux de no-show', valeur: pct(c.tauxNoShow), unite: 'pts',
      variation: v.tauxNoShow, sens: -1, definition: DEF.noShow,
      aide: <>{entier(c.noShowTables)} sur {entier(c.echuesTables)} réservations échues</>,
    },
    {
      id: 'nonpointe', label: 'Non pointées', valeur: pct(c.tauxNonPointe), unite: 'pts', alerte: c.nonPointeesTables > 0,
      variation: v.tauxNonPointe, sens: -1, definition: DEF.nonPointe,
      aide: <>{entier(c.nonPointeesTables)} {pl(c.nonPointeesTables, 'réservation passée', 'réservations passées')} encore « attendu », {entier(c.nonPointeesCouverts)} couverts</>,
    },
  ];
  return (
    <>
      <div style={s.kpis}>
        {items.map((k) => <Kpi key={k.id} {...k} libelleComparaison={libelleComparaison} />)}
      </div>
      {c.nonPointeesTables > 0 && (
        <p style={s.alerte}>
          {entier(c.nonPointeesTables)} {pl(c.nonPointeesTables, 'réservation passée est restée', 'réservations passées sont restées')} « attendu ».
          {' '}Pointer les arrivées (ou marquer les no-show) dans le mode service rend le rapport fiable.
        </p>
      )}
    </>
  );
}

function BlocCanaux({ stats }) {
  const { parCanal, demandes } = stats.canaux;
  const enLigne = parCanal.find((c) => c.id === 'en_ligne');
  return (
    <Section titre="Canaux">
      <div style={s.grille}>
        <Bloc titre="Part des couverts par canal">
          <BarresHorizontales
            largeurLibelle="6rem"
            lignes={parCanal.map((c) => ({ cle: c.id, label: c.label, valeur: c.couverts, texte: pct(c.partCouverts) }))}
          />
          <div style={{ marginTop: 12 }}>
            <MiniTableau
              colonnes={[
                { cle: 'canal', label: 'Canal', texte: true },
                { cle: 'tables', label: 'Tables' },
                { cle: 'couverts', label: 'Couverts' },
                { cle: 'taille', label: 'Par table' },
              ]}
              lignes={parCanal.map((c) => ({ cle: c.id, canal: c.label, tables: entier(c.tables), couverts: entier(c.couverts), taille: decimal(c.tailleMoyenne) }))}
            />
          </div>
        </Bloc>
        <Bloc titre="Part en ligne par semaine">
          <BarresMoyenne
            unite="%"
            format={pct}
            libelleMoyenne="moyenne"
            moyenne={enLigne?.partCouverts || 0}
            vide="Aucun couvert en ligne sur la période"
            points={stats.temporalite.parSemaine.map((w) => ({
              cle: w.lundi,
              label: dateCh(w.lundi).slice(0, 5),
              valeur: w.partEnLigne || 0,
              detail: <>Semaine du {dateCh(w.lundi)} : {pct(w.partEnLigne)} des couverts en ligne</>,
            }))}
          />
        </Bloc>
        <Bloc titre="Demandes en ligne">
          <Ligne label="Reçues">{entier(demandes.recues)}</Ligne>
          <Ligne label="Acceptées">{entier(demandes.acceptees)}</Ligne>
          <Ligne label="Annulées ou refusées">{entier(demandes.annulees)}</Ligne>
          <Ligne label="En attente">{entier(demandes.enAttente)}</Ligne>
          <p style={s.note}>En confirmation automatique, une réservation en ligne est acceptée d'office.</p>
        </Bloc>
      </div>
    </Section>
  );
}

function BlocTemporalite({ stats, series }) {
  const t = stats.temporalite;
  const [heures, setHeures] = useState(false);
  const detailServices = (valeurs) => (series.length > 1 ? (
    <> ({series.map((sv, i) => (
      <span key={sv.id}>{i ? ', ' : ''}{sv.label.toLowerCase()} {entier(valeurs[sv.id] || 0)}</span>
    ))})</>
  ) : null);

  const parJour = t.parJour.map((j) => ({
    cle: j.date,
    label: dateCh(j.date).slice(0, 5),
    valeurs: j.valeurs,
    total: j.total,
    detail: !j.ouvert && j.total === 0
      ? <>{jourLong(j.date)} {dateCh(j.date)} : fermé</>
      : <>{jourLong(j.date)} {dateCh(j.date)} : {entier(j.total)} {pl(j.total, 'couvert', 'couverts')}{detailServices(j.valeurs)}, {entier(j.tables)} {pl(j.tables, 'table', 'tables')}</>,
  }));
  const jourSemaine = t.parJourSemaine.map((j) => ({
    cle: String(j.iso),
    label: JOURS_COURTS[j.iso - 1],
    valeurs: Object.fromEntries(series.map((sv) => [sv.id, j.parService[sv.id]?.couverts || 0])),
    total: j.couverts || 0,
    detail: j.nbJours
      ? <>{JOURS_LONGS[j.iso - 1]} : {decimal(j.couverts)} couverts en moyenne, {decimal(j.tables)} tables ({entier(j.nbJours)} {pl(j.nbJours, 'jour', 'jours')})</>
      : <>{JOURS_LONGS[j.iso - 1]} : aucun jour ouvert</>,
  }));

  return (
    <Section titre="Temporalité">
      <Bloc titre="Couverts par jour">
        <BarresEmpilees points={parJour} series={series} />
      </Bloc>
      <div style={{ ...s.grille, marginTop: 26 }}>
        <Bloc titre="Couverts par semaine">
          <BarresMoyenne
            format={entier}
            libelleMoyenne="moyenne"
            moyenne={stats.chiffres.couvertsParSemaine || 0}
            points={t.parSemaine.map((w) => ({
              cle: w.lundi,
              label: dateCh(w.lundi).slice(0, 5),
              valeur: w.couverts,
              detail: <>Semaine du {dateCh(w.lundi)} : {entier(w.couverts)} couverts, {entier(w.tables)} tables{w.complete ? '' : ' (en partie hors période)'}</>,
            }))}
          />
        </Bloc>
        {t.parMois.length > 1 && (
          <Bloc titre="Couverts par mois">
            <BarresMoyenne
              format={entier}
              libelleMoyenne="moyenne"
              moyenne={t.moyenneMois || 0}
              points={t.parMois.map((m) => ({
                cle: m.mois,
                label: moisCourt.format(dateDuMois(m.mois)),
                valeur: m.couverts,
                detail: <>{moisLong.format(dateDuMois(m.mois))} : {entier(m.couverts)} couverts, {entier(m.tables)} tables</>,
              }))}
            />
          </Bloc>
        )}
        <Bloc titre="Moyenne par jour de la semaine">
          <BarresEmpilees points={jourSemaine} series={series} hauteur={120} />
        </Bloc>
        <Bloc titre="Répartition par service">
          <BarresHorizontales
            largeurLibelle="5rem"
            lignes={t.repartition.map((r) => ({
              cle: r.service,
              label: SERVICES_LABELS[r.service] || r.service,
              valeur: r.couverts,
              couleur: COULEURS_SERVICES[r.service],
              texte: <>{entier(r.couverts)} couverts</>,
              sousTexte: pct(r.part),
            }))}
          />
          {stats.avecBrunch && <p style={s.note}>Le brunch est compté à part ici ; le planning de la semaine le range avec le midi.</p>}
        </Bloc>
        <Bloc titre="Repères (jours passés)">
          <Ligne label="Meilleur jour">
            {t.meilleurJour ? <>{jourLong(t.meilleurJour.date)} {dateCh(t.meilleurJour.date)}, {entier(t.meilleurJour.total)} couverts</> : 'n/a'}
          </Ligne>
          <Ligne label="Jour d'ouverture le plus calme">
            {t.pireJour ? <>{jourLong(t.pireJour.date)} {dateCh(t.pireJour.date)}, {entier(t.pireJour.total)} couverts</> : 'n/a'}
          </Ligne>
          <Ligne label="Meilleure semaine">
            {t.meilleureSemaine ? <>Semaine du {dateCh(t.meilleureSemaine.lundi)}, {entier(t.meilleureSemaine.couverts)} couverts</> : 'n/a'}
          </Ligne>
        </Bloc>
      </div>
      <div style={{ marginTop: 26 }}>
        <Bloc titre="Heures d'arrivée">
          <button type="button" onClick={() => setHeures((v) => !v)} style={s.btn} aria-expanded={heures}>
            {heures ? "Masquer les heures d'arrivée" : "Afficher les heures d'arrivée"}
          </button>
          {heures && <div style={{ marginTop: 12 }}><CarteChaleur {...t.heatmap} /></div>}
        </Bloc>
      </div>
    </Section>
  );
}

function BlocAnticipation({ stats, reference }) {
  const a = stats.anticipation;
  const lignesDelai = [...a.parCanal, { id: 'tous', label: 'Tous', ...a.global }];
  return (
    <Section titre="Anticipation">
      <div style={s.grille}>
        <Bloc titre="Délai de réservation (tables)">
          <BarresHorizontales
            largeurLibelle="10rem"
            lignes={a.tranches.map((t) => ({ cle: t.id, label: t.label, valeur: t.tables, texte: entier(t.tables), sousTexte: pct(t.part) }))}
          />
        </Bloc>
        <Bloc titre="Délai par canal">
          <MiniTableau
            colonnes={[
              { cle: 'canal', label: 'Canal', texte: true },
              { cle: 'tables', label: 'Tables' },
              { cle: 'moyenne', label: 'Délai moyen' },
              { cle: 'mediane', label: 'Délai médian' },
            ]}
            lignes={lignesDelai.map((l) => ({ cle: l.id, canal: l.label, tables: entier(l.tables), moyenne: jours(l.moyenne), mediane: jours(l.mediane) }))}
          />
          <p style={s.note}>Jours entre la saisie de la réservation (heure de Zurich) et le service.</p>
        </Bloc>
        <Bloc titre="Carnet à venir (couverts)">
          <MiniTableau
            colonnes={[
              { cle: 'horizon', label: 'Horizon', texte: true },
              { cle: 'actuel', label: "Réservés aujourd'hui" },
              { cle: 'avant', label: <>Réservés le {dateCh(reference)}</> },
              { cle: 'ecart', label: 'Écart' },
            ]}
            lignes={a.carnets.map((c) => ({
              cle: String(c.jours),
              horizon: <>{c.jours} prochains jours</>,
              actuel: entier(c.actuel),
              avant: entier(c.avant),
              ecart: absent(c.variation) ? 'n/a' : `${c.variation > 0 ? '+' : ''}${nf0.format(c.variation)} %`,
            }))}
          />
          <p style={s.note}>
            Déjà réservé pour les prochains jours, comparé à ce qui l'était le {dateCh(reference)} pour les jours suivants. Une réservation annulée depuis ne compte d'aucun côté.
          </p>
        </Bloc>
      </div>
    </Section>
  );
}

function BlocComposition({ stats }) {
  const c = stats.composition;
  return (
    <Section titre="Composition des tables">
      <div style={s.grille}>
        <Bloc titre="Taille des tables">
          <BarresHorizontales
            largeurLibelle="9rem"
            lignes={c.tailles.map((t) => ({ cle: t.id, label: t.label, valeur: t.tables, texte: entier(t.tables), sousTexte: pct(t.part) }))}
          />
        </Bloc>
        <Bloc titre="Groupes et placement">
          <Ligne label="Groupes">
            {entier(c.groupes.tables)} {pl(c.groupes.tables, 'table', 'tables')}, {entier(c.groupes.couverts)} couverts ({pct(c.groupes.part)})
          </Ligne>
          <Ligne label="Placées sur le plan de salle">
            {entier(c.placement.placees)} sur {entier(c.placement.total)} ({pct(c.placement.taux)})
          </Ligne>
          <p style={s.note}>Les chiffres par table physique ne portent que sur les réservations placées sur le plan de salle.</p>
        </Bloc>
        <Bloc titre="Tables les plus utilisées">
          <MiniTableau
            vide="Aucune réservation placée sur le plan de salle"
            colonnes={[
              { cle: 'nom', label: 'Table', texte: true, sansTraduction: true },
              { cle: 'places', label: 'Places' },
              { cle: 'reservations', label: 'Réservations' },
              { cle: 'couverts', label: 'Couverts' },
            ]}
            lignes={c.topTables.map((t) => ({ cle: t.id, nom: t.nom, places: t.places ?? 'n/a', reservations: entier(t.reservations), couverts: entier(t.couverts) }))}
          />
        </Bloc>
        <Bloc titre="Couverts par zone">
          {c.zones ? (
            <BarresHorizontales
              lignes={c.zones.map((z) => ({ cle: z.zone, label: z.zone, valeur: z.couverts, texte: entier(z.couverts) }))}
              vide="Aucune réservation placée sur le plan de salle"
            />
          ) : (
            <p style={{ ...s.note, marginTop: 0 }}>Aucune zone renseignée sur les tables du plan de salle.</p>
          )}
        </Bloc>
      </div>
    </Section>
  );
}

function BlocClientele({ stats }) {
  const c = stats.clientele;
  return (
    <Section titre="Clientèle">
      <div style={s.grille}>
        <Bloc titre="Fichier clients">
          <Ligne label="Avec fiche client">{entier(c.avecFiche.tables)} ({pct(c.partAvecFiche)})</Ligne>
          <Ligne label="Sans fiche client">{entier(c.sansFiche.tables)}</Ligne>
          <Ligne label="Clients différents">{entier(c.clientsUniques)}</Ligne>
          <Ligne label="Clients revenus">{entier(c.clientsRevenus)}</Ligne>
          <Ligne label="Taux de retour">{pct(c.tauxRetour)}</Ligne>
          <p style={s.note}>Revenus : au moins deux réservations honorées sur la période. Taux de retour : revenus sur clients venus au moins une fois.</p>
        </Bloc>
        <Bloc titre="Meilleurs clients">
          <MiniTableau
            vide="Aucune réservation rattachée à une fiche client"
            colonnes={[
              { cle: 'nom', label: 'Client', texte: true, sansTraduction: true },
              { cle: 'reservations', label: 'Réservations' },
              { cle: 'couverts', label: 'Couverts' },
            ]}
            lignes={c.top.map((x) => ({ cle: x.id, nom: x.nom, reservations: entier(x.reservations), couverts: entier(x.couverts) }))}
          />
        </Bloc>
        <Bloc titre="Occasions, allergènes, régimes">
          {c.tags.map((t) => (
            <div key={t.id} style={{ marginBottom: 12 }}>
              <Ligne label={t.label}>{entier(t.tables)} {pl(t.tables, 'table', 'tables')}, {entier(t.couverts)} couverts</Ligne>
              {t.valeurs.map((v) => (
                <div key={v.valeur} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text3)', padding: '4px 0 0 12px' }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{v.valeur}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{entier(v.tables)} {pl(v.tables, 'table', 'tables')}, {entier(v.couverts)} couverts</span>
                </div>
              ))}
            </div>
          ))}
        </Bloc>
        <Bloc titre="Passeport gourmand">
          <Ligne label="Tables">{entier(c.passeport.tables)}</Ligne>
          <Ligne label="Couverts">{entier(c.passeport.couverts)}</Ligne>
        </Bloc>
      </div>
    </Section>
  );
}

function Definitions({ avecBrunch }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <section style={{ marginTop: 36 }}>
      <button type="button" onClick={() => setOuvert((v) => !v)} style={s.btn} aria-expanded={ouvert}>
        {ouvert ? 'Masquer les définitions' : 'Comment lire ce rapport'}
      </button>
      {ouvert && (
        <ul style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>{DEF.couverts}</li>
          <li>{DEF.tables} Les tables physiques ne sont connues que pour les réservations placées sur le plan de salle.</li>
          <li>{DEF.jourOuverture}</li>
          <li>{DEF.occupation}</li>
          <li>{DEF.annulation}</li>
          <li>Taux de no-show et non pointées : sur les réservations échues (honorées, no-show et non pointées).</li>
          <li>Délai de réservation : jours entre la saisie de la réservation (heure de Zurich) et le service.</li>
          <li>Semaine du lundi au dimanche, mois civil, heure de Zurich. Les variations comparent à la période choisie dans « Comparer avec » : en % pour les volumes, en points pour les taux ; n/a quand la comparaison est vide.</li>
          {avecBrunch && <li>Le brunch est compté à part ; le planning de la semaine et le mode service le rangent avec le midi.</li>}
        </ul>
      )}
    </section>
  );
}

export default function RapportReservations({ etablissementId }) {
  const aujourdhui = zurichToday();
  const [periodeId, setPeriodeId] = useState('mois');
  const [perso, setPerso] = useState(() => ({ debut: debutMois(aujourdhui), fin: aujourdhui }));
  const [service, setService] = useState('tous');
  const [comparaisonId, setComparaisonId] = useState('precedente');

  const periode = useMemo(() => bornesPeriode(periodeId, aujourdhui, perso), [periodeId, aujourdhui, perso]);
  const comparaison = useMemo(() => bornesComparaison(periode, comparaisonId), [periode, comparaisonId]);
  const reference = dateComparable(aujourdhui, periode, comparaisonId);
  const fenetre = fenetreLecture(periode, comparaison, aujourdhui, reference);
  const { donnees, status, nonActualise, enCours, actualiser } = useRapportReservations(etablissementId, fenetre.debut, fenetre.fin);

  // Les lignes affichées doivent couvrir toute la fenêtre demandée ; sinon
  // (nouvelle période en cours de lecture) on attend plutôt que d'afficher
  // des chiffres faux.
  const couvre = Boolean(donnees && donnees.debut <= fenetre.debut && donnees.fin >= fenetre.fin);
  const avecBrunch = donnees ? aDuBrunch(donnees.lignes, donnees.parametres) : false;

  useEffect(() => {
    if (service === 'brunch' && donnees && !avecBrunch) setService('tous');
  }, [service, donnees, avecBrunch]);

  const stats = useMemo(() => (couvre ? computeReservationStats({
    lignes: donnees.lignes,
    periode,
    comparaison,
    aujourdhui,
    reference,
    service,
    parametres: donnees.parametres,
    tables: donnees.tables,
  }) : null), [couvre, donnees, periode, comparaison, aujourdhui, reference, service]);

  const series = (stats?.services || []).map((sv) => ({ id: sv, label: SERVICES_LABELS[sv], couleur: COULEURS_SERVICES[sv] }));
  const libelleComparaison = comparaisonId === 'n1' ? 'vs N-1' : 'vs période précédente';
  const echec = !couvre && !enCours && (status === 'error' || nonActualise);

  const ongletsService = [
    { id: 'tous', label: 'Tous les services' },
    { id: 'midi', label: 'Midi' },
    { id: 'soir', label: 'Soir' },
    ...(avecBrunch ? [{ id: 'brunch', label: 'Brunch' }] : []),
  ];

  return (
    <div style={{ minWidth: 0, maxWidth: '100%', paddingBottom: 32 }}>
      <div style={s.filtres}>
        <label style={s.champ}>
          <span>Période</span>
          <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} style={s.select}>
            {PERIODES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {periodeId === 'perso' && (
          <>
            <label style={s.champ}>
              <span>Début</span>
              <input type="date" value={perso.debut} onChange={(e) => setPerso((x) => ({ ...x, debut: e.target.value }))} style={s.select} />
            </label>
            <label style={s.champ}>
              <span>Fin</span>
              <input type="date" value={perso.fin} onChange={(e) => setPerso((x) => ({ ...x, fin: e.target.value }))} style={s.select} />
            </label>
          </>
        )}
        <label style={s.champ}>
          <span>Comparer avec</span>
          <select value={comparaisonId} onChange={(e) => setComparaisonId(e.target.value)} style={s.select}>
            {COMPARAISONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <SegmentedTabs size="sm" tabs={ongletsService} active={service} onChange={setService} style={{ marginTop: 14 }} />

      <div style={s.resume}>
        <span style={{ minWidth: 0 }}>
          {/* Flèches plutôt que « du … au » : « au » (deux lettres) échappe à
              la traduction de l'écran. */}
          {dateCh(periode.debut)} → {dateCh(periode.fin)}, comparé à {dateCh(comparaison.debut)} → {dateCh(comparaison.fin)}
        </span>
        <div style={s.boutons}>
          <button type="button" onClick={() => actualiser()} disabled={enCours} style={{ ...s.btn, opacity: enCours ? 0.6 : 1 }}>
            {enCours ? 'Actualisation…' : 'Actualiser'}
          </button>
          <button
            type="button"
            onClick={() => stats && exporterCsv(stats.tableau, periode)}
            disabled={!stats || stats.vide}
            style={{ ...s.btn, opacity: !stats || stats.vide ? 0.6 : 1, cursor: !stats || stats.vide ? 'not-allowed' : 'pointer' }}
          >
            Exporter CSV
          </button>
        </div>
      </div>

      {nonActualise && <div style={{ marginTop: 12 }}><BandeauNonActualise onRetry={actualiser} /></div>}

      {echec && (
        <div role="alert" style={s.attente}>
          Le rapport n'a pas pu être chargé.{' '}
          <button type="button" onClick={() => actualiser()} style={s.btn}>Réessayer</button>
        </div>
      )}
      {!stats && !echec && <div style={s.attente}>Chargement du rapport…</div>}

      {stats && (
        <>
          {stats.vide && <div style={s.vide}>Aucune réservation sur la période</div>}
          <ChiffresCles stats={stats} libelleComparaison={libelleComparaison} />
          {!stats.vide && (
            <>
              <BlocCanaux stats={stats} />
              <BlocTemporalite stats={stats} series={series} />
              <BlocAnticipation stats={stats} reference={reference} />
              <BlocComposition stats={stats} />
              <BlocClientele stats={stats} />
              <Section
                titre={stats.tableau.granularite === 'jour' ? 'Détail par jour' : 'Détail par semaine'}
                sousTitre="Canaux en couverts ; annulées, no-show et non pointées en tables. Touchez un en-tête pour trier."
              >
                <RapportTableau tableau={stats.tableau} />
              </Section>
            </>
          )}
          <Definitions avecBrunch={stats.avecBrunch} />
        </>
      )}
    </div>
  );
}
