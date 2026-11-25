/* Доля перехвата спроса по брендам: свой ПВЗ — база, соседние конкуренты делят поток. */
const BRAND_WEIGHT = { wb: 1.0, ozon: 0.7, ym: 0.6, locker: 0.35, other: 0.5 };

function competitionIndex(p, all) {
  const list = all || PVZ_LIST;
  const cfg = CONFIG.network;
  let n = 0;
  for (const x of list) {
    if (x.id === p.id || x.city !== p.city) continue;
    const d = haversineM(p.latlng, x.latlng);
    if (d > 4 * cfg.catchmentM) continue;
    n += (BRAND_WEIGHT[x.brand || "wb"] || 0.5) * Math.exp(-d / cfg.catchmentM);
  }
  return Math.round(n * 100) / 100;
}

/* Сдвиг загрузки: ±maxAdj пунктов, плавно, ограничен. */
function loadAdjustment(p, all) {
  const cfg = CONFIG.network;
  const n = competitionIndex(p, all);
  return Math.round(cfg.maxAdj * Math.tanh((cfg.refDensity - n) / 1.5));
}

/* Итоговая загрузка полок, % — единственная функция, которую использует модель. */
function effectiveLoad(p, all) {
  const base = typeof p.baseLoad === "number" ? p.baseLoad : 40;
  const toggle = el("useCompetition");
  if (!toggle || !toggle.checked) return base;
  return Math.min(95, Math.max(20, base + loadAdjustment(p, all)));
}
