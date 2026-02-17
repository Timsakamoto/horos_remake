import { useEffect, useRef, useState } from 'react';
import {
    getRenderingEngine,
    Enums,
    type Types,
} from '@cornerstonejs/core';
import { ToolGroupManager, utilities as csToolsUtils } from '@cornerstonejs/tools';
import { useViewportLoader } from './useViewportLoader';
import { VerticalPagingSlider } from './VerticalPagingSlider';
import { OverlayManager } from './OverlayManager';
import {
    ToolMode,
    RENDERING_ENGINE_ID,
    ProjectionMode,
    VOI,
    TOOL_GROUP_ID
} from './types';

interface Props {
    seriesUid: string;
    activeTool: ToolMode;
    projectionMode?: ProjectionMode;
    slabThickness?: number;
    orientation?: 'MPR' | 'Axial' | 'Coronal' | 'Sagittal';
    voiOverride?: VOI | null;
    onVoiChange?: () => void;
}

const AXIAL_VIEWPORT_ID = 'axial-mpr';
const SAGITTAL_VIEWPORT_ID = 'sagittal-mpr';
const CORONAL_VIEWPORT_ID = 'coronal-mpr';

export const OrthoView = ({
    seriesUid,
    projectionMode = 'NORMAL',
    slabThickness = 0,
    orientation = 'MPR',
    voiOverride,
    onVoiChange,
    activeTool
}: Props) => {
    const [axialElement, setAxialElement] = useState<HTMLDivElement | null>(null);
    const [sagittalElement, setSagittalElement] = useState<HTMLDivElement | null>(null);
    const [coronalElement, setCoronalElement] = useState<HTMLDivElement | null>(null);

    const axial = useViewportLoader({
        viewportId: AXIAL_VIEWPORT_ID,
        renderingEngineId: RENDERING_ENGINE_ID,
        element: axialElement,
        seriesUid,
        orientation: 'Axial',
        voiOverride,
        onVoiChange,
        activeCLUT: undefined // Internal state handles this
    });

    const sagittal = useViewportLoader({
        viewportId: SAGITTAL_VIEWPORT_ID,
        renderingEngineId: RENDERING_ENGINE_ID,
        element: sagittalElement,
        seriesUid,
        orientation: 'Sagittal',
        voiOverride,
        onVoiChange,
        activeCLUT: undefined
    });

    const coronal = useViewportLoader({
        viewportId: CORONAL_VIEWPORT_ID,
        renderingEngineId: RENDERING_ENGINE_ID,
        element: coronalElement,
        seriesUid,
        orientation: 'Coronal',
        voiOverride,
        onVoiChange,
        activeCLUT: undefined
    });

    // Register with toolgroup
    useEffect(() => {
        if (!axial.isReady || !sagittal.isReady || !coronal.isReady) return;
        const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
        if (toolGroup) {
            [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID].forEach(id => {
                if (!toolGroup.getViewportIds().includes(id)) {
                    toolGroup.addViewport(id, RENDERING_ENGINE_ID);
                }
            });
        }
    }, [axial.isReady, sagittal.isReady, coronal.isReady]);

    // Update Slab/MIP
    useEffect(() => {
        const re = getRenderingEngine(RENDERING_ENGINE_ID);
        if (!re) return;

        [AXIAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID].forEach(id => {
            const vp = re.getViewport(id) as Types.IVolumeViewport;
            if (vp && vp.setBlendMode) {
                let bm = Enums.BlendModes.COMPOSITE;
                if (projectionMode === 'MIP') bm = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
                else if (projectionMode === 'MINIP') bm = Enums.BlendModes.MINIMUM_INTENSITY_BLEND;
                vp.setBlendMode(bm);
                vp.setSlabThickness(slabThickness);
            }
        });
        re.render();
    }, [projectionMode, slabThickness, axial.isReady, sagittal.isReady, coronal.isReady]);

    const handleSliderChange = (vpId: string, val: number) => {
        const re = getRenderingEngine(RENDERING_ENGINE_ID);
        const vp = re?.getViewport(vpId) as Types.IVolumeViewport;
        if (vp) {
            const current = vp.getSliceIndex();
            const delta = (val - 1) - current;
            if (delta !== 0) csToolsUtils.scroll(vp, { delta });
        }
    };

    const isLoading = !axial.isComposed || !sagittal.isComposed || !coronal.isComposed;
    const progress = Math.round((axial.volumeProgress + sagittal.volumeProgress + coronal.volumeProgress) / 3);

    const renderViewport = (id: string, setRef: any, label: string, color: string, loader: any) => {
        const isVisible = orientation === 'MPR' || orientation === label;
        if (!isVisible) return null;

        return (
            <div className={`relative flex-1 h-full border border-${color}-500/30 overflow-hidden group cursor-crosshair bg-black`}>
                <div ref={setRef} className="w-full h-full" onContextMenu={e => e.preventDefault()} />
                <div className={`absolute top-2 left-2 text-${color}-500 font-black text-xs opacity-50 group-hover:opacity-100 transition-opacity uppercase tracking-widest pointer-events-none`}>{label}</div>

                {loader.isComposed && loader.metadata.totalInstances > 1 && (
                    <VerticalPagingSlider
                        min={1}
                        max={loader.metadata.totalInstances}
                        value={loader.metadata.instanceNumber}
                        onChange={(v) => handleSliderChange(id, v)}
                    />
                )}

                {loader.isComposed && (
                    <OverlayManager metadata={loader.metadata} />
                )}
            </div>
        );
    };

    return (
        <div className="w-full h-full relative bg-black">
            {isLoading && seriesUid && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 text-white">
                    <div className="w-12 h-12 border-4 border-peregrine-accent border-t-transparent rounded-full animate-spin mb-4" />
                    <div className="text-2xl font-black tracking-widest uppercase mb-1">Loading MPR...</div>
                    <div className="text-sm opacity-50">{progress}% COMPLETE</div>
                </div>
            )}

            <div className={`grid w-full h-full gap-1 p-1 bg-black ${orientation === 'MPR' ? 'grid-cols-3' : 'grid-cols-1'}`}>
                {renderViewport(AXIAL_VIEWPORT_ID, setAxialElement, 'Axial', 'blue', axial)}
                {renderViewport(SAGITTAL_VIEWPORT_ID, setSagittalElement, 'Sagittal', 'yellow', sagittal)}
                {renderViewport(CORONAL_VIEWPORT_ID, setCoronalElement, 'Coronal', 'green', coronal)}
            </div>
        </div>
    );
};
