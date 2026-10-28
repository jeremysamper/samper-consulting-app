import React from 'react';
import { Plus } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, Liste, Vide, h } from './hotelUi.jsx';
import {
  LANGUES, STATUTS_SEJOUR, dateCourte, dateHeureZurich, libelleDe, nomHote, nomPersonne, personnes, tonDe,
} from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fichier des hôtes (lot H3) : une fiche par personne, ses séjours, ses
// demandes, et les fiches de la même personne dans le fichier du restaurant
// et celui du spa (reliées, jamais fusionnées). Lecture pour l'équipe,
// création et modification avec la case Modifier d'Hébergement, suppression
// par le consultant seulement (la fiche s'archive sinon).
// ─────────────────────────────────────────────────────────────────────────────

const vide = () => ({
  prenom: '', nom: '', email: '', telephone: '', langue: 'fr', dateNaissance: '', nationalite: '', allergies: '', preferences: '',
  occasions: '', vip: false, notes: '', consentementMarketing: false, resaClientId: '', spaClientId: '', archive: false,
});

export function HoteForm({ hote, nomInitial, hotes, resaClients, spaClients, onClose, onEnregistre }) {
  const [f, setF] = React.useState(() => {
    if (hote) return { ...hote, resaClientId: hote.resaClientId || '', spaClientId: hote.spaClientId || '' };
    const base = vide();
    if (nomInitial) {
      const morceaux = String(nomInitial).trim().split(/\s+/);
      base.prenom = morceaux.length > 1 ? morceaux[0] : '';
      base.nom = morceaux.length > 1 ? morceaux.slice(1).join(' ') : morceaux[0] || '';
    }
    return base;
  });
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const coche = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.checked }));
  const libelleClient = (c) => `${c.prenom} ${c.nom}`.trim() + (c.email ? ` (${c.email})` : c.telephone ? ` (${c.telephone})` : '');

  const enregistrer = async () => {
    setErreur('');
    if (!`${f.prenom}${f.nom}`.trim()) { setErreur('Le nom ou le prénom est obligatoire.'); return; }
    setEnCours(true);
    const valeurs = {
      prenom: f.prenom.trim() || null, nom: f.nom.trim() || null, email: f.email.trim() || null, telephone: f.telephone.trim() || null,
      langue: f.langue, date_naissance: f.dateNaissance || null, nationalite: f.nationalite.trim() || null, allergies: f.allergies.trim() || null,
      preferences: f.preferences.trim() || null, occasions: f.occasions.trim() || null, vip: !!f.vip, notes: f.notes.trim() || null,
      consentement_marketing: !!f.consentementMarketing, resa_client_id: f.resaClientId || null, spa_client_id: f.spaClientId || null, archive: !!f.archive,
    };
    const res = hote ? await hotes.modifier(hote.id, valeurs) : await hotes.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(hote ? 'Fiche hôte modifiée.' : 'Fiche hôte créée.', 'success');
    onEnregistre?.(res.data);
    onClose();
  };

  return (
    <Fenetre
      id="hote-form"
      titre={hote ? 'Modifier la fiche hôte' : 'Nouvelle fiche hôte'}
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
        <Champ label="Prénom"><input style={h.saisie} value={f.prenom} onChange={champ('prenom')} autoFocus /></Champ>
        <Champ label="Nom"><input style={h.saisie} value={f.nom} onChange={champ('nom')} /></Champ>
        <Champ label="E-mail"><input type="email" style={h.saisie} value={f.email} onChange={champ('email')} /></Champ>
        <Champ label="Téléphone"><input type="tel" style={h.saisie} value={f.telephone} onChange={champ('telephone')} /></Champ>
        <Champ label="Langue">
          <select style={h.saisie} value={f.langue} onChange={champ('langue')}>
            {LANGUES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </Champ>
        <Champ label="Nationalité"><input style={h.saisie} value={f.nationalite} onChange={champ('nationalite')} /></Champ>
        <Champ label="Date de naissance"><input type="date" style={h.saisie} value={f.dateNaissance} onChange={champ('dateNaissance')} /></Champ>
        <Champ label="Occasions"><input style={h.saisie} value={f.occasions} onChange={champ('occasions')} placeholder="Anniversaire de mariage, lune de miel…" /></Champ>
        <Champ label="Allergies et régimes" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.allergies} onChange={champ('allergies')} /></Champ>
        <Champ label="Préférences" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.preferences} onChange={champ('preferences')} placeholder="Étage calme, oreiller ferme, café au réveil…" /></Champ>
        <Champ label="Notes" large><textarea style={{ ...h.saisie, minHeight: 56 }} value={f.notes} onChange={champ('notes')} /></Champ>
        <Champ label="Même personne au restaurant">
          <select style={h.saisie} value={f.resaClientId} onChange={champ('resaClientId')}>
            <option value="">Aucune fiche reliée</option>
            {resaClients.filter((c) => !c.archive || c.id === f.resaClientId).map((c) => <option key={c.id} value={c.id}>{libelleClient(c)}</option>)}
          </select>
        </Champ>
        <Champ label="Même personne au spa">
          <select style={h.saisie} value={f.spaClientId} onChange={champ('spaClientId')}>
            <option value="">Aucune fiche reliée</option>
            {spaClients.filter((c) => !c.archive || c.id === f.spaClientId).map((c) => <option key={c.id} value={c.id}>{libelleClient(c)}</option>)}
          </select>
        </Champ>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.vip} onChange={coche('vip')} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Hôte VIP (attention particulière)</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!f.consentementMarketing} onChange={coche('consentementMarketing')} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Accepte de recevoir nos actualités (consentement daté à l'enregistrement)</span>
      </label>
      {hote && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.archive} onChange={coche('archive')} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
          <span style={{ fontSize: 14, color: 'var(--text)' }}>Fiche archivée</span>
        </label>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

export function HoteFiche({ hote: ho, sejours, demandes, resaClients, spaClients, chambres, peutGerer, peutSupprimer, onModifier, onSupprimer, onOuvrirSejour, onClose }) {
  const mesSejours = sejours.filter((s) => s.hoteId === ho.id).sort((a, b) => b.arrivee.localeCompare(a.arrivee));
  const idsSejours = new Set(mesSejours.map((s) => s.id));
  const mesDemandes = demandes.filter((d) => idsSejours.has(d.sejourId));
  const resa = resaClients.find((c) => c.id === ho.resaClientId);
  const spa = spaClients.find((c) => c.id === ho.spaClientId);
  const numero = (id) => chambres.find((c) => c.id === id)?.numero || '';
  const ligne = (label, valeur, brut = true) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', flex: '0 0 150px' }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text)', flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }} data-no-translate={brut ? '' : undefined}>{valeur}</span>
    </div>
  );
  return (
    <Fenetre
      id="hote-fiche"
      titre={<span data-no-translate>{nomHote(ho)}</span>}
      sousTitre={<>{ho.vip && <Puce ton="warning">VIP</Puce>} <span>{libelleDe(LANGUES, ho.langue)}</span>{ho.archive && <> <span>(archivée)</span></>}</>}
      onClose={onClose}
      largeur={600}
      pied={(
        <>
          {peutSupprimer && <button type="button" style={st.secondaire} onClick={onSupprimer}>Supprimer</button>}
          {peutGerer && <button type="button" style={st.primaire} onClick={onModifier}>Modifier</button>}
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ho.email && ligne('E-mail', ho.email)}
        {ho.telephone && ligne('Téléphone', ho.telephone)}
        {ho.nationalite && ligne('Nationalité', ho.nationalite)}
        {ho.dateNaissance && ligne('Date de naissance', dateCourte(ho.dateNaissance))}
        {ho.occasions && ligne('Occasions', ho.occasions)}
        {ho.allergies && ligne('Allergies et régimes', ho.allergies)}
        {ho.preferences && ligne('Préférences', ho.preferences)}
        {ho.notes && ligne('Notes', ho.notes)}
        {ligne('Actualités', ho.consentementMarketing
          ? <><span>Accepte</span> <span data-no-translate>{dateHeureZurich(ho.consentementAt)}</span>{ho.consentementSource === 'en_ligne' ? <> <span>(en ligne)</span></> : null}</>
          : ho.desinscritAt ? <><span>Désinscrit le</span> <span data-no-translate>{dateHeureZurich(ho.desinscritAt)}</span></> : <span>Pas de consentement</span>, false)}
        {resa && ligne('Fiche restaurant', `${resa.prenom} ${resa.nom}`.trim())}
        {spa && ligne('Fiche spa', `${spa.prenom} ${spa.nom}`.trim())}
        {ho.createdBy && ligne('Créée par', nomPersonne(ho.createdBy))}
      </div>
      <div>
        <div style={h.sousTitre}><span>Séjours</span> <span>{mesSejours.length}</span></div>
        {!mesSejours.length && <div style={h.detail}>Aucun séjour relié à cette fiche.</div>}
        {mesSejours.map((s) => (
          <button key={s.id} type="button" className="tdb-lien" style={{ ...h.ligne, minHeight: 48, marginTop: 6 }} onClick={() => onOuvrirSejour?.(s)}>
            <span style={h.ligneGauche}>
              <span style={h.detail} data-no-translate>{dateCourte(s.arrivee)} - {dateCourte(s.depart)}</span>
              <span style={h.detail}>{s.chambreId ? <><span>Chambre</span> <span data-no-translate>{numero(s.chambreId)}</span></> : <span>Sans chambre</span>}<span aria-hidden="true"> </span><span>{personnes(s)}</span> <span>{personnes(s) > 1 ? 'personnes' : 'personne'}</span></span>
            </span>
            <Puce ton={tonDe(STATUTS_SEJOUR, s.statut)}>{libelleDe(STATUTS_SEJOUR, s.statut)}</Puce>
          </button>
        ))}
      </div>
      {mesDemandes.length > 0 && (
        <div>
          <div style={h.sousTitre}><span>Demandes</span> <span>{mesDemandes.length}</span></div>
          {mesDemandes.slice(0, 20).map((d) => (
            <div key={d.id} style={{ ...h.detail, padding: '4px 0' }}><span data-no-translate>{dateCourte(String(d.createdAt || '').slice(0, 10))}</span> <span data-no-translate>{d.titre}</span> <span>{d.statut === 'faite' ? '(faite)' : d.statut === 'annulee' ? '(annulée)' : '(ouverte)'}</span></div>
          ))}
        </div>
      )}
    </Fenetre>
  );
}

export default function HotesGestion({ hotes, sejours, demandes, resaClients, spaClients, chambres, peutGerer, peutSupprimer, onOuvrirSejour }) {
  const [recherche, setRecherche] = React.useState('');
  const [form, setForm] = React.useState(null); // { hote }
  const [ficheId, setFicheId] = React.useState(null);
  const [archives, setArchives] = React.useState(false);
  const correspond = makeSearchMatcher(recherche);
  const liste = hotes.rows
    .filter((ho) => archives || !ho.archive)
    .filter((ho) => !recherche || correspond(`${ho.prenom} ${ho.nom} ${ho.email} ${ho.telephone} ${ho.occasions} ${ho.nationalite}`));
  const fiche = ficheId ? hotes.rows.find((ho) => ho.id === ficheId) || null : null;
  const nbSejours = (ho) => sejours.filter((s) => s.hoteId === ho.id).length;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div className="module-actions">
        {peutGerer && (
          <Btn variant="primary" onClick={() => setForm({ hote: null })} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Nouvelle fiche hôte</span>
          </Btn>
        )}
        <SearchToggle value={recherche} onChange={setRecherche} placeholder="Nom, e-mail, téléphone…" />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={archives} onChange={(ev) => setArchives(ev.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
          <span>Voir les fiches archivées</span>
        </label>
      </div>
      {hotes.status === 'absent' && <Vide>Le fichier des hôtes n'est pas encore activé sur la base de données.</Vide>}
      {hotes.status === 'ready' && !liste.length && <Vide>Aucune fiche hôte pour l'instant.</Vide>}
      {liste.length > 0 && (
        <Liste>
          {liste.map((ho) => (
            <button key={ho.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => setFicheId(ho.id)} data-hote={ho.id}>
              <span style={h.ligneGauche}>
                <span style={h.nomHote} data-no-translate>{nomHote(ho)}</span>
                <span style={h.detail}>
                  {ho.email && <span data-no-translate>{ho.email}</span>}
                  {ho.telephone && <><span aria-hidden="true"> </span><span data-no-translate>{ho.telephone}</span></>}
                  <span aria-hidden="true"> </span><span>{nbSejours(ho)}</span> <span>{nbSejours(ho) > 1 ? 'séjours' : 'séjour'}</span>
                </span>
              </span>
              <span style={h.ligneDroite}>
                {ho.vip && <Puce ton="warning">VIP</Puce>}
                <Puce ton="neutre">{libelleDe(LANGUES, ho.langue)}</Puce>
                {ho.archive && <Puce ton="neutre">Archivée</Puce>}
              </span>
            </button>
          ))}
        </Liste>
      )}
      {form && <HoteForm hote={form.hote} hotes={hotes} resaClients={resaClients} spaClients={spaClients} onClose={() => setForm(null)} />}
      {fiche && !form && (
        <HoteFiche
          hote={fiche} sejours={sejours} demandes={demandes} resaClients={resaClients} spaClients={spaClients} chambres={chambres}
          peutGerer={peutGerer} peutSupprimer={peutSupprimer}
          onModifier={() => setForm({ hote: fiche })}
          onSupprimer={async () => { const r = await hotes.supprimer(fiche.id); if (r.error) notify(r.error, 'error'); else { notify('Fiche supprimée.', 'success'); setFicheId(null); } }}
          onOuvrirSejour={(s) => { setFicheId(null); onOuvrirSejour?.(s); }}
          onClose={() => setFicheId(null)}
        />
      )}
    </section>
  );
}
