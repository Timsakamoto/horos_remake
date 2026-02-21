import { imageLoader, metaData, cache } from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';

const metadataCache = new Map<string, any>();

export function clearMetadataCache(seriesInstanceUID?: string) {
    if (seriesInstanceUID) {
        // Clear specific series if provided
        for (const [key, value] of metadataCache.entries()) {
            if (value?.generalSeriesModule?.seriesInstanceUID === seriesInstanceUID) {
                metadataCache.delete(key);
            }
        }
    } else {
        metadataCache.clear();
    }
    console.log(`[electronLoader] Metadata cache cleared ${seriesInstanceUID ? `for series ${seriesInstanceUID}` : 'completely'}`);
}

/**
 * Normalizes imageId for metadata lookups (strips query parameters like ?forVolume=true)
 * Also ensures relative paths are resolved to absolute to prevent 2D/3D cache mismatches.
 */
function normalizePath(p: string): string {
    if (!p) return '';
    let filePath = p;
    try { filePath = decodeURIComponent(filePath); } catch (e) { }

    // Replace all backslashes with forward slashes
    filePath = filePath.replace(/\\/g, '/');

    // Remove double slashes (except at start of UNC paths if any)
    filePath = filePath.replace(/\/+/g, '/');

    // Detect if it's a Windows path (e.g. C:/...)
    const isWindows = /^[a-zA-Z]:/.test(filePath);

    // On non-Windows (macOS/Linux), ensure it starts with a single /
    if (!isWindows && !filePath.startsWith('/')) {
        filePath = '/' + filePath;
    }

    if (!filePath.startsWith('/') && !filePath.includes(':')) {
        const managedDir = localStorage.getItem('peregrine_database_path');
        if (managedDir) {
            const cleanDir = managedDir.replace(/\\/g, '/').replace(/\/$/, '');
            filePath = cleanDir + '/' + filePath.replace(/^\//, '');
        }
    }
    return filePath;
}

const round = (val: number[] | number): any => {
    if (Array.isArray(val)) return val.map(v => Math.round(v * 1000000) / 1000000);
    return Math.round(val * 1000000) / 1000000;
};

function getCacheKey(imageId: string): string {
    if (!imageId) return '';
    let urlParts = imageId.split('?');
    let schemeAndPath = urlParts[0];
    if (schemeAndPath.startsWith('electronfile://')) {
        let rawPath = schemeAndPath.substring('electronfile://'.length);
        return `electronfile://${normalizePath(rawPath)}`;
    }
    return schemeAndPath;
}

// ★ Experimental: Allow external injection of metadata (from DB)
export function injectMetadata(imageId: string, metadata: any) {
    if (!metadata) return;

    // Ensure vital stats are present
    const imagePlaneModule = {
        ...metadata.imagePlaneModule,
        imagePositionPatient: round(metadata.imagePlaneModule?.imagePositionPatient || [0, 0, 0]),
        imageOrientationPatient: round(metadata.imagePlaneModule?.imageOrientationPatient || [1, 0, 0, 0, 1, 0]),
        // Fallbacks
        sliceLocation: metadata.imagePlaneModule?.sliceLocation ?? metadata.imagePlaneModule?.imagePositionPatient?.[2] ?? 0,
    };

    // Calculate cosines if missing
    if (imagePlaneModule.imageOrientationPatient) {
        imagePlaneModule.rowCosines = imagePlaneModule.imageOrientationPatient.slice(0, 3);
        imagePlaneModule.columnCosines = imagePlaneModule.imageOrientationPatient.slice(3, 6);
    }

    metadataCache.set(getCacheKey(imageId), {
        ...metadata,
        imagePlaneModule
    });
    // console.log(`[electronLoader] Injected metadata for ${imageId}`);
}

export function registerElectronImageLoader() {
    console.log('Loader: registerElectronImageLoader called');
    cornerstoneDICOMImageLoader.configure({
        useWebWorkers: false,
        decodeConfig: { convertFloatPixelDataToInt: false },
    });
    imageLoader.registerImageLoader('electronfile', loadElectronImage);

    // Performance Tuning: Set cache to 1GB for smooth handling of large series
    // On professional workstations, this should ideally be 50-70% of available RAM.
    cache.setMaxCacheSize(1024 * 1024 * 1024);

    // Protect from multiple provider registrations
    try {
        // @ts-ignore
        if (!metaData.getProvider(electronMetadataProvider)) {
            metaData.addProvider(electronMetadataProvider, 10000);
        }
    } catch (e) {
        metaData.addProvider(electronMetadataProvider, 10000);
    }
}

function electronMetadataProvider(type: string, ...queries: any[]) {
    // Cornerstone sometimes passes (type, imageId) or (type, queryObj)
    const query = queries[0];
    const imageId = (typeof query === 'string') ? query : (query?.imageId || '');

    if (!imageId || !imageId.startsWith('electronfile://')) return;

    // Strict lookup: Access the map directly
    const metadata = metadataCache.get(getCacheKey(imageId));

    if (!metadata) {
        // console.warn(`[electronMetadataProvider] MISSING METADATA for ${imageId}`);
        return;
    }

    if (type === 'imagePlaneModule') {
        const pm = { ...metadata.imagePlaneModule };

        // Ensure robust structure for ReferenceLinesTool
        if (pm.imageOrientationPatient && (!pm.rowCosines || !pm.columnCosines)) {
            pm.rowCosines = pm.imageOrientationPatient.slice(0, 3);
            pm.columnCosines = pm.imageOrientationPatient.slice(3, 6);
        }

        if (pm.pixelSpacing && (!pm.rowPixelSpacing || !pm.columnPixelSpacing)) {
            pm.rowPixelSpacing = pm.pixelSpacing[0];
            pm.columnPixelSpacing = pm.pixelSpacing[1];
        }

        return pm;
    }

    if (type === 'imagePixelModule') {
        const mod = metadata.imagePixelModule || {};
        return {
            ...mod,
            pixelRepresentation: mod.pixelRepresentation ?? 1,
            bitsAllocated: mod.bitsAllocated ?? 32,
            bitsStored: mod.bitsStored ?? 32,
            highBit: mod.highBit ?? 31,
            samplesPerPixel: 1,
            photometricInterpretation: mod.photometricInterpretation || 'MONOCHROME2',
            rows: mod.rows,
            columns: mod.columns,
        };
    }

    if (type === 'voiLutModule') {
        const voi = metadata.voiLutModule || {};
        return {
            windowCenter: Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter,
            windowWidth: Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth,
        };
    }

    if (type === 'modalityLutModule') {
        const mod = metadata.modalityLutModule || {};
        return {
            rescaleIntercept: mod.rescaleIntercept ?? 0,
            rescaleSlope: mod.rescaleSlope ?? 1,
        };
    }

    // --- ★ Corrected: Modality information ---
    if (type === 'generalSeriesModule') {
        const mod = metadata.generalSeriesModule || {};
        return {
            modality: mod.modality,
            seriesNumber: mod.seriesNumber,
            seriesInstanceUID: mod.seriesInstanceUID || '',
        };
    }

    if (type === 'sopCommonModule') return metadata.sopCommonModule;
    return;
}

class ConcurrencyLimiter {
    private maxConcurrent = 30; // Increased
    private running = 0;
    private queue: (() => void)[] = [];
    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.running >= this.maxConcurrent) {
            await new Promise<void>(resolve => this.queue.push(resolve));
        }
        this.running++;
        try { return await fn(); }
        finally {
            this.running--;
            if (this.queue.length > 0) this.queue.shift()!();
        }
    }
}
const loadLimiter = new ConcurrencyLimiter();


const COMPRESSED_TS = [
    '1.2.840.10008.1.2.4.50', // JPEG Baseline
    '1.2.840.10008.1.2.4.51', // JPEG Extended
    '1.2.840.10008.1.2.4.57', // JPEG Lossless P14
    '1.2.840.10008.1.2.4.70', // JPEG Lossless P14 SV1
    '1.2.840.10008.1.2.4.80', // JPEG-LS Lossless
    '1.2.840.10008.1.2.4.81', // JPEG-LS Near-Lossless
    '1.2.840.10008.1.2.4.90', // JPEG 2000 Lossless
    '1.2.840.10008.1.2.4.91', // JPEG 2000
    '1.2.840.10008.1.2.5',    // RLE Lossless
];

function isCompressedTransferSyntax(ts: string): boolean {
    if (!ts) return false;
    return COMPRESSED_TS.includes(ts);
}

export async function prefetchMetadata(imageIds: string[]) {
    if (imageIds.length === 0) return;

    // Extract seriesUid from first imageId
    const firstImageId = imageIds[0];
    let seriesUid: string | null = null;
    if (firstImageId && firstImageId.includes('?')) {
        const query = firstImageId.split('?')[1];
        const params = new URLSearchParams(query);
        seriesUid = params.get('seriesUid');
    }

    if (!seriesUid) {
        const filePath = normalizePath(firstImageId.replace('electronfile://', '').split('?')[0]);
        try {
            // @ts-ignore
            const result = await window.electron.db.get(`
                SELECT s.seriesInstanceUID FROM instances i
                JOIN series s ON i.seriesId = s.id
                WHERE i.filePath LIKE ? OR i.filePath = ?
            `, [`%${filePath.split('/').pop()}`, filePath]);

            if (result) {
                seriesUid = result.seriesInstanceUID;
            }
        } catch (e) {
            console.error('[Loader] DB lookup for seriesUid failed:', e);
        }
    }

    if (!seriesUid) {
        console.warn('[Loader] No seriesUid found for prefetch');
        return;
    }

    console.log(`[Loader] Fast Prefetching metadata for series ${seriesUid} (${imageIds.length} images)...`);
    const startPrefetch = Date.now();

    try {
        // Fetch all instance rows for this series
        // @ts-ignore
        const rows = await window.electron.db.query(`
            SELECT 
                sopInstanceUID, filePath, rows, columns, pixelSpacing, sliceLocation,
                imagePositionPatient, imageOrientationPatient, windowCenter, windowWidth,
                rescaleIntercept, rescaleSlope, bitsAllocated, bitsStored, highBit, pixelRepresentation,
                transferSyntaxUID, modality, photometricInterpretation
            FROM instances i
            JOIN series s ON i.seriesId = s.id
            WHERE s.seriesInstanceUID = ?
        `, [seriesUid]);

        console.log(`[Loader] DB query for ${seriesUid} returned ${rows?.length || 0} rows.`);

        if (!rows || rows.length === 0) {
            console.warn(`[Loader] No database records found for series ${seriesUid}`);
            return;
        }

        // Map rows into the metadataCache
        for (const row of rows) {
            // Normalize row.filePath for comparison
            const normRowPath = (row.filePath || '').replace(/\\/g, '/');

            // Find the imageId that matches this SOPInstanceUID or filePath
            // In our system, imageId usually ends with the filePath.
            const matchingImageId = imageIds.find(id => {
                const normId = id.replace(/\\/g, '/');
                return normId.includes(normRowPath) || normId.includes(row.sopInstanceUID);
            });
            if (!matchingImageId) continue;

            const cacheKey = getCacheKey(matchingImageId);

            const ipp = row.imagePositionPatient ? row.imagePositionPatient.split('\\').map(Number) : [0, 0, row.sliceLocation || 0];
            const iop = row.imageOrientationPatient ? row.imageOrientationPatient.split('\\').map(Number) : [1, 0, 0, 0, 1, 0];
            const spacing = row.pixelSpacing ? row.pixelSpacing.split('\\').map(Number) : [1, 1];

            const willPatch = ['CT', 'MR', 'PT', 'NM'].includes(row.modality);

            metadataCache.set(cacheKey, {
                imagePixelModule: {
                    samplesPerPixel: 1, // Default, update if needed
                    photometricInterpretation: row.photometricInterpretation || 'MONOCHROME2',
                    rows: row.rows,
                    columns: row.columns,
                    bitsAllocated: willPatch ? 32 : (row.bitsAllocated || 16),
                    bitsStored: willPatch ? 32 : (row.bitsStored || 16),
                    highBit: willPatch ? 31 : (row.highBit || 15),
                    pixelRepresentation: willPatch ? 1 : (row.pixelRepresentation || 0),
                    rescaleIntercept: willPatch ? 0 : (row.rescaleIntercept || 0),
                    rescaleSlope: willPatch ? 1 : (row.rescaleSlope || 1),
                    // @ts-ignore
                    dataType: willPatch ? 'float32' : undefined,
                },
                imagePlaneModule: {
                    rows: row.rows,
                    columns: row.columns,
                    imagePositionPatient: round(ipp),
                    imageOrientationPatient: round(iop),
                    rowCosines: round(iop.slice(0, 3)),
                    columnCosines: round(iop.slice(3, 6)),
                    pixelSpacing: round(spacing),
                    rowPixelSpacing: round(spacing[0]),
                    columnPixelSpacing: round(spacing[1]),
                    sliceThickness: 1.0, // We'll improve this below
                    sliceLocation: round(row.sliceLocation || ipp[2]),
                    frameOfReferenceUID: row.frameOfReferenceUID || '1.2.3',
                },
                voiLutModule: {
                    windowCenter: row.windowCenter,
                    windowWidth: row.windowWidth,
                },
                modalityLutModule: {
                    rescaleIntercept: willPatch ? 0 : (row.rescaleIntercept || 0),
                    rescaleSlope: willPatch ? 1 : (row.rescaleSlope || 1),
                },
                originalAttributes: {
                    rescaleIntercept: row.rescaleIntercept,
                    rescaleSlope: row.rescaleSlope,
                    bitsStored: row.bitsStored,
                    bitsAllocated: row.bitsAllocated,
                    pixelRepresentation: row.pixelRepresentation,
                    transferSyntax: row.transferSyntaxUID,
                    modality: row.modality,
                    isCompressed: isCompressedTransferSyntax(row.transferSyntaxUID),
                },
                generalSeriesModule: {
                    modality: row.modality,
                    seriesInstanceUID: seriesUid // Tag for selective clearing
                },
            });
        }

        // Calculate slice thickness if possible
        const zPositions = rows.map((r: any) => r.sliceLocation).filter((z: any) => z !== null).sort((a: number, b: number) => a - b);
        if (zPositions.length > 1) {
            let thickness = 1.0;
            for (let i = 0; i < zPositions.length - 1; i++) {
                const diff = Math.abs(zPositions[i + 1] - zPositions[i]);
                if (diff > 0.01) {
                    thickness = diff;
                    break;
                }
            }
            // Apply to all in cache
            rows.forEach((r: any) => {
                const imgId = imageIds.find(id => {
                    const normId = id.replace(/\\/g, '/');
                    const normRowPath = (r.filePath || '').replace(/\\/g, '/');
                    return normId.includes(normRowPath);
                });
                if (imgId) {
                    const m = metadataCache.get(getCacheKey(imgId));
                    if (m) m.imagePlaneModule.sliceThickness = thickness;
                }
            });
        }

        console.log(`[Loader] Fast Prefetch complete for ${rows.length} images in ${Date.now() - startPrefetch}ms.`);

    } catch (err) {
        console.error('[Loader] Fast Prefetch failed:', err);
        // Fallback or bubble up? For now, we logging.
    }
}

export function loadElectronImage(imageId: string) {
    return {
        promise: (async () => {
            const filePath = normalizePath(imageId.replace('electronfile://', '').split('?')[0]);
            const queryParams = new URLSearchParams(imageId.split('?')[1] || '');

            const frameIndex = parseInt(queryParams.get('frame') || '0');
            if (isNaN(frameIndex)) console.error(`Loader: FrameIndex is NaN for ${imageId}`);

            const cacheKey = getCacheKey(imageId);
            // Don't just check has(), but also check if photometricInterpretation is in there 
            // from old versions. Actually, just prefetch if we haven't prefetched this image's series.
            if (!metadataCache.has(cacheKey)) await prefetchMetadata([imageId]);
            const meta = metadataCache.get(cacheKey);
            if (!meta) {
                console.error(`[Loader] Metadata missing for ${imageId}. CacheKeys count: ${metadataCache.size}`);
                throw new Error(`[Loader] Metadata missing for ${imageId}`);
            }

            const orig = meta.originalAttributes || {}; // Safeguard
            const buffer = await loadLimiter.run(() => window.electron.readFile(filePath));
            if (!buffer) throw new Error(`[Loader] Failed to read ${filePath}`);
            const uint8Array = new Uint8Array(buffer);

            const { rows, columns, samplesPerPixel = 1 } = meta.imagePixelModule;
            const numPixels = rows * columns * samplesPerPixel;
            let float32Data = new Float32Array(numPixels);

            // --- ★ Universal Pixel Pipeline (Peregrine Architecture) ---

            // Fix 1: Guard against undefined property
            const isCompressed = orig?.isCompressed || false;


            if (isCompressed) {
                // ... existing decompression code ...
                const blob = new Blob([uint8Array], { type: 'application/dicom' });
                const blobUrl = URL.createObjectURL(blob);
                try {
                    const cornerstoneImage = await imageLoader.loadImage(`wadouri:${blobUrl}${frameIndex > 0 ? '?frame=' + frameIndex : ''}`);
                    const decodedPixels = cornerstoneImage.getPixelData();
                    if (!decodedPixels) throw new Error("Decoded pixel data is empty");
                    for (let i = 0; i < Math.min(numPixels, decodedPixels.length); i++) {
                        float32Data[i] = decodedPixels[i];
                    }
                } finally {
                    URL.revokeObjectURL(blobUrl);
                }


                // ★ CRITICAL FIX: Apply Rescale Slope/Intercept for Compressed Data too
                // Cornerstone wadors/wadouri often returns raw pixel data, not Modality LUT transformed data.
                const slope = orig.rescaleSlope ?? 1;
                const intercept = orig.rescaleIntercept ?? 0;

                if (slope !== 1 || intercept !== 0) {
                    for (let i = 0; i < numPixels; i++) {
                        float32Data[i] = (float32Data[i] * slope) + intercept;
                    }
                }
            } else {
                const dataSet = dicomParser.parseDicom(uint8Array);
                const pixelDataAttr = dataSet.elements['x7fe00010'];
                if (!pixelDataAttr) throw new Error("No pixel data found");

                const pixelRepresentation = orig.pixelRepresentation ?? 0; // 0=Unsigned, 1=Signed
                const bitsAllocated = orig.bitsAllocated ?? 16;
                const bitsStored = orig.bitsStored ?? bitsAllocated;
                const rescaleSlope = orig.rescaleSlope ?? 1;
                const rescaleIntercept = orig.rescaleIntercept ?? 0;

                // Safety check for frame offset
                const frameSize = numPixels * (bitsAllocated / 8);
                const frameOffset = pixelDataAttr.dataOffset + (frameIndex * frameSize);

                if (frameOffset + frameSize > uint8Array.byteLength) {
                    // Buffer overrun protection
                }

                const ab = uint8Array.buffer;
                const finalOffset = uint8Array.byteOffset + frameOffset;
                let rawData;

                if (bitsAllocated <= 8) {
                    rawData = new Uint8Array(ab, finalOffset, numPixels);
                } else if (pixelRepresentation === 1) {
                    if (finalOffset % 2 === 0) rawData = new Int16Array(ab, finalOffset, numPixels);
                    else rawData = new Int16Array(uint8Array.slice(frameOffset, frameOffset + frameSize).buffer);
                } else {
                    if (finalOffset % 2 === 0) {
                        const remainingBytes = ab.byteLength - finalOffset;
                        const safeLen = Math.min(numPixels, Math.floor(remainingBytes / 2));
                        rawData = new Uint16Array(ab, finalOffset, safeLen);
                    }
                    else rawData = new Uint16Array(uint8Array.slice(frameOffset, frameOffset + frameSize).buffer);
                }

                // 2. マスク処理の自動化 (Peregrine logic)
                let mask = 0xFFFF;
                if (pixelRepresentation === 0) {
                    mask = (1 << bitsStored) - 1;
                }

                // 3. 変換ループ
                for (let i = 0; i < numPixels; i++) {
                    let val = rawData[i];
                    if (val === undefined) val = 0;

                    // Unsignedならマスク適用
                    if (pixelRepresentation === 0) {
                        val = val & mask;
                    }

                    // スロープ・切片適用 (物理量へ変換)
                    float32Data[i] = (val * rescaleSlope) + rescaleIntercept;
                }
            }

            // 4. データ範囲の計算 & VOIの自動設定
            let dataMin = Infinity;
            let dataMax = -Infinity;
            // PERFORMANCE: Sample pixels to find range if data is large, or just scan all since it's Float32
            for (let i = 0; i < float32Data.length; i++) {
                const val = float32Data[i];
                if (val < dataMin) dataMin = val;
                if (val > dataMax) dataMax = val;
            }

            // Fallback for empty/constant images
            if (dataMin === Infinity) { dataMin = 0; dataMax = 1; }
            if (dataMin === dataMax) dataMax = dataMin + 1;

            const min = dataMin;
            const max = dataMax;

            // --- ★ Cornerstoneへの返却 (ここが最重要) ---
            const result = {
                imageId,
                pixelData: float32Data,
                getPixelData: () => float32Data,

                // Dimensions
                rows: meta.imagePixelModule.rows,
                columns: meta.imagePixelModule.columns,
                height: meta.imagePixelModule.rows,
                width: meta.imagePixelModule.columns,
                color: (meta.imagePixelModule.samplesPerPixel || 1) > 1,

                // Spacing & Geometry (Critical for Volume: USE CACHED VALUES)
                columnPixelSpacing: meta.imagePlaneModule.columnPixelSpacing,
                rowPixelSpacing: meta.imagePlaneModule.rowPixelSpacing,
                sliceThickness: meta.imagePlaneModule.sliceThickness,
                // FORCE use of cached IPP which matches the Volume Geometry
                imagePositionPatient: meta.imagePlaneModule.imagePositionPatient,
                imageOrientationPatient: meta.imagePlaneModule.imageOrientationPatient,
                rowCosines: meta.imagePlaneModule.rowCosines,
                columnCosines: meta.imagePlaneModule.columnCosines,
                sliceLocation: meta.imagePlaneModule.sliceLocation,
                frameOfReferenceUID: meta.imagePlaneModule.frameOfReferenceUID,
                pixelSpacing: meta.imagePlaneModule.pixelSpacing,

                // Pixel Data Properties (Already Scaled)
                minPixelValue: min,
                maxPixelValue: max,
                slope: 1,
                intercept: 0,

                // Display & render properties
                windowCenter: (meta.voiLutModule.windowCenter !== undefined && meta.voiLutModule.windowCenter !== 0)
                    ? meta.voiLutModule.windowCenter
                    : (dataMin + dataMax) / 2,
                windowWidth: (meta.voiLutModule.windowWidth !== undefined && meta.voiLutModule.windowWidth !== 0)
                    ? meta.voiLutModule.windowWidth
                    : (dataMax - dataMin),
                render: undefined,
                getCanvas: undefined,
                numComps: 1,

                // Cornerstone3D Flags
                preScale: {
                    scaled: true,
                },
                decodedAndCached: true,
                sizeInBytes: float32Data.byteLength,
                bitsAllocated: 32,
                bitsStored: 32,
                pixelRepresentation: 1, // Scaled data is float, but Cornerstone uses this to check signed/unsigned
                photometricInterpretation: meta.imagePixelModule.photometricInterpretation,
                dataType: 'float32',
            };

            return result;
        })()
    };
}
