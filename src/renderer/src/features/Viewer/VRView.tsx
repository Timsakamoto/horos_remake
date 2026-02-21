import { useEffect, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    volumeLoader,
    getRenderingEngine,
} from '@cornerstonejs/core';
import {
    addTool,
    ToolGroupManager,
    TrackballRotateTool,
    ZoomTool,
    PanTool,
    LengthTool,
    AngleTool,
    RectangleROITool,
    EllipticalROITool,
    ProbeTool,
    ArrowAnnotateTool,
    BidirectionalTool,
    CobbAngleTool,
    MagnifyTool,
    Enums as csToolsEnums
} from '@cornerstonejs/tools';
import { initCornerstone } from './init';
import { useSettings } from '../Settings/SettingsContext';
import { registerElectronImageLoader, prefetchMetadata } from './electronLoader';
import { ToolMode } from './types';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const VR_RENDERING_ENGINE_ID = 'peregrine-engine';
const VR_VIEWPORT_ID = 'vr-viewport';
const VR_TOOL_GROUP_ID = 'vr-tool-group';

interface Props {
    seriesUid: string;
    isClipping?: boolean;
    clippingRange?: number;
    isAutoRotating?: boolean;
    activeTool: ToolMode;
}

export const VRView = ({
    seriesUid,
    isClipping = false,
    clippingRange = 50,
    isAutoRotating = false,
    activeTool
}: Props) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const { databasePath } = useSettings();
    const [status, setStatus] = useState<string>('');
    const [activePreset, setActivePreset] = useState<string>('CT-Bone');
    const [isInteracting, setIsInteracting] = useState(false);

    // Track interaction for adaptive quality
    useEffect(() => {
        const el = elementRef.current;
        if (!el) return;

        const handleDown = () => setIsInteracting(true);
        const handleUp = () => setIsInteracting(false);

        el.addEventListener('mousedown', handleDown);
        window.addEventListener('mouseup', handleUp);

        return () => {
            el.removeEventListener('mousedown', handleDown);
            window.removeEventListener('mouseup', handleUp);
        };
    }, []);

    useEffect(() => {
        // Register Tools - wrap in try-catch since they may already be registered
        [
            TrackballRotateTool, ZoomTool, PanTool, MagnifyTool,
            LengthTool, AngleTool, RectangleROITool, EllipticalROITool, ProbeTool,
            ArrowAnnotateTool, BidirectionalTool, CobbAngleTool
        ].forEach(tool => {
            try { addTool(tool); } catch (e) { /* already registered */ }
        });

        let toolGroup = ToolGroupManager.getToolGroup(VR_TOOL_GROUP_ID);
        if (!toolGroup) {
            toolGroup = ToolGroupManager.createToolGroup(VR_TOOL_GROUP_ID);
        }

        if (toolGroup) {
            const toolNames = [
                TrackballRotateTool.toolName, ZoomTool.toolName, PanTool.toolName, MagnifyTool.toolName,
                LengthTool.toolName, AngleTool.toolName, RectangleROITool.toolName,
                EllipticalROITool.toolName, ProbeTool.toolName, ArrowAnnotateTool.toolName,
                BidirectionalTool.toolName, CobbAngleTool.toolName
            ];
            toolNames.forEach(name => {
                if (!toolGroup!.hasTool(name)) toolGroup!.addTool(name);
            });

            toolGroup.setToolActive(TrackballRotateTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
            toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
            toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
        }

        registerElectronImageLoader();
    }, []);

    useEffect(() => {
        if (!seriesUid) return;

        const loadVolume = async () => {
            setStatus('Loading Volume for VR...');

            const images = await (window as any).electron.db.query(
                `SELECT i.* FROM instances i 
                 JOIN series s ON i.seriesId = s.id 
                 WHERE s.seriesInstanceUID = ? 
                 ORDER BY i.instanceNumber ASC`,
                [seriesUid]
            );

            if (images.length === 0) {
                setStatus('No images.');
                return;
            }

            const imageIds = await Promise.all(images.map(async (img: any) => {
                let targetPath = img.filePath;
                const isAbsolute = img.filePath.startsWith('/') || /^[a-zA-Z]:/.test(img.filePath);
                if (!isAbsolute && databasePath) {
                    // @ts-ignore
                    targetPath = await window.electron.join(databasePath, img.filePath);
                }
                return `electronfile://${targetPath}`;
            }));

            const volumeId = `cornerstoneStreamingImageVolume:volume-${seriesUid}`;

            await initCornerstone();

            // Pre-fetch metadata for technical volume parameters
            await prefetchMetadata(imageIds);

            if (!elementRef.current) return;

            let renderingEngine = getRenderingEngine(VR_RENDERING_ENGINE_ID);
            if (!renderingEngine) {
                renderingEngine = new RenderingEngine(VR_RENDERING_ENGINE_ID);
            }

            const viewportInput = {
                viewportId: VR_VIEWPORT_ID,
                type: ViewportType.VOLUME_3D,
                element: elementRef.current,
                defaultOptions: {
                    background: [0, 0, 0] as Types.Point3,
                },
            };

            renderingEngine.enableElement(viewportInput);

            // Add to Toolgroup
            const toolGroup = ToolGroupManager.getToolGroup(VR_TOOL_GROUP_ID);
            toolGroup?.addViewport(VR_VIEWPORT_ID, VR_RENDERING_ENGINE_ID);

            try {
                const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
                volume.load();

                // Get viewport
                const viewport = renderingEngine.getViewport(VR_VIEWPORT_ID) as Types.IVolumeViewport;

                // Set Volume
                await viewport.setVolumes([{ volumeId }]);

                // Map UI presets to Cornerstone presets
                const presetMap: Record<string, string> = {
                    'CT-Bone': 'CT-Bone',
                    'CT-MIP': 'CT-MIP',
                    'CT-Soft': 'CT-Soft-Tissue',
                    'CT-Vessels': 'CT-Vessels',
                    'CT-Lung': 'CT-Lung',
                    'CT-Abdomen': 'CT-Abdomen',
                    'CT-Brain': 'CT-Brain',
                    'CT-Skin': 'CT-Skin',
                    'MR-T1': 'MR-Default',
                    'MR-T2': 'MR-T2'
                };

                viewport.setProperties({
                    preset: presetMap[activePreset] || 'CT-Bone',
                });

                viewport.render();
                setStatus('');

            } catch (e) {
                console.error(e);
                setStatus('VR Load Failed');
            }
        };

        loadVolume();

        return () => {
            try {
                const renderingEngine = getRenderingEngine(VR_RENDERING_ENGINE_ID);
                if (renderingEngine) {
                    renderingEngine.disableElement(VR_VIEWPORT_ID);
                }
            } catch (e) {
                console.warn('[VRView] Cleanup error:', e);
            }
        };

    }, [seriesUid, databasePath]);

    // Update preset when changed in UI
    useEffect(() => {
        const renderingEngine = getRenderingEngine(VR_RENDERING_ENGINE_ID);
        if (!renderingEngine) return;

        const viewport = renderingEngine.getViewport(VR_VIEWPORT_ID) as Types.IVolumeViewport;
        if (!viewport) return;

        const presetMap: Record<string, string> = {
            'CT-Bone': 'CT-Bone',
            'CT-MIP': 'CT-MIP',
            'CT-Soft': 'CT-Soft-Tissue',
            'CT-Vessels': 'CT-Vessels',
            'CT-Lung': 'CT-Lung',
            'CT-Abdomen': 'CT-Abdomen',
            'CT-Brain': 'CT-Brain',
            'CT-Skin': 'CT-Skin',
            'MR-T1': 'MR-Default',
            'MR-T2': 'MR-T2'
        };

        viewport.setProperties({
            preset: presetMap[activePreset] || 'CT-Bone',
        });
        viewport.render();
    }, [activePreset]);

    // Adaptive Quality Management
    useEffect(() => {
        const renderingEngine = getRenderingEngine(VR_RENDERING_ENGINE_ID);
        if (!renderingEngine) return;

        const viewport = renderingEngine.getViewport(VR_VIEWPORT_ID) as Types.IVolumeViewport;
        if (!viewport) return;

        // Dynamic sampling distance: 2.0 (faster/lower quality) during interaction, 0.5 (sharper) when idle.
        (viewport as any).setProperties({
            samplingDistance: isInteracting ? 2.0 : 0.5
        });
        viewport.render();
    }, [isInteracting]);

    // Handle Tool Activation (New)
    useEffect(() => {
        const toolGroup = ToolGroupManager.getToolGroup(VR_TOOL_GROUP_ID);
        if (!toolGroup) return;

        try {
            // Set ALL tools to passive first
            const allTools = [
                TrackballRotateTool.toolName, PanTool.toolName, ZoomTool.toolName, MagnifyTool.toolName,
                LengthTool.toolName, AngleTool.toolName, RectangleROITool.toolName,
                EllipticalROITool.toolName, ProbeTool.toolName, ArrowAnnotateTool.toolName,
                BidirectionalTool.toolName, CobbAngleTool.toolName
            ];
            allTools.forEach(tn => {
                if (toolGroup.hasTool(tn)) toolGroup.setToolPassive(tn);
            });

            let primary = '';
            if (activeTool === 'Pan') primary = PanTool.toolName;
            else if (activeTool === 'Zoom') primary = ZoomTool.toolName;
            else if (activeTool === 'Length') primary = LengthTool.toolName;
            else if (activeTool === 'Angle') primary = AngleTool.toolName;
            else if (activeTool === 'Rectangle') primary = RectangleROITool.toolName;
            else if (activeTool === 'Ellipse') primary = EllipticalROITool.toolName;
            else if (activeTool === 'Probe') primary = ProbeTool.toolName;
            else if (activeTool === 'Arrow') primary = ArrowAnnotateTool.toolName;
            else if (activeTool === 'Bidirectional') primary = BidirectionalTool.toolName;
            else if (activeTool === 'Magnify') primary = MagnifyTool.toolName || 'Magnify';
            else if (activeTool === 'Text') primary = ArrowAnnotateTool.toolName || 'ArrowAnnotate';
            else {
                // Default for VR is Rotate
                primary = TrackballRotateTool.toolName;
            }

            if (primary && toolGroup.hasTool(primary)) {
                toolGroup.setToolActive(primary, { bindings: [{ mouseButton: MouseBindings.Primary }] });
            }

            // Bind auxiliary/secondary for Pan/Zoom
            if (primary !== PanTool.toolName) {
                toolGroup.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
            }
            if (primary !== ZoomTool.toolName) {
                toolGroup.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
            }
        } catch (e) {
            console.warn('VRView: Tool Activation Error:', e);
        }
    }, [(activeTool as any)]); // Type cast to avoid issues if ToolMode doesn't match exactly

    // Handle Clipping (D5)
    useEffect(() => {
        const renderingEngine = getRenderingEngine(VR_RENDERING_ENGINE_ID);
        if (!renderingEngine) return;

        const viewport = renderingEngine.getViewport(VR_VIEWPORT_ID) as Types.IVolumeViewport;
        if (!viewport) return;

        if (!isClipping) {
            viewport.setProperties({ clippingPlanes: [] } as any);
            viewport.render();
            return;
        }

        // Apply a simple clipping plane based on the volume's bounds and the clippingRange (%)
        // Scaling clippingRange (0-100) to the volume depth
        const volumeId = `cornerstoneStreamingImageVolume:volume-${seriesUid}`;
        const actor = viewport.getActor(volumeId);
        if (!actor) return;

        // Use any to bypass strict type check if necessary, but try to use actor.actor.getBounds()
        const bounds = (actor.actor as any).getBounds() || [0, 100, 0, 100, 0, 100];
        const depth = bounds[5] - bounds[4];
        const clipZ = bounds[4] + (depth * (clippingRange / 100));

        viewport.setProperties({
            clippingPlanes: [
                {
                    normal: [0, 0, -1] as Types.Point3, // Clip along Z axis for simplicity
                    distance: clipZ
                }
            ]
        } as any);
        viewport.render();
    }, [isClipping, clippingRange, seriesUid]);

    // Handle Auto-Rotation (D7/D9)
    useEffect(() => {
        if (!isAutoRotating) return;

        let requestID: number;
        const rotate = () => {
            const renderingEngine = getRenderingEngine(VR_RENDERING_ENGINE_ID);
            if (!renderingEngine) return;

            const viewport = renderingEngine.getViewport(VR_VIEWPORT_ID) as Types.IVolumeViewport;
            if (!viewport) return;

            // Turntable rotation: rotate around the Y (up) axis
            const camera = viewport.getCamera();
            const { position, focalPoint } = camera;

            // For a simple turntable, we can rotate the camera position around focal point
            // However, CS3D viewports usually expose some rotation methods.
            // Let's use setCamera with a slightly shifted position for simplicity
            if (position && focalPoint) {
                // Approximate 1-degree rotation around Y axis at focal point
                const angle = 0.02; // radians
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);

                const dx = position[0] - focalPoint[0];
                const dz = position[2] - focalPoint[2];

                const newX = focalPoint[0] + dx * cosA - dz * sinA;
                const newZ = focalPoint[2] + dx * sinA + dz * cosA;

                viewport.setCamera({
                    position: [newX, position[1], newZ] as Types.Point3
                });
                viewport.render();
            }

            requestID = requestAnimationFrame(rotate);
        };

        requestID = requestAnimationFrame(rotate);
        return () => {
            if (requestID) cancelAnimationFrame(requestID);
        };
    }, [isAutoRotating]);

    return (
        <div className="w-full h-full relative bg-black">
            {status && (
                <div className="absolute top-4 left-4 z-50 text-white bg-black/50 px-2 py-1 rounded text-sm pointer-events-none flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-peregrine-accent border-t-transparent rounded-full animate-spin" />
                    {status}
                </div>
            )}

            {!seriesUid && (
                <div className="absolute inset-0 flex items-center justify-center p-8 text-center pointer-events-none z-50">
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
            <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
                <div className="bg-black/50 p-2 rounded text-white text-xs">
                    <div className="font-bold mb-1 uppercase tracking-widest text-[10px]">3D VR Presets</div>
                    <select
                        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs w-full outline-none focus:ring-1 focus:ring-peregrine-accent"
                        value={activePreset}
                        onChange={(e) => setActivePreset(e.target.value)}
                    >
                        <optgroup label="Computed Tomography">
                            <option value="CT-Bone">Bone</option>
                            <option value="CT-MIP">MIP</option>
                            <option value="CT-Soft">Soft Tissue</option>
                            <option value="CT-Vessels">Vessels</option>
                            <option value="CT-Lung">Lung</option>
                            <option value="CT-Abdomen">Abdomen</option>
                            <option value="CT-Brain">Brain</option>
                            <option value="CT-Skin">Skin</option>
                        </optgroup>
                        <optgroup label="Magnetic Resonance">
                            <option value="MR-T1">MR T1</option>
                            <option value="MR-T2">MR T2</option>
                        </optgroup>
                    </select>
                </div>
            </div>
            <div ref={elementRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
        </div>
    );
};
