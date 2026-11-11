// SAMPER CONSULTING - caisse-tpe : le registre des adaptateurs.
//
// Un fichier par prestataire, tous derrière la même interface. En ajouter un :
// écrire son fichier, l'inscrire ici. Le socle (coeur.js, machine.js,
// listeBlanche.js, la base) ne change pas.
//
// Interface d'un adaptateur :
//   id, nom, description
//   simulation   : true = ne sert que les tickets de test (la base n'admet ce
//                  drapeau que pour 'simule')
//   champsSecret : [{ cle, libelle, aide, min, max }] : ce que la personne
//                  saisit une fois, envoyé au coffre, jamais relu à l'écran
//   codeJumelage : { libelle, aide } ou null
//   cleDe(secret)                       : la clé, pour n'en garder que la fin
//   jumeler({ secret, numeroSerie, code, nom })     -> { fait, message }
//   dejumeler({ secret, numeroSerie })              -> { fait, message }
//   etat({ secret, numeroSerie })                   -> { relie, pourboireSurTerminal }
//   demarrer({ secret, numeroSerie, transaction, maintenant }) -> résultat
//   statut({ secret, numeroSerie, transaction, maintenant })   -> résultat
//   annuler({ secret, numeroSerie, transaction, maintenant })  -> résultat
//   rembourser({ secret, numeroSerie, transaction, memeJour }) -> { fait, genre, message }
// Un résultat : { statut, idPrestataire, montantCentimes, pourboireCentimes,
//   devise, marque, finCarte, codeAutorisation, message }, avec statut dans
//   en_cours, approuve, refuse, annule, expire, incertain. Une exception vaut
//   « injoignable ». Tout résultat passe par la liste blanche du socle : un
//   adaptateur ne peut rien faire entrer d'autre, même par erreur.
//   finCarte ne se remplit que si le prestataire rend déjà les quatre
//   derniers chiffres masqués ; un adaptateur ne les extrait jamais d'un
//   numéro entier ni d'un reçu.
// Règles d'un adaptateur : aucun journal (console) ; aucune clé dans une
// adresse ; délai de huit secondes au plus par appel ; montants en centimes.
//
// Payrexx (Cash Register API) n'est pas inscrit : sa référence publique, lue
// le 11.11.2026, ne dit ni le sens de chaque statut, ni ses délais, ni
// comment essayer sans argent réel. Voir docs/caisse-tpe/payrexx-reference.md.

import { simule } from './simule.js';

export const ADAPTATEURS = { simule };
