import { useEffect, useState } from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';
import { ToolGroupManager, utilities as csToolsUtils } from '@cornerstonejs/tools';
import { OverlayManager } from './OverlayManager';
import { addViewportToSync, removeViewportFromSync, triggerInitialSync, addViewportToRefLineSync } from './SyncManager';
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

    // Handle Tool Group & Ref Line Sync Registration
    useEffect(() => {
        if (!isReady || isThumbnail) return;
        const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        toolGroup?.addViewport(viewportId, renderingEngineId);

        // Auto-enable Reference Lines Sync
        addViewportToRefLineSync(viewportId, renderingEngineId);
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

        const targetIndex = val - 1;

        if ((viewport as any).setSliceIndex) {
            (viewport as any).setSliceIndex(targetIndex);
        } else if ((viewport as any).setImageIdIndex) {
            (viewport as any).setImageIdIndex(targetIndex);
        } else {
            // Fallback for older or specific viewport types
            const current = (viewport as any).getSliceIndex ? (viewport as any).getSliceIndex() : (viewport as any).getCurrentImageIdIndex?.();
            const delta = targetIndex - (current || 0);
            if (delta !== 0) {
                csToolsUtils.scroll(viewport, { delta });
            }
        }

        viewport.render();
    };

    // Mac Scroll Optimization (Magic Mouse / Trackpad)
    useEffect(() => {
        if (!element || isThumbnail || !isReady) return;

        let accumulatedDelta = 0;
        const THRESHOLD = 12; // Adjusted for Magic Mouse / Trackpad smoothness

        const handleWheel = (e: WheelEvent) => {
            // Skip if modifiers are held (often used for zoom/pan)
            if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

            e.preventDefault();
            e.stopPropagation();

            accumulatedDelta += e.deltaY;

            if (Math.abs(accumulatedDelta) >= THRESHOLD) {
                const delta = accumulatedDelta > 0 ? 1 : -1;
                const engine = getRenderingEngine(renderingEngineId);
                const viewport = engine?.getViewport(viewportId);
                if (viewport) {
                    csToolsUtils.scroll(viewport, { delta });
                }
                accumulatedDelta = 0;
            }
        };

        element.addEventListener('wheel', handleWheel, { passive: false });
        return () => element.removeEventListener('wheel', handleWheel);
    }, [element, isReady, isThumbnail, renderingEngineId, viewportId]);


    return (
        <div
            className={`
                absolute inset-0 bg-black overflow-hidden group/vp
                ${isActive ? 'ring-2 ring-peregrine-accent ring-inset z-10' : 'ring-1 ring-white/5'}
            `}
            data-sync-enabled={isSynced}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* THE ACTUAL CORNERSTONE CANVAS AREA */}
            <div
                ref={setElement}
                className="absolute inset-0 w-full h-full"
            />

            {/* Reveal Overlay (on top of canvas) */}
            {!isComposed && seriesUid && (
                <div
                    className={`absolute inset-0 z-40 bg-black flex flex-col items-center justify-center ${isThumbnail ? 'opacity-50' : ''}`}
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

            {/* UI Overlays (Outside the canvas div but inside the root container) */}
            {showOverlays && isComposed && !isThumbnail && (
                <div className="absolute inset-0 pointer-events-none z-30">
                    <OverlayManager
                        metadata={metadata}
                        isActive={isActive}
                    />
                </div>
            )}

            {/* Vertical Paging Slider (High Z-index, clickable) */}
            {!isThumbnail && isComposed && metadata.totalInstances > 1 && (
                <div className="absolute right-0 top-0 bottom-0 z-50 pointer-events-none">
                    <div className="h-full relative pointer-events-auto">
                        <VerticalPagingSlider
                            min={1}
                            max={metadata.totalInstances}
                            value={metadata.instanceNumber}
                            onChange={handleSliceSliderChange}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
