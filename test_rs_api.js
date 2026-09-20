const { execSync } = require('child_process');

function fetchRs(url) {
  const curlCmd = `curl -s -w "\n%{http_code}" '${url}'`;
  const out = execSync(curlCmd, { encoding: 'utf8' });
  const lines = out.trim().split('\n');
  const code = parseInt(lines.pop(), 10);
  const body = lines.join('\n');
  return { code, body };
}

// Get all stations
const res = fetchRs('https://b2c.roadsurfer.com/api/v1/rally/stations');
console.log("Stations code:", res.code);
if (res.code === 200) {
  const data = JSON.parse(res.body);
  console.log("Stations count:", data.length);
  // Pick a station and get destinations
  if (data.length > 0) {
    const stId = data[0].id;
    const destRes = fetchRs(`https://b2c.roadsurfer.com/api/v1/rally/stations/${stId}/destinations`);
    console.log("Destinations for", stId, "code:", destRes.code);
    if (destRes.code === 200) {
      const dests = JSON.parse(destRes.body);
      console.log("Dests:", dests);
    }
  }
}
