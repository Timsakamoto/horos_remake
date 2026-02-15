import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { PACSClient, PACSServer, PACSStudy } from './pacsClient';
import { useDatabase } from '../Database/DatabaseProvider';
import { importMetadata } from '../Database/importService';
import { parseDicombuffer } from '../../utils/dicomParser';

interface LocalListenerSettings {
    aeTitle: string;
    port: number;
    isRunning: boolean;
}

export interface PACSJob {
    id: string;
    type: 'C-MOVE' | 'C-FIND' | 'C-ECHO' | 'C-STORE';
    status: 'pending' | 'active' | 'completed' | 'failed';
    description: string;
    progress: number;
    details: string;
    nodeName: string;
    timestamp: number;
    error?: string;
}

interface PACSContextType {
    servers: (PACSServer & { status?: 'online' | 'offline' | 'checking' })[];
    setServers: (servers: PACSServer[]) => void;
    activeServer: PACSServer | null;
    setActiveServer: (server: PACSServer) => void;

    localListener: LocalListenerSettings;
    setLocalListener: (settings: LocalListenerSettings) => void;
    toggleListener: () => Promise<void>;

    results: PACSStudy[];
    isSearching: boolean;
    search: (filters: any) => Promise<void>;
    retrieve: (studyInstanceUID: string) => Promise<boolean>;
    sendToPacs: (server: PACSServer, filePaths: string[]) => Promise<boolean>;

    activeJobs: PACSJob[];
    clearCompletedJobs: () => void;

    // Advanced Settings
    debugLoggingEnabled: boolean;
    setDebugLogging: (enabled: boolean) => void;
    openLogFile: () => void;
    associationTimeout: number;
    setAssociationTimeout: (seconds: number) => void;

    error: string | null;
}

const PACSContext = createContext<PACSContextType | undefined>(undefined);

const DEFAULT_SERVERS: PACSServer[] = [
    {
        id: 'public-dcmjs',
        name: 'DCMJS Public Sandbox',
        aeTitle: 'DCM4CHEE',
        url: 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs',
        isDicomWeb: true
    },
    {
        id: 'local-orthanc',
        name: 'Local Orthanc',
        aeTitle: 'ORTHANC',
        address: '127.0.0.1',
        port: 4242,
        isDicomWeb: false
    }
];

const STORAGE_KEY_SERVERS = 'peregrine_pacs_servers';
const STORAGE_KEY_LISTENER = 'peregrine_local_listener';

export const PACSProvider = ({ children }: { children: ReactNode }) => {
    // initialize from local storage or default
    const [servers, setServersState] = useState<PACSServer[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SERVERS);
        return stored ? JSON.parse(stored) : DEFAULT_SERVERS;
    });

    const [activeServer, setActiveServer] = useState<PACSServer | null>(servers[0]);

    const [localListener, setLocalListenerState] = useState<LocalListenerSettings>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_LISTENER);
        return stored ? JSON.parse(stored) : { aeTitle: 'PEREGRINE', port: 11112, isRunning: false };
    });

    const [results, setResults] = useState<PACSStudy[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [activeJobs, setActiveJobs] = useState<PACSJob[]>([]);

    // Advanced Settings State
    const [debugLoggingEnabled, setDebugLoggingState] = useState(false);
    const [associationTimeout, setAssociationTimeout] = useState(() => {
        return parseInt(localStorage.getItem('peregrine_association_timeout') || '30');
    });

    const [error, setError] = useState<string | null>(null);

    const { db } = useDatabase();
    const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Initial load of jobs
    useEffect(() => {
        const loadInitialJobs = async () => {
            const jobs = await window.electron.pacs.getJobs();
            setActiveJobs(jobs);
        };
        loadInitialJobs();

        // Listen for updates from Main
        const removeJobListener = window.electron.pacs.onJobUpdated((updatedJob: PACSJob) => {
            setActiveJobs(prev => {
                const index = prev.findIndex(j => j.id === updatedJob.id);
                if (index > -1) {
                    const next = [...prev];
                    next[index] = updatedJob;
                    return next;
                }
                return [updatedJob, ...prev];
            });
        });

        // Progressive Indexing: Listen for storage progress
        const removeStorageListener = window.electron.pacs.onStorageProgress(async (data: any) => {
            if (!db) return;
            try {
                // Read the file that was just written
                const buffer = await window.electron.readFile(data.filePath);
                if (buffer) {
                    const meta = parseDicombuffer(buffer);
                    if (meta) {
                        // Import metadata record by record (Progressive)
                        await importMetadata(db, meta, data.filePath, buffer.byteLength);
                    }
                }
            } catch (err) {
                console.error('PACSProvider: Progressive indexing error:', err);
            }
        });

        return () => {
            removeJobListener();
            removeStorageListener();
        };
    }, [db]);

    // Auto-start Listener on Boot
    useEffect(() => {
        const startOnBoot = async () => {
            // Wait a bit for Main process to be ready
            setTimeout(async () => {
                if (localListener.isRunning) {
                    const success = await window.electron.pacs.startListener(localListener.aeTitle, localListener.port);
                    if (!success) {
                        setLocalListenerState(prev => ({ ...prev, isRunning: false }));
                    }
                }
            }, 1000);
        };
        startOnBoot();
    }, []);

    // Health Monitoring (C-ECHO)
    useEffect(() => {
        // const checkHealth = async () => {
        //     const updatedServers = await Promise.all(servers.map(async (s) => {
        //         if (s.isDicomWeb) return { ...s, status: 'online' as const };
        //         try {
        //             const online = await window.electron.pacs.echo({
        //                 aeTitle: s.aeTitle,
        //                 address: s.address,
        //                 port: s.port
        //             });
        //             return { ...s, status: online ? 'online' as const : 'offline' as const };
        //         } catch (e) {
        //             return { ...s, status: 'offline' as const };
        //         }
        //     }));
        //     setServersState(updatedServers);
        // };

        // checkHealth(); // Initial check
        // healthCheckIntervalRef.current = setInterval(checkHealth, 30000); // Every 30s

        return () => {
            if (healthCheckIntervalRef.current) clearInterval(healthCheckIntervalRef.current);
        };
    }, [servers.length]); // Re-run if server count changes


    // Persist changes
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(servers));
    }, [servers]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_LISTENER, JSON.stringify(localListener));
    }, [localListener]);

    const setServers = (newServers: PACSServer[]) => {
        setServersState(newServers);
        // If active server was removed, reset to first
        if (activeServer && !newServers.find(s => s.id === activeServer.id)) {
            setActiveServer(newServers[0] || null);
        }
    };

    const setLocalListener = (settings: LocalListenerSettings) => {
        setLocalListenerState(prev => ({ ...prev, ...settings }));
    };

    const toggleListener = async () => {
        if (localListener.isRunning) {
            const success = await window.electron.pacs.stopListener();
            if (success) {
                setLocalListenerState(prev => ({ ...prev, isRunning: false }));
            }
        } else {
            const success = await window.electron.pacs.startListener(localListener.aeTitle, localListener.port);
            if (success) {
                setLocalListenerState(prev => ({ ...prev, isRunning: true }));
            } else {
                setError('Failed to start DICOM Listener. Check if port is in use.');
            }
        }
    };

    // Auto-start listener on mount if configured (optional, maybe user wants manual start)
    // currently manual start only.

    const search = async (filters: any) => {
        if (!activeServer) return;

        setIsSearching(true);
        setError(null);

        try {
            const client = new PACSClient(activeServer);
            const data = await client.searchStudies(filters);

            setResults(data);
        } catch (err: any) {
            setError(err.message || 'PACS Search Failed');
            console.error('PACSProvider: Search error:', err);
        } finally {
            setIsSearching(false);
        }
    };

    const retrieve = async (studyInstanceUID: string): Promise<boolean> => {
        if (!activeServer) return false;

        try {
            const client = new PACSClient(activeServer);
            const destinationAet = localListener.aeTitle;
            // Initiate move (Main process creates job)
            return await client.retrieveStudy(studyInstanceUID, destinationAet);
        } catch (err: any) {
            setError(err.message || 'Retrieve Failed');
            return false;
        }
    };

    const sendToPacs = async (server: PACSServer, filePaths: string[]): Promise<boolean> => {
        try {
            const client = new PACSClient(server);
            return await client.sendImages(filePaths);
        } catch (err: any) {
            setError(err.message || 'Send Failed');
            return false;
        }
    };

    const clearCompletedJobs = () => {
        // We could call an IPC to clear them in Main as well if we want history persistence
        setActiveJobs(prev => prev.filter(j => j.status === 'active' || j.status === 'pending'));
    };

    const setDebugLogging = (enabled: boolean) => {
        setDebugLoggingState(enabled);
        window.electron.pacs.setDebugLogging(enabled);
    };

    const openLogFile = () => {
        window.electron.pacs.openLogFile();
    };

    // Persist timeout
    useEffect(() => {
        localStorage.setItem('peregrine_association_timeout', associationTimeout.toString());
    }, [associationTimeout]);

    return (
        <PACSContext.Provider value={{
            servers,
            setServers,
            activeServer,
            setActiveServer,
            localListener,
            setLocalListener,
            toggleListener,
            results,
            isSearching,
            search,
            retrieve,
            sendToPacs,
            activeJobs,
            clearCompletedJobs,
            debugLoggingEnabled,
            setDebugLogging,
            openLogFile,
            associationTimeout,
            setAssociationTimeout,
            error
        }}>
            {children}
        </PACSContext.Provider>
    );
};

export const usePACS = () => {
    const context = useContext(PACSContext);
    if (!context) {
        throw new Error('usePACS must be used within a PACSProvider');
    }
    return context;
};
