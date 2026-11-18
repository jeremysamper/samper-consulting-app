import React from 'react';
import { CircleCheck } from 'lucide-react';
import { Anneau, Barres, CarteRepere, ligneStyle, pictoCercleStyle } from '../../../components/ui/index.jsx';
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
import { chiffresDuMois, formatPoints, libelleAction, prochainCadeau } from '../../points/bareme.js';

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

// Hausses de prix fournisseur à voir, les mêmes que l'écran « Hausses de prix »
// de Factures & achats (factures-achats/haussesTableau.js), la plus récente
// d'abord : produit, fournisseur, nouveau et ancien prix, écart. Dès la taille
// grande, les fiches qui utilisent le produit et l'effet de la hausse sur leur
// coût matière (catalogue/effetsHausseFiches.js).
const LIGNES_HAUSSES = { moyen: 2, grand: 3, pleine: 6 };
const PRIX_PAR = { kg: 'le kg', L: 'le litre', pièce: 'la pièce' };
const FICHES_PAR_HAUSSE = { grand: 2, pleine: 3 };
const montant = (v) => v.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ecart = (v) => `${v > 0 ? '+' : ''}${v.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} %`;

function EffetFiche({ f }) {
  const cout = f.deltaPct != null ? <><span>coût matière</span>{' '}<span data-no-translate>{ecart(f.deltaPct)}</span></> : null;
  if (f.deltaParPortion != null) {
    return (
      <>
        {' : '}
        {Math.abs(f.deltaParPortion) < 0.005
          ? <><span>moins de</span>{' '}<span data-no-translate>{`CHF ${montant(0.01)}`}</span></>
          : <span data-no-translate>{`+CHF ${montant(f.deltaParPortion)}`}</span>}
        {' '}<span>par portion</span>
        {cout && <>{', '}{cout}</>}
      </>
    );
  }
  return <>{' : '}{cout || <span>effet non chiffré</span>}</>;
}

function FichesTouchees({ h, n }) {
  // L'effet se lit après les hausses : rien tant qu'il n'est pas arrivé.
  if (h.fiches === undefined) return null;
  if (h.fiches === null) return <span style={w.ligneDetail}>Produit non relié au catalogue : effet sur les fiches non chiffré.</span>;
  const fiches = h.fiches;
  if (!fiches.length) return <span style={w.ligneDetail}>Aucune fiche n&apos;utilise ce produit.</span>;
  if (!h.suitCatalogue) {
    return (
      <span style={w.ligneDetail}>
        <Parties parties={[{ n: fiches.length }, { t: fiches.length > 1 ? 'fiches utilisent ce produit.' : 'fiche utilise ce produit.' }]} />
        {' '}<span>Le catalogue retient un autre prix : effet sur les fiches non chiffré.</span>
      </span>
    );
  }
  return (
    <>
      {fiches.slice(0, n).map((f) => (
        <span key={f.id} style={w.ligneDetail}><span>{f.nom}</span><EffetFiche f={f} /></span>
      ))}
      {fiches.length > n && (
        <span style={w.ligneDetail}><Parties parties={[{ t: 'Et' }, { n: fiches.length - n }, { t: fiches.length - n > 1 ? 'autres fiches.' : 'autre fiche.' }]} /></span>
      )}
    </>
  );
}

export function WidgetHaussesPrix({ t, taille }) {
  const liste = t.haussesPrix?.hausses || [];
  const seuil = t.haussesPrix?.seuil;
  const n = LIGNES_HAUSSES[taille] || 2;
  const nbFiches = FICHES_PAR_HAUSSE[taille] || 0;
  const versHausses = t.peutOuvrir('achats') ? () => t.ouvrir('achats', 'hausses') : null;
  return (
    <Section
      id="tdb-w-hausses"
      titre="Hausses de prix"
      sousTitre={<><span>Prix d&apos;achat en hausse de</span>{' '}<span data-no-translate>{`${(seuil || 0).toLocaleString('fr-CH', { maximumFractionDigits: 1 })} %`}</span>{' '}<span>ou plus, factures et bons à voir</span></>}
      action={<LienModule onClick={versHausses}>Voir les hausses</LienModule>}
    >
      {!liste.length && <Vide>Aucune hausse de prix à voir.</Vide>}
      {liste.slice(0, n).map((h) => {
        const parUnite = PRIX_PAR[h.unite] || '';
        return (
          <div key={h.cle} className="tdb-filet" style={{ ...w.ligne, alignItems: 'flex-start' }} data-hausse-prix="">
            <span style={{ minWidth: 0, flex: '1 1 auto' }}>
              <span style={w.ligneTitre}>{h.nom}</span>
              <span style={w.ligneDetail}>
                {h.fournisseur ? <span data-no-translate>{h.fournisseur}</span> : <span>Fournisseur non précisé</span>}
                {', '}<span data-no-translate>CHF {montant(h.prix)}</span>{' '}<span>{parUnite}</span>
                {', '}<span>avant</span>{' '}<span data-no-translate>CHF {montant(h.prixAvant)}</span>
              </span>
              {nbFiches > 0 && <FichesTouchees h={h} n={nbFiches} />}
            </span>
            <span style={{ ...w.etat, color: 'var(--danger-text)' }} data-no-translate>{ecart(h.ecartPct)}</span>
          </div>
        );
      })}
      {liste.length > n && <p style={w.reste}><span data-no-translate>{liste.length - n}</span>{' '}<span>{liste.length - n > 1 ? 'autres hausses' : 'autre hausse'}</span></p>}
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

// Mes points (Points & boutique) : le solde de la personne et le prochain
// cadeau à portée ; en grand, les points gagnés ce mois et les derniers gestes
// comptés. Aucun classement entre employés. Le nombre vit dans son nœud, le
// mot à côté (traduction du DOM).
const LIGNES_POINTS = 3;

function Points({ n, signe = false }) {
  const v = Number(n) || 0;
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span data-no-translate style={{ fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' }}>{(signe && v > 0 ? '+' : '') + formatPoints(v)}</span>
      {' '}<span>{Math.abs(v) > 1 ? 'points' : 'point'}</span>
    </span>
  );
}

export function WidgetMesPoints({ t, taille }) {
  const p = t.points;
  const proposes = p.cadeaux.filter((c) => c.actif);
  const prochain = prochainCadeau(proposes, p.solde);
  const ouvrir = t.peutOuvrir('points') ? () => t.ouvrir('points') : null;
  if (taille === 'petit') {
    return (
      <CarteRepere
        data-repere="points"
        className={ouvrir ? 'tdb-lien tdb-repere tdb-repere-carte' : 'tdb-repere-carte'}
        Icone={getModuleIcon('points')}
        valeur={formatPoints(p.solde)}
        libelle="Mes points"
        detail={prochain ? <><span>Encore</span>{' '}<Points n={prochain.manque} /></> : null}
        onClick={ouvrir}
      />
    );
  }
  const mois = taille === 'grand' ? chiffresDuMois(p.mouvements) : null;
  const derniers = taille === 'grand' ? p.mouvements.slice(0, LIGNES_POINTS) : [];
  return (
    <section className="tdb-panneau tdb-widget-carte" aria-labelledby="tdb-w-points" style={w.carte}>
      <h2 id="tdb-w-points" className="tdb-titre" style={w.titre}>Mes points</h2>
      <div style={w.ligneAnneau}>
        {prochain && <Anneau part={prochain.part} couleur="var(--success-strong)" taille={56} />}
        <span style={{ minWidth: 0 }}>
          <span style={w.grandChiffre} data-no-translate>{formatPoints(p.solde)}</span>
          <span style={w.detail}>{p.solde > 1 || p.solde < -1 ? 'points à votre solde' : 'point à votre solde'}</span>
        </span>
      </div>
      <p style={w.detail}>
        {prochain ? (
          <>
            <span>Encore</span>{' '}<Points n={prochain.manque} />{' '}<span>pour</span>{' '}
            <span data-no-translate style={{ overflowWrap: 'anywhere' }}>{prochain.cadeau.nom}</span>
          </>
        ) : (
          <span>{proposes.length ? 'Tous les cadeaux de la boutique sont à votre portée.' : "La boutique n'a pas encore de cadeau."}</span>
        )}
      </p>
      {mois && (
        <div style={{ minWidth: 0 }}>
          <p style={{ ...w.detail, marginBottom: 4 }}><span>Ce mois :</span>{' '}<Points n={mois.gagnes} signe /></p>
          {derniers.length === 0 ? (
            <p style={w.detail}>Aucun geste compté pour l&apos;instant.</p>
          ) : derniers.map((m, i) => (
            <div key={m.id} style={{ ...ligneStyle({ serree: true, derniere: i === derniers.length - 1 }), padding: '4px 0' }}>
              <span style={{ ...w.ligneDetail, flex: 1, minWidth: 0, color: 'var(--text)', overflowWrap: 'anywhere' }}>{m.libelle || libelleAction(m.action)}</span>
              <span style={{ ...w.etat, fontWeight: 'var(--g2)', color: m.points < 0 ? 'var(--text2)' : 'var(--text)' }}><Points n={m.points} signe /></span>
            </div>
          ))}
        </div>
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
