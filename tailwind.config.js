/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Horos-like dark theme palette
                horos: {
                    bg: '#1a1a1a',
                    panel: '#2d2d2d',
                    border: '#3e3e3e',
                    text: '#e0e0e0',
                    accent: '#007aff', // Mac blue
                    waring: '#ffcc00',
                    error: '#ff3b30',
                }
            }
        },
    },
    plugins: [],
}
