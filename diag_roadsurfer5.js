async function run() {
  const headers = { 
    'Accept': 'application/json, text/plain, */*', 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'X-Requested-Alias': 'rally.startStations'
  };
  const stRes = await fetch('https://booking.roadsurfer.com/api/en/rally/stations', { headers });
  const stations = await stRes.json();
  const deStations = stations.filter(s => s.city && s.city.country === 'DE');
  
  for (let s of deStations) {
    const destRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/stations/${s.id}`, { headers: {...headers, 'X-Requested-Alias': 'rally.fetchRoutes'} });
    const destinations = await destRes.json();
    let returns = destinations.returns || destinations.routes || (Array.isArray(destinations) ? destinations : []);
    if (returns.length > 0) {
      const destId = returns[0].id || returns[0].station_id || returns[0];
      const tfRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/timeframes/${s.id}-${destId}`, { headers: {...headers, 'X-Requested-Alias': 'rally.timeframes'} });
      try {
          const tfRaw = await tfRes.json();
          let frames = tfRaw.timeframes || tfRaw.ranges || tfRaw.results || tfRaw.data || (Array.isArray(tfRaw) ? tfRaw : []);
          if (frames.length > 0) {
              let tf = frames[0];
              let start = (tf.start || tf[0] || tf.start_date || tf.startDate).split('T')[0];
              let end = (tf.end || tf[1] || tf.end_date || tf.endDate).split('T')[0];
              const sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${s.id},${destId}]]&range=["${start}","${end}"]&currency=EUR`, {headers: {...headers, 'X-Requested-Alias': 'rally.search'}});
              const sData = await sRes.json();
              let items = sData.results || sData.data || sData || [];
              if (items.length > 0) {
                  let item = items[0];
                  console.log(`Offer ID: ${item.id}`);
                  console.log(`Pickup Date: ${item.pickup_date || item.pickupDate}`);
                  console.log(`Return Date: ${item.return_date || item.returnDate}`);
                  console.log(`Item dump:`, JSON.stringify(item).substring(0, 300));
                  break;
              }
          }
      } catch (e) {
          console.error(`Error on ${s.id}->${destId}:`, e.message);
      }
    }
  }
}
run().catch(console.error);
