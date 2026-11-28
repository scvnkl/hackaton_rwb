# WB Mesh

[Русский](../../README.md) · [English](README.en.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · **Español** · [Português](README.pt.md)

🏆 El equipo altcode ganó la categoría «Start» de primer año en el hackatón RWB × VolgaTech. Sus tres integrantes compartieron un premio de 150.000 rublos. [Resultados del hackatón](https://vk.ru/wall-31385740_44807)

WB Mesh permite comparar dos rutas para un mismo lote. Los paquetes pasan por un segundo centro de clasificación o por un punto de recogida con espacio disponible de camino al cliente.

**[Descargar el simulador en un archivo HTML](https://github.com/scvnkl/hackaton_rwb/raw/refs/heads/main/pvz-wb-real-streets-v12.html)** · [Descripción del producto (RU)](../product.md) · [Modelo y supuestos (RU)](../technical.md)

![WB Mesh — Primer turno](../simulation.png)

## Primer turno

1. Abre el archivo HTML en el navegador. Los mapas y las redes viarias de Yoshkar-Olá y Cheboksary están disponibles sin conexión.
2. En «Пульт», elige la ciudad y el punto de recogida final. En «Маршрут», compara las paradas, el recorrido y los tiempos. Pon en marcha los vehículos y abre «Итоги смены» para ver el balance. «Деньги» muestra el precio del envío y el pago al punto de recogida.

## Pedidos urgentes

En «Срочные заказы → такси WB», compara un taxi que ya va en esa dirección con una furgoneta dedicada. Confirma con «Подтвердить операцию» y sigue la línea amarilla discontinua con el control de tiempo. El modelo supone una tarifa de taxi de 99 ₽ por recogida más 9 ₽/km.

## Resultado del turno simulado

Yoshkar-Olá, una furgoneta, ocho horas, lotes de 20 pedidos y la misma demanda.

| Indicador | Segundo centro de clasificación | Punto de recogida intermedio |
| --- | ---: | ---: |
| Pedidos entregados | 80 | 100 |
| Tiempo desde la salida hasta la entrega del lote (min) | 77 | 59 |
| Precio del envío para el cliente (₽) | 124 | 119 |
| Saldo de WB por turno (₽) | −7 476 | −6 272 |

En este escenario se entregan 20 pedidos más y la pérdida por turno baja en 1.204 ₽. Las tarifas y la ocupación de las estanterías son supuestos del modelo. [Guía del piloto (RU)](../guide.md)

## Desarrollo

[index.html](../../index.html) · [src/model](../../src/model) · [src/map](../../src/map) · [data](../../data) · [src/config.js](../../src/config.js) · [src/ui/taxi.js](../../src/ui/taxi.js)

```sh
node --test tests/dispatch.test.cjs
python3 tools/build_standalone.py
```
