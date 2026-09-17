async function run() {
  const headers = { 
    'Accept': 'application/json, text/plain, */*', 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'X-Requested-Alias': 'rally.startStations'
  };
  const stRes = await fetch('https://booking.roadsurfer.com/api/en/rally/stations', { headers });
  const stations = await stRes.json();
  const deStations = stations.filter(s => s.city && s.city.country === 'DE');
  
  let validOffersFound = 0;
  
  for (let s of deStations) {
    const destRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/stations/${s.id}`, { headers: {...headers, 'X-Requested-Alias': 'rally.fetchRoutes'} });
    const destinations = await destRes.json();
    let returns = destinations.returns || destinations.routes || (Array.isArray(destinations) ? destinations : []);
    
    for (let r of returns) {
      const destId = r.id || r.station_id || r;
      const tfRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/timeframes/${s.id}-${destId}`, { headers: {...headers, 'X-Requested-Alias': 'rally.timeframes'} });
      try {
          const tfRaw = await tfRes.json();
          let frames = tfRaw.timeframes || tfRaw.ranges || tfRaw.results || tfRaw.data || (Array.isArray(tfRaw) ? tfRaw : []);
          for (let tf of frames) {
              let start = (tf.start || tf[0] || tf.start_date || tf.startDate).split('T')[0];
              let end = (tf.end || tf[1] || tf.end_date || tf.endDate).split('T')[0];
              
              const sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${s.id},${destId}]]&range=["${start}","${end}"]&currency=EUR`, {headers: {...headers, 'X-Requested-Alias': 'rally.search'}});
              const sData = await sRes.json();
              let items = sData.results || sData.data || sData || [];
              
              for (let item of items) {
                  if (item.available === false || item.id.includes('empty')) {
                      // skip empty
                  } else {
                      console.log(`\nREAL OFFER FOUND: ${s.name} (${s.id}) -> Dest (${destId}) [${start} - ${end}]`);
                      console.log(JSON.stringify(item, null, 2));
                      validOffersFound++;
                  }
              }
          }
      } catch (e) {
      }
    }
    if (validOffersFound > 0) break;
  }
  
  if (validOffersFound === 0) {
      console.log("No valid offers found in all of DE.");
  }
}
run().catch(console.error);
