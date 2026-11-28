# WB Mesh

[Русский](../../README.md) · **English** · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Português](README.pt.md)

🏆 Team altcode won the first-year “Start” track at the RWB × VolgaTech hackathon. The three teammates shared a ₽150,000 prize. [Hackathon results](https://vk.ru/wall-31385740_44807)

WB Mesh helps a dispatcher decide where to process a batch of parcels. It compares the usual route through a second sorting centre with a route through a pickup point that has spare capacity on the way to the customer.

**[Download the standalone simulator](https://github.com/scvnkl/hackaton_rwb/raw/refs/heads/main/pvz-wb-real-streets-v12.html)** · [Product overview (RU)](../product.md) · [Model and assumptions (RU)](../technical.md)

![WB Mesh — First shift](../simulation.png)

## First shift

1. Open the downloaded HTML file in a browser. Street maps and road graphs for Yoshkar-Ola and Cheboksary are included for offline use.
2. Under «Пульт», select the city and destination pickup point. Open «Маршрут» to compare stops, roads and delivery times. Start the vehicles, open «Итоги смены» for results and «Деньги» for the delivery price and pickup point payment.

## Urgent parcels

Under «Срочные заказы → такси WB», compare a taxi already heading that way with a dedicated van. Select «Подтвердить операцию» and follow the yellow dashed route using the shift clock. The pilot assumes ₽99 per pickup plus ₽9/km.

## Simulated shift

Yoshkar-Ola, one van, eight hours, batches of 20 orders and identical demand.

| Metric | Second sorting centre | Pickup point en route |
| --- | ---: | ---: |
| Orders handed over | 80 | 100 |
| Time from departure to handover (min) | 77 | 59 |
| Customer delivery fee (₽) | 124 | 119 |
| WB balance per shift (₽) | −7 476 | −6 272 |

In this simulation the pickup point route serves 20 more orders and reduces the shift loss by ₽1,204. Rates and shelf occupancy are experimental inputs. [Pilot guide (RU)](../guide.md)

## Development

[index.html](../../index.html) · [src/model](../../src/model) · [src/map](../../src/map) · [data](../../data) · [src/config.js](../../src/config.js) · [src/ui/taxi.js](../../src/ui/taxi.js)

```sh
node --test tests/dispatch.test.cjs
python3 tools/build_standalone.py
```
