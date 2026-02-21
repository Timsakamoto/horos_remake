import Database from 'better-sqlite3';
import { join } from 'node:path';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';

export class SQLiteManager {
    private static instance: SQLiteManager;
    private db: Database.Database | null = null;

    private constructor() {
        this.init();
    }

    public static getInstance(): SQLiteManager {
        if (!SQLiteManager.instance) {
            SQLiteManager.instance = new SQLiteManager();
        }
        return SQLiteManager.instance;
    }

    private init() {
        try {
            const userDataPath = app.getPath('userData');
            const dbDir = join(userDataPath, 'database');

            if (!existsSync(dbDir)) {
                mkdirSync(dbDir, { recursive: true });
            }

            const dbPath = join(dbDir, 'peregrine_v2.db');
            console.log(`[SQLiteManager] Initializing database at: ${dbPath}`);

            this.db = new Database(dbPath, {
                timeout: 5000 // Critical: allow waiting for locks
                // verbose: console.log 
            });

            // Enable WAL mode for high-concurrency performance (read while writing)
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('busy_timeout = 5000');
            this.db.pragma('cache_size = -2000'); // ~2MB cache

            console.log('[SQLiteManager] Database initialized successfully in WAL mode.');
            const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            console.log('[SQLiteManager] Existing tables:', tables.map((t: any) => t.name).join(', '));
        } catch (err) {
            console.error('[SQLiteManager] Initialization failed:', err);
            throw err;
        }
    }

    public getDB(): Database.Database {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db;
    }

    public close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[SQLiteManager] Database closed.');
        }
    }
}
