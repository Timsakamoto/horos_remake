export interface Patient {
    id: string;
    patientID: string;
    patientName: string;
    patientBirthDate: string;
    patientSex: string;
    studyCount: number;
    numberOfPatientRelatedInstances?: number;
    totalImageCount: number;
    modalities: string[];
    _isStudy?: boolean;
    studyDescription?: string;
    accessionNumber?: string;
    studyDate?: string;
    institutionName?: string;
    studyInstanceUID?: string;
    studyId?: number;
    userComments?: string;
}

export interface Study {
    studyInstanceUID: string;
    studyDate: string;
    studyTime: string;
    studyDescription: string;
    studyID: string;
    modalitiesInStudy: string[];
    numberOfStudyRelatedSeries: number;
    numberOfStudyRelatedInstances: number;
    patientAge: string;
    institutionName: string;
    referringPhysicianName: string;
    accessionNumber: string;
    ImportDateTime: string;
    patientId: string;
    userComments?: string;
}

export interface SearchFilters {
    patientName: string;
    patientID: string;
    dateRange: {
        start: string; // YYYY-MM-DD
        end: string;   // YYYY-MM-DD
    };
    modalities: string[]; // Selected modalities
    studyDescription: string;
    institutionName: string;
    userComments: string;
}

export interface SortConfig {
    key: string;
    direction: 'asc' | 'desc';
}

export const emptyFilters: SearchFilters = {
    patientName: '',
    patientID: '',
    dateRange: { start: '', end: '' },
    modalities: [],
    studyDescription: '',
    institutionName: '',
    userComments: ''
};
