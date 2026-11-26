# Vitrine : l'établissement Démo rempli comme une maison qui travaille (26.11.2026)

Établissement visé : `etab-1781452861459` (Démo), pour présenter l'app aux clients. Aucune autre maison n'est touchée.

## Ce qui a été fait
- Source : le jeu de la démo publique (`src/demo/donnees/`, la « Brasserie Démo »), généré avec une horloge figée au 26.11.2026 à 12 h 15 (`01-generer-jeu.mjs`) : service de midi en cours, soir réservé, trois semaines de réservations et de planning, deux semaines de caisse avec clôtures, HACCP, pertes, inventaires, achats, hôtel (12 chambres, séjours, étages, demandes, activités, passations, technique), spa (soins, clients, bons, demandes en ligne), groupes avec devis et factures, points et boutique, messages.
- Conversion (`02-convertir.mjs`) : identifiants réécrits (suffixe `-vitrine` pour les identifiants texte, uuid dérivé pour les autres), adresses en `.example` et `.test` (aucun envoi possible), onze personnes fictives sans compte de connexion (profils seuls). Écartés : préférences liées à un compte, POS (module à supprimer, une connexion fictive serait synchronisée), traçabilité HACCP (photo obligatoire), alertes (règle obligatoire). Valeurs refusées par les CHECK de la base corrigées (maladie en absence, TWINT en « autre » avec libellé, assurance en assurances, source de prix en scan, heure de rappel d'une procédure).
- Gardés tels quels dans Démo : les 1 175 fiches de l'import du 15.11, les cinq fiches homonymes du jeu (frites, gratin, fond brun, pickles, mousse) reliées aux fiches existantes (une fiche par nom), les groupes de planning Salle et Cuisine, les réglages de points et des demandes par QR, la chambre 1, les deux personnes réelles.
- Semis (`03-semer.sql`) : 4 159 lignes sur 114 tables, inscrites au registre `vitrine.lignes`, déclencheurs coupés. Tickets renumérotés de 1 à 192, clôtures recalculées par `caisse_totaux_jour`, chaîne d'intégrité de 204 maillons scellée par `vitrine.resceller()` (contrôle : 0 maillon faux). Type de l'établissement passé à Hôtel-Restaurant.

## Tous les jours
`vitrine.rattraper()` tourne chaque heure (pg_cron `vitrine-demo-rattraper`, minute 11) : au premier passage d'un jour neuf, toutes les dates des lignes du registre avancent d'autant de jours (`vitrine.avancer`), puis la chaîne de la caisse est rescellée. La vitrine montre donc toujours le même jour type : midi en cours, soir à venir, historique derrière, semaine devant. Ce qui est saisi à la main dans Démo ne bouge jamais. Journal : `select * from vitrine.journal order by le desc;` (colonne `echecs`).

## Limites connues
- Le jour est figé à midi : à 16 h, les tables ouvertes de midi le sont toujours, et le soir passe « en retard » après l'heure des réservations.
- Historique court : trois semaines de réservations, deux de caisse, deux mois de ventes. Les comparaisons des Statistiques sur 30 jours n'ont pas de période précédente.
- Documents : les fichiers ne sont pas dans le stockage, leur ouverture échoue.
- KDS vide (les commandes en cuisine naissent d'un déclencheur, coupé au semis).
- Un ticket encaissé à la main dans Démo prend la suite de la chaîne, mais ses dates ne bougent pas : les tickets semés le dépassent dans le temps.

## Retirer la vitrine
`select vitrine.effacer();` supprime les lignes du registre et elles seules, retire leurs maillons, resserre la chaîne et la rescelle. Puis, si plus rien n'en sert : `select cron.unschedule('vitrine-demo-rattraper');` et `drop schema vitrine cascade;`. Remettre le type d'origine : `update etablissements set type = 'Restaurant' where id = 'etab-1781452861459';`.

## Rejouer
1. `node 01-generer-jeu.mjs <racine du dépôt> <dossier>/base-demo.json 2026-11-26T11:15:00Z`
2. Schéma de production : colonnes de chaque table (requête sur `information_schema.columns`) dans `<dossier>/schema-prod.json`, puis `node 02-convertir.mjs <dossier>` : un fichier JSON par lot dans `<dossier>/depots/`.
3. Le connecteur ne peut pas porter 2 Mo. Envoi fait le 26.11 : table `vitrine.depot` et fonction temporaire `public.vitrine_depot_recevoir`, gardée par l'empreinte sha256 d'un secret tiré sur le poste, appelée par curl avec la clé publique de l'app ; supprimées après le semis. Avec la CLI (`npx supabase db query -f`), les lots peuvent passer par fichier.
4. `03-semer.sql`, d'abord avec `rollback` à la place de `commit`.
