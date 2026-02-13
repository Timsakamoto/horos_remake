import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
    versions: process.versions,
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, data: Uint8Array) => ipcRenderer.invoke('fs:writeFile', path, data),
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
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
