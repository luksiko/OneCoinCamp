async function run() {
  const headers = { 
    'Accept': 'application/json, text/plain, */*', 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'X-Requested-Alias': 'rally.search'
  };
  
  // Augsburg (108) to Graz (37)
  const sId = "108";
  const destId = "37";
  const start = "2026-10-19";
  const end = "2026-10-25";
  
  console.log('Testing with models=[]');
  let sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${sId},${destId}]]&range=["${start}","${end}"]&currency=EUR&models=[]`, {headers});
  let sData = await sRes.json();
  console.log('models=[] available:', sData[0].available);
  
  console.log('Testing WITHOUT models parameter');
  sRes = await fetch(`https://booking.roadsurfer.com/api/en/rally/search?stations=[[${sId},${destId}]]&range=["${start}","${end}"]&currency=EUR`, {headers});
  sData = await sRes.json();
  console.log('NO models parameter available:', sData[0].available);
}
run().catch(console.error);
