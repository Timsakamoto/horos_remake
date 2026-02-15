import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, User, Calendar, Database, Activity, Trash2, Search, X } from 'lucide-react';
import { useDatabase } from './DatabaseProvider';
import { usePACS } from '../PACS/PACSProvider'; // Import types

interface DatabaseTableProps {
    onPatientSelect: (id: string) => void;
    onStudySelect: (uid: string | null) => void;
    onSeriesSelect: (uid: string | null) => void;
    selectedPatientId: string | null;
    selectedStudyUid: string | null;
    selectedSeriesUid: string | null;
}

export const DatabaseTable: React.FC<DatabaseTableProps> = ({
    onPatientSelect,
    onStudySelect,
    onSeriesSelect,
    selectedPatientId,
    selectedStudyUid,
    selectedSeriesUid
}) => {
    const formatDICOMDate = (da: string | undefined): string => {
        if (!da || da === '-') return '-';
        const clean = da.replace(/[^0-9]/g, '');
        if (clean.length !== 8) return da;
        return `${clean.substring(0, 4)}/${clean.substring(4, 6)}/${clean.substring(6, 8)}`;
    };

    const { patients, db, requestDelete, lastDeletionTime, searchFilters, setSearchFilters, availableModalities, sortConfig, setSortConfig } = useDatabase();
    const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set());
    const [expandedStudies, setExpandedStudies] = useState<Set<string>>(new Set());
    const [studiesMap, setStudiesMap] = useState<Record<string, any[]>>({});
    const [seriesMap, setSeriesMap] = useState<Record<string, any[]>>({});
    const [hoveredCell, setHoveredCell] = useState<{ type: string; value: string } | null>(null);
    const [showCopyFeedback, setShowCopyFeedback] = useState(false);

    // Send to PACS State
    const { servers, sendToPacs } = usePACS();
    const [sendMenu, setSendMenu] = useState<{ x: number, y: number, type: 'study' | 'series', uid: string } | null>(null);
    const [showSendModal, setShowSendModal] = useState(false);

    const handleSort = (key: string) => {
        if (sortConfig.key === key) {
            setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
        } else {
            setSortConfig({ key, direction: 'desc' });
        }
    };

    const getSortIcon = (key: string) => {
        if (sortConfig.key !== key) return null;
        return (
            <span className="ml-1 text-[8px] font-black opacity-60">
                {sortConfig.direction === 'asc' ? '▲' : '▼'}
            </span>
        );
    };

    const fetchStudiesForPatient = async (patientId: string) => {
        if (!db) return;
        const patient = patients.find(p => p.id === patientId);
        if (!patient) return;

        if (patient._isStudy) {
            const seriesDocs = await db.T_Subseries.find({ selector: { studyInstanceUID: patientId } }).exec();
            const seriesWithCounts = await Promise.all(seriesDocs.map(async (s) => {
                const count = await db.T_FilePath.count({ selector: { seriesInstanceUID: s.seriesInstanceUID } }).exec();
                return { ...s.toJSON(), imageCount: count };
            }));
            setStudiesMap(prev => ({ ...prev, [patientId]: seriesWithCounts }));
        } else {
            const studies = await db.T_Study.find({
                selector: { patientId },
                sort: [{ ImportDateTime: 'desc' }]
            }).exec();
            // Fallback institutionName from patient if missing in study
            const patientDoc = await db.T_Patient.findOne(patientId).exec();
            const mappedStudies = studies.map(s => {
                const data = s.toJSON();
                return {
                    ...data,
                    institutionName: data.institutionName || patientDoc?.institutionName || ''
                };
            });
            setStudiesMap(prev => ({ ...prev, [patientId]: mappedStudies }));
        }
    };

    const fetchSeriesForStudy = async (studyUid: string) => {
        if (!db) return;
        const seriesDocs = await db.T_Subseries.find({ selector: { studyInstanceUID: studyUid } }).exec();
        const seriesWithCounts = await Promise.all(seriesDocs.map(async (s) => {
            const count = await db.T_FilePath.count({ selector: { seriesInstanceUID: s.seriesInstanceUID } }).exec();
            return { ...s.toJSON(), imageCount: count };
        }));
        setSeriesMap(prev => ({ ...prev, [studyUid]: seriesWithCounts }));
    };

    // Re-fetch data for expanded items when a deletion occurs
    useEffect(() => {
        if (lastDeletionTime > 0 && db) {
            // 1. Re-fetch expanded patients/studies in Study Mode
            expandedPatients.forEach(id => {
                if (patients.some(p => p.id === id)) {
                    fetchStudiesForPatient(id);
                } else {
                    // Item was deleted - clean up state
                    setExpandedPatients(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                    setStudiesMap(prev => {
                        const next = { ...prev };
                        delete next[id];
                        return next;
                    });
                }
            });

            // 2. Re-fetch expanded studies in Patient Mode
            expandedStudies.forEach(uid => {
                // We don't have a direct "all studies" list here easily, 
                // but we can just try to fetch. If it's gone, the result will be empty.
                fetchSeriesForStudy(uid).then(() => {
                    // Optional: If result is empty and you want to collapse, could check imageCount sum here
                });
            });
        }
    }, [lastDeletionTime, db]);

    // Clipboard copy functionality
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'c' && hoveredCell) {
                console.log('Copy triggered for:', hoveredCell);
                e.preventDefault();
                navigator.clipboard.writeText(hoveredCell.value).then(() => {
                    setShowCopyFeedback(true);
                    setTimeout(() => setShowCopyFeedback(false), 1000);
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hoveredCell]);

    const [showSearch, setShowSearch] = useState(false);
    const hasActiveFilters = searchFilters.patientName !== '' ||
        searchFilters.patientID !== '' ||
        searchFilters.dateRange.start !== '' ||
        searchFilters.dateRange.end !== '' ||
        searchFilters.modalities.length > 0 ||
        searchFilters.studyDescription !== '' ||
        searchFilters.userComments !== '';

    const togglePatient = async (patientId: string) => {
        const patient = patients.find(p => p.id === patientId);
        const newExpanded = new Set(expandedPatients);
        if (newExpanded.has(patientId)) {
            newExpanded.delete(patientId);
        } else {
            newExpanded.add(patientId);
            if (!studiesMap[patientId]) {
                await fetchStudiesForPatient(patientId);
            }
        }
        setExpandedPatients(newExpanded);

        if (patient?._isStudy) {
            onPatientSelect(patient.patientID); // Real Patient ID for context
            onStudySelect(patient.id); // Study UID for series browser
        } else {
            onPatientSelect(patientId);
            onStudySelect(null);
        }
    };

    const toggleStudy = async (studyUid: string) => {
        const newExpanded = new Set(expandedStudies);
        if (newExpanded.has(studyUid)) {
            newExpanded.delete(studyUid);
        } else {
            newExpanded.add(studyUid);
            if (!seriesMap[studyUid]) {
                await fetchSeriesForStudy(studyUid);
            }
        }
        setExpandedStudies(newExpanded);
        onStudySelect(studyUid);
    };

    const handleDeletePatient = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        requestDelete('patient', id, name);
    };

    const handleDeleteStudy = async (e: React.MouseEvent, uid: string, name: string) => {
        e.stopPropagation();
        requestDelete('study', uid, name);
    };

    const handleDeleteSeries = async (e: React.MouseEvent, seriesUid: string, name: string) => {
        e.stopPropagation();
        requestDelete('series', seriesUid, name);
    };

    // Keyboard Delete Handler
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedSeriesUid) {
                    // Try to find series name in both maps
                    const series = (seriesMap[selectedStudyUid!] || []).find(s => s.seriesInstanceUID === selectedSeriesUid) ||
                        (selectedPatientId ? (studiesMap[selectedPatientId!] || []).find(s => s.seriesInstanceUID === selectedSeriesUid) : null);
                    const sName = series?.seriesDescription || `Series ${series?.seriesNumber} ` || 'Selected Series';
                    requestDelete('series', selectedSeriesUid, sName);
                    return;
                }
                if (selectedStudyUid) {
                    const study = (studiesMap[selectedPatientId!] || []).find(s => s.studyInstanceUID === selectedStudyUid);
                    const stName = study?.studyDescription || 'Selected Study';
                    requestDelete('study', selectedStudyUid, stName);
                    return;
                }
                if (selectedPatientId) {
                    const patient = patients.find(p => p.id === selectedPatientId);
                    const pName = patient?.patientName || 'Selected Item';
                    // In Study Mode, the "Patient" ID is actually the StudyInstanceUID
                    if (patient?._isStudy) {
                        requestDelete('study', selectedPatientId, pName);
                    } else {
                        requestDelete('patient', selectedPatientId, pName);
                    }
                    return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPatientId, selectedStudyUid, selectedSeriesUid, patients, studiesMap, seriesMap, requestDelete]);

    return (
        <div className="flex-1 flex flex-col bg-white overflow-hidden shadow-2xl rounded-lg border border-gray-200 mx-4 mb-4">
            {/* Search Filter Bar (A6) */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[#f5f5f7] to-[#eeeeee] border-b border-[#d0d0d0]">
                <button
                    onClick={() => setShowSearch(!showSearch)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${hasActiveFilters ? 'bg-peregrine-accent text-white' : 'text-gray-500 hover:bg-gray-200'}`}
                >
                    <Search size={12} />
                    Filter
                </button>
                {showSearch && (
                    <div className="flex items-center gap-2 flex-1 animate-in slide-in-from-left-4 duration-300">
                        <input
                            type="text"
                            placeholder="Patient Name..."
                            value={searchFilters.patientName}
                            onChange={(e) => setSearchFilters({ ...searchFilters, patientName: e.target.value })}
                            className="px-2 py-0.5 rounded border border-gray-300 text-[10px] w-24 focus:outline-none focus:ring-1 focus:ring-peregrine-accent bg-white"
                        />
                        <input
                            type="text"
                            placeholder="Patient ID..."
                            value={searchFilters.patientID}
                            onChange={(e) => setSearchFilters({ ...searchFilters, patientID: e.target.value })}
                            className="px-2 py-0.5 rounded border border-gray-300 text-[10px] w-20 focus:outline-none focus:ring-1 focus:ring-peregrine-accent bg-white"
                        />

                        {/* Date Range Inputs */}
                        <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-1 py-0.5">
                            <input
                                type="date"
                                placeholder="Start"
                                value={searchFilters.dateRange.start}
                                onChange={(e) => setSearchFilters({ ...searchFilters, dateRange: { ...searchFilters.dateRange, start: e.target.value } })}
                                className="text-[10px] w-20 focus:outline-none bg-transparent"
                            />
                            <span className="text-gray-400 text-[9px]">-</span>
                            <input
                                type="date"
                                placeholder="End"
                                value={searchFilters.dateRange.end}
                                onChange={(e) => setSearchFilters({ ...searchFilters, dateRange: { ...searchFilters.dateRange, end: e.target.value } })}
                                className="text-[10px] w-20 focus:outline-none bg-transparent"
                            />
                        </div>

                        {/* Modality Selector */}
                        <div className="flex items-center gap-1 overflow-x-auto max-w-[300px] px-1 no-scrollbar">
                            <span className="text-[9px] font-bold text-gray-400 uppercase mr-1">Modalities:</span>
                            {availableModalities.length === 0 ? (
                                <span className="text-[9px] text-gray-300 italic">None</span>
                            ) : (
                                availableModalities.map(mod => {
                                    const isSelected = searchFilters.modalities.includes(mod);
                                    return (
                                        <button
                                            key={mod}
                                            onClick={() => {
                                                const newMods = isSelected
                                                    ? searchFilters.modalities.filter(m => m !== mod)
                                                    : [...searchFilters.modalities, mod];
                                                setSearchFilters({ ...searchFilters, modalities: newMods });
                                            }}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all ${isSelected
                                                ? 'bg-peregrine-accent text-white border-peregrine-accent'
                                                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                                                }`}
                                        >
                                            {mod}
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        <input
                            type="text"
                            placeholder="Description..."
                            value={searchFilters.studyDescription}
                            onChange={(e) => setSearchFilters({ ...searchFilters, studyDescription: e.target.value })}
                            className="px-2 py-0.5 rounded border border-gray-300 text-[10px] w-24 focus:outline-none focus:ring-1 focus:ring-peregrine-accent bg-white"
                        />
                        <input
                            type="text"
                            placeholder="Comments..."
                            value={searchFilters.userComments}
                            onChange={(e) => setSearchFilters({ ...searchFilters, userComments: e.target.value })}
                            className="px-2 py-0.5 rounded border border-gray-300 text-[10px] w-24 focus:outline-none focus:ring-1 focus:ring-peregrine-accent bg-white"
                        />
                        {hasActiveFilters && (
                            <button
                                onClick={() => setSearchFilters({
                                    patientName: '',
                                    patientID: '',
                                    dateRange: { start: '', end: '' },
                                    modalities: [],
                                    studyDescription: '',
                                    userComments: ''
                                })}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )}
                {!showSearch && hasActiveFilters && (
                    <span className="text-[9px] font-bold text-peregrine-accent">Filters active</span>
                )}
            </div>
            {/* Table Header - Peregrine Slate Style */}
            <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.3fr_0.8fr_1.2fr_0.6fr_0.4fr_1.2fr_32px] bg-gradient-to-b from-[#e8e8e8] to-[#d0d0d0] border-b border-[#a0a0a0] px-4 py-1.5 text-[9px] font-black uppercase tracking-tight text-gray-700 shadow-sm z-20">
                <div className="border-r border-gray-300 pr-2 last:border-none flex items-center cursor-pointer hover:bg-black/5" onClick={() => handleSort('patientName')}>Patient Name{getSortIcon('patientName')}</div>
                <div className="border-r border-gray-300 px-2 last:border-none flex items-center">Patient ID</div>
                <div className="border-r border-gray-300 px-2 last:border-none flex items-center">Birth Date</div>
                <div className="border-r border-gray-300 px-2 last:border-none flex items-center">Sex</div>
                <div className="border-r border-gray-300 px-2 last:border-none flex items-center cursor-pointer hover:bg-black/5" onClick={() => handleSort('studyDate')}>Study Date{getSortIcon('studyDate')}</div>
                <div className="border-r border-gray-300 px-2 last:border-none flex items-center cursor-pointer hover:bg-black/5" onClick={() => handleSort('studyDescription')}>Description{getSortIcon('studyDescription')}</div>
                <div className="border-r border-gray-300 px-2 last:border-none flex items-center">Modality</div>
                <div className="border-r border-gray-300 px-2 last:border-none flex items-center text-right"># im</div>
                <div className="border-r border-gray-300 px-2 last:border-none flex items-center cursor-pointer hover:bg-black/5" onClick={() => handleSort('userComments')}>Comments{getSortIcon('userComments')}</div>
                <div className="text-center text-red-500/50 flex justify-center items-center"><Trash2 size={10} /></div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#f8f8fa]">
                {patients.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                        <Database size={32} strokeWidth={1} />
                        <span className="text-xs font-medium uppercase tracking-widest">No Database Records</span>
                    </div>
                ) : (
                    patients.map((patient) => (
                        <React.Fragment key={patient.id}>
                            {/* Patient Row (or Study Row in Study Mode) */}
                            <div
                                onClick={() => togglePatient(patient.id)}
                                className={`grid grid-cols-[1.2fr_0.8fr_0.8fr_0.3fr_0.8fr_1.2fr_0.6fr_0.4fr_1.2fr_32px] px-4 py-1.5 cursor-default transition-all items-center text-[11px] group border-b border-[#f0f0f0] ${(patient._isStudy ? (selectedStudyUid === patient.id) : (selectedPatientId === patient.id)) ? 'bg-[#387aff] text-white' : 'hover:bg-blue-50/50'}`}
                            >
                                <div
                                    className="flex items-center gap-1.5 font-bold truncate cursor-text"
                                    onMouseEnter={() => setHoveredCell({ type: 'patientName', value: patient.patientName || '' })}
                                    onMouseLeave={() => setHoveredCell(null)}
                                >
                                    <div className={`w-4 flex items-center justify-center ${selectedPatientId === patient.id ? 'text-white' : 'text-gray-400'}`}>
                                        {expandedPatients.has(patient.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </div>
                                    {patient._isStudy ? <Calendar size={13} className={selectedPatientId === patient.id ? 'text-white' : 'text-orange-500/80'} /> : <User size={13} className={selectedPatientId === patient.id ? 'text-white' : 'text-peregrine-accent/70'} />}
                                    <span>
                                        {patient.patientName || (patient._isStudy ? '(Unknown Patient)' : '')}
                                    </span>
                                </div>
                                <div className={`font-mono text-[10px] truncate px-2 ${selectedPatientId === patient.id ? 'text-white/80' : 'text-gray-500'}`}>{patient.patientID}</div>
                                <div className={`truncate px-2 ${selectedPatientId === patient.id ? 'text-white/80' : 'text-gray-400'}`}>{patient.patientBirthDate || '-'}</div>
                                <div className={`px-2 ${selectedPatientId === patient.id ? 'text-white/80' : 'text-gray-400'}`}>{patient.patientSex || '-'}</div>

                                <div className={`px-2 truncate ${selectedPatientId === patient.id ? 'text-white/80' : 'text-gray-500'}`}>
                                    {patient._isStudy ? formatDICOMDate(patient.studyDate) : '-'}
                                </div>
                                <div
                                    className={`truncate px-2 ${selectedPatientId === patient.id ? 'text-white/80' : 'italic text-gray-400'} cursor-text`}
                                    onMouseEnter={() => patient._isStudy && patient.studyDescription && setHoveredCell({ type: 'description', value: patient.studyDescription })}
                                    onMouseLeave={() => setHoveredCell(null)}
                                >
                                    {patient._isStudy ? patient.studyDescription : 'Patient Folder'}
                                </div>
                                <div className="flex gap-0.5 px-2">
                                    {patient._isStudy ? (
                                        patient.modalities?.map((m: string) => (
                                            <span key={m} className={`px-1 rounded text-[8px] font-bold ${selectedPatientId === patient.id ? 'bg-white/20 text-white' : 'bg-blue-50 text-peregrine-accent border border-peregrine-accent/10'}`}>{m}</span>
                                        ))
                                    ) : (
                                        patient.modalities?.map((m: string) => (
                                            <span key={m} className={`px-1 rounded text-[8px] font-bold ${selectedPatientId === patient.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500 hover:bg-peregrine-accent/10 transition-colors'}`}>{m}</span>
                                        ))
                                    )}
                                </div>
                                <div className={`text-right font-mono text-[10px] px-2 ${selectedPatientId === patient.id ? 'text-white/90' : 'text-gray-400'}`}>
                                    {patient.totalImageCount || 0}
                                </div>
                                <div className="px-2 flex items-center">
                                    <input
                                        type="text"
                                        defaultValue={patient.userComments || ''}
                                        onBlur={async (e) => {
                                            if (!db) return;
                                            const val = e.target.value;
                                            if (patient._isStudy) {
                                                const doc = await db.T_Study.findOne(patient.id).exec();
                                                if (doc) await doc.patch({ userComments: val });
                                            } else {
                                                // If it's a patient, we don't have userComments in T_Patient yet, 
                                                // but the provider maps the first study's comments. 
                                                // For now, let's just make it editable if it's a study.
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className={`bg-transparent border-none text-[10px] w-full focus:outline-none focus:ring-1 focus:ring-peregrine-accent/30 rounded px-1 ${(patient._isStudy ? (selectedStudyUid === patient.id) : (selectedPatientId === patient.id)) ? 'text-white placeholder:text-white/40' : 'text-gray-500'}`}
                                        placeholder="Add comment..."
                                    />
                                </div>
                                <div className="flex justify-end opacity-40 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (patient._isStudy) {
                                                handleDeleteStudy(e, patient.id, patient.patientName || 'Unknown Study');
                                            } else {
                                                handleDeletePatient(e, patient.id, patient.patientName);
                                            }
                                        }}
                                        className={`p-1 rounded-md transition-colors ${(patient._isStudy ? (selectedStudyUid === patient.id) : (selectedPatientId === patient.id)) ? 'hover:bg-white/20 text-white' : 'hover:bg-red-50 text-red-500'}`}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                    {/* Send Context Button (Visible on hover) */}
                                    {patient._isStudy && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSendMenu({ x: e.clientX, y: e.clientY, type: 'study', uid: patient.id });
                                                setShowSendModal(true);
                                            }}
                                            className={`p-1 rounded-md transition-colors ml-1 ${(patient._isStudy ? (selectedStudyUid === patient.id) : (selectedPatientId === patient.id)) ? 'hover:bg-white/20 text-white' : 'hover:bg-blue-50 text-blue-500'}`}
                                            title="Send to PACS"
                                        >
                                            <div className="rotate-[-45deg]"><Activity size={14} /></div>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Nested Content: Studies or Series (if Study Mode) */}
                            {
                                expandedPatients.has(patient.id) && (
                                    patient._isStudy ? (
                                        // Study Mode: Render Series directly
                                        (studiesMap[patient.id] || []).map((series: any) => (
                                            <div
                                                key={series.seriesInstanceUID}
                                                onClick={(e) => { e.stopPropagation(); onSeriesSelect(series.seriesInstanceUID); }}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    if ((window as any).electron?.openViewer) {
                                                        (window as any).electron.openViewer(series.seriesInstanceUID);
                                                    }
                                                }}
                                                className={`grid grid-cols-[1.2fr_0.8fr_0.8fr_0.3fr_0.8fr_1.2fr_0.6fr_0.4fr_1.2fr_32px] px-4 py-0.5 cursor-default text-[10px] items-center border-l-[3px] group/series transition-all ${selectedSeriesUid === series.seriesInstanceUID ? 'bg-peregrine-accent text-white border-blue-600' : 'hover:bg-gray-100 text-gray-600 border-transparent'}`}
                                            >
                                                <div
                                                    className="flex items-center gap-1.5 pl-8 truncate cursor-text"
                                                    onMouseEnter={() => setHoveredCell({ type: 'seriesDescription', value: series.seriesDescription || '' })}
                                                    onMouseLeave={() => setHoveredCell(null)}
                                                >
                                                    <Activity size={10} className={selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'} />
                                                    <span className="font-medium">
                                                        {series.seriesDescription || `Series ${series.seriesNumber}`}
                                                    </span>
                                                </div>
                                                <div className={`font-mono text-[9px] ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'}`}>S:{series.seriesNumber}</div>
                                                <div className={selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'}>-</div>
                                                <div className={selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'}>-</div>
                                                <div className={selectedSeriesUid === series.seriesInstanceUID ? 'text-white/70' : 'text-gray-400'}>{series.seriesDate || '-'}</div>
                                                <div
                                                    className={`truncate px-2 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/80' : 'text-gray-500'}`}
                                                    onMouseEnter={() => series.seriesDescription && setHoveredCell({ type: 'seriesDescription', value: series.seriesDescription })}
                                                    onMouseLeave={() => setHoveredCell(null)}
                                                >
                                                    {series.seriesDescription}
                                                </div>
                                                <div className="flex">
                                                    <span className={`px-1 rounded text-[8px] font-black ${selectedSeriesUid === series.seriesInstanceUID ? 'bg-white/20 text-white' : 'bg-gray-50 text-gray-400 border border-gray-100 uppercase'}`}>{series.modality}</span>
                                                </div>
                                                <div className={`text-right font-mono font-bold px-2 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-[#ff3b30]'}`}>
                                                    {series.imageCount || 0}
                                                </div>
                                                <div className={selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'}>-</div>
                                                <div className="flex justify-end opacity-40 group-hover/series:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => handleDeleteSeries(e, series.seriesInstanceUID, series.seriesDescription || 'Untitled Series')}
                                                        className={`p-1 rounded-md transition-colors ${selectedSeriesUid === series.seriesInstanceUID ? 'hover:bg-white/20 text-white' : 'hover:bg-red-50 text-red-400 hover:text-red-500'}`}
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        // Normal Patient Mode: Render Studies
                                        (studiesMap[patient.id] || []).map((study: any) => (
                                            <React.Fragment key={study.studyInstanceUID}>
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); toggleStudy(study.studyInstanceUID); }}
                                                    className={`grid grid-cols-[1.2fr_0.8fr_0.8fr_0.3fr_0.8fr_1.2fr_0.6fr_0.4fr_1.2fr_32px] px-4 py-1 cursor-default text-[10.5px] items-center border-l-[3px] group/study ${selectedStudyUid === study.studyInstanceUID ? 'bg-[#d0e0ff] border-peregrine-accent' : 'hover:bg-gray-100/50 border-transparent'}`}
                                                >
                                                    <div className="flex items-center gap-1.5 pl-4 text-gray-800 font-semibold truncate">
                                                        <div className="w-4 flex items-center justify-center text-gray-400">
                                                            {expandedStudies.has(study.studyInstanceUID) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                        </div>
                                                        <Calendar size={12} className="text-[#ff9500]/80" />
                                                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Study</span>
                                                    </div>
                                                    <div className="text-gray-500 font-mono text-[9px] truncate px-2">-</div>
                                                    <div className="text-gray-500 text-[9px] tabular-nums px-2">-</div>
                                                    <div className="text-gray-400 px-2">-</div>
                                                    <div className="text-gray-600 font-medium tabular-nums px-2">{formatDICOMDate(study.studyDate)}</div>
                                                    <div className="text-gray-700 truncate font-bold px-2">{study.studyDescription || 'Untitled Study'}</div>
                                                    <div className="flex gap-1 px-2">
                                                        {study.modalitiesInStudy?.map((m: string) => (
                                                            <span key={m} className="px-1 py-0.5 rounded bg-blue-50 text-peregrine-accent text-[8px] font-black border border-peregrine-accent/10">{m}</span>
                                                        ))}
                                                    </div>
                                                    <div className="text-right text-gray-600 font-mono text-[9px] font-bold px-2">{study.numberOfStudyRelatedInstances || '-'}</div>
                                                    <div className="px-2 flex items-center">
                                                        <input
                                                            type="text"
                                                            defaultValue={study.userComments || ''}
                                                            onBlur={async (e) => {
                                                                if (!db) return;
                                                                const doc = await db.T_Study.findOne(study.studyInstanceUID).exec();
                                                                if (doc) await doc.patch({ userComments: e.target.value });
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="bg-transparent border-none text-[10px] w-full focus:outline-none focus:ring-1 focus:ring-peregrine-accent/30 rounded px-1 text-gray-500"
                                                            placeholder="Add comment..."
                                                        />
                                                    </div>
                                                    <div className="flex justify-end opacity-40 group-hover/study:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => handleDeleteStudy(e, study.studyInstanceUID, study.studyDescription || 'Untitled Study')}
                                                            className="p-1 rounded-md transition-colors hover:bg-red-50 text-red-500/70 hover:text-red-500"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Nested Series */}
                                                {expandedStudies.has(study.studyInstanceUID) && (seriesMap[study.studyInstanceUID] || []).map((series: any) => (
                                                    <div
                                                        key={series.seriesInstanceUID}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // SYNC CONTEXT: Ensure Patient and Study are also selected when Series is clicked
                                                            // This fixes the issue where jumping between patients' series didn't update the Series Browser
                                                            onPatientSelect(patient.id);
                                                            onStudySelect(study.studyInstanceUID);
                                                            onSeriesSelect(series.seriesInstanceUID);
                                                        }}
                                                        onDoubleClick={(e) => {
                                                            e.stopPropagation();
                                                            // Double click also needs to sync context if single click didn't happen fast enough
                                                            onPatientSelect(patient.id);
                                                            onStudySelect(study.studyInstanceUID);
                                                            onSeriesSelect(series.seriesInstanceUID);
                                                            if ((window as any).electron?.openViewer) {
                                                                (window as any).electron.openViewer(series.seriesInstanceUID);
                                                            }
                                                        }}
                                                        className={`grid grid-cols-[1.2fr_0.8fr_0.8fr_0.3fr_0.8fr_1.2fr_0.6fr_0.4fr_1.2fr_32px] px-4 py-0.5 cursor-default text-[10px] items-center border-l-[3px] group/series transition-all ${selectedSeriesUid === series.seriesInstanceUID ? 'bg-peregrine-accent text-white border-blue-600' : 'hover:bg-gray-100 text-gray-600 border-transparent'}`}
                                                    >
                                                        <div className="flex items-center gap-1.5 pl-12 truncate">
                                                            <Activity size={10} className={selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'} />
                                                            <span className="font-medium">{series.seriesDescription || `Series ${series.seriesNumber}`}</span>
                                                        </div>
                                                        <div className={`font-mono text-[9px] ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'} px-2`}>S:{series.seriesNumber}</div>
                                                        <div className={`px-2 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'}`}>-</div>
                                                        <div className={`px-2 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'}`}>-</div>
                                                        <div className={`px-2 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/70' : 'text-gray-400'}`}>{series.seriesDate || '-'}</div>
                                                        <div className={`truncate px-2 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/80' : 'text-gray-500'}`}>{series.seriesDescription}</div>
                                                        <div className="flex px-2">
                                                            <span className={`px-1 rounded text-[8px] font-black ${selectedSeriesUid === series.seriesInstanceUID ? 'bg-white/20 text-white' : 'bg-gray-50 text-gray-400 border border-gray-100 uppercase'}`}>{series.modality}</span>
                                                        </div>
                                                        <div className={`text-right font-mono font-bold px-2 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-[#ff3b30]'}`}>
                                                            {series.imageCount || 0}
                                                        </div>
                                                        <div className={`px-2 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/60' : 'text-gray-400'}`}>-</div>
                                                        <div className="flex justify-end opacity-40 group-hover/series:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={(e) => handleDeleteSeries(e, series.seriesInstanceUID, series.seriesDescription || 'Untitled Series')}
                                                                className={`p-1 rounded-md transition-colors ${selectedSeriesUid === series.seriesInstanceUID ? 'hover:bg-white/20 text-white' : 'hover:bg-red-50 text-red-400 hover:text-red-500'}`}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </React.Fragment>
                                        ))
                                    )
                                )
                            }
                        </React.Fragment>
                    ))
                )}
            </div>

            {/* Copy Feedback Notification */}
            {
                showCopyFeedback && (
                    <div className="fixed top-20 right-4 bg-peregrine-accent text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 z-50">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs font-bold">Copied to clipboard!</span>
                    </div>
                )
            }
            {/* Send to PACS Modal */}
            {
                showSendModal && sendMenu && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]" onClick={() => setShowSendModal(false)}>
                        <div className="bg-white border border-gray-200 rounded-lg w-[280px] p-3 shadow-xl" onClick={e => e.stopPropagation()}>
                            <h3 className="text-gray-800 font-bold text-xs mb-2 uppercase tracking-wide">Send {sendMenu.type} to PACS</h3>
                            <div className="space-y-1 mb-3">
                                {servers.map(server => (
                                    <button
                                        key={server.id}
                                        onClick={async () => {
                                            if (db) {
                                                let files: any[] = [];
                                                if (sendMenu.type === 'study') {
                                                    // Find all series for study, then all files
                                                    const series = await db.T_Subseries.find({ selector: { studyInstanceUID: sendMenu.uid } }).exec();
                                                    for (const s of series) {
                                                        const fs = await db.T_FilePath.find({ selector: { seriesInstanceUID: s.seriesInstanceUID } }).exec();
                                                        files.push(...fs);
                                                    }
                                                } else {
                                                    files = await db.T_FilePath.find({ selector: { seriesInstanceUID: sendMenu.uid } }).exec();
                                                }

                                                const filePaths = files.map(f => f.filePath);
                                                sendToPacs(server, filePaths);
                                                setShowSendModal(false);
                                            }
                                        }}
                                        className="w-full text-left px-3 py-2 text-[11px] text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors flex justify-between items-center group font-medium"
                                    >
                                        <span>{server.aeTitle}</span>
                                        <span className="text-[9px] text-gray-400 group-hover:text-blue-400/70">{server.address}:{server.port}</span>
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setShowSendModal(false)}
                                className="w-full py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 text-[10px] font-bold rounded transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
