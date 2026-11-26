import React from 'react';
import { ImageOff } from 'lucide-react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import {
  ACCEPTED_MIME, HEIC_EXTENSIONS, MAX_FILE_SIZE_MB, compresserVignette, convertHeicToJpeg, getExtension,
} from '../consultant-tools/photoProcessing.js';
import { nomCourtDefaut } from './boutons.js';
import { ChoixCouleur, ChoixPicto } from './ChoixHabillage.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Habillage d'un bouton produit (consultant, patron, resp_cuisine) : nom
// court, couleur de la palette caisse, picto. Feuille refermable par le geste
// retour et Échap ; un seul Enregistrer (l'habillage n'est pas un geste de
// service, pas besoin d'écritures immédiates). Tout vide = bouton redevenu
// neutre (la ligne d'habillage est retirée).
//
// Photo de la case (21.11.2026) : par défaut celle de la fiche du plat ; la
// maison peut en poser une autre (envoyée tout de suite, réduite en vignette,
// gardée à l'Enregistrer) ou choisir « Sans photo ». photo vaut null (fiche),
// '' (sans photo) ou l'adresse envoyée.
//
// Disponibilité (L2 du 22.11.2026, lot 12 du panel) : en tête de la fiche,
// l'état du produit et « Changer la disponibilité », qui ouvre la feuille de
// l'appui long (FeuilleDisponibilite) par-dessus la fiche. Écrit tout de suite
// (geste de service), sans attendre l'Enregistrer de l'habillage.
// ─────────────────────────────────────────────────────────────────────────────

export default function BoutonFiche({
  plat, bouton, etablissementId, onEnregistrer, onClose,
  disponibilite = null, onDisponibilite = null,
}) {
  const [nomCourt, setNomCourt] = React.useState(bouton?.nom_court || '');
  const [couleur, setCouleur] = React.useState(bouton?.couleur || null);
  const [picto, setPicto] = React.useState(bouton?.picto || null);
  const [photo, setPhoto] = React.useState(bouton?.photo_url ?? null);
  const [envoiPhoto, setEnvoiPhoto] = React.useState(false);
  const [enCours, setEnCours] = React.useState(false);
  const fichierRef = React.useRef(null);
  const voileRef = React.useRef(null);

  useBackLayer(true, onClose, 'caisse-bouton-fiche');

  React.useEffect(() => {
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      // Une fenêtre ouverte par-dessus (feuille de disponibilité) se ferme seule.
      const voiles = document.querySelectorAll('[data-fenetre]');
      if (voiles.length && voiles[voiles.length - 1] !== voileRef.current) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [onClose]);

  if (!plat) return null;

  const photoFiche = plat.photoUrl || null;
  const photoVue = photo === '' ? null : (photo || photoFiche);

  async function enregistrer() {
    if (enCours || envoiPhoto) return;
    setEnCours(true);
    try {
      // La photo n'est envoyée que si elle a changé : un habillage sans photo
      // touchée n'écrit pas la colonne.
      const photoChangee = photo !== (bouton?.photo_url ?? null);
      await onEnregistrer({
        nomCourt: nomCourt.trim().slice(0, 24), couleur, picto, ...(photoChangee ? { photoUrl: photo } : null),
      });
    } finally {
      setEnCours(false);
    }
  }

  // Photo choisie : mêmes formats que les photos des fiches (HEIC converti),
  // toujours réduite en vignette avant l'envoi.
  async function choisirPhoto(e) {
    const original = e.target.files?.[0];
    if (fichierRef.current) fichierRef.current.value = '';
    if (!original || envoiPhoto) return;
    const ext = getExtension(original.name);
    const heic = HEIC_EXTENSIONS.has(ext) || /^image\/(heic|heif)$/i.test(original.type);
    if (!heic && !ACCEPTED_MIME.has(original.type)) {
      notify('Choisissez une image JPG, PNG, WebP ou HEIC.', 'error');
      return;
    }
    if (original.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      notify(`Image trop lourde : ${MAX_FILE_SIZE_MB} Mo au plus.`, 'error');
      return;
    }
    const db = dbService.getDb();
    if (!db?.uploadRecettePhoto) { notify("L'envoi de photo n'est pas disponible.", 'error'); return; }
    setEnvoiPhoto(true);
    try {
      let fichier = heic ? await convertHeicToJpeg(original) : original;
      try { fichier = await compresserVignette(fichier); } catch (err) { console.warn('[caisse] vignette', err); }
      const { url } = await db.uploadRecettePhoto({ etabId: etablissementId, type: 'caisse', id: plat.id, file: fichier });
      if (!url) throw new Error('adresse absente');
      setPhoto(url);
    } catch (err) {
      console.error('[caisse] photo de la case', err);
      notify("La photo n'a pas pu être envoyée. Réessayez.", 'error');
    } finally {
      setEnvoiPhoto(false);
    }
  }

  return (
    <div ref={voileRef} className="modal-sheet-overlay" data-fenetre="" style={st.overlay} onClick={onClose}>
      <div className="modal-sheet" role="region" aria-label="Habillage du bouton" style={st.feuille} onClick={(e) => e.stopPropagation()}>
        <div style={st.enTete}>
          <div style={st.titre} data-no-translate>{plat.nom}</div>
          <Btn variant="ghost" onClick={onClose} style={st.btn44}>Fermer</Btn>
        </div>

        {onDisponibilite && disponibilite && (
          <div style={st.ruptureRang} data-caisse-fiche-rupture={disponibilite.etat}>
            <p style={st.ruptureTexte}>
              {disponibilite.etat === 'epuise' && 'Épuisé jusqu\'à nouvel arrivage. La case reste grisée sur toutes les caisses.'}
              {disponibilite.etat === 'rupture' && 'En rupture jusqu\'à demain matin. La case est grisée sur toutes les caisses.'}
              {disponibilite.etat === 'compte' && (
                <><span>Portions restantes aujourd&apos;hui :</span> <span data-no-translate>{disponibilite.restant}</span></>
              )}
              {disponibilite.etat === 'en_vente' && 'En vente sur toutes les caisses.'}
            </p>
            <Btn variant="ghost" onClick={onDisponibilite} style={st.btn44}>Changer la disponibilité</Btn>
          </div>
        )}

        <div style={st.rangTitre}>Nom court</div>
        <Input
          value={nomCourt}
          onChange={(e) => setNomCourt(e.target.value.slice(0, 24))}
          placeholder={nomCourtDefaut(plat.nom)}
          style={{ minHeight: 44, width: '100%' }}
        />

        <div style={st.rangTitre}>Photo</div>
        <div style={st.photoRang} data-caisse-photo-fiche="">
          {photoVue ? (
            <img src={photoVue} alt="" style={st.photoApercu} />
          ) : (
            <span style={st.photoVide}><ImageOff size={22} strokeWidth={1.75} aria-hidden="true" /></span>
          )}
          <span style={st.photoActions}>
            <Btn variant="ghost" disabled={envoiPhoto} onClick={() => fichierRef.current?.click()} style={st.btn44}>
              {envoiPhoto ? 'Envoi en cours' : (photoVue ? 'Changer la photo' : 'Choisir une photo')}
            </Btn>
            {photoVue && <Btn variant="ghost" disabled={envoiPhoto} onClick={() => setPhoto('')} style={st.btn44}>Sans photo</Btn>}
            {photoFiche && photo !== null && (
              <Btn variant="ghost" disabled={envoiPhoto} onClick={() => setPhoto(null)} style={st.btn44}>Photo de la fiche</Btn>
            )}
          </span>
          <input
            ref={fichierRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
            style={{ display: 'none' }}
            onChange={choisirPhoto}
          />
        </div>
        <p style={st.photoAide}>
          {photo === null && photoFiche && 'La case montre la photo de la fiche du plat.'}
          {photo === null && !photoFiche && "La fiche du plat n'a pas de photo. La case garde sa couleur et son picto."}
          {photo === '' && 'La case garde sa couleur et son picto, sans photo.'}
          {photo && 'Photo propre à la caisse.'}
        </p>

        <div style={st.rangTitre}>Couleur</div>
        <ChoixCouleur valeur={couleur} onChange={setCouleur} />

        <div style={st.rangTitre}>Pictogramme</div>
        <ChoixPicto valeur={picto} onChange={setPicto} />

        <div style={st.pied}>
          <Btn variant="primary" onClick={enregistrer} disabled={enCours || envoiPhoto} style={st.btn44}>Enregistrer</Btn>
        </div>
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200, padding: 16,
  },
  feuille: {
    background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 640, maxWidth: '100%',
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
  },
  enTete: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  titre: { fontSize: 18, fontWeight: 500, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2, minWidth: 0 },
  rangTitre: { fontSize: 12, fontWeight: 600, color: 'var(--text3)', margin: '14px 0 6px' },
  pied: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  photoRang: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  photoApercu: { width: 96, height: 72, objectFit: 'cover', borderRadius: 'var(--r)', flexShrink: 0, background: 'var(--piste)' },
  photoVide: {
    width: 96, height: 72, borderRadius: 'var(--r)', flexShrink: 0, background: 'var(--piste)', color: 'var(--text3)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  photoActions: { display: 'flex', gap: 8, flexWrap: 'wrap', minWidth: 0 },
  photoAide: { margin: '6px 0 0', fontSize: 'var(--t1)', color: 'var(--text3)', lineHeight: 1.4 },
  btn44: { minHeight: 44, flexShrink: 0 },
  ruptureRang: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 10, padding: '10px 12px', minWidth: 0,
    background: 'var(--piste)', borderRadius: 'var(--r)',
  },
  ruptureTexte: { margin: 0, flex: '1 1 220px', minWidth: 0, fontSize: 'var(--t2)', lineHeight: 1.4, color: 'var(--text)' },
};
