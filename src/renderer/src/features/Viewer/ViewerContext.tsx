import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import {
    ViewMode,
    ToolMode,
    ProjectionMode,
    ViewportState,
    Layout,
    VOI,
    TOOL_GROUP_ID
} from './types';
import { ToolGroupManager, Enums as csToolsEnums, WindowLevelTool, PanTool, ZoomTool, LengthTool, RectangleROITool, EllipticalROITool, ArrowAnnotateTool, ProbeTool, AngleTool, BidirectionalTool, MagnifyTool, CrosshairsTool } from '@cornerstonejs/tools';

interface ViewerContextType {
    activeView: ViewMode;
    setActiveView: (view: ViewMode) => void;
    activeTool: ToolMode;
    setActiveTool: (tool: ToolMode) => void;
    viewports: ViewportState[];
    setViewports: React.Dispatch<React.SetStateAction<ViewportState[]>>;
    activeViewportIndex: number;
    setActiveViewportIndex: (index: number) => void;
    layout: Layout;
    setLayout: (layout: Layout) => void;
    projectionMode: ProjectionMode;
    setProjectionMode: (mode: ProjectionMode) => void;
    slabThickness: number;
    setSlabThickness: (thickness: number) => void;
    isCinePlaying: boolean;
    setIsCinePlaying: React.Dispatch<React.SetStateAction<boolean>>;
    activeCLUT: string;
    setActiveCLUT: (clut: string) => void;
    isSynced: boolean;
    setIsSynced: React.Dispatch<React.SetStateAction<boolean>>;
    isClipping: boolean;
    setIsClipping: React.Dispatch<React.SetStateAction<boolean>>;
    clippingRange: number;
    setClippingRange: (range: number) => void;
    isAutoRotating: boolean;
    setIsAutoRotating: React.Dispatch<React.SetStateAction<boolean>>;
    showOverlays: boolean;
    setShowOverlays: React.Dispatch<React.SetStateAction<boolean>>;
    isInitReady: boolean;
    setIsInitReady: (ready: boolean) => void;

    // Actions
    onSeriesSelect: (seriesUid: string | null) => void;
    handleViewChange: (view: ViewMode) => Promise<void>;
    handleLayoutChange: (rows: number, cols: number) => void;
    toggleCinePlaying: () => void;
    toggleIsSynced: () => void;
    setViewportVoi: (index: number, voi: VOI | null) => void;
}

const ViewerContext = createContext<ViewerContextType | undefined>(undefined);

export const ViewerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeView, setActiveView] = useState<ViewMode>('Database');
    const [activeTool, setActiveTool] = useState<ToolMode>('WindowLevel');
    const [activeViewportIndex, setActiveViewportIndex] = useState(0);
    const [layout, setLayout] = useState<Layout>({ rows: 1, cols: 1 });
    const [projectionMode, setProjectionMode] = useState<ProjectionMode>('NORMAL');
    const [slabThickness, setSlabThickness] = useState(1);
    const [isCinePlaying, setIsCinePlaying] = useState(false);
    const [activeCLUT, setActiveCLUT] = useState<string>('grayscale');
    const [isSynced, setIsSynced] = useState(true);
    const [isClipping, setIsClipping] = useState(false);
    const [clippingRange, setClippingRange] = useState(50);
    const [isAutoRotating, setIsAutoRotating] = useState(false);
    const [showOverlays, setShowOverlays] = useState(true);
    const [isInitReady, setIsInitReady] = useState(false);

    const [viewports, setViewports] = useState<ViewportState[]>(
        new Array(12).fill(null).map((_, i) => ({
            id: `vp-${i}`,
            seriesUid: null,
            orientation: 'Default',
            voi: null
        }))
    );

    const onSeriesSelect = useCallback((seriesUid: string | null) => {
        const isViewer = activeView !== 'Database' && activeView !== 'PACS';
        if (isViewer) {
            setViewports(prev => {
                const next = [...prev];
                next[activeViewportIndex] = {
                    ...next[activeViewportIndex],
                    seriesUid,
                    orientation: 'Default',
                    voi: null
                };
                return next;
            });
        } else {
            setViewports(prev => {
                const next = [...prev];
                next[0] = { ...next[0], seriesUid, orientation: 'Default', voi: null };
                return next;
            });
        }
    }, [activeView, activeViewportIndex]);

    const handleViewChange = useCallback(async (view: ViewMode) => {
        if (view === 'Axial' || view === 'Coronal' || view === 'Sagittal') {
            setViewports(prev => {
                const next = [...prev];
                next[activeViewportIndex] = { ...next[activeViewportIndex], orientation: view };
                return next;
            });
            return;
        }

        if (view === '2D' && activeView !== '2D') {
            setViewports(prev => prev.map(vp => ({ ...vp, orientation: 'Default' })));
        }

        setActiveView(view);

        if (view === 'MPR') {
            setActiveTool('Crosshairs');
        } else if (activeTool === 'Crosshairs') {
            setActiveTool('WindowLevel');
        }
    }, [activeView, activeViewportIndex, activeTool]);

    const handleLayoutChange = useCallback((rows: number, cols: number) => {
        setLayout({ rows, cols });
        if (activeViewportIndex >= rows * cols) {
            setActiveViewportIndex(0);
        }
    }, [activeViewportIndex]);

    const toggleCinePlaying = useCallback(() => setIsCinePlaying(prev => !prev), []);
    const toggleIsSynced = useCallback(() => setIsSynced(prev => !prev), []);

    const setViewportVoi = useCallback((index: number, voi: VOI | null) => {
        setViewports(prev => {
            const next = [...prev];
            next[index] = { ...next[index], voi };
            return next;
        });
    }, []);

    // Global Tool Activation
    useEffect(() => {
        const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) return;

        const allTools = [
            'WindowLevel', 'Pan', 'Zoom', 'Length', 'RectangleROI', 'EllipticalROI',
            'ArrowAnnotate', 'Probe', 'Angle', 'Bidirectional', 'Magnify', 'Crosshairs'
        ];

        // Reset all to passive
        allTools.forEach(t => {
            if (toolGroup.hasTool(t)) toolGroup.setToolPassive(t);
        });

        // Map ToolMode to Cornerstone Tool Name
        const toolMap: Record<ToolMode, string> = {
            'WindowLevel': WindowLevelTool.toolName,
            'Pan': PanTool.toolName,
            'Zoom': ZoomTool.toolName,
            'Length': LengthTool.toolName,
            'Rectangle': RectangleROITool.toolName,
            'Ellipse': EllipticalROITool.toolName,
            'Arrow': ArrowAnnotateTool.toolName,
            'Probe': ProbeTool.toolName,
            'Angle': AngleTool.toolName,
            'BIDIRECTIONAL': BidirectionalTool.toolName,
            'MAGNIFY': MagnifyTool.toolName,
            'CROSSHAIRS': CrosshairsTool.toolName,
        } as any;

        const csToolName = toolMap[activeTool];
        if (csToolName && toolGroup.hasTool(csToolName)) {
            toolGroup.setToolActive(csToolName, {
                bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }]
            });
        }

        // Secondary bindings
        if (csToolName !== PanTool.toolName && toolGroup.hasTool(PanTool.toolName)) {
            toolGroup.setToolActive(PanTool.toolName, {
                bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }]
            });
        }
        if (csToolName !== ZoomTool.toolName && toolGroup.hasTool(ZoomTool.toolName)) {
            toolGroup.setToolActive(ZoomTool.toolName, {
                bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }]
            });
        }
    }, [activeTool]);

    const value: ViewerContextType = {
        activeView, setActiveView,
        activeTool, setActiveTool,
        viewports, setViewports,
        activeViewportIndex, setActiveViewportIndex,
        layout, setLayout,
        projectionMode, setProjectionMode,
        slabThickness, setSlabThickness,
        isCinePlaying, setIsCinePlaying,
        activeCLUT, setActiveCLUT,
        isSynced, setIsSynced,
        isClipping, setIsClipping,
        clippingRange, setClippingRange,
        isAutoRotating, setIsAutoRotating,
        showOverlays, setShowOverlays,
        isInitReady, setIsInitReady,
        onSeriesSelect,
        handleViewChange,
        handleLayoutChange,
        toggleCinePlaying,
        toggleIsSynced,
        setViewportVoi
    };

    return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
};

export const useViewer = () => {
    const context = useContext(ViewerContext);
    if (!context) throw new Error('useViewer must be used within a ViewerProvider');
    return context;
};
