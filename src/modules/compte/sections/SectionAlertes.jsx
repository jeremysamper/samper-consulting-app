import AlertRules from '../../consultant-tools/AlertRules.jsx';

// Section « Alertes » : l'écran d'origine, tel quel.
export default function SectionAlertes({ user, etablissement }) {
  return <AlertRules user={user} etablissement={etablissement} />;
}
