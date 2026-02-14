import React, { createContext, useContext, useState, useEffect } from 'react';

export type ViewModeSetting = 'patient' | 'study';

interface SettingsContextType {
    viewMode: ViewModeSetting;
    setViewMode: (mode: ViewModeSetting) => void;
    databasePath: string | null;
    setDatabasePath: (path: string) => void;
    isUpdating: boolean;
    lastUpdateStatus: 'success' | 'error' | null;
    showSettings: boolean;
    setShowSettings: (show: boolean) => void;
    activeSection: 'general' | 'pacs';
    setActiveSection: (section: 'general' | 'pacs') => void;
}

const SettingsContext = createContext<SettingsContextType>({
    viewMode: 'patient',
    setViewMode: () => { },
    databasePath: null,
    setDatabasePath: () => { },
    isUpdating: false,
    lastUpdateStatus: null,
    showSettings: false,
    setShowSettings: () => { },
    activeSection: 'general',
    setActiveSection: () => { }
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [viewMode, setViewModeState] = useState<ViewModeSetting>('patient');
    const [databasePath, setDatabasePathState] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [lastUpdateStatus, setLastUpdateStatus] = useState<'success' | 'error' | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [activeSection, setActiveSection] = useState<'general' | 'pacs'>('general');
    const [isLoaded, setIsLoaded] = useState(false);

    // Robust Persistence Initialization
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // @ts-ignore
                const userData = await window.electron.getPath('userData');
                // @ts-ignore
                const settingsFile = await window.electron.join(userData, 'settings.json');

                // 1. Try to read from file system
                // @ts-ignore
                const data = await window.electron.readFile(settingsFile);
                if (data) {
                    const textContent = new TextDecoder().decode(data);
                    const settings = JSON.parse(textContent);
                    console.log('SettingsContext: Loaded from settings.json:', settings);

                    if (settings.viewMode) setViewModeState(settings.viewMode);
                    if (settings.databasePath) setDatabasePathState(settings.databasePath);
                } else {
                    // 2. Fallback to localStorage if no file
                    const savedMode = localStorage.getItem('peregrine_view_mode');
                    const savedPath = localStorage.getItem('peregrine_database_path');

                    if (savedMode === 'patient' || savedMode === 'study') setViewModeState(savedMode);
                    if (savedPath) {
                        setDatabasePathState(savedPath);
                    } else {
                        // 3. Fallback to default path
                        // @ts-ignore
                        const defaultPath = await window.electron.join(userData, 'PeregrineData', 'DICOM');
                        setDatabasePathState(defaultPath);
                    }
                }
            } catch (e) {
                console.error('SettingsContext: Failed to load robust settings:', e);
            } finally {
                setIsLoaded(true);
            }
        };
        loadSettings();
    }, []);

    // Side-effect to persist settings whenever they change, but ONLY after initial load
    useEffect(() => {
        if (!isLoaded) return;

        const persist = async () => {
            try {
                // @ts-ignore
                const userData = await window.electron.getPath('userData');
                // @ts-ignore
                const settingsFile = await window.electron.join(userData, 'settings.json');

                const current = { viewMode, databasePath };
                const data = new TextEncoder().encode(JSON.stringify(current, null, 2));

                // @ts-ignore
                await window.electron.writeFile(settingsFile, data);

                // Keep localStorage in sync as backup
                localStorage.setItem('peregrine_view_mode', viewMode);
                if (databasePath) localStorage.setItem('peregrine_database_path', databasePath);

                console.log('SettingsContext: Persisted settings to disk');
            } catch (e) {
                console.error('SettingsContext: Failed to persist settings:', e);
            }
        };

        persist();
    }, [viewMode, databasePath, isLoaded]);

    const setViewMode = (mode: ViewModeSetting) => setViewModeState(mode);
    const setDatabasePath = async (path: string) => {
        setIsUpdating(true);
        setLastUpdateStatus(null);
        try {
            // Simulate a brief delay to show loading state if it's too fast
            await new Promise(resolve => setTimeout(resolve, 500));
            setDatabasePathState(path);
            setLastUpdateStatus('success');
            // Reset success status after a delay
            setTimeout(() => setLastUpdateStatus(null), 3000);
        } catch (e) {
            console.error('Failed to update database path:', e);
            setLastUpdateStatus('error');
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <SettingsContext.Provider value={{
            viewMode,
            setViewMode,
            databasePath,
            setDatabasePath,
            isUpdating,
            lastUpdateStatus,
            showSettings,
            setShowSettings,
            activeSection,
            setActiveSection
        }}>
            {children}
        </SettingsContext.Provider>
    );
};
