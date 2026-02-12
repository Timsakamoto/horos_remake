import { contextBridge } from 'electron'

// Custom APIs for renderer
const api = {
    versions: process.versions,
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
