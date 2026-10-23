// SBR 설계검토 — 윈도우 데스크톱 앱 (Electron)
// 화면(app/index.html)과 라이브러리(app/vendor)는 프로그램 안에 들어 있고,
// 업데이트 파일(SBR설계검토_업데이트_v*.zip)을 적용하면 사용자 폴더의 새 화면을 우선 사용함.
const electron = require('electron');
const { app, BrowserWindow, protocol, shell, session, Menu } = electron;
// 테스트 때만(SBR_TEST=1) 대화창을 자동으로 '예' 처리
const dialog = process.env.SBR_TEST ? { ...electron.dialog, showMessageBox: async (w,o)=>{ console.log('DIALOG', (o||w).message); return { response: 0 }; }, showErrorBox: (t,m)=>console.log('ERRBOX',t,m) } : electron.dialog;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);
const PKG = require('./package.json');
const APP_ID = 'sbr-design-review';
const ROOT = path.join(__dirname, 'app');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.wasm':'application/wasm', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };

const UPD = () => path.join(app.getPath('userData'), 'app-update');
const CFG = () => path.join(app.getPath('userData'), 'update-config.json');
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i]||0) !== (y[i]||0)) return (x[i]||0) - (y[i]||0); } return 0; };
function activeUpdate() { const m = readJSON(path.join(UPD(), 'manifest.json'), null); return (m && m.app === APP_ID && cmpVer(m.version, PKG.contentVersion) > 0 && fs.existsSync(path.join(UPD(), 'index.html'))) ? m : null; }
function currentVersion() { const m = activeUpdate(); return m ? m.version : PKG.contentVersion; }

let win = null;
function setTitle() { if (win) win.setTitle(`SBR 설계검토 v${currentVersion()}`); }
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    title: `SBR 설계검토 v${currentVersion()}`, backgroundColor: '#f6f7f5',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false }
  });
  win.loadURL('app://local/index.html');
  win.on('page-title-updated', (e) => { e.preventDefault(); setTitle(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

// ---------- 업데이트 ----------
// 업데이트 파일: ZIP 안에 manifest.json {app, version, notes} + index.html (+ 필요하면 vendor/...)
function readPackage(zipPath) {
  const z = new AdmZip(zipPath);
  const me = z.getEntry('manifest.json'); if (!me) throw new Error('manifest.json이 없는 파일입니다 (SBR 설계검토 업데이트 파일이 아님)');
  const m = JSON.parse(z.readAsText(me, 'utf8'));
  if (m.app !== APP_ID) throw new Error('SBR 설계검토 업데이트 파일이 아닙니다');
  if (!z.getEntry('index.html')) throw new Error('index.html이 없습니다');
  if (m.sha256 && m.sha256.index) { const h = crypto.createHash('sha256').update(z.getEntry('index.html').getData()).digest('hex'); if (h !== m.sha256.index) throw new Error('파일이 손상되었습니다 (검증값 불일치)'); }
  return { z, m };
}
function applyPackage(zipPath) {
  const { z, m } = readPackage(zipPath);
  const tmp = UPD() + '.tmp';
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  for (const e of z.getEntries()) {
    if (e.isDirectory) continue;
    const dest = path.normalize(path.join(tmp, e.entryName));
    if (!dest.startsWith(tmp)) continue;   // 경로 탈출 방지
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, e.getData());
  }
  fs.rmSync(UPD(), { recursive: true, force: true }); fs.renameSync(tmp, UPD());
  return m;
}
async function askAndApply(zipPath, m, quietIfOld) {
  const cur = currentVersion();
  if (cmpVer(m.version, cur) <= 0) { if (!quietIfOld) await dialog.showMessageBox(win, { type: 'info', title: '업데이트', message: `이미 최신입니다 (현재 v${cur}, 파일 v${m.version}).` }); return false; }
  const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['지금 업데이트', '나중에'], defaultId: 0, cancelId: 1, title: '업데이트',
    message: `새 버전 v${m.version}이 있습니다 (현재 v${cur}).`, detail: (m.notes || '') + '\n\n입력해 둔 값은 그대로 남습니다.' });
  if (r.response !== 0) return false;
  try { applyPackage(zipPath); setTitle(); win.reload(); dialog.showMessageBox(win, { type: 'info', title: '업데이트', message: `v${m.version} 버전으로 업데이트했습니다.` }); return true; }
  catch (e) { dialog.showErrorBox('업데이트 실패', String(e.message || e)); return false; }
}
// 업데이트 위치(폴더)에서 가장 새 업데이트 파일 찾기
function findInFolder(dir) {
  let best = null;
  for (const f of fs.readdirSync(dir)) { if (!/\.zip$/i.test(f)) continue; const p = path.join(dir, f);
    try { const { m } = readPackage(p); if (!best || cmpVer(m.version, best.m.version) > 0) best = { p, m }; } catch (_) {} }
  return best;
}
async function checkUpdates(manual) {
  const cfg = readJSON(CFG(), {});
  if (!cfg.source) { if (manual) { const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['위치 설정', '닫기'], title: '업데이트 확인', message: '업데이트 위치가 아직 정해지지 않았습니다.', detail: '업데이트 파일을 두는 폴더(예: 회사 공유폴더·원드라이브 폴더)를 지정하면 프로그램을 켤 때마다 새 버전을 확인합니다.' }); if (r.response === 0) await chooseSource(); } return; }
  try {
    if (/^https?:\/\//i.test(cfg.source)) {
      const base = cfg.source.replace(/\/+$/, '');
      const res = await fetch(base + '/latest.json', { cache: 'no-store' }); if (!res.ok) throw new Error('latest.json을 받지 못했습니다 (' + res.status + ')');
      const L = await res.json(); if (cmpVer(L.version, currentVersion()) <= 0) { if (manual) dialog.showMessageBox(win, { type: 'info', title: '업데이트', message: `최신 버전입니다 (v${currentVersion()}).` }); return; }
      const z = await fetch(new URL(L.file, base + '/').href); if (!z.ok) throw new Error('업데이트 파일을 받지 못했습니다');
      const tmp = path.join(app.getPath('temp'), `sbr-update-${L.version}.zip`); fs.writeFileSync(tmp, Buffer.from(await z.arrayBuffer()));
      const { m } = readPackage(tmp); await askAndApply(tmp, m, !manual);
    } else {
      if (!fs.existsSync(cfg.source)) { if (manual) dialog.showErrorBox('업데이트 확인', `업데이트 위치를 찾을 수 없습니다:\n${cfg.source}`); return; }
      const b = findInFolder(cfg.source);
      if (!b) { if (manual) dialog.showMessageBox(win, { type: 'info', title: '업데이트', message: '업데이트 위치에 업데이트 파일이 없습니다.' }); return; }
      await askAndApply(b.p, b.m, !manual);
    }
  } catch (e) { if (manual) dialog.showErrorBox('업데이트 확인 실패', String(e.message || e)); }
}
async function chooseSource() {
  const r = await dialog.showOpenDialog(win, { title: '업데이트 파일을 둘 폴더 선택', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return;
  fs.writeFileSync(CFG(), JSON.stringify({ source: r.filePaths[0] }, null, 2));
  dialog.showMessageBox(win, { type: 'info', title: '업데이트 위치', message: `업데이트 위치를 정했습니다:\n${r.filePaths[0]}`, detail: '이 폴더에 새 업데이트 파일(.zip)을 넣으면 다음에 프로그램을 켤 때 알려드립니다.' });
  checkUpdates(true);
}
async function openPackage() {
  const r = await dialog.showOpenDialog(win, { title: '업데이트 파일 열기', filters: [{ name: 'SBR 설계검토 업데이트', extensions: ['zip'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return;
  try { const { m } = readPackage(r.filePaths[0]); await askAndApply(r.filePaths[0], m, false); } catch (e) { dialog.showErrorBox('업데이트 실패', String(e.message || e)); }
}
async function rollback() {
  if (!activeUpdate()) { dialog.showMessageBox(win, { type: 'info', title: '되돌리기', message: `업데이트를 적용하지 않은 처음 버전입니다 (v${PKG.contentVersion}).` }); return; }
  const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['되돌리기', '취소'], defaultId: 1, cancelId: 1, title: '처음 버전으로 되돌리기', message: `v${currentVersion()} 업데이트를 지우고 설치할 때 버전(v${PKG.contentVersion})으로 돌아갑니다.` });
  if (r.response !== 0) return; fs.rmSync(UPD(), { recursive: true, force: true }); setTitle(); win.reload();
}
function buildMenu() {
  const cfg = readJSON(CFG(), {});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '파일', submenu: [{ label: '새로 고침', accelerator: 'F5', click: () => win && win.reload() }, { type: 'separator' }, { role: 'quit', label: '끝내기' }] },
    { label: '업데이트', submenu: [
      { label: '업데이트 확인', click: () => checkUpdates(true) },
      { label: '업데이트 파일 열기…', click: openPackage },
      { label: '업데이트 위치 설정…', click: chooseSource },
      { type: 'separator' },
      { label: '처음 버전으로 되돌리기', click: rollback },
      { label: '버전 정보', click: () => dialog.showMessageBox(win, { type: 'info', title: '버전 정보', message: `SBR 설계검토 v${currentVersion()}`, detail: `프로그램 v${PKG.version} · 화면 v${currentVersion()}${activeUpdate() ? ' (업데이트 적용)' : ''}\n업데이트 위치: ${readJSON(CFG(), {}).source || '지정 안 함'}` }) }
    ] },
    { label: '보기', submenu: [{ role: 'zoomIn', label: '크게' }, { role: 'zoomOut', label: '작게' }, { role: 'resetZoom', label: '원래 크기' }, { type: 'separator' }, { role: 'togglefullscreen', label: '전체 화면' }] }
  ]));
}

app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname); if (p === '/' || !p) p = '/index.html';
    const roots = activeUpdate() ? [UPD(), ROOT] : [ROOT];
    for (const r of roots) {
      const f = path.normalize(path.join(r, p));
      if (f.startsWith(r) && fs.existsSync(f)) return new Response(fs.readFileSync(f), { headers: { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' } });
    }
    return new Response('not found', { status: 404 });
  });
  session.defaultSession.on('will-download', (e, item) => {
    const dir = path.join(app.getPath('documents'), 'SBR 설계검토');
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    item.setSaveDialogOptions({ defaultPath: path.join(dir, item.getFilename()) });
  });
  buildMenu();
  createWindow();
  win.webContents.once('did-finish-load', () => setTimeout(() => checkUpdates(false), 1500));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
