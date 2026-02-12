import { useState } from 'react'

function App() {
    return (
        <div className="flex h-screen w-screen flex-col bg-horos-bg text-horos-text">
            {/* Title Bar Area (drag region) */}
            <div className="h-10 w-full bg-horos-panel border-b border-horos-border draggable flex items-center justify-center select-none" style={{ WebkitAppRegion: 'drag' } as any}>
                <span className="font-semibold text-sm opacity-80">Antigravity</span>
            </div>

            {/* Work Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar (Database/Plugins) */}
                <div className="w-64 bg-horos-panel border-r border-horos-border flex flex-col">
                    <div className="p-4 border-b border-horos-border">
                        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Database</h2>
                    </div>
                    <div className="flex-1 p-4">
                        <p className="text-sm text-gray-500 italic">No studies loaded.</p>
                    </div>
                </div>

                {/* Main Content (Viewer) */}
                <div className="flex-1 bg-black flex items-center justify-center relative">
                    <div className="text-center">
                        <h1 className="text-4xl font-light text-horos-accent mb-4">Project Antigravity</h1>
                        <p className="text-gray-400">Phase 1: Foundation Established</p>
                        <p className="text-xs text-gray-600 mt-2">Horos Reborn</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
