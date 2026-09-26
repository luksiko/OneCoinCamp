const fs = require('fs');
const path = require('path');
const p = path.join('frontend', 'src', 'locales', 'messages.ts');
let content = fs.readFileSync(p, 'utf8');

content = content.replace(/"offers_sort_trip": "Nach Reisedaten",/g, '"offers_sort_trip": "Nach Reisedaten",\n    "offers_sort_price": "Nach Preis",');
content = content.replace(/"offers_sort_trip": "Per date di viaggio",/g, '"offers_sort_trip": "Per date di viaggio",\n    "offers_sort_price": "Per prezzo",');
content = content.replace(/"offers_sort_trip": "By trip dates",/g, '"offers_sort_trip": "By trip dates",\n    "offers_sort_price": "By price",');
content = content.replace(/"offers_sort_trip": "За діапазоном дат",/g, '"offers_sort_trip": "За діапазоном дат",\n    "offers_sort_price": "За ціною",');
content = content.replace(/"offers_sort_trip": "По диапазону дат",/g, '"offers_sort_trip": "По диапазону дат",\n    "offers_sort_price": "По цене",');

fs.writeFileSync(p, content);
console.log('Updated messages.ts');
