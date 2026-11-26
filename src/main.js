el("geoLocal").addEventListener("click", () => setGeo("local"));
el("geoInter").addEventListener("click", () => setGeo("intercity"));
el("btnVec").addEventListener("click", () => setStyleMode("vector"));
el("btnSat").addEventListener("click", () => setStyleMode("satellite"));
el("optHybrid").addEventListener("click", () => setRouteMode("hybrid"));
el("optDirect").addEventListener("click", () => setRouteMode("direct"));
el("btnToggleSim").addEventListener("click", toggleSimulation);
el("resetSimulation").addEventListener("click", resetSimulation);
el("openSummary").addEventListener("click", openSummaryModal);
document
  .querySelector(".close-modal-btn")
  .addEventListener("click", closeSummaryModal);
document
  .querySelector(".drawer-close")
  .addEventListener("click", toggleAnalyticsDrawer);
el("drawerFab").addEventListener("click", toggleAnalyticsDrawer);
el("finalPvzSelect").addEventListener("change", onFinalPvzChange);
for (const button of document.querySelectorAll("[data-size]"))
  button.addEventListener("click", () => setSize(button.dataset.size));
for (const button of document.querySelectorAll("[data-stock]"))
  button.addEventListener("click", () => storeAction(button.dataset.stock));
for (const id of [
  "storageDays",
  "bulkConsent",
  "useCompetition",
  "batch",
  "dim0",
  "dim1",
  "dim2",
  "kg",
  "stress",
  "incident",
  "stockPoint",
])
  el(id).addEventListener("change", recalculateAll);
for (const id of ["truckCountSlider", "flowSlider", "shelfSlider"])
  el(id).addEventListener("input", recalculateAll);
el("scrub").addEventListener("input", (event) => {
  stopClock();
  elapsed = Number(event.target.value);
  updateClock();
});
for (const b of document.querySelectorAll("[data-preset]"))
  b.addEventListener("click", () => applyPreset(b.dataset.preset));
el("storageRate").textContent = rub(CONFIG.storagePerBoxDay);
el("scrub").max = CONFIG.shiftMinutes;
function regionOptions() {
  el("regionSelect").replaceChildren(...Object.entries(REGION_CATALOGS).map(([key,c]) =>
    new Option(c.city + (c.boundary ? "" : " · пилотная зона"), key)));
}
regionOptions();
el("regionSelect").addEventListener("change", e => configureRegion(e.target.value));
el("retryRoads").addEventListener("click", refreshDestination);
el("regionFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const catalog = validateCatalog(JSON.parse(await file.text()));
    const key = "import-" + crypto.randomUUID();
    REGION_CATALOGS[key] = catalog;
    regionOptions();
    configureRegion(key);
    el("importStatus").textContent = "Загружен регион " + catalog.city;
  } catch (error) { el("importStatus").textContent = error.message; }
  e.target.value = "";
});
map.on("moveend", () => { if (activeChain.finalPvz) renderMarkers(); });
configureRegion("yoshkar-ola");
setTimeout(() => map.invalidateSize(), 100);
