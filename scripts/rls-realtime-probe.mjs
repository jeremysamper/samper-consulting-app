// ─────────────────────────────────────────────────────────────────────────────
// Sonde Realtime RLS multi-tenant.
//
// Vérifie EMPIRIQUEMENT, sur le canal postgres_changes, qu'un abonné ne reçoit
// que les events de son périmètre. Realtime applique la politique SELECT de la
// table avec le token de l'abonné : c'est le MÊME verrou que REST, on le prouve.
//
// Usage :
//   SB_URL=https://<ref>.supabase.co \
//   SB_KEY=<anon key>            # identité de l'abonné : anon (aucun user)…
//   [SB_TOKEN=<access_token>]    # …ou un access_token user (ex. patron A) pour
//                                 # le test d'acceptation authentifié
//   [TABLES=etablissements,profiles] [RUN_MS=15000] \
//   node scripts/rls-realtime-probe.mjs
//
// Le script est en LECTURE SEULE. Pour générer un event, faire une écriture
// contrôlée sur un établissement B pendant qu'il tourne (ex. touch updated_at),
// puis la réverter. Attendu après correctif : abonné anon ou hors-périmètre =>
// 0 event etablissements/profiles étranger.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SB_URL;
const KEY = process.env.SB_KEY;
const TOKEN = process.env.SB_TOKEN || null;
const TABLES = (process.env.TABLES || 'etablissements,profiles').split(',').map(s => s.trim()).filter(Boolean);
const RUN_MS = Number(process.env.RUN_MS || 15000);

if (!URL || !KEY) { console.error('SB_URL et SB_KEY requis'); process.exit(2); }

const sb = createClient(URL, KEY, {
  realtime: { params: { eventsPerSecond: 20 } },
  global: TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : undefined,
});
// Realtime authorise le canal avec ce token (sinon anon).
if (TOKEN) sb.realtime.setAuth(TOKEN);

const received = [];
const ts = () => new Date().toISOString().slice(11, 23);
const log = (...a) => console.log(ts(), ...a);

let ch = sb.channel('rls-probe-' + Date.now());
for (const table of TABLES) {
  ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
    const row = p.new && Object.keys(p.new).length ? p.new : p.old;
    const rec = { table, type: p.eventType, id: row?.id, etablissement_id: row?.etablissement_id ?? row?.etablissement_ids };
    received.push(rec);
    log('EVENT', table, p.eventType, JSON.stringify(rec));
  });
}
ch.subscribe((status, err) => log('STATUS', status, err ? String(err) : ''));

log(`Sonde démarrée — identité=${TOKEN ? 'user(token)' : 'anon'} tables=${TABLES.join(',')} durée=${RUN_MS}ms`);
setTimeout(async () => {
  log('DONE — events reçus =', received.length);
  console.log('RESULT_JSON', JSON.stringify(received));
  try { await sb.removeChannel(ch); } catch {}
  process.exit(0);
}, RUN_MS);
