import React, { createContext, useContext, useEffect, useState } from 'react';
import { AntigravityDatabase, getDatabase } from './db';

const DatabaseContext = createContext<AntigravityDatabase | null>(null);

export const useDatabase = () => {
    return useContext(DatabaseContext);
};

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [db, setDb] = useState<AntigravityDatabase | null>(null);

    useEffect(() => {
        const initDb = async () => {
            try {
                const database = await getDatabase();
                setDb(database);
            } catch (err) {
                console.error('Failed to initialize database:', err);
            }
        };
        initDb();
    }, []);

    if (!db) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#1a1a1a] text-gray-400">
                <span>Initializing Database...</span>
            </div>
        );
    }

    return (
        <DatabaseContext.Provider value={db}>
            {children}
        </DatabaseContext.Provider>
    );
};
