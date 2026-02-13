import { useState } from 'react';
import { Database, Layers, Search, Plus, MoreHorizontal, User, Download, RotateCcw } from 'lucide-react';
import { PatientBrowser } from './features/Database/PatientBrowser';
import { ThumbnailStrip } from './features/Viewer/ThumbnailStrip';
import { Viewport } from './features/Viewer/Viewport';
import { OrthoView } from './features/Viewer/OrthoView';
import { VRView } from './features/Viewer/VRView';
import { Toolbar, ToolMode, ViewMode, ProjectionMode } from './features/Viewer/Toolbar';
import { PACSMain } from './features/PACS/PACSMain';
import { DatabaseProvider } from './features/Database/DatabaseProvider';

function App() {
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [selectedSeriesUid, setSelectedSeriesUid] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<ViewMode>('2D');
    const [activeTool, setActiveTool] = useState<ToolMode>('WindowLevel');
    const [projectionMode, setProjectionMode] = useState<ProjectionMode>('NORMAL');
    const [slabThickness, setSlabThickness] = useState<number>(0);

    const handlePatientSelect = (pid: string) => {
        setSelectedPatientId(pid);
        setSelectedSeriesUid(null); // Reset series when patient changes
    };

    return (
        <DatabaseProvider>
            <div className="flex flex-col h-screen bg-horos-bg overflow-hidden text-horos-text antialiased font-sans">
                {/* Custom Title Bar Area (Electron Draggable) - LiftKit Optical Balance */}
                <div className="h-9 bg-white flex items-center px-5 border-b border-gray-100 flex-none select-none z-50" style={{ WebkitAppRegion: 'drag' } as any}>
                    <div className="flex gap-2.5 mr-auto">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-black/5 hover:brightness-90 transition-all cursor-default" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-black/5 hover:brightness-90 transition-all cursor-default" />
                        <div className="w-3 h-3 rounded-full bg-[#28c840] border border-black/5 hover:brightness-90 transition-all cursor-default" />
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-[2px] bg-horos-accent rotate-45" />
                        <span className="text-[10px] font-black text-gray-400 tracking-[0.2em] uppercase">Horos Reborn</span>
                    </div>
                    <div className="ml-auto flex items-center gap-4">
                        <span className="text-[9px] font-bold text-gray-300 tracking-tighter uppercase">v2.0.0-alpha.antigravity</span>
                    </div>
                </div>

                {/* Toolbar */}
                <Toolbar
                    activeView={activeView}
                    onViewChange={setActiveView}
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                    projectionMode={projectionMode}
                    onProjectionModeChange={setProjectionMode}
                    slabThickness={slabThickness}
                    onSlabThicknessChange={setSlabThickness}
                />

                {/* Work Area */}
                <div className="flex flex-1 overflow-hidden relative">
                    {/* Sidebar (Database/Plugins) - macOS Source List style */}
                    {activeView !== 'PACS' && (
                        <div className="w-72 bg-white border-r border-gray-100 flex flex-col z-30 shadow-[1px_0_10px_rgba(0,0,0,0.01)]">
                            <PatientBrowser onSelect={handlePatientSelect} />
                        </div>
                    )}

                    {/* Viewer Area */}
                    <div className="flex-1 bg-black flex relative overflow-hidden">

                        {/* Thumbnail Strip - Perfectionist Dark Mode */}
                        {activeView !== 'PACS' && selectedPatientId && (
                            <div className="w-60 bg-[#0a0a0b] border-r border-white/5 flex flex-col z-20 shadow-2xl">
                                <ThumbnailStrip
                                    patientId={selectedPatientId}
                                    selectedSeriesUid={selectedSeriesUid || ''}
                                    onSelect={setSelectedSeriesUid}
                                />
                            </div>
                        )}

                        {/* Main Viewport */}
                        <div className="flex-1 relative bg-black shadow-inner">
                            {activeView === 'PACS' ? (
                                <PACSMain />
                            ) : selectedSeriesUid ? (
                                activeView === '2D' ? (
                                    <Viewport
                                        viewportId="main-viewport"
                                        renderingEngineId="main-engine"
                                        seriesUid={selectedSeriesUid}
                                        activeTool={activeTool}
                                    />
                                ) : activeView === 'MPR' ? (
                                    <OrthoView
                                        seriesUid={selectedSeriesUid}
                                        projectionMode={projectionMode}
                                        slabThickness={slabThickness}
                                    />
                                ) : (
                                    <VRView seriesUid={selectedSeriesUid} />
                                )
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-horos-bg overflow-hidden relative">
                                    {/* Geometric Background Decorative Element */}
                                    <div className="absolute inset-0 opacity-[0.02] flex items-center justify-center pointer-events-none">
                                        <div className="w-[800px] h-[800px] border-2 border-horos-accent rounded-full scale-150" />
                                        <div className="absolute w-[600px] h-[600px] border border-horos-accent rounded-full" />
                                    </div>

                                    <div className="text-center animate-in zoom-in-95 duration-1000 relative z-10">
                                        {selectedPatientId ? (
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-16 h-16 rounded-3xl bg-white shadow-xl flex items-center justify-center border border-gray-50 scale-110">
                                                    <div className="w-6 h-6 rounded-lg bg-horos-accent rotate-45 animate-pulse" />
                                                </div>
                                                <p className="text-gray-400 font-bold text-[11px] uppercase tracking-[0.2em]">Select series to initialize viewport</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-6">
                                                <div className="relative">
                                                    <div className="w-24 h-24 rounded-[40px] bg-white shadow-2xl flex items-center justify-center border border-gray-50 relative z-10">
                                                        <Database className="text-horos-accent" size={32} strokeWidth={1.5} />
                                                    </div>
                                                    <div className="absolute -inset-4 bg-horos-accent/5 rounded-[50px] blur-2xl -z-0" />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <h2 className="text-gray-900 font-black text-xl tracking-tight">Welcome to Horos Reborn</h2>
                                                    <p className="text-gray-400 font-medium text-xs">Modern Radiology, Reimagined for Antigravity.</p>
                                                </div>
                                                <button className="primary-button !rounded-2xl !py-3 !px-8 mt-4 hover:scale-105 transition-all">
                                                    Open Local Database
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </DatabaseProvider>
    );
}

export default App;
