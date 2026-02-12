import { useEffect, useState, useMemo } from 'react';
import { useDatabase } from './DatabaseProvider';
import { Search, ChevronDown, ChevronUp, Plus, Upload } from 'lucide-react';

interface Patient {
    id: string;
    patientName: string;
    patientID: string;
    patientBirthDate: string;
    patientSex: string;
}

type SortKey = keyof Patient;
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

export const PatientBrowser = ({ onSelect }: { onSelect: (patientId: string) => void }) => {
    const db = useDatabase();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [filterText, setFilterText] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'patientName', direction: 'asc' });
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (!db) return;

        const sub = db.patients.find().$.subscribe((pts) => {
            setPatients(pts.map(p => p.toJSON()));
        });

        return () => sub.unsubscribe();
    }, [db]);

    const addDummyPatient = async () => {
        if (!db) return;
        try {
            const id = new Date().toISOString();
            await db.patients.insert({
                id,
                patientName: `Test Patient ${Math.floor(Math.random() * 100)}`,
                patientID: `PID-${Math.floor(Math.random() * 1000)}`,
                patientBirthDate: '19800101',
                patientSex: Math.random() > 0.5 ? 'M' : 'F'
            });
        } catch (err) {
            console.error(err);
        }
    };

    const handleImport = async () => {
        if (!db) return;
        try {
            // @ts-ignore
            const filePaths = await window.electron.openFile();
            if (filePaths && filePaths.length > 0) {
                const { importFiles } = await import('./importService');
                await importFiles(db, filePaths);
            }
        } catch (error) {
            console.error('Import failed:', error);
        }
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedAndFilteredPatients = useMemo(() => {
        let items = [...patients];

        if (filterText) {
            const lowerFilter = filterText.toLowerCase();
            items = items.filter(p =>
                p.patientName?.toLowerCase().includes(lowerFilter) ||
                p.patientID?.toLowerCase().includes(lowerFilter)
            );
        }

        items.sort((a, b) => {
            const aValue = a[sortConfig.key] || '';
            const bValue = b[sortConfig.key] || '';

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [patients, filterText, sortConfig]);

    const renderSortIcon = (key: SortKey) => {
        if (sortConfig.key !== key) return <div className="w-4" />;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    return (
        <div className="flex flex-col h-full bg-white text-horos-text select-none">
            {/* Header / Actions */}
            <div className="p-2 border-b border-horos-border flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Database</span>
                    <div className="flex gap-1">
                        <button
                            onClick={handleImport}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Import DICOM"
                        >
                            <Upload size={16} />
                        </button>
                        <button
                            onClick={addDummyPatient}
                            className="p-1.5 text-horos-accent hover:bg-blue-50 rounded transition-colors"
                            title="Add Test Patient"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                        type="text"
                        placeholder="Search Name or ID..."
                        className="w-full pl-8 pr-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-horos-accent focus:ring-1 focus:ring-horos-accent"
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                </div>
            </div>

            {/* Table Header */}
            <div className="flex w-full bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase sticky top-0">
                <div
                    className="flex-1 p-2 cursor-pointer hover:bg-gray-100 flex items-center gap-1"
                    onClick={() => handleSort('patientName')}
                >
                    Name {renderSortIcon('patientName')}
                </div>
                <div
                    className="w-24 p-2 cursor-pointer hover:bg-gray-100 flex items-center gap-1"
                    onClick={() => handleSort('patientID')}
                >
                    ID {renderSortIcon('patientID')}
                </div>
                <div
                    className="w-20 p-2 cursor-pointer hover:bg-gray-100 flex items-center gap-1"
                    onClick={() => handleSort('patientBirthDate')}
                >
                    Date {renderSortIcon('patientBirthDate')}
                </div>
                <div
                    className="w-12 p-2 cursor-pointer hover:bg-gray-100 flex items-center gap-1"
                    onClick={() => handleSort('patientSex')}
                >
                    Sex {renderSortIcon('patientSex')}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {sortedAndFilteredPatients.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                        No patients found.
                    </div>
                ) : (
                    <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-100">
                            {sortedAndFilteredPatients.map(p => (
                                <tr
                                    key={p.id}
                                    className={`
                                        cursor-pointer transition-colors
                                        ${selectedId === p.id ? 'bg-horos-selected text-horos-accent' : 'hover:bg-gray-50 text-gray-700'}
                                    `}
                                    onClick={() => {
                                        setSelectedId(p.id);
                                        onSelect(p.id);
                                    }}
                                >
                                    <td className="p-2 font-medium truncate max-w-[120px]" title={p.patientName}>
                                        {p.patientName}
                                    </td>
                                    <td className="p-2 w-24 truncate" title={p.patientID}>
                                        {p.patientID}
                                    </td>
                                    <td className="p-2 w-20 text-center truncate" title={p.patientBirthDate}>
                                        {p.patientBirthDate ? p.patientBirthDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : ''}
                                    </td>
                                    <td className="p-2 w-12 text-center">
                                        {p.patientSex}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer status */}
            <div className="p-1 border-t border-horos-border text-[10px] text-gray-400 text-center bg-gray-50">
                {patients.length} Patient{patients.length !== 1 && 's'}
            </div>
        </div>
    );
};
