import { useState } from 'react';
import { Database, Layers, Activity } from 'lucide-react';
import { ThumbnailStrip } from './features/Viewer/ThumbnailStrip';
import { Viewport } from './features/Viewer/Viewport';
import { OrthoView } from './features/Viewer/OrthoView';
import { VRView } from './features/Viewer/VRView';
import { Toolbar, ToolMode, ViewMode, ProjectionMode, ToolbarMode } from './features/Viewer/Toolbar';
import { PACSMain } from './features/PACS/PACSMain';
import { DatabaseProvider, useDatabase } from './features/Database/DatabaseProvider';
import { DatabaseTable } from './features/Database/DatabaseTable';
import { ImagePreview } from './features/Viewer/ImagePreview';
import { initCornerstone } from './features/Viewer/init';
import { useEffect } from 'react';

import { SettingsProvider, useSettings } from './features/Settings/SettingsContext';
import { SettingsDialog } from './features/Settings/SettingsDialog';

const AppContent = () => {
    const { patients, importPaths } = useDatabase();
    const { setShowSettings, viewMode } = useSettings();

    const [appMode, setAppMode] = useState<ToolbarMode>('DATABASE');
    const [activeView, setActiveView] = useState<ViewMode>('Database');
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [selectedStudyUid, setSelectedStudyUid] = useState<string | null>(null);
    const [selectedSeriesUid, setSelectedSeriesUid] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<ToolMode>('WindowLevel');
    const [projectionMode, setProjectionMode] = useState<ProjectionMode>('NORMAL');
    const [slabThickness, setSlabThickness] = useState(1);
    const [isCinePlaying, setIsCinePlaying] = useState(false);
    const [activeCLUT, setActiveCLUT] = useState<string>('grayscale');
    const [isSynced, setIsSynced] = useState(false);

    useEffect(() => {
        initCornerstone();
    }, []);

    const onOpenViewer = () => {
        if (selectedSeriesUid) {
            setAppMode('VIEWER');
            setActiveView('2D');
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const files = Array.from(e.dataTransfer.files);
        const paths = files.map(f => (f as any).path).filter(Boolean);

        if (paths.length > 0) {
            await importPaths(paths);
        }
    };

    return (
        <div
            className="flex flex-col h-screen bg-horos-bg overflow-hidden text-horos-text antialiased font-sans"
            onDrop={onDrop}
            onDragOver={onDragOver}
        >
            <Toolbar
                mode={appMode}
                activeView={activeView}
                onViewChange={setActiveView}
                activeTool={activeTool}
                onToolChange={setActiveTool}
                projectionMode={projectionMode}
                onProjectionModeChange={setProjectionMode}
                slabThickness={slabThickness}
                onSlabThicknessChange={setSlabThickness}
                isCinePlaying={isCinePlaying}
                onCineToggle={() => setIsCinePlaying(!isCinePlaying)}
                activeCLUT={activeCLUT}
                onCLUTChange={setActiveCLUT}
                isSynced={isSynced}
                onSyncToggle={() => setIsSynced(!isSynced)}
                onOpenSettings={() => setShowSettings(true)}
            />

            <div className="flex flex-1 overflow-hidden relative">
                {appMode === 'DATABASE' ? (
                    <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="flex flex-1 overflow-hidden relative">
                            {/* Sidebar (Horos Style) */}
                            <div className="w-56 bg-gradient-to-b from-[#f5f5f7] to-[#e8e8ea] border-r border-[#d1d1d6] flex flex-col z-30 select-none shadow-[inset_-1px_0_0_rgba(0,0,0,0.05)]">
                                <div className="flex-1 overflow-y-auto py-4">
                                    {/* Local Section */}
                                    <div className="px-4 mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Local</span>
                                        </div>
                                        <div className="space-y-0.5">
                                            <div
                                                onClick={() => setActiveView('Database')}
                                                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer shadow-sm border transition-all ${activeView === 'Database'
                                                    ? 'bg-horos-accent/15 text-horos-accent border-horos-accent/20'
                                                    : 'border-transparent text-gray-600 hover:bg-black/5'
                                                    }`}
                                            >
                                                <Database size={14} />
                                                Documents DB
                                                {viewMode === 'study' && <span className="ml-auto text-[9px] bg-white/50 px-1 rounded border border-horos-accent/10">S</span>}
                                            </div>
                                            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-black/5 font-medium text-xs cursor-pointer transition-colors">
                                                <Layers size={14} />
                                                Albums
                                            </div>
                                        </div>
                                    </div>

                                    {/* Cloud Section */}
                                    <div className="px-4 mb-4">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Services</span>
                                        <div className="space-y-0.5 opacity-60">
                                            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-200/50 font-medium text-xs cursor-pointer">
                                                <div className="w-3.5 h-3.5 rounded-full bg-blue-400/20 flex items-center justify-center">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                </div>
                                                Horos Cloud
                                            </div>
                                        </div>
                                    </div>

                                    {/* Locations Section */}
                                    <div className="px-4">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Locations</span>
                                        <div className="space-y-0.5">
                                            <div
                                                onClick={() => setActiveView('PACS')}
                                                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg font-medium text-xs cursor-pointer transition-colors ${activeView === 'PACS' ? 'bg-black/5 text-gray-900' : 'text-gray-500 hover:bg-black/5'}`}
                                            >
                                                <Activity size={14} />
                                                PACS Query
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Database Main Content Area */}
                            <div className="flex-1 flex flex-col bg-[#fcfcfc] overflow-hidden">
                                {activeView === 'PACS' ? (
                                    <PACSMain />
                                ) : (
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        {/* Central Database Table */}
                                        <div className="flex-1 flex flex-col overflow-hidden pt-4">
                                            <DatabaseTable
                                                onPatientSelect={setSelectedPatientId}
                                                onStudySelect={setSelectedStudyUid}
                                                onSeriesSelect={setSelectedSeriesUid}
                                                selectedPatientId={selectedPatientId}
                                                selectedStudyUid={selectedStudyUid}
                                                selectedSeriesUid={selectedSeriesUid}
                                            />
                                        </div>

                                        {/* Bottom Split Area (Thumbnails | Preview) */}
                                        <div className="flex-1 flex gap-4 px-4 pb-4 overflow-hidden border-t border-[#e0e0e0] pt-4 bg-[#f2f2f7]">
                                            <div className="flex-1 flex flex-col bg-white rounded-lg border border-[#d1d1d6] overflow-hidden shadow-sm">
                                                <div className="px-3 py-2 border-b border-[#f0f0f0] flex items-center justify-between bg-gradient-to-b from-white to-[#f9f9f9]">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Series Selection</span>
                                                    <button onClick={onOpenViewer} className="text-[9px] font-black text-horos-accent hover:underline uppercase tracking-tight">Open in Viewer</button>
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    {selectedPatientId ? (
                                                        <ThumbnailStrip
                                                            patientId={selectedPatientId}
                                                            studyUid={selectedStudyUid}
                                                            selectedSeriesUid={selectedSeriesUid}
                                                            onSelect={setSelectedSeriesUid}
                                                        />
                                                    ) : (
                                                        <div className="h-full flex items-center justify-center text-gray-300 uppercase text-[9px] font-black tracking-[0.2em]">No Selection</div>
                                                    )}
                                                </div>
                                            </div>
                                            <ImagePreview seriesUid={selectedSeriesUid} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Status Bar (Horos Style) */}
                        <div className="h-6 bg-[#f0f0f0] border-t border-[#d1d1d6] flex items-center px-4 justify-between select-none">
                            <div className="flex items-center gap-4 text-[10px] font-bold text-gray-500">
                                <span className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                                    Online
                                </span>
                                <div className="h-3 w-[1px] bg-gray-300" />
                                <span>{patients.length} {viewMode === 'patient' ? 'Patients' : 'Studies'} in database</span>
                                <span>|</span>
                                <span>DICOM Monitor: Active</span>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <span>Documents DB - v2.0</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Viewer Mode Content */
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left Thumbnails Sidebar (Horos Style) */}
                        <div className="w-48 bg-[#0a0a0b] border-r border-white/10 flex flex-col overflow-hidden">
                            {selectedPatientId && (
                                <ThumbnailStrip
                                    patientId={selectedPatientId}
                                    studyUid={selectedStudyUid}
                                    selectedSeriesUid={selectedSeriesUid}
                                    onSelect={setSelectedSeriesUid}
                                />
                            )}
                        </div>

                        {/* Main Viewing Area */}
                        <div className="flex-1 bg-black flex flex-col relative">
                            {selectedSeriesUid ? (
                                <div className="flex-1">
                                    {activeView === '2D' ? (
                                        <Viewport
                                            viewportId="main-viewport"
                                            renderingEngineId="main-engine"
                                            seriesUid={selectedSeriesUid}
                                            activeTool={activeTool}
                                            activeCLUT={activeCLUT}
                                            isSynced={isSynced}
                                        />
                                    ) : activeView === 'MPR' ? (
                                        <OrthoView
                                            seriesUid={selectedSeriesUid}
                                            projectionMode={projectionMode}
                                            slabThickness={slabThickness}
                                        />
                                    ) : (
                                        <VRView seriesUid={selectedSeriesUid} />
                                    )}
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-500 font-bold uppercase tracking-[0.3em]">
                                    No Series Selected
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <SettingsDialog />
        </div>
    );
};

function App() {
    return (
        <SettingsProvider>
            <DatabaseProvider>
                <AppContent />
            </DatabaseProvider>
        </SettingsProvider>
    );
}

export default App;
