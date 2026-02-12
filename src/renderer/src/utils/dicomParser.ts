import dcmjs from 'dcmjs';

export interface DicomMetadata {
    patientName: string;
    patientID: string;
    patientBirthDate: string;
    patientSex: string;
    studyInstanceUID: string;
    studyDate: string;
    studyTime: string;
    accessionNumber: string;
    studyDescription: string;
    modalitiesInStudy: string[];
    seriesInstanceUID: string;
    seriesDate: string;
    seriesDescription: string;
    seriesNumber: number;
    modality: string;
    sopInstanceUID: string;
    instanceNumber: number;
    sopClassUID: string;
}

export const parseDicombuffer = (buffer: ArrayBuffer): DicomMetadata | null => {
    try {
        const dicomData = dcmjs.data.DicomMessage.singleBufferToDict(buffer, dcmjs.data.DicomMetaDictionary.naturalMode);

        // Helper to safely get tag value
        const getTag = (tag: string) => dicomData[tag] || '';

        return {
            patientName: getTag('PatientName')?.Alphabetic || getTag('PatientName') || 'Anonymous',
            patientID: getTag('PatientID') || 'UnknownID',
            patientBirthDate: getTag('PatientBirthDate') || '',
            patientSex: getTag('PatientSex') || 'O',

            studyInstanceUID: getTag('StudyInstanceUID'),
            studyDate: getTag('StudyDate') || '',
            studyTime: getTag('StudyTime') || '',
            accessionNumber: getTag('AccessionNumber') || '',
            studyDescription: getTag('StudyDescription') || '',
            modalitiesInStudy: [getTag('Modality') || 'OT'], // Single for now, aggregate later

            seriesInstanceUID: getTag('SeriesInstanceUID'),
            seriesDate: getTag('SeriesDate') || '',
            seriesDescription: getTag('SeriesDescription') || '',
            seriesNumber: Number(getTag('SeriesNumber')) || 0,
            modality: getTag('Modality') || 'OT',

            sopInstanceUID: getTag('SOPInstanceUID'),
            instanceNumber: Number(getTag('InstanceNumber')) || 0,
            sopClassUID: getTag('SOPClassUID'),
        };
    } catch (error) {
        console.error('Error parsing DICOM:', error);
        return null;
    }
};
