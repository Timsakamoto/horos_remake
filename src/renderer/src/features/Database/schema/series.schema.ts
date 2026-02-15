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
}

export const SeriesSchema: RxJsonSchema<SeriesDocType> = {
    version: 2,
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
            ref: 'T_Study'
        },
        dicomSeriesInstanceUID: {
            type: 'string',
            maxLength: 100
        }
    },
    required: ['seriesInstanceUID', 'studyInstanceUID'],
    indexes: ['studyInstanceUID', 'modality']
};
