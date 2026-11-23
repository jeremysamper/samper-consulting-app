import React from 'react';
import { ChevronUp, Plus, X } from 'lucide-react';
import { Fenetre, st as fst } from '../../components/ui/Fenetres.jsx';
import { dbService } from '../../services/dbService.js';
import { enregistrerFormats } from '../../services/formatsService.js';
import { confirmLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { NOMS_RUBRIQUES, RUBRIQUE_DEFAUT } from '../../utils/categoriesBoisson.js';
import { LIBELLE_FORMAT_MAX, validerFormats } from '../../utils/formatsBoisson.js';
import PhotoUploader from '../consultant-tools/PhotoUploader.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Ajouter ou modifier une boisson (Carte des boissons) : photo, nom, rubrique,
// description, cartes de boissons où elle figure, prix de vente ou formats.
// Rien n'est écrit avant « Ajouter la boisson » ou « Enregistrer ».
//
// Une boisson est une ligne de plats : upsertPlat en garde les colonnes qu'il
// ne connaît pas. Les liens vers des cartes de mets (Cartes & Recettes, que ce
// module ne montre pas) sont conservés tels quels : seules les cartes de
// boissons se cochent ici.
//
// Formats : avec au moins un format, la caisse demande le format et prend son
// prix ; le prix de vente du plat reste en base sans servir à la caisse.
// ─────────────────────────────────────────────────────────────────────────────

const FORMATS_COURANTS = ['1 dl', '2 dl', '3 dl', '37,5 cl', '50 cl', '75 cl', '150 cl'];
const texteDePrix = (n) => (n == null || n === '' ? '' : String(n));

export default function BoissonFenetre({ boisson, carteIdDefaut, etabId, cartes = [], idsBoissons, onClose, onEnregistre }) {
  const legacySB = dbService.getBridge();
  const nouveau = !boisson?.id;
  const [b, setB] = React.useState(() => ({
    nom: boisson?.nom || '',
    categorie: boisson?.categorie || '',
    description: boisson?.description || '',
    photoUrl: boisson?.photoUrl || null,
    prix: texteDePrix(boisson?.prixVente),
    carteIds: (boisson?.carteIds || (carteIdDefaut ? [carteIdDefaut] : [])).filter((id) => idsBoissons?.has(id)),
  }));
  const [formats, setFormats] = React.useState(() => (boisson?.formats || []).map((f) => ({ id: f.id, libelle: f.libelle, prix: texteDePrix(f.prix) })));
  const [enCours, setEnCours] = React.useState(false);
  const maj = (patch) => setB((prev) => ({ ...prev, ...patch }));
  const majFormat = (i, patch) => setFormats((liste) => liste.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const avecFormats = formats.length > 0;

  const enregistrer = async () => {
    if (enCours || !legacySB) return;
    const nom = b.nom.trim();
    if (!nom) { notifyLegacy('Donnez un nom à la boisson.', 'warning'); return; }
    const verifies = validerFormats(formats);
    if (verifies.erreur) { notifyLegacy(verifies.erreur, 'warning'); return; }
    let prixVente = boisson?.prixVente ?? null;
    if (!verifies.formats.length) {
      const brut = b.prix.trim().replace(',', '.');
      const n = brut === '' ? null : Number(brut);
      if (n != null && (!Number.isFinite(n) || n < 0)) { notifyLegacy('Le prix doit être un nombre, par exemple 6.50.', 'warning'); return; }
      prixVente = n == null ? null : Math.round(n * 100) / 100;
    }
    setEnCours(true);
    try {
      const enregistre = await legacySB.db.upsertPlat({
        ...(boisson || {}),
        nom,
        categorie: b.categorie.trim() || RUBRIQUE_DEFAUT,
        description: b.description,
        photoUrl: b.photoUrl,
        prixVente,
        etablissementId: etabId,
      });
      const platId = enregistre?.id || boisson?.id;
      if (platId) {
        // Les cartes de mets du plat restent ; les cartes de boissons suivent les cases.
        const mets = (boisson?.carteIds || []).filter((id) => !idsBoissons?.has(id));
        await legacySB.db.setPlatCartes(platId, [...mets, ...b.carteIds]);
        const { error } = await enregistrerFormats({ platId, etablissementId: etabId, formats: verifies.formats, avant: boisson?.formats || [] });
        if (error) { notifyLegacy(error, 'error'); setEnCours(false); onEnregistre?.(); return; }
      }
      notifyLegacy(nouveau ? 'Boisson ajoutée à la carte.' : 'Boisson enregistrée.', 'success');
      onEnregistre?.();
      onClose();
    } catch (err) {
      notifyLegacy(messageErreur(err, 'boissons', 'Enregistrement impossible.'), 'error');
      setEnCours(false);
    }
  };

  const supprimer = async () => {
    if (!boisson?.id || !legacySB) return;
    if (!confirmLegacy(`Supprimer « ${boisson.nom} » ? Elle quitte toutes les cartes et la caisse. Les ventes passées gardent son nom, et sa fiche, s'il en a une, reste dans la bibliothèque des recettes.`)) return;
    setEnCours(true);
    try {
      await legacySB.db.deletePlat(boisson.id);
      notifyLegacy('Boisson supprimée.', 'success');
      onEnregistre?.();
      onClose();
    } catch (err) {
      notifyLegacy(messageErreur(err, 'boissons'), 'error');
      setEnCours(false);
    }
  };

  const monter = (i) => setFormats((liste) => {
    if (i <= 0) return liste;
    const copie = [...liste];
    [copie[i - 1], copie[i]] = [copie[i], copie[i - 1]];
    return copie;
  });

  const pied = (
    <>
      {!nouveau && (
        <button type="button" style={{ ...fst.secondaire, color: 'var(--danger-strong)', marginRight: 'auto' }} onClick={supprimer} disabled={enCours}>Supprimer</button>
      )}
      <button type="button" style={fst.secondaire} onClick={onClose} disabled={enCours}>Annuler</button>
      <button type="button" style={fst.primaire} onClick={enregistrer} disabled={enCours}>{nouveau ? 'Ajouter la boisson' : 'Enregistrer'}</button>
    </>
  );

  return (
    <Fenetre id="boisson-fenetre" titre={nouveau ? 'Nouvelle boisson' : 'Modifier la boisson'} sousTitre={nouveau ? null : boisson.nom} onClose={onClose} largeur={540} pied={pied}>
      <div style={s.ligneHaut}>
        <PhotoUploader
          photoUrl={b.photoUrl}
          size={88}
          onUpload={async (file) => {
            // Une boisson neuve n'a pas encore d'id : nom de fichier provisoire.
            const id = boisson?.id || ('plat-temp-' + Date.now());
            try {
              const { url } = await legacySB.db.uploadRecettePhoto({ etabId, type: 'plat', id, file });
              maj({ photoUrl: url });
            } catch (err) { notifyLegacy('Envoi du fichier impossible. ' + messageErreur(err, 'boissons'), 'error'); }
          }}
          onRemove={() => maj({ photoUrl: null })}
        />
        <label style={s.champ}>
          <span style={fst.label}>Nom de la boisson</span>
          <input
            autoFocus
            type="text"
            value={b.nom}
            onChange={(e) => maj({ nom: e.target.value })}
            placeholder="Ex : Fendant du Valais"
            style={fst.champ}
          />
        </label>
      </div>
      <label style={s.champ}>
        <span style={fst.label}>Rubrique</span>
        <input type="text" list="boisson-rubriques" value={b.categorie} onChange={(e) => maj({ categorie: e.target.value })} placeholder="Vins blancs, Cocktails, Softs..." style={fst.champ} />
        <datalist id="boisson-rubriques">
          {NOMS_RUBRIQUES.map((r) => <option key={r} value={r} />)}
        </datalist>
      </label>
      <label style={s.champ}>
        <span style={fst.label}>Description (facultative)</span>
        <textarea value={b.description} onChange={(e) => maj({ description: e.target.value })} rows={2} placeholder="Cépage, millésime, notes de dégustation..." style={{ ...fst.champ, resize: 'vertical' }} />
      </label>

      <div style={s.bloc}>
        <span style={fst.label}>Cartes des boissons</span>
        {cartes.length === 0 ? (
          <span style={fst.remarque}>Aucune carte des boissons. Créez-en une dans Gérer.</span>
        ) : (
          <div style={s.puces}>
            {cartes.map((c) => {
              const coche = b.carteIds.includes(c.id);
              return (
                <label key={c.id} style={{ ...s.puce, background: coche ? 'var(--selection)' : 'var(--surface)', color: coche ? 'var(--text)' : 'var(--text2)', fontWeight: coche ? 'var(--g3)' : 'var(--g2)' }}>
                  <input
                    type="checkbox"
                    checked={coche}
                    onChange={() => maj({ carteIds: coche ? b.carteIds.filter((id) => id !== c.id) : [...b.carteIds, c.id] })}
                    style={s.case}
                  />
                  <span data-no-translate>{c.nom}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div style={s.bloc}>
        <span style={fst.label}>Formats de vente</span>
        <span style={fst.remarque}>
          {avecFormats
            ? 'À la caisse, la boisson garde un seul bouton : il demande le format et prend son prix.'
            : 'Sans format, la boisson se vend à un seul prix. Ajoutez des formats pour la vendre au verre et à la bouteille, par exemple 1 dl et 75 cl.'}
        </span>
        {formats.map((f, i) => (
          <div key={f.id || `neuf-${i}`} style={s.format} data-boisson-format="">
            <input
              type="text"
              list="boisson-formats-courants"
              value={f.libelle}
              maxLength={LIBELLE_FORMAT_MAX}
              onChange={(e) => majFormat(i, { libelle: e.target.value })}
              placeholder="1 dl"
              aria-label="Nom du format"
              style={{ ...fst.champ, flex: '1 1 0', minWidth: 0 }}
            />
            <input
              type="text"
              inputMode="decimal"
              value={f.prix}
              onChange={(e) => majFormat(i, { prix: e.target.value })}
              placeholder="0.00"
              aria-label="Prix du format"
              style={{ ...fst.champ, flex: '0 0 96px', textAlign: 'right' }}
            />
            <button type="button" style={s.rond} onClick={() => monter(i)} disabled={i === 0} aria-label="Monter ce format" title="Monter ce format">
              <ChevronUp size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button type="button" style={s.rond} onClick={() => setFormats((liste) => liste.filter((_, j) => j !== i))} aria-label="Retirer ce format" title="Retirer ce format">
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        ))}
        <datalist id="boisson-formats-courants">
          {FORMATS_COURANTS.map((x) => <option key={x} value={x} />)}
        </datalist>
        <button type="button" style={{ ...fst.secondaire, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setFormats((liste) => [...liste, { id: null, libelle: '', prix: '' }])}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Ajouter un format</span>
        </button>
        {!avecFormats && (
          <label style={s.champ}>
            <span style={fst.label}>Prix de vente</span>
            <input type="text" inputMode="decimal" value={b.prix} onChange={(e) => maj({ prix: e.target.value })} placeholder="0.00" style={{ ...fst.champ, maxWidth: 160 }} />
          </label>
        )}
      </div>
    </Fenetre>
  );
}

const s = {
  ligneHaut: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  champ: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  bloc: { display: 'flex', flexDirection: 'column', gap: 8 },
  puces: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  puce: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', minHeight: 44, borderRadius: 'var(--r-full)', fontSize: 'var(--t2)', cursor: 'pointer', boxSizing: 'border-box' },
  case: { width: 18, height: 18, accentColor: 'var(--accent)' },
  format: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  rond: { width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 'var(--r-full)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' },
};
