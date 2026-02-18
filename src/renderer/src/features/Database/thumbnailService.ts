import * as cornerstone from '@cornerstonejs/core';
import { AntigravityDatabase } from './db';

const normalizeVal = (val: any) => {
    if (Array.isArray(val)) return Number(val[0]);
    return Number(val);
};

export async function generateThumbnail(imageId: string, ww?: number, wc?: number): Promise<string> {
    try {
        const image = await cornerstone.imageLoader.loadAndCacheImage(imageId);
        const canvas = document.createElement('canvas');
        const size = 256; // High quality thumbnail

        let width = image.width;
        let height = image.height;

        // Maintain aspect ratio
        if (width > height) {
            height = Math.round((height / width) * size);
            width = size;
        } else {
            width = Math.round((width / height) * size);
            height = size;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        // Draw to temp canvas for scaling and VOI adjustment
        const pixelData = image.getPixelData();
        const imageData = ctx.createImageData(image.width, image.height);

        const windowWidth = normalizeVal(ww !== undefined ? ww : (image.windowWidth || 400));
        const windowCenter = normalizeVal(wc !== undefined ? wc : (image.windowCenter || 40));

        const low = windowCenter - windowWidth / 2;
        const high = windowCenter + windowWidth / 2;

        // Simple linear mapping for thumbnail
        for (let i = 0; i < pixelData.length; i++) {
            let val = pixelData[i];

            // Apply VOI (Linear mapping to 0-255)
            val = ((val - low) / (high - low)) * 255;
            val = Math.min(255, Math.max(0, val));

            const offset = i * 4;
            imageData.data[offset] = val;     // R
            imageData.data[offset + 1] = val; // G
            imageData.data[offset + 2] = val; // B
            imageData.data[offset + 3] = 255; // A
        }

        // Scale to thumbnail size
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = image.width;
        tempCanvas.height = image.height;
        tempCanvas.getContext('2d')?.putImageData(imageData, 0, 0);

        ctx.drawImage(tempCanvas, 0, 0, width, height);

        return canvas.toDataURL('image/jpeg', 0.85);
    } catch (err) {
        // console.error('generateThumbnail error:', err);
        throw err;
    }
}

export async function prefetchThumbnailForSeries(db: AntigravityDatabase, seriesUid: string, databasePath?: string | null): Promise<string | null> {
    try {
        // 1. Check cache
        const existing = await db.thumbnails.findOne(seriesUid).exec();
        if (existing) return existing.dataUrl;

        // 2. Find middle image
        const subseries = await db.series.findOne(seriesUid).exec();
        if (!subseries) return null;

        const count = subseries.numberOfSeriesRelatedInstances || 0;
        const middleIndex = Math.floor(count / 2);

        const images = await db.images.find({
            selector: { seriesInstanceUID: seriesUid },
            sort: [{ instanceNumber: 'asc' }],
            limit: 1,
            skip: middleIndex
        }).exec();

        let imgDoc = images[0];
        if (!imgDoc && middleIndex > 0) {
            const firstResults = await db.images.find({
                selector: { seriesInstanceUID: seriesUid },
                sort: [{ instanceNumber: 'asc' }],
                limit: 1
            }).exec();
            imgDoc = firstResults[0];
        }

        if (!imgDoc) return null;

        let fullPath = imgDoc.filePath;
        if (fullPath && !(fullPath.startsWith('/') || /^[a-zA-Z]:/.test(fullPath)) && databasePath) {
            const sep = databasePath.includes('\\') ? '\\' : '/';
            fullPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${fullPath.replace(/^[\\/]/, '')}`;
        }

        const imageId = `electronfile:${fullPath}`;

        const wc = normalizeVal(imgDoc.windowCenter);
        const ww = normalizeVal(imgDoc.windowWidth);

        // 3. Generate
        const dataUrl = await generateThumbnail(imageId, ww, wc);

        // 4. Cache
        try {
            await db.thumbnails.insert({
                seriesInstanceUID: seriesUid,
                dataUrl,
                updatedAt: new Date().toISOString()
            });
        } catch (insertErr) {
            // Collision fallback
        }

        return dataUrl;
    } catch (err) {
        return null;
    }
}
