import {formatYear} from './history.js';

const paths = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  right:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  left:'<path d="M19 12H5m6-6-6 6 6 6"/>',
  external:'<path d="M8 16 17 7M8 7h9v9"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  reset:'<path d="M4 11a8 8 0 1 1 2 6m-2-1v-5h5"/>',
  play:'<path fill="currentColor" stroke="none" d="M7 4v16l14-8z"/>',
  pause:'<path d="M9 5v14m6-14v14" stroke-width="3"/>',
  prev:'<path d="m15 6-6 6 6 6"/>',
  next:'<path d="m9 6 6 6-6 6"/>',
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
  graph:'<path d="m5 6 13 4M5 6l7 13m0 0 6-9"/><circle cx="5" cy="6" r="2.7" fill="var(--white)"/><circle cx="18" cy="10" r="2.7" fill="var(--white)"/><circle cx="12" cy="19" r="2.7" fill="var(--white)"/>',
  city:'<path d="M3 21h18M5 21V10l4-2v13m0 0V4l6 2v15m0 0v-8l4-2v10"/>',
  person:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2c0-3 3-5 8-5s8 2 8 5v2"/>',
  polity:'<path d="m3 8 9-5 9 5H3Zm2 12h14M7 10v7m5-7v7m5-7v7"/>',
  war:'<path d="m3 3 14 14m-2 2 4-4m0 4 2 2M21 3 7 17m2 2-4-4m0 4-2 2"/>',
  event:'<path d="M12 2v20M2 12h20m-3-7L5 19M5 5l14 14"/>',
  era:'<path d="M3 5h6c2 0 3 1 3 2v14c0-2-2-3-4-3H3zm18 0h-6c-2 0-3 1-3 2v14c0-2 2-3 4-3h5z"/>',
  place:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
};

export const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.event}</svg>`;
export const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);

export function url(route, options = {}) {
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(options)) {
    if (value !== null && value !== undefined && value !== '') query.set(key,value);
  }
  return '#' + route + (query.size ? '?' + query : '');
}

export const entityRoute = (id, options = {}) => url(`entity/${encodeURIComponent(id)}`,options);
export const storyRoute = (id, options = {}) => url(`story/${id}`,options);
export const recordDate = row => row.date || (row.start !== undefined ? `${formatYear(row.start)} – ${formatYear(row.end)}` : formatYear(row.year));
export const outward = (href, label) => `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
export const arrow = '<span class="right-arrow" aria-hidden="true">&rarr;</span>';

export function resultRow(row, options) {
  return `<a class="result-row" href="${escape(entityRoute(row.id,options))}"><span class="result-icon">${icon(row.kind.toLowerCase())}</span><span><strong>${escape(row.title)}</strong><small>${escape(row.kind)} · ${escape(recordDate(row))}</small></span>${arrow}</a>`;
}
