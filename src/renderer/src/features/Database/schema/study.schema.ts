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
    version: 3,
    primaryKey: 'studyInstanceUID',
    type: 'object',
    properties: {
        studyInstanceUID: {
            type: 'string',
            maxLength: 100
        },
        studyDate: {
            type: 'string'
        },
        studyTime: {
            type: 'string'
        },
        accessionNumber: {
            type: 'string'
        },
        studyDescription: {
            type: 'string'
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
            type: 'number'
        },
        patientAge: {
            type: 'string'
        },
        institutionName: {
            type: 'string'
        },
        referringPhysicianName: {
            type: 'string'
        },
        ImportDateTime: {
            type: 'string',
            format: 'date-time'
        },
        patientId: {
            type: 'string',
            ref: 'T_Patient'
        },
        studyDescriptionNormalized: {
            type: 'string'
        },
        status: {
            type: 'string',
            enum: ['pending', 'completed', 'local']
        },
        userComments: {
            type: 'string'
        },
        isRemote: {
            type: 'boolean'
        }
    },
    required: ['studyInstanceUID', 'patientId'],
    indexes: ['patientId', 'studyDate', 'ImportDateTime', 'studyDescriptionNormalized', 'userComments']
};
