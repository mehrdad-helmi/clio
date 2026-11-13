import {escape, icon} from './ui.js';
import {formatYear} from './history.js';

const colors = ['#b8ae87','#c2a77b','#94a798','#b3a286','#a3aeb1','#c1ae9e','#a4a87c','#d0b88c','#8da39f','#baa68f','#c9b694','#aeb49b','#b8a7a2','#94a4a5'];
const seas = [['atlantic','ATLANTIC OCEAN'],['mediterranean','MEDITERRANEAN SEA'],['black-sea','BLACK SEA'],['north-sea','NORTH SEA'],['baltic-sea','BALTIC SEA'],['norwegian-sea','NORWEGIAN SEA']];
const terrain = [['alps','Alps'],['carpathians','Carpathians'],['scandinavia','Scandinavian Mountains'],['pyrenees','Pyrenees'],['caucasus','Caucasus']];
const cityStarts = {athens:-700,sparta:-700,thebes:-700,corinth:-700,rome:-700,constantinople:-650,galata:1200,venice:700,florence:100,london:50,paris:-100,vienna:100,prague:900,berlin:1250,warsaw:1300,sarajevo:1460,stalingrad:1589,granada:1013,verdun:400,jerusalem:-700,wittenberg:1200};
const routes = {
  'poland-invasion':[['berlin','poznań','warsaw'],['minsk','brest','lublin']],
  'paris-occupied':[['rhein','paris']],
  barbarossa:[['warsaw','brest','minsk','smolensk','moscow'],['lublin','lviv','kyiv']],
  'stalingrad-surrender':[['kyiv','stalingrad']],
  'normandy-landings':[['portsmouth','normandy-landings'],['normandy-landings','paris']],
  'berlin-falls':[['warsaw','frankfurt-oder','berlin'],['rhein','kassel']],
};

function regionColor(name) {
  let hash = 0;
  for (const character of name.toLowerCase()) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  return colors[hash % colors.length];
}

function compass() {
  return `<span class="compass" aria-hidden="true">N<svg viewBox="0 0 32 40"><path d="M16 1 19 16 30 20 19 24 16 39 13 24 2 20 13 16Z" fill="none" stroke="currentColor"/><path d="m16 1 3 15 11 4-14-1L13 16Zm0 38-3-15-11-4 14 1 3 3z" fill="currentColor"/><circle cx="16" cy="20" r="10" fill="none" stroke="currentColor" opacity=".58"/></svg></span>`;
}

export function mapFrame(local, layer) {
  return `<section class="map-stage" aria-label="${local ? 'Constantinople siege map' : 'Interactive map of Europe'}">
    <svg id="atlas-svg" role="group" aria-label="${local ? 'Schematic of Constantinople and its harbor' : 'Map of Europe and the Mediterranean'}"></svg>
    <div class="map-furniture map-top-left">
      <span class="map-pill" id="map-date"></span>
      ${local ? `<a href="#atlas?year=1453" class="map-pill">${icon('map')} Europe</a>` : `<div class="map-toggle" role="group" aria-label="Map layer"><button type="button" data-layer="political" aria-pressed="${layer === 'political'}">Political</button><button type="button" data-layer="physical" aria-pressed="${layer === 'physical'}">Physical</button></div>`}
    </div>
    <div class="map-furniture map-top-right">${compass()}</div>
    <div class="map-notice" id="map-notice" hidden></div><div class="map-tooltip" id="map-tooltip" hidden></div>
    <div class="map-furniture map-bottom-left"><a class="map-pill map-state" href="#sources" id="map-legend"></a></div>
    <div class="map-furniture map-bottom-right">
      <button class="map-tool" type="button" data-zoom="1" aria-label="Zoom in">${icon('plus')}</button>
      <button class="map-tool" type="button" data-zoom="-1" aria-label="Zoom out">${icon('minus')}</button>
      <button class="map-tool" type="button" data-zoom="0" aria-label="Reset map view">${icon('reset')}</button>
    </div>
  </section>`;
}

function definitions() {
  return `<defs><linearGradient id="ocean" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#274b60"/><stop offset="1" stop-color="#132a3d"/></linearGradient>
    <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c5c4a0"/><stop offset="1" stop-color="#a7ad8d"/></linearGradient>
    <radialGradient id="event-halo"><stop stop-color="#ffe9ae" stop-opacity=".65"/><stop offset="1" stop-color="#ffdc8d" stop-opacity="0"/></radialGradient>
    <marker id="campaign-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#f1c17a"/></marker></defs>`;
}

function geographicMap({geography, points, cityRecords, event, year, layer, selected, rows, onMapRecord}) {
  const political = layer === 'political';
  const labelPositions = [];
  const featureMarkup = [];
  const labelMarkup = [];
  for (const [name,group,path,x,y,area] of rows) {
    const record = onMapRecord(name,year);
    if (!record) continue;
    const active = record.id === selected;
    const attrs = `data-map-id="${escape(record.id)}" data-tip="${escape(name)}"`;
    featureMarkup.push(`<path class="map-feature${active ? ' is-selected' : ''}" ${attrs} d="${path}" fill="${regionColor(group)}" fill-rule="evenodd"/>`);
    const width = Math.min(180,name.length * 5.5);
    if (area > 13 && x > 165 && x < 1050 && y > -105 && y < 555 && !labelPositions.some(([lx,ly,lw]) => Math.abs(lx-x) < (lw+width)/2+8 && Math.abs(ly-y) < 24)) {
      labelPositions.push([x,y,width]);
      const short = name.startsWith('United Kingdom of Great Britain') ? 'United Kingdom' : name;
      const label = short.length > 26 ? `${short.slice(0,24)}…` : short;
      labelMarkup.push(`<text class="map-label" x="${x}" y="${y}" ${attrs}>${escape(label.toUpperCase())}</text>`);
    }
  }
  const cityMarkup = [];
  for (const row of cityRecords) {
    const point = points[row.id];
    const active = selected === row.id;
    if (!point || (!active && (year < (cityStarts[row.id] ?? row.year) || !['athens','constantinople','rome','paris','london','vienna','berlin','warsaw','venice','sarajevo'].includes(row.id)))) continue;
    const title = row.id === 'constantinople' && year < 330 ? 'Byzantion' : row.title;
    const [x,y] = point;
    cityMarkup.push(`<g class="map-city${active ? ' is-selected' : ''}" data-map-id="${escape(row.id)}" data-tip="${escape(title)}" role="button" tabindex="0" aria-label="Select ${escape(title)}" transform="translate(${x},${y})"><circle r="${active ? 5 : 3.1}"/><text x="6" y="-5">${escape(title)}</text></g>`);
  }
  const marker = points[event?.id];
  const mapRoutes = (routes[event?.id] || []).map(route => {
    const coordinates = route.map(id => points[id]);
    if (coordinates.some(point => !point)) return '';
    const d = 'M' + coordinates.map(point => point.join(',')).join('L');
    return `<path d="${d}" fill="none" stroke="#563e32" stroke-width="5" opacity=".75"/><path d="${d}" fill="none" stroke="#f1c17a" stroke-width="2.4" stroke-dasharray="5 3" marker-end="url(#campaign-arrow)"/>`;
  }).join('');
  const labels = (data, css) => data.map(([key,label]) => {
    const [x,y] = points[key];
    return `<text x="${x}" y="${y}" class="${css}">${escape(label)}</text>`;
  }).join('');
  return `${definitions()}<rect x="-3000" y="-3000" width="8000" height="8000" fill="url(#ocean)"/>
    <path d="${geography.land}" fill="url(#land)" fill-rule="evenodd" stroke="#5d807d" stroke-width="1.2"/>
    <path d="${geography.grid}" fill="none" stroke="#ccdbcd" stroke-width=".5" opacity=".21"/>
    <g>${featureMarkup.join('')}</g>
    <path d="${geography.lakes}" fill="#587e8b" fill-rule="evenodd" opacity=".8" pointer-events="none"/>
    <path d="${geography.rivers}" fill="none" stroke="${political ? '#587f8b' : '#406f82'}" stroke-width="${political ? '.75' : '1.2'}" opacity="${political ? '.57' : '.9'}" pointer-events="none"/>
    ${labels(seas,'sea-label')}${political ? labelMarkup.join('') : labels(terrain,'physical-label')}
    <g pointer-events="none">${mapRoutes}${marker ? `<g transform="translate(${marker.join(',')})"><circle r="20" fill="url(#event-halo)"/><circle r="7" fill="none" stroke="#ffde96" stroke-width="1.6"/><circle r="2" fill="#9b4d32"/></g>` : ''}</g>
    ${cityMarkup.join('')}`;
}

function siegeMap(event) {
  const fallen = event?.id === 'city-falls';
  const fleet = event?.id === 'fleet-crosses';
  return `${definitions()}<defs>
    <path id="siege-land" d="M-45-30H828C813 27 811 50 789 77C779 94 795 116 777 141C759 163 744 168 738 188C730 214 738 234 714 256C694 276 671 284 636 273C613 267 602 252 575 245C553 235 529 231 505 219C473 210 453 180 420 179C389 178 366 183 349 167C331 152 314 148 298 155C279 163 302 180 322 187C347 198 356 215 393 214C428 212 447 228 473 246C505 271 532 271 560 286C585 297 618 297 641 312C660 324 655 346 629 357C604 367 600 385 560 402C532 416 515 407 488 426C447 448 431 427 400 437C367 446 357 461 317 460C279 456 252 468 211 473C166 479 144 478 123 500C92 524 40 517-45 550Z M970-35H1100V575H917C905 522 923 499 914 473C902 447 879 448 872 421C865 398 881 376 857 351C840 332 849 310 867 293C889 271 904 260 904 236C904 211 883 209 887 184C892 156 927 146 932 118C939 93 922 78 948 48C967 25 964 6 970-35Z"/>
    <path id="siege-city" d="M350 204Q366 214 393 214C428 212 447 228 473 246C505 271 532 271 560 286C585 297 618 297 641 312C660 324 655 346 629 357C604 367 600 385 560 402C532 416 515 407 488 426C447 448 431 427 400 437C367 446 357 461 317 460L290 437 295 414 293 387 305 367 307 340 319 312 320 286 331 260 333 230Z"/>
    <pattern id="siege-grid" width="43" height="43" patternUnits="userSpaceOnUse"><path d="M43 0H0v43" fill="none" stroke="#d3d7bc" stroke-width=".7" opacity=".25"/></pattern>
    <pattern id="siege-streets" width="24" height="23" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><path d="M0 8h24M3 19h21M8 5v18M19 1v13" fill="none" stroke="#666049" stroke-width=".8" opacity=".24"/></pattern></defs>
    <rect x="-3000" y="-3000" width="8000" height="8000" fill="url(#ocean)"/><use href="#siege-land" fill="url(#land)" stroke="#87a398" stroke-width="2"/>
    <rect width="1050" height="550" fill="url(#siege-grid)" pointer-events="none"/>
    <use href="#siege-city" fill="${fallen ? '#bd8e5f' : '#d8c58e'}" stroke="#f1d79d" stroke-width="2" data-map-id="constantinople" data-tip="Constantinople" style="cursor:pointer"/>
    <use href="#siege-city" fill="url(#siege-streets)" pointer-events="none"/>
    <path d="M350 204L333 230 331 260 320 286 319 312 307 340 305 367 293 387 295 414 290 437 317 460" fill="none" stroke="#544938" stroke-width="7" stroke-linejoin="round"/>
    <path d="M350 204L333 230 331 260 320 286 319 312 307 340 305 367 293 387 295 414 290 437 317 460" fill="none" stroke="#f0d597" stroke-width="3" stroke-dasharray="4 4"/>
    ${fleet ? '<path d="M766 129C742 130 705 130 670 136C622 144 589 161 569 189C554 210 558 236 565 252" fill="none" stroke="#765039" stroke-width="6"/><path d="M766 129C742 130 705 130 670 136C622 144 589 161 569 189C554 210 558 236 565 252" fill="none" stroke="#f1c17a" stroke-width="2.7" stroke-dasharray="6 4" marker-end="url(#campaign-arrow)"/><text x="644" y="109" class="physical-label">Approximate overland route</text>' : ''}
    ${fallen ? '<path d="M170 340Q240 326 298 347" fill="none" stroke="#765039" stroke-width="5"/><path d="M170 340Q240 326 298 347" fill="none" stroke="#f1c17a" stroke-width="2.8" stroke-dasharray="6 4" marker-end="url(#campaign-arrow)"/><text x="220" y="317" class="physical-label">Final assault</text>' : '<path d="M682 277 642 313" stroke="#f6d49e" stroke-width="3" stroke-dasharray="2 4"/><text x="711" y="314" class="sea-label" style="font-size:12px">Harbor chain</text>'}
    <text x="215" y="395" class="physical-label">Land walls</text><path d="M252 391h37" stroke="#66573c"/>
    <text x="505" y="246" transform="rotate(20 505 246)" class="sea-label">Golden Horn</text>
    <text x="838" y="183" transform="rotate(-76 838 183)" class="sea-label">Bosporus</text><text x="628" y="473" class="sea-label">Sea of Marmara</text>
    <g class="map-city is-selected" data-map-id="constantinople" data-tip="Constantinople" tabindex="0" role="button" aria-label="Select Constantinople"><circle cx="485" cy="328" r="7"/><text x="497" y="325" style="font-size:16px">Constantinople</text></g>
    <g class="map-city" data-map-id="galata" data-tip="Galata" tabindex="0" role="button" aria-label="Select Galata"><circle cx="679" cy="227" r="5"/><text x="689" y="223" style="font-size:13px">Galata</text></g>
    <g class="map-city" data-map-id="ottoman" data-tip="Ottoman forces" tabindex="0" role="button" aria-label="Select Ottoman Empire"><circle cx="146" cy="269" r="5"/><text x="156" y="264" style="font-size:13px">Ottoman forces</text></g>`;
}

export function mountMap(container, options) {
  const svg = container.querySelector('#atlas-svg');
  const frame = svg.closest('.map-stage');
  const date = frame.querySelector('#map-date');
  const legend = frame.querySelector('#map-legend');
  const notice = frame.querySelector('#map-notice');
  const tip = frame.querySelector('#map-tooltip');
  const home = options.local ? [0,0,1050,550] : [150,-128,930,710];
  let view = [...home];
  let gesture;
  let moved = false;
  let request = 0;
  const setView = () => svg.setAttribute('viewBox',view.join(' '));
  const zoom = factor => {
    const scale = Math.max(.2,Math.min(1.35,view[2]*factor/home[2]));
    const width = home[2]*scale, height = home[3]*scale;
    view = [view[0]+(view[2]-width)/2,view[1]+(view[3]-height)/2,width,height];
    setView();
  };
  setView();
  const getTarget = target => target.closest?.('[data-map-id]');
  svg.addEventListener('click', e => {
    const node = getTarget(e.target);
    if (node && !moved) options.onSelect(node.dataset.mapId);
  });
  svg.addEventListener('keydown', e => {
    const node = getTarget(e.target);
    if (node && ['Enter',' '].includes(e.key)) {
      e.preventDefault();
      options.onSelect(node.dataset.mapId);
    }
  });
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    moved = false;
    gesture = [e.pointerId,e.clientX,e.clientY,...view.slice(0,2)];
  });
  svg.addEventListener('pointermove', e => {
    const node = getTarget(e.target);
    if (gesture?.[0] === e.pointerId) {
      const [,x,y,left,top] = gesture;
      if (Math.hypot(e.clientX-x,e.clientY-y) > 4) moved = true;
      if (moved) {
        const scale = svg.getScreenCTM()?.a || 1;
        view[0] = left-(e.clientX-x)/scale;
        view[1] = top-(e.clientY-y)/scale;
        setView();
        svg.classList.add('dragging');
      }
    }
    tip.hidden = !node || moved;
    if (tip.hidden) return;
    const bounds = frame.getBoundingClientRect();
    tip.textContent = node.dataset.tip;
    tip.style.left = `${Math.max(5,Math.min(e.clientX-bounds.left+11,bounds.width-140))}px`;
    tip.style.top = `${Math.max(5,e.clientY-bounds.top-30)}px`;
  });
  const release = () => { gesture = null; svg.classList.remove('dragging'); tip.hidden = true; };
  svg.addEventListener('pointerup',release);
  svg.addEventListener('pointercancel',release);
  svg.addEventListener('pointerleave',() => { release(); moved = false; });
  svg.addEventListener('wheel',e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? .83 : 1.20);
  },{passive:false});
  frame.addEventListener('click', e => {
    const value = e.target.closest('[data-zoom]')?.dataset.zoom;
    if (value === '0') {view = [...home];setView();}
    if (value === '1') zoom(.78);
    if (value === '-1') zoom(1.28);
    const layer = e.target.closest('[data-layer]')?.dataset.layer;
    if (layer) options.onLayer(layer);
  });
  return async function update({year,event,layer,selected,snapshot}) {
    const current = ++request;
    date.innerHTML = `<span class="dot"></span><b>${escape(event ? event.date : formatYear(year))}</b>`;
    for (const button of frame.querySelectorAll('[data-layer]')) button.setAttribute('aria-pressed',button.dataset.layer === layer);
    legend.innerHTML = options.local ? 'Schematic map · approximate positions' : layer === 'physical' ? '<i class="map-key physical"></i> Physical geography · Natural Earth' : `<i class="map-key"></i> Borders · ${escape(formatYear(snapshot))}`;
    const historicalNote = !options.local && layer === 'political' && snapshot !== year ? `Closest earlier border snapshot · ${formatYear(snapshot)}` : '';
    const routeNote = !options.local && routes[event?.id] ? 'Approximate campaign arrows' : '';
    notice.textContent = [historicalNote,routeNote].filter(Boolean).join(' · ');
    notice.hidden = !notice.textContent;
    tip.hidden = true;
    if (options.local) {svg.innerHTML = siegeMap(event);return;}
    try {
      const rows = layer === 'political' ? await options.getRows(snapshot) : [];
      if (current !== request) return;
      svg.innerHTML = geographicMap({...options,rows,event,year,layer,selected});
    } catch (error) {
      if (current !== request) return;
      svg.innerHTML = geographicMap({...options,rows:[],event,year,layer:'physical',selected});
      notice.textContent = 'Political boundaries could not be loaded.';
      notice.hidden = false;
      console.error(error);
    }
  };
}
