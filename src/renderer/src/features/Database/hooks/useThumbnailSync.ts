import { useState, useEffect, useCallback } from 'react';
import { AntigravityDatabase } from '../db';
import { prefetchThumbnailForSeries } from '../thumbnailService';

export const useThumbnailSync = (db: AntigravityDatabase | null, databasePath: string | null) => {
    const [thumbnailMap, setThumbnailMap] = useState<Record<string, string>>({});

    const prefetchStudyThumbnails = useCallback(async (studyUid: string) => {
        if (!db) return;
        try {
            const series = await db.series.find({ selector: { studyInstanceUID: studyUid } }).exec();
            console.log(`[useThumbnailSync] Prefetching ${series.length} thumbnails for study ${studyUid}`);

            await Promise.all(series.map(s => prefetchThumbnailForSeries(db, s.seriesInstanceUID, databasePath)));
        } catch (err) {
            console.error('prefetchStudyThumbnails failed:', err);
        }
    }, [db, databasePath]);

    useEffect(() => {
        if (!db) return;
        const sub = db.thumbnails.find().$.subscribe(docs => {
            const map: Record<string, string> = {};
            docs.forEach(d => {
                map[d.seriesInstanceUID] = d.dataUrl;
            });
            setThumbnailMap(map);
        });
        return () => sub.unsubscribe();
    }, [db]);

    return {
        thumbnailMap,
        prefetchStudyThumbnails
    };
};
