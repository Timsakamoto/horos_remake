import { PACSServer, PACSStudy } from './pacsClient';

export interface LocalListenerSettings {
    aeTitle: string;
    port: number;
    isRunning: boolean;
}

export interface PACSJob {
    id: string;
    type: 'C-MOVE' | 'C-FIND' | 'C-ECHO' | 'C-STORE';
    status: 'pending' | 'active' | 'completed' | 'failed';
    description: string;
    progress: number;
    details: string;
    nodeName: string;
    timestamp: number;
    error?: string;
}

export interface PACSServerWithStatus extends PACSServer {
    status?: 'online' | 'offline' | 'checking';
}

export type { PACSServer, PACSStudy };
