#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Agent d'impression des étiquettes DLC
//
// Tourne sur une machine allumée sur le réseau du restaurant (Raspberry Pi,
// mini-PC, n'importe quel Linux). Récupère les lots déposés par l'app et les
// envoie à l'imprimante d'étiquettes.
//
// Pourquoi un agent : un iPad ne peut pas parler à une imprimante réseau. Pas
// de socket TCP en JavaScript, IPP bloqué par le contenu mixte et CORS, et le
// Bluetooth de la QL-820NWB est du 2.1 classique, hors de portée de Web
// Bluetooth. L'agent est le seul chemin.
//
// Sens de circulation : l'agent VIENT chercher le travail. Aucun port ouvert
// sur le réseau du restaurant, aucun certificat, l'imprimante n'est jamais
// exposée sur internet.
//
// Impression déléguée à CUPS (commande `lp`) et non à un dialogue IPP maison :
// CUPS convertit le PDF au format que réclame l'imprimante. Une imprimante
// AirPrint n'est pas tenue d'accepter un PDF brut en IPP - elle peut n'accepter
// que du raster - et cette conversion, on ne va pas la réécrire ici.
//
// Aucune dépendance npm : Node 18+ (fetch natif) et CUPS suffisent.
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ─── Configuration ──────────────────────────────────────────────────────────
const cfg = {
  url: process.env.PRINT_AGENT_URL || '',
  token: process.env.PRINT_AGENT_TOKEN || '',
  queue: process.env.PRINT_QUEUE || '',
  lpOptions: (process.env.LP_OPTIONS || '').trim(),
  pollMs: Math.max(1000, Number(process.env.POLL_MS || 2000)),
};

const manquants = ['url', 'token', 'queue'].filter((k) => !cfg[k]);
if (manquants.length) {
  console.error(
    'Configuration incomplète. Variables requises : PRINT_AGENT_URL, PRINT_AGENT_TOKEN, PRINT_QUEUE.\n' +
    'Manquant : ' + manquants.map((k) => k.toUpperCase()).join(', '),
  );
  process.exit(1);
}

const horodate = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${horodate()}]`, ...a);
const erreur = (...a) => console.error(`[${horodate()}]`, ...a);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Guichet distant ────────────────────────────────────────────────────────
async function appeler(payload) {
  const rep = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const texte = await rep.text();
  let data = null;
  try { data = texte ? JSON.parse(texte) : null; } catch { /* réponse non JSON */ }
  if (!rep.ok) {
    const e = new Error(data?.error || `HTTP ${rep.status}`);
    e.status = rep.status;
    throw e;
  }
  return data || {};
}

// ─── Impression ─────────────────────────────────────────────────────────────
function lancerLp(fichier) {
  // Sans options, CUPS utilise le media chargé dans l'imprimante : sur une QL,
  // c'est précisément le rouleau en place, donc le bon format. On ne force une
  // taille que si LP_OPTIONS le demande explicitement.
  const args = ['-d', cfg.queue];
  if (cfg.lpOptions) {
    for (const opt of cfg.lpOptions.split(/\s+/).filter(Boolean)) args.push('-o', opt);
  }
  args.push(fichier);
  return new Promise((resolve, reject) => {
    execFile('lp', args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').trim() || 'lp a échoué'));
      else resolve((stdout || '').trim());
    });
  });
}

async function imprimer(job) {
  const fichier = path.join(os.tmpdir(), `etiquettes-${job.id}.pdf`);
  fs.writeFileSync(fichier, Buffer.from(job.pdfBase64, 'base64'));
  try {
    const sortie = await lancerLp(fichier);
    log(`lot ${job.id} : ${job.nbEtiquettes} étiquette(s) envoyée(s) [${job.mode || 'frais'}] ${sortie}`);
    await appeler({ action: 'done', jobId: job.id, ok: true });
  } catch (e) {
    erreur(`lot ${job.id} : échec de l'impression -`, e.message);
    // On signale l'échec au serveur : un lot laissé « en_cours » resterait
    // invisible pour la brigade, qui croirait ses étiquettes parties.
    await appeler({ action: 'done', jobId: job.id, ok: false, erreur: e.message })
      .catch((e2) => erreur('impossible de signaler l\'échec :', e2.message));
  } finally {
    try { fs.unlinkSync(fichier); } catch { /* déjà nettoyé */ }
  }
}

// ─── Vérification de la file CUPS au démarrage ──────────────────────────────
// Mieux vaut refuser de démarrer que découvrir la file absente au premier
// service, quand quelqu'un attend ses étiquettes.
function verifierFile() {
  return new Promise((resolve) => {
    execFile('lpstat', ['-p', cfg.queue], { timeout: 10000 }, (err, stdout) => {
      if (err) {
        erreur(`File d'impression « ${cfg.queue} » introuvable dans CUPS.`);
        erreur('Files disponibles : lpstat -p   |   ajout : voir le README.');
        resolve(false);
      } else {
        log((stdout || '').trim() || `file « ${cfg.queue} » prête`);
        resolve(true);
      }
    });
  });
}

// ─── Boucle principale ──────────────────────────────────────────────────────
async function boucle() {
  let echecsConsecutifs = 0;
  for (;;) {
    try {
      const { job } = await appeler({ action: 'next', imprimante: cfg.queue });
      echecsConsecutifs = 0;
      if (job) {
        await imprimer(job);
        continue; // enchaîner sans attendre : la file peut contenir un autre lot
      }
    } catch (e) {
      echecsConsecutifs += 1;
      if (e.status === 401) {
        erreur('Jeton refusé : agent inconnu ou désactivé. Arrêt.');
        process.exit(1);
      }
      // Coupure réseau : on ralentit progressivement plutôt que de marteler,
      // sans jamais abandonner - le service reprendra tout seul au retour.
      const attente = Math.min(60000, 2000 * 2 ** Math.min(echecsConsecutifs, 5));
      erreur(`relève impossible (${e.message}), nouvel essai dans ${Math.round(attente / 1000)}s`);
      await dormir(attente);
      continue;
    }
    await dormir(cfg.pollMs);
  }
}

(async () => {
  log(`Agent d'impression démarré · file CUPS « ${cfg.queue} » · relève toutes les ${cfg.pollMs} ms`);
  if (!await verifierFile()) process.exit(1);
  try {
    const pong = await appeler({ action: 'ping', imprimante: cfg.queue });
    log(`Enregistré : agent « ${pong.agent} » pour l'établissement ${pong.etablissement}`);
  } catch (e) {
    erreur('Impossible de joindre le serveur au démarrage :', e.message);
    if (e.status === 401) process.exit(1);
  }
  await boucle();
})();

process.on('SIGTERM', () => { log('Arrêt demandé.'); process.exit(0); });
process.on('SIGINT', () => { log('Arrêt demandé.'); process.exit(0); });
