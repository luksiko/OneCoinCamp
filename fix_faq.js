const fs = require('fs');
const path = 'docs/index.html';
let content = fs.readFileSync(path, 'utf8');

// Insert HTML Block for Q2
const htmlBlock = `
        <div class="faq-item">
          <div class="faq-question" onclick="toggleFaq(this)">
            <span data-i18n="q2">What is the benefit for rental companies? Do they offer regular cars?</span>
            <span class="faq-toggle">+</span>
          </div>
          <div class="faq-answer" data-i18n="a2">
            Rental companies save huge amounts on logistics. Transporting a camper or car back on a flatbed truck costs over €1,000. Renting it to travelers for 1€ saves them money and gets the vehicle back faster. By the way, in addition to campervans, you can often find regular passenger cars through our service!
          </div>
        </div>
`;
content = content.replace(/(<div class="faq-item">[\s\S]*?q3)/, htmlBlock + '$1');

// Insert JSON-LD Schema for Q2
const schemaBlock = `
          {
            "@type": "Question",
            "name": "What is the benefit for rental companies? Do they offer regular cars?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Rental companies save huge amounts on logistics. Transporting a camper or car back on a flatbed truck costs over €1,000. Renting it to travelers for 1€ saves them money and gets the vehicle back faster. By the way, in addition to campervans, you can often find regular passenger cars through our service!"
            }
          },`;
content = content.replace(/("name": "What driver's license do I need\?",)/, schemaBlock + '\n          {\n            "@type": "Question",\n            $1');

// Insert translations
const enQ2 = `        q1: 'Is it really 1€? Are there any hidden catches?',
        a1: 'Yes! The base rental price is exactly 1€ per day. Rental companies charge this nominal amount to enter a binding rental contract. You receive a fully insured, brand-new campervan or motorhome. The only condition is following the designated route and dates.',
        q2: 'What is the benefit for rental companies? Do they offer regular cars?',
        a2: 'Rental companies save huge amounts on logistics. Transporting a camper or car back on a flatbed truck costs over €1,000. Renting it to travelers for 1€ saves them money and gets the vehicle back faster. By the way, in addition to campervans, you can often find regular passenger cars through our service!',`;

const deQ2 = `        q1: 'Kostet es wirklich nur 1€? Gibt es versteckte Kosten?',
        a1: 'Ja! Der Basis-Mietpreis beträgt exakt 1€ pro Tag. Vermieter erheben diesen symbolischen Betrag für einen rechtsgültigen Mietvertrag. Sie erhalten ein voll versichertes, neuwertiges Wohnmobil. Die einzige Bedingung ist die Einhaltung von Route und Zeitraum.',
        q2: 'Was ist der Vorteil für die Vermieter? Gibt es auch normale Autos?',
        a2: 'Vermieter sparen enorm an Logistikkosten. Der Rücktransport eines Campers oder Autos auf einem Lkw kostet oft über 1.000€. Die Vermietung an Reisende für 1€ spart Geld und bringt das Fahrzeug schneller zurück. Übrigens: Neben Wohnmobilen können Sie über unseren Service oft auch normale PKWs finden!',`;

const ruQ2 = `        q1: 'Это правда стоит 1€? Есть ли скрытые платежи?',
        a1: 'Да! Базовая аренда стоит ровно 1€ в день. Прокатные компании взимают эту символическую сумму для оформления официального договора аренды. Вы получаете полностью застрахованный новый кемпер. Единственное условие — придерживаться маршрута и дат.',
        q2: 'В чем выгода прокатным компаниям? И сдают ли они обычные легковые машины?',
        a2: 'Прокатные компании экономят огромные деньги на логистике. Возвращать кемпер или машину на автовозе из одного города в другой стоит более 1000€. Отдавая транспорт туристам за символическую цену, компании экономят бюджет и быстрее возвращают его в строй. Кстати, помимо кемперов и автодомов, через наш сервис часто можно поймать и обычные легковые автомобили!',`;

content = content.replace(/q1: 'Is it really 1€\? Are there any hidden catches\?',\s*a1: 'Yes! The base rental price is exactly 1€ per day\. Rental companies charge this nominal amount to enter a binding rental contract\. You receive a fully insured, brand-new campervan or motorhome\. The only condition is following the designated route and dates\.',/, enQ2);

content = content.replace(/q1: 'Kostet es wirklich nur 1€\? Gibt es versteckte Kosten\?',\s*a1: 'Ja! Der Basis-Mietpreis beträgt exakt 1€ pro Tag\. Vermieter erheben diesen symbolischen Betrag für einen rechtsgültigen Mietvertrag\. Sie erhalten ein voll versichertes, neuwertiges Wohnmobil\. Die einzige Bedingung ist die Einhaltung von Route und Zeitraum\.',/, deQ2);

content = content.replace(/q1: 'Это правда стоит 1€\? Есть ли скрытые платежи\?',\s*a1: 'Да! Базовая аренда стоит ровно 1€ в день\. Прокатные компании взимают эту символическую сумму для оформления официального договора аренды\. Вы получаете полностью застрахованный новый кемпер\. Единственное условие — придерживаться маршрута и дат\.',/, ruQ2);

fs.writeFileSync(path, content);
console.log('FAQ Added.');
