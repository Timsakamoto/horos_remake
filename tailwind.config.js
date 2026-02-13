/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/renderer/index.html',
        './src/renderer/src/**/*.{js,ts,jsx,tsx}'
    ],
    theme: {
        extend: {
            colors: {
                'horos-bg': '#f5f5f7',       // Apple System Background
                'horos-panel': '#ffffff',    // Pure White for Flat look
                'horos-border': '#e5e5ea',   // Subtle light border
                'horos-text': '#1c1c1e',     // Dark text
                'horos-accent': '#007aff',   // macOS Blue
                'horos-hover': '#f2f2f7',    // Light gray hover
                'horos-selected': '#007aff', // Vibrant blue selection
                'horos-toolbar': '#ffffff'   // Clean white toolbar
            }
        },
    },
    plugins: [],
}
