import React from 'react';
import { Btn, CarteRepere } from '../../components/ui/index.jsx';
import { zurichToday } from '../../utils/zurichTime.js';
import { CarteHotel, Vide, h } from './hotelUi.jsx';
import {
  PIECES_IDENTITE, REGLAGES_DEFAUT, chf, dateCourte, finDuMois, libelleDe, premierDuMois, registreDuMois, statsMois, telechargerTexte, versCsv,
} from './hotelData.js';
import { MOTIF_NON_RENSEIGNE, classeTaxe, decompteTaxe, nuitsDansPeriode } from './serieHotel.js';
import { lectureTronquee } from './registreReprise.js';

// ─────────────────────────────────────────────────────────────────────────────
// Registre et statistiques d'un mois (lot H4), direction : les chiffres
// (nuitées, arrivées, taux d'occupation, durée moyenne, prix moyen, taxes du
// mois), le registre des nuitées par personne (LHR, RS 935.1) et la
// répartition HESTA par pays de domicile, exportables en CSV. Tout se calcule
// à l'écran à partir des séjours, des occupants et des lignes de note.
// Lot 13 du panel : le décompte de la taxe de séjour du mois (nuitées par
// classe, exonérés par motif, taxe due, écart avec les notes), en carte et en
// PDF d'une page, et la classe, le motif et les nuitées dans le CSV. Le
// décompte ne s'affiche que sur trois lectures abouties (etat 'pret').
// ─────────────────────────────────────────────────────────────────────────────

const pct = (x) => `${Math.round(x * 100)} %`;
const un = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const CLASSES_CSV = { adulte: 'Adulte', enfant: 'Enfant', exonere_age: 'Enfant exonéré', exonere_motif: 'Exonéré' };
const PHRASE_ECART = 'Les taxes des notes sont datées du jour d\'arrivée. Un séjour à cheval sur deux mois, une personne ajoutée après coup ou un taux modifié créent un écart.';
const MESSAGES_ETAT = {
  chargement: 'Chargement du registre…',
  erreur: 'Le registre n\'a pas pu être lu. Le décompte ne s\'affiche pas.',
  reserve: 'Le décompte demande le droit Modifier d\'Hébergement.',
};
const moisEnLettres = (mois) => {
  const [y, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('fr-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export default function RegistreMois({ sejours, chambres, occupants, lignes, reglages, etat = 'pret', etablissement }) {
  const [mois, setMois] = React.useState(() => zurichToday().slice(0, 7));
  const [erreurPdf, setErreurPdf] = React.useState('');
  const stats = statsMois({ sejours, chambres, occupants, lignes, mois });
  const registre = registreDuMois({ sejours, occupants, chambres, mois });
  const regl = reglages || REGLAGES_DEFAUT;
  const debut = premierDuMois(mois);
  const fin = finDuMois(mois);
  const decompte = decompteTaxe({ sejours, occupants, lignes, reglages: regl, debut, fin });
  const pret = etat === 'pret';
  const avecNuitees = decompte.nuitees.total > 0;
  const tronque = lectureTronquee(occupants.length, 20000) || lectureTronquee(lignes.length, 50000);
  const sejourDe = (id) => sejours.find((s) => s.id === id);

  const exporterRegistre = () => {
    const csv = versCsv(
      ['Arrivée', 'Départ', 'Nom', 'Prénom', 'Date de naissance', 'Nationalité', 'Adresse', 'Localité', 'Pays', 'Pièce', 'Numéro', 'Chambre', 'Séjour', 'Exonéré', 'Motif d\'exonération', 'Classe de taxe', 'Nuitées du mois'],
      registre.map((o) => {
        const s = sejourDe(o.sejourId);
        return [dateCourte(o.arrivee), dateCourte(o.depart), o.nom, o.prenom, dateCourte(o.dateNaissance), o.nationalite, o.domicileAdresse, o.domicileLocalite, o.domicilePays, libelleDe(PIECES_IDENTITE, o.pieceType), o.pieceNumero, o.chambre, o.nomSejour, o.exonereTaxe ? 'oui' : '',
          o.exonereTaxe ? (o.exonereMotif.trim() || MOTIF_NON_RENSEIGNE) : '',
          CLASSES_CSV[classeTaxe(o, s?.arrivee || o.arrivee, regl)],
          nuitsDansPeriode(o.arrivee || s?.arrivee, o.depart || s?.depart, debut, fin)];
      }),
    );
    telechargerTexte(`registre-nuitees-${mois}.csv`, csv);
  };
  const exporterHesta = () => {
    const csv = versCsv(
      ['Mois', 'Numéro HESTA', 'Pays de domicile', 'Arrivées', 'Nuitées', 'Chambres disponibles', 'Nuitées chambres', 'Lits (personnes incluses)'],
      stats.parPays.map((p) => [mois, reglages?.numeroHesta || '', p.pays, p.arrivees, p.nuitees, stats.chambresActives, stats.nuiteesChambres, '']),
    );
    telechargerTexte(`hesta-${mois}.csv`, csv);
  };
  const exporterDecompte = async () => {
    setErreurPdf('');
    try {
      const { pdfUtils } = await import('../../services/pdf.js');
      await pdfUtils.exportDecompteTaxeSejourPdf({
        commune: regl.commune || '', mois: moisEnLettres(mois), numeroHesta: regl.numeroHesta || '',
        decompte, phraseEcart: PHRASE_ECART,
      }, { etablissement, filename: `decompte-taxe-sejour-${mois}.pdf` });
    } catch (e) {
      setErreurPdf(e?.message || 'Impression impossible.');
    }
  };

  // Un chiffre du mois : une petite carte de repère (direction Galet).
  const Chiffre = ({ libelle, valeur, detail }) => (
    <CarteRepere valeur={valeur} libelle={libelle} detail={detail} style={{ padding: '14px 16px' }} />
  );

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div className="module-actions">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
          <span>Mois</span>
          <input type="month" style={{ ...h.saisie, width: 'auto' }} value={mois} onChange={(ev) => ev.target.value && setMois(ev.target.value)} />
        </label>
        <Btn onClick={exporterRegistre} disabled={!registre.length}>Exporter le registre (CSV)</Btn>
        <Btn onClick={exporterHesta} disabled={!stats.parPays.length}>Exporter HESTA (CSV)</Btn>
        <Btn onClick={exporterDecompte} disabled={!pret || !avecNuitees}>Décompte de la taxe (PDF)</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
        <Chiffre libelle="Nuitées chambres" valeur={stats.nuiteesChambres} />
        <Chiffre libelle="Nuitées personnes" valeur={stats.nuiteesPersonnes} />
        <Chiffre libelle="Arrivées" valeur={stats.arrivees} detail={<><span>{stats.arriveesPersonnes}</span> <span>personnes</span></>} />
        <Chiffre libelle="Taux d'occupation" valeur={pct(stats.tauxOccupation)} detail={<><span>{stats.chambresActives}</span> <span>chambres actives</span></>} />
        <Chiffre libelle="Durée moyenne" valeur={un(stats.dureeMoyenne)} detail={<span>nuits par séjour</span>} />
        <Chiffre libelle="Prix moyen par nuitée" valeur={`CHF ${chf(stats.prixMoyen)}`} detail={<><span>hébergement</span> <span data-no-translate>CHF {chf(stats.caNuitees)}</span></>} />
        <Chiffre libelle="Taxe de séjour du mois" valeur={`CHF ${chf(stats.taxes.sejour)}`} />
        <Chiffre libelle="Taxe d'hébergement du mois" valeur={`CHF ${chf(stats.taxes.hebergement)}`} />
      </div>

      <CarteHotel titre="Décompte de la taxe de séjour" sousTitre={regl.commune ? <><span>Commune de</span> <span data-no-translate>{regl.commune}</span></> : null}>
        {!pret && <div style={h.detail}>{MESSAGES_ETAT[etat] || MESSAGES_ETAT.chargement}</div>}
        {pret && !avecNuitees && <div style={h.detail}>Aucune nuitée ce mois.</div>}
        {pret && avecNuitees && <Decompte d={decompte} />}
        {pret && tronque && <div style={h.erreur}>Le registre est trop long pour être lu en entier. Vérifiez les chiffres.</div>}
        {erreurPdf && <div style={h.erreur} role="alert">{erreurPdf}</div>}
      </CarteHotel>

      <CarteHotel titre="Nuitées par pays de domicile (HESTA)">
        {!stats.parPays.length && <div style={h.detail}>Aucune nuitée ce mois.</div>}
        {stats.parPays.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.parPays.map((p) => (
              <div key={p.pays} style={r.ligne}>
                <span style={{ flex: '1 1 120px' }} data-no-translate={p.pays === 'Non renseigné' ? undefined : ''}>{p.pays}</span>
                <span style={r.nombre}><span data-no-translate>{p.arrivees}</span> <span>{p.arrivees > 1 ? 'arrivées' : 'arrivée'}</span></span>
                <span style={r.nombre}><span data-no-translate>{p.nuitees}</span> <span>{p.nuitees > 1 ? 'nuitées' : 'nuitée'}</span></span>
              </div>
            ))}
          </div>
        )}
      </CarteHotel>

      <CarteHotel titre="Registre des nuitées" sousTitre={<><span>{registre.length}</span> <span>{registre.length > 1 ? 'personnes hébergées' : 'personne hébergée'}</span></>}>
        {!registre.length && <div style={h.detail}>Personne n'est inscrite au registre pour ce mois. Les personnes s'ajoutent depuis la fiche d'un séjour.</div>}
        {registre.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {registre.map((o) => (
              <div key={o.id} style={r.ligne}>
                <span style={{ ...h.detail, flex: '0 0 150px' }} data-no-translate>{dateCourte(o.arrivee)} - {dateCourte(o.depart)}</span>
                <span style={{ flex: '1 1 160px', minWidth: 0 }} data-no-translate>{`${o.nom} ${o.prenom}`.trim()}{o.dateNaissance ? `, ${dateCourte(o.dateNaissance)}` : ''}</span>
                <span style={{ ...h.detail, flex: '1 1 160px', minWidth: 0 }} data-no-translate>{[o.nationalite, [o.domicileLocalite, o.domicilePays].filter(Boolean).join(', '), o.pieceType ? `${libelleDe(PIECES_IDENTITE, o.pieceType)} ${o.pieceNumero}`.trim() : ''].filter(Boolean).join(' / ')}</span>
                <span style={{ ...h.detail, flex: '0 0 80px' }}>{o.chambre ? <><span>Ch.</span> <span data-no-translate>{o.chambre}</span></> : null}</span>
              </div>
            ))}
          </div>
        )}
      </CarteHotel>
      {!sejours.length && <Vide>Aucun séjour enregistré pour l'instant.</Vide>}
    </section>
  );
}

// Carte du décompte : classes avec leurs nuitées, motifs, taxes dues, taxes
// des notes et écart. Chaque nombre dans son propre noeud non traduit.
const nuiteesDe = (n) => <><span data-no-translate>{n}</span> <span>{n > 1 ? 'nuitées' : 'nuitée'}</span></>;
const montantDe = (x) => <span data-no-translate>{`CHF ${chf(x)}`}</span>;
function LigneDecompte({ libelle, n, taux, total, retrait, fort }) {
  return (
    <div style={{ ...r.ligne, ...(retrait ? { paddingLeft: 16 } : null), ...(fort ? { fontWeight: 'var(--g2)' } : null) }}>
      <span style={{ flex: '1 1 160px', minWidth: 0 }}>{libelle}</span>
      {n != null && <span style={r.nombre}>{nuiteesDe(n)}</span>}
      {taux != null && <span style={{ ...r.nombre, color: 'var(--text2)' }}>{montantDe(taux)}</span>}
      {total != null && <span style={r.nombre}>{montantDe(total)}</span>}
    </div>
  );
}
function Decompte({ d }) {
  const ecartNonNul = d.ecart.sejour !== 0 || d.ecart.hebergement !== 0;
  const nbSans = d.sansInscrit.sejours;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <LigneDecompte libelle="Adultes" n={d.nuitees.adultes} taux={d.taux.adulte} total={d.du.adultes} />
      <LigneDecompte libelle="Enfant au tarif réduit" n={d.nuitees.enfants} taux={d.taux.enfant} total={d.du.enfants} />
      <LigneDecompte libelle="Enfant exonéré par l'âge" n={d.nuitees.exonereAge} />
      <LigneDecompte libelle="Exonéré par motif" n={d.nuitees.exonereMotif} />
      {d.motifs.map((m) => (
        <LigneDecompte key={m.motif} retrait libelle={<span data-no-translate={m.motif === MOTIF_NON_RENSEIGNE ? undefined : ''}>{m.motif}</span>} n={m.nuitees} />
      ))}
      <LigneDecompte fort libelle="Nuitées personnes" n={d.nuitees.total} />
      <LigneDecompte fort libelle="Taxe de séjour due" total={d.du.sejour} />
      <LigneDecompte libelle="Taxe de séjour des notes" total={d.notes.sejour} />
      <LigneDecompte libelle="Écart avec les notes" total={d.ecart.sejour} />
      <LigneDecompte fort libelle="Taxe d'hébergement due" n={d.nuitees.assujetties} taux={d.taux.hebergement} total={d.du.hebergement} />
      <LigneDecompte libelle="Taxe d'hébergement des notes" total={d.notes.hebergement} />
      <LigneDecompte libelle="Écart avec les notes" total={d.ecart.hebergement} />
      {ecartNonNul && <div style={{ ...h.detail, marginTop: 6 }}>{PHRASE_ECART}</div>}
      {nbSans > 0 && (
        <div style={{ ...h.detail, marginTop: 6 }}>
          <span data-no-translate>{nbSans}</span> <span>{nbSans > 1 ? 'séjours n\'ont aucune personne inscrite au registre.' : 'séjour n\'a aucune personne inscrite au registre.'}</span>
          {' '}<span>{nbSans > 1 ? 'Leurs nuitées sont comptées d\'après le nombre de personnes du séjour.' : 'Ses nuitées sont comptées d\'après le nombre de personnes du séjour.'}</span>
        </div>
      )}
    </div>
  );
}

const r = {
  ligne: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', fontSize: 'var(--t2)', color: 'var(--text)' },
  nombre: { flex: '0 0 110px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
