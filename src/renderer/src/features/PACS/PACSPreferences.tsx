import React, { useState } from 'react';
import { usePACS } from './PACSProvider';
import { PACSServer } from './pacsClient';
import { Server, Play, Square, Plus, Trash2, Edit2, ShieldCheck, Globe, Activity, FileText, ChevronDown, ChevronRight, X, Check } from 'lucide-react';

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
        <div className="flex flex-col h-[500px] bg-gray-50/50">
            {/* 1. Local Node Status Bar (Always Visible) */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${localListener.isRunning ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-gray-300'}`} />
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Local Listener</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-gray-800">{localListener.aeTitle}</span>
                            <span className="text-sm text-gray-400 font-mono">:{localListener.port}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!localListener.isRunning && (
                        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                            <input
                                className="w-24 px-2 py-1 text-xs font-mono bg-transparent outline-none border-r border-gray-300 uppercase placeholder-gray-400"
                                value={localListener.aeTitle}
                                onChange={e => setLocalListener({ ...localListener, aeTitle: e.target.value.toUpperCase() })}
                                placeholder="AET"
                            />
                            <input
                                className="w-16 px-2 py-1 text-xs font-mono bg-transparent outline-none"
                                type="number"
                                value={localListener.port}
                                onChange={e => setLocalListener({ ...localListener, port: parseInt(e.target.value) || 104 })}
                                placeholder="Port"
                            />
                        </div>
                    )}
                    <button
                        onClick={toggleListener}
                        className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${localListener.isRunning
                            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
                            }`}
                    >
                        {localListener.isRunning ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        {localListener.isRunning ? 'Stop' : 'Start'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {error && (
                    <div className="p-3 bg-red-100 text-red-700 rounded-lg text-xs font-bold flex items-center gap-2">
                        <ShieldCheck size={14} />
                        {error}
                    </div>
                )}

                {/* 2. Remote Nodes List */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Globe size={16} className="text-blue-500" />
                            Remote Nodes
                        </h3>
                        <button
                            onClick={() => {
                                setIsEditingServer('new');
                                setEditServerData({ isDicomWeb: false, port: 104 });
                            }}
                            className="bg-peregrine-accent hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                        >
                            <Plus size={14} />
                            Add Node
                        </button>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-semibold">
                                <tr>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3">AET</th>
                                    <th className="px-4 py-3">Host / URL</th>
                                    <th className="px-4 py-3 w-24">Status</th>
                                    <th className="px-4 py-3 w-20 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {servers.map(server => (
                                    <tr key={server.id} className="group hover:bg-blue-50/30 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-800 flex items-center gap-2">
                                            {server.isDicomWeb ? <Globe size={14} className="text-purple-400" /> : <Server size={14} className="text-blue-400" />}
                                            {server.name}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-gray-600">{server.aeTitle}</td>
                                        <td className="px-4 py-3 text-gray-500 font-mono text-[10px] truncate max-w-[150px]">
                                            {server.isDicomWeb ? server.url : `${server.address}:${server.port}`}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${server.status === 'online' ? 'bg-green-500' : server.status === 'offline' ? 'bg-red-400' : 'bg-gray-300'}`} />
                                                <span className={`text-[10px] font-bold uppercase ${server.status === 'online' ? 'text-green-600' : server.status === 'offline' ? 'text-red-500' : 'text-gray-400'}`}>
                                                    {server.status || 'Checking'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => { setIsEditingServer(server.id); setEditServerData(server); }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteServer(server.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {servers.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-400 text-xs italic bg-gray-50/50">
                                            No PACS nodes configured. Add one to start.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 3. Advanced Settings (Collapsible) */}
                <div className="border-t border-gray-200 pt-4">
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors w-full"
                    >
                        {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        Advanced Configuration & Logs
                    </button>

                    {showAdvanced && (
                        <div className="mt-4 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Activity size={14} className="text-orange-400" />
                                    Network Timeouts
                                </h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between mb-1">
                                        <label className="block text-xs font-bold text-gray-500">Association Timeout</label>
                                        <span className="text-xs font-mono font-bold text-gray-600">{associationTimeout}s</span>
                                    </div>
                                    <input
                                        type="range" min="5" max="120" step="5"
                                        value={associationTimeout}
                                        onChange={(e) => setAssociationTimeout(parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-peregrine-accent"
                                    />
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <FileText size={14} className="text-gray-400" />
                                    Troubleshooting
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-600">Enable Debug Logs</span>
                                        <button
                                            onClick={() => setDebugLogging(!debugLoggingEnabled)}
                                            className={`w-8 h-4 rounded-full relative transition-colors duration-200 ${debugLoggingEnabled ? 'bg-peregrine-accent' : 'bg-gray-200'}`}
                                        >
                                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-200 ${debugLoggingEnabled ? 'left-4.5' : 'left-0.5'}`} style={{ left: debugLoggingEnabled ? '1.1rem' : '0.125rem' }} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between opacity-50 pointer-events-none">
                                        <span className="text-xs text-gray-600">Verbose PDU Dump</span>
                                        <button className="w-8 h-4 bg-gray-200 rounded-full relative">
                                            <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow-sm" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={openLogFile}
                                        className="w-full mt-2 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-[10px] font-bold uppercase border border-gray-200 rounded flex items-center justify-center gap-2"
                                    >
                                        Open Log File
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal for Editing */}
            {isEditingServer && (
                <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
                    <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-800">
                                {isEditingServer === 'new' ? 'New PACS Node' : 'Edit Node'}
                            </h3>
                            <button onClick={() => setIsEditingServer(null)} className="text-gray-400 hover:text-gray-600">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Description</label>
                                <input
                                    autoFocus
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:border-peregrine-accent focus:ring-1 focus:ring-peregrine-accent outline-none transition-all"
                                    value={editServerData.name || ''}
                                    onChange={e => setEditServerData({ ...editServerData, name: e.target.value })}
                                    placeholder="e.g. Main PACS"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Node Type</label>
                                    <div className="flex bg-gray-100 p-1 rounded-lg">
                                        <button
                                            onClick={() => setEditServerData({ ...editServerData, isDicomWeb: false })}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${!editServerData.isDicomWeb ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            DIMSE (Standard)
                                        </button>
                                        <button
                                            onClick={() => setEditServerData({ ...editServerData, isDicomWeb: true })}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${editServerData.isDicomWeb ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            DICOMweb
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">AE Title</label>
                                    <input
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase focus:border-peregrine-accent focus:ring-1 focus:ring-peregrine-accent outline-none"
                                        value={editServerData.aeTitle || ''}
                                        onChange={e => setEditServerData({ ...editServerData, aeTitle: e.target.value.toUpperCase() })}
                                        placeholder="REMOTE_AET"
                                    />
                                </div>

                                {!editServerData.isDicomWeb ? (
                                    <>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Port</label>
                                            <input
                                                type="number"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:border-peregrine-accent focus:ring-1 focus:ring-peregrine-accent outline-none"
                                                value={editServerData.port || ''}
                                                onChange={e => setEditServerData({ ...editServerData, port: parseInt(e.target.value) })}
                                                placeholder="104"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">IP Address / Hostname</label>
                                            <input
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:border-peregrine-accent focus:ring-1 focus:ring-peregrine-accent outline-none"
                                                value={editServerData.address || ''}
                                                onChange={e => setEditServerData({ ...editServerData, address: e.target.value })}
                                                placeholder="192.168.1.100"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="col-span-2">
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">WADO-RS URL</label>
                                        <input
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:border-peregrine-accent focus:ring-1 focus:ring-peregrine-accent outline-none"
                                            value={editServerData.url || ''}
                                            onChange={e => setEditServerData({ ...editServerData, url: e.target.value })}
                                            placeholder="http://server/dicomweb"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsEditingServer(null)}
                                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveServer}
                                disabled={!editServerData.name || !editServerData.aeTitle}
                                className="px-6 py-2 bg-peregrine-accent text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Check size={14} />
                                Save Node
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
