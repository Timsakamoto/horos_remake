import { ipcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';
import { JobManager } from './JobManager';



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

        const binPath = this.getDcmtkBinPath('echoscu');
        if (!binPath) return false;

        const args = ['-v', '-aet', this.currentAeTitle, '-aec', node.aeTitle, node.address, node.port.toString()];

        return new Promise((resolve) => {
            const process = spawn(binPath, args);

            process.on('close', (code) => {
                if (code === 0) {
                    this.logInfo(`C-ECHO Response: Success`);
                    resolve(true);
                } else {
                    this.logWarn(`C-ECHO Response: Failed (Code: ${code})`);
                    resolve(false);
                }
            });

            process.on('error', (err) => {
                this.logError(`C-ECHO Network Error: ${err.message}`, err);
                resolve(false);
            });
        });
    }

    async search(node: PACSNode, level: string, query: any): Promise<any[]> {
        const binPath = this.getDcmtkBinPath('findscu');
        if (!binPath) return [];

        const args = [
            '-v',
            '-aet', this.currentAeTitle,
            '-aec', node.aeTitle,
            '-P', // Patient Root Information Model
            '-k', `QueryRetrieveLevel=${level}`,
            node.address,
            node.port.toString()
        ];

        // Add query keys
        for (const [key, value] of Object.entries(query)) {
            // DCMTK uses (Group,Element)=Value format or Key=Value
            // For simplicity in this rough implementation, we assume Key=Value works for known tags
            args.push('-k', `${key}=${value || ''}`);
        }

        // Requested keys (if not in query, add them empty)
        // This is a simplification; a robust implementation needs a better query builder
        if (!query['PatientName']) args.push('-k', 'PatientName');
        if (!query['PatientID']) args.push('-k', 'PatientID');
        if (!query['StudyDate']) args.push('-k', 'StudyDate');
        if (!query['StudyTime']) args.push('-k', 'StudyTime');
        if (!query['AccessionNumber']) args.push('-k', 'AccessionNumber');
        if (!query['StudyID']) args.push('-k', 'StudyID');
        if (!query['StudyInstanceUID']) args.push('-k', 'StudyInstanceUID');
        // Add more keys as needed for database population

        // To parse results, we probably need to output to XML or file, or parse stdout heavily.
        // findscu -X outputs XML.
        args.push('-X');

        this.logInfo(`C-FIND Initiation: ${binPath} ${args.join(' ')}`);

        return new Promise((resolve, reject) => {
            const process = spawn(binPath, args);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => stdout += data.toString());
            process.stderr.on('data', (data) => stderr += data.toString());

            process.on('close', async (code) => {
                if (code === 0) {
                    try {
                        const results = await this.parseDcmtkXml(stdout);
                        this.logInfo(`C-FIND Success: Found ${results.length} results`);
                        resolve(results);
                    } catch (e) {
                        this.logError('Failed to parse C-FIND results', e);
                        resolve([]);
                    }
                } else {
                    this.logWarn(`C-FIND Failed (Code: ${code})`);
                    this.logWarn(`Stderr: ${stderr}`);
                    resolve([]);
                }
            });

            process.on('error', (err) => {
                this.logError(`C-FIND Error: ${err.message}`);
                reject(err);
            });
        });
    }

    async move(node: PACSNode, destinationAet: string, level: string, keys: any, onProgress?: (p: number) => void): Promise<boolean> {
        const binPath = this.getDcmtkBinPath('movescu');
        if (!binPath) return false;

        const args = [
            '-v',
            '-aet', this.currentAeTitle,
            '-aec', node.aeTitle,
            '-aem', destinationAet,
            '-P', // Patient Root
            '-k', `QueryRetrieveLevel=${level}`,
            node.address,
            node.port.toString()
        ];

        if (keys.StudyInstanceUID) args.push('-k', `StudyInstanceUID=${keys.StudyInstanceUID}`);
        if (keys.SeriesInstanceUID) args.push('-k', `SeriesInstanceUID=${keys.SeriesInstanceUID}`);
        if (keys.SOPInstanceUID) args.push('-k', `SOPInstanceUID=${keys.SOPInstanceUID}`);

        this.logInfo(`C-MOVE Initiation: ${binPath} ${args.join(' ')}`);

        // movescu output parsing for progress is tricky. It prints like:
        // Response: Pending (Sub-Operations: Remaining: 5, Completed: 0, Failed: 0, Warning: 0)

        return new Promise((resolve, reject) => {
            const process = spawn(binPath, args);

            process.stdout.on('data', (data) => {
                const msg = data.toString();
                // Basic progress parsing (Parsing standard movescu output)
                if (msg.includes('Remaining:')) {
                    // Extract Remaining and Completed
                    // This is verbose and might need regex adjustment based on exact output version
                    if (onProgress) onProgress(50); // Fake progress for now until accurate parsing
                }
            });

            process.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('E:')) this.logError(`movescu: ${msg}`);
                else this.logInfo(`movescu: ${msg}`);
            });

            process.on('close', (code) => {
                if (code === 0) {
                    this.logInfo('C-MOVE Success');
                    resolve(true);
                } else {
                    this.logWarn(`C-MOVE Failed (Code: ${code})`);
                    resolve(false);
                }
            });

            process.on('error', (err) => {
                this.logError(`C-MOVE Error: ${err.message}`);
                reject(err);
            });
        });
    }

    async store(node: PACSNode, filePaths: string[], onProgress?: (p: number) => void): Promise<boolean> {
        const binPath = this.getDcmtkBinPath('storescu');
        if (!binPath) return false;

        // storescu [options] peer port dcmfile-in...
        const args = [
            '-v',
            '-aet', this.currentAeTitle,
            '-aec', node.aeTitle,
            node.address,
            node.port.toString(),
            ...filePaths
        ];

        this.logInfo(`C-STORE Initiation to ${node.aeTitle} (${filePaths.length} files)`);

        return new Promise((resolve, reject) => {
            const process = spawn(binPath, args);
            let totalFiles = filePaths.length;
            let currentFile = 0;

            // storescu outputs one line per file usually
            process.stdout.on('data', () => {
                // Approximate progress based on output activity
                currentFile++;
                if (onProgress) onProgress(Math.round((currentFile / totalFiles) * 100));
            });

            process.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('E:')) this.logError(`storescu: ${msg}`);
            });

            process.on('close', (code) => {
                if (code === 0) {
                    this.logInfo('C-STORE Success');
                    resolve(true);
                } else {
                    this.logWarn(`C-STORE Failed (Code: ${code})`);
                    resolve(false);
                }
            });

            process.on('error', (err) => {
                this.logError(`C-STORE Error: ${err.message}`);
                reject(err);
            });
        });
    }

    private getDcmtkBinPath(binName: string): string | null {
        const { app } = require('electron');
        let binPath;
        if (app.isPackaged) {
            binPath = path.join(process.resourcesPath, 'bin', binName);
        } else {
            binPath = path.join(process.cwd(), 'resources', 'bin', binName);
        }

        if (process.platform !== 'win32') {
            try {
                if (fs.existsSync(binPath)) {
                    fs.chmodSync(binPath, 0o755);
                    return binPath;
                }
            } catch (e) {
                this.logWarn(`Failed to chmod ${binName}: ${e}`);
            }
        }

        if (fs.existsSync(binPath)) return binPath;

        this.logError(`Binary not found: ${binPath}`);
        return null;
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

    private async parseDcmtkXml(xml: string): Promise<any[]> {
        if (!xml || !xml.trim()) return [];

        try {
            // findscu -X output might contain multiple root elements (one per result)
            // We wrap it to ensure valid XML
            const wrappedXml = `<responses>${xml}</responses>`;
            let parsed;
            try {
                parsed = await parseStringPromise(wrappedXml);
            } catch (e) {
                // If wrapping failed, maybe it was valid single root?
                parsed = await parseStringPromise(xml);
            }

            if (!parsed || !parsed.responses || !parsed.responses['file-format']) {
                if (parsed['file-format']) {
                    // Single result case without wrapper
                    parsed = { responses: { 'file-format': [parsed['file-format']] } };
                } else {
                    return [];
                }
            }

            const results: any[] = [];
            const fileFormats = parsed.responses['file-format'];

            for (const fileFormat of fileFormats) {
                if (!fileFormat.data_set || !fileFormat.data_set[0] || !fileFormat.data_set[0].element) continue;

                const dataset = fileFormat.data_set[0];
                const entry: any = {};

                for (const el of dataset.element) {
                    // element has attributes: tag, vr, len, name
                    // value is text content
                    const name = el.$.name; // e.g. PatientName
                    const val = el._; // Text content if simple value

                    if (name && val) {
                        // Clean up value (remove nulls, trim)
                        entry[name] = val.trim();
                    }
                }
                results.push(entry);
            }

            return results;
        } catch (e) {
            this.logError('XML Parsing Error', e);
            return [];
        }
    }
}
