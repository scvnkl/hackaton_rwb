// Run with Node.js: node check.cjs
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const dir = __dirname;
const scope = vm.createContext({ assert, console, window: {} });
for (const f of ["network.js", "simulation.js", "data/yoshkar-ola.js"])
  vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), scope);
vm.runInContext(
  `
const net=new RoadNetwork(window.cityData),hub=net.points.find(p=>p.role==='hub'),points=spread(net.points.filter(p=>p.role==='pickup'),12);
const s={seed:42,orders:3500,visits:100,profile:'return',staff:3,vans:16,capacity:35,shelf:1200,traffic:1.25,launch:240,perKm:24,tariff:18,interval:45};
const input=demand(s,points);assert.deepEqual(input,demand(s,points));
const sparse = Object.values(input.coverage).sort((a,b)=>a.metres-b.metres);
assert(sparse[0].visits < sparse.at(-1).visits);
assert(input.orders.some(o=>o.bulky && !o.consent));
assert(input.orders.some(o=>o.bulky && o.consent));
for(const mode of Object.keys(STRATEGIES)){
 const r=simulate(net,points,hub,input,s,mode);assert.equal(r.orders.length,s.orders);
 assert.equal(r.issued+r.unserved,s.orders);assert(r.km>0&&r.cost>0);
 let onDuty=new Map(),routes=new Set();
 for(const trip of r.trips.slice().sort((a,b)=>a.start-b.start)){
   assert(trip.count<=s.capacity&&trip.count>0 && trip.litres <= 1200);
   assert(trip.start>=(onDuty.get(trip.van)||0)-1e-7);
   onDuty.set(trip.van,trip.end);
   for(const [a,b] of [[trip.emptyFrom,trip.from],[trip.from,trip.to]]){
     if(routes.has(a+'>'+b))continue;routes.add(a+'>'+b);
     let route=net.route(net.byId.get(a),net.byId.get(b));
     for(let i=1;i<route.verts.length;i++)assert(net.adj[route.verts[i-1]].some(e=>e.to===route.verts[i]&&e.way===route.ways[i-1]));
   }
 }
 for(const o of r.orders){
   assert.equal(o.volume,o.dimensions.reduce((v,x)=>v*x,1)/1000);
   if(o.bulky && !o.consent) assert.notEqual(o.policy,'ПВЗ → ПВЗ');
   if(o.premiumPaid){
     assert(o.bulky && o.consent && o.issued != null);
     assert.equal(o.policy,'ПВЗ → ПВЗ');
     assert.equal(o.premiumPVZ+o.premiumMP+o.loaders,o.premiumPaid);
   }
   if(o.issued!=null) assert.equal(o.buyer,o.returned ? 0 : o.quote);
   if(o.policy==='ПВЗ → ПВЗ') assert.equal(o.sorting,0);
 }
 assert(Math.abs(r.profit-r.nodes.reduce((sum,n)=>sum+n.partnerIncome-n.partnerCost,0))<1e-5);
 for(const n of r.nodes){assert.equal(n.reserved,0);assert(n.shelf>=0);assert((n.stockHistory||[]).every(([,v])=>v>=0));}
 assert(Math.abs(r.cost-r.orders.reduce((sum,o)=>sum+o.cost,0))<.00001);
 for(const o of r.orders.filter(o=>o.returned&&o.issued!=null)){assert.equal(o.seller,0);assert.equal(o.status,'Возврат на остатке')}
 console.log(mode,r.issued+' / '+r.orders.length,'выдано,',r.trips.length,'рейсов,',routes.size,'направлений по графу');
}
const tiny={vertices:[[55,49],[55,49.001],[55,49.002],[55.001,49.001]],points:[],turns:[[1,11,12,'no_straight_on']],roads:[[11,'','residential',30,1,[0,1]],[12,'','residential',30,1,[1,2]],[13,'','residential',30,1,[1,3,2]]]};
const graph=new RoadNetwork(tiny),a={vertex:0},b={vertex:2};
assert.deepEqual(graph.route(a,b).verts,[0,1,3,2]);assert.equal(graph.route(b,a),null);assert.equal(graph.route(a,b,13),null);
console.log('OK');
`,
  scope,
);
