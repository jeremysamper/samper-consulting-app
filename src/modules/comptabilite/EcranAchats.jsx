import React from 'react';
import { parFournisseur } from '../factures-achats/analysesAchats.js';
import { Chf, dateCH, pluriel, st as ui } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Achats de la période : synthèse lue dans les pièces de Factures & achats,
// rien n'est réécrit ici (D10). Même règle que les Analyses des dépenses : HT,
// sinon TTC, sinon lignes ; les bons de livraison ne sont pas additionnés.
// Corriger une pièce se fait dans Factures & achats (bouton en tête).
// ─────────────────────────────────────────────────────────────────────────────

export default function EcranAchats({ s, etat }) {
  const m = s.matiere;
  const fournisseurs = React.useMemo(() => parFournisseur(m.liste || []), [m.liste]);

  if (etat === 'loading') return <p style={ui.remarque}>Chargement…</p>;
  if (etat === 'error') return <p style={{ ...ui.remarque, color: 'var(--danger-text)' }}>Lecture des factures impossible pour l'instant. Nouvel essai en cours.</p>;

  const aVerifier = m.sansHt > 0 || m.sansTaux > 0 || m.sansMontant > 0;

  return (
    <div style={ui.page}>
      {!m.factures && <p style={ui.texte}>Aucune facture d'achat datée de cette période.</p>}

      {fournisseurs.length > 0 && (
        <section style={ui.section} data-par-fournisseur="">
          <div style={ui.sectionTitre}>Par fournisseur</div>
          <div>
            {fournisseurs.map(f => (
              <div key={f.cle} style={ui.ligne}>
                <span style={ui.ligneGauche}>
                  <span style={ui.ligneTitre} data-no-translate>{f.label}</span>
                  <span style={ui.ligneDetail}><span>{f.total}</span> <span>{pluriel(f.total, 'facture', 'factures')}</span></span>
                </span>
                <span style={ui.num}><Chf v={f.montant} /></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {aVerifier && (
        <section style={ui.section} data-a-verifier="">
          <div style={ui.sectionTitre}>À vérifier</div>
          {m.sansHt > 0 && (
            <p style={st.point}><span>{m.sansHt}</span> <span>{pluriel(m.sansHt, 'facture sans montant hors TVA, comptée TVA comprise', 'factures sans montant hors TVA, comptées TVA comprise')}</span></p>
          )}
          {m.sansTaux > 0 && (
            <p style={st.point}><span>{m.sansTaux}</span> <span>{pluriel(m.sansTaux, 'facture sans taux de TVA', 'factures sans taux de TVA')}</span></p>
          )}
          {m.sansMontant > 0 && (
            <p style={st.point}><span>{m.sansMontant}</span> <span>{pluriel(m.sansMontant, 'facture sans aucun montant, non additionnée', 'factures sans aucun montant, non additionnées')}</span></p>
          )}
        </section>
      )}

      {s.doublons.length > 0 && (
        <section style={ui.section} data-doublons="">
          {s.doublons.map(d => (
            <p key={`${d.charge.id}-${d.facture.id}`} style={{ ...st.point, color: 'var(--warning-text)' }}>
              <span>Possible doublon avec une charge fixe :</span> <span data-no-translate>{d.facture.fournisseurNom}</span>, <span>facture du</span> <span>{dateCH(d.facture.dateDocument)}</span>
            </p>
          ))}
          <p style={ui.remarque}>Une charge fixe saisie compte déjà chaque mois : sa facture importée ici la compte une deuxième fois. Rien n'est retiré d'office.</p>
        </section>
      )}

      {m.bons > 0 && (
        <p style={ui.remarque}>
          <span>Non additionnés :</span> <span>{m.bons}</span> <span>{pluriel(m.bons, 'bon de livraison ou de commande', 'bons de livraison ou de commande')}</span>
        </p>
      )}
    </div>
  );
}

const st = {
  point: { margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 },
};
