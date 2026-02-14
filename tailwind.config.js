/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/renderer/index.html',
        './src/renderer/src/**/*.{js,ts,jsx,tsx}'
    ],
    theme: {
        extend: {
            colors: {
                'peregrine-bg': '#f5f5f7',       // Apple System Background
                'peregrine-panel': '#ffffff',    // Pure White for Flat look
                'peregrine-border': '#e5e5ea',   // Subtle light border
                'peregrine-text': '#1c1c1e',     // Dark text
                'peregrine-accent': '#007aff',   // macOS Blue
                'peregrine-hover': '#f2f2f7',    // Light gray hover
                'peregrine-selected': '#007aff', // Vibrant blue selection
                'peregrine-toolbar': '#ffffff'   // Clean white toolbar
            }
        },
    },
    plugins: [],
}
