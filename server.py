"""Local HTTP server, geocoding and cached downloads. Python 3.9+; standard library."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import gzip, hashlib, json, math, os, sys, tempfile, threading, time, webbrowser
from geodata import Builder, ROAD, point_kind

ROOT=Path(__file__).resolve().parent
CACHE=Path(tempfile.gettempdir())/'mesh-atlas-osm-v3'
CACHE.mkdir(exist_ok=True)
lock=threading.Lock()
def getjson(url,timeout=50):
    req=Request(url,headers={'User-Agent':'MeshAtlas/2.0 educational logistics desktop','Accept':'application/json','Accept-Encoding':'gzip'})
    with urlopen(req,timeout=timeout) as r:
        raw=r.read()
        if r.headers.get('Content-Encoding')=='gzip':raw=gzip.decompress(raw)
        return json.loads(raw)

def disk(key,producer):
    path=CACHE/(hashlib.sha256(key.encode()).hexdigest()+'.json')
    if path.exists() and time.time()-path.stat().st_mtime<7*86400:return json.loads(path.read_bytes())
    value=producer()
    with tempfile.NamedTemporaryFile(dir=CACHE,delete=False) as f:
        f.write(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode())
    os.replace(f.name,path)
    return value

def search(query):
    with lock:
        time.sleep(1)
        try:
            result=getjson('https://nominatim.openstreetmap.org/search?'+urlencode({'q':query,'format':'jsonv2','limit':6,'accept-language':'ru'}),15)
            if result:return [{'name':p['display_name'],'lat':float(p['lat']),'lon':float(p['lon']),'bounds':','.join(p['boundingbox'][i] for i in (0,2,1,3))} for p in result]
        except Exception:pass
        result=getjson('https://photon.komoot.io/api/?'+urlencode({'q':query,'limit':6}),20)
        return [dict(name=', '.join(filter(None,(p['properties'].get('name'),p['properties'].get('state'),p['properties'].get('country')))),lat=p['geometry']['coordinates'][1],lon=p['geometry']['coordinates'][0]) for p in result['features']]

def load(name,lat,lon,km,bounds=None):
    dy=km/111.2;dx=dy/max(.1,math.cos(math.radians(lat)))
    box=[max(-85,lat-dy),max(-180,lon-dx),min(85,lat+dy),min(180,lon+dx)]
    if bounds is not None:box=bounds
    bbox=','.join(f'{v:.6f}' for v in box)
    q=f'''[out:json][timeout:90][bbox:{bbox}];(
    way[highway~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$|^(unclassified|residential|living_street|service|road)$"];
    nwr[shop~"^(outpost|pickup|parcel_pickup)$"];nwr[amenity~"^(parcel_locker|post_office)$"];
    nwr[brand~"Wildberries|Ozon|СДЭК|Яндекс Маркет",i];nwr[name~"Wildberries|Пункт выдачи|Ozon|Вайлдберриз",i];
    nwr[building=warehouse];nwr[industrial~"^(warehouse|logistics)$"];nwr[office=delivery];
    way[leisure=park];way[natural=water];way[waterway=river];rel[type=restriction];
    );out geom;'''
    failures=[]
    for base in ['https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']:
        try:
            result=getjson(base+'?'+urlencode({'data':q}),100)
            if result.get('remark'):raise ValueError(result['remark'])
            break
        except Exception as exc:failures.append(str(exc))
    else:raise ValueError('Серверы Overpass недоступны. '+str(failures[-1]))
    b=Builder(name,[lat,lon],box);rules=[]
    for el in result['elements']:
        t=el.get('tags',{});typ=el['type'];ref=el['id']
        if typ=='node':b.point(t,el['lat'],el['lon'],typ,ref)
        elif typ=='way':
            coords=[(nid,g['lat'],g['lon']) for nid,g in zip(el.get('nodes',[]),el.get('geometry',[])) if g]
            b.way(ref,t,coords)
        elif typ=='relation':
            m={x['role']:x for x in el.get('members',[])}
            if all(k in m for k in ('via','from','to')) and m['via']['type']=='node':
                rules.append((m['via']['ref'],m['from']['ref'],m['to']['ref'],t.get('restriction','')))
            elif point_kind(t) and 'bounds' in el:
                box2=el['bounds'];b.point(t,(box2['minlat']+box2['maxlat'])/2,(box2['minlon']+box2['maxlon'])/2,typ,ref)
    for rule in rules:b.turn(*rule)
    if not b.data['roads']:raise ValueError('В этой области нет доступной автомобильной сети.')
    return b.data

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kw):super().__init__(*args,directory=str(ROOT),**kw)
    def do_GET(self):
        u=urlsplit(self.path)
        if not u.path.startswith('/api/'):return super().do_GET()
        q={k:v[0] for k,v in parse_qs(u.query).items()}
        try:
            if u.path=='/api/search':
                text=q['q'].strip()[:160]
                if len(text)<2:raise ValueError('Введите название города')
                val=disk('search:'+text,lambda:search(text))
            elif u.path=='/api/city':
                lat,lon,km=map(float,(q['lat'],q['lon'],q['km']))
                if not (-85<lat<85 and -180<lon<180 and 1<=km<=30):raise ValueError('Некорректная область')
                bounds=None
                if q.get('bounds'):
                    bounds=list(map(float,q['bounds'].split(',')))
                    if len(bounds)!=4 or not (-85<=bounds[0]<bounds[2]<=85 and -180<=bounds[1]<bounds[3]<=180):raise ValueError('Неверная область карты')
                name=q['name'][:120];val=disk(f'city:{lat:.5f}:{lon:.5f}:{km}:{name}:{bounds}',lambda:load(name,lat,lon,km,bounds))
            else:raise ValueError('Нет такого запроса')
            status=200
        except Exception as exc:status=503;val={'error':str(exc)}
        data=json.dumps(val,ensure_ascii=False,separators=(',',':')).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers()
        try:self.wfile.write(data)
        except (ConnectionError,OSError):pass

if __name__=='__main__':
    addr=('127.0.0.1',int(sys.argv[1]) if len(sys.argv)>1 else 0)
    with ThreadingHTTPServer(addr,Handler) as server:
        url='http://127.0.0.1:'+str(server.server_port)+'/';print(url,flush=True)
        if '--no-browser' not in sys.argv:webbrowser.open(url)
        server.serve_forever()


