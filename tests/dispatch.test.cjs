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
  run('parcelSize="oversize"; volumes.oversize.forEach((n,i) => el(i===3?"kg":"dim"+i).value=n)');
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
  run('const target={id:"target",brand:"wb",latlng:[55,49],baseLoad:40}; rebuildDensity([target]);');
  const sparse = run('effectiveLoad(target)');
  run('rebuildDensity([target,{id:"next",brand:"ozon",latlng:[55.0001,49]}])');
  assert.ok(run('effectiveLoad(target)') < sparse);
  assert.equal(run('hubPool.every(p=>p.brand==="wb")'),true);
});
