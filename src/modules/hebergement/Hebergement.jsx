import React from 'react';
import { BedDouble, DoorOpen, LogIn, LogOut, Plus, Users } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { zurichToday } from '../../utils/zurichTime.js';
import {
  aVenir, arriveesDu, couvertsPetitDejeuner, departsDu, enMaison, trierChambres,
  useChambres, useDemandes, useHotes, useResaClients, useSejours, useSpaClients,
} from './hotelData.js';
import { LigneSejour, Liste, Vide, h } from './hotelUi.jsx';
import SejourForm from './SejourForm.jsx';
import SejourFiche from './SejourFiche.jsx';
import ChambresGestion from './ChambresGestion.jsx';
import HotesGestion, { HoteForm } from './HotesGestion.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Hébergement (branche Hôtel, lot H0) : l'accueil à tuiles du socle des
// parcours, un écran par tâche. Arrivées, départs et en maison sont les listes
// du jour (date de Zurich) ; « Nouveau séjour » ouvre la fenêtre de saisie ;
// « Chambres » (consultant et patron) tient la liste des chambres.
//
// Droits : toute l'équipe qui a le module lit ; les gestes (créer, modifier,
// affecter, check-in, check-out, annuler) demandent la case « Modifier »
// d'Hébergement, que la base vérifie de même (user_peut_gerer).
// ─────────────────────────────────────────────────────────────────────────────

const TITRES = {
  arrivees: 'Les arrivées du jour',
  departs: 'Les départs du jour',
  en_maison: 'En maison',
  chambres: 'Les chambres',
  hotes: 'Les hôtes',
};

// Date de Zurich, relue chaque minute : un écran ouvert à minuit change de jour.
function useAujourdhui() {
  const [jour, setJour] = React.useState(() => zurichToday());
  React.useEffect(() => {
    const id = setInterval(() => setJour(zurichToday()), 60000);
    return () => clearInterval(id);
  }, []);
  return jour;
}

export default function Hebergement({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const peutGerer = canManageModule(role, 'hebergement');
  const direction = role === 'consultant' || role === 'patron';
  const aujourdhui = useAujourdhui();

  const chambres = useChambres(etabId);
  const sejours = useSejours(etabId);
  // Lot H3 : le fichier des hôtes et les fichiers voisins (restaurant, spa) ;
  // lot H2 : les demandes, pour l'historique d'un hôte.
  const hotes = useHotes(etabId);
  const resaClients = useResaClients(etabId);
  const spaClients = useSpaClients(etabId);
  const demandes = useDemandes(etabId);
  const peutSupprimerHote = role === 'consultant';

  const ecransRepris = direction ? ['arrivees', 'departs', 'en_maison', 'chambres', 'hotes'] : ['arrivees', 'departs', 'en_maison', 'hotes'];
  const { ecran, setEcran, retourAccueil } = useEcranModule('hebergement', { repris: ecransRepris });
  const [form, setForm] = React.useState(null); // { sejour: null | sejour }
  const [ficheId, setFicheId] = React.useState(null);
  const [hoteForm, setHoteForm] = React.useState(null); // { nomInitial, sejour }

  const arrivees = arriveesDu(sejours.rows, aujourdhui);
  const departs = departsDu(sejours.rows, aujourdhui);
  const presents = enMaison(sejours.rows);
  const prochains = aVenir(sejours.rows, aujourdhui);
  const couverts = couvertsPetitDejeuner(sejours.rows, aujourdhui);
  const chambreDe = (s) => chambres.rows.find((c) => c.id === s.chambreId) || null;
  const fiche = ficheId ? sejours.rows.find((s) => s.id === ficheId) || null : null;

  // ── Gestes ──
  const enregistrerSejour = async (valeurs) => {
    const res = form?.sejour
      ? await sejours.modifier(form.sejour.id, valeurs)
      : await sejours.inserer({ ...valeurs, created_by: user?.id || null });
    if (!res.error) notify(form?.sejour ? 'Séjour modifié.' : 'Séjour créé.', 'success');
    return res;
  };
  const affecter = async (s, chambreId) => {
    const res = await sejours.modifier(s.id, { chambre_id: chambreId });
    if (!res.error) notify(chambreId ? 'Chambre affectée.' : 'Chambre retirée.', 'success');
    return res;
  };
  const changerStatut = async (s, statut) => {
    const res = await sejours.modifier(s.id, { statut });
    if (!res.error) {
      notify(statut === 'en_maison' ? 'Check-in fait, bon séjour !' : statut === 'annule' ? 'Séjour annulé.' : 'Séjour noté en no-show.', 'success');
    }
    return res;
  };
  // Check-out : le séjour est parti, et la chambre repasse « à faire » pour
  // les étages (le déclencheur chambres_journal_statut note le changement).
  const checkOut = async (s) => {
    const res = await sejours.modifier(s.id, { statut: 'parti' });
    if (res.error) return res;
    const chambre = chambreDe(s);
    if (chambre && chambre.statutMenage !== 'a_faire') {
      const resChambre = await chambres.modifier(chambre.id, { statut_menage: 'a_faire' });
      if (resChambre.error) {
        notify(`Check-out fait, mais la chambre n'a pas pu être remise à faire. ${resChambre.error}`, 'warning');
        return { error: null };
      }
    }
    notify('Check-out fait, la chambre est à faire.', 'success');
    return { error: null };
  };

  const etat = (n, un, plusieurs) => (
    <><span>{n}</span> <span>{n === 1 ? un : plusieurs}</span></>
  );

  const tuiles = [
    { id: 'arrivees', libelle: 'Arrivées du jour', Icone: LogIn, etat: etat(arrivees.length, 'arrivée', 'arrivées'), onClick: () => setEcran('arrivees') },
    { id: 'departs', libelle: 'Départs du jour', Icone: LogOut, etat: etat(departs.length, 'départ', 'départs'), onClick: () => setEcran('departs') },
    {
      id: 'en_maison', libelle: 'En maison', Icone: BedDouble,
      etat: <>{etat(presents.length, 'séjour', 'séjours')}<span aria-hidden="true"> </span><span>{couverts}</span> <span>{couverts === 1 ? 'couvert petit-déjeuner demain' : 'couverts petit-déjeuner demain'}</span></>,
      onClick: () => setEcran('en_maison'),
    },
    { id: 'nouveau', libelle: 'Nouveau séjour', Icone: Plus, visible: peutGerer, onClick: () => setForm({ sejour: null }) },
    { id: 'hotes', libelle: 'Hôtes', Icone: Users, etat: etat(hotes.rows.filter((x) => !x.archive).length, 'fiche', 'fiches'), onClick: () => setEcran('hotes') },
    { id: 'chambres', libelle: 'Chambres', Icone: DoorOpen, visible: direction, etat: etat(chambres.rows.filter((c) => c.actif).length, 'chambre active', 'chambres actives'), onClick: () => setEcran('chambres') },
  ];
  const lierHote = async (s, hoteId) => {
    const res = await sejours.modifier(s.id, { hote_id: hoteId || null });
    if (res.error) notify(res.error, 'error');
    else notify(hoteId ? 'Séjour relié à la fiche hôte.' : 'Fiche hôte détachée du séjour.', 'success');
    return res;
  };

  const listeDe = (liste, vide) => (
    liste.length
      ? <Liste>{liste.map((s) => <LigneSejour key={s.id} sejour={s} chambre={chambreDe(s)} aujourdhui={aujourdhui} onClick={() => setFicheId(s.id)} />)}</Liste>
      : <Vide>{vide}</Vide>
  );

  const etatLecture = sejours.status === 'absent'
    ? 'Le socle hôtel n\'est pas encore activé sur la base de données.'
    : sejours.status === 'error' ? 'Les séjours n\'ont pas pu être lus. Nouvel essai en cours…' : null;

  return (
    <section className="hebergement" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      {!etabId && <Vide>Aucun établissement sélectionné.</Vide>}

      {etabId && ecran === ECRAN_ACCUEIL && (
        <>
          <AccueilModule tuiles={tuiles} />
          {etatLecture && <Vide>{etatLecture}</Vide>}
        </>
      )}

      {etabId && ecran !== ECRAN_ACCUEIL && (
        <EcranTache
          titre={TITRES[ecran] || ''}
          etat={ecran === 'en_maison' ? <><span>{couverts}</span> <span>{couverts === 1 ? 'couvert petit-déjeuner demain' : 'couverts petit-déjeuner demain'}</span></> : null}
          onRetour={retourAccueil}
          actions={peutGerer && ecran !== 'chambres' && ecran !== 'hotes' ? (
            <Btn variant="primary" onClick={() => setForm({ sejour: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouveau séjour</span>
            </Btn>
          ) : null}
        />
      )}

      {etabId && ecran === 'arrivees' && (
        <>
          {listeDe(arrivees, 'Aucune arrivée aujourd\'hui.')}
          {prochains.length > 0 && (
            <>
              <div style={h.sousTitre}>Prochaines arrivées</div>
              {listeDe(prochains.slice(0, 50), '')}
            </>
          )}
        </>
      )}
      {etabId && ecran === 'departs' && listeDe(departs, 'Aucun départ aujourd\'hui.')}
      {etabId && ecran === 'en_maison' && listeDe(presents, 'Personne en maison pour l\'instant.')}
      {etabId && ecran === 'chambres' && direction && (
        <ChambresGestion
          chambres={chambres}
          peutGerer={peutGerer}
          onCreer={(valeurs) => chambres.inserer(valeurs).then((r) => { if (!r.error) notify('Chambre créée.', 'success'); return r; })}
          onModifier={(id, valeurs) => chambres.modifier(id, valeurs).then((r) => { if (!r.error) notify('Chambre modifiée.', 'success'); return r; })}
        />
      )}

      {etabId && ecran === 'hotes' && (
        <HotesGestion
          hotes={hotes} sejours={sejours.rows} demandes={demandes.rows} resaClients={resaClients.rows} spaClients={spaClients.rows} chambres={chambres.rows}
          peutGerer={peutGerer} peutSupprimer={peutSupprimerHote}
          onOuvrirSejour={(s) => setFicheId(s.id)}
        />
      )}

      {hoteForm && (
        <HoteForm
          hote={null} nomInitial={hoteForm.nomInitial} hotes={hotes} resaClients={resaClients.rows} spaClients={spaClients.rows}
          onClose={() => setHoteForm(null)}
          onEnregistre={(ho) => { if (ho && hoteForm.sejour) lierHote(hoteForm.sejour, ho.id); }}
        />
      )}

      {form && (
        <SejourForm
          sejour={form.sejour}
          chambres={trierChambres(chambres.rows)}
          sejours={sejours.rows}
          aujourdhui={aujourdhui}
          onEnregistrer={enregistrerSejour}
          onClose={() => setForm(null)}
        />
      )}
      {fiche && !form && !hoteForm && (
        <SejourFiche
          sejour={fiche}
          chambres={chambres.rows}
          sejours={sejours.rows}
          hotes={hotes.rows}
          onLierHote={lierHote}
          onCreerHote={(s) => setHoteForm({ nomInitial: s.nomHote, sejour: s })}
          aujourdhui={aujourdhui}
          peutGerer={peutGerer}
          onModifier={(s) => setForm({ sejour: s })}
          onAffecter={affecter}
          onStatut={changerStatut}
          onCheckOut={checkOut}
          onClose={() => setFicheId(null)}
        />
      )}
    </section>
  );
}
