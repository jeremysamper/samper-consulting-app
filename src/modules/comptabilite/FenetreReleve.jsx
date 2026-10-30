import React from 'react';
import { Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { importerReleve } from './comptaService.js';
import { dateCH, pluriel } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Relevé lu » : ce que le fichier contient (lignes, période, compte) et
// combien de lignes sont déjà importées (même clé : elles seront ignorées),
// puis « Importer ». Rien ne s'écrit avant ce geste. Un relevé dont toutes les
// lignes sont déjà là ne s'importe pas une seconde fois.
//
//   releve : lireReleve(...) de rapprochement.js ; lignesExistantes : les
//   lignes déjà importées (leurs clés, et leur date et montant : un même
//   relevé importé une fois en camt.053 et une fois en CSV n'a pas les mêmes
//   clés, la fenêtre le signale avant l'import).
// ─────────────────────────────────────────────────────────────────────────────

export default function FenetreReleve({ etabId, releve, nomFichier, lignesExistantes, onClose, onImporte }) {
  const [enCours, setEnCours] = React.useState(false);
  const clesConnues = React.useMemo(() => new Set(lignesExistantes.map(l => l.cle)), [lignesExistantes]);
  const total = releve.lignes.length;
  const dejaLa = releve.lignes.filter(l => clesConnues.has(l.cle)).length;
  const nouvelles = total - dejaLa;
  const semblables = React.useMemo(() => {
    const vus = new Set(lignesExistantes.map(l => `${l.dateOperation}|${Number(l.montant).toFixed(2)}`));
    return releve.lignes.filter(l => !clesConnues.has(l.cle) && vus.has(`${l.dateOperation}|${Number(l.montant).toFixed(2)}`)).length;
  }, [releve.lignes, lignesExistantes, clesConnues]);

  async function importer() {
    if (enCours || !nouvelles) return;
    setEnCours(true);
    try {
      const r = await importerReleve(etabId, { ...releve, nomFichier }, releve.lignes);
      if (r.error) { notify(r.error, 'error'); return; }
      notify(r.ajoutees ? 'Relevé importé.' : 'Ces lignes étaient déjà importées.', r.ajoutees ? 'success' : 'info');
      onImporte?.();
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Fenetre
      id="compta-releve"
      titre="Relevé lu"
      sousTitre={nomFichier ? <span data-no-translate>{nomFichier}</span> : null}
      onClose={onClose}
      largeur={480}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button
            type="button"
            style={{ ...fs.primaire, opacity: nouvelles && !enCours ? 1 : 0.5 }}
            disabled={!nouvelles || enCours}
            onClick={importer}
            data-importer=""
          >
            Importer
          </button>
        </>
      )}
    >
      <p style={fs.apercu} data-releve-lu="">
        <span>{total}</span> <span>{pluriel(total, 'ligne', 'lignes')}</span>
        {releve.dateDebut && releve.dateFin && <> <span>du</span> <span>{dateCH(releve.dateDebut)}</span> <span>au</span> <span>{dateCH(releve.dateFin)}</span></>}
        {releve.iban ? <>, <span>compte</span> <span data-no-translate>{releve.iban}</span></> : null}
        .
      </p>
      {dejaLa > 0 && (
        <p style={fs.apercu} data-deja-la="">
          <span>{dejaLa}</span> <span>{pluriel(dejaLa, 'ligne déjà importée sera ignorée.', 'lignes déjà importées seront ignorées.')}</span>
        </p>
      )}
      {!nouvelles && <p style={{ ...fs.remarque, color: 'var(--warning-text)' }}>Toutes les lignes de ce relevé sont déjà importées.</p>}
      {semblables > 0 && (
        <p style={{ ...fs.remarque, color: 'var(--warning-text)' }} data-semblables="">
          <span>{semblables}</span> <span>{pluriel(semblables, 'ligne a la même date et le même montant qu\'une ligne déjà importée : le même relevé, sous un autre format ? Importé deux fois, il compterait deux fois.', 'lignes ont la même date et le même montant qu\'une ligne déjà importée : le même relevé, sous un autre format ? Importé deux fois, il compterait deux fois.')}</span>
        </p>
      )}
      <p style={fs.remarque}>Rien n'est rapproché ni réglé à l'import : l'app propose ensuite la facture de chaque paiement, vous validez.</p>
    </Fenetre>
  );
}
