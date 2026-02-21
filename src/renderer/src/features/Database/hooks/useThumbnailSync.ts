import { useState, useEffect, useCallback } from 'react';
import { prefetchThumbnailForSeries } from '../thumbnailService';

export const useThumbnailSync = (databasePath: string | null) => {
    const [thumbnailMap, setThumbnailMap] = useState<Record<string, string>>({});

    const prefetchStudyThumbnails = useCallback(async (studyUid: string) => {
        try {
            // @ts-ignore
            const study = await window.electron.db.get('SELECT id FROM studies WHERE studyInstanceUID = ?', [studyUid]);
            if (!study) return;

            // @ts-ignore
            const series = await window.electron.db.query('SELECT seriesInstanceUID FROM series WHERE studyId = ?', [study.id]);
            console.log(`[useThumbnailSync] Prefetching ${series.length} thumbnails for study ${studyUid}`);

            await Promise.all(series.map((s: any) => prefetchThumbnailForSeries(s.seriesInstanceUID, databasePath)));
        } catch (err) {
            console.error('prefetchStudyThumbnails failed:', err);
        }
    }, [databasePath]);

    const refreshThumbnails = useCallback(async () => {
        try {
            // @ts-ignore
            const docs = await window.electron.db.query('SELECT seriesInstanceUID, data FROM thumbnails');
            const map: Record<string, string> = {};
            docs.forEach((d: any) => {
                map[d.seriesInstanceUID] = d.data;
            });
            setThumbnailMap(map);
        } catch (err) {
            console.error('Failed to fetch thumbnails:', err);
        }
    }, []);

    const clearThumbnailCache = useCallback(async (seriesUids?: string[]) => {
        try {
            if (seriesUids && seriesUids.length > 0) {
                const placeholder = seriesUids.map(() => '?').join(',');
                // @ts-ignore
                await window.electron.db.run(`DELETE FROM thumbnails WHERE seriesInstanceUID IN (${placeholder})`, seriesUids);
            } else {
                // @ts-ignore
                await window.electron.db.run('DELETE FROM thumbnails');
            }
            await refreshThumbnails();
        } catch (err) {
            console.error('Failed to clear thumbnails:', err);
        }
    }, [refreshThumbnails]);

    useEffect(() => {
        refreshThumbnails();
        // Option: Listen for DB changes if needed, but for now manual or interval
    }, [refreshThumbnails]);

    return {
        thumbnailMap,
        prefetchStudyThumbnails,
        clearThumbnailCache
    };
};
