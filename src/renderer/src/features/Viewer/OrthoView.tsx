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
    SynchronizerManager,
    Enums as csToolsEnums,
} from '@cornerstonejs/tools';
import { initCornerstone } from './init';
import { useDatabase } from '../Database/DatabaseProvider';
import { useSettings } from '../Settings/SettingsContext';
import { registerElectronImageLoader, prefetchMetadata } from './electronLoader';
import { ProjectionMode } from './mprUtils';
import { ToolMode } from './Toolbar';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define unique IDs
const ORTHO_RENDERING_ENGINE_ID = 'horos-engine';
const AXIAL_VIEWPORT_ID = 'axial-viewport';
const SAGITTAL_VIEWPORT_ID = 'sagittal-viewport';
const CORONAL_VIEWPORT_ID = 'coronal-viewport';
const ORTHO_TOOL_GROUP_ID = 'ortho-tool-group';
const ORTHO_VOI_SYNC_ID = 'ortho-voi-sync';

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
    const [, setLoadProgress] = useState<number>(0);

    const engineRef = useRef<Types.IRenderingEngine | null>(null);
    const volumeIdRef = useRef<string | null>(null);
    const loadingRef = useRef<boolean>(false);
    const loadCountRef = useRef(0);

    // 1. Initialize Tools
    useEffect(() => {
        [StackScrollMouseWheelTool, WindowLevelTool, PanTool, ZoomTool].forEach(tool => {
            try { addTool(tool); } catch (e) { }
        });

        let toolGroup = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);
        if (!toolGroup) toolGroup = ToolGroupManager.createToolGroup(ORTHO_TOOL_GROUP_ID);

        if (toolGroup) {
            [StackScrollMouseWheelTool, WindowLevelTool, PanTool, ZoomTool].forEach(tool => {
                if (!toolGroup!.hasTool(tool.toolName)) toolGroup!.addTool(tool.toolName);
            });
            toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
            toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
            toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
            toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
        }

        registerElectronImageLoader();

        return () => {
            const renderingEngine = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID);
            if (renderingEngine) {
                [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID].forEach(vpId => {
                    if (renderingEngine.getViewport(vpId)) {
                        try { renderingEngine.disableElement(vpId); } catch (e) { }
                    }
                });
            }
        };
    }, []);

    // 2. Tool Activation
    useEffect(() => {
        const toolGroup = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);
        if (!toolGroup) return;

        toolGroup.setToolPassive(WindowLevelTool.toolName);
        toolGroup.setToolPassive(PanTool.toolName);
        toolGroup.setToolPassive(ZoomTool.toolName);

        const primary = activeTool === 'Pan' ? PanTool.toolName : (activeTool === 'Zoom' ? ZoomTool.toolName : WindowLevelTool.toolName);
        toolGroup.setToolActive(primary, { bindings: [{ mouseButton: MouseBindings.Primary }] });

        if (primary !== PanTool.toolName) toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
        if (primary !== ZoomTool.toolName) toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
    }, [activeTool]);

    // 3. Load Volume & Render (Pre-load Architecture)
    useEffect(() => {
        if (!db || !seriesUid) return;
        if (volumeIdRef.current === seriesUid && isVolumeLoaded) return;

        const volumeId = `cornerstoneStreamingImageVolume:${seriesUid}`;
        volumeIdRef.current = seriesUid;
        const currentLoadId = ++loadCountRef.current;

        const loadVolume = async () => {
            if (loadingRef.current) return;
            loadingRef.current = true;

            try {
                setStatus('Loading Series Metadata...');
                setLoadProgress(0);

                const images = await (db as any).T_FilePath.find({
                    selector: { seriesInstanceUID: seriesUid },
                    sort: [{ instanceNumber: 'asc' }]
                }).exec();

                if (images.length === 0) {
                    setStatus('No images found.');
                    return;
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

                // --- ★ Step A: Pre-load all slices into cache (User Suggestion) ---
                setStatus('Loading Pixels...');
                const CHUNK_SIZE = 15;
                let loadedCount = 0;
                for (let i = 0; i < imageIds.length; i += CHUNK_SIZE) {
                    const chunk = imageIds.slice(i, i + CHUNK_SIZE);
                    await Promise.all(chunk.map(id => imageLoader.loadAndCacheImage(id)));
                    loadedCount += chunk.length;
                    const progress = Math.round((loadedCount / imageIds.length) * 100);
                    setLoadProgress(progress);
                    if (currentLoadId === loadCountRef.current) {
                        setStatus(`Processing: ${progress}% (${loadedCount}/${imageIds.length})`);
                    }
                }

                // --- Step B: Build Volume from cached pixels ---
                setStatus('Building 3D Volume...');
                let re = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID) || new RenderingEngine(ORTHO_RENDERING_ENGINE_ID);
                engineRef.current = re;

                const vps = [];
                const activeIds = [];

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

                vps.forEach(v => {
                    const ex = re.getViewport(v.viewportId);
                    if (!ex || ex.getCanvas()?.parentElement !== v.element) {
                        if (ex) re.disableElement(v.viewportId);
                        re.enableElement(v);
                    }
                });

                const tg = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);
                activeIds.forEach(id => tg?.addViewport(id, ORTHO_RENDERING_ENGINE_ID));

                let sync = SynchronizerManager.getSynchronizer(ORTHO_VOI_SYNC_ID) || SynchronizerManager.createSynchronizer(ORTHO_VOI_SYNC_ID, Enums.Events.VOI_MODIFIED, (_s, sV, tV) => {
                    const sViewport = re.getViewport(sV.viewportId) as Types.IVolumeViewport;
                    const tViewport = re.getViewport(tV.viewportId) as Types.IVolumeViewport;
                    if (!sViewport || !tViewport || !sViewport.getProperties) return;
                    const p = sViewport.getProperties();
                    if (p.voiRange) {
                        tViewport.setProperties({ voiRange: p.voiRange });
                        tViewport.render();
                    }
                });
                activeIds.forEach(id => sync.add({ viewportId: id, renderingEngineId: ORTHO_RENDERING_ENGINE_ID }));

                if (cache.getVolume(volumeId)) {
                    cache.removeVolumeLoadObject(volumeId);
                }

                const sorted = [...imageIds].sort((a, b) => (metaData.get('imagePlaneModule', a)?.sliceLocation ?? 0) - (metaData.get('imagePlaneModule', b)?.sliceLocation ?? 0));

                const vol = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: sorted });

                const onImg = (e: any) => {
                    if (e.detail.volumeId === volumeId) {
                        const status = vol.loadStatus;
                        if (!status) return;
                        const p = Math.round((status.framesLoaded / status.numFrames) * 100);
                        if (currentLoadId === loadCountRef.current) {
                            setStatus(`Finalizing: ${p}%`);
                        }
                    }
                };
                eventTarget.addEventListener(Enums.Events.IMAGE_LOADED, onImg);

                vol.load();

                await setVolumesForViewports(re, [{ volumeId }], activeIds);

                const voi = metaData.get('voiLutModule', imageIds[0]);
                let c = 40, w = 400;
                if (voi && voi.windowCenter != null) {
                    c = Number(Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter);
                    w = Number(Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth);
                }

                activeIds.forEach(id => {
                    const vp = re.getViewport(id) as Types.IVolumeViewport;
                    if (vp) {
                        vp.setProperties({ voiRange: { lower: c - w / 2, upper: c + w / 2 } });
                        if (vp.resetCamera) vp.resetCamera();
                        vp.render();
                    }
                });
                re.render();

                setStatus('');
                setIsVolumeLoaded(true);

                // --- Step C: Diagnostic (Should be 1.0 immediately) ---
                setTimeout(() => {
                    const sData = vol.getScalarData();
                    if (!sData) return;
                    let nonZero = 0;
                    for (let i = 0; i < sData.length; i += 100) if (sData[i] !== 0) nonZero++;
                    const ratio = nonZero / (sData.length / 100);
                    console.log(`[OrthoView] Diagnostic (Pre-load Phase): NonZeroRatio=${ratio.toFixed(4)}`);
                }, 2000);

                return () => eventTarget.removeEventListener(Enums.Events.IMAGE_LOADED, onImg);
            } catch (e) {
                console.error(e);
                if (currentLoadId === loadCountRef.current) { setStatus('Load Failed'); setIsVolumeLoaded(false); }
            } finally {
                if (currentLoadId === loadCountRef.current) loadingRef.current = false;
            }
        };
        loadVolume();
    }, [db, seriesUid, databasePath, orientation]);

    // 4. Update Slab/MIP
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
                    <div className="relative border border-blue-500/30 overflow-hidden group">
                        <div ref={elementAxialRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                        <div className="absolute top-2 left-2 text-blue-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Axial</div>
                    </div>
                    <div className="relative border border-yellow-500/30 overflow-hidden group">
                        <div ref={elementSagittalRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                        <div className="absolute top-2 left-2 text-yellow-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Sagittal</div>
                    </div>
                    <div className="relative border border-green-500/30 overflow-hidden group">
                        <div ref={elementCoronalRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                        <div className="absolute top-2 left-2 text-green-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Coronal</div>
                    </div>
                </div>
            );
        }
        const color = orientation === 'Axial' ? 'blue' : (orientation === 'Sagittal' ? 'yellow' : 'green');
        const rCurrent = orientation === 'Axial' ? elementAxialRef : (orientation === 'Sagittal' ? elementSagittalRef : elementCoronalRef);
        return (
            <div className="w-full h-full p-1 bg-black">
                <div className={`relative w-full h-full border border-${color}-500/30 overflow-hidden group`}>
                    <div ref={rCurrent} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                    <div className={`absolute top-2 left-2 text-${color}-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest`}>{orientation}</div>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full relative bg-black">
            {status && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 text-white pointer-events-none">
                    <div className="w-12 h-12 border-4 border-horos-accent border-t-transparent rounded-full animate-spin mb-4" />
                    <div className="text-lg font-bold tracking-widest animate-pulse uppercase">{status}</div>
                </div>
            )}
            {!seriesUid && <div className="absolute inset-0 flex items-center justify-center p-8 text-white/20 pointer-events-none z-50">Select a series</div>}
            {renderViewports()}
        </div>
    );
};
