import { useState, useEffect, ReactNode, useRef } from 'react';
import { PACSClient } from './pacsClient';
import { useSettings } from '../Settings/SettingsContext';
import {
    LocalListenerSettings,
    PACSJob,
    PACSServer,
    PACSServerWithStatus,
    PACSStudy
} from './types';
import { PACSContext } from './PACSContext';

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
    const { databasePath, isLoaded: settingsLoaded } = useSettings();

    // initialize from local storage or default
    const [servers, setServersState] = useState<PACSServerWithStatus[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SERVERS);
        return stored ? JSON.parse(stored) : DEFAULT_SERVERS;
    });

    const [activeServer, setActiveServer] = useState<PACSServer | null>(servers[0] || null);

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
    const [showActivityManager, setShowActivityManager] = useState(false);

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

        return () => {
            removeJobListener();
        };
    }, []);

    const isStartingRef = useRef(false);

    // Auto-start Listener on Boot
    useEffect(() => {
        const startOnBoot = async () => {
            if (!settingsLoaded || databasePath === null || isStartingRef.current) return;

            // Wait a bit for Main process to be ready
            setTimeout(async () => {
                if (localListener.isRunning && !isStartingRef.current) {
                    isStartingRef.current = true;
                    console.log('PACSProvider: Auto-starting DICOM Listener on port', localListener.port);
                    await window.electron.pacs.startListener(
                        localListener.aeTitle.trim(),
                        localListener.port,
                        databasePath || undefined
                    );
                    isStartingRef.current = false;
                }
            }, 500);
        };
        startOnBoot();
    }, [databasePath, settingsLoaded]); // Re-run when databasePath or settings are loaded

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

    const removeServer = (serverId: string) => {
        const nextServers = servers.filter(s => s.id !== serverId);
        setServers(nextServers);
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
            const success = await window.electron.pacs.startListener(localListener.aeTitle.trim(), localListener.port, databasePath || undefined);
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
            const data = await client.searchStudies(filters, localListener.aeTitle);

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
            return await client.retrieveStudy(studyInstanceUID, destinationAet, localListener.aeTitle);
        } catch (err: any) {
            setError(err.message || 'Retrieve Failed');
            return false;
        }
    };

    const sendToPacs = async (server: PACSServer, filePaths: string[]): Promise<boolean> => {
        try {
            const client = new PACSClient(server);
            return await client.sendImages(filePaths, localListener.aeTitle);
        } catch (err: any) {
            setError(err.message || 'Send Failed');
            return false;
        }
    };

    const verifyNode = async (server: PACSServer): Promise<boolean> => {
        try {
            const client = new PACSClient(server);
            const success = await client.echo(localListener.aeTitle);

            // サーバーリストのステータスを更新
            setServersState(prev => prev.map(s =>
                s.id === server.id ? { ...s, status: success ? 'online' : 'offline' } : s
            ));

            return success;
        } catch (err) {
            console.error('PACSProvider: Echo failed:', err);
            setServersState(prev => prev.map(s =>
                s.id === server.id ? { ...s, status: 'offline' } : s
            ));
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
            setActiveServer: (s) => setActiveServer(s),
            removeServer,
            localListener,
            setLocalListener: (s) => setLocalListener(s),
            toggleListener,
            results,
            isSearching,
            search,
            retrieve,
            sendToPacs,
            verifyNode,
            activeJobs,
            clearCompletedJobs,
            showActivityManager,
            setShowActivityManager,
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

export { usePACS } from './PACSContext';
