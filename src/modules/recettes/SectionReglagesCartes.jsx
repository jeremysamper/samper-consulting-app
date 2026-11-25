import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useCartes } from '../../hooks/useCartes.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { EtatModule, st as stm } from '../compte/sections/reglagesModulesUi.jsx';
import { useCarteAccueil } from './carteAccueil.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Cartes & Recettes » de la page des réglages (plan 15, lot 2) :
//   - ordre des onglets (cartes.ordre) ;
//   - carte d'accueil : la carte qui s'ouvre à l'arrivée dans le module,
//     préférence de la personne (user_settings, carteAccueil.js) ;
//   - cartes cachées (cartes.masquee) : le consultant seul, comme avant ;
//   - archives : restaurer une carte archivée.
// Le module garde ce qui touche une carte en particulier (créer, modifier,
// archiver, cacher depuis sa fenêtre). Garde : le droit « Modifier » des
// Cartes & Recettes, celle de la barre d'onglets.
// ─────────────────────────────────────────────────────────────────────────────

const nomCarte = (c) => String(c?.nom ?? '').trim() || '?';

export default function SectionReglagesCartes({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const consultant = user?.role === 'consultant';
  const { cartes, archivedCartes, status, archiveCarte, masquerCarte, reorderCartes } = useCartes(etabId, { role: user?.role });
  const { carteId: accueilId, choisir } = useCarteAccueil(etabId);
  const [enCours, setEnCours] = React.useState(false);
  if (!etabId) return null;
  if (status === 'loading') return <EtatModule status="loading" />;
  if (status === 'error') return <EtatModule status="error" />;

  const deplacer = async (index, sens) => {
    const j = index + sens;
    if (enCours || j < 0 || j >= cartes.length) return;
    const ids = cartes.map((c) => c.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setEnCours(true);
    const ok = await reorderCartes(ids);
    setEnCours(false);
    if (ok === false) notify("L'ordre n'a pas pu être enregistré. Réessayez.", 'error');
  };
  const choisirAccueil = async (id) => {
    try {
      await choisir(id);
      notify(id ? "Carte d'accueil enregistrée." : "Carte d'accueil retirée.", 'success');
    } catch (e) {
      console.error('[carte d\'accueil]', e);
      notify("La carte d'accueil n'a pas pu être enregistrée.", 'error');
    }
  };
  const agir = async (fn) => {
    if (enCours) return;
    setEnCours(true);
    await fn();
    setEnCours(false);
  };

  return (
    <div style={ui.liste} data-section-reglages="cartes">
      <Ligne colonne titre="Ordre des onglets" aide="De gauche à droite, pour toute l'équipe.">
        {cartes.length === 0 && <p style={stm.vide}>Aucune carte active.</p>}
        <div style={stm.liste}>
          {cartes.map((c, i) => (
            <div key={c.id} style={stm.ligne} data-carte-ordre="">
              <span style={stm.texte}>
                <span data-no-translate="">{nomCarte(c)}</span>
                {c.masquee === true && <span style={st.etat}> <span>cachée</span></span>}
              </span>
              <span style={st.actions}>
                <Btn variant="ghost" disabled={enCours || i === 0} style={stm.btn44} onClick={() => deplacer(i, -1)}>Avant</Btn>
                <Btn variant="ghost" disabled={enCours || i === cartes.length - 1} style={stm.btn44} onClick={() => deplacer(i, 1)}>Après</Btn>
              </span>
            </div>
          ))}
        </div>
      </Ligne>
      <Ligne titre="Carte d'accueil" aide="La carte qui s'ouvre quand vous arrivez dans Cartes & Recettes. Ce choix est le vôtre, sur cet établissement.">
        <select
          value={cartes.some((c) => c.id === accueilId) ? accueilId : ''}
          aria-label="Carte d'accueil"
          onChange={(e) => choisirAccueil(e.target.value || null)}
          style={{ ...stm.champ, flex: '0 1 280px', width: 280 }}
        >
          <option value="">La première carte</option>
          {cartes.map((c) => <option key={c.id} value={c.id}>{nomCarte(c)}</option>)}
        </select>
      </Ligne>
      {consultant && (
        <Ligne colonne titre="Cartes cachées" aide="Une carte cachée n'est visible que du consultant. Rien n'est supprimé.">
          <div style={stm.liste}>
            {cartes.map((c) => (
              <div key={c.id} style={stm.ligne}>
                <span style={stm.texte} data-no-translate="">{nomCarte(c)}</span>
                <Btn variant="ghost" disabled={enCours} style={stm.btn44} onClick={() => agir(() => masquerCarte(c.id, c.masquee !== true))}>
                  {c.masquee === true ? 'Montrer à l\'équipe' : 'Cacher'}
                </Btn>
              </div>
            ))}
          </div>
        </Ligne>
      )}
      <Ligne colonne derniere titre="Archives" aide="Une carte archivée sort des onglets. Ses plats et ses fiches restent intacts.">
        {archivedCartes.length === 0 && <p style={stm.vide}>Aucune carte archivée.</p>}
        <div style={stm.liste}>
          {archivedCartes.map((c) => (
            <div key={c.id} style={stm.ligne} data-carte-archive="">
              <span style={stm.texte} data-no-translate="">{nomCarte(c)}</span>
              <Btn variant="ghost" disabled={enCours} style={stm.btn44} onClick={() => agir(() => archiveCarte(c.id, false))}>Restaurer</Btn>
            </div>
          ))}
        </div>
      </Ligne>
    </div>
  );
}

const st = {
  etat: { fontSize: 'var(--t1)', color: 'var(--warning-text)' },
  actions: { display: 'inline-flex', gap: 8, flexShrink: 0 },
};
