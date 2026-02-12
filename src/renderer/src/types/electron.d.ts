export interface IElectronAPI {
    openFile: () => Promise<string[]>;
    readFile: (filePath: string) => Promise<ArrayBuffer | null>;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
