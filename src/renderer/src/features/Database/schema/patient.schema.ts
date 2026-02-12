import { RxJsonSchema } from 'rxdb';

export const PatientSchema: RxJsonSchema<any> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: {
            type: 'string',
            maxLength: 100 // Primary Key
        },
        patientName: {
            type: 'string'
        },
        patientID: {
            type: 'string'
        },
        patientBirthDate: {
            type: 'string'
        },
        patientSex: {
            type: 'string'
        },
        // Relationships (RxDB handles via query, but good to note)
        // studies: [Study]
    },
    required: ['id', 'patientName', 'patientID']
};
