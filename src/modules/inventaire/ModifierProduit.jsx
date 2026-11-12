import React from 'react';
import { Fenetre } from '../../components/ui/Fenetres.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { CATEGORIES_INVENTAIRE, UNITES_INVENTAIRE, estCompte, cleProduit, parseQuantite } from './inventaireLignes.js';
import { zonesOf, estMultiZone, quantiteZone } from './zones.js';
import CasesZones from './CasesZones.jsx';

// Fenêtre « Modifier » d'un produit du comptage : nom, catégorie, unité,
// zones, et pour qui gère les lignes le prix et la suppression. « Annuler la
// saisie » remet le produit « à compter » (dans la zone de la carte pour un
// produit compté zone par zone).
//
// Props : ligne, zone (zone de la carte, '' hors produit multi-zone), lignes,
//         canGerer, onEnregistrer(patch), onAnnulerSaisie(zone), onSupprimer(), onClose

export default function ModifierProduit({ ligne, zone = '', lignes, canGerer, onEnregistrer, onAnnulerSaisie, onSupprimer, onClose }) {
  const [nom, setNom] = React.useState(ligne.produit || '');
  const [categorie, setCategorie] = React.useState(ligne.categorie || '');
  const [unite, setUnite] = React.useState(ligne.unite || 'pcs');
  const [zones, setZones] = React.useState(zonesOf(ligne));
  const [prix, setPrix] = React.useState(ligne.prixUnit != null ? String(ligne.prixUnit) : '');
  const [busy, setBusy] = React.useState(false);

  const categories = React.useMemo(() => Array.from(new Set([
    ...(lignes || []).map(l => String(l.categorie || '').trim()).filter(Boolean),
    ...CATEGORIES_INVENTAIRE,
  ])).sort((a, b) => a.localeCompare(b, 'fr')), [lignes]);

  const multi = !!zone && estMultiZone(ligne);
  const compte = multi ? quantiteZone(ligne, zone) != null : estCompte(ligne);
  const quantite = multi ? quantiteZone(ligne, zone) : ligne.stockReel;

  const nomPropre = nom.trim();
  const doublon = nomPropre && cleProduit(nomPropre) !== cleProduit(ligne.produit)
    && (lignes || []).some(l => l.id !== ligne.id && cleProduit(l.produit) === cleProduit(nomPropre));
  const prixLu = parseQuantite(prix);
  const prixInvalide = canGerer && prix.trim() !== '' && (prixLu == null || prixLu < 0);
  const peutEnregistrer = !!nomPropre && !doublon && !prixInvalide && !busy;

  const enregistrer = async () => {
    if (!peutEnregistrer) return;
    const patch = { produit: nomPropre, categorie: categorie.trim() || 'Autres', unite, zones };
    if (canGerer) patch.prixUnit = prix.trim() === '' ? 0 : prixLu;
    setBusy(true);
    try { await onEnregistrer(patch); onClose(); } finally { setBusy(false); }
  };

  return (
    <Fenetre
      id="inventaire-modifier-produit"
      titre="Modifier le produit"
      sousTitre={compte
        ? <>Compté : <span>{quantite}</span> {ligne.unite}{multi ? <> en <span data-no-translate>{zone}</span></> : null}</>
        : 'Pas encore compté'}
      onClose={onClose}
      largeur={520}
      pied={(
        <>
          {compte && (
            <Btn variant="ghost" onClick={async () => { setBusy(true); try { await onAnnulerSaisie(multi ? zone : ''); onClose(); } finally { setBusy(false); } }} disabled={busy}>
              Annuler la saisie
            </Btn>
          )}
          {canGerer && (
            <Btn variant="danger" onClick={async () => { const fait = await onSupprimer(); if (fait) onClose(); }} disabled={busy}>
              Supprimer
            </Btn>
          )}
          <span style={{ flex: '1 1 20px' }} />
          <Btn onClick={onClose} disabled={busy}>Fermer</Btn>
          <Btn variant="primary" onClick={enregistrer} disabled={!peutEnregistrer}>Enregistrer</Btn>
        </>
      )}
    >
      <label style={st.champ}>
        <span style={st.libelle}>Nom</span>
        <input
          type="text"
          value={nom}
          onChange={e => setNom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enregistrer(); } }}
          style={st.input}
          autoComplete="off"
        />
        {doublon && <span style={st.alerte}>Un autre produit porte déjà ce nom.</span>}
      </label>
      <div style={st.deux}>
        <label style={{ ...st.champ, flex: '2 1 200px' }}>
          <span style={st.libelle}>Catégorie</span>
          <input
            type="text"
            list="inventaire-categories"
            value={categorie}
            onChange={e => setCategorie(e.target.value)}
            onFocus={e => e.target.select()}
            style={st.input}
            autoComplete="off"
          />
          <datalist id="inventaire-categories">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label style={{ ...st.champ, flex: '1 1 100px' }}>
          <span style={st.libelle}>Unité</span>
          <select value={unite} onChange={e => setUnite(e.target.value)} style={st.input}>
            {(UNITES_INVENTAIRE.includes(unite) ? UNITES_INVENTAIRE : [unite, ...UNITES_INVENTAIRE]).map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        {canGerer && (
          <label style={{ ...st.champ, flex: '1 1 120px' }}>
            <span style={st.libelle}>Prix unitaire (CHF)</span>
            <input type="text" inputMode="decimal" value={prix} onChange={e => setPrix(e.target.value)} onFocus={e => e.target.select()} style={st.input} />
            {prixInvalide && <span style={st.alerte}>Prix illisible.</span>}
          </label>
        )}
      </div>
      <div style={st.champ}>
        <span style={st.libelle}>Zones</span>
        <CasesZones zones={zones} nom={ligne.produit} onChange={setZones} />
      </div>
    </Fenetre>
  );
}

const st = {
  champ: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, marginBottom: 12 },
  deux: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  libelle: { fontSize: 'var(--t1)', color: 'var(--text2)', fontWeight: 'var(--g2)' },
  input: { width: '100%', minHeight: 44, padding: '0 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--t2)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  alerte: { fontSize: 'var(--t1)', color: 'var(--danger-strong)' },
};
