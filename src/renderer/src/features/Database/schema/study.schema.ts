import { RxJsonSchema } from 'rxdb';

export const StudySchema: RxJsonSchema<any> = {
    version: 0,
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
        modalitiesInStudy: {
            type: 'array',
            items: {
                type: 'string'
            }
        },
        patientId: {
            type: 'string', // Foreign Key to Patient
            ref: 'patient'
        }
    },
    required: ['studyInstanceUID', 'patientId'],
    indexes: ['patientId']
};
