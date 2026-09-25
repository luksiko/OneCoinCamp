const fs = require('fs');
const path = 'docs/app.html';
let content = fs.readFileSync(path, 'utf8');

// Find the if (state.user.role === 'admin') block in updatePremiumBanner
const targetStr = `      if (state.user.role === 'admin') {
        banner.style.display = 'block';
        title.textContent = 'Admin Account';
        st.textContent = 'Unlimited access';
        emoji.textContent = '🛡️';
        if (btn) btn.style.display = 'none';
        if (btnStars) btnStars.style.display = 'none';
        if (btnCrypto) btnCrypto.style.display = 'none';
        rl.textContent = 'Routes: ' + currentRoutes + ' / ∞';
        
        var dBadgeA = document.getElementById('desktopSubBadge');
        if (dBadgeA) {
          dBadgeA.textContent = '🛡️ Admin';
          dBadgeA.className = 'desktop-sub-badge';
        }
        var dAdminA = document.getElementById('dTabAdmin');
        if (dAdminA) {
          dAdminA.style.display = 'inline-flex';
        }
        var addRouteBtnA = document.getElementById('btnAddRoute');
        if (addRouteBtnA) {
          addRouteBtnA.style.display = 'block';
        }
        return;
      }`;

content = content.replace(/if\s*\(state\.user\.role\s*===\s*'admin'\)\s*\{[^}]*return;\s*\}/, targetStr);

fs.writeFileSync(path, content);
console.log('Fixed admin tab logic');
