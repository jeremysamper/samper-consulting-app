import React from 'react';
import { Btn, Panneau, ligneStyle } from '../../components/ui/index.jsx';
import { dateCH } from '../inventaire/inventaireLignes.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Hausses de prix » (Factures & achats) : réservé au droit « Régler les
// factures » (factures_achat), comme les échéances. Les hausses viennent de
// useHaussesPrix (haussesPrixDonnees.js), calculées par haussesPrix
// (analysesAchats.js) sur les documents d'achat déjà lus par l'écran.
// Chaque ligne : l'article, le fournisseur, la pièce et sa date, le prix
// d'avant et le nouveau à l'unité, l'écart en pour cent, en CHF à l'unité et
// sur la pièce. Un seul contrôle par ligne : « Marquer comme vu », ou
// « Remettre à voir ».
// Nombres, dates et noms dans leurs propres nœuds (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

const nf = (v, min, max) => Number(v).toLocaleString('fr-CH', { minimumFractionDigits: min, maximumFractionDigits: max });
const prixTexte = (v) => nf(v, 2, Math.abs(v) < 0.1 ? 4 : 2);
const UNITES = { kg: 'CHF/kg', L: 'CHF/L' };
const Unite = ({ u }) => (UNITES[u] ? <span data-no-translate>{UNITES[u]}</span> : <span>CHF la pièce</span>);
const PIECE = { facture: 'facture du', bon_livraison: 'bon de livraison du' };

function Ligne({ h, derniere, action }) {
  return (
    <div style={{ ...ligneStyle({ derniere }), ...st.ligne }} data-hausse="">
      <div style={st.texte}>
        <span style={st.nom}>{h.nom}</span>
        <span style={st.detail}>
          <span data-no-translate>{h.fournisseur}</span>, <span>{PIECE[h.typeDocument] || 'facture du'}</span> <span>{dateCH(h.date)}</span>
          {h.numero ? <> <span style={st.numero} data-no-translate>{`n° ${h.numero}`}</span></> : null}
        </span>
        <span style={st.detail}>
          <span style={st.chiffre}>{prixTexte(h.prixAvant)}</span> <span aria-hidden="true">→</span> <span style={st.chiffre}>{prixTexte(h.prix)}</span> <Unite u={h.unite} />
          <span>, prix d'avant du</span> <span>{dateCH(h.dateAvant)}</span>
        </span>
        <span style={st.detail}>
          <span style={st.chiffre}>{`+${prixTexte(h.ecartUnite)}`}</span> <Unite u={h.unite} />
          <span>, soit</span> <span style={st.chiffre}>{nf(h.surcout, 2, 2)}</span> <span>CHF de plus sur ce document</span>
        </span>
        {h.doute && <span style={st.doute}>Lecture à vérifier : le montant n'a pas été retrouvé sur la ligne imprimée.</span>}
        {h.vu && (
          <span style={st.vu}><span>vue le</span> <span>{dateCH(String(h.vu.vuLe || '').slice(0, 10))}</span></span>
        )}
      </div>
      <div style={st.droite}>
        <span style={st.ecart}>{`+${nf(h.ecartPct, 1, 1)} %`}</span>
        {action}
      </div>
    </div>
  );
}

export default function HaussesPrix({ hausses }) {
  const { etat, seuil, aVoir, dejaVues, fenetreJours, marquerVue, remettreAVoir } = hausses;

  if (etat === 'loading') return <p style={st.attente}>Chargement…</p>;
  if (etat === 'absente') return <p style={st.attente}>Les hausses de prix ne sont pas encore activées sur la base de données.</p>;
  if (etat === 'error') return <p style={st.attente}>Les hausses de prix n'ont pas pu être lues. Réessayez dans un instant.</p>;

  return (
    <div style={st.page}>
      <p style={st.intro}>
        <span>Prix à l'unité (kilo, litre ou pièce) comparé au prix précédent du même article chez le même fournisseur, sur les factures et les bons de livraison des</span>
        {' '}<span>{fenetreJours}</span> <span>derniers jours.</span>
        {' '}<span>Alerte dès</span> <span>{`+${nf(seuil, 0, 1)} %`}</span><span>.</span>
        {' '}<span>Le seuil se règle dans les réglages de Factures & achats.</span>
      </p>

      <Panneau style={st.carte}>
        <div style={st.titre}>
          <span>À voir</span>
          {aVoir.length > 0 && <span style={st.compte}>{aVoir.length}</span>}
        </div>
        {aVoir.length === 0
          ? <p style={st.vide}>Aucune hausse à voir.</p>
          : (
            <div style={st.liste}>
              {aVoir.map((h, i) => (
                <Ligne key={h.cle} h={h} derniere={i === aVoir.length - 1}
                  action={<Btn small variant="ghost" onClick={() => marquerVue(h.cle)}>Marquer comme vu</Btn>} />
              ))}
            </div>
          )}
      </Panneau>

      {dejaVues.length > 0 && (
        <Panneau style={st.carte}>
          <div style={st.titre}><span>Déjà vues</span></div>
          <div style={st.liste}>
            {dejaVues.map((h, i) => (
              <Ligne key={h.cle} h={h} derniere={i === dejaVues.length - 1}
                action={<Btn small variant="ghost" onClick={() => remettreAVoir(h.cle)}>Remettre à voir</Btn>} />
            ))}
          </div>
        </Panneau>
      )}
    </div>
  );
}

// Direction Galet : le texte posé sur la page, chaque liste dans une carte
// blanche (Panneau), lignes séparées par le filet doux de ligneStyle.
const st = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },
  intro: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.5 },
  attente: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  carte: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  titre: { display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font)', fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', lineHeight: 1.25 },
  compte: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g1)', fontSize: 'var(--t2)', color: 'var(--text2)' },
  vide: { margin: 0, padding: '8px 0', fontSize: 'var(--t2)', color: 'var(--text2)' },
  liste: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  ligne: { alignItems: 'flex-start', padding: '10px 0', boxSizing: 'border-box' },
  texte: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 auto', minWidth: 0 },
  nom: { fontWeight: 'var(--g2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.5 },
  numero: { color: 'var(--text3)' },
  chiffre: { fontFamily: 'var(--font-num)', color: 'var(--text)' },
  doute: { fontSize: 'var(--t1)', color: 'var(--warning-text)', lineHeight: 1.5 },
  vu: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  droite: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  ecart: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t4)', color: 'var(--warning-text)', whiteSpace: 'nowrap' },
};
