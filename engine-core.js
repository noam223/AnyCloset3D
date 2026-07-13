// ==========================================
// 2. הגדרת סצנה (Three.js) ומנוע הרינדור
// ==========================================
const container = document.getElementById('canvas-container');
const dimLayer = document.getElementById('dimensions-layer');
const buttonsLayer = document.getElementById('buttons-layer');
const dragLayer = document.getElementById('drag-handles-layer');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeceff1);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 20000); 
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // softer shadow edges
container.appendChild(renderer.domElement);
window.renderer = renderer;
window.camera = camera;
window.scene = scene;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2;
window.controls = controls;

// Track whether user has manually orbited (so we don't reset camera on every rebuild)
window._orbitFree = false;
controls.addEventListener('change', () => {
    if (state.viewMode === '3d') {
        window._orbitFree = true;
        const btn = document.getElementById('btn-reset-view');
        if (btn) btn.style.display = 'inline-flex';
    }
});

const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.20);
dirLight.position.set(120, 510, 600);
dirLight.castShadow = true;
// Expand shadow camera to cover the full room (500cm deep, 600cm wide)
dirLight.shadow.camera.left   = -400;
dirLight.shadow.camera.right  =  400;
dirLight.shadow.camera.top    =  400;
dirLight.shadow.camera.bottom = -100;
dirLight.shadow.camera.near   =   10;
dirLight.shadow.camera.far    = 1200;
dirLight.shadow.mapSize.width  = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.bias = -0.005;
dirLight.shadow.normalBias = 8.5;
scene.add(dirLight);

// ---- HDR Environment Map — applied ONLY to aluminum profile material ----
// Stored in window._hdrEnvMap; assigned explicitly to profileMat in buildSlidingDoorCabinet.
window._hdrEnvMap = null;
window._hdrRawTexture = null;   // raw equirectangular texture kept alive for rotation
window._hdrPmremGen = null;
window._hdrRotation = 0.385;   // rotation offset 0..1
window._hdrScale = 0.30;       // repeat scale: >1 = zoom in (magnify), <1 = zoom out (wider)
window._hdrIntensity = {        // per-material-type intensity overrides (null = use hardcoded default)
    profile: 2.05,
    mirror: 2.30,
    glass: 0.35



    
};

// Rotate + scale equirectangular HDR via an offscreen render at full source resolution
// offsetU: 0..1 horizontal rotation; scale: >1 = zoom in (magnify), <1 = zoom out (wider)
window._rotateEquirect = function(srcTex, offsetU, scale) {
    const sc = (scale && scale > 0) ? scale : 1.0;
    const img = srcTex.image;
    const w = (img && img.width)  ? img.width  : 4096;
    const h = (img && img.height) ? img.height : 2048;
    const rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
        depthBuffer: false,
        stencilBuffer: false
    });
    const scene2 = new THREE.Scene();
    const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo2 = new THREE.PlaneGeometry(2, 2);
    // Temporarily set wrap modes so the shader can sample across seams
    const prevWrapS = srcTex.wrapS;
    const prevWrapT = srcTex.wrapT;
    srcTex.wrapS = THREE.RepeatWrapping;
    srcTex.wrapT = THREE.RepeatWrapping;
    srcTex.needsUpdate = true;
    const mat2 = new THREE.ShaderMaterial({
        uniforms: { map: { value: srcTex }, offsetU: { value: offsetU }, scale: { value: sc } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position,1.0); }`,
        // scale > 1 zooms in: sample a smaller region centered at (0.5, 0.5)
        fragmentShader: `uniform sampler2D map; uniform float offsetU; uniform float scale; varying vec2 vUv;
            void main(){
                vec2 centered = (vUv - 0.5) / scale + 0.5;
                vec2 uv = vec2(fract(centered.x + offsetU), clamp(centered.y, 0.0, 1.0));
                gl_FragColor = texture2D(map, uv);
            }`
    });
    scene2.add(new THREE.Mesh(geo2, mat2));
    renderer.setRenderTarget(rt);
    renderer.render(scene2, cam2);
    renderer.setRenderTarget(null);
    srcTex.wrapS = prevWrapS;
    srcTex.wrapT = prevWrapT;
    mat2.dispose(); geo2.dispose();
    return rt.texture;
};

// Re-generate env maps with rotated + scaled source texture:
//   _hdrEnvMap        = PMREM cubemap  (for glass/mirror — roughness-aware)
//   _hdrEnvMapSharp   = equirect map   (for profile metal — full resolution)
window._rebuildHdrEnvMap = function() {
    if (!window._hdrRawTexture || !window._hdrPmremGen) return;
    const rotOffset = window._hdrRotation || 0;
    const scale = window._hdrScale || 1.0;

    // Build rotated+scaled equirect texture (full resolution, for profile/mirror/glass)
    const rotated = window._rotateEquirect(window._hdrRawTexture, rotOffset, scale);
    rotated.mapping = THREE.EquirectangularReflectionMapping;
    rotated.encoding = THREE.sRGBEncoding;
    window._hdrEnvMapSharp = rotated;

    // Build PMREM from same rotated texture (for glass/mirror)
    const envMap = window._hdrPmremGen.fromEquirectangular(rotated).texture;
    window._hdrEnvMap = envMap;

    if (typeof buildCabinet === 'function') buildCabinet();
};

(function _loadHDREnv() {
    const pmremGen = new THREE.PMREMGenerator(renderer);
    pmremGen.compileEquirectangularShader();
    window._hdrPmremGen = pmremGen;
    new THREE.TextureLoader()
        .load('images/hdri.jpg', function(hdrTexture) {
            hdrTexture.encoding = THREE.sRGBEncoding;
            window._hdrRawTexture = hdrTexture; // keep alive for rotation re-generation
            window._rebuildHdrEnvMap();         // apply initial rotation
        });
})();

// ---- Room group (floor + walls) — rebuilt in _buildRoom() on each buildCabinet call ----
window._roomGroup = new THREE.Group();
scene.add(window._roomGroup);
// Proxy so legacy floor.visible = true/false controls the room group visibility
const floor = new Proxy({}, {
    set(obj, prop, val) {
        obj[prop] = val;
        if (prop === 'visible' && window._roomGroup) window._roomGroup.visible = val;
        return true;
    }
});

// ---- Room visibility toggle ----
window._roomVisible = false;
window._toggleRoom = function() {
    if (typeof window._toggleRoomPlanMode === 'function' && document.getElementById('btn-room-plan')) {
        window._toggleRoomPlanMode();
        return;
    }
    window._roomVisible = !window._roomVisible;
    // _buildRoom respects the _roomVisible flag: clears children and returns when false
    if (typeof _buildRoom === 'function') _buildRoom();
    const btn = document.getElementById('btn-toggle-room') || document.getElementById('btn-room-plan');
    if (btn) {
        btn.innerHTML = window._roomVisible
            ? '<i class="fa-solid fa-house"></i> הסתר חדר'
            : '<i class="fa-solid fa-house"></i> הצג חדר';
        btn.classList.toggle('toggled-off', !window._roomVisible);
    }
    // Show/hide room wall selector based on room visibility
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();
    // Show/hide bed handles based on room visibility
    if (typeof window._updateBedHandles === 'function') window._updateBedHandles();
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
};

// ---- Doors visibility toggle ----
window._doorsVisible = true;
window._toggleDoors = function() {
    window._doorsVisible = !window._doorsVisible;
    doorMeshes.forEach(function(m) { m.visible = window._doorsVisible; });
    const btn = document.getElementById('btn-toggle-doors');
    if (btn) {
        btn.innerHTML = window._doorsVisible
            ? '<i class="fa-solid fa-door-closed"></i> הסתר חזיתות'
            : '<i class="fa-solid fa-door-open"></i> הצג חזיתות';
        btn.classList.toggle('toggled-off', !window._doorsVisible);
    }
};

// Load room textures once
window._woodFloorTex = null;
window._wallTex = null;
window._brickWallTex = null;
(function() {
    const tl = new THREE.TextureLoader();
    tl.load('images/wood-floor.jpg', function(t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.encoding = THREE.sRGBEncoding;
        window._woodFloorTex = t;
        if (typeof buildCabinet === 'function') buildCabinet();
    });
    tl.load('images/wall.jpg', function(t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.encoding = THREE.sRGBEncoding;
        window._wallTex = t;
        if (typeof buildCabinet === 'function') buildCabinet();
    });
    tl.load('images/brick-wall.jpg', function(t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.encoding = THREE.sRGBEncoding;
        window._brickWallTex = t;
        if (typeof buildCabinet === 'function') buildCabinet();
    });
})();

// ---- Bed GLB model ----
// ── Bed GLB ──────────────────────────────────────────────────────────────────
// Loaded once; re-added to _roomGroup each time _buildRoom() runs.
// Position is stored in window._bedPos {x, z} in cm (world space).
window._bedGroup     = null;
window._bedPos       = window._bedPos      || { x: 150, z: 222.6 };  // default position (cm)
window._bedScale     = window._bedScale    || null;                    // null = auto-scale to ~200cm long
window._bedAutoScale = null;                                           // computed once after load
window._bedRotation  = window._bedRotation || 270;                    // default rotation in degrees
window._bedWidthCm   = window._bedWidthCm  || 160;                    // bed width preset (cm)
window._bedVisible   = window._bedVisible  !== false;                 // show/hide bed in room view
window._BED_WIDTHS   = [160, 140, 120, 90];

// ── Nightstand (שידה) — optional room furniture ─────────────────────────────
window._nightstandVisible  = window._nightstandVisible  || false;
window._nightstandPos      = window._nightstandPos      || { x: 60, z: 280 };
window._nightstandRotation = window._nightstandRotation || 0;
window._NIGHTSTAND_W       = 50;
window._NIGHTSTAND_D       = 40;
window._NIGHTSTAND_H       = 55;

// ── Standalone work desk (שולחן עבודה) — optional room furniture ────────────
window._roomDeskVisible    = window._roomDeskVisible    || false;
window._roomDeskPos        = window._roomDeskPos        || { x: 130, z: 130 };
window._roomDeskRotation   = window._roomDeskRotation   || 0;
window._ROOM_DESK_W        = 120;
window._ROOM_DESK_D        = 60;
window._ROOM_DESK_H        = 75;

// ── Custom room items (user-added boxes) ─────────────────────────────────────
window._customRoomItems    = window._customRoomItems    || [];
window._customRoomItemSeq  = window._customRoomItemSeq  || 0;
window._CUSTOM_ITEM_COLORS = [0xdce4ef, 0xe8e0f0, 0xe0f0e8, 0xf0e8dc, 0xe4ecf4];

window._addCustomRoomItem = function(opts) {
    opts = opts || {};
    const b = window._roomBounds;
    const name = String(opts.name || 'פריט').trim() || 'פריט';
    const w = Math.max(10, Math.min(400, parseInt(opts.w, 10) || 80));
    const d = Math.max(10, Math.min(400, parseInt(opts.d, 10) || 60));
    const h = Math.max(10, Math.min(300, parseInt(opts.h, 10) || 75));
    window._customRoomItemSeq = (window._customRoomItemSeq || 0) + 1;
    const id = 'custom-' + window._customRoomItemSeq;
    const colors = window._CUSTOM_ITEM_COLORS || [0xdce4ef];
    const color = colors[(window._customRoomItemSeq - 1) % colors.length];
    let cx = b ? (b.leftX + b.rightX) / 2 : 250;
    let cz = b ? (b.backZ + b.frontZ) / 2 : 250;
    if (b) {
        cx = Math.max(b.leftX + w / 2, Math.min(b.rightX - w / 2, cx));
        cz = Math.max(b.backZ + d / 2, Math.min(b.frontZ - d / 2, cz));
    }
    window._customRoomItems.push({
        id: id, name: name, w: w, d: d, h: h,
        x: cx, z: cz, rotation: 0, color: color
    });
    if (typeof window._closeCustomRoomItemModal === 'function') {
        window._closeCustomRoomItemModal();
    }
    if (typeof window._roomPlanFurnitureChanged === 'function') {
        window._roomPlanFurnitureChanged();
    } else if (typeof _buildRoom === 'function') {
        _buildRoom();
    }
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
};

// ── Office Chair GLB ─────────────────────────────────────────────────────────
window._CHAIR_OPTIONS = [
    { id: 'chair1', path: 'images/office_chair.glb',  shortName: 'משרדי',  targetHeightCm: 120 },
    { id: 'chair2', path: 'images/office_chair2.glb', shortName: 'שרפרף', targetHeightCm: 50 }
];
window._chairVariantIdx = window._chairVariantIdx || 0;
window._chairModels     = {};   // id → { group, autoScale }
window._chairGroup      = null; // active variant (backward compat)
window._chairAutoScale  = null;
window._chairVisible    = window._chairVisible !== false;
window._chairMesh       = null;

function _prepareChairGroup(grp, targetH) {
    grp.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(function(mat) {
                    if (mat.transparent && mat.opacity < 0.95) {
                        mat.transparent = false;
                        mat.opacity = 1;
                    }
                });
            }
        }
    });
    const box = new THREE.Box3().setFromObject(grp);
    const size = new THREE.Vector3();
    box.getSize(size);
    const h = targetH || 120;
    const autoScale = size.y > 0 ? h / size.y : 100;
    return { group: grp, autoScale: autoScale };
}

function _getActiveChairModel() {
    const opt = window._CHAIR_OPTIONS[window._chairVariantIdx || 0];
    return opt ? window._chairModels[opt.id] : null;
}

function _isStoolVariant() {
    const opt = window._CHAIR_OPTIONS[window._chairVariantIdx || 0];
    return opt && opt.id === 'chair2';
}

function _syncActiveChairRefs() {
    const m = _getActiveChairModel();
    window._chairGroup = m ? m.group : null;
    window._chairAutoScale = m ? m.autoScale : null;
}

window._cycleChairVariant = function() {
    const n = window._CHAIR_OPTIONS.length;
    if (n <= 1) return;
    window._chairVariantIdx = ((window._chairVariantIdx || 0) + 1) % n;
    _syncActiveChairRefs();
    if (typeof window._roomPlanFurnitureChanged === 'function') {
        window._roomPlanFurnitureChanged();
    } else {
        if (typeof _buildRoom === 'function') _buildRoom();
    }
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
};

(function _loadChairs() {
    if (typeof THREE.GLTFLoader === 'undefined') { setTimeout(_loadChairs, 200); return; }
    const loader = new THREE.GLTFLoader();
    let pending = window._CHAIR_OPTIONS.length;

    window._CHAIR_OPTIONS.forEach(function(opt, idx) {
        loader.load(opt.path, function(gltf) {
            window._chairModels[opt.id] = _prepareChairGroup(gltf.scene, opt.targetHeightCm);
            pending--;
            const activeOpt = window._CHAIR_OPTIONS[window._chairVariantIdx || 0];
            if (activeOpt && activeOpt.id === opt.id) _syncActiveChairRefs();
            if (pending === 0 && window._roomVisible && typeof _buildRoom === 'function') _buildRoom();
        }, undefined, function(err) {
            console.warn(opt.path + ' load error:', err);
            pending--;
        });
    });
})();

// ── Laptop GLB ───────────────────────────────────────────────────────────────
// Loaded once; placed on top of the desk surface when room is shown.
window._laptopGroup     = null;
window._laptopAutoScale = null;
window._laptopYOffset   = window._laptopYOffset !== undefined ? window._laptopYOffset : -5;  // manual Y correction (cm): -5 snaps laptop to desk surface
window._laptopMeshRef   = null;  // live reference to the placed laptop clone for real-time Y updates
window._laptopBaseY     = 0;     // Y position before offset is applied (set each _buildRoom call)

(function _loadLaptop() {
    if (typeof THREE.GLTFLoader === 'undefined') { setTimeout(_loadLaptop, 200); return; }
    const loader = new THREE.GLTFLoader();
    loader.load('images/laptop.glb', function(gltf) {
        const grp = gltf.scene;

        grp.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(function(mat) {
                        // Fix transparent materials
                        if (mat.transparent && mat.opacity < 0.95) {
                            mat.transparent = false;
                            mat.opacity = 1;
                        }
                        // The GLB uses a single shared material with metalness=1, roughness=1
                        // which appears black. Override to aluminum: silver color, low roughness.
                        // Keep existing maps (color map, normal map, roughness map) intact.
                        mat.color.setHex(0xf0f0f0);   // light silver-gray base color
                        mat.metalness = 0.55;
                        mat.roughness = 0.18;
                        mat.emissive.setHex(0x000000); // remove emissive glow from body
                        mat.emissiveIntensity = 0;
                        if (window._hdrEnvMap) { mat.envMap = window._hdrEnvMap; }
                        mat.envMapIntensity = 1.0;
                        mat.needsUpdate = true;
                    });
                }
            }
        });

        // Scale by width: target 35cm (typical laptop width)
        const box = new THREE.Box3().setFromObject(grp);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxHoriz = Math.max(size.x, size.z);
        window._laptopAutoScale = maxHoriz > 0 ? 35 / maxHoriz : 1;
        window._laptopGroup = grp;
        if (window._roomVisible && typeof _buildRoom === 'function') _buildRoom();
    }, undefined, function(err) { console.warn('laptop.glb load error:', err); });
})();

// Returns active corner-desk config (linear state.corner or wing.corner), or null.
function _getActiveCornerDesk() {
    if (state.corner && state.corner.side !== 'none' && state.corner.type === 'desk') return state.corner;
    const wing = state.wings && state.wings.center;
    if (wing && wing.corner && wing.corner.side !== 'none' && wing.corner.type === 'desk') return wing.corner;
    return null;
}

// World-space placement for corner desk surface (matches buildCornerUnit geometry).
function _getCornerDeskPlacement() {
    const corner = _getActiveCornerDesk();
    if (!corner) return null;
    const cabOffX = cabinetGroup.position.x || 0;
    const wing = state.wings && state.wings.center;
    const mainW = (wing && wing.width) || state.width || 160;
    const bodyD = (wing && wing.depth) || state.depth || 54;
    const sign = corner.side === 'right' ? 1 : -1;
    const cuW = corner.width || 60;
    const cuD = corner.depth || bodyD;
    const deskH = corner.height || 75;
    const cuCenterX = sign * (mainW / 2 - cuD / 2);
    const cuCenterZ = bodyD / 2 + cuW / 2;
    return { cabOffX, cuCenterX, cuCenterZ, deskH, sign, cuW, cuD };
}

/** Cabinet display height when columns may be empty (e.g. writing desk). */
function _wingCabinetHeight(wing, fallback) {
    if (!wing) return fallback != null ? fallback : 240;
    if (wing.columns && wing.columns.length > 0) {
        const maxH = Math.max(...wing.columns.map(c => c.height || 0));
        if (Number.isFinite(maxH) && maxH > 0) return maxH;
    }
    if (wing.writingDesk && wing.writingDesk.height != null) return wing.writingDesk.height;
    if (wing.globalHeight != null) return wing.globalHeight;
    return fallback != null ? fallback : 240;
}

// Returns {x, y, z} for laptop placement on desk surface, or null if no desk.
function _getLaptopPos() {
    const cabOffX = cabinetGroup.position.x || 0;
    const laptopZ = 0;

    const _clampX = (x) => {
        const b = window._roomBounds;
        if (!b) return x;
        return Math.max(b.leftX + 20, Math.min(b.rightX - 20, x));
    };

    const wing = state.wings && state.wings.center;

    // 0. Standalone writing desk
    if (state.presetId === 'writing-desk' && wing) {
        const wd = wing.writingDesk || {};
        const deskH = wd.height != null ? wd.height : 75;
        return { x: _clampX(cabOffX), y: deskH, z: laptopZ };
    }

    // 1. Side desk
    if (wing && wing.desk && wing.desk.side !== 'none') {
        const dSide  = wing.desk.side;
        const dW     = wing.desk.width || 100;
        const cabW   = wing.width || state.width || 160;
        const deskH  = wing.desk.height || state.desk && state.desk.height || 75;
        const rawX   = dSide === 'right'
            ? cabOffX + cabW / 2 + dW / 2
            : cabOffX - cabW / 2 - dW / 2;
        return { x: _clampX(rawX), y: deskH, z: laptopZ };
    }

    // 2. Internal desk column
    const cols = wing ? wing.columns : (state.columns || []);
    if (cols && cols.length) {
        let currentX = cabOffX - (wing ? wing.width : (state.width || 160)) / 2;
        for (let i = 0; i < cols.length; i++) {
            const col = cols[i];
            if (col.type === 'desk') {
                const colCenterX = currentX + col.width / 2;
                const deskH = col.deskHeight || 75;
                return { x: _clampX(colCenterX), y: deskH, z: laptopZ };
            }
            currentX += col.width;
        }
    }

    // 3. Corner desk — rotate so screen faces the user (same side as chair)
    const cp = _getCornerDeskPlacement();
    if (cp) {
        return {
            x: _clampX(cp.cabOffX + cp.cuCenterX),
            y: cp.deskH,
            z: cp.cuCenterZ,
            rotY: cp.sign === -1 ? Math.PI / 2 : -Math.PI / 2
        };
    }

    return null;
}

// Compute where to place the chair (world-space X, Z, rotY) based on current desk config.
// Returns {x, z, rotY, deskFrontZ?, deskPlaneX?, corner?} or null if no desk is present.
function _getChairPos() {
    if (window._chairPosOverride) {
        const o = window._chairPosOverride;
        return {
            x: o.x,
            z: o.z,
            rotY: o.rotY !== undefined ? o.rotY : -Math.PI / 2,
            deskFrontZ: o.deskFrontZ
        };
    }
    const cabD = state.wings && state.wings.center ? (state.wings.center.depth || 54) : (state.depth || 54);
    const cabOffX = cabinetGroup.position.x || 0;
    const isStool = _isStoolVariant();
    const chairZ = isStool ? cabD / 2 : cabD / 2 + 33;
    const deskFrontZ = cabD / 2;

    const _clampX = (x) => {
        const b = window._roomBounds;
        if (!b) return x;
        return Math.max(b.leftX + 40, Math.min(b.rightX - 40, x));
    };

    // 1. Side desk (wing.desk.side !== 'none')
    const wing = state.wings && state.wings.center;

    // 0. Standalone writing desk
    if (state.presetId === 'writing-desk' && wing) {
        return { x: _clampX(cabOffX), z: chairZ, rotY: -Math.PI / 2, deskFrontZ: deskFrontZ };
    }

    if (wing && wing.desk && wing.desk.side !== 'none') {
        const dSide = wing.desk.side;
        const dW    = wing.desk.width || 100;
        const cabW  = wing.width || state.width || 160;
        const rawX  = dSide === 'right'
            ? cabOffX + cabW / 2 + dW / 2
            : cabOffX - cabW / 2 - dW / 2;
        return { x: _clampX(rawX), z: chairZ, rotY: -Math.PI / 2, deskFrontZ: deskFrontZ };
    }

    // 2. Internal desk column
    const cols = wing ? wing.columns : (state.columns || []);
    if (cols && cols.length) {
        let currentX = cabOffX - (wing ? wing.width : (state.width || 160)) / 2;
        for (let i = 0; i < cols.length; i++) {
            const col = cols[i];
            if (col.type === 'desk') {
                const colCenterX = currentX + col.width / 2;
                return { x: _clampX(colCenterX), z: chairZ, rotY: -Math.PI / 2, deskFrontZ: deskFrontZ };
            }
            currentX += col.width;
        }
    }

    // 3. Corner desk — sit beside desk, face opening + laptop
    const cp = _getCornerDeskPlacement();
    if (cp) {
        const chairOffset = isStool ? 21 : 42;
        const rawX = cp.cabOffX + cp.cuCenterX + (-cp.sign) * chairOffset;
        const rotY = cp.sign === -1 ? 0 : Math.PI;
        return {
            x: _clampX(rawX),
            z: cp.cuCenterZ,
            rotY: rotY,
            corner: true,
            deskCenterZ: cp.cuCenterZ,
            deskPlaneX: cp.cabOffX + cp.cuCenterX + (-cp.sign) * (cp.cuD / 2)
        };
    }

    return null;
}

// Stool: align bbox center on desk front plane so half is under desk, half outside.
function _alignStoolHalfUnderDesk(chair, cp) {
    if (!_isStoolVariant() || !cp) return;
    chair.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(chair);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    if (cp.corner) {
        if (cp.deskCenterZ != null) chair.position.z += cp.deskCenterZ - cz;
        if (cp.deskPlaneX != null) {
            chair.updateMatrixWorld(true);
            const box2 = new THREE.Box3().setFromObject(chair);
            const cx2 = (box2.min.x + box2.max.x) / 2;
            chair.position.x += cp.deskPlaneX - cx2;
        }
    } else if (cp.deskFrontZ != null) {
        chair.position.z += cp.deskFrontZ - cz;
    }
}

// Snap any bed edge that is near a room wall flush to that wall (persists through width changes).
const _BED_WALL_SNAP = 35; // cm — edge within this distance is treated as "at wall"

function _snapBedNearWalls(bed, bp) {
    const b = window._roomBounds;
    if (!b || !bed || !bp) return;

    bed.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(bed);
    let moved = false;

    if (Math.abs(box.max.x - b.rightX) < _BED_WALL_SNAP) {
        bed.position.x += b.rightX - box.max.x;
        moved = true;
    } else if (Math.abs(box.min.x - b.leftX) < _BED_WALL_SNAP) {
        bed.position.x += b.leftX - box.min.x;
        moved = true;
    }

    if (moved) {
        bed.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(bed);
    }

    if (Math.abs(box.max.z - b.frontZ) < _BED_WALL_SNAP) {
        bed.position.z += b.frontZ - box.max.z;
        moved = true;
    } else if (Math.abs(box.min.z - b.backZ) < _BED_WALL_SNAP) {
        bed.position.z += b.backZ - box.min.z;
        moved = true;
    }

    if (moved) {
        box = new THREE.Box3().setFromObject(bed);
        const c = new THREE.Vector3();
        box.getCenter(c);
        bp.x = c.x;
        bp.z = c.z;
        window._bedPos = bp;
    }
}

window._getBedClampHalfExtents = function() {
    if (window._bedMesh) {
        const box = new THREE.Box3().setFromObject(window._bedMesh);
        return {
            halfX: (box.max.x - box.min.x) / 2,
            halfZ: (box.max.z - box.min.z) / 2
        };
    }
    return { halfX: 100, halfZ: 100 };
};

window._cycleBedWidth = function() {
    const opts = window._BED_WIDTHS || [160, 140, 120, 90];
    const cur = window._bedWidthCm || 160;
    const i = opts.indexOf(cur);
    window._bedWidthCm = opts[(i + 1) % opts.length];
    if (typeof window._roomPlanFurnitureChanged === 'function') {
        window._roomPlanFurnitureChanged();
    } else {
        if (typeof _buildRoom === 'function') _buildRoom();
    }
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
    if (typeof window._updateBedHandles === 'function') window._updateBedHandles();
};

window._toggleBedVisible = function() {
    window._bedVisible = !window._bedVisible;
    if (typeof window._roomPlanFurnitureChanged === 'function') {
        window._roomPlanFurnitureChanged();
    } else {
        if (typeof _buildRoom === 'function') _buildRoom();
    }
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
    if (typeof window._updateBedHandles === 'function') window._updateBedHandles();
};

window._toggleChairVisible = function() {
    window._chairVisible = !window._chairVisible;
    if (typeof window._roomPlanFurnitureChanged === 'function') {
        window._roomPlanFurnitureChanged();
    } else {
        if (typeof _buildRoom === 'function') _buildRoom();
    }
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
};

window._toggleNightstandVisible = function() {
    window._nightstandVisible = !window._nightstandVisible;
    if (typeof window._roomPlanFurnitureChanged === 'function') {
        window._roomPlanFurnitureChanged();
    } else if (typeof _buildRoom === 'function') {
        _buildRoom();
    }
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
};

window._toggleRoomDeskVisible = function() {
    window._roomDeskVisible = !window._roomDeskVisible;
    if (typeof window._roomPlanFurnitureChanged === 'function') {
        window._roomPlanFurnitureChanged();
    } else if (typeof _buildRoom === 'function') {
        _buildRoom();
    }
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
};

function _placeRoomBoxFurniture(rg, cx, cz, w, d, h, rotDeg, color, propId) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: color || 0xd4c4a8, roughness: 0.88, metalness: 0.02 })
    );
    mesh.rotation.y = ((rotDeg || 0) * Math.PI) / 180;
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.roomProp = propId;
    rg.add(mesh);
    return mesh;
}

window._updateRoomPropsUI = function() {
    const _syncToggleBtn = (id, show, hideLabel, showLabel, icon) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.toggle('active', show);
        btn.innerHTML = show
            ? '<i class="fa-solid fa-' + icon + '"></i><span>' + hideLabel + '</span>'
            : '<i class="fa-solid fa-' + icon + '"></i><span>' + showLabel + '</span>';
    };
    const bedShow = window._bedVisible !== false;
    const chairShow = window._chairVisible !== false;
    _syncToggleBtn('room-btn-toggle-bed', bedShow, 'הסתר מיטה', 'הצג מיטה', 'bed');
    _syncToggleBtn('room-btn-toggle-chair', chairShow, 'הסתר כסא', 'הצג כסא', 'chair');
    _syncToggleBtn('room-btn-toggle-nightstand', !!window._nightstandVisible, 'הסתר שידה', 'הוסף שידה', 'table-cells');
    _syncToggleBtn('room-btn-toggle-room-desk', !!window._roomDeskVisible, 'הסתר שולחן', 'הוסף שולחן', 'desktop');

    const chairVarLbl = document.getElementById('room-chair-variant-label');
    if (chairVarLbl) {
        const opt = window._CHAIR_OPTIONS[window._chairVariantIdx || 0];
        chairVarLbl.textContent = opt ? opt.shortName : 'משרדי';
    }

    const widthLbl = document.getElementById('bed-width-label');
    if (widthLbl) widthLbl.textContent = (window._bedWidthCm || 160) + ' ס"מ';
    const tbWidth = document.getElementById('bed-tb-width-label');
    if (tbWidth) tbWidth.textContent = (window._bedWidthCm || 160);

    const propsRow = document.getElementById('room-props-row');
    if (propsRow) propsRow.style.display = (window._roomVisible || state.viewMode === 'room-plan') ? '' : 'none';
    const furnBar = document.getElementById('room-furniture-toolbar');
    if (furnBar) furnBar.style.display = (window._roomVisible || state.viewMode === 'room-plan') ? '' : 'none';
};

// Rotate bed 90° clockwise on each call
window._rotateBed = function() {
    window._bedRotation = (window._bedRotation + 90) % 360;
    if (typeof window._roomPlanFurnitureChanged === 'function') {
        window._roomPlanFurnitureChanged();
    } else {
        if (typeof _buildRoom === 'function') _buildRoom();
    }
    if (typeof window._updateBedHandles === 'function') window._updateBedHandles();
};
(function _loadBed() {
    if (typeof THREE.GLTFLoader === 'undefined') {
        // GLTFLoader not yet available — retry after a short delay
        setTimeout(_loadBed, 200);
        return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load('images/bed.glb', function(gltf) {
        const grp = gltf.scene;
        grp.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow    = true;
                child.receiveShadow = true;
            }
        });

        // Auto-compute scale: measure bounding box of the raw model,
        // then scale so the longest horizontal dimension = 200cm (a typical bed length).
        const box = new THREE.Box3().setFromObject(grp);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.z); // longest horizontal dimension
        console.log('[bed.glb] raw size:', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3));
        if (maxDim > 0) {
            const targetCm = 200;
            window._bedAutoScale = targetCm / maxDim;
        } else {
            window._bedAutoScale = 100;
        }
        // Shorter horizontal axis = bed width (for width-only scaling)
        window._bedWidthAxis = size.x <= size.z ? 'x' : 'z';
        console.log('[bed.glb] autoScale:', window._bedAutoScale.toFixed(3));

        window._bedGroup = grp;
        // Trigger a room rebuild so the bed appears immediately if room is visible
        if (window._roomVisible && typeof _buildRoom === 'function') _buildRoom();
        if (typeof window._updateBedHandles === 'function') window._updateBedHandles();
    }, undefined, function(err) {
        console.warn('bed.glb load error:', err);
    });
})();

function _buildRoom() {
    const rg = window._roomGroup;
    while (rg.children.length > 0) rg.remove(rg.children[0]);
    if (state.viewMode === 'blueprint') return;
    // Skip rebuild during drag — room is hidden by buildCabinetDragging(), restored by _endDrag()
    if (window._isDragging) return;
    // Skip rebuild when room is toggled off by user
    if (window._roomVisible === false) return;
    // Hide room when in wing edit mode
    if (state.wingEditMode) { rg.visible = false; return; }
    rg.visible = true;

    const roomD = (window._roomDepth  && window._roomDepth  > 0) ? window._roomDepth  : 500;
    const roomH = (window._roomHeight && window._roomHeight > 0) ? window._roomHeight : 300;
    const wallT = 1;     // wall thickness (thin plane)

    // Cabinet dimensions
    const cw = state.wings && state.wings.center ? state.wings.center.width : (state.width || 160);
    const cabD = state.wings && state.wings.center ? (state.wings.center.depth || 54) : 54;

    // Room wall position (only for linear/sliding presets)
    const _preset = state.presetId || 'linear';
    const _isLinearOrSliding = (_preset === 'linear' || _preset === 'sliding');
    const _roomWall = _isLinearOrSliding ? (window._roomWall || state.roomWall || 'center') : 'center';

    const centerEdgeL = -cw / 2;  // left edge X of center cabinet
    const centerEdgeR =  cw / 2;  // right edge X of center cabinet

    // Side wing depths (used as the perpendicular dimension when wing is rotated 90°)
    const leftWingD  = (state.wings && state.wings.left  && state.wings.left.depth)  ? state.wings.left.depth  : 0;
    const rightWingD = (state.wings && state.wings.right && state.wings.right.depth) ? state.wings.right.depth : 0;
    const leftWingPos  = (state.wings && state.wings.left)  ? (state.wings.left.wingPosition  || 'side') : null;
    const rightWingPos = (state.wings && state.wings.right) ? (state.wings.right.wingPosition || 'side') : null;

    // Full-corner unit sizes (when wingPosition === 'full_corner')
    const leftFcSize  = (state.wings && state.wings.left  && state.wings.left.fullCorner)  ? (state.wings.left.fullCorner.size  || 100) : 0;
    const rightFcSize = (state.wings && state.wings.right && state.wings.right.fullCorner) ? (state.wings.right.fullCorner.size || 100) : 0;

    const preset = state.presetId || 'linear';
    const SIDE_MARGIN = 50; // free-side margin in cm
    const MIN_ROOM = 500;

    // ── Determine left/right wall X positions ──────────────────────────────
    // For corner/walkin: the wall on the wing side snaps to the wing's outer back face.
    // 'side' wing: outer back face = centerEdge ± wingDepth
    // 'full_corner' wing: outer back face = centerEdge ± fullCornerSize
    // For the free side (no wing): add SIDE_MARGIN.
    let leftWallX, rightWallX;

    // A wing "snaps" to the wall when it's in 'side', 'full_corner', or 'front' position
    // 'front' wings sit in front of the center cabinet (no side extension), so their outer X = center edge
    const hasLeftWing  = state.wings && state.wings.left  && (leftWingPos  === 'side' || leftWingPos  === 'full_corner' || leftWingPos  === 'front');
    const hasRightWing = state.wings && state.wings.right && (rightWingPos === 'side' || rightWingPos === 'full_corner' || rightWingPos === 'front');

    // Outer back face X of each wing (the face that touches the side wall)
    // For 'front' wings: no side extension — outer X = center cabinet edge
    const rightWingOuterX = hasRightWing
        ? (rightWingPos === 'full_corner' ? centerEdgeR + rightFcSize : rightWingPos === 'front' ? centerEdgeR : centerEdgeR + rightWingD)
        : null;
    const leftWingOuterX = hasLeftWing
        ? (leftWingPos === 'full_corner' ? -(Math.abs(centerEdgeL) + leftFcSize) : leftWingPos === 'front' ? centerEdgeL : -(Math.abs(centerEdgeL) + leftWingD))
        : null;

    if (preset === 'corner-right' && hasRightWing) {
        // Right wall snaps to right wing outer back face
        rightWallX = rightWingOuterX;
        leftWallX  = Math.min(centerEdgeL - SIDE_MARGIN, -MIN_ROOM / 2);
    } else if (preset === 'corner-left' && hasLeftWing) {
        // Left wall snaps to left wing outer back face
        leftWallX  = leftWingOuterX;
        rightWallX = Math.max(centerEdgeR + SIDE_MARGIN, MIN_ROOM / 2);
    } else if (preset === 'walkin') {
        // Both walls snap to their respective wing outer back faces
        rightWallX = hasRightWing ? rightWingOuterX : Math.max(centerEdgeR + SIDE_MARGIN, MIN_ROOM / 2);
        leftWallX  = hasLeftWing  ? leftWingOuterX  : Math.min(centerEdgeL - SIDE_MARGIN, -MIN_ROOM / 2);
    } else {
        // Linear / sliding: room size depends on wall-snap mode and custom room width
        const totalCabW = cw + leftWingD + rightWingD;
        // Custom room width overrides auto-calculation (when set by user)
        const _customRoomW = (window._roomWidth && window._roomWidth > 0) ? window._roomWidth : 0;
        // Closure panel widths (for wall offset when closure panels are active)
        const _closureOn = (window._closureEnabled !== false);
        const _clW  = (_roomWall !== 'center' && _closureOn) ? Math.max(1.8, parseFloat(window._closureWidth)      || 1.8) : 0;
        const _clWR = (_roomWall !== 'center' && _closureOn) ? Math.max(1.8, parseFloat(window._closureWidthRight) || 1.8) : 0;
        if (_roomWall === 'left') {
            // Left wall is at outer edge of left closure panel
            leftWallX  = -cw / 2 - _clW;
            rightWallX = _customRoomW > 0
                ? (leftWallX + _customRoomW)
                : Math.max(cw / 2 + SIDE_MARGIN * 2, MIN_ROOM / 2);
        } else if (_roomWall === 'right') {
            // Right wall is at outer edge of right closure panel
            rightWallX = cw / 2 + _clWR;
            leftWallX  = _customRoomW > 0
                ? (rightWallX - _customRoomW)
                : Math.min(-cw / 2 - SIDE_MARGIN * 2, -MIN_ROOM / 2);
        } else if (_roomWall === 'both') {
            // Both walls snap to outer edges of closure panels
            leftWallX  = -cw / 2 - _clW;
            rightWallX =  cw / 2 + _clWR;
        } else {
            // Center: use custom width if set, else auto
            const halfRoom = _customRoomW > 0
                ? _customRoomW / 2
                : Math.max(MIN_ROOM, totalCabW + 100) / 2;
            leftWallX  = -halfRoom;
            rightWallX =  halfRoom;
        }
    }

    const roomW = rightWallX - leftWallX;
    const roomCenterX = (leftWallX + rightWallX) / 2;

    // Back wall sits just behind the cabinet back face.
    // When niche is enabled, shift the room forward by niche depth so the cabinet
    // appears recessed into the niche (niche back wall aligns with cabinet back face).
    const _nicheD = (window._nicheEnabled && _isLinearOrSliding)
        ? Math.max(10, parseFloat(window._nicheDepth) || 30)
        : 0;
    const backZ = -(cabD / 2) - wallT / 2 + _nicheD;

    // Expose room bounds for bed collision clamping (in world-space cm)
    window._roomBounds = {
        leftX:  leftWallX,
        rightX: rightWallX,
        backZ:  backZ,
        frontZ: backZ + roomD
    };

    // ── Texture helper: skip textures during drag for performance ──────────
    const _skipTex = !!window._roomTexDragging;

    // ── Materials ──────────────────────────────────────────────────────────
    // Wall material — "cover" fit: texture height fills wall height, width overflows (centered)
    const makeWallMat = (wallW, wallH) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0xf0ede8, roughness: 0.9, metalness: 0.0, side: THREE.FrontSide });
        if (!_skipTex && window._wallTex) {
            const wt = window._wallTex.clone();
            wt.needsUpdate = true;
            const img = wt.image;
            const texAspect = (img && img.width && img.height) ? (img.width / img.height) : 2.0;
            const wallAspect = wallW / wallH;
            const repeatX = wallAspect / texAspect;
            wt.repeat.set(repeatX, 1);
            wt.offset.set((1 - repeatX) / 2, 0);
            mat.map = wt;
            mat.color.set(0xffffff);
        }
        return mat;
    };

    const makeBrickMat = (wallW, wallH) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0xc0a080, roughness: 0.95, metalness: 0.0, side: THREE.FrontSide });
        if (!_skipTex && window._brickWallTex) {
            const bt = window._brickWallTex.clone();
            bt.needsUpdate = true;
            const img = bt.image;
            const texAspect = (img && img.width && img.height) ? (img.width / img.height) : 1.5;
            const wallAspect = wallW / wallH;
            const repeatX = wallAspect / texAspect;
            bt.repeat.set(repeatX, 1);
            bt.offset.set((1 - repeatX) / 2, 0);
            mat.map = bt;
            mat.color.set(0xffffff);
        }
        return mat;
    };

    // ── Floor ──────────────────────────────────────────────────────────────
    const tileSizeCm = 200;
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xd4a96a, roughness: 0.8, metalness: 0.0 });
    if (!_skipTex && window._woodFloorTex) {
        const ft = window._woodFloorTex.clone();
        ft.needsUpdate = true;
        ft.repeat.set(roomW / tileSizeCm, roomD / tileSizeCm);
        floorMat.map = ft;
        floorMat.color.set(0xffffff);
    }
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(roomCenterX, 0, backZ + roomD / 2 - wallT);
    floorMesh.receiveShadow = true;
    floorMesh.userData.roomPart = 'floor';
    rg.add(floorMesh);

    // ── Niche floor (extends floor into the alcove) ────────────────────────
    // Added separately so it covers the niche area behind the main back wall.
    // Only rendered when niche is active; uses same floor material.
    if (window._nicheEnabled && _isLinearOrSliding) {
        const _nWf = Math.max(50, parseFloat(window._nicheWidth) || 200);
        const _nDf = Math.max(10, parseFloat(window._nicheDepth) || 30);
        // Niche is always centered on the cabinet (X=0), regardless of wall position
        const _nicheCXf = 0;

        const nicheFloorMat = new THREE.MeshStandardMaterial({ color: 0xd4a96a, roughness: 0.8, metalness: 0.0 });
        if (!_skipTex && window._woodFloorTex) {
            const nft = window._woodFloorTex.clone();
            nft.needsUpdate = true;
            nft.repeat.set(_nWf / tileSizeCm, _nDf / tileSizeCm);
            nicheFloorMat.map = nft;
            nicheFloorMat.color.set(0xffffff);
        }
        const nicheFloorMesh = new THREE.Mesh(new THREE.PlaneGeometry(_nWf, _nDf), nicheFloorMat);
        nicheFloorMesh.rotation.x = -Math.PI / 2;
        // Niche floor sits at Z range: from (backZ - _nDf) to backZ
        nicheFloorMesh.position.set(_nicheCXf, 0, backZ - _nDf / 2);
        nicheFloorMesh.receiveShadow = true;
        rg.add(nicheFloorMesh);
    }

    // ── Back wall ──────────────────────────────────────────────────────────
    // When niche is active, split the back wall into left + right segments around the niche opening.
    // Otherwise render a single full-width back wall.
    if (window._nicheEnabled && _isLinearOrSliding) {
        const _nW2 = Math.max(50, parseFloat(window._nicheWidth) || 200);
        // Niche is always centered on the cabinet (X=0), regardless of wall position
        const _nicheCX2 = 0;

        const nicheLeft  = _nicheCX2 - _nW2 / 2;  // X of left edge of niche opening
        const nicheRight = _nicheCX2 + _nW2 / 2;  // X of right edge of niche opening

        // Left segment: from leftWallX to nicheLeft
        const leftSegW = nicheLeft - leftWallX;
        if (leftSegW > 0.1) {
            const bwL = new THREE.Mesh(new THREE.PlaneGeometry(leftSegW, roomH), makeWallMat(leftSegW, roomH));
            bwL.position.set(leftWallX + leftSegW / 2, roomH / 2, backZ);
            rg.add(bwL);
        }
        // Right segment: from nicheRight to rightWallX
        const rightSegW = rightWallX - nicheRight;
        if (rightSegW > 0.1) {
            const bwR = new THREE.Mesh(new THREE.PlaneGeometry(rightSegW, roomH), makeWallMat(rightSegW, roomH));
            bwR.position.set(nicheRight + rightSegW / 2, roomH / 2, backZ);
            rg.add(bwR);
        }
    } else {
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), makeWallMat(roomW, roomH));
        backWall.position.set(roomCenterX, roomH / 2, backZ);
        rg.add(backWall);
    }

    // ── Left wall ──────────────────────────────────────────────────────────
    // Always brick texture
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), makeBrickMat(roomD, roomH));
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(leftWallX, roomH / 2, backZ + roomD / 2 - wallT);
    rg.add(leftWall);

    // ── Right wall ─────────────────────────────────────────────────────────
    // Always use wall.jpg (same texture as back wall)
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), makeWallMat(roomD, roomH));
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(rightWallX, roomH / 2, backZ + roomD / 2 - wallT);
    rg.add(rightWall);

    // ── Ceiling ────────────────────────────────────────────────────────────
    // When closure panels are active, the room ceiling plane snaps to the top of the closure ceiling panel
    // (_cabH + _ceilThick), so the room ceiling and the closure ceiling panel appear as one unified ceiling.
    // When no closures, it sits at roomH (room height slider).
    {
        const _ceilPreset = state.presetId || 'linear';
        const _ceilIsLS = (_ceilPreset === 'linear' || _ceilPreset === 'sliding');
        const _ceilRW = _ceilIsLS ? (window._roomWall || state.roomWall || 'center') : 'center';
        const _ceilOn = (window._closureEnabled !== false);
        let _ceilPlaneY = roomH;
        if (_ceilRW !== 'center' && _ceilIsLS && _ceilOn) {
            const _cabHc = state.columns && state.columns.length > 0
                ? Math.max(...state.columns.map(c => c.height))
                : (state.globalHeight || 240);
            const _ceilThickC = Math.max(1.8, parseFloat(window._closureCeilWidth) || 1.8);
            _ceilPlaneY = _cabHc + _ceilThickC;
        }
        const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.9, metalness: 0.0, side: THREE.FrontSide });
        const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), ceilMat);
        ceilMesh.rotation.x = Math.PI / 2;
        ceilMesh.position.set(roomCenterX, _ceilPlaneY, backZ + roomD / 2 - wallT);
        rg.add(ceilMesh);
    }

    // ── Niche (ארון בנישה) ─────────────────────────────────────────────────
    // Creates a rectangular alcove in the back wall: 3 wall planes (back, left, right).
    // Niche height = full room height. Width and depth controlled by sliders.
    // Niche X position shifts based on _roomWall:
    //   'left'  → niche left edge aligns with leftWallX (niche hugs left wall)
    //   'right' → niche right edge aligns with rightWallX (niche hugs right wall)
    //   'both'  → niche centered between both walls
    //   'center'→ niche centered at X=0 (cabinet center)
    if (window._nicheEnabled && _isLinearOrSliding) {
        const _nW = Math.max(50, parseFloat(window._nicheWidth)  || 200);
        const _nD = Math.max(10, parseFloat(window._nicheDepth)  || 30);

        // Niche is always centered on the cabinet (X=0), regardless of wall position
        const _nicheCX = 0;

        const nicheBackZ = backZ - _nD;
        const nicheMidZ  = backZ - _nD / 2;

        // Back niche wall (faces forward, perpendicular to Z)
        const nicheBackMat = makeBrickMat(_nW, roomH);
        const nicheBackWall = new THREE.Mesh(new THREE.PlaneGeometry(_nW, roomH), nicheBackMat);
        nicheBackWall.position.set(_nicheCX, roomH / 2, nicheBackZ);
        rg.add(nicheBackWall);

        // Left niche wall (faces right, perpendicular to X)
        const nicheLeftMat = makeBrickMat(_nD, roomH);
        const nicheLeftWall = new THREE.Mesh(new THREE.PlaneGeometry(_nD, roomH), nicheLeftMat);
        nicheLeftWall.rotation.y = Math.PI / 2;
        nicheLeftWall.position.set(_nicheCX - _nW / 2, roomH / 2, nicheMidZ);
        rg.add(nicheLeftWall);

        // Right niche wall (faces left, perpendicular to X)
        const nicheRightMat = makeBrickMat(_nD, roomH);
        const nicheRightWall = new THREE.Mesh(new THREE.PlaneGeometry(_nD, roomH), nicheRightMat);
        nicheRightWall.rotation.y = -Math.PI / 2;
        nicheRightWall.position.set(_nicheCX + _nW / 2, roomH / 2, nicheMidZ);
        rg.add(nicheRightWall);
    }

    // ── Bed model ──────────────────────────────────────────────────────────────
    window._bedMesh = null;
    if (window._bedGroup && window._bedVisible !== false) {
        const bp = window._bedPos || { x: 100, z: 200 };
        const bs = (window._bedScale !== null && window._bedScale !== undefined)
            ? window._bedScale
            : (window._bedAutoScale || 100);
        const bedRotRad = ((window._bedRotation || 0) * Math.PI) / 180;
        const widthFactor = (window._bedWidthCm || 160) / 160;
        const wAx = window._bedWidthAxis || 'x';

        const bed = window._bedGroup.clone();
        bed.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.roomProp = 'bed';
            }
        });
        bed.scale.set(
            wAx === 'x' ? bs * widthFactor : bs,
            bs,
            wAx === 'z' ? bs * widthFactor : bs
        );
        bed.rotation.y = bedRotRad;
        bed.updateMatrixWorld(true);
        const bedBox = new THREE.Box3().setFromObject(bed);
        const bedCenter = new THREE.Vector3();
        bedBox.getCenter(bedCenter);
        bed.position.set(
            bp.x - bedCenter.x,
            -bedBox.min.y,
            bp.z - bedCenter.z
        );
        bed.userData.roomProp = 'bed';
        rg.add(bed);
        window._bedMesh = bed;
        _snapBedNearWalls(bed, bp);
    }

    // ── Office Chair model ────────────────────────────────────────────────────
    window._chairMesh = null;
    const chairModel = _getActiveChairModel();
    if (chairModel && chairModel.group && window._chairVisible !== false) {
        const cp = _getChairPos();
        if (cp) {
            const chair = chairModel.group.clone();
            const cs = chairModel.autoScale || 100;
            const rotY = cp.rotY !== undefined ? cp.rotY : -Math.PI / 2;

            chair.position.set(0, 0, 0);
            chair.rotation.set(0, 0, 0);
            chair.scale.setScalar(cs);
            chair.rotation.y = rotY;
            chair.updateMatrixWorld(true);

            const box = new THREE.Box3().setFromObject(chair);
            const center = new THREE.Vector3();
            box.getCenter(center);

            chair.position.set(
                cp.x - center.x,
                -box.min.y,
                cp.z - center.z
            );
            _alignStoolHalfUnderDesk(chair, cp);
            chair.traverse(function(child) {
                if (child.isMesh) child.userData.roomProp = 'chair';
            });
            chair.userData.roomProp = 'chair';
            rg.add(chair);
            window._chairMesh = chair;
        }
    }

    // ── Laptop model ─────────────────────────────────────────────────────────────
    // Placed on top of the desk surface (hidden when chair is hidden).
    window._laptopMeshRef = null;
    if (window._laptopGroup && window._chairVisible !== false) {
        const lp = _getLaptopPos();
        if (lp) {
            const laptop = window._laptopGroup.clone();
            const ls = window._laptopAutoScale || 1;
            const rotY = lp.rotY !== undefined ? lp.rotY : 0;

            // Reset transform, apply scale + rotation at origin
            laptop.position.set(0, 0, 0);
            laptop.rotation.set(0, 0, 0);
            laptop.scale.setScalar(ls);
            laptop.rotation.y = rotY;
            laptop.updateMatrixWorld(true);

            // Measure bbox to find bottom and center
            const lbox = new THREE.Box3().setFromObject(laptop);
            const lcenter = new THREE.Vector3();
            lbox.getCenter(lcenter);

            // Step 1: place XZ centered on desk, Y at desk surface
            laptop.position.set(
                lp.x - lcenter.x,
                lp.y - lbox.min.y,
                lp.z - lcenter.z
            );
            // Step 2: add to scene, re-measure in world space, snap bottom exactly to lp.y
            // (handles GLB built-in Y offsets that cause floating)
            rg.add(laptop);
            laptop.updateMatrixWorld(true);
            const lbox2 = new THREE.Box3().setFromObject(laptop);
            laptop.position.y += lp.y - lbox2.min.y;

            // Step 3: apply manual Y offset (from move tool; negative = lower)
            laptop.position.y += (window._laptopYOffset || 0);

            // Store live reference so the move tool can update Y without full rebuild
            window._laptopMeshRef = laptop;
            window._laptopBaseY   = laptop.position.y - (window._laptopYOffset || 0);
        }
    }

    // ── Nightstand (שידה) ───────────────────────────────────────────────────
    window._nightstandMesh = null;
    if (window._nightstandVisible) {
        const np = window._nightstandPos || { x: 60, z: 280 };
        window._nightstandMesh = _placeRoomBoxFurniture(
            rg, np.x, np.z,
            window._NIGHTSTAND_W, window._NIGHTSTAND_D, window._NIGHTSTAND_H,
            window._nightstandRotation, 0xe8dfd0, 'nightstand'
        );
    }

    // ── Standalone work desk (שולחן עבודה) ─────────────────────────────────
    window._roomDeskMesh = null;
    if (window._roomDeskVisible) {
        const dp = window._roomDeskPos || { x: 130, z: 130 };
        window._roomDeskMesh = _placeRoomBoxFurniture(
            rg, dp.x, dp.z,
            window._ROOM_DESK_W, window._ROOM_DESK_D, window._ROOM_DESK_H,
            window._roomDeskRotation, 0xc9a96e, 'room-desk'
        );
    }

    // ── Custom room items ─────────────────────────────────────────────────────
    window._customRoomMeshes = [];
    (window._customRoomItems || []).forEach(function(item) {
        const mesh = _placeRoomBoxFurniture(
            rg, item.x, item.z,
            item.w, item.d, item.h,
            item.rotation || 0, item.color || 0xdce4ef, item.id
        );
        window._customRoomMeshes.push(mesh);
    });

    // Notify UI to reposition bed handles
    if (typeof window._updateBedHandles === 'function') window._updateBedHandles();
    if (typeof window._updateRoomPropsUI === 'function') window._updateRoomPropsUI();
}

const materials = {
    white_matte: new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.6 }),
    c3110: new THREE.MeshStandardMaterial({ color: 0xf0ede9, roughness: 0.6 }),
    c795:  new THREE.MeshStandardMaterial({ color: 0xece0d4, roughness: 0.6 }),
    c705:  new THREE.MeshStandardMaterial({ color: 0xdbd6c6, roughness: 0.6 }),
    u727:  new THREE.MeshStandardMaterial({ color: 0xa79786, roughness: 0.6 }),
    w1200: new THREE.MeshStandardMaterial({ color: 0xe7e1da, roughness: 0.6 }),
    u232:  new THREE.MeshStandardMaterial({ color: 0xc59578, roughness: 0.6 }),
    u604:  new THREE.MeshStandardMaterial({ color: 0x8f8e76, roughness: 0.6 }),
    u638:  new THREE.MeshStandardMaterial({ color: 0xc0b598, roughness: 0.6 }),
    c3207: new THREE.MeshStandardMaterial({ color: 0xF7ECD9, roughness: 0.6 }),
    black_matte: new THREE.MeshStandardMaterial({ color: 0x000007, roughness: 0.6 }),
    custom: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
};

window.materials = materials;

window._tambourMatKey = function(colorId) {
    return 'tambour_' + String(colorId || '').replace(/[^a-zA-Z0-9]/g, '_');
};

window._registerTambourMaterial = function(colorId, hex) {
    const key = window._tambourMatKey(colorId);
    const color = new THREE.Color(hex);
    if (!materials[key]) {
        materials[key] = new THREE.MeshStandardMaterial({ color: color, roughness: 0.6 });
    } else {
        materials[key].color.copy(color);
        materials[key].needsUpdate = true;
    }
    return key;
};

window._syncTambourPalette = function(palette) {
    if (!palette || typeof palette !== 'object') return;
    Object.keys(palette).forEach(function(key) {
        const entry = palette[key];
        if (entry && entry.hex) {
            window._registerTambourMaterial(entry.id || key.replace(/^tambour_/, ''), entry.hex);
        }
    });
};

const textureLoader = new THREE.TextureLoader();
const textureNames = ['2020', '2024', 'H1367', 'H1307', 'H1227', '2025', '2040', '2041', '2044', '2047', '2049', '2062', '5600', '7180', '456', '462', '463', '464', '480'];

textureNames.forEach(name => {
    const tex = textureLoader.load(`textures/${name}.jpg`);
    tex.wrapS = THREE.RepeatWrapping; 
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1); 
    materials[name] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
});

const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });
const matSnapHighlight = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.4, emissive: 0x16a34a, emissiveIntensity: 0.25 });

const cabinetGroup = new THREE.Group();
scene.add(cabinetGroup);
// Current build target group (set before each wing render)
let _buildGroup = cabinetGroup;
// Whether the current wing being built is the active (interactive) wing
let _isActiveWingBuild = true;
// The THREE.Group of the currently active wing (null = center, which is cabinetGroup itself)
window._activeWingGroup = null;

// Part-paint mode: array of { mesh, partId } — populated during buildCabinet when partPaintMode is on
window.partMeshes = [];
// Current wing prefix for part IDs (set before each _buildWingGeometry call)
let _ppWingId = 'center';
// Current part ID being built (set before each createBoard call in part-paint mode)
let _ppPartId = '';

/** Scope prefix so per-part colors apply to one cabinet only (draft / cart0 / cart1 …). */
window._ppColorScope = window._ppColorScope || 'draft';

window._syncPartColorScope = function() {
    window._ppColorScope = (typeof state !== 'undefined' && state.editingCartIndex >= 0)
        ? ('cart' + state.editingCartIndex)
        : 'draft';
};

window._scopedPartColorId = function(wingId, partSuffix) {
    const scope = window._ppColorScope || 'draft';
    return scope + '::' + wingId + '_' + partSuffix;
};

window._getPartColorOverride = function(wingId, partSuffix) {
    const pc = state.partColors || {};
    const scoped = window._scopedPartColorId(wingId, partSuffix);
    if (pc[scoped]) return pc[scoped];
    const legacy = wingId + '_' + partSuffix;
    if (pc[legacy]) return pc[legacy];
    return null;
};

window._exportLocalPartColors = function(scope) {
    const prefix = (scope || window._ppColorScope || 'draft') + '::';
    const local = {};
    Object.keys(state.partColors || {}).forEach(function(k) {
        if (k.indexOf(prefix) === 0) local[k.slice(prefix.length)] = state.partColors[k];
    });
    return local;
};

window._importLocalPartColors = function(scope, localColors) {
    if (!localColors || typeof localColors !== 'object') return;
    if (!state.partColors) state.partColors = {};
    const prefix = (scope || 'draft') + '::';
    Object.keys(localColors).forEach(function(k) {
        if (localColors[k]) state.partColors[prefix + k] = localColors[k];
    });
};

window._migrateDraftPartColorsToCart = function(cartIndex) {
    const fromPrefix = 'draft::';
    const toPrefix = 'cart' + cartIndex + '::';
    if (!state.partColors) return;
    Object.keys(state.partColors).forEach(function(k) {
        if (k.indexOf(fromPrefix) === 0) {
            const newKey = toPrefix + k.slice(fromPrefix.length);
            if (!state.partColors[newKey]) state.partColors[newKey] = state.partColors[k];
            delete state.partColors[k];
        }
    });
    window._ppColorScope = 'cart' + cartIndex;
};

let hitBoxes = [];
let wingHitBoxes = [];
let deskHitBoxes = [];
window.deskHitBoxes = deskHitBoxes;
let doorMeshes = [];

function _registerDoorMesh(mesh) {
    if (!mesh || !_isActiveWingBuild) return;
    doorMeshes.push(mesh);
}
let currentHoveredDoor = null;
let dragHandlesData = { horizontal: [], vertical: [], roofs: [], desk: [] };
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();

function updateCameraView() {
    if (window._layoutModeActive) return;
    // ---- Inline upper unit edit mode: keep camera stable (don't re-animate to lower cabinet) ----
    if (state._activeUpperUnit) {
        // Just rebuild drag handles and overlays without moving the camera
        if (typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
        if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
        return;
    }

    // ---- Room plan mode: 2D SVG overlay or top-down 3D orbit ----
    if (state.viewMode === 'room-plan') {
        const sub2d = window._roomPlanSubview === '2d';
        controls.enableRotate = !sub2d;
        container.classList.remove('front-mode');
        scene.background = new THREE.Color(0xeceff1);
        dirLight.intensity = 0.10;
        ambientLight.intensity = 0.95;
        dimLayer.style.display = 'none';
        buttonsLayer.style.display = 'none';
        if (typeof dragHandlesLayer !== 'undefined' && dragHandlesLayer) dragHandlesLayer.style.display = 'none';
        floor.visible = true;

        if (!sub2d) {
            const rb = window._roomBounds;
            if (rb && !window._camAnim && (window._forceCameraAnim || !window._roomPlan3dCamSet)) {
                window._forceCameraAnim = false;
                window._roomPlan3dCamSet = true;
                const cx = (rb.leftX + rb.rightX) / 2;
                const cz = (rb.backZ + rb.frontZ) / 2;
                const span = Math.max(rb.rightX - rb.leftX, rb.frontZ - rb.backZ);
                const dist = span * 1.15;
                const oldPos = camera.position.clone();
                const oldTarget = controls.target.clone();
                controls.enabled = false;
                controls.enableDamping = false;
                window._camAnim = {
                    fromPos: oldPos,
                    fromTarget: oldTarget,
                    toPos: new THREE.Vector3(cx, dist, cz + 0.01),
                    toTarget: new THREE.Vector3(cx, 0, cz),
                    t: 0,
                    duration: 0.5,
                    onDone: null
                };
            } else if (!window._camAnim) {
                controls.enabled = true;
            }
        } else {
            controls.enabled = false;
        }
        controls.update();
        if (typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
        if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
        return;
    }

    // ---- Wing edit mode: focus camera on the active wing's front face ----
    if (state.wingEditMode && state.activeWing !== 'center') {
        // Resolve the actual wing data — handle full_corner_right / full_corner_left / sideCabinetRight / sideCabinetLeft
        const isFCEdit = state.activeWing === 'full_corner_right' || state.activeWing === 'full_corner_left';
        const isSCEdit = state.activeWing === 'sideCabinetRight' || state.activeWing === 'sideCabinetLeft';
        const fcSide = isFCEdit ? state.activeWing.replace('full_corner_', '') : null;
        let activeWingData;
        if (isSCEdit) {
            // Side cabinet edit mode: use the side cabinet data with overridden width = centerD
            const sc = state.wings.center ? state.wings.center.sideCabinet : null;
            if (sc) {
                const centerD_cam = state.wings.center ? state.wings.center.depth : 54;
                activeWingData = Object.assign({}, sc, { width: centerD_cam });
            }
        } else {
            activeWingData = isFCEdit ? state.wings[fcSide] : state.wings[state.activeWing];
        }
        if (activeWingData) {
            const wingW = activeWingData.width || 80;
            const wingH = activeWingData.columns && activeWingData.columns.length
                ? Math.max(...activeWingData.columns.map(c => c.height))
                : (activeWingData.globalHeight || 240);
            const fitH = wingH + 120;
            const fitW = wingW + 150;
            camera.fov = 45;
            camera.updateProjectionMatrix();
            const distY = fitH / (2 * Math.tan(Math.PI * camera.fov / 360));
            const distX = fitW / (2 * Math.tan(Math.PI * camera.fov / 360)) / camera.aspect;
            const dist = Math.max(distY, distX);
            const midY = wingH / 2;
            let toPosArr, toTargetArr, lightPos;

            // Full corner edit mode: camera at 45° diagonal (front-side) to see both openings
            // Only use FC camera when editing the L-unit directly (isFCEdit), NOT when editing
            // the side wing that happens to have wingPosition === 'full_corner'
            if (isFCEdit) {
                const side = fcSide || state.activeWing;
                const fcSize = (activeWingData.fullCorner && activeWingData.fullCorner.size) || 100;
                const centerWingData = state.wings.center;
                const mainW = centerWingData ? centerWingData.width : (state.width || 200);
                const bodyD = centerWingData ? centerWingData.depth : (state.depth || 60);
                const sign = (side === 'right') ? 1 : -1;
                // L origin: back-outer corner at (sign*(mainW/2+fcSize), 0, -bodyD/2)
                // Target = center of L unit
                const fcCenterX = sign * (mainW / 2 + fcSize / 2);
                const fcCenterZ = bodyD / 2;  // roughly center of L in Z
                // Camera: in front of L (positive Z) and to the opposite side (negative sign*X)
                // Calibrated from user capture: offset ~[-281, +69, +310] from target for right side
                const camOffX = -sign * 280;
                const camOffY = 70;
                const camOffZ = 310;
                toPosArr   = [fcCenterX + camOffX, midY + camOffY, fcCenterZ + camOffZ];
                toTargetArr = [fcCenterX, midY, fcCenterZ];
                // Light calibrated by user: [-90, 259, 176] relative to scene origin
                lightPos   = [-90, 259, 176];
            } else if (state.activeWing === 'left') {
                // Left wing: camera to the RIGHT (+X), looking left
                toPosArr = [dist, midY, 0];
                toTargetArr = [0, midY, 0];
                lightPos = [dist * 0.8, dist * 0.6, dist * 0.1];
            } else if (state.activeWing === 'sideCabinetRight' || state.activeWing === 'sideCabinetLeft') {
                // Side cabinet edit mode: cabinet rendered at origin facing forward (no rotation in edit mode)
                // Camera at +Z looking toward origin — standard front view
                toPosArr = [0, midY, dist];
                toTargetArr = [0, midY, 0];
                lightPos = [200, 400, 300];
            } else {
                // Right wing: camera to the LEFT (-X), looking right
                toPosArr = [-dist, midY, 0];
                toTargetArr = [0, midY, 0];
                lightPos = [-dist * 0.8, dist * 0.6, dist * 0.1];
            }
            dirLight.position.set(...lightPos);
            // Keep default lighting — wing edit mode uses same intensity as free mode
            dirLight.intensity = 0.7;
            ambientLight.intensity = 0.6;
            controls.enableRotate = true;
            container.classList.add('front-mode');
            scene.background = new THREE.Color(0xeceff1);
            dimLayer.style.display = 'block';
            buttonsLayer.style.display = 'block';
            floor.visible = true;
            const bpLayer = document.getElementById('blueprint-layer');
            if (bpLayer) { bpLayer.style.display = 'none'; bpLayer.innerHTML = ''; }

            // Only snap camera on first entry to wing edit — not on every rebuild/edit action
            const shouldAnimWingEditCam = !!window._wingEditCamInit;
            if (shouldAnimWingEditCam) window._wingEditCamInit = false;

            if (!shouldAnimWingEditCam) {
                if (!window._camAnim) controls.enabled = true;
                if (typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
                if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
                return;
            }

            // Animate smoothly from current camera position to the wing's front view
            const oldCamPos = camera.position.clone();
            const oldTarget = controls.target.clone();
            controls.enabled = false;
            controls.enableDamping = false;
            window._camAnim = {
                fromPos: oldCamPos,
                fromTarget: oldTarget,
                toPos: new THREE.Vector3(...toPosArr),
                toTarget: new THREE.Vector3(...toTargetArr),
                t: 0,
                duration: 0.6,
                onDone: null
            };
            if(typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
            if(typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
            return;
        }
    }

    // Compute total scene footprint across all active wings
    const centerWing = state.wings.center;
    const leftWing = state.wings.left;
    const rightWing = state.wings.right;

    const centerW = centerWing ? centerWing.width : state.width;
    const centerD = centerWing ? centerWing.depth : state.depth;
    const centerH = _wingCabinetHeight(centerWing, state.globalHeight || 240);

    // Left wing protrudes in -Z direction by its width
    const leftProtrusion = leftWing ? leftWing.width : 0;
    // Right wing protrudes in -Z direction by its width
    const rightProtrusion = rightWing ? rightWing.width : 0;
    const sideProtrusion = Math.max(leftProtrusion, rightProtrusion);

    let totalWidth = centerW;
    let targetX = 0;
    if (state.desk && state.desk.side !== 'none') {
        totalWidth += state.desk.width;
        targetX = (state.desk.side === 'left') ? -state.desk.width/2 : state.desk.width/2;
    }
    // Account for side cabinet(s) in camera framing.
    // The side cabinet protrudes sideways by scData.width (the slider value).
    const centerWingForSC = state.wings.center;
    const sc = centerWingForSC ? centerWingForSC.sideCabinet : null;
    if (sc && sc.side !== 'none') {
        const scProtrusion = sc.width || 40; // world X extent = protrusion
        const scSideVal = sc.side;
        if (scSideVal === 'right' || scSideVal === 'both') {
            totalWidth += scProtrusion;
            targetX += scProtrusion / 2;
        }
        if (scSideVal === 'left' || scSideVal === 'both') {
            totalWidth += scProtrusion;
            targetX -= scProtrusion / 2;
        }
        // For 'both', the two adjustments cancel out in targetX (symmetric), totalWidth += 2*scProtrusion
        if (scSideVal === 'both') {
            // Undo the double targetX shift — symmetric, so center stays at 0
            targetX = 0;
        }
    }

    const hasAnyWing = leftWing || rightWing;
    const hasCorner = state.corner && state.corner.side !== 'none';

    if (state.viewMode === 'blueprint') {
        totalWidth += centerD + 120;
        targetX += (centerD + 60) / 2;
    }

    const maxColH = centerH;
    let fitHeight = maxColH + 120;
    let fitWidth = totalWidth + sideProtrusion + 150;

    if (state.viewMode === 'blueprint') {
        fitHeight += 80;
        fitWidth += 80;
    }
    
    camera.fov = 45;
    camera.updateProjectionMatrix();

    const distY = fitHeight / (2 * Math.tan(Math.PI * camera.fov / 360));
    const distX = fitWidth / (2 * Math.tan(Math.PI * camera.fov / 360)) / camera.aspect;
    const targetDistance = Math.max(distY, distX);

    let targetY = maxColH / 2;
    if (state.viewMode === 'blueprint') targetY -= 25;

    // 3D mode with wings or corner: use preset-specific camera positions
    if ((hasAnyWing || hasCorner) && state.viewMode !== 'front' && state.viewMode !== 'blueprint') {
        controls.enableRotate = true; container.classList.remove('front-mode');
        scene.background = new THREE.Color(0xeceff1);
        dirLight.position.set(120, 510, 600);
        dirLight.intensity = 0.10;
        ambientLight.intensity = 0.95;
        dimLayer.style.display = 'none'; buttonsLayer.style.display = 'none';
        floor.visible = true;

        // User already orbited — keep their camera angle, just refresh overlays
        if (window._orbitFree) {
            controls.enabled = true;
            controls.update();
            if (typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
            if (typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
            return;
        }

        // Snap to preset camera only once — don't restart animation on every dimension change
        if (!window._camAnim && (window._forceCameraAnim || !window._corner3dCamPositioned)) {
            window._forceCameraAnim = false;
            window._corner3dCamPositioned = true;
            const pid = state.presetId || '';
            let camPos, camTarget;
            if (pid === 'corner-right') {
                camPos    = new THREE.Vector3(-221.1, 283.8, 368.5);
                camTarget = new THREE.Vector3(0, 120, 0);
            } else if (pid === 'corner-left') {
                camPos    = new THREE.Vector3(271.9, 249.1, 375);
                camTarget = new THREE.Vector3(-43.2, 117.9, 31.7);
            } else if (pid === 'walkin') {
                camPos    = new THREE.Vector3(-248.77, 336.74, 494.33);
                camTarget = new THREE.Vector3(107.54, 109.88, 32.81);
            } else {
                camPos    = new THREE.Vector3(-273.30, 268.26, 509.30);
                camTarget = new THREE.Vector3(85.38, 124.15, 68.29);
            }
            const oldCamPos2  = camera.position.clone();
            const oldTarget2  = controls.target.clone();
            controls.enabled       = false;
            controls.enableDamping = false;
            window._camAnim = {
                fromPos:    oldCamPos2,
                fromTarget: oldTarget2,
                toPos:      camPos,
                toTarget:   camTarget,
                t:        0,
                duration: 0.6,
                onDone:   null
            };
        } else if (!window._camAnim) {
            controls.enabled = true;
        }
        controls.update();
        if(typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
        if(typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
        return;
    }

    if (state.viewMode === 'front' || state.viewMode === 'blueprint') {
        const toPosArr = [targetX, targetY, targetDistance];
        const toTargetArr = [targetX, targetY, 0];
        controls.enableRotate = (state.viewMode === 'front'); container.classList.add('front-mode');
        dirLight.position.set(120, 510, 600);
        
        if (state.viewMode === 'blueprint') {
            scene.background = new THREE.Color(0xffffff);
            dirLight.intensity = 0.2;
            ambientLight.intensity = 0.6;
            dimLayer.style.display = 'none';
            buttonsLayer.style.display = 'none';
            floor.visible = false;
        } else {
            scene.background = new THREE.Color(0xeceff1);
            dirLight.intensity = 0.10;
            ambientLight.intensity = 0.95;
            dimLayer.style.display = 'block';
            buttonsLayer.style.display = 'block';
            floor.visible = true;
            // Clear blueprint overlay when leaving blueprint mode
            const bpLayer = document.getElementById('blueprint-layer');
            if (bpLayer) { bpLayer.style.display = 'none'; bpLayer.innerHTML = ''; }
        }

        // Don't restart camera animation on every dimension change — only when explicitly requested
        const shouldAnimFrontCam = !window._camAnim && (window._forceCameraAnim || !window._frontCamPositioned);
        if (shouldAnimFrontCam) {
            window._forceCameraAnim = false;
            window._frontCamPositioned = true;
            const oldCamPos = camera.position.clone();
            const oldTarget = controls.target.clone();
            controls.enabled = false;
            controls.enableDamping = false;
            window._camAnim = {
                fromPos: oldCamPos,
                fromTarget: oldTarget,
                toPos: new THREE.Vector3(...toPosArr),
                toTarget: new THREE.Vector3(...toTargetArr),
                t: 0,
                duration: 0.6,
                onDone: null
            };
        } else if (!window._camAnim) {
            controls.enabled = true;
        }
    } else {
        // 3D mode — only reset camera if user hasn't manually orbited
        if (!window._orbitFree) {
            camera.position.set(targetX + targetDistance * 0.6, maxColH * 0.8, targetDistance * 0.8);
            controls.target.set(targetX, maxColH / 2, 0);
        }
        controls.enableRotate = true; container.classList.remove('front-mode');
        scene.background = new THREE.Color(0xeceff1);
        dirLight.position.set(120, 510, 600);
        dirLight.intensity = 0.10;
        ambientLight.intensity = 0.95;
        dimLayer.style.display = 'none'; buttonsLayer.style.display = 'none';
        floor.visible = true;
        controls.enabled = true;
        controls.update();
    }
    if(typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
    if(typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
}

function buildCabinet() {
    if (window._layoutModeActive) return;
    if (typeof window._syncPartColorScope === 'function') window._syncPartColorScope();

    // Room shell is only for תכנון חדר or תצוגה חופשית — never in עריכת חזית / שרטוט
    if (state.viewMode !== 'room-plan' && !document.body.classList.contains('presentation-mode')) {
        window._roomVisible = false;
    }

    while(cabinetGroup.children.length > 0) cabinetGroup.remove(cabinetGroup.children[0]);
    hitBoxes = [];
    wingHitBoxes = [];
    deskHitBoxes = [];
    window.deskHitBoxes = deskHitBoxes;
    doorMeshes = [];
    currentHoveredDoor = null;
    state.dimData = []; state.bpData = [];
    dragHandlesData = { horizontal: [], vertical: [], roofs: [], desk: [], partitions: [], floors: [], selectAll: [], upperUnit: [] };
    // Reset part-paint mesh list
    window.partMeshes = [];
    // Remove wing hover highlight (it lives on scene, not cabinetGroup)
    if (typeof window._removeWingHighlight === 'function') window._removeWingHighlight();

    // Render all active wings
    // We temporarily swap activeWing to read each wing's data via the proxy.
    // IMPORTANT: clear _activeUpperUnit during rendering so the proxy reads the correct wing data
    // (not the upper unit data) when rendering the lower cabinet.
    const savedActiveUpperUnit = state._activeUpperUnit;
    state._activeUpperUnit = null;

    const savedActiveWing = state.activeWing;
    const centerWing = state.wings.center;
    const inEditMode = state.wingEditMode;

    // Always render center wing from center data
    state.activeWing = 'center';
    _buildGroup = cabinetGroup;
    // When editing an upper unit inline (savedActiveUpperUnit is set), the lower cabinet is NOT active
    // (no cell overlays / drag handles on the lower cabinet while editing the upper unit)
    _isActiveWingBuild = (savedActiveWing === 'center') && !savedActiveUpperUnit;
    // In edit mode, only render the active wing (center cabinet is NOT rendered when editing a side/front wing)
    if (!inEditMode || savedActiveWing === 'center') {
        // For sliding wardrobes: render at full depth. Door system added by buildSlidingDoorCabinet().
        const _isSliding = state.presetId === 'sliding' && centerWing && centerWing.slidingDoor && centerWing.slidingDoor.enabled;
        _ppWingId = 'center';
        _buildWingGeometry(cabinetGroup, 0, 0, 0, _isActiveWingBuild);
    }

    // ---- Upper Units: render each upperUnit_* wing above its parent ----
    // Each wing (center, left, right) can have its own upper unit stored as state.wings['upperUnit_'+wingId]
    // state._activeUpperUnit (e.g. 'upperUnit_center') controls which upper unit gets cell-selection overlays.
    // state.activeWing is NEVER set to an upperUnit_* key — it always stays as the parent wing.
    Object.keys(state.wings).forEach(function(uuKey) {
        if (!uuKey.startsWith('upperUnit_')) return;
        const uuWing = state.wings[uuKey];
        if (!uuWing || !uuWing._isUpperUnit) return;
        const parentId = uuWing._parentWingId || 'center';
        const parentWing = state.wings[parentId];
        if (!parentWing) return;

        // In edit mode: only render if we're editing this upper unit's parent
        if (inEditMode && savedActiveWing !== parentId) return;

        // Compute Y offset above parent wing
        const mainH = parentWing.columns && parentWing.columns.length > 0
            ? Math.max(...parentWing.columns.map(c => c.height))
            : (parentWing.globalHeight || 240);

        const upperGroup = new THREE.Group();
        upperGroup.position.y = mainH + (uuWing._upperGap || 60);

        // For left/right wings, the upper unit must be offset to match the parent wing's X/Z position
        if (parentId === 'left') {
            const leftEdgeX = centerWing ? -centerWing.width / 2 : -80;
            const parentD = parentWing.depth || 54;
            const parentW = parentWing.width || 80;
            const centerD = centerWing ? centerWing.depth : 54;
            const leftPos = parentWing.wingPosition || 'side';
            const leftFcSize = (parentWing.fullCorner && parentWing.fullCorner.size) || 100;
            let leftX, leftZ;
            if (leftPos === 'side') {
                leftX = leftEdgeX - parentD / 2;
                leftZ = -centerD / 2 + parentW / 2;
            } else if (leftPos === 'full_corner') {
                leftX = leftEdgeX - leftFcSize + parentD / 2;
                leftZ = -centerD / 2 + leftFcSize + parentW / 2;
            } else {
                leftX = leftEdgeX + parentD / 2;
                leftZ = centerD / 2 + parentW / 2;
            }
            if (inEditMode) {
                // In edit mode the left wing is rendered at origin — upper unit follows
                upperGroup.position.x = (uuWing._upperOffsetX || 0);
                upperGroup.position.z = 0;
            } else {
                upperGroup.position.x = leftX + (uuWing._upperOffsetX || 0);
                upperGroup.position.z = leftZ;
            }
            upperGroup.rotation.y = Math.PI / 2;
        } else if (parentId === 'right') {
            const rightEdgeX = centerWing ? centerWing.width / 2 : 80;
            const parentD = parentWing.depth || 54;
            const parentW = parentWing.width || 80;
            const centerD = centerWing ? centerWing.depth : 54;
            const rightPos = parentWing.wingPosition || 'side';
            const rightFcSize = (parentWing.fullCorner && parentWing.fullCorner.size) || 100;
            let rightX, rightZ;
            if (rightPos === 'side') {
                rightX = rightEdgeX + parentD / 2;
                rightZ = -centerD / 2 + parentW / 2;
            } else if (rightPos === 'full_corner') {
                rightX = rightEdgeX + rightFcSize - parentD / 2;
                rightZ = -centerD / 2 + rightFcSize + parentW / 2;
            } else {
                rightX = rightEdgeX - parentD / 2;
                rightZ = centerD / 2 + parentW / 2;
            }
            if (inEditMode) {
                // In edit mode the right wing is rendered at origin — upper unit follows
                upperGroup.position.x = (uuWing._upperOffsetX || 0);
                upperGroup.position.z = 0;
            } else {
                upperGroup.position.x = rightX + (uuWing._upperOffsetX || 0);
                upperGroup.position.z = rightZ;
            }
            upperGroup.rotation.y = -Math.PI / 2;
        } else {
            // center: apply horizontal offset only
            upperGroup.position.x = (uuWing._upperOffsetX || 0);
        }

        // Temporarily set activeWing to uuKey so _buildWingGeometry renders it correctly
        // (cell overlays, drag handles, etc. only appear when _isActiveWingBuild = true)
        // Use savedActiveUpperUnit (not state._activeUpperUnit which was cleared above)
        const _isUUActive = (savedActiveUpperUnit === uuKey);
        state.activeWing = uuKey;
        _buildGroup = upperGroup;
        _isActiveWingBuild = _isUUActive;
        _ppWingId = uuKey;
        upperGroup.userData.wingId = uuKey;
        // Upper units never have a decorative plinth — force noPlinth on all columns
        // (handles both newly created and existing saved upper units)
        uuWing.columns.forEach(col => { col.noPlinth = true; });
        _buildWingGeometry(upperGroup, 0, 0, 0, _isUUActive);

        // Restore
        state.activeWing = savedActiveWing;
        _buildGroup = cabinetGroup;
        _isActiveWingBuild = (savedActiveWing === 'center') && !savedActiveUpperUnit;

        cabinetGroup.add(upperGroup);

        // When this upper unit is the active one, expose its group for overlay coordinate transforms
        // so that updateDragHandlesPosition correctly maps local Y coords to world space
        if (_isUUActive) {
            window._activeWingGroup = upperGroup;
        }

        // Add drag handle data for repositioning the upper unit left/right
        // worldX = center of upper unit in world space; worldY = top of upper unit + 8cm above
        {
            const uuH = Math.max(...uuWing.columns.map(c => c.height));
            const worldX = upperGroup.position.x; // already includes _upperOffsetX
            const worldY = upperGroup.position.y + uuH + 8;
            dragHandlesData.upperUnit.push({ uuKey, worldX, worldY });
        }

        // Add a wing-level hit box for the upper unit so clicking it enters inline edit mode.
        // For left/right wing upper units: only add the hit box when in edit mode for that parent wing
        // (so in free mode you can't accidentally click the side-wing upper unit).
        // For center wing upper units: add in free mode as before.
        const _uuHitAllowed = !savedActiveUpperUnit && (
            parentId === 'center'
                ? !inEditMode
                : (inEditMode && savedActiveWing === parentId)
        );
        if (_uuHitAllowed) {
            const uuW = uuWing.width || 160;
            const uuH = Math.max(...uuWing.columns.map(c => c.height));
            const uuD = uuWing.depth || 54;
            // For left/right wings the upper unit is rotated ±90° around Y,
            // so the hit box must also be rotated to match the visual geometry.
            const uuHitGeo = new THREE.BoxGeometry(uuW + 2, uuH + 2, uuD + 2);
            const uuHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
            const uuHit = new THREE.Mesh(uuHitGeo, uuHitMat);
            uuHit.renderOrder = 999;
            uuHit.position.set(upperGroup.position.x, upperGroup.position.y + uuH / 2, upperGroup.position.z);
            // Copy the same rotation as the upper unit group so raycasting and highlight match
            uuHit.rotation.copy(upperGroup.rotation);
            uuHit.userData = { wingId: uuKey };
            cabinetGroup.add(uuHit);
            wingHitBoxes.push(uuHit);
        }
    });

    // NOTE: _activeUpperUnit is restored AFTER all lower-cabinet wings are rendered.
    // Restoring it here (before left/right wing rendering) would cause the proxy to read
    // the upper unit's data (e.g. height=40) instead of the wing's data (height=240).
    // See restore point below, after left/right wing rendering.

    // In free mode: add hit box for center wing (for hover detection) when other wings or side cabinet exist
    const _hasSC = centerWing && centerWing.sideCabinet && centerWing.sideCabinet.side !== 'none';
    if (!inEditMode && (state.wings.left || state.wings.right || _hasSC)) {
        const cW = centerWing ? centerWing.width : 160;
        const cD = centerWing ? centerWing.depth : 54;
        const cH = centerWing ? Math.max(...centerWing.columns.map(c => c.height)) : 240;
        const whbGeo = new THREE.BoxGeometry(cW + 2, cH + 2, cD + 2);
        const whbMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
        const whb = new THREE.Mesh(whbGeo, whbMat);
        whb.renderOrder = 999;
        whb.position.set(0, cH / 2, 0);
        whb.userData = { wingId: 'center' };
        cabinetGroup.add(whb);
        wingHitBoxes.push(whb);
    }

    // Render left wing: positioned at left edge of center, rotated 90° around Y
    if (state.wings.left && (!inEditMode || savedActiveWing === 'left')) {
        const leftGroup = new THREE.Group();
        const leftEdgeX = centerWing ? -centerWing.width / 2 : -80;
        const leftWing = state.wings.left;
        const centerD = centerWing ? centerWing.depth : 54;
        const leftWingD = leftWing.depth || 54;
        const leftWingW = leftWing.width || 80;
        const leftPos = leftWing.wingPosition || 'side';
        const leftFcSize = (leftWing.fullCorner && leftWing.fullCorner.size) || 100;
        let leftX, leftZ, leftRotY;
        if (leftPos === 'side') {
            leftX = leftEdgeX - leftWingD / 2;
            leftZ = -centerD / 2 + leftWingW / 2;
            leftRotY = Math.PI / 2;
        } else if (leftPos === 'full_corner') {
            // Wing sits beyond the L unit's full depth (rotated +PI/2)
            // L total depth = leftFcSize (cd = 100). Wing starts at Z = -centerD/2 + leftFcSize
            // Wing back aligns with L left outer edge: leftX - leftWingD/2 = leftEdgeX - leftFcSize
            leftX = leftEdgeX - leftFcSize + leftWingD / 2;
            // Wing Z center: L back face at -centerD/2, L front face at -centerD/2 + leftFcSize
            // Wing runs from -centerD/2 + leftFcSize onward
            leftZ = -centerD / 2 + leftFcSize + leftWingW / 2;
            leftRotY = Math.PI / 2;
        } else {
            // front
            leftX = leftEdgeX + leftWingD / 2;
            leftZ = centerD / 2 + leftWingW / 2;
            leftRotY = Math.PI / 2;
        }
        leftGroup.rotation.y = leftRotY;
        // In edit mode, render at origin (no offset) so front view works correctly
        leftGroup.position.set(inEditMode ? 0 : leftX, 0, inEditMode ? 0 : leftZ);
        leftGroup.userData.wingId = 'left';
        cabinetGroup.add(leftGroup);
        state.activeWing = 'left';
        _buildGroup = leftGroup;
        // When editing the upper unit of this wing, the lower wing is NOT the active build
        // (no cell overlays / drag handles on the lower cabinet while editing the upper unit)
        _isActiveWingBuild = (savedActiveWing === 'left') && !savedActiveUpperUnit;
        _ppWingId = 'left';
        _buildWingGeometry(leftGroup, 0, 0, 0, _isActiveWingBuild);
        _buildGroup = cabinetGroup;
        // In free mode: add hit box for hover detection (no opacity change here)
        if (!inEditMode) {
            const wingH = Math.max(...state.wings.left.columns.map(c => c.height));
            const whbGeo = new THREE.BoxGeometry(leftWingD + 2, wingH + 2, leftWingW + 2);
            const whbMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
            const whb = new THREE.Mesh(whbGeo, whbMat);
            whb.renderOrder = 999;
            whb.position.set(leftX, wingH / 2, leftZ);
            whb.userData = { wingId: 'left' };
            cabinetGroup.add(whb);
            wingHitBoxes.push(whb);
        }
    }

    // Render right wing: positioned at right edge of center, rotated -90° around Y
    if (state.wings.right && (!inEditMode || savedActiveWing === 'right')) {
        const rightGroup = new THREE.Group();
        const rightEdgeX = centerWing ? centerWing.width / 2 : 80;
        const rightWing = state.wings.right;
        const centerD = centerWing ? centerWing.depth : 54;
        const rightWingD = rightWing.depth || 54;
        const rightWingW = rightWing.width || 80;
        const rightPos = rightWing.wingPosition || 'side';
        const rightFcSize = (rightWing.fullCorner && rightWing.fullCorner.size) || 100;
        let rightX, rightZ, rightRotY;
        if (rightPos === 'side') {
            rightX = rightEdgeX + rightWingD / 2;
            rightZ = -centerD / 2 + rightWingW / 2;
            rightRotY = -Math.PI / 2;
        } else if (rightPos === 'full_corner') {
            // Wing sits beyond the L unit's full depth (rotated -PI/2)
            // L total depth = rightFcSize (cd = 100). Wing starts at Z = -centerD/2 + rightFcSize
            // Wing back aligns with L right outer edge: rightX + rightWingD/2 = rightEdgeX + rightFcSize
            rightX = rightEdgeX + rightFcSize - rightWingD / 2;
            // Wing Z center: L back face at -centerD/2, L front face at -centerD/2 + rightFcSize
            // Wing runs from -centerD/2 + rightFcSize onward
            rightZ = -centerD / 2 + rightFcSize + rightWingW / 2;
            rightRotY = -Math.PI / 2;
        } else {
            // front
            rightX = rightEdgeX - rightWingD / 2;
            rightZ = centerD / 2 + rightWingW / 2;
            rightRotY = -Math.PI / 2;
        }
        rightGroup.rotation.y = rightRotY;
        // In edit mode, render at origin (no offset) so front view works correctly
        rightGroup.position.set(inEditMode ? 0 : rightX, 0, inEditMode ? 0 : rightZ);
        rightGroup.userData.wingId = 'right';
        cabinetGroup.add(rightGroup);
        state.activeWing = 'right';
        _buildGroup = rightGroup;
        // When editing the upper unit of this wing, the lower wing is NOT the active build
        _isActiveWingBuild = (savedActiveWing === 'right') && !savedActiveUpperUnit;
        _ppWingId = 'right';
        _buildWingGeometry(rightGroup, 0, 0, 0, _isActiveWingBuild);
        _buildGroup = cabinetGroup;
        // In free mode: add hit box for hover detection (no opacity change here)
        if (!inEditMode) {
            const wingH = Math.max(...state.wings.right.columns.map(c => c.height));
            const whbGeo = new THREE.BoxGeometry(rightWingD + 2, wingH + 2, rightWingW + 2);
            const whbMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
            const whb = new THREE.Mesh(whbGeo, whbMat);
            whb.renderOrder = 999;
            whb.position.set(rightX, wingH / 2, rightZ);
            whb.userData = { wingId: 'right' };
            cabinetGroup.add(whb);
            wingHitBoxes.push(whb);
        }
    }

    // Restore _activeUpperUnit now that all lower-cabinet wings have been rendered.
    // This must happen AFTER left/right wing rendering so the proxy reads the correct
    // wing data (not the upper unit data) during _buildWingGeometry calls above.
    state._activeUpperUnit = savedActiveUpperUnit;

    // ---- Render side cabinet(s) (ארון צד הפוך) if configured on center wing ----
    // The side cabinet is an INVERTED side cabinet — its open face points OUTWARD (left or right).
    // Its back panel is against the main cabinet's side wall.
    //
    // sc.side can be 'right', 'left', or 'both' — renders on one or both sides.
    //
    // Geometry design:
    //   - scData.width  = main cabinet depth (fixed, e.g. 54cm) → this is the cabinet's local WIDTH (X)
    //   - scData.depth  = protrusion from wall (slider, e.g. 40cm) → this is the cabinet's local DEPTH (Z)
    //
    // After rotation by +PI/2 (right side) or -PI/2 (left side):
    //   Right side (+PI/2): local +Z → world +X (open face points right ✓), local +X → world +Z
    //   Left side  (-PI/2): local +Z → world -X (open face points left ✓), local +X → world -Z
    //
    // World position:
    //   X: right → mainW/2 + scProtrusion/2; left → -mainW/2 - scProtrusion/2
    //   Z: cabinet spans full main cabinet depth, centered at 0
    //   When doorExtra > 0: width grows toward the front only (inner local-X shift), back stays flush

    function _sideCabDoorExtraForSide(centerWing, scSide) {
        if (!centerWing || !centerWing.hasDoors) return 0;
        const cols = centerWing.columns;
        if (!cols || !cols.length) return 0;
        const edgeCol = (scSide === 'right') ? cols[cols.length - 1] : cols[0];
        if (!edgeCol.doors || !edgeCol.doors.length) return 0;
        return centerWing.thickness || state.thickness || 1.7;
    }

    const _renderOneSideCabinet = (scData, scSide, wingIdStr, isActive) => {
        const mainW = centerWing ? centerWing.width : 160;
        const centerD = centerWing ? centerWing.depth : 54;
        const doorExtra = _sideCabDoorExtraForSide(centerWing, scSide);
        const scLocalW = centerD + doorExtra;
        // Asymmetric width: extend toward front (door line), keep rear flush with main cabinet.
        // +PI/2 maps local X→world -Z; -PI/2 maps local X→world +Z — opposite build offsets.
        const scBuildOx = doorExtra > 0
            ? ((scSide === 'right') ? -doorExtra / 2 : doorExtra / 2)
            : 0;
        const scHitZ = doorExtra / 2;
        // X seam at top/back corner: after +PI/2, local z of top edge ≈ -depth/2+t/2 → world X = scX + z
        // sits t/2 past mainW/2; shift inward by half panel thickness (not full doorExtra).
        const scT = (centerWing && centerWing.thickness) || scData.thickness || state.thickness || 1.7;
        const scXFlush = doorExtra > 0 ? scT / 2 : 0;
        // Use per-side width; fall back to shared width for backward compat
        const scProtrusion = (scSide === 'right')
            ? (scData.widthRight || scData.width || 40)
            : (scData.widthLeft  || scData.width || 40);

        const origWidth = scData.width;
        const origDepth = scData.depth;
        const origColWidth = scData.columns[0] ? scData.columns[0].width : null;
        scData.width = scLocalW;
        scData.depth = scProtrusion;
        if (scData.columns[0]) {
            scData.columns[0].width = scLocalW - (scData.thickness || 1.7) * 2;
        }

        const scGroup = new THREE.Group();
        const scRotY = (scSide === 'right') ? Math.PI / 2 : -Math.PI / 2;
        scGroup.rotation.y = scRotY;
        const scX = (scSide === 'right')
            ? (mainW / 2 + scProtrusion / 2 - scXFlush)
            : (-mainW / 2 - scProtrusion / 2 + scXFlush);
        scGroup.position.set(scX, 0, 0);
        scGroup.userData.wingId = wingIdStr;
        cabinetGroup.add(scGroup);

        const prevActiveWing = state.activeWing;
        state.activeWing = wingIdStr;
        _buildGroup = scGroup;
        _isActiveWingBuild = isActive;
        _ppWingId = wingIdStr;
        _buildWingGeometry(scGroup, scBuildOx, 0, 0, isActive);
        _ppWingId = 'center';
        _buildGroup = cabinetGroup;
        state.activeWing = prevActiveWing;

        scData.width = origWidth;
        scData.depth = origDepth;
        if (scData.columns[0] && origColWidth !== null) scData.columns[0].width = origColWidth;

        // Add hit box for hover/click detection (only in free mode)
        if (!inEditMode) {
            const scH = scData.columns && scData.columns.length > 0
                ? Math.max(...scData.columns.map(c => c.height))
                : (scData.globalHeight || 240);
            // In world space after rotation: local X (centerD) → world Z, local Z (scProtrusion) → world X
            const whbGeo = new THREE.BoxGeometry(scProtrusion + 2, scH + 2, centerD + doorExtra + 2);
            const whbMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
            const whb = new THREE.Mesh(whbGeo, whbMat);
            whb.renderOrder = 999;
            whb.position.set(scX, scH / 2, scHitZ);
            whb.userData = { wingId: wingIdStr };
            cabinetGroup.add(whb);
            wingHitBoxes.push(whb);
        }
    };

    if (!inEditMode || savedActiveWing === 'center') {
        const scData = centerWing ? centerWing.sideCabinet : null;
        if (scData && scData.side !== 'none' && scData.columns && scData.columns.length > 0) {
            const scSideVal = scData.side;
            if (scSideVal === 'right' || scSideVal === 'both') {
                _renderOneSideCabinet(scData, 'right', 'sideCabinetRight', false);
            }
            if (scSideVal === 'left' || scSideVal === 'both') {
                _renderOneSideCabinet(scData, 'left', 'sideCabinetLeft', false);
            }
        }
    }

    // In sideCabinet edit mode: render only the active side cabinet at origin for front-view editing
    if (inEditMode && (savedActiveWing === 'sideCabinetRight' || savedActiveWing === 'sideCabinetLeft')) {
        const scData = centerWing ? centerWing.sideCabinet : null;
        if (scData && scData.columns && scData.columns.length > 0) {
            const centerD2 = centerWing ? centerWing.depth : 54;
            const _editSide2 = (savedActiveWing === 'sideCabinetRight') ? 'right' : 'left';
            const doorExtra2 = _sideCabDoorExtraForSide(centerWing, _editSide2);
            const scProtrusion2 = (_editSide2 === 'right')
                ? (scData.widthRight || scData.width || 40)
                : (scData.widthLeft  || scData.width || 40);
            const origWidth2 = scData.width;
            const origDepth2 = scData.depth;
            const origColWidth2 = scData.columns[0] ? scData.columns[0].width : null;
            scData.width = centerD2 + doorExtra2;
            scData.depth = scProtrusion2;
            if (scData.columns[0]) {
                scData.columns[0].width = (centerD2 + doorExtra2) - (scData.thickness || 1.7) * 2;
            }

            const scBuildOx2 = doorExtra2 > 0
                ? ((_editSide2 === 'right') ? -doorExtra2 / 2 : doorExtra2 / 2)
                : 0;

            const scEditGroup = new THREE.Group();
            cabinetGroup.add(scEditGroup);
            state.activeWing = savedActiveWing;
            _buildGroup = scEditGroup;
            _isActiveWingBuild = true;
            _buildWingGeometry(scEditGroup, scBuildOx2, 0, 0, true);
            _buildGroup = cabinetGroup;

            scData.width = origWidth2;
            scData.depth = origDepth2;
            if (scData.columns[0] && origColWidth2 !== null) scData.columns[0].width = origColWidth2;
        }
    }

    // Restore active wing
    state.activeWing = savedActiveWing;
    _isActiveWingBuild = true;
    // Expose the active wing's THREE.Group for overlay coordinate transforms.
    // When editing an upper unit inline, _activeWingGroup was already set to the upper unit's group
    // in the upper unit render loop above — don't overwrite it here.
    if (!savedActiveUpperUnit) {
        window._activeWingGroup = null;
        if (savedActiveWing !== 'center') {
            cabinetGroup.children.forEach(child => {
                if (child.isGroup && child.userData && child.userData.wingId === savedActiveWing) {
                    window._activeWingGroup = child;
                }
            });
        }
    }

    // Build full corner unit(s) if any wing has wingPosition === 'full_corner'
    // In edit mode: hide full corner when editing a side wing; show ONLY full corner when editing it
    const isFCEditMode = inEditMode && (savedActiveWing === 'full_corner_right' || savedActiveWing === 'full_corner_left');
    ['left','right'].forEach(side => {
        const fw = state.wings[side];
        if (!fw || fw.wingPosition !== 'full_corner') return;
        // In wing edit mode (editing the side wing): hide the full corner unit
        if (inEditMode && !isFCEditMode) return;
        // In full corner edit mode: only show the matching side's L-unit
        if (isFCEditMode && savedActiveWing !== `full_corner_${side}`) return;
        buildFullCornerUnit(side, fw);
        // Add hit box for the L-unit (only in free mode, not in any edit mode)
        if (!inEditMode) {
            const fcGroup = window[`_fullCornerGroup_${side}`];
            if (fcGroup) {
                const fcSign = (side === 'right') ? 1 : -1;
                const fcW = (fw.fullCorner && fw.fullCorner.size) || 100;
                const fcBodyD = centerWing ? centerWing.depth : state.depth;
                const fcWingD = fw.depth || 54;
                const fcD = fcBodyD + fcWingD; // total L depth
                const fcH = fw.globalHeight || state.globalHeight;
                // L origin (fcGroup.position): back-outer corner
                // L center: -sign*cw/2 in X, +cd/2 in Z from origin
                const fcHitGeo = new THREE.BoxGeometry(fcW + 2, fcH + 2, fcD + 2);
                const fcHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
                const fcHit = new THREE.Mesh(fcHitGeo, fcHitMat);
                fcHit.renderOrder = 999;
                fcHit.position.set(
                    fcGroup.position.x - fcSign * fcW / 2,
                    fcH / 2,
                    fcGroup.position.z + fcD / 2
                );
                fcHit.userData = { wingId: `full_corner_${side}` };
                cabinetGroup.add(fcHit);
                wingHitBoxes.push(fcHit);
            }
        }
    });

    // ── Room wall position: shift cabinetGroup X and add closure panels ──────
    // Only for linear/sliding presets (not corner/walkin)
    //
    // Closure panels form a thin-board surround (like a frame) around the gap:
    //   Side panel  : thin board (_closureW wide, _panelH tall, _cabD deep) — fills gap between wall and cabinet
    //   Ceiling panel: thin board (_ceilTotalW wide, _ceilThick tall, _cabD deep) — caps the top
    //   Depth panel : thin board (_closureW wide, _panelH tall, _depthThick deep) — closes the front face of gap
    //
    // Cabinet shifts by _closureW so its edge touches the side panel.
    // Each panel has its own width slider.
    {
        const _preset = state.presetId || 'linear';
        const _isLinearOrSliding = (_preset === 'linear' || _preset === 'sliding');
        const _rw = _isLinearOrSliding ? (window._roomWall || state.roomWall || 'center') : 'center';

        // Reset ceiling mesh tracking
        window._closureCeilMeshes = [];

        if (_rw !== 'center' && _isLinearOrSliding) {
            const _closureOn   = (window._closureEnabled !== false);
            // Left side panel width
            const _closureW    = _closureOn ? Math.max(1.8, parseFloat(window._closureWidth)      || 1.8) : 0;
            // Right side panel width (used in 'right' and 'both' modes)
            const _closureWR   = _closureOn ? Math.max(1.8, parseFloat(window._closureWidthRight) || 1.8) : 0;
            // Ceiling panel thickness (height of horizontal top panel)
            const _ceilThick   = _closureOn ? Math.max(1.8, parseFloat(window._closureCeilWidth)  || 1.8) : 0;
            // Depth panel thickness (thickness of front-face panel)
            const _depthThick  = _closureOn ? Math.max(1.8, parseFloat(window._closureDepthWidth) || 1.8) : 0;
            // Front-line offset: 'door' extends panels 1.7cm forward to reach door front face
            const _frontOffset = (_closureOn && window._closureFrontLine === 'door') ? 1.7 : 0;

            const _cwFull = state.wings && state.wings.center ? state.wings.center.width : (state.width || 160);
            const _cabD   = state.wings && state.wings.center ? (state.wings.center.depth || 54) : 54;
            const _cabH   = state.columns && state.columns.length > 0
                ? Math.max(...state.columns.map(c => c.height))
                : (state.globalHeight || 240);
            const _thick  = state.thickness || 1.8;
            const _plinth = (state.wings && state.wings.center ? state.wings.center.plinthHeight : state.plinthHeight) || 0;
            const SIDE_MARGIN = 50;
            const MIN_ROOM    = 500;

            // Cabinet stays at X=0 — closure panels are placed to the left/right of the cabinet.
            // Wall positions account for closure panel widths (wall is at outer edge of closure panel).
            // 'left':  left wall  at -_cwFull/2 - _closureW,  right wall at auto/custom
            // 'right': right wall at +_cwFull/2 + _closureWR, left wall  at auto/custom
            // 'both':  left wall  at -_cwFull/2 - _closureW,  right wall at +_cwFull/2 + _closureWR
            cabinetGroup.position.x = 0;

            // Body material for all closure panels
            const _bodyMatKey = (state.wings && state.wings.center)
                ? (state.wings.center.materialBody || state.wings.center.boardMaterial)
                : (state.materialBody || state.boardMaterial);
            const _closureMat = (materials && materials[_bodyMatKey])
                ? materials[_bodyMatKey]
                : new THREE.MeshStandardMaterial({ color: 0xd4c5b0, roughness: 0.7, metalness: 0.0 });

            if (_closureOn) {
                // Cabinet height (top of cabinet in local Y, plinth is already included in _cabH)
                const _panelH = _cabH;
                const _panelY = _panelH / 2;

                // Cabinet stays at X=0. Closure panels are placed adjacent to cabinet edges:
                //   Left panel:  center at -_cwFull/2 - _closureW/2  (fills gap left of cabinet)
                //   Right panel: center at +_cwFull/2 + _closureWR/2 (fills gap right of cabinet)

                // Panel depth: extend by _frontOffset when 'door' front-line is selected
                const _panelD = _cabD + _frontOffset;
                // Panel Z center: shift forward by half the extra depth so back face stays flush
                const _panelDZ = _frontOffset / 2;

                // ── 1a. Left side closure panel ──────────────────────────────────
                const _needLeftPanel = (_rw === 'left' || _rw === 'both');
                const _leftPanelW    = _closureW;
                if (_needLeftPanel && _leftPanelW > 0) {
                    const _sidePanelX = -_cwFull / 2 - _leftPanelW / 2;
                    const _sideMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(_leftPanelW, _panelH, _panelD),
                        _closureMat
                    );
                    _sideMesh.position.set(_sidePanelX, _panelY, _panelDZ);
                    _sideMesh.castShadow = false;
                    _sideMesh.userData = { isClosurePanel: true, side: 'left' };
                    cabinetGroup.add(_sideMesh);
                    state.bpData.push({
                        type: 'closure_panel', subtype: 'side',
                        side: 'left',
                        w: _leftPanelW, h: _panelH, d: _panelD,
                        x: _sidePanelX, y: _panelY
                    });
                }

                // ── 1b. Right side closure panel ─────────────────────────────────
                const _needRightPanel = (_rw === 'right' || _rw === 'both');
                const _rightPanelW    = _closureWR;
                if (_needRightPanel && _rightPanelW > 0) {
                    const _sidePanelXR = _cwFull / 2 + _rightPanelW / 2;
                    const _sideMeshR = new THREE.Mesh(
                        new THREE.BoxGeometry(_rightPanelW, _panelH, _panelD),
                        _closureMat
                    );
                    _sideMeshR.position.set(_sidePanelXR, _panelY, _panelDZ);
                    _sideMeshR.castShadow = false;
                    _sideMeshR.userData = { isClosurePanel: true, side: 'right' };
                    cabinetGroup.add(_sideMeshR);
                    state.bpData.push({
                        type: 'closure_panel', subtype: 'side',
                        side: 'right',
                        w: _rightPanelW, h: _panelH, d: _panelD,
                        x: _sidePanelXR, y: _panelY
                    });
                }

                // ── 2. Ceiling closure panel (thin horizontal board above cabinet) ──
                if (_ceilThick > 0) {
                    let _ceilTotalW, _ceilX;
                    if (_rw === 'both') {
                        // Ceiling spans full width: left gap + cabinet + right gap
                        // Center X = midpoint between left outer edge and right outer edge
                        // Left outer edge:  -_cwFull/2 - _closureW
                        // Right outer edge: +_cwFull/2 + _closureWR
                        // Center: (-_cwFull/2 - _closureW + _cwFull/2 + _closureWR) / 2 = (_closureWR - _closureW) / 2
                        _ceilTotalW = _leftPanelW + _cwFull + _rightPanelW;
                        _ceilX = (_closureWR - _closureW) / 2;
                    } else if (_rw === 'left') {
                        // Ceiling spans: left gap + full cabinet width
                        // Left outer edge: -_cwFull/2 - _closureW, right edge: +_cwFull/2
                        _ceilTotalW = _closureW + _cwFull;
                        _ceilX = -_closureW / 2;
                    } else {
                        // Ceiling spans: full cabinet width + right gap
                        // Left edge: -_cwFull/2, right outer edge: +_cwFull/2 + _closureWR
                        _ceilTotalW = _cwFull + _closureWR;
                        _ceilX = _closureWR / 2;
                    }
                    const _ceilY = _panelH + _ceilThick / 2;
                    const _ceilMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(_ceilTotalW, _ceilThick, _panelD),
                        _closureMat
                    );
                    _ceilMesh.position.set(_ceilX, _ceilY, _panelDZ);
                    _ceilMesh.castShadow = false;
                    _ceilMesh.userData = { isClosurePanel: true, side: 'ceiling' };
                    cabinetGroup.add(_ceilMesh);
                    window._closureCeilMeshes.push(_ceilMesh);
                    state.bpData.push({
                        type: 'closure_panel', subtype: 'ceiling',
                        side: 'ceiling',
                        w: _ceilTotalW, h: _ceilThick, d: _panelD,
                        x: _ceilX, y: _ceilY
                    });
                }
            }

        } else {
            // No wall snap — reset cabinet X offset
            cabinetGroup.position.x = 0;
        }

        // ── Niche closure panels (inside the niche alcove) ────────────────
        // Rendered whenever niche + niche-closure are enabled, regardless of room wall position.
        if (_isLinearOrSliding && window._nicheEnabled && window._nicheClosureEnabled) {
            const _nD2  = Math.max(10, parseFloat(window._nicheDepth) || 30);
            const _nW2  = Math.max(50, parseFloat(window._nicheWidth) || 200);
            const _nc_cwFull = state.wings && state.wings.center ? state.wings.center.width : (state.width || 160);
            const _nc_cabD   = state.wings && state.wings.center ? (state.wings.center.depth || 54) : 54;
            const _nc_cabH   = state.columns && state.columns.length > 0
                ? Math.max(...state.columns.map(c => c.height))
                : (state.globalHeight || 240);
            const _nc_bodyMatKey = (state.wings && state.wings.center)
                ? (state.wings.center.materialBody || state.wings.center.boardMaterial)
                : (state.materialBody || state.boardMaterial);
            const _nc_mat = (materials && materials[_nc_bodyMatKey])
                ? materials[_nc_bodyMatKey]
                : new THREE.MeshStandardMaterial({ color: 0xd4c5b0, roughness: 0.7, metalness: 0.0 });
            // Max side panel thickness = half the gap between niche width and cabinet width
            // (panel can't extend beyond the niche wall)
            const _ncMaxSide = Math.max(1.8, (_nW2 - _nc_cwFull) / 2);
            // Panel thicknesses from user sliders, clamped to niche wall
            const _ncThickL = Math.min(Math.max(1.8, parseFloat(window._nicheClosureWidthLeft)  || 1.8), _ncMaxSide);
            const _ncThickR = Math.min(Math.max(1.8, parseFloat(window._nicheClosureWidthRight) || 1.8), _ncMaxSide);
            const _ncThickC = Math.max(1.8, parseFloat(window._nicheClosureCeilHeight) || 1.8);

            // Panels span from cabinet front face (+_nc_cabD/2) to niche back wall (-_nc_cabD/2 - _nD2)
            // Total panel depth = _nc_cabD + _nD2
            // Panel Z center = (_nc_cabD/2 + (-_nc_cabD/2 - _nD2)) / 2 = -_nD2/2
            const _nichePanelTotalD = _nc_cabD + _nD2;
            const _nichePanelZ      = -_nD2 / 2;

            // Left side panel: placed just to the left of the cabinet left edge
            const _ncLeft = new THREE.Mesh(
                new THREE.BoxGeometry(_ncThickL, _nc_cabH, _nichePanelTotalD),
                _nc_mat
            );
            _ncLeft.position.set(-_nc_cwFull / 2 - _ncThickL / 2, _nc_cabH / 2, _nichePanelZ);
            _ncLeft.castShadow = false;
            _ncLeft.userData = { isClosurePanel: true, side: 'niche-left' };
            cabinetGroup.add(_ncLeft);

            // Right side panel: placed just to the right of the cabinet right edge
            const _ncRight = new THREE.Mesh(
                new THREE.BoxGeometry(_ncThickR, _nc_cabH, _nichePanelTotalD),
                _nc_mat
            );
            _ncRight.position.set(_nc_cwFull / 2 + _ncThickR / 2, _nc_cabH / 2, _nichePanelZ);
            _ncRight.castShadow = false;
            _ncRight.userData = { isClosurePanel: true, side: 'niche-right' };
            cabinetGroup.add(_ncRight);

            // Ceiling panel: spans full niche width, placed above cabinet top
            const _roomH3 = (window._roomHeight && window._roomHeight > 0) ? window._roomHeight : 300;
            const _nicheCeilH = _roomH3 - _nc_cabH;
            if (_nicheCeilH > 0.1) {
                const _ncCeil = new THREE.Mesh(
                    new THREE.BoxGeometry(_nW2, _ncThickC, _nichePanelTotalD),
                    _nc_mat
                );
                _ncCeil.position.set(0, _nc_cabH + _ncThickC / 2, _nichePanelZ);
                _ncCeil.castShadow = false;
                _ncCeil.userData = { isClosurePanel: true, side: 'niche-ceiling' };
                cabinetGroup.add(_ncCeil);
            }
        }
    }

    // Sliding wardrobe overlay (aluminum frame + doors)
    if (state.presetId === 'sliding') {
        buildSlidingDoorCabinet();
    }

    if (typeof addBlueprintSprites === 'function') addBlueprintSprites();
    if(typeof buildDimensionsAndButtonsUI === 'function') buildDimensionsAndButtonsUI();
    if(typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
    if(typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
    if(typeof updateToolbarState === 'function') updateToolbarState();
    if(typeof window._updateMaterialTabVisibility === 'function') window._updateMaterialTabVisibility();

    // Sync height inputs in right sidebar to the tallest column of the active wing
    {
        const _maxH = state.columns && state.columns.length > 0
            ? Math.max(...state.columns.map(c => Math.round(c.height)))
            : Math.round(state.globalHeight);
        const _hSlider = document.getElementById('inp-height');
        const _hNum    = document.getElementById('inp-num-height');
        const _hMobile = document.getElementById('mtb-inp-height');
        const _hMobileNum = document.getElementById('mobile-inp-num-height');
        if (_hSlider)    _hSlider.value    = _maxH;
        if (_hNum)       _hNum.value       = _maxH;
        if (_hMobile)    { if (_hMobile.tagName === 'INPUT') _hMobile.value = _maxH; else _hMobile.textContent = _maxH; }
        if (_hMobileNum) _hMobileNum.value = _maxH;
    }

    // Apply doors visibility state (in case user toggled doors off before rebuild)
    if (window._doorsVisible === false) {
        doorMeshes.forEach(function(m) { m.visible = false; });
    }

    // When closure panels are active, auto-set room height = cabinet height + ceiling panel thickness
    // This must happen BEFORE _buildRoom() so the ceiling plane is placed at the correct height
    {
        const _presetH = state.presetId || 'linear';
        const _isLSH = (_presetH === 'linear' || _presetH === 'sliding');
        const _rwH = _isLSH ? (window._roomWall || state.roomWall || 'center') : 'center';
        const _closureOnH = (window._closureEnabled !== false);
        if (_rwH !== 'center' && _isLSH && _closureOnH) {
            const _cabHH = state.columns && state.columns.length > 0
                ? Math.max(...state.columns.map(c => c.height))
                : (state.globalHeight || 240);
            const _ceilThickH = Math.max(1.8, parseFloat(window._closureCeilWidth) || 1.8);
            const _autoRoomH = Math.round(_cabHH + _ceilThickH);
            window._roomHeight = _autoRoomH;
            const _rhSlider = document.getElementById('inp-room-height');
            const _rhNum    = document.getElementById('inp-num-room-height');
            if (_rhSlider) _rhSlider.value = _autoRoomH;
            if (_rhNum)    _rhNum.value    = _autoRoomH;
        }
    }

    // Rebuild room (floor + walls) to match current cabinet size
    _buildRoom();

    // Sync room width slider to actual computed room width (including closure panels)
    {
        const _preset2 = state.presetId || 'linear';
        const _isLS2 = (_preset2 === 'linear' || _preset2 === 'sliding');
        const _rw2 = _isLS2 ? (window._roomWall || state.roomWall || 'center') : 'center';
        if (_rw2 !== 'center' && _isLS2) {
            const _cw2 = state.wings && state.wings.center ? state.wings.center.width : (state.width || 160);
            const _closureOn2 = (window._closureEnabled !== false);
            const _clW2  = _closureOn2 ? Math.max(1.8, parseFloat(window._closureWidth)      || 1.8) : 0;
            const _clWR2 = _closureOn2 ? Math.max(1.8, parseFloat(window._closureWidthRight) || 1.8) : 0;
            const SIDE_MARGIN2 = 50;
            const MIN_ROOM2 = 500;
            const _customRoomW2 = (window._roomWidth && window._roomWidth > 0) ? window._roomWidth : 0;
            let _leftWall2, _rightWall2;
            if (_rw2 === 'left') {
                _leftWall2  = -_cw2 / 2 - _clW2;
                _rightWall2 = _customRoomW2 > 0 ? (_leftWall2 + _customRoomW2) : Math.max(_cw2 / 2 + SIDE_MARGIN2 * 2, MIN_ROOM2 / 2);
            } else if (_rw2 === 'right') {
                _rightWall2 = _cw2 / 2 + _clWR2;
                _leftWall2  = _customRoomW2 > 0 ? (_rightWall2 - _customRoomW2) : Math.min(-_cw2 / 2 - SIDE_MARGIN2 * 2, -MIN_ROOM2 / 2);
            } else {
                _leftWall2  = -_cw2 / 2 - _clW2;
                _rightWall2 =  _cw2 / 2 + _clWR2;
            }
            const _actualRoomW2 = Math.round(_rightWall2 - _leftWall2);
            const _rwSlider = document.getElementById('inp-room-width');
            const _rwNum    = document.getElementById('inp-num-room-width');
            if (_rwSlider) _rwSlider.value = _actualRoomW2;
            if (_rwNum)    _rwNum.value    = _actualRoomW2;
        }
    }

    if (state.viewMode === 'room-plan' && window._roomPlanSubview === '2d' && typeof window._renderRoomPlan2D === 'function') {
        window._renderRoomPlan2D();
    }

}

// Build a single linear cabinet snapshot into an arbitrary THREE.Group (layout / compare mode).
window.buildCabinetIntoGroup = function(targetGroup) {
    while (targetGroup.children.length > 0) targetGroup.remove(targetGroup.children[0]);

    const savedBuildGroup = _buildGroup;
    const savedIsActive = _isActiveWingBuild;
    const savedActiveWing = state.activeWing;
    const savedActiveUpperUnit = state._activeUpperUnit;

    state._activeUpperUnit = null;
    state.activeWing = 'center';

    const centerWing = state.wings.center;
    if (centerWing) {
        _buildGroup = targetGroup;
        _isActiveWingBuild = false;
        _ppWingId = 'center';
        _buildWingGeometry(targetGroup, 0, 0, 0, false);

        const uuKey = 'upperUnit_center';
        const uuWing = state.wings[uuKey];
        if (uuWing && uuWing._isUpperUnit) {
            const mainH = centerWing.columns && centerWing.columns.length > 0
                ? Math.max(...centerWing.columns.map(c => c.height))
                : (centerWing.globalHeight || 240);
            const upperGroup = new THREE.Group();
            upperGroup.position.y = mainH + (uuWing._upperGap || 60);
            upperGroup.position.x = (uuWing._upperOffsetX || 0);
            state.activeWing = uuKey;
            _buildGroup = upperGroup;
            _isActiveWingBuild = false;
            _ppWingId = uuKey;
            uuWing.columns.forEach(col => { col.noPlinth = true; });
            _buildWingGeometry(upperGroup, 0, 0, 0, false);
            targetGroup.add(upperGroup);
        }
    }

    state.activeWing = savedActiveWing;
    state._activeUpperUnit = savedActiveUpperUnit;
    _buildGroup = savedBuildGroup;
    _isActiveWingBuild = savedIsActive;
};

window.cabinetGroup = cabinetGroup;

// ==========================================
// _drawGroovesOnPanel — bathroom door/drawer fluted rib overlay
// grooveStyle: 'h_grooves' | 'v_grooves' | 'waves'
// Renders dense rounded cylinder ribs protruding from the panel face.
// ==========================================
function _drawGroovesOnPanel(group, grooveStyle, panelW, panelH, panelT, cx, cy, frontZ, panelMat) {
    const _cx = (cx !== undefined) ? cx : 0;
    const _cy = (cy !== undefined) ? cy : 0;
    const _fz = (frontZ !== undefined) ? frontZ : (panelT / 2 + 0.05);

    // Clone the panel material so ribs match the door/drawer appearance exactly.
    const grooveMat = panelMat ? panelMat.clone() : new THREE.MeshStandardMaterial({
        color: 0xd8cfc4, roughness: 0.55, metalness: 0.0
    });

    // All styles use cylinder ribs — radius and pitch vary by style.
    // Each cylinder runs the full length of the panel (vertical or horizontal).
    // Positioned so the cylinder center is AT the panel front face → half protrudes out, half is inside.
    const RIB_SEGS = 12; // radial segments for smooth cylinder

    if (grooveStyle === 'v_grooves') {
        // Vertical flat stripes — BoxGeometry, 2cm wide, 3mm protrusion, 3mm gap between stripes
        const STRIPE_W   = 2.0;  // cm — stripe width
        const STRIPE_D   = 0.3;  // cm — protrusion depth (3mm)
        const STRIPE_GAP = 0.3;  // cm — gap between stripes (3mm)
        const STRIPE_PITCH = STRIPE_W + STRIPE_GAP; // 2.3cm center-to-center
        const numStripes = Math.floor(panelW / STRIPE_PITCH);
        const startX     = _cx - ((numStripes - 1) * STRIPE_PITCH) / 2;
        const stripeGeo  = new THREE.BoxGeometry(STRIPE_W, panelH, STRIPE_D);
        for (let i = 0; i < numStripes; i++) {
            const stripe = new THREE.Mesh(stripeGeo, grooveMat);
            stripe.position.set(startX + i * STRIPE_PITCH, _cy, _fz + STRIPE_D / 2);
            group.add(stripe);
        }

    } else if (grooveStyle === 'h_grooves') {
        // Horizontal flat stripes — BoxGeometry, 2cm tall, 3mm protrusion, 3mm gap between stripes
        const STRIPE_H   = 2.0;  // cm — stripe height
        const STRIPE_D   = 0.3;  // cm — protrusion depth (3mm)
        const STRIPE_GAP = 0.3;  // cm — gap between stripes (3mm)
        const STRIPE_PITCH = STRIPE_H + STRIPE_GAP; // 2.3cm center-to-center
        const numStripes = Math.floor(panelH / STRIPE_PITCH);
        const startY     = _cy - ((numStripes - 1) * STRIPE_PITCH) / 2;
        const stripeGeo  = new THREE.BoxGeometry(panelW, STRIPE_H, STRIPE_D);
        for (let i = 0; i < numStripes; i++) {
            const stripe = new THREE.Mesh(stripeGeo, grooveMat);
            stripe.position.set(_cx, startY + i * STRIPE_PITCH, _fz + STRIPE_D / 2);
            group.add(stripe);
        }

    } else if (grooveStyle === 'waves') {
        // Rounded fluted ribs — cylinder bumps, 0.5cm radius, 1.1cm pitch
        const RIB_R     = 0.5;
        const RIB_PITCH = 1.1;
        const numRibs   = Math.floor(panelW / RIB_PITCH);
        const startX    = _cx - ((numRibs - 1) * RIB_PITCH) / 2;
        const ribGeo    = new THREE.CylinderGeometry(RIB_R, RIB_R, panelH, RIB_SEGS);
        for (let i = 0; i < numRibs; i++) {
            const rib = new THREE.Mesh(ribGeo, grooveMat);
            rib.position.set(startX + i * RIB_PITCH, _cy, _fz);
            group.add(rib);
        }
    }
}

function _getHandleStyle() {
    if (state.cabinetModel === 'ab2') return 'touch';
    const s = state.handleStyle || 'pipe';
    return (s === 'touch' || s === 'riding' || s === 'pipe') ? s : 'pipe';
}

function _handleMat3D() {
    return new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 });
}

const RIDING_HANDLE_LEN = 30; // cm — standard riding-handle length

function _ridingHandleMat() {
    return new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.35, roughness: 0.45 });
}

/** Riding handle on doors: tall vertical profile on the seam between door leaves. */
function _addRidingDoorHandle(group, x, y, zFace, doorH) {
    const mat = _ridingHandleMat();
    const handleH = Math.min(RIDING_HANDLE_LEN, Math.max(8, (doorH || 60) - 2));
    const profileW = 1.0;
    const profileD = 1.1;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(profileW, handleH, profileD), mat);
    handle.position.set(x, y, zFace + profileD / 2);
    group.add(handle);
}

/** Riding handle on drawers: slim horizontal profile on the top edge of the front. */
function _addRidingDrawerHandle(mesh, panelW, panelH) {
    const mat = _ridingHandleMat();
    const t = state.thickness;
    const barLen = Math.min(RIDING_HANDLE_LEN, Math.max(8, (panelW || 40) - 3));
    const barH = 0.75;
    const barD = 0.9;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(barLen, barH, barD), mat);
    bar.position.set(0, panelH / 2 - barH / 2 - 0.15, t / 2 + barD / 2 + 0.4);
    mesh.add(bar);
}

function _addPanelHandleLocal(mesh, panelW, panelH, style) {
    if (style === 'touch') return;
    const t = state.thickness;
    if (style === 'riding') {
        _addRidingDrawerHandle(mesh, panelW, panelH);
    } else {
        const handleH = Math.min((panelH || 40) * 0.35, 15);
        const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, handleH, 16).rotateZ(Math.PI / 2),
            _handleMat3D()
        );
        handle.position.set(0, 0, t / 2 + 1.5);
        mesh.add(handle);
    }
}

/** Internal drawer cell: visible carcass frame + recessed drawer boxes (sliding wardrobe style). */
function _renderInternalDrawerBoxCell(opts) {
    const {
        createBoard, matInternal,
        centerX, cellWidth, cellBottomY, compH, count,
        shelfFrontZ, cabinetBackZ,
        partIdPrefix,
    } = opts;

    const frameT = state.thickness;
    const sideSpacerT = 2.8; // 28mm — clearance panel beside column/partition wall
    const innerGap = 0.4;
    const fingerGap = 2.5;
    const drawerH = (compH - innerGap * (count + 1)) / count;
    const actualDrawerH = drawerH - fingerGap;
    const cellCenterY = cellBottomY + compH / 2;
    const openingFrontZ = shelfFrontZ + 0.1; // back face of front frame rail
    const boxFrameFrontFaceZ = openingFrontZ + frameT; // shared front line for box + 28mm sides
    const frameZ = openingFrontZ + frameT / 2;

    // 28mm side panels — same front Z as drawer box frame
    const sideSpacerFrontZ = boxFrameFrontFaceZ;
    const sideSpacerD = sideSpacerFrontZ - cabinetBackZ;
    const sideSpacerCenterZ = cabinetBackZ + sideSpacerD / 2;

    const cellLeft = centerX - cellWidth / 2;
    const cellRight = centerX + cellWidth / 2;

    createBoard(sideSpacerT, compH, sideSpacerD, cellLeft + sideSpacerT / 2, cellCenterY, sideSpacerCenterZ, matInternal);
    createBoard(sideSpacerT, compH, sideSpacerD, cellRight - sideSpacerT / 2, cellCenterY, sideSpacerCenterZ, matInternal);

    // Drawer box envelope (17mm frame) — inset in X after 28mm spacers, forward in Z
    const boxLeft = cellLeft + sideSpacerT;
    const boxRight = cellRight - sideSpacerT;
    const boxW = boxRight - boxLeft;
    const boxCenterX = centerX;

    createBoard(boxW, frameT, frameT, boxCenterX, cellBottomY + compH - frameT / 2, frameZ, matInternal);
    createBoard(boxW, frameT, frameT, boxCenterX, cellBottomY + frameT / 2, frameZ, matInternal);
    createBoard(frameT, compH - frameT * 2, frameT, boxLeft + frameT / 2, cellCenterY, frameZ, matInternal);
    createBoard(frameT, compH - frameT * 2, frameT, boxRight - frameT / 2, cellCenterY, frameZ, matInternal);

    const drawerFrontClearance = 0.3; // 3mm gap — drawer fronts not flush with frame opening
    const drawerFrontFaceZ = openingFrontZ - drawerFrontClearance;
    const drwFrontCenterZ = drawerFrontFaceZ - frameT / 2;
    const drwBackZ = cabinetBackZ;
    const drwD = (drawerFrontFaceZ - frameT) - drwBackZ;
    const drwCenterZ = drwBackZ + drwD / 2;
    const drwW = boxW - frameT * 2;

    for (let d = 0; d < count; d++) {
        const dY = cellBottomY + innerGap + drawerH / 2 + (d * (drawerH + innerGap));
        const boxH = actualDrawerH;
        const boxCenterY = dY - fingerGap / 2;
        const boxBottomY = boxCenterY - boxH / 2;

        if (partIdPrefix) {
            _ppPartId = `${partIdPrefix}_d${d}`;
        }
        createBoard(drwW, boxH, frameT, boxCenterX, boxCenterY, drwFrontCenterZ, matInternal);
        if (partIdPrefix) _ppPartId = '';

        createBoard(drwW, frameT, drwD, boxCenterX, boxBottomY + frameT / 2, drwCenterZ, matInternal);
        createBoard(frameT, boxH, drwD, boxCenterX - drwW / 2 + frameT / 2, boxCenterY, drwCenterZ, matInternal);
        createBoard(frameT, boxH, drwD, boxCenterX + drwW / 2 - frameT / 2, boxCenterY, drwCenterZ, matInternal);
        createBoard(drwW - frameT * 2, boxH, frameT, boxCenterX, boxCenterY, drwBackZ + frameT / 2, matInternal);
    }
}

function _buildWingGeometry(targetGroup, _offsetX, _offsetY, _offsetZ, isActiveWing) {
    const isBP = state.viewMode === 'blueprint';
    const bpMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    
    const matBody = isBP ? bpMat : materials[state.materialBody];
    const matInternal = isBP ? bpMat : materials[state.materialInternal];
    const _awBuild = state.activeWing;
    const _isSideCabWing = (_awBuild === 'sideCabinetRight' || _awBuild === 'sideCabinetLeft');
    const _centerForDoors = state.wings && state.wings.center;
    const _externalMatKey = (_isSideCabWing && _centerForDoors)
        ? (_centerForDoors.materialExternal || 'white_matte')
        : state.materialExternal;
    const matExternal = isBP ? bpMat : materials[_externalMatKey];
    const matDesk = isBP ? bpMat : materials[state.materialDesk];
    const matOpenCell = isBP ? bpMat : materials[state.materialOpenCell];
    const matBack = isBP ? bpMat : (materials[state.materialBack] || materials[state.materialBody]);
    const matTopPanel = isBP ? bpMat : (materials[state.materialTopPanel] || materials[state.materialBody]);
    const activeEdgeMat = isBP ? new THREE.LineBasicMaterial({ color: 0x000000 }) : edgeMat;

    const _ox = _offsetX || 0;

    const t = state.thickness;
    const bodyD = state.depth;
    const deskT = 2.8; // 28mm — all desk horizontal surfaces
    const _deskDrawerFZ = bodyD / 2 - t / 2 - 1.5; // recessed inside frame (like internal drawers)
    // For sliding wardrobes: internal column partitions are set back 6cm from the front face
    const _isSlidingWardrobe = state.presetId === 'sliding' && state.slidingDoor && state.slidingDoor.enabled;
    const _slidingPartSetback = 6; // cm — front 6cm reserved for door track
    const _slidingPartD = _isSlidingWardrobe ? (bodyD - _slidingPartSetback) : bodyD;
    const _slidingPartZ = _isSlidingWardrobe ? (-_slidingPartSetback / 2) : 0; // shift back so front face is 6cm behind cabinet front
    const backT = 0.5;
    const _shelfFrontSetback = 2; // cm — shelves stop 2cm short of cabinet front
    const isInset = (state.cabinetModel === 'ab2' || state.cabinetModel === 'ab2_nohoney');
    const _handleStyle = _getHandleStyle();
    const isTouch = (_handleStyle === 'touch');
    const isRegalim = (state.cabinetModel === 'regalim');

    // ---- רגלי ניקל: מצויר פעם אחת לכל כנף (לא לכל עמודה) ----
    // פלטה: 1.7 ס"מ עובי, רוחב מלא, יושבת על הרגליים
    // רגליים: גליל קוטר 5 ס"מ, חומר ניקל
    // Blueprint: מצייר את הפלטה ואת הרגליים כמלבנים
    if (isRegalim && isBP) {
        const legH = state.plinthHeight - t;
        // פלטה
        const plateGeo = new THREE.PlaneGeometry(state.width, t);
        const plateMesh = new THREE.Mesh(plateGeo, bpMat);
        plateMesh.position.set(0, legH + t / 2, 0);
        plateMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(plateGeo), activeEdgeMat));
        _buildGroup.add(plateMesh);
        // רגליים — מלבנים בגובה legH, רוחב = קוטר הרגל (5 ס"מ)
        const legR = 2.5;
        const legD = legR * 2; // קוטר = 5 ס"מ
        const cabinetW = state.width;
        const halfW = cabinetW / 2;
        const insetX = 3;
        let legPositionsX;
        if (cabinetW <= 110) {
            legPositionsX = [-halfW + insetX, halfW - insetX];
        } else if (cabinetW <= 180) {
            legPositionsX = [-halfW + insetX, 0, halfW - insetX];
        } else {
            const q = cabinetW / 3;
            legPositionsX = [-halfW + insetX, -halfW + q, halfW - q, halfW - insetX];
        }
        legPositionsX.forEach(lx => {
            const legGeo = new THREE.PlaneGeometry(legD, legH);
            const legMesh = new THREE.Mesh(legGeo, bpMat);
            legMesh.position.set(lx, legH / 2, 0);
            legMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(legGeo), activeEdgeMat));
            _buildGroup.add(legMesh);
        });
    }

    if (isRegalim && !isBP) {
        const isBathroomStanding = (state.presetId === 'bathroom' &&
            state.wings.center && state.wings.center.bathroomStyle === 'standing');

        const legH = state.plinthHeight - t;
        const legMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c1, metalness: 0.9, roughness: 0.2, envMapIntensity: 1.2 });
        if (window._hdrEnvMap) { legMat.envMap = window._hdrEnvMap; legMat.needsUpdate = true; }
        const cabinetW = state.width;
        const halfW = cabinetW / 2;
        const halfD = bodyD / 2;
        const insetX = 3;
        const insetZ = 3;
        const legZPositions = [-halfD + insetZ, halfD - insetZ];

        if (isBathroomStanding) {
            // ---- רגלי חרוט לארון אמבטיה: 4 פינות בלבד, מוטות החוצה ----
            // צורה: חרוט עם רדיוס עליון רחב ורדיוס תחתון צר (לא מחודד — כמו ברגל ריהוט)
            const LEG_TOP_R   = 2.2;  // רדיוס עליון (ס"מ) — רחב, מחובר לפלטה
            const LEG_BOT_R   = 0.9;  // רדיוס תחתון (ס"מ) — צר אך לא מחודד
            const LEG_SEGS    = 20;
            const SPLAY_ANGLE = 0.18; // ~10° הטיה החוצה
            const cornerPositionsX = [-halfW + insetX, halfW - insetX];

            cornerPositionsX.forEach((lx, xi) => {
                legZPositions.forEach((lz, zi) => {
                    const legGeo = new THREE.CylinderGeometry(LEG_TOP_R, LEG_BOT_R, legH, LEG_SEGS);
                    const legMesh = new THREE.Mesh(legGeo, legMat);
                    const signX = xi === 0 ? -1 : 1;  // left corner tilts left (outward), right tilts right
                    const signZ = zi === 0 ? 1 : -1;  // back corner tilts forward (outward), front tilts back
                    legMesh.rotation.x = signZ * SPLAY_ANGLE;
                    legMesh.rotation.z = signX * SPLAY_ANGLE;
                    legMesh.position.set(lx, legH / 2, lz);
                    legMesh.castShadow = false;
                    _buildGroup.add(legMesh);
                });
            });
        } else {
            // ---- רגלי ניקל רגילות: גליל, מספר לפי רוחב ----
            const legR = 2.5;
            let legPositionsX;
            if (cabinetW <= 110) {
                legPositionsX = [-halfW + insetX, halfW - insetX];
            } else if (cabinetW <= 180) {
                legPositionsX = [-halfW + insetX, 0, halfW - insetX];
            } else {
                const q = cabinetW / 3;
                legPositionsX = [-halfW + insetX, -halfW + q, halfW - q, halfW - insetX];
            }

            legPositionsX.forEach(lx => {
                legZPositions.forEach(lz => {
                    const legGeo = new THREE.CylinderGeometry(legR, legR, legH, 24);
                    const legMesh = new THREE.Mesh(legGeo, legMat);
                    legMesh.position.set(lx, legH / 2, lz);
                    legMesh.castShadow = false;
                    _buildGroup.add(legMesh);
                });
            });
        }

        // פלטה: לוח ברוחב מלא על גבי הרגליים
        const plateGeo = new THREE.BoxGeometry(cabinetW, t, bodyD);
        const plateMesh = new THREE.Mesh(plateGeo, matBody);
        plateMesh.position.set(0, legH + t / 2, 0);
        plateMesh.castShadow = false;
        plateMesh.receiveShadow = true;
        plateMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(plateGeo), activeEdgeMat));
        _buildGroup.add(plateMesh);
    }

    function _ppResolveMat(baseMat, partIdSuffix) {
        if (isBP || !partIdSuffix) return baseMat;
        const overrideKey = window._getPartColorOverride(_ppWingId, partIdSuffix);
        if (overrideKey && materials[overrideKey]) return materials[overrideKey];
        return baseMat;
    }

    function _ppRegisterMesh(mesh, partIdSuffix) {
        if (isBP || !partIdSuffix || !mesh) return;
        mesh.userData.partId = window._scopedPartColorId(_ppWingId, partIdSuffix);
        window.partMeshes.push(mesh);
    }

    function createBoard(w, h, d, x, y, z, specificMat = matBody) {
        // Part-paint mode: apply per-part color override if one exists
        if (!isBP && _ppPartId) {
            const overrideKey = window._getPartColorOverride(_ppWingId, _ppPartId);
            if (overrideKey && materials[overrideKey]) {
                specificMat = materials[overrideKey];
            }
        }

        let geometry;
        if (isBP) {
            geometry = new THREE.PlaneGeometry(w, h);
            z = 0;
        } else {
            geometry = new THREE.BoxGeometry(w, h, d);
            
            // אלגוריתם לתיקון מתיחת טקסטורות (UV Mapping חכם)
            if (specificMat.map) { // בודק אם לחומר הזה יש תמונת טקסטורה
                const textureSize = 100; // התמונה המקורית תייצג שטח של 100x100 ס"מ (אפשר לשנות אם העץ גדול/קטן מדי)
                const uv = geometry.attributes.uv;
                
                // פאות צד (ימין ושמאל) - רוחב הפאה הוא העומק (d), והגובה הוא (h)
                for (let i = 0; i < 8; i++) {
                    uv.setXY(i, uv.getX(i) * (d / textureSize), uv.getY(i) * (h / textureSize));
                }
                // פאות למעלה ולמטה (גג ורצפה) - הרוחב הוא (w), והגובה הוא העומק (d)
                for (let i = 8; i < 16; i++) {
                    uv.setXY(i, uv.getX(i) * (w / textureSize), uv.getY(i) * (d / textureSize));
                }
                // פאות חזית וגב (דלתות וגב ארון) - הרוחב הוא (w), והגובה הוא (h)
                for (let i = 16; i < 24; i++) {
                    uv.setXY(i, uv.getX(i) * (w / textureSize), uv.getY(i) * (h / textureSize));
                }
                uv.needsUpdate = true;
            }
        }
        
        const mesh = new THREE.Mesh(geometry, specificMat);
        mesh.position.set(x, y, z);
        mesh.castShadow = false;       // cabinet boards don't cast shadows
        mesh.receiveShadow = !isBP;
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), activeEdgeMat));
        _buildGroup.add(mesh);
        // Tag mesh for part-paint mode
        if (!isBP && _ppPartId) {
            mesh.userData.partId = window._scopedPartColorId(_ppWingId, _ppPartId);
            window.partMeshes.push(mesh);
        }
        return mesh;
    }

    // Helper: apply continuous aspect-ratio UV to top/bottom faces (indices 8-15) of a horizontal board
    // colLeftX = left edge X of this board in cabinet space; totalW = full cabinet width
    // boardW = width of this board; boardD = depth of this board
    // NOTE: createBoard already scales UV by (w/100, d/100) for top/bottom faces, so we use raw 0/1 values directly.
    function _applyHorizBoardUV(mesh, colLeftX, boardW, boardD, totalW) {
        if (!mesh || !mesh.geometry || !mesh.material || !mesh.material.map) return;
        const uv = mesh.geometry.attributes.uv;
        // U axis = along width (continuous): uStart = colLeftX / totalW, uEnd = (colLeftX + boardW) / totalW
        const uStart = (colLeftX + totalW / 2) / totalW;
        const uEnd = uStart + boardW / totalW;
        // V axis = along depth, aspect-ratio-preserved relative to totalW, centered
        const vScale = boardD / totalW;
        const vOffset = (1 - vScale) / 2;
        // BoxGeometry top/bottom raw UV corners (before any scaling):
        // i=8:(0,1), i=9:(1,1), i=10:(0,0), i=11:(1,0) — top face
        // i=12:(0,1), i=13:(1,1), i=14:(0,0), i=15:(1,0) — bottom face
        const rawU = [0,1,0,1, 0,1,0,1];
        const rawV = [1,1,0,0, 1,1,0,0];
        for (let i = 8; i < 16; i++) {
            const origU = rawU[i - 8]; // 0 or 1 (left/right in width)
            const origV = rawV[i - 8]; // 0 or 1 (front/back in depth)
            // 90° CW: newU = origV (depth), newV = 1 - origU (width reversed)
            const newU = vOffset + origV * vScale;
            const newV = uStart + (1 - origU) * (uEnd - uStart);
            uv.setXY(i, newU, newV);
        }
        uv.needsUpdate = true;
    }

    // Helper: apply shelf UV — 90° CW rotation, natural size (1 tile per 100cm),
    // per-shelf offset and alternating horizontal flip for variety.
    // shelfIdx: div.idx (shelf index within column), boardW: shelf width, boardD: shelf depth
    function _applyShelfUV(mesh, boardW, boardD, shelfIdx) {
        if (!mesh || !mesh.geometry || !mesh.material || !mesh.material.map) return;
        const textureSize = 100;
        const uv = mesh.geometry.attributes.uv;
        const spanW = boardW / textureSize;
        const spanD = boardD / textureSize;
        const uShift = (((shelfIdx * 0.37) % 1) + 1) % 1 * spanW;
        const flip = (shelfIdx % 2 === 1);
        // BoxGeometry top/bottom raw UV corners (before any scaling):
        // i=8:(0,1), i=9:(1,1), i=10:(0,0), i=11:(1,0) — top face
        // i=12:(0,1), i=13:(1,1), i=14:(0,0), i=15:(1,0) — bottom face
        const rawU = [0, 1, 0, 1, 0, 1, 0, 1];
        const rawV = [1, 1, 0, 0, 1, 1, 0, 0];
        for (let i = 8; i < 16; i++) {
            const origU = rawU[i - 8];
            const origV = rawV[i - 8];
            // 90° CW: depth → U, width (reversed) → V — physical cm, not stretched to 0..1
            const newU = origV * spanD;
            const widthT = flip ? origU : (1 - origU);
            const newV = widthT * spanW + uShift;
            uv.setXY(i, newU, newV);
        }
        uv.needsUpdate = true;
    }

    // Helper: apply continuous UV to ALL visible faces of a vertical wall/partition segment.
    // segBottomY: bottom Y of this segment; segH: height of this segment; totalH: full wall height
    // wallD: board depth (d = bodyD, the large visible dimension when viewed from the side)
    // wallT: board thickness (w = t, thin dimension)
    // Texture fits to full height (V: 0→1 across totalH), U = 0→1 fills full face width.
    function _applyVertWallUV(mesh, segBottomY, segH, totalH, wallD, wallT) {
        if (!mesh || !mesh.geometry || !mesh.material || !mesh.material.map) return;
        const uv = mesh.geometry.attributes.uv;
        // V: this segment occupies [segBottomY/totalH .. (segBottomY+segH)/totalH] of the full texture
        const vStart = segBottomY / totalH;
        const vEnd = (segBottomY + segH) / totalH;
        // Raw UV corners: (0,0),(1,0),(0,1),(1,1) per face
        const rawU = [0,1,0,1, 0,1,0,1];
        const rawV = [0,0,1,1, 0,0,1,1];

        // --- Front/back faces (indices 16-23): large visible side face ---
        // U = 0→1 fills full face width; V = continuous slice of full height
        for (let i = 16; i < 24; i++) {
            uv.setXY(i, rawU[i - 16], vStart + rawV[i - 16] * (vEnd - vStart));
        }

        // --- Side faces (indices 0-7): thin front-facing edge ---
        // U = 0→1 fills full face width; V = continuous slice of full height
        for (let i = 0; i < 8; i++) {
            uv.setXY(i, rawU[i], vStart + rawV[i] * (vEnd - vStart));
        }

        uv.needsUpdate = true;
    }

    if (state.presetId === 'writing-desk') {
        const wd = (state.wings && state.wings.center && state.wings.center.writingDesk) || state.writingDesk || {};
        const dWidth = state.width;
        const dHeight = wd.height != null ? wd.height : 75;
        const drawerH = wd.drawerHeight != null ? wd.drawerHeight : 12;
        const hasDrawers = wd.hasDrawers !== false;
        const legLeftX = -dWidth / 2 + t / 2;
        const legRightX = dWidth / 2 - t / 2;
        const legH = dHeight - deskT;

        createBoard(dWidth, deskT, bodyD, 0, dHeight - deskT / 2, 0, matBody);
        createBoard(t, legH, bodyD, legLeftX, legH / 2, 0, matBody);
        createBoard(t, legH, bodyD, legRightX, legH / 2, 0, matBody);

        if (hasDrawers) {
            const numDrawers = (wd.drawerCount != null) ? wd.drawerCount : (dWidth <= 80 ? 1 : 2);
            const gap = 0.4;
            const innerWidth = dWidth - 2 * t;
            const drawerWidth = (innerWidth - gap * (numDrawers + 1)) / numDrawers;
            const drawerBottomY = dHeight - deskT - drawerH;
            const drawerCenterY = drawerBottomY + drawerH / 2;
            if (!isBP) createBoard(innerWidth, deskT, bodyD - 2, 0, drawerBottomY + deskT / 2, 0, matBody);
            for (let i = 0; i < numDrawers; i++) {
                const dx = -innerWidth / 2 + gap + drawerWidth / 2 + i * (drawerWidth + gap);
                _ppPartId = `wd_drawer_d${i}`;
                const mesh = createBoard(drawerWidth, drawerH, t, dx, drawerCenterY, _deskDrawerFZ, matExternal);
                _ppPartId = '';
                if (!isBP) _addPanelHandleLocal(mesh, drawerWidth, drawerH, _handleStyle);
                if (!isBP) {
                    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 2, 2.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                    backPanel.position.set(dx, drawerBottomY + drawerH - 1.25, _deskDrawerFZ - t / 2 - 0.25);
                    _buildGroup.add(backPanel);
                }
            }
        }

        if (isActiveWing) {
            state.dimData.push({ isDeskHeight: true, x: legRightX + 20, y: dHeight / 2, h: dHeight });
            state.dimData.push({ isDeskWidth: true, x: 0, y: dHeight + 20, h: dWidth });
            if (isBP) {
                state.bpData.push({ type: 'width', val: Math.round(dWidth), x: 0, y: -20, halfW: dWidth / 2 });
                state.bpData.push({ type: 'height', val: Math.round(dHeight), x: legRightX + 15, y: dHeight / 2, halfH: dHeight / 2 });
                state.bpData.push({ type: 'width', val: Math.round(state.depth), x: 0, y: -45, halfW: state.depth / 2 });
            }
            if (!isBP) {
                dragHandlesData.desk.push({ type: 'deskHeight', x: legRightX, y: dHeight, writingDesk: true });
                dragHandlesData.desk.push({ type: 'deskWidth', side: 'right', x: legRightX, y: dHeight / 2, writingDesk: true });
                if (hasDrawers) dragHandlesData.desk.push({ type: 'deskDrawer', x: 0, y: dHeight - deskT - drawerH, writingDesk: true });
                const deskHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
                const deskHitBox = new THREE.Mesh(new THREE.BoxGeometry(dWidth, dHeight, bodyD), deskHitMat);
                deskHitBox.position.set(0, dHeight / 2, 0);
                deskHitBox.userData = { isDesk: true };
                _buildGroup.add(deskHitBox);
                deskHitBoxes.push(deskHitBox);
            }
        }
        return;
    }

    if (state.desk.side !== 'none') {
        const dSide = state.desk.side;
        const dWidth = state.desk.width;
        const dHeight = state.desk.height;
        const drawerH = state.desk.drawerHeight;
        let startX = (dSide === 'left') ? (-state.width/2) : (state.width/2);
        let dir = (dSide === 'left') ? -1 : 1;
        const surfaceCenterX = startX + dir * (dWidth / 2);
        createBoard(dWidth, deskT, bodyD, surfaceCenterX, dHeight - deskT/2, 0, matDesk); 
        const legX = startX + dir * (dWidth - t/2);
        createBoard(t, dHeight - deskT, bodyD, legX, (dHeight - deskT)/2, 0, matDesk); 
        if (state.desk.hasDrawers) {
            const numDrawers = (state.desk.drawerCount != null) ? state.desk.drawerCount : (dWidth <= 80 ? 1 : 2);
            const gap = 0.4; const innerWidth = dWidth - t;
            const drawerWidth = (innerWidth - gap*(numDrawers+1)) / numDrawers;
            const drawerBottomY = dHeight - deskT - drawerH;
            const drawerCenterY = drawerBottomY + drawerH/2;
            createBoard(innerWidth, deskT, bodyD - 2, startX + dir * (innerWidth/2), drawerBottomY + deskT/2, 0, matDesk);
            for(let i=0; i<numDrawers; i++) {
                let dx = (dSide === 'left') ? (startX - innerWidth) + gap + drawerWidth/2 + i * (drawerWidth + gap) : startX + gap + drawerWidth/2 + i * (drawerWidth + gap);
                _ppPartId = `desk_drawer_d${i}`;
                let mesh = createBoard(drawerWidth, drawerH, t, dx, drawerCenterY, _deskDrawerFZ, matExternal);
                _ppPartId = '';
                if (!isBP) _addPanelHandleLocal(mesh, drawerWidth, drawerH, _handleStyle);
                if (!isBP) {
                    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 2, 2.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                    backPanel.position.set(dx, drawerBottomY + drawerH - 1.25, _deskDrawerFZ - t/2 - 0.25);
                    _buildGroup.add(backPanel);
                }
            }
        }
        if (_isActiveWingBuild || isBP) {
            state.dimData.push({ isDeskHeight: true, x: legX + (dSide==='left'? -20 : 20), y: dHeight/2, h: dHeight });
            state.dimData.push({ isDeskWidth: true, x: surfaceCenterX, y: dHeight + 20, h: dWidth });
            if (isBP) {
                // Add desk dimensions to blueprint overlay
                state.bpData.push({ type: 'width', val: Math.round(dWidth), x: surfaceCenterX, y: -20, halfW: dWidth / 2 });
                state.bpData.push({ type: 'height', val: Math.round(dHeight), x: legX + (dSide === 'left' ? -15 : 15), y: dHeight / 2, halfH: dHeight / 2 });
            }
            if(!isBP) dragHandlesData.desk.push({ type: 'deskHeight', x: legX, y: dHeight });
            if(!isBP) dragHandlesData.desk.push({ type: 'deskWidth', side: dSide, x: legX, y: dHeight/2 });
            if(!isBP && state.desk.hasDrawers) dragHandlesData.desk.push({ type: 'deskDrawer', x: surfaceCenterX, y: dHeight - deskT - drawerH });
            // Invisible hitbox covering the full desk area for hover detection
            if (!isBP) {
                const deskHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
                const deskHitBox = new THREE.Mesh(new THREE.BoxGeometry(dWidth, dHeight, bodyD), deskHitMat);
                deskHitBox.position.set(surfaceCenterX, dHeight / 2, 0);
                deskHitBox.userData = { isDesk: true };
                _buildGroup.add(deskHitBox);
                deskHitBoxes.push(deskHitBox);
            }
        }
    }

    let leftWallHoles = [];
    let rightWallHoles = [];
    let internalHoles = Array(state.columns.length).fill().map(() => []); 
    let columnBlocks = [];

    for (let c = 0; c < state.columns.length; c++) {
        const col = state.columns[c];
        const _fo = col.floorOffset || 0;
        let startShelvesY = _fo > 0 ? _fo + t : state.plinthHeight + t;
        if (col.type === 'desk') startShelvesY = col.deskHeight + col.deskClearance + deskT;
        let dividers = [];
        col.shelvesY.forEach((y, idx) => dividers.push({ y: y, type: 'shelf', thick: t, idx: idx }));
        if (col.splitY && col.splitY > startShelvesY) dividers.push({ y: col.splitY, type: 'split', thick: 2*t, idx: -1 });
        dividers.sort((a, b) => a.y - b.y);
        
        let blocks = [];
        let currentBlock = null;
        for (let r = 0; r <= dividers.length; r++) {
            const type = col.compartments[r] ? col.compartments[r].type : 'empty';
            if (type === 'open_cell' || type === 'side_open_cell') {
                if (!currentBlock || currentBlock.type !== type) {
                    if (currentBlock) blocks.push(currentBlock);
                    currentBlock = { type: type, startR: r, endR: r };
                } else {
                    currentBlock.endR = r;
                }
            } else {
                if (currentBlock) { blocks.push(currentBlock); currentBlock = null; }
            }
        }
        if (currentBlock) blocks.push(currentBlock);

        blocks.forEach(block => {
            block.bottomY = (block.startR === 0) ? startShelvesY : dividers[block.startR - 1].y + dividers[block.startR - 1].thick/2;
            block.topY = (block.endR === dividers.length) ? col.height - t : dividers[block.endR].y - dividers[block.endR].thick/2;
            block.h = block.topY - block.bottomY;
            block.centerY = block.bottomY + block.h / 2;
            
            if (block.type === 'side_open_cell') {
                // A side is "open" if:
                //   1. It's the outer wall (c===0 or c===last), OR
                //   2. The neighboring column's height is at or below the block bottom (short column), OR
                //   3. The neighboring column is a floating/hanging unit whose floorOffset is ABOVE
                //      the block's bottom — meaning there is no wall panel at that height.
                const leftNeighbor  = state.columns[c-1];
                const rightNeighbor = state.columns[c+1];
                let opensLeft = c === 0
                    || (leftNeighbor && leftNeighbor.height <= block.bottomY + 0.5)
                    || (leftNeighbor && (leftNeighbor.floorOffset || 0) > block.bottomY + 0.5);
                let opensRight = c === state.columns.length - 1
                    || (rightNeighbor && rightNeighbor.height <= block.bottomY + 0.5)
                    || (rightNeighbor && (rightNeighbor.floorOffset || 0) > block.bottomY + 0.5);
                
                if (opensLeft && opensRight) {
                    block.openDir = (c < state.columns.length / 2) ? 'left' : 'right';
                } else if (opensLeft) {
                    block.openDir = 'left';
                } else if (opensRight) {
                    block.openDir = 'right';
                } else {
                    block.openDir = 'none'; 
                }

                if (block.openDir === 'left') {
                    if (c === 0) leftWallHoles.push({ bottom: block.bottomY, top: block.topY });
                    else internalHoles[c-1].push({ bottom: block.bottomY, top: block.topY });
                } else if (block.openDir === 'right') {
                    if (c === state.columns.length - 1) rightWallHoles.push({ bottom: block.bottomY, top: block.topY });
                    else internalHoles[c].push({ bottom: block.bottomY, top: block.topY });
                }
            }
        });
        
        columnBlocks.push(blocks);
    }

    let currentX = -state.width/2 + t + _ox;
    let compCounter = 1;
    // True when rendering an upper unit wing (noPlinth is forced on all columns, and a bottom board is needed)
    const _isUpperUnitBuild = !!(state.activeWing && state.activeWing.startsWith('upperUnit_'));
    // Capture columns array once so all index lookups use the same reference
    const _cols = state.columns;

    for (let c = 0; c < _cols.length; c++) {
        const col = _cols[c];
        const colCenterX = currentX + col.width/2;
        const isDesk = col.type === 'desk';
        const isLeftmost = (c === 0);
        const isRightmost = (c === _cols.length - 1);
        const doorGap = 0.3; 
        
        let overlayLeftX = isInset ? (currentX + doorGap/2) : (isLeftmost ? (currentX - t + doorGap/2) : (currentX - t/2 + doorGap/2));
        let overlayRightX = isInset ? (currentX + col.width - doorGap/2) : (isRightmost ? (currentX + col.width + t - doorGap/2) : (currentX + col.width + t/2 - doorGap/2));
        const overlayW = overlayRightX - overlayLeftX;
        const overlayCenterX = (overlayLeftX + overlayRightX) / 2;
        
        const fo = col.floorOffset || 0;
        if (!isDesk) {
            if (fo > 0) {
                // יחידה תלויה: דופן תחתונה בגובה floorOffset
                _ppPartId = `plinth_c${c}`;
                const floorMesh = createBoard(col.width, t, bodyD, colCenterX, fo + t/2, 0);
                _ppPartId = '';
                _applyHorizBoardUV(floorMesh, currentX, col.width, bodyD, state.width);
            } else if (col.noPlinth && !_isSlidingWardrobe && _isUpperUnitBuild) {
                // noPlinth column in an upper unit: draw a single bottom board at y=0 (upper unit has a floor panel)
                _ppPartId = `plinth_c${c}`;
                const plinthTopMesh = createBoard(col.width, t, bodyD, colCenterX, t/2, 0);
                _ppPartId = '';
                _applyHorizBoardUV(plinthTopMesh, currentX, col.width, bodyD, state.width);
            } else if (!col.noPlinth && !_isSlidingWardrobe && !isRegalim) {
                // For sliding wardrobes: full-width bottom board is added by buildSlidingDoorCabinet — skip per-column plinth
                // For regalim: plate already drawn as full-width mesh above — skip per-column plinth solid
                _ppPartId = `plinth_c${c}`;
                createBoard(col.width, state.plinthHeight, bodyD, colCenterX, state.plinthHeight/2, 0);
                const plinthTopMesh = createBoard(col.width, t, bodyD, colCenterX, state.plinthHeight + t/2, 0);
                _ppPartId = '';
                _applyHorizBoardUV(plinthTopMesh, currentX, col.width, bodyD, state.width);
            } else if (!col.noPlinth && !_isSlidingWardrobe && isRegalim) {
                // רגלי ניקל: הפלטה כבר צוירה כלוח רוחב מלא — עבור ארון אמבטיה הפלטה היא הדופן התחתונה היחידה.
                // עבור ארונות אחרים עם רגלי ניקל: מצייר לוח מדף עליון נוסף מעל הפלטה.
                const _isBathroomRegalim = (state.presetId === 'bathroom');
                if (!_isBathroomRegalim) {
                    _ppPartId = `plinth_c${c}`;
                    const plinthTopMesh = createBoard(col.width, t, bodyD, colCenterX, state.plinthHeight + t/2, 0);
                    _ppPartId = '';
                    _applyHorizBoardUV(plinthTopMesh, currentX, col.width, bodyD, state.width);
                }
            }
            // ידית גרירה לתחתית — נשמרת תמיד (לא רק כשמרחפים)
            if (!isBP && _isActiveWingBuild) {
                const handleY = fo > 0 ? fo : state.plinthHeight;
                // Floor offset handle: shifted left so it doesn't overlap the select-all button
                dragHandlesData.floors.push({ colIndex: c, x: colCenterX - 5, y: handleY, fo: fo });
                // Select-all-column button: shifted right so it sits next to the floor handle
                dragHandlesData.selectAll.push({ colIndex: c, x: colCenterX + 5, y: state.plinthHeight / 2 });

                // Extra hitboxes: plinth zone (bottom) + above-roof zone (top) for easier hover detection
                // noHighlight=true: these are invisible trigger zones — never show selection highlight
                const hitMatExtra = new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.0, depthWrite: false });
                // Plinth / floor-offset zone: from y=0 to plinthHeight (or fo)
                const plinthHitH = Math.max(state.plinthHeight, fo > 0 ? fo : state.plinthHeight) + 2;
                const plinthHitBox = new THREE.Mesh(new THREE.BoxGeometry(col.width, plinthHitH, bodyD), hitMatExtra.clone());
                plinthHitBox.position.set(colCenterX, plinthHitH / 2, -1);
                plinthHitBox.userData = { colIndex: c, rowIndex: -1, noHighlight: true };
                _buildGroup.add(plinthHitBox); hitBoxes.push(plinthHitBox);
                // Above-roof zone: 15cm above col.height
                const roofExtH = 15;
                const roofHitBox = new THREE.Mesh(new THREE.BoxGeometry(col.width, roofExtH, bodyD), hitMatExtra.clone());
                roofHitBox.position.set(colCenterX, col.height + roofExtH / 2, -1);
                roofHitBox.userData = { colIndex: c, rowIndex: -1, noHighlight: true };
                _buildGroup.add(roofHitBox); hitBoxes.push(roofHitBox);
            }
        }
        
        if (c === 0) {
            // קיר שמאלי קיצוני — מתחיל מ-floorOffset של העמודה
            // For sliding wardrobes: outer side walls extend to floor (y=0), like the aluminum plinth
            // For regalim: walls start from plinthHeight (top of plate)
            let wallBottomY = fo;
            if (isRegalim && fo === 0) wallBottomY = state.plinthHeight;
            // For desk columns: plinth area is open — wall starts above plinth zone
            if (isDesk && fo === 0) wallBottomY = state.plinthHeight;
            const wallTopY = col.height;
            const wallTotalH = wallTopY - wallBottomY;
            let sortedHoles = leftWallHoles.sort((a,b) => a.bottom - b.bottom);
            let currentY = wallBottomY;
            _ppPartId = 'wall_left';
            for(let hole of sortedHoles) {
                if (hole.bottom - currentY > 0.01) {
                    const segH = hole.bottom - currentY;
                    const wm = createBoard(t, segH, bodyD, -state.width/2 + t/2 + _ox, currentY + segH/2, 0);
                    _applyVertWallUV(wm, currentY - wallBottomY, segH, wallTotalH, bodyD, t);
                }
                currentY = Math.max(currentY, hole.top);
            }
            if (wallTopY - currentY > 0.01) {
                const segH = wallTopY - currentY;
                const wm = createBoard(t, segH, bodyD, -state.width/2 + t/2 + _ox, currentY + segH/2, 0);
                _applyVertWallUV(wm, currentY - wallBottomY, segH, wallTotalH, bodyD, t);
            }
            _ppPartId = '';
        }
        
        const nextCol = _cols[c+1];
        const isDeskAdj = isDesk || (nextCol && nextCol.type === 'desk');
        const rightH = Math.max(col.height, nextCol ? nextCol.height : 0);
        const wallX = currentX + col.width + t/2;

        if (c === _cols.length - 1) {
            // קיר ימני קיצוני — מתחיל מ-floorOffset של העמודה
            // For sliding wardrobes: outer side walls extend to floor (y=0), like the aluminum plinth
            // For regalim: walls start from plinthHeight (top of plate)
            let wallBottomY = fo;
            if (isRegalim && fo === 0) wallBottomY = state.plinthHeight;
            // For desk columns: plinth area is open — wall starts above plinth zone
            if (isDesk && fo === 0) wallBottomY = state.plinthHeight;
            const wallTopY = rightH;
            const wallTotalH = wallTopY - wallBottomY;
            let sortedHoles = rightWallHoles.sort((a,b) => a.bottom - b.bottom);
            let currentY = wallBottomY;
            _ppPartId = 'wall_right';
            for(let hole of sortedHoles) {
                if (hole.bottom - currentY > 0.01) {
                    const segH = hole.bottom - currentY;
                    const wm = createBoard(t, segH, bodyD, wallX, currentY + segH/2, 0);
                    _applyVertWallUV(wm, currentY - wallBottomY, segH, wallTotalH, bodyD, t);
                }
                currentY = Math.max(currentY, hole.top);
            }
            if (wallTopY - currentY > 0.01) {
                const segH = wallTopY - currentY;
                const wm = createBoard(t, segH, bodyD, wallX, currentY + segH/2, 0);
                _applyVertWallUV(wm, currentY - wallBottomY, segH, wallTotalH, bodyD, t);
            }
            _ppPartId = '';
        } else {
            // מחיצות פנימיות — מתחילות מלמטה, אלא אם שתי העמודות משני הצדדים מרחפות
            // (floorOffset > 0). אם רק עמודה אחת מרחפת, המחיצה מתחילה מ-0 כדי לא
            // לחתוך את הדופן של העמודה הסמוכה שאינה מרחפת.
            const nextFO = nextCol ? (nextCol.floorOffset || 0) : 0;
            let wallBottomY = (fo > 0 && nextFO > 0) ? Math.min(fo, nextFO) : 0;
            // For sliding wardrobes: bottom board top is at y=plinthH, so partitions start at y=plinthH
            if (_isSlidingWardrobe) wallBottomY = Math.max(wallBottomY, state.plinthHeight);
            // For regalim: internal partitions start from plinthHeight (top of plate)
            if (isRegalim && wallBottomY === 0) wallBottomY = state.plinthHeight;
            // For desk columns: plinth area is open — partition starts above plinth zone
            if ((isDesk || (nextCol && nextCol.type === 'desk')) && wallBottomY === 0) wallBottomY = state.plinthHeight;
            const wallTopY = rightH;
            const wallTotalH = wallTopY - wallBottomY;
            // For sliding wardrobes: internal partitions are set back 6cm from front face
            const _partD = _slidingPartD;
            const _partZ = _slidingPartZ;
            
            let sortedHoles = internalHoles[c].sort((a,b) => a.bottom - b.bottom);
            let currentY = wallBottomY;
            _ppPartId = `divider_c${c}`;
            for(let hole of sortedHoles) {
                if (hole.bottom - currentY > 0.01) {
                    const segH = hole.bottom - currentY;
                    const wm = createBoard(t, segH, _partD, wallX, currentY + segH/2, _partZ);
                    _applyVertWallUV(wm, currentY - wallBottomY, segH, wallTotalH, _partD, t);
                }
                currentY = Math.max(currentY, hole.top);
            }
            if (wallTopY - currentY > 0.01) {
                const segH = wallTopY - currentY;
                const wm = createBoard(t, segH, _partD, wallX, currentY + segH/2, _partZ);
                _applyVertWallUV(wm, currentY - wallBottomY, segH, wallTotalH, _partD, t);
            }
            _ppPartId = '';
        }

        if (c < _cols.length - 1 && !isBP && _isActiveWingBuild) dragHandlesData.horizontal.push(wallX);

        if (col.sinkPanel && !isBP) {
            // ---- כיור אינטגרלי ----
            // בדיקה: האם עמודה זו היא חלק מקבוצת כיורים רצופה?
            // אם כן, רק העמודה הראשונה בקבוצה מצייר את המשטח המאוחד + הכיור.
            // שאר העמודות בקבוצה מדלגות על ציור הכיור (אבל עדיין מוסיפות drag handle).

            // מצא את תחילת הקבוצה (העמודה הראשונה ברצף sinkPanel עם אותו גובה)
            let sinkGroupStart = c;
            while (
                sinkGroupStart > 0 &&
                _cols[sinkGroupStart - 1].sinkPanel &&
                Math.abs(_cols[sinkGroupStart - 1].height - col.height) < 0.1
            ) {
                sinkGroupStart--;
            }

            // מצא את סוף הקבוצה
            let sinkGroupEnd = c;
            while (
                sinkGroupEnd < _cols.length - 1 &&
                _cols[sinkGroupEnd + 1].sinkPanel &&
                Math.abs(_cols[sinkGroupEnd + 1].height - col.height) < 0.1
            ) {
                sinkGroupEnd++;
            }

            if (_isActiveWingBuild) dragHandlesData.roofs.push({ colIndex: c, x: colCenterX, y: col.height });

            // רק העמודה הראשונה בקבוצה מצייר את המשטח המאוחד
            if (c !== sinkGroupStart) {
                // עמודה שאינה ראשונה בקבוצה — דלג על ציור הכיור
            } else {
                // חשב את הרוחב הכולל של הקבוצה ואת מרכז המשטח המאוחד
                let groupTotalWidth = 0;
                let groupLeftX = currentX; // X שמאלי של העמודה הראשונה בקבוצה
                for (let gi = sinkGroupStart; gi <= sinkGroupEnd; gi++) {
                    groupTotalWidth += _cols[gi].width;
                    if (gi < sinkGroupEnd) groupTotalWidth += t; // מחיצה בין עמודות
                }
                const groupCenterX = groupLeftX + groupTotalWidth / 2;

                const SINK_T       = 2.0;
                const SINK_BASIN_H = 12;
                const BASIN_W      = groupTotalWidth >= 100 ? 50 : 40;
                const FRONT_GAP    = 8;
                const BACK_GAP     = 12;
                const BEVEL_R      = 0.6;
                const BEVEL_SEG    = 4;
                const sinkWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.2, metalness: 0.05 });

                const basinD = Math.max(10, bodyD - FRONT_GAP - BACK_GAP);
                const basinFrontZ  = bodyD/2 - FRONT_GAP;
                const basinBackZ   = basinFrontZ - basinD;
                const basinCenterZ = (basinFrontZ + basinBackZ) / 2;

                const counterTopY = col.height - t + SINK_T;

                // ── משטח מסגרת אחיד עם חור — רוחב = רוחב כל הקבוצה ──
                const OVERHANG_SIDE  = 2;
                const OVERHANG_FRONT = 2;
                const hw = groupTotalWidth / 2 + OVERHANG_SIDE;
                const hdFront = bodyD / 2 + OVERHANG_FRONT;
                const hdBack  = bodyD / 2;
                const r = BEVEL_R;
                const ctrShape = new THREE.Shape();
                ctrShape.moveTo(-hw + r,  hdBack);
                ctrShape.lineTo( hw - r,  hdBack);
                ctrShape.quadraticCurveTo( hw,  hdBack,  hw,  hdBack - r);
                ctrShape.lineTo( hw, -hdFront + r);
                ctrShape.quadraticCurveTo( hw, -hdFront,  hw - r, -hdFront);
                ctrShape.lineTo(-hw + r, -hdFront);
                ctrShape.quadraticCurveTo(-hw, -hdFront, -hw, -hdFront + r);
                ctrShape.lineTo(-hw,  hdBack - r);
                ctrShape.quadraticCurveTo(-hw,  hdBack, -hw + r,  hdBack);

                // חור הכיור — ממורכז באמצע המשטח המאוחד
                const holePath = new THREE.Path();
                const hx  = BASIN_W / 2;
                const hzF = -basinFrontZ;
                const hzB = -basinBackZ;
                const hr  = 0.8;
                holePath.moveTo(-hx + hr, hzF);
                holePath.lineTo( hx - hr, hzF);
                holePath.quadraticCurveTo( hx, hzF,  hx, hzF + hr);
                holePath.lineTo( hx, hzB - hr);
                holePath.quadraticCurveTo( hx, hzB,  hx - hr, hzB);
                holePath.lineTo(-hx + hr, hzB);
                holePath.quadraticCurveTo(-hx, hzB, -hx, hzB - hr);
                holePath.lineTo(-hx, hzF + hr);
                holePath.quadraticCurveTo(-hx, hzF, -hx + hr, hzF);
                ctrShape.holes.push(holePath);

                const ctrGeo = new THREE.ExtrudeGeometry(ctrShape, {
                    depth: SINK_T,
                    bevelEnabled: true,
                    bevelThickness: BEVEL_R,
                    bevelSize: BEVEL_R,
                    bevelSegments: BEVEL_SEG
                });
                const ctrMesh = new THREE.Mesh(ctrGeo, sinkWhiteMat);
                ctrMesh.rotation.x = -Math.PI / 2;
                // ממוקם במרכז הקבוצה
                ctrMesh.position.set(groupCenterX, counterTopY - SINK_T - BEVEL_R, 0);
                ctrMesh.castShadow = false;
                ctrMesh.receiveShadow = true;
                _buildGroup.add(ctrMesh);

                // ── אגן הכיור — ממורכז באמצע המשטח המאוחד ──
                const basinTopY    = col.height - t;
                const basinBottomY = basinTopY - SINK_BASIN_H;
                const basinCenterY = (basinTopY + basinBottomY) / 2;
                const archH        = SINK_BASIN_H * 0.55;

                // דופן שמאל
                const wL = new THREE.Mesh(new THREE.BoxGeometry(SINK_T, SINK_BASIN_H, basinD), sinkWhiteMat);
                wL.position.set(groupCenterX - BASIN_W/2 - SINK_T/2, basinCenterY, basinCenterZ);
                wL.castShadow = false; _buildGroup.add(wL);

                // דופן ימין
                const wR = new THREE.Mesh(new THREE.BoxGeometry(SINK_T, SINK_BASIN_H, basinD), sinkWhiteMat);
                wR.position.set(groupCenterX + BASIN_W/2 + SINK_T/2, basinCenterY, basinCenterZ);
                wR.castShadow = false; _buildGroup.add(wR);

                // דופן קדמית
                const wF = new THREE.Mesh(new THREE.BoxGeometry(BASIN_W + SINK_T * 2, SINK_BASIN_H, SINK_T), sinkWhiteMat);
                wF.position.set(groupCenterX, basinCenterY, basinFrontZ + SINK_T/2);
                wF.castShadow = false; _buildGroup.add(wF);

                // דופן אחורית
                const wB = new THREE.Mesh(new THREE.BoxGeometry(BASIN_W + SINK_T * 2, SINK_BASIN_H, SINK_T), sinkWhiteMat);
                wB.position.set(groupCenterX, basinCenterY, basinBackZ - SINK_T/2);
                wB.castShadow = false; _buildGroup.add(wB);

                // תחתית מעוגלת — ממורכזת באמצע המשטח המאוחד
                {
                    const segX = 24, segZ = 1;
                    const botGeo = new THREE.PlaneGeometry(BASIN_W, basinD, segX, segZ);
                    const pos = botGeo.attributes.position;
                    for (let vi = 0; vi < pos.count; vi++) {
                        const frac = (pos.getX(vi) + BASIN_W/2) / BASIN_W;
                        const drop = archH * Math.sin(frac * Math.PI);
                        pos.setZ(vi, -drop);
                    }
                    botGeo.computeVertexNormals();
                    const botMesh = new THREE.Mesh(botGeo, sinkWhiteMat);
                    botMesh.rotation.x = -Math.PI / 2;
                    botMesh.position.set(groupCenterX, basinTopY, basinCenterZ);
                    botMesh.castShadow = false; botMesh.receiveShadow = true;
                    _buildGroup.add(botMesh);
                }

                // ניקוז
                const drainGeo = new THREE.CylinderGeometry(1.5, 1.5, SINK_T + 0.4, 20);
                const drainMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.15 });
                if (window._hdrEnvMap) { drainMat.envMap = window._hdrEnvMap; drainMat.needsUpdate = true; }
                const drainMesh = new THREE.Mesh(drainGeo, drainMat);
                drainMesh.position.set(groupCenterX, basinBottomY + SINK_T/2, basinCenterZ);
                _buildGroup.add(drainMesh);
            }
        } else if (!isBP && state.presetId === 'bathroom' && (() => {
            const _cw = state.wings && state.wings.center;
            const _ct = _cw && _cw.countertopType;
            return _ct && _ct !== 'integral';
        })()) {
            // ---- Bathroom countertop: flat slab + vessel sink on top ----
            const _cw = state.wings.center;
            const _ct = _cw.countertopType; // 'butcher26' | 'butcher40' | 'corian12'

            // Slab thickness per type
            const SLAB_T = _ct === 'butcher26' ? 2.6 : _ct === 'butcher40' ? 4.0 : 1.2; // corian12 = 1.2
            const OVERHANG_FRONT = 2;
            const OVERHANG_SIDE  = 1.5;
            const slabW = col.width + OVERHANG_SIDE * 2;
            const slabD = bodyD + OVERHANG_FRONT;
            const slabY = col.height + SLAB_T / 2; // slab sits on top of cabinet body

            // Slab material — butcher types use wood texture; corian is plain white
            // During vessel sink drag, skip texture load for performance (restored on drag end)
            const _isButcher = (_ct === 'butcher26' || _ct === 'butcher40');
            let slabMat;
            if (_isButcher && !window._vesselSinkDragging) {
                const _butcherTex = new THREE.TextureLoader().load('images/botcher.jpg');
                _butcherTex.wrapS = _butcherTex.wrapT = THREE.RepeatWrapping;
                _butcherTex.repeat.set(slabW / 60, slabD / 60); // ~60cm per tile
                slabMat = new THREE.MeshStandardMaterial({
                    map: _butcherTex, color: 0xffffff, roughness: 0.65, metalness: 0.0
                });
            } else {
                slabMat = new THREE.MeshStandardMaterial({
                    color: _isButcher ? 0xd4a96a : 0xfafafa, roughness: _isButcher ? 0.65 : 0.15, metalness: 0.0
                });
            }
            const slabGeo  = new THREE.BoxGeometry(slabW, SLAB_T, slabD);
            const slabMesh = new THREE.Mesh(slabGeo, slabMat);
            slabMesh.position.set(colCenterX, slabY, OVERHANG_FRONT / 2);
            slabMesh.castShadow = false;
            slabMesh.receiveShadow = true;
            _buildGroup.add(slabMesh);

            // Drag handle at top of slab
            if (_isActiveWingBuild) dragHandlesData.roofs.push({ colIndex: c, x: colCenterX, y: col.height });

            // Vessel sink bowl — only draw for the first column in a consecutive group
            // (same logic as integral sink grouping)
            let vsGroupStart = c;
            while (vsGroupStart > 0 && !_cols[vsGroupStart - 1].sinkPanel &&
                   state.presetId === 'bathroom' && _cols[vsGroupStart - 1].countertopType !== 'integral') {
                vsGroupStart--;
            }
            // ---- Vessel sink: open-top box (5 panels: bottom + 4 walls) ----
            // Draw only once — on the first column (c === 0) of the bathroom cabinet
            if (c === 0) {
                const VESSEL_W  = Math.min(state.width * 0.35, 50);
                const VESSEL_D  = Math.min(bodyD * 0.6, 35);
                const VESSEL_H  = 15;
                const VESSEL_T  = 0.8; // wall/bottom thickness

                // Full slab bounds: entire cabinet width + overhangs
                const _fullSlabLeftX  = -state.width / 2 - OVERHANG_SIDE;
                const _fullSlabRightX =  state.width / 2 + OVERHANG_SIDE;
                const _fullSlabW = _fullSlabRightX - _fullSlabLeftX;

                // Sink X offset relative to cabinet center (0 = centered on full slab)
                const _sinkOffsetX = (_cw.vesselSinkOffsetX) || 0;
                const _maxSinkOffset = _fullSlabW / 2 - VESSEL_W / 2 - 1;
                const _clampedSinkX = Math.max(-_maxSinkOffset, Math.min(_maxSinkOffset, _sinkOffsetX));
                const vesselCenterX = _clampedSinkX; // relative to cabinet center (0)

                const vesselBaseY = slabY + SLAB_T / 2; // Y of slab top face
                const vesselCenterZ = -bodyD * 0.1;     // slightly toward back

                const vesselMat = new THREE.MeshStandardMaterial({
                    color: 0xfafafa, roughness: 0.18, metalness: 0.04
                });

                // Bottom panel
                const botGeo = new THREE.BoxGeometry(VESSEL_W, VESSEL_T, VESSEL_D);
                const botMesh = new THREE.Mesh(botGeo, vesselMat);
                botMesh.position.set(vesselCenterX, vesselBaseY + VESSEL_T / 2, vesselCenterZ);
                _buildGroup.add(botMesh);

                // Front wall (toward viewer)
                const fwGeo = new THREE.BoxGeometry(VESSEL_W, VESSEL_H, VESSEL_T);
                const fwMesh = new THREE.Mesh(fwGeo, vesselMat);
                fwMesh.position.set(vesselCenterX, vesselBaseY + VESSEL_H / 2, vesselCenterZ + VESSEL_D / 2 - VESSEL_T / 2);
                _buildGroup.add(fwMesh);

                // Back wall
                const bwGeo = new THREE.BoxGeometry(VESSEL_W, VESSEL_H, VESSEL_T);
                const bwMesh = new THREE.Mesh(bwGeo, vesselMat);
                bwMesh.position.set(vesselCenterX, vesselBaseY + VESSEL_H / 2, vesselCenterZ - VESSEL_D / 2 + VESSEL_T / 2);
                _buildGroup.add(bwMesh);

                // Left wall
                const lwGeo = new THREE.BoxGeometry(VESSEL_T, VESSEL_H, VESSEL_D - VESSEL_T * 2);
                const lwMesh = new THREE.Mesh(lwGeo, vesselMat);
                lwMesh.position.set(vesselCenterX - VESSEL_W / 2 + VESSEL_T / 2, vesselBaseY + VESSEL_H / 2, vesselCenterZ);
                _buildGroup.add(lwMesh);

                // Right wall
                const rwGeo = new THREE.BoxGeometry(VESSEL_T, VESSEL_H, VESSEL_D - VESSEL_T * 2);
                const rwMesh = new THREE.Mesh(rwGeo, vesselMat);
                rwMesh.position.set(vesselCenterX + VESSEL_W / 2 - VESSEL_T / 2, vesselBaseY + VESSEL_H / 2, vesselCenterZ);
                _buildGroup.add(rwMesh);

                // Drain (chrome cylinder at bottom center)
                const drainGeo2 = new THREE.CylinderGeometry(1.5, 1.5, VESSEL_T + 0.2, 16);
                const drainMat2 = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.15 });
                if (window._hdrEnvMap) { drainMat2.envMap = window._hdrEnvMap; drainMat2.needsUpdate = true; }
                const drainMesh2 = new THREE.Mesh(drainGeo2, drainMat2);
                drainMesh2.position.set(vesselCenterX, vesselBaseY + VESSEL_T / 2, vesselCenterZ);
                _buildGroup.add(drainMesh2);

                // ---- Single centered drag handle on slab surface ----
                if (_isActiveWingBuild) {
                    const _handleY = col.height + SLAB_T + VESSEL_H + 2; // at top of vessel walls
                    dragHandlesData.vesselSink = dragHandlesData.vesselSink || [];
                    dragHandlesData.vesselSink.push({
                        colIndex: c,
                        centerX: vesselCenterX,   // handle at sink center
                        y: _handleY,
                        slabLeftX: _fullSlabLeftX,
                        slabRightX: _fullSlabRightX,
                        vesselW: VESSEL_W,
                        currentOffsetX: _clampedSinkX
                    });
                }
            }
        } else {
            _ppPartId = `top_c${c}`;
            const topMesh = createBoard(col.width, t, bodyD, colCenterX, col.height - t/2, 0);
            _ppPartId = '';
            _applyHorizBoardUV(topMesh, currentX, col.width, bodyD, state.width);
            if(!isBP && _isActiveWingBuild) dragHandlesData.roofs.push({ colIndex: c, x: colCenterX, y: col.height });
        }

        if(isBP) state.bpData.push({ type: 'width', val: Math.round(col.width), x: colCenterX, y: -20, halfW: col.width / 2 });
        // Column width label above the top board (shown in front view, live update during drag)
        if (!isBP && _isActiveWingBuild) {
            state.dimData.push({ isColWidth: true, colIndex: c, x: colCenterX, y: col.height + 8, h: Math.round(col.width) });
        }

        // When noPlinth=true and no floorOffset:
        //   Upper units: have a bottom board at y=0, startShelvesY = t (above the board).
        //   Regular noPlinth (ביטול צוקל): no bottom board drawn, but startShelvesY = t so the
        //   bottom cell grows by exactly plinthHeight compared to the normal (plinth) state.
        // For bathroom regalim: the full-width plate (top face at plinthHeight) is the only bottom board —
        //   no extra plinthTopMesh is drawn, so startShelvesY = plinthHeight (not plinthHeight + t).
        const _isBathroomRegalim = (state.presetId === 'bathroom' && isRegalim);
        let startShelvesY = fo > 0 ? fo + t : (col.noPlinth ? t : (_isBathroomRegalim ? state.plinthHeight : state.plinthHeight + t));

        if (isDesk) {
            // Desk surface protrudes deskT forward to align with door-face line
            const deskProtrude = deskT;
            createBoard(col.width, deskT, bodyD + deskProtrude, colCenterX, col.deskHeight - deskT/2, deskProtrude / 2, matDesk);
            if(!isBP && _isActiveWingBuild) {
                state.dimData.push({ isInternalDeskSurface: true, colIndex: c, x: colCenterX, y: col.deskHeight/2, h: col.deskHeight });
                dragHandlesData.vertical.push({ isInternalDeskSurface: true, colIndex: c, x: colCenterX, y: col.deskHeight });
            }
            if (col.hasDrawers && !isBP) {
                const numDrawers = col.deskDrawerCount != null ? col.deskDrawerCount : (col.width <= 80 ? 1 : 2);
                const gap = 0.4;
                const drawerWidth = (col.width - gap*(numDrawers+1)) / numDrawers;
                const drawerBottomY = col.deskHeight - deskT - col.drawerHeight;
                const drawerCenterY = drawerBottomY + col.drawerHeight/2;
                createBoard(col.width, deskT, bodyD - 2, colCenterX, drawerBottomY + deskT/2, 0, matDesk);
                for(let i=0; i<numDrawers; i++) {
                    let innerStartX = colCenterX - col.width/2;
                    let dx = innerStartX + gap + drawerWidth/2 + i * (drawerWidth + gap);
                    let mesh = createBoard(drawerWidth, col.drawerHeight, t, dx, drawerCenterY, _deskDrawerFZ, matExternal);
                    if (!isBP) _addPanelHandleLocal(mesh, drawerWidth, col.drawerHeight, _handleStyle);
                    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 2, 2.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                    backPanel.position.set(dx, drawerBottomY + col.drawerHeight - 1.25, _deskDrawerFZ - t/2 - 0.25);
                    _buildGroup.add(backPanel);
                }
                if (_isActiveWingBuild) {
                    state.dimData.push({ isInternalDeskDrawer: true, colIndex: c, x: colCenterX, y: drawerCenterY, h: col.drawerHeight });
                    dragHandlesData.vertical.push({ isInternalDeskDrawer: true, colIndex: c, x: colCenterX, y: drawerBottomY });
                }
            }
            startShelvesY = col.deskHeight + col.deskClearance;
            createBoard(col.width, deskT, bodyD, colCenterX, startShelvesY + deskT/2, 0, matDesk); 
            if(!isBP) dragHandlesData.vertical.push({ isInternalDeskClearance: true, colIndex: c, x: colCenterX, y: startShelvesY });
            startShelvesY += deskT; 
            const backH = col.height - col.deskHeight;
            if (!isBP) createBoard(col.width, backH, backT, colCenterX, col.deskHeight + backH/2, -bodyD/2 + backT/2, matDesk); 
            if (!isBP && _isActiveWingBuild) {
                const hitH = startShelvesY - (state.plinthHeight + t);
                const hitY = (state.plinthHeight + t) + hitH/2;
                const isHoveredCol = (state.hoveredColIndex === c);
                const hitMat = new THREE.MeshBasicMaterial({ color: isHoveredCol ? 0x2ecc71 : 0x3498db, transparent: true, opacity: isHoveredCol ? 0.05 : 0.0, depthWrite: false });
                const hitBox = new THREE.Mesh(new THREE.BoxGeometry(col.width, hitH, bodyD - backT - 2), hitMat);
                hitBox.position.set(colCenterX, hitY, -1);
                hitBox.userData = { colIndex: c, rowIndex: -1 };
                _buildGroup.add(hitBox); hitBoxes.push(hitBox);
            }
        } else {
            // For sliding wardrobes and noPlinth columns: back panel starts above the bottom board (y=t).
            const backBottomY = (_isSlidingWardrobe || col.noPlinth) ? (fo > 0 ? fo + t : t) : (fo > 0 ? fo + t : state.plinthHeight + t);
            const h = col.height - backBottomY - t;
            if (!isBP) {
                _ppPartId = `back_c${c}`;
                const backMesh = createBoard(col.width, h, backT, colCenterX, backBottomY + h/2, -bodyD/2 + backT/2, matBack);
                _ppPartId = '';
                // Aspect-ratio-preserving UV on front/back faces (indices 16-23): fit to height, preserve ratio
                // NOTE: createBoard already scaled UV by (w/100, h/100), so we must use raw 0/1 values directly
                if (backMesh && matBack.map) {
                    const uv = backMesh.geometry.attributes.uv;
                    const uScale = col.width / h;
                    const uOffset = (1 - uScale) / 2;
                    // BoxGeometry front/back face raw UV corners (before any scaling):
                    // i=16:(0,0), i=17:(1,0), i=18:(0,1), i=19:(1,1) — front
                    // i=20:(0,0), i=21:(1,0), i=22:(0,1), i=23:(1,1) — back
                    const rawU = [0,1,0,1, 0,1,0,1];
                    const rawV = [0,0,1,1, 0,0,1,1];
                    for (let i = 16; i < 24; i++) {
                        const ru = rawU[i - 16];
                        const rv = rawV[i - 16];
                        uv.setXY(i, uOffset + ru * uScale, rv);
                    }
                    uv.needsUpdate = true;
                }
            }
        }

        let dividers = [];
        col.shelvesY.forEach((y, idx) => dividers.push({ y: y, type: 'shelf', thick: t, idx: idx }));
        if (col.splitY && col.splitY > startShelvesY) dividers.push({ y: col.splitY, type: 'split', thick: 2*t, idx: -1 });
        
        // --- אלגוריתם זיהוי מדפים המוסתרים מאחורי חזיתות פנימיות ---
        let dividersAsc = [...dividers].sort((a, b) => a.y - b.y);
        const isHiddenByDoor = (yPos) => {
            if (!isInset || !col.doors) return false;
            let baseForInset = col.type === 'desk' ? col.deskHeight + col.deskClearance : Math.max(state.plinthHeight, fo);
            return col.doors.some(door => {
                let doorBottomY = (door.startRow === 0) ? (baseForInset + t) : (dividersAsc[door.startRow - 1].y + dividersAsc[door.startRow - 1].thick/2);
                let doorTopY = (door.endRow === dividersAsc.length) ? (col.height - t) : (dividersAsc[door.endRow].y - dividersAsc[door.endRow].thick/2);
                return yPos > doorBottomY + 0.1 && yPos < doorTopY - 0.1;
            });
        };

        dividers.sort((a, b) => b.y - a.y);
        
        let myBlocks = columnBlocks[c];

        if (!isBP) {
            myBlocks.forEach(block => {
                const innerT = t;
                let cellW = col.width;
                let cellX = colCenterX;
                
                if (block.type === 'side_open_cell') {
                    if (block.openDir === 'left') { cellW += t; cellX -= t/2; } 
                    else if (block.openDir === 'right') { cellW += t; cellX += t/2; }
                }

                createBoard(cellW, innerT, bodyD - 2, cellX, block.topY - innerT/2, 1, matOpenCell); 
                createBoard(cellW, innerT, bodyD - 2, cellX, block.bottomY + innerT/2, 1, matOpenCell); 
                createBoard(cellW, block.h - 2*innerT, t, cellX, block.centerY, -bodyD/2 + t/2 + 0.6, matOpenCell);
                
                if (block.type === 'open_cell') {
                    createBoard(innerT, block.h - 2*innerT, bodyD - 2, cellX - cellW/2 + innerT/2, block.centerY, 1, matOpenCell); 
                    createBoard(innerT, block.h - 2*innerT, bodyD - 2, cellX + cellW/2 - innerT/2, block.centerY, 1, matOpenCell); 
                } else if (block.type === 'side_open_cell') {
                    if (block.openDir === 'left') {
                        createBoard(innerT, block.h - 2*innerT, bodyD - 2, cellX + cellW/2 - innerT/2, block.centerY, 1, matOpenCell); 
                    } else if (block.openDir === 'right') {
                        createBoard(innerT, block.h - 2*innerT, bodyD - 2, cellX - cellW/2 + innerT/2, block.centerY, 1, matOpenCell); 
                    } else {
                        createBoard(innerT, block.h - 2*innerT, bodyD - 2, cellX - cellW/2 + innerT/2, block.centerY, 1, matOpenCell); 
                        createBoard(innerT, block.h - 2*innerT, bodyD - 2, cellX + cellW/2 - innerT/2, block.centerY, 1, matOpenCell); 
                    }
                }
            });
        }

        let prevYTopDown = col.height - t;
        
        dividers.forEach((div) => {
            const compH = prevYTopDown - (div.y + div.thick/2);
            const compCenterY = (prevYTopDown + (div.y + div.thick/2)) / 2;
            if(isBP && !isDesk) {
                state.bpData.push({ type: 'num', val: compCounter++, x: currentX + 6, y: prevYTopDown - 6 });
            }
            
            let insideBlock = myBlocks.find(b => div.y > b.bottomY && div.y < b.topY);
            
            // 1. זיהוי האם המדף הוא קושרת שתוחמת כוורת (מלמעלה או מלמטה)
            let isBoundaryOfOpenCell = myBlocks.some(b => 
                Math.abs((div.y + div.thick/2) - b.bottomY) < 0.01 || 
                Math.abs((div.y - div.thick/2) - b.topY) < 0.01
            );

            let boardW = col.width;
            let boardX = colCenterX;
            // For sliding wardrobes: shelves are set back 10cm from front face (door zone = 10cm)
            let boardD = _isSlidingWardrobe ? (bodyD - 10) : bodyD;
            let boardZ = _isSlidingWardrobe ? -5 : 0; // shift back so front face is 10cm behind cabinet front
            let boardMat = matInternal;
            
            if (insideBlock && !isBP) {
                boardMat = matOpenCell;
                boardZ = _isSlidingWardrobe ? -4 : 1;
                boardD = _isSlidingWardrobe ? (bodyD - 12) : (bodyD - 2);
                if (insideBlock.type === 'side_open_cell') {
                    if (insideBlock.openDir === 'left') { boardW += t; boardX -= t/2; }
                    else if (insideBlock.openDir === 'right') { boardW += t; boardX += t/2; }
                }
            } else {
                if (isHiddenByDoor(div.y) && !isBP) {
                    boardD = bodyD - t;
                    boardZ = -t/2;
                }
                
                // מדפים שתוחמים כוורת (גלויים מבחוץ) → צבע גוף
                if (!isBP && isBoundaryOfOpenCell) {
                    boardMat = matBody;
                }
            }
            
            // Snap highlight: override material to green if this shelf is snapped
            const snap = window._snapHighlight;
            if (!isBP && snap && div.type === 'shelf' &&
                ((snap.colIdx === c && snap.shelfIdx === div.idx) ||
                 (snap.neighborColIdx === c && snap.neighborShelfIdx === div.idx))) {
                boardMat = matSnapHighlight;
            }
            if (div.type === 'shelf') {
                boardD = Math.max(t, boardD - _shelfFrontSetback);
                boardZ -= _shelfFrontSetback / 2;
            }
            _ppPartId = div.type === 'shelf' ? `shelf_c${c}_r${div.idx}` : `split_c${c}`;
            const shelfMesh = createBoard(boardW, div.thick, boardD, boardX, div.y, boardZ, boardMat);
            _ppPartId = '';
            _applyShelfUV(shelfMesh, boardW, boardD, div.idx + c * 100);
            prevYTopDown = div.y - div.thick/2;
        });

        const lastCompH = prevYTopDown - startShelvesY;
        if(isBP && !isDesk) {
            state.bpData.push({ type: 'num', val: compCounter++, x: currentX + 15, y: prevYTopDown - 10 });
        }

        dividers.sort((a, b) => a.y - b.y);
        let prevY = startShelvesY; 

        for (let r = 0; r <= dividers.length; r++) {
            const isLast = (r === dividers.length);
            const div = isLast ? null : dividers[r];
            const topY = isLast ? col.height - t : div.y - div.thick/2;
            const compH = topY - prevY; 
            const compCenterY = prevY + compH/2;

            const compData = col.compartments[r];

            let displayH = compH;
            let currentBlock = myBlocks.find(b => r >= b.startR && r <= b.endR);
            if (currentBlock) {
                let isTop = (r === currentBlock.endR);
                let isBottom = (r === currentBlock.startR);
                if (isTop && isBottom) displayH = compH - 2*t;
                else if (isTop || isBottom) displayH = compH - t;
            }
            displayH = Math.max(0.1, displayH);

            if (isBP && !isDesk && compH > 0) {
                state.bpData.push({ type: 'height', val: Math.round(displayH), x: colCenterX, y: compCenterY, halfH: compH / 2 });
            }

            if(!isBP && compH > 0) {
                if (_isActiveWingBuild) {
                    // For partitioned cells: push height-only entry (no action buttons) — sub-cell buttons handle interaction
                    // Offset Y upward by 15cm so the dim-container clears the partition drag handle (which sits at compCenterY)
                    const _hasPartition = compData && compData.partition && Array.isArray(compData.partitions) && compData.partitions.length > 0;
                    const _dimY = _hasPartition ? compCenterY + 15 : compCenterY;
                    state.dimData.push({ colIndex: c, rowIndex: r, x: colCenterX, y: _dimY, h: displayH, isTop: isLast, divAbove: div, isPartitionedCell: _hasPartition || false });
                    // For partitioned cells: push a large cell-select button at cell center (shifted down ~12cm)
                    // so the user can select the whole cell to add doors or change partition count
                    if (_hasPartition) {
                        state.dimData.push({
                            isCellSelectBtn: true,
                            colIndex: c, rowIndex: r,
                            x: colCenterX,
                            y: compCenterY - 12
                        });
                    }
                }
                const isHoveredCol = (state.hoveredColIndex === c);
                const hitMat = new THREE.MeshBasicMaterial({ color: isHoveredCol ? 0x2ecc71 : 0x3498db, transparent: true, opacity: (state.selection.colIndex === c && state.selection.rows.includes(r)) ? 0.3 : (isHoveredCol ? 0.05 : 0.0), depthWrite: false });
                const hitBox = new THREE.Mesh(new THREE.BoxGeometry(col.width, compH, bodyD - backT - 2), hitMat);
                if (_isActiveWingBuild) { hitBox.position.set(colCenterX, compCenterY, -1); hitBox.userData = { colIndex: c, rowIndex: r }; _buildGroup.add(hitBox); hitBoxes.push(hitBox); }
                
                if (_isActiveWingBuild && !isLast) dragHandlesData.vertical.push({ colIndex: c, shelfIdx: div.idx, x: colCenterX, y: div.y, isSplit: (div.type === 'split') });
            }

if (compData && compData.type === 'hanging' && !(compData.partition)) {
                if (!isBP) {
                    const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, col.width - 2, 16), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 }));
                    rod.rotation.z = Math.PI / 2; rod.position.set(colCenterX, prevY + compH - 6, 0);
                    _buildGroup.add(rod);
                }
            }
            // === סורבטו — מנגנון תלייה מתרומם ===
            else if (compData && compData.type === 'sorbet' && !(compData.partition)) {
                if (!isBP) {
                    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.4, roughness: 0.6 });

                    // ── Depth: center of cabinet ──
                    const sZ = 0; // Z = 0 = center of cabinet depth

                    // ── Total mechanism height ──
                    const mechH      = compH * 0.6;  // mechanism spans 60% of cell height
                    // ── Vertical center of cell ──
                    const cellCenterY = prevY + compH / 2;
                    // Mechanism is centered vertically: top at cellCenterY + mechH/2
                    const mechTopY    = cellCenterY + mechH / 2;
                    const mechBottomY = cellCenterY - mechH / 2;

                    // ── Housing blocks — at the bottom of the mechanism ──
                    const boxW = 5;
                    const boxH = 12;
                    const boxD = 6;
                    const boxOffsetX = col.width / 2 - boxW / 2;
                    const boxBottomY = mechBottomY;
                    const boxCenterY = boxBottomY + boxH / 2;
                    const boxTopY    = boxBottomY + boxH;

                    [-1, 1].forEach(s => {
                        const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
                        const box    = new THREE.Mesh(boxGeo, darkMat);
                        box.position.set(colCenterX + s * boxOffsetX, boxCenterY, sZ);
                        _buildGroup.add(box);
                    });

                    // ── Horizontal hanging rod — at the top of the mechanism ──
                    const hangRodR   = 0.8;
                    const hangRodY   = mechTopY;
                    const hangRodLen = col.width - boxW; // spans center-to-center of side boxes
                    const hangRodGeo = new THREE.CylinderGeometry(hangRodR, hangRodR, hangRodLen, 10);
                    const hangRod    = new THREE.Mesh(hangRodGeo, darkMat);
                    hangRod.rotation.z = Math.PI / 2;
                    hangRod.position.set(colCenterX, hangRodY, sZ);
                    _buildGroup.add(hangRod);

                    // ── Two vertical rods — from top of housing block to center of horizontal rod ──
                    const vRodR       = 0.7;
                    const vRodBottom  = boxTopY;
                    const vRodH       = hangRodY - vRodBottom;
                    const vRodOffsetX = col.width / 2 - boxW / 2;

                    [-1, 1].forEach(s => {
                        const vRodGeo = new THREE.CylinderGeometry(vRodR, vRodR, vRodH, 10);
                        const vRod    = new THREE.Mesh(vRodGeo, darkMat);
                        vRod.position.set(colCenterX + s * vRodOffsetX, vRodBottom + vRodH / 2, sZ);
                        _buildGroup.add(vRod);
                    });

                    // ── Pull handle — rectangular, narrow, hangs from horizontal rod ──
                    const handleW   = 3;
                    const handleH   = hangRodY - boxBottomY;
                    const handleDp  = 4;
                    const handleGeo = new THREE.BoxGeometry(handleW, handleH, handleDp);
                    const handle    = new THREE.Mesh(handleGeo, darkMat);
                    handle.position.set(colCenterX, hangRodY - handleH / 2, sZ);
                    _buildGroup.add(handle);
                }
            }
            // =========================
            else if (compData && (compData.type === 'internal_drawers' || compData.type === 'external_drawers')) {
                const isExt = compData.type === 'external_drawers';
                const count = compData.count;
                
                if (isExt && !isBP) {
                    let compBottomY, compTopY;
                    if (isInset) {
                        let baseForInset = col.type === 'desk' ? col.deskHeight + col.deskClearance : Math.max(state.plinthHeight, fo);
                        compBottomY = (r === 0) ? (baseForInset + t) : (dividersAsc[r-1].y + dividersAsc[r-1].thick/2);
                        compTopY = isLast ? (col.height - t) : (dividersAsc[r].y - dividersAsc[r].thick/2);
                        compBottomY += doorGap/2;
                        compTopY -= doorGap/2;
                    } else {
                        // For bathroom regalim: extend drawer fronts down by t to cover the bottom plate face.
                        const _bathRegalimBase = (state.presetId === 'bathroom' && isRegalim && r === 0 && fo === 0 && col.type !== 'desk');
                        compBottomY = (r === 0) ? (col.type === 'desk' ? col.deskHeight + col.deskClearance : (_bathRegalimBase ? state.plinthHeight - t : Math.max(state.plinthHeight, fo))) : prevY;
                        compTopY = isLast ? col.height : topY;
                        if (r === 0 && col.type !== 'desk' && state.plinthHeight === 7 && fo === 0 && !_bathRegalimBase) compBottomY = 1.5;
                        compBottomY += doorGap/2; compTopY -= doorGap/2;
                    }
                    
                    const totalExtH = compTopY - compBottomY;
                    const extDrawerH = (totalExtH - doorGap * (count - 1)) / count;
                    const fZ = isInset ? (bodyD/2 - t/2) : (bodyD/2 + t/2 + 0.1); 
                    for(let d=0; d<count; d++) {
                        const dY = compBottomY + extDrawerH/2 + d * (extDrawerH + doorGap);
                        _ppPartId = `drawer_ext_c${c}_r${r}_d${d}`;
                        const mesh = createBoard(overlayW, extDrawerH, t, overlayCenterX, dY, fZ, matExternal);
                        _ppPartId = '';
                        if (!isBP) _addPanelHandleLocal(mesh, overlayW, extDrawerH, compData.handleStyle || _handleStyle);
                        // ---- Bathroom groove overlay on external drawer ----
                        const _bathGrooveExt = state.presetId === 'bathroom'
                            ? ((state.wings.center && state.wings.center.doorGrooveStyle) || 'plain')
                            : 'plain';
                        if (_bathGrooveExt !== 'plain') {
                            _drawGroovesOnPanel(_buildGroup, _bathGrooveExt, overlayW, extDrawerH, t, overlayCenterX, dY, fZ + t / 2, matExternal);
                        }
                    }
                } else if (!isExt) {
                    const _drawerFrontGap = 8; // cm clearance from cabinet front face
                    const shelfFrontZ = _isSlidingWardrobe
                        ? (bodyD / 2 - 10)
                        : (bodyD / 2 - _drawerFrontGap);
                    const cabinetBackZ = _isSlidingWardrobe
                        ? (-bodyD / 2 + 1)
                        : (-bodyD / 2 + backT);

                    _renderInternalDrawerBoxCell({
                        createBoard, matInternal,
                        centerX: colCenterX,
                        cellWidth: col.width,
                        cellBottomY: prevY,
                        compH,
                        count,
                        shelfFrontZ,
                        cabinetBackZ,
                        partIdPrefix: `drawer_c${c}_r${r}`,
                    });
                }
            }
            // === מחיצה אנכית בתוך תא (partition) — N boards support ===
            if (compData && compData.partition && compH > 0) {
                // Migrate legacy partitionX → partitions[] if needed
                if (!Array.isArray(compData.partitions)) {
                    compData.partitions = [typeof compData.partitionX === 'number' ? compData.partitionX : 0.5];
                    delete compData.partitionX;
                }
                if (!Array.isArray(compData.subCells) || compData.subCells.length < compData.partitions.length + 1) {
                    const needed = compData.partitions.length + 1;
                    if (!Array.isArray(compData.subCells)) compData.subCells = [];
                    while (compData.subCells.length < needed) compData.subCells.push({ type: 'empty', shelves: 0 });
                }

                const partitions = compData.partitions; // sorted array of ratios
                const colLeft = colCenterX - col.width / 2;
                let partD = bodyD - 2;
                let partZ = 0;
                if (!isBP && isHiddenByDoor(compCenterY)) { partD = bodyD - t; partZ = -t/2; }

                const partMat = (compData.type === 'open_cell' || compData.type === 'side_open_cell') ? matOpenCell : matInternal;

                // Helper: render one content type in a sub-compartment zone (3D only)
                // subIdx: index of this sub-cell within compData.subCells (for adjacency checks)
                const _renderSubContent = (subType, subCenterX, subW, zoneBottomY, zoneH, subIdx = -1, doorStyle = 'solid') => {
                    if (!subType || subType === 'empty' || subType === 'partition') return;
                    doorStyle = doorStyle || 'solid';
                    const _subDoorMat = () => {
                        if (doorStyle === 'glass_mirror') {
                            const _mirrorIntensity = (window._hdrIntensity && window._hdrIntensity.mirror != null) ? window._hdrIntensity.mirror : 2.8;
                            const mirrorMat = new THREE.MeshStandardMaterial({
                                color: 0x888888, metalness: 1.0, roughness: 0.0,
                                envMapIntensity: _mirrorIntensity, side: THREE.FrontSide
                            });
                            const _mirrorMap = window._hdrEnvMapSharp || window._hdrEnvMap;
                            if (_mirrorMap) { mirrorMat.envMap = _mirrorMap; mirrorMat.needsUpdate = true; }
                            return mirrorMat;
                        }
                        return matExternal;
                    };
                    const _subCreateDoorPanel = (w, h, cx, cy, z, mat) => {
                        const mesh = createBoard(w, h, t, cx, cy, z, mat);
                        _registerDoorMesh(mesh);
                        return mesh;
                    };
                    if (subType === 'hanging' || subType === 'sorbet') {
                        // Place near the front face so the rod is obvious in front-edit view
                        const rodZ = Math.max(0, bodyD / 2 - 10);
                        const rodLen = Math.max(4, subW - 2);
                        const rodY = zoneBottomY + Math.max(zoneH - 6, zoneH * 0.85);
                        const rodMat = new THREE.MeshStandardMaterial({
                            color: 0xc0c0c0, metalness: 0.55, roughness: 0.35,
                            emissive: 0x333333, emissiveIntensity: 0.15
                        });
                        const rod = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, rodLen, 16), rodMat);
                        rod.rotation.z = Math.PI / 2;
                        rod.position.set(subCenterX, rodY, rodZ);
                        rod.name = 'subHangRod';
                        _buildGroup.add(rod);
                        if (window._DEBUG_HANG) {
                            console.log('[HANG/PARTITION] RENDER rod', {
                                subType: subType, subIdx: subIdx,
                                subCenterX: subCenterX, subW: subW,
                                zoneBottomY: zoneBottomY, zoneH: zoneH,
                                rodY: rodY, rodZ: rodZ, rodLen: rodLen
                            });
                        }
                        if (subType === 'sorbet' && zoneH > 40) {
                            // Simplified pull-down housing for sub-cell sorbet
                            const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.4, roughness: 0.6 });
                            const houseW = Math.min(subW - 4, 18);
                            const house = new THREE.Mesh(new THREE.BoxGeometry(houseW, 4, 6), darkMat);
                            house.position.set(subCenterX, zoneBottomY + zoneH - 3, rodZ);
                            _buildGroup.add(house);
                        }
                    } else if (subType === 'internal_drawers') {
                        const count = 2;
                        const _subSide = subCenterX < colCenterX ? 'R' : 'L';
                        const _drawerFrontGap = 8;
                        const shelfFrontZ = _isSlidingWardrobe
                            ? (bodyD / 2 - 10)
                            : (bodyD / 2 - _drawerFrontGap);
                        const cabinetBackZ = _isSlidingWardrobe
                            ? (-bodyD / 2 + 1)
                            : (-bodyD / 2 + backT);

                        _renderInternalDrawerBoxCell({
                            createBoard, matInternal,
                            centerX: subCenterX,
                            cellWidth: subW,
                            cellBottomY: zoneBottomY,
                            compH: zoneH,
                            count,
                            shelfFrontZ,
                            cabinetBackZ,
                            partIdPrefix: `drawer_sub_c${c}_r${r}_${_subSide}`,
                        });
                    } else if (subType === 'external_drawers') {
                        const count = 2;
                        const innerGap = 0.4;
                        const drawerH = (zoneH - innerGap*(count+1)) / count;
                        const fZ = bodyD/2 - t/2 - 1.5;
                        const fingerGap = 2.5;
                        const actualDrawerH = drawerH - fingerGap;
                        for(let d=0; d<count; d++) {
                            const dY = zoneBottomY + innerGap + drawerH/2 + (d * (drawerH + innerGap));
                            const actualDY = dY - fingerGap/2;
                            createBoard(subW - innerGap*2 - 2, actualDrawerH, t, subCenterX, actualDY, fZ, matExternal);
                            const backPanel = new THREE.Mesh(new THREE.BoxGeometry(subW - innerGap*2 - 4, fingerGap, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                            backPanel.position.set(subCenterX, dY + drawerH/2 - fingerGap/2, fZ - t/2 - 0.25);
                            _buildGroup.add(backPanel);
                        }
                    } else if (subType === 'door_right' || subType === 'door_left' || subType === 'door_double') {
                        if (!state.hasDoors) return;
                        const fZ = isInset ? (bodyD/2 - t/2) : (bodyD/2 + t/2 + 0.1);
                        const doorH = zoneH + t;
                        const doorY = zoneBottomY + zoneH / 2;
                        const doorMat = _subDoorMat();
                        if (subType === 'door_double') {
                            const halfW = (subW + t) / 2;
                            const lCX = subCenterX - halfW / 2;
                            const rCX = subCenterX + halfW / 2;
                            _subCreateDoorPanel(halfW, doorH, lCX, doorY, fZ, doorMat);
                            _subCreateDoorPanel(halfW, doorH, rCX, doorY, fZ, doorMat);
                            if (!isBP) {
                                const hz = fZ + t / 2 + 1.5;
                                if (_handleStyle === 'riding') {
                                    _addRidingDoorHandle(_buildGroup, subCenterX, doorY, hz, doorH);
                                } else if (_handleStyle === 'pipe') {
                                    const handleH = Math.min(doorH * 0.35, 12);
                                    const handleMatD = _handleMat3D();
                                    const hL = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, handleH, 12), handleMatD);
                                    hL.position.set(lCX + halfW * 0.35, doorY, hz);
                                    _buildGroup.add(hL);
                                    _registerDoorMesh(hL);
                                    const hR = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, handleH, 12), handleMatD);
                                    hR.position.set(rCX - halfW * 0.35, doorY, hz);
                                    _buildGroup.add(hR);
                                    _registerDoorMesh(hR);
                                }
                            }
                        } else {
                            const doorW = subW + t;
                            _subCreateDoorPanel(doorW, doorH, subCenterX, doorY, fZ, doorMat);
                            if (!isBP) {
                                const hz = fZ + t / 2 + 1.5;
                                if (_handleStyle === 'riding') {
                                    const seamX = subType === 'door_right'
                                        ? subCenterX - doorW / 2
                                        : subCenterX + doorW / 2;
                                    _addRidingDoorHandle(_buildGroup, seamX, doorY, hz, doorH);
                                } else if (_handleStyle === 'pipe' && doorStyle !== 'glass_mirror') {
                                    const isRight = subType === 'door_right';
                                    const handleX = isRight ? subCenterX - subW * 0.35 : subCenterX + subW * 0.35;
                                    const handleMesh = new THREE.Mesh(
                                        new THREE.CylinderGeometry(0.5, 0.5, Math.min(doorH * 0.35, 12), 12),
                                        _handleMat3D()
                                    );
                                    handleMesh.position.set(handleX, doorY, hz);
                                    _buildGroup.add(handleMesh);
                                    _registerDoorMesh(handleMesh);
                                }
                            }
                        }
                    } else if (subType === 'door_flap') {
                        if (!state.hasDoors) return;
                        const fZ = isInset ? (bodyD/2 - t/2) : (bodyD/2 + t/2 + 0.1);
                        const flapH = zoneH + t;
                        const flapY = zoneBottomY + zoneH / 2;
                        const flapW = subW + t;
                        _subCreateDoorPanel(flapW, flapH, subCenterX, flapY, fZ, _subDoorMat());
                        if (!isBP && doorStyle !== 'glass_mirror') {
                            const hz = fZ + t / 2 + 1.5;
                            if (_handleStyle === 'pipe') {
                                const handleH = Math.min(flapH * 0.25, 12);
                                const handleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, handleH, 12), _handleMat3D());
                                handleMesh.rotation.z = Math.PI / 2;
                                handleMesh.position.set(subCenterX + flapW * 0.35, zoneBottomY + 4, hz);
                                _buildGroup.add(handleMesh);
                                _registerDoorMesh(handleMesh);
                            } else if (_handleStyle === 'riding') {
                                const barLen = Math.min(RIDING_HANDLE_LEN, Math.max(8, flapW - 4));
                                const bar = new THREE.Mesh(new THREE.BoxGeometry(barLen, 0.8, 0.8), _handleMat3D());
                                bar.position.set(subCenterX, zoneBottomY + 0.6, hz);
                                _buildGroup.add(bar);
                                _registerDoorMesh(bar);
                            }
                        }
                    } else if (subType === 'honeycomb') {
                        // Rendered like open_cell: use matOpenCell, proper frame
                        // Skip shared inner side wall when adjacent sub-cell is also honeycomb (merge into one unit)
                        const innerT = t;
                        const frameY = zoneBottomY + zoneH / 2;
                        // Top board
                        createBoard(subW, innerT, bodyD - 2, subCenterX, zoneBottomY + zoneH - innerT / 2, 1, matOpenCell);
                        // Bottom board
                        createBoard(subW, innerT, bodyD - 2, subCenterX, zoneBottomY + innerT / 2, 1, matOpenCell);
                        // Back panel
                        createBoard(subW - 2 * innerT, zoneH - 2 * innerT, 0.5, subCenterX, frameY, -bodyD / 2 + 0.6, matOpenCell);
                        // Side walls — skip shared wall when adjacent sub-cell is also honeycomb (merge)
                        const _leftNeighborIsHoney = (subIdx > 0) && compData.subCells[subIdx - 1] && compData.subCells[subIdx - 1].type === 'honeycomb';
                        const _rightNeighborIsHoney = (subIdx >= 0) && (subIdx < boundaryXs.length - 2) && compData.subCells[subIdx + 1] && compData.subCells[subIdx + 1].type === 'honeycomb';
                        if (!_leftNeighborIsHoney) {
                            createBoard(innerT, zoneH - 2 * innerT, bodyD - 2, subCenterX - subW / 2 + innerT / 2, frameY, 1, matOpenCell);
                        }
                        if (!_rightNeighborIsHoney) {
                            createBoard(innerT, zoneH - 2 * innerT, bodyD - 2, subCenterX + subW / 2 - innerT / 2, frameY, 1, matOpenCell);
                        }
                    }
                };

                // Build boundary X positions: [colLeft, partX0, partX1, ..., colRight]
                const boundaryXs = [colLeft, ...partitions.map(px => colLeft + col.width * px), colLeft + col.width];

                // Draw N partition boards + push drag handles
                partitions.forEach((px, pi) => {
                    const partX = colLeft + col.width * px;
                    if (isBP) {
                        createBoard(t, compH, 0, partX, compCenterY, 0);
                    } else {
                        createBoard(t, compH, partD, partX, compCenterY, partZ, partMat);
                    }
                    if (!isBP) {
                        dragHandlesData.partitions.push({ colIndex: c, rowIndex: r, partIdx: pi, x: partX, y: compCenterY, comp: compData });
                    }
                });

                // Blueprint: width labels for each sub-cell
                if (isBP) {
                    for (let si = 0; si < boundaryXs.length - 1; si++) {
                        const x1 = boundaryXs[si] + (si === 0 ? 0 : t/2);
                        const x2 = boundaryXs[si+1] - (si === boundaryXs.length - 2 ? 0 : t/2);
                        const subW = x2 - x1;
                        const subCX = (x1 + x2) / 2;
                        state.bpData.push({ type: 'width', val: Math.round(subW), x: subCX, y: compCenterY, halfW: subW / 2, isSubCell: true });
                    }
                }

                // Draw sub-cell shelves and content (N+1 sub-cells)
                if (compData.subCells && (compData.type !== 'open_cell' && compData.type !== 'side_open_cell')) {
                    const _parseSubKeyEng = (key) => {
                        const parts = String(key).split(':');
                        return { si: parseInt(parts[0], 10), z: parseInt(parts[1] || '0', 10) };
                    };
                    const _subZoneYBounds = (sub, z) => {
                        const numShelves = (sub && sub.shelves) || 0;
                        const compTopY = prevY + compH;
                        if (numShelves <= 0) return { bottomY: prevY, topY: compTopY, h: compH };
                        let subShelvesY = [];
                        if (Array.isArray(sub.shelvesY) && sub.shelvesY.length === numShelves) {
                            subShelvesY = sub.shelvesY;
                        } else {
                            const zoneH = compH / (numShelves + 1);
                            for (let s = 1; s <= numShelves; s++) subShelvesY.push(prevY + zoneH * s);
                        }
                        const rawBounds = [prevY, ...subShelvesY, compTopY];
                        const clearBounds = rawBounds.map((y, i) => {
                            if (i === 0 || i === rawBounds.length - 1) return y;
                            return y + t / 2;
                        });
                        const zoneBottomY = clearBounds[z];
                        const zoneTopY = (z < subShelvesY.length) ? rawBounds[z + 1] - t / 2 : compTopY;
                        return { bottomY: zoneBottomY, topY: zoneTopY, h: zoneTopY - zoneBottomY };
                    };
                    const _keyInDoorGroup = (si, z) => {
                        const k = `${si}:${z}`;
                        return (compData.zoneDoorGroups || []).some(g => g.keys.includes(k));
                    };
                    const _subZoneIsHoneycomb = (si, z) => {
                        const sub = compData.subCells[si];
                        if (!sub) return false;
                        const zoneKey = `${si}:${z}`;
                        const grp = (compData.zoneDoorGroups || []).find(g => g.keys.includes(zoneKey));
                        if (grp) return grp.type === 'honeycomb';
                        const zoneType = (Array.isArray(sub.zonesType) && sub.zonesType[z] != null && sub.zonesType[z] !== '')
                            ? ((sub.zonesType[z] === 'partition') ? 'empty' : sub.zonesType[z])
                            : ((sub.shelves || 0) <= 0 ? (sub.type || 'empty') : 'empty');
                        return zoneType === 'honeycomb' || zoneType === 'open_cell' || zoneType === 'side_open_cell';
                    };

                    for (let si = 0; si < boundaryXs.length - 1; si++) {
                        const sub = compData.subCells[si];
                        if (!sub) continue;
                        // Sanitize accidental invalid zone types (e.g. 'partition' stored as content)
                        if (Array.isArray(sub.zonesType)) {
                            for (let zi = 0; zi < sub.zonesType.length; zi++) {
                                if (sub.zonesType[zi] === 'partition') sub.zonesType[zi] = 'empty';
                            }
                        }
                        if (sub.type === 'partition') sub.type = 'empty';
                        const x1 = boundaryXs[si] + (si === 0 ? 0 : t/2);
                        const x2 = boundaryXs[si+1] - (si === boundaryXs.length - 2 ? 0 : t/2);
                        const subW = x2 - x1;
                        const subCenterX = (x1 + x2) / 2;
                        const numShelves = sub.shelves || 0;

                        // Build actual shelf Y positions — use stored shelvesY or distribute evenly
                        let subShelvesY = [];
                        if (Array.isArray(sub.shelvesY) && sub.shelvesY.length === numShelves) {
                            subShelvesY = sub.shelvesY;
                        } else if (numShelves > 0) {
                            const zoneH = compH / (numShelves + 1);
                            for (let s = 1; s <= numShelves; s++) subShelvesY.push(prevY + zoneH * s);
                            sub.shelvesY = subShelvesY;
                        }

                        // Push per-zone sub-cell + buttons for UI overlay
                        if (!isBP && _isActiveWingBuild) {
                            const compTopY = prevY + compH;
                            const zoneBounds = [prevY, ...subShelvesY, compTopY];
                            const numZones = zoneBounds.length - 1;
                            // Ensure zonesType array is sized correctly
                            if (!Array.isArray(sub.zonesType) || sub.zonesType.length !== numZones) {
                                sub.zonesType = Array.from({ length: numZones }, (_, z) =>
                                    (sub.zonesType && sub.zonesType[z]) ? sub.zonesType[z] : (sub.type || 'empty')
                                );
                            }
                            for (let z = 0; z < numZones; z++) {
                                const zoneCenterY = (zoneBounds[z] + zoneBounds[z + 1]) / 2;
                                const zoneKey = `${si}:${z}`;
                                const doorGrp = (compData.zoneDoorGroups || []).find(g => g.keys.includes(zoneKey));
                                let btnSubType = sub.zonesType[z] || 'empty';
                                if (doorGrp) btnSubType = doorGrp.type;
                                state.dimData.push({
                                    isSubCellBtn: true,
                                    colIndex: c, rowIndex: r, subCellIdx: si,
                                    zoneIdx: z, numZones,
                                    x: subCenterX, y: zoneCenterY,
                                    subType: btnSubType
                                });
                            }
                            // Push drag handles for each sub-cell shelf
                            for (let s = 0; s < subShelvesY.length; s++) {
                                dragHandlesData.vertical.push({
                                    colIndex: c, rowIndex: r, subCellIdx: si, subShelfIdx: s,
                                    x: subCenterX, y: subShelvesY[s],
                                    isSubCellShelf: true
                                });
                            }
                        }

                        if (numShelves > 0) {
                            const subD = Math.max(t, bodyD - 2 - _shelfFrontSetback);
                            for (let s = 0; s < subShelvesY.length; s++) {
                                const shelfInHoneycomb = _subZoneIsHoneycomb(si, s) || _subZoneIsHoneycomb(si, s + 1);
                                const shelfMat = shelfInHoneycomb ? matOpenCell : matInternal;
                                const shelfZ = (shelfInHoneycomb ? 1 : 0) - _shelfFrontSetback / 2;
                                createBoard(subW, t, subD, subCenterX, subShelvesY[s], shelfZ, shelfMat);
                            }
                            if (!isBP) {
                                const compTopY = prevY + compH;
                                // Adjust zone bounds to clear space (inside shelf boards):
                                // bottom of zone = shelf center + t/2, top of zone = next shelf center - t/2
                                const rawBounds = [prevY, ...subShelvesY, compTopY];
                                const clearBounds = rawBounds.map((y, i) => {
                                    if (i === 0) return y;                    // compartment bottom — no adjustment
                                    if (i === rawBounds.length - 1) return y; // compartment top — no adjustment
                                    return y + t / 2;                         // shelf center → top of shelf board
                                });
                                for (let z = 0; z < clearBounds.length - 1; z++) {
                                    const zoneBottomY = clearBounds[z];
                                    // top of zone = bottom of next shelf board (next rawBound - t/2), or compTopY
                                    const zoneTopY = (z < subShelvesY.length)
                                        ? rawBounds[z + 1] - t / 2
                                        : compTopY;
                                    const zoneH = zoneTopY - zoneBottomY;
                                    if (zoneH <= 0) {
                                        if (window._DEBUG_HANG) console.warn('[HANG/PARTITION] SKIP zoneH<=0', { si: si, z: z, zoneBottomY: zoneBottomY, zoneTopY: zoneTopY });
                                        continue;
                                    }
                                    // Per-zone type: use zonesType[z] if available, else fall back to sub.type
                                    let zoneType = (Array.isArray(sub.zonesType) && sub.zonesType[z] != null && sub.zonesType[z] !== '')
                                        ? sub.zonesType[z]
                                        : (sub.type || 'empty');
                                    if (zoneType === 'partition') zoneType = 'empty';
                                    if (zoneType && zoneType !== 'empty' && !_keyInDoorGroup(si, z)) {
                                        const zoneStyle = (Array.isArray(sub.zonesDoorStyle) && sub.zonesDoorStyle[z]) ? sub.zonesDoorStyle[z] : 'solid';
                                        _renderSubContent(zoneType, subCenterX, subW, zoneBottomY, zoneH, si, zoneStyle);
                                    } else if (window._DEBUG_HANG && zoneType && zoneType !== 'empty' && _keyInDoorGroup(si, z)) {
                                        console.warn('[HANG/PARTITION] SKIP render — zone still in door group', { si: si, z: z, zoneType: zoneType });
                                    }
                                }
                            }
                        } else if (!isBP && !_keyInDoorGroup(si, 0)) {
                            let zoneType = (Array.isArray(sub.zonesType) && sub.zonesType[0] != null && sub.zonesType[0] !== '')
                                ? sub.zonesType[0]
                                : (sub.type || 'empty');
                            if (zoneType === 'partition') zoneType = 'empty';
                            if (zoneType && zoneType !== 'empty') {
                                const zoneStyle = (Array.isArray(sub.zonesDoorStyle) && sub.zonesDoorStyle[0]) ? sub.zonesDoorStyle[0] : 'solid';
                                _renderSubContent(zoneType, subCenterX, subW, prevY, compH, si, zoneStyle);
                            }
                        } else if (window._DEBUG_HANG && _keyInDoorGroup(si, 0)) {
                            console.warn('[HANG/PARTITION] SKIP render (no shelves) — zone in door group', {
                                si: si, type: sub.type, zonesType: sub.zonesType
                            });
                        }
                    }

                    // Merged doors / honeycomb spanning multiple sub-cell zones
                    if (!isBP && Array.isArray(compData.zoneDoorGroups)) {
                        compData.zoneDoorGroups.forEach(group => {
                            if (!group || !group.keys || !group.keys.length || !group.type) return;
                            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                            group.keys.forEach(key => {
                                const { si, z } = _parseSubKeyEng(key);
                                const sub = compData.subCells[si];
                                if (!sub || si < 0 || si >= boundaryXs.length - 1) return;
                                const x1 = boundaryXs[si] + (si === 0 ? 0 : t / 2);
                                const x2 = boundaryXs[si + 1] - (si === boundaryXs.length - 2 ? 0 : t / 2);
                                const yb = _subZoneYBounds(sub, z);
                                if (yb.h <= 0) return;
                                minX = Math.min(minX, x1);
                                maxX = Math.max(maxX, x2);
                                minY = Math.min(minY, yb.bottomY);
                                maxY = Math.max(maxY, yb.topY);
                            });
                            if (!isFinite(minX) || maxY - minY <= 0 || maxX - minX <= 0) return;
                            const spanW = maxX - minX;
                            const spanH = maxY - minY;
                            const centerX = (minX + maxX) / 2;
                            _renderSubContent(group.type, centerX, spanW, minY, spanH, -1, group.style || 'solid');
                        });
                    }
                }
            }
            // ==========================================

            prevY = isLast ? col.height : div.y + div.thick/2;
        }

        if (state.hasDoors && col.doors && col.doors.length > 0 && !isBP) {
            // For side wings, clip doors so they don't extend into the hidden zone
            // behind the center cabinet. This applies in both edit mode and free 3D mode.
            // Red line is at: left wing → lineX = wingW/2 - centerD (clip right edge)
            //                 right wing → lineX = -wingW/2 + centerD (clip left edge)
            let _doorOverlayLeftX = overlayLeftX;
            let _doorOverlayRightX = overlayRightX;
            // Determine if this wing is a side wing (has hidden zone)
            const _thisWingId = _buildGroup && _buildGroup.userData ? _buildGroup.userData.wingId : null;
            const _thisWingData = _thisWingId ? state.wings[_thisWingId] : null;
            const _thisWingPos = _thisWingData ? (_thisWingData.wingPosition || 'side') : null;
            if (_thisWingId && _thisWingId !== 'center' && _thisWingPos === 'side') {
                const _cwData = state.wings.center;
                const _centerD = _cwData ? _cwData.depth : state.depth;
                const _wingW = state.width;
                const _isLeftWing = (_thisWingId === 'left');
                const _lineX = _isLeftWing ? (_wingW / 2 - _centerD) : (-_wingW / 2 + _centerD);
                if (_isLeftWing) {
                    // Hidden zone is to the RIGHT of _lineX — clip door's right edge
                    _doorOverlayRightX = Math.min(_doorOverlayRightX, _lineX);
                } else {
                    // Hidden zone is to the LEFT of _lineX — clip door's left edge
                    _doorOverlayLeftX = Math.max(_doorOverlayLeftX, _lineX);
                }
            } else if (_thisWingId === 'center') {
                // Center cabinet with a front wing: clip doors on the corner column
                // Right front wing covers the RIGHT edge → clip rightmost column's door right edge
                // Left front wing covers the LEFT edge → clip leftmost column's door left edge
                const _rightWing = state.wings.right;
                const _leftWing  = state.wings.left;
                const _rightIsFront = _rightWing && (_rightWing.wingPosition || 'side') === 'front';
                const _leftIsFront  = _leftWing  && (_leftWing.wingPosition  || 'side') === 'front';
                const _wingW = state.width;
                if (_rightIsFront) {
                    const _frontD = _rightWing.depth || state.depth;
                    const _lineX = _wingW / 2 - _frontD;
                    _doorOverlayRightX = Math.min(_doorOverlayRightX, _lineX);
                }
                if (_leftIsFront) {
                    const _frontD = _leftWing.depth || state.depth;
                    const _lineX = -_wingW / 2 + _frontD;
                    _doorOverlayLeftX = Math.max(_doorOverlayLeftX, _lineX);
                }
            }
            const _doorOverlayW = _doorOverlayRightX - _doorOverlayLeftX;
            const _doorOverlayCenterX = (_doorOverlayLeftX + _doorOverlayRightX) / 2;

            col.doors.forEach((door, doorIdx) => {
                const doorPartId = `door_c${c}_d${doorIdx}`;
                let doorBottomY, doorTopY;
                // Clamp door row indices to valid range (guard against stale saved state)
                const _safeStartRow = Math.max(0, Math.min(door.startRow, dividersAsc.length));
                const _safeEndRow   = Math.max(0, Math.min(door.endRow,   dividersAsc.length));
                // Use dividersAsc (ascending by Y) — dividers was re-sorted descending at line 729
                if (isInset) {
                    let baseForInset = col.type === 'desk' ? col.deskHeight + col.deskClearance : Math.max(state.plinthHeight, fo);
                    doorBottomY = (_safeStartRow === 0) ? (baseForInset + t) : (dividersAsc[_safeStartRow - 1].y + dividersAsc[_safeStartRow - 1].thick/2);
                    doorTopY = (_safeEndRow === dividersAsc.length) ? (col.height - t) : (dividersAsc[_safeEndRow].y - dividersAsc[_safeEndRow].thick/2);
                    doorBottomY += doorGap/2;
                    doorTopY -= doorGap/2;
                } else {
                    // For bathroom regalim: extend door fronts down by t to cover the bottom plate face.
                    const _bathRegalimDoor = (state.presetId === 'bathroom' && isRegalim && door.startRow === 0 && fo === 0 && col.type !== 'desk');
                    let baseY = col.type === 'desk' ? col.deskHeight + col.deskClearance : (_bathRegalimDoor ? state.plinthHeight - t : Math.max(state.plinthHeight, fo));
                    if (_safeStartRow === 0 && col.type !== 'desk' && state.plinthHeight === 7 && fo === 0 && !_bathRegalimDoor) baseY = 1.5;
                    doorBottomY = (_safeStartRow === 0) ? (baseY + doorGap/2) : (dividersAsc[_safeStartRow - 1].y + doorGap/2);
                    doorTopY = (_safeEndRow === dividersAsc.length) ? (col.height - doorGap/2) : (dividersAsc[_safeEndRow].y - doorGap/2);
                }
                
                const dH = doorTopY - doorBottomY;
                if(dH <= 0) return;
                if(_doorOverlayW <= 0) return; // entire door is in hidden zone — skip
                // Partitioned compartments usually use per-zone doors, but inset-front models
                // also allow a regular full-column door over a partitioned opening.
                if (!isInset) {
                    for (let _pr = _safeStartRow; _pr <= _safeEndRow; _pr++) {
                        const _pComp = col.compartments[_pr];
                        if (_pComp && _pComp.partition) return;
                    }
                }

                // ---- Flap door (קלפה): covers entire front face of the column (wall-to-wall, floor-to-ceiling) ----
                if (door.type === 'flap') {
                    // Raw outer width: from outer face of left wall to outer face of right wall (NO gap)
                    const flapLeftX  = isInset ? currentX : (isLeftmost ? currentX - t : currentX - t / 2);
                    const flapRightX = isInset ? currentX + col.width : (isRightmost ? currentX + col.width + t : currentX + col.width + t / 2);
                    const flapW = flapRightX - flapLeftX;
                    const flapCenterX = (flapLeftX + flapRightX) / 2;
                    // Full outer height: from very bottom of cabinet to very top (col.height)
                    // For noPlinth columns (upper unit): start at y=0 (bottom of cabinet body)
                    // For normal columns with plinth: start at state.plinthHeight (top of plinth solid)
                    const flapBaseY = fo > 0 ? fo : (col.noPlinth ? 0 : state.plinthHeight);
                    const flapTopY = col.height;
                    const flapH = flapTopY - flapBaseY;
                    if (flapH <= 0) return;
                    // Position in front of the cabinet face
                    const flapZ = isInset ? (bodyD / 2 - t / 2) : (bodyD / 2 + t / 2 + 0.1);
                    const flapY = flapBaseY + flapH / 2;
                    const flapMatBase = isBP ? new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }) : matExternal;
                    const flapMat = isBP ? flapMatBase : _ppResolveMat(flapMatBase, doorPartId);
                    const flapGeo = new THREE.BoxGeometry(flapW, flapH, t);
                    const flapMesh = new THREE.Mesh(flapGeo, flapMat);
                    flapMesh.position.set(flapCenterX, flapY, flapZ);
                    if (isBP) flapMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(flapGeo), new THREE.LineBasicMaterial({ color: 0x000000 })));
                    _buildGroup.add(flapMesh);
                    _ppRegisterMesh(flapMesh, doorPartId);
                    const _flapHandleStyle = door.handleStyle || _handleStyle;
                    if (!isBP && _flapHandleStyle === 'pipe') {
                        const handleH = Math.min(flapH * 0.25, 12);
                        const handleMesh = new THREE.Mesh(
                            new THREE.CylinderGeometry(0.5, 0.5, handleH, 12),
                            _handleMat3D()
                        );
                        handleMesh.position.set(flapCenterX + flapW * 0.35, flapBaseY + 4, flapZ + t / 2 + 1.5);
                        _buildGroup.add(handleMesh);
                    } else if (!isBP && _flapHandleStyle === 'riding') {
                        const barLen = Math.min(RIDING_HANDLE_LEN, Math.max(8, flapW - 4));
                        const mat = _ridingHandleMat();
                        const bar = new THREE.Mesh(new THREE.BoxGeometry(barLen, 0.75, 0.9), mat);
                        bar.position.set(flapCenterX, flapBaseY + 0.6, flapZ + t / 2 + 0.85);
                        _buildGroup.add(bar);
                    }
                    return; // flap door rendered — skip regular door logic
                }

                const dY = doorBottomY + dH/2;
                const zPos = isInset ? (bodyD/2 - t/2) : (bodyD/2 + t/2 + 0.1);

                const makeDoor = (w, isLeft, centerX, style, uvTotalW, partIdSuffix) => {
                    style = style || 'solid';
                    partIdSuffix = partIdSuffix || doorPartId;
                    // For framed/glass styles, the frame profiles protrude fd=1.5cm in front of the door panel.
                    // To keep all door styles flush at the same front face, shift the door group back by fd
                    // so the frame's front face aligns with a solid door's front face.
                    // fz = t/2 + fd/2 (frame center relative to group), frame front = fz + fd/2 = t/2 + fd
                    // solid door front = t/2 (relative to group). Difference = fd → shift back by fd.
                    const fd_offset = (style !== 'solid' && style !== 'glass_mirror') ? 1.5 : 0; // fd = 1.5cm; mirror is flush like solid
                    const pivotX = centerX + (isLeft ? -w/2 : w/2);
                    const doorGroup = new THREE.Group();
                    doorGroup.position.set(pivotX, dY, zPos - fd_offset);
                    _buildGroup.add(doorGroup);
                    
                    const doorLocalX = isLeft ? w/2 : -w/2;

                    // --- Mirror door: solid reflective panel, no handle, no frame ---
                    if (style === 'glass_mirror') {
                        const _mirrorIntensity = (window._hdrIntensity && window._hdrIntensity.mirror != null) ? window._hdrIntensity.mirror : 2.8;
                        const mirrorMat = new THREE.MeshStandardMaterial({
                            color: 0x888888,
                            metalness: 1.0,
                            roughness: 0.0,
                            envMapIntensity: _mirrorIntensity,
                            side: THREE.FrontSide
                        });
                        const _mirrorMap = window._hdrEnvMapSharp || window._hdrEnvMap;
                        if (_mirrorMap) { mirrorMat.envMap = _mirrorMap; mirrorMat.needsUpdate = true; }
                        const mirrorGeo = new THREE.BoxGeometry(w, dH, t);
                        const mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
                        mirrorMesh.position.set(doorLocalX, 0, 0);
                        mirrorMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mirrorGeo), edgeMat));
                        doorGroup.add(mirrorMesh);
                        _ppRegisterMesh(mirrorMesh, partIdSuffix);
                        if (_isActiveWingBuild) doorMeshes.push(mirrorMesh);
                        return; // no handle, no frame
                    }

                    // --- Base door panel ---
                    // For glass styles: render only the frame profiles, no solid base panel
                    const isGlass = (style === 'glass_melamine' || style === 'glass_black' || style === 'glass_gold');
                    
                    if (!isGlass) {
                        // Solid base door (used by solid + framed_melamine)
                        let geometry = new THREE.BoxGeometry(w, dH, t);
                        // UV mapping for door: front/back faces fill full texture height,
                        // U scaled proportionally (w/dH) to preserve aspect ratio — no tiling, no squish.
                        // Side/top/bottom edges use tiling at 100cm scale (barely visible).
                        if (matExternal.map) {
                            const textureSize = 100;
                            const uv = geometry.attributes.uv;
                            // Side faces (left/right edges)
                            for (let i = 0; i < 8; i++) { uv.setXY(i, uv.getX(i) * (t / textureSize), uv.getY(i) * (dH / textureSize)); }
                            // Top/bottom faces
                            for (let i = 8; i < 16; i++) { uv.setXY(i, uv.getX(i) * (w / textureSize), uv.getY(i) * (t / textureSize)); }
                            // Front/back faces: full texture height (V: 0→1), U proportional to aspect ratio.
                            // For double doors: uvTotalW is the combined width so texture spans both panels.
                            const totalW = uvTotalW || w;
                            const uScale = totalW / dH; // aspect ratio based on total (or single) door width
                            const uOffset = (1 - uScale) / 2; // center horizontally
                            // For double doors, each panel shows its half of the texture
                            const uStart = uvTotalW ? (isLeft ? uOffset : uOffset + uScale / 2) : uOffset;
                            const uHalf = uvTotalW ? uScale / 2 : uScale;
                            for (let i = 16; i < 24; i++) {
                                uv.setXY(i, uStart + uv.getX(i) * uHalf, uv.getY(i));
                            }
                            uv.needsUpdate = true;
                        }
                        const doorMat = _ppResolveMat(matExternal, partIdSuffix).clone();

                        // ---- Bathroom groove style: slightly darken base panel for all groove styles ----
                        const _bathGroove = state.presetId === 'bathroom'
                            ? ((state.wings.center && state.wings.center.doorGrooveStyle) || 'plain')
                            : 'plain';
                        if (_bathGroove === 'waves') {
                            doorMat.color.multiplyScalar(0.72); // stronger darkening for cylinder bumps
                            doorMat.needsUpdate = true;
                        } else if (_bathGroove === 'v_grooves' || _bathGroove === 'h_grooves') {
                            doorMat.color.multiplyScalar(0.88); // subtle darkening for flat stripes
                            doorMat.needsUpdate = true;
                        }

                        const mesh = new THREE.Mesh(geometry, doorMat);
                        mesh.position.set(doorLocalX, 0, 0);
                        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMat));
                        
                        if (!isBP && (door.handleStyle || _handleStyle) === 'pipe') {
                            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15, 16), _handleMat3D());
                            handle.position.set(isLeft ? w/2 - 4 : -w/2 + 4, 0, t / 2 + 1.5);
                            mesh.add(handle);
                        }
                        doorGroup.add(mesh);
                        _ppRegisterMesh(mesh, partIdSuffix);
                        if (_isActiveWingBuild) doorMeshes.push(mesh);

                        if (_bathGroove !== 'plain') {
                            _drawGroovesOnPanel(doorGroup, _bathGroove, w, dH, t, doorLocalX, 0, t / 2 + 0.05, matExternal);
                        }
                    }

                    // --- Frame profiles (framed_melamine, glass_*) ---
                    if (style !== 'solid') {
                        // framed_melamine uses a wider profile (melamine is thicker than aluminum)
                        const fw = (style === 'framed_melamine') ? 8 : 4;  // frame profile width (cm)
                        const fd = 1.5;  // frame profile depth (cm)
                        const fz = t/2 + fd/2; // protrude in front of door face

                        let frameMat;
                        if (style === 'framed_melamine') {
                            frameMat = _ppResolveMat(matExternal, partIdSuffix).clone();
                        } else if (style === 'glass_melamine') {
                            frameMat = _ppResolveMat(matExternal, partIdSuffix).clone();
                        } else if (style === 'glass_black') {
                            frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.15, roughness: 0.3 });
                        } else if (style === 'glass_gold') {
                            frameMat = new THREE.MeshStandardMaterial({ color: 0xe5ba70, metalness: 0.15, roughness: 0.3 });
                        }

                        // glass_black / glass_gold: no handle (aluminum frame doors don't have separate handles)
                        const isAlumFrame = (style === 'glass_black' || style === 'glass_gold');
                        // For glass_melamine: add handle on the frame (no back panel — glass is transparent)
                        if (isGlass && !isAlumFrame && (door.handleStyle || _handleStyle) === 'pipe') {
                            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15, 16), _handleMat3D());
                            handle.position.set(doorLocalX + (isLeft ? w/2 - 4 : -w/2 + 4), 0, fz + fd / 2 + 1.5);
                            doorGroup.add(handle);
                        }

                        const _addFramePart = (frameMesh) => {
                            doorGroup.add(frameMesh);
                            _ppRegisterMesh(frameMesh, partIdSuffix);
                        };

                        // Top frame bar
                        const topGeo = new THREE.BoxGeometry(w, fw, fd);
                        const topMesh = new THREE.Mesh(topGeo, frameMat);
                        topMesh.position.set(doorLocalX, dH/2 - fw/2, fz);
                        _addFramePart(topMesh);

                        // Bottom frame bar
                        const botGeo = new THREE.BoxGeometry(w, fw, fd);
                        const botMesh = new THREE.Mesh(botGeo, frameMat);
                        botMesh.position.set(doorLocalX, -dH/2 + fw/2, fz);
                        _addFramePart(botMesh);

                        // Left side bar (between top and bottom bars)
                        const sideH = dH - fw * 2;
                        const leftGeo = new THREE.BoxGeometry(fw, sideH, fd);
                        const leftMesh = new THREE.Mesh(leftGeo, frameMat);
                        leftMesh.position.set(doorLocalX - w/2 + fw/2, 0, fz);
                        _addFramePart(leftMesh);

                        // Right side bar
                        const rightGeo = new THREE.BoxGeometry(fw, sideH, fd);
                        const rightMesh = new THREE.Mesh(rightGeo, frameMat);
                        rightMesh.position.set(doorLocalX + w/2 - fw/2, 0, fz);
                        _addFramePart(rightMesh);

                        // Glass center panel (for glass styles)
                        if (isGlass) {
                            const glassW = w - fw * 2;
                            const glassH = dH - fw * 2;
                            if (glassW > 0 && glassH > 0) {
                                const glassGeo = new THREE.PlaneGeometry(glassW, glassH);
                                const glassMat = new THREE.MeshStandardMaterial({
                                    color: 0xc8e6ff,
                                    transparent: true,
                                    opacity: 0.25,
                                    roughness: 0.0,
                                    metalness: 0.2,
                                    side: THREE.DoubleSide,
                                    depthWrite: false,
                                    envMapIntensity: 1.2
                                });
                                if (window._hdrEnvMap) { glassMat.envMap = window._hdrEnvMap; glassMat.needsUpdate = true; }
                                const glassMesh = new THREE.Mesh(glassGeo, glassMat);
                                glassMesh.position.set(doorLocalX, 0, fz);
                                doorGroup.add(glassMesh);
                            }
                        }
                    }
                };

                const doorStyle = door.style || 'solid';
                // Use clipped overlay dimensions (_doorOverlayW / _doorOverlayCenterX)
                // so doors don't extend into the hidden zone behind the center cabinet
                const _doorHz = zPos + t / 2 + 1.5 + ((doorStyle !== 'solid' && doorStyle !== 'glass_mirror') ? 1.5 : 0);
                if (door.type === 'left') makeDoor(_doorOverlayW, true, _doorOverlayCenterX, doorStyle);
                if (door.type === 'right') makeDoor(_doorOverlayW, false, _doorOverlayCenterX, doorStyle);
                if (door.type === 'double') {
                    const w = (_doorOverlayW / 2) - (doorGap / 2);
                    makeDoor(w, true, _doorOverlayCenterX - w/2 - doorGap/2, doorStyle, _doorOverlayW);
                    makeDoor(w, false, _doorOverlayCenterX + w/2 + doorGap/2, doorStyle, _doorOverlayW);
                }
                if (!isBP && (door.handleStyle || _handleStyle) === 'riding' && doorStyle !== 'glass_mirror') {
                    if (door.type === 'double') {
                        _addRidingDoorHandle(_buildGroup, _doorOverlayCenterX, dY, _doorHz, dH);
                    } else if (door.type === 'left') {
                        _addRidingDoorHandle(_buildGroup, _doorOverlayCenterX + _doorOverlayW / 2, dY, _doorHz, dH);
                    } else if (door.type === 'right') {
                        _addRidingDoorHandle(_buildGroup, _doorOverlayCenterX - _doorOverlayW / 2, dY, _doorHz, dH);
                    }
                }
            });
        }
        currentX += col.width + t;
    }

    // ---- Top panels: 28mm boards sitting on top of columns ----
    // Adjacent columns with topPanel=true AND equal height are merged into one board.
    const TOP_PANEL_T = 2.8; // 28mm in cm
    const _wingCols = state.wings[state.activeWing] ? state.wings[state.activeWing].columns : (state.columns || []);
    if (_wingCols && _wingCols.some(col => col.topPanel)) {
        // Build column X positions (left edge of each column's inner space)
        const colLeftEdges = [];
        let _cx = -state.width / 2 + t + _ox;
        for (let c = 0; c < _wingCols.length; c++) {
            colLeftEdges.push(_cx);
            _cx += _wingCols[c].width + t;
        }

        // Find merged spans: consecutive columns with topPanel=true and same height
        let spanStart = -1;
        for (let c = 0; c <= _wingCols.length; c++) {
            const col = _wingCols[c];
            const inSpan = col && col.topPanel;
            if (inSpan && spanStart === -1) {
                spanStart = c;
            } else if ((!inSpan || c === _wingCols.length) && spanStart !== -1) {
                // End of span: columns [spanStart .. c-1]
                // Check if all columns in span have the same height
                const spanCols = _wingCols.slice(spanStart, c);
                const spanH = spanCols[0].height;
                const allSameH = spanCols.every(sc => Math.abs(sc.height - spanH) < 0.1);

                if (allSameH) {
                    // One merged board spanning all columns in span
                    // Outer walls extend full t; internal partitions are shared so use t/2
                    const leftOffset = spanStart === 0 ? t : t / 2;
                    const lastColIdx = c - 1;
                    const rightOffset = lastColIdx === _wingCols.length - 1 ? t : t / 2;
                    const panelLeftX = colLeftEdges[spanStart] - leftOffset;
                    const panelRightX = colLeftEdges[lastColIdx] + _wingCols[lastColIdx].width + rightOffset;
                    const panelW = panelRightX - panelLeftX;
                    const panelCenterX = (panelLeftX + panelRightX) / 2;
                    const panelY = spanH + TOP_PANEL_T / 2;
                    _ppPartId = `top_panel_${spanStart}`;
                    const tpMesh = createBoard(panelW, TOP_PANEL_T, bodyD, panelCenterX, panelY, 0, matTopPanel);
                    _ppPartId = '';
                    _applyHorizBoardUV(tpMesh, panelLeftX, panelW, bodyD, state.width);
                } else {
                    // Different heights: draw individual panels per column
                    for (let ci = spanStart; ci < c; ci++) {
                        const sc = _wingCols[ci];
                        const leftOffset = ci === 0 ? t : t / 2;
                        const rightOffset = ci === _wingCols.length - 1 ? t : t / 2;
                        const panelLeftX = colLeftEdges[ci] - leftOffset;
                        const panelRightX = colLeftEdges[ci] + sc.width + rightOffset;
                        const panelW = panelRightX - panelLeftX;
                        const panelCenterX = (panelLeftX + panelRightX) / 2;
                        const panelY = sc.height + TOP_PANEL_T / 2;
                        _ppPartId = `top_panel_${ci}`;
                        const tpMesh = createBoard(panelW, TOP_PANEL_T, bodyD, panelCenterX, panelY, 0, matTopPanel);
                        _ppPartId = '';
                        _applyHorizBoardUV(tpMesh, panelLeftX, panelW, bodyD, state.width);
                    }
                }
                spanStart = -1;
            }
        }
    }

    if (isBP) {
        // Use the actual tallest column height (not the nominal globalHeight which may be stale
        // when individual columns have been shortened via the roof drag handle).
        const _actualMaxH = state.columns && state.columns.length > 0
            ? Math.max(...state.columns.map(c => c.height))
            : state.globalHeight;
        // Total cabinet width dimension (below all columns)
        state.bpData.push({ type: 'width', val: Math.round(state.width), x: 0, y: -45, halfW: state.width / 2 });
        let rightEdgeX = state.width / 2;
        if (state.desk.side === 'right') rightEdgeX += state.desk.width;
        const sideProfileX = rightEdgeX + 60 + state.depth / 2;
        const sideGeo = new THREE.PlaneGeometry(state.depth, _actualMaxH);
        const sideMesh = new THREE.Mesh(sideGeo, matBody);
        sideMesh.position.set(sideProfileX, _actualMaxH / 2, 0);
        sideMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(sideGeo), activeEdgeMat));
        _buildGroup.add(sideMesh);
        // Overall height (left of side profile)
        state.bpData.push({ type: 'overall-height', val: Math.round(_actualMaxH), x: sideProfileX - state.depth / 2 - 25, y: _actualMaxH / 2, halfH: _actualMaxH / 2 });
        // Depth dimension (below side profile)
        state.bpData.push({ type: 'width', val: Math.round(state.depth), x: sideProfileX, y: -20, halfW: state.depth / 2 });

        // Corner unit side profile: protrudes forward (right in side view) by cuW, height = cuH
        if (state.corner && state.corner.side !== 'none') {
            const cuW = state.corner.width || 60;
            const cuH = state.corner.height || 90;
            const cuD = state.corner.depth || state.depth;
            // In side profile: corner unit extends from front face (+depth/2) forward by cuW
            // Side profile X axis: sideProfileX is center of cabinet depth
            // Front face of cabinet = sideProfileX + depth/2
            // Corner unit center X in profile = sideProfileX + depth/2 + cuW/2
            const cuProfileX = sideProfileX + state.depth / 2 + cuW / 2;
            const cuProfileGeo = new THREE.PlaneGeometry(cuW, cuH);
            const cuProfileMesh = new THREE.Mesh(cuProfileGeo, matBody);
            cuProfileMesh.position.set(cuProfileX, cuH / 2, 0);
            cuProfileMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(cuProfileGeo), activeEdgeMat));
            _buildGroup.add(cuProfileMesh);
            // Depth dimension for corner unit protrusion (below)
            state.bpData.push({ type: 'width', val: Math.round(cuW), x: cuProfileX, y: -20, halfW: cuW / 2 });

            // ---- Corner unit FRONT-VIEW overlay ----
            // In the front face of the main cabinet, the corner unit occupies:
            //   Width (X): cuD (depth of corner unit, default = main cabinet depth)
            //   Height (Y): cuH (height of corner unit)
            //   Position: at the bottom of the cabinet, flush against the left or right side wall
            const cuSign = (state.corner.side === 'right') ? 1 : -1;
            const cuFrontCenterX = cuSign * (state.width / 2 - cuD / 2);
            const cuFrontCenterY = cuH / 2;
            // Semi-transparent yellow mesh to mark the corner unit area on the front face
            const cuFrontMat = new THREE.MeshBasicMaterial({
                color: 0xfef08a, transparent: true, opacity: 0.45,
                side: THREE.DoubleSide, depthWrite: false
            });
            const cuFrontGeo = new THREE.PlaneGeometry(cuD, cuH);
            const cuFrontMesh = new THREE.Mesh(cuFrontGeo, cuFrontMat);
            cuFrontMesh.position.set(cuFrontCenterX, cuFrontCenterY, 0.3); // slightly in front of cabinet face
            _buildGroup.add(cuFrontMesh);
            // Dashed border around the corner unit area
            const cuBorderMat = new THREE.LineDashedMaterial({ color: 0xb45309, dashSize: 3, gapSize: 2, linewidth: 1 });
            const cuBorderPts = [
                new THREE.Vector3(cuFrontCenterX - cuD/2, 0,    0.31),
                new THREE.Vector3(cuFrontCenterX + cuD/2, 0,    0.31),
                new THREE.Vector3(cuFrontCenterX + cuD/2, cuH,  0.31),
                new THREE.Vector3(cuFrontCenterX - cuD/2, cuH,  0.31),
                new THREE.Vector3(cuFrontCenterX - cuD/2, 0,    0.31),
            ];
            const cuBorderGeo = new THREE.BufferGeometry().setFromPoints(cuBorderPts);
            const cuBorderLine = new THREE.Line(cuBorderGeo, cuBorderMat);
            cuBorderLine.computeLineDistances();
            _buildGroup.add(cuBorderLine);
            // Push bpData for front-view dimensions
            // Width dimension (below the corner unit area)
            state.bpData.push({ type: 'width', val: Math.round(cuD), x: cuFrontCenterX, y: -20, halfW: cuD / 2 });
            // Height dimension (to the side of the corner unit area)
            const cuHeightDimX = cuFrontCenterX + cuSign * (cuD / 2 + 15);
            state.bpData.push({ type: 'height', val: Math.round(cuH), x: cuHeightDimX, y: cuFrontCenterY, halfH: cuH / 2 });
            // Label badge in the center of the corner unit area
            const cuLabel = state.corner.type === 'desk' ? 'שולחן פינתי' : 'שידה פינתית';
            state.bpData.push({ type: 'corner-front-label', val: cuLabel, x: cuFrontCenterX, y: cuFrontCenterY });
        }
    }

    // ---- Red dashed line: hidden area indicator in wing edit mode ----
    //
    // SIDE wing edit: center cabinet depth hides part of the wing from the connection edge.
    //   → Red zone on the WING (current group), width = centerD.
    //
    // CENTER cabinet edit with a FRONT wing: the front wing covers part of the center cabinet face.
    //   Rule: right front wing → red zone on LEFT edge of center cabinet (same formula as left side wing)
    //         left front wing  → red zone on RIGHT edge of center cabinet (same formula as right side wing)
    //   → Red zone on the CENTER cabinet (current group when activeWing=center), width = frontWingW.
    //
    // FRONT wing edit: no red zone on the wing itself.

    if (!isBP && state.wingEditMode && isActiveWing) {
        const centerWingData = state.wings.center;
        const centerD = centerWingData ? centerWingData.depth : state.depth;
        const wingW = state.width; // current wing's width in local X
        const wingH = Math.max(...state.columns.map(c => c.height));
        const zFront = bodyD / 2 + 0.5;

        const dashedMat = new THREE.LineDashedMaterial({
            color: 0xff2222,
            dashSize: 4,
            gapSize: 3,
            linewidth: 2
        });

        const _drawRedZone = (group, hiddenW, totalW, totalH, isHiddenOnLeft) => {
            // hiddenW  = width of the hidden/covered strip
            // totalW   = total width of this cabinet (for visible opening calc)
            // totalH   = height of this cabinet
            // isHiddenOnLeft = true if the hidden strip is on the LEFT edge of this cabinet
            //
            // Left-hidden:  strip from -totalW/2 to -totalW/2 + hiddenW
            //               boundary line at x = -totalW/2 + hiddenW
            //               hidden center at x = -totalW/2 + hiddenW/2
            // Right-hidden: strip from +totalW/2 - hiddenW to +totalW/2
            //               boundary line at x = +totalW/2 - hiddenW
            //               hidden center at x = +totalW/2 - hiddenW/2
            const lineX        = isHiddenOnLeft ? (-totalW/2 + hiddenW) : (totalW/2 - hiddenW);
            const hiddenCenterX = isHiddenOnLeft ? (-totalW/2 + hiddenW/2) : (totalW/2 - hiddenW/2);

            const linePts = [
                new THREE.Vector3(lineX, 0, zFront),
                new THREE.Vector3(lineX, totalH, zFront)
            ];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
            const dashedLine = new THREE.Line(lineGeo, dashedMat);
            dashedLine.computeLineDistances();
            group.add(dashedLine);

            const hiddenGeo = new THREE.PlaneGeometry(hiddenW, totalH);
            const hiddenMat = new THREE.MeshBasicMaterial({
                color: 0xff0000, transparent: true, opacity: 0.09,
                side: THREE.DoubleSide, depthWrite: false
            });
            const hiddenPlane = new THREE.Mesh(hiddenGeo, hiddenMat);
            hiddenPlane.position.set(hiddenCenterX, totalH / 2, zFront - 0.1);
            group.add(hiddenPlane);

            return { lineX, hiddenCenterX };
        };

        if (state.activeWing === 'sideCabinetRight' || state.activeWing === 'sideCabinetLeft'
            || (state.activeWing && state.activeWing.startsWith('upperUnit_'))) {
            // Side cabinet / upper unit edit mode: no red zone

        } else if (state.activeWing !== 'center') {
            // Editing a side or front wing
            const activeWingData = state.wings[state.activeWing];
            const wingPos = activeWingData ? (activeWingData.wingPosition || 'side') : 'side';
            const isLeftWing = (state.activeWing === 'left');

            if (wingPos === 'side') {
                // SIDE wing: hidden strip is at the connection edge, width = centerD
                // Left wing connects at RIGHT edge → hidden strip on RIGHT → isHiddenOnLeft = false
                // Right wing connects at LEFT edge → hidden strip on LEFT  → isHiddenOnLeft = true
                const isHiddenOnLeft = !isLeftWing;
                const { lineX, hiddenCenterX } = _drawRedZone(_buildGroup, centerD, wingW, wingH, isHiddenOnLeft);

                // Dimension label: visible opening
                // When there is only 1 column: measure from red line to the side wall.
                // When there are multiple columns: the corner column is the one touching the red line.
                //   The inner partition wall between the corner column and its neighbour is the boundary.
                //   Measure from red line to that inner partition wall.
                //
                // Corner column: left wing → last column (index _numCols-1); right wing → first column (index 0)
                const t_w = state.thickness;
                const _numCols = state.columns.length;
                const cornerCol = isLeftWing ? state.columns[_numCols - 1] : state.columns[0];

                // Visible opening = cornerCol.width - centerD
                // (the corner column's width minus the hidden zone depth = centerD)
                // This applies for both single and multiple columns.
                //
                // openingCenterX: midpoint between lineX and the inner face of the side wall
                // Left wing:  sideWallInnerX = -wingW/2 + t_w
                // Right wing: sideWallInnerX = +wingW/2 - t_w
                const visibleOpening = Math.max(0, Math.round(cornerCol.width - centerD));
                const sideWallInnerX = isLeftWing ? (-wingW / 2 + t_w) : (wingW / 2 - t_w);
                const openingCenterX = (lineX + sideWallInnerX) / 2;

                if (visibleOpening > 0) {
                    state.dimData.push({ isWingOpenWidth: true, x: openingCenterX, y: wingH / 2 - 20, h: visibleOpening });
                }
            }
            // FRONT wing: no red zone on the wing itself

        } else {
            // Editing the CENTER cabinet — check for front wings
            // Right front wing covers the LEFT edge of center cabinet (same as left side wing logic)
            // Left front wing covers the RIGHT edge of center cabinet (same as right side wing logic)
            const rightWing = state.wings.right;
            const leftWing  = state.wings.left;
            const rightIsFront = rightWing && (rightWing.wingPosition || 'side') === 'front';
            const leftIsFront  = leftWing  && (leftWing.wingPosition  || 'side') === 'front';

            if (rightIsFront || leftIsFront) {
                const _numCols = state.columns.length;
                if (rightIsFront) {
                    // Right front wing covers the RIGHT edge of center cabinet
                    // Hidden strip width = front wing's depth
                    const frontWingD = rightWing.depth || state.depth;
                    const { lineX: rLineX } = _drawRedZone(_buildGroup, frontWingD, wingW, wingH, false /* right edge */);
                    // Visible opening = corner column width (rightmost col) minus the hidden depth
                    // Rightmost column = last column (index _numCols-1)
                    const cornerColR = state.columns[_numCols - 1];
                    const visibleOpening = Math.max(0, Math.round(cornerColR.width - frontWingD));
                    if (visibleOpening > 0) {
                        // Label centered on the corner column's visible portion
                        // Corner col right edge ≈ wingW/2, left edge ≈ wingW/2 - cornerColR.width
                        const colLeftEdge = wingW / 2 - cornerColR.width;
                        const openingCenterX = (colLeftEdge + rLineX) / 2;
                        state.dimData.push({ isWingOpenWidth: true, x: openingCenterX, y: wingH / 2 - 20, h: visibleOpening });
                    }
                }
                if (leftIsFront) {
                    // Left front wing covers the LEFT edge of center cabinet
                    const frontWingD = leftWing.depth || state.depth;
                    const { lineX: lLineX } = _drawRedZone(_buildGroup, frontWingD, wingW, wingH, true /* left edge */);
                    // Corner column for left front wing = first column (index 0, leftmost)
                    const cornerColL = state.columns[0];
                    const visibleOpening = Math.max(0, Math.round(cornerColL.width - frontWingD));
                    if (visibleOpening > 0) {
                        // Label centered on the corner column's visible portion
                        // Corner col left edge ≈ -wingW/2, right edge ≈ -wingW/2 + cornerColL.width
                        const colRightEdge = -wingW / 2 + cornerColL.width;
                        const openingCenterX = (lLineX + colRightEdge) / 2;
                        state.dimData.push({ isWingOpenWidth: true, x: openingCenterX, y: wingH / 2 - 20, h: visibleOpening });
                    }
                }
            }
        }
    }

    // Build corner unit if configured (including blueprint outline)
    if (state.corner && state.corner.side !== 'none') {
        buildCornerUnit();
    }
}

// Capture a JPEG thumbnail of the current cabinet for project cards
window.captureProjectThumbnail = function() {
    try {
        if (!renderer || !camera || !controls || !scene) return null;

        var savedPos = camera.position.clone();
        var savedTarget = controls.target.clone();
        var savedFov = camera.fov;
        var savedCamAnim = window._camAnim;
        var savedViewMode = state.viewMode;
        var savedHasDoors = state.hasDoors;
        var savedDimDisplay = dimLayer ? dimLayer.style.display : '';
        var savedBtnDisplay = buttonsLayer ? buttonsLayer.style.display : '';

        state.viewMode = 'front';
        state.hasDoors = true;
        buildCabinet();
        updateCameraView();
        if (window._camAnim) {
            camera.position.copy(window._camAnim.toPos);
            controls.target.copy(window._camAnim.toTarget);
            window._camAnim = null;
        }
        controls.update();
        if (dimLayer) dimLayer.style.display = 'none';
        if (buttonsLayer) buttonsLayer.style.display = 'none';
        renderer.render(scene, camera);

        var tw = 480, th = 360;
        var cvs = document.createElement('canvas');
        cvs.width = tw;
        cvs.height = th;
        var ctx = cvs.getContext('2d');
        ctx.fillStyle = '#eceff1';
        ctx.fillRect(0, 0, tw, th);
        ctx.drawImage(renderer.domElement, 0, 0, tw, th);
        var dataUrl = cvs.toDataURL('image/jpeg', 0.72);

        camera.fov = savedFov;
        camera.updateProjectionMatrix();
        camera.position.copy(savedPos);
        controls.target.copy(savedTarget);
        controls.update();
        window._camAnim = savedCamAnim;
        state.viewMode = savedViewMode;
        state.hasDoors = savedHasDoors;
        if (dimLayer) dimLayer.style.display = savedDimDisplay;
        if (buttonsLayer) buttonsLayer.style.display = savedBtnDisplay;
        buildCabinet();
        updateCameraView();
        if (window._camAnim) {
            camera.position.copy(window._camAnim.toPos);
            controls.target.copy(window._camAnim.toTarget);
            window._camAnim = null;
        }
        controls.update();
        renderer.render(scene, camera);

        return dataUrl;
    } catch (e) {
        console.warn('[captureProjectThumbnail]', e);
        return null;
    }
};