const fs = require('fs');
const vm = require('vm');

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
      getScriptProperties: () => ({
        getProperty: (key) => {
          return null; // Will just return null for now, can't access firestore without keys
        }
      })
    }
  };
  return context;
}
console.log("Keys missing, can't fetch");
