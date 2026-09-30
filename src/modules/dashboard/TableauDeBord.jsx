// ═══════════════════════════════════════════════════════════════════════════
// TABLEAU DE BORD (restaurants) : ce que l'équipe doit savoir en arrivant.
//
//   En tête      bonjour + la journée en une phrase (couverts, groupes, absents)
//   Mon service  pointage de l'équipier connecté
//   À faire      ce qui attend quelqu'un maintenant
//   Le mot du consultant
//   À savoir     aujourd'hui, demain, cette semaine (couverts, groupes,
//                équipe, absences)
//   Chiffres de gestion  direction seulement
//
// Les établissements spa gardent leur tableau de bord d'origine
// (LegacyModuleHost). Chaque bloc n'apparaît que si son module est activé
// pour l'établissement ; un lien vers un module n'est proposé qu'au rôle qui
// y a accès.
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import { Sparkles } from 'lucide-react';
import './tableau.css';
import { getPermissionsForRole } from '../../data/demoData.js';
import { isPageActiveForEtab } from '../moduleConfig.js';
import { dbService } from '../../services/dbService.js';
import { notify } from '../../components/toast/index.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useAbsences } from '../../hooks/useAbsences.js';
import { useUnreadPrivateMessages } from '../../hooks/useUnreadPrivateMessages.js';
import { useTeamPhones } from '../../hooks/useTeamPhones.js';
import { punchOnlineOrQueue } from '../../services/offline/punchSync.js';
import { generateUuid } from '../../services/offline/offlineNet.js';
import { zurichClock, zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
import { userDisplay } from '../../utils/userDisplay.js';
import { derniersParPerimetre, valeurStockConsolidee } from '../../utils/inventairePerimetres.js';
import BandeauNonActualise from '../previsions/BandeauNonActualise.jsx';
import { useDonneesTableau } from './useDonneesTableau.js';
import {
  aFaire, absencesDuJour, chiffresGestion, couvertsDu, dateLongue, equipeDu, groupesDu, prochainShift, resumeDuJour, shiftsDu,
} from './tableauLogique.js';
import { t } from './tableauUi.jsx';
import CartePointage from './CartePointage.jsx';
import MotConsultant from './MotConsultant.jsx';
import AFaire from './AFaire.jsx';
import ASavoir from './ASavoir.jsx';
import ChiffresGestion from './ChiffresGestion.jsx';

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
  const peutOuvrir = (page) => typeof setPage === 'function' && actif(page) && perms[page] !== false;
  const ouvrir = (page) => { if (typeof setPage === 'function') setPage(page); };

  const avecPlanning = actif('planning');
  const avecCouverts = actif('previsions');
  const avecGroupes = actif('groupes');
  const avecHaccp = actif('haccp') && perms.haccp !== false;
  const avecPertes = direction && actif('pertes');
  const avecStock = direction && actif('inventaire');

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
      setErreurPointage(`Pointage refusé : ${err.message}`);
      notify(`Pointage refusé : ${err.message}`, 'error');
    } finally {
      setEnCours(null);
    }
  }

  // Arrivée sans horaire prévu : l'horaire du jour est créé au nom de
  // l'équipier (RPC pointer_hors_planning), identifiant généré ici pour que la
  // file hors-ligne et un double tap retombent sur le même horaire.
  async function pointerHorsPlanning() {
    setErreurPointage('');
    const bridge = dbService.getBridge();
    if (!bridge?.db) { setErreurPointage('Connexion à la base indisponible.'); return; }
    const heure = zurichClock();
    const provisoire = {
      id: generateUuid(), etablissementId: etabId, userId: user?.id, date: aujourdhui,
      debut: heure, fin: heure, pointageDebut: heure, pointageFin: null, typeShift: 'simple', note: 'Pointage hors planning',
    };
    d.remplacerShift(provisoire);
    setEnCours(provisoire.id);
    try {
      const res = await punchOnlineOrQueue({
        call: () => bridge.db.pointerHorsPlanning(provisoire.id, etabId),
        shiftId: provisoire.id,
        type: 'arrivee',
        userId: user?.id || null,
        etablissementId: etabId,
        horsPlanning: true,
      });
      if (res.mode === 'online') {
        const confirme = bridge.db.mapShiftFromDB(res.row);
        d.remplacerShift(confirme);
        notify(`Arrivée pointée à ${confirme.pointageDebut}. Elle est ajoutée au planning.`, 'success');
      } else {
        notify('Pointage enregistré : il sera envoyé au retour du réseau.', 'warning');
      }
    } catch (err) {
      d.retirerShift(provisoire.id);
      setErreurPointage(`Pointage refusé : ${err.message}`);
      notify(`Pointage refusé : ${err.message}`, 'error');
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
      notify(`Le message n'a pas pu être publié : ${err.message}`, 'error');
      return false;
    }
  }

  // ── Dérivés ──
  const nomDe = (id) => userDisplay(id).prenom || userDisplay(id).name;
  const couvertsJour = couvertsDu(d.couverts, aujourdhui);
  const groupesJour = avecGroupes ? groupesDu(d.groupes, aujourdhui) : [];
  const absentsJour = absencesDuJour(absences, aujourdhui);
  const resume = resumeDuJour({ couverts: couvertsJour, groupes: groupesJour, absents: absentsJour, avecCouverts, nomDe });
  const items = aFaire({
    aujourdhui, maintenant, haccp: d.haccp, groupes: d.groupes, shifts: d.shifts, absences,
    nbMessages, pertes: d.pertes, avecHaccp, avecGroupes, avecPlanning, direction, nomDe,
  });
  const equipeDe = (date) => equipeDu(d.shifts, date);
  const chiffres = chiffresGestion({ pertes: d.pertes, shifts: d.shifts, couverts: d.couverts, aujourdhui });
  const derniers = derniersParPerimetre(d.inventaires || []);
  const plusAncien = derniers.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))[0];
  const stock = {
    valeur: valeurStockConsolidee(d.inventaires || []),
    detail: !plusAncien ? 'Aucun inventaire'
      : derniers.length > 1 ? `${derniers.length} zones, la plus ancienne au ${new Date(`${plusAncien.date}T12:00:00`).toLocaleDateString('fr-CH')}`
        : `Au ${new Date(`${plusAncien.date}T12:00:00`).toLocaleDateString('fr-CH')}`,
  };
  const enEchec = Object.values(d.statuts).includes('error');

  // « Mon service » : le pointage individuel de l'équipe, toujours là quand le
  // planning est activé, horaire prévu ou non (arrivée hors planning). Pas
  // pour la direction (consultant, patron), qui ne pointe pas.
  const montrerPointage = avecPlanning && !direction;
  const salutation = maintenant >= 18 * 60 ? 'Bonsoir' : 'Bonjour';

  return (
    <div className="tdb" style={t.page}>
      {/* ── En tête ── */}
      <header style={s.entete}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={s.date}>{dateLongue(aujourdhui)}</div>
          <h1 style={s.bonjour}>{salutation}{user?.prenom ? `, ${user.prenom}` : ''}</h1>
          {resume && <p style={s.resume}>{resume}</p>}
        </div>
        {consultant && peutOuvrir('faq') && (
          <button type="button" onClick={() => ouvrir('faq')} style={s.assistant}>
            <Sparkles size={16} strokeWidth={1.9} aria-hidden="true" /> Assistant
          </button>
        )}
      </header>

      {enEchec && <BandeauNonActualise onRetry={d.recharger} />}

      {!d.pret ? (
        <div style={{ ...t.carte, color: 'var(--text2)', fontSize: 14 }} aria-live="polite">Chargement du tableau de bord…</div>
      ) : (
        <>
          <div className="tdb-haut" style={!montrerPointage ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
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
              />
            )}
            <AFaire items={items} peutOuvrir={peutOuvrir} ouvrir={ouvrir} />
          </div>

          <MotConsultant message={d.message} consultant={consultant} onPublier={publierMessage} />

          <ASavoir
            mobile={mobile}
            aujourdhui={aujourdhui}
            maintenant={maintenant}
            shifts={d.shifts}
            couverts={d.couverts}
            groupes={avecGroupes ? d.groupes : []}
            absences={absences}
            equipeDe={equipeDe}
            telephones={telephones}
            avecCouverts={avecCouverts && d.statuts.couverts !== 'absent'}
            avecGroupes={avecGroupes && d.statuts.groupes !== 'absent'}
            avecPlanning={avecPlanning}
            avecAbsences={avecAbsences}
            peutOuvrir={peutOuvrir}
            ouvrir={ouvrir}
          />

          {direction && (
            <ChiffresGestion
              chiffres={chiffres}
              stock={stock}
              avecPertes={avecPertes}
              avecStock={avecStock}
              avecCouverts={avecCouverts}
              avecPlanning={avecPlanning}
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
  entete: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', padding: '4px 2px 2px' },
  date: { fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.8 },
  bonjour: { margin: '4px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 32, lineHeight: 1.15, color: 'var(--text)', letterSpacing: '-0.01em' },
  resume: { margin: '8px 0 0', fontSize: 15.5, lineHeight: 1.55, color: 'var(--text2)', maxWidth: 760 },
  assistant: {
    display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '10px 18px', borderRadius: 999, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, background: 'var(--surface)', color: 'var(--accent)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent-bd)', boxShadow: 'var(--sh-xs)',
  },
};
