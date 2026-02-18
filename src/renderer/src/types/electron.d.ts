export interface IElectronAPI {
    versions: any;
    openFile: () => Promise<string[]>;
    readFile: (path: string) => Promise<ArrayBuffer | null>;
    writeFile: (path: string, data: Uint8Array) => Promise<boolean>;
    getPath: (name: string) => Promise<string>;
    getAppPath: () => Promise<string>;
    openViewer: (seriesUid: string) => void;
    readdirRecursive: (dir: string) => Promise<string[]>;
    ensureDir: (path: string) => Promise<void>;
    copyFile: (src: string, dest: string) => Promise<boolean>;
    join: (...args: string[]) => Promise<string>;
    basename: (path: string) => Promise<string>;
    unlink: (path: string) => Promise<void>;
    toggleMaximize: () => Promise<void>;
    returnToDatabase: () => Promise<boolean>;
    pacs: {
        echo: (node: any) => Promise<boolean>;
        search: (node: any, level: string, query: any) => Promise<any[]>;
        move: (node: any, destinationAet: string, level: string, keys: any) => Promise<boolean>;
        store: (node: any, filePaths: string[]) => Promise<boolean>;
        startListener: (aet: string, port: number) => Promise<boolean>;
        stopListener: () => Promise<boolean>;
        getJobs: () => Promise<any[]>;
        onJobUpdated: (callback: (job: any) => void) => () => void;
        onStorageProgress: (callback: (data: any) => void) => () => void;
        setDebugLogging: (enabled: boolean) => Promise<void>;
        openLogFile: () => Promise<void>;
    };
    watcher: {
        start: (dirPath: string) => Promise<boolean>;
        stop: (dirPath: string) => Promise<void>;
        getActive: () => Promise<string[]>;
        onFilesAdded: (callback: (files: string[]) => void) => () => void;
    };
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
