import React from 'react';
import { ListChecks, ShoppingBag, TrendingUp } from 'lucide-react';
import { Anneau, Btn, CarteAvant, CarteRepere, Panneau, carteAvantStyles, ligneStyle } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import {
  ACTIONS, EXPLICATIONS_ACTIONS, LIBELLES_STATUTS, baremeEffectif, chiffresDuMois, formatPoints,
  libelleAction, prochainCadeau, raisonCommandeImpossible,
} from './bareme.js';
import { messageErreurPoints, pointsService } from './pointsService.js';
import { ecouterMouvements } from './usePointsRetour.js';

// ─────────────────────────────────────────────────────────────────────────────
// Écran de l'employé : son solde et le prochain cadeau à portée (carte nuit),
// trois repères du mois, la boutique, ses commandes, ce qui rapporte des
// points (barème et plafonds) et son historique (50 derniers mouvements).
// Aucun classement entre employés (D14).
// ─────────────────────────────────────────────────────────────────────────────

const nuit = carteAvantStyles('nuit');

const fmtDate = new Intl.DateTimeFormat('fr-CH', {
  timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
export const dateCourte = (iso) => (iso ? fmtDate.format(new Date(iso)) : '');

// Nombre de points dans son nœud, le mot à côté (traduction du DOM).
export function NombrePoints({ n, signe = false, style }) {
  const v = Number(n) || 0;
  const texte = (signe && v > 0 ? '+' : '') + formatPoints(v);
  return (
    <span style={{ whiteSpace: 'nowrap', ...style }}>
      <span data-no-translate style={{ fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' }}>{texte}</span>
      {' '}<span>{Math.abs(v) > 1 ? 'points' : 'point'}</span>
    </span>
  );
}

function RaisonEteinte({ raison }) {
  if (!raison) return null;
  if (raison.cle === 'stock') return <span>Plus en stock</span>;
  if (raison.cle === 'retire') return <span>Retiré de la boutique</span>;
  return (
    <span>
      <span>Il vous manque</span>{' '}<NombrePoints n={raison.manque} />
    </span>
  );
}

export default function MesPoints({ user, etablissement, bareme, sansTitre = false }) {
  const etabId = etablissement?.id;
  const userId = user?.id;
  const [donnees, setDonnees] = React.useState(null);
  const [echec, setEchec] = React.useState(false);
  const [aCommander, setACommander] = React.useState(null);
  const [envoi, setEnvoi] = React.useState(false);
  const lectures = useOrdreLectures();

  const charger = React.useCallback(async () => {
    if (!etabId || !userId) return;
    const lecture = lectures.lancer(`${userId}|${etabId}`);
    try {
      const [solde, mouvements, cadeaux, commandes] = await Promise.all([
        pointsService.solde(etabId),
        pointsService.mesMouvements(etabId, userId),
        pointsService.cadeaux(etabId),
        pointsService.commandes(etabId, { userId }),
      ]);
      if (!lecture.appliquer()) return;
      setDonnees({ solde, mouvements, cadeaux, commandes });
      setEchec(false);
    } catch (err) {
      console.warn('[points] lecture', err);
      if (lecture.signalerEchec()) setEchec(true);
    }
  }, [etabId, userId, lectures]);

  React.useEffect(() => { charger(); }, [charger]);

  // Un mouvement reçu par l'abonnement de la coque (crédit, remboursement) :
  // relire le solde, l'historique et les commandes.
  React.useEffect(() => ecouterMouvements(() => charger()), [charger]);

  const commander = async () => {
    if (!aCommander || envoi) return;
    setEnvoi(true);
    try {
      await pointsService.commander(aCommander.id);
      notify('Commande envoyée : la direction vous remettra le cadeau.', 'success');
      setACommander(null);
      charger();
    } catch (err) {
      notify(messageErreurPoints(err, "La commande n'a pas abouti."), 'error');
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async (commande) => {
    try {
      await pointsService.annulerCommande(commande.id);
      notify('Commande annulée : vos points sont rendus.', 'success');
      charger();
    } catch (err) {
      notify(messageErreurPoints(err, "L'annulation n'a pas abouti."), 'error');
    }
  };

  if (!donnees) {
    return (
      <div className="points-page">
        <p className="points-aide">{echec ? 'Vos points ne sont pas lus pour le moment.' : 'Chargement…'}</p>
        {echec && <div><Btn onClick={charger}>Réessayer</Btn></div>}
      </div>
    );
  }

  const { solde, mouvements, cadeaux, commandes } = donnees;
  const proposes = cadeaux.filter((c) => c.actif);
  const prochain = prochainCadeau(proposes, solde);
  const mois = chiffresDuMois(mouvements);
  const enCours = commandes.filter((c) => c.statut === 'demandee');
  const nomCadeau = (id) => cadeaux.find((c) => c.id === id)?.nom || 'Cadeau retiré';
  const regles = baremeEffectif(bareme);

  return (
    <div className="points-page" data-points-ecran="participant">
      <div className="points-grille">
        {!sansTitre && <h1 className="points-titre">Mes points</h1>}
        {echec && <p className="points-aide" role="status">Écran non actualisé : la dernière lecture a échoué.</p>}

        <div className="points-haut">
          <CarteAvant ton="nuit" titre="Mon solde" data-carte="solde">
            <div className="points-nuit-corps">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <span style={nuit.chiffre} data-no-translate>{formatPoints(solde)}</span>
                <span style={nuit.libelle}>{solde > 1 || solde < -1 ? 'points' : 'point'}</span>
              </div>
            </div>
            <div style={{ ...nuit.tuile, display: 'flex', alignItems: 'center', gap: 14 }}>
              {prochain ? (
                <>
                  <Anneau part={prochain.part} couleur="var(--carte-nuit-succes)" piste="var(--carte-nuit-doux)" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={nuit.libelle}>Prochain cadeau</span>
                    <span style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', overflowWrap: 'anywhere' }} data-no-translate>{prochain.cadeau.nom}</span>
                    <span style={nuit.libelle}><span>Encore</span>{' '}<NombrePoints n={prochain.manque} /></span>
                  </div>
                </>
              ) : (
                <span style={nuit.libelle}>
                  {proposes.length ? 'Tous les cadeaux de la boutique sont à votre portée.' : "La boutique n'a pas encore de cadeau."}
                </span>
              )}
            </div>
          </CarteAvant>

          <div className="points-reperes">
            <CarteRepere Icone={TrendingUp} valeur={formatPoints(mois.gagnes)} libelle="points gagnés ce mois" />
            <CarteRepere Icone={ListChecks} valeur={formatPoints(mois.gestes)} libelle="gestes comptés ce mois" className="points-repere-3" />
            <CarteRepere Icone={ShoppingBag} valeur={formatPoints(enCours.length)} libelle={enCours.length > 1 ? 'commandes en cours' : 'commande en cours'} />
          </div>
        </div>

        <section aria-labelledby="points-boutique-titre">
          <h2 id="points-boutique-titre" className="points-section-titre">Boutique</h2>
          {proposes.length === 0 ? (
            <p className="points-aide">La direction n'a pas encore mis de cadeau en boutique.</p>
          ) : (
            <div className="points-boutique">
              {proposes.map((c) => {
                const raison = raisonCommandeImpossible(c, solde);
                return (
                  <Panneau key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 'var(--t3)', fontWeight: 'var(--g3)', overflowWrap: 'anywhere' }} data-no-translate>{c.nom}</div>
                    {c.description && <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{c.description}</div>}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 'auto' }}>
                      <NombrePoints n={c.cout} style={{ fontSize: 'var(--t3)' }} />
                      {c.stock != null && c.stock > 0 && (
                        <span style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>
                          <span>En stock :</span>{' '}<span data-no-translate>{c.stock}</span>
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <Btn onClick={() => setACommander(c)} disabled={Boolean(raison)} style={{ minHeight: 44 }}>Commander</Btn>
                      {raison && <span style={{ fontSize: 'var(--t1)', color: 'var(--text2)' }}><RaisonEteinte raison={raison} /></span>}
                    </div>
                  </Panneau>
                );
              })}
            </div>
          )}
        </section>

        {commandes.length > 0 && (
          <Panneau>
            <h2 className="points-section-titre">Mes commandes</h2>
            <div className="points-liste">
              {commandes.slice(0, 20).map((k) => (
                <div key={k.id} style={{ ...ligneStyle(), flexWrap: 'wrap', padding: '6px 0' }}>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontWeight: 'var(--g2)', overflowWrap: 'anywhere' }} data-no-translate>{nomCadeau(k.cadeauId)}</div>
                    <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>
                      <span>{LIBELLES_STATUTS[k.statut] || k.statut}</span>{' '}
                      <span data-no-translate>{dateCourte(k.createdAt)}</span>
                      {k.note && <> <span data-no-translate>{k.note}</span></>}
                    </div>
                  </div>
                  <NombrePoints n={k.cout} />
                  {k.statut === 'demandee' && (
                    <Btn small onClick={() => annuler(k)} style={{ minHeight: 44 }}>Annuler</Btn>
                  )}
                </div>
              ))}
            </div>
          </Panneau>
        )}

        <div className="points-bas">
          <Panneau>
            <h2 className="points-section-titre">Ce qui rapporte des points</h2>
            <p className="points-aide">Points fixes par geste fait dans l'app, avec un plafond par jour.</p>
            <div className="points-liste">
              {ACTIONS.filter((a) => regles[a].points > 0 && regles[a].plafond > 0).map((a) => (
                <div key={a} style={{ ...ligneStyle(), padding: '6px 0', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'var(--g2)' }}>{libelleAction(a)}</div>
                    <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4 }}>{EXPLICATIONS_ACTIONS[a]}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <NombrePoints n={regles[a].points} signe />
                    <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>
                      <span>jusqu'à</span>{' '}<span data-no-translate>{regles[a].plafond}</span>{' '}<span>par jour</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panneau>

          <Panneau>
            <h2 className="points-section-titre">Historique</h2>
            {mouvements.length === 0 ? (
              <p className="points-aide">Aucun mouvement pour l'instant : chaque geste compté s'inscrit ici.</p>
            ) : (
              <div className="points-liste">
                {mouvements.map((m) => (
                  <div key={m.id} style={{ ...ligneStyle({ serree: true }), padding: '4px 0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflowWrap: 'anywhere' }}>{m.libelle || libelleAction(m.action)}</div>
                      <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }} data-no-translate>{dateCourte(m.createdAt)}</div>
                    </div>
                    <NombrePoints n={m.points} signe style={{ color: m.points < 0 ? 'var(--text2)' : 'var(--text)' }} />
                  </div>
                ))}
              </div>
            )}
          </Panneau>
        </div>
      </div>

      {aCommander && (
        <Fenetre
          id="points-commander"
          titre="Commander ce cadeau ?"
          onClose={() => setACommander(null)}
          pied={(
            <>
              <button type="button" style={st.secondaire} onClick={() => setACommander(null)}>Annuler</button>
              <button type="button" style={st.primaire} onClick={commander} disabled={envoi}>{envoi ? 'Envoi…' : 'Commander'}</button>
            </>
          )}
        >
          <div style={st.apercu}>
            <div style={{ fontWeight: 'var(--g3)' }} data-no-translate>{aCommander.nom}</div>
            <div><NombrePoints n={aCommander.cout} /> <span>seront retirés de votre solde.</span></div>
          </div>
          <p style={st.remarque}>La direction vous remet le cadeau. Tant qu'elle ne l'a pas fait, vous pouvez annuler et récupérer vos points.</p>
        </Fenetre>
      )}
    </div>
  );
}
