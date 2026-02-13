import { Server, Database, Globe } from 'lucide-react';
import { usePACS } from './PACSProvider';

export const PACSServerList = () => {
    const { servers, activeServer, setActiveServer } = usePACS();

    return (
        <div className="w-72 bg-white border-r border-gray-100 flex flex-col h-full select-none shadow-[1px_0_0_0_rgba(0,0,0,0.02)]">
            <div className="px-5 py-4 flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.15em]">Sources</span>
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
            </div>

            <div className="flex-1 overflow-y-auto px-2">
                <div className="space-y-0.5">
                    {/* Local DB Placeholder - LiftKit Optical Symmetry */}
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer text-gray-600 group transition-all">
                        <Database size={16} className="text-gray-400 group-hover:text-horos-accent transition-colors" />
                        <span className="text-[13px] font-semibold tracking-tight">Local Database</span>
                    </div>

                    <div className="pt-4">
                        <div className="px-3 pb-2">
                            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">PACS Nodes</span>
                        </div>
                        {servers.map((server) => (
                            <div
                                key={server.id}
                                onClick={() => setActiveServer(server)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group cursor-pointer ${activeServer?.id === server.id
                                        ? 'bg-blue-50 text-horos-accent shadow-sm'
                                        : 'hover:bg-gray-50 text-gray-600'
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${activeServer?.id === server.id
                                        ? 'bg-horos-accent text-white scale-105'
                                        : 'bg-blue-50 text-horos-accent group-hover:bg-horos-accent group-hover:text-white'
                                    }`}>
                                    <Globe size={16} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-bold leading-tight tracking-tight">{server.name}</span>
                                    <span className={`text-[10px] font-medium ${activeServer?.id === server.id ? 'text-blue-400' : 'text-gray-400'
                                        }`}>{server.aeTitle}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Controls - Clean Flat */}
            <div className="p-4 border-t border-gray-50 bg-gray-50/30 flex justify-between items-center">
                <button className="flat-button !p-2">
                    <Server size={14} className="text-gray-500" />
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">
                        {activeServer ? 'Connected' : 'Scanner Offline'}
                    </span>
                </div>
            </div>
        </div>
    );
};
