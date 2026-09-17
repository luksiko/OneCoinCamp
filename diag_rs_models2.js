async function run() {
  const headers = { 
    'Accept': 'application/json, text/plain, */*', 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  };
  
  // Augsburg (108) to Graz (37)
  const sId = "108";
  const destId = "37";
  const start = "2026-10-19";
  const end = "2026-10-25";
  
  console.log('Testing with models=[1,2,3,4,5]');
  let sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${sId},${destId}]]&range=["${start}","${end}"]&currency=EUR&models=[1,2,3,4,5]`, {headers: {...headers, 'X-Requested-Alias': 'rally.search'}});
  let sData = await sRes.json();
  console.log('models=[1,2,3,4,5] available:', sData[0].available);
}
run().catch(console.error);
