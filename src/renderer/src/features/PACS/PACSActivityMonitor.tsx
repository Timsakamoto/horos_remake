import { usePACS } from './PACSProvider';
import { Loader2, CheckCircle2, AlertCircle, X, Trash2, Clock } from 'lucide-react';

export const PACSActivityMonitor = ({ onClose }: { onClose: () => void }) => {
    const { activeJobs, clearCompletedJobs } = usePACS();

    return (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-gray-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-gray-500">Activity Monitor</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                    <X size={16} className="text-gray-400" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {activeJobs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                        <Loader2 size={32} strokeWidth={1} className="opacity-20" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">No background tasks</span>
                    </div>
                ) : (
                    activeJobs.map((job) => (
                        <div key={job.id} className="p-3 rounded-xl border border-gray-100 bg-white shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${job.type === 'C-MOVE' ? 'bg-blue-50 text-blue-500' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    {job.type}
                                </span>
                                <span className="text-[9px] text-gray-400 font-mono">
                                    {new Date(job.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>

                            <div className="space-y-1">
                                <div className="text-[11px] font-bold text-gray-800 truncate" title={job.description}>
                                    {job.description}
                                </div>
                                <div className="text-[10px] text-gray-500 flex items-center gap-1.5 capitalize">
                                    {job.status === 'active' && <Loader2 size={10} className="animate-spin text-peregrine-accent" />}
                                    {job.status === 'completed' && <CheckCircle2 size={10} className="text-green-500" />}
                                    {job.status === 'failed' && <AlertCircle size={10} className="text-red-500" />}
                                    {job.details}
                                </div>
                            </div>

                            {job.status === 'active' && (
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-peregrine-accent transition-all duration-500"
                                        style={{ width: `${job.progress}%` }}
                                    />
                                </div>
                            )}

                            {job.error && (
                                <div className="text-[9px] text-red-500 bg-red-50 p-2 rounded border border-red-100">
                                    {job.error}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {activeJobs.some(j => j.status === 'completed' || j.status === 'failed') && (
                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={clearCompletedJobs}
                        className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 size={12} />
                        Clear Completed
                    </button>
                </div>
            )}
        </div>
    );
};
