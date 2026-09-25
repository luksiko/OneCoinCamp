const fs = require('fs');
const path = 'docs/index.html';
let content = fs.readFileSync(path, 'utf8');

// HTML EN
content = content.replace(
  /<p data-i18n="step1_desc">.*?<\/p>/,
  '<p data-i18n="step1_desc">Tourists frequently book one-way trips, causing vehicles to pile up in some cities while others face shortages. Paying for idle parking and losing customers elsewhere is expensive, and transport trucks cost over €1,000. Renting them to travelers for pennies is the fastest and cheapest way to relocate the fleet.</p>'
);

// JS EN
content = content.replace(
  /step1_desc:\s*'.*?',/,
  "step1_desc: 'Tourists frequently book one-way trips, causing vehicles to pile up in some cities while others face shortages. Paying for idle parking and losing customers elsewhere is expensive, and transport trucks cost over €1,000. Renting them to travelers for pennies is the fastest and cheapest way to relocate the fleet.',"
);

// JS DE
content = content.replace(
  /step1_desc:\s*'Touristen buchen oft Einwegfahrten.*?1€-Vermietung.*?',/,
  "step1_desc: 'Touristen buchen oft Einwegfahrten, wodurch sich Fahrzeuge in einigen Städten stauen, während woanders Mangel herrscht. Teure Parkgebühren und entgangene Kunden sind die Folge. Da ein LKW-Rücktransport über 1.000€ kostet, ist es für Vermieter am günstigsten, die Fahrzeuge für Centbeträge an Reisende abzugeben.',"
);

// JS RU
content = content.replace(
  /step1_desc:\s*'Туристы часто берут кемперы в один конец.*?идеальный способ вернуть машину на базу\.',/,
  "step1_desc: 'Туристы часто берут транспорт в один конец. В итоге в одних городах машины скапливаются, а в других возникает дефицит. Компаниям невыгодно платить за простой на парковке и терять клиентов. Автовоз стоит более 1000€, поэтому им гораздо дешевле отдать машину за копейки, чтобы путешественники сами вернули её на базу.',"
);

fs.writeFileSync(path, content);
console.log('Updated step1_desc');
