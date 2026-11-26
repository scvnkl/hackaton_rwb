/* Единый источник всех ставок. Меняете здесь — меняется везде. */
const CONFIG = {
  // сортировочные центры
  buyerBase: { small: 119, medium: 179, oversize: 340 },
  intercityFee: 140,
  distanceShare: 0.5,       // доля километрового расхода пути к покупателю в тарифе
  buyerSavingsShare: 0.25,  // доля устранимых затрат для покупателя
  bulk: { premium: 120, hub: 50, loader: 40 },
  hubWorkPerMin: 4,
  sellerGrossPerSale: 180, // условная маржа товара до логистики

  incidentFee: 12,
  sc1PerBox: 20,
  sc2PerBox: 52,
  scChPerBox: 25,

  // ПВЗ
  hubPerBox: { small: 16, medium: 16, oversize: 16 },
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
  // При равном районном спросе соседние пункты делят переменную часть нагрузки.
  network: { catchmentM: 400, refDensity: 1.2, fixedLoad: 15, sharedLoad: 45, maxLoadForHub: 80 },
  shelfLitres: 3000,


  // продавец
  sellerPerBox: 55,
  storagePerBoxDay: 0.8,
  returnHandling: 150,
};

/* Глобальные переключатели для экспериментов (sweep, пресеты). */
let LOAD_OVERRIDE = null; // null = считать по формуле; число = жёстко заданная загрузка, %
