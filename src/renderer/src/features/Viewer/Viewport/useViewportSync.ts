import { useEffect } from 'react';
import { addViewportToSync, removeViewportFromSync } from '../SyncManager';

export const useViewportSync = (
    viewportId: string,
    renderingEngineId: string,
    isThumbnail: boolean,
    isReady: boolean
) => {
    useEffect(() => {
        if (!isReady || isThumbnail) return;

        addViewportToSync(viewportId, renderingEngineId);
        return () => {
            removeViewportFromSync(viewportId, renderingEngineId);
        };
    }, [viewportId, renderingEngineId, isThumbnail, isReady]);
};
