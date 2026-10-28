import React from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { dbService } from '../../services/dbService.js';
import { messageErreur as messageErreurApp } from '../../utils/messageErreur.js';
import PhotoUploader from '../consultant-tools/PhotoUploader.jsx';
import { Puce } from '../dashboard/tableauUi.jsx';
import {
  ACTIONS_DEMANDE, POLES, PRIORITES, STATUTS_DEMANDE, dateCourte, dateHeureZurich, demandeEnRetard, demandeOuverte, equipeDe,
  libelleDe, nomPersonne, poleDuRole, tonDe, trierChambres, useChambres, useDemandes, useDemandesJournal, useSejours,
} from '../hebergement/hotelData.js';
import { Champ, Liste, Vide, h } from '../hebergement/hotelUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Demandes (branche Hôtel, lot H2) : ce qu'un hôte ou un collègue demande à un
// pôle (réception, étages, technique, cuisine, restaurant, spa, direction).
// L'écran s'ouvre sur le pôle de la personne connectée, les demandes ouvertes
// d'abord, les urgentes et les escaladées en tête, l'échéance dépassée en
// rouge. Un geste par étape : Je prends, Faite, Escalader. La liste « Faites »
// garde sept jours. La recherche porte sur le titre, la chambre et l'hôte :
// c'est l'historique par chambre et par hôte.
//
// Droits : toute l'équipe lit, crée et fait avancer (RLS idem) ; supprimer
// demande la case Modifier de Demandes. Le journal est écrit par déclencheur.
// ─────────────────────────────────────────────────────────────────────────────

const ORDRE_PRIORITE = { urgente: 0, haute: 1, normale: 2, basse: 3 };
const SEPT_JOURS_MS = 7 * 86400000;

function useMaintenant() {
  const [iso, setIso] = React.useState(() => new Date().toISOString());
  React.useEffect(() => {
    const id = setInterval(() => setIso(new Date().toISOString()), 60000);
    return () => clearInterval(id);
  }, []);
  return iso;
}

export default function Demandes({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const peutSupprimer = canManageModule(role, 'demandes');
  const maintenant = useMaintenant();
  const aujourdhui = zurichToday();

  const demandes = useDemandes(etabId);
  const journal = useDemandesJournal(etabId);
  const chambres = useChambres(etabId);
  const sejours = useSejours(etabId);
  const equipe = React.useMemo(() => equipeDe(etabId), [etabId]);

  const [pole, setPole] = React.useState(() => poleDuRole(role) || 'tous');
  const [vue, setVue] = React.useState('a_traiter');
  const [recherche, setRecherche] = React.useState('');
  const [form, setForm] = React.useState(null); // { demande: null | demande }
  const [ficheId, setFicheId] = React.useState(null);

  const chambreDe = (id) => chambres.rows.find((c) => c.id === id) || null;
  const hoteDe = (id) => sejours.rows.find((s) => s.id === id)?.nomHote || '';
  const correspond = makeSearchMatcher(recherche);
  const liste = demandes.rows
    .filter((d) => (pole === 'tous' || d.pole === pole))
    .filter((d) => (vue === 'a_traiter' ? demandeOuverte(d) : !demandeOuverte(d) && d.updatedAt && (Date.now() - Date.parse(d.updatedAt)) < SEPT_JOURS_MS))
    .filter((d) => !recherche || correspond(`${d.titre} ${d.detail} ${chambreDe(d.chambreId)?.numero || ''} ${hoteDe(d.sejourId)} ${libelleDe(POLES, d.pole)}`))
    .sort((a, b) => {
      if (vue !== 'a_traiter') return String(b.updatedAt).localeCompare(String(a.updatedAt));
      const ra = demandeEnRetard(a, maintenant) ? 0 : 1;
      const rb = demandeEnRetard(b, maintenant) ? 0 : 1;
      return (ra - rb) || (Number(b.escaladee) - Number(a.escaladee)) || (ORDRE_PRIORITE[a.priorite] - ORDRE_PRIORITE[b.priorite])
        || String(a.createdAt).localeCompare(String(b.createdAt));
    });
  const fiche = ficheId ? demandes.rows.find((d) => d.id === ficheId) || null : null;
  const nbParPole = (p) => demandes.rows.filter((d) => demandeOuverte(d) && (p === 'tous' || d.pole === p)).length;

  const changer = async (d, valeurs, message) => {
    const res = await demandes.modifier(d.id, valeurs);
    if (res.error) notify(res.error, 'error');
    else {
      if (message) notify(message, 'success');
      journal.reload();
    }
    return res;
  };

  const ongletsPoles = [{ id: 'tous', label: <><span>Tous</span>{nbParPole('tous') ? <><span aria-hidden="true"> </span><span>{nbParPole('tous')}</span></> : null}</> },
    ...POLES.map((p) => ({ id: p.id, label: <><span>{p.label}</span>{nbParPole(p.id) ? <><span aria-hidden="true"> </span><span>{nbParPole(p.id)}</span></> : null}</> }))];

  const etatLecture = demandes.status === 'absent' ? 'Les demandes ne sont pas encore activées sur la base de données.'
    : demandes.status === 'error' ? 'Les demandes n\'ont pas pu être lues. Nouvel essai en cours…' : null;

  return (
    <section className="demandes" style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, maxWidth: '100%' }}>
      {!etabId && <Vide>Aucun établissement sélectionné.</Vide>}
      {etabId && (
        <>
          <div className="module-actions">
            <button type="button" className="ui-btn ui-btn--primary" style={{ ...d.action, minHeight: 48, padding: '10px 16px', fontSize: 14 }} onClick={() => setForm({ demande: null })}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouvelle demande</span>
            </button>
            <SegmentedTabs size="sm" tabs={[{ id: 'a_traiter', label: 'À traiter' }, { id: 'faites', label: 'Faites et annulées' }]} active={vue} onChange={setVue} />
            <SearchToggle value={recherche} onChange={setRecherche} placeholder="Titre, chambre, hôte…" />
          </div>
          <SegmentedTabs tabs={ongletsPoles} active={pole} onChange={setPole} retourLigne />
          {etatLecture && <Vide>{etatLecture}</Vide>}
          {demandes.status === 'ready' && !liste.length && (
            <Vide>{vue === 'a_traiter' ? 'Rien à traiter pour ce pôle.' : 'Aucune demande faite ou annulée ces sept derniers jours.'}</Vide>
          )}
          {liste.length > 0 && (
            <Liste>
              {liste.map((dm) => (
                <LigneDemande key={dm.id} demande={dm} chambre={chambreDe(dm.chambreId)} hote={hoteDe(dm.sejourId)} maintenant={maintenant} onClick={() => setFicheId(dm.id)} />
              ))}
            </Liste>
          )}
        </>
      )}

      {form && (
        <DemandeForm
          demande={form.demande} chambres={trierChambres(chambres.rows.filter((c) => c.actif))} sejours={sejours.rows} demandes={demandes}
          etabId={etabId} roleParDefaut={poleDuRole(role)} aujourdhui={aujourdhui} user={user}
          onClose={() => setForm(null)}
          onCree={() => journal.reload()}
        />
      )}
      {fiche && !form && (
        <DemandeFiche
          demande={fiche} chambre={chambreDe(fiche.chambreId)} hote={hoteDe(fiche.sejourId)} equipe={equipe} journal={journal} user={user}
          peutSupprimer={peutSupprimer} maintenant={maintenant}
          onModifier={() => setForm({ demande: fiche })}
          onChanger={changer}
          onSupprimer={async () => { const r = await demandes.supprimer(fiche.id); if (r.error) notify(r.error, 'error'); else { notify('Demande supprimée.', 'success'); setFicheId(null); } }}
          onClose={() => setFicheId(null)}
        />
      )}
    </section>
  );
}

function LigneDemande({ demande: dm, chambre, hote, maintenant, onClick }) {
  const retard = demandeEnRetard(dm, maintenant);
  return (
    <button type="button" className="tdb-lien" style={{ ...h.ligne, ...(dm.escaladee || retard ? { borderColor: 'var(--danger-bd)' } : null) }} onClick={onClick} data-demande={dm.id}>
      <span style={h.ligneGauche}>
        <span style={h.nomHote} data-no-translate>{dm.titre}</span>
        <span style={h.detail}>
          <span>{libelleDe(POLES, dm.pole)}</span>
          {chambre && <><span aria-hidden="true"> </span><span>Chambre</span> <span data-no-translate>{chambre.numero}</span></>}
          {hote && <><span aria-hidden="true"> </span><span data-no-translate>{hote}</span></>}
          {dm.assigneeA && <><span aria-hidden="true"> </span><span data-no-translate>{nomPersonne(dm.assigneeA)}</span></>}
          {dm.echeance && <><span aria-hidden="true"> </span><span style={retard ? { color: 'var(--danger-text)', fontWeight: 500 } : null}>{retard ? 'En retard' : 'Pour le'}</span> <span data-no-translate>{dateHeureZurich(dm.echeance)}</span></>}
        </span>
      </span>
      <span style={h.ligneDroite}>
        {dm.escaladee && <Puce ton="danger">Escaladée</Puce>}
        {dm.priorite !== 'normale' && <Puce ton={tonDe(PRIORITES, dm.priorite)}>{libelleDe(PRIORITES, dm.priorite)}</Puce>}
        <Puce ton={tonDe(STATUTS_DEMANDE, dm.statut)}>{libelleDe(STATUTS_DEMANDE, dm.statut)}</Puce>
        <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text3)' }} />
      </span>
    </button>
  );
}

// « 2026-10-28T14:00 » local Zurich pour un champ datetime-local, depuis un ISO UTC.
function versLocal(iso) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const v = (t) => parts.find((p) => p.type === t)?.value;
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}
// L'inverse : une heure saisie à Zurich devient un ISO UTC (décalage lu sur la date même).
function versIso(local) {
  if (!local) return null;
  const [date, heure] = local.split('T');
  const [y, m, j] = date.split('-').map(Number);
  const [hh, mm] = heure.split(':').map(Number);
  const utcDevine = Date.UTC(y, m - 1, j, hh, mm);
  const zurich = new Date(new Date(utcDevine).toLocaleString('en-US', { timeZone: 'Europe/Zurich' }));
  const decalage = zurich.getTime() - new Date(new Date(utcDevine).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(utcDevine - decalage).toISOString();
}

function DemandeForm({ demande, chambres, sejours, demandes, etabId, roleParDefaut, aujourdhui, user, onClose, onCree }) {
  const [f, setF] = React.useState(() => demande
    ? { ...demande, chambreId: demande.chambreId || '', sejourId: demande.sejourId || '', echeanceLocale: versLocal(demande.echeance) }
    : { titre: '', detail: '', origine: 'hote', pole: roleParDefaut && roleParDefaut !== 'reception' ? 'reception' : 'etages', priorite: 'normale', chambreId: '', sejourId: '', echeanceLocale: '', photoUrl: null });
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const sejoursDeLaChambre = f.chambreId
    ? sejours.filter((s) => s.chambreId === f.chambreId && (s.statut === 'prevu' || s.statut === 'en_maison' || s.depart >= aujourdhui)).slice(0, 20)
    : [];

  const enregistrer = async () => {
    setErreur('');
    if (!f.titre.trim()) { setErreur('Dis en quelques mots ce qui est demandé.'); return; }
    setEnCours(true);
    const valeurs = {
      titre: f.titre.trim(), detail: f.detail.trim() || null, origine: f.origine, pole: f.pole, priorite: f.priorite,
      chambre_id: f.chambreId || null, sejour_id: f.sejourId || null, echeance: versIso(f.echeanceLocale), photo_url: f.photoUrl || null,
    };
    const res = demande ? await demandes.modifier(demande.id, valeurs) : await demandes.inserer({ ...valeurs, cree_par: user?.id || null });
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(demande ? 'Demande modifiée.' : 'Demande envoyée au pôle.', 'success');
    onCree?.();
    onClose();
  };

  const televerser = async (file) => {
    try {
      const bridge = dbService.getDb();
      const { url } = await bridge.uploadRecettePhoto({ etabId, type: 'demande', id: demande?.id || `nouvelle-${Date.now()}`, file });
      setF((p) => ({ ...p, photoUrl: url }));
    } catch (err) {
      notify(`Envoi de la photo impossible. ${messageErreurApp(err, 'demandes')}`, 'error');
    }
  };

  return (
    <Fenetre
      id="demande-form"
      titre={demande ? 'Modifier la demande' : 'Nouvelle demande'}
      onClose={onClose}
      largeur={560}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : demande ? 'Enregistrer' : 'Envoyer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Demande" large>
          <input style={h.saisie} value={f.titre} onChange={champ('titre')} autoFocus placeholder="Oreiller en plus, douche qui fuit…" />
        </Champ>
        <Champ label="Pour quel pôle">
          <select style={h.saisie} value={f.pole} onChange={champ('pole')}>
            {POLES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Qui demande">
          <select style={h.saisie} value={f.origine} onChange={champ('origine')}>
            <option value="hote">Un hôte</option>
            <option value="collegue">Un collègue</option>
          </select>
        </Champ>
        <Champ label="Priorité">
          <select style={h.saisie} value={f.priorite} onChange={champ('priorite')}>
            {PRIORITES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Pour quand">
          <input type="datetime-local" style={h.saisie} value={f.echeanceLocale} onChange={champ('echeanceLocale')} />
        </Champ>
        <Champ label="Chambre">
          <select style={h.saisie} value={f.chambreId} onChange={(ev) => setF((p) => ({ ...p, chambreId: ev.target.value, sejourId: '' }))}>
            <option value="">Sans chambre</option>
            {chambres.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
          </select>
        </Champ>
        <Champ label="Séjour">
          <select style={h.saisie} value={f.sejourId} onChange={champ('sejourId')} disabled={!f.chambreId}>
            <option value="">Aucun séjour</option>
            {sejoursDeLaChambre.map((s) => <option key={s.id} value={s.id}>{s.nomHote} ({dateCourte(s.arrivee)})</option>)}
          </select>
        </Champ>
        <Champ label="Détail" large>
          <textarea style={{ ...h.saisie, minHeight: 64 }} value={f.detail} onChange={champ('detail')} />
        </Champ>
        <Champ label="Photo" large>
          <PhotoUploader photoUrl={f.photoUrl} size={72} onUpload={televerser} onRemove={() => setF((p) => ({ ...p, photoUrl: null }))} />
        </Champ>
      </div>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function DemandeFiche({ demande: dm, chambre, hote, equipe, journal, user, peutSupprimer, maintenant, onModifier, onChanger, onSupprimer, onClose }) {
  const [enCours, setEnCours] = React.useState('');
  const lignes = journal.rows.filter((l) => l.demandeId === dm.id);
  const retard = demandeEnRetard(dm, maintenant);
  const lancer = async (nom, valeurs, message, fermer = false) => {
    setEnCours(nom);
    const res = await onChanger(dm, valeurs, message);
    setEnCours('');
    if (!res?.error && fermer) onClose();
  };
  const detailJournal = (l) => {
    if (l.action === 'statut') return libelleDe(STATUTS_DEMANDE, l.detail);
    if (l.action === 'assignation') return l.detail ? nomPersonne(l.detail) : 'personne';
    if (l.action === 'escalade') return l.detail === 'oui' ? 'oui' : 'non';
    if (l.action === 'echeance') return l.detail ? dateHeureZurich(l.detail) : 'aucune';
    if (l.action === 'pole' || l.action === 'creee') return libelleDe(POLES, l.detail);
    return l.detail || '';
  };
  return (
    <Fenetre
      id="demande-fiche"
      titre={<span data-no-translate>{dm.titre}</span>}
      sousTitre={<><span>{libelleDe(POLES, dm.pole)}</span>{dm.origine === 'hote' ? <> <span>(demande d'un hôte)</span></> : <> <span>(demande d'un collègue)</span></>}</>}
      onClose={onClose}
      largeur={560}
      pied={(
        <>
          {peutSupprimer && <button type="button" style={st.secondaire} onClick={onSupprimer} disabled={!!enCours}>Supprimer</button>}
          {demandeOuverte(dm) && <button type="button" style={st.secondaire} onClick={() => lancer('annuler', { statut: 'annulee' }, 'Demande annulée.', true)} disabled={!!enCours}>Annuler la demande</button>}
          <button type="button" style={st.secondaire} onClick={onModifier} disabled={!!enCours}>Modifier</button>
          {demandeOuverte(dm) && !dm.escaladee && (
            <button type="button" style={st.secondaire} onClick={() => lancer('escalader', { escaladee: true }, 'Demande escaladée.')} disabled={!!enCours}>Escalader</button>
          )}
          {dm.statut === 'ouverte' && (
            <button type="button" style={st.primaire} onClick={() => lancer('prendre', { statut: 'en_cours', assignee_a: user?.id || null }, 'Demande prise.')} disabled={!!enCours}>Je prends</button>
          )}
          {demandeOuverte(dm) && (
            <button type="button" style={st.primaire} onClick={() => lancer('faire', { statut: 'faite' }, 'Demande faite.', true)} disabled={!!enCours}>Faite</button>
          )}
          {!demandeOuverte(dm) && (
            <button type="button" style={st.secondaire} onClick={() => lancer('rouvrir', { statut: 'ouverte' }, 'Demande rouverte.')} disabled={!!enCours}>Rouvrir</button>
          )}
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Puce ton={tonDe(STATUTS_DEMANDE, dm.statut)}>{libelleDe(STATUTS_DEMANDE, dm.statut)}</Puce>
        <Puce ton={tonDe(PRIORITES, dm.priorite)}>{libelleDe(PRIORITES, dm.priorite)}</Puce>
        {dm.escaladee && <Puce ton="danger">Escaladée</Puce>}
        {retard && <Puce ton="danger">En retard</Puce>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {chambre && <Ligne label="Chambre"><span data-no-translate>{chambre.numero}</span></Ligne>}
        {hote && <Ligne label="Hôte"><span data-no-translate>{hote}</span></Ligne>}
        {dm.echeance && <Ligne label="Pour le"><span data-no-translate>{dateHeureZurich(dm.echeance)}</span></Ligne>}
        {dm.detail && <Ligne label="Détail"><span data-no-translate>{dm.detail}</span></Ligne>}
        {/* Seule une URL https (le bucket de l'app) devient un lien : jamais un
            texte saisi, la base l'impose aussi (demandes_photo_url_https). */}
        {dm.photoUrl && /^https:\/\//.test(dm.photoUrl) && <Ligne label="Photo"><a href={dm.photoUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Voir la photo</a></Ligne>}
        <Ligne label="Demandé par"><span data-no-translate>{nomPersonne(dm.creePar) || 'Système'}</span> <span data-no-translate>{dateHeureZurich(dm.createdAt)}</span></Ligne>
        {dm.faitePar && <Ligne label="Faite par"><span data-no-translate>{nomPersonne(dm.faitePar)}</span> <span data-no-translate>{dateHeureZurich(dm.faiteAt)}</span></Ligne>}
      </div>
      {demandeOuverte(dm) && (
        <Champ label="Chargée de la demande">
          <select style={h.saisie} value={dm.assigneeA || ''} onChange={(ev) => lancer('attribuer', { assignee_a: ev.target.value || null }, ev.target.value ? 'Demande attribuée.' : 'Attribution retirée.')} disabled={!!enCours}>
            <option value="">Personne</option>
            {equipe.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            {dm.assigneeA && !equipe.some((p) => p.id === dm.assigneeA) && <option value={dm.assigneeA}>{nomPersonne(dm.assigneeA)}</option>}
          </select>
        </Champ>
      )}
      <div>
        <div style={h.sousTitre}>Historique</div>
        {!lignes.length && <div style={h.detail}>Rien pour l'instant.</div>}
        {lignes.map((l) => (
          <div key={l.id} style={d.ligneJournal}>
            <span style={{ ...h.detail, fontVariantNumeric: 'tabular-nums' }} data-no-translate>{dateHeureZurich(l.at)}</span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}><span>{ACTIONS_DEMANDE[l.action] || l.action}</span> <span data-no-translate>{detailJournal(l)}</span></span>
            <span style={h.detail}>{l.par ? <span data-no-translate>{nomPersonne(l.par)}</span> : <span>Système</span>}</span>
          </div>
        ))}
      </div>
    </Fenetre>
  );
}

function Ligne({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', flex: '0 0 130px' }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text)', flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

const d = {
  action: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)',
    borderRadius: 'var(--r-sm)', cursor: 'pointer', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, flexShrink: 0,
  },
  ligneJournal: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid var(--border)' },
};
