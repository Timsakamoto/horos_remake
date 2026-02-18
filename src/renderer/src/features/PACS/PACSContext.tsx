import { createContext, useContext } from 'react';
import type { PACSServer, PACSStudy, PACSJob, LocalListenerSettings, PACSServerWithStatus } from './types';

export interface PACSContextType {
    servers: PACSServerWithStatus[];
    setServers: (servers: PACSServer[]) => void;
    activeServer: PACSServer | null;
    setActiveServer: (server: PACSServer) => void;
    removeServer: (serverId: string) => void;

    localListener: LocalListenerSettings;
    setLocalListener: (settings: LocalListenerSettings) => void;
    toggleListener: () => Promise<void>;

    results: PACSStudy[];
    isSearching: boolean;
    search: (filters: any) => Promise<void>;
    retrieve: (studyInstanceUID: string) => Promise<boolean>;
    sendToPacs: (server: PACSServer, filePaths: string[]) => Promise<boolean>;
    verifyNode: (server: PACSServer) => Promise<boolean>;

    activeJobs: PACSJob[];
    clearCompletedJobs: () => void;
    showActivityManager: boolean;
    setShowActivityManager: (show: boolean) => void;

    debugLoggingEnabled: boolean;
    setDebugLogging: (enabled: boolean) => void;
    openLogFile: () => void;
    associationTimeout: number;
    setAssociationTimeout: (seconds: number) => void;

    error: string | null;
}

export const PACSContext = createContext<PACSContextType | undefined>(undefined);

export const usePACS = () => {
    const context = useContext(PACSContext);
    if (!context) {
        throw new Error('usePACS must be used within a PACSProvider');
    }
    return context;
};
