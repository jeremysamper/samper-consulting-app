import React from 'react';
import { CalendarClock, CircleCheck, Clock, LogIn, LogOut, Moon, Sun } from 'lucide-react';
import { Carte, Puce, t } from './tableauUi.jsx';
import { duree, enMinutes, jourRelatif } from './tableauLogique.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Mon service » : le pointage de l'équipier connecté.
//
// Un seul geste à la fois, en grand : pointer l'arrivée, puis le départ. En
// poste, la durée tourne en direct. Sans horaire aujourd'hui, la carte dit
// quand est le prochain service au lieu d'un bouton grisé.
//
// Le pointage lui-même (optimiste, RPC serveur, file hors-ligne) est géré par
// le parent : cette carte ne fait qu'afficher et appeler onPointer.
// ─────────────────────────────────────────────────────────────────────────────

const LIBELLES = {
  midi: { texte: 'Service du midi', icone: Sun },
  soir: { texte: 'Service du soir', icone: Moon },
};

function ponctualite(debut, maintenant) {
  const d = enMinutes(debut);
  if (d == null) return null;
  const ecart = d - maintenant;
  if (ecart > 60) return { texte: `Commence à ${debut}`, ton: 'neutre' };
  if (ecart > 0) return { texte: `Commence dans ${duree(ecart)}`, ton: 'info' };
  if (ecart >= -15) return { texte: "C'est l'heure", ton: 'success' };
  return { texte: `Commencé depuis ${duree(-ecart)}`, ton: 'warning' };
}

export default function CartePointage({
  shifts, prochain, aujourdhui, maintenant, onPointer, enCours, erreur, prenom, onPointerHorsPlanning = null,
}) {
  const actif = shifts.find((s) => s.pointageDebut && !s.pointageFin);
  // Arrivée hors planning : sans horaire aujourd'hui, ou tous les services du
  // jour terminés (retour pour un extra). Jamais pendant un service ouvert ou
  // avant un service prévu (celui-là se pointe avec son propre bouton).
  const toutTermine = shifts.length > 0 && shifts.every((sh) => sh.pointageDebut && sh.pointageFin);
  const horsPlanningPossible = typeof onPointerHorsPlanning === 'function' && (!shifts.length || toutTermine);
  const attenteHorsPlanning = enCours && !shifts.some((sh) => sh.id === enCours) ? true : false;

  return (
    <Carte
      icone={Clock}
      titre="Mon service"
      sousTitre={shifts.length ? `${shifts.length > 1 ? 'Deux services' : 'Un service'} aujourd'hui` : "Pas d'horaire aujourd'hui"}
      ton={actif ? 'success' : undefined}
      style={actif ? { background: 'var(--success-bg-soft)', borderColor: 'var(--success-bd)' } : undefined}
    >
      {erreur && <div role="alert" style={s.erreur}>{erreur}</div>}

      {!shifts.length && (
        <div style={s.repos}>
          <CalendarClock size={22} strokeWidth={1.7} aria-hidden="true" style={{ color: 'var(--text3)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              {prenom ? `Bonne journée, ${prenom}.` : 'Bonne journée.'}
            </div>
            <div style={t.texte2}>
              {prochain
                ? `Prochain service ${jourRelatif(prochain.date, aujourdhui)}, de ${prochain.debut} à ${prochain.fin}.`
                : 'Aucun service prévu dans les sept prochains jours.'}
            </div>
          </div>
        </div>
      )}

      {horsPlanningPossible && (
        <div style={{ marginBottom: shifts.length ? 12 : 0 }}>
          <button
            type="button"
            onClick={onPointerHorsPlanning}
            disabled={attenteHorsPlanning}
            style={{ ...s.action, background: 'var(--tdb-go)', color: 'var(--tdb-on-go)', opacity: attenteHorsPlanning ? 0.7 : 1 }}
          >
            <LogIn size={20} strokeWidth={2} aria-hidden="true" />
            {attenteHorsPlanning ? 'Pointage…' : 'Pointer mon arrivée'}
          </button>
          <div style={{ ...t.texte2, marginTop: 6 }}>
            Hors planning : votre arrivée sera ajoutée au planning du jour, à votre nom.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {shifts.map((shift) => {
          // Horaire créé par un pointage hors planning : pas d'heure prévue.
          const horsPlanning = shift.note === 'Pointage hors planning';
          const libelle = horsPlanning ? { texte: 'Hors planning', icone: Clock } : (LIBELLES[shift.typeShift] || { texte: 'Service', icone: Clock });
          const Icone = libelle.icone;
          const termine = shift.pointageDebut && shift.pointageFin;
          const enPoste = shift.pointageDebut && !shift.pointageFin;
          const attente = enCours === shift.id;
          const debutPointe = enMinutes(shift.pointageDebut);
          const finPointee = enMinutes(shift.pointageFin);
          let travaille = 0;
          if (enPoste && debutPointe != null) travaille = (maintenant - debutPointe + 1440) % 1440;
          if (termine && debutPointe != null && finPointee != null) travaille = (finPointee - debutPointe + 1440) % 1440;
          const ponct = !shift.pointageDebut ? ponctualite(shift.debut, maintenant) : null;

          return (
            <div key={shift.id} style={{ ...s.service, ...(termine ? s.serviceTermine : null) }}>
              <div style={s.serviceTete}>
                <span style={s.serviceNom}>
                  <Icone size={15} strokeWidth={1.9} aria-hidden="true" style={{ color: 'var(--text2)' }} />
                  {libelle.texte}
                </span>
                {!horsPlanning && <span style={s.serviceHeures}>{shift.debut} à {shift.fin}</span>}
              </div>
              {shift.poste && <div style={{ ...t.texte2, marginTop: 2 }} data-no-translate>{shift.poste}</div>}

              {!shift.pointageDebut && (
                <>
                  {ponct && <div style={{ marginTop: 10 }}><Puce ton={ponct.ton}>{ponct.texte}</Puce></div>}
                  <button
                    type="button"
                    onClick={() => onPointer(shift, 'arrivee')}
                    disabled={attente}
                    style={{ ...s.action, background: 'var(--tdb-go)', color: 'var(--tdb-on-go)', opacity: attente ? 0.7 : 1 }}
                  >
                    <LogIn size={20} strokeWidth={2} aria-hidden="true" />
                    {attente ? 'Pointage…' : 'Pointer mon arrivée'}
                  </button>
                </>
              )}

              {enPoste && (
                <>
                  <div style={s.direct}>
                    <span className="tdb-live" aria-hidden="true" />
                    <span style={{ fontSize: 13, color: 'var(--success-text)', fontWeight: 600 }}>En poste depuis {shift.pointageDebut}</span>
                    <span style={s.compteur} aria-label={`Durée : ${duree(travaille)}`}>{duree(travaille)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPointer(shift, 'depart')}
                    disabled={attente}
                    style={{ ...s.action, background: 'var(--tdb-stop)', color: 'var(--tdb-on-stop)', opacity: attente ? 0.7 : 1 }}
                  >
                    <LogOut size={20} strokeWidth={2} aria-hidden="true" />
                    {attente ? 'Pointage…' : 'Pointer mon départ'}
                  </button>
                </>
              )}

              {termine && (
                <div style={{ ...s.direct, color: 'var(--text2)' }}>
                  <CircleCheck size={17} strokeWidth={1.9} aria-hidden="true" style={{ color: 'var(--success-text)' }} />
                  <span style={{ fontSize: 13 }}>Terminé : {shift.pointageDebut} à {shift.pointageFin}, {duree(travaille)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Carte>
  );
}

const s = {
  erreur: {
    fontSize: 13, padding: '8px 12px', marginBottom: 12, borderRadius: 10,
    background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)',
  },
  repos: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '4px 2px' },
  service: {
    padding: 14, borderRadius: 14, background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  serviceTermine: { background: 'var(--surface2)' },
  serviceTete: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  serviceNom: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  serviceHeures: { fontSize: 15, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  direct: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  compteur: {
    marginLeft: 'auto', fontFamily: 'var(--font-num)', fontSize: 26, lineHeight: 1, color: 'var(--text)',
    fontVariantNumeric: 'tabular-nums',
  },
  action: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', marginTop: 12,
    minHeight: 54, padding: '12px 18px', borderRadius: 14, border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 16, fontWeight: 700, letterSpacing: 0.1,
  },
};
