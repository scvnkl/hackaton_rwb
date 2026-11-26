const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function pilot(region = "yoshkar-ola") {
  const controls = Object.fromEntries(Object.entries({
    batch:20, dim0:25, dim1:20, dim2:10, kg:2, storageDays:0, flowSlider:100, shelfSlider:100,
    truckCountSlider:1, incident:"none", stress:false, useCompetition:true, bulkConsent:false
  }).map(([id,value]) => [id, {value, checked:value === true}]));
  const ctx = vm.createContext({structuredClone, window:{}, document:{getElementById:id => controls[id]}});
  for (const file of ["src/config.js","data/locations.js","data/routes.js","data/regions/catalogs.js",
    "data/regions/roads.js","src/core/geo.js","src/core/regions.js","src/core/roads.js",
    "src/core/loadindex.js","src/core/sla.js","src/state.js","src/model/capacity.js",
    "src/model/trips.js","src/model/shift.js"]) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname,"..",file),"utf8"),ctx,{filename:file});
  }
  const run = code => vm.runInContext(code,ctx);
  ctx.region = region;
  run(`regionId = region;
    setNetwork(region);
    const c = REGION_CATALOGS[region];
    geoMode = region === "cheboksary" ? "intercity" : "local";
    if (c.depots?.length) ["sc1","sc2"].forEach((k,i) => SC_NODES[k].latlng = c.depots[i]);
    finalPvzId = c.defaultId || PVZ_LIST[0].id;
    activeChain.finalPvz = cityById.get(finalPvzId);
    hubPool = candidatePoints();
  `);
  return {run,controls};
}

test("четыре стартовые зоны имеют полный автомобильный маршрут и доступный хаб WB", () => {
  for (const key of ["yoshkar-ola","cheboksary","kazan","moscow"]) {
    const {run} = pilot(key);
    assert.equal(run('PVZ_LIST.every(p => p.brand==="wb") && ["wb","ozon","ym"].every(b=>networkPoints.some(p=>p.brand===b))'),true);
    assert.equal(run('const r=choose("hybrid",20,0,"error",[]); r.hub.brand'),"wb");
    assert.equal(run('r.phases.filter(p=>p.leg).every(p=>p.leg.track.length>2 && p.leg.track.at(-1)[2]>0)'),true);
    assert.equal(run('r.scans.reduce((n,s)=>n+s.delta,0)'),20);
  }
});

test("контроль и гибрид разделяют спрос и возвращают одинаковый бюджет при перегрузке", () => {
  const {run,controls} = pilot();
  run('runs={direct:schedule("direct"),hybrid:schedule("hybrid")}');
  assert.equal(run('runs.direct.demand'),run('runs.hybrid.demand'));
  assert.ok(run('issuedP95(runs.direct)') > 0);
  assert.equal(run('issuedP95({trips:[]})'),null);
  assert.equal(run('Math.round(100*(metrics("hybrid",480).margin-metrics("direct",480).margin))'),315271);
  controls.stress.checked = true;
  run('runs={direct:schedule("direct"),hybrid:schedule("hybrid")}');
  assert.equal(run('runs.hybrid.trips.every(t=>t.mode==="direct")'),true);
  assert.equal(run('metrics("hybrid",480).margin'),run('metrics("direct",480).margin'));
});

test("без дороги сравнение недоступно, без согласия габарит едет через СЦ", () => {
  const {run,controls} = pilot("kazan");
  run('volumes.oversize.forEach((n,i) => el(i===3?"kg":"dim"+i).value=n)');
  assert.equal(run('choose("hybrid",2,0,"none",[]).mode'),"direct");
  controls.bulkConsent.checked = true;
  assert.equal(run('const r=choose("hybrid",2,0,"none",[]); r.premium'),120);
  assert.equal(run('r.rows["Габарит · грузчики"]'),80);
  assert.equal(run('r.rows["Габарит · выплата ПВЗ"]'),100);
  run('cityById.set("missing",{id:"missing",latlng:[55.8,49.11]}); finalPvzId="missing"');
  assert.equal(run('choose("hybrid",2,0,"none",[])'),null);
});

test("соседний конкурент влияет на загрузку и остаётся за пределами списка хабов", () => {
  const {run} = pilot();
  run('const target={id:"target",brand:"wb",latlng:[55,49]}; rebuildDensity([target]);');
  const sparse = run('effectiveLoad(target)');
  run('rebuildDensity([target,{id:"next",brand:"ozon",latlng:[55.0001,49]}])');
  assert.ok(run('effectiveLoad(target)') < sparse);
  assert.equal(run('hubPool.every(p=>p.brand==="wb")'),true);
});

test("плотность соседей определяет фон, доступную полку и бюджет времени", () => {
  const {run,controls} = pilot();
  run(`const target={id:"target",brand:"wb",latlng:[69,30]};
    const wb={id:"neighbor",brand:"wb",latlng:[69,30.003]};
    const ozon={id:"ozon",brand:"ozon",latlng:[69,30.001]};
    const far={id:"far",brand:"wb",latlng:[69.05,30]};
    rebuildDensity([target,far]);`);
  assert.equal(run("backgroundLoad(target)"),70);
  assert.equal(run("competitionIndex(target)"),0);
  const sparseLitres = run("room(target).litres");
  const sparseMinutes = run("room(target).minutes");
  run("rebuildDensity([target,wb,ozon,far])");
  assert.equal(run("summarizeNeighborhood(target).counts.wb"),1);
  assert.equal(run("summarizeNeighborhood(target).counts.ozon"),1);
  const weighted = run("competitionIndex(target)");
  assert.ok(weighted>1 && weighted<1.7);
  assert.ok(run("room(target).litres")>sparseLitres);
  assert.ok(run("room(target).minutes")>sparseMinutes);
  controls.useCompetition.checked=false;
  assert.ok(run("competitionIndex(target)")>0 && run("competitionIndex(target)")<weighted);
  const load = run("backgroundLoad(target)");
  run('stock.set(target.id,{units:5,litres:150,fee:0})');
  assert.equal(run("calcLoadPct(target,120)"),load+9);
  assert.equal(run("room(target,120).litres"),3000*(100-load)/100-270);
  controls.flowSlider.value=200;
  assert.ok(run("backgroundLoad(target)")>load);
});

test("обычные и повёрнутые вручную введённые коробки соблюдают тариф, вместимость и согласие", () => {
  const {run,controls} = pilot();
  for(const sides of [[90,45,40,18],[40,90,45,18]]){
    sides.forEach((v,i)=>controls[i===3?"kg":"dim"+i].value=v);
    assert.equal(run("parcelCategory()"),"oversize");
    assert.equal(run("volume()"),162);
    controls.bulkConsent.checked=false;
    assert.equal(run('choose("hybrid",2,0,"none",[]).price'),403);
    assert.equal(run('choose("hybrid",2,0,"none",[]).mode'),"direct");
    controls.bulkConsent.checked=true;
    assert.equal(run('choose("hybrid",2,0,"none",[]).price'),523);
    assert.equal(run('choose("hybrid",12,0,"none",[]).price'),471);
    assert.equal(run('choose("hybrid",20,0,"none",[]).mode'),"direct");
    assert.match(run('choose("hybrid",20,0,"none",[]).reason'),/литр|3\s240 л/);
  }
  controls.dim0.value=-25;
  assert.equal(run("fits()"),false);
  assert.equal(run("manifest()"),0);
});

test("проверка конца смены учитывает альтернативу на бульваре Ураева", () => {
  const {run,controls} = pilot();
  controls.flowSlider.value=200;
  controls.batch.value=50;
  controls.truckCountSlider.value=2;
  const delivered=run('const surge=schedule("hybrid"); metrics("hybrid",480,surge).issued');
  assert.equal(delivered,400);
  assert.ok(run("surge.trips.every(r=>r.end<=480)"));
  run('hubPool=hubPool.filter(p=>["yo-6","yo-8"].includes(p.id)); const start=365.86;');
  assert.equal(run('choose("hybrid",50,start,"none",[]).hub.id'),"yo-8");
  assert.equal(run('choose("direct",50,start,"none",[],start,480)'),null);
  assert.equal(run('const last=choose("hybrid",50,start,"none",[],start,480); last.hub.id'),"yo-6");
  assert.ok(run("last.end < 480 && last.end > 479"));
  assert.equal(run("Math.round(last.margin*100)"),255820);
});

test("пять суток занимают полку до погрузки, оплата хабу учтена один раз", () => {
  const {run,controls} = pilot();
  controls.batch.value=10;
  controls.flowSlider.value=70;
  controls.shelfSlider.value=50;
  controls.storageDays.value=5;
  run('const hybrid=schedule("hybrid"), central=schedule("direct");const first=hybrid.trips[0],lot=first.openingLot;');
  assert.equal(run("lot.units"),10);
  assert.equal(run("lot.litres"),50);
  assert.equal(run("lot.receivedAt"),-7200);
  for(const t of ["-7200","0","lot.pickup","lot.releasedAt-0.01"]){
    assert.equal(run("reservedAt(hybrid.book,lot.id,"+t+")"),50);
  }
  assert.equal(run("reservedAt(hybrid.book,lot.id,lot.releasedAt)"),0);
  assert.equal(run("first.seller.storage"),40);
  assert.equal(run('central.trips[0].openingLot.id'),"sc-2");
  assert.equal(run("central.trips[0].seller.storage"),40);
  assert.equal(run("central.trips[0].pvzStorage"),0);
  for(const t of [0,"lot.releasedAt-0.01","lot.releasedAt",480,0,480]){
    const released=t==="lot.releasedAt" || t===480;
    assert.equal(run('metrics("hybrid",'+t+',hybrid).pvzStorage'),released?40:0);
  }
  assert.equal(run('hybrid.trips.reduce((sum,t)=>sum+t.seller.storage,0)'),40);
  assert.equal(run('const m=metrics("hybrid",480,hybrid); m.pvz'),run("m.pvzBase + m.pvzHub + 40"));
});

test("свободная полка определяется пиком одновременных резервов", () => {
  const {run} = pilot();
  run('const point=hubPool[0], cap=room(point).litres; const claim=(a,b,part,work=0)=>({id:point.id,a,b,litres:part*cap,work});');
  assert.equal(run("canReserve(point,[claim(0,30,0.5)],[claim(0,15,0.5),claim(15,30,0.5)])"),true);
  assert.equal(run("canReserve(point,[claim(0,30,0.6)],[claim(15,20,0.5)])"),false);
  assert.equal(run("canReserve(point,[claim(0,10,0.1,10)],[claim(5,8,0.1,3)])"),false);
});

test("покрытие штатного полного пути и отсутствие денег при неизвестной дороге", () => {
  for(const [key,count] of Object.entries({"yoshkar-ola":8,cheboksary:5,kazan:1,moscow:1})){
    const {run} = pilot(key);
    assert.equal(run('const saved=p=>hasSavedItinerary(roadItinerary(chain("direct",null,p.id),"none")); PVZ_LIST.filter(saved).length'),count);
    run('finalPvzId=PVZ_LIST.find(p=>!saved(p)).id; hubPool=candidatePoints();');
    for(const mode of ["direct","hybrid"]){
      const expr='schedule("'+mode+'")';
      assert.equal(run(expr+'.missingRoads'),true);
      assert.equal(run('metrics("'+mode+'",480,'+expr+').margin'),null);
    }
  }
});

test("проверка точек отклоняет конфликт с другим брендом и ID сортцентра", () => {
  const {run} = pilot();
  run('const wb={brand:"wb",name:"А",id:"x",latlng:[55,49]}, ozon={...wb,brand:"ozon",latlng:[55.5,49]}; const before=PVZ_LIST.length;');
  assert.throws(()=>run('validateCatalog({city:"Тест",points:[ozon,wb]})'),/ID/);
  assert.throws(()=>run('validateCatalog({city:"Тест",points:[{...wb,id:"sc-1"}]})'),/ID/);
  assert.throws(()=>run('validateCatalog({city:"Тест",points:[ozon]})'),/WB/);
  assert.equal(run('PVZ_LIST.length===before && cityById.has(finalPvzId)'),true);
  assert.equal(run('validateCatalog({city:"Тест",points:[wb,{...ozon,id:"y"}]}).points.length'),2);
});
