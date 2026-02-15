import { SynchronizerManager } from '@cornerstonejs/tools';
import { Enums, metaData as csMetaData } from '@cornerstonejs/core';

export const SYNC_GROUP_ID = 'stack-sync-group';
export const VOI_SYNC_GROUP_ID = 'voi-sync-group';

export const createSynchronizers = () => {
    // 1. Image Slice Synchronizer
    let stackSync = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);
    if (!stackSync) {
        stackSync = SynchronizerManager.createSynchronizer(
            SYNC_GROUP_ID,
            Enums.Events.STACK_NEW_IMAGE,
            (
                _synchronizerInstance: any,
                sourceViewport: any,
                targetViewport: any,
                _sourceImageIndex: number,
                _targetImageIndex: number
            ) => {
                if (!sourceViewport || !targetViewport) return;

                // 1. Get Master (Source) IPP
                const sourceImageId = sourceViewport.getCurrentImageId();
                if (!sourceImageId) return;

                const sourceMeta = csMetaData.get('imagePlaneModule', sourceImageId);
                if (!sourceMeta || !sourceMeta.imagePositionPatient) return;

                const sourceZ = sourceMeta.imagePositionPatient[2];

                // 2. Nearest Neighbor Search in Target
                const targetImageIds = targetViewport.getImageIds();
                let closestImageId = null;
                let minDistance = Infinity;

                // Optimization: If we have many images, this could be slow, but for standard stacks it's fine.
                // In the future, we can cache IPP centers for viewports.
                for (const imageId of targetImageIds) {
                    const targetMeta = csMetaData.get('imagePlaneModule', imageId);
                    if (targetMeta && targetMeta.imagePositionPatient) {
                        const targetZ = targetMeta.imagePositionPatient[2];
                        const distance = Math.abs(sourceZ - targetZ);
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestImageId = imageId;
                        }
                    }
                }

                // 3. Apply to Target
                if (closestImageId && closestImageId !== targetViewport.getCurrentImageId()) {
                    targetViewport.setImageId(closestImageId);
                    targetViewport.render();
                }
            }
        );
    }

    // 2. VOI Synchronizer
    let voiSync = SynchronizerManager.getSynchronizer(VOI_SYNC_GROUP_ID);
    if (!voiSync) {
        voiSync = SynchronizerManager.createSynchronizer(
            VOI_SYNC_GROUP_ID,
            Enums.Events.VOI_MODIFIED,
            (
                _synchronizerInstance: any,
                sourceViewport: any,
                targetViewport: any,
                _voiModifiedEventDetail: any
            ) => {
                if (targetViewport && typeof targetViewport.setProperties === 'function') {
                    const sourceProperties = sourceViewport.getProperties();
                    if (sourceProperties.voiRange) {
                        targetViewport.setProperties({
                            voiRange: sourceProperties.voiRange
                        });
                        targetViewport.render();
                    }
                }
            }
        );
    }

    return { stackSync, voiSync };
};

export const addViewportToSync = (viewportId: string, renderingEngineId: string) => {
    let stackSync = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);
    let voiSync = SynchronizerManager.getSynchronizer(VOI_SYNC_GROUP_ID);

    if (!stackSync || !voiSync) {
        ({ stackSync, voiSync } = createSynchronizers());
    }

    stackSync?.add({ viewportId, renderingEngineId });
    voiSync?.add({ viewportId, renderingEngineId });
};

export const removeViewportFromSync = (viewportId: string, renderingEngineId: string) => {
    const stackSync = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);
    const voiSync = SynchronizerManager.getSynchronizer(VOI_SYNC_GROUP_ID);

    if (stackSync) stackSync.remove({ viewportId, renderingEngineId });
    if (voiSync) voiSync.remove({ viewportId, renderingEngineId });
};

export const destroySynchronizer = () => {
    SynchronizerManager.destroySynchronizer(SYNC_GROUP_ID);
    SynchronizerManager.destroySynchronizer(VOI_SYNC_GROUP_ID);
};
