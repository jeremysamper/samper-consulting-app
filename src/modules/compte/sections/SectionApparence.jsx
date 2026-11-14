import Interrupteur from '../../roles/Interrupteur.jsx';
import { Btn } from '../../../components/ui/index.jsx';
import { useTheme } from '../../../hooks/useTheme.js';
import { APPARENCE, ecrirePreference, reinitialiserPreferences, usePreferences } from '../../../services/preferencesAppareil.js';
import { ChoixPilules, Ligne, ui } from './reglagesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Apparence » (Cet appareil) : thème, taille du texte, densité,
// couleur des actions, animations, contraste. Tout vaut pour cet appareil et
// s'applique tout de suite, à toute l'app (services/preferencesAppareil.js,
// règles « Préférences de l'appareil » d'app.css).
//
// Le thème garde son bouton dans la barre du haut : même état (useTheme), les
// deux endroits sont toujours d'accord. Le bouton bascule entre clair et
// sombre ; « Comme l'appareil » ne se choisit qu'ici.
// ─────────────────────────────────────────────────────────────────────────────

const THEMES = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
  { id: 'system', label: "Comme l'appareil" },
];

const TAILLES = [
  { id: 'petite', label: 'Petite' },
  { id: 'normale', label: 'Normale' },
  { id: 'grande', label: 'Grande' },
  { id: 'tres-grande', label: 'Très grande' },
];

const DENSITES = [
  { id: 'compacte', label: 'Compacte' },
  { id: 'normale', label: 'Normale' },
  { id: 'aeree', label: 'Aérée' },
];

const TEINTES = [
  { id: 'petrole', label: 'Pétrole' },
  { id: 'bleu', label: 'Bleu' },
  { id: 'vert', label: 'Vert sapin' },
  { id: 'brique', label: 'Brique' },
  { id: 'prune', label: 'Prune' },
  { id: 'graphite', label: 'Graphite' },
];

export default function SectionApparence({ shellMode = 'ordinateur' }) {
  const { preference, setTheme } = useTheme();
  const prefs = usePreferences();
  // Compacte descend sous la cible de 44 px : proposée à la souris seulement
  // (la feuille ne l'applique qu'à un pointeur fin).
  const densites = shellMode === 'ordinateur' || prefs.densite === 'compacte'
    ? DENSITES
    : DENSITES.filter((d) => d.id !== 'compacte');
  const teinte = TEINTES.find((t) => t.id === prefs.accent) || TEINTES[0];

  const reinitialiser = () => {
    setTheme('system');
    reinitialiserPreferences(APPARENCE);
  };

  return (
    <div style={ui.liste}>
      <Ligne colonne titre="Thème" aide="Comme l'appareil suit le réglage clair ou sombre du téléphone, de la tablette ou de l'ordinateur. Le bouton de la barre du haut bascule entre clair et sombre.">
        <ChoixPilules label="Thème" valeur={preference} options={THEMES} onChange={setTheme} />
      </Ligne>
      <Ligne colonne titre="Taille du texte" aide="Le texte de l'app sur cet appareil. Les exports PDF ne changent pas.">
        <ChoixPilules label="Taille du texte" valeur={prefs.texte} options={TAILLES} onChange={(v) => ecrirePreference('texte', v)} />
      </Ligne>
      <Ligne colonne titre="Densité" aide="Hauteur des lignes, des boutons et des champs, et marges de la page. Compacte se règle à la souris : au doigt, chaque cible garde 44 px.">
        <ChoixPilules label="Densité" valeur={prefs.densite} options={densites} onChange={(v) => ecrirePreference('densite', v)} />
      </Ligne>
      <Ligne colonne titre="Couleur des actions" aide="Le bouton principal, la pilule choisie et l'entrée choisie du menu. Pétrole est la couleur de la marque.">
        <div style={st.teintes}>
          <div role="radiogroup" aria-label="Couleur des actions" style={st.pastilles}>
            {TEINTES.map((t) => {
              const choisie = t.id === prefs.accent;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={choisie}
                  aria-label={t.label}
                  title={t.label}
                  onClick={() => ecrirePreference('accent', t.id)}
                  style={st.cible}
                >
                  <span
                    className="pref-teinte"
                    data-teinte={t.id}
                    aria-hidden="true"
                    style={{ ...st.pastille, ...(choisie ? st.pastilleChoisie : null) }}
                  />
                </button>
              );
            })}
          </div>
          <span style={st.nomTeinte}>{teinte.label}</span>
        </div>
      </Ligne>
      <Ligne titre="Réduire les animations" aide="Plus de fondus ni de glissements : les écrans changent d'un coup.">
        <Interrupteur
          checked={prefs.mouvement === 'reduit'}
          onChange={() => ecrirePreference('mouvement', prefs.mouvement === 'reduit' ? 'normal' : 'reduit')}
          label="Réduire les animations"
        />
      </Ligne>
      <Ligne derniere titre="Contraste renforcé" aide="Textes secondaires plus foncés, filets et contours plus marqués.">
        <Interrupteur
          checked={prefs.contraste === 'renforce'}
          onChange={() => ecrirePreference('contraste', prefs.contraste === 'renforce' ? 'normal' : 'renforce')}
          label="Contraste renforcé"
        />
      </Ligne>
      <div style={ui.pied}>
        <Btn variant="ghost" onClick={reinitialiser} style={ui.btn44}>Réinitialiser l'apparence</Btn>
      </div>
    </div>
  );
}

const st = {
  teintes: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  pastilles: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  // Une pastille de 30 px dans une cible de 44 px.
  cible: {
    width: 44, height: 44, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', borderWidth: 0, borderStyle: 'none', borderRadius: 'var(--r-full)', cursor: 'pointer',
  },
  pastille: { display: 'block', width: 30, height: 30, borderRadius: 'var(--r-full)' },
  pastilleChoisie: { outline: '2px solid var(--text)', outlineOffset: 3 },
  nomTeinte: { fontSize: 'var(--t2)', color: 'var(--text2)' },
};
