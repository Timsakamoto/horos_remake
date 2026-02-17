export type ViewMode = 'Database' | '2D' | 'MPR' | '3D' | 'PACS' | 'Axial' | 'Coronal' | 'Sagittal';
export type ToolMode =
    | 'WindowLevel'
    | 'Pan'
    | 'Zoom'
    | 'Magnify'
    | 'Length'
    | 'Angle'
    | 'Rectangle'
    | 'Ellipse'
    | 'Probe'
    | 'Arrow'
    | 'Bidirectional'
    | 'CobbAngle'
    | 'Text'
    | 'Crosshairs'
    | 'ReferenceLines'
    | 'None'
    | 'StackScroll';
export type ToolbarMode = 'DATABASE' | 'VIEWER';
export type ProjectionMode = 'NORMAL' | 'MIP' | 'MINIP';
export type ViewportOrientation = 'Axial' | 'Coronal' | 'Sagittal' | 'Default';

export interface VOI {
    windowWidth?: number;
    windowCenter?: number;
}

export interface ViewportState {
    id: string;
    seriesUid: string | null;
    orientation: ViewportOrientation;
    voi: VOI | null;
}

export interface Layout {
    rows: number;
    cols: number;
}

export interface ViewportMetadata {
    patientName: string;
    patientID: string;
    institutionName: string;
    studyDescription: string;
    seriesNumber: string;
    seriesDescription: string;
    modality: string;
    instanceNumber: number;
    totalInstances: number;
    windowWidth?: number;
    windowCenter?: number;
}

export const INITIAL_METADATA: ViewportMetadata = {
    patientName: '',
    patientID: '',
    institutionName: '',
    studyDescription: '',
    seriesNumber: '',
    seriesDescription: '',
    modality: '',
    instanceNumber: 0,
    totalInstances: 0,
    windowWidth: undefined,
    windowCenter: undefined
};

export const RENDERING_ENGINE_ID = 'peregrine-engine';
export const TOOL_GROUP_ID = 'main-tool-group';
export const ORTHO_TOOL_GROUP_ID = 'ortho-tool-group';

export const VIEWPORT_IDS = {
    AXIAL: 'axial-viewport',
    SAGITTAL: 'sagittal-viewport',
    CORONAL: 'coronal-viewport'
} as const;
