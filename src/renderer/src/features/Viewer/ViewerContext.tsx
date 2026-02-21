import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import {
    ViewMode,
    ToolMode,
    ProjectionMode,
    ViewportState,
    Layout,
    VOI,
    TOOL_GROUP_ID,
    ActiveLUT,
    FusionTransferFunction,
} from './types';
import {
    ToolGroupManager,
    Enums as csToolsEnums,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    LengthTool,
    RectangleROITool,
    EllipticalROITool,
    ArrowAnnotateTool,
    ProbeTool,
    AngleTool,
    BidirectionalTool,
    CrosshairsTool,
    ReferenceLinesTool,
    StackScrollMouseWheelTool,
} from '@cornerstonejs/tools';


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
    showAnnotationList: boolean;
    setShowAnnotationList: React.Dispatch<React.SetStateAction<boolean>>;

    // Actions
    onSeriesSelect: (seriesUid: string | null, targetIndex?: number) => void;
    handleViewChange: (view: ViewMode) => Promise<void>;
    handleLayoutChange: (rows: number, cols: number) => void;
    toggleCinePlaying: () => void;
    toggleIsSynced: () => void;
    setViewportVoi: (index: number, voi: VOI | null) => void;
    setViewportProjectionMode: (index: number, mode: ProjectionMode) => void;
    setViewportLUT: (index: number, lut: ActiveLUT) => void;
    setViewportFusionSeries: (index: number, fusionUid: string | null) => void;
    setViewportFusionOpacity: (index: number, opacity: number) => void;
    setViewportFusionLUT: (index: number, lut: ActiveLUT) => void;
    setViewportFusionVOI: (index: number, voi: VOI | null) => void;
    setViewportFusionTransferFunction: (index: number, mode: FusionTransferFunction) => void;
}

const ViewerContext = createContext<ViewerContextType | undefined>(undefined);

interface ViewerProviderProps {
    children: ReactNode;
    initialView?: ViewMode;
    initialSeriesUid?: string | null;
}

export const ViewerProvider: React.FC<ViewerProviderProps> = ({ children, initialView = 'Database', initialSeriesUid }) => {
    const [activeView, setActiveView] = useState<ViewMode>(initialView);
    const [activeTool, setActiveTool] = useState<ToolMode>('StackScroll');
    const [activeViewportIndex, setActiveViewportIndex] = useState(0);
    const activeViewportIndexRef = useRef(0); // Ref to avoid stale closures
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
    const [showAnnotationList, setShowAnnotationList] = useState(false);

    const [viewports, setViewports] = useState<ViewportState[]>(
        new Array(12).fill(null).map((_, i) => ({
            id: `vp-${i}`,
            seriesUid: null,
            orientation: 'Default',
            voi: null,
            projectionMode: 'NORMAL',
            activeLUT: 'Grayscale',
            fusionSeriesUid: null,
            fusionOpacity: 0.5,
            fusionLUT: 'Hot Metal',
            fusionTransferFunction: 'Linear'
        }))
    );

    // Initial series load from query params
    useEffect(() => {
        if (initialSeriesUid && initialView !== 'Database') {
            console.log(`[ViewerContext] Auto-selecting initial series: ${initialSeriesUid}`);
            setViewports(prev => {
                const next = [...prev];
                next[0] = { ...next[0], seriesUid: initialSeriesUid };
                return next;
            });
        }
    }, [initialSeriesUid, initialView]);

    // Keep ref in sync with state
    useEffect(() => {
        activeViewportIndexRef.current = activeViewportIndex;
    }, [activeViewportIndex]);

    const onSeriesSelect = useCallback((seriesUid: string | null, targetIndex?: number) => {
        // Use ref to always get the LATEST activeViewportIndex, avoiding stale closures
        const indexToUse = targetIndex ?? activeViewportIndexRef.current;

        console.log(`[ViewerContext] onSeriesSelect: seriesUid=${seriesUid}, targetIndex=${targetIndex}, indexToUse=${indexToUse}`);

        setViewports(prev => {
            const next = [...prev];
            // Ensure the slot exists
            if (!next[indexToUse]) {
                console.warn(`[ViewerContext] target slot ${indexToUse} missing, creating...`);
                next[indexToUse] = {
                    id: `vp-${indexToUse}`,
                    seriesUid: null,
                    orientation: 'Default',
                    voi: null,
                    projectionMode: 'NORMAL',
                    activeLUT: 'Grayscale',
                    fusionSeriesUid: null,
                    fusionOpacity: 0.5,
                    fusionLUT: 'Hot Metal'
                };
            }

            next[indexToUse] = {
                ...next[indexToUse],
                seriesUid,
                orientation: 'Default',
                voi: null,
                projectionMode: 'NORMAL',
                activeLUT: 'Grayscale',
                fusionSeriesUid: null
            };
            console.log(`[ViewerContext] updated viewports[${indexToUse}] to ${seriesUid}`);
            return next;
        });

        // If we explicitly targeted an index, make it active
        if (targetIndex !== undefined) {
            setActiveViewportIndex(targetIndex);
        }
    }, []); // No dependencies — uses ref for activeViewportIndex

    const handleViewChange = useCallback(async (view: ViewMode) => {
        // ALWAYS signal return to database regardless of local state
        if (view === 'Database' || view === 'PACS') {
            const electron = (window as any).electron;
            if (electron?.returnToDatabase) {
                console.log(`[ViewerContext] Returning to database, signaling IPC...`);
                await electron.returnToDatabase();
            }
        }

        if (activeView === view) {
            return;
        }

        if (view === 'Axial' || view === 'Coronal' || view === 'Sagittal') {
            setViewports(prev => {
                const next = [...prev];
                next[activeViewportIndex] = { ...next[activeViewportIndex], orientation: view };
                return next;
            });

            // If we are currently in a special mode (MPR/3D/Database), switch to 2D viewer
            if (activeView !== '2D') {
                setActiveView('2D');
            }
            return;
        }

        if (view === '2D' && activeView !== '2D') {
            setViewports(prev => {
                const next = [...prev];
                next[activeViewportIndex] = { ...next[activeViewportIndex], orientation: 'Acquisition' };
                return next;
            });
            setActiveView('2D');
            return;
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
            if (next[index]) next[index] = { ...next[index], voi };
            return next;
        });
    }, []);

    const setViewportProjectionMode = useCallback((index: number, mode: ProjectionMode) => {
        setViewports(prev => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], projectionMode: mode };
            return next;
        });
    }, []);

    const setViewportLUT = useCallback((index: number, lut: ActiveLUT) => {
        setViewports(prev => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], activeLUT: lut };
            return next;
        });
    }, []);

    const setViewportFusionSeries = useCallback((index: number, fusionUid: string | null) => {
        setViewports(prev => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], fusionSeriesUid: fusionUid };
            return next;
        });
    }, []);

    const setViewportFusionOpacity = useCallback((index: number, opacity: number) => {
        setViewports(prev => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], fusionOpacity: opacity };
            return next;
        });
    }, []);

    const setViewportFusionLUT = useCallback((index: number, lut: ActiveLUT) => {
        setViewports(prev => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], fusionLUT: lut };
            return next;
        });
    }, []);

    const setViewportFusionVOI = useCallback((index: number, voi: VOI | null) => {
        setViewports(prev => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], fusionVOI: voi };
            return next;
        });
    }, []);

    const setViewportFusionTransferFunction = useCallback((index: number, mode: FusionTransferFunction) => {
        setViewports(prev => {
            const next = [...prev];
            if (next[index]) next[index] = { ...next[index], fusionTransferFunction: mode };
            return next;
        });
    }, []);

    // Global Tool Activation
    useEffect(() => {
        const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (!toolGroup) return;

        const allTools = [
            'WindowLevel', 'Pan', 'Zoom', 'Length', 'EllipticalROI', 'RectangleROI',
            'ArrowAnnotate', 'Probe', 'Angle', 'Bidirectional', 'Magnify', 'Crosshairs', 'StackScroll',
            StackScrollMouseWheelTool.toolName
        ];

        // Reset all to disabled (prevents zombie renders from passive tools)
        allTools.forEach(t => {
            if (toolGroup.hasTool(t)) toolGroup.setToolDisabled(t);
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
            'Bidirectional': BidirectionalTool.toolName,
            'Magnify': ZoomTool.toolName,
            'Crosshairs': CrosshairsTool.toolName,
            'StackScroll': 'StackScroll',
            'CobbAngle': 'CobbAngle',
            'Text': 'TextAnnotate',
            'ReferenceLines': ReferenceLinesTool.toolName,
            'None': 'None'
        };

        const csToolName = toolMap[activeTool];
        // Reference Lines removed as per user request (performance)

        if (csToolName && csToolName !== 'None' && toolGroup.hasTool(csToolName)) {
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

        // Always enable Mouse Wheel for paging (2D & MPR)
        if (toolGroup.hasTool(StackScrollMouseWheelTool.toolName)) {
            toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
        }
    }, [activeTool]);

    // Global Render trigger removed - individual viewports handle their own render
    // to avoid race conditions with container sizes during view transitions.


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
        showAnnotationList, setShowAnnotationList,
        onSeriesSelect,
        handleViewChange,
        handleLayoutChange,
        toggleCinePlaying,
        toggleIsSynced,
        setViewportVoi,
        setViewportProjectionMode,
        setViewportLUT,
        setViewportFusionSeries,
        setViewportFusionOpacity,
        setViewportFusionLUT,
        setViewportFusionVOI,
        setViewportFusionTransferFunction
    };

    return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
};

export const useViewer = () => {
    const context = useContext(ViewerContext);
    if (!context) throw new Error('useViewer must be used within a ViewerProvider');
    return context;
};
