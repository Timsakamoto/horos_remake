import { SynchronizerManager } from '@cornerstonejs/tools';

export const SYNC_GROUP_ID = 'stack-sync-group';

export const createSynchronizer = () => {
    let synchronizer = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);
    if (!synchronizer) {
        synchronizer = SynchronizerManager.createSynchronizer(
            SYNC_GROUP_ID,
            'STACK_NEW_IMAGE',
            (
                _synchronizerInstance: any,
                _sourceViewport: any,
                targetViewport: any,
                sourceImageIndex: number,
                _targetImageIndex: number
            ) => {
                if (targetViewport && typeof targetViewport.setImageIdIndex === 'function') {
                    targetViewport.setImageIdIndex(sourceImageIndex);
                }
            }
        );
    }
    return synchronizer;
};

export const addViewportToSync = (viewportId: string, renderingEngineId: string) => {
    const synchronizer = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);
    if (synchronizer) {
        synchronizer.add({ viewportId, renderingEngineId });
    }
};

export const removeViewportFromSync = (viewportId: string, renderingEngineId: string) => {
    const synchronizer = SynchronizerManager.getSynchronizer(SYNC_GROUP_ID);
    if (synchronizer) {
        synchronizer.remove({ viewportId, renderingEngineId });
    }
};

export const destroySynchronizer = () => {
    SynchronizerManager.destroySynchronizer(SYNC_GROUP_ID);
};
