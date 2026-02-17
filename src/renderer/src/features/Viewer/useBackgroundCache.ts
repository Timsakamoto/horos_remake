import { useState, useEffect, useRef, useCallback } from 'react';
import { cache, imageLoader } from '@cornerstonejs/core';

interface UseBackgroundCacheProps {
    seriesUid: string | null;
    imageIds: string[];
    initialIndex: number;
    enabled: boolean;
}

export const useBackgroundCache = ({
    seriesUid,
    imageIds,
    initialIndex,
    enabled
}: UseBackgroundCacheProps) => {
    const [cacheProgress, setCacheProgress] = useState<number | undefined>(undefined);
    const stopCachingRef = useRef(false);
    const lastTriggeredSeriesUid = useRef<string | null>(null);

    const startCaching = useCallback(async () => {
        if (!enabled || !seriesUid || imageIds.length <= 1) return;
        if (lastTriggeredSeriesUid.current === seriesUid) return;

        console.log(`[useBackgroundCache] Starting for ${seriesUid}, total: ${imageIds.length}`);
        lastTriggeredSeriesUid.current = seriesUid;
        stopCachingRef.current = false;
        setCacheProgress(0);

        const CHUNK_SIZE = 5;
        let loadedCount = 0;

        // Create a prioritized list: current index first, then outwards
        const priorityIds = [...imageIds];
        priorityIds.sort((a, b) => {
            const distA = Math.abs(imageIds.indexOf(a) - initialIndex);
            const distB = Math.abs(imageIds.indexOf(b) - initialIndex);
            return distA - distB;
        });

        for (let i = 0; i < priorityIds.length; i += CHUNK_SIZE) {
            if (stopCachingRef.current || lastTriggeredSeriesUid.current !== seriesUid) {
                console.log(`[useBackgroundCache] Interrupted for ${seriesUid}`);
                break;
            }

            const chunk = priorityIds.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(async (id) => {
                try {
                    if (!cache.getImage(id)) {
                        await imageLoader.loadAndCacheImage(id);
                    }
                } catch (e) {
                    // Silent failure for background cache
                } finally {
                    loadedCount++;
                }
            }));

            const progress = Math.round((loadedCount / imageIds.length) * 100);
            setCacheProgress(progress);

            // Breathing room for UI
            await new Promise(r => setTimeout(r, 100));
        }

        if (!stopCachingRef.current && lastTriggeredSeriesUid.current === seriesUid) {
            setCacheProgress(100);
            console.log(`[useBackgroundCache] ${seriesUid} caching complete.`);
        }
    }, [enabled, seriesUid, imageIds, initialIndex]);

    useEffect(() => {
        if (!enabled || !seriesUid) {
            setCacheProgress(undefined);
            lastTriggeredSeriesUid.current = null;
            return;
        }

        const timer = setTimeout(startCaching, 500);
        return () => {
            clearTimeout(timer);
            stopCachingRef.current = true;
        };
    }, [seriesUid, startCaching, enabled]);

    return { cacheProgress };
};
