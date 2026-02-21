import { useEffect, useRef } from 'react';
import {
    getRenderingEngine,
    metaData
} from '@cornerstonejs/core';
import { initCornerstone } from './init';
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
    CrosshairsTool,
    ReferenceLinesTool
} from '@cornerstonejs/tools';
import { useViewer } from './ViewerContext';

const RENDERING_ENGINE_ID = 'peregrine-engine';
const TOOL_GROUP_ID = 'peregrine-tool-group';

export const CornerstoneManager = () => {
    const { setIsInitReady, isAutoRotating, activeViewportIndex, viewports } = useViewer();
    const initializedRef = useRef(false);
    const rotationFrameRef = useRef<number | null>(null);

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
                    CrosshairsTool, ReferenceLinesTool
                ];

                tools.forEach(toolClass => {
                    if (toolGroup && !toolGroup.hasTool(toolClass.toolName)) {
                        if (toolClass.toolName === ReferenceLinesTool.toolName) {
                            toolGroup.addTool(toolClass.toolName, {
                                renderOutline: true,
                                isVisible: true,
                            });
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

                toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
                toolGroup.setToolActive(ReferenceLinesTool.toolName);
            }

            console.log('[CornerstoneManager] System Ready');
            setIsInitReady(true);

            // Nuclear Debug Helper
            (window as any).debugReferenceLines = () => {
                const tg = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
                const viewportsIds = tg?.getViewportIds();
                console.log('--- Reference Lines Diagnostic ---');
                console.log('ToolGroup:', TOOL_GROUP_ID);
                console.log('Registered Viewports:', viewportsIds);

                const engine = getRenderingEngine(RENDERING_ENGINE_ID);
                viewportsIds?.forEach(vpId => {
                    const vp = engine?.getViewport(vpId);
                    const sliceId = (vp as any).getCurrentImageId?.();
                    const metadata = sliceId ? metaData.get('imagePlaneModule', sliceId) : null;
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
            } catch (e) { /* ignore */ }
        };
    }, []);

    // Auto-Rotation Effect
    useEffect(() => {
        if (!isAutoRotating) {
            if (rotationFrameRef.current) {
                cancelAnimationFrame(rotationFrameRef.current);
                rotationFrameRef.current = null;
            }
            return;
        }

        const vpState = viewports[activeViewportIndex];
        if (!vpState) return;
        const engine = getRenderingEngine(RENDERING_ENGINE_ID);
        if (!engine) return;

        const rotate = () => {
            const vpState = viewports[activeViewportIndex];
            if (!vpState) return;

            const viewport = engine.getViewport(vpState.id);
            if (viewport && 'setCamera' in viewport) {
                const camera = (viewport as any).getCamera();
                if (camera) {
                    const { position, focalPoint } = camera;
                    const angle = 0.01; // ~0.6 degrees per frame
                    const cosA = Math.cos(angle);
                    const sinA = Math.sin(angle);

                    const dx = position[0] - focalPoint[0];
                    const dz = position[2] - focalPoint[2];

                    const nextX = focalPoint[0] + dx * cosA - dz * sinA;
                    const nextZ = focalPoint[2] + dx * sinA + dz * cosA;

                    (viewport as any).setCamera({
                        position: [nextX, position[1], nextZ]
                    });
                    viewport.render();
                }
            }
            rotationFrameRef.current = requestAnimationFrame(rotate);
        };

        rotationFrameRef.current = requestAnimationFrame(rotate);

        return () => {
            if (rotationFrameRef.current) {
                cancelAnimationFrame(rotationFrameRef.current);
                rotationFrameRef.current = null;
            }
        };
    }, [isAutoRotating, activeViewportIndex, viewports]);

    return null;
};
