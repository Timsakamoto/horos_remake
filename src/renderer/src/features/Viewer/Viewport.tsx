import { useEffect, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    getRenderingEngine,
    cache,
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
    autoFit = false
}: Props) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const { db } = useDatabase();
    const { databasePath } = useSettings();
    const [status, setStatus] = useState<string>('');
    const [metadata, setMetadata] = useState<any>({});
    const [isReady, setIsReady] = useState(false);

    // 1. Initialize Tools & Loader
    useEffect(() => {
        let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) {
            toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
        }

        const allTools = [
            'WindowLevel', 'Pan', 'Zoom', 'StackScroll', 'StackScrollMouseWheel',
            'Length', 'EllipticalROI', 'RectangleROI', 'Probe', 'Angle',
            'ArrowAnnotate', 'CobbAngle', 'Bidirectional', 'Magnify'
        ];

        allTools.forEach(toolName => {
            if (toolGroup && !toolGroup.hasTool(toolName)) {
                toolGroup.addTool(toolName);
            }
        });
    }, []);

    // 2. Handle Tool Switching
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

    // 3. Handle CLUT Changes
    useEffect(() => {
        if (!isReady) return;
        const engine = getRenderingEngine(renderingEngineId);
        if (!engine) return;

        const viewport = engine.getViewport(viewportId) as Types.IStackViewport;
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

    // 6. Load Images
    useEffect(() => {
        if (!db || !seriesUid) return;

        let resizeObserver: ResizeObserver | null = null;

        const loadSeries = async () => {
            if (!elementRef.current) return;
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

            // Pre-fetch metadata for technical rendering parameters (pixel representation, transcale, etc.)
            await prefetchMetadata(ids);

            if (!elementRef.current) return;

            const viewportInput: Types.PublicViewportInput = {
                viewportId,
                type: ViewportType.STACK,
                element: elementRef.current,
                defaultOptions: { background: [0, 0, 0] },
            };

            renderingEngine.enableElement(viewportInput);
            setIsReady(true);
            const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;

            if (!isThumbnail) {
                const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
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

                await viewport.setStack(ids, initialIndex);

                // Immediate synchronization on load
                if (!isThumbnail) {
                    try {
                        triggerInitialSync(renderingEngineId, viewportId);
                    } catch (syncErr) {
                        console.warn('Initial synchronization failed:', syncErr);
                    }
                }

                // Apply initial WW/WL from DICOM header (stored in database)
                // Prioritize the actual loaded image's metadata for VOI (Window/Level)
                const currentId = ids[initialIndex];
                const cachedImage = cache.getImage(currentId);

                if (cachedImage && 'windowCenter' in cachedImage && 'windowWidth' in cachedImage) {
                    // @ts-ignore
                    const wc = cachedImage.windowCenter;
                    // @ts-ignore
                    const ww = cachedImage.windowWidth;

                    if (typeof wc === 'number' && typeof ww === 'number') {
                        viewport.setProperties({
                            voiRange: {
                                lower: wc - ww / 2,
                                upper: wc + ww / 2,
                            }
                        });
                    }
                } else if (images[initialIndex]) {
                    // Fallback to database if image in cache doesn't have WW/WL
                    const imgDoc = images[initialIndex] as any;

                    const normalizeLutValue = (val: any): number => {
                        if (Array.isArray(val)) return Number(val[0]);
                        if (typeof val === 'string' && val.includes('\\')) return Number(val.split('\\')[0]);
                        return Number(val);
                    };

                    const wc = normalizeLutValue(imgDoc.windowCenter);
                    const ww = normalizeLutValue(imgDoc.windowWidth);

                    if (!isNaN(wc) && !isNaN(ww)) {
                        viewport.setProperties({
                            voiRange: {
                                lower: wc - ww / 2,
                                upper: wc + ww / 2,
                            }
                        });
                    }
                }

                viewport.resetCamera();
                viewport.render();
                setStatus('');

                const firstImage = cache.getImage(ids[0]);
                if (firstImage) {
                    const subseries = await db.T_Subseries.findOne(seriesUid).exec();
                    const study = subseries ? await db.T_Study.findOne({ selector: { studyInstanceUID: subseries.studyInstanceUID } }).exec() : null;
                    const patient = study ? await db.T_Patient.findOne({ selector: { id: study.patientId } }).exec() : null;

                    // Update metadata using database records (pre-decoded) to avoid mojibake
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
                        windowWidth: viewport.getProperties().voiRange ? (viewport.getProperties().voiRange!.upper - viewport.getProperties().voiRange!.lower) : 400,
                        windowCenter: viewport.getProperties().voiRange ? (viewport.getProperties().voiRange!.upper + viewport.getProperties().voiRange!.lower) / 2 : 40,
                    });
                }

                resizeObserver = new ResizeObserver(() => {
                    const engine = getRenderingEngine(renderingEngineId);
                    if (engine) {
                        engine.resize();
                        if (autoFit) {
                            const vp = engine.getViewport(viewportId) as Types.IStackViewport;
                            if (vp) {
                                vp.resetCamera();
                                vp.render();
                            }
                        }
                    }
                });
                resizeObserver.observe(elementRef.current);

            } catch (err) {
                console.error('Load Error:', err);
                setStatus('Load Failed');
            } finally {
                // Ensure status is cleared if we reached here without error but forgot to set it
                // setStatus(''); // Wait, don't clear if it failed.
            }
        };

        loadSeries();

        return () => {
            if (resizeObserver) resizeObserver.disconnect();
            const engine = getRenderingEngine(renderingEngineId);
            if (engine && engine.getViewport(viewportId)) {
                engine.disableElement(viewportId);
            }
        };
    }, [db, seriesUid, viewportId, renderingEngineId, isThumbnail, databasePath]);

    useEffect(() => {
        if (!isReady || isThumbnail) return;

        const handleImageChange = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;
            const engine = getRenderingEngine(renderingEngineId);
            const viewport = engine?.getViewport(viewportId) as Types.IStackViewport;
            if (!viewport) return;

            setMetadata((prev: any) => ({
                ...prev,
                instanceNumber: viewport.getCurrentImageIdIndex() + 1,
                windowWidth: viewport.getProperties().voiRange ? viewport.getProperties().voiRange!.upper - viewport.getProperties().voiRange!.lower : 400,
                windowCenter: viewport.getProperties().voiRange ? (viewport.getProperties().voiRange!.upper + viewport.getProperties().voiRange!.lower) / 2 : 40,
            }));
        };

        const element = elementRef.current;
        element?.addEventListener(Enums.Events.STACK_NEW_IMAGE, handleImageChange);
        element?.addEventListener(Enums.Events.VOI_MODIFIED, handleImageChange);

        return () => {
            element?.removeEventListener(Enums.Events.STACK_NEW_IMAGE, handleImageChange);
            element?.removeEventListener(Enums.Events.VOI_MODIFIED, handleImageChange);
        };
    }, [viewportId, renderingEngineId, isThumbnail, isReady]);

    const handleSliceChange = (sliceIndex: number) => {
        const engine = getRenderingEngine(renderingEngineId);
        const viewport = engine?.getViewport(viewportId) as Types.IStackViewport;
        if (viewport) {
            // Convert 1-based UI slice to 0-based Cornerstone index
            viewport.setImageIdIndex(sliceIndex - 1);
            viewport.render();
        }
    };

    return (
        <div className="w-full h-full relative bg-black group overflow-hidden">
            <div ref={elementRef} className="w-full h-full" onContextMenu={(e) => e.preventDefault()} />

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

            {!isThumbnail && showOverlays && seriesUid && <OverlayManager metadata={metadata} />}
            {status && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-peregrine-accent border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{status}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
