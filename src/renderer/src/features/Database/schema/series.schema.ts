import { RxJsonSchema } from 'rxdb';

export interface SeriesDocType {
    seriesInstanceUID: string;
    modality: string;
    seriesDate: string;
    seriesDescription: string;
    seriesNumber: number;
    numberOfSeriesRelatedInstances: number;
    bodyPartExamined: string;
    protocolName: string;
    studyInstanceUID: string;
    dicomSeriesInstanceUID?: string;
    frameOfReferenceUID?: string;
    fusionPairId?: string;
    ImportDateTime?: string;
}

export const SeriesSchema: RxJsonSchema<SeriesDocType> = {
    version: 9,
    primaryKey: 'seriesInstanceUID',
    type: 'object',
    properties: {
        seriesInstanceUID: {
            type: 'string',
            maxLength: 100
        },
        modality: {
            type: 'string',
            maxLength: 20
        },
        seriesDate: {
            type: 'string',
            maxLength: 20
        },
        seriesDescription: {
            type: 'string'
        },
        seriesNumber: {
            type: 'number'
        },
        numberOfSeriesRelatedInstances: {
            type: 'number'
        },
        bodyPartExamined: {
            type: 'string'
        },
        protocolName: {
            type: 'string'
        },
        studyInstanceUID: {
            type: 'string',
            ref: 'studies',
            maxLength: 100
        },
        dicomSeriesInstanceUID: {
            type: 'string',
            maxLength: 100
        },
        frameOfReferenceUID: {
            type: 'string',
            maxLength: 100
        },
        fusionPairId: {
            type: 'string',
            maxLength: 100
        },
        ImportDateTime: {
            type: 'string',
            format: 'date-time',
            maxLength: 40
        }
    },
    required: ['seriesInstanceUID', 'studyInstanceUID'],
    indexes: ['studyInstanceUID', 'modality', 'seriesDate', 'frameOfReferenceUID', 'dicomSeriesInstanceUID', 'fusionPairId', 'ImportDateTime']
};
