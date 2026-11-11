# Payrexx, Cash Register API : ce que dit la référence officielle

Lu le 11.11.2026 par un vrai chargement de chaque page. Ce document sert à écrire l'adaptateur `payrexx` de l'Edge Function `caisse-tpe` le jour où les points manquants seront confirmés. Tant qu'ils ne le sont pas, l'adaptateur n'existe pas : le socle et le terminal simulé sont en place, et un paiement réel par carte se saisit à la main, comme avant.

Aucun appel n'a été fait à l'API de Payrexx. Aucune clé n'a été demandée ni utilisée.

## Pages lues

| Page | Adresse | Mise à jour affichée |
|---|---|---|
| Présentation de l'interface de caisse | https://docs.payrexx.com/developer/ecr-information/ecr-information | « il y a 1 mois » |
| Code de jumelage NexGo | https://docs.payrexx.com/developer/ecr-information/nexgo-pariring | |
| Liste des endpoints et compatibilité | https://docs.payrexx.com/developer/ecr-information/endpoints | |
| Tests | https://docs.payrexx.com/developer/testing/testing | |
| Démarrage de la Merchant API, authentification, limites | https://developers.payrexx.com/reference/rest-api | « il y a plus d'un an » |
| Erreurs | https://developers.payrexx.com/reference/errors | « il y a 8 mois » |
| Vérifier la clé (SignatureCheck) | https://developers.payrexx.com/reference/signaturecheck | 18.06.2026 |
| Lire le jumelage | https://developers.payrexx.com/reference/get-terminal-pairing | 18.06.2026 |
| Jumeler | https://developers.payrexx.com/reference/pair-terminal | 18.06.2026 |
| Retirer le jumelage | https://developers.payrexx.com/reference/unpair-terminal | 18.06.2026 |
| Lancer un paiement | https://developers.payrexx.com/reference/initiate-terminal-payment | 18.06.2026 |
| Lire un paiement | https://developers.payrexx.com/reference/get-terminal-payment | 18.06.2026 |
| Annuler un paiement en cours | https://developers.payrexx.com/reference/cancel-terminal-payment | 18.06.2026 |
| Annuler un paiement du jour (void) | https://developers.payrexx.com/reference/void-terminal-payment | 18.06.2026 |
| Rembourser | https://developers.payrexx.com/reference/refund-terminal-payment | 18.06.2026 |
| Configuration du terminal | https://developers.payrexx.com/reference/get-terminal-config | 18.06.2026 |
| Changements de la version 1.18 | https://developers.payrexx.com/reference/changes-for-version-v118 | 08.10.2026 |

Les pages de `developers.payrexx.com` sont une définition OpenAPI ; la même adresse suivie de `.md` la rend en texte.

## Ce qui est documenté

**Adresse de base.** `https://api.payrexx.com/v1.18`, avec le paramètre d'adresse `instance` (le nom de l'instance Payrexx du marchand) sur chaque appel.

**Authentification.** En-tête `X-API-KEY` qui porte le secret d'API de l'instance (méthode recommandée). Une signature HMAC-SHA256 en paramètre `ApiSignature` existe aussi. Le secret est celui de l'instance du marchand : un par établissement, ce qui convient au cadre du lot (aucun compte de plateforme).

**Limite de débit.** 600 requêtes par 5 minutes ; au-delà, réponse 405 puis 403. Un suivi toutes les 2 secondes pour un terminal fait 150 requêtes par 5 minutes.

**Erreurs.** 400, 403, 404, 405, corps `{ "status": "error", "message": "..." }`.

**Jumelage.** `GET`, `POST`, `DELETE /ecr/{serialNumber}/pair`. Le `POST` reçoit `pairingCode` (code à usage unique affiché sur le terminal, six caractères, menu « Pay-Connect » ; obligatoire pour NexGo) et `cashierName`. Réponse : `data.pairingStatus`, `data.cashierName`, `data.configuration` (`language`, `timezone`, `hasTipping`, `pointOfSaleName`, `currency`).

**Lancer un paiement.** `POST /ecr/{serialNumber}/payment`. Corps : `amount` (entier, centimes, obligatoire), `currency` (obligatoire), `purpose`, `paymentMethod` (par exemple `twint`, NexGo seulement), `referenceId` (référence du marchand), `printSlip`, `tipAmount` (centimes, « ajouté au total »), `shopItems`.

**Lire un paiement.** `GET /ecr/{serialNumber}/payment/{paymentId}`.

**Annuler, annuler du jour, rembourser.** `POST .../payment/{paymentId}/cancel`, `.../void`, `.../refund` (corps facultatif `amount` en centimes pour le remboursement).

**Réponse d'un paiement** (mêmes champs pour les cinq appels) : `status` de l'enveloppe, puis `data` : `paymentId`, `status`, `type` (`CHARGE` ou `REFUND`), `amount`, `purpose`, `currency`, `tipAmount`, `paymentMethod`, `cardBrand`, `referenceId`, `printSlip`, `terminal` (numéro de série), `reversalStatus`, `shopItems`, `slip` (liste de textes : le reçu).

**Statuts d'un paiement, tels que listés.** `PAYMENT_REQUESTED`, `IN_PROGRESS`, `SUCCESS`, `DECLINED`, `UNDERPAID`, `TERMINATED`, `REVERTED`, `EXPIRED`, `FAILED`, `UNKNOWN`.

**Configuration.** `GET /ecr/{serialNumber}/config` : `name`, `currency`, `tip`, `printReceipt`, `paymentMethods`. La page dit qu'il rend aujourd'hui une réponse vide ou par défaut pour NexGo comme pour Newland.

## Ce qui touche le cadre « aucune donnée de carte »

Le schéma ne documente ni numéro de carte, ni date d'expiration, ni quatre derniers chiffres, ni code d'autorisation. Deux champs demandent de l'attention :

- `slip` : le reçu du terminal, en lignes de texte. Son contenu n'est pas décrit ; un reçu de carte porte d'ordinaire un numéro masqué et un code d'autorisation. Ce champ n'est pas dans la liste blanche : il ne sera ni stocké, ni journalisé, ni lu pour en extraire quoi que ce soit.
- `cardBrand` et `paymentMethod` : la marque. Autorisée.

Conséquence pour la quittance : avec Payrexx, tant que l'API ne rend pas elle-même les quatre derniers chiffres masqués et le code d'autorisation dans des champs à eux, la ligne sera « Carte Visa, terminal relié », sans fin de carte ni autorisation. Le reçu du porteur reste celui du terminal.

Le test `coeurTpe.test.mjs` passe une réponse à cette forme, telle quelle, dans la liste blanche : rien n'en ressort.

## Ce qui manque pour écrire l'adaptateur sans deviner

1. **Le sens de chaque statut.** La référence liste dix noms, sans description. `SUCCESS` et `DECLINED` se lisent ; mais `UNDERPAID` (payé en partie : l'argent est-il pris ?), `TERMINATED` (annulé par qui, débit possible ?), `REVERTED` (annulation du jour aboutie ?), `FAILED`, `EXPIRED` et `UNKNOWN` ne disent pas si le client a été débité. Dire « refusé » à tort sur un paiement débité mènerait à un second débit.
2. **Les délais.** Combien de temps un paiement reste `PAYMENT_REQUESTED` ou `IN_PROGRESS` avant `EXPIRED` ; délai de réponse des appels.
3. **Un moyen d'essayer sans argent réel.** La page « Tests » ne parle que des cartes d'essai du paiement en ligne. Rien sur un terminal ou une instance d'essai pour l'interface de caisse.
4. **Les exemples de réponse.** Tous les exemples de succès sont vides (`{}`). La valeur de l'enveloppe en cas de succès (`"status": "success"`) ne se lit que dans l'exemple de SignatureCheck et dans le cas 202 de l'annulation.
5. **Le montant rendu.** `tipAmount` est « ajouté au total » à l'envoi ; la référence ne dit pas si `amount` de la réponse comprend le pourboire, ni si `tipAmount` de la réponse est le pourboire saisi par le client sur le terminal. Le socle n'accepte un accord que pour le montant exact demandé : il faut savoir lequel comparer.
6. **L'idempotence.** Rien ne dit si deux `POST` avec le même `referenceId` créent deux paiements, ni comment retrouver un paiement dont la réponse au `POST` s'est perdue (la lecture demande un `paymentId` qu'on n'a alors pas).
7. **Le remboursement sur NexGo : deux pages se contredisent.** La présentation (docs.payrexx.com) dit que `payment/refund` est maintenant pris en charge sur les terminaux NexGo qui ont la nouvelle application Pay-Connect. La page de l'endpoint (developers.payrexx.com) dit qu'il n'est pas disponible sur NexGo et répond 501.
8. **Un terminal occupé.** Ce que répond un `POST` quand un paiement est déjà en cours sur le terminal.
9. **La configuration.** `GET config` rend une réponse vide aujourd'hui : on ne peut pas savoir par l'API si le terminal demande lui-même le pourboire. `hasTipping` existe dans la réponse du jumelage, sous forme de texte, sans valeurs décrites.

## Correspondance prévue, à confirmer point par point

Rien de ce tableau n'est codé. Il dit ce que l'adaptateur fera une fois les réponses reçues.

| Payrexx | Socle | Certitude |
|---|---|---|
| `PAYMENT_REQUESTED`, `IN_PROGRESS` | en cours | lu dans le nom |
| `SUCCESS`, `type` `CHARGE`, montant et devise égaux à la demande | approuvé | à confirmer (point 5) |
| `DECLINED` | refusé | lu dans le nom |
| `EXPIRED` | délai du terminal dépassé | à confirmer (points 1 et 2) |
| `TERMINATED`, `FAILED` | à décider : annulé ou refusé, ou incertain | à confirmer (point 1) |
| `UNDERPAID`, `REVERTED`, `UNKNOWN`, tout autre texte | incertain, jamais posé seul | choix prudent du socle |
| Réponse perdue, délai dépassé, erreur réseau | incertain | règle du socle |
| `void` le jour même, `refund` ensuite, 501 | remboursement à faire sur le terminal | à confirmer (point 7) |

## Écrire l'adaptateur

Un seul fichier, `supabase/functions/caisse-tpe/adaptateurs/payrexx.js`, à l'interface décrite dans `adaptateurs/index.js`, puis une ligne dans le registre. Le socle (machine à états, liste blanche, base, écrans) ne change pas. Le secret d'un terminal Payrexx tient en deux champs saisis par la maison : le nom de l'instance et le secret d'API. Les tests de l'adaptateur partiront de réponses réelles capturées sur l'environnement d'essai que Payrexx fournira, pas de réponses écrites à la main.
