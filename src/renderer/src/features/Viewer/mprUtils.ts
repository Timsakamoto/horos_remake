import { Enums } from '@cornerstonejs/core';

export const PROJECTION_MODES = {
    NORMAL: Enums.BlendModes.COMPOSITE,
    MIP: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
    MINIP: Enums.BlendModes.MINIMUM_INTENSITY_BLEND,
} as const;

export type ProjectionMode = keyof typeof PROJECTION_MODES;

export const DEFAULT_SLAB_THICKNESS = 0; // 0 means full thickness or single slice? Actually in CS3D 0 is single slice.
