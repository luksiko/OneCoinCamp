const { execSync } = require('child_process');

function fetchJson(url, options) {
  let curlCmd = `curl -s -w "\n%{http_code}" '${url}'`;
  if (options && options.headers) {
    for (let k in options.headers) {
      curlCmd += ` -H '${k}: ${options.headers[k]}'`;
    }
  }
  if (options && options.payload) {
    curlCmd += ` -d '${options.payload}'`;
  }
  if (options && options.method) {
    curlCmd += ` -X ${options.method}`;
  }
  
  const out = execSync(curlCmd, { encoding: 'utf8', maxBuffer: 1024*1024*10 });
  const lines = out.trim().split('\n');
  const code = parseInt(lines.pop(), 10);
  const body = lines.join('\n');
  if (code >= 400) {
    console.log('Error', code, body);
    return null;
  }
  return JSON.parse(body);
}

// Movacar
console.log('Testing Movacar...');
const mBody = fetchJson('https://api.movacar.com/api/v1/widget/route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    payload: JSON.stringify({
      from: '', to: '', date: '', date_to: '', provider_id: '',
      vehicle_type: '', language_id: 'en'
    })
});
if (mBody && mBody.data && mBody.data.data) {
    console.log('Movacar offers:', mBody.data.data.length);
} else {
    console.log('Movacar response:', mBody);
}

