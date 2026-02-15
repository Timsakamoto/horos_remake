import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AntigravityDatabase, getDatabase, removeDatabase } from './db';
import { importFiles } from './importService';
import { runDatabaseCleanup, CleanupReport } from './cleanupService';
import { ImportStrategyDialog } from './ImportStrategyDialog';
import { DeleteStrategyDialog } from './DeleteStrategyDialog';
import { useSettings } from '../Settings/SettingsContext';

interface DeletionTarget {
    type: 'patient' | 'study' | 'series';
    id: string;
    name: string;
}

interface Patient {
    id: string; /// In Study Mode, this behaves as StudyInstanceUID
    patientID: string;
    patientName: string;
    patientBirthDate: string;
    patientSex: string;
    studyCount: number;
    totalImageCount: number;
    modalities: string[];
    // Extended fields for Study Mode
    _isStudy?: boolean;
    studyDescription?: string;
    accessionNumber?: string;
    studyDate?: string;
    institutionName?: string;
    userComments?: string;
}

interface Study {
    studyInstanceUID: string;
    studyDate: string;
    studyTime: string;
    studyDescription: string;
    studyID: string;
    modalitiesInStudy: string[];
    numberOfStudyRelatedSeries: number;
    numberOfStudyRelatedInstances: number;
    patientAge: string;
    institutionName: string;
    referringPhysicianName: string;
    accessionNumber: string;
    ImportDateTime: string;
    patientId: string;
    userComments?: string;
}

// Search filter criteria (A6)
interface SearchFilters {
    patientName: string;
    patientID: string;
    dateRange: {
        start: string; // YYYY-MM-DD
        end: string;   // YYYY-MM-DD
    };
    modalities: string[]; // Selected modalities
    studyDescription: string;
    userComments: string;
}

interface SortConfig {
    key: string;
    direction: 'asc' | 'desc';
}

interface DatabaseContextType {
    db: AntigravityDatabase | null;
    patients: Patient[];
    studies: Study[];
    searchFilters: SearchFilters;
    setSearchFilters: (filters: SearchFilters) => void;
    availableModalities: string[]; // List of all modalities in DB
    handleImport: () => Promise<void>;
    importPaths: (paths: string[]) => Promise<void>;
    fetchStudies: (patientId: string) => Promise<void>;
    requestDelete: (type: 'patient' | 'study' | 'series', id: string, name: string) => void;
    lastDeletionTime: number; // Timestamp of the last deletion (to trigger UI cache clears)
    runCleanup: () => Promise<CleanupReport | null>;
    isCleaningUp: boolean;
    removeDatabase: () => Promise<void>;
    sortConfig: SortConfig;
    setSortConfig: (config: SortConfig) => void;
}

const emptyFilters: SearchFilters = {
    patientName: '',
    patientID: '',
    dateRange: { start: '', end: '' },
    modalities: [],
    studyDescription: '',
    userComments: ''
};

const DatabaseContext = createContext<DatabaseContextType>({
    db: null,
    patients: [],
    studies: [],
    searchFilters: emptyFilters,
    setSearchFilters: () => { },
    availableModalities: [],
    handleImport: async () => { },
    importPaths: async () => { },
    fetchStudies: async () => { },
    requestDelete: () => { },
    lastDeletionTime: 0,
    runCleanup: async () => null,
    isCleaningUp: false,
    removeDatabase: async () => { },
    sortConfig: { key: 'ImportDateTime', direction: 'desc' },
    setSortConfig: () => { }
});

export const useDatabase = () => {
    return useContext(DatabaseContext);
};

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { viewMode, databasePath, isLoaded } = useSettings();
    const [db, setDb] = useState<AntigravityDatabase | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [studies, setStudies] = useState<Study[]>([]);
    const [searchFilters, setSearchFilters] = useState<SearchFilters>(emptyFilters);
    const [availableModalities, setAvailableModalities] = useState<string[]>([]);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [pendingImportPaths, setPendingImportPaths] = useState<string[]>([]);
    const [deletionTarget, setDeletionTarget] = useState<DeletionTarget | null>(null);
    const [lastDeletionTime, setLastDeletionTime] = useState(0);
    const [isCleaningUp, setIsCleaningUp] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState<{ current: number; total: number; percent: number; message?: string } | null>(null);
    const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ImportDateTime', direction: 'desc' });

    useEffect(() => {
        let sub: any;
        const initDb = async () => {
            try {
                console.log('DatabaseProvider: Initializing...');
                const database = await getDatabase();
                setDb(database);

                if (viewMode === 'patient') {
                    // Subscribe to patients collection (Original Logic)
                    const sortKey = sortConfig.key === 'patientName' ? 'patientName' : 'id';
                    sub = database.T_Patient.find({
                        sort: [{ [sortKey]: sortConfig.direction }]
                    }).$.subscribe(async (docs) => {
                        console.log(`DatabaseProvider: Received ${docs.length} patients from T_Patient`);

                        // Bulk fetch all studies for these patients to avoid N+1 queries
                        const patientIds = docs.map(d => d.id);
                        const allStudies = await database.T_Study.find({
                            selector: { patientId: { $in: patientIds } }
                        }).exec();

                        // Group studies by patient for efficient lookup
                        const studyMap = new Map<string, any[]>();
                        allStudies.forEach(s => {
                            if (!studyMap.has(s.patientId)) studyMap.set(s.patientId, []);
                            studyMap.get(s.patientId)!.push(s);
                        });

                        const globalModalities = new Set<string>();

                        const mappedPatients = docs.map((doc) => {
                            const studies = studyMap.get(doc.id) || [];
                            const studyCount = studies.length;
                            const ptModalities = Array.from(new Set(studies.flatMap((s: any) => s.modalitiesInStudy || []))).filter(Boolean) as string[];
                            ptModalities.forEach(m => globalModalities.add(m));

                            const totalImageCount = studies.reduce((acc, s: any) => acc + (s.numberOfStudyRelatedInstances || 0), 0);

                            // Sort studies by date to get the latest one
                            const sortedStudies = [...studies].sort((a, b) => (b.studyDate || '').localeCompare(a.studyDate || ''));

                            return {
                                id: doc.id,
                                patientID: doc.patientID,
                                patientName: doc.patientName,
                                patientBirthDate: doc.patientBirthDate || '',
                                patientSex: doc.patientSex || '',
                                studyCount,
                                totalImageCount,
                                modalities: ptModalities,
                                studyDate: sortedStudies[0]?.studyDate || '',
                                institutionName: doc.institutionName || '',
                                userComments: sortedStudies[0]?.userComments || ''
                            };
                        });
                        setPatients(mappedPatients);
                        setAvailableModalities(Array.from(globalModalities).sort());
                    });
                } else {
                    // STUDY LIST MODE: Subscribe to T_Study directly
                    const sortKey = ['ImportDateTime', 'studyDate', 'userComments', 'studyDescription'].includes(sortConfig.key) ? sortConfig.key : 'ImportDateTime';
                    sub = database.T_Study.find({
                        sort: [{ [sortKey]: sortConfig.direction }]
                    }).$.subscribe(async (docs) => {
                        console.log(`DatabaseProvider: Received ${docs.length} studies from T_Study`);

                        // Bulk fetch patients to avoid N+1 queries
                        const patientIds = Array.from(new Set(docs.map(d => d.patientId)));
                        const patientDocs = await database.T_Patient.find({
                            selector: { id: { $in: patientIds } }
                        }).exec();
                        const patientMap = new Map(patientDocs.map(p => [p.id, p]));

                        const mappedStudiesAsPatients = docs.map(doc => {
                            const patientDoc = patientMap.get(doc.patientId);
                            const mods = doc.modalitiesInStudy || [];

                            return {
                                id: doc.studyInstanceUID,
                                patientID: doc.patientId,
                                patientName: patientDoc?.patientName || '',
                                patientBirthDate: patientDoc?.patientBirthDate || doc.studyDate || '',
                                patientSex: patientDoc?.patientSex || '',
                                studyCount: 1,
                                totalImageCount: doc.numberOfStudyRelatedInstances || 0,
                                modalities: mods,
                                _isStudy: true,
                                studyDescription: doc.studyDescription,
                                accessionNumber: doc.accessionNumber,
                                studyDate: doc.studyDate,
                                institutionName: doc.institutionName || patientDoc?.institutionName || '',
                                userComments: doc.userComments || ''
                            };
                        });

                        setPatients(mappedStudiesAsPatients);
                        setAvailableModalities([]);
                    });
                }

            } catch (err: any) {
                console.error('Failed to initialize database:', err);
                setError(err.message || 'Unknown database initialization error');
            }
        };
        initDb();
        return () => sub?.unsubscribe();
    }, [viewMode, sortConfig]);

    // Auto-reimport logic after database reset
    useEffect(() => {
        let isActive = true;
        const checkAutoReimport = async () => {
            const shouldReimport = localStorage.getItem('peregrine_reimport_after_reset') === 'true';
            if (!shouldReimport || !db || !databasePath || !isLoaded) return;

            // Wait a small bit for UI to be ready
            await new Promise(resolve => setTimeout(resolve, 500));
            if (!isActive) return;

            console.log('DatabaseProvider: Auto-reimporting from:', databasePath);
            // Remove the flag NOW so we don't loop if a reload happens during import
            localStorage.removeItem('peregrine_reimport_after_reset');

            try {
                setImportProgress({ current: 0, total: 100, percent: 0, message: 'Scanning for files...' });

                // @ts-ignore
                const allFiles = await window.electron.readdirRecursive(databasePath);
                // Filter out hidden files
                const filesToImport = allFiles.filter((f: string) => {
                    const name = f.split(/[/\\]/).pop() || '';
                    return !name.startsWith('.');
                });

                console.log(`DatabaseProvider: Found ${filesToImport.length} files to re-import`);

                if (filesToImport.length > 0) {
                    await importFiles(db, filesToImport, false, (percent, message) => {
                        if (isActive) setImportProgress({ current: 0, total: 100, percent, message });
                    }, databasePath);
                }
            } catch (err) {
                console.error('Auto-reimport failed:', err);
            } finally {
                if (isActive) setImportProgress(null);
            }
        };
        checkAutoReimport();
        return () => { isActive = false; };
    }, [db, databasePath, isLoaded]);

    // Filtered patients based on search criteria (A6)
    const filteredPatients = React.useMemo(() => {
        const { patientName, patientID, modalities, studyDescription, dateRange, userComments } = searchFilters;

        // Check if any filters are active
        const hasFilters = patientName || patientID || modalities.length > 0 || studyDescription || dateRange.start || dateRange.end || userComments;

        if (!hasFilters) {
            return patients;
        }

        return patients.filter(p => {
            // Patient Name Filter - using includes for better search UX
            if (patientName) {
                const searchTerm = patientName.toLowerCase().trim();
                const target = String(p.patientName || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            // Patient ID Filter - also using includes
            if (patientID) {
                const searchTerm = patientID.toLowerCase().trim();
                const target = String(p.patientID || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            // Modality Filter (A6) - Select ANY of the checked modalities
            if (modalities.length > 0) {
                const hasMatchingModality = p.modalities.some(m => modalities.includes(m));
                if (!hasMatchingModality) return false;
            }

            // Date Range Filter
            if (dateRange.start || dateRange.end) {
                const dateToCompare = p.patientBirthDate || p.studyDate; // BirthDate in Patient mode, StudyDate in Study mode
                if (dateToCompare) {
                    const cleanDate = dateToCompare.replace(/[^0-9]/g, '');
                    if (dateRange.start) {
                        const startDA = dateRange.start.replace(/-/g, '');
                        if (cleanDate < startDA) return false;
                    }
                    if (dateRange.end) {
                        const endDA = dateRange.end.replace(/-/g, '');
                        if (cleanDate > endDA) return false;
                    }
                } else {
                    // If no date available and we have a date filter, we hide it? 
                    // Usually safer to hide if date is required but missing.
                    return false;
                }
            }

            // Study Description Filter
            if (studyDescription) {
                const searchTerm = studyDescription.toLowerCase().trim();
                const target = String(p.studyDescription || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            // User Comments Filter
            if (userComments) {
                const searchTerm = userComments.toLowerCase().trim();
                const target = String(p.userComments || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            return true;
        });
    }, [patients, searchFilters]);


    const handleImport = async () => {
        if (!db) return;
        try {
            // @ts-ignore
            const filePaths = await window.electron.openFile();
            if (filePaths && filePaths.length > 0) {
                setPendingImportPaths(filePaths);
                setShowImportDialog(true);
            }
        } catch (err) {
            console.error('Import failed:', err);
        }
    };

    const importPaths = async (paths: string[]) => {
        if (!db || !paths || paths.length === 0) return;
        setPendingImportPaths(paths);
        setShowImportDialog(true);
    };

    const onSelectStrategy = async (strategy: 'copy' | 'link' | 'cancel') => {
        setShowImportDialog(false);
        if (strategy === 'cancel' || !db) {
            setPendingImportPaths([]);
            return;
        }

        try {
            await importFiles(db, pendingImportPaths, strategy === 'copy', (percent, message) => {
                setImportProgress({ current: 0, total: 100, percent, message });
            }, databasePath);
        } catch (err) {
            console.error('Final import failed:', err);
        } finally {
            setImportProgress(null);
            setPendingImportPaths([]);
        }
    };

    const fetchStudies = async (patientId: string) => {
        if (!db) return;
        try {
            const selector: any = { patientId };

            // Apply study-level filters (A6)
            // Date Range Filter
            if (searchFilters.dateRange.start || searchFilters.dateRange.end) {
                selector.studyDate = {};
                if (searchFilters.dateRange.start) {
                    // Remove hyphens for DICOM DA format (YYYYMMDD)
                    const startDA = searchFilters.dateRange.start.replace(/-/g, '');
                    selector.studyDate.$gte = startDA;
                }
                if (searchFilters.dateRange.end) {
                    const endDA = searchFilters.dateRange.end.replace(/-/g, '');
                    selector.studyDate.$lte = endDA;
                }
            }

            if (searchFilters.studyDescription) {
                selector.studyDescriptionNormalized = {
                    $regex: '^' + searchFilters.studyDescription.toLowerCase()
                };
            }

            const foundStudies = await db.T_Study.find({
                selector,
                sort: [{ ImportDateTime: 'desc' }]
            }).exec();

            // Apply modality filter client-side
            let filteredStudies = foundStudies;
            if (searchFilters.modalities.length > 0) {
                filteredStudies = foundStudies.filter((s: any) =>
                    s.modalitiesInStudy?.some((m: any) => searchFilters.modalities.includes(m))
                );
            }

            const studiesWithDetails = filteredStudies.map((s: any) => ({
                studyInstanceUID: s.studyInstanceUID,
                studyDate: s.studyDate,
                studyTime: s.studyTime || '',
                studyDescription: s.studyDescription,
                studyID: s.studyID,
                modalitiesInStudy: s.modalitiesInStudy,
                numberOfStudyRelatedSeries: s.numberOfStudyRelatedSeries || 0,
                numberOfStudyRelatedInstances: s.numberOfStudyRelatedInstances || 0,
                patientAge: s.patientAge,
                institutionName: s.institutionName,
                referringPhysicianName: s.referringPhysicianName,
                accessionNumber: s.accessionNumber,
                ImportDateTime: s.ImportDateTime,
                patientId: s.patientId,
                userComments: s.userComments || ''
            }));

            setStudies(studiesWithDetails);
        } catch (err) {
            console.error('Fetch studies failed:', err);
        }
    };

    // Database Cleanup (A7)
    const runCleanup = useCallback(async (): Promise<CleanupReport | null> => {
        if (!db) return null;
        setIsCleaningUp(true);
        try {
            const report = await runDatabaseCleanup(db, (msg, pct) => {
                console.log(`Cleanup: [${pct}%] ${msg}`);
            });
            setCleanupReport(report);
            return report;
        } catch (err) {
            console.error('Cleanup failed:', err);
            return null;
        } finally {
            setIsCleaningUp(false);
        }
    }, [db]);

    const deleteSeries = async (seriesUid: string, deleteFiles: boolean, skipParentCleanup = false) => {
        if (!db) return;
        console.log(`DatabaseProvider: deleteSeries called for ${seriesUid} (Files: ${deleteFiles}, SkipParent: ${skipParentCleanup})`);
        try {
            const seriesDoc = await db.T_Subseries.findOne(seriesUid).exec();
            if (!seriesDoc) return;

            const studyUid = seriesDoc.studyInstanceUID;

            const images = await db.T_FilePath.find({ selector: { seriesInstanceUID: seriesUid } }).exec();
            console.log(`DatabaseProvider: Removing ${images.length} images for series ${seriesUid}`);

            let deletedFilesCount = 0;
            let failedFilesCount = 0;

            for (const img of images) {
                if (deleteFiles && img.filePath) {
                    try {
                        let targetPath = img.filePath;

                        // Check if path is relative (doesn't start with / and doesn't have a drive letter)
                        const isAbsolute = img.filePath.startsWith('/') || /^[a-zA-Z]:/.test(img.filePath);

                        if (!isAbsolute && databasePath) {
                            // @ts-ignore
                            targetPath = await window.electron.join(databasePath, img.filePath);
                        }

                        console.log(`[DELETE] Attempting to unlink: ${targetPath} (Original: ${img.filePath})`);
                        // @ts-ignore
                        await window.electron.unlink(targetPath);
                        deletedFilesCount++;
                    } catch (e) {
                        console.error('[DELETE] Exception during unlink:', img.filePath, e);
                        failedFilesCount++;
                    }
                }
                await img.remove();
            }
            console.log(`[DELETE] Series ${seriesUid} cleanup complete: Deleted ${deletedFilesCount} files, Failed ${failedFilesCount} files.`);

            console.log(`DatabaseProvider: Removing series record ${seriesUid}`);
            await seriesDoc.remove();

            // After series is gone, check if study has other series
            if (!skipParentCleanup && studyUid) {
                const remainingSeries = await db.T_Subseries.count({ selector: { studyInstanceUID: studyUid } }).exec();
                if (remainingSeries === 0) {
                    console.log(`DatabaseProvider: No series left in study ${studyUid}, removing study.`);
                    await deleteStudy(studyUid, deleteFiles);
                }
            }
        } catch (err) {
            console.error('Delete series failed:', err);
        }
    };

    const deleteStudy = async (studyUid: string, deleteFiles: boolean, skipParentCleanup = false) => {
        if (!db) return;
        console.log(`DatabaseProvider: deleteStudy called for ${studyUid} (Files: ${deleteFiles}, SkipParent: ${skipParentCleanup})`);
        try {
            const studyDoc = await db.T_Study.findOne(studyUid).exec();
            if (!studyDoc) return;

            const patientId = studyDoc.patientId;

            const seriesDocs = await db.T_Subseries.find({ selector: { studyInstanceUID: studyUid } }).exec();
            for (const s of seriesDocs) {
                await deleteSeries(s.seriesInstanceUID, deleteFiles, true); // True because we delete parent study anyway
            }

            console.log(`DatabaseProvider: Removing study record ${studyUid}`);
            await studyDoc.remove();

            // After study is gone, check if patient has other studies
            if (!skipParentCleanup && patientId) {
                const remainingStudies = await db.T_Study.count({ selector: { patientId } }).exec();
                if (remainingStudies === 0) {
                    console.log(`DatabaseProvider: No studies left for patient ${patientId}, removing patient.`);
                    await deletePatient(patientId, deleteFiles);
                }
            }
        } catch (err) {
            console.error('Delete study failed:', err);
        }
    };

    const deletePatient = async (patientId: string, deleteFiles: boolean) => {
        if (!db) return;
        console.log(`DatabaseProvider: deletePatient called for ${patientId} (Files: ${deleteFiles})`);
        try {
            const studiesDocs = await db.T_Study.find({ selector: { patientId } }).exec();
            for (const s of studiesDocs) {
                await deleteStudy(s.studyInstanceUID, deleteFiles, true); // True because we delete parent patient anyway
            }
            const patientDoc = await db.T_Patient.findOne(patientId).exec();
            if (patientDoc) {
                console.log(`DatabaseProvider: Removing patient record ${patientId}`);
                await patientDoc.remove();
            }
        } catch (err) {
            console.error('Delete patient failed:', err);
        }
    };

    const requestDelete = (type: 'patient' | 'study' | 'series', id: string, name: string) => {
        console.log(`DatabaseProvider: requestDelete called for ${type}: ${name} (${id})`);
        setDeletionTarget({ type, id, name });
    };

    const onSelectDeleteStrategy = async (strategy: 'record-only' | 'record-and-files' | 'cancel') => {
        console.log(`DatabaseProvider: onSelectDeleteStrategy called with: ${strategy}`);
        if (!deletionTarget || strategy === 'cancel') {
            setDeletionTarget(null);
            return;
        }

        const deleteFiles = strategy === 'record-and-files';
        const { type, id, name } = deletionTarget;
        console.log(`DatabaseProvider: Starting deletion of ${type}: ${name} (Files: ${deleteFiles})`);

        try {
            if (type === 'patient') await deletePatient(id, deleteFiles);
            else if (type === 'study') await deleteStudy(id, deleteFiles);
            else if (type === 'series') await deleteSeries(id, deleteFiles);
            console.log(`DatabaseProvider: Successfully deleted ${type}: ${name}`);
            setLastDeletionTime(Date.now()); // Trigger UI refresh
        } catch (err) {
            console.error('Final deletion failed:', err);
        } finally {
            setDeletionTarget(null);
        }
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#1c1c1e] text-red-400 p-8 gap-6 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 ring-8 ring-red-500/5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <title>Alert</title>
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
                    </svg>
                </div>
                <div className="max-w-md space-y-2">
                    <h1 className="text-2xl font-bold text-white tracking-tight">Database Initialization Error</h1>
                    <p className="text-sm text-white/60 leading-relaxed">
                        Peregrine could not establish a connection to its internal database. This often happens due to browser storage limitations or corruption.
                    </p>
                    <div className="mt-4 p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-xs font-mono text-red-400/80 break-all">
                        {error}
                    </div>
                </div>

                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all text-xs"
                    >
                        Try Again
                    </button>
                    <button
                        onClick={async () => {
                            if (window.confirm('CAUTION: This will permanently delete all local database records and reset the application. DICOM files in your managed folder will NOT be deleted. They will be automatically re-imported after the reset. Proceed?')) {
                                try {
                                    localStorage.setItem('peregrine_reimport_after_reset', 'true');
                                    // Clear state first to stop any background observers
                                    setDb(null);
                                    setPatients([]);
                                    setStudies([]);

                                    await removeDatabase();
                                    setTimeout(() => {
                                        window.location.reload();
                                    }, 500);
                                } catch (e) {
                                    console.error('Reset failed:', e);
                                    alert('Failed to reset database: ' + e + '\n\nPlease try restarting the application if this persists.');
                                    localStorage.removeItem('peregrine_reimport_after_reset');
                                }
                            }
                        }}
                        className="w-full py-3 bg-red-500/10 text-red-500 font-bold rounded-xl hover:bg-red-500/20 transition-all text-xs border border-red-500/20"
                    >
                        Reset Database &amp; Re-import
                    </button>
                </div>
            </div>
        );
    }

    if (!db) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#1a1a1a] text-blue-400 gap-4">
                <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Initializing Peregrine Database...</span>
            </div>
        );
    }

    return (
        <DatabaseContext.Provider value={{
            db,
            patients: filteredPatients,
            studies,
            searchFilters,
            setSearchFilters,
            availableModalities,
            handleImport,
            importPaths,
            fetchStudies,
            requestDelete,
            lastDeletionTime,
            runCleanup,
            isCleaningUp,
            removeDatabase: async () => {
                await removeDatabase();
                window.location.reload();
            },
            sortConfig,
            setSortConfig
        }}>
            {children}
            {showImportDialog && (
                <ImportStrategyDialog
                    fileCount={pendingImportPaths.length}
                    onSelect={onSelectStrategy}
                />
            )}
            {deletionTarget && (
                <DeleteStrategyDialog
                    title={`Delete ${deletionTarget.type.toUpperCase()}`}
                    description={`How would you like to delete "${deletionTarget.name}"?`}
                    onSelect={onSelectDeleteStrategy}
                />
            )}
            {importProgress && (
                <div className="fixed bottom-6 left-6 z-[100] animate-in slide-in-from-bottom-4 duration-500 pointer-events-none">
                    <div className="bg-white/95 backdrop-blur-md rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-gray-100 w-[320px] flex flex-col gap-4 pointer-events-auto">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-[12px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-peregrine-accent animate-pulse" />
                                Importing Files
                            </h3>
                            <p className="text-[10px] font-bold text-gray-400 truncate">
                                {importProgress.message}
                            </p>
                        </div>

                        <div className="relative">
                            <div className="overflow-hidden h-1.5 text-xs flex rounded-full bg-blue-50">
                                <div
                                    style={{ width: `${importProgress.percent}%` }}
                                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-peregrine-accent transition-all duration-500 ease-out"
                                />
                            </div>
                            <div className="flex justify-between items-center mt-2">
                                <span className="text-[9px] font-black text-peregrine-accent tabular-nums uppercase tracking-tighter">
                                    {importProgress.percent}% Complete
                                </span>
                                {importProgress.percent === 100 && (
                                    <span className="text-[9px] font-black text-green-500 uppercase tracking-widest animate-bounce">
                                        Done!
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {cleanupReport && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center">
                    <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4">
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">
                            Cleanup Report
                        </h3>
                        <div className="space-y-2 text-xs text-gray-600">
                            <p>Orphaned images removed: <strong>{cleanupReport.orphanedImages}</strong></p>
                            <p>Orphaned series removed: <strong>{cleanupReport.orphanedSeries}</strong></p>
                            <p>Orphaned studies removed: <strong>{cleanupReport.orphanedStudies}</strong></p>
                            <p>Missing file references: <strong>{cleanupReport.missingFiles}</strong></p>
                            <p className="font-bold text-gray-900 pt-2 border-t">
                                Total records cleaned: {cleanupReport.totalCleaned}
                            </p>
                            {cleanupReport.errors.length > 0 && (
                                <div className="mt-2 p-2 bg-red-50 rounded text-red-600 text-[10px]">
                                    {cleanupReport.errors.map((e, i) => <p key={i}>{e}</p>)}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setCleanupReport(null)}
                            className="mt-4 w-full py-2 bg-peregrine-accent text-white font-bold rounded-lg text-xs"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </DatabaseContext.Provider>
    );
};
