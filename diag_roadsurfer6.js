async function run() {
  const headers = { 
    'Accept': 'application/json, text/plain, */*', 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  };
  
  // Hardcoded known route and timeframe
  const sId = "108";
  const destId = "37";
  const start = "2026-10-19T00:00:00+00:00";
  const end = "2026-10-25T00:00:00+00:00";
  
  console.log('Testing with ISO strings');
  let sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${sId},${destId}]]&range=["${start}","${end}"]&currency=EUR`, {headers: {...headers, 'X-Requested-Alias': 'rally.search'}});
  let sData = await sRes.json();
  console.log(sData);
  
  console.log('Testing with short dates');
  sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${sId},${destId}]]&range=["${start.split('T')[0]}","${end.split('T')[0]}"]&currency=EUR`, {headers: {...headers, 'X-Requested-Alias': 'rally.search'}});
  sData = await sRes.json();
  console.log(sData);
}
run().catch(console.error);
