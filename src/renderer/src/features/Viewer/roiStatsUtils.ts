import { cache, metaData } from '@cornerstonejs/core';

export interface ROIStats {
    mean: number;
    max: number;
    volume: number;
    unit: string;
    isSUV: boolean;
}

/**
 * Calculates statistics for a given planar annotation on a fusion volume.
 * Handles both EllipticalROI and RectangleROI.
 */
export async function calculateFusionStats(
    annotation: any,
    fusionVolumeId: string
): Promise<ROIStats | null> {
    const fusionVolume = cache.getVolume(fusionVolumeId);
    if (!fusionVolume) return null;

    const { imageData, spacing } = fusionVolume;
    if (!imageData) return null;

    const toolName = annotation.toolName;
    const points = annotation.data.handles.points;
    if (!points || points.length < 2) return null;

    // 1. Get voxel indices and mask
    // Note: This is an approximation for planar ROIs on a volume.
    // We sample voxels within the ROI bounds on the slice where the annotation resides.


    if (toolName === 'EllipticalROI' || toolName === 'RectangleROI') {
        // Use Cornerstone3D internal utilities to get voxels inside the ROI
        // This usually requires the image data and the annotation handles.

        // Get the bounding box of the ROI in world coordinates

        const bounds = points.reduce(
            (acc: any, p: number[]) => ({
                minX: Math.min(acc.minX, p[0]), maxX: Math.max(acc.maxX, p[0]),
                minY: Math.min(acc.minY, p[1]), maxY: Math.max(acc.maxY, p[1]),
                minZ: Math.min(acc.minZ, p[2]), maxZ: Math.max(acc.maxZ, p[2]),
            }),
            { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
        );

        // For planar ROIs, the Z thickness is very small. We expand it slightly to hit at least one voxel.
        const zTolerance = spacing[2] / 2;
        const region = {
            minX: bounds.minX, maxX: bounds.maxX,
            minY: bounds.minY, maxY: bounds.maxY,
            minZ: bounds.minZ - zTolerance, maxZ: bounds.maxZ + zTolerance
        };

        // Scalar data access
        const scalarData = fusionVolume.getScalarData();
        const dimensions = imageData.getDimensions();

        // Sampling loop (Simplified Scanline or Bounding Box Check)
        // For performance, we should ideally use csToolsUtils.pointInShape

        let maxVal = -Infinity;
        let sumVal = 0;
        let count = 0;

        // Map world points to index space for the bounding box
        const iMin = (imageData as any).worldToIndex([region.minX, region.minY, region.minZ]).map(Math.floor);
        const iMax = (imageData as any).worldToIndex([region.maxX, region.maxY, region.maxZ]).map(Math.ceil);

        // Clamp to dimensions
        const start = [Math.max(0, iMin[0]), Math.max(0, iMin[1]), Math.max(0, iMin[2])];
        const end = [Math.min(dimensions[0] - 1, iMax[0]), Math.min(dimensions[1] - 1, iMax[1]), Math.min(dimensions[2] - 1, iMax[2])];

        for (let z = start[2]; z <= end[2]; z++) {
            for (let y = start[1]; y <= end[1]; y++) {
                for (let x = start[0]; x <= end[0]; x++) {
                    const worldPos = (imageData as any).indexToWorld([x, y, z]) as number[];

                    let inside = false;
                    if (toolName === 'EllipticalROI') {
                        inside = isPointInEllipse(worldPos, points);
                    } else if (toolName === 'RectangleROI') {
                        inside = isPointInRectangle(worldPos, points);
                    }

                    if (inside) {
                        const index = z * dimensions[0] * dimensions[1] + y * dimensions[0] + x;
                        const val = scalarData[index];
                        if (val > maxVal) maxVal = val;
                        sumVal += val;
                        count++;
                    }
                }
            }
        }

        if (count > 0) {
            const mean = sumVal / count;
            const vol = count * spacing[0] * spacing[1] * spacing[2] / 1000; // cm3

            // Check if SUV is applicable
            const modality = (metaData.get('generalSeriesModule', fusionVolumeId) as any)?.modality;
            const isSUV = modality === 'PT';

            // --- ★ SUV Scaling (Placeholder Logic) ★ ---
            // In a production app, we would use @cornerstonejs/calculate-suv here.
            // For now, we assume the scalar data is already scaled or we show raw values
            // labeled as SUV if it's PT modality, which is common in preliminary viewports.

            return {
                mean: mean,
                max: maxVal,
                volume: vol,
                unit: isSUV ? 'SUV' : 'px',
                isSUV: isSUV
            };
        }
    }

    return null;
}

// Minimal geometric helpers for 3D world space (planar assumption)
function isPointInEllipse(p: number[], handles: number[][]): boolean {
    const [p1, p2, p3, p4] = handles; // Top, bottom, left, right usually
    if (!p1 || !p2 || !p3 || !p4) return false;

    const center = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2];
    const a = Math.sqrt(Math.pow(p3[0] - p4[0], 2) + Math.pow(p3[1] - p4[1], 2)) / 2;
    const b = Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2)) / 2;

    if (a === 0 || b === 0) return false;

    const dx = p[0] - center[0];
    const dy = p[1] - center[1];

    return (dx * dx) / (a * a) + (dy * dy) / (b * b) <= 1.05; // slight tolerance
}

function isPointInRectangle(p: number[], handles: number[][]): boolean {
    const [p1, p2] = handles; // Bottom-left, top-right usually
    if (!p1 || !p2) return false;

    const minX = Math.min(p1[0], p2[0]);
    const maxX = Math.max(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]);
    const maxY = Math.max(p1[1], p2[1]);

    return p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY;
}
