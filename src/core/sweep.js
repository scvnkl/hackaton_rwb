function sweepMatrix() {
  const tariffs = [10, 20, 30, 40, 50, 60, 70];
  const loads = [50, 65, 80, 90];

  if (planIssue) throw Error(planIssue);
  const size = parcelCategory();
  const saved = {
    batch: el("batch").value,
    flow: el("flowSlider").value,
    trucks: el("truckCountSlider").value,
    fee: CONFIG.hubPerBox[size],
    override: LOAD_OVERRIDE,
  };

  const out = [];
  try {
    el("batch").value = 20;
    el("flowSlider").value = 100;
    el("truckCountSlider").value = 2;

    for (const load of loads) {
      LOAD_OVERRIDE = load;
      for (const fee of tariffs) {
        CONFIG.hubPerBox[size] = fee;

        const direct = schedule("direct");
        const hybrid = schedule("hybrid");
        const md = metrics("direct", CONFIG.shiftMinutes, direct);
        const mh = metrics("hybrid", CONFIG.shiftMinutes, hybrid);
        const viaHub = hybrid.trips.filter((t) => t.mode === "hybrid").length;

        out.push({
          "полки %": load,
          "тариф ПВЗ": fee,
          "экономия ₽": md.margin===null||mh.margin===null ? null : Math.round(mh.margin - md.margin),
          "рейсов через ПВЗ": viaHub + " / " + hybrid.trips.length,
          вердикт: md.margin===null||mh.margin===null ? "недостаточно дорог" : mh.margin > md.margin ? "гибрид" : "СЦ",
        });
      }
    }
  } finally {
    el("batch").value = saved.batch;
    el("flowSlider").value = saved.flow;
    el("truckCountSlider").value = saved.trucks;
    CONFIG.hubPerBox[size] = saved.fee;
    LOAD_OVERRIDE = saved.override;
  }

  console.table(out);
  window.SWEEP_RESULT = out;
  return out;
}
