import React from 'react';
import { Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { facturesProches } from './rapprochement.js';
import { Chf, dateCH } from './comptaUi.jsx';
import { DescFacture, DescLigne } from './LigneBanque.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Choisir la facture » d'une ligne de relevé : les factures non encore
// rapprochées, de la plus proche par le montant à la plus éloignée (les 15
// premières, puis toutes sur demande). Un toucher choisit, « Rapprocher »
// enregistre ; une facture encore à régler sera marquée réglée à la date de
// la ligne, et la fenêtre le dit avant.
// ─────────────────────────────────────────────────────────────────────────────

const PREMIERES = 15;

export default function FenetreChoixFacture({ ligne, docs, lignes, enCours, onChoisir, onClose }) {
  const proches = React.useMemo(() => facturesProches(ligne, docs, lignes), [ligne, docs, lignes]);
  const [tout, setTout] = React.useState(false);
  const [choix, setChoix] = React.useState(null);
  const visibles = tout ? proches : proches.slice(0, PREMIERES);
  const facture = proches.find(p => p.facture.id === choix)?.facture || null;

  return (
    <Fenetre
      id="compta-choix-facture"
      titre="Choisir la facture"
      sousTitre={<DescLigne ligne={ligne} />}
      onClose={onClose}
      largeur={540}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button
            type="button"
            style={{ ...fs.primaire, opacity: facture && !enCours ? 1 : 0.5 }}
            disabled={!facture || enCours}
            onClick={() => facture && onChoisir(facture)}
            data-rapprocher=""
          >
            Rapprocher
          </button>
        </>
      )}
    >
      {!proches.length ? <p style={fs.apercu}>Aucune facture à rapprocher.</p> : (
        <div role="radiogroup" aria-label="Factures" style={st.liste}>
          {visibles.map(({ facture: f, ecart }) => {
            const actif = f.id === choix;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={actif}
                data-cadre=""
                data-facture={f.id}
                onClick={() => setChoix(f.id)}
                style={{ ...st.choix, ...(actif ? st.choixActif : null) }}
              >
                <span style={st.haut}>
                  <span style={{ minWidth: 0 }}><DescFacture facture={f} /></span>
                  <Chf v={f.totalTTC} />
                </span>
                <span style={st.bas}>
                  {f.dateDocument && <><span>facture du</span> <span>{dateCH(f.dateDocument)}</span></>}
                  {ecart != null && ecart > 0 && <>, <span>écart</span> <Chf v={ecart} /></>}
                  {ecart === 0 && <>, <span>même montant</span></>}
                  {ecart == null && <>, <span>TTC à saisir</span></>}
                </span>
              </button>
            );
          })}
          {!tout && proches.length > PREMIERES && (
            <button type="button" style={st.lien} onClick={() => setTout(true)}>
              <span>Afficher toutes les factures</span> <span>({proches.length})</span>
            </button>
          )}
        </div>
      )}
      {facture && !facture.regleLe && (
        <p style={{ ...fs.remarque, color: 'var(--text)' }} data-sera-reglee="">
          <span>Cette facture sera marquée réglée le</span> <span>{dateCH(ligne.dateOperation)}</span><span>, par virement.</span>
        </p>
      )}
    </Fenetre>
  );
}

const st = {
  liste: { display: 'flex', flexDirection: 'column', gap: 6 },
  choix: {
    display: 'flex', flexDirection: 'column', gap: 4, width: '100%', minHeight: 52, padding: '10px 12px', textAlign: 'left',
    borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14, cursor: 'pointer', boxSizing: 'border-box',
  },
  choixActif: { borderColor: 'var(--accent)', background: 'var(--accent-light)' },
  haut: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, minWidth: 0 },
  bas: { fontSize: 12, color: 'var(--text2)' },
  lien: { background: 'none', border: 'none', padding: '8px 0', minHeight: 44, color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, textAlign: 'left' },
};
