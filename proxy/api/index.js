export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'camper-proxy' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, method = 'GET', headers = {}, payload } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: 'Missing target url' });
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

    return res.status(200).json({
      status: upstreamResponse.status,
      body,
    });
  } catch (err) {
    return res.status(200).json({
      status: 500,
      error: err.message || String(err),
    });
  }
}
