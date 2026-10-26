import React from 'react';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { Btn } from '../../components/ui/index.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import LignesARattacher from './LignesARattacher.jsx';
import { libelleVoir, VisionneusePieces } from './achatsPieces.jsx';
import { libelleType, prixLusDuDocument } from './achatsLogic.js';
import { dateCH } from './inventaireLignes.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Vérifier la lecture » : chaque document lu passe par cet écran, un à la
// fois. Les champs que la lecture n'a pas rendus sont marqués « Non lu » et
// obligatoires (fournisseur et date pour tout document, total TTC pour une
// facture) : « Enregistrer » reste inactif tant qu'ils sont vides. Le document
// et sa photo sont déjà en base (pièce puis upsert, à l'import) : quitter
// l'écran ne perd rien, le document reste signalé « à compléter ».
//
// Après « Enregistrer » : les lignes à rattacher de ce document, et, pour qui
// gère l'inventaire, les prix lus reportés sur les produits rattachés.
// Les écritures restent dans Inventaire.jsx (onEnregistrer, enregistrerDoc).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// « 1'234.50 », « 1 234,50 », « 454.5 » : saisie libre du montant.
// null = vide, undefined = illisible.
const lireMontant = (texte) => {
  const t = String(texte ?? '').replace(/[\s'’]/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};
const DATE_VALIDE = /^20\d{2}-\d{2}-\d{2}$/;

export default function VerifierLecture({
  doc, position, total, libelleSuivant, perimetres, fournisseurs, avecPiece, etabId,
  canRegler, canManage, canCreer, rapprochement, catalogue, docsRef, enregistrerDoc, onAjouterLignes, onAppliquerPrix,
  onEnregistrer, onRetour, onSuivant, onTerminer,
}) {
  const facture = doc.typeDocument === 'facture';
  const [v, setV] = React.useState(() => ({
    fournisseurNom: doc.fournisseurNom || '',
    dateDocument: doc.dateDocument || '',
    numero: doc.numero || '',
    totalHT: doc.totalHT != null ? String(doc.totalHT) : '',
    totalTTC: doc.totalTTC != null ? String(doc.totalTTC) : '',
    dateEcheance: doc.dateEcheance || '',
    perimetre: (doc.perimetre || '').trim() || 'Général',
  }));
  const [etape, setEtape] = React.useState('champs'); // 'champs' | 'rattachement'
  const [busy, setBusy] = React.useState(false);
  const [apercu, setApercu] = React.useState(false);
  const fermerApercu = React.useCallback(() => setApercu(false), []);
  const maj = (patch) => setV(x => ({ ...x, ...patch }));

  // Ce que la lecture n'a pas rendu : la pastille reste tant que le champ est vide.
  const nonLu = {
    fournisseur: !String(doc.fournisseurNom || '').trim() && !v.fournisseurNom.trim(),
    date: !doc.dateDocument && !v.dateDocument,
    numero: !doc.numero && !v.numero.trim(),
    totalHT: doc.totalHT == null && !v.totalHT.trim(),
    totalTTC: facture && doc.totalTTC == null && !v.totalTTC.trim(),
    echeance: facture && !doc.dateEcheance && !v.dateEcheance,
  };
  const nbLignes = (doc.lignes || []).length;
  const somme = (doc.lignes || []).reduce((t, l) => t + (Number(l.montantLigne) || 0), 0);
  const totalHTSaisi = lireMontant(v.totalHT);
  const ecart = totalHTSaisi != null && totalHTSaisi > 0 ? Math.round((somme - totalHTSaisi) * 100) / 100 : 0;

  const manque = [];
  if (!v.fournisseurNom.trim()) manque.push('le fournisseur');
  if (!DATE_VALIDE.test(v.dateDocument)) manque.push('la date');
  if (facture && lireMontant(v.totalTTC) == null) manque.push('le total TTC');
  const illisible = lireMontant(v.totalHT) === undefined || lireMontant(v.totalTTC) === undefined;
  const peutEnregistrer = manque.length === 0 && !illisible && !busy;

  const enregistrer = async () => {
    if (!peutEnregistrer) return;
    setBusy(true);
    const ok = await onEnregistrer({
      fournisseurNom: v.fournisseurNom.trim(),
      numero: v.numero.trim(),
      dateDocument: v.dateDocument,
      totalHT: lireMontant(v.totalHT),
      totalTTC: facture ? lireMontant(v.totalTTC) : undefined,
      // L'échéance reste à qui règle les factures.
      dateEcheance: facture && canRegler ? (v.dateEcheance || null) : undefined,
      perimetre: v.perimetre,
    });
    setBusy(false);
    if (ok) setEtape('rattachement');
  };

  // Document tel qu'il est en base après l'enregistrement (docsRef suit chaque écriture).
  const docCourant = (docsRef.current || []).find(d => d.id === doc.id) || doc;
  const prixLus = etape === 'rattachement' && canManage ? prixLusDuDocument(docCourant, rapprochement.ctx) : [];
  const appliquerPrix = async () => {
    if (!prixLus.length) return;
    setBusy(true);
    try {
      const n = await onAppliquerPrix(prixLus);
      notifyLegacy(`${n} prix mis à jour.`, 'success');
    } finally { setBusy(false); }
  };

  const champ = (cle, label, input) => (
    <label style={st.champ}>
      <span style={st.label}>{label}{nonLu[cle] && <span style={st.nonLu}>Non lu</span>}</span>
      {input}
    </label>
  );
  const styleChamp = (cle) => ({ ...st.input, ...(nonLu[cle] ? { borderColor: 'var(--warning-bd)' } : {}) });

  return (
    <EcranTache
      titre="Vérifier la lecture"
      etat={<>Document <span>{position}</span> / <span>{total}</span></>}
      onRetour={onRetour}
    >
      <div style={st.carte}>
        <div style={st.ligneTitre}>
          <div style={st.resume}>
            <span>{libelleType(doc.typeDocument)}</span>, lecture du <span>{dateCH(String(doc.createdAt || '').slice(0, 10))}</span>
            {doc.nomFichier ? <>, <span data-no-translate>{doc.nomFichier}</span></> : null}
            , <span>{nbLignes}</span> {nbLignes > 1 ? 'lignes lues' : 'ligne lue'}
          </div>
          {avecPiece && <Btn small variant="ghost" onClick={() => setApercu(true)}>{libelleVoir(doc)}</Btn>}
        </div>

        {etape === 'champs' && (
          <>
            {Math.abs(ecart) > 0.05 && (
              <div style={st.alerte}>
                Les lignes lues font <span data-no-translate>CHF {chf(somme)}</span>, le total lu <span data-no-translate>CHF {chf(totalHTSaisi)}</span> : vérifiez sur le document.
              </div>
            )}
            <div style={st.grille}>
              {champ('fournisseur', 'Fournisseur', (
                <>
                  <input
                    type="text"
                    list="verifier-lecture-fournisseurs"
                    value={v.fournisseurNom}
                    onChange={e => maj({ fournisseurNom: e.target.value })}
                    placeholder="Nom du fournisseur"
                    style={styleChamp('fournisseur')}
                    autoComplete="off"
                  />
                  <datalist id="verifier-lecture-fournisseurs">
                    {(fournisseurs || []).map(f => <option key={f.id} value={f.nom} />)}
                  </datalist>
                </>
              ))}
              {champ('date', 'Date du document', (
                <input type="date" value={v.dateDocument} min="2000-01-01" max="2099-12-31" onChange={e => maj({ dateDocument: e.target.value })} style={styleChamp('date')} />
              ))}
              {champ('numero', 'Numéro', (
                <input type="text" value={v.numero} onChange={e => maj({ numero: e.target.value })} style={styleChamp('numero')} autoComplete="off" />
              ))}
              {champ('totalHT', 'Total HT', (
                <input type="text" inputMode="decimal" value={v.totalHT} onChange={e => maj({ totalHT: e.target.value })} placeholder="0.00" style={styleChamp('totalHT')} />
              ))}
              {facture && champ('totalTTC', 'Total TTC', (
                <input type="text" inputMode="decimal" value={v.totalTTC} onChange={e => maj({ totalTTC: e.target.value })} placeholder="0.00" style={styleChamp('totalTTC')} />
              ))}
              {facture && canRegler && champ('echeance', 'Échéance', (
                <input type="date" value={v.dateEcheance} min="2000-01-01" max="2099-12-31" onChange={e => maj({ dateEcheance: e.target.value })} style={styleChamp('echeance')} />
              ))}
              {perimetres.length > 1 && (
                <label style={st.champ}>
                  <span style={st.label}>Périmètre</span>
                  <select value={v.perimetre} onChange={e => maj({ perimetre: e.target.value })} style={st.input}>
                    {Array.from(new Set([...perimetres, v.perimetre])).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div style={st.pied}>
              <span style={st.aide}>
                {/* Chaque champ manquant dans son nœud : la phrase reste au glossaire. */}
                {manque.length
                  ? <>À saisir avant d’enregistrer : {manque.map((m, i) => <React.Fragment key={m}>{i ? ', ' : ''}<span>{m}</span></React.Fragment>)}. Le document et sa photo sont déjà gardés.</>
                  : illisible ? 'Montant illisible : écrivez par exemple 454.50.' : 'Le document et sa photo sont déjà gardés.'}
              </span>
              <Btn variant="primary" onClick={enregistrer} disabled={!peutEnregistrer}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
            </div>
          </>
        )}

        {etape === 'rattachement' && (
          <div style={st.enregistre}>Document enregistré.</div>
        )}
      </div>

      {etape === 'rattachement' && (
        <>
          <LignesARattacher
            documents={[docCourant]}
            ctx={rapprochement.ctx}
            produits={rapprochement.produits}
            catalogue={catalogue}
            perimetreActif={v.perimetre}
            canCreer={canCreer}
            docsRef={docsRef}
            enregistrerDoc={enregistrerDoc}
            onAjouterLignes={onAjouterLignes}
          />
          <div style={st.actions}>
            {prixLus.length > 0 && (
              <Btn variant="ghost" onClick={appliquerPrix} disabled={busy}>
                Appliquer les prix lus <span>({prixLus.length})</span>
              </Btn>
            )}
            <span style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={onTerminer}>Terminer</Btn>
            <Btn variant="primary" onClick={onSuivant}>{libelleSuivant}</Btn>
          </div>
        </>
      )}

      {apercu && <VisionneusePieces doc={doc} etabId={etabId} onClose={fermerApercu} />}
    </EcranTache>
  );
}

const st = {
  carte: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  ligneTitre: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  resume: { fontSize: 13, color: 'var(--text)', lineHeight: 1.45 },
  alerte: { fontSize: 12, color: 'var(--warning-text)', lineHeight: 1.5 },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 8 },
  nonLu: { fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning-text)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--warning-bd)' },
  input: { padding: '9px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font)', minHeight: 44, boxSizing: 'border-box', width: '100%', minWidth: 0 },
  pied: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  aide: { fontSize: 12, color: 'var(--text2)', flex: '1 1 220px', minWidth: 0, lineHeight: 1.45 },
  enregistre: { fontSize: 13, color: 'var(--success-text)' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
};
