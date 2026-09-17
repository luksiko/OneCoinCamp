async function run() {
  const headers = { 
    'Accept': 'application/json, text/plain, */*', 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  };
  
  // Augsburg (108) to Graz (37)
  const sId = "108";
  const destId = "37";
  
  console.log('Testing invalid range array');
  let sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${sId},${destId}]]&range=["asdf","qwer"]&currency=EUR`, {headers: {...headers, 'X-Requested-Alias': 'rally.search'}});
  let sData = await sRes.json();
  console.log(sData);
  
  console.log('Testing object range');
  sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${sId},${destId}]]&range=[{"startDate":"2026-10-19","endDate":"2026-10-25"}]&currency=EUR`, {headers: {...headers, 'X-Requested-Alias': 'rally.search'}});
  sData = await sRes.json();
  console.log(sData);
}
run().catch(console.error);
