import re
import json

with open('docs/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

providers_html = """
  <!-- Providers Section -->
  <section id="providers" style="background: var(--section-bg);">
    <div class="container">
      <div class="section-header">
        <div class="section-tag" data-i18n="prov_tag">Rules & Features</div>
        <h2 data-i18n="prov_title">Provider Rules & Features</h2>
        <p data-i18n="prov_desc">Important differences between marketplaces and direct operators.</p>
      </div>
      
      <div style="margin-bottom: 30px; text-align: left; background: var(--card-bg); padding: 24px; border-radius: var(--radius-lg); border: 1px solid var(--border-light); box-shadow: var(--shadow-sm);">
        <h3 style="margin-top: 0; font-size: 20px; margin-bottom: 12px; color: var(--text-dark);" data-i18n="prov_intro_title">Aggregators vs Direct Operators</h3>
        <p style="margin-bottom: 12px;" data-i18n="prov_intro_p1">It's important to understand the difference: <b>Roadsurfer</b> and <b>Indie Campers</b> are direct operators (they own their fleet). <b>Movacar</b> and <b>Imoova</b> are marketplaces combining offers from various suppliers. Therefore, conditions on marketplaces highly depend on the specific supplier.</p>
        <ul style="padding-left: 20px; line-height: 1.6; margin: 0;">
          <li data-i18n="prov_intro_li1"><b>Booking confirmation:</b> Direct operators confirm instantly. Marketplaces often require manual approval from the supplier (booking may fail).</li>
          <li data-i18n="prov_intro_li2"><b>Fuel policy:</b> The most common rule is "full-to-full".</li>
          <li data-i18n="prov_intro_li3"><b>Late fees:</b> Returning the vehicle after depot closing hours or agreed time results in extra day charges and potential fines.</li>
        </ul>
      </div>

      <div class="features-grid" style="text-align: left;">
        <div class="feature-card">
          <div class="feature-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--primary);">🚐</div>
          <h3 style="margin-top: 0; margin-bottom: 12px;">Roadsurfer (Rally)</h3>
          <ul style="padding-left: 20px; font-size: 14px; line-height: 1.6; margin: 0;">
            <li data-i18n="prov_rs_1"><b>Price:</b> Usually a fixed price for the whole trip (e.g. from €129 in EU, $199 in US for up to 7 days).</li>
            <li data-i18n="prov_rs_2"><b>Mileage:</b> Route distance + 25% or 200km/day. Extra km is paid (e.g. €0.50/km).</li>
            <li data-i18n="prov_rs_3"><b>Deposit:</b> Around €800, blocked on card for ~30 days.</li>
            <li data-i18n="prov_rs_4"><b>Perks:</b> 2nd driver is free. Pets allowed as "dog camper" for an extra fee.</li>
            <li data-i18n="prov_rs_5">Changing dates is subject to availability and extra fees. Cancel >48h for a voucher.</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <div class="feature-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--primary);">🚗</div>
          <h3 style="margin-top: 0; margin-bottom: 12px;">Movacar</h3>
          <ul style="padding-left: 20px; font-size: 14px; line-height: 1.6; margin: 0;">
            <li data-i18n="prov_mc_1"><b>Duration:</b> Regular cars (via Sixt) are strictly limited to <b>24 hours</b>. Campers (via Roadsurfer/Indie) follow the original operator's terms.</li>
            <li data-i18n="prov_mc_2"><b>Deposit:</b> Varies from €300 to €3000 depending on the vehicle class.</li>
            <li data-i18n="prov_mc_3"><b>Extension:</b> Possible as a "request" that can be denied. Cancel <24h (or no-show) = €50 fee.</li>
            <li data-i18n="prov_mc_4">Xpress mode (beta): €150 deposit, min age 25, cancel fee anytime. Translated driving license sometimes required for foreigners.</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <div class="feature-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--primary);">🏕️</div>
          <h3 style="margin-top: 0; margin-bottom: 12px;">Indie Campers</h3>
          <ul style="padding-left: 20px; font-size: 14px; line-height: 1.6; margin: 0;">
            <li data-i18n="prov_ic_1">Fixed €1 offers for specific dates and locations.</li>
            <li data-i18n="prov_ic_2"><b>No free extensions after start.</b> Drop-off date/time changes must be requested >48h before pickup.</li>
            <li data-i18n="prov_ic_3">Extra days can be purchased (before rental starts) but they cost the <b>full live rental rate</b>, not €1.</li>
          </ul>
        </div>
        
        <div class="feature-card">
          <div class="feature-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--primary);">🌍</div>
          <h3 style="margin-top: 0; margin-bottom: 12px;">Imoova</h3>
          <ul style="padding-left: 20px; font-size: 14px; line-height: 1.6; margin: 0;">
            <li data-i18n="prov_im_1">Booking is not confirmed until the supplier manually approves it.</li>
            <li data-i18n="prov_im_2">Extra days are purchased upfront ("down-payment on extra days").</li>
            <li data-i18n="prov_im_3">Deposit (bond) is paid to the supplier; the card must be in the driver's name.</li>
            <li data-i18n="prov_im_4">Strict late penalties. Always call the depot in advance if you might arrive after closing hours.</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
"""

# Insert HTML before <section id="faq">
content = content.replace('  <!-- FAQ Section -->', providers_html + '\n  <!-- FAQ Section -->')

# Add translation strings to the JS object
ru_strings = """
        prov_tag: 'Особенности',
        prov_title: 'Провайдеры и условия',
        prov_desc: 'Важные отличия маркетплейсов и прямых операторов.',
        prov_intro_title: 'Агрегаторы vs Прямые операторы',
        prov_intro_p1: 'Важно понимать разницу: <b>Roadsurfer</b> и <b>Indie Campers</b> — прямые операторы (владеют собственным флотом). <b>Movacar</b> и <b>Imoova</b> — маркетплейсы, объединяющие предложения от разных поставщиков. Из-за этого условия (особенно на агрегаторах) могут зависеть от конкретного авто и поставщика.',
        prov_intro_li1: '<b>Подтверждение брони:</b> У прямых операторов бронь происходит мгновенно. На маркетплейсах часто требуется ручное одобрение поставщика (бронь может не состояться).',
        prov_intro_li2: '<b>Топливо:</b> Чаще всего действует правило «полный бак взяли — полный бак вернули».',
        prov_intro_li3: '<b>Штрафы за просрочку:</b> Сдача авто позже времени закрытия депо или согласованного срока грозит начислением дополнительных суток и штрафом.',
        prov_rs_1: '<b>Цена:</b> Обычно фиксированная за всю поездку (в Европе от €129, в США от $199 за срок до 7 дней).',
        prov_rs_2: '<b>Пробег:</b> Расстояние перегона + 25% или 200 км/день. Перепробег платный (напр. €0.50/км).',
        prov_rs_3: '<b>Залог:</b> Около €800, блокируется на карте на ~30 дней.',
        prov_rs_4: '<b>Фишки:</b> Второй водитель — бесплатно. Возможен провоз питомца (доплата ~$99-135).',
        prov_rs_5: 'Изменение сроков возможно только по наличию слотов (и за доплату). Отмена до 48 ч даёт ваучер (50-100%).',
        prov_mc_1: '<b>Срок:</b> Для обычных легковых авто (через Sixt) срок ограничен <b>24 часами</b>. Для кемперов (через Roadsurfer/Indie) действуют условия исходного оператора.',
        prov_mc_2: '<b>Залог:</b> Не €100, а от €300 до €3000 в зависимости от класса авто.',
        prov_mc_3: '<b>Продление:</b> Возможно как "запрос", который могут отклонить. Отмена меньше чем за 24ч (или неявка) — штраф €50.',
        prov_mc_4: 'В режиме Xpress (бета) — депозит €150, мин. возраст 25 лет, штраф за отмену в любой момент. Иногда требуется перевод прав для иностранцев.',
        prov_ic_1: 'Фиксированные €1 предложения для конкретных дат и локаций.',
        prov_ic_2: '<b>Нет свободного продления после старта.</b> Изменить дату/время возврата можно только за 48 часов до получения.',
        prov_ic_3: 'Дополнительные дни докупить можно (до старта аренды), но они будут стоить по <b>полному живому тарифу</b>, а не €1.',
        prov_im_1: 'Бронирование не подтверждено до одобрения поставщиком.',
        prov_im_2: 'Доп. дни покупаются заранее («down-payment on extra days»).',
        prov_im_3: 'Депозит (bond) платится поставщику; карта должна быть на имя водителя.',
        prov_im_4: 'Опоздания строго караются. Лучше звонить в депо заранее, если не успеваете к закрытию.',
        faq_tag: 'Частые вопросы',
"""

en_strings = """
        prov_tag: 'Rules & Features',
        prov_title: 'Provider Conditions',
        prov_desc: 'Important differences between marketplaces and direct operators.',
        prov_intro_title: 'Aggregators vs Direct Operators',
        prov_intro_p1: 'It\\'s important to understand the difference: <b>Roadsurfer</b> and <b>Indie Campers</b> are direct operators (they own their fleet). <b>Movacar</b> and <b>Imoova</b> are marketplaces combining offers from various suppliers. Therefore, conditions on marketplaces highly depend on the specific supplier.',
        prov_intro_li1: '<b>Booking confirmation:</b> Direct operators confirm instantly. Marketplaces often require manual approval from the supplier (booking may fail).',
        prov_intro_li2: '<b>Fuel policy:</b> The most common rule is "full-to-full".',
        prov_intro_li3: '<b>Late fees:</b> Returning the vehicle after depot closing hours or agreed time results in extra day charges and potential fines.',
        prov_rs_1: '<b>Price:</b> Usually a fixed price for the whole trip (e.g. from €129 in EU, $199 in US for up to 7 days).',
        prov_rs_2: '<b>Mileage:</b> Route distance + 25% or 200km/day. Extra km is paid (e.g. €0.50/km).',
        prov_rs_3: '<b>Deposit:</b> Around €800, blocked on card for ~30 days.',
        prov_rs_4: '<b>Perks:</b> 2nd driver is free. Pets allowed as "dog camper" for an extra fee.',
        prov_rs_5: 'Changing dates is subject to availability and extra fees. Cancel >48h for a voucher (50-100%).',
        prov_mc_1: '<b>Duration:</b> Regular cars (via Sixt) are strictly limited to <b>24 hours</b>. Campers (via Roadsurfer/Indie) follow the original operator\\'s terms.',
        prov_mc_2: '<b>Deposit:</b> Varies from €300 to €3000 depending on the vehicle class.',
        prov_mc_3: '<b>Extension:</b> Possible as a "request" that can be denied. Cancel <24h (or no-show) = €50 fee.',
        prov_mc_4: 'Xpress mode (beta): €150 deposit, min age 25, cancel fee anytime. Translated driving license sometimes required for foreigners.',
        prov_ic_1: 'Fixed €1 offers for specific dates and locations.',
        prov_ic_2: '<b>No free extensions after start.</b> Drop-off date/time changes must be requested >48h before pickup.',
        prov_ic_3: 'Extra days can be purchased (before rental starts) but they cost the <b>full live rental rate</b>, not €1.',
        prov_im_1: 'Booking is not confirmed until the supplier manually approves it.',
        prov_im_2: 'Extra days are purchased upfront ("down-payment on extra days").',
        prov_im_3: 'Deposit (bond) is paid to the supplier; the card must be in the driver\\'s name.',
        prov_im_4: 'Strict late penalties. Always call the depot in advance if you might arrive after closing hours.',
        faq_tag: 'Got Questions?',
"""

de_strings = """
        prov_tag: 'Besonderheiten',
        prov_title: 'Anbieter & Bedingungen',
        prov_desc: 'Wichtige Unterschiede zwischen Marktplätzen und direkten Betreibern.',
        prov_intro_title: 'Aggregatoren vs. Direkte Betreiber',
        prov_intro_p1: 'Es ist wichtig, den Unterschied zu verstehen: <b>Roadsurfer</b> und <b>Indie Campers</b> sind direkte Betreiber (sie besitzen ihre Flotte). <b>Movacar</b> und <b>Imoova</b> sind Marktplätze, die Angebote verschiedener Anbieter bündeln. Die Bedingungen auf Marktplätzen hängen daher stark vom jeweiligen Anbieter ab.',
        prov_intro_li1: '<b>Buchungsbestätigung:</b> Direkte Betreiber bestätigen sofort. Marktplätze erfordern oft die manuelle Freigabe des Anbieters (Buchung kann fehlschlagen).',
        prov_intro_li2: '<b>Tankregelung:</b> Die häufigste Regel ist "voll/voll".',
        prov_intro_li3: '<b>Verspätungsgebühren:</b> Eine Rückgabe nach Schließung der Station oder der vereinbarten Zeit führt zu zusätzlichen Tagesgebühren und möglichen Strafen.',
        prov_rs_1: '<b>Preis:</b> Meist ein Festpreis für die gesamte Reise (z. B. ab 129 € in der EU, 199 $ in den USA für bis zu 7 Tage).',
        prov_rs_2: '<b>Kilometer:</b> Routendistanz + 25 % oder 200 km/Tag. Zusätzliche km kosten extra (z.B. 0,50 €/km).',
        prov_rs_3: '<b>Kaution:</b> Etwa 800 €, für ca. 30 Tage auf der Karte blockiert.',
        prov_rs_4: '<b>Extras:</b> 2. Fahrer ist kostenlos. Haustiere als "Dog Camper" gegen Aufpreis möglich.',
        prov_rs_5: 'Terminänderungen unterliegen der Verfügbarkeit und Gebühren. Stornierung >48h für einen Gutschein (50-100%).',
        prov_mc_1: '<b>Dauer:</b> Normale Autos (über Sixt) sind strikt auf <b>24 Stunden</b> begrenzt. Camper (über Roadsurfer/Indie) folgen den Bedingungen des Ursprungsanbieters.',
        prov_mc_2: '<b>Kaution:</b> Variiert zwischen 300 € und 3000 €, je nach Fahrzeugklasse.',
        prov_mc_3: '<b>Verlängerung:</b> Möglich als "Anfrage", die abgelehnt werden kann. Stornierung <24h (oder Nichterscheinen) = 50 € Gebühr.',
        prov_mc_4: 'Xpress-Modus (Beta): 150 € Kaution, Mindestalter 25, Stornogebühr jederzeit. Übersetzter Führerschein für Ausländer manchmal erforderlich.',
        prov_ic_1: 'Feste 1€-Angebote für bestimmte Daten und Orte.',
        prov_ic_2: '<b>Keine kostenlosen Verlängerungen nach Start.</b> Änderungen von Rückgabedatum/-zeit müssen >48h vor Abholung beantragt werden.',
        prov_ic_3: 'Zusätzliche Tage können (vor Mietbeginn) gekauft werden, kosten aber den <b>vollen Live-Mietpreis</b>, nicht 1€.',
        prov_im_1: 'Buchung ist erst bestätigt, wenn der Anbieter sie manuell freigibt.',
        prov_im_2: 'Zusatztage werden im Voraus gekauft ("Anzahlung auf Zusatztage").',
        prov_im_3: 'Kaution (Bond) wird an den Anbieter gezahlt; Karte muss auf den Namen des Fahrers lauten.',
        prov_im_4: 'Strenge Verspätungsstrafen. Rufen Sie immer vorher bei der Station an, falls Sie nach Geschäftsschluss ankommen könnten.',
        faq_tag: 'Häufige Fragen',
"""

content = content.replace("faq_tag: 'Частые вопросы',", ru_strings)
content = content.replace("faq_tag: 'Got Questions?',", en_strings)
content = content.replace("faq_tag: 'Häufige Fragen',", de_strings)

with open('docs/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
