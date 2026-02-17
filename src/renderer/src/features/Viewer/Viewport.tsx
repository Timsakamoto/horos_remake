import { useEffect, useState } from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';
import { ToolGroupManager, utilities as csToolsUtils } from '@cornerstonejs/tools';
import { OverlayManager } from './OverlayManager';
import { addViewportToSync, removeViewportFromSync, triggerInitialSync } from './SyncManager';
import { startCine, stopCine } from './CinePlayer';
import { VerticalPagingSlider } from './VerticalPagingSlider';
import { useViewportLoader } from './useViewportLoader';
import { ToolMode, ViewportOrientation, VOI, TOOL_GROUP_ID } from './types';

interface Props {
    viewportId: string;
    renderingEngineId: string;
    seriesUid: string | null;
    initialImageId?: string | null;
    isThumbnail?: boolean;
    activeTool?: ToolMode;
    activeCLUT?: string;
    isSynced?: boolean;
    isCinePlaying?: boolean;
    showOverlays?: boolean;
    isActive?: boolean;
    autoFit?: boolean;
    orientation?: ViewportOrientation;
    initialWindowWidth?: number;
    initialWindowCenter?: number;
    voiOverride?: VOI | null;
    onVoiChange?: () => void;
}

export const Viewport = ({
    viewportId,
    renderingEngineId,
    seriesUid,
    initialImageId = null,
    isThumbnail = false,
    isSynced = false,
    isCinePlaying = false,
    showOverlays = true,
    isActive = false,
    orientation = 'Default',
    initialWindowWidth,
    initialWindowCenter,
    voiOverride,
    onVoiChange
}: Props) => {
    const [element, setElement] = useState<HTMLDivElement | null>(null);

    const {
        isReady,
        isComposed,
        status,
        volumeProgress,
        metadata,
    } = useViewportLoader({
        viewportId,
        renderingEngineId,
        element,
        seriesUid,
        isThumbnail,
        orientation,
        initialImageId,
        voiOverride,
        onVoiChange,
        activeCLUT: undefined, // Internal state handles this
        autoFit: true,
        initialWindowWidth,
        initialWindowCenter,
    });

    // Handle Tool Group Registration
    useEffect(() => {
        if (!isReady || isThumbnail) return;
        const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        toolGroup?.addViewport(viewportId, renderingEngineId);
    }, [isReady, viewportId, renderingEngineId, isThumbnail]);

    // Handle Synchronization
    useEffect(() => {
        if (!isReady || isThumbnail) return;
        if (isSynced) {
            addViewportToSync(viewportId, renderingEngineId);
            triggerInitialSync(renderingEngineId, viewportId);
        } else {
            removeViewportFromSync(viewportId, renderingEngineId);
        }
        return () => {
            removeViewportFromSync(viewportId, renderingEngineId);
        };
    }, [isReady, isSynced, viewportId, renderingEngineId, isThumbnail]);

    // Handle Cine Playback
    useEffect(() => {
        if (!isReady || isThumbnail) return;
        if (isCinePlaying) {
            startCine(viewportId, renderingEngineId);
        } else {
            stopCine(viewportId);
        }
        return () => {
            stopCine(viewportId);
        };
    }, [isReady, isCinePlaying, viewportId, renderingEngineId, isThumbnail]);

    const handleSliceSliderChange = (val: number) => {
        const engine = getRenderingEngine(renderingEngineId);
        const viewport = engine?.getViewport(viewportId);
        if (!viewport) return;

        const current = (viewport as any).getSliceIndex ? (viewport as any).getSliceIndex() : (viewport as any).getCurrentImageIdIndex();
        const delta = (val - 1) - current;
        if (delta !== 0) {
            csToolsUtils.scroll(viewport, { delta });
        }
    };

    return (
        <div
            ref={setElement}
            className={`
                absolute inset-0 bg-black overflow-hidden group/vp transition-all duration-500
                ${isActive ? 'ring-2 ring-peregrine-accent ring-inset z-10' : 'ring-1 ring-white/5'}
            `}
            data-sync-enabled={isSynced}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Reveal Overlay */}
            {!isComposed && seriesUid && (
                <div
                    className={`absolute inset-0 z-40 bg-black flex flex-col items-center justify-center animate-in fade-in duration-300 ${isThumbnail ? 'opacity-50' : ''}`}
                    data-status={status}
                >
                    {!isThumbnail && <div className="w-8 h-8 border-2 border-peregrine-accent border-t-transparent rounded-full animate-spin mb-3" />}
                    {status && <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{status}</div>}
                    {volumeProgress > 0 && volumeProgress < 100 && (
                        <div className="mt-2 w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-peregrine-accent transition-all duration-300" style={{ width: `${volumeProgress}%` }} />
                        </div>
                    )}
                </div>
            )}

            {/* Overlays */}
            {showOverlays && isComposed && !isThumbnail && (
                <OverlayManager
                    metadata={metadata}
                    isActive={isActive}
                />
            )}

            {/* Vertical Paging Slider */}
            {!isThumbnail && isComposed && metadata.totalInstances > 1 && (
                <VerticalPagingSlider
                    min={1}
                    max={metadata.totalInstances}
                    value={metadata.instanceNumber}
                    onChange={handleSliceSliderChange}
                />
            )}
        </div>
    );
};
