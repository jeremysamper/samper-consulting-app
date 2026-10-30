import React from 'react';
import { CalendarClock, CircleCheck, Clock, LogIn, LogOut } from 'lucide-react';
import { enMinutes, jourRelatif, minutesEcoulees } from './tableauLogique.js';
import { Duree, LienModule, Section } from './tableauBriques.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Votre service aujourd'hui » : le pointage de l'équipier connecté.
//
// Un seul geste à la fois, en grand : le service en cours (le premier qui
// n'est pas terminé) porte le gros bouton, pointer l'arrivée puis le départ.
// Les services suivants passent sur une ligne « Ensuite : Service du soir »
// avec un bouton secondaire, même geste. En poste, la durée tourne en direct.
// Sans horaire aujourd'hui, la carte dit quand est le prochain service.
//
// Le pointage lui-même (optimiste, RPC serveur, file hors-ligne) est géré par
// le parent : cette carte ne fait qu'afficher et appeler onPointer. Les
// conditions d'affichage des boutons sont celles d'avant, horaire par horaire.
// ─────────────────────────────────────────────────────────────────────────────

const LIBELLES = {
  midi: { texte: 'Service du midi' },
  soir: { texte: 'Service du soir' },
};

// Ponctualité d'un horaire pas encore pointé : texte, valeur, couleur.
function ponctualite(debut, maintenant) {
  const d = enMinutes(debut);
  if (d == null) return null;
  const ecart = d - maintenant;
  if (ecart > 60) return { texte: 'Commence à', heure: debut, couleur: 'var(--text2)' };
  if (ecart > 0) return { texte: 'Commence dans', minutes: ecart, couleur: 'var(--info-text)' };
  if (ecart >= -15) return { texte: "C'est l'heure", couleur: 'var(--text)' };
  return { texte: 'Commencé depuis', minutes: -ecart, couleur: 'var(--warning-text)' };
}

export default function CartePointage({
  shifts, prochain, aujourdhui, maintenant, onPointer, enCours, erreur, onPointerHorsPlanning = null, onVoirPlanning = null,
}) {
  // Arrivée hors planning : sans horaire aujourd'hui, ou tous les services du
  // jour terminés (retour pour un extra). Jamais pendant un service ouvert ou
  // avant un service prévu (celui-là se pointe avec son propre bouton).
  const toutTermine = shifts.length > 0 && shifts.every((sh) => sh.pointageDebut && sh.pointageFin);
  const horsPlanningPossible = typeof onPointerHorsPlanning === 'function' && (!shifts.length || toutTermine);
  const attenteHorsPlanning = enCours && !shifts.some((sh) => sh.id === enCours) ? true : false;
  // Le service en cours : le premier qui n'est pas terminé.
  const courant = shifts.find((sh) => !(sh.pointageDebut && sh.pointageFin)) || null;

  return (
    <Section
      id="tdb-service"
      titre="Votre service aujourd'hui"
      sousTitre={shifts.length ? (shifts.length > 1 ? 'Deux services aujourd\'hui' : 'Un service aujourd\'hui') : 'Pas d\'horaire aujourd\'hui'}
      action={<LienModule onClick={onVoirPlanning}>Voir mon planning</LienModule>}
    >
      {erreur && <div role="alert" style={s.erreur}>{erreur}</div>}

      {!shifts.length && (
        <p style={s.repos}>
          <CalendarClock size={20} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ minWidth: 0 }}>
            {prochain ? (
              <>
                <span>Prochain service :</span>{' '}
                <span>{jourRelatif(prochain.date, aujourdhui)}</span>{' '}
                <span data-no-translate>{prochain.debut} à {prochain.fin}</span>
              </>
            ) : <span>Aucun service prévu dans les sept prochains jours.</span>}
          </span>
        </p>
      )}

      {horsPlanningPossible && (
        <div style={{ marginTop: shifts.length ? 4 : 12 }}>
          <button
            type="button"
            onClick={onPointerHorsPlanning}
            disabled={attenteHorsPlanning}
            style={{ ...s.action, ...s.arrivee, opacity: attenteHorsPlanning ? 0.7 : 1 }}
          >
            <LogIn size={20} strokeWidth={1.9} aria-hidden="true" />
            <span>{attenteHorsPlanning ? 'Pointage…' : 'Pointer mon arrivée'}</span>
          </button>
          <p style={s.aide}>Hors planning : votre arrivée sera ajoutée au planning du jour, à votre nom.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {shifts.map((shift) => {
          // Horaire créé par un pointage hors planning : pas d'heure prévue.
          const horsPlanning = shift.note === 'Pointage hors planning';
          const libelle = horsPlanning ? { texte: 'Hors planning' } : (LIBELLES[shift.typeShift] || { texte: 'Service' });
          const termine = shift.pointageDebut && shift.pointageFin;
          const enPoste = shift.pointageDebut && !shift.pointageFin;
          const attente = enCours === shift.id;
          const debutPointe = enMinutes(shift.pointageDebut);
          const finPointee = enMinutes(shift.pointageFin);
          let travaille = 0;
          if (enPoste && debutPointe != null) travaille = minutesEcoulees(debutPointe, maintenant);
          if (termine && debutPointe != null && finPointee != null) travaille = minutesEcoulees(debutPointe, finPointee);

          // Service terminé : une ligne grise.
          if (termine) {
            return (
              <p key={shift.id} style={s.termine}>
                <CircleCheck size={18} strokeWidth={1.9} aria-hidden="true" style={{ color: 'var(--success-strong)', flexShrink: 0 }} />
                <span>
                  <span>Terminé :</span>{' '}
                  <span data-no-translate>{shift.pointageDebut} à {shift.pointageFin}</span>,{' '}
                  <Duree minutes={travaille} />
                </span>
              </p>
            );
          }

          const boutonArrivee = (principal) => (
            <button
              type="button"
              onClick={() => onPointer(shift, 'arrivee')}
              disabled={attente}
              style={{ ...s.action, ...(principal ? s.arrivee : s.secondaire), opacity: attente ? 0.7 : 1 }}
            >
              <LogIn size={principal ? 20 : 18} strokeWidth={1.9} aria-hidden="true" />
              <span>{attente ? 'Pointage…' : 'Pointer mon arrivée'}</span>
            </button>
          );

          // Un service qui suit le service en cours, pas encore commencé :
          // « Ensuite : Service du soir, 18:00 à 22:30 » et le bouton secondaire.
          if (shift !== courant && !enPoste) {
            return (
              <div key={shift.id} style={s.suivant}>
                <p style={s.ensuite}>
                  <span>Ensuite :</span>{' '}
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{libelle.texte}</span>
                  {!horsPlanning && <>, <span data-no-translate>{shift.debut} à {shift.fin}</span></>}
                </p>
                {boutonArrivee(false)}
              </div>
            );
          }

          const ponct = !shift.pointageDebut ? ponctualite(shift.debut, maintenant) : null;
          return (
            <div key={shift.id} style={s.service}>
              <div style={s.serviceTete}>
                <span style={s.serviceNom}>{libelle.texte}</span>
                {!horsPlanning && <span style={s.serviceHeures} data-no-translate>{shift.debut} à {shift.fin}</span>}
              </div>
              {shift.poste && <div style={s.poste} data-no-translate>{shift.poste}</div>}

              {!shift.pointageDebut && (
                <>
                  {ponct && (
                    <p style={{ ...s.ponct, color: ponct.couleur }}>
                      <Clock size={16} strokeWidth={1.9} aria-hidden="true" style={{ flexShrink: 0 }} />
                      <span>
                        <span>{ponct.texte}</span>
                        {ponct.heure && <>{' '}<span data-no-translate>{ponct.heure}</span></>}
                        {ponct.minutes != null && <>{' '}<Duree minutes={ponct.minutes} /></>}
                      </span>
                    </p>
                  )}
                  {boutonArrivee(true)}
                </>
              )}

              {enPoste && (
                <>
                  <div style={s.direct}>
                    <span className="tdb-live" aria-hidden="true" />
                    <span style={{ fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>
                      <span>En poste depuis</span>{' '}<span data-no-translate>{shift.pointageDebut}</span>
                    </span>
                    <Duree minutes={travaille} style={s.compteur} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onPointer(shift, 'depart')}
                    disabled={attente}
                    style={{ ...s.action, ...s.depart, opacity: attente ? 0.7 : 1 }}
                  >
                    <LogOut size={20} strokeWidth={1.9} aria-hidden="true" />
                    <span>{attente ? 'Pointage…' : 'Pointer mon départ'}</span>
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const s = {
  erreur: {
    fontSize: 14, padding: '8px 0 8px 12px', marginBottom: 12, color: 'var(--danger-text)',
    borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: 'var(--danger-bd)',
  },
  repos: { display: 'flex', alignItems: 'flex-start', gap: 10, margin: 0, padding: '4px 0', fontSize: 15, lineHeight: 1.5, color: 'var(--text)' },
  aide: { margin: '8px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--text2)' },
  service: { minWidth: 0 },
  serviceTete: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '2px 12px', flexWrap: 'wrap' },
  serviceNom: { fontSize: 17, fontWeight: 600, lineHeight: 1.3, color: 'var(--text)' },
  serviceHeures: { fontFamily: 'var(--font-num)', fontSize: 17, lineHeight: 1.3, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  poste: { marginTop: 2, fontSize: 13, lineHeight: 1.4, color: 'var(--text2)' },
  ponct: { display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 0', fontSize: 14, fontWeight: 600, lineHeight: 1.4 },
  direct: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  compteur: {
    marginLeft: 'auto', fontFamily: 'var(--font-num)', fontSize: 30, lineHeight: 1, color: 'var(--text)',
    fontVariantNumeric: 'tabular-nums',
  },
  termine: { display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 14, lineHeight: 1.45, color: 'var(--text2)' },
  suivant: { minWidth: 0, paddingTop: 12, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)' },
  ensuite: { margin: 0, fontSize: 15, lineHeight: 1.45, color: 'var(--text2)' },
  action: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', marginTop: 10, boxSizing: 'border-box',
    padding: '0 18px', borderRadius: 'var(--r)', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 16, fontWeight: 700, letterSpacing: 0.1,
  },
  // Arrivée en vert plein, départ en pétrole plein : jetons partagés, texte
  // lisible dans les deux thèmes (--on-success, --on-accent).
  arrivee: { minHeight: 56, background: 'var(--success-fill)', color: 'var(--on-success)' },
  depart: { minHeight: 56, background: 'var(--accent)', color: 'var(--on-accent)' },
  secondaire: { minHeight: 48, marginTop: 10, fontSize: 15, fontWeight: 600, background: 'var(--accent-light)', color: 'var(--accent)' },
};
