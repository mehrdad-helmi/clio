import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {art,connections,entities,eras,eraAt,events,sources,stories} from '../dist/history.js';

const load = path => JSON.parse(readFileSync(new URL(`../dist/data/${path}.json`,import.meta.url),'utf8'));
const catalog = load('catalog');
const points = load('points');
const records = new Map([...eras,...entities,...events].map(row => [row.id,row]));
assert.equal(records.size,eras.length+entities.length+events.length);
for (const record of records.values()) {
  assert(sources[record.source],`${record.id} requires a source`);
  assert.equal(eraAt(record.year).kind,'Era');
  if (Number.isFinite(record.lon)) assert(points[record.id]?.every(Number.isFinite),record.id);
}
for (const event of events) for (const id of event.ids) assert(records.has(id),`${event.id} → ${id}`);
for (const [a,b] of connections) assert(records.has(a) && records.has(b),`${a} → ${b}`);
for (const story of stories) {
  assert.equal(records.get(story.era)?.kind,'Era');
  assert(story.steps.every(id => records.get(id)?.ids),story.id);
}
assert.equal(catalog.years[0],-700);
assert.equal(catalog.years.at(-1),1945);
for (const year of catalog.years) {
  const shapes = load(`maps/${year}`);
  assert(shapes.length > 10,year);
  for (const [name,,path,x,y] of shapes) assert(catalog.records[name]?.includes(year) && path.startsWith('M') && Number.isFinite(x+y),name);
}
for (const [file] of Object.values(art)) assert(existsSync(new URL(`../dist/assets/${file}`,import.meta.url)),file);
console.log(`${catalog.years.length} snapshots, ${Object.keys(catalog.records).length} boundary labels, ${events.length} timeline events, ${stories.length} guided stories, ${records.size} curated records`);
