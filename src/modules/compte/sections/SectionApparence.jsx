import Interrupteur from '../../roles/Interrupteur.jsx';
import LanguageToggle from '../../../components/LanguageToggle.jsx';
import { useTheme } from '../../../hooks/useTheme.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Apparence et langue » : le mode clair ou sombre et la langue
// d'affichage, pour cet appareil. Les sélecteurs de la barre du haut restent,
// comme raccourcis : même valeur stockée (sc_theme, sc_lang), même état
// (useTheme, useLanguage), les deux endroits sont toujours d'accord.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionApparence({ etablissement }) {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div style={st.liste}>
      <div style={st.ligne}>
        <div style={st.texte}>
          <div style={st.titre}>Mode sombre</div>
          <div style={st.aide}>Sur cet appareil. Le bouton de la barre du haut fait la même chose.</div>
        </div>
        <Interrupteur checked={isDark} onChange={toggleTheme} label="Mode sombre" />
      </div>
      <div style={st.ligne}>
        <div style={st.texte}>
          <div style={st.titre}>Langue d'affichage</div>
          <div style={st.aide}>Original garde le texte tel qu'il a été saisi. English et Español traduisent l'écran, pas les données.</div>
        </div>
        <LanguageToggle etablissementId={etablissement?.id || null} />
      </div>
    </div>
  );
}

const st = {
  liste: { display: 'flex', flexDirection: 'column', maxWidth: 640 },
  ligne: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    padding: '14px 0', borderBottom: '1px solid var(--border)', minWidth: 0,
  },
  texte: { flex: '1 1 240px', minWidth: 0 },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  aide: { fontSize: 'var(--t2)', color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 },
};
