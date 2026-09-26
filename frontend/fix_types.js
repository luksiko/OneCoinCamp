const fs = require('fs');
const p = 'src/api/types.ts';
let content = fs.readFileSync(p, 'utf8');
content = content.replace(/export interface Offer \{/, 'export interface Offer {\n  fingerprint?: string;');
fs.writeFileSync(p, content);
console.log('Fixed types.ts');
