import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AntigravityDatabase, getDatabase, removeDatabase } from './db';
import { runDatabaseCleanup, CleanupReport } from './cleanupService';
import { importFiles } from './importService';
import { ImportStrategyDialog } from './ImportStrategyDialog';
import { DeleteStrategyDialog } from './DeleteStrategyDialog';
import { useSettings } from '../Settings/SettingsContext';

// Import domain hooks
import { useDatabaseSearch } from './hooks/useDatabaseSearch';
import { useDatabaseImport } from './hooks/useDatabaseImport';
import { useDatabaseDeletion } from './hooks/useDatabaseDeletion';
import { useThumbnailSync } from './hooks/useThumbnailSync';
import { useSmartFolders } from './hooks/useSmartFolders';

// Import Shared Types
import { Patient, Study, SearchFilters, SortConfig, emptyFilters } from './types';
import { AlertTriangle } from 'lucide-react';

interface DatabaseContextType {
    db: AntigravityDatabase | null;
    patients: Patient[];
    studies: Study[];
    searchFilters: SearchFilters;
    setSearchFilters: (filters: SearchFilters) => void;
    availableModalities: string[];
    handleImport: () => Promise<void>;
    importPaths: (paths: string[]) => Promise<void>;
    fetchStudies: (patientId: string) => Promise<void>;
    requestDelete: (type: 'patient' | 'study' | 'series', id: string, name: string) => void;
    lastDeletionTime: number;
    runCleanup: () => Promise<CleanupReport | null>;
    isCleaningUp: boolean;
    removeDatabase: () => Promise<void>;
    sortConfig: SortConfig;
    setSortConfig: (config: SortConfig) => void;
    checkedItems: Set<string>;
    setCheckedItems: (items: Set<string>) => void;
    toggleSelection: (id: string, type: 'patient' | 'study' | 'series') => Promise<void>;
    showSendModal: boolean;
    setShowSendModal: (show: boolean) => void;
    smartFolders: any[];
    activeSmartFolderId: string | null;
    applySmartFolder: (id: string | null) => void;
    saveSmartFolder: (name: string, icon?: string) => Promise<void>;
    prefetchStudyThumbnails: (studyUid: string) => Promise<void>;
    thumbnailMap: Record<string, string>;
}

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
    setSortConfig: () => { },
    checkedItems: new Set(),
    setCheckedItems: () => { },
    toggleSelection: async () => { },
    showSendModal: false,
    setShowSendModal: () => { },
    smartFolders: [],
    activeSmartFolderId: null,
    applySmartFolder: () => { },
    saveSmartFolder: async () => { },
    prefetchStudyThumbnails: async () => { },
    thumbnailMap: {}
});

export const useDatabase = () => {
    return useContext(DatabaseContext);
};

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { viewMode, databasePath } = useSettings();
    const [db, setDb] = useState<AntigravityDatabase | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [studies, setStudies] = useState<Study[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isCleaningUp, setIsCleaningUp] = useState(false);
    const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
    const [showSendModal, setShowSendModal] = useState(false);

    // -- Domain Hooks (Refactored Logic) --
    const {
        searchFilters, setSearchFilters, sortConfig, setSortConfig,
        availableModalities, setAvailableModalities, filteredPatients
    } = useDatabaseSearch(patients);

    const {
        showImportDialog, pendingImportPaths,
        importProgress, setImportProgress, onSelectStrategy, handleImport, importPaths
    } = useDatabaseImport(db, databasePath);

    const {
        deletionTarget, lastDeletionTime, requestDelete, onSelectDeleteStrategy
    } = useDatabaseDeletion(db);

    const {
        thumbnailMap, prefetchStudyThumbnails
    } = useThumbnailSync(db, databasePath);

    const {
        smartFolders, activeSmartFolderId, applySmartFolder, saveSmartFolder
    } = useSmartFolders(db, searchFilters, setSearchFilters);

    const initDb = useCallback(async () => {
        try {
            console.log('DatabaseProvider: Initializing with refactored logic...');
            const database = await getDatabase();
            setDb(database);
            setIsLoaded(true);

            let sub: any;
            if (viewMode === 'patient') {
                sub = database.patients.find({
                    sort: [{ lastImportDateTime: 'desc' }]
                }).$.subscribe(async (docs) => {
                    const allStudies = await database.studies.find().exec();
                    const studyMap = new Map<string, any[]>();
                    allStudies.filter(s => (s.numberOfStudyRelatedInstances || 0) > 0).forEach(s => {
                        if (!studyMap.has(s.patientId)) studyMap.set(s.patientId, []);
                        studyMap.get(s.patientId)!.push(s);
                    });

                    const globalModalities = new Set<string>();
                    const mappedPatients = docs.map((doc) => {
                        const studies = studyMap.get(doc.id) || [];
                        const ptModalities = Array.from(new Set(studies.flatMap((s: any) => s.modalitiesInStudy || []))).filter(Boolean) as string[];
                        ptModalities.forEach(m => globalModalities.add(m));

                        const totalImageCount = (doc.numberOfPatientRelatedInstances || studies.reduce((acc, s: any) => acc + (s.numberOfStudyRelatedInstances || 0), 0)) || 0;
                        const sortedStudies = [...studies].sort((a, b) => (b.studyDate || '').localeCompare(a.studyDate || ''));

                        return {
                            id: doc.id,
                            patientID: doc.patientID,
                            patientName: doc.patientName,
                            patientBirthDate: doc.patientBirthDate || '',
                            patientSex: doc.patientSex || '',
                            studyCount: studies.length,
                            totalImageCount,
                            numberOfPatientRelatedInstances: doc.numberOfPatientRelatedInstances,
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
                const sortKeyMap: Record<string, string> = {
                    'patientName': 'patientName', 'patientID': 'patientId', 'studyDate': 'studyDate',
                    'studyDescription': 'studyDescription', 'userComments': 'userComments',
                    'numberOfPatientRelatedInstances': 'numberOfStudyRelatedInstances',
                    'totalImageCount': 'numberOfStudyRelatedInstances',
                    'ImportDateTime': 'ImportDateTime', 'institutionName': 'institutionName'
                };
                const sortKey = sortKeyMap[sortConfig.key] || 'ImportDateTime';

                sub = database.studies.find({ sort: [{ [sortKey]: sortConfig.direction }] }).$.subscribe(async (docs) => {
                    const patientIds = Array.from(new Set(docs.map(d => d.patientId)));
                    const patientDocs = await database.patients.find({ selector: { id: { $in: patientIds } } }).exec();
                    const patientMap = new Map(patientDocs.map(p => [p.id, p]));

                    const mappedStudiesAsPatients = docs.filter(d => (d.numberOfStudyRelatedInstances || 0) > 0).map(doc => {
                        const patientDoc = patientMap.get(doc.patientId);
                        return {
                            id: doc.studyInstanceUID,
                            patientID: doc.patientId,
                            patientName: patientDoc?.patientName || '',
                            patientBirthDate: patientDoc?.patientBirthDate || doc.studyDate || '',
                            patientSex: patientDoc?.patientSex || '',
                            studyCount: 1,
                            totalImageCount: doc.numberOfStudyRelatedInstances || 0,
                            modalities: doc.modalitiesInStudy || [],
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
            return () => sub?.unsubscribe();
        } catch (err: any) {
            console.error('Failed to initialize database:', err);
            setError(err.message || 'Unknown database initialization error');
        }
    }, [viewMode, sortConfig, setAvailableModalities]);

    useEffect(() => {
        let unsub: (() => void) | undefined;
        initDb().then(u => { unsub = u; });
        return () => unsub?.();
    }, [initDb]);

    useEffect(() => {
        if (!db) return;
        const unsubWatcher = window.electron.watcher.onFilesAdded(async (files) => {
            if (files.length > 0) {
                await importFiles(db, files, false, (progress, msg) => console.log(`[Auto] ${msg} (${progress}%)`));
            }
        });
        return () => unsubWatcher();
    }, [db]);

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

    // fetchStudies assumes its results are managed by the provider for now (A6)
    const fetchStudies = useCallback(async (patientId: string) => {
        if (!db) return;
        try {
            const selector: any = { patientId };
            const foundStudies = await db.studies.find({
                selector,
                sort: [{ ImportDateTime: 'desc' }]
            }).exec();
            setStudies(foundStudies.map((s: any) => ({
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
            })));
        } catch (err) {
            console.error('Fetch studies failed:', err);
        }
    }, [db]);

    const toggleSelection = async (id: string, type: 'patient' | 'study' | 'series') => {
        if (!db) return;
        const newChecked = new Set(checkedItems);
        const isChecked = newChecked.has(id);

        const addCascading = async (targetId: string, targetType: 'patient' | 'study' | 'series') => {
            newChecked.add(targetId);
            if (targetType === 'patient') {
                const studies = await db.studies.find({ selector: { patientId: targetId } }).exec();
                for (const st of studies) {
                    newChecked.add(st.studyInstanceUID);
                    const series = await db.series.find({ selector: { studyInstanceUID: st.studyInstanceUID } }).exec();
                    for (const s of series) newChecked.add(s.seriesInstanceUID);
                }
            } else if (targetType === 'study') {
                const series = await db.series.find({ selector: { studyInstanceUID: targetId } }).exec();
                for (const s of series) newChecked.add(s.seriesInstanceUID);
            }
        };

        const removeCascading = async (targetId: string, targetType: 'patient' | 'study' | 'series') => {
            newChecked.delete(targetId);
            if (targetType === 'patient') {
                const studies = await db.studies.find({ selector: { patientId: targetId } }).exec();
                for (const st of studies) {
                    newChecked.delete(st.studyInstanceUID);
                    const series = await db.series.find({ selector: { studyInstanceUID: st.studyInstanceUID } }).exec();
                    for (const s of series) newChecked.delete(s.seriesInstanceUID);
                }
            } else if (targetType === 'study') {
                const series = await db.series.find({ selector: { studyInstanceUID: targetId } }).exec();
                for (const s of series) newChecked.delete(s.seriesInstanceUID);
            }
        };

        if (isChecked) await removeCascading(id, type);
        else await addCascading(id, type);

        setCheckedItems(newChecked);
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


    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#1c1c1e] text-red-100 p-8 gap-6 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 ring-8 ring-red-500/5">
                    <AlertTriangle size={32} />
                </div>
                <div className="max-w-md space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">Database Initialization Error</h1>
                    <p className="text-sm text-white/60 leading-relaxed">{error}</p>
                </div>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button onClick={() => window.location.reload()} className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all text-xs">Try Again</button>
                    <button onClick={async () => {
                        if (window.confirm('CAUTION: This will reset the database. Managed files will NOT be deleted. Proceed?')) {
                            localStorage.setItem('peregrine_reimport_after_reset', 'true');
                            await removeDatabase();
                            window.location.reload();
                        }
                    }} className="w-full py-3 bg-red-500/10 text-red-500 font-bold rounded-xl hover:bg-red-500/20 transition-all text-xs border border-red-500/20">Reset & Re-import</button>
                </div>
            </div>
        );
    }

    if (!db) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#1a1a1a] text-blue-400 gap-4">
                <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-[0.2em]">Initializing Database...</span>
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
            setSortConfig,
            checkedItems,
            setCheckedItems,
            toggleSelection,
            showSendModal,
            setShowSendModal,
            smartFolders,
            activeSmartFolderId,
            applySmartFolder,
            saveSmartFolder,
            prefetchStudyThumbnails,
            thumbnailMap
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
