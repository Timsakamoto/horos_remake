import { ipcMain, BrowserWindow } from 'electron';
import { Client, requests, constants } from 'dcmjs-dimse';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { JobManager } from './JobManager';

const { CFindRequest, CMoveRequest, CEchoRequest } = requests;
const { Status } = constants;

interface PACSNode {
    aeTitle: string;
    address: string;
    port: number;
}

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export class DICOMService {
    private serverProcess: ChildProcess | null = null;
    private logLevel: LogLevel = LogLevel.INFO;
    private logFile: string | null = null;
    private activeJobs: Set<string> = new Set();

    // Auto-restart state
    private autoRestartEnabled: boolean = true;
    private restartCount: number = 0;
    private lastRestartTime: number = 0;
    private currentPort: number = 11112; // Default
    private currentAeTitle: string = 'PEREGRINE';

    constructor() {
        this.setupIpc();
        this.initLogFile();
    }

    private async initLogFile() {
        const { app } = require('electron');
        const logDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        this.logFile = path.join(logDir, 'pacs_network.log');
    }

    private log(level: LogLevel, message: string, error?: any) {
        if (level < this.logLevel) return;

        const levelStr = LogLevel[level];
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${levelStr}] ${message}`;
        const consoleMsg = `[DICOM Server] ${message}`;

        // Console output
        switch (level) {
            case LogLevel.DEBUG: console.debug(consoleMsg, error || ''); break;
            case LogLevel.INFO: console.info(consoleMsg); break;
            case LogLevel.WARN: console.warn(consoleMsg, error || ''); break;
            case LogLevel.ERROR: console.error(consoleMsg, error || ''); break;
        }

        // File output
        if (this.logFile) {
            let fileEntry = logMessage + '\n';
            if (error) {
                fileEntry += `Stack: ${error.stack || error}\n`;
            }
            try {
                fs.appendFileSync(this.logFile, fileEntry);
            } catch (e) {
                console.error('Failed to write to log file:', e);
            }
        }
    }

    private logInfo(msg: string) { this.log(LogLevel.INFO, msg); }
    private logWarn(msg: string, err?: any) { this.log(LogLevel.WARN, msg, err); }
    private logError(msg: string, err?: any) { this.log(LogLevel.ERROR, msg, err); }

    private setupIpc() {
        const jobManager = JobManager.getInstance();

        ipcMain.handle('pacs:echo', async (_, node: PACSNode) => {
            return this.echo(node);
        });

        ipcMain.handle('pacs:search', async (_, node: PACSNode, level: string, query: any) => {
            return this.search(node, level, query);
        });

        ipcMain.handle('pacs:move', async (event, node: PACSNode, destinationAet: string, level: string, keys: any) => {
            const studyUid = keys.StudyInstanceUID;
            const job = jobManager.createJob('C-MOVE', `Retrieve Study: ${studyUid}`, node.aeTitle);
            this.activeJobs.add(job.id);

            // Notify renderer about the new job
            event.sender.send('pacs:jobUpdated', job);

            try {
                jobManager.updateJob(job.id, { status: 'active', details: 'Connecting...' });
                const success = await this.move(node, destinationAet, level, keys, (progress) => {
                    jobManager.updateJob(job.id, {
                        progress,
                        details: `Receiving images... ${progress}%`
                    });
                    event.sender.send('pacs:jobUpdated', jobManager.getJobs().find(j => j.id === job.id));
                });

                if (success) {
                    jobManager.completeJob(job.id);
                } else {
                    jobManager.failJob(job.id, 'Move operation failed or partially completed');
                }
            } catch (err: any) {
                jobManager.failJob(job.id, err.message || 'Unknown error');
            }

            event.sender.send('pacs:jobUpdated', jobManager.getJobs().find(j => j.id === job.id));
            return true;
        });

        ipcMain.handle('pacs:store', async (event, node: PACSNode, filePaths: string[]) => {
            const description = filePaths.length === 1 ? 'Send Image' : `Send ${filePaths.length} Images`;
            const job = jobManager.createJob('C-STORE', description, node.aeTitle);
            this.activeJobs.add(job.id);
            event.sender.send('pacs:jobUpdated', job);

            try {
                jobManager.updateJob(job.id, { status: 'active', details: 'Connecting...' });
                const success = await this.store(node, filePaths, (progress) => {
                    jobManager.updateJob(job.id, {
                        progress,
                        details: `Sending... ${progress}%`
                    });
                    event.sender.send('pacs:jobUpdated', jobManager.getJobs().find(j => j.id === job.id));
                });

                if (success) {
                    jobManager.completeJob(job.id);
                } else {
                    jobManager.failJob(job.id, 'Send operation completed with errors');
                }
            } catch (err: any) {
                jobManager.failJob(job.id, err.message || 'Send Failed');
            }

            event.sender.send('pacs:jobUpdated', jobManager.getJobs().find(j => j.id === job.id));
            return true;
        });

        ipcMain.handle('pacs:getJobs', () => {
            return jobManager.getJobs();
        });

        ipcMain.handle('pacs:startListener', async (_, aet: string, port: number) => {
            // Reset restart count on manual start
            this.restartCount = 0;
            this.autoRestartEnabled = true;
            return this.startListener(aet, port);
        });

        ipcMain.handle('pacs:stopListener', async () => {
            this.autoRestartEnabled = false; // Disable auto-restart on manual stop
            this.stopListener();
            return true;
        });

        ipcMain.handle('pacs:setDebugLogging', (_, enabled: boolean) => {
            this.logLevel = enabled ? LogLevel.DEBUG : LogLevel.INFO;
            this.logInfo(`Debug logging ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        });

        ipcMain.handle('pacs:openLogFile', async () => {
            if (this.logFile && fs.existsSync(this.logFile)) {
                const { shell } = require('electron');
                await shell.openPath(this.logFile);
                return true;
            }
            return false;
        });

        // Forward job updates and storage progress to renderer
        jobManager.on('jobUpdated', (job) => {
            const wins = BrowserWindow.getAllWindows();
            wins.forEach(w => w.webContents.send('pacs:jobUpdated', job));
        });

        jobManager.on('storageProgress', (data) => {
            const wins = BrowserWindow.getAllWindows();
            wins.forEach(w => w.webContents.send('pacs:storageProgress', data));
        });
    }

    async echo(node: PACSNode): Promise<boolean> {
        this.logInfo(`C-ECHO Initiation to ${node.aeTitle}@${node.address}:${node.port}`);
        const client = new Client();
        const request = new CEchoRequest();

        return new Promise((resolve) => {
            client.addRequest(request);
            client.on('networkError', (e) => {
                this.logError(`C-ECHO Network Error: ${e.message}`, e);
                resolve(false);
            });
            request.on('response', (response) => {
                const success = response.getStatus() === Status.Success;
                this.logInfo(`C-ECHO Response: ${success ? 'Success' : 'Failed'}`);
                resolve(success);
            });
            client.send(node.address, node.port, 'PEREGRINE', node.aeTitle);
        });
    }

    async search(node: PACSNode, level: string, query: any): Promise<any[]> {
        const client = new Client();
        let request;

        const finalQuery = { ...query, QueryRetrieveLevel: level };

        if (level === 'STUDY') {
            request = CFindRequest.createStudyFindRequest(finalQuery);
        } else if (level === 'SERIES') {
            request = CFindRequest.createSeriesFindRequest(finalQuery);
        } else {
            request = CFindRequest.createImageFindRequest(finalQuery);
        }

        const results: any[] = [];

        return new Promise((resolve, reject) => {
            client.addRequest(request);
            request.on('response', (response) => {
                if (response.getStatus() === Status.Pending) {
                    const dataset = response.getDataset();
                    if (dataset) results.push(dataset.getElements());
                } else if (response.getStatus() === Status.Success) {
                    resolve(results);
                }
            });
            client.on('networkError', (e) => reject(e));
            client.send(node.address, node.port, 'PEREGRINE', node.aeTitle);
        });
    }

    async move(node: PACSNode, destinationAet: string, level: string, keys: any, onProgress?: (p: number) => void): Promise<boolean> {
        const client = new Client();
        let request: any;

        if (level === 'STUDY') {
            request = CMoveRequest.createStudyMoveRequest(destinationAet, keys.StudyInstanceUID);
        } else if (level === 'SERIES') {
            request = CMoveRequest.createSeriesMoveRequest(destinationAet, keys.StudyInstanceUID, keys.SeriesInstanceUID);
        } else {
            request = CMoveRequest.createImageMoveRequest(destinationAet, keys.StudyInstanceUID, keys.SeriesInstanceUID, keys.SOPInstanceUID);
        }

        return new Promise((resolve, reject) => {
            client.addRequest(request);
            request.on('response', (response: any) => {
                const status = response.getStatus();
                if (status === Status.Pending) {
                    const remaining = response.getRemaining();
                    const completed = response.getCompleted();
                    const total = remaining + completed;
                    if (total > 0 && onProgress) {
                        onProgress(Math.round((completed / total) * 100));
                    }
                } else if (status === Status.Success) {
                    resolve(true);
                } else {
                    this.logWarn(`C-MOVE Response Status: ${status.toString(16)}`);
                    if (status !== Status.Pending) resolve(false);
                }
            });
            client.on('networkError', (e) => reject(e));
            client.send(node.address, node.port, 'PEREGRINE', node.aeTitle);
        });
    }

    async store(node: PACSNode, filePaths: string[], onProgress?: (p: number) => void): Promise<boolean> {
        this.logInfo(`C-STORE Initiation to ${node.aeTitle}@${node.address}:${node.port} (${filePaths.length} files)`);
        const client = new Client();
        let successCount = 0;
        let failCount = 0;

        return new Promise((resolve, reject) => {
            filePaths.forEach((filePath) => {
                const request = new requests.CStoreRequest(filePath);
                client.addRequest(request);

                request.on('response', (response) => {
                    const status = response.getStatus();
                    if (status === Status.Success) {
                        successCount++;
                    } else {
                        failCount++;
                        this.logWarn(`C-STORE Failed for ${filePath}: ${status.toString(16)}`);
                    }

                    if (onProgress) {
                        onProgress(Math.round(((successCount + failCount) / filePaths.length) * 100));
                    }
                });
            });

            client.on('networkError', (e) => {
                this.logError(`C-STORE Network Error: ${e.message}`);
                reject(e);
            });

            client.on('closed', () => {
                this.logInfo(`C-STORE Complete. Success: ${successCount}, Failed: ${failCount}`);
                resolve(failCount === 0);
            });

            client.send(node.address, node.port, 'PEREGRINE', node.aeTitle);
        });
    }

    async startListener(aeTitle: string, port: number): Promise<boolean> {
        // Save current config for auto-restart
        this.currentAeTitle = aeTitle;
        this.currentPort = port;

        try {
            await this.stopListener(false); // don't disable auto-restart

            // Port Check
            const isPortInUse = await new Promise<boolean>((resolve) => {
                const net = require('net');
                const server = net.createServer();
                server.once('error', (err: any) => {
                    if (err.code === 'EADDRINUSE') resolve(true);
                    else resolve(false);
                });
                server.once('listening', () => {
                    server.close();
                    resolve(false);
                });
                server.listen(port);
            });

            if (isPortInUse) {
                this.logError(`PACS Listener: Port ${port} is already in use.`);
                return false;
            }

            // Path to storescp binary
            const { app } = require('electron');
            let binPath;
            if (app.isPackaged) {
                binPath = path.join(process.resourcesPath, 'bin', 'storescp');
            } else {
                binPath = path.join(process.cwd(), 'resources', 'bin', 'storescp');
            }

            // Ensure executable permissions (macOS/Linux)
            if (process.platform !== 'win32') {
                try {
                    fs.chmodSync(binPath, 0o755);
                } catch (e) {
                    this.logWarn(`Failed to chmod storescp: ${e}`);
                }
            }

            const storagePath = process.env.DICOM_STORAGE_PATH || path.join(app.getPath('userData'), 'dicom_storage');
            if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });

            // storescp arguments
            const args = [
                '--aetitle', aeTitle,
                '--output-directory', storagePath,
                '--prefer-uncompr',
                '--accept-all',
                '-v', // verbose
                port.toString()
            ];

            if (this.logLevel === LogLevel.DEBUG) {
                args.push('-d');
            }

            this.logInfo(`Starting storescp: ${binPath} ${args.join(' ')}`);

            this.serverProcess = spawn(binPath, args);

            if (!this.serverProcess) {
                throw new Error('Failed to spawn storescp process');
            }

            this.serverProcess.stdout?.on('data', (data) => {
                const msg = data.toString().trim();
                // storescp logs to output. We treat it as INFO
                if (msg) this.logInfo(`[storescp] ${msg}`);
            });

            this.serverProcess.stderr?.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) {
                    if (msg.includes('E:')) this.logError(`[storescp] ${msg}`);
                    else if (msg.includes('W:')) this.logWarn(`[storescp] ${msg}`);
                    else this.logInfo(`[storescp] ${msg}`);
                }
            });

            this.serverProcess.on('error', (err) => {
                this.logError('storescp process error:', err);
                this.handleServerCrash();
            });

            this.serverProcess.on('close', (code, signal) => {
                this.logInfo(`storescp exited with code ${code}, signal ${signal}`);
                this.serverProcess = null;
                if (this.autoRestartEnabled && code !== 0 && code !== null) {
                    this.handleServerCrash();
                }
            });

            this.logInfo(`PACS Listener: Started on ${aeTitle}:${port} (PID: ${this.serverProcess.pid})`);
            return true;
        } catch (e) {
            this.logError('PACS Listener: Startup error:', e);
            return false;
        }
    }

    private handleServerCrash() {
        if (!this.autoRestartEnabled) return;

        const now = Date.now();
        // Reset counter if last restart was more than 1 minute ago
        if (now - this.lastRestartTime > 60000) {
            this.restartCount = 0;
        }

        if (this.restartCount < 3) {
            this.restartCount++;
            this.lastRestartTime = now;
            this.logWarn(`DICOM Server crashed or closed unexpectedly. Restarting (${this.restartCount}/3) in 2s...`);

            setTimeout(() => {
                if (this.autoRestartEnabled) {
                    this.startListener(this.currentAeTitle, this.currentPort);
                }
            }, 2000);
        } else {
            this.logError('DICOM Server max restart attempts reached. Giving up.');
            this.autoRestartEnabled = false;
        }
    }

    async stopListener(disableAutoRestart: boolean = true) {
        if (disableAutoRestart) {
            this.autoRestartEnabled = false;
        }

        return new Promise<void>((resolve) => {
            if (this.serverProcess) {
                this.logInfo('Stopping storescp...');
                this.serverProcess.kill(); // SIGTERM

                // Force kill if it doesn't exit after 1s
                const killTimeout = setTimeout(() => {
                    if (this.serverProcess) {
                        this.logWarn('Force killing storescp...');
                        this.serverProcess.kill('SIGKILL');
                    }
                }, 1000);

                // Wait a bit
                setTimeout(() => {
                    clearTimeout(killTimeout);
                    resolve();
                }, 500);
            } else {
                resolve();
            }
        });
    }
}
