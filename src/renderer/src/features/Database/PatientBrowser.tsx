import React, { useState } from 'react';
import { Search, User, Upload, MoreHorizontal } from 'lucide-react';
import { useDatabase } from './DatabaseProvider';

interface PatientBrowserProps {
    onSelect: (patientId: string) => void;
    onStudySelect: (studyUid: string | null) => void;
    selectedId?: string | null;
    selectedStudyUid?: string | null;
}

export const PatientBrowser: React.FC<PatientBrowserProps> = ({
    onSelect,
    onStudySelect,
    selectedId,
    selectedStudyUid
}) => {
    const { patients, studies, handleImport, fetchStudies } = useDatabase();
    const [filterText, setFilterText] = useState('');

    const onImportClick = () => {
        handleImport();
    };

    const handlePatientClick = (patientId: string) => {
        onSelect(patientId);
        fetchStudies(patientId);
        onStudySelect(null); // Reset study when patient changes
    };

    const filteredPatients = patients.filter(p =>
        String(p.patientName || '').toLowerCase().includes(filterText.toLowerCase()) ||
        String(p.patientID || '').toLowerCase().includes(filterText.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-white select-none">
            {/* Database Header */}
            <div className="p-6 pb-2 flex flex-col gap-4">
                <div className="flex justify-between items-center pr-1">
                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">Local Database</span>
                    <div className="flex gap-4">
                        <button onClick={onImportClick} className="text-gray-300 hover:text-horos-accent transition-colors" title="Import"><Upload size={14} strokeWidth={2.5} /></button>
                        <button className="text-gray-300 hover:text-horos-accent transition-colors"><MoreHorizontal size={14} strokeWidth={2.5} /></button>
                    </div>
                </div>
                <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-horos-accent transition-colors" size={14} strokeWidth={2.5} />
                    <input
                        type="text"
                        placeholder="Filter database..."
                        className="w-full pl-10 pr-4 py-2 text-[12px] font-medium bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-horos-accent/20 outline-none transition-all placeholder:text-gray-300"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto px-2 pt-2">
                <div className="space-y-1">
                    {filteredPatients.map(patient => (
                        <div key={patient.id} className="flex flex-col">
                            <div
                                onClick={() => handlePatientClick(patient.id)}
                                className={`
                                    group flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all duration-200
                                    ${selectedId === patient.id
                                        ? 'bg-blue-50/80 shadow-[0_2px_8px_rgba(37,99,235,0.06)]'
                                        : 'hover:bg-gray-50'
                                    }
                                `}
                            >
                                <div className={`
                                    w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300
                                    ${selectedId === patient.id
                                        ? 'bg-horos-accent text-white scale-105'
                                        : 'bg-blue-50 text-horos-accent group-hover:bg-blue-100'
                                    }
                                `}>
                                    <User size={16} strokeWidth={selectedId === patient.id ? 2.5 : 2} />
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className={`
                                        text-[13px] font-bold tracking-tight truncate
                                        ${selectedId === patient.id ? 'text-gray-900' : 'text-gray-700'}
                                    `}>
                                        {patient.patientName}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-gray-400 font-medium">{patient.patientID}</span>
                                        <div className="w-1 h-1 rounded-full bg-gray-200" />
                                        <span className="text-[10px] text-gray-400 font-medium tabular-nums">{patient.studyCount} Studies</span>
                                    </div>
                                </div>
                            </div>

                            {/* Studies Drill-down */}
                            {selectedId === patient.id && studies.length > 0 && (
                                <div className="ml-11 mt-1 space-y-1 border-l-2 border-blue-100 pl-3 py-1 animate-in slide-in-from-top-2 duration-300">
                                    {studies.map(study => (
                                        <div
                                            key={study.studyInstanceUID}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onStudySelect(study.studyInstanceUID);
                                            }}
                                            className={`
                                                px-3 py-2 rounded-lg cursor-pointer transition-all text-[11px]
                                                ${selectedStudyUid === study.studyInstanceUID
                                                    ? 'bg-blue-50 text-blue-700 font-bold'
                                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                                }
                                            `}
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="truncate max-w-[140px]">{study.studyDescription || 'No Description'}</span>
                                                <span className="text-[9px] opacity-60 tabular-nums">{study.studyDate}</span>
                                            </div>
                                            <div className="text-[9px] opacity-70 mt-0.5">{study.modalitiesInStudy?.join(', ') || 'OT'}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {filteredPatients.length === 0 && (
                        <div className="py-12 px-6 text-center">
                            <div className="inline-flex w-12 h-12 rounded-full bg-gray-50 items-center justify-center mb-3">
                                <Search size={20} className="text-gray-200" />
                            </div>
                            <p className="text-[11px] font-bold text-gray-300 uppercase tracking-widest">No entries found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Browser Footer */}
            <div className="p-5 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center transition-all">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">Live Database</span>
                </div>
                <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                    {filteredPatients.length} / {patients.length} ENTRIES
                </span>
            </div>
        </div>
    );
};
