import { app, BrowserWindow, ipcMain, dialog, Menu, protocol } from 'electron'
import { join, basename, dirname } from 'node:path'
import { readFile, writeFile, readdir, stat, mkdir, copyFile, unlink } from 'node:fs/promises'
import { DICOMService } from './dicom/DICOMService'
import { WatcherService } from './WatcherService'
import { SQLiteManager } from './database/SQLiteManager'
import { initSchema } from './database/schema'
import { setupDatabaseHandlers } from './database/ipcHandlers'
import { ImportManager } from './database/ImportManager'

// Set app name explicitly for rebranding
app.name = 'Peregrine'
if (process.platform === 'darwin') {
    app.setName('Peregrine')
}

// Register custom protocol for local DICOM file access
protocol.registerSchemesAsPrivileged([
    { scheme: 'electronfile', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createDefaultMenu() {
    const template: any[] = [
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { label: 'Preferences...', accelerator: 'CmdOrCtrl+,', click: () => win?.webContents.send('app:navigateTo', 'settings') },
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
                { label: 'Import Files...', accelerator: 'CmdOrCtrl+I', click: () => win?.webContents.send('app:triggerImport') },
                { type: 'separator' },
                { role: 'close' }
            ]
        },
        {
            label: 'Viewer',
            submenu: [
                { label: 'Next Image', accelerator: 'Right', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('viewer:nextImage') },
                { label: 'Previous Image', accelerator: 'Left', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('viewer:prevImage') },
                { type: 'separator' },
                { label: 'Reset View', accelerator: 'CmdOrCtrl+R', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('viewer:reset') },
                { type: 'separator' },
                { label: 'Toggle 3D', accelerator: 'CmdOrCtrl+3', click: () => BrowserWindow.getFocusedWindow()?.webContents.send('viewer:toggle3D') }
            ]
        },
        {
            label: 'PACS',
            submenu: [
                { label: 'Query / Retrieve...', accelerator: 'CmdOrCtrl+L', click: () => win?.webContents.send('app:navigateTo', 'pacs') },
                { label: 'Send Selection...', accelerator: 'CmdOrCtrl+S', click: () => win?.webContents.send('app:triggerSend') }
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

// Register SQLite handlers immediately to prevent "No handler registered" errors
console.log('[Main] Registering SQLite handlers...');
setupDatabaseHandlers();
console.log('[Main] SQLite handlers registered.');

// Helper for native context menus
ipcMain.handle('app:showContextMenu', async (event, type: 'study' | 'series', data: any) => {
    const template: any[] = [
        {
            label: 'Open in New Window', click: () => {
                const seriesUid = type === 'series' ? data.seriesInstanceUID : data.firstSeriesUid;
                if (seriesUid) spawnViewer(seriesUid);
            }
        },
        { type: 'separator' },
        { label: 'Export...', click: () => event.sender.send('db:export', type, data) },
        { label: 'Delete Record', click: () => event.sender.send('db:deleteRequest', type, data) },
        { type: 'separator' },
        { label: 'View DICOM Tags', click: () => event.sender.send('db:viewTags', type, data) }
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender)! });
});

function spawnViewer(seriesUid: string) {

    const viewerWin = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#000000',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: process.platform === 'win32' ? {
            color: '#000000',
            symbolColor: '#ffffff',
            height: 32
        } : false,
    });

    const url = process.env['VITE_DEV_SERVER_URL']
        ? `${process.env['VITE_DEV_SERVER_URL']}?view=viewer&seriesUid=${seriesUid}`
        : `file://${join(process.env.DIST || '', 'index.html')}?view=viewer&seriesUid=${seriesUid}`;

    viewerWin.loadURL(url);
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



function createWindow() {

    win = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#f5f5f7',
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        titleBarOverlay: process.platform === 'win32' ? {
            color: '#f5f5f7',
            symbolColor: '#1c1c1e',
            height: 32
        } : false,
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

async function readdirRecursive(dirPath: string): Promise<string[]> {
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
            console.error('readdirRecursive error:', err);
        }
        return [];
    }
}

ipcMain.handle('fs:readdirRecursive', async (_, dirPath: string) => {
    return readdirRecursive(dirPath);
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

ipcMain.handle('app:toggleMaximize', (event) => {
    const targetWin = BrowserWindow.fromWebContents(event.sender);
    if (!targetWin) return;
    if (targetWin.isMaximized()) {
        targetWin.unmaximize();
    } else {
        targetWin.maximize();
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
    console.log('[Main] Handling returnToDatabase request');

    // 1. Restore or Create Main Window
    if (!win || win.isDestroyed()) {
        console.log('[Main] Main window missing, recreating...');
        createWindow();
    } else {
        win.show();
        win.focus();
    }

    // 2. Close sender window if it's NOT the main window
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin && senderWin !== win) {
        console.log(`[Main] Closing secondary window: ${senderWin.id}`);
        senderWin.close();
    }

    return true;
});

ipcMain.on('app:openViewer', (_event, seriesUid: string) => {
    spawnViewer(seriesUid);
})

app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') app.quit()
})

// Lifecycle management for DICOM services
let dicomService: DICOMService | null = null;
let watcher: WatcherService | null = null;

app.on('before-quit', async () => {
    console.log('[Main] Application quitting, cleaning up services...');
    if (dicomService) {
        await dicomService.stopListener(true, 'Application quit');
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
    // Initialize Database
    try {
        SQLiteManager.getInstance();
        initSchema();
    } catch (e) {
        console.error('Failed to initialize SQLite database:', e);
    }

    dicomService = new DICOMService();
    watcher = new WatcherService();

    // Default watch directory
    const storagePath = process.env.DICOM_STORAGE_PATH || join(app.getPath('userData'), 'dicom_storage');
    watcher.startWatching(storagePath);

    // Register protocol handler for electronfile://
    protocol.handle('electronfile', async (request) => {
        try {
            const requestUrl = request.url;
            let filePath = '';

            try {
                // Cornerstone URLs can be electronfile://C:/... or electronfile:///C:/...
                // We need to extract the path portion reliably.
                const url = new URL(requestUrl);
                // On Windows, url.pathname might be "/C:/..."
                filePath = decodeURIComponent(url.pathname);

                // If it's something like electronfile://C:/... the pathname might be empty, check host
                if (!filePath || filePath === '/') {
                    filePath = decodeURIComponent(url.host + url.pathname);
                }
            } catch (e) {
                // Fallback: manually extract path if URL parsing fails
                filePath = decodeURIComponent(requestUrl.replace('electronfile://', ''));
            }

            // Standardize path extraction
            if (process.platform === 'win32' && filePath.startsWith('/')) {
                filePath = filePath.substring(1);
            }

            // Remove query parameters (e.g. ?seriesUid=... or ?frame=...)
            filePath = filePath.split('?')[0];

            // console.log(`[Protocol] Request: ${requestUrl} -> Path: ${filePath}`);

            // Security check: ensure file exists and is readable
            const s = await stat(filePath).catch(() => null);
            if (!s || !s.isFile()) {
                console.error(`[Protocol] File NOT FOUND or not a file: "${filePath}" (Original: ${requestUrl})`);

                // Attempt one more recovery for macOS /Volumes paths
                if (process.platform === 'darwin' && !filePath.startsWith('/')) {
                    const altPath = '/' + filePath;
                    const s2 = await stat(altPath).catch(() => null);
                    if (s2 && s2.isFile()) {
                        filePath = altPath;
                    } else {
                        return new Response('File not found', { status: 404 });
                    }
                } else {
                    return new Response('File not found', { status: 404 });
                }
            }

            // console.log(`[Protocol] Serving file: ${filePath} (${s.size} bytes)`);
            const data = await readFile(filePath);
            return new Response(data, {
                headers: { 'Content-Type': 'application/dicom' }
            });
        } catch (e) {
            console.error(`[Protocol] CRITICAL ERROR loading ${request.url}:`, e);
            return new Response('Internal Server Error', { status: 500 });
        }
    });

    createDefaultMenu();
    createWindow();

    // Startup check: If database is empty, trigger initial scan
    try {
        const db = SQLiteManager.getInstance().getDB();
        const studyCount = db.prepare('SELECT COUNT(*) as count FROM studies').get() as { count: number };
        const instanceCount = db.prepare('SELECT COUNT(*) as count FROM instances').get() as { count: number };
        console.log(`[Main] Startup DB Status: ${studyCount.count} studies, ${instanceCount.count} instances`);

        if (instanceCount.count < 10) {
            console.log('[Main] Database is near empty. Triggering initial scan of storage directory...');
            const storagePath = process.env.DICOM_STORAGE_PATH || join(app.getPath('userData'), 'dicom_storage');
            console.log(`[Main] Scanning: ${storagePath}`);

            // Wait a bit for everything to settle
            setTimeout(async () => {
                const results = await readdirRecursive(storagePath);
                if (results && results.length > 0) {
                    console.log(`[Main] Auto-scan found ${results.length} files. Starting import...`);
                    ImportManager.getInstance().importFiles(results);
                } else {
                    console.log('[Main] Auto-scan: No files found in storage path.');
                }
            }, 5000);
        }
    } catch (e: any) {
        console.error('[Main] Startup database check failed:', e.message);
    }
})
