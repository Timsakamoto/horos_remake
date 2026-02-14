import React, { createContext, useContext, useState, useEffect } from 'react';

export type ViewModeSetting = 'patient' | 'study';

interface SettingsContextType {
    viewMode: ViewModeSetting;
    setViewMode: (mode: ViewModeSetting) => void;
    databasePath: string | null;
    setDatabasePath: (path: string) => void;
    showSettings: boolean;
    setShowSettings: (show: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType>({
    viewMode: 'patient',
    setViewMode: () => { },
    databasePath: null,
    setDatabasePath: () => { },
    showSettings: false,
    setShowSettings: () => { },
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [viewMode, setViewModeState] = useState<ViewModeSetting>(() => {
        const saved = localStorage.getItem('horos_view_mode');
        return (saved === 'patient' || saved === 'study') ? saved : 'patient';
    });

    const [databasePath, setDatabasePathState] = useState<string | null>(() => {
        return localStorage.getItem('horos_database_path');
    });

    const [showSettings, setShowSettings] = useState(false);

    // Initialize default path if none exists
    useEffect(() => {
        if (!databasePath) {
            const initPath = async () => {
                try {
                    // @ts-ignore
                    const userData = await window.electron.getPath('userData');
                    // @ts-ignore
                    const defaultPath = await window.electron.join(userData, 'HorosData', 'DICOM');
                    setDatabasePath(defaultPath);
                } catch (e) {
                    console.error('Failed to init default database path:', e);
                }
            };
            initPath();
        }
    }, []);

    const setViewMode = (mode: ViewModeSetting) => {
        setViewModeState(mode);
        localStorage.setItem('horos_view_mode', mode);
    };

    const setDatabasePath = (path: string) => {
        setDatabasePathState(path);
        localStorage.setItem('horos_database_path', path);
    };

    return (
        <SettingsContext.Provider value={{
            viewMode,
            setViewMode,
            databasePath,
            setDatabasePath,
            showSettings,
            setShowSettings
        }}>
            {children}
        </SettingsContext.Provider>
    );
};
