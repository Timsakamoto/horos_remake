import { RxJsonSchema } from 'rxdb';

export interface PatientDocType {
    id: string;
    patientName: string;
    patientID: string;
    patientBirthDate: string;
    patientSex: string;
    // Searchable normalized field for case-insensitive search
    patientNameNormalized: string;
}

export const PatientSchema: RxJsonSchema<PatientDocType> = {
    version: 2,
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
            type: 'string'
        },
        patientBirthDate: {
            type: 'string'
        },
        patientSex: {
            type: 'string'
        },
        patientNameNormalized: {
            type: 'string'
        }
    },
    required: ['id', 'patientName', 'patientID'],
    indexes: ['patientNameNormalized']
};
