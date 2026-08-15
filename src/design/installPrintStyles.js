// ─────────────────────────────────────────────────────────────────────────────
// Feuille de style d'impression du navigateur, posée une fois au démarrage.
//
// Les boutons d'export passent par pdfUtils, qui écrit sa propre feuille dans
// la fenêtre d'impression. Reste le Ctrl+P sur l'app : sans ce module il
// sortirait dans la typographie de l'écran. On l'injecte depuis le JS plutôt
// que de l'écrire dans app.css pour que brandTokens.js reste le seul endroit
// où une couleur ou une famille est déclarée pour une page imprimée.
//
// Les @font-face accompagnent la feuille : une règle qui demande Lora sans que
// le fichier soit déclaré rend en police de substitution.
// ─────────────────────────────────────────────────────────────────────────────

import { BROWSER_PRINT_CSS, PRINT_FONT_FACES } from './brandTokens.js';

const ID = 'sc-brand-print-styles';

export function installBrandPrintStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc?.head || doc.getElementById(ID)) return;
  const style = doc.createElement('style');
  style.id = ID;
  style.textContent = PRINT_FONT_FACES + BROWSER_PRINT_CSS;
  doc.head.appendChild(style);
}
