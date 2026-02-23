/**
 * 3D Atom Viewer - Interactive Three.js Application
 * Displays atomic structure with nucleus, electrons, and orbital shells
 * Supports 360-degree rotation and various element configurations
 */

// Register service worker for PWA
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('/sw.js');
// }

console.log('JS loaded - cube removed');

// Canvas and scene setup
const canvasEl = document.getElementById('canvas');
const width = window.innerWidth;
const height = window.innerHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122); // Dark blue background to make atoms more visible
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
camera.position.set(0, 5, 12);

const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
renderer.setSize(width, height);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting setup
const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(5, 10, 7);
scene.add(dir);

// Groups for organization
let atomGroup = new THREE.Group();
scene.add(atomGroup);

// Element names for atomic numbers 1-36
const elementNames = [
  '', 'Hydrogen', 'Helium', 'Lithium', 'Beryllium', 'Boron', 'Carbon', 'Nitrogen', 'Oxygen', 'Fluorine', 'Neon',
  'Sodium', 'Magnesium', 'Aluminium', 'Silicon', 'Phosphorus', 'Sulfur', 'Chlorine', 'Argon', 'Potassium', 'Calcium',
  'Scandium', 'Titanium', 'Vanadium', 'Chromium', 'Manganese', 'Iron', 'Cobalt', 'Nickel', 'Copper', 'Zinc',
  'Gallium', 'Germanium', 'Arsenic', 'Selenium', 'Bromine', 'Krypton'
];

// Element label sprite
let elementLabel = null;

// Shell radii for electron orbits
const shellRadii = [1.6, 2.6, 3.6, 4.6, 5.6];

// Window resize handler
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

/**
 * Creates a sphere mesh with specified radius and color
 * @param {number} radius - Sphere radius
 * @param {number} color - Hex color value
 * @returns {THREE.Mesh} The sphere mesh
 */
function makeSphere(radius, color) {
  const geo = new THREE.SphereGeometry(radius, 24, 18);
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.6 });
  return new THREE.Mesh(geo, mat);
}

/**
 * Clears the current atom from the scene
 */
function clearAtom() {
  while (atomGroup.children.length) atomGroup.remove(atomGroup.children[0]);
  // Reset element label
  if (elementLabel) {
    if (elementLabel.material.map) elementLabel.material.map.dispose();
    elementLabel.material.dispose();
    elementLabel = null;
  }
}

/**
 * Builds the 3D atom model for a given atomic number
 * @param {number} Z - Atomic number (protons)
 */
function buildAtom(Z) {
  console.log('Building atom for Z:', Z);
  clearAtom();

  // Add element label above the atom
  if (elementLabel) {
    atomGroup.remove(elementLabel);
    if (elementLabel.material.map) elementLabel.material.map.dispose();
    elementLabel.material.dispose();
  }
  const name = elementNames[Z] || `Element ${Z}`;
  elementLabel = makeLabelSprite(name);
  elementLabel.scale.set(3, 3, 1); // increased scale for full visibility
  elementLabel.position.set(0, 8, 0); // Position above the atom
  atomGroup.add(elementLabel);

  // Nucleus: protons (red) and neutrons (gray)
  const nucleus = new THREE.Group();
  const protons = Z;
  const neutrons = Math.round(Z * 1.25);
  const nucCount = protons + neutrons;
  const nucRadius = 1.0; // increased for visibility
  for (let i = 0; i < nucCount; i++) {
    const isProton = i < protons;
    const s = makeSphere(nucRadius * 0.8, isProton ? 0xff6666 : 0x999999);
    // place randomly within small radius with better distribution
    const r = 0.9 * Math.cbrt(Math.random()) * 0.8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    s.position.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
    nucleus.add(s);
  }
  atomGroup.add(nucleus);
  atomGroup.userData.nucleus = nucleus;

  // Electrons in shells
  let remaining = Z; // neutral atom
  const electronGroup = new THREE.Group();
  for (let shell = 0; shell < shellRadii.length && remaining > 0; shell++) {
    const capacity = 2 * (shell + 1) * (shell + 1); // accurate: 2n^2
    const inShell = Math.min(capacity, remaining);
    const radius = shellRadii[shell];
    const ring = new THREE.Group();
    // optionally add visible orbit
    const orbitMat = new THREE.LineBasicMaterial({ color: 0x8888ff, transparent: true, opacity: 0.25 });
    const orbitGeo = new THREE.BufferGeometry();
    const points = [];
    for (let t = 0; t <= 64; t++) {
      const a = (t / 64) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    orbitGeo.setFromPoints(points);
    const orbitLine = new THREE.Line(orbitGeo, orbitMat);
    ring.add(orbitLine);

    for (let e = 0; e < inShell; e++) {
      const ang = (e / inShell) * Math.PI * 2;
      const el = makeSphere(0.25, 0x66aaff); // increased size for visibility
      el.userData = { radius, speed: 0.6 + Math.random() * 0.8, phase: ang + Math.random() * 0.4 };
      el.position.set(Math.cos(ang) * radius, 0, Math.sin(ang) * radius);
      ring.add(el);
    }
    electronGroup.add(ring);
    remaining -= inShell;
  }
  atomGroup.add(electronGroup);

  atomGroup.userData.electronGroup = electronGroup;
}

// --- Electron cloud rendering (points) ---
let cloudPoints = null;

/**
 * Builds the electron cloud as point particles
 * @param {number} Z - Atomic number
 */
function buildElectronCloud(Z) {
  if (cloudPoints) {
    atomGroup.remove(cloudPoints);
    cloudPoints.geometry.dispose();
    cloudPoints.material.dispose();
    cloudPoints = null;
  }
  const positions = [];
  const colors = [];
  const color = new THREE.Color(0x66aaff);
  // create particles per shell with gaussian falloff
  for (let shell = 0; shell < shellRadii.length; shell++) {
    const radius = shellRadii[shell];
    const count = 800 - shell * 120; // fewer for outer shells
    for (let i = 0; i < count; i++) {
      // sample spherical gaussian-ish distribution
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = radius + (Math.random() - 0.5) * 0.4 + (Math.random() - 0.5) * 0.2;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = (Math.random() - 0.5) * 0.6;
      const z = r * Math.sin(phi) * Math.sin(theta);
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
  cloudPoints = new THREE.Points(geometry, material);
  atomGroup.add(cloudPoints);
}

/**
 * Toggles the electron cloud visibility
 * @param {boolean} show - Whether to show the cloud
 * @param {number} Z - Atomic number
 */
function toggleCloud(show, Z) {
  if (show) buildElectronCloud(Z);
  else if (cloudPoints) {
    atomGroup.remove(cloudPoints);
    cloudPoints.geometry.dispose();
    cloudPoints.material.dispose();
    cloudPoints = null;
  }
}

// --- Orbital labels (simple sprites) ---
let orbitalLabels = [];

/**
 * Creates a sprite label for orbital shells
 * @param {string} text - Label text
 * @returns {THREE.Sprite} The label sprite
 */
function makeLabelSprite(text) {
  const size = 256; // increased for better visibility
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0,0,size,size);
  ctx.fillStyle = '#ffffff'; // white text for visibility
  ctx.font = '96px sans-serif'; // larger font
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, size/2, size/2 + 16);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  return new THREE.Sprite(mat);
}

/**
 * Adds orbital labels to the electron group
 * @param {THREE.Group} electronGroup - The electron group
 */
function addOrbitalLabels(electronGroup) {
  orbitalLabels.forEach(l => { atomGroup.remove(l); if (l.material.map) l.material.map.dispose(); l.material.dispose(); });
  orbitalLabels = [];
  electronGroup.children.forEach((ring, i) => {
    const lbl = makeLabelSprite(['K','L','M','N','O'][i] || `S${i+1}`);
    lbl.scale.set(1.2, 1.2, 1);
    lbl.position.set(0, 0.9 + i * 0.1, shellRadii[i]);
    atomGroup.add(lbl);
    orbitalLabels.push(lbl);
  });
}

// --- Nucleus repacking (simple relaxation) ---
/**
 * Repacks the nucleus particles using relaxation algorithm
 * @param {number} iter - Number of iterations
 */
function repackNucleus(iter = 120) {
  const nucleus = atomGroup.userData.nucleus;
  console.log('repackNucleus called, nucleus:', nucleus);
  if (!nucleus) {
    console.log('No nucleus found');
    return;
  }
  const nodes = nucleus.children;
  const n = nodes.length;
  console.log('Repacking', n, 'nodes');
  
  // convert to array of positions
  const pos = nodes.map(c => c.position.clone());
  const radius = 1.2;
  
  for (let it = 0; it < iter; it++) {
    for (let i = 0; i < n; i++) {
      let p = pos[i];
      const disp = new THREE.Vector3();
      for (let j = 0; j < n; j++) if (i !== j) {
        const d = new THREE.Vector3().subVectors(p, pos[j]);
        const dist = d.length() + 1e-6;
        const minDist = 0.35;
        if (dist < minDist) {
          d.normalize().multiplyScalar((minDist - dist) * 0.02);
          disp.add(d);
        }
      }
      const toCenter = p.clone().multiplyScalar(-0.01);
      disp.add(toCenter);
      p.add(disp);
      if (p.length() > radius) p.setLength(radius * (0.85 + Math.random() * 0.15));
      pos[i] = p;
    }
  }
  
  // write back
  for (let i = 0; i < n; i++) nodes[i].position.copy(pos[i]);
  console.log('Nucleus repacked');
}

// UI wiring
const atomicNumber = document.getElementById('atomicNumber');
const atomicVal = document.getElementById('atomicVal');
const buildBtn = document.getElementById('buildBtn');
const preset = document.getElementById('preset');
const cloudToggle = document.getElementById('cloudToggle');
const labelToggle = document.getElementById('labelToggle');
const repackBtn = document.getElementById('repackBtn');

// Event listeners
atomicNumber.addEventListener('input', () => atomicVal.textContent = atomicNumber.value);
preset.addEventListener('change', () => { atomicNumber.value = preset.value; atomicVal.textContent = preset.value; });
buildBtn.addEventListener('click', () => {
  const z = parseInt(atomicNumber.value, 10);
  console.log('Build button clicked for Z:', z);
  buildAtom(z);
});

cloudToggle.addEventListener('change', () => {
  const z = parseInt(atomicNumber.value, 10);
  toggleCloud(cloudToggle.checked, z);
});

labelToggle.addEventListener('change', () => {
  const eg = atomGroup.userData?.electronGroup;
  if (!eg) return;
  if (labelToggle.checked) addOrbitalLabels(eg);
  else {
    orbitalLabels.forEach(l => { atomGroup.remove(l); if (l.material.map) l.material.map.dispose(); l.material.dispose(); });
    orbitalLabels = [];
  }
});

repackBtn.addEventListener('click', () => {
  console.log('Repack button clicked');
  repackNucleus(200);
});

// Initial build
buildAtom(parseInt(atomicNumber.value, 10));

// Animation loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  controls.update();
  const eg = atomGroup.userData?.electronGroup;
  if (eg) {
    eg.children.forEach((ring, idx) => {
      ring.children.forEach(child => {
        if (child.userData && child.userData.radius) {
          const u = child.userData;
          u.phase += u.speed * dt * 0.7;
          child.position.set(Math.cos(u.phase) * u.radius, Math.sin(u.phase * 0.4 + idx) * 0.05, Math.sin(u.phase) * u.radius);
        }
      });
      // slowly rotate orbit rings for variety
      ring.rotation.y += 0.05 * dt * (idx + 1);
    });
  }
  renderer.render(scene, camera);
}
animate();
