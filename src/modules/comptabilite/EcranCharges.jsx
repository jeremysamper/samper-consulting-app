import React from 'react';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { BoutonActions, Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import EtatAbsent from './EtatAbsent.jsx';
import FenetreCharge from './FenetreCharge.jsx';
import { cloreCharge, supprimerCharge } from './comptaService.js';
import { chargeActive, moyenneMensuelle, parPeriodicite } from './chargesFixes.js';
import { Chf, dateCH, pluriel, st as ui, tauxTexte } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Charges fixes : saisies une fois, réparties sur chaque mois (D12). Un
// « Gérer » par ligne (Modifier, Arrêter à une date, Supprimer). Écriture :
// droit « Régler les factures » (factures_achat), comme en base.
// ─────────────────────────────────────────────────────────────────────────────

export default function EcranCharges({ etabId, charges, aujourdhui, peutEcrire, doublons, onRetour, onChange }) {
  const [fenetre, setFenetre] = React.useState(null); // { mode, charge }
  const fermer = React.useCallback(() => setFenetre(null), []);
  const [fin, setFin] = React.useState(aujourdhui);
  const [enCours, setEnCours] = React.useState(false);

  const absente = charges.status === 'absente';
  const lignes = React.useMemo(() => charges.lignes.slice().sort((a, b) => {
    const actA = chargeActive(a, aujourdhui) || a.debut > aujourdhui ? 0 : 1;
    const actB = chargeActive(b, aujourdhui) || b.debut > aujourdhui ? 0 : 1;
    return actA - actB || a.libelle.localeCompare(b.libelle, 'fr');
  }), [charges.lignes, aujourdhui]);
  const moyenne = moyenneMensuelle(charges.lignes, aujourdhui);

  const etat = absente || charges.status !== 'ready' ? null
    : <><span>{moyenne.n}</span> <span>{pluriel(moyenne.n, 'charge,', 'charges,')}</span> <Chf v={moyenne.ttc} /> <span>par mois en moyenne</span></>;

  async function agir(fn, succes) {
    if (enCours) return;
    setEnCours(true);
    try {
      const { error } = await fn();
      if (error) { notify(error, 'error'); return; }
      notify(succes, 'success');
      onChange?.();
      fermer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <EcranTache
      titre="Charges fixes"
      etat={etat}
      onRetour={onRetour}
      actions={peutEcrire && !absente && charges.status === 'ready'
        ? <Btn variant="primary" onClick={() => setFenetre({ mode: 'nouvelle' })} style={ui.primaire}>Ajouter une charge</Btn>
        : null}
    >
      <div style={ui.page}>
        {absente ? <EtatAbsent /> : charges.status === 'loading' ? <p style={ui.remarque}>Chargement…</p>
          : charges.status === 'error' ? <p style={{ ...ui.remarque, color: 'var(--danger-text)' }}>Lecture des charges impossible pour l'instant. Nouvel essai en cours.</p>
            : (
              <>
                <p style={ui.texte}>Une charge fixe se saisit une fois : l'app la répartit sur chaque mois. N'importez pas aussi sa facture dans Factures & achats, sinon elle compte deux fois.</p>
                {!lignes.length && <p style={ui.remarque}>Aucune charge saisie.</p>}
                <div data-charges="">
                  {lignes.map((c) => {
                    const terminee = c.fin && c.fin < aujourdhui;
                    return (
                      <div key={c.id} style={ui.ligne} data-charge={c.id}>
                        <span style={ui.ligneGauche}>
                          <span style={{ ...ui.ligneTitre, ...(terminee ? { color: 'var(--text2)' } : null) }} data-no-translate>{c.libelle}</span>
                          <span style={ui.ligneDetail}>
                            <Chf v={c.montant} /> <span>{parPeriodicite(c.periodicite)},</span>{' '}
                            {c.tvaTaux ? <><span>TVA</span> <span>{tauxTexte(c.tvaTaux)}</span></> : <span>sans TVA</span>}
                            {c.debut > aujourdhui && <>, <span>dès le</span> <span>{dateCH(c.debut)}</span></>}
                            {c.fin && <>, <span>{terminee ? 'arrêtée le' : 'jusqu\'au'}</span> <span>{dateCH(c.fin)}</span></>}
                            {c.fournisseur && <>, <span data-no-translate>{c.fournisseur}</span></>}
                          </span>
                        </span>
                        {peutEcrire && (
                          <BoutonActions
                            id={`compta-charge-${c.id}`}
                            label="Gérer"
                            style={st.gerer}
                            titre={c.libelle}
                            sections={[{
                              items: [
                                { titre: 'Modifier', detail: 'Montant, périodicité, TVA, dates.', onClick: () => setFenetre({ mode: 'modifier', charge: c }) },
                                !c.fin && { titre: 'Arrêter à une date', detail: 'La charge reste dans les mois passés.', onClick: () => { setFin(aujourdhui < c.debut ? c.debut : aujourdhui); setFenetre({ mode: 'arreter', charge: c }); } },
                                { titre: 'Supprimer', detail: 'Elle disparaît aussi des mois passés.', danger: true, onClick: () => setFenetre({ mode: 'supprimer', charge: c }) },
                              ],
                            }]}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {doublons.length > 0 && (
                  <div style={ui.section} data-doublons="">
                    {doublons.map(d => (
                      <p key={`${d.charge.id}-${d.facture.id}`} style={{ margin: 0, fontSize: 13, color: 'var(--warning-text)', lineHeight: 1.5 }}>
                        <span>Possible doublon avec une charge fixe :</span> <span data-no-translate>{d.facture.fournisseurNom}</span>, <span>facture du</span> <span>{dateCH(d.facture.dateDocument)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
      </div>

      {(fenetre?.mode === 'nouvelle' || fenetre?.mode === 'modifier') && (
        <FenetreCharge etabId={etabId} charge={fenetre.charge || null} aujourdhui={aujourdhui} onClose={fermer} onEnregistre={onChange} />
      )}

      {fenetre?.mode === 'arreter' && (
        <Fenetre
          id="compta-charge-arreter"
          titre="Arrêter la charge"
          sousTitre={fenetre.charge.libelle}
          onClose={fermer}
          pied={(
            <>
              <button type="button" style={fs.secondaire} onClick={fermer} disabled={enCours}>Annuler</button>
              <button
                type="button"
                style={{ ...fs.primaire, opacity: fin && fin >= fenetre.charge.debut && !enCours ? 1 : 0.5 }}
                disabled={!fin || fin < fenetre.charge.debut || enCours}
                onClick={() => agir(() => cloreCharge(fenetre.charge.id, fin), 'Charge arrêtée.')}
              >
                Enregistrer
              </button>
            </>
          )}
        >
          <label htmlFor="compta-charge-arret" style={fs.label}>Dernier jour compté</label>
          <input id="compta-charge-arret" type="date" style={{ ...fs.champ, minWidth: 200 }} value={fin} min={fenetre.charge.debut} onChange={e => setFin(e.target.value)} />
        </Fenetre>
      )}

      {fenetre?.mode === 'supprimer' && (
        <Fenetre
          id="compta-charge-supprimer"
          titre="Supprimer cette charge ?"
          sousTitre={fenetre.charge.libelle}
          onClose={fermer}
          pied={(
            <>
              <button type="button" style={fs.secondaire} onClick={fermer} disabled={enCours}>Annuler</button>
              <Btn variant="danger" disabled={enCours} onClick={() => agir(() => supprimerCharge(fenetre.charge.id), 'Charge supprimée.')} style={{ minHeight: 44 }}>Supprimer</Btn>
            </>
          )}
        >
          <p style={fs.apercu}>Elle disparaît aussi des mois passés ; pour l'arrêter seulement, indiquez une date de fin.</p>
        </Fenetre>
      )}
    </EcranTache>
  );
}

const st = {
  gerer: {
    minHeight: 44, padding: '8px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', flexShrink: 0,
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
};
