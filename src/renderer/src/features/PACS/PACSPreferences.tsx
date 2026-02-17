import React, { useState } from 'react';
import { usePACS } from './PACSProvider';
import { PACSServer } from './pacsClient';
import { Server, Play, Square, Plus, Trash2, Edit2, Globe, Activity, FileText, ChevronRight, X, Check, AlertCircle } from 'lucide-react';

export const PACSPreferences: React.FC = () => {
    const {
        servers, setServers,
        localListener, setLocalListener, toggleListener,
        error,
        debugLoggingEnabled, setDebugLogging,
        openLogFile,
        associationTimeout, setAssociationTimeout
    } = usePACS();
    const [isEditingServer, setIsEditingServer] = useState<string | null>(null);
    const [editServerData, setEditServerData] = useState<Partial<PACSServer>>({});
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleSaveServer = () => {
        if (!editServerData.name || !editServerData.aeTitle) return;

        // AE Title Validation (DICOM Standard: max 16 chars, truncated if needed)
        const sanitizedAet = editServerData.aeTitle.trim().toUpperCase().substring(0, 16);

        if (isEditingServer === 'new') {
            const newServer: PACSServer = {
                id: crypto.randomUUID(),
                name: editServerData.name,
                aeTitle: sanitizedAet,
                address: editServerData.address || '127.0.0.1',
                port: editServerData.port || 104,
                isDicomWeb: editServerData.isDicomWeb || false,
                url: editServerData.url
            };
            setServers([...servers, newServer]);
        } else {
            setServers(servers.map(s => s.id === isEditingServer ? { ...s, ...editServerData, aeTitle: sanitizedAet } as PACSServer : s));
        }
        setIsEditingServer(null);
        setEditServerData({});
    };

    const handleDeleteServer = (id: string) => {
        if (confirm('Are you sure you want to delete this node?')) {
            setServers(servers.filter(s => s.id !== id));
        }
    };

    return (
        <div className="flex flex-col animate-in fade-in slide-in-from-right-4 duration-500 pb-12">
            {/* Header Info */}
            <div className="px-6 py-4 space-y-1 bg-white border-b border-gray-100 shrink-0 sticky top-0 z-20">
                <h3 className="text-xl font-black text-gray-900 tracking-tight">PACS / Network</h3>
                <p className="text-xs text-gray-500 font-medium">Manage DICOM communication and connecting medical nodes.</p>
            </div>

            <div className="p-6 space-y-8">
                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-3 animate-in shake duration-500">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                {/* 1. Local Node Status Card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] p-6 space-y-4 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] transition-all duration-300">
                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                        <div className="flex items-center gap-4 shrink-0">
                            <div className={`relative flex items-center justify-center w-12 h-12 rounded-2xl transition-colors duration-500 ${localListener.isRunning ? 'bg-green-50 text-green-500' : 'bg-gray-50 text-gray-300'}`}>
                                <Activity size={24} className={localListener.isRunning ? 'animate-pulse' : ''} />
                                {localListener.isRunning && (
                                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                    </span>
                                )}
                            </div>
                            <div className="min-w-[140px]">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Local Listener</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-black text-gray-800 tracking-tight truncate max-w-[120px]">{localListener.aeTitle}</span>
                                    <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">:{localListener.port}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                            {!localListener.isRunning && (
                                <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-100 group/input focus-within:border-peregrine-accent focus-within:bg-white transition-all flex-1 max-w-sm">
                                    <div className="flex flex-col flex-1 px-2 border-r border-gray-200">
                                        <span className="text-[8px] font-black text-gray-400 uppercase">AE Title</span>
                                        <input
                                            className="w-full py-0.5 text-xs font-mono bg-transparent outline-none uppercase placeholder-gray-300 focus:text-peregrine-accent"
                                            value={localListener.aeTitle}
                                            onChange={e => setLocalListener({ ...localListener, aeTitle: e.target.value.toUpperCase() })}
                                            placeholder="AET"
                                        />
                                    </div>
                                    <div className="flex flex-col px-2">
                                        <span className="text-[8px] font-black text-gray-400 uppercase">Port</span>
                                        <input
                                            className="w-16 py-0.5 text-xs font-mono bg-transparent outline-none focus:text-peregrine-accent"
                                            type="number"
                                            value={localListener.port}
                                            onChange={e => setLocalListener({ ...localListener, port: parseInt(e.target.value) || 104 })}
                                            placeholder="Port"
                                        />
                                    </div>
                                </div>
                            )}
                            <button
                                onClick={toggleListener}
                                className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-4 transition-all shadow-lg active:scale-[0.98] whitespace-nowrap ${localListener.isRunning
                                    ? 'bg-white border-2 border-red-100 text-red-500 hover:bg-red-50 shadow-red-500/5'
                                    : 'bg-green-500 text-white hover:bg-green-600 shadow-green-500/20'
                                    }`}
                            >
                                {localListener.isRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                                {localListener.isRunning ? 'Stop Listener' : 'Start Listener'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Remote Nodes List Card */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Network Nodes</h3>
                            <span className="bg-blue-50 text-peregrine-accent text-[10px] font-bold px-2 py-0.5 rounded-full">{servers.length}</span>
                        </div>
                        <button
                            onClick={() => {
                                setIsEditingServer('new');
                                setEditServerData({ isDicomWeb: false, port: 104 });
                            }}
                            className="bg-peregrine-accent hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                        >
                            <Plus size={14} />
                            Add Cluster Node
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Description</th>
                                    <th className="px-6 py-4">AET</th>
                                    <th className="px-6 py-4">Addressing</th>
                                    <th className="px-6 py-4 w-32">Status</th>
                                    <th className="px-6 py-4 w-24 text-right pr-8">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {servers.map(server => (
                                    <tr key={server.id} className="group hover:bg-blue-50/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl ${server.isDicomWeb ? 'bg-purple-50 text-purple-500' : 'bg-blue-50 text-blue-500'}`}>
                                                    {server.isDicomWeb ? <Globe size={14} /> : <Server size={14} />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-gray-800">{server.name}</span>
                                                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">{server.isDicomWeb ? 'DICOM-WEB' : 'DIMSE'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded">{server.aeTitle}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[10px] font-mono text-gray-400 truncate max-w-[180px] block">
                                                {server.isDicomWeb ? server.url : `${server.address}:${server.port}`}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${server.status === 'online' ? 'bg-green-50 text-green-600' : server.status === 'offline' ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${server.status === 'online' ? 'bg-green-500 animate-pulse' : server.status === 'offline' ? 'bg-red-400' : 'bg-gray-300'}`} />
                                                <span className="text-[9px] font-black uppercase tracking-tight">
                                                    {server.status || 'Checking'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right pr-8">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => { setIsEditingServer(server.id); setEditServerData(server); }}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteServer(server.id)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {servers.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-30">
                                                <Globe size={48} className="text-gray-400" />
                                                <p className="text-xs font-bold text-gray-500 italic">No network nodes found.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 3. Advanced Configuration Cards */}
                <div className="space-y-4">
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:text-gray-800 transition-colors w-full px-2"
                    >
                        <ChevronRight size={14} className={`transition-transform duration-300 ${showAdvanced ? 'rotate-90' : ''}`} />
                        Advanced Ops & Telemetry
                    </button>

                    {showAdvanced && (
                        <div className="grid grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-500">
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500">
                                        <Activity size={16} />
                                    </div>
                                    <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Timeouts</h4>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Handshake Delay</label>
                                        <span className="text-xs font-mono font-black text-peregrine-accent">{associationTimeout}s</span>
                                    </div>
                                    <input
                                        type="range" min="5" max="120" step="5"
                                        value={associationTimeout}
                                        onChange={(e) => setAssociationTimeout(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-peregrine-accent"
                                    />
                                    <p className="text-[9px] text-gray-400 leading-relaxed font-medium">Controls the DICOM association timeout limit in seconds.</p>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500">
                                        <FileText size={16} />
                                    </div>
                                    <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Diagnostics</h4>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Verbose Engine Logs</span>
                                        <button
                                            onClick={() => setDebugLogging(!debugLoggingEnabled)}
                                            className={`w-9 h-5 rounded-full relative transition-colors duration-300 ${debugLoggingEnabled ? 'bg-peregrine-accent shadow-inner' : 'bg-gray-100'}`}
                                        >
                                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-md transition-all duration-300 ${debugLoggingEnabled ? 'left-5' : 'left-1'}`} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={openLogFile}
                                        className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-widest border border-gray-100 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                                    >
                                        Inspect Log Stream
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal for Editing */}
            {isEditingServer && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                            <h3 className="text-sm font-black text-gray-900 tracking-tight">
                                {isEditingServer === 'new' ? 'New Connection' : 'Edit Connection'}
                            </h3>
                            <button onClick={() => setIsEditingServer(null)} className="text-gray-400 hover:text-gray-900 transition-colors">
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Node Identity</label>
                                <input
                                    autoFocus
                                    className="w-full px-4 py-3 border border-gray-100 rounded-xl text-sm bg-gray-50/50 focus:bg-white focus:border-peregrine-accent focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder-gray-300"
                                    value={editServerData.name || ''}
                                    onChange={e => setEditServerData({ ...editServerData, name: e.target.value })}
                                    placeholder="e.g. Regional PACS Archive"
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Protocol Type</label>
                                    <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                                        <button
                                            onClick={() => setEditServerData({ ...editServerData, isDicomWeb: false })}
                                            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${!editServerData.isDicomWeb ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            DIMSE Node
                                        </button>
                                        <button
                                            onClick={() => setEditServerData({ ...editServerData, isDicomWeb: true })}
                                            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${editServerData.isDicomWeb ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            DICOMweb
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">AE Title</label>
                                        <input
                                            className="w-full px-4 py-3 border border-gray-100 rounded-xl text-sm font-mono font-bold uppercase focus:border-peregrine-accent focus:ring-4 focus:ring-blue-500/10 outline-none bg-gray-50/50 focus:bg-white transition-all"
                                            value={editServerData.aeTitle || ''}
                                            onChange={e => setEditServerData({ ...editServerData, aeTitle: e.target.value.toUpperCase() })}
                                            placeholder="REMOTE_AET"
                                        />
                                    </div>

                                    {!editServerData.isDicomWeb ? (
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Port</label>
                                            <input
                                                type="number"
                                                className="w-full px-4 py-3 border border-gray-100 rounded-xl text-sm font-mono font-bold focus:border-peregrine-accent focus:ring-4 focus:ring-blue-500/10 outline-none bg-gray-50/50 focus:bg-white transition-all"
                                                value={editServerData.port || ''}
                                                onChange={e => setEditServerData({ ...editServerData, port: parseInt(e.target.value) })}
                                                placeholder="104"
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                {!editServerData.isDicomWeb ? (
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Host Address</label>
                                        <input
                                            className="w-full px-4 py-3 border border-gray-100 rounded-xl text-sm font-mono focus:border-peregrine-accent focus:ring-4 focus:ring-blue-500/10 outline-none bg-gray-50/50 focus:bg-white transition-all"
                                            value={editServerData.address || ''}
                                            onChange={e => setEditServerData({ ...editServerData, address: e.target.value })}
                                            placeholder="192.168.1.XXX"
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-2 shrink-0">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Base URL (WADO-RS)</label>
                                        <input
                                            className="w-full px-4 py-3 border border-gray-100 rounded-xl text-sm font-mono focus:border-peregrine-accent focus:ring-4 focus:ring-blue-500/10 outline-none bg-gray-50/50 focus:bg-white transition-all"
                                            value={editServerData.url || ''}
                                            onChange={e => setEditServerData({ ...editServerData, url: e.target.value })}
                                            placeholder="https://pacs.hospital.org/dicomweb"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50/50 flex justify-end gap-3 border-t border-gray-100">
                            <button
                                onClick={() => setIsEditingServer(null)}
                                className="px-6 py-2.5 text-xs font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest"
                            >
                                Dismiss
                            </button>
                            <button
                                onClick={handleSaveServer}
                                disabled={!editServerData.name || !editServerData.aeTitle}
                                className="px-8 py-2.5 bg-peregrine-accent text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-600 disabled:opacity-30 disabled:scale-100 transition-all active:scale-[0.98] flex items-center gap-2"
                            >
                                <Check size={14} strokeWidth={3} />
                                Establish Node
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
