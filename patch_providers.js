const fs = require('fs');
let code = fs.readFileSync('gas/Providers.js', 'utf8');

// Replace the inner loop in fetchMovacarOffers_
const startStr = "const url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?' + query;";
const endStr = "      }\n    }\n  }\n\n  return foundOffers;";

const newCode = `const url = 'https://crowd-api-production-615013621295.europe-west1.run.app/v1/offers?locale=en&origin=' + encodeURIComponent(origin.id) + (isWildDest ? '' : '&destination=' + encodeURIComponent(destRef));
    
    let payload;
    try {
      payload = fetchJson_(url, {
        headers: {
          Accept: 'application/vnd.api+json',
          Origin: 'https://movacar.com',
          Referer: 'https://movacar.com/',
          'X-Request-Id': randomRequestId_()
        },
        retries: 1
      });
    } catch (e) {
      continue;
    }
    
    const included = payload.included || [];
    const stations = {};
    const prices = {};
    for (let j = 0; j < included.length; j++) {
      if (included[j].type === 'station') {
        stations[included[j].id] = included[j].attributes;
      } else if (included[j].type === 'monetary_amount') {
        prices[included[j].id] = included[j].attributes;
      }
    }

    const data = payload.data || [];
    for (let j = 0; j < data.length; j++) {
      const item = data[j];
      if (item.type !== 'offer') continue;
      
      const attrs = item.attributes || {};
      const rels = item.relationships || {};
      
      const destData = (rels.destination && rels.destination.data) || {};
      const destStation = stations[destData.id] || {};
      const destName = destStation.city || destStation.alternative_city || 'Unknown';
      const destCountry = MOVACAR_COUNTRIES[destName] || '';
      const destReference = destStation.reference || destRef;

      if (isWildDest && route.destinationCountry && destCountry) {
        if (String(route.destinationCountry).toUpperCase() !== String(destCountry).toUpperCase()) continue;
      }
      
      const priceData = (rels.base_price && rels.base_price.data) || {};
      const priceInfo = prices[priceData.id];
      const priceVal = priceInfo ? (priceInfo.amount_minor_units / 100) : 1;
      
      let vName = attrs.make || attrs.model || attrs.vehicle_category_name || 'Movacar vehicle';
      if (attrs.model && attrs.model !== vName) vName += ' ' + attrs.model;
      
      const pDateStr = attrs.start_date || formatIsoDate_(window.start);
      const rDateStr = attrs.end_date || formatIsoDate_(window.end);
      const oId = attrs.offer_id || item.id;
      
      foundOffers.push({
        source: 'movacar',
        offerId: String(oId),
        vehicleId: '',
        vehicle: String(vName).trim(),
        origin: origin.name,
        originCountry: route.originCountry,
        destination: destName,
        destinationCountry: destCountry || route.destinationCountry,
        pickupDate: pDateStr.split('T')[0],
        returnDate: rDateStr.split('T')[0],
        price: priceVal,
        bookingUrl: 'https://movacar.com/'
      });
    }
  }

  return foundOffers;`;

let startIndex = code.indexOf(startStr);
if (startIndex === -1) throw new Error("Could not find start string in gas/Providers.js");
let endIndex = code.indexOf(endStr, startIndex);
if (endIndex === -1) throw new Error("Could not find end string in gas/Providers.js");

code = code.substring(0, startIndex) + newCode + code.substring(endIndex + endStr.length);
fs.writeFileSync('gas/Providers.js', code);
console.log('gas/Providers.js patched successfully!');
