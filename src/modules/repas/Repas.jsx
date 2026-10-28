import React from 'react';
import { BellRing, Croissant, Plus } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';
import { Carte, Puce } from '../dashboard/tableauUi.jsx';
import { Champ, Liste, Vide, h } from '../hebergement/hotelUi.jsx';
import {
  PENSIONS, REPAS, STATUTS_ROOM_SERVICE, chf, commandeOuverte, couvertsRepas, dateCourte, heureZurich, isoZurich, libelleDe, nomPersonne, personnes,
  sejoursActifs, tonDe, totalArticles, useChambres, useHotes, useLignesSejour, useRoomService, useSejours,
} from '../hebergement/hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Repas hôtel (branche Hôtel, lot H7) : les couverts des repas d'après les
// pensions des séjours (petit-déjeuner, déjeuner, dîner, aujourd'hui et
// demain, avec les allergies des fiches hôtes), et le room service (prendre
// une commande, la passer en cuisine, la livrer, la porter sur la note de
// séjour). Un écran par tâche sur le socle des parcours.
//
// Droits : toute l'équipe lit, prend une commande et la fait avancer ;
// corriger les articles ou supprimer demande la case Modifier de Repas hôtel ;
// porter sur la note demande la case Modifier d'Hébergement (lignes de note).
// ─────────────────────────────────────────────────────────────────────────────

const TITRES = { couverts: 'Les couverts', room_service: 'Le room service' };

function useAujourdhui() {
  const [jour, setJour] = React.useState(() => zurichToday());
  React.useEffect(() => {
    const id = setInterval(() => setJour(zurichToday()), 60000);
    return () => clearInterval(id);
  }, []);
  return jour;
}

const articleVide = () => ({ libelle: '', quantite: 1, prix: '' });

function CommandeForm({ commande, sejours, chambres, roomService, aujourdhui, onClose }) {
  const [f, setF] = React.useState(() => (commande
    ? { sejourId: commande.sejourId, articles: commande.articles.map((a) => ({ ...a, prix: String(a.prix) })), heure: commande.souhaiteA ? heureZurich(commande.souhaiteA) : '', note: commande.note }
    : { sejourId: '', articles: [articleVide()], heure: '', note: '' }));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const actifs = sejoursActifs(sejours).sort((a, b) => a.nomHote.localeCompare(b.nomHote, 'fr'));
  const numero = (s) => chambres.find((c) => c.id === s?.chambreId)?.numero || '';
  const majArticle = (i, k, v) => setF((p) => ({ ...p, articles: p.articles.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const total = totalArticles(f.articles.map((a) => ({ ...a, prix: Number(String(a.prix).replace(',', '.')) || 0 })));

  const enregistrer = async () => {
    setErreur('');
    const s = sejours.find((x) => x.id === f.sejourId);
    if (!s) { setErreur('Choisis un séjour.'); return; }
    const articles = f.articles.filter((a) => a.libelle.trim()).map((a) => ({ libelle: a.libelle.trim(), quantite: Math.max(1, Number(a.quantite) || 1), prix: Math.max(0, Number(String(a.prix).replace(',', '.')) || 0) }));
    if (!articles.length) { setErreur('Au moins un article avec un libellé.'); return; }
    setEnCours(true);
    const valeurs = { sejour_id: s.id, chambre_id: s.chambreId || null, articles, souhaite_a: f.heure ? isoZurich(aujourdhui, f.heure) : null, note: f.note.trim() || null };
    const res = commande ? await roomService.modifier(commande.id, valeurs) : await roomService.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(commande ? 'Commande modifiée.' : 'Commande prise.', 'success');
    onClose();
  };

  return (
    <Fenetre
      id="commande-form"
      titre={commande ? 'Modifier la commande' : 'Nouvelle commande'}
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
        <Champ label="Séjour" large>
          <select style={h.saisie} value={f.sejourId} onChange={(ev) => setF((p) => ({ ...p, sejourId: ev.target.value }))} data-no-translate autoFocus>
            <option value="">{'Choisir…'}</option>
            {actifs.map((s) => <option key={s.id} value={s.id}>{s.nomHote}{numero(s) ? ` (ch. ${numero(s)})` : ''}</option>)}
          </select>
        </Champ>
        <Champ label="Heure souhaitée"><input type="time" style={h.saisie} value={f.heure} onChange={(ev) => setF((p) => ({ ...p, heure: ev.target.value }))} /></Champ>
        <Champ label="Note"><input style={h.saisie} value={f.note} onChange={(ev) => setF((p) => ({ ...p, note: ev.target.value }))} placeholder="Sans oignon, frapper doucement…" /></Champ>
      </div>
      <div>
        <div style={h.sousTitre}>Articles</div>
        {f.articles.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <input style={{ ...h.saisie, flex: '2 1 180px' }} value={a.libelle} onChange={(ev) => majArticle(i, 'libelle', ev.target.value)} placeholder="Club sandwich, bouteille d'eau…" />
            <input type="number" min="1" inputMode="numeric" style={{ ...h.saisie, flex: '0 0 72px' }} value={a.quantite} onChange={(ev) => majArticle(i, 'quantite', ev.target.value)} aria-label="Quantité" />
            <input type="number" min="0" step="0.05" inputMode="decimal" style={{ ...h.saisie, flex: '0 0 96px' }} value={a.prix} onChange={(ev) => majArticle(i, 'prix', ev.target.value)} placeholder="CHF" aria-label="Prix" />
            {f.articles.length > 1 && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 44, padding: '4px 10px' }} onClick={() => setF((p) => ({ ...p, articles: p.articles.filter((_, j) => j !== i) }))} aria-label="Retirer l'article">×</button>}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => setF((p) => ({ ...p, articles: [...p.articles, articleVide()] }))}>Ajouter un article</button>
          <span style={{ fontSize: 14, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}><span>Total</span> <span data-no-translate>CHF {chf(total)}</span></span>
        </div>
      </div>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

export default function Repas({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const peutGerer = canManageModule(role, 'repas');
  const peutNoter = canManageModule(role, 'hebergement');
  const aujourdhui = useAujourdhui();

  const sejours = useSejours(etabId);
  const chambres = useChambres(etabId);
  const hotes = useHotes(etabId);
  const roomService = useRoomService(etabId);
  const lignes = useLignesSejour(etabId, { actif: peutNoter });

  const { ecran, setEcran, retourAccueil } = useEcranModule('repas', { repris: ['couverts', 'room_service'] });
  const [jour, setJour] = React.useState('aujourdhui');
  const [vue, setVue] = React.useState('ouvertes');
  const [form, setForm] = React.useState(null); // { commande }
  const [erreur, setErreur] = React.useState('');

  const jourChoisi = jour === 'demain' ? zurichAjouterJours(aujourdhui, 1) : aujourdhui;
  const parRepas = Object.fromEntries(REPAS.map((r) => [r.id, couvertsRepas(sejours.rows, jourChoisi, r.id)]));
  const nb = (liste) => liste.reduce((n, s) => n + personnes(s), 0);
  const numero = (s) => chambres.rows.find((c) => c.id === s.chambreId)?.numero || '';
  const hoteDe = (s) => hotes.rows.find((x) => x.id === s.hoteId) || null;
  const sejourDe = (id) => sejours.rows.find((s) => s.id === id) || null;
  const ouvertes = roomService.rows.filter(commandeOuverte);
  const commandes = roomService.rows.filter((c) => (vue === 'ouvertes' ? commandeOuverte(c) : !commandeOuverte(c) && String(c.createdAt || '').slice(0, 10) >= zurichAjouterJours(aujourdhui, -2)));

  const changer = async (c, valeurs, message) => {
    setErreur('');
    const r = await roomService.modifier(c.id, valeurs);
    if (r.error) setErreur(r.error); else if (message) notify(message, 'success');
    return r;
  };
  // Porter sur la note : une ligne extra par commande livrée, puis la commande est marquée portée.
  const porterSurNote = async (c) => {
    setErreur('');
    const s = sejourDe(c.sejourId);
    if (!s) return;
    const libelle = `Room service, ${c.articles.map((a) => `${a.quantite > 1 ? `${a.quantite} ` : ''}${a.libelle}`).join(', ')}`.slice(0, 200);
    const r = await lignes.inserer({ sejour_id: s.id, jour: String(c.livreeAt || c.createdAt || '').slice(0, 10) || aujourdhui, type: 'extra', libelle, quantite: 1, prix_unitaire: c.total, tva_taux: null });
    if (r.error) { setErreur(r.error); return; }
    await changer(c, { portee_sur_note: true }, 'Commande portée sur la note de séjour.');
  };

  const etat = (n, un, plusieurs) => <><span>{n}</span> <span>{n === 1 ? un : plusieurs}</span></>;
  const tuiles = [
    { id: 'couverts', libelle: 'Couverts du jour', Icone: Croissant, etat: <>{REPAS.map((r, i) => <React.Fragment key={r.id}>{i > 0 && <span aria-hidden="true"> </span>}<span>{nb(couvertsRepas(sejours.rows, aujourdhui, r.id))}</span> <span>{r.label.toLowerCase()}</span></React.Fragment>)}</>, onClick: () => { setJour('aujourdhui'); setEcran('couverts'); } },
    { id: 'room_service', libelle: 'Room service', Icone: BellRing, etat: etat(ouvertes.length, 'commande à préparer', 'commandes à préparer'), onClick: () => setEcran('room_service') },
    { id: 'nouvelle', libelle: 'Nouvelle commande', Icone: Plus, onClick: () => setForm({ commande: null }) },
  ];

  const etatLecture = roomService.status === 'absent' ? 'Le room service n\'est pas encore activé sur la base de données.'
    : sejours.status === 'error' ? 'Les séjours n\'ont pas pu être lus. Nouvel essai en cours…' : null;

  return (
    <section className="repas" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
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
          actions={ecran === 'room_service' ? (
            <Btn variant="primary" onClick={() => setForm({ commande: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouvelle commande</span>
            </Btn>
          ) : null}
        />
      )}

      {etabId && ecran === 'couverts' && (
        <>
          <SegmentedTabs tabs={[{ id: 'aujourdhui', label: 'Aujourd\'hui' }, { id: 'demain', label: 'Demain' }]} active={jour} onChange={setJour} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
            {REPAS.map((r) => (
              <Carte key={r.id} titre={r.label} sousTitre={<><span>{nb(parRepas[r.id])}</span> <span>{nb(parRepas[r.id]) === 1 ? 'couvert' : 'couverts'}</span>, <span>{parRepas[r.id].length}</span> <span>{parRepas[r.id].length === 1 ? 'séjour' : 'séjours'}</span></>}>
                {!parRepas[r.id].length && <div style={h.detail}>Personne pour ce repas.</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {parRepas[r.id].map((s) => {
                    const ho = hoteDe(s);
                    return (
                      <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' }}>
                        <span style={{ fontSize: 14, color: 'var(--text)' }} data-no-translate>{s.nomHote}</span>
                        <span style={h.detail}>{numero(s) && <><span>ch.</span> <span data-no-translate>{numero(s)}</span>, </>}<span data-no-translate>{personnes(s)}</span> <span>{personnes(s) > 1 ? 'personnes' : 'personne'}</span>, <span>{libelleDe(PENSIONS, s.pension)}</span></span>
                        {ho?.allergies && <span style={{ ...h.detail, color: 'var(--danger-text)' }} data-no-translate>{ho.allergies}</span>}
                        {s.demandesSpeciales && <span style={h.detail} data-no-translate>{s.demandesSpeciales}</span>}
                      </div>
                    );
                  })}
                </div>
              </Carte>
            ))}
          </div>
        </>
      )}

      {etabId && ecran === 'room_service' && (
        <>
          <SegmentedTabs tabs={[{ id: 'ouvertes', label: 'À préparer' }, { id: 'faites', label: 'Livrées et annulées' }]} active={vue} onChange={setVue} />
          {!commandes.length && <Vide>{vue === 'ouvertes' ? 'Aucune commande à préparer.' : 'Aucune commande livrée ou annulée ces trois derniers jours.'}</Vide>}
          <Liste>
            {commandes.map((c) => {
              const s = sejourDe(c.sejourId);
              return (
                <div key={c.id} style={{ ...h.ligne, cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={h.nomHote} data-no-translate>{s?.nomHote || ''}</span>
                    {s && numero(s) && <span style={h.detail}><span>Chambre</span> <span data-no-translate>{numero(s)}</span></span>}
                    {c.souhaiteA && <span style={h.detail}><span>pour</span> <span data-no-translate>{heureZurich(c.souhaiteA)}</span></span>}
                    <span style={{ flex: 1 }} />
                    <Puce ton={tonDe(STATUTS_ROOM_SERVICE, c.statut)}>{libelleDe(STATUTS_ROOM_SERVICE, c.statut)}</Puce>
                    {c.porteeSurNote && <Puce ton="neutre">Sur la note</Puce>}
                    <span style={{ fontFamily: 'var(--font-num)', fontSize: 15, color: 'var(--text)' }} data-no-translate>CHF {chf(c.total)}</span>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }} data-no-translate>{c.articles.map((a) => `${a.quantite > 1 ? `${a.quantite} x ` : ''}${a.libelle}`).join(', ')}</div>
                  {c.note && <div style={h.detail} data-no-translate>{c.note}</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={h.detail}><span>Prise par</span> <span data-no-translate>{nomPersonne(c.createdBy)}</span>{c.livreePar && <>, <span>livrée par</span> <span data-no-translate>{nomPersonne(c.livreePar)}</span></>}</span>
                    <span style={{ flex: 1 }} />
                    {c.statut === 'recue' && <Btn variant="primary" onClick={() => changer(c, { statut: 'en_cuisine' }, 'Commande en cuisine.')} style={{ minHeight: 40, fontSize: 13 }}>En cuisine</Btn>}
                    {commandeOuverte(c) && <Btn variant="primary" onClick={() => changer(c, { statut: 'livree' }, 'Commande livrée.')} style={{ minHeight: 40, fontSize: 13 }}>Livrée</Btn>}
                    {commandeOuverte(c) && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => changer(c, { statut: 'annulee' }, 'Commande annulée.')}>Annuler</button>}
                    {c.statut === 'livree' && !c.porteeSurNote && peutNoter && c.total > 0 && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => porterSurNote(c)}>Porter sur la note</button>}
                    {peutGerer && commandeOuverte(c) && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => setForm({ commande: c })}>Modifier</button>}
                    {peutGerer && !commandeOuverte(c) && !c.porteeSurNote && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={async () => { const r = await roomService.supprimer(c.id); if (r.error) setErreur(r.error); else notify('Commande supprimée.', 'success'); }}>Supprimer</button>}
                  </div>
                </div>
              );
            })}
          </Liste>
          {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
        </>
      )}

      {form && <CommandeForm commande={form.commande} sejours={sejours.rows} chambres={chambres.rows} roomService={roomService} aujourdhui={aujourdhui} onClose={() => setForm(null)} />}
    </section>
  );
}
