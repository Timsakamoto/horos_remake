import { useEffect, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    volumeLoader,
} from '@cornerstonejs/core';
import {
    addTool,
    ToolGroupManager,
    TrackballRotateTool,
    ZoomTool,
    PanTool,
    Enums as csToolsEnums
} from '@cornerstonejs/tools';
import { initCornerstone } from './init';
import { useDatabase } from '../Database/DatabaseProvider';
import { registerElectronImageLoader } from './electronLoader';

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const VR_RENDERING_ENGINE_ID = 'vr-engine';
const VR_VIEWPORT_ID = 'vr-viewport';
const VR_TOOL_GROUP_ID = 'vr-tool-group';

interface Props {
    seriesUid: string;
}

export const VRView = ({ seriesUid }: Props) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const { db } = useDatabase();
    const [status, setStatus] = useState<string>('Initializing VR...');
    const [activePreset, setActivePreset] = useState<string>('CT-Bone');

    useEffect(() => {
        // Register Tools - wrap in try-catch since they may already be registered
        [TrackballRotateTool, ZoomTool, PanTool].forEach(tool => {
            try { addTool(tool); } catch (e) { /* already registered */ }
        });

        let toolGroup = ToolGroupManager.getToolGroup(VR_TOOL_GROUP_ID);
        if (!toolGroup) {
            toolGroup = ToolGroupManager.createToolGroup(VR_TOOL_GROUP_ID);
        }

        if (toolGroup) {
            const toolNames = [TrackballRotateTool.toolName, ZoomTool.toolName, PanTool.toolName];
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
        if (!db || !seriesUid) return;

        const loadVolume = async () => {
            setStatus('Loading Volume for VR...');

            const images = await (db as any).T_FilePath.find({
                selector: { seriesInstanceUID: seriesUid },
                sort: [{ instanceNumber: 'asc' }]
            }).exec();

            if (images.length === 0) {
                setStatus('No images.');
                return;
            }

            const imageIds = images.map((img: any) => `electronfile:${img.filePath}`);
            const volumeId = `cornerstoneStreamingImageVolume:${seriesUid}`;

            await initCornerstone();

            if (!elementRef.current) return;

            const renderingEngine = new RenderingEngine(VR_RENDERING_ENGINE_ID);

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

                viewport.setProperties({
                    preset: 'CT-Bone',
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
            // cleanup
        };

    }, [db, seriesUid]);

    return (
        <div className="w-full h-full relative bg-black">
            {status && (
                <div className="absolute top-4 left-4 z-50 text-white bg-black/50 px-2 py-1 rounded text-sm pointer-events-none">
                    {status}
                </div>
            )}
            <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
                <div className="bg-black/50 p-2 rounded text-white text-xs">
                    <div className="font-bold mb-1">VR Presets</div>
                    <select
                        className="bg-gray-800 border border-gray-600 rounded px-1"
                        value={activePreset}
                        onChange={(e) => setActivePreset(e.target.value)}
                    >
                        <option value="CT-Bone">CT Bone</option>
                        <option value="CT-MIP">MIP</option>
                        <option value="CT-Soft">Soft Tissue</option>
                    </select>
                </div>
            </div>
            <div ref={elementRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
        </div>
    );
};
