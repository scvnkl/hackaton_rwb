# WB Mesh

[Русский](../../README.md) · [English](README.en.md) · **Deutsch** · [Français](README.fr.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · [Português](README.pt.md)

🏆 Team altcode gewann beim Hackathon RWB × VolgaTech die Kategorie „Start“ für Erstsemester. Das dreiköpfige Team erhielt 150.000 Rubel. [Ergebnisse des Hackathons](https://vk.ru/wall-31385740_44807)

Mit WB Mesh können Disponenten zwei Wege für dieselbe Sendungsgruppe vergleichen. Die Pakete werden entweder in einem zweiten Sortierzentrum oder in einer Abholstelle mit freier Kapazität auf dem Weg zum Kunden bearbeitet.

**[Simulator als HTML-Datei herunterladen](https://github.com/scvnkl/hackaton_rwb/raw/refs/heads/main/pvz-wb-real-streets-v12.html)** · [Produktbeschreibung (RU)](../product.md) · [Modell und Annahmen (RU)](../technical.md)

![WB Mesh — Erste Schicht](../simulation.png)

## Erste Schicht

1. Die heruntergeladene HTML-Datei im Browser öffnen. Straßenkarten und Straßennetze für Joschkar-Ola und Tscheboksary stehen offline zur Verfügung.
2. Unter «Пульт» Stadt und Ziel-Abholstelle wählen. Unter «Маршрут» Zwischenstationen, Strecke und Lieferzeit vergleichen. Fahrzeuge starten und «Итоги смены» für die Ergebnisse öffnen. «Деньги» zeigt Lieferpreis und Vergütung der Abholstelle.

## Eilsendungen

Unter «Срочные заказы → такси WB» eine Taximitnahme mit einer Sonderfahrt per Transporter vergleichen. Mit «Подтвердить операцию» buchen und die gelb gestrichelte Route mit dem Zeitregler verfolgen. Modellannahme für das Taxi: 99 ₽ Grundpreis plus 9 ₽/km.

## Simulierte Schicht

Joschkar-Ola, ein Transporter, acht Stunden, je 20 Bestellungen pro Charge und gleiche Nachfrage.

| Kennzahl | Zweites Sortierzentrum | Abholstelle unterwegs |
| --- | ---: | ---: |
| Ausgegebene Bestellungen | 80 | 100 |
| Fahrtbeginn bis Übergabe (Min.) | 77 | 59 |
| Liefergebühr für Kunden (₽) | 124 | 119 |
| WB-Saldo pro Schicht (₽) | −7 476 | −6 272 |

Im Modell werden 20 Bestellungen mehr ausgegeben. Der Verlust pro Schicht sinkt um 1.204 ₽. Tarife und Regalauslastung sind Annahmen für den Versuch. [Pilotleitfaden (RU)](../guide.md)

## Entwicklung

[index.html](../../index.html) · [src/model](../../src/model) · [src/map](../../src/map) · [data](../../data) · [src/config.js](../../src/config.js) · [src/ui/taxi.js](../../src/ui/taxi.js)

```sh
node --test tests/dispatch.test.cjs
python3 tools/build_standalone.py
```
