import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

// The built directory structure
//
// ├─┬ dist
// │ ├─┬ main
// │ │ └── index.js
// │ ├─┬ renderer
// │ │ └── index.html
// │ 
process.env.DIST = path.join(__dirname, '../dist')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1a1a1a', // Horos dark grey
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hiddenInset', // Mac-like title bar
    })

    // Test active push message to Console
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
    } else {
        win.loadFile(path.join(process.env.DIST || '', 'index.html'))
    }
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections']
    })
    if (canceled) {
        return []
    } else {
        return filePaths
    }
})

ipcMain.handle('fs:readFile', async (_, filePath) => {
    try {
        const buffer = await fs.readFile(filePath)
        return buffer
    } catch (err) {
        console.error(err)
        return null
    }
})

ipcMain.handle('fs:writeFile', async (_, filePath, data) => {
    try {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, Buffer.from(data))
        return true
    } catch (err) {
        console.error(err)
        return false
    }
})

ipcMain.handle('app:getPath', async (_, name: any) => {
    return app.getPath(name);
})

app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(createWindow)
