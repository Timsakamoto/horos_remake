import { RxJsonSchema } from 'rxdb';

export interface PatientDocType {
    id: string;
    patientName: string;
    patientID: string;
    patientBirthDate: string;
    patientSex: string;
    issuerOfPatientID: string;
    institutionName: string;
    numberOfPatientRelatedInstances?: number;
    // Searchable normalized field for case-insensitive search
    patientNameNormalized: string;
    lastImportDateTime?: string;
}

export const PatientSchema: RxJsonSchema<PatientDocType> = {
    version: 9,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: {
            type: 'string',
            maxLength: 200
        },
        patientName: {
            type: 'string'
        },
        patientID: {
            type: 'string',
            maxLength: 100
        },
        patientBirthDate: {
            type: 'string',
            maxLength: 20
        },
        patientSex: {
            type: 'string',
            maxLength: 10
        },
        issuerOfPatientID: {
            type: 'string'
        },
        institutionName: {
            type: 'string',
            maxLength: 200
        },
        numberOfPatientRelatedInstances: {
            type: 'number',
            multipleOf: 1,
            minimum: 0,
            maximum: 1000000
        },
        patientNameNormalized: {
            type: 'string',
            maxLength: 200
        },
        lastImportDateTime: {
            type: 'string',
            format: 'date-time',
            maxLength: 40
        }
    },
    required: ['id', 'patientName', 'patientID'],
    indexes: ['patientNameNormalized', 'patientID', 'institutionName', 'patientBirthDate', 'patientSex', 'numberOfPatientRelatedInstances', 'lastImportDateTime']
};
