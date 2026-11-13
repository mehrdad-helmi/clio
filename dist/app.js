import {art, connections, entities, eras, eraAt, events, formatYear, kinds, sources, stories} from './history.js';
import {arrow, entityRoute, escape, icon, outward, recordDate, resultRow, storyRoute, url} from './ui.js';
import {mapFrame, mountMap} from './atlas-map.js';

const main = document.querySelector('#main');
const searchDialog = document.querySelector('#search-dialog');
const searchInput = document.querySelector('#search-input');
const searchResults = document.querySelector('#search-results');
const initialYear = 1815;
const firstYear = -700;
const lastYear = 1945;
const eraLabels = ['Greek World','Roman World','Early Medieval','Late Medieval','Early Modern','Revolution','Industrial','World Wars'];
const mapCache = new Map();
const book = new Map([...eras,...entities,...events].map(record => [record.id,record]));
const boundaryLookup = new Map();
const textAliases = new Map();
const timelineMarks = [-700,-323,100,500,900,1300,1600,1945];
const graphEdges = [
  ...connections.map(([a,b,label,start,end,endEvent,startEvent]) => ({a,b,label,start,end,endEvent,startEvent})),
  ...events.flatMap(event => event.ids.map(b => ({a:event.id,b,label:'involved',start:event.year,end:event.year}))),
];
const cityRecords = entities.filter(row => row.kind === 'City' || row.kind === 'Place');
let catalog, geography, points, allRecords, recordLinks;
let active = {};
let mountedMap;
let playTimer;
let pageSize = 36;
let indexKind = '';
let indexQuery = '';

const normalize = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
const rowById = id => book.get(id);
const eraArt = row => row.art || (row.id === 'constantinople' || row.id === 'siege' ? 'medieval' : eraAt(row.year).art);
const toSlider = year => year > 0 ? year-1 : year;
const fromSlider = value => value >= 0 ? value+1 : value;
const validYear = (value,fallback=initialYear) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= firstYear && year <= lastYear && year !== 0 ? year : fallback;
};
const readYear = (value,fallback) => validYear(String(value).trim().replace(/^([1-9]\d*)\s*(?:BCE|BC)$/i,'-$1').replace(/\s*(?:CE|AD)$/i,''),fallback);
const yearOptions = (state = active) => ({year:state.year,event:state.event?.id,story:state.story?.id,layer:state.layer === 'physical' ? 'physical' : undefined});
const sourceLink = key => sources[key] ? outward(sources[key][1],sources[key][0]) : '';
const sectionHead = (title,link = '') => `<div class="section-head"><h2>${escape(title)}</h2>${link}</div>`;

async function json(path) {
  const response = await fetch(`./data/${path}.json`);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

function getRows(year) {
  if (!mapCache.has(year)) mapCache.set(year,json(`maps/${year}`).catch(error => {mapCache.delete(year);throw error;}));
  return mapCache.get(year);
}

function mapRecord(name,year) {
  if (name === 'Germany') {
    if (year >= 1933 && year < 1945) return rowById('nazi-germany');
    if (year >= 1919 && year < 1933) return rowById('weimar');
    if (year >= 1871 && year <= 1918) return rowById('german-empire');
  }
  if (name === 'Italy' && (year < 1861 || year > 1945)) return rowById(`boundary:${name}`);
  if (['Persia','Persian Empire'].includes(name) && year >= -330) return rowById(`boundary:${name}`);
  if (name === 'Russia' && (year < 1721 || year >= 1917)) return rowById(`boundary:${name}`);
  return boundaryLookup.get(normalize(name)) || rowById(`boundary:${name}`);
}

function buildCatalog() {
  const addAlias = (index, name, row) => {if (!index.has(normalize(name))) index.set(normalize(name),row);};
  for (const row of entities) {
    for (const name of [row.title,...row.aliases]) {
      addAlias(textAliases,name,row);
      if (row.kind === 'Polity') addAlias(boundaryLookup,name,row);
    }
  }
  const mapAliases = {
    'Empire of Alexander':'macedon','Carthaginian Empire':'carthage','Roman Empire (East)':'byzantium',
    'Ottoman Empire (Turkey)':'ottoman','Ottoman dynasty':'ottoman','Romania (Byzantine Empire)':'byzantium',
  };
  for (const [name,id] of Object.entries(mapAliases)) addAlias(boundaryLookup,name,rowById(id));
  const appearances = new Map();
  for (const [title,years] of Object.entries(catalog.records)) {
    const id = `boundary:${title}`;
    book.set(id,{id,title,kind:/cultures?|hunter-gatherers|pastoralists|nomads|farmers/i.test(title) ? 'Region' : 'Polity',year:years[0],aliases:[],source:'boundaries',boundary:true,years});
    for (const year of years) {
      const row = mapRecord(title,year);
      if (!appearances.has(row.id)) appearances.set(row.id,new Set());
      appearances.get(row.id).add(year);
    }
  }
  for (const [id,years] of appearances) rowById(id).years = [...years].sort((a,b) => a-b);
  allRecords = [...book.values()].filter(row => !row.boundary || appearances.has(row.id));
  allRecords.sort((a,b) => Number(Boolean(a.boundary))-Number(Boolean(b.boundary)) || a.title.localeCompare(b.title));
  for (const row of allRecords.filter(row => row.boundary)) addAlias(textAliases,row.title,row);
  const keys = [...textAliases.keys()].filter(key => key.length >= 4 && !['early','late','common','middle','united'].includes(key));
  keys.sort((a,b) => b.length-a.length);
  const escaped = keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  recordLinks = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`,'giu');
}

function linkText(value,exclude) {
  const result = [];
  let previous = 0;
  for (const match of String(value).matchAll(recordLinks)) {
    result.push(escape(value.slice(previous,match.index)));
    const row = textAliases.get(normalize(match[0]));
    result.push(row && row.id !== exclude ? inlineRecord(row.id,match[0]) : escape(match[0]));
    previous = match.index+match[0].length;
  }
  result.push(escape(String(value).slice(previous)));
  return result.join('');
}

function inlineRecord(id,label) {
  return `<a class="inline-link" href="${escape(entityRoute(id,yearOptions()))}">${escape(label || rowById(id).title)}</a>`;
}

function parseRoute() {
  const [path,params = ''] = location.hash.slice(1).split('?');
  const [route = 'atlas',rawId] = path.split('/');
  const query = new URLSearchParams(params);
  let id;
  try {id = decodeURIComponent(rawId || '');} catch {id = '';}
  return {route:route || 'atlas',id,query};
}

function atlasUrl(year,event,layer,selected) {
  return url('atlas',{year,event:event?.id,layer:layer === 'physical' ? 'physical' : undefined,focus:selected});
}

function storyUrl(story,event,layer,selected) {
  return storyRoute(story.id,{event:event?.id,layer:layer === 'physical' ? 'physical' : undefined,focus:selected});
}

function atlasBack(query) {
  const story = stories.find(row => row.id === query.get('story'));
  const event = rowById(query.get('event'));
  const layer = query.get('layer');
  return story ? storyUrl(story,event,layer) : atlasUrl(validYear(query.get('year')),event,layer);
}

function heading(kicker,title,meta = '',description = '') {
  return `<header class="page-head"><div>${kicker ? `<p class="eyebrow">${escape(kicker)}</p>` : ''}<h1>${escape(title)}</h1>${description ? `<p>${escape(description)}</p>` : ''}</div>${meta ? `<span class="head-meta">${escape(meta)}</span>` : ''}</header>`;
}

function imageMarkup(key,mode = '') {
  const [file,credit,link] = art[key] || art.medieval;
  const image = `<img src="./assets/${file}" alt="${escape(credit)}" ${mode === 'panel' ? '' : 'loading="lazy"'}>`;
  if (mode === 'panel') return `<figure class="panel-image">${image}${outward(link,'Image credit')}</figure>`;
  if (mode === 'detail') return `<figure>${image}<figcaption>${outward(link,credit)}</figcaption></figure>`;
  return `<figure>${image}</figure>`;
}

function eraCards() {
  const cards = eras.map(era => `<a class="image-card" href="${escape(entityRoute(era.id))}">${imageMarkup(era.art)}<div class="card-text"><p class="eyebrow">${escape(recordDate(era))}</p><h3>${escape(era.title)}</h3></div></a>`).join('');
  return `<section class="lower-section">${sectionHead('Explore by era','<a href="#index?kind=Era">All eras &rarr;</a>')}<div class="era-cards">${cards}</div></section>`;
}

function nearbyEvents(year,story,event) {
  if (story) return story.steps.map(rowById);
  const sameYear = events.filter(row => row.year === year);
  if (sameYear.length) return sameYear;
  const era = eraAt(year);
  return events.filter(row => row.year >= era.start && row.year <= era.end)
    .sort((a,b) => Math.abs(a.year-year)-Math.abs(b.year-year)).slice(0,4).sort((a,b) => a.year-b.year);
}

function panelEvent(row) {
  const href = active.story ? storyUrl(active.story,row,active.layer) : atlasUrl(row.year,row,active.layer);
  return `<a class="panel-event" href="${escape(href)}" aria-current="${row.id === active.event?.id}"><time>${escape(row.date.replace(` ${row.year}`,''))}</time><span>${escape(row.title)}</span>${arrow}</a>`;
}

function syncPanel() {
  const {year,event,story,selected} = active;
  const era = eraAt(year);
  const focus = rowById(selected);
  const row = focus || event || era;
  const scope = focus ? `${row.kind} · ${formatYear(year)}` : event ? `Turning point · ${event.date}` : `Era · ${formatYear(year)}`;
  const following = nearbyEvents(year,story,event).filter(item => item.id !== event?.id).slice(0,3);
  const graphId = focus ? focus.id : (story?.local ? 'constantinople' : event?.id || era.id);
  const control = story?.local ? `<p class="info-line"><strong>City control</strong> · ${inlineRecord(event.id === 'city-falls' ? 'ottoman' : 'byzantium')}</p>` : '';
  const mapBlurb = row.boundary ? `${row.title} appears in ${row.years.length} boundary snapshot${row.years.length === 1 ? '' : 's'}.` : row.text;
  const context = focus && event ? `<div class="panel-divider"><p class="eyebrow">${escape(event.date)}</p><p>${inlineRecord(event.id,event.title)}</p></div>` : '';
  const next = following.length ? `<div class="panel-divider"><p class="eyebrow">${story ? 'In this story' : 'On the timeline'}</p>${following.map(panelEvent).join('')}</div>` : '';
  const siegeLink = year === 1453 && !story ? `<a class="button primary" href="${escape(storyUrl(stories.find(item => item.local),event))}">${icon('map')} Open siege map</a>` : '';
  main.querySelector('#atlas-panel').innerHTML = `${imageMarkup(eraArt(row),'panel')}<div class="panel-inner"><p class="eyebrow">${escape(scope)}</p><h2>${escape(row.title)}</h2><p>${linkText(mapBlurb,row.id)}</p>${control}${context}${next}<div class="panel-actions">${siegeLink}<a class="button" href="${escape(entityRoute(row.id,yearOptions()))}">Open record ${icon('external')}</a><a class="button" href="${escape(url('graph',{...yearOptions(),focus:graphId}))}">${icon('graph')} Connections</a></div></div>`;
}

function timelineFrame(story) {
  return `<section class="timeline" aria-label="Historical timeline"><div class="time-left"><div class="time-year" id="time-year"></div><div class="time-buttons"><button type="button" class="icon-button" data-time="-1" aria-label="Previous ${story ? 'step' : 'snapshot'}">${icon('prev')}</button><button type="button" class="icon-button play" data-time="play" aria-label="Play timeline">${icon('play')}</button><button type="button" class="icon-button" data-time="1" aria-label="Next ${story ? 'step' : 'snapshot'}">${icon('next')}</button></div></div><div class="time-track">${story ? `<div id="timeline-steps" class="timeline-steps"></div>` : `<div id="time-eras" class="time-era-row"></div><input id="year-slider" type="range" min="${firstYear}" max="${toSlider(lastYear)}" aria-label="Year"><div id="time-ticks" class="tick-row"></div>`}</div></section>`;
}

function syncTimeline() {
  const {year,story,event,layer} = active;
  main.querySelector('#time-year').innerHTML = `${Math.abs(year)} <span>${year < 0 ? 'BCE' : 'CE'}</span>`;
  const playButton = main.querySelector('[data-time="play"]');
  playButton.innerHTML = icon(playTimer ? 'pause' : 'play');
  playButton.setAttribute('aria-label',playTimer ? 'Pause timeline' : 'Play timeline');
  const index = story ? story.steps.indexOf(event.id) : -1;
  main.querySelector('[data-time="-1"]').disabled = story ? index <= 0 : year <= firstYear;
  main.querySelector('[data-time="1"]').disabled = story ? index === story.steps.length-1 : year >= lastYear;
  if (story) {
    main.querySelector('#timeline-steps').innerHTML = story.steps.map(id => {
      const step = rowById(id);
      return `<a href="${escape(storyUrl(story,step,layer))}" aria-current="${event.id === id}"><b>${escape(step.date)}</b><span>${escape(step.title)}</span></a>`;
    }).join('');
    const link = main.querySelector('[data-story-prev]');
    const next = main.querySelector('[data-story-next]');
    link.hidden = index < 1;
    next.hidden = index === story.steps.length-1;
    if (!link.hidden) link.href = storyUrl(story,rowById(story.steps[index-1]),layer);
    if (!next.hidden) next.href = storyUrl(story,rowById(story.steps[index+1]),layer);
    main.querySelector('#story-progress').textContent = `Step ${index+1} of ${story.steps.length}`;
    return;
  }
  const slider = main.querySelector('#year-slider');
  slider.value = toSlider(year);
  slider.setAttribute('aria-valuetext',formatYear(year));
  main.querySelector('#time-eras').innerHTML = eras.map((era,i) => `<a href="${escape(atlasUrl(era.start,null,layer))}" ${eraAt(year).id === era.id ? 'aria-current="true"' : ''}>${eraLabels[i]}</a>`).join('');
  main.querySelector('#time-ticks').innerHTML = timelineMarks.map(mark => `<button type="button" data-jump="${mark}" aria-current="${year === mark}">${Math.abs(mark)}${mark < 0 ? ' BCE' : ''}</button>`).join('');
}

function snapshotAt(year) {
  return catalog.years.findLast(snapshot => snapshot <= year) ?? catalog.years[0];
}

function syncAtlas() {
  syncTimeline();
  syncPanel();
  const snapshot = snapshotAt(active.year);
  mountedMap({...active,snapshot});
  const field = main.querySelector('#jump-year');
  if (field && document.activeElement !== field) field.value = formatYear(active.year);
}

function writeAtlasState(replace = false) {
  const {year,event,layer,selected,story} = active;
  const href = story ? storyUrl(story,event,layer,selected) : atlasUrl(year,event,layer,selected);
  if (location.hash !== href) history[replace ? 'replaceState' : 'pushState'](null,'',href);
}

function chooseTime(year,event = null,replace = false) {
  active.year = validYear(year,active.year);
  active.event = event;
  active.selected = null;
  writeAtlasState(replace);
  syncAtlas();
}

function stepTime(direction,replace = false) {
  if (active.story) {
    const index = active.story.steps.indexOf(active.event.id)+direction;
    const event = rowById(active.story.steps[index]);
    if (!event) return false;
    chooseTime(event.year,event,replace);
    return true;
  }
  const year = direction > 0 ? catalog.years.find(year => year > active.year) : catalog.years.findLast(year => year < active.year);
  if (year === undefined) return false;
  chooseTime(year,null,replace);
  return true;
}

function stopPlaying() {
  if (playTimer) clearInterval(playTimer);
  playTimer = undefined;
}

function renderAtlas(story,query) {
  const event = rowById(query.get('event'));
  active = {story,year:story ? (story.steps.includes(event?.id) ? event.year : rowById(story.steps[0]).year) : validYear(query.get('year'),event?.year || initialYear),layer:query.get('layer') === 'physical' ? 'physical' : 'political',selected:book.has(query.get('focus')) ? query.get('focus') : null};
  active.event = story ? rowById(story.steps.includes(event?.id) ? event.id : story.steps[0]) : event?.kind === 'Event' && event.year === active.year && event.ids ? event : null;
  const toolbar = story ? '' : `<form class="jump-form" aria-label="Go to a year"><label for="jump-year">Go to year</label><input id="jump-year" inputmode="text" placeholder="1815 or 323 BCE" size="11" required><button type="submit" class="icon-button" aria-label="Go to year">${icon('right')}</button></form>`;
  const top = story ? `<a class="route-back" href="#stories">${icon('left')} All stories</a>${heading(eraAt(active.year).title,story.title,story.local ? 'April–May 1453' : '',story.text)}` : heading('700 BCE – 1945 CE','Europe through time');
  const storyNavigation = story ? `<div class="story-nav"><a class="button" data-story-prev href="#stories">${icon('left')} Previous step</a><small id="story-progress"></small><a class="button primary" data-story-next href="#stories">Next step ${icon('right')}</a></div>` : '';
  main.innerHTML = `${top}<div class="workspace"><div class="atlas-grid">${mapFrame(Boolean(story?.local),active.layer)}<aside class="context-panel" id="atlas-panel" aria-label="Historical context"></aside></div>${timelineFrame(story)}</div>${storyNavigation}${toolbar}${story ? '' : eraCards()}`;
  mountedMap = mountMap(main,{
    local:Boolean(story?.local),layer:active.layer,geography,points,cityRecords,getRows,onMapRecord:mapRecord,
    onSelect(id) { active.selected = active.selected === id ? null : id;writeAtlasState();syncAtlas(); },
    onLayer(layer) { active.layer = layer;writeAtlasState();syncAtlas(); },
  });
  main.querySelector('.timeline').addEventListener('click',e => {
    const time = e.target.closest('[data-time]')?.dataset.time;
    const jump = e.target.closest('[data-jump]')?.dataset.jump;
    if (jump !== undefined) {stopPlaying();chooseTime(Number(jump));}
    if (time === 'play') {
      if (playTimer) stopPlaying();
      else {
        if (active.story && active.story.steps.at(-1) === active.event.id) {
          const first = rowById(active.story.steps[0]);chooseTime(first.year,first);
        } else if (!active.story && active.year === lastYear) chooseTime(firstYear);
        playTimer = setInterval(() => {
          if (!stepTime(1,true)) {stopPlaying();syncTimeline();}
        },active.story ? 2800 : 1350);
      }
      syncTimeline();
    }
    if (time && time !== 'play') {stopPlaying();stepTime(Number(time));}
  });
  main.querySelector('#year-slider')?.addEventListener('input',e => {
    stopPlaying();chooseTime(fromSlider(Number(e.target.value)),null,true);
  });
  main.querySelector('.jump-form')?.addEventListener('submit',e => {
    e.preventDefault();
    const field = main.querySelector('#jump-year');
    const year = readYear(field.value,0);
    field.setCustomValidity(year ? '' : 'Enter a year from 700 BCE to 1945 CE.');
    if (!year) {field.reportValidity();return;}
    stopPlaying();chooseTime(year);
    field.value = formatYear(year);
  });
  main.querySelector('#jump-year')?.addEventListener('input',e => e.target.setCustomValidity(''));
  syncAtlas();
}

function renderStories() {
  main.innerHTML = `${heading('Guided exploration','Stories','','Follow a sequence of events on the map. Open a record along the way and return to the same step.')}<div class="story-grid">${stories.map(story => `<a class="image-card" href="${escape(storyUrl(story))}">${imageMarkup(story.art)}<div class="card-text"><p class="eyebrow">${escape(rowById(story.era).title)} · ${story.steps.length} steps</p><h3>${escape(story.title)}</h3><p>${escape(story.text)}</p></div></a>`).join('')}</div>`;
}

function findRecords(query,kind = '') {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const filtered = allRecords.filter(row => (!kind || row.kind === kind) && terms.every(term => normalize([row.title,...row.aliases || []].join(' ')).includes(term)));
  if (!terms.length) return filtered;
  const plain = normalize(query);
  const score = row => normalize(row.title) === plain ? 0 : normalize(row.title).startsWith(plain) ? 1 : row.boundary ? 3 : 2;
  return filtered.sort((a,b) => score(a)-score(b));
}

function indexResults() {
  const results = findRecords(indexQuery,indexKind);
  main.querySelector('#index-count').textContent = `${results.length} record${results.length === 1 ? '' : 's'}`;
  main.querySelector('#index-results').innerHTML = results.slice(0,pageSize).map(row => resultRow(row)).join('') || '<p class="empty">No matching records.</p>';
  main.querySelector('[data-more]').hidden = pageSize >= results.length;
  for (const button of main.querySelectorAll('[data-kind]')) button.setAttribute('aria-pressed',button.dataset.kind === indexKind);
}

function renderIndex(query) {
  indexKind = kinds.includes(query.get('kind')) ? query.get('kind') : '';
  indexQuery = query.get('q') || '';
  pageSize = 36;
  main.innerHTML = `${heading('Historical records','Atlas index')}<div class="index-controls"><input id="index-query" type="search" value="${escape(indexQuery)}" placeholder="Search names and aliases" aria-label="Search the index"><div class="filters" aria-label="Filter by record type">${['',...kinds].map(kind => `<button type="button" data-kind="${kind}">${kind || 'All records'}</button>`).join('')}</div></div><p class="index-count" id="index-count" aria-live="polite"></p><div class="index-list" id="index-results"></div><button type="button" class="button more-button" data-more>Show more records</button>`;
  const update = () => {
    pageSize = 36;
    history.replaceState(null,'',url('index',{kind:indexKind,q:indexQuery}));
    indexResults();
  };
  main.querySelector('#index-query').addEventListener('input',e => {indexQuery = e.target.value;update();});
  main.querySelector('.filters').addEventListener('click',e => {
    const filter = e.target.closest('[data-kind]');
    if (filter) {indexKind = filter.dataset.kind;update();}
  });
  main.querySelector('[data-more]').addEventListener('click',() => {pageSize+=36;indexResults();});
  indexResults();
}

function eventLinks(rows,context) {
  return `<ul class="detail-list">${rows.map(event => `<li><a href="${escape(entityRoute(event.id,context))}">${escape(event.title)}<small>${escape(event.date)}</small></a></li>`).join('')}</ul>`;
}

function renderEntity(row,query) {
  const origin = query.has('year') || query.has('story') ? atlasBack(query) : url('index',{kind:row.kind});
  const dateContext = {year:query.get('year'),event:query.get('event'),story:query.get('story'),layer:query.get('layer')};
  const originYear = validYear(query.get('year'),row.year);
  const graphContext = {...dateContext,year:originYear,focus:row.id};
  const linkedEvents = row.kind === 'Era' ? events.filter(event => event.year >= row.start && event.year <= row.end) : events.filter(event => event.ids.includes(row.id));
  const ownEvent = row.kind === 'Event' && row.ids ? row : null;
  const relatedIds = new Set(ownEvent?.ids || []);
  for (const edge of graphEdges.filter(edge => edge.label !== 'involved')) {
    if (edge.a === row.id) relatedIds.add(edge.b);
    if (edge.b === row.id) relatedIds.add(edge.a);
  }
  const related = [...relatedIds].map(rowById).filter(Boolean);
  const politicalYears = row.years?.length ? `<section><h2>On the political map</h2><div class="year-links">${row.years.map(year => `<a class="sub-button" href="${escape(atlasUrl(year,null,'political',row.id))}">${escape(formatYear(year))}</a>`).join('')}</div></section>` : '';
  const storyLinks = stories.filter(story => story.steps.includes(row.id) || linkedEvents.some(event => story.steps.includes(event.id)) || story.era === row.id);
  const storiesSection = storyLinks.length ? `<section><h2>Guided stories</h2><ul class="detail-list">${storyLinks.map(story => `<li><a href="${escape(storyUrl(story,story.steps.includes(row.id) ? row : null))}">${escape(story.title)} ${arrow}</a></li>`).join('')}</ul></section>` : '';
  const onMap = row.id === 'siege' || row.id === 'constantinople' ? storyUrl(stories.find(item => item.local),ownEvent || rowById(query.get('event'))) : atlasUrl(row.boundary ? row.years[0] : row.year,ownEvent,'political',row.kind === 'City' || row.kind === 'Place' || row.kind === 'Polity' ? row.id : null);
  const text = row.boundary ? `This map entry follows the name used by Historical Basemaps. Its appearance in ${row.years.length} dated snapshot${row.years.length === 1 ? '' : 's'} provides a record of mapped geography.` : row.text;
  const aliasNote = row.aliases?.length ? `<p class="info-line"><strong>Also known as</strong> · ${escape(row.aliases.join(', '))}</p>` : '';
  const dateLabel = row.date || row.start !== undefined ? recordDate(row) : `Atlas reference · ${recordDate(row)}`;
  main.innerHTML = `<a class="route-back" href="${escape(origin)}">${icon('left')} ${query.has('story') ? 'Back to story' : query.has('year') ? 'Back to map' : 'Back to index'}</a><article class="detail"><div class="detail-hero"><div class="detail-content"><p class="eyebrow">${escape(row.kind)} · ${escape(dateLabel)}</p><h1>${escape(row.title)}</h1><p>${linkText(text,row.id)}</p>${aliasNote}<div class="panel-actions"><a class="button primary" href="${escape(onMap)}">${icon('map')} ${row.id === 'siege' || row.id === 'constantinople' ? 'Explore the siege' : 'Show on map'}</a><a class="button" href="${escape(url('graph',graphContext))}">${icon('graph')} Open connections</a></div></div>${imageMarkup(eraArt(row),'detail')}</div><div class="detail-body"><div>${linkedEvents.length ? `<section><h2>Timeline</h2>${eventLinks(linkedEvents,dateContext)}</section>` : ''}${related.length ? `<section><h2>Related records</h2><ul class="detail-list">${related.map(item => `<li><a href="${escape(entityRoute(item.id,dateContext))}">${escape(item.title)}<small>${item.kind}</small></a></li>`).join('')}</ul></section>` : ''}${politicalYears}${storiesSection}</div><div><section><h2>Sources</h2><ul class="detail-sources"><li>${sourceLink(row.source)}</li>${['siege','constantinople','fleet-crosses','city-falls'].includes(row.id) ? `<li>${sourceLink('topography')}</li>` : ''}${row.years?.length && !row.boundary ? `<li>${sourceLink('boundaries')}</li>` : ''}</ul></section></div></div></article>`;
}

function isActiveEdge(edge,year,event) {
  return (edge.start === undefined || year >= edge.start) && (edge.end === undefined || year <= edge.end)
    && !(year === edge.end && edge.endEvent && event === edge.endEvent)
    && !(year === edge.start && edge.startEvent && event !== edge.startEvent);
}

function graphData(focus,year,event,expanded,onlyActive) {
  const has = edge => !onlyActive || isActiveEdge(edge,year,event);
  const neighborEdges = id => graphEdges.filter(edge => (edge.a === id || edge.b === id) && has(edge));
  const other = (edge,id) => edge.a === id ? edge.b : edge.a;
  const unique = new Map();
  const ranked = neighborEdges(focus.id).sort((a,b) => Number(isActiveEdge(b,year,event))-Number(isActiveEdge(a,year,event)) || Number(a.label === 'involved')-Number(b.label === 'involved') || Math.abs((a.start ?? year)-year)-Math.abs((b.start ?? year)-year));
  for (const edge of ranked) if (!unique.has(other(edge,focus.id))) unique.set(other(edge,focus.id),edge);
  if (focus.kind === 'Era' && !unique.size) for (const row of events.filter(row => eraAt(row.year).id === focus.id && (!onlyActive || row.year === year))) unique.set(row.id,{a:focus.id,b:row.id,label:'includes',start:row.year,end:row.year});
  const first = [...unique].slice(0,8);
  const included = new Set([focus.id,...first.map(([id]) => id)]);
  const second = [];
  if (expanded) for (const [id] of first) {
    for (const edge of neighborEdges(id).slice(0,6)) {
      const next = other(edge,id);
      if (included.has(next) || second.length >= 8) continue;
      included.add(next);second.push([next,edge]);
    }
  }
  return {first,second};
}

function renderGraph(query) {
  const focus = rowById(query.get('focus')) || rowById('constantinople');
  const year = validYear(query.get('year'),focus.year);
  const event = query.get('event');
  const expanded = query.get('expand') === '1';
  const onlyActive = query.get('active') === '1';
  const context = {year,event,story:query.get('story'),layer:query.get('layer')};
  const graphUrl = (id,changes = {}) => url('graph',{...context,focus:id,expand:expanded ? '1' : undefined,active:onlyActive ? '1' : undefined,...changes});
  const {first,second} = graphData(focus,year,event,expanded,onlyActive);
  const center = [460,245];
  const positions = new Map([[focus.id,center]]);
  for (const [ring,xRadius,yRadius] of [[first,expanded ? 200 : 285,expanded ? 106 : 148],[second,365,181]]) {
    ring.forEach(([id],index) => {
      const angle = index/ring.length*Math.PI*2-Math.PI/2;
      positions.set(id,[Math.round(center[0]+Math.cos(angle)*xRadius),Math.round(center[1]+Math.sin(angle)*yRadius)]);
    });
  }
  const drawn = [...first,...second].map(([,edge]) => {
    const from = positions.get(edge.a), to = positions.get(edge.b);
    const inactive = !isActiveEdge(edge,year,event);
    return `<g><line class="graph-edge${inactive ? ' inactive' : ''}" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}"/>${first.length < 7 && !expanded ? `<text class="edge-label" x="${(from[0]+to[0])/2}" y="${(from[1]+to[1])/2-4}">${escape(edge.label)}</text>` : ''}</g>`;
  }).join('');
  const nodes = [...positions].map(([id,[x,y]]) => {
    const row = rowById(id);
    const selected = id === focus.id;
    const title = row.title.length > 30 ? row.title.slice(0,28)+'…' : row.title;
    return `<a class="node-link${selected ? ' center' : ''}" href="${escape(selected ? entityRoute(id,context) : graphUrl(id))}" aria-label="${escape(selected ? 'Open '+row.title : 'Focus '+row.title)}"><g transform="translate(${x},${y})"><circle r="${selected ? 27 : 20}"/><text class="node-letter" y="1">${escape(row.title[0])}</text><text class="node-title" y="${selected ? 43 : 34}">${escape(title)}</text></g></a>`;
  }).join('');
  const rows = first.map(([id,edge]) => `<li><a href="${escape(graphUrl(id))}">${escape(rowById(id).title)}<small>${escape(rowById(edge.a).title)} ${escape(edge.label)} ${escape(rowById(edge.b).title)}${isActiveEdge(edge,year,event) ? '' : ' · outside selected date'}</small></a></li>`).join('');
  const choices = allRecords.filter(row => !row.boundary || row.id === focus.id).sort((a,b) => a.title.localeCompare(b.title));
  main.innerHTML = `${query.has('year') ? `<a class="route-back" href="${escape(atlasBack(query))}">${icon('left')} ${query.has('story') ? 'Back to story' : 'Back to map'}</a>` : ''}${heading('Relationship graph',focus.title,formatYear(year))}<form class="graph-header-control"><label for="graph-year">Date</label><input id="graph-year" value="${escape(formatYear(year))}" required><button class="button" type="submit">Apply</button><a class="button" href="${escape(graphUrl(focus.id,{active:onlyActive ? undefined : '1'}))}" aria-pressed="${onlyActive}">${onlyActive ? 'Show all dates' : 'Active at this date'}</a><a class="button" href="${escape(graphUrl(focus.id,{expand:expanded ? undefined : '1'}))}" aria-pressed="${expanded}">${expanded ? 'Collapse neighbors' : 'Expand neighbors'}</a></form><div class="graph-layout"><div class="graph-visual"><svg class="network" viewBox="0 0 920 490" role="group" aria-label="Connections for ${escape(focus.title)}"><circle cx="460" cy="245" r="122" fill="none" stroke="#8ba3a6" stroke-opacity=".19"/><circle cx="460" cy="245" r="190" fill="none" stroke="#8ba3a6" stroke-opacity=".15" stroke-dasharray="2 4"/>${drawn}${nodes}</svg><div class="graph-legend">Solid · active at selected date &nbsp; / &nbsp; Dashed · outside date</div></div><aside class="graph-panel"><h2>Explore connections</h2><label for="graph-focus" class="eyebrow">Focus record</label><select id="graph-focus">${choices.map(row => `<option value="${escape(row.id)}" ${row.id === focus.id ? 'selected' : ''}>${escape(row.title)}</option>`).join('')}</select><div class="panel-actions"><a class="button" href="${escape(entityRoute(focus.id,context))}">Open record ${icon('external')}</a></div>${rows ? `<ul class="detail-list">${rows}</ul>` : '<p>No documented connections for this selection.</p>'}</aside></div>`;
  main.querySelector('#graph-focus').addEventListener('change',e => {location.hash = graphUrl(e.target.value);});
  main.querySelector('#graph-year').addEventListener('input',e => e.target.setCustomValidity(''));
  main.querySelector('.graph-header-control').addEventListener('submit',e => {
    e.preventDefault();
    const field = main.querySelector('#graph-year');
    const next = readYear(field.value,0);
    if (!next) {field.setCustomValidity('Enter a year from 700 BCE to 1945 CE.');field.reportValidity();return;}
    location.hash = graphUrl(focus.id,{year:next,event:next === year ? event : undefined});
  });
}

function renderSources() {
  main.innerHTML = `<div class="sources-page">${heading('Atlas references','Sources & map notes')}<article class="detail"><div class="detail-content"><h2>Political boundaries</h2><p>Clio uses ${catalog.years.length} curated-year snapshots from Historical Basemaps. Between source dates, the map keeps the earlier snapshot and names its year. Shaded areas may represent states, territories, dependencies, or cultural regions. Especially in antiquity, extents are approximate and areas without shading may have limited documentation.</p><ul class="source-list"><li>${sourceLink('boundaries')} · <a href="./data/maps/LICENSE.txt">GPL-3.0 license</a> · Europe and surrounding regions clipped, simplified, and projected for Clio.</li></ul><h2>Physical geography and campaign maps</h2><p>Natural Earth provides present-day reference coastlines, lakes, and rivers. The Constantinople map and wartime campaign arrows are schematic. The 1945 political snapshot depicts a postwar configuration. Use event captions for dates within the year.</p><ul class="source-list"><li>${sourceLink('geography')} · public domain</li><li>${sourceLink('topography')}</li><li>${sourceLink('occupation')}</li><li>${sourceLink('defeat')}</li></ul><h2>Historical references</h2><ul class="source-list">${Object.entries(sources).filter(([key]) => !['boundaries','geography','topography','occupation','defeat'].includes(key)).map(([key]) => `<li>${sourceLink(key)}</li>`).join('')}</ul><h2>Image credits</h2><ul class="source-list">${Object.values(art).map(([,credit,link]) => `<li>${outward(link,credit)}</li>`).join('')}</ul></div></article></div>`;
}

function render() {
  const {route,id,query} = parseRoute();
  stopPlaying();
  active = {};
  const nav = route === 'story' ? 'stories' : route === 'entity' ? 'index' : route;
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.dataset.nav === nav) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  if (route === 'atlas' || route === 'main') renderAtlas(null,query);
  else if (route === 'stories') renderStories();
  else if (route === 'story' && stories.some(story => story.id === id)) renderAtlas(stories.find(story => story.id === id),query);
  else if (route === 'index') renderIndex(query);
  else if (route === 'entity' && book.has(id)) renderEntity(rowById(id),query);
  else if (route === 'graph') renderGraph(query);
  else if (route === 'sources') renderSources();
  else main.innerHTML = `${heading('Atlas','Record unavailable')}<a class="button" href="#index">Browse the atlas index ${icon('right')}</a>`;
  const title = main.querySelector('h1')?.textContent;
  document.title = title ? `${title} · Clio` : 'Clio — European History Atlas';
}

function renderSearch() {
  const query = searchInput.value.trim();
  const suggestions = ['constantinople','alexander','roman-empire','napoleon','ww2'].map(rowById);
  const rows = query ? findRecords(query).slice(0,12) : suggestions;
  searchResults.innerHTML = rows.map(row => resultRow(row,yearOptions())).join('') || '<p class="empty">No matching records.</p>';
}

function openSearch() {
  if (!allRecords || searchDialog.open) return;
  searchInput.value = '';
  renderSearch();
  searchDialog.showModal();
  searchInput.focus();
}

for (const element of document.querySelectorAll('[data-icon]')) element.innerHTML = icon(element.dataset.icon);
document.querySelector('#open-search').addEventListener('click',openSearch);
document.querySelector('#close-search').addEventListener('click',() => searchDialog.close());
searchDialog.addEventListener('click',e => {
  if (e.target === searchDialog || e.target.closest('.result-row')) searchDialog.close();
});
searchInput.addEventListener('input',renderSearch);
searchInput.addEventListener('keydown',e => {
  if (e.key !== 'Enter') return;
  const result = searchResults.querySelector('a');
  if (result) {searchDialog.close();location.hash = result.hash;}
});
document.addEventListener('keydown',e => {
  if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) && !e.target.closest('input,select,textarea,[contenteditable]')) {
    e.preventDefault();openSearch();
  }
});
document.querySelector('.skip-link').addEventListener('click',e => {e.preventDefault();main.focus();});

try {
  [catalog,geography,points] = await Promise.all([json('catalog'),json('geography'),json('points')]);
  buildCatalog();
  render();
  addEventListener('hashchange',() => {render();window.scrollTo(0,0);});
} catch (error) {
  main.innerHTML = `${heading('Clio','The atlas could not load')}<p class="empty">Reload to try again.</p><button type="button" class="button" id="reload-atlas">Reload</button>`;
  main.querySelector('#reload-atlas').addEventListener('click',() => location.reload());
  console.error(error);
}
