import { useState } from 'react';
import { Download, Inbox, Loader2 } from 'lucide-react';
import { usePACS } from './PACSProvider';
import { useDatabase } from '../Database/DatabaseProvider';
import { importStudyFromPACS } from '../Database/importService';

export const PACSResults = () => {
    const { results, isSearching, activeServer } = usePACS();
    const db = useDatabase();
    const [downloadingStudy, setDownloadingStudy] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>('');

    const handleDownload = async (studyUID: string) => {
        if (!db || !activeServer) return;
        setDownloadingStudy(studyUID);
        try {
            await importStudyFromPACS(db, activeServer.url, studyUID, (msg) => {
                setProgress(msg);
            });
            // Success - maybe show a checkmark or notification
            setProgress('Import Complete!');
            setTimeout(() => {
                setDownloadingStudy(null);
                setProgress('');
            }, 2000);
        } catch (error) {
            console.error('Download failed:', error);
            setProgress('Failed to download');
            setTimeout(() => setDownloadingStudy(null), 3000);
        }
    };

    if (!isSearching && results.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-4">
                <div className="p-6 bg-gray-50 rounded-full">
                    <Inbox size={48} strokeWidth={1} />
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-gray-400">No results to display</span>
                    <span className="text-[10px] uppercase tracking-widest font-black">Adjust your filters or active node</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-hidden flex flex-col bg-white relative">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left select-none border-collapse">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-white border-b border-gray-100 text-[10px] font-black text-gray-300 uppercase tracking-[0.15em]">
                            <th className="px-6 py-4 font-black">Patient Name</th>
                            <th className="px-4 py-4 font-black text-center">Mod</th>
                            <th className="px-4 py-4 font-black">Study Date</th>
                            <th className="px-4 py-4 font-black">Description</th>
                            <th className="px-4 py-4 font-black text-right">Inst</th>
                            <th className="px-6 py-4 font-black text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="text-[13px] text-gray-600 font-medium">
                        {results.map((result) => (
                            <tr
                                key={result.studyInstanceUID}
                                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors group cursor-pointer"
                            >
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-900">{result.patientName}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">{result.patientId}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-center">
                                    <span className="px-2 py-0.5 bg-blue-50 text-horos-accent rounded-full text-[10px] font-black uppercase tracking-widest">
                                        {result.modality || '??'}
                                    </span>
                                </td>
                                <td className="px-4 py-4 tabular-nums text-gray-500">{result.studyDate}</td>
                                <td className="px-4 py-4 truncate max-w-xs text-gray-400 font-semibold">{result.description}</td>
                                <td className="px-4 py-4 text-right tabular-nums font-bold text-gray-400">{result.numInstances}</td>
                                <td className="px-6 py-4 text-center">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDownload(result.studyInstanceUID);
                                        }}
                                        disabled={!!downloadingStudy}
                                        className="p-2.5 rounded-xl text-horos-accent bg-blue-50 opacity-0 group-hover:opacity-100 hover:bg-horos-accent hover:text-white transition-all transform hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <Download size={16} strokeWidth={2.5} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Loading/Download Indicator Overlay */}
            {(isSearching || downloadingStudy) && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center z-20 animate-in fade-in duration-300">
                    <div className="flex flex-col items-center gap-3">
                        {isSearching ? (
                            <>
                                <div className="w-2 h-2 rounded-full bg-horos-accent animate-ping" />
                                <span className="text-[11px] font-black text-horos-accent uppercase tracking-widest">Searching Server...</span>
                            </>
                        ) : (
                            <>
                                <Loader2 className="animate-spin text-horos-accent" size={24} />
                                <div className="flex flex-col items-center">
                                    <span className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Importing Study</span>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">{progress}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
