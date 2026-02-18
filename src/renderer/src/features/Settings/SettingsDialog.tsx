import React from 'react';
import { X, LayoutList, List, Folder, AlertCircle, Settings, Network } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { PACSPreferences } from '../PACS/PACSPreferences';

export const SettingsDialog: React.FC = () => {
    const { showSettings, setShowSettings, viewMode, setViewMode, databasePath, setDatabasePath, isUpdating, activeSection, setActiveSection } = useSettings();

    if (!showSettings) return null;

    const onPickFolder = async () => {
        // @ts-ignore
        const paths = await window.electron.openFile();
        if (paths && paths.length > 0) {
            setDatabasePath(paths[0]);
        }
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
            <div className="bg-white rounded-xl shadow-2xl w-[1200px] max-w-[95vw] h-[850px] max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
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
                    {/* Sidebar - Narrower for more content space */}
                    <div className="w-[220px] lg:w-[240px] bg-gray-50 border-r border-gray-100 p-6 space-y-2 flex flex-col shrink-0">
                        <div className="mb-4">
                            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-3">Configuration</h2>
                        </div>
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
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                {/* Header Info */}
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-gray-900 tracking-tight">General settings</h3>
                                    <p className="text-xs text-gray-500 font-medium">Configure core application behavior and database preferences.</p>
                                </div>

                                {/* Grid for Main Settings */}
                                <div className="grid grid-cols-2 gap-6">
                                    {/* View Mode Card */}
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] p-5 space-y-4 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-peregrine-accent shrink-0">
                                                <LayoutList size={16} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-gray-800">Database View Mode</label>
                                                <p className="text-[9px] text-gray-400 font-medium">Record grouping mode.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setViewMode('patient')}
                                                className={`group relative flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-xl border-2 transition-all duration-300 ${viewMode === 'patient'
                                                    ? 'border-peregrine-accent bg-blue-50/30 text-peregrine-accent'
                                                    : 'border-gray-50 bg-gray-50/30 hover:border-gray-200 text-gray-400 hover:text-gray-600'
                                                    }`}
                                            >
                                                <LayoutList size={20} className={viewMode === 'patient' ? 'scale-110' : 'group-hover:scale-105'} />
                                                <span className="text-[9px] font-black tracking-wide uppercase">Patient</span>
                                            </button>

                                            <button
                                                onClick={() => setViewMode('study')}
                                                className={`group relative flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-xl border-2 transition-all duration-300 ${viewMode === 'study'
                                                    ? 'border-peregrine-accent bg-blue-50/30 text-peregrine-accent'
                                                    : 'border-gray-50 bg-gray-50/30 hover:border-gray-200 text-gray-400 hover:text-gray-600'
                                                    }`}
                                            >
                                                <List size={20} className={viewMode === 'study' ? 'scale-110' : 'group-hover:scale-105'} />
                                                <span className="text-[9px] font-black tracking-wide uppercase">Study</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Storage Location Card */}
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] p-5 space-y-4 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
                                                <Folder size={16} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-gray-800">Storage Location</label>
                                                <p className="text-[9px] text-gray-400 font-medium">DICOM data path.</p>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50/80 px-3 py-2 rounded-lg border border-gray-100 relative group/path overflow-hidden">
                                            <div className="text-[9px] font-mono text-gray-600 truncate" title={databasePath || ''}>
                                                {databasePath || 'Initialising...'}
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={onResetPath}
                                                disabled={isUpdating}
                                                className="flex-1 py-1.5 bg-white border border-gray-100 rounded-lg text-[9px] font-bold text-gray-500 hover:text-peregrine-accent hover:border-peregrine-accent disabled:opacity-50 transition-all flex items-center justify-center gap-1 shadow-sm"
                                            >
                                                Default
                                            </button>
                                            <button
                                                onClick={onPickFolder}
                                                disabled={isUpdating}
                                                className="flex-1 py-1.5 bg-peregrine-accent text-white rounded-lg text-[9px] font-bold hover:bg-blue-600 disabled:bg-blue-300 transition-all flex items-center justify-center gap-1 shadow-lg shadow-blue-500/20"
                                            >
                                                Change...
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Condensed Maintenance Card */}
                                <div className="bg-red-50/20 rounded-2xl border border-red-100/50 p-5 flex items-center justify-between gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-500 shrink-0">
                                            <AlertCircle size={16} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-red-900">Database Maintenance</label>
                                            <p className="text-[9px] text-red-600/70 font-medium">Wipe records and re-scan storage.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            if (window.confirm('Are you sure you want to reset the database? All records will be wiped and automatically re-imported. Files on disk are safe.')) {
                                                try {
                                                    const { removeDatabase } = await import('../Database/db');
                                                    localStorage.setItem('peregrine_reimport_after_reset', 'true');
                                                    await removeDatabase();
                                                    // Add a small delay for IndexedDB to settle before reload
                                                    setTimeout(() => {
                                                        window.location.reload();
                                                    }, 500);
                                                } catch (e) {
                                                    console.error('Reset failed:', e);
                                                    alert('Failed to reset: ' + e + '\n\nPlease try restarting the application.');
                                                    localStorage.removeItem('peregrine_reimport_after_reset');
                                                }
                                            }
                                        }}
                                        className="px-4 py-2 bg-red-500 text-white text-[9px] font-black uppercase tracking-wider rounded-lg hover:bg-red-600 transition-all shadow-md active:scale-[0.95]"
                                    >
                                        Reset & Re-import
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeSection === 'pacs' && <PACSPreferences />}
                        <div className="h-8 shrink-0" />
                    </div>
                </div>

                {/* Footer - Removed generic footer as individual sections might have actions or just close via X */}
            </div>
        </div>
    );
};
