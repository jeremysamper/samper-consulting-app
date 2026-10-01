#!/usr/bin/env node
// .claude/hooks/gate-commit.mjs
// Gate avant commit pour Claude Code (hook PreToolUse sur « git commit », outils Bash et PowerShell).
// Exit 2 = commit bloqué : le message (stderr) revient à Claude, qui corrige puis recommite.
// Contrôles, uniquement sur les fichiers du commit :
//   1. commit mixte SQL + front (règle maison, désactivable ci-dessous)
//   2. ESLint sur src/**/*.js|jsx (erreurs seulement) + contrôle des bordures si du JSX change
//   3. parité des glossaires EN/ES si l'un des deux change
//   4. routes Vercel api/ : parse esbuild (le build Vite ne les voit pas, une erreur partirait en prod)

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BLOQUER_COMMIT_MIXTE = false; // true = refuser SQL et front dans le même commit (CLAUDE.md, Commit messages : l'ordre protège la prod, pas le découpage)

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cmd = String(input?.tool_input?.command ?? JSON.stringify(input?.tool_input ?? '')); // Bash ou PowerShell
if (!/\bgit\b[^|;&\n]*\bcommit\b/.test(cmd)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
const run = (bin, args) =>
  spawnSync(bin, args, { cwd: root, env, encoding: 'utf8', timeout: 150_000, windowsHide: true });
const git = (...args) => run('git', args);
const sortie = (r) => `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();

// Fichiers du commit : l'index, plus ce que la commande ajoute elle-même (git add … puis commit, ou commit -a)
const fichiers = new Set();
const index = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z');
if (index.status !== 0) process.exit(0); // pas un dépôt lisible : on ne bloque pas
index.stdout.split('\0').filter(Boolean).forEach((f) => fichiers.add(f));

// Options lues hors du texte entre guillemets (un message « fix -a truc » ne doit pas compter comme -a)
const cmdSansTexte = cmd.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
const ajouteDesFichiers =
  /\bgit\s+add\b/.test(cmdSansTexte) || /\bcommit\b[^|;&\n]*\s(-[a-zA-Z]*a[a-zA-Z]*|--all)\b/.test(cmdSansTexte);
if (ajouteDesFichiers) {
  const parts = git('status', '--porcelain=v1', '-z', '-uall').stdout.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    const xy = e.slice(0, 2);
    if (xy[0] === 'R' || xy[0] === 'C') i++; // le chemin d'origine suit
    if (xy.includes('D')) continue;
    fichiers.add(e.slice(3));
  }
}
if (fichiers.size === 0) process.exit(0);

const liste = [...fichiers].map((f) => f.replace(/\\/g, '/'));
const existe = (f) => existsSync(join(root, f));
const problemes = [];

// 1. Commit mixte SQL + front
const sql = liste.filter((f) => /\.sql$/i.test(f));
const front = liste.filter(
  (f) => /^(src|api|components|public)\//.test(f) || /^(index\.html|vite-index\.html|vite\.config\.js|vercel\.json)$/.test(f),
);
if (BLOQUER_COMMIT_MIXTE && sql.length && front.length) {
  problemes.push(
    `Commit mixte SQL + front refusé (${sql.length} fichier(s) .sql, ${front.length} fichier(s) front).\n` +
      `Fais deux commits : d'abord les migrations seules (git add <fichiers .sql>, puis git commit), ensuite le front.\n` +
      `Rappel CLAUDE.md : la migration s'applique en prod AVANT de pousser le front qui en dépend.`,
  );
}

// 2. ESLint + bordures (= npm run lint, limité aux fichiers du commit)
const js = liste.filter((f) => /^src\/.*\.(js|jsx)$/.test(f) && existe(f));
if (js.length) {
  const eslint = join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (!existsSync(eslint)) {
    problemes.push('node_modules absent : impossible de linter. Lance `npm.cmd install` (ou `npm ci`) puis recommite.');
  } else {
    const r = run(process.execPath, [eslint, '--no-warn-ignored', ...js]);
    if (r.status !== 0) problemes.push(`ESLint (erreurs) sur les fichiers du commit :\n${sortie(r)}`);
    if (js.some((f) => f.endsWith('.jsx')) && existe('scripts/check-border-shorthand.mjs')) {
      const b = run(process.execPath, [join(root, 'scripts', 'check-border-shorthand.mjs')]);
      if (b.status !== 0) problemes.push(`lint:borders :\n${sortie(b)}`);
    }
  }
}

// 3. Parité des glossaires EN/ES
if (liste.some((f) => /^src\/i18n\/glossary(Es)?\.js$/.test(f)) && existe('scripts/check-glossary-parity.mjs')) {
  const g = run(process.execPath, [join(root, 'scripts', 'check-glossary-parity.mjs')]);
  if (g.status !== 0) problemes.push(`lint:glossary :\n${sortie(g)}`);
}

// 4. Routes Vercel api/ : elles doivent au moins parser
const api = liste.filter((f) => /^api\/.*\.(ts|js|mjs)$/.test(f) && existe(f));
if (api.length) {
  const main = join(root, 'node_modules', 'esbuild', 'lib', 'main.js');
  if (!existsSync(main)) {
    problemes.push('esbuild introuvable (node_modules absent) : routes api/ non vérifiables. Lance `npm.cmd install`.');
  } else {
    const mod = await import(pathToFileURL(main).href);
    const esbuild = mod.default ?? mod;
    for (const f of api) {
      try {
        await esbuild.transform(readFileSync(join(root, f), 'utf8'), {
          loader: extname(f) === '.ts' ? 'ts' : 'js',
          sourcefile: f,
        });
      } catch (e) {
        const detail =
          (e.errors || []).map((x) => `${f}:${x.location?.line ?? '?'}:${x.location?.column ?? '?'} ${x.text}`).join('\n') ||
          String(e.message);
        problemes.push(`Route Vercel qui ne parse pas (elle serait quand même déployée « READY ») :\n${detail}`);
      }
    }
  }
}

if (problemes.length) {
  process.stderr.write(`Gate pré-commit (.claude/hooks/gate-commit.mjs) : commit bloqué.\n\n${problemes.join('\n\n')}\n`);
  process.exit(2);
}
process.exit(0);
