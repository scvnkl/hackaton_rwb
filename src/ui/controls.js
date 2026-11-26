const numericFields=["batch","dim0","dim1","dim2","kg","storageDays"];
const fieldNames={batch:"Заказов в партии",dim0:"Длина",dim1:"Ширина",dim2:"Высота",kg:"Масса",storageDays:"Сутки хранения"};
const sizeNames={small:"малая",medium:"средняя",oversize:"габаритная"};

function renderManualStock(message=""){
  const item=inventory(el("stockPoint").value);
  el("stockStatus").textContent="Остаток "+item.units+" шт. · "+item.litres.toLocaleString("ru-RU")+" л · начислено ПВЗ за счёт продавца "+rub(item.fee)+". "+message;
}
function storeAction(action){
  if(!validateInputs())return;
  const id=el("stockPoint").value, point=cityById.get(id);
  if(!point)return;
  const entry={...inventory(id)},unit=volume();
  if(action==="receive"){
    const claimed=reservedAt(runs[routeMode]?.book||[],id,elapsed);
    if(entry.units||!fits()||unit*10>room(point,claimed).litres){
      renderManualStock("Отказ: проверьте остаток, габариты и доступный объём полки.");return;
    }
    Object.assign(entry,{units:10,litres:10*unit,unit});
  }else if(action==="sell" && entry.units>=2){
    entry.units-=2;entry.litres=entry.units*entry.unit;
  }else if(action==="day"){
    entry.fee+=entry.units*CONFIG.storagePerBoxDay;
  }else return;
  stock.set(id,entry);updateParameters();
}

function setUnavailable(message){
  stopClock();elapsed=0;planIssue=message;
  runs={};previews={direct:null,hybrid:null};
  activeChain.hubPvz=null;
  el("planStatus").hidden=false;
  el("planStatus").textContent=message;
  el("btnToggleSim").disabled=true;el("scrub").disabled=true;
  el("scrub").value=0;el("simClock").textContent="Смена —";
  for(const id of ["stDelivered","stActiveTrucks","stMpSaved","stPvzEarned","mDirectKm","mHybridKm","priceDirect","priceHybrid"])
    el(id).textContent="—";
  el("truckLegStatus").textContent="Ожидание расчёта";
  el("liveLog").textContent="";el("chainExplanation").textContent=message;
  el("metaHybrid").textContent="Расчёт приостановлен";el("costSplitCard").replaceChildren();
  el("storedLot").hidden=true;
  trucksLayer.clearLayers();markers.clear();plot([]);updateMapContext([],true);
  if(drawerOpen)renderAnalyticsDrawer();
  if(el("summaryModal").classList.contains("open"))openSummaryModal();
}

function validateInputs(){
  const invalid=numericFields.find(id=>!el(id).checkValidity()||!Number.isFinite(val(id)));
  if(invalid || !Number.isSafeInteger(val("batch")) || !Number.isSafeInteger(val("storageDays")*1440)){
    const id=invalid||(!Number.isSafeInteger(val("batch"))?"batch":"storageDays");
    setUnavailable("Проверьте поле «"+fieldNames[id]+"». Результаты предыдущего расчёта устарели.");
    return false;
  }
  return true;
}
function updateParameters(){
  if(!validateInputs())return;
  const next=candidatePoints();
  if(next.length!==hubPool.length||next.some((p,i)=>p!==hubPool[i]))refreshDestination();
  else recalculateAll();
}

function renderLoadDetail(final, reserved=0){
  const profile=summarizeNeighborhood(final),counts=profile.counts;
  const {radius,perKm2}=profile;
  const effective=competitionIndex(final);
  el("mFinalLoad").textContent=calcLoadPct(final,reserved)+"%";
  el("loadDetail").textContent="В радиусе "+(radius/1000).toLocaleString("ru-RU")+" км: WB "+counts.wb+", Ozon "+counts.ozon+", Яндекс Маркет "+counts.ym+
    " · "+perKm2.toLocaleString("ru-RU",{maximumFractionDigits:1})+" точек/км². Индекс с учётом расстояния и бренда: "+effective.toLocaleString("ru-RU",{maximumFractionDigits:2})+
    ". Фоновая загрузка "+backgroundLoad(final)+"%, свободно "+Math.floor(room(final,reserved).litres).toLocaleString("ru-RU")+" л. Источник точки: "+final.origin+". При одинаковом районном спросе соседи делят поток заказов.";
}

function recalculateAll(){
  if(!validateInputs())return;
  stopClock();elapsed=0;
  const final=cityById.get(finalPvzId);
  activeChain.finalPvz=final;
  const size=parcelCategory(), consent=el("bulkConsent");
  if(size!=="oversize")consent.checked=false;
  el("bulkConsentRow").hidden=size!=="oversize";
  el("packageClass").textContent=sizeNames[size];
  for(const button of document.querySelectorAll("[data-size]"))button.classList.toggle("active",button.dataset.size===size);
  el("headerSubStatus").textContent="Диспетчер WB · модель смены · координаты СЦ сценарные";
  el("ordersCountLabel").textContent=Math.round(140*val("flowSlider")/100)+" зак/ч";
  el("shelfValue").textContent=(val("shelfSlider")-100)+" п.п.";
  el("flowLabel").textContent=val("flowSlider")/100+"×";
  el("truckCountLabel").textContent=val("truckCountSlider");
  renderManualStock();renderLoadDetail(final);
  const n=manifest(),incident=el("incident").value;
  if(!n){setUnavailable("Партия не помещается в машину. Проверьте размеры и массу.");return;}
  if(!hasItinerary(roadItinerary(chain("direct",null),incident))){
    setUnavailable("Недостаточно дорожных данных. Для этого адреса нет полной цепочки через СЦ. Обновите дороги или выберите адрес из группы «Через СЦ офлайн».");return;
  }
  planIssue="";
  el("planStatus").hidden=true;el("btnToggleSim").disabled=false;el("scrub").disabled=false;
  for(const mode of ["direct","hybrid"]){
    previews[mode]=choose(mode,n,0,incident,[],0,Infinity,val("storageDays"));
    runs[mode]=schedule(mode);
  }
  const h=previews.hybrid,d=previews.direct;
  activeChain.hubPvz=h?.hub;
  activeChain.directKm=d?.outKm;activeChain.hybridKm=h?.outKm;
  el("mDirectKm").textContent=d?d.outKm.toFixed(2)+" км":"—";
  el("mHybridKm").textContent=h?h.outKm.toFixed(2)+" км":"—";
  el("metaDirect").textContent=d?.openingLot ? "Первая партия ожидает на СЦ 2. Машина выезжает из СЦ 1 за запасом." : "Обработка партии на СЦ 1 и СЦ 2.";
  el("priceDirect").textContent=tariffLabel("direct");el("priceHybrid").textContent=tariffLabel("hybrid");
  el("metaHybrid").textContent=!h?"Недостаточно дорожных данных":h.mode==="direct"?"Через СЦ за "+rub(h.price)+" / заказ. "+h.reason+".":
    h.premium ? "Тариф СЦ "+rub(h.referencePrice)+" + доплата "+rub(h.premium)+(h.compPerOrder?" − компенсация "+rub(h.compPerOrder):"")+" = "+rub(h.price)+" / заказ." : "К оплате с учётом скидки и SLA: "+rub(h.price)+" / заказ.";
  el("costSplitCard").replaceChildren(econTable());
  updateClock(true);
  if(drawerOpen)renderAnalyticsDrawer();
  if(el("summaryModal").classList.contains("open"))openSummaryModal();
}

function populateSelect(){
  const local=document.createElement("optgroup"), online=document.createElement("optgroup");
  local.label="Через СЦ офлайн · "+savedDestinations.size;
  online.label="Остальные адреса · дороги по сети";
  for(const p of PVZ_LIST)(savedDestinations.has(p.id)?local:online).append(new Option(p.name,p.id));
  el("finalPvzSelect").replaceChildren(...[local,online].filter(g=>g.children.length));
  el("finalPvzSelect").value=finalPvzId;
}

function onFinalPvzChange() {
  finalPvzId = document.getElementById("finalPvzSelect").value;
  refreshDestination();
}

function setGeo(g) {
  configureRegion(g === "intercity" ? "cheboksary" : "yoshkar-ola");
}

function setSize(size) {
  volumes[size].forEach((v,i)=>el(i===3?"kg":"dim"+i).value=v);
  updateParameters();
}

function setRouteMode(mode) {
  if(!["direct","hybrid"].includes(mode))return;
  routeMode=mode;
  for(const [id,key] of [["optDirect","direct"],["optHybrid","hybrid"]])
    el(id).classList.toggle("active",key===routeMode);
  if(!planIssue)updateClock(true);
}

function setStyleMode(m) {
  if (m === "2gis" && !gisKey) {
    const field = el("gisKey");
    field.closest("details").open = true;
    field.focus();
    return;
  }
  if (m !== "2gis") stopGisLayer();
  styleMode = m;
  el("btn2gis").classList.toggle("active", m === "2gis");
  document.getElementById("btnVec").classList.toggle("active", m === "vector");
  document
    .getElementById("btnSat")
    .classList.toggle("active", m === "satellite");
  const nativeAtlas = ["yoshkar-ola","cheboksary"].includes(regionId);
  if (REGION_STREETS[regionId] && !regionAtlases.has(regionId))
    regionAtlases.set(regionId, new VectorAtlas(REGION_STREETS[regionId]));
  const background = nativeAtlas ? localAtlas : regionAtlases.get(regionId);
  const visible = m === "satellite" ? [satLayer] :
    [background, !nativeAtlas && m === "vector" ? streetLayer : null].filter(Boolean);
  for (const layer of [satLayer, streetLayer, localAtlas, ...regionAtlases.values()]) {
    if (!visible.includes(layer)) map.removeLayer(layer);
  }
  for (const layer of visible) layer.addTo(map);
  if (m === "2gis") showGisLayer();
  setTimeout(() => map.invalidateSize(), 100);
}
