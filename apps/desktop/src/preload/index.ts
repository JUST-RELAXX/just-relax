import { contextBridge, ipcRenderer } from 'electron';
import { APP_NAME, APP_VERSION } from '../shared/app-config';
import type { AuroraLibraryApi } from '../shared/library';
import type { AuroraLyricsApi } from '../shared/lyrics';

contextBridge.exposeInMainWorld('aurora', {
  appName: APP_NAME,
  version: APP_VERSION,
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    import: () => ipcRenderer.invoke('library:import'),
    remove: (id: string) => ipcRenderer.invoke('library:remove', id),
  } satisfies AuroraLibraryApi,
  lyrics: {
    getContact: () => ipcRenderer.invoke('lyrics:get-contact'),
    setContact: (value: string) => ipcRenderer.invoke('lyrics:set-contact', value),
    get: (lookup) => ipcRenderer.invoke('lyrics:get', lookup),
    search: (lookup) => ipcRenderer.invoke('lyrics:search', lookup),
  } satisfies AuroraLyricsApi,
});
