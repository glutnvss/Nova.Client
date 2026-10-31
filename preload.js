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
  onStatus: (cb) => ipcRenderer.on('launch:status', (_e, p) => cb(p)),
});
