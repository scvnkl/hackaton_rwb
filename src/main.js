el("geoLocal").addEventListener("click", () => setGeo("local"));
el("geoInter").addEventListener("click", () => setGeo("intercity"));
el("gisConfig").addEventListener("submit", event => {
  event.preventDefault();
  const value = el("gisKey").value.trim();
  if (!value) return;
  stopGisLayer();
  gisKey = value;
  try { localStorage.setItem("wb-sim.2gis-key", value); } catch {}
  el("gisKey").value = "";
  showGis();
});
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
for (const id of ["bulkConsent", "useCompetition", "stress"])
  el(id).addEventListener("change", updateParameters);
el("stockPoint").addEventListener("change", () => renderManualStock());
for (const id of [...numericFields, "truckCountSlider", "flowSlider", "shelfSlider"])
  el(id).addEventListener("input", updateParameters);
el("incident").addEventListener("change", refreshDestination);
el("showStoragePickup").addEventListener("click",()=>{
  const lot=runs[routeMode]?.trips[0]?.openingLot;
  if(!lot||planIssue)return;
  stopClock();elapsed=lot.releasedAt;updateClock();
});
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
    new Option("📍 " + c.city, key)));
}
regionOptions();
el("regionSearch").addEventListener("submit", e => {
  e.preventDefault();
  searchRegion(el("regionQuery").value.trim());
});
el("regionSelect").addEventListener("change", e => configureRegion(e.target.value));
el("retryRoads").addEventListener("click", refreshDestination);
let importNumber = 0;
el("regionFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const request = ++catalogGeneration;
  citySearch?.abort();
  try {
    const contents = await file.text();
    if (request !== catalogGeneration) return;
    const catalog = validateCatalog(JSON.parse(contents));
    const key = "import-" + (++importNumber);
    configureRegion(key,catalog);
    el("importStatus").textContent = "Загружен регион " + catalog.city;
  } catch (error) {
    if (request === catalogGeneration) el("importStatus").textContent = error.message;
  } finally {
    if (e.target.files[0] === file) e.target.value = "";
  }
});
el("gisStatus").addEventListener("click", () => { if (baseKind === "offline") showGis(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeSummaryModal(); if (drawerOpen) toggleAnalyticsDrawer(); }
  if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); toggleSimulation(); }
});
el("summaryModal").addEventListener("click", e => { if (e.target === el("summaryModal")) closeSummaryModal(); });
map.on("moveend zoomend", () => { if (activeChain.finalPvz) renderMarkers(); });
configureRegion("yoshkar-ola");
setTimeout(() => map.invalidateSize(), 100);
