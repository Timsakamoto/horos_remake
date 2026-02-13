import { useEffect, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    getRenderingEngine,
    utilities
} from '@cornerstonejs/core';
import {
    addTool,
    ToolGroupManager,
    StackScrollMouseWheelTool,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    LengthTool,
    EllipticalROITool,
    ProbeTool,
    Enums as csToolsEnums
} from '@cornerstonejs/tools';
import { initCornerstone } from './init';
import { useDatabase } from '../Database/DatabaseProvider';
import { registerElectronImageLoader } from './electronLoader';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

import { ToolMode } from './Toolbar';

interface Props {
    viewportId: string;
    renderingEngineId: string;
    seriesUid: string | null;
    activeTool?: ToolMode;
}

const TOOL_GROUP_ID = 'main-tool-group';

export const Viewport = ({ viewportId, renderingEngineId, seriesUid, activeTool = 'WindowLevel' }: Props) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const runningRef = useRef(false);
    const { db } = useDatabase();
    const [status, setStatus] = useState<string>('Initializing...');

    // 1. Initialize Tools
    useEffect(() => {
        // Register Tools
        addTool(StackScrollMouseWheelTool);
        addTool(WindowLevelTool);
        addTool(PanTool);
        addTool(ZoomTool);
        addTool(LengthTool);
        addTool(EllipticalROITool);
        addTool(ProbeTool);

        // Create ToolGroup
        // Check if exists first to avoid error
        let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) {
            toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
        }

        if (toolGroup) {
            toolGroup.addTool(StackScrollMouseWheelTool.toolName);
            toolGroup.addTool(WindowLevelTool.toolName);
            toolGroup.addTool(PanTool.toolName);
            toolGroup.addTool(ZoomTool.toolName);
            toolGroup.addTool(LengthTool.toolName);
            toolGroup.addTool(EllipticalROITool.toolName);
            toolGroup.addTool(ProbeTool.toolName);

            // Set Initial Active Tools
            toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
            // We set the active tool in the next useEffect based on prop
        }

        // Register Loader
        registerElectronImageLoader();
    }, []);

    // 2. Handle Active Tool Change
    useEffect(() => {
        const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) return;

        // Reset primary mouse bindings for standard tools
        const standardTools = [
            WindowLevelTool.toolName,
            PanTool.toolName,
            ZoomTool.toolName,
            LengthTool.toolName,
            EllipticalROITool.toolName,
            ProbeTool.toolName
        ];

        // Disable all standard tools on primary click first (set to passive)
        standardTools.forEach(toolName => {
            toolGroup.setToolPassive(toolName);
        });

        // Always keep Pan on Middle and Zoom on Right if desired
        toolGroup.setToolActive(PanTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Auxiliary }]
        });
        toolGroup.setToolActive(ZoomTool.toolName, {
            bindings: [{ mouseButton: MouseBindings.Secondary }]
        });

        // Set Active Tool for Left Click
        let toolName = WindowLevelTool.toolName;
        if (activeTool === 'Pan') toolName = PanTool.toolName;
        if (activeTool === 'Zoom') toolName = ZoomTool.toolName;
        if (activeTool === 'Length') toolName = LengthTool.toolName;
        if (activeTool === 'Ellipse') toolName = EllipticalROITool.toolName; // Map 'Ellipse' to EllipticalROITool
        if (activeTool === 'Probe') toolName = ProbeTool.toolName;

        toolGroup.setToolActive(toolName, {
            bindings: [{ mouseButton: MouseBindings.Primary }]
        });

    }, [activeTool]);

    // 3. Load Series Data & Render
    useEffect(() => {
        if (!db || !seriesUid) return;

        const loadImages = async () => {
            setStatus('Loading Series...');

            const images = await db.images.find({
                selector: {
                    seriesInstanceUID: seriesUid
                },
                sort: [
                    { instanceNumber: 'asc' }
                ]
            }).exec();

            if (images.length === 0) {
                setStatus('No images found in series.');
                return;
            }

            const imageIds = images.map(img => `electronfile:${img.filePath}`);

            setStatus(`Loading ${imageIds.length} images...`);

            await initCornerstone();

            if (!elementRef.current) return;

            // Get or Create RenderingEngine
            const renderingEngine = new RenderingEngine(renderingEngineId);

            // Setup Viewport
            const viewportInput: Types.PublicViewportInput = {
                viewportId,
                type: ViewportType.STACK,
                element: elementRef.current,
                defaultOptions: {
                    background: [0, 0, 0],
                },
            };

            renderingEngine.enableElement(viewportInput);

            // Get Viewport
            const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;

            // Add to ToolGroup
            const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
            toolGroup?.addViewport(viewportId, renderingEngineId);

            // Set Stack
            try {
                // Check if stack is already set to avoid reload?
                // For now just set.
                await viewport.setStack(imageIds);
                viewport.render();
                setStatus(''); // Clear status on success
            } catch (error) {
                console.error("Failed to load stack:", error);
                setStatus('Failed to load images.');
            }
        };

        loadImages();

        return () => {
            // Cleanup
            const renderingEngine = getRenderingEngine(renderingEngineId);
            if (renderingEngine) {
                renderingEngine.disableElement(viewportId);
                // renderingEngine.destroy(); // Keep engine alive for reuse or destroy?
            }
        };
    }, [db, seriesUid, viewportId, renderingEngineId]);

    return (
        <div className="w-full h-full relative bg-black">
            {status && (
                <div className="absolute top-4 left-4 z-10 text-white bg-black/50 px-2 py-1 rounded text-sm pointer-events-none">
                    {status}
                </div>
            )}
            <div
                ref={elementRef}
                className="w-full h-full"
                // Prevent context menu
                onContextMenu={(e) => e.preventDefault()}
            />
        </div>
    );
};
