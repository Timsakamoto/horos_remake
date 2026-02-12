import { RxJsonSchema } from 'rxdb';

export const SeriesSchema: RxJsonSchema<any> = {
    version: 0,
    primaryKey: 'seriesInstanceUID',
    type: 'object',
    properties: {
        seriesInstanceUID: {
            type: 'string',
            maxLength: 100
        },
        modality: {
            type: 'string'
        },
        seriesDate: {
            type: 'string'
        },
        seriesDescription: {
            type: 'string'
        },
        seriesNumber: {
            type: 'number'
        },
        studyInstanceUID: {
            type: 'string', // Foreign Key to Study
            ref: 'study'
        }
    },
    required: ['seriesInstanceUID', 'studyInstanceUID'],
    indexes: ['studyInstanceUID']
};
