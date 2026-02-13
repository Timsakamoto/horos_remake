import { useEffect, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    getRenderingEngine,
    volumeLoader,
    setVolumesForViewports,
} from '@cornerstonejs/core';
import {
    addTool,
    ToolGroupManager,
    StackScrollMouseWheelTool,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    Enums as csToolsEnums
} from '@cornerstonejs/tools';
import { initCornerstone } from './init';
import { useDatabase } from '../Database/DatabaseProvider';
import { registerElectronImageLoader } from './electronLoader';
import { PROJECTION_MODES, ProjectionMode } from './mprUtils';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define unique IDs
const ORTHO_RENDERING_ENGINE_ID = 'ortho-engine';
const AXIAL_VIEWPORT_ID = 'axial-viewport';
const SAGITTAL_VIEWPORT_ID = 'sagittal-viewport';
const CORONAL_VIEWPORT_ID = 'coronal-viewport';
const ORTHO_TOOL_GROUP_ID = 'ortho-tool-group';

interface Props {
    seriesUid: string;
    projectionMode?: ProjectionMode;
    slabThickness?: number;
}

export const OrthoView = ({ seriesUid, projectionMode = 'NORMAL', slabThickness = 0 }: Props) => {
    const elementAxialRef = useRef<HTMLDivElement>(null);
    const elementSagittalRef = useRef<HTMLDivElement>(null);
    const elementCoronalRef = useRef<HTMLDivElement>(null);

    const { db } = useDatabase();
    const [status, setStatus] = useState<string>('Initializing MPR...');

    // 1. Initialize Tools
    useEffect(() => {
        // Register Tools if not already
        addTool(StackScrollMouseWheelTool);
        addTool(WindowLevelTool);
        addTool(PanTool);
        addTool(ZoomTool);

        // Create ToolGroup for MPR
        // Note: Destroy existing if switching back and forth? 
        // ToolGroupManager.destroyToolGroup(ORTHO_TOOL_GROUP_ID); 
        let toolGroup = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);
        if (!toolGroup) {
            toolGroup = ToolGroupManager.createToolGroup(ORTHO_TOOL_GROUP_ID);
        }

        if (toolGroup) {
            toolGroup.addTool(StackScrollMouseWheelTool.toolName);
            toolGroup.addTool(WindowLevelTool.toolName);
            toolGroup.addTool(PanTool.toolName);
            toolGroup.addTool(ZoomTool.toolName);

            toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
            toolGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
            toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
            toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
        }

        registerElectronImageLoader();
    }, []);

    // 2. Load Volume & Render
    useEffect(() => {
        if (!db || !seriesUid) return;

        const loadVolume = async () => {
            setStatus('Loading Series Metadata...');

            const images = await db.images.find({
                selector: { seriesInstanceUID: seriesUid },
                sort: [{ instanceNumber: 'asc' }]
            }).exec();

            if (images.length === 0) {
                setStatus('No images found.');
                return;
            }

            const imageIds = images.map(img => `electronfile:${img.filePath}`);
            const volumeId = `cornerstoneStreamingImageVolume:${seriesUid}`; // Use streaming loader but we trick it with local files?
            // Actually, for local files, we might be able to use createAndCacheVolumeFromImages
            // IF the image loader supports metadata properly.
            // Since we are using wadouri, it should parse metadata on load.

            setStatus('Creating Volume...');
            await initCornerstone();

            if (!elementAxialRef.current || !elementSagittalRef.current || !elementCoronalRef.current) return;

            const renderingEngine = new RenderingEngine(ORTHO_RENDERING_ENGINE_ID);

            const viewportInput = [
                {
                    viewportId: AXIAL_VIEWPORT_ID,
                    type: ViewportType.ORTHOGRAPHIC,
                    element: elementAxialRef.current,
                    defaultOptions: {
                        orientation: Enums.OrientationAxis.AXIAL,
                        background: [0, 0, 0] as Types.Point3
                    },
                },
                {
                    viewportId: SAGITTAL_VIEWPORT_ID,
                    type: ViewportType.ORTHOGRAPHIC,
                    element: elementSagittalRef.current,
                    defaultOptions: {
                        orientation: Enums.OrientationAxis.SAGITTAL,
                        background: [0, 0, 0] as Types.Point3
                    },
                },
                {
                    viewportId: CORONAL_VIEWPORT_ID,
                    type: ViewportType.ORTHOGRAPHIC,
                    element: elementCoronalRef.current,
                    defaultOptions: {
                        orientation: Enums.OrientationAxis.CORONAL,
                        background: [0, 0, 0] as Types.Point3
                    },
                },
            ];

            renderingEngine.setViewports(viewportInput);

            // Add viewports to ToolGroup
            const toolGroup = ToolGroupManager.getToolGroup(ORTHO_TOOL_GROUP_ID);
            toolGroup?.addViewport(AXIAL_VIEWPORT_ID, ORTHO_RENDERING_ENGINE_ID);
            toolGroup?.addViewport(SAGITTAL_VIEWPORT_ID, ORTHO_RENDERING_ENGINE_ID);
            toolGroup?.addViewport(CORONAL_VIEWPORT_ID, ORTHO_RENDERING_ENGINE_ID);

            try {
                // Determine if volume already exists
                // const existingVolume = cache.getVolume(volumeId);

                // We use createAndCacheVolumeFromImages which loads images individually and stitches them.
                // This is safer for our local file loader than streaming volume loader which expects WADO-RS web worker.
                const volume = await volumeLoader.createAndCacheVolume(volumeId, {
                    imageIds,
                });

                setStatus('Loading Volume Data...');

                // Load the volume
                // Note: This relies on the imageLoader being able to partial-load or load-all.
                volume.load();

                // Set the volume on the viewports
                await setVolumesForViewports(
                    renderingEngine,
                    [{ volumeId }],
                    [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID]
                );

                renderingEngine.render();
                setStatus('');

            } catch (error) {
                console.error("Failed to load volume:", error);
                setStatus('Failed to load volume. ' + (error as any).message);
            }
        };

        loadVolume();

        return () => {
            const renderingEngine = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID);
            if (renderingEngine) {
                // Cleanup viewports
                // renderingEngine.destroy();
            }
        };
    }, [db, seriesUid]);

    // 3. Update Viewport Properties (MIP/MinIP/Slab)
    useEffect(() => {
        const updateViewports = async () => {
            const renderingEngine = getRenderingEngine(ORTHO_RENDERING_ENGINE_ID);
            if (!renderingEngine) return;

            const viewportIds = [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID];
            const blendMode = PROJECTION_MODES[projectionMode];

            viewportIds.forEach(viewportId => {
                const viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;
                if (viewport) {
                    viewport.setProperties({ blendMode });
                    viewport.setSlabThickness(slabThickness);
                }
            });

            renderingEngine.render();
        };

        updateViewports();
    }, [projectionMode, slabThickness]);

    return (
        <div className="w-full h-full relative bg-black flex flex-wrap">
            {status && (
                <div className="absolute top-4 left-4 z-50 text-white bg-black/50 px-2 py-1 rounded text-sm pointer-events-none">
                    {status}
                </div>
            )}

            {/* 3 Pane Layout: Coronal (TL), Sagittal (TR), Axial (Bottom) or customized */}
            {/* Let's do 1x3 or 2x2. Horos usually does 2x2 (Axial, Coronal, Sagittal, 3D) */}
            {/* For now, just 3 panes equal width */}

            <div className="w-1/3 h-full border-r border-gray-800 relative">
                <div className="absolute top-1 left-1 text-xs text-blue-500 font-bold z-10">Axial</div>
                <div ref={elementAxialRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
            </div>
            <div className="w-1/3 h-full border-r border-gray-800 relative">
                <div className="absolute top-1 left-1 text-xs text-yellow-500 font-bold z-10">Sagittal</div>
                <div ref={elementSagittalRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
            </div>
            <div className="w-1/3 h-full relative">
                <div className="absolute top-1 left-1 text-xs text-green-500 font-bold z-10">Coronal</div>
                <div ref={elementCoronalRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
            </div>
        </div>
    );
};
