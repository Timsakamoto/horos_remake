import { useEffect, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    getRenderingEngine,
    cache,
    metaData,
    volumeLoader,
} from '@cornerstonejs/core';
import {
    ToolGroupManager,
    Enums as csToolsEnums,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    MagnifyTool,
    LengthTool,
    AngleTool,
    RectangleROITool,
    EllipticalROITool,
    ProbeTool,
    ArrowAnnotateTool,
    BidirectionalTool,
} from '@cornerstonejs/tools';
import { useDatabase } from '../Database/DatabaseProvider';
import { useSettings } from '../Settings/SettingsContext';
import { OverlayManager } from './OverlayManager';
import { prefetchMetadata } from './electronLoader';
import { CLUT_PRESETS } from './CLUTPresets';
import { addViewportToSync, removeViewportFromSync, triggerInitialSync } from './SyncManager';
import { startCine, stopCine } from './CinePlayer';
import { type ToolMode } from './Toolbar';
import { VerticalPagingSlider } from './VerticalPagingSlider';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

interface Props {
    viewportId: string;
    renderingEngineId: string;
    seriesUid: string | null;
    initialImageId?: string | null;
    isThumbnail?: boolean;
    activeTool?: ToolMode;
    activeCLUT?: string;
    isSynced?: boolean;
    isCinePlaying?: boolean;
    showOverlays?: boolean;
    isActive?: boolean;
    autoFit?: boolean;
    orientation?: 'Axial' | 'Coronal' | 'Sagittal' | 'Default';
    initialWindowWidth?: number;
    initialWindowCenter?: number;
    voiOverride?: { windowWidth: number; windowCenter: number } | null;
    onVoiChange?: () => void;
}

const TOOL_GROUP_ID = 'main-tool-group';

export const Viewport = ({
    viewportId,
    renderingEngineId,
    seriesUid,
    initialImageId = null,
    isThumbnail = false,
    activeTool = 'WindowLevel',
    activeCLUT = 'Default',
    isSynced = false,
    isCinePlaying = false,
    showOverlays = true,
    isActive = false,
    autoFit = false,
    orientation = 'Default',
    initialWindowWidth,
    initialWindowCenter,
    voiOverride,
    onVoiChange
}: Props) => {
    // ... [Lines 70-349 unchanged] ...

    const elementRef = useRef<HTMLDivElement>(null);
    const { db } = useDatabase();
    const { databasePath } = useSettings();
    const [isReady, setIsReady] = useState(false);
    const [isComposed, setIsComposed] = useState(false);
    const mountedRef = useRef(true);
    const [status, setStatus] = useState<string>('');
    const [metadata, setMetadata] = useState<any>({});
    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    // 1. Initialize Tools & Loader
    useEffect(() => {
        let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) {
            toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
        }

        const allTools = [
            'WindowLevel', 'Pan', 'Zoom', 'StackScroll', 'StackScrollMouseWheel',
            'Length', 'EllipticalROI', 'RectangleROI', 'Probe', 'Angle',
            'ArrowAnnotate', 'CobbAngle', 'Bidirectional', 'Magnify', 'Crosshairs'
        ];

        allTools.forEach(toolName => {
            if (toolGroup && !toolGroup.hasTool(toolName)) {
                toolGroup.addTool(toolName);
            }
        });

        // Ensure Reference Lines Tool is disabled by default but available
        // toolGroup?.setToolDisabled(ReferenceLinesTool.toolName);

    }, []);

    // 8. Handle Reference Lines Toggle
    // useEffect(() => {
    //     if (!isReady || isThumbnail) return;

    //     const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
    //     if (!toolGroup) return;

    //     let synchronizer = SynchronizerManager.getSynchronizer(REFERENCE_LINES_SYNC_ID);
    //     if (!synchronizer) {
    //         synchronizer = SynchronizerManager.createSynchronizer(
    //             REFERENCE_LINES_SYNC_ID,
    //             Enums.Events.CAMERA_MODIFIED,
    //             (_synchronizerInstance, _sourceViewport, _targetViewport) => {
    //                  // No-op for actual sync, we just want the event to drive ref lines?
    //                  // Actually ReferenceLinesTool expects the viewports to be in a synchronizer so it can draw.
    //                  // It typically listens to sync events or just existence in the sync group.
    //                  // The tool itself handles the drawing.
    //             }
    //         );
    //     }

    //     if (showReferenceLines) {
    //         toolGroup.setToolEnabled(ReferenceLinesTool.toolName);
    //         synchronizer?.add({ renderingEngineId, viewportId });
    //     } else {
    //         toolGroup.setToolDisabled(ReferenceLinesTool.toolName);
    //         synchronizer?.remove({ renderingEngineId, viewportId });
    //     }

    // }, [showReferenceLines, isReady, isThumbnail, renderingEngineId, viewportId]);

    // 7. Handle Orientation Changes
    useEffect(() => {
        const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup || isThumbnail) return;

        const toolNames = [
            'WindowLevel', 'Pan', 'Zoom', 'StackScroll', 'StackScrollMouseWheel',
            'Length', 'EllipticalROI', 'RectangleROI', 'Probe', 'Angle',
            'ArrowAnnotate', 'CobbAngle', 'Bidirectional', 'Magnify'
        ];
        toolNames.forEach(tn => {
            if (toolGroup?.hasTool(tn)) {
                toolGroup.setToolPassive(tn);
            }
        });

        toolGroup.setToolActive('StackScrollMouseWheel');

        let csToolName: string = '';
        if (activeTool === 'WindowLevel') csToolName = WindowLevelTool.toolName;
        else if (activeTool === 'Pan') csToolName = PanTool.toolName;
        else if (activeTool === 'Zoom') csToolName = ZoomTool.toolName;
        else if (activeTool === 'Length') csToolName = LengthTool.toolName;
        else if (activeTool === 'Rectangle') csToolName = RectangleROITool.toolName;
        else if (activeTool === 'Ellipse') csToolName = EllipticalROITool.toolName;
        else if (activeTool === 'Arrow') csToolName = ArrowAnnotateTool.toolName;
        else if (activeTool === 'Probe') csToolName = ProbeTool.toolName;
        else if (activeTool === 'Angle') csToolName = AngleTool.toolName;
        else if (activeTool === 'Bidirectional') csToolName = BidirectionalTool.toolName;
        else if (activeTool === 'Magnify') csToolName = MagnifyTool.toolName || 'Magnify';
        else if (activeTool === 'Text') csToolName = ArrowAnnotateTool.toolName;

        if (csToolName && toolGroup.hasTool(csToolName)) {
            toolGroup.setToolActive(csToolName, {
                bindings: [{ mouseButton: MouseBindings.Primary }]
            });
        }

        // Standard navigation tools on other buttons
        if (csToolName !== PanTool.toolName) {
            toolGroup.setToolActive(PanTool.toolName, {
                bindings: [{ mouseButton: MouseBindings.Secondary }]
            });
        }
        if (csToolName !== ZoomTool.toolName) {
            toolGroup.setToolActive(ZoomTool.toolName, {
                bindings: [{ mouseButton: MouseBindings.Auxiliary }]
            });
        }

    }, [activeTool, isThumbnail]);

    // 4. Force unique internal ID for Cornerstone to prevent cache collision on re-use
    // const uniqueId = useRef(`${viewportId}-${Date.now()}`).current;

    useEffect(() => {
        console.log(`[Viewport] MOUNTED: ${viewportId} with SeriesUID: ${seriesUid}`);
        return () => console.log(`[Viewport] UNMOUNTED: ${viewportId}`);
    }, [viewportId, seriesUid]);

    // 3. Handle CLUT Changes
    useEffect(() => {
        if (!isReady) return;
        const engine = getRenderingEngine(renderingEngineId);
        if (!engine) return;

        const viewport = engine.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
        if (!viewport) return;

        const preset = CLUT_PRESETS.find(p => p.name === activeCLUT);
        if (preset) {
            viewport.setProperties({
                voiRange: {
                    lower: preset.windowCenter - preset.windowWidth / 2,
                    upper: preset.windowCenter + preset.windowWidth / 2,
                }
            });
            viewport.render();
        }
    }, [activeCLUT, viewportId, renderingEngineId, isReady]);

    useEffect(() => {
        if (!isReady || isThumbnail) return;

        addViewportToSync(viewportId, renderingEngineId);
        return () => {
            removeViewportFromSync(viewportId, renderingEngineId);
        };
    }, [viewportId, renderingEngineId, isThumbnail, isReady]);

    // 4.5 Propagate Sync Toggle to element attribute
    useEffect(() => {
        if (elementRef.current) {
            elementRef.current.setAttribute('data-sync-enabled', isSynced.toString());
        }
    }, [isSynced]);

    useEffect(() => {
        if (!isReady || isThumbnail) return;

        if (isCinePlaying) {
            startCine(viewportId, renderingEngineId);
        } else {
            stopCine(viewportId);
        }
    }, [isCinePlaying, viewportId, renderingEngineId, isThumbnail, isReady]);

    // 4.6 Apply VOI Override from Props (Presets)
    useEffect(() => {
        if (!isReady || !voiOverride || isThumbnail) return;

        const engine = getRenderingEngine(renderingEngineId);
        const viewport = engine?.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
        if (viewport) {
            const voiRange = {
                lower: voiOverride.windowCenter - voiOverride.windowWidth / 2,
                upper: voiOverride.windowCenter + voiOverride.windowWidth / 2,
            };
            viewport.setProperties({ voiRange });
            viewport.render();

            // Notify parent that the override has been "consumed" (applied)
            onVoiChange?.();
        }
    }, [voiOverride, isReady, isThumbnail, renderingEngineId, viewportId, seriesUid, onVoiChange]);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // 6. Load Images
    useEffect(() => {
        if (!db || !seriesUid) return;


        const loadSeries = async () => {
            console.log(`Viewport ${viewportId}: loadSeries start`, seriesUid);
            if (!mountedRef.current) return;
            setIsComposed(false);
            if (!elementRef.current) return;

            // YIELD: Allow UI to update (remove drag overlay) before starting heavy load
            // Increased delay to ensure DOM and layout are settled
            await new Promise(resolve => setTimeout(resolve, 50));

            setIsReady(false);
            setStatus('Loading Series...');

            let ids: string[] = [];
            let images: any[] = [];

            if (isThumbnail && initialImageId) {
                let fullPath = initialImageId;
                if (fullPath && !(fullPath.startsWith('/') || /^[a-zA-Z]:/.test(fullPath)) && databasePath) {
                    const sep = databasePath.includes('\\') ? '\\' : '/';
                    fullPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${fullPath.replace(/^[\\/]/, '')}`;
                }
                ids.push(`electronfile:${fullPath}`);
            } else {
                // Normal Viewer Mode: Load entire series
                images = await db.T_FilePath.find({
                    selector: { seriesInstanceUID: seriesUid },
                    sort: [{ instanceNumber: 'asc' }]
                }).exec();

                if (images.length === 0) {
                    setStatus('No images.');
                    return;
                }

                images.forEach((img: any) => {
                    let fullPath = img.filePath;
                    if (fullPath && !(fullPath.startsWith('/') || /^[a-zA-Z]:/.test(fullPath)) && databasePath) {
                        const sep = databasePath.includes('\\') ? '\\' : '/';
                        fullPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${fullPath.replace(/^[\\/]/, '')}`;
                    }

                    if (img.numberOfFrames > 1) {
                        for (let i = 0; i < img.numberOfFrames; i++) {
                            ids.push(`electronfile:${fullPath}?frame=${i}`);
                        }
                    } else {
                        ids.push(`electronfile:${fullPath}`);
                    }
                });
            }

            let renderingEngine = getRenderingEngine(renderingEngineId);
            if (!renderingEngine) {
                renderingEngine = new RenderingEngine(renderingEngineId);
            }

            // ★ CRITICAL FIX: Ensure previous registration is cleared (especially when returning from sectional views)
            if (renderingEngine.getViewport(viewportId)) {
                try { renderingEngine.disableElement(viewportId); } catch (e) { }
            }

            // Pre-fetch metadata for technical rendering parameters (pixel representation, transcale, etc.)
            await prefetchMetadata(ids);

            if (!elementRef.current) return;

            const isVolumeOrientation = !isThumbnail && (orientation === 'Coronal' || orientation === 'Sagittal' || orientation === 'Axial');

            const viewportInput: Types.PublicViewportInput = {
                viewportId,
                type: isVolumeOrientation ? ViewportType.ORTHOGRAPHIC : ViewportType.STACK,
                element: elementRef.current,
                defaultOptions: { background: [0, 0, 0] },
            };

            renderingEngine.enableElement(viewportInput);
            renderingEngine.resize(); // Force internal size update
            setIsReady(true);

            // Register tools for the specific viewport
            const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
            if (!isThumbnail) {
                toolGroup?.addViewport(viewportId, renderingEngineId);
            }

            try {
                let initialIndex = 0;
                if (initialImageId) {
                    // Find the index of the initial image in the stack
                    // IDs are constructed with 'electronfile:' prefix, so we check inclusion
                    // We normalize slashes to be safe
                    const normalizedTarget = initialImageId.replace(/\\/g, '/');
                    const index = ids.findIndex(id => id.replace(/\\/g, '/').includes(normalizedTarget));
                    if (index !== -1) {
                        initialIndex = index;
                    }
                }

                if (isVolumeOrientation) {
                    const viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;
                    const volumeId = `volume-${seriesUid}-${viewportId}`;
                    const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: ids });
                    await volume.load();
                    await viewport.setVolumes([{ volumeId }]);
                    const orientationKey = orientation.toUpperCase() as keyof typeof Enums.OrientationAxis;
                    viewport.setOrientation(Enums.OrientationAxis[orientationKey]);
                } else {
                    const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
                    await viewport.setStack(ids, initialIndex);
                }

                // For thumbnails, reveal immediately as they are simpler and don't need "Wait-for-Composition"
                if (isThumbnail) {
                    setIsComposed(true);
                }

                const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;

                // Immediate synchronization on load
                if (!isThumbnail) {
                    try {
                        addViewportToSync(viewportId, renderingEngineId);
                        triggerInitialSync(renderingEngineId, viewportId);
                    } catch (syncErr) {
                        console.warn('Initial synchronization failed:', syncErr);
                    }
                }

                // VOI application will happen inside the timeout below to ensure it's not overridden by resetCamera

                // Force fit to window
                viewport.resetCamera();
                viewport.render();
                // Double-tap resetCamera after a brief delay to ensure DOM layout is settled
                setTimeout(() => {
                    viewport.resetCamera();

                    // Apply VOI: Priority initialWindowWidth/Center (for thumbnail) > Default from image metadata
                    if (isThumbnail && initialWindowCenter !== undefined && initialWindowWidth !== undefined) {
                        viewport.setProperties({ voiRange: { lower: initialWindowCenter - initialWindowWidth / 2, upper: initialWindowCenter + initialWindowWidth / 2 } });
                    } else if (images[initialIndex]) {
                        const imgDoc = images[initialIndex] as any;
                        const normalize = (val: any) => {
                            if (Array.isArray(val)) return Number(val[0]);
                            if (typeof val === 'string' && val.includes('\\')) return Number(val.split('\\')[0]);
                            return Number(val);
                        };
                        const wc = normalize(imgDoc.windowCenter);
                        const ww = normalize(imgDoc.windowWidth);
                        if (!isNaN(wc) && !isNaN(ww)) {
                            viewport.setProperties({ voiRange: { lower: wc - ww / 2, upper: wc + ww / 2 } });
                        }
                    }

                    viewport.render();
                }, 50);

                setStatus('');

                const firstImage = cache.getImage(ids[0]);
                if (firstImage && !isThumbnail) {
                    const subseries = await db.T_Subseries.findOne(seriesUid).exec();
                    const study = subseries ? await db.T_Study.findOne({ selector: { studyInstanceUID: subseries.studyInstanceUID } }).exec() : null;
                    const patient = study ? await db.T_Patient.findOne({ selector: { id: study.patientId } }).exec() : null;

                    // Helper to get robust VOI from current viewport state or defaults
                    const getDisplayVoi = () => {
                        const vp = viewport as Types.IStackViewport | Types.IVolumeViewport;
                        const props = vp.getProperties();
                        if (props.voiRange) {
                            return {
                                windowWidth: props.voiRange.upper - props.voiRange.lower,
                                windowCenter: (props.voiRange.upper + props.voiRange.lower) / 2
                            };
                        }
                        // Fallback: Try to get from image metadata
                        const currentId = (vp as Types.IStackViewport).getCurrentImageId ? (vp as Types.IStackViewport).getCurrentImageId() : ids[0];
                        const voi = currentId ? metaData.get('voiLutModule', currentId) : null;
                        if (voi && voi.windowCenter != null) {
                            return {
                                windowWidth: Number(Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth),
                                windowCenter: Number(Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter)
                            };
                        }
                        return { windowWidth: 1, windowCenter: 0.5 }; // Ultra-fallback
                    };

                    const displayVoi = getDisplayVoi();

                    setMetadata({
                        patientName: patient ? patient.patientName : 'Anonymous',
                        patientID: patient ? patient.patientID : 'Unknown',
                        institutionName: study ? study.institutionName : '',
                        studyDescription: study ? study.studyDescription : '',
                        seriesNumber: subseries ? String(subseries.seriesNumber) : '',
                        seriesDescription: subseries ? subseries.seriesDescription : '',
                        modality: subseries ? subseries.modality : '',
                        instanceNumber: viewport.getCurrentImageIdIndex() + 1,
                        totalInstances: ids.length,
                        windowWidth: displayVoi.windowWidth,
                        windowCenter: displayVoi.windowCenter,
                    });
                } else if (isThumbnail) {
                    // For thumbnails, just update instance number and basic VOI info if possible
                    setMetadata((prev: any) => ({
                        ...prev,
                        instanceNumber: viewport.getCurrentImageIdIndex() + 1,
                        totalInstances: ids.length,
                    }));
                }

                if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
                resizeObserverRef.current = new ResizeObserver(() => {
                    const engine = getRenderingEngine(renderingEngineId);
                    if (engine) {
                        engine.resize();
                        if (autoFit) {
                            const vp = engine.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
                            if (vp) {
                                vp.resetCamera();
                                vp.render();
                            }
                        }
                    }
                });
                if (elementRef.current) resizeObserverRef.current.observe(elementRef.current);

                if (elementRef.current) resizeObserverRef.current.observe(elementRef.current);

                // Start reveal sequence via event
                viewport.render();
                console.log(`Viewport ${viewportId}: Initial render sequence triggered`);

            } catch (err) {
                console.error('Load Error:', err);
                setStatus('Load Failed');
            }
        };

        loadSeries();

        return () => {
            console.log(`Viewport ${viewportId}: cleanup loadSeries (disableElement & ResizeObserver)`);
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
                resizeObserverRef.current = null;
            }
            const engine = getRenderingEngine(renderingEngineId);
            if (engine) {
                try { engine.disableElement(viewportId); } catch (e) { }
            }
        };
    }, [db, seriesUid, viewportId, renderingEngineId, initialImageId, isThumbnail, databasePath, orientation]);

    useEffect(() => {
        if (!isReady || isThumbnail) return;

        const handleImageChange = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;

            const engine = getRenderingEngine(renderingEngineId);
            const viewport = engine?.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
            if (!viewport) return;

            const getDisplayVoi = () => {
                const props = viewport?.getProperties();
                if (props && props.voiRange) {
                    return {
                        windowWidth: props.voiRange.upper - props.voiRange.lower,
                        windowCenter: (props.voiRange.upper + props.voiRange.lower) / 2
                    };
                }
                const currentId = (viewport as Types.IStackViewport).getCurrentImageId ? (viewport as Types.IStackViewport).getCurrentImageId() : null;
                const voi = currentId ? metaData.get('voiLutModule', currentId) : null;
                if (voi && voi.windowCenter != null) {
                    return {
                        windowWidth: Number(Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth),
                        windowCenter: Number(Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter)
                    };
                }
                return { windowWidth: 1, windowCenter: 0.5 };
            };

            const displayVoi = getDisplayVoi();

            setMetadata((prev: any) => {
                if (!mountedRef.current) return prev;
                let currentIdx = 0;
                try {
                    if ((viewport as Types.IStackViewport).getCurrentImageIdIndex) {
                        currentIdx = (viewport as Types.IStackViewport).getCurrentImageIdIndex();
                    }
                } catch (e) { }

                return {
                    ...prev,
                    instanceNumber: currentIdx + 1,
                    windowWidth: displayVoi?.windowWidth ?? 1,
                    windowCenter: displayVoi?.windowCenter ?? 0.5,
                };
            });
        };

        const handleRendered = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;
            if (!mountedRef.current) return;

            // Reveal on first frame, but wait a TINY bit for the browser paint to settle
            if (!isComposed) {
                setTimeout(() => {
                    if (mountedRef.current) {
                        setIsComposed(true);
                        console.log(`Viewport ${viewportId}: Revealed via ${evt.type} + buffer`);
                    }
                }, 150);
            }
            handleImageChange(evt);
        };

        const handleVoiModified = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;
            const engine = getRenderingEngine(renderingEngineId);
            if (!engine?.getViewport(viewportId)) return;
            handleImageChange(evt);
        };

        const element = elementRef.current;
        element?.addEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
        element?.addEventListener(Enums.Events.VOI_MODIFIED, handleVoiModified);

        return () => {
            element?.removeEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
            element?.removeEventListener(Enums.Events.VOI_MODIFIED, handleVoiModified);
        };
    }, [viewportId, renderingEngineId, isThumbnail, isReady, seriesUid, isComposed]);

    const handleSliceChange = (sliceIndex: number) => {
        const engine = getRenderingEngine(renderingEngineId);
        const viewport = engine?.getViewport(viewportId) as Types.IStackViewport;
        if (viewport && viewport.setImageIdIndex) {
            // Convert 1-based UI slice to 0-based Cornerstone index
            viewport.setImageIdIndex(sliceIndex - 1);
            viewport.render();
        }
    };

    // Orientation changes now trigger loadSeries which handles the viewport type switch and orientation automatically.

    return (
        <div className="w-full h-full relative bg-black group overflow-hidden">
            <div
                ref={elementRef}
                className={`w-full h-full transition-opacity duration-300 ${isComposed ? 'opacity-100' : 'opacity-0'}`}
                onContextMenu={(e) => e.preventDefault()}
            />

            {/* Loading Spinner during composition or explicit status */}
            {(!isComposed || status) && seriesUid && (
                <div className="absolute inset-0 flex items-center justify-center bg-black z-30 pointer-events-none">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-4 border-peregrine-accent border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                            {status || 'Composing...'}
                        </span>
                    </div>
                </div>
            )}

            {/* Active Highlight & Label */}
            {isActive && (
                <div className="absolute inset-0 pointer-events-none border border-peregrine-accent z-20 shadow-[inset_0_0_10px_rgba(37,99,235,0.2)]">
                    <div className="absolute top-0 right-0 bg-peregrine-accent text-white text-[8px] font-black px-1.5 py-0.5 uppercase tracking-widest shadow-lg">
                        Active
                    </div>
                </div>
            )}

            {/* Vertical Paging Slider for multi-slice datasets (CT/MRI) */}
            {!isThumbnail && metadata.totalInstances > 1 && (
                <VerticalPagingSlider
                    min={1}
                    max={metadata.totalInstances}
                    value={metadata.instanceNumber || 1}
                    onChange={handleSliceChange}
                />
            )}

            {!isThumbnail && !seriesUid && (
                <div className="absolute inset-0 flex items-center justify-center p-8 text-center pointer-events-none">
                    <div className="flex flex-col items-center gap-4 text-white/20">
                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center">
                            <span className="text-xl">+</span>
                        </div>
                        <p className="text-[11px] font-medium leading-relaxed tracking-wide">
                            表示するシリーズをクリック<br />orドラッグ&ドロップしてください
                        </p>
                    </div>
                </div>
            )}

            {!isThumbnail && showOverlays && seriesUid && isComposed && <OverlayManager metadata={metadata} />}
        </div>
    );
};
