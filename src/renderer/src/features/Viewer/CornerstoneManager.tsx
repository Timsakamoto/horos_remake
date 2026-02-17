import { useEffect, useRef } from 'react';
import { getRenderingEngine, metaData } from '@cornerstonejs/core';
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
    CrosshairsTool,
    ReferenceLinesTool
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
                    MagnifyTool, CrosshairsTool, ReferenceLinesTool
                ];

                tools.forEach(toolClass => {
                    if (toolGroup && !toolGroup.hasTool(toolClass.toolName)) {
                        console.log(`[CornerstoneManager] Adding tool: ${toolClass.toolName}`);
                        if (toolClass.toolName === ReferenceLinesTool.toolName) {
                            toolGroup.addTool(toolClass.toolName, {
                                renderOutline: true,
                                isVisible: true,
                            });
                            // Set color for reference lines
                            toolGroup.setToolConfiguration(ReferenceLinesTool.toolName, {
                                configuration: {
                                    fontFamily: 'Inter',
                                    renderOutline: true,
                                }
                            });
                        } else {
                            toolGroup.addTool(toolClass.toolName);
                        }
                    }
                });

                // Default orientations and global tools
                // Default orientations and global tools - NO PRIMARY MOUSE ASSIGNMENTS
                toolGroup.setToolEnabled(ReferenceLinesTool.toolName);
            }

            console.log('[CornerstoneManager] System Ready');
            setIsInitReady(true);

            // Nuclear Debug Helper
            (window as any).debugReferenceLines = () => {
                const tg = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
                const viewports = tg?.getViewportIds();
                console.log('--- Reference Lines Diagnostic ---');
                console.log('ToolGroup:', TOOL_GROUP_ID);
                console.log('Active Tool:', tg?.getActivePrimaryMouseButtonTool());
                console.log('Registered Viewports:', viewports);
                console.log('RefLines Tool State:', tg?.getToolOptions(ReferenceLinesTool.toolName));

                viewports?.forEach(vpId => {
                    const vp = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(vpId);
                    const sliceId = (vp as any).getCurrentImageId?.();
                    const metadata = metaData.get('imagePlaneModule', sliceId);
                    console.log(`Viewport ${vpId}:`, {
                        type: vp?.type,
                        imageId: sliceId,
                        FOR: metadata?.frameOfReferenceUID,
                        Pos: metadata?.imagePositionPatient
                    });
                });
            };
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
