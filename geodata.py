"""Build one portable OSM road graph, preserving direction, way IDs and turn rules."""
import math
import re
from datetime import datetime, timezone

ROAD = {'motorway':90,'trunk':70,'primary':50,'secondary':45,'tertiary':40,
        'unclassified':35,'residential':30,'living_street':15,'service':15,'road':25}
for kind in ('motorway','trunk','primary','secondary','tertiary'):
    ROAD[kind+'_link'] = 30

def point_kind(t):
    names=' '.join(t.get(k,'') for k in ('name','brand','operator')).lower()
    if t.get('building')=='warehouse' or t.get('industrial') in ('warehouse','logistics','depot') or t.get('warehouse')=='yes':
        return 'hub'
    if (t.get('amenity') in ('parcel_locker','post_office') or t.get('shop') in ('outpost','pickup','parcel_pickup') or
        t.get('office')=='delivery' or re.search(r'wildberries|вайлдберриз|вайлдберис|ozon|озон|яндекс.?маркет|пункт выдачи|сдэк',names)):
        return 'pickup'
    return ''

class Builder:
    def __init__(self,name,center,bbox):
        self.data={'name':name,'center':center,'bbox':bbox,'vertices':[],'roads':[],'areas':[],
                   'points':[],'turns':[],'date':datetime.now(timezone.utc).date().isoformat()}
        self.ids={}
    def inside(self,lat,lon):
        s,w,n,e=self.data['bbox']
        return s<=lat<=n and w<=lon<=e
    def point(self,t,lat,lon,typ,ref):
        role=point_kind(t)
        if role and self.inside(lat,lon):
            addr=' '.join(t.get(k,'') for k in ('addr:street','addr:housenumber')).strip()
            self.data['points'].append({'id':f'{typ}/{ref}','role':role,'name':t.get('name') or t.get('brand') or ('Склад OSM' if role=='hub' else 'Пункт выдачи'),
                'operator':t.get('operator') or t.get('brand',''),'address':addr,'lat':round(lat,6),'lon':round(lon,6),'url':f'https://www.openstreetmap.org/{typ}/{ref}'})
    def way(self,ref,t,coords):
        if len(coords)<2:return
        mid=coords[len(coords)//2]
        role=point_kind(t)
        if role:
            self.point(t,sum(p[1] for p in coords)/len(coords),sum(p[2] for p in coords)/len(coords),'way',ref)
        highway=t.get('highway','')
        if highway in ROAD and t.get('area')!='yes' and t.get('motorcar',t.get('motor_vehicle',t.get('vehicle',t.get('access','yes')))) not in ('no','private','agricultural','forestry'):
            ids=[]
            def flush():
                if len(ids)>1:self.data['roads'].append([ref,t.get('name',''),highway,speed,one,list(ids)])
                ids.clear()
            speed=ROAD[highway];match=re.fullmatch(r'(\d+)(?:\s*(mph))?',t.get('maxspeed',''))
            if match:speed=max(5,min(speed,int(match[1])*(1.609 if match[2] else 1)))
            val=t.get('oneway', 'yes' if t.get('junction')=='roundabout' or highway=='motorway' else '')
            one=-1 if val=='-1' else int(val in ('yes','1','true'))
            for nid,lat,lon in coords:
                if not self.inside(lat,lon):flush();continue
                if nid not in self.ids:
                    self.ids[nid]=len(self.ids);self.data['vertices'].append([round(lat,6),round(lon,6)])
                ids.append(self.ids[nid])
            flush()
        elif self.inside(mid[1],mid[2]):
            kind=('water' if t.get('natural')=='water' or t.get('waterway')=='riverbank' else 'river' if t.get('waterway') in ('river','canal') else 'park' if t.get('leisure') in ('park','garden') or t.get('landuse') in ('forest','grass') else 'building' if 'building' in t and len(coords)<=100 else None)
            if kind:self.data['areas'].append([kind,[[round(p[1],5),round(p[2],5)] for p in coords]])
    def turn(self,via,a,b,kind):
        if via in self.ids and (kind.startswith('only_') or kind.startswith('no_')):
            self.data['turns'].append([self.ids[via],a,b,kind])

