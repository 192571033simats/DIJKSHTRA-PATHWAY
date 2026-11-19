# Dijkstra Parking Finder

Interactive demo: a car arrives at a gate and Dijkstra's algorithm finds the nearest free parking slot.

## Structure
```
dijkstra-parking-finder/
├── index.html      page markup
├── css/style.css   all styling (light + dark theme)
├── js/app.js       lot graph, Dijkstra + heap, SVG map and chart rendering
└── README.md
```

## Run
- Quick: double-click `index.html` (no build step, no dependencies).
- Local server (recommended): `python3 -m http.server 8000` then open http://localhost:8000
- Deploy: upload the folder to any static host (GitHub Pages, Netlify, Vercel, etc.).

Fonts load from Google Fonts; without internet the page falls back to system fonts.
