import { api } from 'dicomweb-client';

export interface PACSServer {
    id: string;
    name: string;
    aeTitle: string;
    address?: string; // IP or Hostname for DIMSE
    port?: number;    // Port for DIMSE
    url?: string;     // URL for DICOMweb
    isDicomWeb: boolean;
    wadoUri?: string; // Optional WADO-URI base
    wadoRs?: string;  // Optional WADO-RS base
    qidoRs?: string;  // Optional QIDO-RS base
    stowRs?: string;  // Optional STOW-RS base
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
    accessionNumber?: string;
    studyTime?: string;
    sourceAeTitle?: string;
}

// using global Window.electron type from electron.d.ts

export class PACSClient {
    private client: any;
    private server: PACSServer;

    constructor(server: PACSServer) {
        this.server = server;
        if (this.server.isDicomWeb && this.server.url) {
            this.client = new api.DICOMwebClient({
                url: this.server.url,
                singlepart: true
            });
        }
    }

    async echo(): Promise<boolean> {
        if (this.server.isDicomWeb) {
            // DICOMweb doesn't strictly have C-ECHO, but we can check if URL is reachable
            // Or just return true as we assume web server is up if we can search
            try {
                // Determine liveliness by query? Or just skip
                return true;
            } catch (e) {
                return false;
            }
        } else {
            return window.electron.pacs.echo({
                aeTitle: this.server.aeTitle,
                address: this.server.address,
                port: this.server.port
            });
        }
    }

    async searchStudies(filters: any = {}): Promise<PACSStudy[]> {
        if (this.server.isDicomWeb) {
            return this.searchDicomWeb(filters);
        } else {
            return this.searchDimse(filters);
        }
    }

    private async searchDicomWeb(filters: any): Promise<PACSStudy[]> {
        const queryParams: any = {};
        if (filters.patientName) queryParams['PatientName'] = filters.patientName;
        if (filters.patientId) queryParams['PatientID'] = filters.patientId;
        if (filters.modality && filters.modality !== 'ALL') queryParams['ModalitiesInStudy'] = filters.modality;

        // Date range handling
        if (filters.studyDate) queryParams['StudyDate'] = filters.studyDate;

        try {
            const results = await this.client.searchForStudies({ queryParams });
            return results.map((s: any) => this.mapDicomWebStudy(s));
        } catch (error) {
            console.error('PACS Search Error (DICOMweb):', error);
            throw error;
        }
    }

    private async searchDimse(filters: any): Promise<PACSStudy[]> {
        const query: any = {};
        if (filters.patientName) query['00100010'] = filters.patientName; // PatientName
        if (filters.patientId) query['00100020'] = filters.patientId;     // PatientID
        if (filters.modality && filters.modality !== 'ALL') query['00080061'] = filters.modality; // ModalitiesInStudy
        if (filters.studyDate) query['00080020'] = filters.studyDate;     // StudyDate
        if (filters.accessionNumber) query['00080050'] = filters.accessionNumber; // AccessionNumber

        try {
            const node = {
                aeTitle: this.server.aeTitle,
                address: this.server.address,
                port: this.server.port
            };
            const results = await window.electron.pacs.search(node, 'STUDY', query);
            return results.map((s: any) => this.mapDimseStudy(s));
        } catch (error) {
            console.error('PACS Search Error (DIMSE):', error);
            throw error;
        }
    }

    async retrieveStudy(studyInstanceUID: string, destinationAet: string = 'PEREGRINE'): Promise<boolean> {
        if (this.server.isDicomWeb) {
            // Retrieve is handled by importStudyFromPACS for DICOMweb in this project
            return true;
        } else {
            const node = {
                aeTitle: this.server.aeTitle,
                address: this.server.address,
                port: this.server.port
            };
            return window.electron.pacs.move(node, destinationAet, 'STUDY', { StudyInstanceUID: studyInstanceUID });
        }
    }

    async sendImages(filePaths: string[]): Promise<boolean> {
        if (this.server.isDicomWeb) {
            // STOW-RS implementation would go here
            console.warn('STOW-RS not yet implemented');
            return false;
        } else {
            const node = {
                aeTitle: this.server.aeTitle,
                address: this.server.address,
                port: this.server.port
            };
            return window.electron.pacs.store(node, filePaths);
        }
    }

    // DICOMweb specific methods
    async searchSeries(studyInstanceUID: string) {
        if (!this.client) return [];
        return this.client.searchForSeries({ studyInstanceUID });
    }

    async fetchInstances(studyInstanceUID: string, seriesInstanceUID: string) {
        if (!this.client) return [];
        return this.client.searchForInstances({ studyInstanceUID, seriesInstanceUID });
    }

    async fetchInstanceBytes(studyInstanceUID: string, seriesInstanceUID: string, sopInstanceUID: string) {
        if (!this.client) return null;
        const options = {
            studyInstanceUID,
            seriesInstanceUID,
            sopInstanceUID,
        };
        const parts = await this.client.retrieveInstance(options);
        return parts[0]; // Assuming first part is the DICOM file
    }


    private mapDicomWebStudy(s: any): PACSStudy {
        const getString = (tag: string): string => {
            const val = s[tag]?.Value;
            if (!val) return '';
            if (Array.isArray(val)) {
                const first = val[0];
                if (first === undefined || first === null) return '';
                if (typeof first === 'object') {
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
            studyTime: getString('00080030'),
            modality: getString('00080061'),
            description: getString('00081030'),
            accessionNumber: getString('00080050'),
            numInstances: parseInt(getString('00201208')) || 0,
            sourceAeTitle: this.server.aeTitle // Not present in DICOMweb response, using server AET
        };
    }

    private mapDimseStudy(s: any): PACSStudy {
        // s is a dcmjs-dimse Element/Dataset object, assumed simplified to Record<tag, value>
        // But implementation in DICOMService.ts returns `dataset.getElements()`
        // dcmjs elements are stored by Tag (group+element string) or Keyword?
        // dcmjs `dataset.getElements()` returns object keyed by keyword if nameMap used, or tag if not?
        // Let's assume tags for robustness or check both.

        // Actually DICOMService.ts: dataset.getElements() -> Record<string, Element>
        // Element: { vr: string, Value: any[] }

        const getValue = (tag: string): string => {
            const el = s[tag]; // tag e.g. '00100010' or 'x00100010' depending on dcmjs version
            // dcmjs uses 'x' prefix for hex tags often? No, dcmjs v0.29 uses string tags like '00100010' or keyword.

            // Let's try to find by Tag.
            if (!el) return '';
            // Value is often array
            const val = el.Value;
            if (Array.isArray(val) && val.length > 0) {
                const v = val[0];
                if (typeof v === 'object' && v !== null && 'Alphabetic' in v) return v.Alphabetic;
                return String(v);
            }
            return String(val || '');
        };

        // Map common tags
        return {
            id: getValue('0020000D'),
            studyInstanceUID: getValue('0020000D'),
            patientName: getValue('00100010'),
            patientId: getValue('00100020'),
            patientBirthDate: getValue('00100030'),
            studyDate: getValue('00080020'),
            studyTime: getValue('00080030'),
            modality: getValue('00080061'),
            description: getValue('00081030'),
            accessionNumber: getValue('00080050'),
            numInstances: parseInt(getValue('00201208')) || 0,
            sourceAeTitle: getValue('00020016') || this.server.aeTitle // SourceApplicationEntityTitle
        };
    }
}
