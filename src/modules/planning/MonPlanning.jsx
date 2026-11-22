import React from 'react';
import { ajouterJours, filetType, formatDuree, heuresSegment, typeHoraire } from './planningModeles.js';
import { jourLong, libellePeriode } from './planningExport.js';
import { formatSolde } from './soldesHeures.js';
import { Btn, Panneau } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import MesConges from './MesConges.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Mon planning : ce qu'un employé veut savoir en ouvrant le module. Quand est
// mon prochain service, quels jours je travaille cette semaine, combien
// d'heures. Une semaine à la fois, un jour par ligne, sans grille.
//
// conges (lot L5) : { lignes, demander, retirer } pour demander un congé et
// suivre ses demandes (MesConges.jsx) ; null sans la table des absences.
// ─────────────────────────────────────────────────────────────────────────────

const parHeure = (a, b) => (a.debut || '').localeCompare(b.debut || '');

const quand = (date, aujourdhui) => {
  if (date === aujourdhui) return 'aujourd\'hui';
  if (date === ajouterJours(aujourdhui, 1)) return 'demain';
  return jourLong(date).toLowerCase();
};

export default function MonPlanning({ userId, shifts, absenceDe, semaineInitiale, aujourdhui, maintenant, solde, onExporter, echanges = null, nomDe = () => '', conges = null }) {
  // Échanges de services (lot C2) : sans la migration, echanges.statut vaut
  // 'absent' et rien ne change à l'écran.
  const avecEchanges = echanges?.statut === 'pret';
  const ouverts = avecEchanges ? echanges.echanges : [];
  const parShift = new Map(ouverts.map((e) => [e.shift_id, e]));
  const shiftParId = new Map(shifts.map((x) => [x.id, x]));
  const aReprendre = ouverts.filter((e) => e.demandeur !== userId && (e.statut === 'propose' || e.repreneur === userId))
    .map((e) => ({ e, x: shiftParId.get(e.shift_id) })).filter(({ x }) => x && x.date >= aujourdhui);
  const [enCours, setEnCours] = React.useState(null);
  const agir = async (cle, action, succes) => {
    setEnCours(cle);
    const err = await action();
    setEnCours(null);
    notify(err || succes, err ? 'error' : 'success');
  };
  const [semaine, setSemaine] = React.useState(semaineInitiale);
  const mesShifts = shifts.filter(s => s.userId === userId);
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(semaine, i));
  const totalSemaine = mesShifts
    .filter(s => s.date >= jours[0] && s.date <= jours[6])
    .reduce((t, s) => t + heuresSegment(s), 0);

  // Prochain service : le premier qui n'est pas encore terminé.
  const prochain = mesShifts
    .filter(s => s.date > aujourdhui || (s.date === aujourdhui && (s.fin || '') > maintenant))
    .sort((a, b) => a.date.localeCompare(b.date) || parHeure(a, b))[0] || null;

  return (
    <div style={s.racine}>
      <div style={s.prochain}>
        {prochain ? (
          <>
            <div style={s.prochainLabel}>Prochain service</div>
            <div style={s.prochainQuand}>
              {quand(prochain.date, aujourdhui).replace(/^./, c => c.toUpperCase())}, {typeHoraire(prochain.typeShift).label.toLowerCase()}
            </div>
            <div style={s.prochainHeures}>{prochain.debut} à {prochain.fin}{prochain.pause ? `, pause ${prochain.pause} min` : ''}</div>
          </>
        ) : (
          <div style={s.prochainQuand}>Aucun service prévu pour l'instant.</div>
        )}
      </div>

      {solde && <LigneSolde solde={solde} />}

      {aReprendre.length > 0 && (
        <Panneau style={s.echanges} data-echanges-a-reprendre="">
          <div style={s.echangesTitre}>Services à reprendre</div>
          {aReprendre.map(({ e, x }) => (
            <div key={e.id} style={s.echangeLigne}>
              <span style={{ minWidth: 0, flex: '1 1 220px' }}>
                {e.repreneur === userId
                  ? <>Vous reprenez le service de <span data-no-translate>{nomDe(e.demandeur)}</span>, {jourLong(x.date).toLowerCase()} de <span data-no-translate>{x.debut} à {x.fin}</span>. La personne qui gère le planning doit encore valider.</>
                  : <><span data-no-translate>{nomDe(e.demandeur)}</span> propose son service du {jourLong(x.date).toLowerCase()}, de <span data-no-translate>{x.debut} à {x.fin}</span>.</>}
              </span>
              {e.repreneur === userId
                ? <Btn small disabled={enCours === e.id} onClick={() => agir(e.id, () => echanges.retirer(e.id), 'Vous ne reprenez plus ce service.')}>Me retirer</Btn>
                : <Btn small disabled={enCours === e.id} onClick={() => agir(e.id, () => echanges.reprendre(e.id), 'Demande envoyée. La personne qui gère le planning va valider.')}>Je reprends</Btn>}
            </div>
          ))}
        </Panneau>
      )}

      {conges && (
        <MesConges userId={userId} aujourdhui={aujourdhui} lignes={conges.lignes} onDemander={conges.demander} onRetirer={conges.retirer} />
      )}

      <div style={s.navigation}>
        <button type="button" style={s.fleche} onClick={() => setSemaine(ajouterJours(semaine, -7))} aria-label="Semaine précédente">‹</button>
        <div style={s.periode}>
          <div style={s.periodeTitre}>Semaine {libellePeriode(jours[0], jours[6])}</div>
          <div style={s.total}>{totalSemaine ? `${formatDuree(totalSemaine)} prévues` : 'Aucun horaire'}</div>
        </div>
        <button type="button" style={s.fleche} onClick={() => setSemaine(ajouterJours(semaine, 7))} aria-label="Semaine suivante">›</button>
      </div>
      {semaine !== semaineInitiale && (
        <button type="button" style={s.retour} onClick={() => setSemaine(semaineInitiale)}>Revenir à cette semaine</button>
      )}

      <div>
        {jours.map(d => {
          const duJour = mesShifts.filter(x => x.date === d).sort(parHeure);
          const abs = absenceDe ? absenceDe(userId, d) : null;
          const estAujourdhui = d === aujourdhui;
          return (
            <div key={d} style={s.jour}>
              <div style={{ ...s.jourNom, ...(estAujourdhui ? { color: 'var(--onglet)' } : null) }}>
                {jourLong(d)}{estAujourdhui ? ', aujourd\'hui' : ''}
              </div>
              <div style={s.horaires}>
                {abs && <div style={s.absence}>{abs}</div>}
                {duJour.length === 0 && !abs && <div style={s.repos}>Repos</div>}
                {duJour.map(x => {
                  const t = typeHoraire(x.typeShift);
                  return (
                    <div key={x.id} style={s.horaire}>
                      <span style={{ ...s.type, color: 'var(--text2)', boxShadow: filetType(t), paddingLeft: 8 }}>{t.label}</span>
                      <span style={s.heures}>{x.debut} à {x.fin}</span>
                      <span style={s.duree}>{formatDuree(heuresSegment(x))}</span>
                      {avecEchanges && x.date >= aujourdhui && (() => {
                        const e = parShift.get(x.id);
                        if (!e) return <Btn small disabled={enCours === x.id} onClick={() => agir(x.id, () => echanges.proposer(x.id), "Service proposé à l'équipe. Vous restez au planning tant que l'échange n'est pas validé.")}>Proposer l'échange</Btn>;
                        return (
                          <span style={s.echangeEtat}>
                            {e.statut === 'repris'
                              ? <><span data-no-translate>{nomDe(e.repreneur)}</span> reprend ce service, en attente de validation.</>
                              : "Proposé à l'équipe."}
                            {' '}<Btn small disabled={enCours === e.id} onClick={() => agir(e.id, () => echanges.retirer(e.id), 'Échange annulé.')}>Annuler l'échange</Btn>
                          </span>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {onExporter && (
        <button type="button" style={s.exporter} onClick={() => onExporter(semaine)}>Télécharger mon planning</button>
      )}
    </div>
  );
}

// Solde du mois (du 1er à hier) et retards, en une ligne. Nombres et mots dans
// des nœuds séparés : les libellés restent des entrées du glossaire.
function LigneSolde({ solde }) {
  const { retards } = solde;
  return (
    <div style={s.solde} data-solde="">
      <span style={s.soldeLabel}>{solde.periode.complet ? 'Solde du mois dernier' : 'Solde du mois, à hier'}</span>
      {solde.avecContrat ? (
        <span style={{ ...s.soldeValeur, color: solde.solde < 0 ? 'var(--warning-text)' : 'var(--text)' }}>{formatSolde(solde.solde)}</span>
      ) : (
        <span style={s.soldeSans}>Pas de contrat</span>
      )}
      {retards.nombre > 0 ? (
        <span style={s.soldeRetards}>
          <span>{retards.nombre}</span> <span>{retards.nombre > 1 ? 'retards' : 'retard'}</span>, <span>{retards.minutes}</span> <span>min</span>
        </span>
      ) : (
        <span style={s.soldeRetards}>Aucun retard</span>
      )}
    </div>
  );
}

const s = {
  echanges: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 },
  echangesTitre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  echangeLigne: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 'var(--t2)', lineHeight: 1.45, color: 'var(--text)' },
  echangeEtat: { flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 'var(--t2)', color: 'var(--text2)' },
  racine: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 },
  solde: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 12px', padding: '0 0 12px', borderBottom: '1px solid var(--rule-soft)' },
  soldeLabel: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  soldeValeur: { fontSize: 'var(--t3)', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
  soldeSans: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  soldeRetards: { fontSize: 'var(--t2)', color: 'var(--text2)', marginLeft: 'auto' },
  prochain: { padding: '4px 0 12px', borderBottom: '1px solid var(--rule-soft)' },
  prochainLabel: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  prochainQuand: { fontSize: 'var(--t4)', fontFamily: 'var(--font)', fontWeight: 'var(--g3)', color: 'var(--text)', marginTop: 2 },
  prochainHeures: { fontSize: 'var(--t5)', fontFamily: 'var(--font-num)', color: 'var(--text)', marginTop: 2 },
  navigation: { display: 'flex', alignItems: 'center', gap: 8 },
  fleche: { width: 44, height: 44, flexShrink: 0, background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t4)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  periode: { flex: 1, minWidth: 0, textAlign: 'center' },
  periodeTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  total: { fontSize: 'var(--t2)', color: 'var(--text2)', marginTop: 2 },
  retour: { alignSelf: 'center', background: 'none', border: 'none', color: 'var(--lien)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', minHeight: 36, fontFamily: 'var(--font)' },
  jour: { display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--rule-soft)', flexWrap: 'wrap' },
  jourNom: { flex: '1 1 180px', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', minWidth: 0 },
  horaires: { flex: '2 1 240px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  horaire: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  type: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', minWidth: 64 },
  heures: { fontSize: 'var(--t3)', fontFamily: 'var(--font-num)', color: 'var(--text)' },
  duree: { fontSize: 'var(--t1)', color: 'var(--text2)', marginLeft: 'auto' },
  repos: { fontSize: 'var(--t2)', color: 'var(--text3)' },
  absence: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--warning-text)' },
  exporter: { alignSelf: 'flex-start', padding: '11px 16px', minHeight: 44, background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', borderRadius: 'var(--r)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
};
