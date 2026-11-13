#!/usr/bin/env python3
"""Prepare Europe map assets from Historical Basemaps and Natural Earth GeoJSON."""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from osgeo import ogr
from pyproj import Proj

SOURCE = Path(sys.argv[1])
OUT = Path(__file__).resolve().parents[1] / 'dist' / 'data'
PROJECTION = Proj(proj='lcc', lat_1=35, lat_2=65, lat_0=52, lon_0=15, datum='WGS84')
SCALE = 0.00016
BOX = ogr.CreateGeometryFromWkt('POLYGON ((-39 26, 87 26, 87 83, -39 83, -39 26))')


def project(lon, lat):
    x, y = PROJECTION(lon, lat)
    return round(560 + x * SCALE, 1), round(290 - y * SCALE, 1)


def parts(geometry, kind):
    name = geometry.GetGeometryName()
    if name == kind:
        yield geometry
    elif name.startswith('MULTI') or name == 'GEOMETRYCOLLECTION':
        for part in geometry:
            yield from parts(part, kind)


def line(geometry, close=False):
    points = [project(*point[:2]) for point in geometry.GetPoints()]
    if close:
        points = points[:-1]
    if not points:
        return ''
    return 'M' + 'L'.join(f'{x:g},{y:g}' for x, y in points) + ('Z' if close else '')


def get_geometries(feature, kind, threshold):
    data = feature.get('geometry')
    if not data:
        return
    geometry = ogr.CreateGeometryFromJson(json.dumps(data))
    if not geometry or not geometry.Intersects(BOX):
        return
    if not geometry.IsValid():
        geometry = geometry.MakeValid()
    if not geometry:
        return
    # Reduce vertices before clipping so adjacent borders follow the same sampled coastline.
    geometry = geometry.SimplifyPreserveTopology(threshold)
    clipped = geometry.Intersection(BOX)
    if clipped:
        yield from parts(clipped, kind)


def read(name):
    return json.loads((SOURCE / f'{name}.json').read_text())['features']


def write(name, data):
    (OUT / f'{name}.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))


def physical(name, kind, threshold):
    shapes = []
    for feature in read(name):
        for geometry in get_geometries(feature, kind, threshold):
            if kind == 'POLYGON':
                shapes.append(''.join(line(ring, True) for ring in geometry))
            else:
                shapes.append(line(geometry))
    return ''.join(shapes)


def political(year):
    groups = defaultdict(list)
    labels = {}
    for feature in read(year):
        props = feature['properties']
        name = props.get('NAME')
        if not name or not str(name).strip():
            continue
        name = str(name).strip()
        for polygon in get_geometries(feature, 'POLYGON', 0.027):
            area = polygon.GetArea()
            if area < 0.0008:
                continue
            group = (name, str(props.get('PARTOF') or name).strip())
            groups[group].append(''.join(line(ring, True) for ring in polygon))
            if area > labels.get(group, [0])[0]:
                point = polygon.PointOnSurface()
                labels[group] = [area, *project(point.GetX(), point.GetY())]
    features = []
    for group, paths in groups.items():
        name, parent = group
        area, x, y = labels[group]
        features.append([name, parent, ''.join(paths), x, y, round(area, 4)])
    features.sort(key=lambda row: row[-1], reverse=True)
    write(f'maps/{year}', features)
    return features


OUT.joinpath('maps').mkdir(parents=True, exist_ok=True)
write('geography', {
    'land': physical('land', 'POLYGON', 0.035),
    'lakes': physical('lakes', 'POLYGON', 0.035),
    'rivers': physical('rivers_lake_centerlines', 'LINESTRING', 0.035),
    'grid': ''.join(line(ogr.CreateGeometryFromWkt(f'LINESTRING ({coords})'))
                    for coords in [*( ','.join(f'{lon} {lat}' for lat in range(30, 76)) for lon in range(-30, 66, 10)),
                                   *( ','.join(f'{lon} {lat}' for lon in range(-33, 66)) for lat in range(30, 76, 5))]),
})
years = sorted(int(p.stem) for p in SOURCE.glob('*.json') if re.fullmatch(r'-?\d+', p.stem))
records = defaultdict(set)
for year in years:
    for name, _, _, _, _, _ in political(year):
        records[name].add(year)
write('catalog', {'years': years, 'records': {name: sorted(dates) for name, dates in sorted(records.items())}})
print(f'{len(years)} snapshots, {len(records)} boundary labels')
