import React, { useState, useEffect } from 'react';
import { X, Server, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { usePACS } from './PACSProvider';
import { useDatabase } from '../Database/DatabaseProvider';
import { useSettings } from '../Settings/SettingsContext';

export const SendToPACSModal: React.FC = () => {
    const { servers, sendToPacs } = usePACS();
    const {
        checkedItems,
        setShowSendModal,
        showSendModal
    } = useDatabase();
    const { databasePath } = useSettings();

    const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [progress, setProgress] = useState<{ total: number; sent: number } | null>(null);
    const [status, setStatus] = useState<'idle' | 'preparing' | 'sending' | 'completed' | 'failed'>('idle');
    const [error, setError] = useState<string | null>(null);

    // Reset state when modal opens
    useEffect(() => {
        if (showSendModal) {
            setStatus('idle');
            setError(null);
            setProgress(null);
        }
    }, [showSendModal]);

    if (!showSendModal) return null;

    const handleSend = async () => {
        if (!selectedServerId || checkedItems.size === 0) return;

        const server = servers.find(s => s.id === selectedServerId);
        if (!server) return;

        setStatus('preparing');
        setIsSending(true);
        setError(null);

        try {
            const ids = Array.from(checkedItems);
            const seriesUids = new Set<string>();

            const dbProxy = (window as any).electron.db;

            for (const id of ids) {
                // 1. Try Series
                const seriesDoc = await dbProxy.get('SELECT seriesInstanceUID FROM series WHERE seriesInstanceUID = ?', [id]);
                if (seriesDoc) {
                    seriesUids.add(id);
                    continue;
                }

                // 2. Try Study
                const studyDoc = await dbProxy.get('SELECT studyInstanceUID FROM studies WHERE studyInstanceUID = ?', [id]);
                if (studyDoc) {
                    const series = await dbProxy.query('SELECT seriesInstanceUID FROM series WHERE studyInstanceUID = ?', [id]);
                    series.forEach((s: any) => seriesUids.add(s.seriesInstanceUID));
                    continue;
                }

                // 3. Try Patient (Numeric ID or PatientID)
                const patientDoc = await dbProxy.get('SELECT id FROM patients WHERE id = ? OR patientID = ?', [id, id]);
                if (patientDoc) {
                    const studies = await dbProxy.query('SELECT studyInstanceUID FROM studies WHERE patientId = ?', [patientDoc.id]);
                    for (const st of studies) {
                        const series = await dbProxy.query('SELECT seriesInstanceUID FROM series WHERE studyInstanceUID = ?', [st.studyInstanceUID]);
                        series.forEach((s: any) => seriesUids.add(s.seriesInstanceUID));
                    }
                }
            }

            if (seriesUids.size === 0) {
                throw new Error('No series found to send.');
            }

            // 4. Get all file paths for these series
            const uidsArr = Array.from(seriesUids);
            const placeholders = uidsArr.map(() => '?').join(',');
            const allFiles = await dbProxy.query(
                `SELECT i.filePath FROM instances i
                 JOIN series s ON i.seriesId = s.id
                 WHERE s.seriesInstanceUID IN (${placeholders})`,
                uidsArr
            );

            const rawPaths = allFiles.map((f: any) => f.filePath).filter(Boolean) as string[];

            if (rawPaths.length === 0) {
                throw new Error('No DICOM files found for selected items.');
            }

            // Resolve absolute paths
            const paths = rawPaths.map((p) => {
                if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return p;
                if (!databasePath) return p;
                const sep = databasePath.includes('\\') ? '\\' : '/';
                return `${databasePath.replace(/[\\/]$/, '')}${sep}${p.replace(/^[\\/]/, '')}`;
            });

            setStatus('sending');
            setProgress({ total: paths.length, sent: 0 });

            // 5. Initiate send
            const success = await sendToPacs(server, paths);

            if (success) {
                setStatus('completed');
            } else {
                setStatus('failed');
                setError('PACS Send operation failed. Check server configuration or logs.');
            }

        } catch (err: any) {
            console.error('SendToPACS Error:', err);
            setStatus('failed');
            setError(err.message || 'An unexpected error occurred during the send process.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={() => !isSending && setShowSendModal(false)}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-peregrine-accent/10 flex items-center justify-center text-peregrine-accent">
                            <Send size={18} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2 className="text-[14px] font-black tracking-tight text-gray-900">Send to PACS</h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                {checkedItems.size} items selected
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowSendModal(false)}
                        disabled={isSending}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-30"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {status === 'idle' || status === 'failed' ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
                                    Select PACS Node
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {servers.filter(s => !s.isDicomWeb).map((server) => (
                                        <button
                                            key={server.id}
                                            onClick={() => setSelectedServerId(server.id)}
                                            className={`
                                                flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
                                                ${selectedServerId === server.id
                                                    ? 'bg-peregrine-accent/5 border-peregrine-accent ring-1 ring-peregrine-accent'
                                                    : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
                                            `}
                                        >
                                            <div className={`p-2 rounded-lg ${selectedServerId === server.id ? 'bg-peregrine-accent text-white' : 'bg-gray-100 text-gray-400'}`}>
                                                <Server size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-xs font-bold truncate ${selectedServerId === server.id ? 'text-gray-900' : 'text-gray-600'}`}>
                                                    {server.name}
                                                </div>
                                                <div className="text-[10px] font-medium text-gray-400 uppercase tracking-tighter">
                                                    {server.aeTitle} @ {server.address}:{server.port}
                                                </div>
                                            </div>
                                            {selectedServerId === server.id && (
                                                <div className="w-2 h-2 rounded-full bg-peregrine-accent animate-pulse" />
                                            )}
                                        </button>
                                    ))}
                                    {servers.filter(s => !s.isDicomWeb).length === 0 && (
                                        <div className="py-8 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                            <p className="text-xs font-bold text-gray-400">No DICOM nodes configured.</p>
                                            <p className="text-[10px] text-gray-400">Add nodes in Preferences &gt; PACS Nodes.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-bold text-red-900">Send Failed</div>
                                        <div className="text-[10px] text-red-700 leading-tight mt-0.5">{error}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : status === 'preparing' || status === 'sending' ? (
                        <div className="flex flex-col items-center py-8 gap-6">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-peregrine-accent/10 rounded-full" />
                                <div className="absolute inset-0 w-16 h-16 border-4 border-peregrine-accent border-t-transparent rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Send size={24} className="text-peregrine-accent animate-pulse" />
                                </div>
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                                    {status === 'preparing' ? 'Preparing Files...' : 'Sending to PACS...'}
                                </h3>
                                {progress && (
                                    <div className="space-y-3 w-48 mx-auto">
                                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-peregrine-accent transition-all duration-500"
                                                style={{ width: `${(progress.sent / progress.total) * 100}%` }}
                                            />
                                        </div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                            Processing Job...
                                        </p>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-gray-400 text-center max-w-[200px] leading-relaxed">
                                Please keep the application open until the transfer is complete.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-8 gap-6 animate-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center text-green-500 shadow-sm ring-4 ring-green-50">
                                <CheckCircle2 size={32} strokeWidth={2.5} />
                            </div>
                            <div className="text-center space-y-1">
                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Transfer Complete</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                    {progress?.total || checkedItems.size} items successfully queued
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowSendModal(false);
                                    // Optionally clear selection after success
                                    // setCheckedItems(new Set());
                                }}
                                className="px-8 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-lg"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {(status === 'idle' || status === 'failed') && (
                    <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex justify-end gap-3">
                        <button
                            onClick={() => setShowSendModal(false)}
                            disabled={isSending}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-700 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={!selectedServerId || isSending}
                            className={`
                                flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md
                                ${selectedServerId && !isSending
                                    ? 'bg-peregrine-accent text-white hover:bg-peregrine-accent/90 active:scale-95'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'}
                            `}
                        >
                            {isSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            Send to Node
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
