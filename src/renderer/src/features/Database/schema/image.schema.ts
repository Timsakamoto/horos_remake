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
    rescaleIntercept: number;
    rescaleSlope: number;
    imagePositionPatient?: number[];
    imageOrientationPatient?: number[];
    pixelSpacing?: number[];
    sliceThickness?: number;
    acquisitionNumber?: number;
    echoNumber?: number;
    temporalPositionIdentifier?: number;
    imageType?: string; // Stored as joined string
    sequenceName?: string;
    diffusionBValue?: number;
    dicomSeriesInstanceUID?: string;
}

export const ImageSchema: RxJsonSchema<ImageDocType> = {
    version: 6,
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
        },
        rescaleIntercept: {
            type: 'number'
        },
        rescaleSlope: {
            type: 'number'
        },
        imagePositionPatient: {
            type: 'array',
            items: { type: 'number' }
        },
        imageOrientationPatient: {
            type: 'array',
            items: { type: 'number' }
        },
        pixelSpacing: {
            type: 'array',
            items: { type: 'number' }
        },
        sliceThickness: {
            type: 'number'
        },
        acquisitionNumber: {
            type: 'number'
        },
        echoNumber: {
            type: 'number'
        },
        temporalPositionIdentifier: {
            type: 'number'
        },
        imageType: {
            type: 'string'
        },
        sequenceName: {
            type: 'string'
        },
        diffusionBValue: {
            type: 'number'
        },
        dicomSeriesInstanceUID: {
            type: 'string',
            maxLength: 100
        }
    },
    required: ['sopInstanceUID', 'seriesInstanceUID', 'filePath'],
    indexes: [['seriesInstanceUID', 'instanceNumber'], 'seriesInstanceUID', 'instanceNumber']
};
