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
    toggleMaximize: () => ipcRenderer.invoke('app:toggleMaximize'),
    returnToDatabase: () => ipcRenderer.invoke('app:returnToDatabase'),
    pacs: {
        echo: (node: any) => ipcRenderer.invoke('pacs:echo', node),
        search: (node: any, level: string, query: any) => ipcRenderer.invoke('pacs:search', node, level, query),
        move: (node: any, destinationAet: string, level: string, keys: any) => ipcRenderer.invoke('pacs:move', node, destinationAet, level, keys),
        startListener: (aet: string, port: number) => ipcRenderer.invoke('pacs:startListener', aet, port),
        stopListener: () => ipcRenderer.invoke('pacs:stopListener'),
        getJobs: () => ipcRenderer.invoke('pacs:getJobs'),
        onJobUpdated: (callback: any) => {
            const listener = (_: any, job: any) => callback(job);
            ipcRenderer.on('pacs:jobUpdated', listener);
            return () => ipcRenderer.removeListener('pacs:jobUpdated', listener);
        },
        onStorageProgress: (callback: any) => {
            const listener = (_: any, data: any) => callback(data);
            ipcRenderer.on('pacs:storageProgress', listener);
            return () => ipcRenderer.removeListener('pacs:storageProgress', listener);
        },
        setDebugLogging: (enabled: boolean) => ipcRenderer.invoke('pacs:setDebugLogging', enabled),
        openLogFile: () => ipcRenderer.invoke('pacs:openLogFile')
    }
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
