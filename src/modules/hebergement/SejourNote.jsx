import React from 'react';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { Champ, h } from './hotelUi.jsx';
import {
  TYPES_AUTOMATIQUES, TYPES_LIGNE, chf, dateCourte, libelleDe, lignesAutomatiques, nuitsDe, personnes, totauxNote,
} from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Note de séjour (lot H4) : les lignes d'un séjour, leurs totaux, et les
// gestes de la réception : calculer nuitées et taxes, ajouter un extra ou une
// remise, encaisser, imprimer la note. Le montant d'une ligne est calculé en
// base (quantité fois prix) ; la suppression d'une ligne est réservée à la
// direction, une correction passe par une remise ou un extra.
// ─────────────────────────────────────────────────────────────────────────────

const MOYENS = ['Carte', 'Espèces', 'Twint', 'Virement', 'Facture'];

export default function SejourNote({ sejour: s, chambre, tarif, reglages, occupants, lignes, peutGerer, peutSupprimer, etablissement, onClose }) {
  const mesLignes = lignes.rows.filter((l) => l.sejourId === s.id);
  const totaux = totauxNote(mesLignes);
  const [mode, setMode] = React.useState(null); // 'ligne' | 'encaisser'
  const [f, setF] = React.useState({ type: 'extra', libelle: '', quantite: 1, prix: '', jour: zurichToday(), moyen: 'Carte', montant: '' });
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const dejaCalcule = mesLignes.some((l) => TYPES_AUTOMATIQUES.includes(l.type));
  const nuits = nuitsDe(s);

  const lancer = async (travail) => {
    setErreur('');
    setEnCours(true);
    const res = await travail();
    setEnCours(false);
    if (res?.error) { setErreur(res.error); return false; }
    return true;
  };

  // Nuitées et taxes : une première fois par la réception ; recalcul par la
  // direction seulement (les lignes automatiques existantes sont remplacées).
  const calculer = () => lancer(async () => {
    if (dejaCalcule) {
      for (const l of mesLignes.filter((x) => TYPES_AUTOMATIQUES.includes(x.type))) {
        const r = await lignes.supprimer(l.id);
        if (r.error) return r;
      }
    }
    const auto = lignesAutomatiques(s, tarif, reglages, occupants);
    if (!auto.length) return { error: 'Rien à calculer : choisis un tarif ou un prix par nuit sur le séjour, et des taxes dans les réglages.' };
    for (const l of auto) {
      const r = await lignes.inserer({ sejour_id: s.id, ...l });
      if (r.error) return r;
    }
    notify('Nuitées et taxes calculées.', 'success');
    return { error: null };
  });

  const ajouterLigne = () => lancer(async () => {
    const prix = Number(String(f.prix).replace(',', '.'));
    const quantite = Number(String(f.quantite).replace(',', '.'));
    if (!f.libelle.trim()) return { error: 'Le libellé est obligatoire.' };
    if (!(quantite > 0)) return { error: 'La quantité doit être positive.' };
    if (!Number.isFinite(prix)) return { error: 'Le prix est obligatoire.' };
    const signe = f.type === 'remise' ? -Math.abs(prix) : Math.abs(prix);
    const r = await lignes.inserer({ sejour_id: s.id, jour: f.jour || zurichToday(), type: f.type, libelle: f.libelle.trim(), quantite, prix_unitaire: signe, tva_taux: f.type === 'extra' ? (reglages?.tvaTaux ?? null) : null });
    if (r.error) return r;
    notify('Ligne ajoutée.', 'success');
    setMode(null);
    setF((p) => ({ ...p, libelle: '', prix: '', quantite: 1 }));
    return { error: null };
  });

  const encaisser = () => lancer(async () => {
    const montant = Number(String(f.montant).replace(',', '.'));
    if (!(montant > 0)) return { error: 'Le montant encaissé doit être positif.' };
    const r = await lignes.inserer({ sejour_id: s.id, jour: f.jour || zurichToday(), type: 'paiement', libelle: `Encaissement, ${f.moyen}`, quantite: 1, prix_unitaire: -montant, tva_taux: null });
    if (r.error) return r;
    notify('Encaissement enregistré.', 'success');
    setMode(null);
    setF((p) => ({ ...p, montant: '' }));
    return { error: null };
  });

  const supprimer = (l) => lancer(async () => {
    const r = await lignes.supprimer(l.id);
    if (!r.error) notify('Ligne supprimée.', 'success');
    return r;
  });

  const imprimer = async () => {
    setErreur('');
    try {
      const { pdfUtils } = await import('../../services/pdf.js');
      await pdfUtils.exportNoteSejourPdf({
        hote: s.nomHote, chambre: chambre?.numero || '', arrivee: s.arrivee, depart: s.depart, nuits,
        personnes: `${personnes(s)} personne${personnes(s) > 1 ? 's' : ''}`,
        lignes: mesLignes.map((l) => ({ jour: l.jour, libelle: l.libelle, quantite: l.quantite, prixUnitaire: l.prixUnitaire, montant: l.montant })),
        total: totaux.total, encaisse: totaux.encaisse, solde: totaux.solde, tva: totaux.tva, tvaTaux: reglages?.tvaTaux,
        mention: reglages?.mentionNote || '',
      }, { etablissement, filename: `note-${(s.nomHote || 'sejour').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${s.arrivee}.pdf` });
    } catch (e) {
      setErreur(e?.message || 'Impression impossible.');
    }
  };

  return (
    <Fenetre
      id="sejour-note"
      titre="Note de séjour"
      sousTitre={<><span data-no-translate>{s.nomHote}</span>, <span data-no-translate>{dateCourte(s.arrivee)} - {dateCourte(s.depart)}</span>{chambre ? <>, <span>chambre</span> <span data-no-translate>{chambre.numero}</span></> : null}</>}
      onClose={onClose}
      largeur={680}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={imprimer} disabled={enCours}>Imprimer la note</button>
          {peutGerer && <button type="button" style={st.secondaire} onClick={() => { setMode(mode === 'ligne' ? null : 'ligne'); setErreur(''); }} disabled={enCours}>Ajouter une ligne</button>}
          {peutGerer && <button type="button" style={st.primaire} onClick={() => { setMode(mode === 'encaisser' ? null : 'encaisser'); setErreur(''); }} disabled={enCours}>Encaisser</button>}
        </>
      )}
    >
      {peutGerer && (!dejaCalcule || peutSupprimer) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={st.secondaire} onClick={calculer} disabled={enCours}>{dejaCalcule ? 'Recalculer nuitées et taxes' : 'Calculer nuitées et taxes'}</button>
          <span style={h.detail}>
            {tarif ? <><span>Tarif</span> <span data-no-translate>{tarif.nom}</span></> : s.prixNuit != null ? <span>Prix convenu</span> : <span>Aucun tarif choisi sur le séjour</span>}
            {s.prixNuit != null || tarif ? <>, <span data-no-translate>CHF {chf(s.prixNuit != null ? s.prixNuit : tarif.prixNuit)}</span> <span>par nuit</span></> : null}
          </span>
        </div>
      )}
      {peutGerer && dejaCalcule && !peutSupprimer && <div style={h.detail}>Nuitées et taxes déjà calculées. Un recalcul se demande à la direction ; une correction passe par une remise ou un extra.</div>}

      {mesLignes.length === 0 && <div style={h.vide}>Aucune ligne sur cette note.</div>}
      {mesLignes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {mesLignes.map((l) => (
            <div key={l.id} style={n.ligne}>
              <span style={{ ...h.detail, flex: '0 0 72px' }} data-no-translate>{dateCourte(l.jour)}</span>
              <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                <span data-no-translate>{l.libelle}</span>
                <span style={h.detail}> <span>{libelleDe(TYPES_LIGNE, l.type)}</span>{l.quantite !== 1 && <> <span data-no-translate>{l.quantite} x {chf(l.prixUnitaire)}</span></>}</span>
              </span>
              <span style={n.montant} data-no-translate>{chf(l.montant)}</span>
              {peutSupprimer && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 32, padding: '4px 8px', fontSize: 12 }} onClick={() => supprimer(l)} disabled={enCours}>Supprimer</button>}
            </div>
          ))}
        </div>
      )}
      <div style={n.totaux}>
        <div style={n.totalLigne}><span>Total de la note</span><span data-no-translate>CHF {chf(totaux.total)}</span></div>
        <div style={n.totalLigne}><span>Encaissé</span><span data-no-translate>CHF {chf(totaux.encaisse)}</span></div>
        <div style={{ ...n.totalLigne, fontWeight: 600, fontSize: 16 }}><span>Solde dû</span><span data-no-translate>CHF {chf(totaux.solde)}</span></div>
        {totaux.tva > 0 && <div style={h.detail}><span>dont TVA</span> <span data-no-translate>{String(reglages?.tvaTaux ?? '').replace('.', ',')} %</span> <span>sur l'hébergement :</span> <span data-no-translate>CHF {chf(totaux.tva)}</span></div>}
      </div>

      {mode === 'ligne' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={h.grille}>
            <Champ label="Type">
              <select style={h.saisie} value={f.type} onChange={champ('type')}>
                {TYPES_LIGNE.filter((t) => t.id !== 'paiement').map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Champ>
            <Champ label="Jour"><input type="date" style={h.saisie} value={f.jour} onChange={champ('jour')} /></Champ>
            <Champ label="Libellé" large><input style={h.saisie} value={f.libelle} onChange={champ('libelle')} placeholder="Minibar, parking, massage…" autoFocus /></Champ>
            <Champ label="Quantité"><input type="number" min="0.01" step="0.01" inputMode="decimal" style={h.saisie} value={f.quantite} onChange={champ('quantite')} /></Champ>
            <Champ label="Prix unitaire (CHF)"><input type="number" step="0.05" inputMode="decimal" style={h.saisie} value={f.prix} onChange={champ('prix')} /></Champ>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={st.secondaire} onClick={() => setMode(null)}>Annuler</button>
            <button type="button" style={st.primaire} onClick={ajouterLigne} disabled={enCours}>Ajouter</button>
          </div>
        </div>
      )}
      {mode === 'encaisser' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={h.grille}>
            <Champ label="Montant encaissé (CHF)"><input type="number" step="0.05" min="0" inputMode="decimal" style={h.saisie} value={f.montant} onChange={champ('montant')} autoFocus /></Champ>
            <Champ label="Moyen">
              <select style={h.saisie} value={f.moyen} onChange={champ('moyen')}>
                {MOYENS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Champ>
            <Champ label="Jour"><input type="date" style={h.saisie} value={f.jour} onChange={champ('jour')} /></Champ>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {totaux.solde > 0 && <button type="button" className="ui-btn ui-btn--ghost" style={{ minHeight: 36, fontSize: 13 }} onClick={() => setF((p) => ({ ...p, montant: String(totaux.solde) }))}><span>Tout le solde</span> <span data-no-translate>({chf(totaux.solde)})</span></button>}
            <button type="button" style={st.secondaire} onClick={() => setMode(null)}>Annuler</button>
            <button type="button" style={st.primaire} onClick={encaisser} disabled={enCours}>Enregistrer l'encaissement</button>
          </div>
        </div>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

const n = {
  ligne: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', fontSize: 14, color: 'var(--text)' },
  montant: { flex: '0 0 90px', textAlign: 'right', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
  totaux: { display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)' },
  totalLigne: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
};
