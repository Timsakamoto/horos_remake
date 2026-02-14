import React from 'react';
import { Database, Link, XCircle } from 'lucide-react';

interface Props {
    onSelect: (strategy: 'copy' | 'link' | 'cancel') => void;
    fileCount: number;
}

export const ImportStrategyDialog: React.FC<Props> = ({ onSelect, fileCount }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="w-[440px] bg-[#f0f0f0] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-[#c0c0c0] overflow-hidden flex flex-col scale-in-center">
                {/* Header (Brushed Metal look) */}
                <div className="h-10 bg-gradient-to-b from-[#f0f0f0] to-[#d8d8d8] border-b border-[#b0b0b0] flex items-center px-4">
                    <div className="flex gap-2 mr-3">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
                    </div>
                    <span className="text-[11px] font-bold text-gray-700 uppercase tracking-widest">
                        Import Strategy
                    </span>
                </div>

                {/* Content Area */}
                <div className="p-8 flex flex-col items-center gap-6">
                    <div className="w-16 h-16 bg-[#387aff]/10 rounded-2xl flex items-center justify-center text-peregrine-accent">
                        <Database size={32} strokeWidth={1.5} />
                    </div>

                    <div className="flex flex-col items-center gap-2 text-center">
                        <h2 className="text-sm font-black text-gray-800 uppercase tracking-tight">
                            Ready to import {fileCount} items
                        </h2>
                        <p className="text-[11px] text-gray-500 leading-relaxed max-w-[280px]">
                            Choose how Peregrine should handle these files. Copying to the database is safer for long-term storage.
                        </p>
                    </div>

                    <div className="w-full flex flex-col gap-2 mt-2">
                        {/* Copy Option */}
                        <button
                            onClick={() => onSelect('copy')}
                            className="group flex items-center justify-between p-3 bg-white border border-[#d0d0d0] hover:border-peregrine-accent/50 rounded-xl transition-all shadow-sm hover:shadow-md"
                        >
                            <div className="flex items-center gap-4 text-left">
                                <div className="p-2 bg-green-500/10 rounded-lg text-green-600 group-hover:bg-green-500 group-hover:text-white transition-colors">
                                    <Database size={18} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-black text-gray-800 uppercase">Copy to Database</div>
                                    <div className="text-[9px] text-gray-500">Files will be moved to the managed Peregrine folder.</div>
                                </div>
                            </div>
                            <div className="w-4 h-4 rounded-full border-2 border-gray-200 group-hover:border-peregrine-accent group-hover:bg-peregrine-accent/20 transition-all" />
                        </button>

                        {/* Link Option */}
                        <button
                            onClick={() => onSelect('link')}
                            className="group flex items-center justify-between p-3 bg-white border border-[#d0d0d0] hover:border-peregrine-accent/50 rounded-xl transition-all shadow-sm hover:shadow-md"
                        >
                            <div className="flex items-center gap-4 text-left">
                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                    <Link size={18} />
                                </div>
                                <div>
                                    <div className="text-[11px] font-black text-gray-800 uppercase">Link Files</div>
                                    <div className="text-[9px] text-gray-500">Peregrine will only reference the original locations.</div>
                                </div>
                            </div>
                            <div className="w-4 h-4 rounded-full border-2 border-gray-200 group-hover:border-peregrine-accent group-hover:bg-peregrine-accent/20 transition-all" />
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="h-14 bg-[#e8e8e8] border-t border-[#d0d0d0] flex items-center justify-between px-6">
                    <button
                        onClick={() => onSelect('cancel')}
                        className="flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors"
                    >
                        <XCircle size={14} />
                        Cancel
                    </button>
                    <span className="text-[9px] font-bold text-gray-400 italic">
                        Select one to proceed
                    </span>
                </div>
            </div>
        </div>
    );
};
