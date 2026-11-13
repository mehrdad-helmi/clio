# Clio

Clio is a static interactive atlas of European history from 700 BCE through 1945 CE. The browser loads the geography once and fetches each political boundary snapshot when needed. Hash routes preserve the atlas year, selected entity, and guided-story step.

## Run locally

```sh
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. The shipped site has no build step or runtime dependencies. `dist/` is the tracked application, not a disposable build directory.

## Data

- `dist/history.js` contains curated eras, people, cities, polities, wars, events, relationships, guided stories, and references.
- `dist/data/maps/` contains projected European and nearby geography derived from [Historical Basemaps](https://github.com/aourednik/historical-basemaps/tree/4b5039e50d8d2464b065bd76ad6086cd4597108d), under the accompanying GPL-3.0 license. Clio keeps the preceding snapshot between source dates. The 1945 snapshot depicts a postwar configuration.
- `dist/data/geography.json` contains public-domain [Natural Earth](https://www.naturalearthdata.com/downloads/50m-physical-vectors/) land, lakes, and rivers.
- To regenerate the map and catalog with GDAL/OGR and pyproj installed, run `python scripts/build-maps.py /path/to/input`. Input files are named `<year>.json` using signed integer years, alongside `land.json`, `lakes.json`, and `rivers_lake_centerlines.json`, containing the corresponding 1:50m Natural Earth GeoJSON.
- The site's Sources & map notes page lists historical references and image credits. Map features without a curated article link to a record with their source and dates of appearance.

Run `node scripts/check.mjs` to validate source references, routes, and the map inventory.
