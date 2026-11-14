import React from 'react';
import { Btn, Panneau, ligneStyle } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { roles as ROLES } from '../moduleConfig.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import {
  ACTIONS, AJUSTEMENT_MAX, BAREME_DEFAUT, LIBELLES_STATUTS, PLAFOND_MAX, POINTS_MAX, ROLES_PARTICIPANTS,
  baremeEffectif, erreurBareme, libelleAction,
} from './bareme.js';
import { messageErreurPoints, pointsService } from './pointsService.js';
import { rafraichirPointsEtat } from './pointsEtat.js';
import { NombrePoints, dateCourte } from './MesPoints.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Gestion des points (qui gère « points », défaut consultant et patron) :
// commandes à traiter, catalogue de la boutique, soldes de l'équipe avec
// exclusion et ajustement, réglages (activation, rôles participants, barème).
// Chaque écran ne propose que ce que la base accepte (RPC points_*).
// ─────────────────────────────────────────────────────────────────────────────

const nomPersonne = (p) => [p?.prenom, p?.nom].filter(Boolean).join(' ') || 'Personne sans nom';
const libelleRole = (r) => ROLES[r]?.label || r || '';
const ligne = { ...ligneStyle(), flexWrap: 'wrap', padding: '6px 0' };

function useDonneesGestion(etabId) {
  const [donnees, setDonnees] = React.useState(null);
  const [echec, setEchec] = React.useState(false);
  const lectures = useOrdreLectures();
  const charger = React.useCallback(async () => {
    if (!etabId) return;
    const lecture = lectures.lancer(etabId);
    try {
      const [soldes, commandes, cadeaux] = await Promise.all([
        pointsService.soldes(etabId),
        pointsService.commandes(etabId),
        pointsService.cadeaux(etabId),
      ]);
      if (!lecture.appliquer()) return;
      setDonnees({ soldes, commandes, cadeaux });
      setEchec(false);
    } catch (err) {
      console.warn('[points] gestion', err);
      if (lecture.signalerEchec()) setEchec(true);
    }
  }, [etabId, lectures]);
  React.useEffect(() => { charger(); }, [charger]);
  return { donnees, echec, charger };
}

// ─── Commandes ──────────────────────────────────────────────────────────────

function OngletCommandes({ donnees, charger }) {
  const [aRefuser, setARefuser] = React.useState(null);
  const [note, setNote] = React.useState('');
  const [envoi, setEnvoi] = React.useState(false);
  const personne = (id) => donnees.soldes.find((p) => p.userId === id);
  const cadeau = (id) => donnees.cadeaux.find((c) => c.id === id);
  const aTraiter = donnees.commandes.filter((k) => k.statut === 'demandee');
  const traitees = donnees.commandes.filter((k) => k.statut !== 'demandee').slice(0, 50);

  const traiter = async (k, statut, noteTexte = null) => {
    setEnvoi(true);
    try {
      await pointsService.traiterCommande(k.id, statut, noteTexte);
      notify(statut === 'remise' ? 'Cadeau remis.' : 'Commande refusée : les points sont rendus.', 'success');
      setARefuser(null);
      setNote('');
      charger();
    } catch (err) {
      notify(messageErreurPoints(err), 'error');
    } finally {
      setEnvoi(false);
    }
  };

  const LigneCommande = ({ k, actions }) => (
    <div style={ligne}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontWeight: 'var(--g2)', overflowWrap: 'anywhere' }} data-no-translate>{cadeau(k.cadeauId)?.nom || 'Cadeau retiré'}</div>
        <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>
          <span data-no-translate>{nomPersonne(personne(k.userId))}</span>{' '}
          <span data-no-translate>{dateCourte(k.createdAt)}</span>
          {!actions && <>{' '}<span>{LIBELLES_STATUTS[k.statut] || k.statut}</span></>}
          {k.note && <>{' '}<span data-no-translate>{k.note}</span></>}
        </div>
      </div>
      <NombrePoints n={k.cout} />
      {actions}
    </div>
  );

  return (
    <>
      <Panneau>
        <h2 className="points-section-titre">À traiter</h2>
        {aTraiter.length === 0 ? (
          <p className="points-aide">Aucune commande en attente.</p>
        ) : (
          <div className="points-liste">
            {aTraiter.map((k) => (
              <LigneCommande key={k.id} k={k} actions={(
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn onClick={() => traiter(k, 'remise')} disabled={envoi} style={{ minHeight: 44 }}>Remettre</Btn>
                  <Btn onClick={() => { setARefuser(k); setNote(''); }} disabled={envoi} style={{ minHeight: 44 }}>Refuser</Btn>
                </div>
              )} />
            ))}
          </div>
        )}
      </Panneau>
      {traitees.length > 0 && (
        <Panneau>
          <h2 className="points-section-titre">Traitées</h2>
          <div className="points-liste">
            {traitees.map((k) => <LigneCommande key={k.id} k={k} actions={null} />)}
          </div>
        </Panneau>
      )}
      {aRefuser && (
        <Fenetre
          id="points-refuser"
          titre="Refuser la commande ?"
          sousTitre="Les points sont rendus et le cadeau revient en stock."
          onClose={() => setARefuser(null)}
          pied={(
            <>
              <button type="button" style={st.secondaire} onClick={() => setARefuser(null)}>Annuler</button>
              <button type="button" style={st.primaire} disabled={envoi} onClick={() => traiter(aRefuser, 'refusee', note)}>Refuser</button>
            </>
          )}
        >
          <label style={st.label} htmlFor="points-note-refus">Note pour la personne (facultatif)</label>
          <input id="points-note-refus" style={st.champ} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Fenetre>
      )}
    </>
  );
}

// ─── Boutique ───────────────────────────────────────────────────────────────

const CADEAU_VIDE = { nom: '', description: '', cout: '', stock: '', actif: true };

function OngletBoutique({ etabId, donnees, charger }) {
  const [edition, setEdition] = React.useState(null);
  const [envoi, setEnvoi] = React.useState(false);
  const commandes = (id) => donnees.commandes.some((k) => k.cadeauId === id);

  const enregistrer = async () => {
    const cout = Number(edition.cout);
    const stock = edition.stock === '' || edition.stock == null ? null : Number(edition.stock);
    if (!String(edition.nom || '').trim()) { notify('Donnez un nom au cadeau.', 'warning'); return; }
    if (!Number.isInteger(cout) || cout <= 0) { notify('Le coût est un nombre entier de points, au moins 1.', 'warning'); return; }
    if (stock != null && (!Number.isInteger(stock) || stock < 0)) { notify('Le stock est un nombre entier, ou vide pour illimité.', 'warning'); return; }
    setEnvoi(true);
    try {
      await pointsService.enregistrerCadeau(etabId, { ...edition, cout, stock });
      notify('Cadeau enregistré.', 'success');
      setEdition(null);
      charger();
    } catch (err) {
      notify(messageErreurPoints(err), 'error');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async () => {
    if (!edition?.id) return;
    if (commandes(edition.id)) {
      notify('Ce cadeau a déjà été commandé : décochez « Proposé en boutique » pour le retirer.', 'warning');
      return;
    }
    if (!window.confirm('Supprimer ce cadeau de la boutique ?')) return;
    setEnvoi(true);
    try {
      await pointsService.supprimerCadeau(edition.id);
      notify('Cadeau supprimé.', 'success');
      setEdition(null);
      charger();
    } catch (err) {
      notify(err?.code === '23503'
        ? 'Ce cadeau a déjà été commandé : décochez « Proposé en boutique » pour le retirer.'
        : messageErreurPoints(err), 'error');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p className="points-aide" style={{ flex: '1 1 260px' }}>Un cadeau en nature peut compter comme salaire au-delà d'un petit montant : à vérifier avec la fiduciaire.</p>
        <Btn variant="primary" onClick={() => setEdition({ ...CADEAU_VIDE })} style={{ minHeight: 44 }}>Ajouter un cadeau</Btn>
      </div>
      <Panneau>
        <h2 className="points-section-titre">Catalogue</h2>
        {donnees.cadeaux.length === 0 ? (
          <p className="points-aide">Aucun cadeau pour l'instant. « Ajouter un cadeau » ouvre la fiche.</p>
        ) : (
          <div className="points-liste">
            {donnees.cadeaux.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEdition({ ...c, stock: c.stock == null ? '' : String(c.stock), cout: String(c.cout) })}
                style={{ ...ligne, width: '100%', background: 'transparent', borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderRadius: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', minHeight: 'var(--ligne-aeree)' }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 'var(--g2)', overflowWrap: 'anywhere' }} data-no-translate>{c.nom}</div>
                  <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>
                    {c.stock == null ? <span>Stock illimité</span> : <><span>En stock :</span>{' '}<span data-no-translate>{c.stock}</span></>}
                    {!c.actif && <>{' '}<span>Retiré de la boutique</span></>}
                  </div>
                </div>
                <NombrePoints n={c.cout} />
              </button>
            ))}
          </div>
        )}
      </Panneau>
      {edition && (
        <Fenetre
          id="points-cadeau"
          titre={edition.id ? 'Modifier le cadeau' : 'Nouveau cadeau'}
          onClose={() => setEdition(null)}
          pied={(
            <>
              {edition.id && <button type="button" style={{ ...st.secondaire, marginRight: 'auto', color: 'var(--danger-text)' }} disabled={envoi} onClick={supprimer}>Supprimer</button>}
              <button type="button" style={st.secondaire} onClick={() => setEdition(null)}>Annuler</button>
              <button type="button" style={st.primaire} disabled={envoi} onClick={enregistrer}>Enregistrer</button>
            </>
          )}
        >
          <label style={st.label} htmlFor="points-cadeau-nom">Nom</label>
          <input id="points-cadeau-nom" style={st.champ} value={edition.nom} maxLength={120} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} />
          <label style={st.label} htmlFor="points-cadeau-desc">Description (facultatif)</label>
          <textarea id="points-cadeau-desc" style={{ ...st.champ, minHeight: 80, resize: 'vertical' }} value={edition.description} maxLength={1000} onChange={(e) => setEdition({ ...edition, description: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={st.label} htmlFor="points-cadeau-cout">Coût en points</label>
              <input id="points-cadeau-cout" style={st.champ} inputMode="numeric" value={edition.cout} onChange={(e) => setEdition({ ...edition, cout: e.target.value.replace(/[^0-9]/g, '') })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={st.label} htmlFor="points-cadeau-stock">Stock (vide = illimité)</label>
              <input id="points-cadeau-stock" style={st.champ} inputMode="numeric" value={edition.stock} onChange={(e) => setEdition({ ...edition, stock: e.target.value.replace(/[^0-9]/g, '') })} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer', fontSize: 'var(--t2)' }}>
            <input type="checkbox" checked={edition.actif !== false} onChange={(e) => setEdition({ ...edition, actif: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
            <span>Proposé en boutique</span>
          </label>
        </Fenetre>
      )}
    </>
  );
}

// ─── Équipe ─────────────────────────────────────────────────────────────────

function OngletEquipe({ etabId, user, donnees, charger, exclus }) {
  const [personne, setPersonne] = React.useState(null);
  const [points, setPoints] = React.useState('');
  const [motif, setMotif] = React.useState('');
  const [envoi, setEnvoi] = React.useState(false);
  const liste = donnees.soldes;

  const ouvrir = (p) => { setPersonne(p); setPoints(''); setMotif(''); };

  const ajuster = async () => {
    const n = Number(points);
    if (!Number.isInteger(n) || n === 0 || Math.abs(n) > AJUSTEMENT_MAX) {
      notify(`Un ajustement va de 1 à ${AJUSTEMENT_MAX} points, en plus ou en moins.`, 'warning');
      return;
    }
    if (!motif.trim()) { notify('Le motif est obligatoire.', 'warning'); return; }
    setEnvoi(true);
    try {
      await pointsService.ajuster(etabId, personne.userId, n, motif.trim());
      notify('Ajustement enregistré.', 'success');
      setPersonne(null);
      charger();
    } catch (err) {
      notify(messageErreurPoints(err), 'error');
    } finally {
      setEnvoi(false);
    }
  };

  const basculerExclusion = async () => {
    const dejaExclu = exclus.includes(personne.userId);
    const suivants = dejaExclu ? exclus.filter((id) => id !== personne.userId) : [...exclus, personne.userId];
    setEnvoi(true);
    try {
      await pointsService.regler(etabId, { exclus: suivants });
      await rafraichirPointsEtat(etabId, user.id);
      notify(dejaExclu ? 'La personne gagne de nouveau des points.' : 'La personne ne gagne plus de points.', 'success');
      setPersonne(null);
      charger();
    } catch (err) {
      notify(messageErreurPoints(err), 'error');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <Panneau>
        <h2 className="points-section-titre">Soldes de l'équipe</h2>
        <p className="points-aide">Touchez une personne pour ajuster son solde ou l'exclure des points. Aucun classement n'est montré à l'équipe.</p>
        {liste.length === 0 ? (
          <p className="points-aide">Personne n'est rattaché à cet établissement en dehors de la direction.</p>
        ) : (
          <div className="points-liste">
            {liste.map((p) => (
              <button
                key={p.userId}
                type="button"
                onClick={() => ouvrir(p)}
                style={{ ...ligne, width: '100%', background: 'transparent', borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderRadius: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', minHeight: 'var(--ligne-aeree)' }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 'var(--g2)', overflowWrap: 'anywhere' }} data-no-translate>{nomPersonne(p)}</div>
                  <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>
                    <span>{libelleRole(p.role)}</span>
                    {p.exclu && <>{' '}<span>Exclu des points</span></>}
                    {!p.exclu && !p.participant && <>{' '}<span>Ne gagne pas de points</span></>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <NombrePoints n={p.solde} />
                  <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>
                    <span data-no-translate>{p.gagneMois > 0 ? `+${p.gagneMois}` : p.gagneMois}</span>{' '}<span>ce mois</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Panneau>
      {personne && (
        <Fenetre
          id="points-personne"
          titre={nomPersonne(personne)}
          sousTitre={libelleRole(personne.role)}
          onClose={() => setPersonne(null)}
          pied={personne.userId === user.id ? null : (
            <>
              <button type="button" style={st.secondaire} onClick={() => setPersonne(null)}>Fermer</button>
              <button type="button" style={st.primaire} disabled={envoi} onClick={ajuster}>Ajuster</button>
            </>
          )}
        >
          <div style={st.apercu}><span>Solde :</span>{' '}<NombrePoints n={personne.solde} /></div>
          {personne.userId === user.id ? (
            <p style={st.remarque}>Un ajustement ne se fait jamais pour soi-même.</p>
          ) : (
            <>
              <label style={st.label} htmlFor="points-ajust-n">Points à ajouter (ou à retirer avec un signe moins)</label>
              <input id="points-ajust-n" style={st.champ} inputMode="numeric" value={points} placeholder="Par exemple 10 ou -10" onChange={(e) => setPoints(e.target.value.replace(/[^0-9-]/g, ''))} />
              <label style={st.label} htmlFor="points-ajust-motif">Motif (obligatoire, visible par la personne)</label>
              <input id="points-ajust-motif" style={st.champ} value={motif} maxLength={200} onChange={(e) => setMotif(e.target.value)} />
              <p style={st.remarque}>Au plus 500 points par ajustement ; le solde ne peut pas devenir négatif.</p>
              <button type="button" style={{ ...st.secondaire, alignSelf: 'flex-start' }} disabled={envoi} onClick={basculerExclusion}>
                {exclus.includes(personne.userId) ? 'Réintégrer aux points' : 'Exclure des points'}
              </button>
            </>
          )}
        </Fenetre>
      )}
    </>
  );
}

// ─── Réglages ───────────────────────────────────────────────────────────────

function OngletReglages({ etabId, user, etat }) {
  const [actif, setActif] = React.useState(etat.actif);
  const [roles, setRoles] = React.useState(etat.rolesParticipants || ROLES_PARTICIPANTS);
  const [bareme, setBareme] = React.useState(() => baremeEffectif(etat.bareme));
  const [envoi, setEnvoi] = React.useState(false);

  React.useEffect(() => { setActif(etat.actif); }, [etat.actif]);

  const basculer = async () => {
    const suivant = !actif;
    if (suivant && !window.confirm("Allumer les points pour cet établissement ? Les gestes faits à partir de maintenant rapportent des points ; rien n'est crédité pour le passé.")) return;
    setEnvoi(true);
    try {
      await pointsService.regler(etabId, { actif: suivant });
      await rafraichirPointsEtat(etabId, user.id);
      setActif(suivant);
      notify(suivant ? 'Points allumés pour cet établissement.' : 'Points éteints : plus rien ne se gagne, les soldes restent.', 'success');
    } catch (err) {
      notify(messageErreurPoints(err), 'error');
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrer = async () => {
    const erreur = erreurBareme(bareme);
    if (erreur) { notify(erreur, 'warning'); return; }
    setEnvoi(true);
    try {
      await pointsService.regler(etabId, { roles, bareme });
      await rafraichirPointsEtat(etabId, user.id);
      notify('Réglages enregistrés.', 'success');
    } catch (err) {
      notify(messageErreurPoints(err), 'error');
    } finally {
      setEnvoi(false);
    }
  };

  const changerBareme = (action, champ, valeur) => {
    const n = valeur === '' ? '' : Number(valeur.replace(/[^0-9]/g, ''));
    setBareme((b) => ({ ...b, [action]: { ...b[action], [champ]: n === '' ? 0 : n } }));
  };

  return (
    <>
      <Panneau>
        <h2 className="points-section-titre">Allumer les points</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer' }}>
          <input type="checkbox" role="switch" aria-checked={actif} checked={actif} disabled={envoi} onChange={basculer} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
          <span style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g2)' }}>{actif ? 'Les points sont allumés' : 'Les points sont éteints'}</span>
        </label>
        <p className="points-aide">Éteints, l'équipe ne voit pas le module et rien ne se gagne ; les soldes et les commandes restent.</p>
      </Panneau>

      <Panneau>
        <h2 className="points-section-titre">Qui gagne des points</h2>
        <p className="points-aide">La direction (consultant, patron) ne gagne jamais de points. Une personne se retire une à une dans l'onglet Équipe.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4, marginTop: 6 }}>
          {ROLES_PARTICIPANTS.map((r) => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer', fontSize: 'var(--t2)' }}>
              <input
                type="checkbox"
                checked={roles.includes(r)}
                onChange={(e) => setRoles((liste) => (e.target.checked ? [...liste, r] : liste.filter((x) => x !== r)))}
                style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
              />
              <span>{libelleRole(r)}</span>
            </label>
          ))}
        </div>
      </Panneau>

      <Panneau>
        <h2 className="points-section-titre">Barème</h2>
        <p className="points-aide">Points par geste (0 éteint le geste, au plus 100) et plafond par jour et par personne (au plus 50).</p>
        <div className="points-bareme" style={{ marginTop: 8 }}>
          <span style={st.label}>Geste</span>
          <span style={st.label}>Points</span>
          <span style={st.label}>Plafond par jour</span>
          {ACTIONS.map((a) => (
            <React.Fragment key={a}>
              <span style={{ fontSize: 'var(--t2)', minWidth: 0, overflowWrap: 'anywhere' }}>{libelleAction(a)}</span>
              <input aria-label={`${libelleAction(a)}, points`} style={st.champ} inputMode="numeric" value={String(bareme[a]?.points ?? BAREME_DEFAUT[a].points)} max={POINTS_MAX} onChange={(e) => changerBareme(a, 'points', e.target.value)} />
              <input aria-label={`${libelleAction(a)}, plafond par jour`} style={st.champ} inputMode="numeric" value={String(bareme[a]?.plafond ?? BAREME_DEFAUT[a].plafond)} max={PLAFOND_MAX} onChange={(e) => changerBareme(a, 'plafond', e.target.value)} />
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Btn onClick={() => setBareme({ ...BAREME_DEFAUT })} style={{ minHeight: 44 }}>Barème par défaut</Btn>
          <Btn variant="primary" onClick={enregistrer} disabled={envoi} style={{ minHeight: 44 }}>Enregistrer</Btn>
        </div>
      </Panneau>
    </>
  );
}

export default function GestionPoints({ onglet, user, etablissement, etat }) {
  const etabId = etablissement?.id;
  const { donnees, echec, charger } = useDonneesGestion(etabId);

  if (onglet === 'reglages') return <OngletReglages etabId={etabId} user={user} etat={etat} />;
  if (!donnees) {
    return (
      <div>
        <p className="points-aide">{echec ? 'Les points ne sont pas lus pour le moment.' : 'Chargement…'}</p>
        {echec && <Btn onClick={charger}>Réessayer</Btn>}
      </div>
    );
  }
  return (
    <>
      {echec && <p className="points-aide" role="status">Écran non actualisé : la dernière lecture a échoué.</p>}
      {onglet === 'commandes' && <OngletCommandes donnees={donnees} charger={charger} />}
      {onglet === 'boutique' && <OngletBoutique etabId={etabId} donnees={donnees} charger={charger} />}
      {onglet === 'equipe' && <OngletEquipe etabId={etabId} user={user} donnees={donnees} charger={charger} exclus={etat.exclus} />}
    </>
  );
}
