export interface PACSNode {
    id?: string;
    aeTitle: string;
    address?: string;
    port?: number;
    // TLS
    useTls?: boolean;
    isSecure?: boolean; // alias for useTls for compatibility

    // DICOMweb
    isDicomWeb?: boolean;
    url?: string;
    wadoUri?: string;
    wadoRs?: string;
    qidoRs?: string;
    stowRs?: string;

    // Certificates
    certPath?: string;
    keyPath?: string;
    caPath?: string;

    // UI
    name?: string;
    description?: string;
}

export interface PACSStudy {
    studyInstanceUID: string;
    patientName: string;
    patientId: string;
    studyDate: string;
    modality: string;
    numInstances: number;

    // Optional / UI specific
    id?: string;
    accessionNumber?: string;
    studyTime?: string;
    description?: string;
    patientBirthDate?: string;
    institutionName?: string;
    referringPhysicianName?: string;
    sourceAeTitle?: string;
}
