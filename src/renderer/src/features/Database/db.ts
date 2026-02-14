import { createRxDatabase, RxDatabase, RxCollection, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { PatientSchema, PatientDocType } from './schema/patient.schema';
import { StudySchema, StudyDocType } from './schema/study.schema';
import { SeriesSchema, SeriesDocType } from './schema/series.schema';
import { ImageSchema, ImageDocType } from './schema/image.schema';

// Add mandatory plugins
addRxPlugin(RxDBMigrationSchemaPlugin);

export type AntigravityDatabaseCollections = {
    T_Patient: RxCollection<PatientDocType>;
    T_Study: RxCollection<StudyDocType>;
    T_Subseries: RxCollection<SeriesDocType>;
    T_FilePath: RxCollection<ImageDocType>;
};

export type AntigravityDatabase = RxDatabase<AntigravityDatabaseCollections>;

let dbPromise: Promise<AntigravityDatabase> | null = null;

const _create = async (): Promise<AntigravityDatabase> => {
    console.log('DatabaseService: Creating database...');

    try {
        const db = await createRxDatabase<AntigravityDatabaseCollections>({
            name: 'antigravitydb',
            storage: getRxStorageDexie()
        });

        console.log('DatabaseService: Adding collections...');

        await db.addCollections({
            T_Patient: {
                schema: PatientSchema,
                migrationStrategies: {
                    1: (oldDoc) => ({
                        ...oldDoc,
                        patientNameNormalized: String(oldDoc.patientName || '').toLowerCase()
                    }),
                    2: (oldDoc) => oldDoc // No change needed for existing records, but schema version bumped
                }
            },
            T_Study: {
                schema: StudySchema,
                migrationStrategies: {
                    1: (oldDoc) => ({
                        ...oldDoc,
                        numberOfStudyRelatedSeries: 0,
                        numberOfStudyRelatedInstances: 0,
                        studyDescriptionNormalized: (oldDoc.studyDescription || '').toLowerCase()
                    })
                }
            },
            T_Subseries: {
                schema: SeriesSchema,
                migrationStrategies: {
                    1: (oldDoc) => ({
                        ...oldDoc,
                        numberOfSeriesRelatedInstances: 0,
                        bodyPartExamined: '',
                        protocolName: ''
                    })
                }
            },
            T_FilePath: {
                schema: ImageSchema,
                migrationStrategies: {
                    1: (oldDoc) => oldDoc,
                    2: (oldDoc) => ({
                        ...oldDoc,
                        fileSize: 0,
                        transferSyntaxUID: ''
                    }),
                    3: (oldDoc) => ({
                        ...oldDoc,
                        windowCenter: 40,
                        windowWidth: 400
                    }),
                    4: (oldDoc) => oldDoc
                }
            }
        });

        console.log('DatabaseService: Database created');
        return db;
    } catch (err) {
        console.error('DatabaseService: Error in _create:', err);
        throw err;
    }
};

export const getDatabase = (): Promise<AntigravityDatabase> => {
    if (!dbPromise) {
        dbPromise = _create();
    }
    return dbPromise;
};

export const removeDatabase = async () => {
    const { removeRxDatabase } = await import('rxdb');
    dbPromise = null;
    await removeRxDatabase('antigravitydb', getRxStorageDexie());
};
