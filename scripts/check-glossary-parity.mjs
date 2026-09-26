// ─────────────────────────────────────────────────────────────────────────────
// Parité des glossaires de traduction (src/i18n/glossary.js ↔ glossaryEs.js).
//
// Les deux tables sont indexées sur la même chaîne française. Une clé présente
// dans une seule d'entre elles ne casse rien, mais la chaîne part à l'IA dans
// l'autre langue : plus lente, en ligne seulement, et payante à chaque
// établissement. D'où ce contrôle, branché sur `npm run lint`.
//
// Usage : npm run lint:glossary
// Sortie non nulle si une clé manque d'un côté ou si une traduction est vide.
// ─────────────────────────────────────────────────────────────────────────────
import { UI_GLOSSARY } from '../src/i18n/glossary.js';
import { UI_GLOSSARY_ES } from '../src/i18n/glossaryEs.js';

const tables = { en: UI_GLOSSARY, es: UI_GLOSSARY_ES };
const problems = [];

const keys = (t) => new Set(Object.keys(t));
const en = keys(UI_GLOSSARY);
const es = keys(UI_GLOSSARY_ES);

for (const k of en) if (!es.has(k)) problems.push(`glossaryEs.js : clé manquante ${JSON.stringify(k)}`);
for (const k of es) if (!en.has(k)) problems.push(`glossary.js : clé manquante ${JSON.stringify(k)}`);

for (const [lang, table] of Object.entries(tables)) {
  for (const [k, v] of Object.entries(table)) {
    if (typeof v !== 'string' || !v.trim()) problems.push(`${lang} : traduction vide pour ${JSON.stringify(k)}`);
  }
}

if (problems.length) {
  console.error(`Glossaires désalignés (${problems.length}) :`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Glossaires alignés : ${en.size} clés en anglais et en espagnol.`);
