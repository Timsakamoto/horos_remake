import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename, dirname } from 'node:path'
import { readFile, writeFile, readdir, stat, mkdir, copyFile, unlink } from 'node:fs/promises'

// The built directory structure
//
// ├─┬ dist
// │ ├─┬ main
// │ │ └── index.js
// │ ├─┬ renderer
// │ │ └── index.html
// │ 
process.env.DIST = join(__dirname, '../dist')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : join(process.env.DIST, '../public')

let win: BrowserWindow | null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1a1a1a', // Horos dark grey
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
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
        win.loadFile(join(process.env.DIST || '', 'index.html'))
    }
}

// IPC Handlers - Registered as early as possible
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'openDirectory', 'multiSelections']
    })
    return canceled ? [] : filePaths
})

ipcMain.handle('fs:readdirRecursive', async (_, dirPath: string) => {
    try {
        const results: string[] = [];
        const walk = async (dir: string) => {
            const files = await readdir(dir, { withFileTypes: true });
            for (const file of files) {
                const fullPath = join(dir, file.name);
                if (file.isDirectory()) {
                    await walk(fullPath);
                } else {
                    results.push(fullPath);
                }
            }
        };
        await walk(dirPath);
        return results;
    } catch (err) {
        console.error(err);
        return [];
    }
});

ipcMain.handle('fs:readFile', async (_, filePath) => {
    try {
        const fileStats = await stat(filePath);
        if (fileStats.isDirectory()) return null;
        return await readFile(filePath)
    } catch (err) {
        console.error(err)
        return null
    }
})

ipcMain.handle('fs:writeFile', async (_, filePath, data) => {
    try {
        const dir = dirname(filePath)
        await mkdir(dir, { recursive: true });
        await writeFile(filePath, Buffer.from(data))
        return true
    } catch (err) {
        console.error(err)
        return false
    }
})

ipcMain.handle('app:getPath', (_, name: any) => app.getPath(name))
ipcMain.handle('app:getAppPath', () => app.getAppPath())

ipcMain.handle('fs:ensureDir', async (_, dirPath: string) => {
    try {
        await mkdir(dirPath, { recursive: true })
        return true
    } catch (e) {
        console.error('fs:ensureDir error:', e)
        return false
    }
})

ipcMain.handle('fs:copyFile', async (_, src: string, dest: string) => {
    try {
        await copyFile(src, dest)
        return true
    } catch (e) {
        console.error('fs:copyFile error:', e)
        return false
    }
})

ipcMain.handle('fs:unlink', async (_, filePath: string) => {
    try {
        await unlink(filePath);
        return true;
    } catch (e) {
        console.error('fs:unlink error:', e);
        return false;
    }
});

ipcMain.handle('path:join', (_, ...args: string[]) => {
    return join(...args)
})

ipcMain.handle('path:basename', (_, p: string) => basename(p))

ipcMain.handle('app:toggleMaximize', () => {
    if (!win) return;
    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }
});

ipcMain.on('app:openViewer', (_, seriesUid: string) => {
    const viewerWin = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#000000',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hiddenInset',
    })

    const url = VITE_DEV_SERVER_URL
        ? `${VITE_DEV_SERVER_URL}?view=viewer&seriesUid=${seriesUid}`
        : `file://${join(process.env.DIST || '', 'index.html')}?view=viewer&seriesUid=${seriesUid}`

    viewerWin.loadURL(url)
})

app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
    createWindow()
})
