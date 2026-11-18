import React from 'react';
import Interrupteur from '../roles/Interrupteur.jsx';
import { notify } from '../../components/toast/index.js';
import { useReglagesMaison } from '../../hooks/useReglagesMaison.js';
import { EtatMaison } from '../compte/sections/reglagesMaisonUi.jsx';
import { ChoixPilules, Ligne, ui } from '../compte/sections/reglagesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Deux réglages du Planning (18.11.2026), table reglages_maison :
//   Temps de travail : les contrôles signalés sur les horaires prévus de la
//     grille (tempsTravail.js), jamais bloquants.
//   Pointage : comment les heures pointées se comptent (pointageRegles.js),
//     le pointage brut n'étant jamais réécrit ; et la clôture d'office d'un
//     départ oublié, faite par la base (clore_pointages_oublies, passage
//     horaire de alerts-evaluator).
// Écriture : consultant et patron (RLS de reglages_maison).
// ─────────────────────────────────────────────────────────────────────────────

const sansValeur = 'aucun';
const choix = (valeurs, suffixe) => valeurs.map((v) => (v === sansValeur ? { id: v, label: 'Aucun' } : { id: String(v), label: `${v} ${suffixe}` }));

function useBloc(etablissement, bloc) {
  const maison = useReglagesMaison(etablissement?.id || null);
  const enregistrer = async (valeur) => {
    const { error } = await maison.enregistrer(bloc, valeur);
    if (error) notify(error, 'error');
  };
  return { maison, valeur: maison[bloc], enregistrer };
}

export function SectionTempsTravail({ etablissement }) {
  const { maison, valeur: t, enregistrer } = useBloc(etablissement, 'tempsTravail');
  if (!etablissement?.id) return null;
  if (maison.status !== 'ready') return <EtatMaison status={maison.status} />;
  const regler = (champ, v) => enregistrer({ ...t, [champ]: v });
  const nombreOuRien = (v) => (v === sansValeur ? null : Number(v));
  return (
    <div style={ui.liste} data-reglages-maison="temps_travail">
      <Ligne titre="Contrôler le temps de travail" aide="Le planning signale, sur l'horaire concerné, ce qui sort des règles ci-dessous. Il ne bloque rien. Seules les personnes qui écrivent le planning le voient.">
        <Interrupteur checked={t.actif} label="Contrôler le temps de travail" onChange={() => regler('actif', !t.actif)} />
      </Ligne>
      {t.actif && (
        <>
          <Ligne colonne titre="Repos entre deux journées" aide="La loi sur le travail demande 11 heures de suite ; elles peuvent descendre à 8 heures une fois par semaine.">
            <ChoixPilules label="Repos entre deux journées" valeur={String(t.reposMinH)} options={choix([8, 9, 10, 11, 12], 'h')} onChange={(v) => regler('reposMinH', Number(v))} />
          </Ligne>
          <Ligne titre="Pauses de la loi" aide="15 minutes au-delà de 5 h 30 de travail, 30 minutes au-delà de 7 h, 1 heure au-delà de 9 h. La coupure d'un service coupé compte comme pause.">
            <Interrupteur checked={t.pausesLoi} label="Pauses de la loi" onChange={() => regler('pausesLoi', !t.pausesLoi)} />
          </Ligne>
          <Ligne colonne titre="Journée la plus longue" aide="Heures travaillées dans le jour, pauses déduites.">
            <ChoixPilules label="Journée la plus longue" valeur={t.journeeMaxH == null ? sansValeur : String(t.journeeMaxH)} options={choix([sansValeur, 10, 11, 12], 'h')} onChange={(v) => regler('journeeMaxH', nombreOuRien(v))} />
          </Ligne>
          <Ligne colonne titre="Semaine la plus longue" aide="Du lundi au dimanche. La loi fixe 50 heures dans l'hôtellerie et la restauration.">
            <ChoixPilules label="Semaine la plus longue" valeur={t.semaineMaxH == null ? sansValeur : String(t.semaineMaxH)} options={choix([sansValeur, 45, 48, 50], 'h')} onChange={(v) => regler('semaineMaxH', nombreOuRien(v))} />
          </Ligne>
          <Ligne colonne derniere titre="Jours de repos par semaine" aide="Jours sans aucun horaire, comptés sur les semaines entières affichées.">
            <ChoixPilules
              label="Jours de repos par semaine"
              valeur={t.joursReposSemaine ? String(t.joursReposSemaine) : sansValeur}
              options={[{ id: sansValeur, label: 'Aucun contrôle' }, { id: '1', label: '1 jour' }, { id: '2', label: '2 jours' }]}
              onChange={(v) => regler('joursReposSemaine', v === sansValeur ? 0 : Number(v))}
            />
          </Ligne>
        </>
      )}
    </div>
  );
}

export function SectionPointage({ etablissement }) {
  const { maison, valeur: p, enregistrer } = useBloc(etablissement, 'pointage');
  if (!etablissement?.id) return null;
  if (maison.status !== 'ready') return <EtatMaison status={maison.status} />;
  return (
    <div style={ui.liste} data-reglages-maison="pointage">
      <p style={st.intro}>Ces règles changent les heures comptées : soldes, relevé CCNT, exports des salaires, Comptabilité et Statistiques. Le pointage lui-même reste affiché et gardé tel quel.</p>
      <Ligne colonne titre="Arrivée en avance" aide="Quand quelqu'un pointe avant l'heure prévue. Un retard compte toujours dès le pointage.">
        <ChoixPilules
          label="Arrivée en avance"
          valeur={p.avance}
          options={[{ id: 'pointee', label: 'Comptée dès le pointage' }, { id: 'prevue', label: "Comptée dès l'heure prévue" }]}
          onChange={(v) => enregistrer({ ...p, avance: v })}
        />
      </Ligne>
      <Ligne colonne titre="Arrondi" aide="Arrivée et départ arrondis au plus proche, vers le haut comme vers le bas : juste pour chacun sur le mois.">
        <ChoixPilules
          label="Arrondi"
          valeur={String(p.arrondiMin)}
          options={[{ id: '0', label: 'À la minute' }, { id: '5', label: '5 minutes' }, { id: '15', label: '15 minutes' }]}
          onChange={(v) => enregistrer({ ...p, arrondiMin: Number(v) })}
        />
      </Ligne>
      <Ligne colonne derniere titre="Clore un pointage oublié après" aide="Si le départ n'est pas pointé, l'horaire est clos à l'heure de fin prévue, une fois ce délai passé depuis l'arrivée. Le contrôle passe toutes les heures. Le planning affiche l'horaire comme clos d'office. Un départ pointé ensuite, ou une correction, remplace cette heure.">
        <ChoixPilules
          label="Clore un pointage oublié après"
          valeur={p.clotureAutoH == null ? 'jamais' : String(p.clotureAutoH)}
          options={[{ id: 'jamais', label: 'Jamais' }, ...[8, 10, 12, 14, 16].map((h) => ({ id: String(h), label: `${h} h` }))]}
          onChange={(v) => enregistrer({ ...p, clotureAutoH: v === 'jamais' ? null : Number(v) })}
        />
      </Ligne>
    </div>
  );
}

const st = {
  intro: { margin: '0 0 4px', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
};
