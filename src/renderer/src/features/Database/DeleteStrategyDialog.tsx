import React from 'react';
import { AlertTriangle, Database, FileX } from 'lucide-react';

interface DeleteStrategyDialogProps {
    title: string;
    description: string;
    onSelect: (strategy: 'record-only' | 'record-and-files' | 'cancel') => void;
}

export const DeleteStrategyDialog: React.FC<DeleteStrategyDialogProps> = ({
    title,
    description,
    onSelect
}) => {
    React.useEffect(() => {
        console.log('DeleteStrategyDialog: Mounted with title:', title);
    }, [title]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1c1c1e] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 px-6 py-6 flex flex-col items-center text-center gap-3">
                    <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 ring-4 ring-red-500/10">
                        <AlertTriangle size={32} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
                        <p className="text-white/60 text-xs mt-1 leading-relaxed">
                            {description}
                        </p>
                    </div>
                </div>

                {/* Options */}
                <div className="p-4 flex flex-col gap-3">
                    <button
                        onClick={() => onSelect('record-only')}
                        className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group text-left"
                    >
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                            <Database size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-bold text-white">Remove Record Only</div>
                            <div className="text-[10px] text-white/40 mt-0.5">Keep the original DICOM files on your disk.</div>
                        </div>
                    </button>

                    <button
                        onClick={() => onSelect('record-and-files')}
                        className="flex items-center gap-4 p-4 rounded-xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-all group text-left"
                    >
                        <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                            <FileX size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-bold text-red-400">Remove Record & Files</div>
                            <div className="text-[10px] text-red-400/40 mt-0.5 italic">Warning: This will permanently delete DICOM files.</div>
                        </div>
                    </button>
                </div>

                {/* Footer */}
                <div className="p-4 pt-0 flex gap-2">
                    <button
                        onClick={() => onSelect('cancel')}
                        className="flex-1 py-3 text-xs font-bold text-white/40 hover:text-white/80 transition-colors uppercase tracking-widest"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
