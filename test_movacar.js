const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');

function setupGasContext() {
  const context = {
    console: console,
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => null, remove: () => null })
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null })
    },
    UrlFetchApp: {
      fetch: (url, options) => {
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
  const stations = ctx.getMovacarAllStations_();
  console.log("Total Movacar stations:", stations ? stations.length : 0);
} catch (e) {
  console.error(e);
}
