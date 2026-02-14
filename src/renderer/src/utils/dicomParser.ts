import dcmjs from 'dcmjs';

export interface DicomMetadata {
    patientName: string;
    patientID: string;
    patientBirthDate: string;
    patientSex: string;
    patientAge: string;
    issuerOfPatientID: string;
    otherPatientIDs: string;
    institutionName: string;
    referringPhysicianName: string;
    studyInstanceUID: string;
    studyDate: string;
    studyTime: string;
    accessionNumber: string;
    studyDescription: string;
    studyID: string;
    modalitiesInStudy: string[];
    seriesInstanceUID: string;
    seriesDate: string;
    seriesDescription: string;
    seriesNumber: number;
    modality: string;
    bodyPartExamined: string;
    protocolName: string;
    sopInstanceUID: string;
    instanceNumber: number;
    sopClassUID: string;
    numberOfFrames: number;
    transferSyntaxUID: string;
    windowCenter: number;
    windowWidth: number;
    rescaleIntercept: number;
    rescaleSlope: number;
    // Geometry
    imagePositionPatient: string;
    imageOrientationPatient: string;
    pixelSpacing: string;
    sliceThickness: number;
}

// ---------------------------------------------------------------------------
// dcmjs Type-Safety Helpers
//
// dcmjs.naturalizeDataset() returns JavaScript-native types, but certain DICOM
// Value Representations (VR) produce non-string types that can cause runtime
// errors if treated as plain strings. The main risk categories are:
//
//  VR  | JavaScript Type           | Affected Tags
// -----|---------------------------|-----------------------------------------
//  PN  | {Alphabetic, Ideographic} | PatientName, ReferringPhysicianName, ...
//  SQ  | Array<object>             | (sequences – not used by us)
//  DS  | number | number[]         | WindowCenter, WindowWidth, ...
//  IS  | number | number[]         | InstanceNumber, SeriesNumber, ...
//  AT  | object                    | (attribute tags – rare)
//
// The helpers below ensure every value is converted to the expected JS type
// before being returned to the caller, preventing `.toLowerCase()`,
// `.toString()`, etc. from throwing on unexpected object types.
// ---------------------------------------------------------------------------

/**
 * Safely converts a DICOM Person Name (PN VR) value to a plain string.
 *
 * dcmjs can return PN values in several forms:
 *  - A plain string: "YAMADA^TARO"
 *  - An object: { Alphabetic: "YAMADA^TARO", Ideographic: "山田^太郎" }
 *  - Nested: { value: [{ Alphabetic: "..." }] }
 *  - undefined / null / empty string
 */
const stringifyPN = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
        // dcmjs naturalizeDataset format: { Alphabetic: "...", Ideographic: "...", Phonetic: "..." }
        if (val.Alphabetic) return String(val.Alphabetic);
        if (val.Ideographic) return String(val.Ideographic);
        if (val.Phonetic) return String(val.Phonetic);
        // Some older dcmjs versions or edge cases: { value: [{...}] }
        if (val.value && Array.isArray(val.value) && val.value[0]) {
            return stringifyPN(val.value[0]);
        }
        // Last resort: find any string-valued property
        const keys = Object.keys(val);
        for (const k of keys) {
            if (typeof val[k] === 'string' && val[k].length > 0) return val[k];
        }
    }
    return String(val);
};

/**
 * Safely converts any dcmjs tag value to a string.
 * Handles: string, number, object (PN), array, undefined, null.
 */
const safeString = (val: any, fallback: string = ''): string => {
    if (val === undefined || val === null || val === '') return fallback;
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) return val.join('\\'); // ★ FIX: Maintain DICOM delimiter for lists
    if (typeof val === 'object') {
        // Could be a PN object → delegate
        const pn = stringifyPN(val);
        if (pn) return pn;
    }
    return fallback;
};

/**
 * Safely converts any dcmjs tag value to a number.
 * DS/IS VRs can return: number, string, string[], number[], or undefined.
 */
const safeNumber = (val: any, fallback: number = 0): number => {
    if (val === undefined || val === null || val === '') return fallback;
    if (typeof val === 'number') return isNaN(val) ? fallback : val;
    if (typeof val === 'string') {
        // Handle DICOM Multi-value strings (e.g. "40\\40")
        if (val.includes('\\')) {
            const parts = val.split('\\');
            // Recursively try the first part
            return safeNumber(parts[0], fallback);
        }
        const n = Number(val);
        return isNaN(n) ? fallback : n;
    }
    if (Array.isArray(val) && val.length > 0) {
        return safeNumber(val[0], fallback);
    }
    return fallback;
};

export const parseDicombuffer = (buffer: ArrayBuffer | Uint8Array): DicomMetadata | null => {
    // Priority 1: Use dicom-parser (More robust for older/implicit/private VRs)
    const dpMeta = parseWithDicomParser(buffer);
    if (dpMeta) {
        // console.log('DICOM: Parsed using dicom-parser (primary).');
        return dpMeta;
    }

    // Priority 2: Use dcmjs (Fallback - stricter, better for some modern enhanced tags)
    // Only runs if dicom-parser failed to extract critical UIDs
    try {
        // Silence dcmjs logger
        try {
            // @ts-ignore
            if (dcmjs.log && dcmjs.log.setLevel) {
                // @ts-ignore
                dcmjs.log.setLevel('error');
            }
        } catch (e) { /* ignore */ }

        const originalWarn = console.warn;
        const originalLog = console.log;
        console.warn = () => { };
        console.log = () => { };

        try {
            const arrayBuffer = buffer instanceof Uint8Array
                ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
                : buffer;

            let dicomDict;
            try {
                dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer);
            } catch (e) {
                dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer, { ignoreHeader: true });
            }
            const dicomData = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
            const metaData = dicomDict.meta ? dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.meta) : {};

            const get = (tag: string) => dicomData[tag];
            const getMeta = (tag: string) => (metaData as any)[tag];

            // --- Patient Level ---
            const patientName = stringifyPN(get('PatientName')) || 'Anonymous';
            const patientID = safeString(get('PatientID'), 'UnknownID');

            // --- Study Level ---
            const studyInstanceUID = safeString(get('StudyInstanceUID'));
            if (!studyInstanceUID) {
                return null;
            }

            // --- Series Level ---
            const seriesInstanceUID = safeString(get('SeriesInstanceUID'));
            if (!seriesInstanceUID) {
                return null;
            }

            // --- Instance Level ---
            const sopInstanceUID = safeString(get('SOPInstanceUID'));
            if (!sopInstanceUID) {
                return null;
            }

            const result = {
                // Patient
                patientName,
                patientID,
                patientBirthDate: safeString(get('PatientBirthDate')),
                patientSex: safeString(get('PatientSex'), 'O'),
                patientAge: safeString(get('PatientAge')),
                issuerOfPatientID: safeString(get('IssuerOfPatientID')),
                otherPatientIDs: safeString(get('OtherPatientIDs')),
                institutionName: safeString(get('InstitutionName')),
                referringPhysicianName: stringifyPN(get('ReferringPhysicianName')),

                // Study
                studyInstanceUID,
                studyDate: safeString(get('StudyDate')),
                studyTime: safeString(get('StudyTime')),
                accessionNumber: safeString(get('AccessionNumber')),
                studyDescription: safeString(get('StudyDescription')),
                studyID: safeString(get('StudyID')),
                modalitiesInStudy: [safeString(get('Modality'), 'OT')],

                // Series
                seriesInstanceUID,
                seriesDate: safeString(get('SeriesDate')),
                seriesDescription: safeString(get('SeriesDescription')),
                seriesNumber: safeNumber(get('SeriesNumber')),
                modality: safeString(get('Modality'), 'OT'),
                bodyPartExamined: safeString(get('BodyPartExamined')),
                protocolName: safeString(get('ProtocolName')),

                // Instance
                sopInstanceUID,
                instanceNumber: safeNumber(get('InstanceNumber')),
                sopClassUID: safeString(get('SOPClassUID')),
                numberOfFrames: Math.max(1, safeNumber(get('NumberOfFrames'), 1)),
                transferSyntaxUID: safeString(getMeta('TransferSyntaxUID')),
                windowCenter: safeNumber(get('WindowCenter'), 40),
                windowWidth: safeNumber(get('WindowWidth'), 400),
                rescaleIntercept: safeNumber(get('RescaleIntercept'), 0),
                rescaleSlope: safeNumber(get('RescaleSlope'), 1),

                // Geometry
                imagePositionPatient: safeString(get('ImagePositionPatient')),
                imageOrientationPatient: safeString(get('ImageOrientationPatient')),
                pixelSpacing: safeString(get('PixelSpacing')),
                sliceThickness: safeNumber(get('SliceThickness')),
            };

            // Validation
            if (!result.imagePositionPatient || result.imagePositionPatient === '') {
                // If dcmjs fails to get geometry, we already tried dicom-parser and it failed too (since we are here).
                // So we just return what we have, or null? 
                // Actually, if we are here, it means dicom-parser failed. 
                // Use dcmjs result but warn.
            }

            return result;

        } finally {
            console.warn = originalWarn;
            console.log = originalLog;
        }
    } catch (error) {
        console.warn('dcmjs (fallback) parsing failed:', error);
        return null;
    }
};

// Fallback using dicom-parser (robustheader parsing only)
import dicomParser from 'dicom-parser';

const parseWithDicomParser = (buffer: ArrayBuffer | Uint8Array): DicomMetadata | null => {
    try {
        const arrayBuffer = buffer instanceof Uint8Array
            ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
            : buffer;
        const dataSet = dicomParser.parseDicom(new Uint8Array(arrayBuffer));

        const getBytes = (tag: string) => {
            const element = dataSet.elements[tag];
            if (element) {
                return dataSet.byteArray.slice(element.dataOffset, element.dataOffset + element.length);
            }
            return undefined;
        };

        // Get Specific Character Set (0008,0005)
        const charSetRaw = dataSet.string('x00080005') || '';
        const charSets = charSetRaw.split('\\').map(s => s.trim());

        // Determine encoding for TextDecoder
        let encoding = 'utf-8'; // default
        if (charSets.some(s => s.includes('ISO 2022 IR 87') || s.includes('ISO 2022 IR 13'))) {
            encoding = 'iso-2022-jp';
        } else if (charSets.includes('ISO_IR 100')) {
            encoding = 'iso-8859-1';
        } else if (charSets.includes('ISO_IR 192')) {
            encoding = 'utf-8';
        }

        const decoder = new TextDecoder(encoding);

        const getString = (tag: string) => {
            const bytes = getBytes(tag);
            if (!bytes) return undefined;
            try {
                // Remove trailing null bytes before decoding
                let len = bytes.length;
                while (len > 0 && bytes[len - 1] === 0) len--;
                return decoder.decode(bytes.subarray(0, len)).trim();
            } catch (e) {
                // fallback to simple ASCII
                let str = '';
                for (let i = 0; i < bytes.length; i++) {
                    if (bytes[i] !== 0) str += String.fromCharCode(bytes[i]);
                }
                return str.trim();
            }
        };

        const getNumber = (tag: string) => {
            const str = getString(tag);
            if (!str) return undefined;
            if (str.includes('\\')) {
                const first = str.split('\\')[0];
                return Number(first);
            }
            return Number(str);
        };

        const studyInstanceUID = getString('x0020000d');
        const seriesInstanceUID = getString('x0020000e');
        const sopInstanceUID = getString('x00080018');

        if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
            console.error('DICOM Parser Fallback: Missing critical UIDs');
            return null;
        }

        return {
            patientName: getString('x00100010') || 'Anonymous',
            patientID: getString('x00100020') || 'UnknownID',
            patientBirthDate: getString('x00100030') || '',
            patientSex: getString('x00100040') || 'O',
            patientAge: getString('x00101010') || '',
            issuerOfPatientID: getString('x00100021') || '',
            otherPatientIDs: getString('x00101000') || '',
            institutionName: getString('x00080080') || '',
            referringPhysicianName: getString('x00080090') || '',

            studyInstanceUID,
            studyDate: getString('x00080020') || '',
            studyTime: getString('x00080030') || '',
            accessionNumber: getString('x00080050') || '',
            studyDescription: getString('x00081030') || '',
            studyID: getString('x00200010') || '',
            modalitiesInStudy: [getString('x00080060') || 'OT'],

            seriesInstanceUID,
            seriesDate: getString('x00080021') || '',
            seriesDescription: getString('x0008103e') || '',
            seriesNumber: getNumber('x00200011') || 0,
            modality: getString('x00080060') || 'OT',
            bodyPartExamined: getString('x00180015') || '',
            protocolName: getString('x00181030') || '',

            sopInstanceUID,
            instanceNumber: getNumber('x00200013') || 0,
            sopClassUID: getString('x00080016') || '',
            numberOfFrames: Math.max(1, getNumber('x00280008') || 1),
            // meta header transfer syntax
            transferSyntaxUID: getString('x00020010') || '',
            windowCenter: getNumber('x00281050') || 40,
            windowWidth: getNumber('x00281051') || 400,
            rescaleIntercept: getNumber('x00281052') || 0,
            rescaleSlope: getNumber('x00281053') || 1,

            // Geometry
            imagePositionPatient: getString('x00200032') || '',
            imageOrientationPatient: getString('x00200037') || '',
            pixelSpacing: getString('x00280030') || '',
            sliceThickness: getNumber('x00180050') || 0,
        };
    } catch (e) {
        console.error('DICOM Parser Fallback failed:', e);
        return null;
    }
};
