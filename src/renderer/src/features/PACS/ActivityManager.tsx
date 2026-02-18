import { X, Trash2, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { usePACS } from './PACSProvider';
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ActivityManager = ({ isOpen, onClose }: ActivityManagerProps) => {
    const { activeJobs, clearCompletedJobs } = usePACS();

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[150]"
                    />

                    {/* Side Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-full w-[400px] bg-white shadow-2xl z-[160] flex flex-col border-l border-gray-100"
                    >
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-peregrine-accent/10 flex items-center justify-center text-peregrine-accent">
                                    <Clock size={20} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h2 className="text-[16px] font-black tracking-tight text-gray-900 leading-tight">Database Activity</h2>
                                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{activeJobs.length} active tasks</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={clearCompletedJobs}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors group"
                                    title="Clear Completed"
                                >
                                    <Trash2 size={18} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Job List */}
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                            {activeJobs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-40">
                                    <div className="bg-gray-100 p-4 rounded-full">
                                        <Clock size={32} />
                                    </div>
                                    <p className="text-sm font-medium text-gray-500">No active background tasks</p>
                                </div>
                            ) : (
                                activeJobs.map((job) => (
                                    <div key={job.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 uppercase">
                                                        {job.type}
                                                    </span>
                                                    <h3 className="text-[13px] font-bold text-gray-900">{job.description}</h3>
                                                </div>
                                                <p className="text-[11px] text-gray-500 font-medium">Node: {job.nodeName}</p>
                                            </div>
                                            <div className="flex items-center">
                                                {job.status === 'active' && (
                                                    <Loader2 size={16} className="text-peregrine-accent animate-spin" />
                                                )}
                                                {job.status === 'completed' && (
                                                    <CheckCircle2 size={16} className="text-green-500" />
                                                )}
                                                {job.status === 'failed' && (
                                                    <AlertCircle size={16} className="text-red-500" />
                                                )}
                                                {job.status === 'pending' && (
                                                    <Clock size={16} className="text-gray-300" />
                                                )}
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-tight">
                                                <span>{job.details}</span>
                                                <span>{Math.round(job.progress)}%</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                                <motion.div
                                                    className={`h-full ${job.status === 'failed' ? 'bg-red-500' : 'bg-peregrine-accent'
                                                        }`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${job.progress}%` }}
                                                    transition={{ duration: 0.5 }}
                                                />
                                            </div>
                                        </div>

                                        {job.error && (
                                            <p className="text-[11px] text-red-500 font-bold bg-red-50 p-2 rounded-lg border border-red-100">
                                                {job.error}
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
