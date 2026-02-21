import * as cornerstone from '@cornerstonejs/core';

const normalizeVal = (val: any) => {
    if (Array.isArray(val)) return Number(val[0]);
    return Number(val);
};

export async function generateThumbnail(imageId: string, ww?: number, wc?: number): Promise<string> {
    try {
        console.log(`[generateThumbnail] Loading image: ${imageId}`);
        const image = await cornerstone.imageLoader.loadAndCacheImage(imageId);
        console.log(`[generateThumbnail] Image loaded: ${image.width}x${image.height}, Photometric: ${image.photometricInterpretation}`);

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

        if (width <= 0 || height <= 0 || isNaN(width) || isNaN(height)) {
            console.warn(`[generateThumbnail] Invalid dimensions: ${width}x${height} for ${imageId}`);
            throw new Error('Invalid image dimensions');
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

        const isInverted = image.photometricInterpretation === 'MONOCHROME1';
        const samplesPerPixel = (image as any).samplesPerPixel || 1;
        const totalPixels = image.width * image.height;

        if (samplesPerPixel >= 3) {
            // Color image (RGB) — copy directly, no VOI windowing
            for (let p = 0; p < totalPixels; p++) {
                const srcOffset = p * samplesPerPixel;
                const dstOffset = p * 4;
                imageData.data[dstOffset] = pixelData[srcOffset];     // R
                imageData.data[dstOffset + 1] = pixelData[srcOffset + 1]; // G
                imageData.data[dstOffset + 2] = pixelData[srcOffset + 2]; // B
                imageData.data[dstOffset + 3] = 255;                     // A
            }
        } else {
            // Grayscale — apply VOI windowing
            for (let i = 0; i < totalPixels; i++) {
                let val = pixelData[i];
                val = ((val - low) / (high - low)) * 255;
                val = Math.min(255, Math.max(0, val));
                if (isInverted) val = 255 - val;

                const offset = i * 4;
                imageData.data[offset] = val; // R
                imageData.data[offset + 1] = val; // G
                imageData.data[offset + 2] = val; // B
                imageData.data[offset + 3] = 255; // A
            }
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

// @ts-ignore
export async function prefetchThumbnailForSeries(seriesUid: string, databasePath?: string | null): Promise<string | null> {
    try {
        // 1. Check cache
        // @ts-ignore
        const existing = await window.electron.db.get('SELECT data FROM thumbnails WHERE seriesInstanceUID = ?', [seriesUid]);
        if (existing) return existing.data;

        // 2. Find middle image
        // First get the series ID and count
        // @ts-ignore
        const series = await window.electron.db.get('SELECT id, numberOfFrames FROM series WHERE seriesInstanceUID = ?', [seriesUid]);
        if (!series) return null;

        const count = series.numberOfFrames || 1;
        const middleIndex = Math.floor(count / 2);

        // @ts-ignore
        const images = await window.electron.db.query(`
            SELECT filePath 
            FROM instances 
            WHERE seriesId = ? 
            ORDER BY instanceNumber ASC 
            LIMIT 1 OFFSET ?
        `, [series.id, middleIndex]);

        let imgDoc = images[0];
        if (!imgDoc && middleIndex > 0) {
            // @ts-ignore
            const firstResults = await window.electron.db.query('SELECT filePath FROM instances WHERE seriesId = ? ORDER BY instanceNumber ASC LIMIT 1', [series.id]);
            imgDoc = firstResults[0];
        }

        if (!imgDoc) return null;

        let fullPath = imgDoc.filePath;
        if (fullPath && !(fullPath.startsWith('/') || /^[a-zA-Z]:/.test(fullPath)) && databasePath) {
            const sep = databasePath.includes('\\') ? '\\' : '/';
            fullPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${fullPath.replace(/^[\\/]/, '')}`;
        }

        const imageId = `electronfile://${fullPath}?seriesUid=${seriesUid}`;
        console.log(`[thumbnailService] Generating for ${seriesUid} using ${imageId}`);

        // 3. Generate with Retry
        // ww/wc omitted for now as they are not in our base schema yet (or we use defaults)
        let dataUrl: string | null = null;
        let lastErr: any = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                dataUrl = await generateThumbnail(imageId);
                if (dataUrl) break;
            } catch (err) {
                lastErr = err;
                console.warn(`[thumbnailService] Attempt ${attempt} failed for ${seriesUid}:`, err);
                await new Promise(r => setTimeout(r, 200 * attempt)); // Exponential backoff
            }
        }

        if (!dataUrl) {
            console.error(`[thumbnailService] All attempts failed for ${seriesUid}. Last error:`, lastErr);
            return null;
        }

        // 4. Cache
        try {
            // @ts-ignore
            await window.electron.db.run(`
                INSERT INTO thumbnails (id, seriesInstanceUID, data)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data
            `, [seriesUid, seriesUid, dataUrl]);
            console.log(`[thumbnailService] Successfully cached thumbnail for ${seriesUid}`);
        } catch (insertErr) {
            console.error('Thumbnail cache insert failed:', insertErr);
        }

        return dataUrl;
    } catch (err) {
        console.error('prefetchThumbnailForSeries failed:', err);
        return null;
    }
}
