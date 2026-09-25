const fs = require('fs');

const path = 'docs/index.html';
let content = fs.readFileSync(path, 'utf8');

// Replace in HTML
content = content.replace(/for <span class="gradient">1€ \/ Day<\/span>/g, 'from <span class="gradient">1€ \/ Day<\/span>');
content = content.replace(/Recent 1€ Relocation Deals/g, 'Recent Deals from 1€');
content = content.replace(/1€ deals appear/g, 'Deals from 1€ appear');
content = content.replace(/for 1€ is faster/g, 'from 1€ is faster');
content = content.replace(/Unlimited 1€ Alerts/g, 'Unlimited Alerts');
content = content.replace(/trip for 1€/g, 'trip from 1€');
content = content.replace(/booked 1€ campervans/g, 'booked campervans from 1€');
content = content.replace(/about 1€ camper rentals/g, 'about camper rentals from 1€');
content = content.replace(/1€ Deals/g, 'Deals from 1€');

// Replace in EN JSON
content = content.replace(/for <span class="gradient">1€ \/ Day<\/span>/g, 'from <span class="gradient">1€ \/ Day<\/span>');
content = content.replace(/drop 1€ camper rentals/g, 'drop camper rentals from 1€');

// Replace in DE JSON
content = content.replace(/für <span class="gradient">1€ \/ Tag<\/span>/g, 'ab <span class="gradient">1€ \/ Tag<\/span>');
content = content.replace(/bieten täglich 1€-Überführungen/g, 'bieten täglich Überführungen ab 1€');
content = content.replace(/Aktuelle 1€ Überführungs-Angebote/g, 'Aktuelle Angebote ab 1€');
content = content.replace(/Eine 1€-Vermietung/g, 'Eine Vermietung ab 1€');
content = content.replace(/1€-Angebote erscheinen/g, 'Angebote ab 1€ erscheinen');
content = content.replace(/Unbegrenzte 1€-Alarme/g, 'Unbegrenzte Alarme');
content = content.replace(/Reise für 1€/g, 'Reise ab 1€');
content = content.replace(/mit 1€-Wohnmobilen/g, 'mit Wohnmobilen ab 1€');
content = content.replace(/über 1€ Wohnmobil-Überführungen/g, 'über Wohnmobil-Überführungen ab 1€');
content = content.replace(/1€ Angebote/g, 'Angebote ab 1€');

// Replace in RU JSON
content = content.replace(/за <span class="gradient">1€ \/ день<\/span>/g, 'от <span class="gradient">1€ \/ день<\/span>');
content = content.replace(/перегоны кемперов за 1€/g, 'перегоны кемперов от 1€');
content = content.replace(/Недавние перегоны за 1€/g, 'Недавние перегоны от 1€');
content = content.replace(/перегоны за 1€/g, 'перегоны от 1€');
content = content.replace(/туристу за 1€/g, 'туристу от 1€');
content = content.replace(/уведомления за 1€/g, 'уведомления о перегонах от 1€');
content = content.replace(/поездку за 1€/g, 'поездку от 1€');
content = content.replace(/Путешествия за 1€/g, 'Путешествия от 1€');
content = content.replace(/кемперов за 1€/g, 'кемперов от 1€');
content = content.replace(/1€ Офферы/g, 'Офферы от 1€');

fs.writeFileSync(path, content);
console.log('Done replacing in index.html');
