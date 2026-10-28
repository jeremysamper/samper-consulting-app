import React from 'react';
import { AtSign, ListTodo, MessagesSquare, NotebookPen, Plus, Repeat } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, Liste, Vide, h } from '../hebergement/hotelUi.jsx';
import {
  CANAL_TOUS, JOURS_SEMAINE, POLES, RECURRENCES, SERVICES_PASSATION, dateCourte, dateHeureZurich, equipeDe, libelleDe, libelleRecurrence,
  nomPersonne, passationsNonLues, poleDuRole, tacheDueLe, useMessagesCanaux, usePassationLectures, usePassations, useTachesFaites, useTachesRecurrentes,
} from '../hebergement/hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Passations (branche Hôtel, lot H6) : le cahier de passation de chaque pôle
// (par jour et par service, marqué lu par chacun), les canaux de pôle avec
// mentions, et les tâches récurrentes du jour à cocher. Un écran par tâche sur
// le socle des parcours ; l'écran s'ouvre sur le pôle de la personne.
//
// Droits : toute l'équipe lit, écrit, marque lu et coche ; chacun corrige son
// texte ; les tâches récurrentes, la correction et la suppression du texte
// d'un autre demandent la case Modifier de Passations (RLS idem).
// ─────────────────────────────────────────────────────────────────────────────

const TITRES = { cahier: 'Le cahier de passation', canaux: 'Les canaux', taches: 'Les tâches du jour', recurrentes: 'Les tâches récurrentes' };

function useAujourdhui() {
  const [jour, setJour] = React.useState(() => zurichToday());
  React.useEffect(() => {
    const id = setInterval(() => setJour(zurichToday()), 60000);
    return () => clearInterval(id);
  }, []);
  return jour;
}

function PassationForm({ passation, pole, aujourdhui, passations, onClose }) {
  const [f, setF] = React.useState(() => (passation ? { ...passation } : { pole, jour: aujourdhui, service: 'matin', contenu: '', important: false }));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const enregistrer = async () => {
    setErreur('');
    if (!f.contenu.trim()) { setErreur('Le texte est obligatoire.'); return; }
    setEnCours(true);
    const valeurs = { pole: f.pole, jour: f.jour, service: f.service, contenu: f.contenu.trim(), important: !!f.important };
    const res = passation ? await passations.modifier(passation.id, valeurs) : await passations.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(passation ? 'Passation modifiée.' : 'Passation notée.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="passation-form"
      titre={passation ? 'Modifier la passation' : 'Nouvelle passation'}
      onClose={onClose}
      largeur={560}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Pôle">
          <select style={h.saisie} value={f.pole} onChange={champ('pole')}>
            {POLES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Jour"><input type="date" style={h.saisie} value={f.jour} onChange={champ('jour')} /></Champ>
        <Champ label="Service">
          <select style={h.saisie} value={f.service} onChange={champ('service')}>
            {SERVICES_PASSATION.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Champ>
        <Champ label="À transmettre" large><textarea style={{ ...h.saisie, minHeight: 110 }} value={f.contenu} onChange={champ('contenu')} placeholder="Ce que l'équipe suivante doit savoir." autoFocus /></Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.important} onChange={(ev) => setF((p) => ({ ...p, important: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Important (en tête, en couleur)</span>
      </label>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function TacheForm({ tache, pole, taches, onClose }) {
  const [f, setF] = React.useState(() => (tache ? { ...tache, jourSemaine: tache.jourSemaine || 1, jourMois: tache.jourMois || 1 } : { pole, titre: '', detail: '', recurrence: 'quotidien', jourSemaine: 1, jourMois: 1, heure: '', actif: true, ordre: 0 }));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const enregistrer = async () => {
    setErreur('');
    if (!f.titre.trim()) { setErreur('Le titre est obligatoire.'); return; }
    setEnCours(true);
    const valeurs = {
      pole: f.pole, titre: f.titre.trim(), detail: f.detail.trim() || null, recurrence: f.recurrence,
      jour_semaine: f.recurrence === 'hebdomadaire' ? Number(f.jourSemaine) : null, jour_mois: f.recurrence === 'mensuel' ? Number(f.jourMois) : null,
      heure: f.heure || null, actif: !!f.actif, ordre: parseInt(f.ordre, 10) || 0,
    };
    const res = tache ? await taches.modifier(tache.id, valeurs) : await taches.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(tache ? 'Tâche modifiée.' : 'Tâche créée.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="tache-form"
      titre={tache ? 'Modifier la tâche récurrente' : 'Nouvelle tâche récurrente'}
      onClose={onClose}
      largeur={560}
      pied={(
        <>
          {tache && <button type="button" style={st.secondaire} onClick={async () => { const r = await taches.supprimer(tache.id); if (r.error) setErreur(r.error); else { notify('Tâche supprimée.', 'success'); onClose(); } }}>Supprimer</button>}
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        <Champ label="Titre" large><input style={h.saisie} value={f.titre} onChange={champ('titre')} placeholder="Contrôle des chariots, clôture de caisse, relevé des températures…" autoFocus /></Champ>
        <Champ label="Pôle">
          <select style={h.saisie} value={f.pole} onChange={champ('pole')}>
            {POLES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Fréquence">
          <select style={h.saisie} value={f.recurrence} onChange={champ('recurrence')}>
            {RECURRENCES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Champ>
        {f.recurrence === 'hebdomadaire' && (
          <Champ label="Jour de la semaine">
            <select style={h.saisie} value={f.jourSemaine} onChange={champ('jourSemaine')}>
              {JOURS_SEMAINE.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
            </select>
          </Champ>
        )}
        {f.recurrence === 'mensuel' && <Champ label="Jour du mois"><input type="number" min="1" max="31" inputMode="numeric" style={h.saisie} value={f.jourMois} onChange={champ('jourMois')} /></Champ>}
        <Champ label="Heure"><input type="time" style={h.saisie} value={f.heure} onChange={champ('heure')} /></Champ>
        <Champ label="Ordre"><input type="number" inputMode="numeric" style={h.saisie} value={f.ordre} onChange={champ('ordre')} /></Champ>
        <Champ label="Détail" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.detail} onChange={champ('detail')} /></Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.actif} onChange={(ev) => setF((p) => ({ ...p, actif: ev.target.checked }))} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Tâche active</span>
      </label>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

export default function Passations({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const moi = user?.id || null;
  const peutGerer = canManageModule(role, 'passations');
  const aujourdhui = useAujourdhui();

  const passations = usePassations(etabId);
  const lectures = usePassationLectures(etabId);
  const messages = useMessagesCanaux(etabId);
  const taches = useTachesRecurrentes(etabId);
  const faites = useTachesFaites(etabId);
  const equipe = React.useMemo(() => equipeDe(etabId), [etabId]);

  const ecransRepris = peutGerer ? ['cahier', 'canaux', 'taches', 'recurrentes'] : ['cahier', 'canaux', 'taches'];
  const { ecran, setEcran, retourAccueil } = useEcranModule('passations', { repris: ecransRepris });
  const [pole, setPole] = React.useState(() => poleDuRole(role) || 'reception');
  const [canal, setCanal] = React.useState(() => poleDuRole(role) || 'tous');
  const [form, setForm] = React.useState(null); // { passation }
  const [tacheForm, setTacheForm] = React.useState(null); // { tache }
  const [texte, setTexte] = React.useState('');
  const [mentions, setMentions] = React.useState([]);
  const [erreur, setErreur] = React.useState('');

  const nonLues = passationsNonLues(passations.rows, lectures.rows, moi, aujourdhui);
  const mesMentions = messages.rows.filter((m) => m.mentions.includes(moi) && m.createdAt && m.createdAt >= `${zurichAjouterJours(aujourdhui, -7)}T00:00:00`);
  const tachesDuJour = taches.rows.filter((t) => tacheDueLe(t, aujourdhui));
  const estFaite = (t) => faites.rows.find((f) => f.tacheId === t.id && f.jour === aujourdhui) || null;
  const restantes = tachesDuJour.filter((t) => !estFaite(t));
  const luePar = (p) => lectures.rows.filter((l) => l.passationId === p.id);
  const estLue = (p) => luePar(p).some((l) => l.userId === moi);

  const cahier = passations.rows
    .filter((p) => p.pole === pole && p.jour >= zurichAjouterJours(aujourdhui, -14))
    .sort((a, b) => b.jour.localeCompare(a.jour) || Number(b.important) - Number(a.important) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const fil = messages.rows.filter((m) => m.canal === canal).slice(0, 200);

  const marquerLue = async (p) => {
    const r = await lectures.inserer({ passation_id: p.id, user_id: moi });
    if (r.error && !/23505|déjà/.test(r.error)) notify(r.error, 'error');
  };
  const cocher = async (t) => {
    const f = estFaite(t);
    const r = f ? await faites.supprimer(f.id) : await faites.inserer({ tache_id: t.id, jour: aujourdhui, fait_par: moi });
    if (r.error) notify(r.error, 'error');
  };
  const envoyer = async () => {
    setErreur('');
    if (!texte.trim()) return;
    const r = await messages.inserer({ canal, contenu: texte.trim(), mentions, created_by: moi });
    if (r.error) { setErreur(r.error); return; }
    setTexte('');
    setMentions([]);
  };
  const supprimerMessage = async (m) => {
    const r = await messages.supprimer(m.id);
    if (r.error) notify(r.error, 'error'); else notify('Message supprimé.', 'success');
  };

  const etat = (n, un, plusieurs) => <><span>{n}</span> <span>{n === 1 ? un : plusieurs}</span></>;
  const tuiles = [
    { id: 'cahier', libelle: 'Cahier de passation', Icone: NotebookPen, etat: etat(nonLues.length, 'passation à lire', 'passations à lire'), onClick: () => setEcran('cahier') },
    { id: 'nouvelle', libelle: 'Nouvelle passation', Icone: Plus, onClick: () => setForm({ passation: null }) },
    { id: 'canaux', libelle: 'Canaux', Icone: MessagesSquare, etat: <><AtSign size={14} strokeWidth={1.8} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {etat(mesMentions.length, 'mention cette semaine', 'mentions cette semaine')}</>, onClick: () => setEcran('canaux') },
    { id: 'taches', libelle: 'Tâches du jour', Icone: ListTodo, etat: etat(restantes.length, 'tâche à faire', 'tâches à faire'), onClick: () => setEcran('taches') },
    { id: 'recurrentes', libelle: 'Tâches récurrentes', Icone: Repeat, visible: peutGerer, etat: etat(taches.rows.filter((t) => t.actif).length, 'tâche active', 'tâches actives'), onClick: () => setEcran('recurrentes') },
  ];
  const ongletsPoles = POLES.map((p) => ({ id: p.id, label: p.label }));
  const ongletsCanaux = [CANAL_TOUS, ...POLES].map((p) => ({ id: p.id, label: p.label }));
  const etatLecture = passations.status === 'absent' ? 'Les passations ne sont pas encore activées sur la base de données.'
    : passations.status === 'error' ? 'Les passations n\'ont pas pu être lues. Nouvel essai en cours…' : null;

  const lignePassation = (p) => {
    const lue = estLue(p);
    return (
      <div key={p.id} style={{ ...pz.carte, borderLeftColor: p.important ? 'var(--danger-text)' : 'var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={h.detail} data-no-translate>{dateCourte(p.jour)}</span>
          <Puce ton="neutre">{libelleDe(SERVICES_PASSATION, p.service)}</Puce>
          {p.important && <Puce ton="danger">Important</Puce>}
          <span style={h.detail} data-no-translate>{nomPersonne(p.createdBy)}</span>
          <span style={{ flex: 1 }} />
          {luePar(p).length > 0 && <span style={h.detail}><span>Lu par</span> <span data-no-translate>{luePar(p).length}</span></span>}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }} data-no-translate>{p.contenu}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!lue && p.createdBy !== moi && <Btn variant="primary" onClick={() => marquerLue(p)} style={{ minHeight: 40, fontSize: 13 }}>J'ai lu</Btn>}
          {lue && <Puce ton="success">Lu</Puce>}
          {(p.createdBy === moi || peutGerer) && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => setForm({ passation: p })}>Modifier</button>}
          {(p.createdBy === moi || peutGerer) && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={async () => { const r = await passations.supprimer(p.id); if (r.error) notify(r.error, 'error'); else notify('Passation supprimée.', 'success'); }}>Supprimer</button>}
        </div>
      </div>
    );
  };

  return (
    <section className="passations" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      {!etabId && <Vide>Aucun établissement sélectionné.</Vide>}
      {etabId && ecran === ECRAN_ACCUEIL && (
        <>
          <AccueilModule tuiles={tuiles} />
          {etatLecture && <Vide>{etatLecture}</Vide>}
          {nonLues.length > 0 && (
            <div>
              <div style={h.sousTitre}>À lire</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>{nonLues.slice(0, 5).map(lignePassation)}</div>
            </div>
          )}
        </>
      )}
      {etabId && ecran !== ECRAN_ACCUEIL && (
        <EcranTache
          titre={TITRES[ecran] || ''}
          onRetour={retourAccueil}
          actions={ecran === 'cahier' ? (
            <Btn variant="primary" onClick={() => setForm({ passation: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouvelle passation</span>
            </Btn>
          ) : ecran === 'recurrentes' && peutGerer ? (
            <Btn variant="primary" onClick={() => setTacheForm({ tache: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Nouvelle tâche récurrente</span>
            </Btn>
          ) : null}
        />
      )}

      {etabId && ecran === 'cahier' && (
        <>
          <SegmentedTabs tabs={ongletsPoles} active={pole} onChange={setPole} retourLigne />
          {cahier.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{cahier.map(lignePassation)}</div> : <Vide>Rien dans le cahier de ce pôle sur les quatorze derniers jours.</Vide>}
        </>
      )}

      {etabId && ecran === 'canaux' && (
        <>
          <SegmentedTabs tabs={ongletsCanaux} active={canal} onChange={setCanal} retourLigne />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea style={{ ...h.saisie, minHeight: 64 }} value={texte} onChange={(ev) => setTexte(ev.target.value)} placeholder="Un message pour ce canal…" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <AtSign size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--text2)' }} />
              <select style={{ ...h.saisie, width: 'auto', minHeight: 40 }} value="" onChange={(ev) => { const id = ev.target.value; if (id && !mentions.includes(id)) setMentions([...mentions, id]); }} data-no-translate>
                <option value="">{'Mentionner quelqu\'un…'}</option>
                {equipe.filter((u) => !mentions.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
              </select>
              {mentions.map((id) => (
                <button key={id} type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 36, fontSize: 13 }} onClick={() => setMentions(mentions.filter((x) => x !== id))} data-no-translate>@{nomPersonne(id)} ×</button>
              ))}
              <span style={{ flex: 1 }} />
              <Btn variant="primary" onClick={envoyer} disabled={!texte.trim()} style={{ minHeight: 44 }}>Envoyer</Btn>
            </div>
            {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
          </div>
          {!fil.length && <Vide>Aucun message sur ce canal.</Vide>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fil.map((m) => (
              <div key={m.id} style={{ ...pz.carte, borderLeftColor: m.mentions.includes(moi) ? 'var(--accent)' : 'var(--border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }} data-no-translate>{nomPersonne(m.createdBy)}</span>
                  <span style={h.detail} data-no-translate>{dateHeureZurich(m.createdAt)}</span>
                  {m.mentions.map((id) => <Puce key={id} ton={id === moi ? 'info' : 'neutre'}><span data-no-translate>@{nomPersonne(id)}</span></Puce>)}
                  <span style={{ flex: 1 }} />
                  {(m.createdBy === moi || peutGerer) && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 32, padding: '4px 8px', fontSize: 12 }} onClick={() => supprimerMessage(m)}>Supprimer</button>}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }} data-no-translate>{m.contenu}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {etabId && ecran === 'taches' && (
        <>
          {!tachesDuJour.length && <Vide>Aucune tâche récurrente ne tombe aujourd'hui.</Vide>}
          <Liste>
            {POLES.filter((p) => tachesDuJour.some((t) => t.pole === p.id)).map((p) => (
              <div key={p.id}>
                <div style={h.sousTitre}>{p.label}</div>
                {tachesDuJour.filter((t) => t.pole === p.id).map((t) => {
                  const f = estFaite(t);
                  return (
                    <label key={t.id} style={{ ...h.ligne, cursor: 'pointer', marginTop: 6 }}>
                      <input type="checkbox" checked={!!f} onChange={() => cocher(t)} style={{ width: 22, height: 22, accentColor: 'var(--accent)', flexShrink: 0 }} />
                      <span style={h.ligneGauche}>
                        <span style={{ ...h.nomHote, textDecoration: f ? 'line-through' : 'none' }} data-no-translate>{t.titre}</span>
                        <span style={h.detail}>{t.heure && <><span data-no-translate>{t.heure}</span>, </>}<span>{libelleRecurrence(t)}</span>{t.detail && <>, <span data-no-translate>{t.detail}</span></>}</span>
                      </span>
                      {f && <span style={h.detail}><span>Fait par</span> <span data-no-translate>{nomPersonne(f.faitPar)}</span></span>}
                    </label>
                  );
                })}
              </div>
            ))}
          </Liste>
        </>
      )}

      {etabId && ecran === 'recurrentes' && peutGerer && (
        <>
          {taches.status === 'ready' && !taches.rows.length && <Vide>Aucune tâche récurrente pour l'instant.</Vide>}
          <Liste>
            {taches.rows.map((t) => (
              <button key={t.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => setTacheForm({ tache: t })} data-tache={t.id}>
                <span style={h.ligneGauche}>
                  <span style={h.nomHote} data-no-translate>{t.titre}</span>
                  <span style={h.detail}><span>{libelleDe(POLES, t.pole)}</span>, <span>{libelleRecurrence(t)}</span>{t.heure && <>, <span data-no-translate>{t.heure}</span></>}</span>
                </span>
                {!t.actif && <Puce ton="neutre">Inactive</Puce>}
              </button>
            ))}
          </Liste>
        </>
      )}

      {form && <PassationForm passation={form.passation} pole={pole} aujourdhui={aujourdhui} passations={passations} onClose={() => setForm(null)} />}
      {tacheForm && <TacheForm tache={tacheForm.tache} pole={pole} taches={taches} onClose={() => setTacheForm(null)} />}
    </section>
  );
}

const pz = {
  carte: {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', background: 'var(--surface)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: 'var(--border)',
  },
};
