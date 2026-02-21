import { useState, useCallback } from 'react';

export interface SQLiteResult<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

export function useSQLite<T>(sql: string, params: any[] = []): SQLiteResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // @ts-ignore
            const result = await window.electron.db.query(sql, params);
            setData(result as T);
        } catch (err: any) {
            setError(err);
            console.error('[useSQLite] Query failed:', err);
        } finally {
            setLoading(false);
        }
    }, [sql, JSON.stringify(params)]);

    return { data, loading, error, refresh: fetchData };
}
