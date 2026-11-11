// SAMPER CONSULTING - Edge Function : caisse-tpe
// Slug : caisse-tpe, verify_jwt = true
//
// Relie la caisse native à un terminal de paiement. Chemin unique : l'écran
// appelle cette fonction avec le jeton de la personne, la fonction parle au
// prestataire. Le navigateur ne parle jamais au terminal ni au prestataire.
//
// Sécurité :
//   - jeton vérifié par la passerelle, puis relu ici (auth.getUser) ;
//   - aucun droit décidé ici : chaque action passe par une fonction
//     caisse_tpe_* de la base, qui relit le rôle, la maison, le ticket, le
//     reste à payer et le plafond (migration 20261111_caisse_v9_tpe) ;
//   - la clé d'un terminal vit dans le coffre de la base ; elle est lue pour
//     un appel et n'est jamais rendue, ni écrite dans un journal ;
//   - aucune donnée de carte : tout résultat passe par listeBlanche.js ;
//   - CORS limité aux origines de l'app ; erreurs internes jamais renvoyées.
// Aucune variable d'environnement propre : les clés des prestataires ne sont
// pas des secrets de la fonction, elles appartiennent à chaque maison.
//
// POST { action, ... } :
//   prestataires
//   terminal_relier  { etablissement_id, prestataire, nom, numero_serie, secret, code }
//   terminal_retirer { terminal_id }
//   terminal_etat    { terminal_id }
//   demarrer         { ticket_id, terminal_id, montant, pourboire, reference }
//   statut           { transaction_id }
//   annuler          { transaction_id }
//   trancher         { transaction_id, decision, motif }
//   rembourser       { transaction_id }
// La fonction répond tout de suite ; l'écran redemande « statut » pendant que
// le client paie.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { enTetesCors } from '../_shared/cors.ts';
import { ADAPTATEURS } from './adaptateurs/index.js';
import { creerCoeur, gererRequete } from './coeur.js';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!;
const CLE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(URL_SUPABASE, CLE_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// Un appel à une fonction de la base. Son refus remonte avec son message et
// son code : le coeur sait lesquels vont à l'écran.
async function appeler(nom: string, args: Record<string, unknown>) {
  const { data, error } = await admin.rpc(nom, args);
  if (error) throw { name: 'ErreurBase', message: error.message, code: error.code };
  return data;
}

const db = {
  acces: (uid: string, etablissementId: string) =>
    appeler('caisse_tpe_acces', { p_uid: uid, p_etablissement_id: etablissementId }),
  terminalPoser: (uid: string, t: { etablissementId: string; prestataire: string; nom: string; numeroSerie: string; secret: string; cleFin: string | null }) =>
    appeler('caisse_tpe_terminal_poser', {
      p_uid: uid, p_etablissement_id: t.etablissementId, p_prestataire: t.prestataire, p_nom: t.nom,
      p_numero_serie: t.numeroSerie, p_secret: t.secret, p_cle_fin: t.cleFin,
    }),
  terminalRetirer: (uid: string, terminalId: string) =>
    appeler('caisse_tpe_terminal_retirer', { p_uid: uid, p_terminal_id: terminalId }),
  terminalSecret: (uid: string, terminalId: string) =>
    appeler('caisse_tpe_terminal_secret', { p_uid: uid, p_terminal_id: terminalId }),
  demarrer: (uid: string, d: { ticketId: string; terminalId: string; montant: number; pourboire: number; reference: string; devise: string }) =>
    appeler('caisse_tpe_demarrer', {
      p_uid: uid, p_ticket_id: d.ticketId, p_terminal_id: d.terminalId, p_montant: d.montant,
      p_pourboire: d.pourboire, p_reference: d.reference, p_devise: d.devise,
    }),
  noter: (transactionId: string, statut: string, champs: Record<string, unknown>) =>
    appeler('caisse_tpe_noter', { p_transaction_id: transactionId, p_statut: statut, p_champs: champs }),
  lire: (uid: string, transactionId: string) =>
    appeler('caisse_tpe_lire', { p_uid: uid, p_transaction_id: transactionId }),
  trancher: (uid: string, transactionId: string, decision: string, motif: string) =>
    appeler('caisse_tpe_trancher', { p_uid: uid, p_transaction_id: transactionId, p_decision: decision, p_motif: motif }),
  rembourserDemander: (uid: string, transactionId: string) =>
    appeler('caisse_tpe_rembourser_demander', { p_uid: uid, p_transaction_id: transactionId }),
  rembourserNoter: (transactionId: string, fait: boolean, genre: string | null, message: string | null) =>
    appeler('caisse_tpe_rembourser_noter', { p_transaction_id: transactionId, p_fait: fait, p_genre: genre, p_message: message }),
};

// Le journal de la fonction : un nom d'événement et des champs choisis par le
// coeur (identifiants, statuts). Jamais une clé, jamais une réponse brute.
const journal = (evenement: string, details: Record<string, unknown>) =>
  console.log(`[caisse-tpe] ${evenement} ${JSON.stringify(details)}`);

const coeur = creerCoeur({ db, adaptateurs: ADAPTATEURS, journal });

async function lireUtilisateur(autorisation: string): Promise<string | null> {
  const client = createClient(URL_SUPABASE, CLE_ANON, {
    global: { headers: { Authorization: autorisation } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await client.auth.getUser();
  return data?.user?.id ?? null;
}

Deno.serve(async (req) => {
  const cors = enTetesCors(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let corps: unknown = null;
  if (req.method === 'POST') {
    try { corps = await req.json(); } catch { corps = null; }
  }
  const reponse = await gererRequete(
    { methode: req.method, autorisation: req.headers.get('Authorization'), corps },
    { coeur, lireUtilisateur },
  );
  return new Response(JSON.stringify(reponse.corps), {
    status: reponse.statut,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});
