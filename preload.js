const { contextBridge, ipcRenderer } = require('electron');

const invoke = (c) => (...a) => ipcRenderer.invoke(c, ...a);

contextBridge.exposeInMainWorld('nova', {
  listInstances: invoke('instances:list'),
  createInstance: invoke('instances:create'),
  deleteInstance: invoke('instances:delete'),
  openFolder: invoke('instances:openFolder'),
  play: invoke('instances:play'),
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  authState: invoke('auth:state'),
  login: invoke('auth:login'),
  logout: invoke('auth:logout'),
  listContent: invoke('content:list'),
  removeContent: invoke('content:remove'),
  importContent: invoke('content:import'),
  searchModrinth: invoke('modrinth:search'),
  installModrinth: invoke('modrinth:install'),
  onStatus: (cb) => ipcRenderer.on('launch:status', (_e, p) => cb(p)),
});
