const fs = require('fs');
const path = 'docs/index.html';
let content = fs.readFileSync(path, 'utf8');

// Remove FAQ Q2 from schema
content = content.replace(/\s*\{\s*"@type": "Question",\s*"name": "Who pays for fuel and highway tolls\?",\s*"acceptedAnswer": \{\s*"@type": "Answer",\s*"text": "Fuel and highway tolls are paid by the driver\. Even with fuel costs, paying only €1\/day saves over €800 compared to standard commercial campervan rentals\."\s*\}\s*\},/, '');

// Remove FAQ Q2 from HTML layout
content = content.replace(/\s*<div class="faq-item">\s*<div class="faq-question" onclick="toggleFaq\(this\)">\s*<span data-i18n="q2">Who pays for fuel and highway tolls\?<\/span>\s*<span class="faq-toggle">\+<\/span>\s*<\/div>\s*<div class="faq-answer" data-i18n="a2">\s*Fuel and highway tolls are paid by the driver, just like any standard road trip\. However, because your base vehicle rental is only 1€\/day instead of €180–€240\/day, you still save hundreds of euros on your total vacation budget\.\s*<\/div>\s*<\/div>/, '');

// Rename CSS classes
content = content.replace(/\.fuel-bonus/g, '.extra-bonus');
content = content.replace(/\.push-fuel/g, '.push-extra');
content = content.replace(/pricing-fuel-callout/g, 'pricing-savings-callout');

// Remove Q2/A2 from translations
content = content.replace(/\s*q2: 'Who pays for fuel and highway tolls\?',\s*a2: 'Fuel and highway tolls are paid by the driver, just like any standard road trip\. However, because your base vehicle rental is only 1€\/day instead of €180–€240\/day, you still save hundreds of euros on your total vacation budget\.',/, '');
content = content.replace(/\s*q2: 'Wer zahlt Treibstoff und Autobahnmaut\?',\s*a2: 'Treibstoff und Autobahnmaut werden wie gewohnt vom Fahrer getragen\. Da die Fahrzeugmiete jedoch nur 1€\/Tag statt 180€–240€\/Tag beträgt, sparen Sie trotzdem viele hundert Euro bei Ihrer Reise\.',/, '');
content = content.replace(/\s*q2: 'Кто оплачивает топливо и платные дороги\?',\s*a2: 'Топливо и дорожные сборы оплачивает водитель, как и в любой обычной поездке\. Но поскольку аренда самого кемпера стоит всего 1€ в день вместо 180–240€, вы экономите более 800€ на бюджете отпуска\.',/, '');

fs.writeFileSync(path, content);
console.log('Fuel info removed from index.html');
