import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import EtatAbsent from './EtatAbsent.jsx';
import FenetreReleve from './FenetreReleve.jsx';
import FenetreChoixFacture from './FenetreChoixFacture.jsx';
import { DescFacture, DescLigne } from './LigneBanque.jsx';
import { defaireRapprochement, ignorerLigne, rapprocher, regleeParLigne, supprimerReleve } from './comptaService.js';
import { apparier, etatBanque, lireReleve } from './rapprochement.js';
import { Chf, dateCH, pluriel, st as ui } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Banque (droit « Régler les factures ») : import du relevé (camt.053 ou CSV
// de la banque), puis rapprochement des paiements avec les factures d'achat
// (règle D17). Rien ne s'écrit sans un geste : « Valider les rapprochements »
// pour les sûrs, « Confirmer » ou « Choisir la facture » pour les autres. Une
// facture encore à régler, rapprochée ici, est marquée réglée à la date de la
// ligne, par virement (comptaService.rapprocher) ; aucune autre colonne de la
// facture n'est écrite. Les encaissements (crédits) ne se rapprochent pas.
// Défaire un rapprochement qui avait réglé la facture propose de la remettre
// à régler (sinon elle sortirait de l'échéancier sans être payée). Un relevé
// importé par erreur se supprime avec ses lignes, s'il n'a aucun paiement
// rapproché.
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGE_CSV = 'Ce fichier CSV n\'a pas été reconnu. Téléchargez plutôt le relevé camt.053 dans votre e-banking : toutes les banques suisses le proposent.';
const MESSAGE_XML = 'Ce fichier n\'est pas un relevé camt.053. Téléchargez le relevé camt.053 (et non une notification camt.054) dans votre e-banking.';

// Texte d'un fichier : UTF-8, sinon Windows-1252 (anciens exports CSV).
async function texteFichier(fichier) {
  const octets = await fichier.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

function Section({ titre, n, id, replie, onBasculer, children }) {
  if (onBasculer) {
    return (
      <section style={ui.section} data-section-banque={id}>
        <button type="button" style={st.pli} aria-expanded={!replie} onClick={onBasculer}>
          {replie ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          <span style={ui.sectionTitre}><span>{titre}</span> <span>({n})</span></span>
        </button>
        {!replie && children}
      </section>
    );
  }
  return (
    <section style={ui.section} data-section-banque={id}>
      <div style={ui.sectionTitre}><span>{titre}</span> <span>({n})</span></div>
      {children}
    </section>
  );
}

export default function EcranBanque({ etabId, userId, releves, lignes, docs, onRetour, onChange }) {
  const inputRef = React.useRef(null);
  // { type: 'releve', releve, nomFichier } | { type: 'choix', ligne }
  // | { type: 'defaire', ligne, facture } | { type: 'supprimer', releve, n }
  const [fenetre, setFenetre] = React.useState(null);
  const [enCours, setEnCours] = React.useState(false);
  const [plis, setPlis] = React.useState({ encaissements: true, rapprochees: true, releves: true });
  const fermer = React.useCallback(() => setFenetre(null), []);

  const absente = releves.status === 'absente' || lignes.status === 'absente';
  const pret = releves.status === 'ready' && lignes.status === 'ready';
  const etat = etatBanque(releves.lignes, lignes.lignes);
  const paires = React.useMemo(() => apparier(lignes.lignes, docs), [lignes.lignes, docs]);
  const parId = React.useMemo(() => new Map((docs || []).map(d => [d.id, d])), [docs]);
  const rapprochees = React.useMemo(() => lignes.lignes
    .filter(l => l.documentId || l.ignoree)
    .sort((a, b) => b.dateOperation.localeCompare(a.dateOperation)), [lignes.lignes]);

  const etatTitre = !pret ? null
    : etat.dernier
      ? (
        <>
          <span>Relevé du</span> <span>{dateCH(etat.dernier.dateDebut)}</span> <span>au</span> <span>{dateCH(etat.dernier.dateFin)}</span>,{' '}
          <span>{etat.aRapprocher}</span> <span>{pluriel(etat.aRapprocher, 'paiement à rapprocher', 'paiements à rapprocher')}</span>
        </>
      )
      : 'Aucun relevé importé';

  async function choisirFichier(e) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    try {
      const releve = lireReleve(await texteFichier(fichier));
      if (releve.erreur === 'colonnes') { notify(MESSAGE_CSV, 'error'); return; }
      if (releve.erreur) { notify(MESSAGE_XML, 'error'); return; }
      if (!releve.lignes.length) { notify('Aucune ligne lue dans ce relevé.', 'warning'); return; }
      setFenetre({ type: 'releve', releve, nomFichier: fichier.name });
    } catch (err) {
      console.error('[comptabilité] lecture du relevé', err);
      notify('Lecture du fichier impossible.', 'error');
    }
  }

  async function agir(fn, succes) {
    if (enCours) return false;
    setEnCours(true);
    try {
      const { error } = await fn();
      if (error) { notify(error, 'error'); return false; }
      if (succes) notify(succes, 'success');
      return true;
    } finally {
      setEnCours(false);
      onChange?.();
    }
  }

  const valider = () => agir(
    () => rapprocher(paires.surs.map(s => ({ ligne: s.ligne, facture: s.facture })), 'auto', userId),
    'Rapprochements enregistrés.',
  );
  const confirmer = (ligne, facture, mode = 'manuel') => agir(() => rapprocher([{ ligne, facture }], mode, userId), 'Rapprochement enregistré.');
  const ignorer = (ligne, oui = true) => agir(() => ignorerLigne(ligne.id, oui), oui ? 'Ligne ignorée.' : 'Ligne remise à rapprocher.');
  const defaire = (ligne) => {
    if (ligne.ignoree) return ignorer(ligne, false);
    const f = ligne.documentId ? parId.get(ligne.documentId) : null;
    // Facture réglée par ce rapprochement : on demande si elle repart à régler.
    if (regleeParLigne(f, ligne)) { setFenetre({ type: 'defaire', ligne, facture: f }); return undefined; }
    return agir(() => defaireRapprochement(ligne, f), 'Rapprochement défait.');
  };
  const defaireEtFermer = async (remettreARegler) => {
    const { ligne, facture } = fenetre;
    const ok = await agir(
      () => defaireRapprochement(ligne, facture, { remettreARegler }),
      remettreARegler ? 'Rapprochement défait, facture remise à régler.' : 'Rapprochement défait.',
    );
    if (ok) fermer();
  };
  const lignesDuReleve = (r) => lignes.lignes.filter(l => l.releveId === r.id);
  const demanderSuppression = (r) => {
    const siennes = lignesDuReleve(r);
    if (siennes.some(l => l.documentId)) { notify('Ce relevé a des paiements rapprochés : défaites-les d\'abord.', 'warning'); return; }
    setFenetre({ type: 'supprimer', releve: r, n: siennes.length });
  };
  const supprimer = async () => {
    const ok = await agir(() => supprimerReleve(fenetre.releve.id, lignes.lignes), 'Relevé supprimé.');
    if (ok) fermer();
  };
  const relevesTries = React.useMemo(() => releves.lignes.slice()
    .sort((a, b) => String(b.dateFin || '').localeCompare(String(a.dateFin || ''))), [releves.lignes]);

  const action = (texte, onClick, primaire = false) => (
    <Btn variant={primaire ? 'primary' : undefined} onClick={onClick} disabled={enCours} style={st.bouton}>{texte}</Btn>
  );

  return (
    <EcranTache
      titre="Banque"
      etat={etatTitre}
      onRetour={onRetour}
      actions={!absente && pret ? <Btn variant="primary" onClick={() => inputRef.current?.click()} style={ui.primaire}>Importer un relevé</Btn> : null}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xml,.053,.csv,.txt,text/xml,application/xml,text/csv"
        style={{ display: 'none' }}
        onChange={choisirFichier}
        data-import-releve=""
      />
      <div style={ui.page} data-banque="">
        {absente ? <EtatAbsent />
          : releves.status === 'error' || lignes.status === 'error'
            ? <p style={{ ...ui.remarque, color: 'var(--danger-text)' }}>Lecture des relevés impossible pour l'instant. Nouvel essai en cours.</p>
            : !pret ? <p style={ui.remarque}>Chargement…</p>
              : !etat.dernier ? (
                <p style={ui.texte}>Téléchargez le relevé camt.053 de votre compte dans l'e-banking (ou son export CSV), puis importez-le ici : l'app propose la facture de chaque paiement, vous validez.</p>
              ) : (
                <>
                  {etat.dernier.soldeFin != null && (
                    <p style={{ ...ui.texte, margin: 0 }} data-solde="">
                      <span>Solde au</span> <span>{dateCH(etat.dernier.dateFin)}</span> : <Chf v={etat.dernier.soldeFin} />
                    </p>
                  )}
                  <p style={{ ...ui.remarque, margin: 0 }}>Une facture encore à régler, rapprochée ici, est marquée réglée à la date du relevé, par virement.</p>

                  {!etat.aRapprocher && <p style={ui.texte}>Tous les paiements sont rapprochés.</p>}

                  {paires.surs.length > 0 && (
                    <Section titre="Rapprochements sûrs" n={paires.surs.length} id="surs">
                      <div>
                        {paires.surs.map(({ ligne, facture }) => (
                          <div key={ligne.id} style={ui.ligne} data-sur={ligne.id}>
                            <span style={ui.ligneGauche}>
                              <span style={ui.ligneTitre}><DescLigne ligne={ligne} /></span>
                              <span style={ui.ligneDetail}><DescFacture facture={facture} /></span>
                            </span>
                          </div>
                        ))}
                      </div>
                      <div data-valider-surs="">
                        <Btn variant="primary" onClick={valider} disabled={enCours} style={ui.primaire}>
                          {paires.surs.length > 1
                            ? <span><span>Valider les</span> <span>{paires.surs.length}</span> <span>rapprochements</span></span>
                            : 'Valider le rapprochement'}
                        </Btn>
                      </div>
                    </Section>
                  )}

                  {paires.aConfirmer.length > 0 && (
                    <Section titre="À confirmer" n={paires.aConfirmer.length} id="confirmer">
                      {paires.aConfirmer.map(({ ligne, facture, raisons }) => (
                        <div key={ligne.id} style={ui.ligne} data-a-confirmer={ligne.id}>
                          <span style={ui.ligneGauche}>
                            <span style={ui.ligneTitre}><DescLigne ligne={ligne} avecTexte /></span>
                            <span style={ui.ligneDetail}>
                              <span>Facture proposée :</span> <DescFacture facture={facture} />
                            </span>
                            <span style={{ ...ui.ligneDetail, color: 'var(--warning-text)' }}>
                              {raisons.map((r, i) => <React.Fragment key={r}>{i ? ' ; ' : ''}<span>{r}</span></React.Fragment>)}
                            </span>
                          </span>
                          <span style={st.actions}>
                            {action('Confirmer', () => confirmer(ligne, facture), true)}
                            {action('Autre facture', () => setFenetre({ type: 'choix', ligne }))}
                            {action('Ignorer', () => ignorer(ligne))}
                          </span>
                        </div>
                      ))}
                    </Section>
                  )}

                  {paires.aLaMain.length > 0 && (
                    <Section titre="À rapprocher à la main" n={paires.aLaMain.length} id="main">
                      {paires.aLaMain.map(ligne => (
                        <div key={ligne.id} style={ui.ligne} data-a-la-main={ligne.id}>
                          <span style={ui.ligneGauche}>
                            <span style={ui.ligneTitre}><DescLigne ligne={ligne} avecTexte /></span>
                          </span>
                          <span style={st.actions}>
                            {action('Choisir la facture', () => setFenetre({ type: 'choix', ligne }), true)}
                            {action('Ignorer (frais, salaire, autre)', () => ignorer(ligne))}
                          </span>
                        </div>
                      ))}
                    </Section>
                  )}

                  {paires.entrees.length > 0 && (
                    <Section
                      titre="Encaissements"
                      n={paires.entrees.length}
                      id="encaissements"
                      replie={plis.encaissements}
                      onBasculer={() => setPlis(p => ({ ...p, encaissements: !p.encaissements }))}
                    >
                      <p style={{ ...ui.remarque, margin: 0 }}>Les encaissements ne se rapprochent pas des factures d'achat.</p>
                      {paires.entrees.map(ligne => (
                        <div key={ligne.id} style={ui.ligne} data-entree={ligne.id}>
                          <span style={ui.ligneGauche}><span style={ui.ligneTitre}><DescLigne ligne={ligne} avecTexte /></span></span>
                        </div>
                      ))}
                    </Section>
                  )}

                  {rapprochees.length > 0 && (
                    <Section
                      titre="Rapprochées"
                      n={rapprochees.length}
                      id="rapprochees"
                      replie={plis.rapprochees}
                      onBasculer={() => setPlis(p => ({ ...p, rapprochees: !p.rapprochees }))}
                    >
                      <p style={{ ...ui.remarque, margin: 0 }}>Défaire un rapprochement qui a réglé la facture propose de la remettre à régler ; un règlement saisi dans Factures & achats ne change pas.</p>
                      {rapprochees.map((ligne) => {
                        const f = ligne.documentId ? parId.get(ligne.documentId) : null;
                        return (
                          <div key={ligne.id} style={ui.ligne} data-rapprochee={ligne.id}>
                            <span style={ui.ligneGauche}>
                              <span style={ui.ligneTitre}><DescLigne ligne={ligne} /></span>
                              <span style={ui.ligneDetail}>
                                {ligne.ignoree ? <span>ignorée</span>
                                  : f ? <DescFacture facture={f} />
                                    : <span>facture introuvable</span>}
                              </span>
                            </span>
                            <span style={st.actions}>{action('Défaire', () => defaire(ligne))}</span>
                          </div>
                        );
                      })}
                    </Section>
                  )}

                  <Section
                    titre="Relevés importés"
                    n={relevesTries.length}
                    id="releves"
                    replie={plis.releves}
                    onBasculer={() => setPlis(p => ({ ...p, releves: !p.releves }))}
                  >
                    {relevesTries.map((r) => {
                      const n = lignesDuReleve(r).length;
                      return (
                        <div key={r.id} style={ui.ligne} data-releve={r.id}>
                          <span style={ui.ligneGauche}>
                            <span style={ui.ligneTitre}>
                              <span>Relevé du</span> <span>{dateCH(r.dateDebut)}</span> <span>au</span> <span>{dateCH(r.dateFin)}</span>
                            </span>
                            <span style={{ ...ui.ligneDetail, overflowWrap: 'anywhere' }}>
                              {r.iban ? <><span data-no-translate>{r.iban}</span>, </> : null}
                              <span>{n}</span> <span>{pluriel(n, 'ligne', 'lignes')}</span>
                              {r.soldeFin != null && <>, <span>solde</span> <Chf v={r.soldeFin} /></>}
                              {r.nomFichier ? <>, <span data-no-translate>{r.nomFichier}</span></> : null}
                            </span>
                          </span>
                          <span style={st.actions}>{action('Supprimer', () => demanderSuppression(r))}</span>
                        </div>
                      );
                    })}
                  </Section>
                </>
              )}
      </div>

      {fenetre?.type === 'releve' && (
        <FenetreReleve
          etabId={etabId}
          releve={fenetre.releve}
          nomFichier={fenetre.nomFichier}
          lignesExistantes={lignes.lignes}
          onClose={fermer}
          onImporte={onChange}
        />
      )}
      {fenetre?.type === 'defaire' && (
        <Fenetre
          id="compta-banque-defaire"
          titre="Remettre la facture à régler ?"
          onClose={fermer}
          pied={(
            <>
              <button type="button" style={fs.secondaire} onClick={() => defaireEtFermer(false)} disabled={enCours}>Garder réglée</button>
              <button type="button" style={{ ...fs.primaire, opacity: enCours ? 0.5 : 1 }} onClick={() => defaireEtFermer(true)} disabled={enCours}>Remettre à régler</button>
            </>
          )}
        >
          <p style={{ ...fs.apercu, margin: 0 }}><DescFacture facture={fenetre.facture} /></p>
          <p style={{ ...fs.apercu, margin: 0 }}>
            <span>La Banque l'a marquée réglée le</span> <span>{dateCH(fenetre.ligne.dateOperation)}</span> <span>en rapprochant ce paiement. Si le paiement ne la concerne pas, remettez-la à régler : elle revient dans l'échéancier.</span>
          </p>
        </Fenetre>
      )}
      {fenetre?.type === 'supprimer' && (
        <Fenetre
          id="compta-banque-supprimer"
          titre="Supprimer ce relevé ?"
          onClose={fermer}
          pied={(
            <>
              <button type="button" style={fs.secondaire} onClick={fermer} disabled={enCours}>Annuler</button>
              <Btn variant="danger" disabled={enCours} onClick={supprimer} style={{ minHeight: 44 }}>Supprimer</Btn>
            </>
          )}
        >
          <p style={{ ...fs.apercu, margin: 0 }}>
            <span>Relevé du</span> <span>{dateCH(fenetre.releve.dateDebut)}</span> <span>au</span> <span>{dateCH(fenetre.releve.dateFin)}</span>
            {fenetre.releve.iban ? <>, <span data-no-translate>{fenetre.releve.iban}</span></> : null}
          </p>
          <p style={{ ...fs.apercu, margin: 0 }}>
            <span>{fenetre.n}</span> <span>{pluriel(fenetre.n, 'ligne disparaît de la Banque. Les factures ne changent pas.', 'lignes disparaissent de la Banque. Les factures ne changent pas.')}</span>
          </p>
        </Fenetre>
      )}
      {fenetre?.type === 'choix' && (
        <FenetreChoixFacture
          ligne={fenetre.ligne}
          docs={docs}
          lignes={lignes.lignes}
          enCours={enCours}
          onClose={fermer}
          onChoisir={async (facture) => { if (await confirmer(fenetre.ligne, facture)) fermer(); }}
        />
      )}
    </EcranTache>
  );
}

const st = {
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', flexShrink: 0, maxWidth: '100%' },
  bouton: { minHeight: 44 },
  pli: {
    display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, padding: 0, background: 'none', border: 'none',
    color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
  },
};
