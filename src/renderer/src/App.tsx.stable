import { useState } from 'react';
import { Activity } from 'lucide-react';
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
import { PACSProvider, usePACS } from './features/PACS/PACSProvider';

const AppContent = () => {
    const { patients, importPaths, db } = useDatabase();
    const { setShowSettings, viewMode } = useSettings();
    const { servers, activeServer, setActiveServer } = usePACS();

    const [appMode, setAppMode] = useState<ToolbarMode>('DATABASE');
    const [activeView, setActiveView] = useState<ViewMode>('Database');
    const [isInitReady, setIsInitReady] = useState(false);
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [selectedStudyUid, setSelectedStudyUid] = useState<string | null>(null);
    const [activeViewportIndex, setActiveViewportIndex] = useState(0);
    const [layout, setLayout] = useState<{ rows: number, cols: number }>({ rows: 1, cols: 1 });
    const [viewports, setViewports] = useState<Array<{ id: string, seriesUid: string | null }>>([
        { id: 'vp-0', seriesUid: null },
        { id: 'vp-1', seriesUid: null },
        { id: 'vp-2', seriesUid: null },
        { id: 'vp-3', seriesUid: null },
        { id: 'vp-4', seriesUid: null },
        { id: 'vp-5', seriesUid: null },
        { id: 'vp-6', seriesUid: null },
        { id: 'vp-7', seriesUid: null },
        { id: 'vp-8', seriesUid: null },
        { id: 'vp-9', seriesUid: null },
        { id: 'vp-10', seriesUid: null },
        { id: 'vp-11', seriesUid: null },
    ]);

    const [activeTool, setActiveTool] = useState<ToolMode>('WindowLevel');
    const [projectionMode, setProjectionMode] = useState<ProjectionMode>('NORMAL');
    const [slabThickness, setSlabThickness] = useState(1);
    const [isCinePlaying, setIsCinePlaying] = useState(false);
    const [activeCLUT, setActiveCLUT] = useState<string>('grayscale');
    const [isSynced, setIsSynced] = useState(true);

    // Phase D: 3D Visualization States
    const [isClipping, setIsClipping] = useState(false);
    const [clippingRange, setClippingRange] = useState(50); // 0-100%
    const [isAutoRotating, setIsAutoRotating] = useState(false);

    useEffect(() => {
        const prepare = async () => {
            await initCornerstone();
            setIsInitReady(true);
        };
        prepare();

        // Keyboard Shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'w':
                    setActiveTool('WindowLevel');
                    break;
                case 'z':
                    setActiveTool('Zoom');
                    break;
                case 'p':
                    setActiveTool('Pan');
                    break;
                case 'l':
                    setActiveTool('Length');
                    break;
                case 'm':
                    setActiveTool('Magnify');
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        // Handle URL parameters for Test Item 8.1 (Launch in new window)
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        const seriesUid = params.get('seriesUid');

        if (view === 'viewer' && seriesUid && db) {
            const initViewer = async () => {
                if (!db) return; // TS Check

                try {
                    // Fetch series info to get study and patient context
                    const seriesDoc = await db.T_Subseries.findOne({
                        selector: { seriesInstanceUID: seriesUid }
                    }).exec();

                    if (seriesDoc) {
                        const studyDoc = await db.T_Study.findOne({
                            selector: { studyInstanceUID: seriesDoc.studyInstanceUID }
                        }).exec();

                        if (studyDoc) {
                            setSelectedPatientId(studyDoc.patientId);
                            setSelectedStudyUid(studyDoc.studyInstanceUID);
                        }
                    }

                    // Set viewer states
                    setViewports(prev => {
                        const next = [...prev];
                        next[0] = { ...next[0], seriesUid };
                        return next;
                    });
                    setAppMode('VIEWER');
                    setActiveView('2D');
                    console.log(`App: Launched in Viewer mode for series ${seriesUid}`);
                } catch (err) {
                    console.error('App: Failed to initialize viewer from URL params:', err);
                }
            };
            initViewer();
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [db]);

    const handleLayoutChange = (rows: number, cols: number) => {
        setLayout({ rows, cols });
        if (activeViewportIndex >= rows * cols) {
            setActiveViewportIndex(0);
        }
    };

    const handleViewChange = async (view: ViewMode) => {
        // If we are in a sub-viewer window (indicated by URL params) and user clicks Database/PACS,
        // we should try to return to the main database window instead of just switching view locally.
        const isSubViewer = window.location.search.includes('view=viewer');
        if (isSubViewer && (view === 'Database' || view === 'PACS')) {
            // @ts-ignore
            const handled = await window.electron.returnToDatabase();
            if (handled) return; // Window will be closed by main process
        }

        setActiveView(view);
        if (view === 'Database' || view === 'PACS') {
            setAppMode('DATABASE');
        } else {
            setAppMode('VIEWER');
        }
    };

    const onOpenViewer = () => {
        const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid;
        if (activeSeriesUid && (window as any).electron?.openViewer) {
            (window as any).electron.openViewer(activeSeriesUid);
        }
    };

    const onSeriesSelect = (seriesUid: string | null) => {
        if (appMode === 'VIEWER') {
            setViewports(prev => {
                const next = [...prev];
                next[activeViewportIndex] = { ...next[activeViewportIndex], seriesUid };
                return next;
            });
        } else {
            // In DATABASE mode, we still want a "primary" selection for the preview
            setViewports(prev => {
                const next = [...prev];
                next[0] = { ...next[0], seriesUid };
                return next;
            });
        }
    };

    const onOpenSettings = () => setShowSettings(true);
    const toggleCinePlaying = () => setIsCinePlaying(prev => !prev);
    const toggleIsSynced = () => setIsSynced(prev => !prev);

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

    const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid || null;
    const [activeModality, setActiveModality] = useState<string | null>(null);

    useEffect(() => {
        if (!db || !activeSeriesUid) {
            setActiveModality(null);
            return;
        }
        db.T_Subseries.findOne(activeSeriesUid).exec().then(s => {
            setActiveModality(s ? s.modality : null);
        });
    }, [db, activeSeriesUid]);
    const visibleViewports = viewports.slice(0, layout.rows * layout.cols);

    if (!isInitReady) {
        return (
            <div className="flex h-screen bg-peregrine-bg items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-peregrine-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Initializing Cornerstone...</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col h-screen bg-peregrine-bg overflow-hidden text-peregrine-text antialiased font-sans"
            onDrop={onDrop}
            onDragOver={onDragOver}
        >
            <Toolbar
                mode={appMode}
                activeView={activeView}
                onViewChange={handleViewChange}
                activeTool={activeTool}
                onToolChange={setActiveTool}
                projectionMode={projectionMode}
                onProjectionModeChange={setProjectionMode}
                slabThickness={slabThickness}
                onSlabThicknessChange={setSlabThickness}
                isCinePlaying={isCinePlaying}
                onCineToggle={toggleCinePlaying}
                activeCLUT={activeCLUT}
                onCLUTChange={setActiveCLUT}
                isSynced={isSynced}
                onSyncToggle={toggleIsSynced}
                onOpenSettings={onOpenSettings}
                onOpenViewer={onOpenViewer}
                selectedSeriesUid={activeSeriesUid}
                layout={layout}
                onLayoutChange={handleLayoutChange}
                activeModality={activeModality}
                isClipping={isClipping}
                onClippingToggle={() => setIsClipping(!isClipping)}
                clippingRange={clippingRange}
                onClippingRangeChange={setClippingRange}
                isAutoRotating={isAutoRotating}
                onAutoRotateToggle={() => setIsAutoRotating(!isAutoRotating)}
            />

            <div className="flex flex-1 overflow-hidden relative">
                {appMode === 'DATABASE' ? (
                    <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="flex flex-1 overflow-hidden relative">
                            {/* Sidebar (Peregrine Style) */}
                            <div className="w-72 bg-gradient-to-b from-[#f5f5f7] to-[#e8e8ea] border-r border-[#d1d1d6] flex flex-col z-30 select-none shadow-[inset_-1px_0_0_rgba(0,0,0,0.05)]">
                                <div className="flex-1 overflow-y-auto py-4">
                                    <div className="px-4">
                                        <div className="space-y-0.5">
                                            {servers.map(server => (
                                                <div
                                                    key={server.id}
                                                    onClick={() => {
                                                        setActiveServer(server);
                                                        setActiveView('PACS');
                                                    }}
                                                    className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-lg font-medium text-xs cursor-pointer transition-all ${activeView === 'PACS' && activeServer?.id === server.id
                                                        ? 'bg-black/5 text-gray-900 border border-black/5 shadow-sm'
                                                        : 'text-gray-500 hover:bg-black/5'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        <Activity size={14} className={activeView === 'PACS' && activeServer?.id === server.id ? 'text-peregrine-accent' : 'text-gray-400'} />
                                                        <span className="truncate">{server.name}</span>
                                                    </div>
                                                    {server.status === 'online' && (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                                                    )}
                                                </div>
                                            ))}
                                            <div
                                                onClick={() => setActiveView('PACS')}
                                                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg font-medium text-[10px] italic mt-2 cursor-pointer transition-colors ${activeView === 'PACS' ? 'text-gray-900' : 'text-gray-400 hover:bg-black/5'}`}
                                            >
                                                <Activity size={12} className="opacity-50" />
                                                Query All Nodes...
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
                                        <div className="flex-[5] flex flex-col overflow-hidden pt-4">
                                            <DatabaseTable
                                                onPatientSelect={setSelectedPatientId}
                                                onStudySelect={setSelectedStudyUid}
                                                onSeriesSelect={onSeriesSelect}
                                                selectedPatientId={selectedPatientId}
                                                selectedStudyUid={selectedStudyUid}
                                                selectedSeriesUid={viewports[0].seriesUid}
                                            />
                                        </div>

                                        {/* Bottom Split Area (Preview | Thumbnails) */}
                                        <div className="flex-[3] flex gap-4 px-4 pb-4 overflow-hidden border-t border-[#e0e0e0] pt-4 bg-[#f2f2f7]">
                                            <div className="flex-[2] flex flex-col">
                                                <ImagePreview seriesUid={viewports[0].seriesUid} />
                                            </div>

                                            <div className="flex-[3] flex flex-col bg-white rounded-lg border border-[#d1d1d6] overflow-hidden shadow-sm">
                                                <div className="flex-1 overflow-hidden">
                                                    {selectedPatientId ? (
                                                        <ThumbnailStrip
                                                            patientId={selectedPatientId}
                                                            studyUid={selectedStudyUid}
                                                            selectedSeriesUid={viewports[0].seriesUid}
                                                            onSelect={onSeriesSelect}
                                                            defaultCols={6}
                                                        />
                                                    ) : (
                                                        <div className="h-full flex items-center justify-center text-gray-300 uppercase text-[9px] font-black tracking-[0.2em]">No Selection</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Status Bar (Peregrine Style) */}
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
                        {/* Left Thumbnails Sidebar (Peregrine Style) */}
                        <div className="w-60 bg-[#0a0a0b] border-r border-white/10 flex flex-col overflow-hidden">
                            {selectedPatientId && (
                                <ThumbnailStrip
                                    patientId={selectedPatientId}
                                    studyUid={selectedStudyUid}
                                    selectedSeriesUid={viewports[activeViewportIndex].seriesUid}
                                    onSelect={onSeriesSelect}
                                    fixedCols={1}
                                />
                            )}
                        </div>

                        {/* Main Viewing Area */}
                        <div className="flex-1 bg-black flex flex-col relative overflow-hidden">
                            {activeView === '2D' && (
                                <div
                                    className="absolute inset-0 grid gap-[1px] bg-white/5 border-t border-white/10 p-[1px]"
                                    style={{
                                        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                                        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`
                                    }}
                                >
                                    {visibleViewports.map((vp, index) => (
                                        <div
                                            key={vp.id}
                                            className={`relative overflow-hidden group/vp transition-all duration-200 ${activeViewportIndex === index
                                                ? 'ring-1 ring-peregrine-accent ring-inset z-10 shadow-[0_0_15px_rgba(0,122,255,0.3)]'
                                                : 'opacity-90 hover:opacity-100 hover:ring-1 hover:ring-white/10'
                                                }`}
                                            onClick={() => setActiveViewportIndex(index)}
                                            onDragOver={(e) => {
                                                e.preventDefault(); // Required to allow drop
                                                e.dataTransfer.dropEffect = 'copy';
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const seriesUid = e.dataTransfer.getData('seriesUid');
                                                if (seriesUid) {
                                                    setViewports(prev => {
                                                        const next = [...prev];
                                                        next[index] = { ...next[index], seriesUid };
                                                        return next;
                                                    });
                                                    setActiveViewportIndex(index);
                                                }
                                            }}
                                        >
                                            <Viewport
                                                viewportId={vp.id}
                                                renderingEngineId="peregrine-engine"
                                                seriesUid={vp.seriesUid}
                                                activeTool={activeTool}
                                                activeCLUT={activeCLUT}
                                                isSynced={isSynced}
                                                isCinePlaying={isCinePlaying}
                                                isActive={activeViewportIndex === index}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {(activeView === 'MPR' || activeView === '3D' || activeView === 'Axial' || activeView === 'Coronal' || activeView === 'Sagittal') && (
                                <div className="absolute inset-0">
                                    {(activeView === 'MPR' || activeView === 'Axial' || activeView === 'Coronal' || activeView === 'Sagittal') ? (
                                        <OrthoView
                                            key={viewports[activeViewportIndex].seriesUid || 'no-series'}
                                            seriesUid={viewports[activeViewportIndex].seriesUid || ''}
                                            activeTool={activeTool}
                                            projectionMode={projectionMode}
                                            slabThickness={slabThickness}
                                            orientation={activeView === 'MPR' ? 'MPR' : activeView}
                                        />
                                    ) : (
                                        <VRView
                                            seriesUid={viewports[activeViewportIndex].seriesUid || ''}
                                            isClipping={isClipping}
                                            clippingRange={clippingRange}
                                            isAutoRotating={isAutoRotating}
                                            activeTool={activeTool}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )
                }
            </div >
            <SettingsDialog />
        </div >
    );
};

function App() {
    return (
        <SettingsProvider>
            <DatabaseProvider>
                <PACSProvider>
                    <AppContent />
                </PACSProvider>
            </DatabaseProvider>
        </SettingsProvider>
    );
}

export default App;
