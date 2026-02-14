import { useEffect, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    getRenderingEngine,
    cache,
} from '@cornerstonejs/core';
import { ToolGroupManager, Enums as csToolsEnums } from '@cornerstonejs/tools';
import { useDatabase } from '../Database/DatabaseProvider';
import { OverlayManager } from './OverlayManager';
import { CLUT_PRESETS } from './CLUTPresets';
import { addViewportToSync, removeViewportFromSync } from './SyncManager';
import { startCine, stopCine } from './CinePlayer';
import { type ToolMode } from './Toolbar';
import { VerticalPagingSlider } from './VerticalPagingSlider';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

interface Props {
    viewportId: string;
    renderingEngineId: string;
    seriesUid: string | null;
    isThumbnail?: boolean;
    activeTool?: ToolMode;
    activeCLUT?: string;
    isSynced?: boolean;
    isCinePlaying?: boolean;
    showOverlays?: boolean;
}

const TOOL_GROUP_ID = 'main-tool-group';

export const Viewport = ({
    viewportId,
    renderingEngineId,
    seriesUid,
    isThumbnail = false,
    activeTool = 'WindowLevel',
    activeCLUT = 'Default',
    isSynced = false,
    isCinePlaying = false,
    showOverlays = true
}: Props) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const { db } = useDatabase();
    const [status, setStatus] = useState<string>(isThumbnail ? '' : 'Initializing...');
    const [metadata, setMetadata] = useState<any>({});

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

        let csToolName: string = activeTool;
        if (activeTool === 'Length') csToolName = 'Length';
        else if (activeTool === 'Rectangle') csToolName = 'RectangleROI';
        else if (activeTool === 'Ellipse') csToolName = 'EllipticalROI';
        else if (activeTool === 'Arrow') csToolName = 'ArrowAnnotate';
        else if (activeTool === 'Probe') csToolName = 'Probe';
        else if (activeTool === 'Angle') csToolName = 'Angle';
        else if (activeTool === 'Bidirectional') csToolName = 'Bidirectional';
        else if (activeTool === 'Magnify') csToolName = 'Magnify';

        if (toolGroup.hasTool(csToolName)) {
            toolGroup.setToolActive(csToolName, {
                bindings: [{ mouseButton: MouseBindings.Primary }]
            });
        }

        toolGroup.setToolActive('Pan', {
            bindings: [{ mouseButton: MouseBindings.Secondary }]
        });

        toolGroup.setToolActive('Zoom', {
            bindings: [{ mouseButton: MouseBindings.Auxiliary }]
        });

    }, [activeTool, isThumbnail]);

    // 3. Handle CLUT Changes
    useEffect(() => {
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
    }, [activeCLUT, viewportId, renderingEngineId]);

    // 4. Handle Sync
    useEffect(() => {
        if (isSynced && !isThumbnail) {
            addViewportToSync(viewportId, renderingEngineId);
        } else {
            removeViewportFromSync(viewportId, renderingEngineId);
        }
    }, [isSynced, viewportId, renderingEngineId, isThumbnail]);

    // 5. Handle Cine
    useEffect(() => {
        if (isCinePlaying && !isThumbnail) {
            startCine(viewportId, renderingEngineId);
        } else {
            stopCine(viewportId);
        }
    }, [isCinePlaying, viewportId, renderingEngineId, isThumbnail]);

    // 6. Load Images
    useEffect(() => {
        if (!db || !seriesUid) return;

        let resizeObserver: ResizeObserver | null = null;

        const loadSeries = async () => {
            if (!elementRef.current) return;
            setStatus('Loading Series...');

            const images = await db.T_FilePath.find({
                selector: { seriesInstanceUID: seriesUid },
                sort: [{ instanceNumber: 'asc' }]
            }).exec();

            console.log(`Viewport [${viewportId}]: Found ${images.length} images for series ${seriesUid}`);

            if (images.length === 0) {
                setStatus('No images.');
                return;
            }

            const ids: string[] = [];
            images.forEach((img: any) => {
                if (img.numberOfFrames > 1) {
                    for (let i = 0; i < img.numberOfFrames; i++) {
                        ids.push(`electronfile:${img.filePath}?frame=${i}`);
                    }
                } else {
                    ids.push(`electronfile:${img.filePath}`);
                }
            });

            console.log(`Viewport [${viewportId}]: Loading stack with ${ids.length} IDs. First ID: ${ids[0]}`);

            let renderingEngine = getRenderingEngine(renderingEngineId);
            if (!renderingEngine) {
                renderingEngine = new RenderingEngine(renderingEngineId);
            }

            const viewportInput: Types.PublicViewportInput = {
                viewportId,
                type: ViewportType.STACK,
                element: elementRef.current,
                defaultOptions: { background: [0, 0, 0] },
            };

            renderingEngine.enableElement(viewportInput);
            const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;

            if (!isThumbnail) {
                const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
                toolGroup?.addViewport(viewportId, renderingEngineId);
            }

            try {
                await viewport.setStack(ids);
                console.log(`Viewport [${viewportId}]: setStack complete`);

                // Apply initial WW/WL from DICOM header (stored in database)
                if (images[0]) {
                    const imgDoc = images[0] as any;
                    // Ensure values are numbers
                    const wc = Number(imgDoc.windowCenter);
                    const ww = Number(imgDoc.windowWidth);

                    if (!isNaN(wc) && !isNaN(ww)) {
                        viewport.setProperties({
                            voiRange: {
                                lower: wc - ww / 2,
                                upper: wc + ww / 2,
                            }
                        });
                    } else {
                        // Fallback logic if tags are missing/invalid
                        // For CT, maybe default to soft tissue?
                        // Or just let Cornerstone calculate from min/max pixel?
                        // If users say it's "too white", usually it means it's showing full dynamic range of a CT (including air and bone) which makes soft tissue look white/flat.
                        // We should try to guess based on modality if possible, otherwise rely on cornerstone.
                        // But wait, the user's report is that it IS weird. So probably the tags are missing or ignored.
                    }
                }

                viewport.render();
                setStatus('');

                const firstImage = cache.getImage(ids[0]);
                if (firstImage) {
                    const ds = (firstImage as any).data;
                    const s = await db.T_Subseries.findOne(seriesUid).exec();

                    // Update metadata
                    setMetadata({
                        patientName: String(ds?.string?.('x00100010') || ''),
                        patientID: String(ds?.string?.('x00100020') || ''),
                        institutionName: String(ds?.string?.('x00080080') || ''),
                        studyDescription: String(ds?.string?.('x00081030') || ''),
                        seriesNumber: s ? String(s.seriesNumber) : '',
                        seriesDescription: String(ds?.string?.('x0008103e') || ''),
                        modality: String(ds?.string?.('x00080060') || ''),
                        instanceNumber: viewport.getCurrentImageIdIndex() + 1,
                        totalInstances: ids.length,
                        windowWidth: viewport.getProperties().voiRange ? (viewport.getProperties().voiRange!.upper - viewport.getProperties().voiRange!.lower) : 400,
                        windowCenter: viewport.getProperties().voiRange ? (viewport.getProperties().voiRange!.upper + viewport.getProperties().voiRange!.lower) / 2 : 40,
                    });
                }

                resizeObserver = new ResizeObserver(() => {
                    const engine = getRenderingEngine(renderingEngineId);
                    if (engine) engine.resize();
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
            if (engine) engine.disableElement(viewportId);
        };
    }, [db, seriesUid, viewportId, renderingEngineId, isThumbnail]);

    useEffect(() => {
        if (isThumbnail) return;

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
    }, [viewportId, renderingEngineId, isThumbnail]);

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

            {/* Vertical Paging Slider for multi-slice datasets (CT/MRI) */}
            {!isThumbnail && metadata.totalInstances > 1 && (
                <VerticalPagingSlider
                    min={1}
                    max={metadata.totalInstances}
                    value={metadata.instanceNumber || 1}
                    onChange={handleSliceChange}
                />
            )}

            {!isThumbnail && showOverlays && <OverlayManager metadata={metadata} />}
            {status && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-horos-accent border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{status}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
