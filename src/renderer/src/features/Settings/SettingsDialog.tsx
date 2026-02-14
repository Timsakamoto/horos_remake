import React from 'react';
import { X, LayoutList, List, Folder, HardDrive, Home, Loader2, CheckCircle2, AlertCircle, Settings, Network } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { PACSPreferences } from '../PACS/PACSPreferences';

export const SettingsDialog: React.FC = () => {
    const { showSettings, setShowSettings, viewMode, setViewMode, databasePath, setDatabasePath, isUpdating, lastUpdateStatus, activeSection, setActiveSection } = useSettings();

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
        const dicomPath = await window.electron.join(appPath, 'PeregrineData', 'DICOM');
        setDatabasePath(dicomPath);
    };

    const onResetPath = async () => {
        // @ts-ignore
        const userData = await window.electron.getPath('userData');
        // @ts-ignore
        const defaultPath = await window.electron.join(userData, 'PeregrineData', 'DICOM');
        setDatabasePath(defaultPath);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-[800px] h-[600px] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-b from-gray-50 to-white shrink-0">
                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Settings</span>
                    <button
                        onClick={() => setShowSettings(false)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-48 bg-gray-50 border-r border-gray-100 p-2 space-y-1">
                        <button
                            onClick={() => setActiveSection('general')}
                            className={`w-full px-3 py-2 rounded-lg text-xs font-bold text-left flex items-center gap-2 transition-colors ${activeSection === 'general' ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                }`}
                        >
                            <Settings size={14} />
                            General
                        </button>
                        <button
                            onClick={() => setActiveSection('pacs')}
                            className={`w-full px-3 py-2 rounded-lg text-xs font-bold text-left flex items-center gap-2 transition-colors ${activeSection === 'pacs' ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                }`}
                        >
                            <Network size={14} />
                            PACS / Network
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        {activeSection === 'general' && (
                            <div className="space-y-6">
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
                                                ? 'border-peregrine-accent bg-blue-50/50 text-peregrine-accent'
                                                : 'border-gray-100 hover:border-gray-200 text-gray-500'
                                                }`}
                                        >
                                            <LayoutList size={24} />
                                            <span className="text-xs font-bold">Patient List</span>
                                        </button>

                                        <button
                                            onClick={() => setViewMode('study')}
                                            className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${viewMode === 'study'
                                                ? 'border-peregrine-accent bg-blue-50/50 text-peregrine-accent'
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

                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 overflow-hidden relative">
                                        {isUpdating ? (
                                            <div className="flex items-center gap-2 text-peregrine-accent animate-pulse">
                                                <Loader2 size={12} className="animate-spin" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider">Updating Path...</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="text-[10px] font-mono text-gray-600 break-all select-all pr-6" title={databasePath || ''}>
                                                    {databasePath || 'Loading...'}
                                                </div>
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    {lastUpdateStatus === 'success' && (
                                                        <CheckCircle2 size={14} className="text-green-500 animate-in zoom-in duration-300" />
                                                    )}
                                                    {lastUpdateStatus === 'error' && (
                                                        <AlertCircle size={14} className="text-red-500 animate-in zoom-in duration-300" />
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <button
                                            onClick={onResetPath}
                                            disabled={isUpdating}
                                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
                                        >
                                            <Home size={12} />
                                            Default
                                        </button>
                                        <button
                                            onClick={onSetToProject}
                                            disabled={isUpdating}
                                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm"
                                        >
                                            <Folder size={12} />
                                            Project Folder
                                        </button>
                                        <button
                                            onClick={onPickFolder}
                                            disabled={isUpdating}
                                            className="px-3 py-1.5 bg-peregrine-accent text-white rounded-lg text-[10px] font-bold hover:bg-blue-600 disabled:bg-blue-300 transition-all flex items-center gap-2 shadow-sm"
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
                                                        localStorage.setItem('peregrine_reimport_after_reset', 'true');
                                                        await removeDatabase();
                                                        window.location.reload();
                                                    } catch (e) {
                                                        alert('Failed to reset: ' + e);
                                                        localStorage.removeItem('peregrine_reimport_after_reset');
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
                        )}

                        {activeSection === 'pacs' && <PACSPreferences />}
                    </div>
                </div>

                {/* Footer - Removed generic footer as individual sections might have actions or just close via X */}
            </div>
        </div>
    );
};
