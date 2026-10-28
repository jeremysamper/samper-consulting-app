import React from 'react';
import { CalendarDays, Plus, ScanLine, Ticket } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, Liste, Vide, h } from '../hebergement/hotelUi.jsx';
import {
  CATEGORIES_DROIT, STATUTS_INSCRIPTION, activitesDuJour, chf, dateCourte, droitsRestants, equipeDe, heureZurich, inscriptionsActives,
  isoZurich, jourZurich, libelleDe, nomPersonne, placesPrises, placesRestantes, sejoursActifs, tonDe, trouverSejour,
  useActivites, useChambres, useConsommations, useForfaitDroits, useForfaits, useInscriptions, useSejours,
} from '../hebergement/hotelData.js';
import ForfaitsGestion from './ForfaitsGestion.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Activités (branche Hôtel, lot H5) : le programme (une activité, ses places,
// ses inscrits, la présence), le pointage des consommations d'un séjour sur
// ses droits all inclusive (bracelet ou nom), et, pour la direction, les
// forfaits et leurs droits. Un écran par tâche sur le socle des parcours.
//
// Droits : toute l'équipe lit, inscrit et pointe (RLS idem) ; créer ou
// modifier une activité, supprimer une inscription ou une consommation
// demandent la case Modifier d'Activités ; les forfaits sont à la direction.
// ─────────────────────────────────────────────────────────────────────────────

const TITRES = { programme: 'Le programme', pointage: 'Séjour et consommations', forfaits: 'Les forfaits' };

function useAujourdhui() {
  const [jour, setJour] = React.useState(() => zurichToday());
  React.useEffect(() => {
    const id = setInterval(() => setJour(zurichToday()), 60000);
    return () => clearInterval(id);
  }, []);
  return jour;
}

const activiteVide = (jour) => ({ titre: '', description: '', lieu: '', jour, debut: '10:00', fin: '11:00', places: '', prix: '', inclusForfait: true, responsable: '', annulee: false });

function ActiviteForm({ activite, equipe, activites, aujourdhui, onClose }) {
  const [f, setF] = React.useState(() => (activite
    ? { ...activite, jour: jourZurich(activite.debut), debut: heureZurich(activite.debut), fin: heureZurich(activite.fin), places: activite.places == null ? '' : String(activite.places), prix: activite.prix ? String(activite.prix) : '', responsable: activite.responsable || '' }
    : activiteVide(aujourdhui)));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const enregistrer = async () => {
    setErreur('');
    if (!f.titre.trim()) { setErreur('Le titre est obligatoire.'); return; }
    if (!f.jour || !f.debut || !f.fin || f.fin <= f.debut) { setErreur('La fin doit suivre le début.'); return; }
    setEnCours(true);
    const valeurs = {
      titre: f.titre.trim(), description: f.description.trim() || null, lieu: f.lieu.trim() || null,
      debut: isoZurich(f.jour, f.debut), fin: isoZurich(f.jour, f.fin),
      places: String(f.places).trim() === '' ? null : Math.max(1, parseInt(f.places, 10) || 1),
      prix: Number(String(f.prix).replace(',', '.')) || 0, inclus_forfait: !!f.inclusForfait, responsable: f.responsable || null, annulee: !!f.annulee,
    };
    const res = activite ? await activites.modifier(activite.id, valeurs) : await activites.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(activite ? 'Activité modifiée.' : 'Activité créée.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="activite-form"
      titre={activite ? 'Modifier l\'activité' : 'Nouvelle activité'}
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
        <Champ label="Titre" large><input style={h.saisie} value={f.titre} onChange={champ('titre')} placeholder="Yoga au lever du soleil, dégustation, randonnée…" autoFocus /></Champ>
        <Champ label="Jour"><input type="date" style={h.saisie} value={f.jour} onChange={champ('jour')} /></Champ>
        <Champ label="Lieu"><input style={h.saisie} value={f.lieu} onChange={champ('lieu')} placeholder="Terrasse, spa, départ réception…" /></Champ>
        <Champ label="Début"><input type="time" style={h.saisie} value={f.debut} onChange={champ('debut')} /></Champ>
        <Champ label="Fin"><input type="time" style={h.saisie} value={f.fin} onChange={champ('fin')} /></Champ>
        <Champ label="Places (vide = sans limite)"><input type="number" min="1" inputMode="numeric" style={h.saisie} value={f.places} onChange={champ('places')} /></Champ>
        <Champ label="Prix par personne (CHF, 0 = inclus)"><input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={f.prix} onChange={champ('prix')} /></Champ>
        <Champ label="Responsable">
          <select style={h.saisie} value={f.responsable} onChange={champ('responsable')} data-no-translate>
            <option value="">{'Personne'}</option>
            {equipe.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
          </select>
        </Champ>
        <Champ label="Description" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.description} onChange={champ('description')} /></Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.inclusForfait} onChange={(ev) => setF((p) => ({ ...p, inclusForfait: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Incluse dans les forfaits</span>
      </label>
      {activite && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.annulee} onChange={(ev) => setF((p) => ({ ...p, annulee: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
          <span style={{ fontSize: 14, color: 'var(--text)' }}>Activité annulée</span>
        </label>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function ActiviteFiche({ activite: a, sejours, inscriptions, chambres, peutGerer, onModifier, onClose }) {
  const mesInscriptions = inscriptions.rows.filter((i) => i.activiteId === a.id);
  const restantes = placesRestantes(a, inscriptions.rows);
  const [sejourId, setSejourId] = React.useState('');
  const [nb, setNb] = React.useState(1);
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const nomSejour = (id) => sejours.find((s) => s.id === id)?.nomHote || '';
  const numero = (id) => { const s = sejours.find((x) => x.id === id); return chambres.find((c) => c.id === s?.chambreId)?.numero || ''; };
  const dejaInscrits = new Set(mesInscriptions.filter((i) => i.statut !== 'annule').map((i) => i.sejourId));
  const candidats = sejoursActifs(sejours).filter((s) => !dejaInscrits.has(s.id)).sort((x, y) => x.nomHote.localeCompare(y.nomHote, 'fr'));

  const lancer = async (travail, message) => {
    setErreur('');
    setEnCours(true);
    const r = await travail();
    setEnCours(false);
    if (r?.error) setErreur(r.error); else if (message) notify(message, 'success');
  };
  const inscrire = () => lancer(async () => {
    if (!sejourId) return { error: 'Choisis un séjour.' };
    const existante = mesInscriptions.find((i) => i.sejourId === sejourId);
    const r = existante
      ? await inscriptions.modifier(existante.id, { nb_personnes: nb, statut: 'inscrit' })
      : await inscriptions.inserer({ activite_id: a.id, sejour_id: sejourId, nb_personnes: nb });
    if (!r.error) { setSejourId(''); setNb(1); }
    return r;
  }, 'Séjour inscrit.');

  return (
    <Fenetre
      id="activite-fiche"
      titre={<span data-no-translate>{a.titre}</span>}
      sousTitre={<><span data-no-translate>{dateCourte(jourZurich(a.debut))}, {heureZurich(a.debut)} - {heureZurich(a.fin)}</span>{a.lieu && <>, <span data-no-translate>{a.lieu}</span></>}{a.annulee && <> <Puce ton="danger">Annulée</Puce></>}</>}
      onClose={onClose}
      largeur={620}
      pied={peutGerer ? <button type="button" style={st.primaire} onClick={() => onModifier(a)}>Modifier</button> : null}
    >
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Puce ton={a.prix ? 'neutre' : 'success'}>{a.prix ? <><span data-no-translate>CHF {chf(a.prix)}</span> <span>par personne</span></> : 'Incluse'}</Puce>
        {a.places != null
          ? <Puce ton={restantes === 0 ? 'danger' : 'info'}><span data-no-translate>{placesPrises(a, inscriptions.rows)} / {a.places}</span> <span>places</span></Puce>
          : <Puce ton="info"><span data-no-translate>{placesPrises(a, inscriptions.rows)}</span> <span>inscrits, sans limite</span></Puce>}
        {a.responsable && <span style={h.detail}><span>Responsable :</span> <span data-no-translate>{nomPersonne(a.responsable)}</span></span>}
      </div>
      {a.description && <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.45 }} data-no-translate>{a.description}</div>}

      <div>
        <div style={h.sousTitre}>Inscrits</div>
        {!mesInscriptions.length && <div style={h.detail}>Personne n'est encore inscrit.</div>}
        {mesInscriptions.map((i) => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' }}>
            <span style={{ flex: '1 1 160px', minWidth: 0 }}>
              <span style={{ fontSize: 14, color: 'var(--text)' }} data-no-translate>{nomSejour(i.sejourId)}</span>
              <span style={h.detail}> {numero(i.sejourId) && <><span>ch.</span> <span data-no-translate>{numero(i.sejourId)}</span>, </>}<span data-no-translate>{i.nbPersonnes}</span> <span>{i.nbPersonnes > 1 ? 'personnes' : 'personne'}</span></span>
            </span>
            <Puce ton={tonDe(STATUTS_INSCRIPTION, i.statut)}>{libelleDe(STATUTS_INSCRIPTION, i.statut)}</Puce>
            {i.statut === 'inscrit' && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 36, padding: '4px 10px', fontSize: 12 }} onClick={() => lancer(() => inscriptions.modifier(i.id, { statut: 'present' }), 'Présence notée.')} disabled={enCours}>Présent</button>}
            {i.statut !== 'annule' && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 36, padding: '4px 10px', fontSize: 12 }} onClick={() => lancer(() => inscriptions.modifier(i.id, { statut: 'annule' }), 'Inscription annulée.')} disabled={enCours}>Annuler</button>}
            {i.statut === 'annule' && peutGerer && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 36, padding: '4px 10px', fontSize: 12 }} onClick={() => lancer(() => inscriptions.supprimer(i.id), 'Inscription supprimée.')} disabled={enCours}>Supprimer</button>}
          </div>
        ))}
      </div>

      {!a.annulee && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <Champ label="Inscrire un séjour">
              <select style={h.saisie} value={sejourId} onChange={(ev) => setSejourId(ev.target.value)} data-no-translate>
                <option value="">{'Choisir…'}</option>
                {candidats.map((s) => <option key={s.id} value={s.id}>{s.nomHote}{s.identifiant ? ` (${s.identifiant})` : ''}</option>)}
              </select>
            </Champ>
          </div>
          <div style={{ flex: '0 0 90px' }}>
            <Champ label="Personnes"><input type="number" min="1" max="50" inputMode="numeric" style={h.saisie} value={nb} onChange={(ev) => setNb(Math.max(1, parseInt(ev.target.value, 10) || 1))} /></Champ>
          </div>
          <button type="button" style={st.secondaire} onClick={inscrire} disabled={enCours || restantes === 0}>Inscrire</button>
        </div>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function Pointage({ sejours, chambres, forfaits, droits, consommations, activites, inscriptions, aujourdhui, peutGerer }) {
  const [texte, setTexte] = React.useState('');
  const [sejourId, setSejourId] = React.useState(null);
  const [libre, setLibre] = React.useState('');
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const resultats = trouverSejour(sejours, texte);
  const sejour = sejourId ? sejours.find((s) => s.id === sejourId) || null : resultats.length === 1 ? resultats[0] : null;
  const forfait = sejour ? forfaits.find((f) => f.id === sejour.forfaitId) || null : null;
  const etats = sejour ? droitsRestants(droits, consommations.rows, sejour, aujourdhui) : [];
  const miennes = sejour ? consommations.rows.filter((c) => c.sejourId === sejour.id && c.jour === aujourdhui) : [];
  const mesActivites = sejour ? inscriptions.rows.filter((i) => i.sejourId === sejour.id && i.statut !== 'annule').map((i) => ({ i, a: activites.find((a) => a.id === i.activiteId) })).filter((x) => x.a && jourZurich(x.a.debut) >= aujourdhui).sort((x, y) => x.a.debut.localeCompare(y.a.debut)) : [];
  const numero = (s) => chambres.find((c) => c.id === s.chambreId)?.numero || '';

  const pointer = async (etat, libelle) => {
    setErreur('');
    setEnCours(true);
    const r = await consommations.inserer({ sejour_id: sejour.id, droit_id: etat ? etat.droit.id : null, libelle: etat ? etat.droit.libelle : libelle, quantite: 1, jour: aujourdhui });
    setEnCours(false);
    if (r.error) { setErreur(r.error); return; }
    notify('Consommation pointée.', 'success');
    setLibre('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="module-actions">
        <input style={{ ...h.saisie, maxWidth: 360 }} value={texte} onChange={(ev) => { setTexte(ev.target.value); setSejourId(null); }} placeholder="Numéro de bracelet ou nom de l'hôte" autoFocus />
      </div>
      {!sejour && texte && !resultats.length && <Vide>Aucun séjour actif ne correspond.</Vide>}
      {!sejour && resultats.length > 1 && (
        <Liste>
          {resultats.slice(0, 20).map((s) => (
            <button key={s.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => setSejourId(s.id)}>
              <span style={h.nomHote} data-no-translate>{s.nomHote}</span>
              <span style={h.detail}>{s.identifiant && <span data-no-translate>{s.identifiant}</span>}{numero(s) && <> <span>ch.</span> <span data-no-translate>{numero(s)}</span></>}</span>
            </button>
          ))}
        </Liste>
      )}
      {sejour && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-serif)' }} data-no-translate>{sejour.nomHote}</span>
            {sejour.identifiant && <Puce ton="info"><span data-no-translate>{sejour.identifiant}</span></Puce>}
            {numero(sejour) && <span style={h.detail}><span>Chambre</span> <span data-no-translate>{numero(sejour)}</span></span>}
            <span style={h.detail} data-no-translate>{dateCourte(sejour.arrivee)} - {dateCourte(sejour.depart)}</span>
            {forfait ? <Puce ton="success"><span data-no-translate>{forfait.nom}</span></Puce> : <Puce ton="neutre">Sans forfait</Puce>}
          </div>
          {forfait && (
            <div>
              <div style={h.sousTitre}>Droits du forfait</div>
              {!etats.length && <div style={h.detail}>Ce forfait n'a pas encore de droits.</div>}
              {etats.map((e) => (
                <div key={e.droit.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' }}>
                  <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: 'var(--text)' }} data-no-translate>{e.droit.libelle}</span>
                    <span style={{ ...h.detail, display: 'block' }}>
                      <span>{libelleDe(CATEGORIES_DROIT, e.droit.categorie)}</span>
                      {e.droit.quantiteParSejour != null && <>, <span data-no-translate>{e.surSejour} / {e.droit.quantiteParSejour}</span> <span>sur le séjour</span></>}
                      {e.droit.quantiteParJour != null && <>, <span data-no-translate>{e.surJour} / {e.droit.quantiteParJour}</span> <span>aujourd'hui</span></>}
                      {e.droit.quantiteParSejour == null && e.droit.quantiteParJour == null && <>, <span>sans limite</span>{e.surJour ? <>, <span data-no-translate>{e.surJour}</span> <span>aujourd'hui</span></> : null}</>}
                    </span>
                  </span>
                  {e.epuise ? <Puce ton="danger">Épuisé</Puce> : <Btn variant="primary" onClick={() => pointer(e)} disabled={enCours} style={{ minHeight: 44 }}>Pointer</Btn>}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <Champ label="Autre consommation"><input style={h.saisie} value={libre} onChange={(ev) => setLibre(ev.target.value)} placeholder="Serviette de piscine, location de vélo…" /></Champ>
            </div>
            <button type="button" style={st.secondaire} onClick={() => libre.trim() && pointer(null, libre.trim())} disabled={enCours || !libre.trim()}>Pointer</button>
          </div>
          {mesActivites.length > 0 && (
            <div>
              <div style={h.sousTitre}>Itinéraire</div>
              {mesActivites.map(({ i, a }) => (
                <div key={i.id} style={{ ...h.detail, padding: '4px 0', fontSize: 14, color: 'var(--text)' }}>
                  <span data-no-translate>{dateCourte(jourZurich(a.debut))} {heureZurich(a.debut)}</span> <span data-no-translate>{a.titre}</span>{a.lieu && <>, <span data-no-translate>{a.lieu}</span></>} <span style={h.detail}>(<span data-no-translate>{i.nbPersonnes}</span> <span>{i.nbPersonnes > 1 ? 'personnes' : 'personne'}</span>)</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <div style={h.sousTitre}>Pointé aujourd'hui</div>
            {!miennes.length && <div style={h.detail}>Rien de pointé aujourd'hui.</div>}
            {miennes.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 14, color: 'var(--text)' }}>
                <span style={h.detail} data-no-translate>{heureZurich(c.at)}</span>
                <span style={{ flex: '1 1 120px' }} data-no-translate>{c.libelle}{c.quantite !== 1 ? ` x ${c.quantite}` : ''}</span>
                <span style={h.detail} data-no-translate>{nomPersonne(c.par)}</span>
                {peutGerer && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 32, padding: '4px 8px', fontSize: 12 }} onClick={async () => { const r = await consommations.supprimer(c.id); if (r.error) setErreur(r.error); else notify('Consommation retirée.', 'success'); }}>Retirer</button>}
              </div>
            ))}
          </div>
        </>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </div>
  );
}

export default function Activites({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const peutGerer = canManageModule(role, 'activites');
  const direction = role === 'consultant' || role === 'patron';
  const aujourdhui = useAujourdhui();

  const activites = useActivites(etabId);
  const inscriptions = useInscriptions(etabId);
  const consommations = useConsommations(etabId);
  const forfaits = useForfaits(etabId);
  const droits = useForfaitDroits(etabId);
  const sejours = useSejours(etabId);
  const chambres = useChambres(etabId);
  const equipe = React.useMemo(() => equipeDe(etabId), [etabId]);

  const ecransRepris = direction ? ['programme', 'pointage', 'forfaits'] : ['programme', 'pointage'];
  const { ecran, setEcran, retourAccueil } = useEcranModule('activites', { repris: ecransRepris });
  const [jour, setJour] = React.useState(aujourdhui);
  const [form, setForm] = React.useState(null); // { activite }
  const [ficheId, setFicheId] = React.useState(null);
  const [recherche, setRecherche] = React.useState('');

  const duJour = activitesDuJour(activites.rows, aujourdhui).filter((a) => !a.annulee);
  const aVenir = activites.rows.filter((a) => !a.annulee && jourZurich(a.debut) > jour && jourZurich(a.debut) <= zurichAjouterJours(jour, 7));
  const choisies = activitesDuJour(activites.rows, jour).filter((a) => !recherche || a.titre.toLowerCase().includes(recherche.toLowerCase()) || (a.lieu || '').toLowerCase().includes(recherche.toLowerCase()));
  const fiche = ficheId ? activites.rows.find((a) => a.id === ficheId) || null : null;
  const inscritsDuJour = duJour.reduce((n, a) => n + placesPrises(a, inscriptions.rows), 0);

  const etat = (n, un, plusieurs) => <><span>{n}</span> <span>{n === 1 ? un : plusieurs}</span></>;
  const tuiles = [
    { id: 'programme', libelle: 'Programme', Icone: CalendarDays, etat: <>{etat(duJour.length, 'activité aujourd\'hui', 'activités aujourd\'hui')}<span aria-hidden="true"> </span>{etat(inscritsDuJour, 'inscrit', 'inscrits')}</>, onClick: () => { setJour(aujourdhui); setEcran('programme'); } },
    { id: 'nouvelle', libelle: 'Nouvelle activité', Icone: Plus, visible: peutGerer, onClick: () => setForm({ activite: null }) },
    { id: 'pointage', libelle: 'Pointer une consommation', Icone: ScanLine, etat: etat(consommations.rows.filter((c) => c.jour === aujourdhui).length, 'pointage aujourd\'hui', 'pointages aujourd\'hui'), onClick: () => setEcran('pointage') },
    { id: 'forfaits', libelle: 'Forfaits', Icone: Ticket, visible: direction, etat: etat(forfaits.rows.filter((f) => f.actif).length, 'forfait actif', 'forfaits actifs'), onClick: () => setEcran('forfaits') },
  ];

  const ligneActivite = (a) => {
    const restantes = placesRestantes(a, inscriptions.rows);
    return (
      <button key={a.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => setFicheId(a.id)} data-activite={a.id}>
        <span style={h.ligneGauche}>
          <span style={h.nomHote} data-no-translate>{a.titre}</span>
          <span style={h.detail}><span data-no-translate>{heureZurich(a.debut)} - {heureZurich(a.fin)}</span>{a.lieu && <>, <span data-no-translate>{a.lieu}</span></>}{a.responsable && <>, <span data-no-translate>{nomPersonne(a.responsable)}</span></>}</span>
        </span>
        <span style={h.ligneDroite}>
          {a.annulee && <Puce ton="danger">Annulée</Puce>}
          {!a.annulee && (a.places != null
            ? <Puce ton={restantes === 0 ? 'danger' : 'info'}><span data-no-translate>{placesPrises(a, inscriptions.rows)} / {a.places}</span></Puce>
            : <Puce ton="info"><span data-no-translate>{placesPrises(a, inscriptions.rows)}</span> <span>inscrits</span></Puce>)}
          {a.prix > 0 && <span style={h.detail} data-no-translate>CHF {chf(a.prix)}</span>}
        </span>
      </button>
    );
  };

  const etatLecture = activites.status === 'absent' ? 'Les activités ne sont pas encore activées sur la base de données.'
    : activites.status === 'error' ? 'Les activités n\'ont pas pu être lues. Nouvel essai en cours…' : null;

  return (
    <section className="activites" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
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
          actions={peutGerer && ecran === 'programme' ? (
            <Btn variant="primary" onClick={() => setForm({ activite: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouvelle activité</span>
            </Btn>
          ) : null}
        />
      )}

      {etabId && ecran === 'programme' && (
        <>
          <div className="module-actions">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
              <span>Jour</span>
              <input type="date" style={{ ...h.saisie, width: 'auto' }} value={jour} onChange={(ev) => ev.target.value && setJour(ev.target.value)} />
            </label>
            <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 44 }} onClick={() => setJour(aujourdhui)}>Aujourd'hui</button>
            <SearchToggle value={recherche} onChange={setRecherche} placeholder="Titre, lieu…" />
          </div>
          {choisies.length ? <Liste>{choisies.map(ligneActivite)}</Liste> : <Vide>Aucune activité ce jour.</Vide>}
          {aVenir.length > 0 && (
            <>
              <div style={h.sousTitre}>Les sept prochains jours</div>
              <Liste>{aVenir.slice(0, 50).map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...h.detail, flex: '0 0 80px' }} data-no-translate>{dateCourte(jourZurich(a.debut))}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>{ligneActivite(a)}</div>
                </div>
              ))}</Liste>
            </>
          )}
        </>
      )}
      {etabId && ecran === 'pointage' && (
        <Pointage sejours={sejours.rows} chambres={chambres.rows} forfaits={forfaits.rows} droits={droits.rows} consommations={consommations} activites={activites.rows} inscriptions={inscriptions} aujourdhui={aujourdhui} peutGerer={peutGerer} />
      )}
      {etabId && ecran === 'forfaits' && direction && (
        <ForfaitsGestion forfaits={forfaits} droits={droits} />
      )}

      {form && <ActiviteForm activite={form.activite} equipe={equipe} activites={activites} aujourdhui={aujourdhui} onClose={() => setForm(null)} />}
      {fiche && !form && (
        <ActiviteFiche activite={fiche} sejours={sejours.rows} inscriptions={inscriptions} chambres={chambres.rows} peutGerer={peutGerer} onModifier={(a) => setForm({ activite: a })} onClose={() => setFicheId(null)} />
      )}
    </section>
  );
}

export { inscriptionsActives };
