import React, { createContext, useContext, useEffect, useState } from 'react';
import { AntigravityDatabase, getDatabase } from './db';

interface Patient {
    id: string; // Primary Key (internal)
    patientID: string; // Meaningful ID
    patientName: string;
    studyCount: number;
}

interface DatabaseContextType {
    db: AntigravityDatabase | null;
    patients: Patient[];
    addDummyPatient: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType>({
    db: null,
    patients: [],
    addDummyPatient: async () => { },
});

export const useDatabase = () => {
    return useContext(DatabaseContext);
};

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [db, setDb] = useState<AntigravityDatabase | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let sub: any;
        const initDb = async () => {
            try {
                console.log('DatabaseProvider: Initializing...');
                const database = await getDatabase();
                setDb(database);

                // Subscribe to patients collection
                sub = database.patients.find().$.subscribe(async (docs) => {
                    const mappedPatients = await Promise.all(docs.map(async (doc) => {
                        // Count studies for this patient
                        const studyCount = await database.studies.count({
                            selector: { patientId: doc.id }
                        }).exec();

                        return {
                            id: doc.id,
                            patientID: doc.patientID,
                            patientName: doc.patientName,
                            studyCount
                        };
                    }));
                    setPatients(mappedPatients);
                });
            } catch (err: any) {
                console.error('Failed to initialize database:', err);
                setError(err.message || 'Unknown database initialization error');
            }
        };
        initDb();
        return () => sub?.unsubscribe();
    }, []);

    const addDummyPatient = async () => {
        if (!db) return;
        const id = `P-${Math.floor(Math.random() * 10000)}`;
        await db.patients.insert({
            id,
            patientName: 'DOE^JOHN',
            patientID: id,
            patientBirthDate: '19800101',
            patientSex: 'M'
        });
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#1a1a1a] text-red-400 gap-4">
                <span className="text-xl font-bold">Database Error</span>
                <p className="text-sm opacity-80">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded text-white text-xs transition-all"
                >
                    Retry Initialization
                </button>
            </div>
        );
    }

    if (!db) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#1a1a1a] text-blue-400 gap-4">
                <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Initializing Horos Database...</span>
            </div>
        );
    }

    return (
        <DatabaseContext.Provider value={{ db, patients, addDummyPatient }}>
            {children}
        </DatabaseContext.Provider>
    );
};
