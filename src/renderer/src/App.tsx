import { useState, useRef } from 'react';
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

    const [viewportOrientations, setViewportOrientations] = useState<{ [key: number]: 'Axial' | 'Coronal' | 'Sagittal' | 'Default' }>({});

    // Added for Tab Toggle
    const [showOverlays, setShowOverlays] = useState(true);

    const [viewportVoiOverrides, setViewportVoiOverrides] = useState<{ [key: number]: { windowWidth: number; windowCenter: number } | null }>({});

    // Helper to find adjacent series
    const switchSeries = async (direction: 'next' | 'prev') => {
        if (!db || !selectedStudyUid) return;

        const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid;
        if (!activeSeriesUid) return;

        // Fetch all series for this study, sorted by number
        const seriesList = await db.T_Subseries.find({
            selector: { studyInstanceUID: selectedStudyUid },
            sort: [{ seriesNumber: 'asc' }]
        }).exec();

        if (!seriesList || seriesList.length === 0) return;

        const currentIndex = seriesList.findIndex(s => s.seriesInstanceUID === activeSeriesUid);
        if (currentIndex === -1) return;

        let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

        // Clamp index
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= seriesList.length) newIndex = seriesList.length - 1;

        if (newIndex !== currentIndex) {
            const newSeriesUid = seriesList[newIndex].seriesInstanceUID;
            onSeriesSelect(newSeriesUid);
        }
    };

    const handleKeyDownGlobal = async (e: KeyboardEvent) => {
        // Ignore inputs
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

        // Tab: Toggle Overlays
        if (e.key === 'Tab') {
            e.preventDefault(); // Prevent focus switching
            setShowOverlays(prev => !prev);
            return;
        }

        // Arrow Keys for Active Viewport
        if (appMode === 'VIEWER') {
            const engine = (window as any).cornerstone?.getRenderingEngine('peregrine-engine');
            if (!engine) return;

            let viewportId = viewports[activeViewportIndex]?.id;

            // In MPR mode, there isn't a single "active" index in the same grid sense,
            // but we can default to the Axial viewport for paging if in MPR.
            if (activeView === 'MPR' || activeView === 'Axial') viewportId = 'axial-viewport';
            else if (activeView === 'Sagittal') viewportId = 'sagittal-viewport';
            else if (activeView === 'Coronal') viewportId = 'coronal-viewport';

            const viewport = engine.getViewport(viewportId);

            if (viewport) {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const delta = e.key === 'ArrowUp' ? -1 : 1;

                    if ('setImageIdIndex' in viewport) {
                        // Stack Viewport
                        const vp = viewport as any;
                        const current = vp.getCurrentImageIdIndex();
                        const total = vp.getImageIds().length;
                        const next = current + delta;
                        if (next >= 0 && next < total) {
                            vp.setImageIdIndex(next);
                        } else {
                            switchSeries(delta < 0 ? 'prev' : 'next');
                        }
                    } else if ('getSliceIndex' in viewport) {
                        // Volume Viewport
                        const vp = viewport as any;
                        const current = vp.getSliceIndex();
                        const total = vp.getNumberOfSlices();
                        const next = current + delta;
                        if (next >= 0 && next < total) {
                            // Using delta scroll is safer for volumes
                            const { utilities: csToolsUtils } = (window as any).cornerstoneTools || {};
                            if (csToolsUtils?.scroll) {
                                csToolsUtils.scroll(vp, { delta });
                            } else {
                                // Fallback to setSliceIndex if utilities not available
                                vp.setSliceIndex(next);
                            }
                        } else if (activeView !== 'MPR' && activeView !== 'Axial' && activeView !== 'Sagittal' && activeView !== 'Coronal') {
                            // Only switch series in 2D mode
                            switchSeries(delta < 0 ? 'prev' : 'next');
                        }
                    }
                    viewport.render();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    await switchSeries('prev');
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    await switchSeries('next');
                }
            }
        }

        // Existing Tool Shortcuts
        switch (e.key.toLowerCase()) {
            case 'w': setActiveTool('WindowLevel'); break;
            case 'z': setActiveTool('Zoom'); break;
            case 'p': setActiveTool('Pan'); break;
            case 'l': setActiveTool('Length'); break;
            case 'm': setActiveTool('Magnify'); break;
        }
    };

    // 1. Initialization Effect (Runs ONCE on mount/db)
    useEffect(() => {
        const prepare = async () => {
            await initCornerstone();
            setIsInitReady(true);
        };
        prepare();

        // Handle URL parameters...
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        const seriesUid = params.get('seriesUid');

        if (view === 'viewer' && seriesUid && db) {
            const initViewer = async () => {
                // ... (existing logic)
                // Re-implementing existing init logic briefly for context match if needed, but replace block handles it
                if (!db) return;
                try {
                    const seriesDoc = await db.T_Subseries.findOne({ selector: { seriesInstanceUID: seriesUid } }).exec();
                    if (seriesDoc) {
                        const studyDoc = await db.T_Study.findOne({ selector: { studyInstanceUID: seriesDoc.studyInstanceUID } }).exec();
                        if (studyDoc) {
                            setSelectedPatientId(studyDoc.patientId);
                            setSelectedStudyUid(studyDoc.studyInstanceUID);
                        }
                    }
                    setViewports(prev => {
                        const next = [...prev];
                        next[0] = { ...next[0], seriesUid };
                        return next;
                    });
                    setAppMode('VIEWER');
                    setActiveView('2D');
                } catch (err) { console.error(err); }
            };
            initViewer();
        }
    }, [db]); // Only re-run if DB connection changes

    // 2. Global Key Handler Effect (Re-binds when state changes)
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDownGlobal);
        return () => {
            window.removeEventListener('keydown', handleKeyDownGlobal);
        };
    }, [db, activeViewportIndex, viewports, selectedStudyUid, appMode]);


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

        if (view === 'Axial' || view === 'Coronal' || view === 'Sagittal') {
            setViewportOrientations(prev => ({
                ...prev,
                [activeViewportIndex]: view
            }));

            if (activeView === 'Database' || activeView === 'PACS') {
                setActiveView('2D');
                setAppMode('VIEWER');
            }
            return;
        }

        if (view === '2D' && activeView !== '2D') {
            // Reset orientations to Default when returning to 2D grid
            // to ensure they mount as StackViewports.
            setViewportOrientations({});
        }

        setActiveView(view);
        if (view === 'Database' || view === 'PACS') {
            setAppMode('DATABASE');
        } else {
            setAppMode('VIEWER');
            if (view === 'MPR') {
                setActiveTool('Crosshairs');
            } else if (activeTool === 'Crosshairs') {
                setActiveTool('WindowLevel');
            }
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

    const [dropZone, setDropZone] = useState<{ index: number; position: 'top' | 'bottom' | 'left' | 'right' | 'center' } | null>(null);

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropZone(null);

        const files = Array.from(e.dataTransfer.files);
        const paths = files.map(f => (f as any).path).filter(Boolean);

        if (paths.length > 0) {
            await importPaths(paths);
        }
    };

    // Drag and Drop Handlers for Viewport (Smart Grid)
    const handleViewportDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();

        // Only allow Smart Grid expansion if dragging a series thumbnail
        // Note: HTML5 dnd converts types to lowercase in the types array
        if (!e.dataTransfer.types.includes('seriesuid')) {
            return;
        }

        e.dataTransfer.dropEffect = 'copy';

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        const EDGE_THRESHOLD = 0.25;
        let position: 'top' | 'bottom' | 'left' | 'right' | 'center' = 'center';

        const canExpandCol = layout.cols < 4;
        const canExpandRow = layout.rows < 3;

        const relX = x / width;
        const relY = y / height;

        const distLeft = relX;
        const distRight = 1 - relX;
        const distTop = relY;
        const distBottom = 1 - relY;

        const min = Math.min(distLeft, distRight, distTop, distBottom);

        if (min < EDGE_THRESHOLD) {
            if (min === distLeft && canExpandCol) position = 'left';
            else if (min === distRight && canExpandCol) position = 'right';
            else if (min === distTop && canExpandRow) position = 'top';
            else if (min === distBottom && canExpandRow) position = 'bottom';
        }

        // Optimization: Only update state if changed to prevent render flood
        if (dropZone?.index !== index || dropZone?.position !== position) {
            setDropZone({ index, position });
        }
    };

    const handleViewportDrop = (e: React.DragEvent, index: number) => {
        try {
            e.preventDefault();
            e.stopPropagation();

            // Clean up drop zone state immediately
            const currentDropZone = dropZone;
            setDropZone(null);

            const seriesUid = e.dataTransfer.getData('seriesUid') || e.dataTransfer.getData('seriesuid') || e.dataTransfer.getData('text/plain');
            console.log(`[App] EventType=${e.type} | Viewport=${index} | DropSeries=${seriesUid}`);

            if (!seriesUid) return;

            // Scenario 1: Simple Replace (Center Drop or No Expansion possible)
            if (!currentDropZone || currentDropZone.index !== index || currentDropZone.position === 'center') {
                // CRITICAL FIX: Check state BEFORE scheduling update to prevent loops
                if (viewports[index].seriesUid === seriesUid) {
                    console.log(`[App] SKIP: Series already set (Pre-Check).`);
                    return;
                }

                setViewports(prev => {
                    const next = [...prev];
                    const currentSeries = next[index].seriesUid;

                    // internal double-check
                    if (currentSeries === seriesUid) {
                        return prev;
                    }

                    next[index] = { ...next[index], seriesUid };
                    console.log(`[App] Setting viewport ${index} series to ${seriesUid}`);
                    return next;
                });
                setActiveViewportIndex(index);
                return;
            }

            // Scenario 2: Smart Grid Expansion
            const { position } = currentDropZone;
            const { cols, rows } = layout;

            const curR = Math.floor(index / cols);
            const curC = index % cols;

            let newCols = cols;
            let newRows = rows;
            let insertIndices = { r: -1, c: -1 };

            if (position === 'left') {
                newCols++;
                insertIndices = { r: curR, c: curC };
            } else if (position === 'right') {
                newCols++;
                insertIndices = { r: curR, c: curC + 1 };
            } else if (position === 'top') {
                newRows++;
                insertIndices = { r: curR, c: curC };
            } else if (position === 'bottom') {
                newRows++;
                insertIndices = { r: curR + 1, c: curC };
            }

            // Cap grid size to 4x3 to prevent layout breakage
            if (newCols > 4) newCols = 4;
            if (newRows > 3) newRows = 3;

            const nextViewports = new Array(12).fill(null).map((_, i) => ({ id: `vp-${i}`, seriesUid: null as string | null }));

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const oldIdx = r * cols + c;
                    const existing = viewports[oldIdx];

                    if (!existing || !existing.seriesUid) continue;

                    let targetR = r;
                    let targetC = c;

                    // Adjust target coordinates based on insertion
                    if (position === 'left' && c >= insertIndices.c) targetC++;
                    else if (position === 'right' && c >= insertIndices.c) targetC++;
                    else if (position === 'top' && r >= insertIndices.r) targetR++;
                    else if (position === 'bottom' && r >= insertIndices.r) targetR++;

                    // Check bounds for target
                    if (targetC >= newCols) continue;
                    if (targetR >= newRows) continue;

                    const newIdx = targetR * newCols + targetC;
                    if (newIdx < 12) {
                        nextViewports[newIdx] = { ...nextViewports[newIdx], seriesUid: existing.seriesUid };
                    }
                }
            }

            const newSeriesIdx = insertIndices.r * newCols + insertIndices.c;
            if (newSeriesIdx < 12 && newSeriesIdx >= 0) {
                nextViewports[newSeriesIdx] = { ...nextViewports[newSeriesIdx], seriesUid };
            }

            console.log(`[App] Smart Grid Expansion: ${rows}x${cols} -> ${newRows}x${newCols}`);
            setLayout({ rows: newRows, cols: newCols });
            setViewports(nextViewports);
            setActiveViewportIndex(newSeriesIdx);

        } catch (err) {
            console.error('Drag drop error:', err);
            setDropZone(null); // Ensure cleanup
        }
    };

    // Right Double-Click Removal Logic
    const lastRightClick = useRef<{ time: number, index: number } | null>(null);

    const handleViewportRightClick = (e: React.MouseEvent, index: number) => {
        e.preventDefault(); // Disable context menu
        e.stopPropagation();

        // Prevent removal if only 1x1
        if (layout.rows === 1 && layout.cols === 1) return;

        const now = Date.now();
        const DOUBLE_CLICK_THRESHOLD = 300; // ms

        if (lastRightClick.current &&
            lastRightClick.current.index === index &&
            (now - lastRightClick.current.time) < DOUBLE_CLICK_THRESHOLD) {

            // Detected Right Double-Click
            removeViewport(index);
            lastRightClick.current = null;
        } else {
            lastRightClick.current = { time: now, index };
        }
    };

    const removeViewport = (indexToRemove: number) => {
        // 1. Extract current series UIDs
        const currentSeries = viewports.map(vp => vp.seriesUid);

        // 2. Remove the series at the target index and packing (shift left)
        const updatedSeriesList = [
            ...currentSeries.slice(0, indexToRemove),
            ...currentSeries.slice(indexToRemove + 1)
        ];

        // Pad with nulls to maintain 12 slots
        while (updatedSeriesList.length < 12) {
            updatedSeriesList.push(null);
        }

        // 3. Update Viewports State
        const nextViewports = viewports.map((vp, i) => ({
            ...vp,
            seriesUid: updatedSeriesList[i]
        }));
        setViewports(nextViewports);

        // 4. Auto-Resize Grid (Shrink Rows AND Cols to optimize space)
        const activeCount = updatedSeriesList.filter(uid => uid !== null).length;
        let { rows, cols } = layout;

        // Iteratively try to reduce dimensions while maintaining all active items
        let canReduce = true;
        while (canReduce) {
            canReduce = false;

            // Try reducing rows (Priority 1 for LTR packing)
            if (rows > 1 && activeCount <= (rows - 1) * cols) {
                rows--;
                canReduce = true;
            }
            // Try reducing cols
            else if (cols > 1 && activeCount <= rows * (cols - 1)) {
                cols--;
                canReduce = true;
            }
        }

        if (rows !== layout.rows || cols !== layout.cols) {
            setLayout({ rows, cols });
        }

        // Determine new active index
        // If we removed the active one, select the one at the same index (now shifted) or the last valid one.
        if (activeViewportIndex === indexToRemove) {
            const newActive = activeCount > 0 ? Math.min(indexToRemove, activeCount - 1) : 0;
            setActiveViewportIndex(newActive);
        } else if (activeViewportIndex > indexToRemove) {
            setActiveViewportIndex(activeViewportIndex - 1);
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
            <div
                className="flex h-screen w-screen bg-black text-white font-sans overflow-hidden select-none"
                onDragEnd={() => setDropZone(null)} // Global cleanup for drag operations
            >
                <div className="flex flex-col items-center justify-center">
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
            onDragEnd={() => setDropZone(null)}
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
                showOverlays={showOverlays}
                onToggleOverlays={() => setShowOverlays(prev => !prev)}
                activeViewportOrientation={viewportOrientations[activeViewportIndex] || 'Default'}
                onPresetSelect={(preset) => {
                    setViewportVoiOverrides(prev => ({
                        ...prev,
                        [activeViewportIndex]: preset
                    }));
                }}
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
                                            onContextMenu={(e) => handleViewportRightClick(e, index)}
                                            onDragOver={(e) => handleViewportDragOver(e, index)}
                                            onDrop={(e) => handleViewportDrop(e, index)}
                                        >
                                            {/* Smart Drop Zone Indicator */}
                                            {dropZone && dropZone.index === index && dropZone.position !== 'center' && (
                                                <div className={`absolute z-50 bg-peregrine-accent/50 border-2 border-peregrine-accent transition-all duration-150 animate-in fade-in pointer-events-none
                                                    ${dropZone.position === 'left' ? 'top-0 left-0 bottom-0 w-1/4' : ''}
                                                    ${dropZone.position === 'right' ? 'top-0 right-0 bottom-0 w-1/4' : ''}
                                                    ${dropZone.position === 'top' ? 'top-0 left-0 right-0 h-1/4' : ''}
                                                    ${dropZone.position === 'bottom' ? 'bottom-0 left-0 right-0 h-1/4' : ''}
                                                `}>
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <div className="w-6 h-6 rounded-full bg-white text-peregrine-accent flex items-center justify-center font-black text-xs shadow-md">
                                                            +
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {dropZone && dropZone.index === index && dropZone.position === 'center' && (
                                                <div className="absolute inset-0 z-50 bg-peregrine-accent/20 border-2 border-peregrine-accent animate-pulse pointer-events-none" />
                                            )}

                                            <Viewport
                                                key={`${vp.id}-${activeView}-${viewportOrientations[index] || 'Default'}`}
                                                viewportId={vp.id}
                                                renderingEngineId="peregrine-engine"
                                                seriesUid={vp.seriesUid}
                                                activeTool={activeTool}
                                                isSynced={isSynced && (!viewportOrientations[index] || viewportOrientations[index] === 'Default')} // Disable sync if re-oriented (MPR display unlinked)
                                                isCinePlaying={isCinePlaying}
                                                isActive={activeViewportIndex === index}
                                                orientation={viewportOrientations[index] || 'Default'}
                                                voiOverride={viewportVoiOverrides[index]}
                                                onVoiChange={() => {
                                                    // Clear override once the user manually adjusts
                                                    if (viewportVoiOverrides[index]) {
                                                        setViewportVoiOverrides(prev => ({ ...prev, [index]: null }));
                                                    }
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {(activeView === 'MPR' || activeView === '3D') && (
                                <div className="absolute inset-0">
                                    {activeView === 'MPR' ? (
                                        <OrthoView
                                            key={viewports[activeViewportIndex].seriesUid || 'no-series'}
                                            seriesUid={viewports[activeViewportIndex].seriesUid || ''}
                                            activeTool={activeTool}
                                            projectionMode={projectionMode}
                                            slabThickness={slabThickness}
                                            orientation="MPR"
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
