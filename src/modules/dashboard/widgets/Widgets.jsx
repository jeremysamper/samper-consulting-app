import React from 'react';
import { CircleCheck } from 'lucide-react';
import { Anneau, Barres, pictoCercleStyle } from '../../../components/ui/index.jsx';
import { getModuleIcon } from '../../moduleIcons.js';
import { metaMotif, periodeAbsence } from '../../../utils/absences.js';
import { userDisplay } from '../../../utils/userDisplay.js';
import CartePointage from '../CartePointage.jsx';
import AFaire from '../AFaire.jsx';
import QuiTravaille from '../QuiTravaille.jsx';
import CarteHotel from '../CarteHotel.jsx';
import MotConsultant from '../MotConsultant.jsx';
import CeQuiVousAttend from '../CeQuiVousAttend.jsx';
import { Regularite, blocsDeGestion } from '../ChiffresGestion.jsx';
import { CarteCouverts, CarteEquipe, CarteSemaine } from '../CartesModele.jsx';
import { Chiffre, LienModule, Parties, Repere, Section, StatutGroupe, Vide } from '../tableauBriques.jsx';
import { absencesAVenir, absencesDuJour, jourRelatif, heureParlee, pertesParSemaine, relevesDuJour } from '../tableauLogique.js';
import { CAPACITE_RACCOURCIS } from './dispositionLogique.js';

// ─────────────────────────────────────────────────────────────────────────────
// Composants des widgets du tableau de bord. Chacun reçoit :
//   t       ce que le tableau de bord a lu et calculé (TableauDeBord.jsx), avec
//           peutOuvrir et ouvrir ; aucun widget ne lit la base lui-même, sauf
//           les briques d'avant qui le faisaient déjà (hôtel)
//   taille  petit, moyen, grand ou pleine : ce que le widget montre
//   id      son identifiant (repères et chiffres partagent un composant)
// Aucune barre de défilement : une liste borne ses lignes selon la taille et
// finit par « Voir tout », qui ouvre le module. Les briques d'avant gardent
// leur contenu et leurs gardes.
// ─────────────────────────────────────────────────────────────────────────────

const ICONES_REPERES = { couverts: getModuleIcon('previsions'), groupes: getModuleIcon('groupes'), equipe: getModuleIcon('planning') };

export function WidgetRepere({ t, id }) {
  const cle = id.replace('repere-', '');
  const r = t.reperes.find((x) => x.id === cle);
  if (!r) return null;
  return <Repere repere={r} icone={ICONES_REPERES[cle]} onClick={t.peutOuvrir(r.page) ? () => t.ouvrir(r.page) : null} />;
}

export function WidgetPointage({ t }) {
  const p = t.pointage;
  return (
    <CartePointage
      shifts={p.mesShifts}
      prochain={p.monProchain}
      aujourdhui={t.aujourdhui}
      maintenant={t.maintenant}
      onPointer={p.pointer}
      enCours={p.enCours}
      erreur={p.erreur}
      onPointerHorsPlanning={p.pointerHorsPlanning}
      onVoirPlanning={t.peutOuvrir('planning') ? () => t.ouvrir('planning') : null}
    />
  );
}

// Lignes de « À faire maintenant » par taille ; la suite reste derrière
// « Voir N autres points », comme avant.
const LIGNES_A_FAIRE = { moyen: 2, grand: 6, pleine: 10 };

export function WidgetAFaire({ t, taille }) {
  return <AFaire items={t.items} max={LIGNES_A_FAIRE[taille] || 6} peutOuvrir={t.peutOuvrir} ouvrir={t.ouvrir} />;
}

export function WidgetEquipe({ t }) {
  return <CarteEquipe shifts={t.d.shifts} aujourdhui={t.aujourdhui} maintenant={t.maintenant} onOuvrir={t.versPlanning} />;
}

export function WidgetSemaine({ t, taille }) {
  return <CarteSemaine couverts={t.d.couverts} aujourdhui={t.aujourdhui} onOuvrir={t.versReservations} compacte={taille === 'moyen'} />;
}

export function WidgetReservations({ t, taille }) {
  return <CarteCouverts couverts={t.d.couverts} aujourdhui={t.aujourdhui} onOuvrir={t.versReservations} compacte={taille === 'moyen'} />;
}

export function WidgetQuiTravaille({ t, taille }) {
  return (
    <QuiTravaille
      aujourdhui={t.aujourdhui}
      maintenant={t.maintenant}
      shifts={t.d.shifts}
      absences={t.absences}
      telephones={t.telephones}
      avecAbsences={t.absencesLues}
      echec={t.nonLu('shifts')}
      peutOuvrir={t.peutOuvrir}
      ouvrir={t.ouvrir}
      lignesMax={taille === 'grand' ? 3 : 8}
    />
  );
}

export function WidgetHotel({ t }) {
  return <CarteHotel etabId={t.etabId} aujourdhui={t.aujourdhui} peutOuvrir={t.peutOuvrir} ouvrir={t.ouvrir} />;
}

export function WidgetMot({ t }) {
  return <MotConsultant message={t.d.message} consultant={t.consultant} onPublier={t.publierMessage} />;
}

export function WidgetAVenir({ t }) {
  return (
    <CeQuiVousAttend
      mobile={t.mobile}
      enTeteAujourdhui={t.mobile && t.avecPlanning ? (
        <QuiTravaille
          dansOnglet
          aujourdhui={t.aujourdhui}
          maintenant={t.maintenant}
          shifts={t.d.shifts}
          absences={t.absences}
          telephones={t.telephones}
          avecAbsences={t.absencesLues}
          echec={t.nonLu('shifts')}
          peutOuvrir={t.peutOuvrir}
          ouvrir={t.ouvrir}
        />
      ) : null}
      aujourdhui={t.aujourdhui}
      shifts={t.d.shifts}
      couverts={t.d.couverts}
      groupes={t.avecGroupes ? t.d.groupes : []}
      absences={t.absences}
      telephones={t.telephones}
      avecCouverts={t.avecCouvertsLus}
      avecGroupes={t.avecGroupesLus}
      avecPlanning={t.avecPlanning}
      avecAbsences={t.absencesLues}
      nonLu={t.nonLu}
      peutOuvrir={t.peutOuvrir}
      ouvrir={t.ouvrir}
    />
  );
}

export function WidgetChiffre({ t, id }) {
  const bloc = t.blocsGestion.find((b) => `chiffre-${b.id}` === id);
  if (!bloc) return null;
  return (
    <Chiffre
      id={bloc.id}
      label={bloc.label}
      valeur={bloc.valeur}
      texte={bloc.texte}
      detail={bloc.detail}
      couleurDetail={bloc.couleurDetail}
      icone={getModuleIcon(bloc.page)}
      onClick={t.peutOuvrir(bloc.page) ? () => t.ouvrir(bloc.page) : null}
    />
  );
}

export function WidgetRegularite({ t }) {
  if (!t.regularite.avecContrats) return null;
  return <Regularite r={t.regularite} />;
}

// ── Widgets neufs (lot W) ──────────────────────────────────────────────────

// Relevés HACCP du jour : l'anneau de la part faite, le compte écrit à côté.
export function WidgetReleves({ t, taille }) {
  const r = relevesDuJour(t.d.haccp, t.aujourdhui, t.maintenant);
  return (
    <section className="tdb-panneau tdb-widget-carte" aria-labelledby="tdb-w-releves" style={w.carte}>
      <h2 id="tdb-w-releves" className="tdb-titre" style={w.titre}>Relevés HACCP</h2>
      <div style={w.ligneAnneau}>
        <Anneau part={r.attendus ? r.faits / r.attendus : 0} couleur="var(--success-strong)" taille={taille === 'petit' ? 44 : 56} />
        <span style={{ minWidth: 0 }}>
          <span style={w.grandChiffre}><span data-no-translate>{r.faits}</span>{' '}<span style={w.sur}>sur</span>{' '}<span data-no-translate>{r.attendus}</span></span>
          <span style={w.detail}>relevés faits aujourd&apos;hui</span>
        </span>
      </div>
      {taille !== 'petit' && (
        <p style={w.pied}>
          {r.prochain
            ? <><span>Prochain relevé à</span>{' '}<span data-no-translate>{heureParlee(r.prochain)}</span></>
            : <span>Plus de relevé prévu aujourd&apos;hui</span>}
        </p>
      )}
    </section>
  );
}

const SEMAINES = ['1-7', '8-14', '15-21', '22-28', '29-31'];

// Pertes du mois, semaine par semaine (direction : les pertes ne sont lues que
// pour elle). Les barres disent le nombre de pertes déclarées.
export function WidgetPertesSemaines({ t, taille }) {
  const p = pertesParSemaine(t.d.pertes, t.aujourdhui);
  return (
    <section className="tdb-panneau tdb-widget-carte" aria-labelledby="tdb-w-pertes" style={w.carte}>
      <div style={w.tete}>
        <h2 id="tdb-w-pertes" className="tdb-titre" style={w.titre}>Pertes du mois</h2>
        <LienModule onClick={t.peutOuvrir('pertes') ? () => t.ouvrir('pertes') : null}>Voir tout</LienModule>
      </div>
      {!p.total ? <Vide>Aucune perte ce mois-ci</Vide> : (
        <>
          <p style={w.ligneChiffre}>
            <span style={w.grandChiffre} data-no-translate>{p.total}</span>
            <span style={w.detail}>{p.total > 1 ? 'pertes déclarées' : 'perte déclarée'}</span>
            {p.aValider > 0 && <span style={{ ...w.detail, color: 'var(--warning-text)' }}><span data-no-translate>{p.aValider}</span>{' '}<span>à valider</span></span>}
          </p>
          <Barres
            valeurs={p.nombres}
            libelles={p.nombres.map((_, i) => <span key={i} data-no-translate>{SEMAINES[i]}</span>)}
            fort={p.nombres.length - 1}
            encre="var(--text2)"
            encreForte="var(--accent)"
            hauteur={taille === 'grand' ? 84 : 48}
          />
        </>
      )}
    </section>
  );
}

const LIGNES_LISTE = { moyen: 2, grand: 5, pleine: 8 };

// Groupes des quatorze prochains jours, du plus proche au plus lointain.
export function WidgetGroupes({ t, taille }) {
  const liste = t.d.groupes || [];
  const n = LIGNES_LISTE[taille] || 2;
  return (
    <Section id="tdb-w-groupes" titre="Groupes à venir" action={<LienModule onClick={t.peutOuvrir('groupes') ? () => t.ouvrir('groupes') : null}>Voir tout</LienModule>}>
      {!liste.length && <Vide>Aucun groupe dans les quatorze prochains jours.</Vide>}
      {liste.slice(0, n).map((g) => (
        <div key={g.id} className="tdb-filet" style={w.ligne}>
          <span style={{ minWidth: 0, flex: '1 1 auto' }}>
            <span style={w.ligneTitre} data-no-translate>{g.nom}</span>
            <span style={w.ligneDetail}>
              <span>{jourRelatif(g.dateEvenement, t.aujourdhui)}</span>
              {g.heure && <>{' '}<span data-no-translate>{heureParlee(g.heure)}</span></>}
              {g.nbPax ? <>{', '}<Parties parties={[{ n: g.nbPax }, { t: 'personnes' }]} /></> : null}
            </span>
          </span>
          <StatutGroupe statut={g.statut} />
        </div>
      ))}
      {liste.length > n && <p style={w.reste}><span data-no-translate>{liste.length - n}</span>{' '}<span>{liste.length - n > 1 ? 'autres groupes' : 'autre groupe'}</span></p>}
    </Section>
  );
}

// Absences du jour, puis celles qui commencent dans les sept jours.
export function WidgetAbsences({ t, taille }) {
  const jour = absencesDuJour(t.absences, t.aujourdhui);
  const liste = [...jour, ...absencesAVenir(t.absences, t.aujourdhui)];
  const n = LIGNES_LISTE[taille] || 2;
  return (
    <Section id="tdb-w-absences" titre="Absences" action={<LienModule onClick={t.peutOuvrir('planning') ? () => t.ouvrir('planning') : null}>Voir tout</LienModule>}>
      {!liste.length && <Vide>Aucune absence aujourd&apos;hui ni dans les sept prochains jours.</Vide>}
      {liste.slice(0, n).map((a) => {
        const m = metaMotif(a.motif);
        return (
          <div key={a.id || `${a.userId}-${a.dateDebut}`} className="tdb-filet" style={w.ligne}>
            <span style={{ minWidth: 0, flex: '1 1 auto' }}>
              <span style={w.ligneTitre} data-no-translate>{userDisplay(a.userId).name}</span>
              <span style={w.ligneDetail}>{periodeAbsence(a)}</span>
            </span>
            <span style={{ ...w.etat, color: m.texte }}>{m.label}</span>
          </div>
        );
      })}
      {liste.length > n && <p style={w.reste}><span data-no-translate>{liste.length - n}</span>{' '}<span>{liste.length - n > 1 ? 'autres absences' : 'autre absence'}</span></p>}
    </Section>
  );
}

export function WidgetMessages({ t }) {
  const n = t.nbMessages || 0;
  const Icone = getModuleIcon('messages');
  return (
    <section className="tdb-panneau tdb-widget-carte" aria-labelledby="tdb-w-messages" style={w.carte}>
      <span style={pictoCercleStyle(36)} aria-hidden="true"><Icone size={18} strokeWidth={1.8} /></span>
      <h2 id="tdb-w-messages" className="tdb-titre" style={{ ...w.titre, fontSize: 'var(--t2)' }}>Messagerie</h2>
      {n > 0 ? (
        <p style={w.ligneChiffre}>
          <span style={w.grandChiffre} data-no-translate>{n}</span>
          <span style={w.detail}>{n > 1 ? 'messages non lus' : 'message non lu'}</span>
        </p>
      ) : (
        <p style={{ ...w.detail, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CircleCheck size={16} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--success-strong)' }} />
          <span>Aucun message non lu</span>
        </p>
      )}
    </section>
  );
}

// Raccourcis : des pictos de modules en cercle avec leur nom, comme des icônes
// d'app. Le choix et l'ordre se règlent dans le mode « Personnaliser ».
export function WidgetRaccourcis({ t, taille }) {
  const tous = t.raccourcis;
  const liste = tous.slice(0, CAPACITE_RACCOURCIS[taille] ?? 4);
  return (
    <section className="tdb-panneau tdb-widget-carte" aria-labelledby="tdb-w-raccourcis" style={w.carte}>
      <h2 id="tdb-w-raccourcis" className="tdb-titre" style={w.titre}>Raccourcis</h2>
      {!liste.length && <Vide>Aucun raccourci choisi.</Vide>}
      <div className="tdb-raccourcis">
        {liste.map((m) => {
          const Icone = getModuleIcon(m.id);
          return (
            <button key={m.id} type="button" className="tdb-raccourci tdb-lien" onClick={() => t.ouvrir(m.id)}>
              <span className="tdb-raccourci-cercle" aria-hidden="true"><Icone size={20} strokeWidth={1.8} /></span>
              <span className="tdb-raccourci-nom">{m.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const w = {
  carte: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, boxSizing: 'border-box' },
  tete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 },
  titre: { margin: 0, fontFamily: 'var(--font)', fontWeight: 'var(--g3)', lineHeight: 1.2, color: 'var(--text)', minWidth: 0 },
  ligneAnneau: { display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 },
  grandChiffre: { display: 'block', fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t5)', lineHeight: 1.1, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  sur: { fontFamily: 'var(--font)', fontSize: 'var(--t2)', color: 'var(--text2)' },
  detail: { display: 'block', fontSize: 'var(--t2)', lineHeight: 1.4, color: 'var(--text2)', margin: 0 },
  pied: { margin: 'auto 0 0', fontSize: 'var(--t2)', lineHeight: 1.4, color: 'var(--text2)' },
  ligneChiffre: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px', margin: 0 },
  ligne: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, minHeight: 48, boxSizing: 'border-box', padding: '6px 0' },
  ligneTitre: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', lineHeight: 1.35, color: 'var(--text)', overflowWrap: 'anywhere' },
  ligneDetail: { display: 'block', fontSize: 'var(--t2)', lineHeight: 1.4, color: 'var(--text2)' },
  etat: { flexShrink: 0, whiteSpace: 'nowrap', fontSize: 'var(--t2)', fontWeight: 'var(--g3)' },
  reste: { margin: '6px 0 0', fontSize: 'var(--t2)', color: 'var(--text2)' },
};
