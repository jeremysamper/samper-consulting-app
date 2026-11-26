import React from 'react';
import { notify } from '../../components/toast/index.js';
import { Panneau, ligneStyle } from '../../components/ui/index.jsx';
import { BoutonActions, st as fs } from '../../components/ui/Fenetres.jsx';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { getPermissionsForRole } from '../../data/demoData.js';
import { isModuleActiveForEtab } from '../moduleConfig.js';
import * as caisse from '../../services/caisseService.js';
import { FenetreDeclaration } from '../pertes/DeclarationRapide.jsx';
import { casesFinDeJournee, motifFinDeService } from './finDeJournee.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fin de journée de la caisse (lot 20 du panel, 26.11.2026). Ouvert depuis le
// menu « Plus » de la Caisse, pour l'habillage (consultant, patron,
// responsable de cuisine : peutHabillerCaisse, posé par Caisse.jsx).
//
// Liste les produits dont le compteur de portions du jour garde un reste.
// Pour chacun, dans son « Gérer » :
//   - « Passer le reste en perte » : la saisie de perte du module Pertes
//     (FenetreDeclaration) s'ouvre préremplie (produit, reste, motif « Fin de
//     service » ou le plus proche) ; rien n'est écrit avant « Déclarer la
//     perte » (D2). La perte écrite, la case est remise à zéro. Proposé à qui
//     déclare les pertes aujourd'hui (droit du module Pertes, module actif).
//   - « Remettre à zéro » : la case revient en vente sans nombre, par la RPC
//     qui pose le compteur (caisse_poser_disponibilite, état en_vente, D1).
// ─────────────────────────────────────────────────────────────────────────────

export default function FinDeJournee({ etablissement, user, boutons, plats, onChange }) {
  const etabId = etablissement?.id || null;
  const jour = zurichToday();
  const cases = React.useMemo(() => casesFinDeJournee(boutons, plats, jour), [boutons, plats, jour]);
  const { reglages } = useReglagesModule(etabId, 'pertes');
  const motif = motifFinDeService(reglages?.motifs);
  const peutPerte = Boolean(getPermissionsForRole(user?.role)?.pertes) && isModuleActiveForEtab(etablissement, 'pertes');
  const [perte, setPerte] = React.useState(null);
  // Un seul envoi à la fois : un second toucher avant le rendu suivant ne
  // repart pas (verrou tenu hors de l'état React).
  const verrou = React.useRef(false);
  const [enCours, setEnCours] = React.useState(false);

  const remettreAZero = async (c, { apresPerte = false } = {}) => {
    if (verrou.current) return;
    verrou.current = true;
    setEnCours(true);
    try {
      const { error } = await caisse.poserDisponibilite({ etablissementId: etabId, platId: c.platId, etat: 'en_vente' });
      if (error) {
        notify(apresPerte
          ? "La perte est déclarée, mais la case n'a pas pu être remise à zéro. Choisissez « Remettre à zéro »."
          : error, 'error');
        return;
      }
      if (!apresPerte) notify('La case est remise à zéro.', 'success');
      await onChange?.();
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };

  return (
    <div style={st.page} data-caisse-fin-journee="">
      <p style={st.texte}>
        Voici les produits comptés qui gardent des portions aujourd'hui. Pour chacun, passez le reste en perte ou remettez la case à zéro. Rien n'est écrit en perte sans votre validation.
      </p>
      {!peutPerte && cases.length > 0 && (
        <p style={st.texte}>Vous ne déclarez pas les pertes : la remise à zéro reste possible.</p>
      )}
      {!cases.length && <p style={st.texte}>Aucun produit compté ne garde de portion aujourd'hui.</p>}
      {cases.length > 0 && (
        <Panneau style={st.panneau}>
          {cases.map((c, i) => (
            <div key={c.platId} style={ligneStyle({ derniere: i === cases.length - 1 })} data-fin-journee-produit={c.platId}>
              <span style={st.nom}>
                <span data-no-translate="">{c.nomCourt}</span>
                <span style={st.reste}><span>Reste</span> <span style={st.num} data-no-translate="">{c.restant}</span></span>
              </span>
              <BoutonActions
                id={`caisse-fin-journee-${c.platId}`}
                label="Gérer"
                style={st.gerer}
                disabled={enCours}
                titre={<span data-no-translate="">{c.nomCourt}</span>}
                sousTitre={<><span>Reste</span> <span data-no-translate="">{c.restant}</span></>}
                sections={[{ items: [
                  peutPerte && {
                    titre: 'Passer le reste en perte',
                    detail: "La perte s'ouvre préremplie. Vous la validez.",
                    onClick: () => setPerte(c),
                  },
                  {
                    titre: 'Remettre à zéro',
                    detail: "La case revient en vente, sans nombre. Aucune perte n'est écrite.",
                    onClick: () => remettreAZero(c),
                  },
                ] }]}
              />
            </div>
          ))}
        </Panneau>
      )}
      {perte && peutPerte && (
        <FenetreDeclaration
          etablissement={etablissement}
          user={user}
          depart={{
            produit: perte.nom,
            quantite: perte.restant,
            unite: 'portions',
            motif,
            commentaire: 'Fin de journée de la caisse',
          }}
          onClose={() => setPerte(null)}
          onDeclaree={() => remettreAZero(perte, { apresPerte: true })}
        />
      )}
    </div>
  );
}

const st = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16, minWidth: 0, maxWidth: 720 },
  texte: { margin: 0, color: 'var(--text2)', fontSize: 'var(--t2)', lineHeight: 1.5 },
  panneau: { padding: '4px 18px' },
  nom: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 auto', minWidth: 0, padding: '8px 0', fontWeight: 'var(--g2)' },
  reste: { color: 'var(--text3)', fontSize: 'var(--t1)', fontWeight: 'var(--g1)' },
  num: { fontFamily: 'var(--font-num)' },
  gerer: { ...fs.secondaire, minHeight: 44, flex: '0 0 auto' },
};
