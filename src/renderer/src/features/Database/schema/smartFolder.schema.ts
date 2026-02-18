import { RxJsonSchema } from 'rxdb';

export interface SmartFolderDocType {
    id: string;          // Unique name/ID
    name: string;        // Display name
    query: {
        patientName?: string;
        patientID?: string;
        modality?: string[];
        studyDateStart?: string;
        studyDateEnd?: string;
        institutionName?: string;
        customFilter?: string; // Optional custom Mongo-like query string
    };
    icon?: string;
    createdAt: string;
    updatedAt: string;
}

export const SmartFolderSchema: RxJsonSchema<SmartFolderDocType> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: {
            type: 'string',
            maxLength: 100
        },
        name: {
            type: 'string'
        },
        query: {
            type: 'object',
            properties: {
                patientName: { type: 'string' },
                patientID: { type: 'string' },
                modality: {
                    type: 'array',
                    items: { type: 'string' }
                },
                studyDateStart: { type: 'string' },
                studyDateEnd: { type: 'string' },
                institutionName: { type: 'string' },
                customFilter: { type: 'string' }
            }
        },
        icon: {
            type: 'string'
        },
        createdAt: {
            type: 'string',
            format: 'date-time'
        },
        updatedAt: {
            type: 'string',
            format: 'date-time'
        }
    },
    required: ['id', 'name', 'query', 'createdAt', 'updatedAt']
};
