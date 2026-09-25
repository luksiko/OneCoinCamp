const fs = require('fs');
const path = 'docs/app.html';
let content = fs.readFileSync(path, 'utf8');

// Remove HTML block
content = content.replace(/\s*<div class="card" id="cardPromo">[\s\S]*?<\/div>\s*<\/div>/, '\n      </div>'); 
// Wait, the regex might over-match if there are nested divs. Let's be precise.
