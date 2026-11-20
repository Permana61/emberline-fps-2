// Ember dusk look, centralised: one warm amber accent over a cool foundry
// floor, teal for Vanguard, ember red for Cinder. The CSS in index.html
// mirrors these same names as custom properties.
export const PALETTE = {
  canvas: '#221a13',
  surface: '#33261b',
  hairline: '#54402e',
  ink: '#f2ead9',
  muted: '#a89a86',
  accent: '#f0a830',
  teal: '#2ec4b6',
  ember: '#e4572e',
};

// Thin lookup so callers can ask for a colour by name instead of importing
// the whole table and indexing it themselves.
export function shade(name) {
  return PALETTE[name];
}
