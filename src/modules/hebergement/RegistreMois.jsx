import React from 'react';
import { zurichToday } from '../../utils/zurichTime.js';
import { Carte } from '../dashboard/tableauUi.jsx';
import { Vide, h } from './hotelUi.jsx';
import {
  PIECES_IDENTITE, chf, dateCourte, libelleDe, registreDuMois, statsMois, telechargerTexte, versCsv,
} from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Registre et statistiques d'un mois (lot H4), direction : les chiffres
// (nuitées, arrivées, taux d'occupation, durée moyenne, prix moyen, taxes du
// mois), le registre des nuitées par personne (LHR, RS 935.1) et la
// répartition HESTA par pays de domicile, exportables en CSV. Tout se calcule
// à l'écran à partir des séjours, des occupants et des lignes de note.
// ─────────────────────────────────────────────────────────────────────────────

const pct = (x) => `${Math.round(x * 100)} %`;
const un = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

export default function RegistreMois({ sejours, chambres, occupants, lignes, reglages }) {
  const [mois, setMois] = React.useState(() => zurichToday().slice(0, 7));
  const stats = statsMois({ sejours, chambres, occupants, lignes, mois });
  const registre = registreDuMois({ sejours, occupants, chambres, mois });

  const exporterRegistre = () => {
    const csv = versCsv(
      ['Arrivée', 'Départ', 'Nom', 'Prénom', 'Date de naissance', 'Nationalité', 'Adresse', 'Localité', 'Pays', 'Pièce', 'Numéro', 'Chambre', 'Séjour', 'Exonéré'],
      registre.map((o) => [dateCourte(o.arrivee), dateCourte(o.depart), o.nom, o.prenom, dateCourte(o.dateNaissance), o.nationalite, o.domicileAdresse, o.domicileLocalite, o.domicilePays, libelleDe(PIECES_IDENTITE, o.pieceType), o.pieceNumero, o.chambre, o.nomSejour, o.exonereTaxe ? 'oui' : '']),
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

  const Chiffre = ({ libelle, valeur, detail }) => (
    <div style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: 'var(--r)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', minWidth: 0 }}>
      <div style={h.champLabel}>{libelle}</div>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-num)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }} data-no-translate>{valeur}</div>
      {detail && <div style={h.detail}>{detail}</div>}
    </div>
  );

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div className="module-actions">
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
          <span>Mois</span>
          <input type="month" style={{ ...h.saisie, width: 'auto' }} value={mois} onChange={(ev) => ev.target.value && setMois(ev.target.value)} />
        </label>
        <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 44 }} onClick={exporterRegistre} disabled={!registre.length}>Exporter le registre (CSV)</button>
        <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 44 }} onClick={exporterHesta} disabled={!stats.parPays.length}>Exporter HESTA (CSV)</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
        <Chiffre libelle="Nuitées chambres" valeur={stats.nuiteesChambres} />
        <Chiffre libelle="Nuitées personnes" valeur={stats.nuiteesPersonnes} />
        <Chiffre libelle="Arrivées" valeur={stats.arrivees} detail={<><span>{stats.arriveesPersonnes}</span> <span>personnes</span></>} />
        <Chiffre libelle="Taux d'occupation" valeur={pct(stats.tauxOccupation)} detail={<><span>{stats.chambresActives}</span> <span>chambres actives</span></>} />
        <Chiffre libelle="Durée moyenne" valeur={un(stats.dureeMoyenne)} detail={<span>nuits par séjour</span>} />
        <Chiffre libelle="Prix moyen par nuitée" valeur={`CHF ${chf(stats.prixMoyen)}`} detail={<><span>hébergement</span> <span data-no-translate>CHF {chf(stats.caNuitees)}</span></>} />
        <Chiffre libelle="Taxe de séjour du mois" valeur={`CHF ${chf(stats.taxes.sejour)}`} />
        <Chiffre libelle="Taxe d'hébergement du mois" valeur={`CHF ${chf(stats.taxes.hebergement)}`} />
      </div>

      <Carte titre="Nuitées par pays de domicile (HESTA)">
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
      </Carte>

      <Carte titre="Registre des nuitées" sousTitre={<><span>{registre.length}</span> <span>{registre.length > 1 ? 'personnes hébergées' : 'personne hébergée'}</span></>}>
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
      </Carte>
      {!sejours.length && <Vide>Aucun séjour enregistré pour l'instant.</Vide>}
    </section>
  );
}

const r = {
  ligne: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', fontSize: 14, color: 'var(--text)' },
  nombre: { flex: '0 0 110px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};
