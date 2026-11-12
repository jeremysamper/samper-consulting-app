import { Options } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { useCartes } from '../../hooks/useCartes.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { useCarteAccueil } from './carteAccueil.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Carte d'accueil » de la page des réglages (Mes préférences) : la
// carte qui s'ouvre à l'arrivée dans Cartes & Recettes, pour l'établissement
// affiché. Même valeur et même état que le bouton « Définir par défaut » de la
// carte (carteAccueil.js) : le bouton reste le raccourci.
// ─────────────────────────────────────────────────────────────────────────────

const AUCUNE = '';

export default function SectionCarteAccueil({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const { cartes, status } = useCartes(etabId, { role: user?.role });
  const { carteId, choisir } = useCarteAccueil(etabId);
  if (!etabId) return null;

  async function regler(valeur) {
    const suivante = valeur || null;
    try {
      await choisir(suivante);
      notify(suivante ? 'Carte d\'accueil enregistrée' : 'Carte d\'accueil retirée', 'success');
    } catch (e) {
      notify('Enregistrement impossible. ' + messageErreur(e, 'recettes'), 'error');
    }
  }

  // Une carte d'accueil archivée ou retirée ne s'ouvre plus : la première
  // carte prend sa place, la liste le montre.
  const valeur = cartes.some((c) => c.id === carteId) ? carteId : AUCUNE;
  return (
    <div style={st.bloc}>
      <p style={st.texte}>
        <span>La carte qui s'ouvre à votre arrivée dans Cartes & Recettes, pour</span> <span data-no-translate="">{etablissement.nom}</span><span>. Le bouton « Définir par défaut » de chaque carte fait la même chose.</span>
      </p>
      {status === 'loading' && <p style={st.note}>Chargement…</p>}
      {status === 'error' && <p style={st.note}>Les cartes n'ont pas pu être lues. Réessayez dans un instant.</p>}
      {status === 'ready' && (
        <Options
          nom="Carte d'accueil"
          valeur={valeur}
          onChange={regler}
          options={[
            { v: AUCUNE, label: 'La première carte', detail: 'Aucune carte d\'accueil choisie.' },
            ...cartes.map((c) => ({ v: c.id, label: <span data-no-translate="">{c.nom}</span> })),
          ]}
        />
      )}
    </div>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 },
  texte: { margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 },
  note: { margin: 0, fontSize: 13, color: 'var(--text2)' },
};
