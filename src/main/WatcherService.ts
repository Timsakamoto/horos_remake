import { ipcMain, BrowserWindow } from 'electron';
import * as chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs';

export class WatcherService {
    private watchers: Map<string, chokidar.FSWatcher> = new Map();
    private pendingFiles: Set<string> = new Set();
    private debounceTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.setupIpc();
    }

    private setupIpc() {
        ipcMain.handle('watcher:start', (_, dirPath: string) => {
            return this.startWatching(dirPath);
        });

        ipcMain.handle('watcher:stop', (_, dirPath: string) => {
            this.stopWatching(dirPath);
            return true;
        });

        ipcMain.handle('watcher:getActive', () => {
            return Array.from(this.watchers.keys());
        });
    }

    public startWatching(dirPath: string): boolean {
        if (this.watchers.has(dirPath)) return true;

        if (!fs.existsSync(dirPath)) {
            try {
                fs.mkdirSync(dirPath, { recursive: true });
            } catch (e) {
                console.error(`[Watcher] Failed to create directory: ${dirPath}`, e);
                return false;
            }
        }

        console.log(`[Watcher] Starting watch on: ${dirPath}`);

        const watcher = chokidar.watch(dirPath, {
            persistent: true,
            ignoreInitial: true, // Don't trigger for existing files
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });

        watcher.on('add', (filePath) => {
            // Only care about DICOM-ish files (no extension or .dcm)
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '' || ext === '.dcm' || ext === '.dicom') {
                this.queueFile(filePath);
            }
        });

        this.watchers.set(dirPath, watcher);
        return true;
    }

    public stopWatching(dirPath: string) {
        const watcher = this.watchers.get(dirPath);
        if (watcher) {
            watcher.close();
            this.watchers.delete(dirPath);
            console.log(`[Watcher] Stopped watching: ${dirPath}`);
        }
    }

    private queueFile(filePath: string) {
        this.pendingFiles.add(filePath);

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.flushBatch();
        }, 2000); // Wait 2s for more files to arrive
    }

    private flushBatch() {
        if (this.pendingFiles.size === 0) return;

        const files = Array.from(this.pendingFiles);
        this.pendingFiles.clear();

        console.log(`[Watcher] Notifying renderer of ${files.length} new files`);

        const wins = BrowserWindow.getAllWindows();
        wins.forEach(w => {
            if (!w.isDestroyed()) {
                w.webContents.send('watcher:filesAdded', files);
            }
        });
    }
}
