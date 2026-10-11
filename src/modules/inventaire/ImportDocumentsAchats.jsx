import React from 'react';
import { dbService } from '../../services/dbService.js';
import { normalizeName } from '../../services/recipeProductMatching.js';
import { TYPES_DOCUMENT, devinerTypeDocument, trouverDoublon } from './achatsLogic.js';
import { estPdfFichier, preparerPieces } from './achatsPieces.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Import des factures et bons : on dépose d'un coup les PDF reçus par mail ou
// les photos, l'IA lit chaque document, et le document est enregistré dans
// achats_documents avec sa pièce. Partagé par les onglets « Achats &
// consommation » et « Factures » : un document importé d'un côté apparaît
// dans l'autre.
//
// Principe de sûreté : l'IA ne fait que LIRE. Elle n'écrit ni dans le
// catalogue ni dans les prix. La lecture est ouverte à toute l'équipe qui a
// accès à l'inventaire (ai-proxy : parse-facture autorisé pour tous les rôles).
// ─────────────────────────────────────────────────────────────────────────────

const CONCURRENCE = 3;
const dateCH = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '');

export default function ImportDocumentsAchats({
  user, etabId, perimetreActif, docsRef, onImporte, tableAbsente,
  typeParDefaut = 'auto', titre, sousTitre,
}) {
  const legacySB = dbService.getBridge();
  const [file, setFile] = React.useState([]); // travaux de lecture
  const [typeImport, setTypeImport] = React.useState(typeParDefaut);
  const [grouper, setGrouper] = React.useState(false);
  const [fournisseurs, setFournisseurs] = React.useState([]);
  const fileRef = React.useRef(null);
  const cameraRef = React.useRef(null);
  const enCoursRef = React.useRef(0);
  const attenteRef = React.useRef([]);

  React.useEffect(() => {
    if (!legacySB) return undefined;
    let vivant = true;
    legacySB.db.listFournisseurs(etabId).then(f => { if (vivant) setFournisseurs(f || []); }).catch(() => {});
    return () => { vivant = false; };
  }, [etabId]);

  const majTravail = (key, patch) => setFile(f => f.map(t => (t.key === key ? { ...t, ...patch } : t)));

  const trouverFournisseurId = (nom) => {
    const n = normalizeName(nom);
    if (!n) return null;
    const f = fournisseurs.find(x => normalizeName(x.nom) === n)
      || fournisseurs.find(x => { const y = normalizeName(x.nom); return y && (y.includes(n) || n.includes(y)); });
    return f?.id || null;
  };

  const traiter = async (travail) => {
    majTravail(travail.key, { statut: 'lecture' });
    try {
      const { parseFacture } = await import('../../services/aiService.js');
      const res = await parseFacture(travail.fichiers);
      const doc = {
        id: 'achat-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        etablissementId: etabId,
        perimetre: travail.perimetre,
        typeDocument: travail.type === 'auto' ? devinerTypeDocument(travail.nom) : travail.type,
        fournisseurNom: res.fournisseur || '',
        fournisseurId: trouverFournisseurId(res.fournisseur),
        numero: res.numeroFacture || '',
        dateDocument: res.dateFacture || null,
        totalHT: res.totalHT,
        totalTTC: res.totalTTC,
        dateEcheance: res.dateEcheance || null,
        lignes: (res.lignes || []).map(l => ({
          libelle: l.libelle,
          referenceFourn: l.referenceFourn || '',
          quantite: l.quantite,
          conditionnement: l.conditionnement || '',
          quantiteTotale: l.quantiteTotale,
          uniteTotale: l.uniteTotale,
          montantLigne: l.montantLigne,
          issues: l.issues || [],
        })),
        source: res.source,
        nomFichier: travail.nom,
        createdBy: user?.id || null,
      };
      if (!doc.lignes.length) {
        majTravail(travail.key, { statut: 'erreur', message: 'Aucune ligne de produit lisible.' });
        return;
      }
      const doublon = trouverDoublon(docsRef.current || [], doc);
      if (doublon) {
        majTravail(travail.key, { statut: 'doublon', message: `Déjà importé (${doc.fournisseurNom} n° ${doc.numero})` });
        return;
      }
      // La photo ou le PDF est gardé pour être revu (« Voir la photo »).
      // Enregistré AVANT le document : quand il apparaît sur une autre
      // tablette, sa pièce est déjà là. Un échec ici n'annule pas la lecture.
      let pieceGardee = false;
      try {
        await legacySB.db.uploadAchatsPieces(etabId, doc.id, await preparerPieces(travail.fichiers));
        pieceGardee = true;
      } catch (err) {
        console.error('[import achats pièces]', err);
      }
      let enregistre;
      try {
        enregistre = await legacySB.db.upsertAchatsDocument(doc, { creation: true });
      } catch (err) {
        if (pieceGardee) legacySB.db.removeAchatsPieces(etabId, doc.id).catch(() => {});
        throw err;
      }
      onImporte(enregistre, pieceGardee);
      majTravail(travail.key, {
        statut: 'ok',
        message: `${doc.fournisseurNom || 'Fournisseur non lu'}, ${doc.lignes.length} ligne${doc.lignes.length > 1 ? 's' : ''}`
          + (doc.dateDocument ? `, ${dateCH(doc.dateDocument)}` : ', date non lue')
          + (pieceGardee ? '' : estPdfFichier(travail.fichiers[0]) ? ', PDF non conservé' : ', photo non conservée'),
      });
    } catch (err) {
      majTravail(travail.key, { statut: 'erreur', message: err.message || String(err) });
    }
  };

  // File à concurrence bornée : trois lectures en parallèle, pas trente.
  const pomper = () => {
    while (enCoursRef.current < CONCURRENCE && attenteRef.current.length) {
      const travail = attenteRef.current.shift();
      enCoursRef.current += 1;
      traiter(travail).finally(() => { enCoursRef.current -= 1; pomper(); });
    }
  };

  const deposer = (liste) => {
    const fichiers = Array.from(liste || []);
    if (!fichiers.length) return;
    const pdfs = fichiers.filter(estPdfFichier);
    const images = fichiers.filter(f => !estPdfFichier(f));
    const travaux = pdfs.map(f => [f]);
    if (grouper && images.length) {
      for (let i = 0; i < images.length; i += 5) travaux.push(images.slice(i, i + 5));
    } else {
      images.forEach(f => travaux.push([f]));
    }
    const nouveaux = travaux.map((fs, i) => ({
      key: `${Date.now()}-${i}-${fs[0].name}`,
      fichiers: fs,
      nom: fs.length > 1 ? `${fs[0].name} (+${fs.length - 1} page${fs.length > 2 ? 's' : ''})` : fs[0].name,
      type: typeImport,
      perimetre: perimetreActif,
      statut: 'attente',
      message: '',
    }));
    setFile(f => [...nouveaux, ...f]);
    attenteRef.current.push(...nouveaux);
    pomper();
  };

  const relancer = (travail) => {
    majTravail(travail.key, { statut: 'attente', message: '' });
    attenteRef.current.push(travail);
    pomper();
  };

  const enAttente = file.filter(t => t.statut === 'attente' || t.statut === 'lecture').length;

  return (
    <div style={st.carte}>
      <div style={st.titre}>{titre}</div>
      {sousTitre && <div style={st.sousTitre}>{sousTitre}</div>}
      <div style={st.importLigne}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
          onChange={e => { deposer(e.target.files); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => { deposer(e.target.files); e.target.value = ''; }} />
        <button type="button" style={st.btnPrimaire} disabled={tableAbsente} onClick={() => fileRef.current?.click()}>Choisir des documents</button>
        <button type="button" style={st.btn} disabled={tableAbsente} onClick={() => cameraRef.current?.click()}>Photographier</button>
        <select value={typeImport} onChange={e => setTypeImport(e.target.value)} style={st.select} aria-label="Type des documents">
          <option value="auto">Type : deviner</option>
          {TYPES_DOCUMENT.map(t => <option key={t.id} value={t.id}>Type : {t.pluriel}</option>)}
        </select>
        <label style={st.caseLabel}>
          <input type="checkbox" checked={grouper} onChange={e => setGrouper(e.target.checked)} style={{ width: 18, height: 18 }} />
          Photos = pages d'un même document
        </label>
      </div>
      {file.length > 0 && (
        <div style={st.file}>
          {enAttente > 0 && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Lecture en cours : {enAttente} document{enAttente > 1 ? 's' : ''}. Vous pouvez continuer à compter en attendant.</div>}
          {file.map(t => (
            <div key={t.key} style={st.travail}>
              <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>
                {t.statut === 'ok' ? '✓' : t.statut === 'erreur' ? '!' : t.statut === 'doublon' ? '≡' : t.statut === 'lecture' ? '…' : '○'}
              </span>
              <span data-no-translate style={{ flex: '1 1 160px', minWidth: 0, wordBreak: 'break-word', fontWeight: 600 }}>{t.nom}</span>
              <span style={{ flex: '2 1 200px', minWidth: 0, color: t.statut === 'erreur' ? 'var(--danger-text)' : 'var(--text2)' }}>
                {t.statut === 'attente' ? 'en attente' : t.statut === 'lecture' ? 'lecture en cours…' : t.message}
              </span>
              {t.statut === 'erreur' && <button type="button" style={st.btnMini} onClick={() => relancer(t)}>Réessayer</button>}
            </div>
          ))}
          {enAttente === 0 && <button type="button" style={{ ...st.lien, marginTop: 4 }} onClick={() => setFile([])}>Effacer cette liste</button>}
        </div>
      )}
    </div>
  );
}

const st = {
  carte: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  titre: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sousTitre: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 },
  importLigne: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btnPrimaire: { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  btn: { padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  btnMini: { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 36, whiteSpace: 'nowrap' },
  lien: { background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  select: { padding: '8px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)', minHeight: 40 },
  caseLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', minHeight: 44, cursor: 'pointer' },
  file: { display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 10 },
  travail: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '4px 0', color: 'var(--text)' },
};
