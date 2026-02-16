import { useEffect } from 'react';
import {
    getRenderingEngine,
    type Types,
} from '@cornerstonejs/core';
import { startCine, stopCine } from './CinePlayer';
import { type ToolMode } from './Toolbar';
import { useCornerstone } from './Viewport/useCornerstone';
import { useViewportTools } from './Viewport/useViewportTools';
import { useViewportSync } from './Viewport/useViewportSync';
import { ViewportOverlay } from './Viewport/ViewportOverlay';

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
    orientation?: 'Axial' | 'Coronal' | 'Sagittal' | 'Default';
    initialWindowWidth?: number;
    initialWindowCenter?: number;
    voiOverride?: { windowWidth: number; windowCenter: number } | null;
    onVoiChange?: () => void;
}

export const Viewport = ({
    viewportId,
    renderingEngineId,
    seriesUid,
    initialImageId = null,
    isThumbnail = false,
    activeTool = 'WindowLevel',
    activeCLUT = 'Default',
    isSynced = false,
    isCinePlaying = false,
    showOverlays = true,
    isActive = false,
    autoFit = false,
    orientation = 'Default',
    initialWindowWidth,
    initialWindowCenter,
    voiOverride,
    onVoiChange
}: Props) => {

    // 1. Core Cornerstone Logic (Loading, Rendering, VOI)
    const { elementRef, isReady, metadata, status } = useCornerstone({
        viewportId,
        renderingEngineId,
        seriesUid,
        initialImageId,
        isThumbnail,
        activeCLUT,
        autoFit,
        orientation,
        initialWindowWidth,
        initialWindowCenter,
        voiOverride,
        onVoiChange
    });

    // 2. Tool Management
    useViewportTools(activeTool, isThumbnail);

    // 3. Sync Management
    useViewportSync(viewportId, renderingEngineId, isThumbnail, isReady);

    // 4. Cine Player Control
    useEffect(() => {
        if (!isReady || isThumbnail) return;

        if (isCinePlaying) {
            startCine(viewportId, renderingEngineId);
        } else {
            stopCine(viewportId);
        }
    }, [isCinePlaying, viewportId, renderingEngineId, isThumbnail, isReady]);

    // 5. Sync Attribute for UI/Debugging
    useEffect(() => {
        if (elementRef.current) {
            elementRef.current.setAttribute('data-sync-enabled', isSynced.toString());
        }
    }, [isSynced, elementRef]);

    // 6. Event Handlers
    const handleSliceChange = (sliceIndex: number) => {
        const engine = getRenderingEngine(renderingEngineId);
        const viewport = engine?.getViewport(viewportId) as Types.IStackViewport;
        if (viewport && viewport.setImageIdIndex) {
            viewport.setImageIdIndex(sliceIndex - 1);
            viewport.render();
        }
    };



    return (
        <div className="w-full h-full relative bg-black group overflow-hidden">
            <div ref={elementRef} className="w-full h-full" onContextMenu={(e) => e.preventDefault()} />

            <ViewportOverlay
                isThumbnail={isThumbnail}
                isActive={isActive}
                seriesUid={seriesUid}
                metadata={metadata}
                showOverlays={showOverlays}
                status={status}
                onSliceChange={handleSliceChange}
            />
        </div>
    );
};
