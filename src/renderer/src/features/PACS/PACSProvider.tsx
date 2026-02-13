import React, { createContext, useContext, useState, ReactNode } from 'react';
import { PACSClient, PACSServer, PACSStudy } from './pacsClient';

interface PACSContextType {
    servers: PACSServer[];
    activeServer: PACSServer | null;
    setActiveServer: (server: PACSServer) => void;
    results: PACSStudy[];
    isSearching: boolean;
    search: (filters: any) => Promise<void>;
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
    }
];

export const PACSProvider = ({ children }: { children: ReactNode }) => {
    const [servers] = useState<PACSServer[]>(DEFAULT_SERVERS);
    const [activeServer, setActiveServer] = useState<PACSServer | null>(DEFAULT_SERVERS[0]);
    const [results, setResults] = useState<PACSStudy[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const search = async (filters: any) => {
        if (!activeServer) return;

        setIsSearching(true);
        setError(null);

        try {
            const client = new PACSClient(activeServer.url);
            const data = await client.searchStudies(filters);
            setResults(data);
        } catch (err: any) {
            setError(err.message || 'PACS Search Failed');
            console.error(err);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <PACSContext.Provider value={{
            servers,
            activeServer,
            setActiveServer,
            results,
            isSearching,
            search,
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
