import React from 'react';
import { Fenetre, st as fst } from '../../../components/ui/Fenetres.jsx';
import { fmtQte } from '../../../utils/echelleRecette.js';
import { lireListe } from './collerListe.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Coller une liste » : une ligne par ingrédient, lue en direct. Rien n'est
// écrit dans la fiche avant « Ajouter » ; Annuler ne laisse aucune ligne.
// ─────────────────────────────────────────────────────────────────────────────

export default function ColleListe({ onAjouter, onClose }) {
  const [texte, setTexte] = React.useState('');
  const lignes = lireListe(texte);
  const pied = (
    <>
      <button type="button" style={fst.secondaire} onClick={onClose}>Annuler</button>
      <button
        type="button"
        style={{ ...fst.primaire, opacity: lignes.length ? 1 : 0.5 }}
        disabled={!lignes.length}
        onClick={() => onAjouter(lignes)}
      >Ajouter{lignes.length ? ` (${lignes.length})` : ''}</button>
    </>
  );
  return (
    <Fenetre id="fiche-coller" titre="Coller une liste" sousTitre="Une ligne par ingrédient, la quantité devant ou derrière le nom." onClose={onClose} largeur={560} pied={pied}>
      <textarea
        autoFocus
        value={texte}
        onChange={e => setTexte(e.target.value)}
        rows={7}
        placeholder={'200 g farine\n3 œufs\nlait 25 cl\nsel'}
        aria-label="Liste d'ingrédients"
        style={{ ...fst.champ, minHeight: 150, resize: 'vertical', fontFamily: 'var(--font)' }}
      />
      {lignes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {lignes.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>{l.nom}</span>
              <span style={{ color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                {l.quantite > 0 ? <><span data-no-translate>{fmtQte(l.quantite)}</span> {l.unite}</> : <>quantité à saisir</>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Fenetre>
  );
}
