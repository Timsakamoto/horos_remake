import { useEffect } from 'react';
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
import { type ToolMode } from '../Toolbar';

const { MouseBindings } = csToolsEnums;
const TOOL_GROUP_ID = 'main-tool-group';

export const useViewportTools = (
    activeTool: ToolMode,
    isThumbnail: boolean
) => {
    // Initialize Tools
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
    }, []);

    // Handle Active Tool Changes
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
};
