# WB Mesh

[Русский](../../README.md) · [English](README.en.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · **Italiano** · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Português](README.pt.md)

🏆 Il team altcode ha vinto la categoria «Start» per studenti del primo anno all’hackathon RWB × VolgaTech. I tre componenti hanno ricevuto un premio complessivo di 150.000 rubli. [Risultati dell’hackathon](https://vk.ru/wall-31385740_44807)

WB Mesh aiuta chi organizza le consegne a confrontare due itinerari per lo stesso lotto. I colli passano da un secondo centro di smistamento oppure da un punto di ritiro con spazio disponibile lungo il percorso verso il cliente.

**[Scarica il simulatore autonomo](https://github.com/scvnkl/hackaton_rwb/raw/refs/heads/main/pvz-wb-real-streets-v12.html)** · [Descrizione del prodotto (RU)](../product.md) · [Modello e ipotesi (RU)](../technical.md)

![WB Mesh — Primo turno](../simulation.png)

## Primo turno

1. Apri il file HTML nel browser. Le mappe e le reti stradali di Joškar-Ola e Čeboksary sono disponibili offline.
2. In «Пульт» scegli città e punto di ritiro finale. In «Маршрут» confronta tappe, strade e tempi. Avvia i veicoli e apri «Итоги смены» per i risultati. «Деньги» mostra il prezzo della consegna e il compenso del punto di ritiro.

## Ordini urgenti

In «Срочные заказы → такси WB» confronta un taxi già diretto verso la destinazione con un furgone dedicato. Conferma con «Подтвердить операцию» e segui la linea gialla tratteggiata usando il cursore del tempo. Il modello prevede 99 ₽ per la chiamata più 9 ₽/km.

## Risultati del turno simulato

Joškar-Ola, un furgone, otto ore, lotti da 20 ordini e domanda identica.

| Indicatore | Secondo centro di smistamento | Punto di ritiro lungo il percorso |
| --- | ---: | ---: |
| Ordini consegnati | 80 | 100 |
| Dalla partenza alla consegna del lotto (min) | 77 | 59 |
| Spese di consegna per il cliente (₽) | 124 | 119 |
| Saldo WB per turno (₽) | −7 476 | −6 272 |

In questo scenario si consegnano 20 ordini in più e la perdita per turno diminuisce di 1.204 ₽. Tariffe e occupazione degli scaffali sono ipotesi del modello. [Guida al progetto pilota (RU)](../guide.md)

## Sviluppo

[index.html](../../index.html) · [src/model](../../src/model) · [src/map](../../src/map) · [data](../../data) · [src/config.js](../../src/config.js) · [src/ui/taxi.js](../../src/ui/taxi.js)

```sh
node --test tests/dispatch.test.cjs
python3 tools/build_standalone.py
```
