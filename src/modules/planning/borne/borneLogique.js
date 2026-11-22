// ─────────────────────────────────────────────────────────────────────────────
// Badgeuse sur une borne déclarée (lot L6, 22.11.2026) : la partie pure.
// Sans React ni base : l'écran de la borne (Borne.jsx), les réglages, le
// compte et les tests (borneLogique.test.mjs) l'importent.
//
// La base décide de tout (fonction pointer_borne) : arrivée ou départ, heure
// du serveur, code, attente après 5 codes faux. Ici, on traduit seulement sa
// réponse en phrases, on tient le pavé et la file hors ligne de la borne.
// ─────────────────────────────────────────────────────────────────────────────

export const LONGUEUR_CODE = 4;

// Le message que montre l'app quand le pointage se fait à la borne. C'est le
// même texte que la base renvoie (raise exception ... hint 'borne_seulement').
export const MESSAGE_BORNE = "Le pointage se fait à la borne de l'établissement.";

// Refus de la base pour cause de borne seulement (pointer_arrivee,
// pointer_depart, pointer_hors_planning, pointer_offline).
export function estRefusBorne(err) {
  if (!err) return false;
  if (err.hint === 'borne_seulement') return true;
  return /borne de l.établissement/.test(String(err.message || err));
}

// ── Pavé ─────────────────────────────────────────────────────────────────────

// Un chiffre de plus, sans dépasser la longueur du code.
export function ajouterChiffre(code, chiffre) {
  const c = String(code || '');
  if (!/^[0-9]$/.test(String(chiffre)) || c.length >= LONGUEUR_CODE) return c;
  return c + chiffre;
}

export const retirerChiffre = (code) => String(code || '').slice(0, -1);
export const codeComplet = (code) => /^[0-9]{4}$/.test(String(code || ''));

// ── Réponse de pointer_borne ─────────────────────────────────────────────────

const nomComplet = (r) => [r?.prenom, r?.nom].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

const minutes = (secondes) => Math.max(1, Math.ceil(Number(secondes || 0) / 60));

// La réponse de la base (ou d'un échec réseau) en ce que l'écran affiche :
//   ton     'succes' | 'info' | 'erreur'
//   nom     la personne qui vient de pointer (seule donnée de l'équipe montrée)
//   titre   la ligne en grand ; heure : l'heure retenue par le serveur
//   detail  la phrase dessous, sans chiffre (traduite par le glossaire) ;
//   valeur  le chiffre qui la suit (essais, minutes), jamais traduit
//   oublier vrai quand la borne n'est plus reconnue (jeton à effacer)
export function lireReponse(r) {
  if (!r || typeof r !== 'object') {
    return { ton: 'erreur', titre: 'Pointage non enregistré', detail: 'Réessayez dans un instant.' };
  }
  const nom = nomComplet(r);
  const heure = typeof r.heure === 'string' ? r.heure : '';
  if (r.ok && (r.raison === 'arrivee' || r.raison === 'depart')) {
    const arrivee = r.raison === 'arrivee';
    return {
      ton: 'succes',
      nom,
      heure,
      titre: arrivee ? 'Arrivée enregistrée' : 'Départ enregistré',
      detail: arrivee ? (r.hors_planning ? 'Elle est ajoutée au planning.' : '') : 'Bonne fin de journée.',
    };
  }
  if (r.ok && r.raison === 'deja') {
    if (r.doublon && !r.type) return { ton: 'info', nom, heure, titre: 'Pointage déjà enregistré', detail: '' };
    return { ton: 'info', nom, heure, titre: r.type === 'depart' ? 'Départ déjà enregistré' : 'Arrivée déjà enregistrée', detail: '' };
  }
  switch (r.raison) {
    case 'code_faux': {
      const n = Number(r.restants);
      return Number.isFinite(n) && n > 0
        ? { ton: 'erreur', titre: 'Code inconnu', detail: 'Essais restants avant une pause :', valeur: String(n) }
        : { ton: 'erreur', titre: 'Code inconnu', detail: 'La borne attend maintenant quelques minutes.' };
    }
    case 'attente':
      return { ton: 'erreur', titre: "Trop d'essais", detail: 'Réessayez dans', valeur: `${minutes(r.secondes)} min`, attenteSecondes: Number(r.secondes) || 300 };
    case 'revoquee':
      return { ton: 'erreur', titre: 'Cette borne a été révoquée', detail: "Demandez à la direction de déclarer à nouveau l'appareil.", oublier: true };
    case 'borne_inconnue':
      return { ton: 'erreur', titre: "Cette borne n'est plus reconnue", detail: "Demandez à la direction de déclarer à nouveau l'appareil.", oublier: true };
    case 'hors_fenetre':
      return { ton: 'erreur', titre: 'Pointage trop ancien', detail: 'Il ne peut plus être enregistré. Prévenez la direction.' };
    case 'hors_ligne':
      return { ton: 'info', titre: 'Pointage gardé sur la borne', detail: 'Il partira dès le retour du réseau.' };
    default:
      return { ton: 'erreur', titre: 'Pointage non enregistré', detail: 'Réessayez dans un instant.' };
  }
}

// ── File hors ligne de la borne ──────────────────────────────────────────────
// Une entrée par code tapé sans réseau : { clientUuid, code, eventAt }. La base
// la rejoue par pointer_borne avec l'heure du geste (fenêtre de 48 h) et
// client_uuid (idempotence) : un rejeu déjà passé rend la même réponse.

// Ce que fait la file d'une réponse de la base pour une entrée rejouée.
//   'retirer'  traitée (pointée, refusée, doublon) : on la sort de la file ;
//   'attendre' la borne est en attente : l'entrée reste, on s'arrête ;
//   'oublier'  la borne n'est plus reconnue : on vide tout.
export function suiteDuRejeu(r) {
  if (!r || typeof r !== 'object') return 'attendre';
  if (r.raison === 'attente') return 'attendre';
  if (r.raison === 'revoquee' || r.raison === 'borne_inconnue') return 'oublier';
  return 'retirer';
}

// Lecture prudente d'une file gardée (valeur illisible : vide), ordre du geste.
export function normaliserFile(brut) {
  const liste = Array.isArray(brut) ? brut : [];
  return liste
    .filter((e) => e && typeof e.clientUuid === 'string' && codeComplet(e.code) && !Number.isNaN(Date.parse(e.eventAt)))
    .sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt));
}

// ── Réglages : choix du code personnel ───────────────────────────────────────

export function messageChoixCode(r) {
  if (r?.ok) return { ok: true, texte: 'Votre code est enregistré.' };
  switch (r?.raison) {
    case 'format': return { ok: false, texte: 'Le code compte 4 chiffres.' };
    case 'trop_simple': return { ok: false, texte: 'Ce code est trop facile à deviner. Choisissez-en un autre.' };
    case 'indisponible': return { ok: false, texte: 'Ce code ne peut pas être retenu. Choisissez-en un autre.' };
    case 'attente': return { ok: false, texte: "Trop d'essais. Réessayez dans une heure." };
    default: return { ok: false, texte: "L'enregistrement a échoué. Réessayez." };
  }
}

// Vérification avant l'envoi, les mêmes règles que la base.
export function codeTropSimple(code) {
  const c = String(code || '');
  if (!codeComplet(c)) return false;
  return /^(.)\1{3}$/.test(c) || '0123456789'.includes(c) || '9876543210'.includes(c);
}
