import React from 'react';
import { detailCarte } from './ecranTpe.js';

// « Visa, fin 1234, autorisation 123456 » : ce que le terminal a rendu d'un
// paiement par carte, et seulement cela. Chaque morceau vit dans son nœud
// (traduction du DOM) ; la marque et le code sont des données.
export default function CarteDetail({ transaction, style }) {
  const d = detailCarte(transaction);
  if (!d.marque && !d.fin && !d.autorisation) return null;
  return (
    <span style={{ ...st.petit, ...style }} data-carte-detail="">
      {d.marque && <span data-no-translate>{d.marque}</span>}
      {d.fin && <>{d.marque ? ', ' : ''}<span>fin</span> <span style={st.num}>{d.fin}</span></>}
      {d.autorisation && <>{d.marque || d.fin ? ', ' : ''}<span>autorisation</span> <span style={st.num} data-no-translate>{d.autorisation}</span></>}
    </span>
  );
}

const st = {
  petit: { fontSize: 13, color: 'var(--text2)' },
  num: { fontFamily: 'var(--font-num)', fontWeight: 600 },
};
