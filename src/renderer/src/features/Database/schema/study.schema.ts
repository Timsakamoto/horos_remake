import { RxJsonSchema } from 'rxdb';

export interface StudyDocType {
    studyInstanceUID: string;
    studyDate: string;
    studyTime: string;
    accessionNumber: string;
    studyDescription: string;
    studyID: string;
    modalitiesInStudy: string[];
    numberOfStudyRelatedSeries: number;
    numberOfStudyRelatedInstances: number;
    patientAge: string;
    institutionName: string;
    referringPhysicianName: string;
    ImportDateTime: string;
    patientId: string;
    status?: 'pending' | 'completed' | 'local';
    isRemote?: boolean;
    userComments?: string;
    // Searchable normalized field
    studyDescriptionNormalized: string;
}

export const StudySchema: RxJsonSchema<StudyDocType> = {
    version: 10,
    primaryKey: 'studyInstanceUID',
    type: 'object',
    properties: {
        studyInstanceUID: {
            type: 'string',
            maxLength: 100
        },
        studyDate: {
            type: 'string',
            maxLength: 20
        },
        studyTime: {
            type: 'string'
        },
        accessionNumber: {
            type: 'string',
            maxLength: 100
        },
        studyDescription: {
            type: 'string',
            maxLength: 200
        },
        studyID: {
            type: 'string'
        },
        modalitiesInStudy: {
            type: 'array',
            items: {
                type: 'string'
            }
        },
        numberOfStudyRelatedSeries: {
            type: 'number'
        },
        numberOfStudyRelatedInstances: {
            type: 'number',
            multipleOf: 1,
            minimum: 0,
            maximum: 1000000
        },
        patientAge: {
            type: 'string'
        },
        institutionName: {
            type: 'string',
            maxLength: 200
        },
        referringPhysicianName: {
            type: 'string'
        },
        ImportDateTime: {
            type: 'string',
            format: 'date-time',
            maxLength: 40
        },
        patientId: {
            type: 'string',
            ref: 'patients',
            maxLength: 200
        },
        studyDescriptionNormalized: {
            type: 'string',
            maxLength: 200
        },
        status: {
            type: 'string',
            enum: ['pending', 'completed', 'local']
        },
        userComments: {
            type: 'string',
            maxLength: 1000
        },
        isRemote: {
            type: 'boolean'
        }
    },
    required: ['studyInstanceUID', 'patientId'],
    indexes: ['patientId', 'studyDate', 'ImportDateTime', 'studyDescription', 'studyDescriptionNormalized', 'userComments', 'accessionNumber', 'institutionName', 'numberOfStudyRelatedInstances']
};
