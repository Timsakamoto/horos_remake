import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
    versions: process.versions,
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, data: Uint8Array) => ipcRenderer.invoke('fs:writeFile', path, data),
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
    getAppPath: () => ipcRenderer.invoke('app:getAppPath'),
    openViewer: (seriesUid: string) => ipcRenderer.send('app:openViewer', seriesUid),
    readdirRecursive: (dir: string) => ipcRenderer.invoke('fs:readdirRecursive', dir),
    ensureDir: (path: string) => ipcRenderer.invoke('fs:ensureDir', path),
    copyFile: (src: string, dest: string) => ipcRenderer.invoke('fs:copyFile', src, dest),
    join: (...args: string[]) => ipcRenderer.invoke('path:join', ...args),
    basename: (path: string) => ipcRenderer.invoke('path:basename', path),
    unlink: (path: string) => ipcRenderer.invoke('fs:unlink', path),
    toggleMaximize: () => ipcRenderer.invoke('app:toggleMaximize')
}

// Use `contextBridge` APIs to expose IPC to the renderer
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', api)
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = api
    // @ts-ignore (define in dts)
    window.api = api
}
