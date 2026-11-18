import LanguageToggle from '../../../components/LanguageToggle.jsx';
import { Ligne, ui } from './reglagesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Langue » (Cet appareil) : la langue d'affichage. Le sélecteur de la
// barre du haut reste, comme raccourci : même valeur stockée (sc_lang), même
// état (useLanguage), les deux endroits sont toujours d'accord.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionLangue({ etablissement }) {
  return (
    <div style={ui.liste}>
      <Ligne derniere titre="Langue d'affichage" aide="Original garde le texte tel qu'il a été saisi. English, Español et Deutsch traduisent l'écran, pas les données. Le sélecteur de la barre du haut fait la même chose.">
        <LanguageToggle etablissementId={etablissement?.id || null} />
      </Ligne>
    </div>
  );
}
