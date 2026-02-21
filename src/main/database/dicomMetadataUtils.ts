import * as dicomParser from 'dicom-parser';

export interface ExtractedMetadata {
    patientName: string;
    patientID: string;
    patientBirthDate: string;
    patientSex: string;
    institutionName: string;
    studyInstanceUID: string;
    studyDate: string;
    studyDescription: string;
    accessionNumber: string;
    seriesInstanceUID: string;
    seriesNumber: string;
    modality: string;
    seriesDescription: string;
    sopInstanceUID: string;
    instanceNumber: number;
    numberOfFrames: number;
    transferSyntaxUID: string;
    rows: number;
    columns: number;
    pixelSpacing: string | undefined;
    windowCenter: number | undefined;
    windowWidth: number | undefined;
    rescaleIntercept: number | undefined;
    rescaleSlope: number | undefined;
    bitsAllocated: number;
    bitsStored: number;
    highBit: number;
    pixelRepresentation: number;
    photometricInterpretation: string;
    imagePositionPatient: string | undefined;
    imageOrientationPatient: string | undefined;
    bodyPartExamined: string | undefined;
    protocolName: string | undefined;
    frameOfReferenceUID: string | undefined;
    filePath: string;
}

export const ENCODING_MAP: Record<string, string> = {
    'ISO_IR 192': 'utf-8',
    'ISO_IR 100': 'iso-8859-1',
    'ISO_IR 101': 'iso-8859-2',
    'ISO_IR 109': 'iso-8859-3',
    'ISO_IR 110': 'iso-8859-4',
    'ISO_IR 144': 'iso-8859-5',
    'ISO_IR 127': 'iso-8859-6',
    'ISO_IR 126': 'iso-8859-7',
    'ISO_IR 138': 'iso-8859-8',
    'ISO_IR 148': 'iso-8859-9',
    'ISO_IR 13': 'shift-jis',
    'ISO_IR 166': 'windows-874',
    'GB18030': 'gb18030',
    'GBK': 'gbk',
    'ISO_IR 149': 'euc-kr',
    'ISO 2022 IR 13': 'shift-jis',
    'ISO 2022 IR 87': 'iso-2022-jp',
};

export const stringifyPN = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
        if (val.Ideographic) return String(val.Ideographic);
        if (val.Alphabetic) return String(val.Alphabetic);
        if (val.Phonetic) return String(val.Phonetic);
        if (val.value && Array.isArray(val.value) && val.value[0]) return stringifyPN(val.value[0]);
    }
    return String(val);
};

export const extractMetadata = (dataSet: dicomParser.DataSet, filePath: string): ExtractedMetadata | null => {
    // Detect character set (0008,0005)
    const specificCharacterSetTag = 'x00080005';
    let encoding = 'utf-8';

    const csElement = dataSet.elements[specificCharacterSetTag];
    if (csElement) {
        const csBytes = dataSet.byteArray.slice(csElement.dataOffset, csElement.dataOffset + csElement.length);
        const csRaw = new TextDecoder().decode(csBytes).trim();
        const firstCS = csRaw.split('\\')[0].trim();
        if (ENCODING_MAP[firstCS]) {
            encoding = ENCODING_MAP[firstCS];
        }
    }

    const getString = (tag: string) => {
        const element = dataSet.elements[tag];
        if (!element) return undefined;
        const bytes = dataSet.byteArray.slice(element.dataOffset, element.dataOffset + element.length);
        let len = bytes.length;
        while (len > 0 && bytes[len - 1] === 0) len--;
        try {
            return new TextDecoder(encoding).decode(bytes.subarray(0, len)).trim();
        } catch (e) {
            return new TextDecoder('utf-8').decode(bytes.subarray(0, len)).trim();
        }
    };

    const getNumber = (tag: string) => {
        const s = getString(tag);
        if (!s || s === '') return undefined;
        const n = Number(s.split('\\')[0]);
        return isNaN(n) ? undefined : n;
    };

    const getUint16 = (tag: string) => dataSet.uint16(tag);

    const studyInstanceUID = getString('x0020000d');
    if (!studyInstanceUID) return null;

    return {
        patientName: getString('x00100010') || '',
        patientID: getString('x00100020') || '',
        patientBirthDate: getString('x00100030') || '',
        patientSex: getString('x00100040') || 'O',
        institutionName: getString('x00080080') || '',
        studyInstanceUID,
        studyDate: getString('x00080020') || '',
        studyDescription: getString('x00081030') || '',
        accessionNumber: getString('x00080050') || '',
        seriesInstanceUID: getString('x0020000e') || '',
        seriesNumber: getString('x00200011') || '',
        modality: getString('x00080060') || 'OT',
        seriesDescription: getString('x0008103e') || '',
        sopInstanceUID: getString('x00080018') || '',
        instanceNumber: getNumber('x00200013') || 0,
        numberOfFrames: Math.max(1, getNumber('x00280008') || 1),
        transferSyntaxUID: getString('x00020010') || '',
        rows: getUint16('x00280010') || 1,
        columns: getUint16('x00280011') || 1,
        pixelSpacing: getString('x00280030'),
        windowCenter: getNumber('x00281050'),
        windowWidth: getNumber('x00281051'),
        rescaleIntercept: getNumber('x00281052'),
        rescaleSlope: getNumber('x00281053'),
        bitsAllocated: getUint16('x00280100') || 0,
        bitsStored: getUint16('x00280101') || 0,
        highBit: getUint16('x00280102') || 0,
        pixelRepresentation: getUint16('x00280103') || 0,
        photometricInterpretation: getString('x00280004') || 'MONOCHROME2',
        imagePositionPatient: getString('x00200032'),
        imageOrientationPatient: getString('x00200037'),
        bodyPartExamined: getString('x00180015'),
        protocolName: getString('x00181030'),
        frameOfReferenceUID: getString('x00200052'),
        filePath
    };
};
