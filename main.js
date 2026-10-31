const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client } = require('minecraft-launcher-core');
const { Auth } = require('msmc');

const MC_VERSION = '1.21.11';
const DATA = () => app.getPath('userData');
const INSTANCES_FILE = () => path.join(DATA(), 'instances.json');
const SETTINGS_FILE = () => path.join(DATA(), 'settings.json');
const instanceDir = (id) => path.join(DATA(), 'instances', id);

let win;
let session = null; // { token, name, uuid }

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
};
const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#15110f',
    title: 'Nova Launcher',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

/* ---------- instances ---------- */

ipcMain.handle('instances:list', () => readJson(INSTANCES_FILE(), []));

ipcMain.handle('instances:create', (_e, { name, version, note }) => {
  const list = readJson(INSTANCES_FILE(), []);
  const id = `${Date.now().toString(36)}`;
  const inst = {
    id,
    name: (name || 'New instance').slice(0, 40),
    loader: 'Fabric',
    version: version || MC_VERSION,
    note: note || '',
  };
  fs.mkdirSync(path.join(instanceDir(id), 'mods'), { recursive: true });
  list.push(inst);
  writeJson(INSTANCES_FILE(), list);
  return list;
});

ipcMain.handle('instances:delete', (_e, id) => {
  const list = readJson(INSTANCES_FILE(), []).filter((i) => i.id !== id);
  writeJson(INSTANCES_FILE(), list);
  fs.rmSync(instanceDir(id), { recursive: true, force: true });
  return list;
});

ipcMain.handle('instances:openFolder', (_e, id) => {
  fs.mkdirSync(instanceDir(id), { recursive: true });
  return shell.openPath(instanceDir(id));
});

/* ---------- settings ---------- */

ipcMain.handle('settings:get', () => readJson(SETTINGS_FILE(), { maxRam: '4G', javaPath: '' }));
ipcMain.handle('settings:set', (_e, s) => { writeJson(SETTINGS_FILE(), s); return s; });

/* ---------- account ---------- */

ipcMain.handle('auth:state', () => session ? { name: session.name, uuid: session.uuid } : null);

ipcMain.handle('auth:login', async () => {
  const authManager = new Auth('select_account');
  const xbox = await authManager.launch('electron');
  const mc = await xbox.getMinecraft();
  session = { token: mc, name: mc.profile.name, uuid: mc.profile.id };
  return { name: session.name, uuid: session.uuid };
});

ipcMain.handle('auth:logout', () => { session = null; return null; });

/* ---------- launching ---------- */

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'NovaLauncher/1.0' } });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json();
}

async function ensureFabric(root, mcVersion) {
  const loaders = await getJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
  const stable = loaders.find((l) => l.loader.stable) || loaders[0];
  if (!stable) throw new Error(`No Fabric loader available for ${mcVersion}`);
  const loaderVersion = stable.loader.version;
  const profile = await getJson(
    `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
  );
  const dir = path.join(root, 'versions', profile.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${profile.id}.json`), JSON.stringify(profile));
  return profile.id;
}

async function ensureFabricApi(modsDir, mcVersion) {
  if (fs.readdirSync(modsDir).some((f) => /^fabric-api/i.test(f))) return;
  const url = `https://api.modrinth.com/v2/project/fabric-api/version?loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(`["${mcVersion}"]`)}`;
  const versions = await getJson(url);
  const file = versions[0]?.files?.find((f) => f.primary) || versions[0]?.files?.[0];
  if (!file) throw new Error('Could not find a Fabric API build for this version');
  const res = await fetch(file.url);
  fs.writeFileSync(path.join(modsDir, file.filename), Buffer.from(await res.arrayBuffer()));
}

ipcMain.handle('instances:play', async (_e, id) => {
  const inst = readJson(INSTANCES_FILE(), []).find((i) => i.id === id);
  if (!inst) throw new Error('Instance not found');
  if (!session) throw new Error('Sign in with your Microsoft account first (Accounts tab).');

  const settings = readJson(SETTINGS_FILE(), { maxRam: '4G', javaPath: '' });
  const root = instanceDir(id);
  const modsDir = path.join(root, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  send('launch:status', { id, text: 'Preparing Fabric…' });
  const customId = await ensureFabric(root, inst.version);
  send('launch:status', { id, text: 'Checking Fabric API…' });
  await ensureFabricApi(modsDir, inst.version);

  const launcher = new Client();
  launcher.on('progress', (p) => send('launch:status', { id, text: `Downloading ${p.type} ${p.task}/${p.total}` }));
  launcher.on('data', () => send('launch:status', { id, text: 'Running' }));
  launcher.on('close', () => send('launch:status', { id, text: 'Ready to play', done: true }));
  launcher.on('debug', (m) => console.log('[mclc]', m));

  const opts = {
    authorization: session.token.mclc(),
    root,
    version: { number: inst.version, type: 'release', custom: customId },
    memory: { max: settings.maxRam || '4G', min: '1G' },
  };
  if (settings.javaPath) opts.javaPath = settings.javaPath;

  send('launch:status', { id, text: 'Starting…' });
  const proc = await launcher.launch(opts);
  if (!proc) throw new Error('Launch failed. Check that Java 21 is installed.');
  return true;
});
