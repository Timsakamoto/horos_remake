import { RxJsonSchema } from 'rxdb';

export interface ThumbnailDocType {
    seriesInstanceUID: string;
    dataUrl: string;
    updatedAt: string;
}

export const ThumbnailSchema: RxJsonSchema<ThumbnailDocType> = {
    title: 'thumbnail schema',
    version: 0,
    description: 'stores pre-generated thumbnails for series',
    primaryKey: 'seriesInstanceUID',
    type: 'object',
    properties: {
        seriesInstanceUID: {
            type: 'string',
            maxLength: 128
        },
        dataUrl: {
            type: 'string' // Base64 thumbnail
        },
        updatedAt: {
            type: 'string',
            format: 'date-time'
        }
    },
    required: ['seriesInstanceUID', 'dataUrl', 'updatedAt']
};
