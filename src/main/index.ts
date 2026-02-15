import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join, basename, dirname } from 'node:path'
import { readFile, writeFile, readdir, stat, mkdir, copyFile, unlink } from 'node:fs/promises'
import { DICOMService } from './dicom/DICOMService'

// Set app name explicitly for rebranding
app.name = 'Peregrine'
if (process.platform === 'darwin') {
    app.setName('Peregrine')
}

function createDefaultMenu() {
    const template: any[] = [
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'File',
            submenu: [
                { role: 'close' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                { type: 'separator' },
                { role: 'front' },
                { type: 'separator' },
                { role: 'window' }
            ]
        }
    ]
    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
}

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
        backgroundColor: '#1a1a1a', // Peregrine dark grey
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hiddenInset', // Mac-like title bar
    })

    win.on('closed', () => {
        win = null;
    });

    // Test active push message to Console
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date).toLocaleString())
    })

    // Enable SharedArrayBuffer
    // Enable SharedArrayBuffer
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Cross-Origin-Opener-Policy': ['same-origin'],
                'Cross-Origin-Embedder-Policy': ['require-corp'],
            },
        })
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
        const stats = await stat(dirPath);
        if (!stats.isDirectory()) {
            return [dirPath];
        }

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
    } catch (err: any) {
        if (err.code !== 'ENOENT') {
            console.error('fs:readdirRecursive error:', err);
        }
        return [];
    }
});

ipcMain.handle('fs:readFile', async (_, filePath, options) => {
    try {
        const fileStats = await stat(filePath);
        if (fileStats.isDirectory()) return null;

        if (options && typeof options === 'object' && options.length) {
            // Partial read
            const { open } = require('node:fs/promises');
            const handle = await open(filePath, 'r');
            // @ts-ignore
            const { buffer, bytesRead } = await handle.read({
                buffer: Buffer.allocUnsafe(options.length),
                length: options.length,
                position: options.start || 0
            });
            await handle.close();
            // Return only the bytes read if less than requested
            if (bytesRead < options.length) {
                return buffer.subarray(0, bytesRead);
            }
            return buffer;
        }

        // Full read
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

ipcMain.handle('fs:stat', async (_, filePath: string) => {
    try {
        const s = await stat(filePath);
        return {
            size: s.size,
            isDirectory: s.isDirectory(),
            mtime: s.mtime.getTime()
        };
    } catch (e) {
        console.error('fs:stat error:', e);
        return null;
    }
});

ipcMain.handle('path:join', (_, ...args: string[]) => {
    return join(...args)
})

ipcMain.handle('path:basename', (_, p: string) => basename(p))
ipcMain.handle('path:dirname', (_, p: string) => dirname(p))

ipcMain.handle('app:toggleMaximize', () => {
    if (!win) return;
    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }
});

ipcMain.handle('app:resetIndexedDB', async () => {
    try {
        const { session } = require('electron');
        await session.defaultSession.clearStorageData({
            storages: ['indexeddb']
        });
        return true;
    } catch (e) {
        console.error('app:resetIndexedDB error:', e);
        return false;
    }
});

ipcMain.handle('app:returnToDatabase', (event) => {
    if (win && !win.isDestroyed()) {
        win.show();
        win.focus();

        // If the window calling this is NOT the main window, close it
        const senderWin = BrowserWindow.fromWebContents(event.sender);
        if (senderWin && senderWin !== win) {
            senderWin.close();
        }
        return true;
    }
    return false;
});

ipcMain.on('app:openViewer', (event, seriesUid: string) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    const bounds = senderWin ? senderWin.getBounds() : null;

    const viewerWin = new BrowserWindow({
        width: bounds ? bounds.width : 1200,
        height: bounds ? bounds.height : 800,
        x: bounds ? bounds.x + 20 : undefined, // Slightly offset for visibility
        y: bounds ? bounds.y + 20 : undefined,
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
    new DICOMService();
    createDefaultMenu();
    createWindow()
})
