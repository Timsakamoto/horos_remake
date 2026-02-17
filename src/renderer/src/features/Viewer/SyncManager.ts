import { SynchronizerManager } from '@cornerstonejs/tools';
import { Enums, metaData as csMetaData, getRenderingEngine, type Types } from '@cornerstonejs/core';

export const SYNC_GROUP_ID = 'stack-sync-group';
export const REF_LINE_SYNC_ID = 'reference-line-sync-group';
export const REF_LINE_STACK_SYNC_ID = 'reference-line-stack-sync-group';

const getActualViewport = (viewportRef: any) => {
    if (!viewportRef) return null;
    if (viewportRef.element) return viewportRef; // Already a viewport instance
    const vpId = viewportRef.viewportId || viewportRef.id;
    const engineId = viewportRef.renderingEngineId;
    if (!vpId || !engineId) return null;
    const engine = getRenderingEngine(engineId);
    return engine?.getViewport(vpId);
};

export const anatomicalSyncCallback = (
    _synchronizerInstance: any,
    sourceViewportRef: any,
    targetViewportRef: any
) => {
    const sourceViewport = getActualViewport(sourceViewportRef);
    const targetViewport = getActualViewport(targetViewportRef);

    if (!sourceViewport || !targetViewport || !sourceViewport.element || !targetViewport.element) return;

    // Sync Toggle check (respect data-sync-enabled attribute)
    // If attribute is missing, we assume enabled (default behavior)
    const sourceEnabled = sourceViewport.element.getAttribute('data-sync-enabled') !== 'false';
    const targetEnabled = targetViewport.element.getAttribute('data-sync-enabled') !== 'false';

    // Explicit return if disabled
    if (!sourceEnabled || !targetEnabled) return;

    // 1. Get Master (Source) Plane
    const sourceImageId = sourceViewport.getCurrentImageId();
    if (!sourceImageId) return;

    const sourceMeta = csMetaData.get('imagePlaneModule', sourceImageId);
    if (!sourceMeta || !sourceMeta.imagePositionPatient || !sourceMeta.imageOrientationPatient) return;

    const sourceIOP = sourceMeta.imageOrientationPatient;
    const sourceIPP = sourceMeta.imagePositionPatient;

    // 2. Target Check
    // We cast to StackViewport to be sure, though getActualViewport returns generic IViewport
    const stackTarget = targetViewport as Types.IStackViewport;

    // Safety check for StackViewport methods
    if (!stackTarget.getImageIds || !stackTarget.getCurrentImageId) return;

    const targetImageIds = stackTarget.getImageIds();
    const targetCurrentId = stackTarget.getCurrentImageId();
    if (!targetCurrentId) return;

    const targetCurrentMeta = csMetaData.get('imagePlaneModule', targetCurrentId);
    if (!targetCurrentMeta || !targetCurrentMeta.imageOrientationPatient) return;

    // VALIDATION 1: Orientation Compatibility (Normal Projection check)
    // Horos source: DCMView.m -(float) computeSliceLocation
    const getNormal = (iop: number[]) => {
        return [
            iop[1] * iop[5] - iop[2] * iop[4],
            iop[2] * iop[3] - iop[0] * iop[5],
            iop[0] * iop[4] - iop[1] * iop[3]
        ];
    };
    const sourceNormal = getNormal(sourceIOP);
    const targetIOP = targetCurrentMeta.imageOrientationPatient;
    const targetNormal = getNormal(targetIOP);

    // Dot product to check for parallel planes
    // We allow more deviation (0.90) to support slightly tilted series or different scanners
    // If dot product is near 1 or -1, they are parallel.
    const normalDot = sourceNormal[0] * targetNormal[0] + sourceNormal[1] * targetNormal[1] + sourceNormal[2] * targetNormal[2];
    if (Math.abs(normalDot) < 0.90) return;

    // 3. Calculate Anatomical Depth (Depth projected on Source Normal)
    // This effectively calculates the distance along the scan axis relative to source origin
    const sourceDepth = sourceIPP[0] * sourceNormal[0] + sourceIPP[1] * sourceNormal[1] + sourceIPP[2] * sourceNormal[2];

    let closestImageId = null;
    let minDistance = Infinity;

    // Iterate all target images to find the one closest to the source plane
    for (const imageId of targetImageIds) {
        const targetMeta = csMetaData.get('imagePlaneModule', imageId);
        if (targetMeta && targetMeta.imagePositionPatient) {
            const targetIPP = targetMeta.imagePositionPatient;

            // Project target IPP onto SOURCE normal
            const targetDepth = targetIPP[0] * sourceNormal[0] + targetIPP[1] * sourceNormal[1] + targetIPP[2] * sourceNormal[2];

            const distance = Math.abs(sourceDepth - targetDepth);

            if (distance < minDistance) {
                minDistance = distance;
                closestImageId = imageId;
            }
        }
    }

    // 4. Apply to Target ("Best Match")
    // We removed strict tolerance guards to ensure we always snap to the closest slice.
    if (closestImageId && closestImageId !== targetCurrentId) {
        const newIndex = targetImageIds.indexOf(closestImageId);

        if (newIndex !== -1) {
            // Perform Scan
            stackTarget.setImageIdIndex(newIndex);

            // Restore "Always Fit" behavior requested by user
            stackTarget.resetCamera();

            stackTarget.render();
        }
    }
}

export const createSynchronizers = () => {
    // 1. Image Slice Synchronizer
    let stackSync = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);
    if (!stackSync) {
        stackSync = SynchronizerManager.createSynchronizer(
            SYNC_GROUP_ID,
            Enums.Events.STACK_NEW_IMAGE,
            anatomicalSyncCallback
        );
    }

    // 2. Reference Line Synchronizer (for camera/MPR updates)
    let refLineSync = SynchronizerManager.getSynchronizer(REF_LINE_SYNC_ID);
    if (!refLineSync) {
        refLineSync = SynchronizerManager.createSynchronizer(
            REF_LINE_SYNC_ID,
            Enums.Events.CAMERA_MODIFIED,
            (_sync, _source, targetRef) => {
                const targetViewport = getActualViewport(targetRef);
                if (targetViewport && !targetViewport.isDisabled) {
                    // Use internal flag to avoid redundant RAFs
                    if (!(targetViewport as any)._pendingRefLineRender) {
                        (targetViewport as any)._pendingRefLineRender = true;
                        requestAnimationFrame(() => {
                            targetViewport.render();
                            (targetViewport as any)._pendingRefLineRender = false;
                        });
                    }
                }
            }
        );
    }

    // 3. Reference Line Stack Synchronizer (for paging updates)
    let refLineStackSync = SynchronizerManager.getSynchronizer(REF_LINE_STACK_SYNC_ID);
    if (!refLineStackSync) {
        refLineStackSync = SynchronizerManager.createSynchronizer(
            REF_LINE_STACK_SYNC_ID,
            Enums.Events.STACK_NEW_IMAGE,
            (_sync, _source, targetRef) => {
                const targetViewport = getActualViewport(targetRef);
                if (targetViewport && !targetViewport.isDisabled) {
                    if (!(targetViewport as any)._pendingRefLineRender) {
                        (targetViewport as any)._pendingRefLineRender = true;
                        requestAnimationFrame(() => {
                            targetViewport.render();
                            (targetViewport as any)._pendingRefLineRender = false;
                        });
                    }
                }
            }
        );
    }

    return { stackSync, refLineSync, refLineStackSync };
};

export const addViewportToRefLineSync = (viewportId: string, renderingEngineId: string) => {
    const engine = getRenderingEngine(renderingEngineId);
    if (!engine || !engine.getViewport(viewportId)) return;

    let refLineSync = SynchronizerManager.getSynchronizer(REF_LINE_SYNC_ID);
    let refLineStackSync = SynchronizerManager.getSynchronizer(REF_LINE_STACK_SYNC_ID);

    if (!refLineSync || !refLineStackSync) {
        ({ refLineSync, refLineStackSync } = createSynchronizers());
    }

    refLineSync?.add({ viewportId, renderingEngineId });
    refLineStackSync?.add({ viewportId, renderingEngineId });
};

export const addViewportToSync = (viewportId: string, renderingEngineId: string) => {
    const engine = getRenderingEngine(renderingEngineId);
    if (!engine || !engine.getViewport(viewportId)) return;

    let stackSync = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);

    if (!stackSync) {
        ({ stackSync } = createSynchronizers());
    }

    stackSync?.add({ viewportId, renderingEngineId });
};

export const removeViewportFromSync = (viewportId: string, renderingEngineId: string) => {
    const engine = getRenderingEngine(renderingEngineId);
    if (!engine) return;

    const stackSync = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);

    if (stackSync) stackSync.remove({ viewportId, renderingEngineId });
};

export const destroySynchronizer = () => {
    SynchronizerManager.destroySynchronizer(SYNC_GROUP_ID);
};

export const triggerInitialSync = (renderingEngineId: string, targetViewportId: string) => {
    const engine = getRenderingEngine(renderingEngineId);
    if (!engine) return;

    const targetViewport = engine.getViewport(targetViewportId);
    if (!targetViewport) return;

    const synchronizer = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);
    if (!synchronizer) return;

    // Resilient access to viewports list
    const syncedViewports = (synchronizer as any).getViewports?.() || (synchronizer as any).viewports || (synchronizer as any)._viewports;
    if (!syncedViewports || !Array.isArray(syncedViewports)) return;

    // Try to find a source viewport that is NOT the target
    const sourceRef = syncedViewports.find((v: any) => (v.viewportId || v.id) !== targetViewportId);
    if (!sourceRef) return;

    const sourceViewport = engine.getViewport(sourceRef.viewportId);
    if (!sourceViewport) return;

    anatomicalSyncCallback(synchronizer, sourceViewport, targetViewport);
};
