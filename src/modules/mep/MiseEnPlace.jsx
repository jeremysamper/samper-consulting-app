import React from 'react';
import { ClipboardCheck, ListPlus } from 'lucide-react';
import { dbService } from '../../services/dbService.js';
import { canManageModule } from '../../data/demoData.js';
import { getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import { useEcranModule } from '../../components/parcours/useEcranModule.js';
import { zurichToday } from '../../utils/zurichTime.js';
import MepDetail from './MepDetail.jsx';
import MepEditor from './MepEditor.jsx';
import { s, formatDateService } from './MiseEnPlace.styles.js';
import { messageErreur } from '../../utils/messageErreur.js';

// Lance `fn` une fois arrivé le retour d'historique d'une fenêtre refermée
// (l'entrée en tête est encore la sienne), sinon tout de suite ; filet de
// 500 ms si le retour n'arrive pas.
function apresRetourEnCours(fn) {
  const win = getBrowserWindow();
  const tete = win?.history?.state;
  if (!tete?.layer || tete.layer === 'mep-ecran') { fn(); return; }
  let fait = false;
  const une = () => { if (fait) return; fait = true; win.removeEventListener('popstate', une); fn(); };
  win.addEventListener('popstate', une);
  setTimeout(une, 500);
}

// La liste du service : celle d'aujourd'hui (Zurich), sinon la prochaine
// datée. Les listes arrivent triées par date de service.
const listeDuService = (listes) => {
  const jour = zurichToday();
  return (listes || []).find(l => l.dateService && String(l.dateService).slice(0, 10) >= jour) || null;
};

// MISE EN PLACE
// Listes de production separant la grosse production (congelable, batch en
// avance) des preparations urgentes (non congelable, J-1/J-0).
// Ecriture regie par le droit « gerer » du module mep (Roles & acces,
// case « Modifier ») ; defaut resp_cuisine / cuisinier, consultant / patron = lecture.
// Parcours : le module s'ouvre sur les listes, comme avant ; au-dessus, deux
// gros boutons : « Ma liste du service » (la liste du jour, à un geste comme
// sa carte) et « Nouvelle liste » (mêmes droits qu'avant). Le détail d'une
// liste est un écran de tâche (Retour, geste retour, Échap) ; l'éditeur aussi,
// sans Échap.
const MiseEnPlace = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const canEdit = canManageModule(user?.role, 'mep');

  const [listes, setListes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [activeId, setActiveId] = React.useState(null);
  const [editing, setEditing] = React.useState(null); // liste en cours d'edition (null = nouvelle)

  const reload = React.useCallback(async () => {
    if (!legacySB) { setLoading(false); return; }
    try {
      const rows = await legacySB.db.listMepListes(etabId);
      setListes(rows || []);
    } catch (err) {
      console.error('[MEP listMepListes]', err);
    } finally {
      setLoading(false);
    }
  }, [legacySB, etabId]);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => { await reload(); if (!mounted) return; })();
    let unsub = null;
    if (legacySB) {
      unsub = legacySB.realtime.subscribeReload(['mep_listes', 'mep_items'], () => { if (mounted) reload(); });
    }
    return () => { mounted = false; unsub && unsub(); };
  }, [reload, legacySB]);

  // Écrans : 'detail' et 'editeur' partagent une seule entrée d'historique
  // (passer du détail à l'éditeur n'en pose pas une seconde, qui resterait
  // orpheline au retour). Aucun écran repris : le module s'ouvre sur les listes.
  const { ecran, setEcran, retourAccueil } = useEcranModule('mep', {
    surRetour: () => { setActiveId(null); setEditing(null); reload(); },
  });

  // Échap ne quitte pas l'éditeur : la saisie en cours serait perdue (le
  // crochet partagé ignore un Échap déjà annulé).
  React.useEffect(() => {
    if (ecran !== 'editeur') return undefined;
    const garde = (e) => { if (e.key === 'Escape') e.preventDefault(); };
    document.addEventListener('keydown', garde, true);
    return () => document.removeEventListener('keydown', garde, true);
  }, [ecran]);

  const openDetail = (id) => { setActiveId(id); setEcran('detail'); };
  const openNew = () => { setEditing(null); setEcran('editeur'); };
  const openEdit = (liste) => { setEditing(liste); setEcran('editeur'); };
  const backToList = retourAccueil;

  const supprimerListe = async (liste) => {
    if (!canEdit) return;
    if (!window.confirm(`Supprimer la liste « ${liste.nom} » et toutes ses préparations ?`)) return;
    try {
      await legacySB.db.deleteMepListe(liste.id);
      notifyLegacy('Liste supprimée.', 'success');
      // La fenêtre « Gérer » refermée dans le même geste a lancé un retour de
      // l'historique : quitter l'écran avant son arrivée laisserait l'entrée
      // de l'écran derrière lui.
      apresRetourEnCours(backToList);
    } catch (err) {
      notifyLegacy(messageErreur(err, 'mise en place', 'Suppression impossible.'), 'error');
    }
  };

  if (ecran === 'editeur') {
    return (
      <MepEditor
        liste={editing}
        user={user}
        etablissement={etablissement}
        onClose={backToList}
      />
    );
  }

  if (ecran === 'detail') {
    const liste = listes.find(l => l.id === activeId);
    return (
      <MepDetail
        listeId={activeId}
        listeMeta={liste}
        user={user}
        etablissement={etablissement}
        canEdit={canEdit}
        onBack={backToList}
        onEdit={() => liste && openEdit(liste)}
        onDelete={() => liste && supprimerListe(liste)}
      />
    );
  }

  // ─── Vue liste des listes ───
  const q = search.trim().toLowerCase();
  const filtered = (listes || []).filter(l => q === '' || (l.nom || '').toLowerCase().includes(q));
  const duService = loading ? null : listeDuService(listes);
  const tuiles = [
    { id: 'service', Icone: ClipboardCheck, libelle: 'Ma liste du service', etat: duService && <span data-no-translate>{duService.nom}</span>, visible: Boolean(duService), onClick: () => openDetail(duService.id) },
    { id: 'nouvelle', Icone: ListPlus, libelle: 'Nouvelle liste', etat: <>pour un service</>, visible: canEdit, onClick: openNew },
  ];

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div>
            <div style={s.sub}>Grosse production congelable et préparations urgentes non congelables</div>
          </div>
        </div>
        <div style={s.moduleActions} className="module-actions">
          <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher une liste…" />
        </div>
      </div>

      {/* Les autres tâches, en gros boutons au-dessus des listes ; « Nouvelle
          liste » remplace aussi l'appel de la liste vide (un seul bouton principal). */}
      {tuiles.some(t => t.visible) && <AccueilModule tuiles={tuiles} />}

      {loading ? (
        <div style={s.empty}>Chargement des listes…</div>
      ) : filtered.length === 0 ? (
        <div style={s.empty}>
          {q ? 'Aucune liste pour cette recherche.' : 'Aucune liste de mise en place pour le moment.'}
        </div>
      ) : (
        <div style={s.cardsGrid}>
          {filtered.map(l => {
            const total = l.itemsCount || 0;
            const faits = l.itemsFaits || 0;
            const pct = total > 0 ? Math.round(faits / total * 100) : 0;
            return (
              <button key={l.id} style={s.listeCard} onClick={() => openDetail(l.id)}>
                <div style={s.listeNom}>{l.nom}</div>
                <div style={s.listeDate}>{formatDateService(l.dateService)}</div>
                <div>
                  <div style={s.progressTrack}><div style={{ ...s.progressFill, width: `${pct}%` }} /></div>
                  <div style={s.progressLabel}>{faits} / {total} préparation{total > 1 ? 's' : ''} faite{faits > 1 ? 's' : ''}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MiseEnPlace;
