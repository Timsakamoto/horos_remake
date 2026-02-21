import { EventEmitter } from 'events';

export interface PACSJob {
    id: string;
    type: 'C-MOVE' | 'C-FIND' | 'C-ECHO' | 'C-STORE' | 'IMPORT';
    status: 'pending' | 'active' | 'completed' | 'failed';
    description: string;
    progress: number; // 0-100
    details: string;
    nodeName: string;
    timestamp: number;
    error?: string;
    count?: number;
    total?: number;
}

export class JobManager extends EventEmitter {
    private jobs: Map<string, PACSJob> = new Map();
    private static instance: JobManager;

    private constructor() {
        super();
    }

    public static getInstance(): JobManager {
        if (!JobManager.instance) {
            JobManager.instance = new JobManager();
        }
        return JobManager.instance;
    }

    public createJob(type: PACSJob['type'], description: string, nodeName: string, total: number = 0): PACSJob {
        const id = Math.random().toString(36).substring(7);
        const job: PACSJob = {
            id,
            type,
            status: 'pending',
            description,
            progress: 0,
            details: 'Queued',
            nodeName,
            timestamp: Date.now(),
            total
        };
        this.jobs.set(id, job);
        this.emit('jobAdded', job);
        return job;
    }

    public updateJob(id: string, updates: Partial<PACSJob>) {
        const job = this.jobs.get(id);
        if (job) {
            const updatedJob = { ...job, ...updates };
            this.jobs.set(id, updatedJob);
            this.emit('jobUpdated', updatedJob);
        }
    }

    public completeJob(id: string) {
        this.updateJob(id, { status: 'completed', progress: 100, details: 'Finished' });
    }

    public failJob(id: string, error: string) {
        this.updateJob(id, { status: 'failed', details: 'Failed', error });
    }

    public getJobs(): PACSJob[] {
        return Array.from(this.jobs.values()).sort((a, b) => b.timestamp - a.timestamp);
    }

    public clearCompleted() {
        for (const [id, job] of this.jobs.entries()) {
            if (job.status === 'completed' || job.status === 'failed') {
                this.jobs.delete(id);
            }
        }
        this.emit('jobsCleared');
    }
}
