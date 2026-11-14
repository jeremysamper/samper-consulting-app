import React from 'react';
import { BarChart3, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Clock, Download, Sun, SunMoon } from 'lucide-react';
import AccueilModule from '../../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../../components/parcours/EcranTache.jsx';
import SegmentedTabs from '../../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../../components/ui/SearchToggle.jsx';
import { Btn } from '../../../components/ui/index.jsx';
import { Choix, Fenetre } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import { useBackLayer } from '../../../hooks/useBackLayer.js';
import { makeSearchMatcher } from '../../../utils/searchText.js';
import { zurichAjouterJours, zurichNowMinutes, zurichToday } from '../../../utils/zurichTime.js';
import { computeReservationStats } from '../../previsions/rapport/computeReservationStats.js';
import { useRapportReservations } from '../../previsions/rapport/useRapportReservations.js';
import { chf } from '../documentsCaisse.js';
import { jourExploitation } from '../tva.js';
import { LIBELLES_MOYENS, LIBELLES_SERVICES, trierPlats } from './calculRapports.js';
import { dateCH, dateHeureCH, libelleGenre } from './exportsRapport.js';
import {
  construirePdf, lireRapport, telechargerCsv, telechargerCsvZip, telechargerDossier, telechargerExcel,
} from './lectureRapport.js';
import {
  ISO_JOUR, TYPES_PERIODE_CAISSE, libellePeriodeCaisse, periodeDe, periodeJour, periodeLibre, periodeMois, periodeAnnee,
  periodeSemaine, periodeService, periodeVoisine,
} from './periodesCaisse.js';

// ─────────────────────────────────────────────────────────────────────────────
// Rapports de la caisse (v8). Un accueil à tuiles (Aujourd'hui, Ce service,
// Cette semaine, Ce mois, Cette année, Période), puis le rapport de la période
// choisie : flèches de période, onglets des rapports, export.
//
// Les chiffres viennent tous de rapportCaisse (calculRapports.js) : ce
// fichier ne fait qu'afficher. La base décide de ce que le rôle lit : tout
// pour consultant et patron ; les plats vendus et les services pour le
// responsable de cuisine (ni moyens de paiement ni écarts de caisse). Les
// onglets suivent le niveau rendu par la base, pas le rôle supposé.
//
// Un jour non clôturé est dit provisoire en tête du rapport et sur chaque
// ligne qui le porte. Les noms de plats, de personnes et les motifs sont des
// données : ils ne partent jamais au traducteur.
// ─────────────────────────────────────────────────────────────────────────────

// Montants écrits comme sur la quittance et la clôture (1'234.50) : les mêmes
// chiffres, au caractère près, à l'écran, dans le PDF et dans les fichiers.
const qte = (q) => String(+Number(q || 0).toFixed(3)).replace('.', ',');
const pct = (p) => (p == null ? null : (Math.round(p * 1000) / 10).toLocaleString('fr-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const minutesDe = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
// Accord en nombre : 0 et 1 au singulier.
const pl = (n, un, plusieurs) => (Math.abs(Number(n) || 0) > 1 ? plusieurs : un);
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const ONGLETS = [
  { id: 'synthese', label: 'Synthèse', direction: true },
  { id: 'moyens', label: 'Paiements', direction: true },
  { id: 'plats', label: 'Plats vendus' },
  { id: 'services', label: 'Services' },
  { id: 'heures', label: 'Heures', direction: true },
  { id: 'personnes', label: 'Personnes', direction: true },
  { id: 'journal', label: 'Écarts', direction: true },
  { id: 'clients', label: 'Clients', direction: true },
];
const TRIS = [
  { id: 'qte', label: 'Par quantité' },
  { id: 'ttc', label: 'Par montant' },
  { id: 'nom', label: 'Par nom' },
];

// Un montant : le nombre dans son propre nœud, l'unité à côté.
function Chf({ v, fort = false }) {
  return <span style={fort ? st.numFort : st.num}><span>{chf(v)}</span> <span style={st.unite}>CHF</span></span>;
}
function Carte({ titre, children, detail }) {
  return (
    <div style={st.carte} data-cadre="">
      <div style={st.carteTitre}>{titre}</div>
      <div style={st.carteValeur}>{children}</div>
      {detail && <div style={st.carteDetail}>{detail}</div>}
    </div>
  );
}
function Rang({ titre, detail, children, brut = false }) {
  return (
    <div style={st.rang}>
      <span style={st.rangTitre}>
        <span data-no-translate={brut ? true : undefined}>{titre}</span>
        {detail && <span style={st.petit}>{detail}</span>}
      </span>
      <span style={st.rangValeur}>{children}</span>
    </div>
  );
}
const Section = ({ titre, children }) => (
  <section className="caisse-liste" data-cadre="" style={st.section}>
    <div style={st.sectionTitre}>{titre}</div>
    {children}
  </section>
);
const Provisoire = () => <span style={st.provisoire}>provisoire</span>;

// ── 1. Synthèse ──
function Synthese({ r, comparaison, noShow }) {
  const s = r.synthese;
  const ecart = comparaison?.ttc;
  return (
    <>
      <div style={st.cartes}>
        <Carte
          titre="Chiffre d'affaires TVA comprise"
          detail={ecart && ecart.pct != null ? (
            <span data-caisse-comparaison="">
              <span style={st.num}>{ecart.ecart >= 0 ? '+' : ''}{pct(ecart.pct)}</span> <span>% par rapport à</span>{' '}
              <span data-no-translate>{libellePeriodeCaisse(comparaison.precedente)}</span>
            </span>
          ) : null}
        >
          <Chf v={s.ttc} fort />
        </Carte>
        <Carte titre="Hors TVA"><Chf v={s.ht} fort /></Carte>
        <Carte titre="TVA"><Chf v={s.tva} fort /></Carte>
        <Carte titre="Tickets" detail={s.annulations ? <><span style={st.num}>{s.annulations}</span> <span>{pl(s.annulations, 'annulé', 'annulés')}</span></> : null}>
          <span style={st.numFort}>{s.tickets}</span>
        </Carte>
        <Carte titre="Couverts"><span style={st.numFort}>{s.couverts}</span></Carte>
        <Carte titre="Ticket moyen">{s.ticketMoyen == null ? <span style={st.numFort}>n/a</span> : <Chf v={s.ticketMoyen} fort />}</Carte>
        <Carte titre="Par couvert">{s.parCouvert == null ? <span style={st.numFort}>n/a</span> : <Chf v={s.parCouvert} fort />}</Carte>
      </div>

      <Section titre="TVA par taux">
        {s.parTaux.map((t) => (
          <Rang
            key={t.taux}
            titre={<><span style={st.num}>{String(t.taux).replace('.', ',')}</span> <span>%</span></>}
            detail={<><span>hors TVA</span> <span style={st.num}>{chf(t.ht)}</span>{', '}<span>TVA</span> <span style={st.num}>{chf(t.tva)}</span></>}
          >
            <Chf v={t.ttc} />
          </Rang>
        ))}
        {!s.parTaux.length && <p style={st.vide}>Aucune vente sur cette période.</p>}
      </Section>

      <Section titre="Répartition">
        {[['Midi', s.midi], ['Soir', s.soir], ['Sur place', s.surPlace], ['À emporter', s.emporter]].map(([nom, x]) => (
          <Rang key={nom} titre={nom} detail={x.part == null ? null : <><span style={st.num}>{pct(x.part)}</span> <span>% du chiffre</span></>}>
            <Chf v={x.ttc} />
          </Rang>
        ))}
        <Rang titre="Ventes encaissées"><Chf v={s.ventesTtc} /></Rang>
        <Rang titre="Annulations" detail={<><span style={st.num}>{s.annulations}</span> <span>{pl(s.annulations, 'ticket', 'tickets')}</span></>}><Chf v={s.annulationsTtc ? -s.annulationsTtc : 0} /></Rang>
        {noShow && (
          <Rang titre="No-show" detail="selon le rapport des réservations">
            <span style={st.num}>{noShow.tables}</span> <span>{pl(noShow.tables, 'table,', 'tables,')}</span> <span style={st.num}>{noShow.couverts}</span> <span>{pl(noShow.couverts, 'couvert', 'couverts')}</span>
          </Rang>
        )}
      </Section>

      {r.jours.length > 1 && (
        <Section titre="Par jour">
          {r.jours.map((j) => (
            <Rang
              key={j.jour}
              titre={<span style={st.num}>{dateCH(j.jour)}</span>}
              detail={j.provisoire ? <Provisoire /> : <><span>clôture n°</span> <span style={st.num}>{j.cloture.numero}</span></>}
            >
              <Chf v={j.ttc} />
            </Rang>
          ))}
        </Section>
      )}
    </>
  );
}

// ── 2. Moyens de paiement ──
function Moyens({ r }) {
  const m = r.moyens;
  return (
    <>
      <Section titre="Par moyen de paiement">
        {m.lignes.map((l) => (
          <Rang
            key={`${l.moyen}|${l.libelle}|${l.mode || ''}`}
            titre={l.mode ? (
              <>
                {l.libelle ? <span data-no-translate>{l.libelle}</span> : <span>{LIBELLES_MOYENS[l.moyen] || l.moyen}</span>}
                {', '}
                <span>{l.mode === 'relie' ? 'terminal relié' : 'saisie à la main'}</span>
              </>
            ) : (l.libelle ? <span data-no-translate>{l.libelle}</span> : l.nom)}
            detail={(
              <>
                <span style={st.num}>{l.nombre}</span> <span>{pl(l.nombre, 'paiement', 'paiements')}</span>
                {l.annulations ? <>{', '}<span>dont annulé</span> <span style={st.num}>{chf(l.annulations)}</span></> : null}
                {l.pourboires ? <>{', '}<span>pourboires</span> <span style={st.num}>{chf(l.pourboires)}</span></> : null}
              </>
            )}
          >
            <Chf v={l.net} />
          </Rang>
        ))}
        {!m.lignes.length && <p style={st.vide}>Aucun paiement sur cette période.</p>}
        <Rang titre="Net encaissé"><Chf v={m.net} fort /></Rang>
        <Rang titre="Pourboires" detail="saisis à part, hors chiffre d'affaires"><Chf v={m.pourboires} /></Rang>
        <Rang titre="Écarts d'arrondi" detail="arrondi aux 5 centimes des espèces"><Chf v={m.arrondis} /></Rang>
      </Section>
      {r.ecartsCaisse && (
        <Section titre="Écarts de caisse des clôtures">
          {r.ecartsCaisse.lignes.map((e) => (
            <Rang
              key={e.jour}
              titre={<span style={st.num}>{dateCH(e.jour)}</span>}
              detail={(
                <>
                  <span>clôture n°</span> <span style={st.num}>{e.numeroRetenu}</span>
                  {e.motif ? <>{', '}<span data-no-translate>{e.motif}</span></> : null}
                </>
              )}
            >
              <Chf v={e.ecart} />
            </Rang>
          ))}
          {!r.ecartsCaisse.lignes.length && <p style={st.vide}>Aucune clôture sur cette période.</p>}
          {r.ecartsCaisse.lignes.length > 0 && <Rang titre="Total des écarts"><Chf v={r.ecartsCaisse.total} fort /></Rang>}
        </Section>
      )}
    </>
  );
}

// ── 3. Plats vendus ──
function CelluleService({ nom, x }) {
  return (
    <span style={st.cellule}>
      <span style={st.petit}>{nom}</span>
      <span style={st.numFortPetit}>{qte(x.qte)}</span>
      <span style={st.petitNum}>{chf(x.ttc)}</span>
    </span>
  );
}
function LignePlat({ l }) {
  return (
    <div style={st.plat} data-caisse-plat="">
      <span style={st.platNom}>
        <span data-no-translate>{l.libelle}</span>
        <span style={st.petit} data-no-translate>{l.categorie}</span>
        {(l.offertsQte || l.remises) ? (
          <span style={st.petit}>
            {l.offertsQte ? <><span>offerts</span> <span style={st.num}>{qte(l.offertsQte)}</span></> : null}
            {l.offertsQte && l.remises ? ', ' : null}
            {l.remises ? <><span>remises</span> <span style={st.num}>{chf(l.remises)}</span></> : null}
          </span>
        ) : null}
      </span>
      <span style={st.platCellules}>
        <CelluleService nom="Total" x={l} />
        <CelluleService nom="Midi" x={l.midi} />
        <CelluleService nom="Soir" x={l.soir} />
      </span>
    </div>
  );
}
function Plats({ r, tri, setTri, recherche, setRecherche }) {
  const p = r.plats;
  const match = React.useMemo(() => makeSearchMatcher(recherche), [recherche]);
  const lignes = React.useMemo(() => trierPlats(p.lignes, tri).filter((l) => match(l.libelle, l.categorie)), [p.lignes, tri, match]);
  return (
    <>
      <div style={st.cartes}>
        <Carte titre="Produits vendus" detail={<><span style={st.num}>{p.lignes.length}</span> <span>{pl(p.lignes.length, 'produit', 'produits')}</span></>}>
          <span style={st.numFort}>{qte(p.qte)}</span>
        </Carte>
        <Carte titre="Midi" detail={<Chf v={p.midi.ttc} />}><span style={st.numFort}>{qte(p.midi.qte)}</span></Carte>
        <Carte titre="Soir" detail={<Chf v={p.soir.ttc} />}><span style={st.numFort}>{qte(p.soir.qte)}</span></Carte>
        <Carte titre="Chiffre des plats"><Chf v={p.ttc} fort /></Carte>
      </div>

      {!recherche && p.meilleurs.length > 0 && (
        <div style={st.deux}>
          <Section titre="Les cinq meilleurs">
            {p.meilleurs.map((l) => <Rang key={l.cle} titre={l.libelle} brut><span style={st.num}>{qte(l.qte)}</span></Rang>)}
          </Section>
          {p.moinsVendus.length > 0 && (
            <Section titre="Les cinq moins vendus">
              {p.moinsVendus.map((l) => <Rang key={l.cle} titre={l.libelle} brut><span style={st.num}>{qte(l.qte)}</span></Rang>)}
            </Section>
          )}
        </div>
      )}

      <Section titre="Par catégorie de caisse">
        {p.categories.map((c) => (
          <Rang key={c.nom} titre={c.nom} brut detail={<><span style={st.num}>{qte(c.qte)}</span> <span>{pl(c.qte, 'vendu', 'vendus')}</span></>}><Chf v={c.ttc} /></Rang>
        ))}
        {!p.categories.length && <p style={st.vide}>Aucun plat vendu sur cette période.</p>}
      </Section>

      <Section titre="Tous les produits">
        <div style={st.outils}>
          <SegmentedTabs tabs={TRIS} active={tri} onChange={setTri} size="sm" />
          <SearchToggle value={recherche} onChange={setRecherche} placeholder="Chercher un produit" />
        </div>
        {lignes.map((l) => <LignePlat key={l.cle} l={l} />)}
        {!lignes.length && <p style={st.vide}>{recherche ? 'Aucun produit ne correspond.' : 'Aucun plat vendu sur cette période.'}</p>}
      </Section>
    </>
  );
}

// ── 4. Services ──
function Services({ r }) {
  return (
    <Section titre="Chaque service de la période">
      {r.services.map((s) => (
        <Rang
          key={`${s.jour}|${s.service}`}
          titre={<><span style={st.num}>{dateCH(s.jour)}</span> <span>{LIBELLES_SERVICES[s.service]}</span></>}
          detail={(
            <>
              <span style={st.num}>{s.tickets}</span> <span>{pl(s.tickets, 'ticket,', 'tickets,')}</span> <span style={st.num}>{s.couverts}</span> <span>{pl(s.couverts, 'couvert', 'couverts')}</span>
              {s.annulations ? <>{', '}<span style={st.num}>{s.annulations}</span> <span>{pl(s.annulations, 'annulé', 'annulés')}</span></> : null}
              {s.dureeMoyenneMin != null ? <>{', '}<span>table</span> <span style={st.num}>{s.dureeMoyenneMin}</span> <span>min en moyenne</span></> : null}
              {r.provisoires.includes(s.jour) ? <>{' '}<Provisoire /></> : null}
            </>
          )}
        >
          <Chf v={s.ttc} />
        </Rang>
      ))}
      {!r.services.length && <p style={st.vide}>Aucun service sur cette période.</p>}
    </Section>
  );
}

// ── 5. Heures d'ouverture des tickets ──
function Heures({ r }) {
  const max = Math.max(1, ...r.heures.map((h) => h.tickets));
  return (
    <Section titre="Tickets ouverts par heure">
      {r.heures.map((h) => (
        <div key={h.heure} style={st.heure}>
          <span style={st.heureNom}><span style={st.num}>{String(h.heure).padStart(2, '0')}</span> <span>h</span></span>
          <span style={st.heurePiste}><span style={{ ...st.heureBarre, width: `${Math.round((h.tickets / max) * 100)}%` }} /></span>
          <span style={st.heureValeur}>
            <span><span style={st.num}>{h.tickets}</span> <span>{pl(h.tickets, 'ticket', 'tickets')}</span></span>
            <span style={st.petit}><span style={st.num}>{h.couverts}</span> <span>{pl(h.couverts, 'couvert,', 'couverts,')}</span> <span style={st.num}>{chf(h.ttc)}</span></span>
          </span>
        </div>
      ))}
      {!r.heures.length && <p style={st.vide}>Aucun ticket sur cette période.</p>}
    </Section>
  );
}

// ── 6. Personnes ──
function Personnes({ r }) {
  return (
    <Section titre="Par personne">
      {r.personnes.map((p) => (
        <Rang
          key={p.id || 'x'}
          titre={p.id ? <span data-no-translate>{p.nom}</span> : p.nom}
          detail={(
            <>
              <span style={st.num}>{p.ouverts}</span> <span>{pl(p.ouverts, 'ouvert,', 'ouverts,')}</span> <span style={st.num}>{p.encaisses}</span> <span>{pl(p.encaisses, 'encaissé', 'encaissés')}</span>
              {p.annulations ? <>{', '}<span style={st.num}>{p.annulations}</span> <span>{pl(p.annulations, 'annulation', 'annulations')}</span> <span style={st.num}>{chf(p.annulationsTtc)}</span></> : null}
              {p.remisesLignes ? <>{', '}<span style={st.num}>{p.remisesLignes}</span> <span>{pl(p.remisesLignes, 'remise', 'remises')}</span> <span style={st.num}>{chf(p.remises)}</span></> : null}
              {p.offertsLignes ? <>{', '}<span style={st.num}>{p.offertsLignes}</span> <span>{pl(p.offertsLignes, 'offert', 'offerts')}</span> <span style={st.num}>{chf(p.offertsValeur)}</span></> : null}
            </>
          )}
        >
          <Chf v={p.ttc} />
        </Rang>
      ))}
      {!r.personnes.length && <p style={st.vide}>Aucun ticket sur cette période.</p>}
    </Section>
  );
}

// ── 7. Journal des écarts ──
function Journal({ r }) {
  const j = r.journal;
  return (
    <>
      <div style={st.cartes}>
        <Carte titre="Annulations" detail={<Chf v={j.annulations.montant} />}><span style={st.numFort}>{j.annulations.nombre}</span></Carte>
        <Carte titre="Remises" detail={<Chf v={j.remises.montant} />}><span style={st.numFort}>{j.remises.nombre}</span></Carte>
        <Carte titre="Offerts" detail={<Chf v={j.offerts.montant} />}><span style={st.numFort}>{j.offerts.nombre}</span></Carte>
        <Carte titre="Tickets abandonnés" detail={<Chf v={j.abandons.montant} />}><span style={st.numFort}>{j.abandons.nombre}</span></Carte>
      </div>
      <Section titre="Mode test">
        <Rang
          titre="Usage du mode test"
          detail={(
            <>
              <span style={st.num}>{j.tests.entrees}</span> <span>{pl(j.tests.entrees, 'entrée,', 'entrées,')}</span> <span style={st.num}>{j.tests.sorties}</span> <span>{pl(j.tests.sorties, 'sortie,', 'sorties,')}</span>{' '}
              <span style={st.num}>{j.tests.purges}</span> <span>{pl(j.tests.purges, 'purge', 'purges')}</span>
            </>
          )}
        >
          <span style={st.num}>{j.tests.tickets}</span> <span>{pl(j.tests.tickets, 'ticket de test,', 'tickets de test,')}</span> <Chf v={j.tests.montant} />
        </Rang>
        <p style={st.vide}>Les tickets de test ne comptent dans aucun chiffre.</p>
      </Section>
      <Section titre="Le journal">
        {j.entrees.map((e, i) => (
          <Rang
            key={i}
            titre={<><span>{libelleGenre(e.genre)}</span>{e.piece ? <>{' '}<span style={st.num} data-no-translate>{e.piece}</span></> : null}</>}
            detail={(
              <>
                <span style={st.num}>{dateHeureCH(e.quand)}</span>
                {e.auteur ? <>{', '}<span data-no-translate>{e.auteur}</span></> : null}
                {e.detail ? <>{', '}<span data-no-translate>{e.detail}</span></> : null}
                {e.motif ? <>{', '}<span data-no-translate>{e.motif}</span></> : null}
              </>
            )}
          >
            {e.montant != null ? <Chf v={e.montant} /> : null}
          </Rang>
        ))}
        {!j.entrees.length && <p style={st.vide}>Aucun écart sur cette période.</p>}
      </Section>
    </>
  );
}

// ── 8. Clients et réservations ──
function Clients({ r, noShow }) {
  const c = r.clients;
  const ligne = (titre, x, detail) => (
    <Rang
      titre={titre}
      detail={<><span style={st.num}>{x.tickets}</span> <span>{pl(x.tickets, 'ticket,', 'tickets,')}</span> <span style={st.num}>{x.couverts}</span> <span>{pl(x.couverts, 'couvert', 'couverts')}</span>{detail ? <>{', '}<span>{detail}</span></> : null}</>}
    >
      <Chf v={x.ttc} />
    </Rang>
  );
  return (
    <Section titre="D'où viennent les tickets">
      {ligne('Sur réservation', c.reservation)}
      {ligne('De passage, à table', c.passage)}
      {ligne('Vente directe', c.direct)}
      {ligne('Comptes clients', c.comptes, 'déjà comptés ci-dessus')}
      {noShow ? (
        <Rang titre="No-show" detail="selon le rapport des réservations">
          <span style={st.num}>{noShow.tables}</span> <span>{pl(noShow.tables, 'table,', 'tables,')}</span> <span style={st.num}>{noShow.couverts}</span> <span>{pl(noShow.couverts, 'couvert', 'couverts')}</span>
        </Rang>
      ) : <p style={st.vide}>Les no-show se lisent dans le rapport des réservations.</p>}
    </Section>
  );
}

// ── Fenêtre d'export ──
function FenetreExport({ rapport, onglet, tri, noShow, comparaison, etablissement, reglages, onClose }) {
  const [enCours, setEnCours] = React.useState(false);
  const direction = rapport.niveau === 'direction';
  const options = { tri, noShow };
  const faire = async (action, message) => {
    if (enCours) return;
    setEnCours(true);
    try {
      const erreur = await action();
      if (erreur) notify(erreur, 'error');
      else { notify(message, 'success'); onClose(); }
    } catch (e) {
      console.error('[caisse] export du rapport', e);
      notify("Le fichier n'a pas pu être produit. Réessayez.", 'error');
    } finally {
      setEnCours(false);
    }
  };
  const pdf = () => faire(async () => {
    const doc = await construirePdf({ rapport, etablissement, reglages, comparaison, noShow });
    doc.save(`rapport-caisse_${rapport.periode.debut}_${rapport.periode.fin}.pdf`);
    return null;
  }, 'Synthèse PDF téléchargée.');
  const dossier = () => faire(async () => {
    const { error } = await telechargerDossier({ etablissement, reglages, debut: rapport.periode.debut, fin: rapport.periode.fin });
    return error;
  }, 'Dossier fiduciaire téléchargé.');
  return (
    <Fenetre id="caisse-rapport-export" titre="Exporter le rapport" sousTitre={<span data-no-translate>{majuscule(libellePeriodeCaisse(rapport.periode))}</span>} onClose={onClose} largeur={480}>
      {rapport.provisoire && <p style={st.alerte}>Rapport provisoire : un jour non clôturé peut encore changer.</p>}
      <Choix titre="Excel" detail="Tous les rapports de la période, une feuille par rapport." disabled={enCours} onClick={() => faire(async () => { telechargerExcel(rapport, options); return null; }, 'Classeur Excel téléchargé.')} />
      <Choix titre="CSV, tous les rapports" detail="Un fichier par rapport, dans un zip." disabled={enCours} onClick={() => faire(async () => { telechargerCsvZip(rapport, options); return null; }, 'Fichiers CSV téléchargés.')} />
      <Choix titre="CSV, ce rapport seulement" detail="Le rapport affiché, en un fichier." disabled={enCours} onClick={() => faire(async () => (telechargerCsv(rapport, onglet, options) ? null : 'Ce rapport ne se télécharge pas seul.'), 'Fichier CSV téléchargé.')} />
      <Choix titre="PDF de synthèse" detail="La synthèse de la période, à imprimer ou à envoyer." disabled={enCours} onClick={pdf} />
      {direction && rapport.periode.type !== 'service' && (
        <Choix titre="Dossier fiduciaire" detail="Journal des ventes, encaissements, clôtures, tickets, annulations et contrôle d'intégrité, jours clôturés seulement." disabled={enCours} onClick={dossier} />
      )}
    </Fenetre>
  );
}

// ── Le rapport d'une période ──
function EcranRapport({ etablissement, reglages, periode, setPeriode, jourCourant, onRetour }) {
  const etabId = etablissement?.id;
  const [etat, setEtat] = React.useState({ status: 'loading', data: null, erreur: null });
  const [onglet, setOnglet] = React.useState(null);
  const [tri, setTri] = React.useState('qte');
  const [recherche, setRecherche] = React.useState('');
  const [exportOuvert, setExportOuvert] = React.useState(false);
  const tour = React.useRef(0);
  const cle = `${etabId}|${periode.type}|${periode.debut}|${periode.fin}|${periode.service || ''}`;

  const charger = React.useCallback(async () => {
    if (!etabId) return;
    const moi = ++tour.current;
    setEtat((e) => ({ ...e, status: e.data ? 'reloading' : 'loading', erreur: null }));
    const { data, error } = await lireRapport(etabId, periode);
    if (moi !== tour.current) return;
    if (error) { setEtat({ status: 'error', data: null, erreur: error }); return; }
    setEtat({ status: 'ready', data, erreur: null });
    // cle : la période, sous une forme stable.
  }, [etabId, cle]);
  React.useEffect(() => { setEtat({ status: 'loading', data: null, erreur: null }); charger(); }, [charger]);

  const rapport = etat.data?.rapport || null;
  const direction = rapport?.niveau === 'direction';
  const onglets = ONGLETS.filter((o) => !o.direction || direction);
  const actif = onglets.some((o) => o.id === onglet) ? onglet : onglets[0]?.id;

  // No-show : lecture du rapport des réservations, sans le recalculer.
  const resas = useRapportReservations(direction ? etabId : null, periode.debut, periode.fin);
  const noShow = React.useMemo(() => {
    const d = resas.donnees;
    if (!direction || resas.status !== 'ready' || !d || d.debut > periode.debut || d.fin < periode.fin) return null;
    try {
      const aujourdhui = zurichToday();
      const bornes = { debut: periode.debut, fin: periode.fin };
      const stats = computeReservationStats({
        lignes: d.lignes, periode: bornes, comparaison: bornes, aujourdhui, reference: aujourdhui,
        service: periode.type === 'service' ? periode.service : 'tous', parametres: d.parametres, tables: d.tables,
      });
      return { tables: stats.chiffres.noShowTables, couverts: stats.chiffres.noShowCouverts };
    } catch (e) {
      console.error('[caisse] no-show du rapport', e);
      return null;
    }
  }, [direction, resas.donnees, resas.status, periode.debut, periode.fin, periode.type, periode.service]);

  const suivante = periodeVoisine(periode, 1);
  const peutSuivant = suivante && suivante.debut <= jourCourant;
  const changerType = (type) => {
    const jour = periode.debut <= jourCourant && periode.fin >= jourCourant ? jourCourant : periode.debut;
    setPeriode(type === 'libre' ? periodeLibre(periode.debut, periode.fin > jourCourant ? jourCourant : periode.fin) : periodeDe(type, jour, { service: periode.service || 'midi' }));
  };
  const changerDate = (champ, valeur) => {
    if (!ISO_JOUR.test(valeur)) return;
    const p = periodeLibre(champ === 'debut' ? valeur : periode.debut, champ === 'fin' ? valeur : periode.fin);
    if (p) setPeriode(p);
  };

  return (
    <EcranTache
      titre="Rapports"
      etat={<span data-no-translate data-caisse-periode="">{majuscule(libellePeriodeCaisse(periode))}</span>}
      onRetour={onRetour}
      actions={rapport ? (
        <Btn variant="primary" onClick={() => setExportOuvert(true)} style={st.btn44}>
          <Download size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Exporter</span>
        </Btn>
      ) : null}
    >
      <div style={st.racine} data-caisse-rapport={etat.status} data-caisse-niveau={rapport?.niveau || ''}>
        <div style={st.barre} className="no-print">
          <SegmentedTabs tabs={TYPES_PERIODE_CAISSE} active={periode.type} onChange={changerType} />
          <div style={st.nav}>
            <button type="button" style={st.fleche} onClick={() => setPeriode(periodeVoisine(periode, -1))} aria-label="Période précédente">
              <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            {periode.type === 'libre' ? (
              <span style={st.dates}>
                <input type="date" aria-label="Premier jour" value={periode.debut} max={jourCourant} onChange={(e) => changerDate('debut', e.target.value)} style={st.date} />
                <input type="date" aria-label="Dernier jour" value={periode.fin} max={jourCourant} onChange={(e) => changerDate('fin', e.target.value)} style={st.date} />
              </span>
            ) : (
              <span style={st.libelle} data-no-translate>{majuscule(libellePeriodeCaisse(periode))}</span>
            )}
            <button type="button" style={{ ...st.fleche, ...(peutSuivant ? null : st.inactif) }} disabled={!peutSuivant} onClick={() => setPeriode(suivante)} aria-label="Période suivante">
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        {etat.status === 'error' && (
          <div style={st.erreur}>
            <p style={{ margin: 0 }}>{etat.erreur}</p>
            <Btn variant="primary" onClick={charger} style={st.btn44}>Réessayer</Btn>
          </div>
        )}
        {etat.status === 'loading' && <p style={st.vide}>Chargement…</p>}

        {rapport && (
          <>
            {rapport.provisoire && (
              <div style={st.bandeau} data-cadre="" data-caisse-provisoire="">
                <span style={st.bandeauTitre}>Rapport provisoire</span>
                <span>
                  <span style={st.num}>{rapport.provisoires.length}</span> <span>{pl(rapport.provisoires.length, "jour n'est pas clôturé :", 'jours ne sont pas clôturés :')}</span>{' '}
                  <span style={st.num}>{rapport.provisoires.map(dateCH).join(', ')}</span>
                  <span>. Un jour non clôturé peut encore changer et n'entre pas dans la sortie comptable.</span>
                </span>
              </div>
            )}
            {onglets.length > 1 && <SegmentedTabs tabs={onglets} active={actif} onChange={setOnglet} retourLigne />}
            {rapport.vide && <p style={st.vide}>Aucun ticket encaissé sur cette période.</p>}
            {actif === 'synthese' && <Synthese r={rapport} comparaison={etat.data.comparaison} noShow={noShow} />}
            {actif === 'moyens' && <Moyens r={rapport} />}
            {actif === 'plats' && <Plats r={rapport} tri={tri} setTri={setTri} recherche={recherche} setRecherche={setRecherche} />}
            {actif === 'services' && <Services r={rapport} />}
            {actif === 'heures' && <Heures r={rapport} />}
            {actif === 'personnes' && <Personnes r={rapport} />}
            {actif === 'journal' && <Journal r={rapport} />}
            {actif === 'clients' && <Clients r={rapport} noShow={noShow} />}
          </>
        )}
      </div>
      {exportOuvert && rapport && (
        <FenetreExport
          rapport={rapport}
          onglet={actif}
          tri={tri}
          noShow={noShow}
          comparaison={etat.data.comparaison}
          etablissement={etablissement}
          reglages={reglages}
          onClose={() => setExportOuvert(false)}
        />
      )}
    </EcranTache>
  );
}

// ── Accueil des rapports ──
export default function Rapports({ etablissement, reglages, onRetour }) {
  const [periode, setPeriode] = React.useState(null);
  // Le geste retour ramène d'abord aux tuiles des rapports.
  useBackLayer(Boolean(periode), () => setPeriode(null), 'caisse-rapport');
  // Changement de maison : on repart des tuiles.
  React.useEffect(() => { setPeriode(null); }, [etablissement?.id]);

  const minutes = zurichNowMinutes();
  const jourCourant = jourExploitation({
    aujourdhui: zurichToday(), minutes, finJournee: reglages.fin_journee, veille: (d) => zurichAjouterJours(d, -1),
  });
  // Le service en cours, comme la base : soir avant la fin de journée, midi
  // jusqu'à la bascule, soir ensuite.
  const serviceCourant = minutes < minutesDe(reglages.fin_journee) ? 'soir' : (minutes < minutesDe(reglages.bascule_service) ? 'midi' : 'soir');

  if (periode) {
    return (
      <EcranRapport
        etablissement={etablissement}
        reglages={reglages}
        periode={periode}
        setPeriode={setPeriode}
        jourCourant={jourCourant}
        onRetour={() => setPeriode(null)}
      />
    );
  }

  const semaine = periodeSemaine(jourCourant);
  const tuiles = [
    { id: 'rapport_jour', libelle: "Aujourd'hui", Icone: Sun, etat: <span data-no-translate>{libellePeriodeCaisse(periodeJour(jourCourant))}</span>, onClick: () => setPeriode(periodeJour(jourCourant)) },
    { id: 'rapport_service', libelle: 'Ce service', Icone: Clock, etat: serviceCourant === 'midi' ? 'Le service de midi' : 'Le service du soir', onClick: () => setPeriode(periodeService(jourCourant, serviceCourant)) },
    { id: 'rapport_semaine', libelle: 'Cette semaine', Icone: CalendarRange, etat: <span data-no-translate>{libellePeriodeCaisse(semaine).replace(/^semaine /, '')}</span>, onClick: () => setPeriode(semaine) },
    { id: 'rapport_mois', libelle: 'Ce mois', Icone: CalendarDays, etat: <span data-no-translate>{libellePeriodeCaisse(periodeMois(jourCourant))}</span>, onClick: () => setPeriode(periodeMois(jourCourant)) },
    { id: 'rapport_annee', libelle: 'Cette année', Icone: BarChart3, etat: <span data-no-translate>{libellePeriodeCaisse(periodeAnnee(jourCourant)).replace(/^année /, '')}</span>, onClick: () => setPeriode(periodeAnnee(jourCourant)) },
    { id: 'rapport_periode', libelle: 'Période', Icone: SunMoon, etat: 'Du, au : deux dates au choix', onClick: () => setPeriode(periodeLibre(zurichAjouterJours(jourCourant, -6), jourCourant)) },
  ];
  return (
    <EcranTache titre="Rapports" etat="Les chiffres de la caisse, par service, jour, semaine, mois, année ou période" onRetour={onRetour}>
      <div style={{ marginTop: 14 }}><AccueilModule tuiles={tuiles} /></div>
    </EcranTache>
  );
}

const st = {
  racine: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12, maxWidth: 900, minWidth: 0 },
  btn44: { minHeight: 44, flexShrink: 0 },
  barre: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  nav: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 },
  fleche: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0,
    borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer',
  },
  inactif: { opacity: 0.3, cursor: 'default' },
  libelle: {
    flex: 1, minWidth: 0, textAlign: 'center', fontSize: 'var(--t3)', fontFamily: 'var(--font)', fontWeight: 'var(--g2)', color: 'var(--text)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px',
  },
  dates: { flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  date: {
    minHeight: 44, minWidth: 0, width: '100%', boxSizing: 'border-box', padding: '0 8px', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
    color: 'var(--text)', background: 'var(--surface)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)',
  },
  erreur: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', color: 'var(--text)' },
  vide: { color: 'var(--text3)', fontSize: 'var(--t2)', margin: 0, lineHeight: 1.4 },
  alerte: { color: 'var(--warning-text)', fontSize: 'var(--t2)', margin: '0 0 8px', lineHeight: 1.4 },
  // Bandeau « Rapport provisoire » : une carte blanche, le titre garde son
  // encre d'alerte.
  bandeau: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 18px', borderRadius: 'var(--r-lg)', boxSizing: 'border-box',
    background: 'var(--zone)', boxShadow: 'var(--sh)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    color: 'var(--text)', fontSize: 'var(--t2)', lineHeight: 1.4, minWidth: 0,
  },
  bandeauTitre: { fontWeight: 'var(--g3)', color: 'var(--warning-text)' },
  provisoire: { color: 'var(--warning-text)', fontWeight: 'var(--g3)' },
  // Chiffres de la période : de petites cartes blanches, le libellé au-dessus,
  // le grand chiffre dessous (direction Galet).
  cartes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 12 },
  carte: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 'var(--r-lg)', boxSizing: 'border-box',
    background: 'var(--zone)', boxShadow: 'var(--sh)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    color: 'var(--text)', minWidth: 0,
  },
  carteTitre: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  carteValeur: { minWidth: 0, overflowWrap: 'anywhere' },
  carteDetail: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.35 },
  num: { fontFamily: 'var(--font-num)' },
  numFort: { fontFamily: 'var(--font-num)', fontSize: 'var(--t5)', fontWeight: 'var(--g-chiffre)', lineHeight: 1.15 },
  numFortPetit: { fontFamily: 'var(--font-num)', fontSize: 'var(--t3)', fontWeight: 'var(--g-chiffre)' },
  unite: { fontSize: 'var(--t1)', color: 'var(--text2)', fontFamily: 'var(--font)', fontWeight: 'var(--g1)' },
  petit: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.35 },
  petitNum: { fontSize: 'var(--t1)', color: 'var(--text2)', fontFamily: 'var(--font-num)' },
  // Une section du rapport : une carte blanche à titre, ses lignes séparées
  // par un filet doux, la dernière sans (caisse.css).
  section: {
    display: 'flex', flexDirection: 'column', minWidth: 0, padding: '14px 18px 4px', boxSizing: 'border-box',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  sectionTitre: { fontSize: 'var(--t3)', fontFamily: 'var(--font)', fontWeight: 'var(--g3)', color: 'var(--text)', marginBottom: 4 },
  deux: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 14 },
  rang: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, minHeight: 44, padding: '8px 0',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', color: 'var(--text)', fontSize: 'var(--t2)', minWidth: 0,
  },
  rangTitre: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0, overflowWrap: 'anywhere' },
  rangValeur: { flexShrink: 0, textAlign: 'right', fontSize: 'var(--t2)' },
  outils: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '4px 0' },
  plat: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', minHeight: 44, padding: '8px 0',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', color: 'var(--text)', fontSize: 'var(--t2)', minWidth: 0,
  },
  platNom: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' },
  platCellules: { display: 'flex', gap: 8, flexShrink: 0 },
  cellule: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 78, minWidth: 0 },
  heure: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 0', color: 'var(--text)', fontSize: 'var(--t2)', minWidth: 0 },
  heureNom: { width: 44, flexShrink: 0 },
  heurePiste: { flex: 1, minWidth: 40, height: 12, borderRadius: 'var(--r-full)', background: 'var(--piste)', overflow: 'hidden' },
  heureBarre: { display: 'block', height: '100%', borderRadius: 'var(--r-full)', background: 'var(--accent)' },
  heureValeur: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, minWidth: 96 },
};
