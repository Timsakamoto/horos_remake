import { RxJsonSchema } from 'rxdb';

export interface ImageDocType {
    sopInstanceUID: string;
    instanceNumber: number;
    numberOfFrames: number;
    sopClassUID: string;
    filePath: string;
    fileSize: number;
    transferSyntaxUID: string;
    seriesInstanceUID: string;
    windowCenter: number;
    windowWidth: number;
}

export const ImageSchema: RxJsonSchema<ImageDocType> = {
    version: 4,
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
        numberOfFrames: {
            type: 'number'
        },
        sopClassUID: {
            type: 'string'
        },
        filePath: {
            type: 'string'
        },
        fileSize: {
            type: 'number'
        },
        transferSyntaxUID: {
            type: 'string'
        },
        seriesInstanceUID: {
            type: 'string',
            ref: 'T_Subseries'
        },
        windowCenter: {
            type: 'number'
        },
        windowWidth: {
            type: 'number'
        }
    },
    required: ['sopInstanceUID', 'seriesInstanceUID', 'filePath'],
    indexes: [['seriesInstanceUID', 'instanceNumber'], 'seriesInstanceUID', 'instanceNumber']
};
