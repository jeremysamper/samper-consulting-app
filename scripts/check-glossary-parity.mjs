// ─────────────────────────────────────────────────────────────────────────────
// Parité des glossaires de traduction (src/i18n/glossary.js ↔ glossaryEs.js).
//
// Les deux tables sont indexées sur la même chaîne française. Une clé présente
// dans une seule d'entre elles ne casse rien, mais la chaîne part à l'IA dans
// l'autre langue : plus lente, en ligne seulement, et payante à chaque
// établissement. D'où ce contrôle, branché sur `npm run lint`.
//
// Les clés sont indexées sur leur cœur, ponctuation d'entourage retirée comme
// le moteur la retire du texte affiché (glossaryEntryCore). Une clé ponctuée
// est donc normalisée d'office ; restent deux cas que l'indexation ne peut pas
// trancher seule, contrôlés ici :
//   · deux clés de même cœur (« Chargement » et « Chargement… ») traduites
//     différemment : une seule des deux peut s'afficher ;
//   · une clé ou une traduction réduite à de la ponctuation : rien à indexer.
//
// Usage : npm run lint:glossary
// Sortie non nulle si une clé manque d'un côté, si une traduction est vide ou
// si l'un des deux cas ci-dessus se présente.
// ─────────────────────────────────────────────────────────────────────────────
import { UI_GLOSSARY, glossaryEntryCore } from '../src/i18n/glossary.js';
import { UI_GLOSSARY_ES } from '../src/i18n/glossaryEs.js';

const tables = { en: UI_GLOSSARY, es: UI_GLOSSARY_ES };
const problems = [];

const keys = (t) => new Set(Object.keys(t));
const en = keys(UI_GLOSSARY);
const es = keys(UI_GLOSSARY_ES);

for (const k of en) if (!es.has(k)) problems.push(`glossaryEs.js : clé manquante ${JSON.stringify(k)}`);
for (const k of es) if (!en.has(k)) problems.push(`glossary.js : clé manquante ${JSON.stringify(k)}`);

let ponctuees = 0;
for (const [lang, table] of Object.entries(tables)) {
  const parCoeur = new Map();   // cœur → [clé, traduction indexée]
  for (const [k, v] of Object.entries(table)) {
    if (typeof v !== 'string' || !v.trim()) {
      problems.push(`${lang} : traduction vide pour ${JSON.stringify(k)}`);
      continue;
    }
    const { core, out } = glossaryEntryCore(k, v);
    if (core !== k && lang === 'en') ponctuees += 1;
    if (!core) {
      problems.push(`${lang} : la clé ${JSON.stringify(k)} n'a ni lettre ni chiffre, aucun texte affiché ne peut l'atteindre`);
      continue;
    }
    if (!out) {
      problems.push(`${lang} : ${JSON.stringify(v)} (clé ${JSON.stringify(k)}) ne garde rien une fois la ponctuation de la clé retirée`);
      continue;
    }
    const deja = parCoeur.get(core);
    if (!deja) { parCoeur.set(core, [k, out]); continue; }
    if (deja[1] !== out) {
      problems.push(
        `${lang} : ${JSON.stringify(deja[0])} et ${JSON.stringify(k)} s'affichent tous deux ${JSON.stringify(core)} `
        + `une fois la ponctuation retirée, mais se traduisent ${JSON.stringify(deja[1])} et ${JSON.stringify(out)} : `
        + 'une seule des deux traductions peut sortir, aligner les deux ou supprimer la clé ponctuée',
      );
    }
  }
}

if (problems.length) {
  console.error(`Glossaires désalignés (${problems.length}) :`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Glossaires alignés : ${en.size} clés en anglais et en espagnol (dont ${ponctuees} ponctuées, indexées sur leur cœur).`);
