# WB Mesh

[Русский](../../README.md) · [English](README.en.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Italiano](README.it.md) · **简体中文** · [Español](README.es.md) · [Português](README.pt.md)

🏆 altcode 团队在 RWB × VolgaTech 黑客松大一学生「Start」组中获得第一名。三名队员共获 15 万卢布奖金。 [比赛结果](https://vk.ru/wall-31385740_44807)

WB Mesh 帮助调度员为同一批包裹比较两种配送方案：经过第二个分拣中心，或经由沿途有空余容量的自提点中转。

**[下载单文件模拟器](https://github.com/scvnkl/hackaton_rwb/raw/refs/heads/main/pvz-wb-real-streets-v12.html)** · [产品说明 (RU)](../product.md) · [计算模型与假设 (RU)](../technical.md)

![WB Mesh — 模拟第一个班次](../simulation.png)

## 模拟第一个班次

1. 用浏览器打开下载的 HTML 文件。模拟器内置约什卡尔奥拉和切博克萨雷的地图和道路网络，支持离线使用。
2. 在 «Пульт» 中选择城市和目的地自提点，在 «Маршрут» 中比较中转站、行驶路线和配送时间。启动车辆后，打开 «Итоги смены» 查看班次结果，或在 «Деньги» 中查看买家运费及自提点报酬。

## 加急订单

在 «Срочные заказы → такси WB» 中比较顺路出租车和专程配送的货车。点击 «Подтвердить операцию» 确认派车，拖动时间滑块即可沿黄色虚线查看车辆位置。模型假设出租车起步费为 99 卢布，另加每公里 9 卢布。

## 班次模拟结果

约什卡尔奥拉，一辆货车，八小时，每批 20 单，两种方案的需求量相同。

| 指标 | 经第二分拣中心 | 经沿途自提点 |
| --- | ---: | ---: |
| 已交付订单数 | 80 | 100 |
| 从发车到整批交付（分钟） | 77 | 59 |
| 买家支付的运费（卢布） | 124 | 119 |
| WB 班次收支余额（卢布） | −7 476 | −6 272 |

在此模拟中，经自提点中转多交付了 20 单，班次亏损减少 1,204 卢布。费率与货架占用率均为实验假设。 [试点指南 (RU)](../guide.md)

## 开发说明

[index.html](../../index.html) · [src/model](../../src/model) · [src/map](../../src/map) · [data](../../data) · [src/config.js](../../src/config.js) · [src/ui/taxi.js](../../src/ui/taxi.js)

```sh
node --test tests/dispatch.test.cjs
python3 tools/build_standalone.py
```
