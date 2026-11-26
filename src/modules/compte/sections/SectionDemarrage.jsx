import { st as fst } from '../../../components/ui/Fenetres.jsx';
import { ecrirePreference, usePreferences } from '../../../services/preferencesAppareil.js';
import { isPageActiveForEtab, navItems, peutOuvrirPage } from '../../moduleConfig.js';
import { Ligne, ui } from './reglagesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Démarrage » (Cet appareil) : la page qui s'ouvre au lancement de
// l'app. Par défaut, la dernière page visitée (comme avant). Seules les pages
// que la personne ouvre aujourd'hui sont proposées. Lue une fois au chargement
// (App.jsx, pageDeDemarrage) : un rechargement dans le même onglet et une
// notification touchée gardent leur page.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionDemarrage({ user, permissions, etablissement, shellMode = 'ordinateur' }) {
  const prefs = usePreferences();
  const pages = navItems.filter((item) => (
    peutOuvrirPage(item.id, user, permissions) && isPageActiveForEtab(etablissement, item.id)
  ));
  const options = [
    { id: 'derniere', label: 'La dernière page ouverte' },
    // La page d'accueil à gros boutons n'existe plus qu'au téléphone : la
    // tablette porte la barre latérale de tous les modules (26.11.2026).
    ...(shellMode === 'telephone' ? [{ id: 'accueil', label: "La page d'accueil" }] : []),
    ...pages.map((item) => ({ id: item.id, label: item.label })),
  ];
  // Une page choisie qui n'est plus ouverte à la personne (droit retiré,
  // module coupé) se lit comme « la dernière page ouverte ».
  const valeur = options.some((o) => o.id === prefs.demarrage) ? prefs.demarrage : 'derniere';

  return (
    <div style={ui.liste}>
      <Ligne colonne derniere titre="Ouvrir l'app sur" aide="Au lancement, sur cet appareil. Une notification touchée ouvre toujours sa page, et un rechargement garde la page en cours.">
        <select
          value={valeur}
          onChange={(e) => ecrirePreference('demarrage', e.target.value)}
          aria-label="Ouvrir l'app sur"
          style={{ ...fst.champ, maxWidth: 420 }}
        >
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </Ligne>
    </div>
  );
}
