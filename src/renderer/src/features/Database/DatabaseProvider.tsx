import React, { createContext, useContext, useState } from 'react';
import { ImportStrategyDialog } from './ImportStrategyDialog';
import { DeleteStrategyDialog } from './DeleteStrategyDialog';
import { useSettings } from '../Settings/SettingsContext';

// Import domain hooks
import { useDatabaseSearch } from './hooks/useDatabaseSearch';
import { useDatabaseImport } from './hooks/useDatabaseImport';
import { useDatabaseDeletion } from './hooks/useDatabaseDeletion';
import { useThumbnailSync } from './hooks/useThumbnailSync';
import { useSmartFolders } from './hooks/useSmartFolders';
import { useDatabaseData } from './hooks/useDatabaseData';
import { useDatabaseSelection } from './hooks/useDatabaseSelection';
import { useAutoReimport } from './hooks/useAutoReimport';

// Import Shared Types
import { Patient, Study, SearchFilters, SortConfig, emptyFilters } from './types';
import { AlertTriangle } from 'lucide-react';

interface DatabaseContextType {
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
    clearThumbnailCache: (seriesUids?: string[]) => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType>({
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
    thumbnailMap: {},
    clearThumbnailCache: async () => { }
});

export const useDatabase = () => {
    return useContext(DatabaseContext);
};

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { viewMode, databasePath } = useSettings();
    const [showSendModal, setShowSendModal] = useState(false);
    // -- Centralized State for Hooks --
    const [searchFilters, setSearchFilters] = useState<SearchFilters>(emptyFilters);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ImportDateTime', direction: 'desc' });
    const [availableModalities, setAvailableModalities] = useState<string[]>([]);

    // -- Domain Hooks (Refactored Logic) --
    // 1. Data fetching - drives the 'patients' list
    const {
        patients, studies, error, isLoaded, fetchStudies
    } = useDatabaseData(viewMode as any, sortConfig, setAvailableModalities);

    // 2. Search / Filtering - uses 'patients' from hook 1
    const {
        filteredPatients
    } = useDatabaseSearch(
        patients,
        searchFilters,
        setSearchFilters,
        sortConfig,
        setSortConfig,
        availableModalities,
        setAvailableModalities
    );

    const {
        showImportDialog, pendingImportPaths,
        importProgress, setImportProgress, onSelectStrategy, handleImport, importPaths
    } = useDatabaseImport(databasePath);

    const {
        deletionTarget, lastDeletionTime, requestDelete, onSelectDeleteStrategy
    } = useDatabaseDeletion();

    const {
        thumbnailMap, prefetchStudyThumbnails, clearThumbnailCache
    } = useThumbnailSync(databasePath);

    const {
        smartFolders, activeSmartFolderId, applySmartFolder, saveSmartFolder
    } = useSmartFolders(searchFilters, setSearchFilters);

    const {
        checkedItems, setCheckedItems, toggleSelection
    } = useDatabaseSelection();

    useAutoReimport(databasePath, isLoaded, setImportProgress);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#1c1c1e] text-red-100 p-8 gap-6 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 ring-8 ring-red-500/5">
                    <AlertTriangle size={32} />
                </div>
                <div className="max-w-md space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">Database Error</h1>
                    <p className="text-sm text-white/60 leading-relaxed">{error}</p>
                </div>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button onClick={() => window.location.reload()} className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-white/90 transition-all text-xs">Try Again</button>
                    <button onClick={async () => {
                        if (window.confirm('CAUTION: This will reset the database. Managed files will NOT be deleted. Proceed?')) {
                            localStorage.setItem('peregrine_reimport_after_reset', 'true');
                            await (window as any).electron.db.run('DELETE FROM instances');
                            await (window as any).electron.db.run('DELETE FROM series');
                            await (window as any).electron.db.run('DELETE FROM studies');
                            await (window as any).electron.db.run('DELETE FROM patients');
                            window.location.reload();
                        }
                    }} className="w-full py-3 bg-red-500/10 text-red-500 font-bold rounded-xl hover:bg-red-500/20 transition-all text-xs border border-red-500/20">Reset & Re-import</button>
                </div>
            </div>
        );
    }

    return (
        <DatabaseContext.Provider value={{
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
            clearThumbnailCache,
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
        </DatabaseContext.Provider>
    );
};
