import React from 'react';
import { Fenetre, st as fst } from '../../../components/ui/Fenetres.jsx';
import { dbService } from '../../../services/dbService.js';
import { confirmLegacy, notifyLegacy } from '../../../legacy/legacyApi.js';
import { CATEGORIES_PLAT } from '../../../utils/categoriesPlat.js';
import { makeSearchMatcher } from '../../../utils/searchText.js';
import { messageErreur } from '../../../utils/messageErreur.js';
import PhotoUploader from '../../consultant-tools/PhotoUploader.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Créer ou modifier un plat, dans Cartes & Recettes : photo, nom, catégorie,
// description, cartes où il figure, recettes qui le composent. Entrée dans le
// nom enregistre. Rien n'est écrit avant « Créer le plat » / « Enregistrer » ;
// Annuler ne laisse rien. Le prix de vente reste dans le Chiffrage des Outils
// consultant : il n'apparaît pas ici et l'enregistrement le conserve.
//
// plat : le plat à modifier, ou null pour un nouveau plat, posé d'office sur
// carteIdDefaut (la carte affichée) ; décocher la carte retire ce seul lien.
// ─────────────────────────────────────────────────────────────────────────────

export default function PlatFenetre({ plat, carteIdDefaut, etabId, cartes = [], recettes = [], onClose, onEnregistre }) {
  const legacySB = dbService.getBridge();
  const nouveau = !plat?.id;
  const [p, setP] = React.useState(() => (plat
    ? { ...plat, carteIds: [...(plat.carteIds || [])] }
    : { nom: '', categorie: 'Plats', description: '', photoUrl: null, carteIds: carteIdDefaut ? [carteIdDefaut] : [] }));
  const depart = React.useMemo(() => (plat?.recettes || []).map(pr => pr.recetteId), [plat]);
  const [recetteIds, setRecetteIds] = React.useState(depart);
  const [recherche, setRecherche] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const maj = (patch) => setP(prev => ({ ...prev, ...patch }));

  const nomDe = (id) => recettes.find(r => r.id === id)?.nom || 'Recette';
  const match = makeSearchMatcher(recherche);
  const suggestions = match.active
    ? recettes.filter(r => !recetteIds.includes(r.id) && match(r.nom)).slice(0, 6)
    : [];

  const enregistrer = async () => {
    if (enCours) return;
    if (!String(p.nom || '').trim()) { notifyLegacy('Le nom du plat est obligatoire.', 'warning'); return; }
    if (!legacySB) return;
    setEnCours(true);
    try {
      // upsertPlat ne lit que ses colonnes : le prix de vente du plat suit tel quel.
      const enregistre = await legacySB.db.upsertPlat({ ...p, nom: String(p.nom).trim(), etablissementId: etabId });
      const platId = enregistre?.id || p.id;
      if (platId) {
        await legacySB.db.setPlatCartes(platId, p.carteIds || []);
        for (const rid of recetteIds.filter(id => !depart.includes(id))) {
          await legacySB.db.linkRecetteToPlat(platId, rid, 'composant', 0);
        }
        for (const rid of depart.filter(id => !recetteIds.includes(id))) {
          await legacySB.db.unlinkRecetteFromPlat(platId, rid);
        }
      }
      notifyLegacy(nouveau ? `Plat « ${String(p.nom).trim()} » créé.` : 'Plat enregistré.', 'success');
      onEnregistre?.();
      onClose();
    } catch (err) {
      notifyLegacy(messageErreur(err, 'recettes', 'Enregistrement impossible.'), 'error');
      setEnCours(false);
    }
  };

  const supprimer = async () => {
    if (!p.id || !legacySB) return;
    if (!confirmLegacy(`Supprimer le plat « ${p.nom} » ? Les recettes restent, mais elles ne seront plus rattachées à ce plat.`)) return;
    setEnCours(true);
    try {
      await legacySB.db.deletePlat(p.id);
      onEnregistre?.();
      onClose();
    } catch (err) {
      notifyLegacy(messageErreur(err, 'recettes'), 'error');
      setEnCours(false);
    }
  };

  const pied = (
    <>
      {!nouveau && (
        <button type="button" style={{ ...fst.secondaire, color: 'var(--danger-strong)', marginRight: 'auto' }} onClick={supprimer} disabled={enCours}>Supprimer</button>
      )}
      <button type="button" style={fst.secondaire} onClick={onClose} disabled={enCours}>Annuler</button>
      <button type="button" style={fst.primaire} onClick={enregistrer} disabled={enCours}>{nouveau ? 'Créer le plat' : 'Enregistrer'}</button>
    </>
  );

  return (
    <Fenetre id="plat-fenetre" titre={nouveau ? 'Nouveau plat' : 'Modifier le plat'} sousTitre={nouveau ? null : plat.nom} onClose={onClose} largeur={520} pied={pied}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <PhotoUploader
          photoUrl={p.photoUrl}
          onUpload={async (file) => {
            // Un plat neuf n'a pas encore d'id : nom de fichier provisoire.
            const id = p.id || ('plat-temp-' + Date.now());
            try {
              const { url } = await legacySB.db.uploadRecettePhoto({ etabId, type: 'plat', id, file });
              maj({ photoUrl: url });
            } catch (err) { notifyLegacy('Envoi du fichier impossible. ' + messageErreur(err, 'recettes'), 'error'); }
          }}
          onRemove={() => maj({ photoUrl: null })}
        />
        <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={fst.label}>Nom du plat</span>
          <input
            autoFocus
            type="text"
            value={p.nom || ''}
            onChange={e => maj({ nom: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrer(); } }}
            enterKeyHint="done"
            placeholder="Ex : Filet de bœuf Rossini"
            style={fst.champ}
          />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={fst.label}>Catégorie</span>
        <select value={p.categorie || 'Plats'} onChange={e => maj({ categorie: e.target.value })} style={fst.champ}>
          {CATEGORIES_PLAT.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={fst.label}>Description (facultative)</span>
        <textarea value={p.description || ''} onChange={e => maj({ description: e.target.value })} rows={2} placeholder="Description courte du plat pour la carte…" style={{ ...fst.champ, resize: 'vertical' }} />
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={fst.label}>Cartes</span>
        {cartes.length === 0 ? (
          <span style={fst.remarque}>Aucune carte. Créez-en une dans Gérer.</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cartes.map((c) => {
              const coche = (p.carteIds || []).includes(c.id);
              return (
                <label key={c.id} style={{ ...puce, background: coche ? 'var(--accent-light)' : 'var(--surface)', color: coche ? 'var(--accent)' : 'var(--text2)', fontWeight: coche ? 700 : 500 }}>
                  <input
                    type="checkbox"
                    checked={coche}
                    onChange={() => maj({ carteIds: coche ? (p.carteIds || []).filter(id => id !== c.id) : [...(p.carteIds || []), c.id] })}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                  />
                  {c.nom}
                </label>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={fst.label}>Recettes du plat</span>
        {recetteIds.length === 0 && <span style={fst.remarque}>Aucune recette rattachée.</span>}
        {recetteIds.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recetteIds.map(id => (
              <span key={id} style={{ ...puce, background: 'var(--bg)', color: 'var(--text)' }}>
                {nomDe(id)}
                <button type="button" aria-label={`Retirer ${nomDe(id)}`} onClick={() => setRecetteIds(ids => ids.filter(x => x !== id))} style={retirer}>×</button>
              </span>
            ))}
          </div>
        )}
        <input
          type="text"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Ajouter une recette…"
          aria-label="Ajouter une recette au plat"
          style={fst.champ}
        />
        {suggestions.map(r => (
          <button key={r.id} type="button" style={suggestion} onClick={() => { setRecetteIds(ids => [...ids, r.id]); setRecherche(''); }}>
            {r.nom}
          </button>
        ))}
      </div>
    </Fenetre>
  );
}

const puce = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', minHeight: 36, borderRadius: 20, fontSize: 13, cursor: 'pointer', boxSizing: 'border-box' };
const retirer = { border: 'none', background: 'none', color: 'var(--text2)', fontSize: 16, cursor: 'pointer', padding: '0 2px', minHeight: 0, lineHeight: 1 };
const suggestion = { textAlign: 'left', padding: '10px 12px', minHeight: 44, background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 };
