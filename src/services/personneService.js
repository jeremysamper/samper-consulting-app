import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Export et effacement des données d'une personne (lot SI3).
//
// Deux RPC en base (migration 20261104_export_effacement_personne) :
//   export_personne(p_type, p_client_id)  : toutes les données du client en JSON ;
//   effacer_personne(p_type, p_client_id) : anonymise (le nom devient
//     « Client effacé », contact, notes et données de santé vidés), les lignes
//     et les statistiques restent.
// p_type : 'spa' (spa_clients) ou 'resa' (resa_clients).
// La base refuse tout appelant qui n'est pas consultant ou patron actif de
// l'établissement du client ; l'écran ne montre les boutons qu'à ces rôles.
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGES = {
  ACCES_REFUSE: 'Action réservée au consultant et au patron de l\'établissement.',
  CLIENT_INTROUVABLE: 'Fiche introuvable sur vos établissements.',
  TYPE_INCONNU: 'Type de fiche inconnu.',
  EFFACEMENT_INCOMPLET: 'L\'effacement n\'a pas abouti : la fiche n\'a pas été modifiée.',
};

function messageRpc(error) {
  if (!error) return null;
  console.error('[personne] erreur RPC', error);
  const brut = String(error.message || '');
  const code = Object.keys(MESSAGES).find((c) => brut.includes(c));
  return code ? MESSAGES[code] : 'Erreur technique. Réessaie ou contacte le support.';
}

async function appelerRpc(nom, type, clientId) {
  const { data, error } = await supabase.rpc(nom, { p_type: type, p_client_id: clientId });
  return { data: error ? null : data, error: messageRpc(error) };
}

export const exporterPersonne = (type, clientId) => appelerRpc('export_personne', type, clientId);
export const effacerPersonne = (type, clientId) => appelerRpc('effacer_personne', type, clientId);

// Dépose l'export en fichier JSON. Nom de fichier neutre (date, pas de nom de
// personne) : il atterrit dans les téléchargements, souvent synchronisés.
export function telechargerExport(data, type) {
  const jour = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export-client-${type}-${jour}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Texte de confirmation commun aux deux fiches : le geste ne se défait pas.
export function confirmationEffacement(nom) {
  return `Effacer les données de ${nom} ?\n\n`
    + 'Le nom devient « Client effacé » ; coordonnées, notes et données de santé sont vidées '
    + 'sur la fiche et sur ses lignes rattachées (rendez-vous, séances et bons, ou réservations et séjours). '
    + 'Les lignes et les statistiques restent.\n\n'
    + 'Ce geste répond à une demande d\'effacement et ne se défait pas.';
}
