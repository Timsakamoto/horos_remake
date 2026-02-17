import { useEffect, useRef } from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';
import {
    ToolGroupManager,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    StackScrollMouseWheelTool,
    LengthTool,
    EllipticalROITool,
    RectangleROITool,
    ProbeTool,
    AngleTool,
    ArrowAnnotateTool,
    CobbAngleTool,
    BidirectionalTool,
    MagnifyTool,
    CrosshairsTool
} from '@cornerstonejs/tools';
import { initCornerstone } from './init';
import { useViewer } from './ViewerContext';
import { TOOL_GROUP_ID, RENDERING_ENGINE_ID } from './types';

export const CornerstoneManager = () => {
    const { setIsInitReady } = useViewer();
    const initializedRef = useRef(false);

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const prepare = async () => {
            console.log('[CornerstoneManager] Initializing Global Core & Tools');
            await initCornerstone();

            let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
            if (!toolGroup) {
                console.log('[CornerstoneManager] Creating Global ToolGroup:', TOOL_GROUP_ID);
                toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
            }

            if (toolGroup) {
                const tools = [
                    WindowLevelTool, PanTool, ZoomTool, StackScrollMouseWheelTool,
                    LengthTool, EllipticalROITool, RectangleROITool, ProbeTool,
                    AngleTool, ArrowAnnotateTool, CobbAngleTool, BidirectionalTool,
                    MagnifyTool, CrosshairsTool
                ];

                tools.forEach(toolClass => {
                    if (toolGroup && !toolGroup.hasTool(toolClass.toolName)) {
                        toolGroup.addTool(toolClass.toolName);
                    }
                });

                // Default orientations for secondary buttons
                toolGroup.setToolPassive(PanTool.toolName);
                toolGroup.setToolPassive(ZoomTool.toolName);
            }

            console.log('[CornerstoneManager] System Ready');
            setIsInitReady(true);
        };

        prepare();

        return () => {
            console.log('[CornerstoneManager] Cleaning up Rendering Engine');
            try {
                const engine = getRenderingEngine(RENDERING_ENGINE_ID);
                if (engine) engine.destroy();
            } catch (e) {
                // Ignore if already destroyed
            }
        };
    }, []);

    return null;
};
