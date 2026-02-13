import { useState } from 'react';
import { Search, RotateCcw, Loader2 } from 'lucide-react';
import { usePACS } from './PACSProvider';

export const PACSQueryForm = () => {
    const { search, isSearching, error } = usePACS();
    const [patientName, setPatientName] = useState('');
    const [patientId, setPatientId] = useState('');
    const [modality, setModality] = useState('ALL');

    const handleSearch = () => {
        search({ patientName, patientId, modality });
    };

    const handleReset = () => {
        setPatientName('');
        setPatientId('');
        setModality('ALL');
    };

    return (
        <div className="p-8 bg-white border-b border-gray-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">
                <div className="grid grid-cols-4 gap-x-8 gap-y-6">
                    {/* Patient Info Group */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest pl-1">Patient Identity</label>
                        <input
                            type="text"
                            value={patientName}
                            onChange={(e) => setPatientName(e.target.value)}
                            placeholder="Full Name (e.g. DOE^JOHN)"
                            className="w-full px-4 py-2.5 text-sm bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-horos-accent/30 outline-none transition-all placeholder:text-gray-300"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest pl-1">Identifier</label>
                        <input
                            type="text"
                            value={patientId}
                            onChange={(e) => setPatientId(e.target.value)}
                            placeholder="Patient ID / Accession"
                            className="w-full px-4 py-2.5 text-sm bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-horos-accent/30 outline-none transition-all placeholder:text-gray-300"
                        />
                    </div>

                    {/* Modality & Date Group */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest pl-1">Modality</label>
                        <select
                            value={modality}
                            onChange={(e) => setModality(e.target.value)}
                            className="w-full px-4 py-2.5 text-sm bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-horos-accent/30 outline-none transition-all appearance-none cursor-pointer text-gray-600"
                        >
                            <option value="ALL">All Modalities</option>
                            <option value="CT">CT</option>
                            <option value="MR">MR</option>
                            <option value="US">US</option>
                            <option value="CR">CR/DX</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest pl-1">Date Range</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button className="px-3 py-2 text-[10px] font-bold bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition-all uppercase tracking-tighter">Today</button>
                            <button className="px-3 py-2 text-[10px] font-bold bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition-all uppercase tracking-tighter">Specific...</button>
                        </div>
                    </div>
                </div>

                {/* Main Search Action - LiftKit Optical Balance */}
                <div className="flex justify-between items-center bg-blue-50/30 p-4 rounded-2xl border border-blue-50/50">
                    <div className="flex gap-4">
                        <button
                            onClick={handleSearch}
                            disabled={isSearching}
                            className={`flex items-center gap-2 px-6 py-3 bg-horos-accent text-white rounded-xl font-bold text-sm shadow-[0_4px_16px_rgba(37,99,235,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isSearching ? (
                                <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
                            ) : (
                                <Search size={18} strokeWidth={2.5} />
                            )}
                            {isSearching ? 'Searching...' : 'Search Study'}
                        </button>
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 px-6 py-3 bg-white text-gray-500 rounded-xl font-bold text-sm border border-gray-100 hover:bg-gray-50 active:scale-[0.98] transition-all"
                        >
                            <RotateCcw size={16} strokeWidth={2} />
                            Reset Fields
                        </button>
                    </div>

                    <div className="hidden lg:flex items-center gap-6">
                        {error && (
                            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 animate-pulse">
                                {error}
                            </span>
                        )}
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em]">Active Port</span>
                            <span className="text-[12px] font-bold text-horos-accent">DICOMweb</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
