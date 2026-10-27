import Inventaire from '../inventaire/Inventaire.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// FACTURES & ACHATS : livraisons et factures reçues, vérification de la
// lecture, règlement, échéances et analyses des dépenses.
//
// Le module monte le composant de l'Inventaire en vue « achats » : un seul
// propriétaire de l'état (inventaires, documents, rapprochement des lignes,
// prix reportés), si bien que les écarts, l'état d'inventaire exporté et les
// prix restent calculés par le même code. Seuls changent l'accueil (tuiles)
// et la mémoire d'écran (sc_achats_ecran). Droits : ceux de l'Inventaire
// (clé inventaire, moduleConfig), le règlement et les échéances derrière
// « Régler les factures » (factures_achat).
// ─────────────────────────────────────────────────────────────────────────────

export default function FacturesAchats(props) {
  return <Inventaire {...props} vue="achats" />;
}
