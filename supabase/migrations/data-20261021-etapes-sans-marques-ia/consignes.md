# Consignes de réécriture des étapes (fiches du 16.10.2026)

Demande de Jérémy, 21.10.2026 : enlever des fiches des menus de groupe toutes
les marques d'écriture IA. Style validé sur l'exemple de la mousse caramel.

## Ce qui change

1. **Phrases courtes, à l'impératif.** Une phrase = une action. Couper les
   phrases enchaînées par des points-virgules ou des virgules en phrases
   séparées. Aucun point-virgule.
2. **Plus d'explication en fin de phrase.** Supprimer les justifications et
   déductions : « …, ce qui… », « …, afin de… », « …, pour que… », « …, qui ne
   remontent plus », « …, elle devient la base du gâteau », « permet de »,
   « garantit ». Garder la consigne, retirer le pourquoi.
3. **Nombres en chiffres.** « sept jours » devient « 7 jours », « en trois
   fois » devient « en 3 fois », « moins 18 °C » devient « -18 °C », « pour
   cent » devient « % ». « un » et « une » restent en lettres.
4. **Plus de « soit ».** « 2 000 g, soit 40 portions de 50 g » devient
   « 2 000 g, 40 portions de 50 g ».
5. **Étape « Vigilance : … ».** Si elle répète une consigne déjà écrite, la
   supprimer. Sinon, la réécrire en consigne courte, sans le mot Vigilance ni
   l'explication (« Ne pas ouvrir la porte avant 15 minutes. »), à la fin ou
   dans l'étape qu'elle concerne.
6. **Étiquettes gardées** en tête d'étape : Rendement, Format, Conservation,
   Mise en place, Dressage, Envoi.

## Ce qui ne change pas

- Aucune quantité, température, durée, taille, aucun ingrédient ni matériel :
  rien n'est ajouté, rien n'est inventé, rien n'est arrondi.
- Les noms des fiches citées restent écrits à l'identique, y compris quand ils
  contiennent un nombre en lettres (« Fenouil en deux textures »).
- Pas de numéro d'étape, pas de tiret cadratin ou demi-cadratin, pas de point
  médian, pas de flèche.
- Le nombre d'étapes reste proche (au plus 2 de plus), le texte total est plus
  court que l'original.

## Exemple validé

Avant :

> Cuire le sucre à sec en caramel ambré à 180 °C, décuire avec 330 g de crème
> bouillante en trois fois, ajouter le beurre et la fleur de sel, cuire à
> 104 °C.
>
> Conservation : ne se garde pas seule, uniquement montée dans l'entremets
> surgelé, trois semaines à moins 18 °C ; le caramel gélifié seul se garde cinq
> jours à 3 °C.
>
> Vigilance : décuire avec une crème bouillante et en trois fois, une crème
> froide fait masser le caramel et jaillir le sucre brûlant.

Après :

> Cuire le sucre à sec en caramel ambré, 180 °C. Décuire avec 330 g de crème
> bouillante, en 3 fois. Ajouter le beurre et la fleur de sel, cuire à 104 °C.
>
> Conservation : seulement montée dans l'entremets surgelé, 3 semaines à
> -18 °C. Caramel gélifié seul : 5 jours à 3 °C.
>
> (étape Vigilance supprimée : la consigne est déjà dans la première étape)

Autre exemple (gougères) :

> Avant : « Cuire au combi 175 °C, h00, 22 minutes, sans ouvrir la porte avant
> 15 minutes : gougères dorées, sèches et creuses à l'intérieur. » puis
> « Vigilance : la porte ouverte avant 15 minutes fait retomber les gougères,
> qui ne remontent plus. »
>
> Après : « Cuire au combi à 175 °C, h00, 22 minutes. Ne pas ouvrir la porte
> avant 15 minutes. Les gougères sortent dorées, sèches et creuses. » et
> l'étape Vigilance disparaît.

## Contrôles automatiques (gabarit-lot.sql)

Refus de tout le lot, sans rien écrire, si une fiche :

- perd un nombre de l'original (nombres en lettres convertis avant de
  comparer) ;
- perd le nom d'une fiche citée (noms de 12 caractères et plus) ;
- garde une tournure interdite : point-virgule, tirets longs, point médian,
  flèche, « vigilance », « soit », « ce qui », « afin de », « afin que »,
  « pour que », « permet de », « permettent de », « permettant », « garanti »,
  un nombre en lettres de deux à mille, « moins » suivi d'un nombre,
  « pour cent » (les noms de fiches citées sont retirés avant ce contrôle) ;
- a une étape vide, numérotée ou de plus de 280 caractères ;
- a moins d'une étape ou plus de 2 étapes de plus que l'original ;
- a un texte total plus long que l'original ;
- a été modifiée en base depuis sa lecture (empreinte md5).

Après écriture, dans la même transaction : chaque fiche porte bien ses
nouvelles étapes, et le journal d'activité a gardé l'ancienne version de
chacune, sinon tout est annulé.
