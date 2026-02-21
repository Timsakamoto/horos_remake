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
    dirname: (path: string) => ipcRenderer.invoke('path:dirname', path),
    unlink: (path: string) => ipcRenderer.invoke('fs:unlink', path),
    stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
    toggleMaximize: () => ipcRenderer.invoke('app:toggleMaximize'),
    resetIndexedDB: () => ipcRenderer.invoke('app:resetIndexedDB'),
    returnToDatabase: () => ipcRenderer.invoke('app:returnToDatabase'),
    pacs: {
        echo: (node: any) => ipcRenderer.invoke('pacs:echo', node),
        search: (node: any, level: string, query: any) => ipcRenderer.invoke('pacs:search', node, level, query),
        move: (node: any, destinationAet: string, level: string, keys: any) => ipcRenderer.invoke('pacs:move', node, destinationAet, level, keys),
        store: (node: any, filePaths: string[]) => ipcRenderer.invoke('pacs:store', node, filePaths),
        startListener: (aet: string, port: number, storagePath?: string) => ipcRenderer.invoke('pacs:startListener', aet, port, storagePath),
        stopListener: () => ipcRenderer.invoke('pacs:stopListener'),
        getJobs: () => ipcRenderer.invoke('pacs:getJobs'),
        clearCompletedJobs: () => ipcRenderer.invoke('pacs:clearCompletedJobs'),
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
    },
    watcher: {
        start: (dirPath: string) => ipcRenderer.invoke('watcher:start', dirPath),
        stop: (dirPath: string) => ipcRenderer.invoke('watcher:stop', dirPath),
        getActive: () => ipcRenderer.invoke('watcher:getActive'),
        onFilesAdded: (callback: (files: string[]) => void) => {
            const listener = (_: any, files: string[]) => callback(files);
            ipcRenderer.on('watcher:filesAdded', listener);
            return () => ipcRenderer.removeListener('watcher:filesAdded', listener);
        }
    },
    db: {
        query: (sql: string, params?: any[]) => ipcRenderer.invoke('db:query', sql, params),
        get: (sql: string, params?: any[]) => ipcRenderer.invoke('db:get', sql, params),
        run: (sql: string, params?: any[]) => ipcRenderer.invoke('db:run', sql, params),
        transaction: (operations: { sql: string; params: any[] }[]) => ipcRenderer.invoke('db:transaction', operations),
        importFiles: (filePaths: string[]) => ipcRenderer.invoke('db:importFiles', filePaths),
        onImportProgress: (callback: (data: { progress: number; message: string }) => void) => {
            const listener = (_: any, data: any) => callback(data);
            ipcRenderer.on('db:importProgress', listener);
            return () => ipcRenderer.removeListener('db:importProgress', listener);
        },
        onDeleteRequest: (callback: (type: string, data: any) => void) => {
            const listener = (_: any, type: string, data: any) => callback(type, data);
            ipcRenderer.on('db:deleteRequest', listener);
            return () => ipcRenderer.removeListener('db:deleteRequest', listener);
        },
        onExport: (callback: (type: string, data: any) => void) => {
            const listener = (_: any, type: string, data: any) => callback(type, data);
            ipcRenderer.on('db:export', listener);
            return () => ipcRenderer.removeListener('db:export', listener);
        },
        onViewTags: (callback: (type: string, data: any) => void) => {
            const listener = (_: any, type: string, data: any) => callback(type, data);
            ipcRenderer.on('db:viewTags', listener);
            return () => ipcRenderer.removeListener('db:viewTags', listener);
        },
        onDataUpdated: (callback: () => void) => {
            const listener = () => callback();
            ipcRenderer.on('db:dataUpdated', listener);
            return () => ipcRenderer.removeListener('db:dataUpdated', listener);
        }
    },
    showContextMenu: (type: 'study' | 'series', data: any) => ipcRenderer.invoke('app:showContextMenu', type, data),
    onNavigateTo: (callback: (page: string) => void) => {
        const listener = (_: any, page: string) => callback(page);
        ipcRenderer.on('app:navigateTo', listener);
        return () => ipcRenderer.removeListener('app:navigateTo', listener);
    },
    onTriggerImport: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('app:triggerImport', listener);
        return () => ipcRenderer.removeListener('app:triggerImport', listener);
    },
    onTriggerSend: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('app:triggerSend', listener);
        return () => ipcRenderer.removeListener('app:triggerSend', listener);
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
