import { geoConicConformal, geoPath } from 'd3-geo';
import * as topo from 'topojson-client';
import fs from 'fs';
import { CITIES, HAWAII } from './src/cities.mjs';
const us = JSON.parse(fs.readFileSync('node_modules/us-atlas/states-10m.json'));
const world = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'));
const states = topo.feature(us, us.objects.states).features.filter(f => !['02','15','72','78','60','66','69'].includes(f.id));
const canada = topo.feature(world, world.objects.countries).features.find(f => f.id === '124');
const W = 980, H = 600;
const proj = geoConicConformal().parallels([30, 50]).rotate([96, 0]);
// fit to lower-48 plus a southern-Canada band
const box = { type: 'MultiPoint', coordinates: [[-125, 24.5], [-66.5, 24.5], [-125, 54], [-60, 54], [-96, 24]] };
proj.fitExtent([[10, 10], [W - 10, H - 10]], box);
proj.clipExtent([[0, 0], [W, H]]);
const path = geoPath(proj).digits(1);
const out = {
  w: W, h: H,
  canada: path(canada),
  states: states.map(f => ({ id: f.id, name: f.properties.name, d: path(f) })),
  cities: CITIES.map(c => { const [x, y] = proj([c[3], c[2]]); return [c[0], c[1], +x.toFixed(1), +y.toFixed(1), c[4], c[5]]; }),
  hawaii: HAWAII.map(c => [c[0], c[1], 70, 540, c[4], c[5]]),
};
fs.writeFileSync('src/mapdata.json', JSON.stringify(out));
console.log('bytes', JSON.stringify(out).length, 'states', out.states.length, 'sum', CITIES.reduce((a, c) => a + c[4], 0));
