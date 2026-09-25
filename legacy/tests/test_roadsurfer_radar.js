const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let props = {};
let fetchCalls = [];
let destinationsByOrigin = {};
let stations = [];
let responses = {};

const context = {
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Object,
  Array,
  Set,
  isFinite,
  encodeURIComponent,
  Utilities: { getUuid: () => 'uuid-1' },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null,
      setProperty: (k, v) => { props[k] = String(v); },
    }),
  },
  isRoadsurferStationId_: (v) => /^\d+$/.test(String(v || '').trim()),
  isWildcardStation_: (v) => {
    const s = String(v || '').trim().toUpperCase();
    return !s || s === '*' || s === 'ALL' || s === 'ANY';
  },
  parseCountryList_: (v) => String(v || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
  formatIsoDate_: (v) => {
    if (typeof v === 'string') return v.slice(0, 10);
    return v.toISOString().slice(0, 10);
  },
  firstDefined_: (...args) => args.find(v => v !== undefined && v !== null && v !== ''),
  fetchJson_: (url, options) => {
    fetchCalls.push({url, options});
    for (const [needle, response] of Object.entries(responses)) {
      if (url.includes(needle)) return typeof response === 'function' ? response(url) : response;
    }
    return []; // Return empty if not mocked to see what happens
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('gas/Providers.js', 'utf8'), context);

function reset() {
  props = {};
  fetchCalls = [];
  destinationsByOrigin = {};
  stations = [];
  responses = {};
}

// 3. Country-mode batches origin stations and rotates cursor instead of hitting all Germany at once.
reset();
stations = [
  {id:'1',name:'Berlin',country:'DE'},
  {id:'2',name:'Ulm',country:'DE'},
  {id:'3',name:'Munich',country:'DE'},
  {id:'4',name:'Hamburg',country:'DE'},
  {id:'5',name:'Cologne',country:'DE'},
  {id:'6',name:'Vienna',country:'AT'},
];
responses['/rally/stations'] = stations.map(s => ({id: s.id, city: {name: s.name, country: s.country}}));
for (const id of ['1','2','3','4','5']) {
  responses[`/rally/stations/${id}`] = [
    {id:'10'+id,station_name:'Italian '+id,destination_country:'IT'},
    {id:'20'+id,station_name:'Spanish '+id,destination_country:'ES'},
    {id:'30'+id,station_name:'French '+id,destination_country:'FR'},
  ];
}
const route = {originId:'*',destinationId:'*',originCountry:'DE',destinationCountry:'IT'};
let pairs = context.resolveRoadsurferPairsBatched_(route, {roadsurfer_origins_per_run:2});
let originIds = Array.from(new Set(pairs.map(p => p.origin.id)));
assert.strictEqual(JSON.stringify(originIds), JSON.stringify(['1','2']));
console.log("Passed 1");
pairs = context.resolveRoadsurferPairsBatched_(route, {roadsurfer_origins_per_run:2});
originIds = Array.from(new Set(pairs.map(p => p.origin.id)));
assert.strictEqual(JSON.stringify(originIds), JSON.stringify(['3','4']));
console.log("Passed 2");

