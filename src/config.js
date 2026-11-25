/* Единый источник всех ставок. Меняете здесь — меняется везде. */
const CONFIG = {
  // сортировочные центры
  buyerBase: { small: 119, medium: 179, oversize: 340 },
  intercityFee: 140,
  incidentFee: 12,
  sc1PerBox: 20,
  sc2PerBox: 52,
  scChPerBox: 25,

  // ПВЗ
  hubPerBox: { small: 16, medium: 16, oversize: 80 },
  finalPvzPerBox: 10,

  // транспорт
  exitFee: 160,
  perKm: 18,
  perMin: 1.5,

  // смена
  shiftFixed: 4800,
  shiftMinutes: 480,

  // SLA покупателя
  sla: { freeMinutes: 20, rubPerHour: 25, maxExtraMin: 90 },

  // сеть ПВЗ
  network: { catchmentM: 400, refDensity: 1.2, maxAdj: 12, maxLoadForHub: 80 },

  // синтетические плечи
  avgKmh: 32,
  detour: 1.35,

  // продавец
  sellerPerBox: 55,
  storagePerBoxDay: 0.8,
  returnHandling: 150,
};

/* Глобальные переключатели для экспериментов (sweep, пресеты). */
let LOAD_OVERRIDE = null; // null = считать по формуле; число = жёстко заданная загрузка, %
