import { useState } from 'react';
import { Download, Inbox, Loader2, Activity } from 'lucide-react';
import { usePACS } from './PACSProvider';
import { PACSStudy } from './pacsClient';
import { PACSActivityMonitor } from './PACSActivityMonitor';

export const PACSResults = () => {
    const { results, isSearching, retrieve, activeJobs } = usePACS();
    const [showActivity, setShowActivity] = useState(false);

    const handleDownload = async (study: PACSStudy) => {
        const success = await retrieve(study.studyInstanceUID);
        if (success) {
            setShowActivity(true);
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
                    <span className="text-[10px] uppercase tracking-widest font-black text-gray-300">Adjust filters or query node</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-hidden flex flex-col bg-white relative">
            {/* Table Header / Toolbar */}
            <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Inbox size={12} />
                        {results.length} Studies Found
                    </span>
                </div>
                <button
                    onClick={() => setShowActivity(!showActivity)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${showActivity
                        ? 'bg-peregrine-accent text-white border-peregrine-accent shadow-sm'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                >
                    <Activity size={12} className={activeJobs.some(j => j.status === 'active') ? 'animate-spin' : ''} />
                    Activity Monitor
                    {activeJobs.some(j => j.status === 'active') && (
                        <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                    )}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left select-none border-collapse">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <th className="px-4 py-3 font-black w-14"></th>
                            <th className="px-4 py-3 font-black">Patient Name</th>
                            <th className="px-4 py-3 font-black">ID / Accession</th>
                            <th className="px-4 py-3 font-black">Modality</th>
                            <th className="px-4 py-3 font-black">Date & Time</th>
                            <th className="px-4 py-3 font-black">Description</th>
                            <th className="px-4 py-3 font-black text-right">#</th>
                            <th className="px-4 py-3 font-black text-right">Node</th>
                        </tr>
                    </thead>
                    <tbody className="text-[12px] text-gray-600 font-medium">
                        {results.map((result) => {
                            const activeJob = activeJobs.find(j =>
                                j.type === 'C-MOVE' &&
                                j.status === 'active' &&
                                j.description.includes(result.studyInstanceUID)
                            );
                            const isDownloading = !!activeJob;

                            return (
                                <tr
                                    key={result.studyInstanceUID}
                                    className={`border-b border-gray-50 transition-all cursor-pointer group ${isDownloading ? 'bg-blue-50/30' : 'hover:bg-blue-50/10'
                                        }`}
                                >
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownload(result);
                                            }}
                                            disabled={isDownloading}
                                            className={`p-2 rounded-lg transition-all ${isDownloading
                                                ? 'text-blue-500 bg-blue-50 cursor-wait'
                                                : 'text-gray-300 hover:text-peregrine-accent hover:bg-blue-50'
                                                }`}
                                            title="Retrieve Study"
                                        >
                                            {isDownloading ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Download size={14} />
                                            )}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="font-bold text-gray-800 block text-[13px]">{result.patientName}</span>
                                        <span className="text-[10px] text-gray-400">{result.patientBirthDate}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col">
                                            <span className="font-mono text-gray-600">{result.patientId}</span>
                                            {isDownloading ? (
                                                <div className="space-y-1 mt-1">
                                                    <div className="text-[9px] font-bold text-peregrine-accent uppercase animate-pulse">
                                                        {activeJob.progress}% Received
                                                    </div>
                                                    <div className="w-full h-1 bg-blue-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-peregrine-accent transition-all duration-300"
                                                            style={{ width: `${activeJob.progress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-gray-400 font-mono">{result.accessionNumber}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold">
                                            {result.modality}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 tabular-nums text-gray-500">
                                        <div className="flex flex-col">
                                            <span>{result.studyDate}</span>
                                            <span className="text-[10px] text-gray-400">{result.studyTime}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 truncate max-w-xs text-gray-500 font-medium" title={result.description}>
                                        {result.description}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums font-mono text-gray-400">
                                        {result.numInstances}
                                    </td>
                                    <td className="px-4 py-3 text-right text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                                        {result.sourceAeTitle}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {isSearching && (
                <div className="absolute inset-x-0 top-0 h-1 bg-blue-100 overflow-hidden">
                    <div className="h-full bg-peregrine-accent animate-progress-indeterminate origin-left" />
                </div>
            )}

            {showActivity && <PACSActivityMonitor onClose={() => setShowActivity(false)} />}
        </div>
    );
};
