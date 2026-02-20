import sys
import math
import random
import numpy as np
from PyQt6 import QtWidgets, QtCore
from vispy import scene, app
from vispy.scene import visuals

# ----- Configuration matching original JS -----
shell_radii = [1.6, 2.6, 3.6, 4.6, 5.6]


class AtomViewer(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('Atom Viewer (PyQt + VisPy)')
        self.resize(1200, 800)

        # Central widget: canvas on left, controls on right
        central = QtWidgets.QWidget()
        self.setCentralWidget(central)
        layout = QtWidgets.QHBoxLayout(central)

        # VisPy canvas
        self.canvas = scene.SceneCanvas(keys='interactive', size=(800, 600), show=True)
        self.view = self.canvas.central_widget.add_view()
        self.view.camera = scene.cameras.TurntableCamera(fov=45, distance=12, elevation=20)
        self.view.camera.center = (0, 0, 0)

        # Root group for atom
        self.atom_group = scene.Node(parent=self.view.scene)

        # Lighting approximation: VisPy doesn't have full PBR here, use ambient-like shading via colors

        layout.addWidget(self.canvas.native)

        # Controls
        ctrl = QtWidgets.QWidget()
        ctrl_layout = QtWidgets.QVBoxLayout(ctrl)
        layout.addWidget(ctrl)

        # Atomic number slider + display
        self.atomic_label = QtWidgets.QLabel('Atomic number:')
        ctrl_layout.addWidget(self.atomic_label)
        self.atomic_slider = QtWidgets.QSlider(QtCore.Qt.Orientation.Horizontal)
        self.atomic_slider.setMinimum(1)
        self.atomic_slider.setMaximum(92)
        self.atomic_slider.setValue(8)
        ctrl_layout.addWidget(self.atomic_slider)
        self.atomic_val = QtWidgets.QLabel(str(self.atomic_slider.value()))
        ctrl_layout.addWidget(self.atomic_val)

        # Preset combo
        self.preset = QtWidgets.QComboBox()
        presets = [('H', 1), ('He', 2), ('C', 6), ('O', 8), ('Ne', 10), ('Fe', 26), ('Au', 79)]
        for name, val in presets:
            self.preset.addItem(f"{name} ({val})", val)
        ctrl_layout.addWidget(self.preset)

        # Toggles and buttons
        self.cloud_toggle = QtWidgets.QCheckBox('Electron cloud')
        ctrl_layout.addWidget(self.cloud_toggle)
        self.label_toggle = QtWidgets.QCheckBox('Orbital labels')
        ctrl_layout.addWidget(self.label_toggle)
        self.repack_btn = QtWidgets.QPushButton('Repack nucleus')
        ctrl_layout.addWidget(self.repack_btn)
        self.build_btn = QtWidgets.QPushButton('Build atom')
        ctrl_layout.addWidget(self.build_btn)

        ctrl_layout.addStretch()

        # Internal structures
        self.nucleus_nodes = []
        self.electrons = []
        self.orbit_rings = []
        self.cloud = None
        self.orbital_labels = []

        # Wire up events
        self.atomic_slider.valueChanged.connect(self.on_atomic_change)
        self.preset.currentIndexChanged.connect(self.on_preset_change)
        self.build_btn.clicked.connect(self.on_build_clicked)
        self.cloud_toggle.stateChanged.connect(self.on_cloud_toggled)
        self.label_toggle.stateChanged.connect(self.on_label_toggled)
        self.repack_btn.clicked.connect(self.on_repack)

        # Initial build
        self.build_atom(self.atomic_slider.value())

        # Timer for animation
        self._timer = QtCore.QTimer()
        self._timer.timeout.connect(self.on_animate)
        self._timer.start(16)

    # ---- UI callbacks ----
    def on_atomic_change(self, v):
        self.atomic_val.setText(str(v))

    def on_preset_change(self, idx):
        val = self.preset.itemData(idx)
        self.atomic_slider.setValue(val)
        self.atomic_val.setText(str(val))

    def on_build_clicked(self):
        self.build_atom(self.atomic_slider.value())

    def on_cloud_toggled(self, state):
        if state:
            self.build_electron_cloud(self.atomic_slider.value())
        else:
            if self.cloud is not None:
                self.cloud.parent = None
                self.cloud = None

    def on_label_toggled(self, state):
        if state:
            self.add_orbital_labels()
        else:
            for lbl in self.orbital_labels:
                lbl.parent = None
            self.orbital_labels = []

    def on_repack(self):
        self.repack_nucleus(200)

    # ---- Atom construction ----
    def clear_atom(self):
        for child in list(self.atom_group.children):
            child.parent = None
        self.nucleus_nodes = []
        self.electrons = []
        self.orbit_rings = []

    def make_sphere(self, radius, color, parent=None):
        mesh = visuals.Sphere(radius=radius, method='latitude', parent=parent or self.atom_group,
                              color=color, rows=24, cols=18)
        return mesh

    def build_atom(self, Z):
        self.clear_atom()
        # Nucleus
        protons = int(Z)
        neutrons = int(round(Z * 1.25))
        nuc_count = protons + neutrons
        nuc_group = scene.Node(parent=self.atom_group)
        for i in range(nuc_count):
            is_proton = i < protons
            color = (1.0, 0.4, 0.4, 1.0) if is_proton else (0.6, 0.6, 0.6, 1.0)
            # random placement inside small radius
            r = 0.9 * (random.random() ** (1/3.0)) * 0.6
            theta = random.random() * 2 * math.pi
            phi = math.acos(2 * random.random() - 1)
            x = r * math.sin(phi) * math.cos(theta)
            y = r * math.sin(phi) * math.sin(theta)
            z = r * math.cos(phi)
            s = visuals.Sphere(radius=0.35, method='latitude', color=color, parent=nuc_group)
            s.transform = scene.transforms.STTransform(translate=(x, y, z))
            self.nucleus_nodes.append(s)

        # Electrons and rings
        remaining = Z
        for shell_index, radius in enumerate(shell_radii):
            if remaining <= 0:
                break
            capacity = 2 if shell_index == 0 else 8 * (2 ** (shell_index - 1))
            in_shell = min(capacity, remaining)

            # orbit line
            theta = np.linspace(0, 2 * np.pi, 65)
            pts = np.zeros((len(theta), 3))
            pts[:, 0] = np.cos(theta) * radius
            pts[:, 2] = np.sin(theta) * radius
            ring = visuals.Line(pos=pts, color=(0.53, 0.53, 1.0, 0.25), parent=self.atom_group)
            self.orbit_rings.append(ring)

            # electrons
            for e in range(in_shell):
                ang = (e / in_shell) * 2 * math.pi
                x = math.cos(ang) * radius
                z = math.sin(ang) * radius
                el = visuals.Sphere(radius=0.12, method='ico', color=(0.4, 0.66, 1.0, 1.0), parent=self.atom_group)
                el.user_radius = radius
                el.user_speed = 0.6 + random.random() * 0.8
                el.user_phase = ang + random.random() * 0.4
                el.transform = scene.transforms.STTransform(translate=(x, 0.0, z))
                self.electrons.append((el, shell_index))

            remaining -= in_shell

        # optional labels
        if self.label_toggle.isChecked():
            self.add_orbital_labels()

        # cloud if toggled
        if self.cloud_toggle.isChecked():
            self.build_electron_cloud(Z)

    def build_electron_cloud(self, Z):
        # remove existing
        if self.cloud is not None:
            self.cloud.parent = None
            self.cloud = None

        positions = []
        color = (0.4, 0.66, 1.0, 0.55)
        for shell_index, radius in enumerate(shell_radii):
            count = max(40, 800 - shell_index * 120)  # reduced counts for desktop perf
            for i in range(count):
                u = random.random()
                v = random.random()
                theta = 2 * math.pi * u
                phi = math.acos(2 * v - 1)
                r = radius + (random.random() - 0.5) * 0.4 + (random.random() - 0.5) * 0.2
                x = r * math.sin(phi) * math.cos(theta)
                y = (random.random() - 0.5) * 0.6
                z = r * math.sin(phi) * math.sin(theta)
                positions.append((x, y, z))

        pos = np.array(positions, dtype=np.float32)
        m = visuals.Markers(parent=self.atom_group)
        m.set_data(pos, face_color=color, size=4)
        self.cloud = m

    def add_orbital_labels(self):
        for lbl in self.orbital_labels:
            lbl.parent = None
        self.orbital_labels = []
        labels = ['K', 'L', 'M', 'N', 'O']
        for i, r in enumerate(shell_radii):
            txt = visuals.Text(text=labels[i] if i < len(labels) else f'S{i+1}', color='black', parent=self.atom_group,
                               font_size=12, anchor_x='center')
            txt.transform = scene.transforms.STTransform(translate=(0, 0.9 + i * 0.1, r))
            self.orbital_labels.append(txt)

    def repack_nucleus(self, iterations=120):
        n = len(self.nucleus_nodes)
        if n == 0:
            return
        pos = np.array([node.transform.translate for node in self.nucleus_nodes], dtype=float)
        radius = 0.9
        for it in range(iterations):
            for i in range(n):
                p = pos[i].copy()
                disp = np.zeros(3)
                for j in range(n):
                    if i == j:
                        continue
                    d = p - pos[j]
                    dist = np.linalg.norm(d) + 1e-6
                    minDist = 0.28
                    if dist < minDist:
                        d_norm = d / dist
                        disp += d_norm * ((minDist - dist) * 0.02)
                # central restoring
                disp += -0.01 * p
                p += disp
                if np.linalg.norm(p) > radius:
                    p = p / np.linalg.norm(p) * (radius * (0.85 + random.random() * 0.15))
                pos[i] = p

        # write back
        for i, node in enumerate(self.nucleus_nodes):
            node.transform = scene.transforms.STTransform(translate=tuple(pos[i]))

    # Animation tick
    def on_animate(self):
        dt = 0.016
        # update electrons
        for el, idx in self.electrons:
            u_speed = el.user_speed
            phase = el.user_phase + u_speed * dt * 0.7
            el.user_phase = phase
            r = el.user_radius
            x = math.cos(phase) * r
            y = math.sin(phase * 0.4 + idx) * 0.05
            z = math.sin(phase) * r
            el.transform = scene.transforms.STTransform(translate=(x, y, z))

        # rotate rings slightly
        for i, ring in enumerate(self.orbit_rings):
            # apply slight rotation about Y by modifying mesh transforms
            ang = 0.05 * dt * (i + 1)
            tr = scene.transforms.AffineTransform()
            tr.rotate(np.degrees(ang), (0, 1, 0))
            ring.transform = ring.transform * tr if ring.transform is not None else tr

        self.canvas.update()


def main():
    app.use_app('pyqt5')
    qt_app = QtWidgets.QApplication(sys.argv)
    viewer = AtomViewer()
    viewer.show()
    sys.exit(qt_app.exec())


if __name__ == '__main__':
    main()
