import { SynchronizerManager } from '@cornerstonejs/tools';
import { Enums } from '@cornerstonejs/core';

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
                _sourceViewport: any,
                targetViewport: any,
                sourceImageIndex: number,
                _targetImageIndex: number
            ) => {
                if (targetViewport && typeof targetViewport.setImageIdIndex === 'function') {
                    // Only sync if indices are different to avoid infinite loops (though CS3D handles this)
                    if (targetViewport.getCurrentImageIdIndex() !== sourceImageIndex) {
                        targetViewport.setImageIdIndex(sourceImageIndex);
                    }
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
