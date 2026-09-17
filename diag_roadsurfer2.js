async function run() {
  const headers = { 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0' };
  const stRes = await fetch('https://booking.roadsurfer.com/api/en/rally/stations', { headers });
  const stations = await stRes.json();
  const deStations = stations.filter(s => s.city && s.city.country === 'DE');
  
  for (let s of deStations) {
    const destRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/stations/${s.id}`, { headers });
    const destinations = await destRes.json();
    let returns = destinations.returns || destinations.routes || (Array.isArray(destinations) ? destinations : []);
    if (returns.length > 0) {
      const destId = returns[0].id || returns[0].station_id || returns[0];
      console.log(`${s.name} (${s.id}) -> Dest (${destId})`);
      const tfRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/timeframes/${s.id}-${destId}`, { headers });
      const tfRaw = await tfRes.json();
      console.log('Timeframes:', JSON.stringify(tfRaw).substring(0, 200));
      if (tfRaw.timeframes && tfRaw.timeframes.length > 0) {
          const tf = tfRaw.timeframes[0];
          console.log(`Searching range: ${tf.start} to ${tf.end}`);
          const sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${s.id},${destId}]]&range=["${tf.start}","${tf.end}"]&currency=EUR`, {headers});
          const sData = await sRes.json();
          console.log('Offers:', JSON.stringify(sData).substring(0, 200));
          break;
      } else if (Array.isArray(tfRaw) && tfRaw.length > 0) {
          console.log('Searching range:', tfRaw[0]);
          break;
      }
    }
  }
}
run().catch(console.error);
