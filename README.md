# Atom Viewer — PyQt + VisPy port

This is a desktop port of the original `src/main.js` atom viewer. It recreates the visualization and UI in Python using PyQt and VisPy.

Quick start

1. Create a virtual environment (recommended) and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate   # or `.venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

2. Run the app:

```bash
python src/main.py
```

Notes
- The port aims to preserve visuals and interaction (orbit camera, electrons, cloud, labels).
- Electron cloud particle counts were reduced for desktop performance; adjust in `build_electron_cloud` if desired.
- If you prefer an in-browser Python approach (Pyodide) instead, I can produce that variant instead.
3D Atom Viewer

A simple interactive 3D atom visualizer built with Three.js.

Files:
- index.html — main page
- src/main.js — visualization + UI
- src/styles.css — minimal styles

Quick run:

Using Python (no install needed):

```bash
cd atom-viewer
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

Or with Node (install a static server if you like):

```bash
npm install -g http-server
npm start
# opens on http://localhost:8080
```

Desktop (Electron):

1. Install dependencies and run the desktop app:

```bash
cd atom-viewer
npm install
npm start
```

This will open a native window with the 3D atom viewer.

Notes:
- This uses a simplified Bohr-like model for electron shells (visual only).
- Ask me to add electron clouds, nicer nucleus layout, labels, or export options.
