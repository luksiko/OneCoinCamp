const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');

function setupGasContext() {
  const context = {
    console: console,
    Utilities: {
      computeDigest: () => [1,2,3],
      DigestAlgorithm: { SHA_256: 1 },
      Charset: { UTF_8: 1 }
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => null, remove: () => null })
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null, setProperty: () => null })
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        let curlCmd = `curl -s --max-time 15 -w "\n%{http_code}" '${url}'`;
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
        
        return {
          getContentText: () => body,
          getResponseCode: () => code,
          getHeaders: () => ({})
        };
      }
    }
  };
  vm.createContext(context);
  ['gas/Config.js', 'gas/Http.js', 'gas/Providers.js'].forEach(file => {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  });
  return context;
}

const ctx = setupGasContext();

try {
  // Override batch size to process all 116 stations
  ctx.roadsurferRadarBatchSize_ = () => 116;
  
  const offers = ctx.fetchRoadsurferOffers_(
    { originId: '*', originCountry: '*', destinationId: '*' },
    { start: new Date(), end: new Date(Date.now() + 86400000 * 60) },
    {}
  );
  console.log("Total Roadsurfer offers across ALL 116 stations:", offers.length);
  if (offers.length > 0) {
    console.log("Sample:", offers[0]);
  }
} catch (e) {
  console.error(e);
}
