import http from 'node:http';

const port = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    return res.end(JSON.stringify({ status: 'ok', service: 'camper-proxy' }));
  }

  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let rawBody = '';
  req.on('data', (chunk) => {
    rawBody += chunk;
  });

  req.on('end', async () => {
    try {
      const payloadObj = rawBody ? JSON.parse(rawBody) : {};
      const { url, method = 'GET', headers = {}, payload } = payloadObj;

      if (!url) {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Missing target url' }));
      }

      const fetchOptions = {
        method: method.toUpperCase(),
        headers: {
          ...headers,
          'User-Agent':
            headers['User-Agent'] ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      };

      if (payload && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
        fetchOptions.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
      }

      const upstreamResponse = await fetch(url, fetchOptions);
      const body = await upstreamResponse.text();

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      return res.end(
        JSON.stringify({
          status: upstreamResponse.status,
          body,
        })
      );
    } catch (err) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      return res.end(
        JSON.stringify({
          status: 500,
          error: err.message || String(err),
        })
      );
    }
  });
});

server.listen(port, () => {
  console.log(`Camper micro-proxy running on port ${port}`);
});
