import { useState, useEffect } from 'react';
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
import { ToolbarMode, ActiveLUT } from './features/Viewer/types';
import { ActivityManager } from './features/PACS/ActivityManager';
import { AnnotationList } from './features/Viewer/AnnotationList';

const AppContent = () => {
    const { patients, handleImport, smartFolders, activeSmartFolderId, applySmartFolder, saveSmartFolder, prefetchStudyThumbnails } = useDatabase();
    const { setShowSettings } = useSettings();
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

    // Auto-select first patient on launch if no selection
    useEffect(() => {
        if (!selectedPatientId && patients.length > 0) {
            const firstPatient = patients[0];
            setSelectedPatientId(firstPatient.id);
            // If it's a direct study (database search mode or single study)
            if (firstPatient._isStudy && firstPatient.studyInstanceUID) {
                setSelectedStudyUid(firstPatient.studyInstanceUID);
            }
        }
    }, [patients, selectedPatientId]);

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
        if (!selectedStudyUid) return;

        const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid;
        if (!activeSeriesUid) return;

        try {
            // Fetch all series for this study, sorted by number using IPC
            const seriesList = await (window as any).electron.db.query(
                'SELECT seriesInstanceUID FROM series WHERE studyInstanceUID = ? ORDER BY seriesNumber ASC',
                [selectedStudyUid]
            );

            if (!seriesList || seriesList.length === 0) return;

            const currentIndex = seriesList.findIndex((s: any) => s.seriesInstanceUID === activeSeriesUid);
            if (currentIndex === -1) return;

            let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

            // Clamp index
            if (newIndex < 0) newIndex = 0;
            if (newIndex >= seriesList.length) newIndex = seriesList.length - 1;

            if (newIndex !== currentIndex) {
                const newSeriesUid = seriesList[newIndex].seriesInstanceUID;
                onSeriesSelect(newSeriesUid);
            }
        } catch (err) {
            console.error('[App] switchSeries error:', err);
        }
    };

    const handleSeriesSelect = (seriesUid: string | null, indexOrStudyUid?: any) => {
        console.log(`[App] handleSeriesSelect: seriesUid=${seriesUid}, indexOrStudyUid=${indexOrStudyUid}, appMode=${appMode}`);

        if (typeof indexOrStudyUid === 'string') {
            // It's a studyUid from DatabaseTable
            setSelectedStudyUid(indexOrStudyUid);
            onSeriesSelect(seriesUid);
        } else {
            // It's an index or undefined (usually from internal viewer use)
            onSeriesSelect(seriesUid, indexOrStudyUid);
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
            let viewportId = viewports[activeViewportIndex]?.id;
            const engine = (window as any).cornerstone?.getRenderingEngine('peregrine-engine');
            if (!engine) return;

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
                        const total = vp.getDimensions()[2];
                        const next = current + delta;
                        if (next >= 0 && next < total) {
                            vp.setSliceIndex(next);
                        }
                    }
                }
            }
        }
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDownGlobal);
        return () => window.removeEventListener('keydown', handleKeyDownGlobal);
    }, [activeViewportIndex, activeView, viewports, selectedStudyUid]);

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDropZone(null);

        const jsonData = e.dataTransfer.getData('application/json');
        const seriesUidFromType = e.dataTransfer.getData('seriesUid');
        const textData = e.dataTransfer.getData('text/plain');

        let seriesUid: string | null = null;

        if (jsonData) {
            try {
                const parsed = JSON.parse(jsonData);
                seriesUid = parsed.seriesUid || jsonData; // JSON でなければ生の文字列を試す
            } catch (err) {
                seriesUid = jsonData;
            }
        } else {
            seriesUid = seriesUidFromType || textData;
        }

        if (seriesUid) {
            onSeriesSelect(seriesUid);
        }
    };

    const [dropZone, setDropZone] = useState<{ index: number, position: 'relative' | 'left' | 'right' | 'top' | 'bottom' | 'center' } | null>(null);

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleViewportDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const pad = rect.width * 0.2;
        let pos: 'left' | 'right' | 'top' | 'bottom' | 'center' = 'center';

        if (x < pad) pos = 'left';
        else if (x > rect.width - pad) pos = 'right';
        else if (y < pad) pos = 'top';
        else if (y > rect.height - pad) pos = 'bottom';

        setDropZone({ index, position: pos });
    };

    const handleViewportDrop = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        const dz = dropZone;
        setDropZone(null);

        try {
            const jsonData = e.dataTransfer.getData('application/json');
            const seriesUidFromType = e.dataTransfer.getData('seriesUid');
            const textData = e.dataTransfer.getData('text/plain');

            let seriesUid: string | null = null;

            if (jsonData) {
                try {
                    const parsed = JSON.parse(jsonData);
                    seriesUid = parsed.seriesUid || jsonData;
                } catch (err) {
                    seriesUid = jsonData;
                }
            } else {
                seriesUid = seriesUidFromType || textData;
            }

            if (!seriesUid) return;

            console.log(`[App] handleViewportDrop: seriesUid=${seriesUid}, dropIndex=${index}, dz=${JSON.stringify(dz)}, activeViewportIndex=${activeViewportIndex}`);

            if (!dz || dz.position === 'center') {
                // Drop onto center: replace that viewport's data (targeted by index)
                onSeriesSelect(seriesUid, index);
            } else {
                // Split logic
                const newRows = dz.position === 'top' || dz.position === 'bottom' ? layout.rows + 1 : layout.rows;
                const newCols = dz.position === 'left' || dz.position === 'right' ? layout.cols + 1 : layout.cols;
                handleLayoutChange(newRows, newCols);
                const newIndex = Math.min(
                    index + (dz.position === 'right' || dz.position === 'bottom' ? 1 : 0),
                    newRows * newCols - 1 // Clamp to max slot in new layout
                );
                console.log(`[App] Split drop: new layout ${newRows}x${newCols}, targeting index=${newIndex}`);
                onSeriesSelect(seriesUid, newIndex);
            }
        } catch (err) {
            console.error('[App] handleViewportDrop error:', err);
        }
    };

    const handleViewportRightClick = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        setActiveViewportIndex(index);
        // Could open a context menu here
    };

    const onOpenViewer = () => {
        if (selectedStudyUid || activeSeriesUid) {
            handleViewChange('2D');
        }
    };


    const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid || null;
    const [activeModality, setActiveModality] = useState<string | null>(null);

    const onOpenSettings = () => setShowSettings(true);

    useEffect(() => {
        if (!activeSeriesUid) {
            setActiveModality(null);
            return;
        }
        (window as any).electron.db.get('SELECT modality FROM series WHERE seriesInstanceUID = ?', [activeSeriesUid]).then((s: any) => {
            setActiveModality(s ? s.modality : null);
        });
    }, [activeSeriesUid]);

    const visibleViewports = viewports.slice(0, layout.rows * layout.cols);

    if (!isInitReady) {
        return (
            <div
                className="flex h-screen w-screen bg-black text-white font-sans overflow-hidden select-none"
                onDragEnd={() => setDropZone(null)}
            >
                <div className="flex flex-col items-center justify-center m-auto">
                    <div className="w-10 h-10 border-4 border-peregrine-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-4">Initializing Cornerstone...</span>
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
                onDetachViewer={() => {
                    const activeSeriesUid = viewports[activeViewportIndex]?.seriesUid;
                    if (activeSeriesUid && (window as any).electron?.openViewer) {
                        (window as any).electron.openViewer(activeSeriesUid);
                    }
                }}
            />

            <div className="flex-1 flex overflow-hidden relative bg-peregrine-bg">
                {appMode === 'DATABASE' ? (
                    <div className="flex flex-1 overflow-hidden">
                        {/* Sidebar (Peregrine Style) */}
                        <div className="w-72 bg-gradient-to-b from-[#f5f5f7] to-[#e8e8ea] border-r border-[#d1d1d6] flex flex-col select-none shadow-[inset_-1px_0_0_rgba(0,0,0,0.05)]">
                            <div className="flex-1 overflow-y-auto py-4">
                                <div className="px-4">
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
                        <div className="flex-1 flex flex-col bg-[#fcfcfc] overflow-hidden relative z-0">
                            {activeView === 'PACS' ? (
                                <PACSMain />
                            ) : (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-[5] flex flex-col overflow-hidden pt-4">
                                        <DatabaseTable
                                            onPatientSelect={(id) => { console.log('[App] onPatientSelect:', id); setSelectedPatientId(id); }}
                                            onStudySelect={(uid) => { console.log('[App] onStudySelect:', uid); setSelectedStudyUid(uid); }}
                                            onSeriesSelect={handleSeriesSelect}
                                            selectedPatientId={selectedPatientId}
                                            selectedStudyUid={selectedStudyUid}
                                            selectedSeriesUid={viewports[0].seriesUid}
                                            saveSmartFolder={saveSmartFolder}
                                        />
                                    </div>
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
                                                        onSelect={handleSeriesSelect}
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
                ) : (
                    <div className="flex-1 flex h-full min-h-0 overflow-hidden">
                        {/* Sidebar (VIEWER) - Matching w-72 */}
                        <div className="w-72 bg-[#0a0a0b] border-r border-white/10 flex flex-col overflow-hidden z-30">
                            {selectedPatientId && (
                                <ThumbnailStrip
                                    patientId={selectedPatientId}
                                    studyUid={selectedStudyUid}
                                    selectedSeriesUid={viewports[activeViewportIndex].seriesUid}
                                    onSelect={handleSeriesSelect}
                                    fixedCols={1}
                                />
                            )}
                        </div>

                        {/* Main Viewing Area */}
                        <div className="flex-1 bg-black flex flex-col relative h-full min-h-0 overflow-hidden">
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
                                            <Viewport
                                                key={`${vp.id}-${activeView}-${vp.projectionMode}-${vp.activeLUT}`}
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
                                                isSynced={isSynced && vp.orientation === 'Default'}
                                                isCinePlaying={isCinePlaying}
                                                isActive={activeViewportIndex === index}
                                                orientation={vp.orientation}
                                                voiOverride={vp.voi}
                                                onVoiChange={() => {
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
                    </div>
                )}
            </div>

            {/* Status Bar (Peregrine Style) */}
            <div className="h-6 bg-[#f0f0f0] border-t border-[#d1d1d6] flex items-center px-4 justify-between select-none z-50">
                <div className="flex items-center gap-4 text-[10px] font-bold text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                        Online
                    </span>
                    <div className="h-3 w-[1px] bg-gray-300" />
                    <span>{patients.length} patients in database</span>
                    {appMode === 'VIEWER' && (
                        <>
                            <span>|</span>
                            <span>{activeView === '2D' ? 'Standard View' : activeView} Mode</span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <span>Documents DB - v2.0</span>
                </div>
            </div>

            {showAnnotationList && appMode === 'VIEWER' && (
                <div className="fixed top-[110px] right-0 bottom-6 w-80 border-l border-white/10 bg-[#0a0a0b] z-40">
                    <AnnotationList />
                </div>
            )}

            <SettingsDialog />
            <SendToPACSModal />
            <ActivityManager
                isOpen={showActivityManager}
                onClose={() => setShowActivityManager(false)}
            />
        </div>
    );
};

function App() {
    const params = new URLSearchParams(window.location.search);
    const initialView = params.get('view') === 'viewer' ? '2D' : 'Database';
    const initialSeriesUid = params.get('seriesUid');

    return (
        <SettingsProvider>
            <DatabaseProvider>
                <PACSProvider>
                    <ViewerProvider initialView={initialView as any} initialSeriesUid={initialSeriesUid}>
                        <CornerstoneManager />
                        <AppContent />
                    </ViewerProvider>
                </PACSProvider>
            </DatabaseProvider>
        </SettingsProvider>
    );
}

export default App;
