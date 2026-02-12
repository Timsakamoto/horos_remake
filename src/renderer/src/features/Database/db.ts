import { createRxDatabase, RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { PatientSchema } from './schema/patient.schema';
import { StudySchema } from './schema/study.schema';
import { SeriesSchema } from './schema/series.schema';
import { ImageSchema } from './schema/image.schema';

// Enable dev mode
// import { addRxPlugin } from 'rxdb';
// import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
// addRxPlugin(RxDBDevModePlugin);

export type AntigravityDatabaseCollections = {
    patients: RxCollection<any>;
    studies: RxCollection<any>;
    series: RxCollection<any>;
    images: RxCollection<any>;
};

export type AntigravityDatabase = RxDatabase<AntigravityDatabaseCollections>;

let dbPromise: Promise<AntigravityDatabase> | null = null;

const _create = async (): Promise<AntigravityDatabase> => {
    console.log('DatabaseService: Creating database...');

    // Create database instance
    const db = await createRxDatabase<AntigravityDatabaseCollections>({
        name: 'antigravitydb',
        storage: getRxStorageDexie() // Use Dexie (IndexedDB wrapper) for storage
    });

    console.log('DatabaseService: Adding collections...');

    // Add collections
    await db.addCollections({
        patients: {
            schema: PatientSchema
        },
        studies: {
            schema: StudySchema
        },
        series: {
            schema: SeriesSchema
        },
        images: {
            schema: ImageSchema
        }
    });

    console.log('DatabaseService: Database created');
    return db;
};

export const getDatabase = (): Promise<AntigravityDatabase> => {
    if (!dbPromise) {
        dbPromise = _create();
    }
    return dbPromise;
};
