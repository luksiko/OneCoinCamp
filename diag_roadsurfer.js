async function run() {
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  };
  
  console.log('Fetching stations...');
  const stRes = await fetch('https://booking.roadsurfer.com/api/en/rally/stations', { headers: { ...headers, 'X-Requested-Alias': 'rally.startStations' } });
  const stations = await stRes.json();
  const deStations = stations.filter(s => s.city && s.city.country === 'DE');
  console.log(`Found ${deStations.length} DE stations. Checking first one: ${deStations[0].name} (${deStations[0].id})`);
  
  const originId = deStations[0].id;
  
  console.log(`Fetching destinations for ${originId}...`);
  const destRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/stations/${originId}`, { headers: { ...headers, 'X-Requested-Alias': 'rally.fetchRoutes' } });
  const destinations = await destRes.json();
  const returnIds = destinations.returns || destinations.routes || (Array.isArray(destinations) ? destinations : []);
  console.log(`Found ${returnIds.length} destinations.`);
  
  if (returnIds.length === 0) return;
  const destId = returnIds[0].id || returnIds[0].station_id || returnIds[0];
  console.log(`Checking timeframe for ${originId} -> ${destId}...`);
  
  const tfRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/timeframes/${originId}-${destId}`, { headers: { ...headers, 'X-Requested-Alias': 'rally.timeframes' } });
  const tfRaw = await tfRes.json();
  console.log('Timeframes API response:', JSON.stringify(tfRaw).substring(0, 200));
}
run().catch(console.error);
