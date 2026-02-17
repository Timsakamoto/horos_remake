import { useEffect, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    getRenderingEngine,
    volumeLoader,
    imageLoader,
    setVolumesForViewports,
    metaData,
    cache,
    eventTarget
} from '@cornerstonejs/core';
import {
    addTool,
    ToolGroupManager,
    StackScrollMouseWheelTool,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    MagnifyTool,
    SynchronizerManager,
    LengthTool,
    AngleTool,
    RectangleROITool,
    EllipticalROITool,
    ProbeTool,
    ArrowAnnotateTool,
    BidirectionalTool,
    CobbAngleTool,
    Enums as csToolsEnums,
    utilities as csToolsUtils,
    CrosshairsTool,
} from '@cornerstonejs/tools';
import { initCornerstone } from './init';
import { useDatabase } from '../Database/DatabaseProvider';
import { useSettings } from '../Settings/SettingsContext';
import { registerElectronImageLoader, prefetchMetadata } from './electronLoader';
import { ProjectionMode } from './mprUtils';
import { ToolMode } from './Toolbar';
import { VerticalPagingSlider } from './VerticalPagingSlider';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define unique IDs
const ORTHO_RENDERING_ENGINE_ID = 'peregrine-engine';
const AXIAL_VIEWPORT_ID = 'axial-viewport';
const SAGITTAL_VIEWPORT_ID = 'sagittal-viewport';
const CORONAL_VIEWPORT_ID = 'coronal-viewport';
const ORTHO_TOOL_GROUP_ID = 'ortho-tool-group';

// Global Load Tracker to prevent double-loading during remounts
const globalLoadTracker = new Map<string, {
    promise: Promise<boolean>;
    isLoaded: boolean;
    maxIndices: { axial: number; sagittal: number; coronal: number };
    firstImageId: string;
}>();

interface Props {
    seriesUid: string;
    activeTool: ToolMode;
    projectionMode?: ProjectionMode;
    slabThickness?: number;
    orientation?: 'MPR' | 'Axial' | 'Coronal' | 'Sagittal';
}

export const OrthoView = ({ seriesUid, activeTool, projectionMode = 'NORMAL', slabThickness = 0, orientation = 'MPR' }: Props) => {
    const elementAxialRef = useRef<HTMLDivElement>(null);
    const elementSagittalRef = useRef<HTMLDivElement>(null);
    const elementCoronalRef = useRef<HTMLDivElement>(null);

    const { db } = useDatabase();
    const { databasePath } = useSettings();
    const [status, setStatus] = useState<string>('');
    const [isVolumeLoaded, setIsVolumeLoaded] = useState(false);
    const [loadProgress, setLoadProgress] = useState<number>(0);
    const [sliceIndices, setSliceIndices] = useState({ axial: 0, sagittal: 0, coronal: 0 });
    const [maxIndices, setMaxIndices] = useState({ axial: 0, sagittal: 0, coronal: 0 });

    const engineRef = useRef<Types.IRenderingEngine | null>(null);
    const firstImageIdRef = useRef<string | null>(null);
    const loadingRef = useRef<boolean>(false);
    const loadCountRef = useRef(0);

    // 1. Initialize Tools
    useEffect(() => {
        [
            StackScrollMouseWheelTool, WindowLevelTool, PanTool, ZoomTool, MagnifyTool,
            LengthTool, AngleTool, RectangleROITool, EllipticalROITool, ProbeTool,
            ArrowAnnotateTool, BidirectionalTool, CobbAngleTool, CrosshairsTool
        ].forEach(tool => {
            try { addTool(tool); } catch (e) { }
        });
        // CrosshairsTool is added ONLY when viewports are ready

        let toolGroup = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);
        if (!toolGroup) toolGroup = ToolGroupManager.createToolGroup(ORTHO_TOOL_GROUP_ID);

        if (toolGroup) {
            [
                StackScrollMouseWheelTool, WindowLevelTool, PanTool, ZoomTool, MagnifyTool,
                LengthTool, AngleTool, RectangleROITool, EllipticalROITool, ProbeTool,
                ArrowAnnotateTool, BidirectionalTool, CobbAngleTool, CrosshairsTool
            ].forEach(tool => {
                if (!toolGroup!.hasTool(tool.toolName)) toolGroup!.addTool(tool.toolName);
            });
            toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
            toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
            toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
            toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });

            toolGroup.setToolPassive(MagnifyTool.toolName);
            // Crosshairs is handled separately in setupViewports
        }

        registerElectronImageLoader();
        console.log('OrthoView: Component Mounted.');

        // Listen for scroll updates to sync sliders
        const onScroll = (e: any) => {
            const { viewportId, sliceIndex } = e.detail;
            if (viewportId === AXIAL_VIEWPORT_ID) setSliceIndices(prev => ({ ...prev, axial: sliceIndex }));
            else if (viewportId === SAGITTAL_VIEWPORT_ID) setSliceIndices(prev => ({ ...prev, sagittal: sliceIndex }));
            else if (viewportId === CORONAL_VIEWPORT_ID) setSliceIndices(prev => ({ ...prev, coronal: sliceIndex }));
        };
        const SCROLL_EVENT = 'VOLUME_VIEWPORT_SCROLL_BAR_UPDATED';
        eventTarget.addEventListener(SCROLL_EVENT, onScroll);

        return () => {
            console.log('OrthoView: Component Unmounting...');
            eventTarget.removeEventListener(SCROLL_EVENT, onScroll);
            const renderingEngine = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID);
            if (renderingEngine) {
                const tg = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);

                [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID].forEach(vpId => {
                    const vp = renderingEngine.getViewport(vpId);
                    if (!vp) return;

                    // 1. Remove from ToolGroup
                    try { if (tg) tg.removeViewports(ORTHO_RENDERING_ENGINE_ID, vpId); } catch (e) { }

                    // 3. Disable Element
                    try { renderingEngine.disableElement(vpId); } catch (e) { }
                });
            }
        };
    }, []);

    // 2. Tool Activation & Crosshairs configuration
    useEffect(() => {
        const toolGroup = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);
        if (!toolGroup) return;

        try {
            // Set ALL tools to passive first for a clean reactive transition
            const allTools = [
                WindowLevelTool.toolName, PanTool.toolName, ZoomTool.toolName, MagnifyTool.toolName,
                LengthTool.toolName, AngleTool.toolName, RectangleROITool.toolName,
                EllipticalROITool.toolName, ProbeTool.toolName, ArrowAnnotateTool.toolName,
                BidirectionalTool.toolName, CobbAngleTool.toolName, CrosshairsTool.toolName
            ];
            allTools.forEach(tn => {
                if (toolGroup.hasTool(tn)) toolGroup.setToolPassive(tn);
            });

            let primary = '';
            if (activeTool === 'Pan') primary = PanTool.toolName;
            else if (activeTool === 'Zoom') primary = ZoomTool.toolName;
            else if (activeTool === 'WindowLevel') primary = WindowLevelTool.toolName;
            else if (activeTool === 'Length') primary = LengthTool.toolName;
            else if (activeTool === 'Angle') primary = AngleTool.toolName;
            else if (activeTool === 'Rectangle') primary = RectangleROITool.toolName;
            else if (activeTool === 'Ellipse') primary = EllipticalROITool.toolName;
            else if (activeTool === 'Probe') primary = ProbeTool.toolName;
            else if (activeTool === 'Arrow') primary = ArrowAnnotateTool.toolName;
            else if (activeTool === 'Bidirectional') primary = BidirectionalTool.toolName;
            else if (activeTool === 'Magnify') primary = MagnifyTool.toolName || 'Magnify';
            else if (activeTool === 'Text') primary = ArrowAnnotateTool.toolName || 'ArrowAnnotate';
            else if (activeTool === 'Crosshairs') primary = CrosshairsTool.toolName;

            if (primary && toolGroup.hasTool(primary)) {
                toolGroup.setToolActive(primary, { bindings: [{ mouseButton: MouseBindings.Primary }] });
            }

            // Secondary and Auxiliary bindings for standard navigation (unless primary is one of them)
            if (primary !== PanTool.toolName) {
                toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
            }
            if (primary !== ZoomTool.toolName) {
                toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
            }
        } catch (e) {
            console.warn('OrthoView: Tool Activation Error:', e);
        }
    }, [activeTool]);

    const handleSliderChange = (viewportId: string, value: number) => {
        const re = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID);
        const vp = re?.getViewport(viewportId) as Types.IVolumeViewport;
        if (vp) {
            const current = vp.getSliceIndex();
            const delta = (value - 1) - current;
            if (delta !== 0) {
                csToolsUtils.scroll(vp, { delta });
            }
        }
    };

    /**
     * Manual Click Synchronization (Alternative to Crosshairs)
     * When user clicks on a viewport, we find the 3D coordinate and 
     * move the other two viewports to intersect at that point.
     */
    const handleClickSync = (e: React.MouseEvent, viewportId: string) => {
        // Only trigger if in MPR mode AND Crosshairs tool is active
        if (activeTool !== 'Crosshairs' || orientation !== 'MPR') return;

        const re = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID);
        const sourceVp = re?.getViewport(viewportId) as Types.IVolumeViewport;
        if (!sourceVp) return;

        const canvasPoint: Types.Point2 = [e.nativeEvent.offsetX, e.nativeEvent.offsetY];
        const worldPoint = sourceVp.canvasToWorld(canvasPoint);
        if (!worldPoint) return;

        console.log(`OrthoView: Click Sync to World: ${worldPoint}`);

        const otherVpIds = [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID].filter(id => id !== viewportId);
        otherVpIds.forEach(id => {
            if (!re) return;
            const targetVp = re.getViewport(id) as Types.IVolumeViewport;
            if (targetVp && targetVp.getCamera && targetVp.setCamera) {
                const camera = targetVp.getCamera();
                if (camera) {
                    targetVp.setCamera({
                        ...camera,
                        focalPoint: [...worldPoint] as Types.Point3
                    });
                    targetVp.render();
                }
            }
        });
    };

    // 3. Volume Loading (Global Tracked)
    useEffect(() => {
        if (!db || !seriesUid) return;

        const volumeId = `cornerstoneStreamingImageVolume:${seriesUid}`;
        const currentLoadId = ++loadCountRef.current;

        const performLoad = async () => {
            // Check global tracker
            const existing = globalLoadTracker.get(seriesUid);
            if (existing) {
                console.log(`OrthoView [${seriesUid}]: Found existing load record.`);
                if (existing.isLoaded) {
                    setMaxIndices(existing.maxIndices);
                    firstImageIdRef.current = existing.firstImageId;
                    setIsVolumeLoaded(true);
                    return;
                }
                setStatus('Loading in progress elsewhere...');
                await existing.promise;
                if (globalLoadTracker.get(seriesUid)?.isLoaded) {
                    const updated = globalLoadTracker.get(seriesUid)!;
                    setMaxIndices(updated.maxIndices);
                    firstImageIdRef.current = updated.firstImageId;
                    setIsVolumeLoaded(true);
                    setStatus('');
                }
                return;
            }

            // Create new load promise
            const loadPromise = (async () => {
                if (loadingRef.current) return false;
                loadingRef.current = true;
                setIsVolumeLoaded(false);

                try {
                    setStatus('Loading Series Metadata...');
                    const images = await (db as any).T_FilePath.find({
                        selector: { seriesInstanceUID: seriesUid },
                        sort: [{ instanceNumber: 'asc' }]
                    }).exec();

                    if (images.length === 0) {
                        setStatus('No images found.');
                        return false;
                    }

                    const imageIds = images.map((img: any) => {
                        let p = img.filePath;
                        if (!(p.startsWith('/') || /^[a-zA-Z]:/.test(p)) && databasePath) {
                            const sep = databasePath.includes('\\') ? '\\' : '/';
                            p = `${databasePath.replace(/[\\/]$/, '')}${sep}${p.replace(/^[\\/]/, '')}`;
                        }
                        return `electronfile:${p}?forVolume=true`;
                    });

                    await initCornerstone();
                    await prefetchMetadata(imageIds);

                    setStatus('Loading Pixels...');
                    const CHUNK_SIZE = 50;
                    let loadedCount = 0;
                    for (let i = 0; i < imageIds.length; i += CHUNK_SIZE) {
                        const chunk = imageIds.slice(i, i + CHUNK_SIZE);
                        console.log(`OrthoView [${seriesUid}]: Loading Chunk ${i}...`);
                        await Promise.all(chunk.map((id: string) => imageLoader.loadAndCacheImage(id)));
                        loadedCount += chunk.length;
                        setLoadProgress(Math.round((loadedCount / imageIds.length) * 100));
                    }

                    setStatus('Building Volume...');
                    if (cache.getVolume(volumeId)) cache.removeVolumeLoadObject(volumeId);

                    // Sort by slice location for correct volume geometry
                    const sorted = [...imageIds].sort((a, b) => (metaData.get('imagePlaneModule', a)?.sliceLocation ?? 0) - (metaData.get('imagePlaneModule', b)?.sliceLocation ?? 0));
                    const vol = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: sorted });
                    vol.load();

                    const dims = vol.dimensions;
                    const indices = { axial: dims[2], sagittal: dims[0], coronal: dims[1] };
                    const firstId = sorted[0];

                    globalLoadTracker.set(seriesUid, {
                        promise: Promise.resolve(true),
                        isLoaded: true,
                        maxIndices: indices,
                        firstImageId: firstId
                    });

                    if (currentLoadId === loadCountRef.current) {
                        setMaxIndices(indices);
                        firstImageIdRef.current = firstId;
                        setIsVolumeLoaded(true);
                        setStatus('');
                    }
                    return true;
                } catch (e) {
                    console.error('Load Error:', e);
                    setStatus('Load Failed');
                    globalLoadTracker.delete(seriesUid);
                    return false;
                } finally {
                    loadingRef.current = false;
                }
            })();

            globalLoadTracker.set(seriesUid, {
                promise: loadPromise,
                isLoaded: false,
                maxIndices: { axial: 0, sagittal: 0, coronal: 0 },
                firstImageId: ''
            });
            await loadPromise;
        };

        performLoad();
    }, [db, seriesUid, databasePath]);

    // 4. Viewport Setup & Rendering (Depends on orientation and isVolumeLoaded)
    useEffect(() => {
        if (!isVolumeLoaded || !seriesUid) return;

        const volumeId = `cornerstoneStreamingImageVolume:${seriesUid}`;
        const re = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID) || new RenderingEngine(ORTHO_RENDERING_ENGINE_ID);
        engineRef.current = re;

        const setupViewports = async () => {
            // ★ STRICT PRE-LOAD CHECK: Ensure volume exists in cache
            const vol = cache.getVolume(volumeId);
            if (!vol) {
                console.error(`OrthoView: Volume ${volumeId} missing from cache despite load success. Retrying...`);
                setIsVolumeLoaded(false);
                return;
            }

            const vps = [];
            const activeIds: string[] = [];

            if (orientation === 'MPR') {
                if (!elementAxialRef.current || !elementSagittalRef.current || !elementCoronalRef.current) return;
                vps.push(
                    { viewportId: AXIAL_VIEWPORT_ID, type: ViewportType.ORTHOGRAPHIC, element: elementAxialRef.current, defaultOptions: { orientation: Enums.OrientationAxis.AXIAL, background: [0, 0, 0] as Types.Point3 } },
                    { viewportId: SAGITTAL_VIEWPORT_ID, type: ViewportType.ORTHOGRAPHIC, element: elementSagittalRef.current, defaultOptions: { orientation: Enums.OrientationAxis.SAGITTAL, background: [0, 0, 0] as Types.Point3 } },
                    { viewportId: CORONAL_VIEWPORT_ID, type: ViewportType.ORTHOGRAPHIC, element: elementCoronalRef.current, defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] as Types.Point3 } }
                );
                activeIds.push(AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID);
            } else {
                const el = orientation === 'Axial' ? elementAxialRef.current : (orientation === 'Sagittal' ? elementSagittalRef.current : elementCoronalRef.current);
                const id = orientation === 'Axial' ? AXIAL_VIEWPORT_ID : (orientation === 'Sagittal' ? SAGITTAL_VIEWPORT_ID : CORONAL_VIEWPORT_ID);
                const axis = orientation === 'Axial' ? Enums.OrientationAxis.AXIAL : (orientation === 'Sagittal' ? Enums.OrientationAxis.SAGITTAL : Enums.OrientationAxis.CORONAL);
                if (el) {
                    vps.push({ viewportId: id, type: ViewportType.ORTHOGRAPHIC, element: el, defaultOptions: { orientation: axis, background: [0, 0, 0] as Types.Point3 } });
                    activeIds.push(id);
                }
            }

            // Sync check: Add viewports to toolgroup and syncer
            const tg = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);

            // Clean up previous viewports if they are not in the current active list
            const prevVpIds = [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID];
            prevVpIds.forEach(id => {
                if (!activeIds.includes(id)) {
                    const vp = re.getViewport(id);
                    if (vp) {
                        // 1. Remove from ToolGroup
                        try { tg?.removeViewports(ORTHO_RENDERING_ENGINE_ID, id); } catch (e) { }

                        // 3. Disable Element
                        try { re.disableElement(id); } catch (e) { }
                    }
                }
            });

            // Enable/Update active viewports
            vps.forEach(v => {
                const ex = re.getViewport(v.viewportId);
                if (!ex || ex.getCanvas()?.parentElement !== v.element) {
                    if (ex) re.disableElement(v.viewportId);
                    re.enableElement(v);
                }
                tg?.addViewport(v.viewportId, ORTHO_RENDERING_ENGINE_ID);
                console.log(`OrthoView: Enabled & Added Viewport: ${v.viewportId}`);
            });

            // Disable VOI sync for ortho views as requested
            // (Removed SynchronizerManager.createSynchronizer logic here)

            await setVolumesForViewports(re, [{ volumeId }], activeIds);

            // Set Initial VOI from first cached image metadata
            const firstId = firstImageIdRef.current;
            const voi = firstId ? metaData.get('voiLutModule', firstId) : null;
            let c = 0, w = 1;
            if (voi && voi.windowCenter != null) {
                c = Number(Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter);
                w = Number(Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth);
            } else {
                // Fallback: If no metadata, default to a wide range
                c = 127; w = 255;
            }

            activeIds.forEach(id => {
                const vp = re.getViewport(id) as Types.IVolumeViewport;
                if (vp) {
                    vp.setProperties({ voiRange: { lower: c - w / 2, upper: c + w / 2 } });
                    if (vp.resetCamera) vp.resetCamera();
                    console.log(`OrthoView [${id}]: Applied VOI: WC=${c}, WW=${w}`);
                    vp.render();
                }
            });

            // Configure Crosshairs Tool
            if (tg && orientation === 'MPR') {
                const crosshairsName = CrosshairsTool.toolName;
                if (!tg.hasTool(crosshairsName)) {
                    tg.addTool(crosshairsName, {
                        viewportScrolled: true,
                        getChildViewports: (viewportId: string) => {
                            return [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID].filter(id => id !== viewportId);
                        },
                        getReferenceLineColor: (viewportId: string) => {
                            if (viewportId === AXIAL_VIEWPORT_ID) return 'rgb(59, 130, 246)'; // blue-500
                            if (viewportId === SAGITTAL_VIEWPORT_ID) return 'rgb(234, 179, 8)'; // yellow-500
                            if (viewportId === CORONAL_VIEWPORT_ID) return 'rgb(34, 197, 94)'; // green-500
                            return 'rgb(255, 255, 255)';
                        },
                        getReferenceLineControllable: () => false, // Disable rotation/oblique
                        getReferenceLineDraggable: () => true, // Allow position sync via dragging center
                        getReferenceLineSlabThicknessControlsOn: () => false, // Disable slab handles
                    });
                }
            }
        };

        setupViewports();

    }, [isVolumeLoaded, orientation, seriesUid]);

    // 5. Update Slab/MIP
    useEffect(() => {
        const re = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID);
        if (!re) return;
        [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID].forEach(id => {
            const vp = re.getViewport(id) as Types.IVolumeViewport;
            if (vp) {
                let bm = Enums.BlendModes.COMPOSITE;
                if (projectionMode === 'MIP') bm = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
                else if (projectionMode === 'MINIP') bm = Enums.BlendModes.MINIMUM_INTENSITY_BLEND;
                vp.setBlendMode(bm);
                vp.setSlabThickness(slabThickness);
            }
        });
        re.render();
    }, [projectionMode, slabThickness]);

    const renderViewports = () => {
        if (orientation === 'MPR') {
            return (
                <div className="grid grid-cols-3 w-full h-full gap-1 p-1 bg-black">
                    <div className="relative border border-blue-500/30 overflow-hidden group cursor-crosshair">
                        <div ref={elementAxialRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} onClick={e => handleClickSync(e, AXIAL_VIEWPORT_ID)} />
                        <div className="absolute top-2 left-2 text-blue-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest pointer-events-none">Axial</div>
                    </div>
                    <div className="relative border border-yellow-500/30 overflow-hidden group cursor-crosshair">
                        <div ref={elementSagittalRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} onClick={e => handleClickSync(e, SAGITTAL_VIEWPORT_ID)} />
                        <div className="absolute top-2 left-2 text-yellow-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest pointer-events-none">Sagittal</div>
                    </div>
                    <div className="relative border border-green-500/30 overflow-hidden group cursor-crosshair">
                        <div ref={elementCoronalRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} onClick={e => handleClickSync(e, CORONAL_VIEWPORT_ID)} />
                        <div className="absolute top-2 left-2 text-green-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest pointer-events-none">Coronal</div>
                    </div>
                </div>
            );
        }
        const color = orientation === 'Axial' ? 'blue' : (orientation === 'Sagittal' ? 'yellow' : 'green');
        const rCurrent = orientation === 'Axial' ? elementAxialRef : (orientation === 'Sagittal' ? elementSagittalRef : elementCoronalRef);
        const vpId = orientation === 'Axial' ? AXIAL_VIEWPORT_ID : (orientation === 'Sagittal' ? SAGITTAL_VIEWPORT_ID : CORONAL_VIEWPORT_ID);
        const key = orientation.toLowerCase() as 'axial' | 'sagittal' | 'coronal';

        return (
            <div className="w-full h-full p-1 bg-black">
                <div className={`relative w-full h-full border border-${color}-500/30 overflow-hidden group`}>
                    <div ref={rCurrent} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                    <div className={`absolute top-2 left-2 text-${color}-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest`}>{orientation}</div>

                    {/* Vertical Paging Slider for Single Orientation Views */}
                    <VerticalPagingSlider
                        min={1}
                        max={maxIndices[key]}
                        value={sliceIndices[key] + 1}
                        onChange={(v) => handleSliderChange(vpId, v)}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full relative bg-black">
            {status && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 text-white pointer-events-none">
                    <div className="w-12 h-12 border-4 border-peregrine-accent border-t-transparent rounded-full animate-spin mb-4" />
                    <div className="text-2xl font-black tracking-widest uppercase mb-1">{status}</div>
                    {loadProgress > 0 && <div className="text-sm opacity-50">{loadProgress}% COMPLETE</div>}
                </div>
            )}
            {!seriesUid && <div className="absolute inset-0 flex items-center justify-center p-8 text-white/20 pointer-events-none z-50">Select a series</div>}
            {renderViewports()}
        </div>
    );
};
