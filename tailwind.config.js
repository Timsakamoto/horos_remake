/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/renderer/index.html',
        './src/renderer/src/**/*.{js,ts,jsx,tsx}'
    ],
    theme: {
        extend: {
            colors: {
                'horos-bg': '#f5f5f7',       // Light gray (Mac standard)
                'horos-panel': '#ffffff',    // White for panels
                'horos-border': '#d1d1d6',   // Light border
                'horos-text': '#1c1c1e',     // Dark text
                'horos-accent': '#007aff',   // iOS Blue
                'horos-hover': '#f2f2f7',    // Light hover
                'horos-selected': '#e5f1fb'  // Light blue selection
            }
        },
    },
    plugins: [],
}
