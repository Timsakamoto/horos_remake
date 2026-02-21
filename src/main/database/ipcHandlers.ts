import { ipcMain } from 'electron';
import { SQLiteManager } from './SQLiteManager';
import { ImportManager } from './ImportManager';

export const setupDatabaseHandlers = () => {
    // Trigger background import
    ipcMain.handle('db:importFiles', async (_, filePaths: string[]) => {
        try {
            // Smoke test for DB readiness
            SQLiteManager.getInstance().getDB();
            // Don't await the whole import, it runs in background
            ImportManager.getInstance().importFiles(filePaths);
            return true;
        } catch (err: any) {
            console.error('[SQLite IPC] Import trigger error:', err.message);
            throw err;
        }
    });

    // Generic query handler (Read)
    ipcMain.handle('db:query', async (_, sql: string, params: any[] = []) => {
        try {
            const db = SQLiteManager.getInstance().getDB();
            const stmt = db.prepare(sql);
            return stmt.all(...params);
        } catch (err: any) {
            console.error('[SQLite IPC] Query error:', err.message, sql);
            throw err;
        }
    });

    // Single result handler (Read)
    ipcMain.handle('db:get', async (_, sql: string, params: any[] = []) => {
        try {
            const db = SQLiteManager.getInstance().getDB();
            const stmt = db.prepare(sql);
            return stmt.get(...params);
        } catch (err: any) {
            console.error('[SQLite IPC] Get error:', err.message, sql);
            throw err;
        }
    });

    // Generic execution handler (Write)
    ipcMain.handle('db:run', async (_, sql: string, params: any[] = []) => {
        try {
            const db = SQLiteManager.getInstance().getDB();
            const stmt = db.prepare(sql);
            const result = stmt.run(...params);
            return {
                changes: result.changes,
                lastInsertRowid: result.lastInsertRowid
            };
        } catch (err: any) {
            console.error('[SQLite IPC] Execution error:', err.message, sql);
            throw err;
        }
    });

    // Transactional execution (Batch)
    ipcMain.handle('db:transaction', async (_, operations: { sql: string; params: any[] }[]) => {
        try {
            const db = SQLiteManager.getInstance().getDB();
            const transaction = db.transaction((ops: { sql: string; params: any[] }[]) => {
                const results = [];
                for (const op of ops) {
                    results.push(db.prepare(op.sql).run(...op.params));
                }
                return results;
            });
            // @ts-ignore
            return transaction.immediate(operations);
        } catch (err: any) {
            const isLockError = err.code === 'SQLITE_BUSY' || err.message?.includes('locked');
            if (isLockError) {
                console.error('[SQLite IPC] Transaction BLOCKED by lock. Timeout might be too low.');
            }
            console.error('[SQLite IPC] Transaction error:', err.message);
            throw err;
        }
    });
};
