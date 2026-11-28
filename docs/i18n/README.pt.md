# WB Mesh

[Русский](../../README.md) · [English](README.en.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [简体中文](README.zh-CN.md) · [Español](README.es.md) · **Português**

🏆 A equipa altcode venceu a categoria «Start» para estudantes do primeiro ano no hackathon RWB × VolgaTech. Os três membros partilharam um prémio de 150 mil rublos. [Resultados do hackathon](https://vk.ru/wall-31385740_44807)

O WB Mesh permite comparar dois percursos para o mesmo lote. As encomendas passam por um segundo centro de triagem ou por um ponto de recolha com espaço disponível no caminho até ao cliente.

**[Descarregar o simulador num ficheiro HTML](https://github.com/scvnkl/hackaton_rwb/raw/refs/heads/main/pvz-wb-real-streets-v12.html)** · [Descrição do produto (RU)](../product.md) · [Modelo e pressupostos (RU)](../technical.md)

![WB Mesh — Primeiro turno](../simulation.png)

## Primeiro turno

1. Abra o ficheiro HTML no navegador. Os mapas e as redes viárias de Yoshkar-Ola e Cheboksary estão disponíveis offline.
2. Em «Пульт», escolha a cidade e o ponto de recolha de destino. Em «Маршрут», compare as paragens, o percurso e os tempos. Inicie a circulação dos veículos e abra «Итоги смены» para ver o balanço. «Деньги» mostra o preço da entrega e o pagamento ao ponto de recolha.

## Encomendas urgentes

Em «Срочные заказы → такси WB», compare um táxi que já segue na mesma direção com uma carrinha dedicada. Confirme em «Подтвердить операцию» e siga a linha amarela tracejada com o controlo de tempo. A simulação assume 99 ₽ pela recolha mais 9 ₽/km.

## Resultado do turno simulado

Yoshkar-Ola, uma carrinha, oito horas, lotes de 20 encomendas e procura idêntica.

| Indicador | Segundo centro de triagem | Ponto de recolha no percurso |
| --- | ---: | ---: |
| Encomendas entregues | 80 | 100 |
| Da partida à entrega do lote (min) | 77 | 59 |
| Preço da entrega para o cliente (₽) | 124 | 119 |
| Saldo da WB por turno (₽) | −7 476 | −6 272 |

Neste cenário, entregam-se mais 20 encomendas e a perda por turno diminui em 1.204 ₽. As tarifas e a ocupação das prateleiras são pressupostos da simulação. [Guia do piloto (RU)](../guide.md)

## Desenvolvimento

[index.html](../../index.html) · [src/model](../../src/model) · [src/map](../../src/map) · [data](../../data) · [src/config.js](../../src/config.js) · [src/ui/taxi.js](../../src/ui/taxi.js)

```sh
node --test tests/dispatch.test.cjs
python3 tools/build_standalone.py
```
