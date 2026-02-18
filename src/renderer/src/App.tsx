import { useState, useRef, useEffect } from 'react';
import { Activity, Layers, Zap, Database, Folder, Bookmark } from 'lucide-react';
import { ThumbnailStrip } from './features/Viewer/ThumbnailStrip';
import { Viewport } from './features/Viewer/Viewport';
import { OrthoView } from './features/Viewer/OrthoView';
import { VRView } from './features/Viewer/VRView';
import { Toolbar } from './features/Viewer/Toolbar';
import { PACSMain } from './features/PACS/PACSMain';
import { DatabaseProvider, useDatabase } from './features/Database/DatabaseProvider';
import { DatabaseTable } from './features/Database/DatabaseTable';
import { ImagePreview } from './features/Viewer/ImagePreview';
import { SettingsProvider, useSettings } from './features/Settings/SettingsContext';
import { SettingsDialog } from './features/Settings/SettingsDialog';
import { PACSProvider, usePACS } from './features/PACS/PACSProvider';
import { ViewerProvider, useViewer } from './features/Viewer/ViewerContext';
import { CornerstoneManager } from './features/Viewer/CornerstoneManager';
import { SendToPACSModal } from './features/PACS/SendToPACSModal';
import { ToolbarMode, ViewportState, ActiveLUT } from './features/Viewer/types';
import { ActivityManager } from './features/PACS/ActivityManager';
import { AnnotationList } from './features/Viewer/AnnotationList';

const AppContent = () => {
    const { patients, importPaths, handleImport, db, smartFolders, activeSmartFolderId, applySmartFolder, saveSmartFolder, prefetchStudyThumbnails } = useDatabase();
    const { setShowSettings, viewMode: settingsViewMode } = useSettings();
    const { servers, activeServer, setActiveServer, showActivityManager, setShowActivityManager } = usePACS();

    const {
        activeView, handleViewChange,
        activeTool, setActiveTool,
        viewports, setViewports,
        activeViewportIndex, setActiveViewportIndex,
        layout, handleLayoutChange,
        projectionMode, setProjectionMode,
        slabThickness, setSlabThickness,
        isCinePlaying, toggleCinePlaying,
        isSynced, toggleIsSynced,
        isClipping, setIsClipping,
        clippingRange, setClippingRange,
        isAutoRotating, setIsAutoRotating,
        showOverlays, setShowOverlays,
        isInitReady,
        showAnnotationList, setShowAnnotationList,
        onSeriesSelect,
        setViewportFusionOpacity,
        setViewportFusionLUT,
        setViewportFusionVOI,
        setViewportFusionTransferFunction
    } = useViewer();

    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [selectedStudyUid, setSelectedStudyUid] = useState<string | null>(null);

    // Trigger thumbnail prefetching when a study is selected
    useEffect(() => {
        if (selectedStudyUid) {
            prefetchStudyThumbnails(selectedStudyUid);
        }
    }, [selectedStudyUid, prefetchStudyThumbnails]);

    const getIcon = (iconName?: string) => {
        switch (iconName) {
            case 'Layers': return <Layers size={14} />;
            case 'Zap': return <Zap size={14} />;
            case 'Database': return <Database size={14} />;
            case 'Bookmark': return <Bookmark size={14} />;
            default: return <Folder size={14} />;
        }
    };
    const appMode: ToolbarMode = (activeView === 'Database' || activeView === 'PACS') ? 'DATABASE' : 'VIEWER';

    // Helper to find adjacent series
    const switchSeries = async (direction: 'next' | 'prev') => {
        if (!db || !selectedStudyUid) return;

        const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid;
        if (!activeSeriesUid) return;

        // Fetch all series for this study, sorted by number
        const seriesList = await db.series.find({
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
    };

    // 1. Initialization Effect (Runs ONCE on mount/db)
    useEffect(() => {
        // Handle URL parameters...
        const params = new URLSearchParams(window.location.search);
        const view = params.get('view');
        const seriesUid = params.get('seriesUid');

        if (view === 'viewer' && seriesUid && db) {
            const initViewer = async () => {
                if (!db) return;
                try {
                    const seriesDoc = await db.series.findOne({ selector: { seriesInstanceUID: seriesUid } }).exec();
                    if (seriesDoc) {
                        const studyDoc = await db.studies.findOne({ selector: { studyInstanceUID: seriesDoc.studyInstanceUID } }).exec();
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
                    handleViewChange('2D');
                    // Clear search params to prevent jumping back on reload
                    const url = new URL(window.location.href);
                    url.search = '';
                    window.history.replaceState({}, '', url.toString());
                } catch (err) { console.error(err); }
            };
            initViewer();
        }
    }, [db]); // Only re-run if DB connection changes

    // TAB shortcut for overlays
    const handleKeyDownOverlays = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            setShowOverlays(prev => !prev);
        }
    };

    // 2. Global Key Handler Effect (Re-binds when state changes)
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDownGlobal);
        window.addEventListener('keydown', handleKeyDownOverlays);
        return () => {
            window.removeEventListener('keydown', handleKeyDownGlobal);
            window.removeEventListener('keydown', handleKeyDownOverlays);
        };
    }, [db, activeViewportIndex, viewports, selectedStudyUid, activeView, setActiveTool, setShowOverlays]);

    // Actions and Tool Shortcuts
    useEffect(() => {
        const handleShortcuts = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
            switch (e.key.toLowerCase()) {
                case 'w': setActiveTool('WindowLevel'); break;
                case 'z': setActiveTool('Zoom'); break;
                case 'p': setActiveTool('Pan'); break;
                case 'l': setActiveTool('Length'); break;
                case 'm': setActiveTool('Magnify'); break;
            }
        };
        window.addEventListener('keydown', handleShortcuts);
        return () => window.removeEventListener('keydown', handleShortcuts);
    }, [setActiveTool]);

    const onOpenViewer = () => {
        const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid;
        if (activeSeriesUid && (window as any).electron?.openViewer) {
            (window as any).electron.openViewer(activeSeriesUid);
        }
    };

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

        if (!e.dataTransfer.types.includes('seriesuid')) return;

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

        if (dropZone?.index !== index || dropZone?.position !== position) {
            setDropZone({ index, position });
        }
    };

    const handleViewportDrop = (e: React.DragEvent, index: number) => {
        try {
            e.preventDefault();
            e.stopPropagation();

            const currentDropZone = dropZone;
            setDropZone(null);

            const seriesUid = e.dataTransfer.getData('seriesUid') || e.dataTransfer.getData('seriesuid') || e.dataTransfer.getData('text/plain');
            if (!seriesUid) return;

            if (!currentDropZone || currentDropZone.index !== index || currentDropZone.position === 'center') {
                if (viewports[index].seriesUid === seriesUid) return;
                onSeriesSelect(seriesUid, index);
                return;
            }

            const { position } = currentDropZone;
            const { cols, rows } = layout;

            const curR = Math.floor(index / cols);
            const curC = index % cols;

            let newCols = cols;
            let newRows = rows;
            let insertIndices = { r: -1, c: -1 };

            if (position === 'left') { newCols++; insertIndices = { r: curR, c: curC }; }
            else if (position === 'right') { newCols++; insertIndices = { r: curR, c: curC + 1 }; }
            else if (position === 'top') { newRows++; insertIndices = { r: curR, c: curC }; }
            else if (position === 'bottom') { newRows++; insertIndices = { r: curR + 1, c: curC }; }

            if (newCols > 4) newCols = 4;
            if (newRows > 3) newRows = 3;

            const nextViewports: ViewportState[] = new Array(12).fill(null).map((_, i) => ({
                id: `vp-${i}`,
                seriesUid: null,
                orientation: 'Default',
                voi: null,
                projectionMode: 'NORMAL',
                activeLUT: 'Grayscale'
            }));

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const oldIdx = r * cols + c;
                    const existing = viewports[oldIdx];
                    if (!existing || !existing.seriesUid) continue;

                    let targetR = r;
                    let targetC = c;

                    if (position === 'left' && c >= insertIndices.c) targetC++;
                    else if (position === 'right' && c >= insertIndices.c) targetC++;
                    else if (position === 'top' && r >= insertIndices.r) targetR++;
                    else if (position === 'bottom' && r >= insertIndices.r) targetR++;

                    if (targetC >= newCols || targetR >= newRows) continue;

                    const newIdx = targetR * newCols + targetC;
                    if (newIdx < 12) {
                        nextViewports[newIdx] = { ...existing, id: `vp-${newIdx}` };
                    }
                }
            }

            const newSeriesIdx = insertIndices.r * newCols + insertIndices.c;
            if (newSeriesIdx < 12 && newSeriesIdx >= 0) {
                nextViewports[newSeriesIdx] = {
                    id: `vp-${newSeriesIdx}`,
                    seriesUid,
                    orientation: 'Default',
                    voi: null,
                    projectionMode: 'NORMAL',
                    activeLUT: 'Grayscale'
                };
            }

            handleLayoutChange(newRows, newCols);
            setViewports(nextViewports as ViewportState[]);
            setActiveViewportIndex(newSeriesIdx);

        } catch (err) {
            console.error('Drag drop error:', err);
            setDropZone(null);
        }
    };

    // Right Double-Click Removal Logic
    const lastRightClick = useRef<{ time: number, index: number } | null>(null);

    const handleViewportRightClick = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();

        if (layout.rows === 1 && layout.cols === 1) return;

        const now = Date.now();
        const DOUBLE_CLICK_THRESHOLD = 300;

        if (lastRightClick.current &&
            lastRightClick.current.index === index &&
            (now - lastRightClick.current.time) < DOUBLE_CLICK_THRESHOLD) {
            removeViewport(index);
            lastRightClick.current = null;
        } else {
            lastRightClick.current = { time: now, index };
        }
    };

    const removeViewport = (indexToRemove: number) => {
        const currentSeries = viewports.map(vp => vp.seriesUid);
        const updatedSeriesList = [...currentSeries.slice(0, indexToRemove), ...currentSeries.slice(indexToRemove + 1)];
        while (updatedSeriesList.length < 12) updatedSeriesList.push(null);

        const nextViewports = viewports.map((vp, i) => {
            const seriesUid = updatedSeriesList[i];
            const originalVp = seriesUid ? viewports.find(v => v.seriesUid === seriesUid) : null;
            return {
                ...vp,
                seriesUid: seriesUid,
                orientation: originalVp ? originalVp.orientation : 'Default',
                voi: originalVp ? originalVp.voi : null
            };
        });
        setViewports(nextViewports);

        const activeCount = updatedSeriesList.filter(uid => uid !== null).length;
        let { rows, cols } = layout;

        let canReduce = true;
        while (canReduce) {
            canReduce = false;
            if (rows > 1 && activeCount <= (rows - 1) * cols) { rows--; canReduce = true; }
            else if (cols > 1 && activeCount <= rows * (cols - 1)) { cols--; canReduce = true; }
        }

        if (rows !== layout.rows || cols !== layout.cols) handleLayoutChange(rows, cols);

        if (activeViewportIndex === indexToRemove) {
            const newActive = activeCount > 0 ? Math.min(indexToRemove, activeCount - 1) : 0;
            setActiveViewportIndex(newActive);
        } else if (activeViewportIndex > indexToRemove) {
            setActiveViewportIndex(activeViewportIndex - 1);
        }
    };

    const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid || null;
    const [activeModality, setActiveModality] = useState<string | null>(null);

    const onOpenSettings = () => setShowSettings(true);

    useEffect(() => {
        if (!db || !activeSeriesUid) {
            setActiveModality(null);
            return;
        }
        db.series.findOne(activeSeriesUid).exec().then(s => {
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
                onLUTChange={(lut) => {
                    setViewports(prev => {
                        const next = [...prev];
                        if (next[activeViewportIndex]) {
                            next[activeViewportIndex] = { ...next[activeViewportIndex], activeLUT: lut as ActiveLUT };
                        }
                        return next;
                    });
                }}
                isSynced={isSynced}
                onSyncToggle={toggleIsSynced}
                onOpenSettings={onOpenSettings}
                onImport={handleImport}
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
                activeViewportOrientation={viewports[activeViewportIndex]?.orientation || 'Default'}
                showActivityManager={showActivityManager}
                onToggleActivityManager={() => setShowActivityManager(!showActivityManager)}
                onPresetSelect={(preset) => {
                    setViewports(prev => {
                        const next = [...prev];
                        next[activeViewportIndex] = {
                            ...next[activeViewportIndex],
                            voi: preset
                        };
                        return next;
                    });
                }}
                fusionSeriesUid={viewports[activeViewportIndex]?.fusionSeriesUid}
                fusionOpacity={viewports[activeViewportIndex]?.fusionOpacity}
                onFusionOpacityChange={(opacity) => setViewportFusionOpacity(activeViewportIndex, opacity)}
                fusionLUT={viewports[activeViewportIndex]?.fusionLUT}
                onFusionLUTChange={(lut) => setViewportFusionLUT(activeViewportIndex, lut as ActiveLUT)}
                fusionVOI={viewports[activeViewportIndex]?.fusionVOI}
                onFusionVOIChange={(voi) => setViewportFusionVOI(activeViewportIndex, voi)}
                fusionTransferFunction={viewports[activeViewportIndex]?.fusionTransferFunction}
                onFusionTransferFunctionChange={(mode) => setViewportFusionTransferFunction(activeViewportIndex, mode)}
                showAnnotationList={showAnnotationList}
                onToggleAnnotationList={() => setShowAnnotationList(!showAnnotationList)}
            />

            <div className="flex flex-1 overflow-hidden relative">
                {appMode === 'DATABASE' ? (
                    <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="flex flex-1 overflow-hidden relative">
                            {/* Sidebar (Peregrine Style) */}
                            <div className="w-72 bg-gradient-to-b from-[#f5f5f7] to-[#e8e8ea] border-r border-[#d1d1d6] flex flex-col z-30 select-none shadow-[inset_-1px_0_0_rgba(0,0,0,0.05)]">
                                <div className="flex-1 overflow-y-auto py-4">
                                    <div className="px-4">
                                        {/* Smart Folders Section */}
                                        <div className="mb-6">
                                            <h3 className="px-3 mb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                                                Smart Folders
                                            </h3>
                                            <div className="space-y-0.5">
                                                {smartFolders.map(folder => (
                                                    <div
                                                        key={folder.id}
                                                        onClick={() => {
                                                            applySmartFolder(folder.id);
                                                            handleViewChange('Database');
                                                        }}
                                                        className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-lg font-medium text-xs cursor-pointer transition-all ${activeSmartFolderId === folder.id && activeView === 'Database'
                                                            ? 'bg-black/5 text-gray-900 border border-black/5 shadow-sm'
                                                            : 'text-gray-500 hover:bg-black/5'
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <div className={activeSmartFolderId === folder.id && activeView === 'Database' ? 'text-peregrine-accent' : 'text-gray-400'}>
                                                                {getIcon(folder.icon)}
                                                            </div>
                                                            <span className="truncate">{folder.name}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mb-2 text-[10px] font-black text-gray-400 uppercase tracking-widest px-3">
                                            PACS Nodes
                                        </div>
                                        <div className="space-y-0.5">
                                            {servers.map(server => (
                                                <div
                                                    key={server.id}
                                                    onClick={() => {
                                                        setActiveServer(server);
                                                        handleViewChange('PACS');
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
                                                onClick={() => handleViewChange('Database')}
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
                                                saveSmartFolder={saveSmartFolder}
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
                                <span>{patients.length} {settingsViewMode === 'patient' ? 'Patients' : 'Studies'} in database</span>
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
                                                key={`${vp.id}-${activeView}-${vp.orientation}-${vp.projectionMode}-${vp.activeLUT}`}
                                                viewportId={vp.id}
                                                renderingEngineId="peregrine-engine"
                                                seriesUid={vp.seriesUid}
                                                activeTool={activeTool}
                                                activeLUT={vp.activeLUT}
                                                fusionSeriesUid={vp.fusionSeriesUid}
                                                fusionOpacity={vp.fusionOpacity}
                                                fusionLUT={vp.fusionLUT}
                                                fusionVOI={vp.fusionVOI}
                                                fusionTransferFunction={vp.fusionTransferFunction}
                                                projectionMode={vp.projectionMode}
                                                isSynced={isSynced && vp.orientation === 'Default'} // Disable sync if re-oriented (MPR display unlinked)
                                                isCinePlaying={isCinePlaying}
                                                isActive={activeViewportIndex === index}
                                                orientation={vp.orientation}
                                                voiOverride={vp.voi}
                                                onVoiChange={() => {
                                                    // Clear override once the user manually adjusts
                                                    if (vp.voi) {
                                                        setViewports(prev => {
                                                            const next = [...prev];
                                                            next[index] = { ...next[index], voi: null };
                                                            return next;
                                                        });
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

                        {/* Right Annotation Side Panel */}
                        {showAnnotationList && (
                            <div className="w-80 flex-shrink-0">
                                <AnnotationList />
                            </div>
                        )}
                    </div>
                )
                }
            </div >
            <SettingsDialog />
            <SendToPACSModal />
            <ActivityManager
                isOpen={showActivityManager}
                onClose={() => setShowActivityManager(false)}
            />
        </div >
    );
};

function App() {
    return (
        <SettingsProvider>
            <DatabaseProvider>
                <PACSProvider>
                    <ViewerProvider>
                        <CornerstoneManager />
                        <AppContent />
                    </ViewerProvider>
                </PACSProvider>
            </DatabaseProvider>
        </SettingsProvider>
    );
}

export default App;
