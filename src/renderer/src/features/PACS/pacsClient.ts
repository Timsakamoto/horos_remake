import { api } from 'dicomweb-client';

export interface PACSServer {
    id: string;
    name: string;
    aeTitle: string;
    url: string;
    isDicomWeb: boolean;
}

export interface PACSStudy {
    id: string;
    patientName: string;
    patientId: string;
    patientBirthDate: string;
    studyDate: string;
    modality: string;
    description: string;
    numInstances: number;
    studyInstanceUID: string;
}

export class PACSClient {
    private client: any;

    constructor(url: string) {
        this.client = new api.DICOMwebClient({
            url,
            singlepart: true
        });
    }

    async searchStudies(filters: any = {}): Promise<PACSStudy[]> {
        const queryParams: any = {};
        if (filters.patientName) queryParams['PatientName'] = filters.patientName;
        if (filters.patientId) queryParams['PatientID'] = filters.patientId;
        if (filters.modality && filters.modality !== 'ALL') queryParams['ModalitiesInStudy'] = filters.modality;

        // Date range handling (Simplified for now)
        if (filters.studyDate) queryParams['StudyDate'] = filters.studyDate;

        try {
            const results = await this.client.searchForStudies({ queryParams });
            return results.map((s: any) => this.mapStudy(s));
        } catch (error) {
            console.error('PACS Search Error:', error);
            throw error;
        }
    }

    async searchSeries(studyInstanceUID: string): Promise<any[]> {
        try {
            return await this.client.searchForSeries({ studyInstanceUID });
        } catch (error) {
            console.error('PACS Series Search Error:', error);
            throw error;
        }
    }

    async fetchInstances(studyInstanceUID: string, seriesInstanceUID: string): Promise<any[]> {
        try {
            return await this.client.searchForInstances({ studyInstanceUID, seriesInstanceUID });
        } catch (error) {
            console.error('PACS Instance Search Error:', error);
            throw error;
        }
    }

    async fetchInstanceBytes(studyInstanceUID: string, seriesInstanceUID: string, sopInstanceUID: string): Promise<ArrayBuffer> {
        try {
            return await this.client.retrieveInstance({
                studyInstanceUID,
                seriesInstanceUID,
                sopInstanceUID
            });
        } catch (error) {
            console.error('PACS Instance Retrieval Error:', error);
            throw error;
        }
    }

    private mapStudy(s: any): PACSStudy {
        // DICOMweb tags are usually hex string keys or keywords
        // PatientName: 00100010
        // PatientID: 00100020
        // StudyDate: 00080020
        // ModalitiesInStudy: 00080061
        // StudyDescription: 00081030
        // StudyInstanceUID: 0020000D
        // NumberOfStudyRelatedInstances: 00201208

        const getString = (tag: string): string => {
            const val = s[tag]?.Value;
            if (!val) return '';
            if (Array.isArray(val)) {
                const first = val[0];
                if (first === undefined || first === null) return '';
                if (typeof first === 'object') {
                    // Could be a PN VR: { Alphabetic: "..." }
                    return String(first.Alphabetic || first.Ideographic || '');
                }
                return String(first);
            }
            return String(val);
        };

        const getPersonName = (tag: string): string => {
            const val = s[tag]?.Value?.[0];
            if (!val) return '';
            if (typeof val === 'string') return val;
            if (typeof val === 'object') {
                return String(val.Alphabetic || val.Ideographic || val.Phonetic || '');
            }
            return String(val);
        };

        return {
            id: getString('0020000D'),
            studyInstanceUID: getString('0020000D'),
            patientName: getPersonName('00100010'),
            patientId: getString('00100020'),
            patientBirthDate: getString('00100030'),
            studyDate: getString('00080020'),
            modality: getString('00080061'),
            description: getString('00081030'),
            numInstances: parseInt(getString('00201208')) || 0
        };
    }
}
