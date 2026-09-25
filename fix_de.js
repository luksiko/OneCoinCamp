const fs = require('fs');
const path = 'docs/index.html';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /step1_desc:\s*'Touristen buchen oft Einwegfahrten.*?Vermieter und Reisende\.',/,
  "step1_desc: 'Touristen buchen oft Einwegfahrten, wodurch sich Fahrzeuge in einigen Städten stauen, während woanders Mangel herrscht. Teure Parkgebühren und entgangene Kunden sind die Folge. Da ein LKW-Rücktransport über 1.000€ kostet, ist es für Vermieter am günstigsten, die Fahrzeuge für Centbeträge an Reisende abzugeben.',"
);

fs.writeFileSync(path, content);
