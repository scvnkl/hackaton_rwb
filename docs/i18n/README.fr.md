# WB Mesh

[Русский](../../README.md) · [English](README.en.md) · [Deutsch](README.de.md) · **Français** · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Português](README.pt.md)

🏆 L’équipe altcode a remporté la catégorie « Start » des étudiants de première année au hackathon RWB × VolgaTech. Ses trois membres se sont partagé 150 000 roubles. [Résultats du hackathon](https://vk.ru/wall-31385740_44807)

WB Mesh permet au responsable des livraisons de comparer deux trajets pour un même lot. Les colis passent par un second centre de tri ou par un point relais qui dispose de place sur le trajet vers le client.

**[Télécharger le simulateur autonome](https://github.com/scvnkl/hackaton_rwb/raw/refs/heads/main/pvz-wb-real-streets-v12.html)** · [Présentation du produit (RU)](../product.md) · [Modèle et hypothèses (RU)](../technical.md)

![WB Mesh — Première tournée](../simulation.png)

## Première tournée

1. Ouvrez le fichier HTML dans un navigateur. Les cartes et les réseaux routiers de Iochkar-Ola et de Tcheboksary sont disponibles hors ligne.
2. Dans «Пульт», choisissez la ville et le point relais de destination. Dans «Маршрут», comparez les étapes, les routes et les délais. Lancez les véhicules puis consultez «Итоги смены» pour le bilan et «Деньги» pour le prix de livraison et la rémunération du relais.

## Colis urgents

Dans «Срочные заказы → такси WB», comparez un taxi déjà en route et une camionnette dédiée. Validez avec «Подтвердить операцию» et suivez le tracé jaune en pointillé avec le curseur de temps. Le tarif simulé du taxi est de 99 ₽ par prise en charge plus 9 ₽/km.

## Résultat de la simulation

Iochkar-Ola, une camionnette, huit heures, lots de 20 commandes et demande identique.

| Indicateur | Second centre de tri | Point relais en chemin |
| --- | ---: | ---: |
| Commandes remises | 80 | 100 |
| Du départ à la remise du lot (min) | 77 | 59 |
| Livraison facturée au client (₽) | 124 | 119 |
| Solde de WB sur la période (₽) | −7 476 | −6 272 |

Dans ce scénario, le relais permet de remettre 20 commandes supplémentaires et de réduire la perte de 1 204 ₽. Les tarifs et le taux d’occupation sont des hypothèses de simulation. [Guide du pilote (RU)](../guide.md)

## Développement

[index.html](../../index.html) · [src/model](../../src/model) · [src/map](../../src/map) · [data](../../data) · [src/config.js](../../src/config.js) · [src/ui/taxi.js](../../src/ui/taxi.js)

```sh
node --test tests/dispatch.test.cjs
python3 tools/build_standalone.py
```
