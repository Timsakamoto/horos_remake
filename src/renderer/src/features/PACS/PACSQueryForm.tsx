import { useState } from 'react';
import { Search, RotateCcw, Loader2, Server, User, FileDigit, CalendarDays, Filter } from 'lucide-react';

import { usePACS } from './PACSProvider';

const MODALITIES = ['CT', 'MR', 'US', 'CR', 'DX', 'XA', 'NM', 'MG', 'RF', 'SC', 'OT'];

export const PACSQueryForm = () => {
    const { activeServer, isSearching, search, error } = usePACS();
    const [patientName, setPatientName] = useState('');
    const [patientId, setPatientId] = useState('');
    const [accessionNumber, setAccessionNumber] = useState('');
    const [selectedModalities, setSelectedModalities] = useState<string[]>([]);

    // Date Range
    const [dateRangeType, setDateRangeType] = useState<'any' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'>('any');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const toggleModality = (mod: string) => {
        if (selectedModalities.includes(mod)) {
            setSelectedModalities(selectedModalities.filter(m => m !== mod));
        } else {
            setSelectedModalities([...selectedModalities, mod]);
        }
    };

    const handleSearch = () => {
        const filters: any = {
            patientName: patientName.trim() || undefined,
            patientId: patientId.trim() || undefined,
            accessionNumber: accessionNumber.trim() || undefined,
            modality: selectedModalities.length > 0 ? selectedModalities.join('\\') : undefined
        };

        // Date Logic
        const today = new Date();
        const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD for DICOM

        if (dateRangeType === 'today') {
            filters.studyDate = formatDate(today);
        } else if (dateRangeType === 'yesterday') {
            const y = new Date(today);
            y.setDate(y.getDate() - 1);
            filters.studyDate = formatDate(y);
        } else if (dateRangeType === 'week') {
            const w = new Date(today);
            w.setDate(w.getDate() - 7);
            filters.studyDate = `${formatDate(w)}-${formatDate(today)}`;
        } else if (dateRangeType === 'month') {
            const m = new Date(today);
            m.setMonth(m.getMonth() - 1);
            filters.studyDate = `${formatDate(m)}-${formatDate(today)}`;
        } else if (dateRangeType === 'custom') {
            if (startDate && endDate) {
                filters.studyDate = `${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}`;
            } else if (startDate) {
                filters.studyDate = `${startDate.replace(/-/g, '')}-`;
            } else if (endDate) {
                filters.studyDate = `-${endDate.replace(/-/g, '')}`;
            }
        }

        search(filters);
    };

    const handleReset = () => {
        setPatientName('');
        setPatientId('');
        setAccessionNumber('');
        setSelectedModalities([]);
        setDateRangeType('any');
        setStartDate('');
        setEndDate('');
    };

    return (
        <div className="flex flex-col bg-white border-b border-gray-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-700">
            {/* Header / Actions */}
            <div className="px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center z-10">
                <div className="flex items-center gap-2 text-gray-800">
                    <Filter size={16} className="text-peregrine-accent" />
                    <span className="font-bold text-sm">Query Filters</span>
                    {activeServer && (
                        <div className="ml-4 flex items-center gap-2 px-3 py-1 bg-blue-50 text-peregrine-accent rounded-full text-[10px] font-bold border border-blue-100 uppercase tracking-wider">
                            <Server size={10} />
                            {activeServer.name}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {error && (
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-full flex items-center gap-2 mr-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            {error}
                        </span>
                    )}
                    <button
                        onClick={handleReset}
                        className="bg-white hover:bg-gray-50 text-gray-500 border border-gray-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-transform active:scale-95"
                    >
                        <RotateCcw size={12} />
                        Reset
                    </button>
                    <button
                        onClick={handleSearch}
                        disabled={isSearching || !activeServer}
                        className="bg-peregrine-accent hover:bg-blue-600 text-white px-6 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all hover:shadow-lg disabled:opacity-50 disabled:shadow-none hover:-translate-y-0.5"
                    >
                        {isSearching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                        {isSearching ? 'Querying...' : 'Perform Query'}
                    </button>
                </div>
            </div>

            {/* Filters Grid */}
            <div className="p-6 overflow-y-auto">
                <div className="max-w-[1200px] space-y-6 mx-auto">

                    {/* Row 1: Patient & Accession */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User size={14} className="text-gray-400 group-focus-within:text-peregrine-accent transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={patientName}
                                onChange={(e) => setPatientName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-peregrine-accent/10 focus:bg-white focus:border-peregrine-accent outline-none transition-all uppercase placeholder-gray-300"
                                placeholder="Patient Name"
                            />
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-gray-400 opacity-0 group-focus-within:opacity-100 transition-all border border-gray-100 rounded">NAME</span>
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <FileDigit size={14} className="text-gray-400 group-focus-within:text-peregrine-accent transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={patientId}
                                onChange={(e) => setPatientId(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-peregrine-accent/10 focus:bg-white focus:border-peregrine-accent outline-none transition-all placeholder-gray-300"
                                placeholder="Patient ID"
                            />
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-gray-400 opacity-0 group-focus-within:opacity-100 transition-all border border-gray-100 rounded">MRN</span>
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <FileDigit size={14} className="text-gray-400 group-focus-within:text-peregrine-accent transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={accessionNumber}
                                onChange={(e) => setAccessionNumber(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="w-full pl-9 pr-3 py-2.5 bg-gray-50/50 border border-gray-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-peregrine-accent/10 focus:bg-white focus:border-peregrine-accent outline-none transition-all placeholder-gray-300"
                                placeholder="Accession #"
                            />
                            <span className="absolute -top-2 left-2 px-1 bg-white text-[9px] font-bold text-gray-400 opacity-0 group-focus-within:opacity-100 transition-all border border-gray-100 rounded">ACC</span>
                        </div>
                    </div>

                    <div className="h-px bg-gray-100 w-full" />

                    {/* Row 2: Date & Modality */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                        {/* Date Picker */}
                        <div className="md:col-span-5 space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <CalendarDays size={12} />
                                Study Date
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {['any', 'today', 'yesterday', 'week', 'month', 'custom'].map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => setDateRangeType(type as any)}
                                        className={`px-2 py-2 text-[10px] font-bold rounded-lg uppercase tracking-tight transition-all border ${dateRangeType === type
                                            ? 'bg-peregrine-accent text-white border-peregrine-accent shadow-sm'
                                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        {type === 'any' ? 'Any' : type}
                                    </button>
                                ))}
                            </div>
                            {dateRangeType === 'custom' && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-peregrine-accent bg-gray-50"
                                    />
                                    <span className="text-gray-300">-</span>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-peregrine-accent bg-gray-50"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Modalities */}
                        <div className="md:col-span-7 space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Modalities</label>
                                {selectedModalities.length > 0 && (
                                    <button onClick={() => setSelectedModalities([])} className="text-[9px] font-bold text-red-500 hover:underline">Clear Selection</button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {MODALITIES.map(mod => (
                                    <button
                                        key={mod}
                                        onClick={() => toggleModality(mod)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${selectedModalities.includes(mod)
                                            ? 'bg-blue-50 text-peregrine-accent border-blue-200 shadow-sm'
                                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                                            }`}
                                    >
                                        {mod}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
