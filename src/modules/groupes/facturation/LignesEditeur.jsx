import { st } from '../../../components/ui/Fenetres.jsx';
import {
  TAUX_TVA, chf, libelleTaux, montantLigne, nouvelleLigne, normaliserPrix, normaliserQuantite, totaux,
} from './calculs.js';
import { sf } from './ui.jsx';

// Lignes d'un devis ou d'une facture prévue. Quantité et prix restent du texte
// pendant la saisie (« 12,5 ») et deviennent des nombres en quittant le champ ;
// les totaux lisent la valeur normalisée.

export const lignesCalcul = (lignes) => (lignes || []).map((l) => ({
  ...l, quantite: normaliserQuantite(l.quantite), prixUnitaire: normaliserPrix(l.prixUnitaire),
}));

const RACCOURCIS = [
  { libelle: 'Boissons', tvaTaux: 8.1 },
  { libelle: 'Location de salle', tvaTaux: 8.1 },
  { libelle: 'Hébergement', tvaTaux: 3.8 },
  { libelle: 'Taxe de séjour', tvaTaux: 0 },
  { libelle: 'Remise', tvaTaux: 8.1, prixUnitaire: '' },
];

export default function LignesEditeur({ lignes, onChange, lectureSeule = false, assujettiTva = true }) {
  const maj = (id, champ, valeur) => onChange(lignes.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l)));
  const retirer = (id) => onChange(lignes.filter((l) => l.id !== id));
  const ajouter = (partiel) => onChange([...lignes, nouvelleLigne(partiel)]);
  const t = totaux(lignesCalcul(lignes));

  return (
    <div className="fac-lignes">
      {!lectureSeule && (
        <div className="fac-ligne-entete" aria-hidden="true">
          <span style={st.label}>Désignation</span>
          <span style={{ ...st.label, textAlign: 'right' }}>Quantité</span>
          <span style={{ ...st.label, textAlign: 'right' }}>Prix TTC</span>
          <span style={st.label}>TVA</span>
          <span style={{ ...st.label, textAlign: 'right' }}>Montant</span>
          <span />
        </div>
      )}
      {lignes.length === 0 && <div style={{ ...sf.remarque, padding: '10px 0' }}>Aucune ligne pour l'instant.</div>}
      {lignes.map((l) => (lectureSeule ? (
        <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '8px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }}>
          <span style={{ flex: '1 1 auto', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 'var(--t2)', color: 'var(--text)' }}>{l.libelle}</span>
            {l.detail && <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text3)' }}>{l.detail}</span>}
            <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' }} data-no-translate>
              {String(l.quantite).replace('.', ',')} x {chf(l.prixUnitaire)}{assujettiTva ? `, ${libelleTaux(l.tvaTaux)}` : ''}
            </span>
          </span>
          <span style={{ ...sf.chiffre, fontSize: 'var(--t2)' }} data-no-translate>{chf(montantLigne(l))}</span>
        </div>
      ) : (
        <div key={l.id} className="fac-ligne">
          <input
            data-zone="lib" style={sf.petit} value={l.libelle} placeholder="Désignation"
            aria-label="Désignation" onChange={(e) => maj(l.id, 'libelle', e.target.value)}
          />
          <input
            data-zone="det" style={{ ...sf.petit, fontSize: 'var(--t1)' }} value={l.detail || ''} placeholder="Détail, facultatif"
            aria-label="Détail" onChange={(e) => maj(l.id, 'detail', e.target.value)}
          />
          <input
            data-zone="qte" style={sf.nombre} inputMode="decimal" value={l.quantite} aria-label="Quantité"
            onChange={(e) => maj(l.id, 'quantite', e.target.value)}
            onBlur={(e) => maj(l.id, 'quantite', normaliserQuantite(e.target.value))}
          />
          <input
            data-zone="prix" style={sf.nombre} inputMode="decimal" value={l.prixUnitaire} aria-label="Prix unitaire TTC"
            onChange={(e) => maj(l.id, 'prixUnitaire', e.target.value)}
            onBlur={(e) => maj(l.id, 'prixUnitaire', normaliserPrix(e.target.value))}
          />
          <select
            data-zone="tva" style={sf.petit} value={String(l.tvaTaux)} aria-label="Taux de TVA"
            onChange={(e) => maj(l.id, 'tvaTaux', Number(e.target.value))}
          >
            {TAUX_TVA.map((x) => <option key={x.taux} value={String(x.taux)}>{x.label}</option>)}
          </select>
          <span data-zone="mont" style={{ ...sf.chiffre, fontSize: 'var(--t2)' }} data-no-translate>
            {chf(montantLigne(lignesCalcul([l])[0]))}
          </span>
          <button type="button" data-zone="suppr" style={sf.suppr} onClick={() => retirer(l.id)} aria-label="Retirer la ligne" title="Retirer la ligne">×</button>
        </div>
      )))}

      {!lectureSeule && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 10 }}>
          <button type="button" style={st.secondaire} onClick={() => ajouter({})}>Ajouter une ligne</button>
          {RACCOURCIS.map((r) => (
            <button key={r.libelle} type="button" style={sf.pilule(false)} onClick={() => ajouter(r)}>{r.libelle}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 12, marginLeft: 'auto', maxWidth: 360 }}>
        <div style={sf.total}>
          <span>Total TTC</span>
          <span style={sf.chiffre} data-no-translate>CHF {chf(t.total)}</span>
        </div>
        {assujettiTva ? t.parTaux.filter((g) => g.taux).map((g) => (
          <div key={g.taux} style={sf.ligneTotal}>
            <span>dont TVA <span data-no-translate>{libelleTaux(g.taux)}</span></span>
            <span style={sf.chiffre} data-no-translate>{chf(g.tva)}</span>
          </div>
        )) : <div style={sf.ligneTotal}><span>Non assujetti à la TVA</span></div>}
      </div>
    </div>
  );
}
