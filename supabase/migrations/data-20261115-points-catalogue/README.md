# Données P2 : réglages et catalogue des points (15.11.2026)

Boutiques de Woodland Village (`etab-2`) et du Rucher d'Evolène (`etab-1777157340476`), même catalogue de 41 cadeaux (20 cuisine, 17 salle, 4 communs), coûts de 450 à 3 500 points, description = prix public en CHF. Aucune gravure ni broderie au nom. Système laissé éteint : Jérémy l'allume lui-même (Points & boutique, onglet Réglages).

- `01-reglages-catalogue.sql` : une ligne de réglages par établissement (`actif = false`, rôles par défaut, barème par défaut de P2, plafonds 40 par jour et 400 par mois), puis les 41 cadeaux (`actif = true`, `stock` nul, `ordre` croissant par points puis par nom). Rejouable : rien en double, une ligne de réglages existante n'est jamais réécrite.
- `02-verification.sql` : 41 et 41 cadeaux actifs, 20 / 17 / 4 par catégorie, 2 réglages éteints aux plafonds 40 et 400, 0 réglage allumé, 0 mouvement, 0 nom personnalisé.
- `99-rollback.sql` : retire les cadeaux jamais commandés et les réglages restés éteints sans mouvement.

Pas de sauvegarde préalable : les deux tables visées étaient vides pour ces établissements (0 ligne relevée avant l'application, au rapport du lot).
À jouer après `20261115_points_anti_fuite.sql` (colonne `categorie`, plafonds, index unique par nom).
