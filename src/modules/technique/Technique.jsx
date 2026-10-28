import React from 'react';
import { ClipboardList, DoorClosed, Plus, Repeat, Wrench } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, Liste, Vide, h } from '../hebergement/hotelUi.jsx';
import {
  CATEGORIES_TECHNIQUE, PRIORITES, STATUTS_ORDRE, chf, dateCourte, dateHeureZurich, demandeOuverte, equipeDe, libelleDe, nomPersonne, ordreOuvert,
  planDu, planEnRetard, tonDe, trierChambres, trierOrdres, useChambres, useDemandes, useEquipements, useMaintenancePlans, useOrdresTravail,
} from '../hebergement/hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Technique (branche Hôtel, lot H8) : les ordres de travail (ouverts,
// planifiés, en cours ; se prendre, planifier, terminer avec temps, pièces et
// coût), le préventif (plans tous les n jours, en retard en rouge, créer
// l'ordre), les équipements, et les chambres hors service (lot H0) à remettre
// à faire. Un écran par tâche sur le socle des parcours.
//
// Droits : toute l'équipe lit et ouvre un ordre ; la personne assignée ou
// l'auteur fait avancer le sien ; équipements, plans, réassignation et
// suppression demandent la case Modifier de Technique (RLS et déclencheur) ;
// remettre une chambre à faire demande la case Modifier d'Étages.
// ─────────────────────────────────────────────────────────────────────────────

const TITRES = { ordres: 'Les ordres de travail', preventif: 'Le préventif', equipements: 'Les équipements', hors_service: 'Les chambres hors service' };

function useAujourdhui() {
  const [jour, setJour] = React.useState(() => zurichToday());
  React.useEffect(() => {
    const id = setInterval(() => setJour(zurichToday()), 60000);
    return () => clearInterval(id);
  }, []);
  return jour;
}

const ordreVide = (prerempli = {}) => ({ titre: '', detail: '', categorie: 'autre', priorite: 'normale', chambreId: '', equipementId: '', lieu: '', demandeId: '', planId: '', prevuLe: '', assigneA: '', ...prerempli });

function OrdreForm({ ordre, prerempli, chambres, equipements, demandes, equipe, ordres, peutGerer, onClose }) {
  const [f, setF] = React.useState(() => (ordre
    ? { ...ordre, chambreId: ordre.chambreId || '', equipementId: ordre.equipementId || '', demandeId: ordre.demandeId || '', planId: ordre.planId || '', assigneA: ordre.assigneA || '' }
    : ordreVide(prerempli)));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const demandesTechnique = demandes.filter((d) => d.pole === 'technique' && (demandeOuverte(d) || d.id === f.demandeId));
  const enregistrer = async () => {
    setErreur('');
    if (!f.titre.trim()) { setErreur('Le titre est obligatoire.'); return; }
    setEnCours(true);
    const valeurs = {
      titre: f.titre.trim(), detail: f.detail.trim() || null, categorie: f.categorie, priorite: f.priorite,
      chambre_id: f.chambreId || null, equipement_id: f.equipementId || null, lieu: f.lieu.trim() || null, demande_id: f.demandeId || null, plan_id: f.planId || null,
      prevu_le: f.prevuLe || null, ...(peutGerer ? { assigne_a: f.assigneA || null } : {}),
    };
    if (!ordre && f.prevuLe) valeurs.statut = 'planifie';
    const res = ordre ? await ordres.modifier(ordre.id, valeurs) : await ordres.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(ordre ? 'Ordre modifié.' : 'Ordre de travail ouvert.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="ordre-form"
      titre={ordre ? 'Modifier l\'ordre de travail' : 'Nouvel ordre de travail'}
      onClose={onClose}
      largeur={620}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Titre" large><input style={h.saisie} value={f.titre} onChange={champ('titre')} placeholder="Fuite salle de bain, lampe de chevet, climatisation bruyante…" autoFocus /></Champ>
        <Champ label="Catégorie">
          <select style={h.saisie} value={f.categorie} onChange={champ('categorie')}>
            {CATEGORIES_TECHNIQUE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Champ>
        <Champ label="Priorité">
          <select style={h.saisie} value={f.priorite} onChange={champ('priorite')}>
            {PRIORITES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Chambre">
          <select style={h.saisie} value={f.chambreId} onChange={champ('chambreId')} data-no-translate>
            <option value="">{'Aucune'}</option>
            {trierChambres(chambres).map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
          </select>
        </Champ>
        <Champ label="Équipement">
          <select style={h.saisie} value={f.equipementId} onChange={champ('equipementId')} data-no-translate>
            <option value="">{'Aucun'}</option>
            {equipements.filter((e) => e.actif || e.id === f.equipementId).map((e) => <option key={e.id} value={e.id}>{e.nom}{e.lieu ? ` (${e.lieu})` : ''}</option>)}
          </select>
        </Champ>
        <Champ label="Lieu"><input style={h.saisie} value={f.lieu} onChange={champ('lieu')} placeholder="Couloir 2e, cave, terrasse…" /></Champ>
        <Champ label="Prévu le"><input type="date" style={h.saisie} value={f.prevuLe} onChange={champ('prevuLe')} /></Champ>
        {peutGerer && (
          <Champ label="Assigné à">
            <select style={h.saisie} value={f.assigneA} onChange={champ('assigneA')} data-no-translate>
              <option value="">{'Personne'}</option>
              {equipe.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
            </select>
          </Champ>
        )}
        {demandesTechnique.length > 0 && (
          <Champ label="Demande d'origine">
            <select style={h.saisie} value={f.demandeId} onChange={champ('demandeId')} data-no-translate>
              <option value="">{'Aucune'}</option>
              {demandesTechnique.map((d) => <option key={d.id} value={d.id}>{d.titre}</option>)}
            </select>
          </Champ>
        )}
        <Champ label="Détail" large><textarea style={{ ...h.saisie, minHeight: 64 }} value={f.detail} onChange={champ('detail')} /></Champ>
      </div>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function OrdreFiche({ ordre: o, chambres, equipements, plans, moi, peutGerer, peutEtages, ordres, onRemettreChambre, onApresFin, onModifier, onClose }) {
  const [fin, setFin] = React.useState({ temps: o.tempsMinutes == null ? '' : String(o.tempsMinutes), cout: o.cout == null ? '' : String(o.cout), pieces: o.pieces, compteRendu: o.compteRendu, remettre: true });
  const [prevu, setPrevu] = React.useState(o.prevuLe || '');
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const chambre = chambres.find((c) => c.id === o.chambreId) || null;
  const equipement = equipements.find((e) => e.id === o.equipementId) || null;
  const plan = plans.find((p) => p.id === o.planId) || null;
  const mien = o.assigneA === moi || (o.createdBy === moi && (o.statut === 'ouvert' || o.statut === 'planifie'));
  const peutAvancer = peutGerer || mien;
  const changer = async (valeurs, message) => {
    setErreur('');
    setEnCours(true);
    const r = await ordres.modifier(o.id, valeurs);
    setEnCours(false);
    if (r.error) { setErreur(r.error); return r; }
    if (message) notify(message, 'success');
    return r;
  };
  const terminer = async () => {
    const r = await changer({
      statut: 'termine', temps_minutes: String(fin.temps).trim() === '' ? null : Math.max(0, parseInt(fin.temps, 10) || 0),
      cout: String(fin.cout).trim() === '' ? null : Math.max(0, Number(String(fin.cout).replace(',', '.')) || 0),
      pieces: fin.pieces.trim() || null, compte_rendu: fin.compteRendu.trim() || null,
    }, 'Ordre terminé.');
    if (r.error) return;
    if (chambre && chambre.statutMenage === 'hors_service' && fin.remettre && peutEtages) await onRemettreChambre(chambre);
    // Le plan préventif est daté par la base : on relit sans attendre le realtime.
    if (o.planId) onApresFin();
    onClose();
  };
  const ligne = (label, valeur, brut = true) => (
    <div key={label} style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', flex: '0 0 120px' }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text)', flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }} data-no-translate={brut ? '' : undefined}>{valeur}</span>
    </div>
  );
  return (
    <Fenetre
      id="ordre-fiche"
      titre={<span data-no-translate>{o.titre}</span>}
      sousTitre={<><Puce ton={tonDe(STATUTS_ORDRE, o.statut)}>{libelleDe(STATUTS_ORDRE, o.statut)}</Puce> <Puce ton={tonDe(PRIORITES, o.priorite)}>{libelleDe(PRIORITES, o.priorite)}</Puce> <span>{libelleDe(CATEGORIES_TECHNIQUE, o.categorie)}</span></>}
      onClose={onClose}
      largeur={620}
      pied={(
        <>
          {peutGerer && ordreOuvert(o) && <button type="button" style={st.secondaire} onClick={async () => { const r = await ordres.supprimer(o.id); if (r.error) setErreur(r.error); else { notify('Ordre supprimé.', 'success'); onClose(); } }}>Supprimer</button>}
          {(peutGerer || (o.createdBy === moi && (o.statut === 'ouvert' || o.statut === 'planifie'))) && <button type="button" style={st.secondaire} onClick={() => onModifier(o)}>Modifier</button>}
          {peutAvancer && ordreOuvert(o) && <button type="button" style={st.secondaire} onClick={() => changer({ statut: 'annule' }, 'Ordre annulé.').then((r) => { if (!r.error) onClose(); })} disabled={enCours}>Annuler l'ordre</button>}
          {!o.assigneA && ordreOuvert(o) && <button type="button" style={st.primaire} onClick={() => changer({ assigne_a: moi, statut: 'en_cours' }, 'Ordre pris.')} disabled={enCours}>Je prends</button>}
          {o.assigneA && o.statut !== 'en_cours' && ordreOuvert(o) && peutAvancer && <button type="button" style={st.primaire} onClick={() => changer({ statut: 'en_cours' }, 'Ordre en cours.')} disabled={enCours}>Commencer</button>}
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {o.detail && ligne('Détail', o.detail)}
        {chambre && ligne('Chambre', <>{chambre.numero}{chambre.statutMenage === 'hors_service' && <> <Puce ton="danger">Hors service</Puce></>}</>)}
        {equipement && ligne('Équipement', `${equipement.nom}${equipement.lieu ? `, ${equipement.lieu}` : ''}`)}
        {o.lieu && ligne('Lieu', o.lieu)}
        {plan && ligne('Préventif', plan.titre)}
        {o.assigneA && ligne('Assigné à', nomPersonne(o.assigneA))}
        {o.prevuLe && ligne('Prévu le', dateCourte(o.prevuLe))}
        {ligne('Ouvert par', `${nomPersonne(o.createdBy)}, ${dateHeureZurich(o.createdAt)}`)}
        {o.statut === 'termine' && ligne('Terminé par', `${nomPersonne(o.terminePar)}, ${dateHeureZurich(o.termineAt)}`)}
        {o.statut === 'termine' && (o.tempsMinutes != null || o.cout != null || o.pieces) && ligne('Bilan', [o.tempsMinutes != null ? `${o.tempsMinutes} min` : '', o.cout != null ? `CHF ${chf(o.cout)}` : '', o.pieces].filter(Boolean).join(', '))}
        {o.compteRendu && ligne('Compte rendu', o.compteRendu)}
        {o.photoUrl && /^https:\/\//.test(o.photoUrl) && ligne('Photo', <a href={o.photoUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Ouvrir la photo</a>, false)}
      </div>

      {peutAvancer && ordreOuvert(o) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}><Champ label="Planifier le"><input type="date" style={h.saisie} value={prevu} onChange={(ev) => setPrevu(ev.target.value)} /></Champ></div>
          <button type="button" style={st.secondaire} onClick={() => changer({ prevu_le: prevu || null, statut: prevu && o.statut === 'ouvert' ? 'planifie' : o.statut }, 'Ordre planifié.')} disabled={enCours || prevu === (o.prevuLe || '')}>Planifier</button>
        </div>
      )}
      {peutAvancer && ordreOuvert(o) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={h.sousTitre}>Terminer</div>
          <div style={h.grille}>
            <Champ label="Temps passé (minutes)"><input type="number" min="0" inputMode="numeric" style={h.saisie} value={fin.temps} onChange={(ev) => setFin((p) => ({ ...p, temps: ev.target.value }))} /></Champ>
            <Champ label="Coût (CHF)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={fin.cout} onChange={(ev) => setFin((p) => ({ ...p, cout: ev.target.value }))} /></Champ>
            <Champ label="Pièces" large><input style={h.saisie} value={fin.pieces} onChange={(ev) => setFin((p) => ({ ...p, pieces: ev.target.value }))} placeholder="Joint, ampoule, fusible…" /></Champ>
            <Champ label="Compte rendu" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={fin.compteRendu} onChange={(ev) => setFin((p) => ({ ...p, compteRendu: ev.target.value }))} /></Champ>
          </div>
          {chambre && chambre.statutMenage === 'hors_service' && peutEtages && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={fin.remettre} onChange={(ev) => setFin((p) => ({ ...p, remettre: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
              <span style={{ fontSize: 14, color: 'var(--text)' }}>Remettre la chambre à faire (les étages la nettoient)</span>
            </label>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="primary" onClick={terminer} disabled={enCours} style={{ minHeight: 44 }}>Terminer l'ordre</Btn>
          </div>
        </div>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function PlanForm({ plan, equipements, chambres, plans, onClose }) {
  const [f, setF] = React.useState(() => (plan ? { ...plan, equipementId: plan.equipementId || '', chambreId: plan.chambreId || '' } : { titre: '', detail: '', categorie: 'autre', equipementId: '', chambreId: '', lieu: '', periodiciteJours: 30, derniereFois: '', actif: true }));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const enregistrer = async () => {
    setErreur('');
    if (!f.titre.trim()) { setErreur('Le titre est obligatoire.'); return; }
    const periode = parseInt(f.periodiciteJours, 10);
    if (!(periode >= 1)) { setErreur('La périodicité est un nombre de jours.'); return; }
    setEnCours(true);
    const valeurs = { titre: f.titre.trim(), detail: f.detail.trim() || null, categorie: f.categorie, equipement_id: f.equipementId || null, chambre_id: f.chambreId || null, lieu: f.lieu.trim() || null, periodicite_jours: periode, derniere_fois: f.derniereFois || null, actif: !!f.actif };
    const res = plan ? await plans.modifier(plan.id, valeurs) : await plans.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(plan ? 'Plan modifié.' : 'Plan créé.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="plan-form"
      titre={plan ? 'Modifier le plan préventif' : 'Nouveau plan préventif'}
      onClose={onClose}
      largeur={600}
      pied={(
        <>
          {plan && <button type="button" style={st.secondaire} onClick={async () => { const r = await plans.supprimer(plan.id); if (r.error) setErreur(r.error); else { notify('Plan supprimé.', 'success'); onClose(); } }}>Supprimer</button>}
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Titre" large><input style={h.saisie} value={f.titre} onChange={champ('titre')} placeholder="Entretien chaudière, test des détecteurs, détartrage…" autoFocus /></Champ>
        <Champ label="Catégorie">
          <select style={h.saisie} value={f.categorie} onChange={champ('categorie')}>
            {CATEGORIES_TECHNIQUE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Champ>
        <Champ label="Tous les (jours)"><input type="number" min="1" max="3660" inputMode="numeric" style={h.saisie} value={f.periodiciteJours} onChange={champ('periodiciteJours')} /></Champ>
        <Champ label="Équipement">
          <select style={h.saisie} value={f.equipementId} onChange={champ('equipementId')} data-no-translate>
            <option value="">{'Aucun'}</option>
            {equipements.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </Champ>
        <Champ label="Chambre">
          <select style={h.saisie} value={f.chambreId} onChange={champ('chambreId')} data-no-translate>
            <option value="">{'Aucune'}</option>
            {trierChambres(chambres).map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
          </select>
        </Champ>
        <Champ label="Lieu"><input style={h.saisie} value={f.lieu} onChange={champ('lieu')} /></Champ>
        <Champ label="Dernière fois"><input type="date" style={h.saisie} value={f.derniereFois} onChange={champ('derniereFois')} /></Champ>
        <Champ label="Détail" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.detail} onChange={champ('detail')} /></Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.actif} onChange={(ev) => setF((p) => ({ ...p, actif: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Plan actif</span>
      </label>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function EquipementForm({ equipement, chambres, equipements, onClose }) {
  const [f, setF] = React.useState(() => (equipement ? { ...equipement, chambreId: equipement.chambreId || '' } : { nom: '', categorie: 'autre', lieu: '', chambreId: '', numeroSerie: '', fournisseur: '', actif: true, notes: '' }));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const enregistrer = async () => {
    setErreur('');
    if (!f.nom.trim()) { setErreur('Le nom est obligatoire.'); return; }
    setEnCours(true);
    const valeurs = { nom: f.nom.trim(), categorie: f.categorie, lieu: f.lieu.trim() || null, chambre_id: f.chambreId || null, numero_serie: f.numeroSerie.trim() || null, fournisseur: f.fournisseur.trim() || null, actif: !!f.actif, notes: f.notes.trim() || null };
    const res = equipement ? await equipements.modifier(equipement.id, valeurs) : await equipements.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(equipement ? 'Équipement modifié.' : 'Équipement créé.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="equipement-form"
      titre={equipement ? 'Modifier l\'équipement' : 'Nouvel équipement'}
      onClose={onClose}
      largeur={600}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Nom" large><input style={h.saisie} value={f.nom} onChange={champ('nom')} placeholder="Chaudière, ascenseur, lave-vaisselle…" autoFocus /></Champ>
        <Champ label="Catégorie">
          <select style={h.saisie} value={f.categorie} onChange={champ('categorie')}>
            {CATEGORIES_TECHNIQUE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Champ>
        <Champ label="Lieu"><input style={h.saisie} value={f.lieu} onChange={champ('lieu')} /></Champ>
        <Champ label="Chambre">
          <select style={h.saisie} value={f.chambreId} onChange={champ('chambreId')} data-no-translate>
            <option value="">{'Aucune'}</option>
            {trierChambres(chambres).map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
          </select>
        </Champ>
        <Champ label="Numéro de série"><input style={h.saisie} value={f.numeroSerie} onChange={champ('numeroSerie')} /></Champ>
        <Champ label="Fournisseur"><input style={h.saisie} value={f.fournisseur} onChange={champ('fournisseur')} /></Champ>
        <Champ label="Notes" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.notes} onChange={champ('notes')} /></Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.actif} onChange={(ev) => setF((p) => ({ ...p, actif: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Équipement en service</span>
      </label>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

export default function Technique({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const moi = user?.id || null;
  const peutGerer = canManageModule(role, 'technique');
  const peutEtages = canManageModule(role, 'etages');
  const aujourdhui = useAujourdhui();

  const ordres = useOrdresTravail(etabId);
  const plans = useMaintenancePlans(etabId);
  const equipements = useEquipements(etabId);
  const chambres = useChambres(etabId);
  const demandes = useDemandes(etabId);
  const equipe = React.useMemo(() => equipeDe(etabId), [etabId]);

  const ecransRepris = peutGerer ? ['ordres', 'preventif', 'equipements', 'hors_service'] : ['ordres', 'preventif', 'hors_service'];
  const { ecran, setEcran, retourAccueil } = useEcranModule('technique', { repris: ecransRepris });
  const [vue, setVue] = React.useState('ouverts');
  const [recherche, setRecherche] = React.useState('');
  const [form, setForm] = React.useState(null); // { ordre, prerempli }
  const [ficheId, setFicheId] = React.useState(null);
  const [planForm, setPlanForm] = React.useState(null);
  const [equipForm, setEquipForm] = React.useState(null);

  const correspond = makeSearchMatcher(recherche);
  const numero = (id) => chambres.rows.find((c) => c.id === id)?.numero || '';
  const nomEquipement = (id) => equipements.rows.find((e) => e.id === id)?.nom || '';
  const ouverts = trierOrdres(ordres.rows.filter(ordreOuvert));
  const liste = (vue === 'ouverts' ? ouverts : ordres.rows.filter((o) => !ordreOuvert(o)).slice(0, 200))
    .filter((o) => !recherche || correspond(`${o.titre} ${o.detail} ${numero(o.chambreId)} ${nomEquipement(o.equipementId)} ${o.lieu} ${libelleDe(CATEGORIES_TECHNIQUE, o.categorie)}`));
  const fiche = ficheId ? ordres.rows.find((o) => o.id === ficheId) || null : null;
  const plansDus = plans.rows.filter((p) => planDu(p, aujourdhui));
  const horsService = trierChambres(chambres.rows.filter((c) => c.actif && c.statutMenage === 'hors_service'));
  const ordreDuPlan = (p) => ouverts.find((o) => o.planId === p.id) || null;

  const remettreChambre = async (c) => {
    const r = await chambres.modifier(c.id, { statut_menage: 'a_faire', hors_service_motif: null });
    if (r.error) notify(r.error, 'error'); else notify('Chambre remise à faire.', 'success');
  };
  const creerDepuisPlan = (p) => setForm({ ordre: null, prerempli: { titre: p.titre, detail: p.detail, categorie: p.categorie, equipementId: p.equipementId || '', chambreId: p.chambreId || '', lieu: p.lieu || '', planId: p.id, prevuLe: p.prochaineFois > aujourdhui ? p.prochaineFois : aujourdhui } });

  const etat = (n, un, plusieurs) => <><span>{n}</span> <span>{n === 1 ? un : plusieurs}</span></>;
  const tuiles = [
    { id: 'ordres', libelle: 'Ordres de travail', Icone: ClipboardList, etat: <>{etat(ouverts.length, 'ordre ouvert', 'ordres ouverts')}{ouverts.some((o) => o.priorite === 'urgente') && <> <Puce ton="danger">Urgent</Puce></>}</>, onClick: () => { setVue('ouverts'); setEcran('ordres'); } },
    { id: 'nouveau', libelle: 'Nouvel ordre', Icone: Plus, onClick: () => setForm({ ordre: null, prerempli: {} }) },
    { id: 'preventif', libelle: 'Préventif', Icone: Repeat, etat: etat(plansDus.length, 'tâche à faire', 'tâches à faire'), onClick: () => setEcran('preventif') },
    { id: 'hors_service', libelle: 'Chambres hors service', Icone: DoorClosed, etat: etat(horsService.length, 'chambre', 'chambres'), onClick: () => setEcran('hors_service') },
    { id: 'equipements', libelle: 'Équipements', Icone: Wrench, visible: peutGerer, etat: etat(equipements.rows.filter((e) => e.actif).length, 'en service', 'en service'), onClick: () => setEcran('equipements') },
  ];
  const etatLecture = ordres.status === 'absent' ? 'Le module Technique n\'est pas encore activé sur la base de données.'
    : ordres.status === 'error' ? 'Les ordres de travail n\'ont pas pu être lus. Nouvel essai en cours…' : null;

  const ligneOrdre = (o) => (
    <button key={o.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => setFicheId(o.id)} data-ordre={o.id}>
      <span style={h.ligneGauche}>
        <span style={h.nomHote} data-no-translate>{o.titre}</span>
        <span style={h.detail}>
          <span>{libelleDe(CATEGORIES_TECHNIQUE, o.categorie)}</span>
          {o.chambreId && <>, <span>ch.</span> <span data-no-translate>{numero(o.chambreId)}</span></>}
          {o.equipementId && <>, <span data-no-translate>{nomEquipement(o.equipementId)}</span></>}
          {o.lieu && <>, <span data-no-translate>{o.lieu}</span></>}
          {o.prevuLe && <>, <span>prévu le</span> <span data-no-translate>{dateCourte(o.prevuLe)}</span></>}
          {o.assigneA && <>, <span data-no-translate>{nomPersonne(o.assigneA)}</span></>}
        </span>
      </span>
      <span style={h.ligneDroite}>
        <Puce ton={tonDe(PRIORITES, o.priorite)}>{libelleDe(PRIORITES, o.priorite)}</Puce>
        <Puce ton={tonDe(STATUTS_ORDRE, o.statut)}>{libelleDe(STATUTS_ORDRE, o.statut)}</Puce>
      </span>
    </button>
  );

  return (
    <section className="technique" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
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
          onRetour={retourAccueil}
          actions={ecran === 'ordres' ? (
            <Btn variant="primary" onClick={() => setForm({ ordre: null, prerempli: {} })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouvel ordre</span>
            </Btn>
          ) : ecran === 'preventif' && peutGerer ? (
            <Btn variant="primary" onClick={() => setPlanForm({ plan: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouveau plan</span>
            </Btn>
          ) : ecran === 'equipements' && peutGerer ? (
            <Btn variant="primary" onClick={() => setEquipForm({ equipement: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouvel équipement</span>
            </Btn>
          ) : null}
        />
      )}

      {etabId && ecran === 'ordres' && (
        <>
          <div className="module-actions">
            <SegmentedTabs size="sm" tabs={[{ id: 'ouverts', label: 'À faire' }, { id: 'clos', label: 'Terminés et annulés' }]} active={vue} onChange={setVue} />
            <SearchToggle value={recherche} onChange={setRecherche} placeholder="Titre, chambre, équipement, lieu…" />
          </div>
          {!liste.length && <Vide>{vue === 'ouverts' ? 'Aucun ordre de travail à faire.' : 'Aucun ordre terminé ou annulé.'}</Vide>}
          <Liste>{liste.map(ligneOrdre)}</Liste>
        </>
      )}

      {etabId && ecran === 'preventif' && (
        <>
          {plans.status === 'ready' && !plans.rows.length && <Vide>Aucun plan préventif pour l'instant.</Vide>}
          <Liste>
            {plans.rows.map((p) => {
              const retard = planEnRetard(p, aujourdhui);
              const du = planDu(p, aujourdhui);
              const existant = ordreDuPlan(p);
              return (
                <div key={p.id} style={{ ...h.ligne, cursor: 'default' }}>
                  <span style={h.ligneGauche}>
                    <span style={{ ...h.nomHote, color: retard ? 'var(--danger-text)' : 'var(--text)' }} data-no-translate>{p.titre}</span>
                    <span style={h.detail}>
                      <span>{libelleDe(CATEGORIES_TECHNIQUE, p.categorie)}</span>, <span>tous les</span> <span data-no-translate>{p.periodiciteJours}</span> <span>jours</span>
                      {p.equipementId && <>, <span data-no-translate>{nomEquipement(p.equipementId)}</span></>}
                      {p.chambreId && <>, <span>ch.</span> <span data-no-translate>{numero(p.chambreId)}</span></>}
                      {p.derniereFois && <>, <span>dernière fois le</span> <span data-no-translate>{dateCourte(p.derniereFois)}</span></>}
                    </span>
                  </span>
                  <span style={h.ligneDroite}>
                    {!p.actif ? <Puce ton="neutre">Inactif</Puce> : retard ? <Puce ton="danger"><span>En retard depuis le</span> <span data-no-translate>{dateCourte(p.prochaineFois)}</span></Puce> : <Puce ton={du ? 'warning' : 'info'}><span>{du ? 'À faire' : 'Prochaine fois le'}</span> {!du && <span data-no-translate>{dateCourte(p.prochaineFois)}</span>}</Puce>}
                    {p.actif && existant && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => setFicheId(existant.id)}>Voir l'ordre</button>}
                    {p.actif && !existant && peutGerer && <Btn variant="primary" onClick={() => creerDepuisPlan(p)} style={{ minHeight: 40, fontSize: 13 }}>Créer l'ordre</Btn>}
                    {peutGerer && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => setPlanForm({ plan: p })}>Modifier</button>}
                  </span>
                </div>
              );
            })}
          </Liste>
        </>
      )}

      {etabId && ecran === 'hors_service' && (
        <>
          {!horsService.length && <Vide>Aucune chambre hors service.</Vide>}
          <Liste>
            {horsService.map((c) => {
              const ordre = ouverts.find((o) => o.chambreId === c.id) || null;
              return (
                <div key={c.id} style={{ ...h.ligne, cursor: 'default' }}>
                  <span style={h.ligneGauche}>
                    <span style={h.nomHote}><span>Chambre</span> <span data-no-translate>{c.numero}</span></span>
                    <span style={h.detail} data-no-translate>{c.horsServiceMotif}</span>
                  </span>
                  <span style={h.ligneDroite}>
                    {ordre
                      ? <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => setFicheId(ordre.id)}><span>Ordre :</span> <span data-no-translate>{ordre.titre}</span></button>
                      : <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => setForm({ ordre: null, prerempli: { titre: c.horsServiceMotif || `Chambre ${c.numero}`, chambreId: c.id, priorite: 'haute' } })}>Ouvrir un ordre</button>}
                    {peutEtages && <Btn variant="primary" onClick={() => remettreChambre(c)} style={{ minHeight: 40, fontSize: 13 }}>Remettre à faire</Btn>}
                  </span>
                </div>
              );
            })}
          </Liste>
        </>
      )}

      {etabId && ecran === 'equipements' && peutGerer && (
        <>
          {equipements.status === 'ready' && !equipements.rows.length && <Vide>Aucun équipement pour l'instant.</Vide>}
          <Liste>
            {equipements.rows.map((e) => (
              <button key={e.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => setEquipForm({ equipement: e })} data-equipement={e.id}>
                <span style={h.ligneGauche}>
                  <span style={h.nomHote} data-no-translate>{e.nom}</span>
                  <span style={h.detail}><span>{libelleDe(CATEGORIES_TECHNIQUE, e.categorie)}</span>{e.lieu && <>, <span data-no-translate>{e.lieu}</span></>}{e.chambreId && <>, <span>ch.</span> <span data-no-translate>{numero(e.chambreId)}</span></>}{e.numeroSerie && <>, <span data-no-translate>{e.numeroSerie}</span></>}</span>
                </span>
                {!e.actif && <Puce ton="neutre">Hors service</Puce>}
              </button>
            ))}
          </Liste>
        </>
      )}

      {form && <OrdreForm ordre={form.ordre} prerempli={form.prerempli} chambres={chambres.rows} equipements={equipements.rows} demandes={demandes.rows} equipe={equipe} ordres={ordres} peutGerer={peutGerer} onClose={() => setForm(null)} />}
      {fiche && !form && (
        <OrdreFiche ordre={fiche} chambres={chambres.rows} equipements={equipements.rows} plans={plans.rows} moi={moi} peutGerer={peutGerer} peutEtages={peutEtages} ordres={ordres} onRemettreChambre={remettreChambre} onApresFin={() => plans.reload()} onModifier={(o) => setForm({ ordre: o, prerempli: {} })} onClose={() => setFicheId(null)} />
      )}
      {planForm && <PlanForm plan={planForm.plan} equipements={equipements.rows} chambres={chambres.rows} plans={plans} onClose={() => setPlanForm(null)} />}
      {equipForm && <EquipementForm equipement={equipForm.equipement} chambres={chambres.rows} equipements={equipements} onClose={() => setEquipForm(null)} />}
    </section>
  );
}
