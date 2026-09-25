const fs = require('fs');
const path = 'docs/app.html';
let content = fs.readFileSync(path, 'utf8');

const oldBlock = `
            <div style="font-size:11px;font-weight:600;color:var(--hint);margin-bottom:4px;">⏱️ Изменить время подписки:</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin:0;color:var(--success);border-color:rgba(76,217,100,0.3);" onclick="adminAdjustSub('\${u.telegram_id}', 30)">+30д</button>
              <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin:0;color:var(--success);border-color:rgba(76,217,100,0.3);" onclick="adminAdjustSub('\${u.telegram_id}', 7)">+7д</button>
              <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin:0;color:#ff9500;border-color:rgba(255,149,0,0.3);" onclick="adminAdjustSub('\${u.telegram_id}', -7)">-7д</button>
              <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin:0;color:#ff9500;border-color:rgba(255,149,0,0.3);" onclick="adminAdjustSub('\${u.telegram_id}', -30)">-30д</button>
              <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin:0;" onclick="adminPromptCustomDays('\${u.telegram_id}', '\${userName}')">⏳ +/- Дней</button>
              <button class="btn btn-secondary" style="padding:4px 8px;font-size:11px;margin:0;color:var(--danger);border-color:rgba(255,91,102,0.3);" onclick="adminRevokeSub('\${u.telegram_id}')">❌ Сбросить</button>
            </div>
          </div>
`;

const newBlock = `
            <div style="display:flex; flex-direction: column; gap:6px; margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.1);">
              <div style="font-size:11px;font-weight:600;color:var(--hint);text-transform:uppercase;letter-spacing:0.5px;">Управление подпиской:</div>
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(50px, 1fr)); gap:4px;">
                <button class="btn btn-secondary" style="width:100%;padding:6px 0;font-size:11px;margin:0;color:var(--success);border-color:rgba(76,217,100,0.3);" onclick="adminAdjustSub('\${u.telegram_id}', 30)">+30д</button>
                <button class="btn btn-secondary" style="width:100%;padding:6px 0;font-size:11px;margin:0;color:var(--success);border-color:rgba(76,217,100,0.3);" onclick="adminAdjustSub('\${u.telegram_id}', 7)">+7д</button>
                <button class="btn btn-secondary" style="width:100%;padding:6px 0;font-size:11px;margin:0;color:#ff9500;border-color:rgba(255,149,0,0.3);" onclick="adminAdjustSub('\${u.telegram_id}', -7)">-7д</button>
                <button class="btn btn-secondary" style="width:100%;padding:6px 0;font-size:11px;margin:0;color:#ff9500;border-color:rgba(255,149,0,0.3);" onclick="adminAdjustSub('\${u.telegram_id}', -30)">-30д</button>
                <button class="btn btn-secondary" style="width:100%;padding:6px 0;font-size:11px;margin:0;" onclick="adminPromptCustomDays('\${u.telegram_id}', '\${userName}')">⏳ Кастом</button>
                <button class="btn btn-secondary" style="width:100%;padding:6px 0;font-size:11px;margin:0;color:var(--danger);border-color:rgba(255,91,102,0.3);" onclick="adminRevokeSub('\${u.telegram_id}')">❌ Сброс</button>
              </div>
            </div>
          </div>
`;

// Wait, the new block uses string interpolation `${u.telegram_id}` exactly like the original.
// We must escape it in the JS code that modifies the file, or just use normal strings.
// But we are in a node script using template literals, so we escaped `\${` in the script.

content = content.replace(oldBlock.trim(), newBlock.trim());

fs.writeFileSync(path, content);
console.log('Fixed admin user card UX');
