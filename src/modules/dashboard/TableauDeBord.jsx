// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU DE BORD (restaurants et hôtels) : ce que l'équipe doit savoir en
// arrivant, lisible en trois secondes.
//
//   En-tête du jour   bonjour, état du service, trois repères (couverts,
//                     groupes, équipe), le seul aplat de la page
//   Maintenant        Votre service aujourd'hui (pointage de l'équipier) et
//                     À faire maintenant | Qui travaille aujourd'hui
//   Aujourd'hui à l'hôtel (établissement hôtelier)
//   Le mot du consultant
//   Ce qui vous attend  aujourd'hui, demain, cette semaine
//   Les chiffres de la semaine et du mois  direction seulement
//
// Les établissements spa gardent leur tableau de bord d'origine
// (LegacyModuleHost). Chaque bloc n'apparaît que si son module est activé
// pour l'établissement ; un lien vers un module n'est proposé qu'au rôle qui
// y a accès. Une lecture en échec jamais aboutie le dit (nonLu), au lieu
// d'afficher une liste vide.
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import './tableau.css';
import { getPermissionsForRole } from '../../data/demoData.js';
import { estEtablissementHotel, isPageActiveForEtab } from '../moduleConfig.js';
import { dbService } from '../../services/dbService.js';
import { notify } from '../../components/toast/index.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useAbsences } from '../../hooks/useAbsences.js';
import { useUnreadPrivateMessages } from '../../hooks/useUnreadPrivateMessages.js';
import { useTeamPhones } from '../../hooks/useTeamPhones.js';
import { punchOnlineOrQueue } from '../../services/offline/punchSync.js';
import { zurichClock, zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
import { envoyerHorsPlanning, horaireHorsPlanning } from '../planning/pointageDuJour.js';
import { userDisplay } from '../../utils/userDisplay.js';
import { derniersParPerimetre, valeurStockConsolidee } from '../../utils/inventairePerimetres.js';
import BandeauNonActualise from '../previsions/BandeauNonActualise.jsx';
import { useDonneesTableau } from './useDonneesTableau.js';
import {
  aFaire, absencesDuJour, chiffresGestion, couvertsDu, dateLongue, decaler, equipeDu, etatDuService, groupesDu,
  prochainShift, reperesDuJour, shiftsDu,
} from './tableauLogique.js';
import { EnTete } from './EnTeteJour.jsx';
import CartePointage from './CartePointage.jsx';
import MotConsultant from './MotConsultant.jsx';
import AFaire from './AFaire.jsx';
import QuiTravaille from './QuiTravaille.jsx';
import CeQuiVousAttend from './CeQuiVousAttend.jsx';
import ChiffresGestion from './ChiffresGestion.jsx';
import CarteHotel from './CarteHotel.jsx';
import { messageErreur } from '../../utils/messageErreur.js';

// Heure de Zurich, rafraîchie toutes les 30 s (durée en poste, retards) et au
// retour sur l'app. Le jour suit : passé minuit, tout se relit sur le nouveau.
function useMaintenant() {
  const lire = () => ({ jour: zurichToday(), minutes: zurichNowMinutes() });
  const [m, setM] = React.useState(lire);
  React.useEffect(() => {
    const maj = () => setM((prec) => {
      const n = lire();
      return n.jour === prec.jour && n.minutes === prec.minutes ? prec : n;
    });
    const id = setInterval(maj, 30000);
    const surVisible = () => { if (document.visibilityState === 'visible') maj(); };
    document.addEventListener('visibilitychange', surVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', surVisible); };
  }, []);
  return m;
}

export default function TableauDeBord({ user, etablissement, setPage }) {
  const { jour: aujourdhui, minutes: maintenant } = useMaintenant();
  const mobile = useIsMobile();
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const consultant = role === 'consultant';
  const direction = consultant || role === 'patron';
  const perms = getPermissionsForRole(role);

  const actif = (page) => isPageActiveForEtab(etablissement, page);
  // La page Pointage s'ouvre avec le droit du Planning (même module).
  const permDe = (page) => (page === 'pointage' ? 'planning' : page);
  const peutOuvrir = (page) => typeof setPage === 'function' && actif(page) && perms[permDe(page)] !== false;
  const ouvrir = (page) => { if (typeof setPage === 'function') setPage(page); };

  const avecPlanning = actif('planning');
  const avecCouverts = actif('previsions');
  const avecGroupes = actif('groupes');
  const avecHaccp = actif('haccp') && perms.haccp !== false;
  const avecPertes = direction && actif('pertes');
  const avecStock = direction && actif('inventaire');
  // Branche Hôtel (lot H0) : la carte « Aujourd'hui à l'hôtel » n'existe que
  // pour un établissement de type hôtel dont le module Hébergement est activé
  // et permis au rôle. Rien d'autre ne change pour un restaurant.
  const avecHotel = estEtablissementHotel(etablissement) && actif('hebergement') && perms.hebergement !== false;

  const d = useDonneesTableau({ etablissementId: etabId, aujourdhui, avecHaccp, avecPertes, avecStock, avecCouverts, avecGroupes });
  const abs = useAbsences(avecPlanning ? etabId : null, { depuis: aujourdhui });
  const avecAbsences = avecPlanning && abs.status !== 'absent';
  const absences = avecAbsences ? abs.absences : [];
  const nbMessages = useUnreadPrivateMessages(actif('messages') ? user?.id : null);
  // Téléphones de l'équipe sous les noms (consultant et patron, même règle que le planning).
  const telephones = useTeamPhones(role);

  // ── Pointage ──
  const [enCours, setEnCours] = React.useState(null);
  const [erreurPointage, setErreurPointage] = React.useState('');
  const mesShifts = shiftsDu(d.shifts, aujourdhui).filter((s) => s.userId === user?.id);
  const monProchain = prochainShift(d.shifts, user?.id, aujourdhui);

  // Optimiste (heure de Zurich) puis confirmé par le serveur, qui pose l'heure
  // réelle. Réseau coupé : le pointage part en file hors-ligne et sera rejoué ;
  // seul un refus métier annule l'affichage. Ne JAMAIS bloquer un pointage.
  async function pointer(shift, type) {
    setErreurPointage('');
    const bridge = dbService.getBridge();
    if (!bridge?.db) { setErreurPointage('Connexion à la base indisponible.'); return; }
    const champ = type === 'arrivee' ? 'pointageDebut' : 'pointageFin';
    d.remplacerShift({ ...shift, [champ]: zurichClock() });
    setEnCours(shift.id);
    try {
      const res = await punchOnlineOrQueue({
        call: () => (type === 'arrivee' ? bridge.db.pointerArrivee(shift.id) : bridge.db.pointerDepart(shift.id)),
        shiftId: shift.id,
        type,
        userId: user?.id || null,
        etablissementId: shift.etablissementId || null,
      });
      if (res.mode === 'online') {
        const confirme = bridge.db.mapShiftFromDB(res.row);
        d.remplacerShift(confirme);
        notify(type === 'arrivee' ? `Arrivée pointée à ${confirme.pointageDebut}.` : `Départ pointé à ${confirme.pointageFin}. Bonne fin de journée !`, 'success');
      } else {
        notify('Pointage enregistré : il sera envoyé au retour du réseau.', 'warning');
      }
    } catch (err) {
      d.remplacerShift(shift);
      const refus = `Pointage refusé. ${messageErreur(err, 'pointage')}`;
      setErreurPointage(refus);
      notify(refus, 'error');
    } finally {
      setEnCours(null);
    }
  }

  // Arrivée sans horaire prévu : l'horaire du jour est créé au nom de
  // l'équipier (pointageDuJour.js, partagé avec le module Planning).
  async function pointerHorsPlanning() {
    setErreurPointage('');
    const bridge = dbService.getBridge();
    if (!bridge?.db) { setErreurPointage('Connexion à la base indisponible.'); return; }
    const provisoire = horaireHorsPlanning({ etablissementId: etabId, userId: user?.id, date: aujourdhui });
    d.remplacerShift(provisoire);
    setEnCours(provisoire.id);
    try {
      const res = await envoyerHorsPlanning(bridge, provisoire);
      if (res.mode === 'online') {
        const confirme = bridge.db.mapShiftFromDB(res.row);
        d.remplacerShift(confirme);
        notify(`Arrivée pointée à ${confirme.pointageDebut}. Elle est ajoutée au planning.`, 'success');
      } else {
        notify('Pointage enregistré : il sera envoyé au retour du réseau.', 'warning');
      }
    } catch (err) {
      d.retirerShift(provisoire.id);
      const refus = `Pointage refusé. ${messageErreur(err, 'pointage')}`;
      setErreurPointage(refus);
      notify(refus, 'error');
    } finally {
      setEnCours(null);
    }
  }

  // ── Message du consultant ──
  async function publierMessage(texte) {
    const bridge = dbService.getBridge();
    try {
      await bridge.db.setConsultantMessage(etabId, texte, user.id);
      d.maj('message', { message: texte, updatedBy: user.id, updatedAt: new Date().toISOString() });
      notify(texte ? 'Message publié pour toute l\'équipe.' : 'Message retiré.', 'success');
      return true;
    } catch (err) {
      notify(`Le message n'a pas pu être publié. ${messageErreur(err, 'tableau de bord')}`, 'error');
      return false;
    }
  }

  // ── Dérivés ──
  // Source en échec qui n'a jamais été lue : rien à montrer, l'écran le dit.
  // Les horaires de réservation en ligne ne servent qu'au compte à rebours de
  // l'en-tête : leur échec ne fait pas apparaître le bandeau.
  const nonLu = (source) => d.statuts[source] === 'error' && !d.lus[source];
  const nomDe = (id) => userDisplay(id).prenom || userDisplay(id).name;
  const couvertsJour = couvertsDu(d.couverts, aujourdhui);
  const groupesJour = avecGroupes ? groupesDu(d.groupes, aujourdhui) : [];
  const absentsJour = absencesDuJour(absences, aujourdhui);
  // Absences en échec sans liste : rien n'est dit des absences.
  const absencesLues = avecAbsences && !(abs.status === 'error' && !(abs.absences || []).length);
  const avecCouvertsLus = avecCouverts && d.statuts.couverts !== 'absent';
  const avecGroupesLus = avecGroupes && d.statuts.groupes !== 'absent';
  const service = avecCouvertsLus && !nonLu('couverts')
    ? etatDuService({
      couverts: couvertsJour, couvertsDemain: couvertsDu(d.couverts, decaler(aujourdhui, 1)), parametres: d.parametres, aujourdhui, maintenant,
    })
    : null;
  const reperes = reperesDuJour({
    couverts: couvertsJour, groupes: groupesJour, equipe: equipeDu(d.shifts, aujourdhui), absents: absentsJour, absencesLues,
    avecCouverts: avecCouvertsLus, avecGroupes: avecGroupesLus, avecPlanning, nonLu,
  });
  const items = aFaire({
    aujourdhui, maintenant, haccp: d.haccp, groupes: d.groupes, shifts: d.shifts, absences,
    nbMessages, pertes: d.pertes, avecHaccp, avecGroupes, avecPlanning, direction, nomDe,
  });
  const chiffres = chiffresGestion({ pertes: d.pertes, shifts: d.shifts, couverts: d.couverts, aujourdhui });
  const derniers = derniersParPerimetre(d.inventaires || []);
  const plusAncien = derniers.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))[0];
  // Stock à zéro ou dernier comptage de plus de 30 jours : la valeur ne dit
  // plus rien du stock réel, la tuile l'écrit au lieu d'afficher « CHF 0 ».
  const valeurStock = valeurStockConsolidee(d.inventaires || []);
  const plusRecent = derniers.reduce((max, inv) => (String(inv.date || '') > max ? String(inv.date) : max), '');
  const ageStock = plusRecent ? (Date.parse(`${aujourdhui}T12:00:00`) - Date.parse(`${plusRecent}T12:00:00`)) / 86400000 : Infinity;
  const stock = {
    valeur: valeurStock,
    recent: valeurStock > 0 && ageStock <= 30,
    detail: !plusAncien ? 'Aucun inventaire'
      : derniers.length > 1 ? `${derniers.length} zones, la plus ancienne au ${new Date(`${plusAncien.date}T12:00:00`).toLocaleDateString('fr-CH')}`
        : `Au ${new Date(`${plusAncien.date}T12:00:00`).toLocaleDateString('fr-CH')}`,
  };
  const enEchec = Object.entries(d.statuts).some(([source, statut]) => statut === 'error' && source !== 'parametres');

  // « Votre service » : le pointage individuel de l'équipe, toujours là quand
  // le planning est activé, horaire prévu ou non (arrivée hors planning). Pas
  // pour la direction (consultant, patron), qui ne pointe pas.
  const montrerPointage = avecPlanning && !direction;
  const salutation = maintenant >= 18 * 60 ? 'Bonsoir' : 'Bonjour';

  // L'équipe du jour : section à part sur tablette et ordinateur, en tête de
  // l'onglet Aujourd'hui de « Ce qui vous attend » sur téléphone.
  const quiTravaille = (dansOnglet) => (avecPlanning ? (
    <QuiTravaille
      dansOnglet={dansOnglet}
      aujourdhui={aujourdhui}
      maintenant={maintenant}
      shifts={d.shifts}
      absences={absences}
      telephones={telephones}
      avecAbsences={absencesLues}
      echec={nonLu('shifts')}
      peutOuvrir={peutOuvrir}
      ouvrir={ouvrir}
    />
  ) : null);
  const equipeAPart = avecPlanning && !mobile;

  return (
    <div className="tdb" style={s.page}>
      <EnTete
        date={dateLongue(aujourdhui)}
        salutation={salutation}
        prenom={user?.prenom}
        pret={d.pret}
        service={service}
        reperes={reperes}
        peutOuvrir={peutOuvrir}
        ouvrir={ouvrir}
        onAssistant={consultant && peutOuvrir('faq') ? () => ouvrir('faq') : null}
      />

      {enEchec && <BandeauNonActualise onRetry={d.recharger} />}

      {!d.pret ? (
        <p style={s.chargement} aria-live="polite">Chargement du tableau de bord…</p>
      ) : (
        <>
          <div className={equipeAPart ? 'tdb-haut' : 'tdb-haut tdb-haut--seul'}>
            <div className="tdb-pile">
              {montrerPointage && (
                <CartePointage
                  shifts={mesShifts}
                  prochain={monProchain}
                  aujourdhui={aujourdhui}
                  maintenant={maintenant}
                  onPointer={pointer}
                  enCours={enCours}
                  erreur={erreurPointage}
                  prenom={user?.prenom}
                  onPointerHorsPlanning={pointerHorsPlanning}
                  onVoirPlanning={peutOuvrir('planning') ? () => ouvrir('planning') : null}
                />
              )}
              <AFaire items={items} peutOuvrir={peutOuvrir} ouvrir={ouvrir} />
            </div>
            {equipeAPart && quiTravaille(false)}
          </div>

          {avecHotel && <CarteHotel etabId={etabId} aujourdhui={aujourdhui} peutOuvrir={peutOuvrir} ouvrir={ouvrir} />}

          <MotConsultant message={d.message} consultant={consultant} onPublier={publierMessage} />

          <CeQuiVousAttend
            mobile={mobile}
            enTeteAujourdhui={mobile ? quiTravaille(true) : null}
            aujourdhui={aujourdhui}
            shifts={d.shifts}
            couverts={d.couverts}
            groupes={avecGroupes ? d.groupes : []}
            absences={absences}
            avecCouverts={avecCouvertsLus}
            avecGroupes={avecGroupesLus}
            avecPlanning={avecPlanning}
            avecAbsences={absencesLues}
            nonLu={nonLu}
            peutOuvrir={peutOuvrir}
            ouvrir={ouvrir}
          />

          {direction && (
            <ChiffresGestion
              chiffres={chiffres}
              stock={stock}
              avecPertes={avecPertes}
              avecStock={avecStock}
              avecCouverts={avecCouvertsLus}
              avecPlanning={avecPlanning}
              nonLu={nonLu}
              peutOuvrir={peutOuvrir}
              ouvrir={ouvrir}
            />
          )}
        </>
      )}
    </div>
  );
}

const s = {
  // Espacement des sections : tableau.css (24 px, 32 px dès 600 px).
  page: { display: 'flex', flexDirection: 'column', maxWidth: 1400, margin: '0 auto', width: '100%', minWidth: 0 },
  chargement: { margin: 0, fontSize: 15, color: 'var(--text2)' },
};
