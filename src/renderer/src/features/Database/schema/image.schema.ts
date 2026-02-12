import { RxJsonSchema } from 'rxdb';

export const ImageSchema: RxJsonSchema<any> = {
    version: 0,
    primaryKey: 'sopInstanceUID',
    type: 'object',
    properties: {
        sopInstanceUID: {
            type: 'string',
            maxLength: 100
        },
        instanceNumber: {
            type: 'number'
        },
        sopClassUID: {
            type: 'string'
        },
        filePath: {
            type: 'string' // Absolute path to DICOM file
        },
        seriesInstanceUID: {
            type: 'string', // Foreign Key to Series
            ref: 'series'
        }
    },
    required: ['sopInstanceUID', 'seriesInstanceUID', 'filePath'],
    indexes: ['seriesInstanceUID']
};
