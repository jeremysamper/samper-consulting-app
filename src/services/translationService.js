// ════════════════════════════════════════════════════════════════
// translationService - traduction FR → EN d'un lot de chaînes.
//
// Utilisé par le moteur de traduction à la volée (src/i18n/domTranslator.js)
// pour tout ce que le glossaire statique ne couvre pas : contenu saisi par les
// équipes (recettes, étapes, notes, libellés personnalisés…).
//
// Le tableau renvoyé a la même longueur et le même ordre que l'entrée. Une
// entrée que l'IA n'a pas su traduire vaut `null` : l'appelant la laisse en
// français et pourra réessayer, plutôt que de mettre en cache un faux positif.
//
// Si l'IA renvoie un nombre d'éléments différent de l'entrée, TOUT le lot est
// rejeté : un décalage d'un cran collerait des libellés sur les mauvais
// écrans, ce qui est pire qu'une absence de traduction.
// ════════════════════════════════════════════════════════════════
import { callAiProxy } from './aiProxy.js';

export async function translateTexts(texts) {
  const list = (texts || []).map((s) => String(s || '')).filter(Boolean);
  if (!list.length) return [];

  const data = await callAiProxy('translate', { texts: list, target: 'en' });
  const raw = (data && data.result && data.result.t) || [];

  if (!Array.isArray(raw) || raw.length !== list.length) {
    throw new Error(`Traduction désalignée : ${raw.length} réponses pour ${list.length} entrées.`);
  }

  return list.map((source, i) => {
    const out = raw[i];
    if (typeof out !== 'string' || !out.trim()) return null;
    return out.trim();
  });
}

export default translateTexts;
