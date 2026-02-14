import { imageLoader, metaData } from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';

const metadataCache = new Map<string, any>();

/**
 * Normalizes imageId for metadata lookups (strips query parameters like ?forVolume=true)
 * Also ensures relative paths are resolved to absolute to prevent 2D/3D cache mismatches.
 */
function normalizePath(p: string): string {
    if (!p) return '';
    let filePath = p;
    try { filePath = decodeURIComponent(filePath); } catch (e) { }
    // Replace all backslashes with forward slashes for cross-platform key consistency
    filePath = filePath.replace(/\\/g, '/');
    if (!filePath.startsWith('/') && !filePath.includes(':')) {
        const managedDir = localStorage.getItem('peregrine_database_path');
        if (managedDir) {
            const cleanDir = managedDir.replace(/\\/g, '/').replace(/\/$/, '');
            filePath = cleanDir + '/' + filePath.replace(/^\//, '');
        }
    }
    return filePath;
}

function getCacheKey(imageId: string): string {
    if (!imageId) return '';
    let urlParts = imageId.split('?');
    let schemeAndPath = urlParts[0];
    if (schemeAndPath.startsWith('electronfile:')) {
        let rawPath = schemeAndPath.substring('electronfile:'.length);
        return `electronfile:${normalizePath(rawPath)}`;
    }
    return schemeAndPath;
}

// ★ Experimental: Allow external injection of metadata (from DB)
export function injectMetadata(imageId: string, metadata: any) {
    if (!metadata) return;

    // Ensure vital stats are present
    const imagePlaneModule = {
        ...metadata.imagePlaneModule,
        // Fallbacks
        sliceLocation: metadata.imagePlaneModule?.sliceLocation ?? metadata.imagePlaneModule?.imagePositionPatient?.[2] ?? 0,
    };

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

    if (!imageId || !imageId.startsWith('electronfile:')) return;

    // Strict lookup: Access the map directly
    const metadata = metadataCache.get(getCacheKey(imageId));

    if (!metadata) {
        // console.warn(`[electronMetadataProvider] MISSING METADATA for ${imageId}`);
        return;
    }

    if (type === 'imagePlaneModule') {
        const pm = metadata.imagePlaneModule;
        // console.log(`[electronMetadataProvider] Returning Plane for ${imageId}: Z=${pm.imagePositionPatient[2].toFixed(2)}`);
        return pm;
    }

    if (type === 'imagePixelModule') {
        const mod = metadata.imagePixelModule || {};
        return {
            ...mod,
            pixelRepresentation: 1,
            bitsAllocated: 32,
            bitsStored: 32,
            highBit: 31,
            samplesPerPixel: 1,
            photometricInterpretation: 'MONOCHROME2',
            rows: mod.rows || 512,
            columns: mod.columns || 512,
            rescaleIntercept: 0,
            rescaleSlope: 1,
        };
    }

    if (type === 'voiLutModule') {
        const voi = metadata.voiLutModule || {};
        return {
            windowCenter: Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter,
            windowWidth: Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth,
        };
    }

    if (type === 'modalityLutModule') return metadata.modalityLutModule;

    // --- ★ Corrected: Modality information ---
    if (type === 'generalSeriesModule') {
        const mod = metadata.generalSeriesModule || {};
        return {
            modality: mod.modality || 'CT',
            seriesNumber: mod.seriesNumber || 1,
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

// Global counter for debugging
let totalLoadedImages = 0;
// ★ FORCE Consistency: Capture the first FoR and use it for the entire series
let moduleFrameOfReferenceUID: string | null = null;
let moduleImageOrientationPatient: number[] | null = null;
let modulePixelSpacing: number[] | null = null;

export async function prefetchMetadata(imageIds: string[]) {
    console.log(`Loader: prefetchMetadata requested for ${imageIds.length} images`);
    // Reset Master trackers for new load batch (assuming single series load)
    if (imageIds.length > 1) {
        moduleFrameOfReferenceUID = null;
        moduleImageOrientationPatient = null;
        modulePixelSpacing = null;
    }

    const CHUNK_SIZE = 10; // Increase chunk size for better spacing detection
    let calculatedGeometrySpacing: number | null = null;
    let zPositions: number[] = [];

    for (let i = 0; i < imageIds.length; i += CHUNK_SIZE) {
        const chunk = imageIds.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (imageId, chunkIndex) => {
            const cacheKey = getCacheKey(imageId);

            // --- ★ Aggressive FoR & Consistency Check (Even on Cache Hit) ---
            if (metadataCache.has(cacheKey)) {
                const m = metadataCache.get(cacheKey);

                // --- ★ FORCE Metadata Consistency (Cache Upgrade) ---
                // If this image was loaded in 2D first, it might be 16-bit.
                // We MUST upgrade it to 32-bit float if it's a modality we patch,
                // otherwise Cornerstone will reject it from the 3D volume.
                const modality = m.originalAttributes?.modality || 'CT';
                const canPatch = ['CT', 'MR', 'PT', 'NM'].includes(modality);

                if (canPatch && m.imagePixelModule.bitsAllocated !== 32) {
                    m.imagePixelModule.bitsAllocated = 32;
                    m.imagePixelModule.bitsStored = 32;
                    m.imagePixelModule.highBit = 31;
                    m.imagePixelModule.pixelRepresentation = 1;
                    m.imagePixelModule.rescaleIntercept = 0;
                    m.imagePixelModule.rescaleSlope = 1;
                    // @ts-ignore
                    m.imagePixelModule.dataType = 'float32';
                }

                // Force shared Frame of Reference to prevent Cornerstone rejection
                if (moduleFrameOfReferenceUID) {
                    m.imagePlaneModule.frameOfReferenceUID = moduleFrameOfReferenceUID;
                } else {
                    moduleFrameOfReferenceUID = m.imagePlaneModule.frameOfReferenceUID;
                }

                // --- ★ FORCE Orientation & Spacing Consistency (Rejection Prevention) ---
                if (moduleImageOrientationPatient) {
                    m.imagePlaneModule.imageOrientationPatient = moduleImageOrientationPatient;
                    m.imagePlaneModule.rowCosines = moduleImageOrientationPatient.slice(0, 3);
                    m.imagePlaneModule.columnCosines = moduleImageOrientationPatient.slice(3, 6);
                } else {
                    moduleImageOrientationPatient = m.imagePlaneModule.imageOrientationPatient;
                }

                if (modulePixelSpacing) {
                    m.imagePlaneModule.pixelSpacing = modulePixelSpacing;
                    m.imagePlaneModule.rowPixelSpacing = modulePixelSpacing[0];
                    m.imagePlaneModule.columnPixelSpacing = modulePixelSpacing[1];
                } else {
                    modulePixelSpacing = m.imagePlaneModule.pixelSpacing;
                }

                const p = m.imagePlaneModule.imagePositionPatient;
                if (p && p.length === 3) zPositions.push(p[2]);
                return;
            }

            try {
                const filePath = normalizePath(imageId.replace('electronfile:', '').split('?')[0]);
                console.log(`[Loader] Prefetching: ${filePath} (from ${imageId})`);

                // @ts-ignore
                const buffer = await window.electron.readFile(filePath, { length: 512 * 1024 });
                if (!buffer) return;

                const uint8Array = new Uint8Array(buffer);
                const dataSet = dicomParser.parseDicom(uint8Array, { untilTag: 'x7fe00010' });

                const getMultiNumber = (tag: string) => (dataSet.string(tag) || '').split(/\\+/).map(s => parseFloat(s)).filter(n => !isNaN(n));
                const getSingleNumber = (tag: string, def: number) => {
                    const val = dataSet.string(tag);
                    if (!val) return def;
                    const n = parseFloat(val.split(/\\+/)[0]);
                    return isNaN(n) ? def : n;
                };

                const intercept = getSingleNumber('x00281052', 0);
                const slope = getSingleNumber('x00281053', 1);
                const rows = dataSet.uint16('x00280010') || 512;
                const columns = dataSet.uint16('x00280011') || 512;

                // --- ★ UNIVERSAL 32-BIT CHECK (Consistency FIX) ---
                const modality = dataSet.string('x00080060') || 'CT';
                const canPatch = ['CT', 'MR', 'PT', 'NM'].includes(modality);
                // We ALWAYS treat these as 32-bit floats to prevent 2D/3D cache poisoning!
                const willPatch = !dataSet.string('x00280004')?.includes('RGB') && (canPatch || intercept !== 0 || slope !== 1);

                const ts = dataSet.string('x00020010') || '1.2.840.10008.1.2.1';
                const uncompressedTS = ['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.2'];
                const isCompressed = !uncompressedTS.includes(ts);

                const imagePixelModule = {
                    samplesPerPixel: dataSet.uint16('x00280002') || 1,
                    photometricInterpretation: dataSet.string('x00280004') || 'MONOCHROME2',
                    rows, columns,
                    bitsAllocated: willPatch ? 32 : (dataSet.uint16('x00280100') || 16),
                    bitsStored: willPatch ? 32 : (dataSet.uint16('x00280101') || 16),
                    highBit: willPatch ? 31 : (dataSet.uint16('x00280102') || 15),
                    pixelRepresentation: willPatch ? 1 : (dataSet.uint16('x00280103') || 0),
                    rescaleIntercept: willPatch ? 0 : intercept,
                    rescaleSlope: willPatch ? 1 : slope,
                    // @ts-ignore
                    dataType: willPatch ? 'float32' : undefined,
                };

                let pos = getMultiNumber('x00200032');
                if (pos.length === 3) zPositions.push(pos[2]);

                if (pos.length !== 3) pos = [0, 0, i + chunkIndex];

                let orient = getMultiNumber('x00200037');
                if (orient.length !== 6) orient = [1, 0, 0, 0, 1, 0];
                let spacing = getMultiNumber('x00280030');
                if (spacing.length !== 2) spacing = [1, 1];

                // ★ FORCE EVERYTHING Consistency
                let currentFoR = dataSet.string('x00200052') || '1.2.3';
                if (!moduleFrameOfReferenceUID) {
                    moduleFrameOfReferenceUID = currentFoR;
                    console.log(`[Loader] Captured Master FrameOfReferenceUID: ${moduleFrameOfReferenceUID}`);
                } else {
                    currentFoR = moduleFrameOfReferenceUID;
                }

                if (!moduleImageOrientationPatient) {
                    moduleImageOrientationPatient = orient;
                    console.log(`[Loader] Captured Master Orientation: ${orient}`);
                } else {
                    orient = moduleImageOrientationPatient;
                }

                if (!modulePixelSpacing) {
                    modulePixelSpacing = spacing;
                    console.log(`[Loader] Captured Master Spacing: ${spacing}`);
                } else {
                    spacing = modulePixelSpacing;
                }

                metadataCache.set(cacheKey, {
                    imagePixelModule,
                    imagePlaneModule: {
                        rows, columns,
                        imagePositionPatient: pos,
                        imageOrientationPatient: orient,
                        rowCosines: orient.slice(0, 3),
                        columnCosines: orient.slice(3, 6),
                        pixelSpacing: spacing,
                        rowPixelSpacing: spacing[0],
                        columnPixelSpacing: spacing[1],
                        sliceThickness: getSingleNumber('x00180088', getSingleNumber('x00180050', 1.0)),
                        sliceLocation: pos[2],
                        frameOfReferenceUID: currentFoR,
                    },
                    voiLutModule: {
                        windowCenter: getSingleNumber('x00281050', 40),
                        windowWidth: getSingleNumber('x00281051', 400),
                    },
                    modalityLutModule: {
                        rescaleIntercept: willPatch ? 0 : intercept,
                        rescaleSlope: willPatch ? 1 : slope,
                    },
                    originalAttributes: {
                        rescaleIntercept: intercept,
                        rescaleSlope: slope,
                        bitsStored: dataSet.uint16('x00280101') || 16,
                        bitsAllocated: dataSet.uint16('x00280100') || 16,
                        pixelRepresentation: dataSet.uint16('x00280103') || 0,
                        transferSyntax: ts,
                        isCompressed,
                        modality,
                    },
                    generalSeriesModule: { modality },
                });
            } catch (e: any) {
                console.error(`Loader: Prefetch Error for ${imageId}. Path=${(e as any)?.path || 'unknown'}. Msg=${e?.message || e}`);
            }
        }));

        // Calculate Spacing from collected Z positions
        if (calculatedGeometrySpacing === null && zPositions.length > 1) {
            zPositions.sort((a, b) => a - b);
            // Find median spacing? Or just first diff
            for (let k = 0; k < zPositions.length - 1; k++) {
                const diff = Math.abs(zPositions[k + 1] - zPositions[k]);
                if (diff > 0.01) {
                    calculatedGeometrySpacing = diff;
                    console.log(`[Loader] Calculated Geometry Spacing=${diff}`);
                    break;
                }
            }
        }

        if (calculatedGeometrySpacing !== null) {
            const finalSpacing = Math.max(calculatedGeometrySpacing, 0.1);
            chunk.forEach(id => {
                const m = metadataCache.get(getCacheKey(id));
                if (m) m.imagePlaneModule.sliceThickness = finalSpacing;
            });
        }
    }
}

export function loadElectronImage(imageId: string) {
    console.log(`Loader: loadElectronImage triggered for ${imageId}`);
    return {
        promise: (async () => {
            // ...
            totalLoadedImages++;
            if (totalLoadedImages % 10 === 0) {
                console.log(`[Loader] Progress: ${totalLoadedImages} images loaded.`);
            }
            const filePath = normalizePath(imageId.replace('electronfile:', '').split('?')[0]);
            const queryParams = new URLSearchParams(imageId.split('?')[1] || '');

            const frameIndex = parseInt(queryParams.get('frame') || '0');
            if (isNaN(frameIndex)) console.error(`Loader: FrameIndex is NaN for ${imageId}`);

            const cacheKey = getCacheKey(imageId);
            if (!metadataCache.has(cacheKey)) await prefetchMetadata([imageId]);
            const meta = metadataCache.get(cacheKey);
            if (!meta) throw new Error(`[Loader] Metadata missing for ${imageId}`);

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
                    const cornerstoneImage = await imageLoader.loadImage(`wadouri:${blobUrl}`);
                    const decodedPixels = cornerstoneImage.getPixelData();
                    if (!decodedPixels) throw new Error("Decoded pixel data is empty");
                    for (let i = 0; i < Math.min(numPixels, decodedPixels.length); i++) {
                        float32Data[i] = decodedPixels[i];
                    }
                } catch (decodeErr) {
                    console.error(`Loader: DECODE FAILED for ${orig.transferSyntax}:`, decodeErr);
                    float32Data.fill(-1000);
                } finally {
                    URL.revokeObjectURL(blobUrl);
                }
                console.log(`[Loader] Decoded compressed frame for ${filePath}`);

                // [DIAGNOSTIC] Compressed Data Check
                if (frameIndex === 0) {
                    const val = float32Data[0];
                    console.log(`[DIAGNOSTIC] COMPRESSED ${imageId}: Intercept=${orig.rescaleIntercept}, Slope=${orig.rescaleSlope}, TS=${orig.transferSyntax}`);
                    console.log(`[DIAGNOSTIC] Pixel[0] (Pre-Rescale): Raw=${val} (Hex=${val?.toString(16)})`);
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

                // 1. 生データの読み込み (型を自動選択)
                if (bitsAllocated <= 8) {
                    rawData = new Uint8Array(ab, finalOffset, numPixels);
                } else if (pixelRepresentation === 1) {
                    // 東芝などはここ (Signed raw data)
                    if (finalOffset % 2 === 0) rawData = new Int16Array(ab, finalOffset, numPixels);
                    else rawData = new Int16Array(uint8Array.slice(frameOffset, frameOffset + frameSize).buffer);
                } else {
                    // Philipsなどはここ (Unsigned raw data) - User Fix: Int16Array + Safe Length
                    if (finalOffset % 2 === 0) {
                        const remainingBytes = ab.byteLength - finalOffset;
                        const safeLen = Math.min(numPixels, Math.floor(remainingBytes / 2));
                        if (safeLen < numPixels) {
                            console.warn(`[Loader] SHORT READ detected! Expected ${numPixels}, got ${safeLen}. TS=${orig.transferSyntax}, IsCompressed=${isCompressed}. Buffer=${ab.byteLength}, Offset=${finalOffset}`);
                        }
                        rawData = new Int16Array(ab, finalOffset, safeLen);
                    }
                    else rawData = new Int16Array(uint8Array.slice(frameOffset, frameOffset + frameSize).buffer);
                }

                // [DIAGNOSTIC] Metadata Check
                if (frameIndex === 0) {
                    console.log(`[DIAGNOSTIC] ${imageId}: Intercept=${rescaleIntercept}, Slope=${rescaleSlope}, Rep=${pixelRepresentation}, Bits=${bitsStored}/${bitsAllocated}`);
                    console.log(`[DIAGNOSTIC] Data Offset=${pixelDataAttr.dataOffset}, BufferSize=${uint8Array.byteLength}, FrameSize=${frameSize}`);
                }

                // 2. マスク処理の自動化 (Peregrine logic)
                let mask = 0xFFFF;
                if (pixelRepresentation === 0) {
                    mask = (1 << bitsStored) - 1;
                }

                // 3. 変換ループ
                for (let i = 0; i < numPixels; i++) {
                    let val = rawData[i];
                    // Handle short reads (undefined becomes 0)
                    if (val === undefined) val = 0; // Explicit zeroing for clarity

                    // [DIAGNOSTIC] Sample first 5 pixels
                    if (i < 5 && frameIndex === 0) {
                        console.log(`[DIAGNOSTIC] Pixel[${i}]: Raw=${val} (Hex=${val?.toString(16)}), Masked=${pixelRepresentation === 0 ? (val & mask) : val}, Out=${(val * rescaleSlope) + rescaleIntercept}`);
                    }

                    // Unsignedならマスク適用
                    if (pixelRepresentation === 0) {
                        val = val & mask;
                    }
                    // スロープ・切片適用 (物理量へ変換)
                    float32Data[i] = (val * rescaleSlope) + rescaleIntercept;
                }
            }

            // 4. データ範囲の計算 & VOIの自動設定
            // 簡易的に東芝などは -2048 固定でもOKだが、一応スキャンしても良い。
            // ここではユーザー指示通り固定値を優先。
            let min = -2048;
            let max = 32767;

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
                color: false,

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
                windowCenter: meta.voiLutModule.windowCenter,
                windowWidth: meta.voiLutModule.windowWidth,
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
                pixelRepresentation: 1,
                dataType: 'float32',
            };

            if (totalLoadedImages < 5 || totalLoadedImages % 100 === 0) {
                console.log(`[MAP-CHECK] ${imageId} maps to Z=${meta.imagePlaneModule.imagePositionPatient[2]}`);
            }

            let dataMin = Infinity, dataMax = -Infinity;
            for (let i = 0; i < float32Data.length; i += 100) {
                if (float32Data[i] < dataMin) dataMin = float32Data[i];
                if (float32Data[i] > dataMax) dataMax = float32Data[i];
            }

            console.log(`[HANDSHAKE] Loader: Returning 32-bit data for ${imageId}. Size=${float32Data.byteLength}, Type=${float32Data.constructor.name}, Range=[${dataMin}, ${dataMax}]`);
            return result;
        })()
    };
}
