export interface CLUTPreset {
    name: string;
    windowWidth: number;
    windowCenter: number;
    colormap?: string;
}

export const CLUT_PRESETS: CLUTPreset[] = [
    { name: 'Abdomen', windowWidth: 350, windowCenter: 40 },
    { name: 'Bone', windowWidth: 2000, windowCenter: 300 },
    { name: 'Brain', windowWidth: 80, windowCenter: 40 },
    { name: 'Lung', windowWidth: 1500, windowCenter: -600 },
    { name: 'Stroke', windowWidth: 30, windowCenter: 35 },
    { name: 'Soft Tissue', windowWidth: 400, windowCenter: 40 },
    { name: 'Liver', windowWidth: 150, windowCenter: 30 },
    { name: 'Mediastinum', windowWidth: 350, windowCenter: 50 },
    { name: 'Subdural', windowWidth: 200, windowCenter: 80 },
    { name: 'Angio', windowWidth: 600, windowCenter: 300 },
];

export const COLORMAPS = [
    'Grayscale',
    'Inverted',
    'Jet',
    'Hot',
    'Cool',
    'Pet',
    'HotIron'
];
