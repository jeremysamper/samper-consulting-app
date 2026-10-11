import React from 'react';
import { createPortal } from 'react-dom';
import { dbService } from '../../services/dbService.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { libelleType } from './achatsLogic.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pièces des documents d'achat : les photos et PDF déposés, gardés pour être
// revus (bucket `documents`, <etab>/achats/<id du document>/). Partagé par les
// onglets « Achats & consommation » et « Factures ».
// ─────────────────────────────────────────────────────────────────────────────

const dateCH = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '');

// Types acceptés par le bucket `documents`. Le type se déduit de l'extension
// quand le navigateur ne le donne pas (photos HEIC sur Safari).
const FORMATS = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif',
};
export const estPdfFichier = (f) => /pdf$/i.test(f.type || '') || /\.pdf$/i.test(f.name || '');
const typeDe = (f) => {
  const ext = (/\.([a-z0-9]+)$/i.exec(f.name || '')?.[1] || '').toLowerCase();
  return FORMATS[ext] || (Object.values(FORMATS).includes(f.type) ? f.type : null);
};

// Photo ramenée en JPEG de 2200 px au plus (une facture reste lisible, le
// téléphone n'envoie pas 5 Mo par page). PDF gardé tel quel.
export const preparerPieces = async (fichiers) => {
  const pieces = [];
  for (const f of fichiers) {
    if (estPdfFichier(f)) { pieces.push({ file: f, contentType: 'application/pdf' }); continue; }
    try {
      const { default: imageCompression } = await import('browser-image-compression');
      const blob = await imageCompression(f, { maxSizeMB: 1.5, maxWidthOrHeight: 2200, useWebWorker: true, fileType: 'image/jpeg' });
      const nom = String(f.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
      pieces.push({ file: new File([blob], nom, { type: 'image/jpeg' }), contentType: 'image/jpeg' });
    } catch {
      // Format que ce navigateur ne sait pas redessiner (HEIC hors Safari) : l'original.
      const type = typeDe(f);
      if (!type) throw new Error(`format non accepté (${f.name})`);
      pieces.push({ file: f, contentType: type });
    }
  }
  return pieces;
};

// Libellé du bouton, d'après le nom gardé à l'import : « x.pdf »,
// « IMG_1.jpg » ou « IMG_1.jpg (+2 pages) » pour des photos groupées.
export const libelleVoir = (d) => {
  const nom = String(d.nomFichier || '');
  if (/\.pdf$/i.test(nom)) return 'Voir le PDF';
  const pages = /\(\+(\d+) pages?\)$/.exec(nom);
  return pages ? `Voir les ${Number(pages[1]) + 1} photos` : 'Voir la photo';
};

// Visionneuse plein écran : toutes les pages à la suite, à faire défiler.
// Montée seulement quand un document est ouvert ; `onClose` la referme
// (bouton, Échap, retour arrière).
export function VisionneusePieces({ doc, etabId, onClose }) {
  const legacySB = dbService.getBridge();
  // null = chargement
  const [pieces, setPieces] = React.useState(null);
  const [erreur, setErreur] = React.useState(null);
  useBackLayer(true, onClose, 'achats-apercu');

  React.useEffect(() => {
    let vivant = true;
    legacySB.db.listAchatsPieces(etabId, doc.id)
      .then(p => { if (vivant) setPieces(p); })
      .catch(err => { if (vivant) { setPieces([]); setErreur(err.message || String(err)); } });
    return () => { vivant = false; };
  }, [etabId, doc.id]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // URL signée « pièce jointe » : le fichier s'enregistre, y compris sur iPad,
  // au lieu de s'ouvrir dans un onglet.
  const telecharger = async (piece) => {
    try {
      const url = await legacySB.db.getFileURL(piece.chemin, { download: piece.nom });
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      notifyLegacy('Téléchargement impossible : ' + (err.message || err), 'error');
    }
  };

  return createPortal(
    <div style={st.fond} role="dialog" aria-modal="true" aria-label="Photo du document">
      <div style={st.tete}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={st.nom}>
            <span data-no-translate>{doc.fournisseurNom || 'Fournisseur non lu'}</span>
            {doc.numero ? <span data-no-translate>{`, n° ${doc.numero}`}</span> : null}
          </div>
          <div style={st.meta}>
            {libelleType(doc.typeDocument)}{doc.dateDocument ? ` du ${dateCH(doc.dateDocument)}` : ''}
          </div>
        </div>
        <button type="button" style={st.btn} onClick={onClose} aria-label="Fermer">✕</button>
      </div>
      <div style={st.corps}>
        {pieces === null && <div style={st.info}>Ouverture du document…</div>}
        {erreur && <div style={st.info}>Ouverture impossible : {erreur}</div>}
        {pieces && !erreur && pieces.length === 0 && (
          <div style={st.info}>Pas de photo conservée pour ce document.</div>
        )}
        {(pieces || []).map((p, i, liste) => {
          const pdf = p.type === 'application/pdf' || /\.pdf$/i.test(p.nom);
          return (
            <div key={p.chemin} style={st.piece}>
              <div style={st.barre}>
                <span style={{ flex: 1, minWidth: 0 }}>{liste.length > 1 ? `Page ${i + 1} sur ${liste.length}` : ''}</span>
                {/* Lien direct : l'URL est déjà signée, le tap reste un geste
                    utilisateur et l'ouverture n'est pas bloquée sur iPad (où un
                    PDF intégré n'affiche souvent que sa première page). */}
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={st.btn}>Plein écran</a>}
                <button type="button" style={st.btn} onClick={() => telecharger(p)}>Télécharger</button>
              </div>
              {!p.url ? <div style={st.info}>Lien indisponible, réessayez.</div>
                : pdf ? <iframe src={p.url} title={`Document, page ${i + 1}`} style={st.pdf} />
                  : <img src={p.url} alt={`Page ${i + 1} du document`} style={st.img} />}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// Fond noir comme la visionneuse du module Documents, quel que soit le thème.
const st = {
  fond: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', display: 'flex', flexDirection: 'column', zIndex: 1000 },
  tete: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(0,0,0,0.55)', color: '#fff', flexShrink: 0 },
  nom: { fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: 11, opacity: 0.75, marginTop: 2 },
  btn: { display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 },
  corps: { flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 },
  piece: { width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 },
  barre: { display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 12, flexWrap: 'wrap' },
  img: { width: '100%', height: 'auto', borderRadius: 6, background: '#fff', display: 'block' },
  pdf: { width: '100%', height: '78vh', border: 'none', background: '#fff', borderRadius: 6 },
  info: { color: '#fff', fontSize: 14, padding: 24, textAlign: 'center' },
};
