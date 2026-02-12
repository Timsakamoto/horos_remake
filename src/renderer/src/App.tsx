import { useState } from 'react'
import { DatabaseProvider } from './features/Database/DatabaseProvider'
import { PatientBrowser } from './features/Database/PatientBrowser'
import { Viewport } from './features/Viewer/Viewport'
import { ThumbnailStrip } from './features/Viewer/ThumbnailStrip'
import { Toolbar, ToolMode, ViewMode } from './features/Viewer/Toolbar'
import { OrthoView } from './features/Viewer/OrthoView'
import { VRView } from './features/Viewer/VRView'

function App() {
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [selectedSeriesUid, setSelectedSeriesUid] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<ViewMode>('2D');
    const [activeTool, setActiveTool] = useState<ToolMode>('WindowLevel');

    const handlePatientSelect = (pid: string) => {
        setSelectedPatientId(pid);
        setSelectedSeriesUid(null); // Reset series when patient changes
    };

    return (
        <DatabaseProvider>
            <div className="flex h-screen w-screen flex-col bg-horos-bg text-horos-text">
                {/* Title Bar Area (drag region) */}
                <div className="h-10 w-full bg-horos-panel border-b border-horos-border draggable flex items-center justify-center select-none" style={{ WebkitAppRegion: 'drag' } as any}>
                    <span className="font-semibold text-sm opacity-80">Antigravity</span>
                </div>

                {/* Toolbar */}
                <Toolbar
                    activeView={activeView}
                    onViewChange={setActiveView}
                    activeTool={activeTool}
                    onToolChange={setActiveTool}
                />

                {/* Work Area */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar (Database/Plugins) */}
                    <div className="w-64 bg-horos-panel border-r border-horos-border flex flex-col z-20">
                        <PatientBrowser onSelect={handlePatientSelect} />
                    </div>

                    {/* Viewer Area */}
                    <div className="flex-1 bg-black flex relative overflow-hidden">

                        {/* Thumbnail Strip (Series List) */}
                        {selectedPatientId && (
                            <ThumbnailStrip
                                patientId={selectedPatientId}
                                activeSeriesUid={selectedSeriesUid}
                                onSeriesSelect={setSelectedSeriesUid}
                            />
                        )}

                        {/* Main Viewport */}
                        <div className="flex-1 relative bg-black">
                            {selectedSeriesUid ? (
                                activeView === '2D' ? (
                                    <Viewport
                                        viewportId="main-viewport"
                                        renderingEngineId="main-engine"
                                        seriesUid={selectedSeriesUid}
                                        activeTool={activeTool}
                                    />
                                ) : activeView === 'MPR' ? (
                                    <OrthoView seriesUid={selectedSeriesUid} />
                                ) : (
                                    <VRView seriesUid={selectedSeriesUid} />
                                )
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <div className="text-center">
                                        {selectedPatientId ? (
                                            <p className="text-gray-500">Select a series to view</p>
                                        ) : (
                                            <>
                                                <h1 className="text-4xl font-light text-horos-accent mb-4">Project Antigravity</h1>
                                                <p className="text-gray-400">Phase 3: UI Polish & Advanced Tools</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </DatabaseProvider>
    )
}

export default App
