import React from 'react';
import { X, LayoutList, List, Folder, HardDrive, Home } from 'lucide-react';
import { useSettings } from './SettingsContext';

export const SettingsDialog: React.FC = () => {
    const { showSettings, setShowSettings, viewMode, setViewMode, databasePath, setDatabasePath } = useSettings();

    if (!showSettings) return null;

    const onPickFolder = async () => {
        // @ts-ignore
        const paths = await window.electron.openFile();
        if (paths && paths.length > 0) {
            setDatabasePath(paths[0]);
        }
    };

    const onSetToProject = async () => {
        // @ts-ignore
        const appPath = await window.electron.getAppPath();
        // @ts-ignore
        const dicomPath = await window.electron.join(appPath, 'HorosData', 'DICOM');
        setDatabasePath(dicomPath);
    };

    const onResetPath = async () => {
        // @ts-ignore
        const userData = await window.electron.getPath('userData');
        // @ts-ignore
        const defaultPath = await window.electron.join(userData, 'HorosData', 'DICOM');
        setDatabasePath(defaultPath);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-[460px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-b from-gray-50 to-white">
                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Settings</span>
                    <button
                        onClick={() => setShowSettings(false)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    {/* View Mode Section */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            Database View Mode
                        </label>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Choose how you want to interact with your database.
                            Select <strong>Study List</strong> if you are experiencing issues with patient grouping.
                        </p>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <button
                                onClick={() => setViewMode('patient')}
                                className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${viewMode === 'patient'
                                    ? 'border-horos-accent bg-blue-50/50 text-horos-accent'
                                    : 'border-gray-100 hover:border-gray-200 text-gray-500'
                                    }`}
                            >
                                <LayoutList size={24} />
                                <span className="text-xs font-bold">Patient List</span>
                            </button>

                            <button
                                onClick={() => setViewMode('study')}
                                className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${viewMode === 'study'
                                    ? 'border-horos-accent bg-blue-50/50 text-horos-accent'
                                    : 'border-gray-100 hover:border-gray-200 text-gray-500'
                                    }`}
                            >
                                <List size={24} />
                                <span className="text-xs font-bold">Study List</span>
                            </button>
                        </div>
                    </div>

                    {/* Storage Location Section */}
                    <div className="space-y-3 pt-4 border-t border-gray-100">
                        <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            Storage Location
                        </label>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Specify where DICOM files are stored when "Copy to database" is used.
                        </p>

                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 overflow-hidden">
                            <div className="text-[10px] font-mono text-gray-600 break-all select-all" title={databasePath || ''}>
                                {databasePath || 'Loading...'}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                onClick={onResetPath}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm"
                            >
                                <Home size={12} />
                                Default
                            </button>
                            <button
                                onClick={onSetToProject}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm"
                            >
                                <Folder size={12} />
                                Project Folder
                            </button>
                            <button
                                onClick={onPickFolder}
                                className="px-3 py-1.5 bg-horos-accent text-white rounded-lg text-[10px] font-bold hover:bg-blue-600 transition-all flex items-center gap-2 shadow-sm"
                            >
                                <HardDrive size={12} />
                                Custom SSD...
                            </button>
                        </div>
                    </div>

                    {/* Maintenance Section */}
                    <div className="space-y-3 pt-4 border-t border-gray-100">
                        <label className="text-sm font-bold text-gray-800 flex items-center gap-2">
                            Maintenance
                        </label>
                        <div className="p-4 rounded-xl bg-red-50 border border-red-100 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500 shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-red-900">Reset Database</h4>
                                    <p className="text-[10px] text-red-700 leading-relaxed">
                                        Permanently delete all database records. DICOM files on disk are NOT deleted. Use this if the database becomes corrupted or you cannot delete items.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={async () => {
                                    if (window.confirm('Are you sure you want to reset the database? All records will be wiped and automatically re-imported from your DICOM folder. DICOM files on disk will NOT be deleted.')) {
                                        try {
                                            const { removeDatabase } = await import('../Database/db');
                                            localStorage.setItem('horos_reimport_after_reset', 'true');
                                            await removeDatabase();
                                            window.location.reload();
                                        } catch (e) {
                                            alert('Failed to reset: ' + e);
                                            localStorage.removeItem('horos_reimport_after_reset');
                                        }
                                    }
                                }}
                                className="w-full py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors shadow-sm"
                            >
                                Reset Database &amp; Re-import
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
                    <button
                        onClick={() => setShowSettings(false)}
                        className="px-4 py-2 bg-horos-accent text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
