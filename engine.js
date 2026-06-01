ד // ==========================================
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
container.appendChild(renderer.domElement);
window.renderer = renderer;
window.camera = camera;

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2;

// Track whether user has manually orbited (so we don't reset camera on every rebuild)
window._orbitFree = false;
controls.addEventListener('change', () => {
    if (state.viewMode === '3d') {
        window._orbitFree = true;
        const btn = document.getElementById('btn-reset-view');
        if (btn) btn.style.display = 'inline-flex';
    }
});

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.10);
dirLight.position.set(120, 510, 600); dirLight.castShadow = true;
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
    window._roomVisible = !window._roomVisible;
    // _buildRoom respects the _roomVisible flag: clears children and returns when false
    if (typeof _buildRoom === 'function') _buildRoom();
    const btn = document.getElementById('btn-toggle-room');
    if (btn) {
        btn.innerHTML = window._roomVisible
            ? '<i class="fa-solid fa-house"></i> הסתר חדר'
            : '<i class="fa-solid fa-house"></i> הצג חדר';
        btn.classList.toggle('toggled-off', !window._roomVisible);
    }
    // Show/hide room wall selector based on room visibility
    if (typeof window._updateRoomWallUI === 'function') window._updateRoomWallUI();
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
    rg.add(floorMesh);

    // ── Niche floor (extends floor into the alcove) ────────────────────────
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
        const nicheBackWall = new THREE.Mesh(new THREE.PlaneGeometry(_nW, roomH), makeBrickMat(_nW, roomH));
        nicheBackWall.position.set(_nicheCX, roomH / 2, nicheBackZ);
        rg.add(nicheBackWall);

        // Left niche wall (faces right, perpendicular to X)
        const nicheLeftWall = new THREE.Mesh(new THREE.PlaneGeometry(_nD, roomH), makeBrickMat(_nD, roomH));
        nicheLeftWall.rotation.y = Math.PI / 2;
        nicheLeftWall.position.set(_nicheCX - _nW / 2, roomH / 2, nicheMidZ);
        rg.add(nicheLeftWall);

        // Right niche wall (faces left, perpendicular to X)
        const nicheRightWall = new THREE.Mesh(new THREE.PlaneGeometry(_nD, roomH), makeBrickMat(_nD, roomH));
        nicheRightWall.rotation.y = -Math.PI / 2;
        nicheRightWall.position.set(_nicheCX + _nW / 2, roomH / 2, nicheMidZ);
        rg.add(nicheRightWall);
    }
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

const textureLoader = new THREE.TextureLoader();
const textureNames = ['2020', 'H1367', 'H1307', 'H1227', '2025', '2040', '2041', '2044', '2047', '2049', '2062', '5600', '7180', '456', '462', '463', '464', '480'];

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

let hitBoxes = [];
let wingHitBoxes = [];
let deskHitBoxes = [];
let doorMeshes = [];
let currentHoveredDoor = null;
let dragHandlesData = { horizontal: [], vertical: [], roofs: [], desk: [] };
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();

function updateCameraView() {
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
            dirLight.intensity = 0.10;
            ambientLight.intensity = 0.95;
            window._orbitFree = false;
            controls.enableRotate = true;
            container.classList.add('front-mode');
            scene.background = new THREE.Color(0xeceff1);
            dimLayer.style.display = 'block';
            buttonsLayer.style.display = 'block';
            floor.visible = true;
            const bpLayer = document.getElementById('blueprint-layer');
            if (bpLayer) { bpLayer.style.display = 'none'; bpLayer.innerHTML = ''; }
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
    const centerH = centerWing ? Math.max(...centerWing.columns.map(c => c.height)) : state.globalHeight;

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
        const scSideVal = sc.side;
        const scProtrusionR = (sc.widthRight || sc.width || 40);
        const scProtrusionL = (sc.widthLeft  || sc.width || 40);
        if (scSideVal === 'right' || scSideVal === 'both') {
            totalWidth += scProtrusionR;
            targetX += scProtrusionR / 2;
        }
        if (scSideVal === 'left' || scSideVal === 'both') {
            totalWidth += scProtrusionL;
            targetX -= scProtrusionL / 2;
        }
        // For 'both': re-center targetX to midpoint between the two protrusions
        if (scSideVal === 'both') {
            targetX = (scProtrusionR - scProtrusionL) / 2;
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
        if (!window._orbitFree) {
            // Use hardcoded camera positions per preset type
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
                // Fallback: calibrated position for full_corner / generic walkin setups
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
        }
        controls.enableRotate = true; container.classList.remove('front-mode');
        scene.background = new THREE.Color(0xeceff1);
        dirLight.position.set(120, 510, 600);
        dirLight.intensity = 0.10;
        ambientLight.intensity = 0.95;
        dimLayer.style.display = 'none'; buttonsLayer.style.display = 'none';
        floor.visible = true;
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
            ambientLight.intensity = 0.95;
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
        // Animate camera to new position
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
        dimLayer.style.display = 'none'; buttonsLayer.style.display = 'none';
        floor.visible = true;
        controls.update();
    }
    if(typeof buildDragHandlesUI === 'function') buildDragHandlesUI();
    if(typeof updateQuickEditPanelUI === 'function') updateQuickEditPanelUI();
}

function buildCabinet() {
    while(cabinetGroup.children.length > 0) cabinetGroup.remove(cabinetGroup.children[0]);
    hitBoxes = [];
    wingHitBoxes = [];
    deskHitBoxes = [];
    doorMeshes = [];
    currentHoveredDoor = null;
    state.dimData = []; state.bpData = [];
    dragHandlesData = { horizontal: [], vertical: [], roofs: [], desk: [], partitions: [], floors: [], selectAll: [] };
    // Reset part-paint mesh list
    window.partMeshes = [];
    // Remove wing hover highlight (it lives on scene, not cabinetGroup)
    if (typeof window._removeWingHighlight === 'function') window._removeWingHighlight();

    // Render all active wings
    // We temporarily swap activeWing to read each wing's data via the proxy
    const savedActiveWing = state.activeWing;
    const centerWing = state.wings.center;
    const inEditMode = state.wingEditMode;

    // Always render center wing from center data
    state.activeWing = 'center';
    _buildGroup = cabinetGroup;
    _isActiveWingBuild = (savedActiveWing === 'center');
    // In edit mode, only render the active wing (center cabinet is NOT rendered when editing a side/front wing)
    if (!inEditMode || savedActiveWing === 'center') {
        // For sliding wardrobes: render at full depth. Door system added by buildSlidingDoorCabinet().
        const _isSliding = state.presetId === 'sliding' && centerWing && centerWing.slidingDoor && centerWing.slidingDoor.enabled;
        _ppWingId = 'center';
        _buildWingGeometry(cabinetGroup, 0, 0, 0, _isActiveWingBuild);
    }
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
        _isActiveWingBuild = (savedActiveWing === 'left');
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
        _isActiveWingBuild = (savedActiveWing === 'right');
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

    const _renderOneSideCabinet = (scData, scSide, wingIdStr, isActive) => {
        const mainW = centerWing ? centerWing.width : 160;
        const centerD = centerWing ? centerWing.depth : 54;
        const scLocalW = centerD;
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
        const scX = (scSide === 'right') ? (mainW / 2 + scProtrusion / 2) : (-mainW / 2 - scProtrusion / 2);
        scGroup.position.set(scX, 0, 0);
        scGroup.userData.wingId = wingIdStr;
        cabinetGroup.add(scGroup);

        const prevActiveWing = state.activeWing;
        state.activeWing = wingIdStr;
        _buildGroup = scGroup;
        _isActiveWingBuild = isActive;
        _ppWingId = wingIdStr;
        _buildWingGeometry(scGroup, 0, 0, 0, isActive);
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
            const whbGeo = new THREE.BoxGeometry(scProtrusion + 2, scH + 2, centerD + 2);
            const whbMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
            const whb = new THREE.Mesh(whbGeo, whbMat);
            whb.renderOrder = 999;
            whb.position.set(scX, scH / 2, 0);
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
            const scProtrusion2 = (_editSide2 === 'right')
                ? (scData.widthRight || scData.width || 40)
                : (scData.widthLeft  || scData.width || 40);
            const origWidth2 = scData.width;
            const origDepth2 = scData.depth;
            const origColWidth2 = scData.columns[0] ? scData.columns[0].width : null;
            scData.width = centerD2;
            scData.depth = scProtrusion2;
            if (scData.columns[0]) {
                scData.columns[0].width = centerD2 - (scData.thickness || 1.7) * 2;
            }

            const scEditGroup = new THREE.Group();
            scEditGroup.position.set(0, 0, 0);
            cabinetGroup.add(scEditGroup);
            state.activeWing = savedActiveWing;
            _buildGroup = scEditGroup;
            _isActiveWingBuild = true;
            _buildWingGeometry(scEditGroup, 0, 0, 0, true);
            _buildGroup = cabinetGroup;

            scData.width = origWidth2;
            scData.depth = origDepth2;
            if (scData.columns[0] && origColWidth2 !== null) scData.columns[0].width = origColWidth2;
        }
    }

    // Restore active wing
    state.activeWing = savedActiveWing;
    _isActiveWingBuild = true;
    // Expose the active wing's THREE.Group for overlay coordinate transforms
    // Always expose the active wing's THREE.Group for overlay coordinate transforms.
    // Even in edit mode the wing has rotation.y = ±PI/2, so matrixWorld is needed.
    window._activeWingGroup = null;
    if (savedActiveWing !== 'center') {
        cabinetGroup.children.forEach(child => {
            if (child.isGroup && child.userData && child.userData.wingId === savedActiveWing) {
                window._activeWingGroup = child;
            }
        });
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
    //   Side panel  : thin board (_closureW wide, _panelH tall, _cabD deep)
    //   Ceiling panel: thin board (_ceilTotalW wide, _ceilThick tall, _cabD deep)
    //   Depth panel : thin board (_closureW wide, _depthH tall, _depthThick deep)
    //
    // Each panel has its own width/thickness slider.
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
            const _ceilThick   = _closureOn ? Math.max(1.8, parseFloat(window._closureCeilWidth)  || 1.8) : 0;
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
            cabinetGroup.position.x = 0;

            // Body material for all closure panels
            const _bodyMatKey = (state.wings && state.wings.center)
                ? (state.wings.center.materialBody || state.wings.center.boardMaterial)
                : (state.materialBody || state.boardMaterial);
            const _closureMat = (materials && materials[_bodyMatKey])
                ? materials[_bodyMatKey]
                : new THREE.MeshStandardMaterial({ color: 0xd4c5b0, roughness: 0.7, metalness: 0.0 });

            if (_closureOn) {
                // Cabinet height (plinth is already included in _cabH)
                const _panelH = _cabH;
                const _panelY = _panelH / 2;

                // Panel depth: extend by _frontOffset when 'door' front-line is selected
                const _panelD  = _cabD + _frontOffset;
                // Panel Z center: shift forward by half the extra depth so back face stays flush
                const _panelDZ = _frontOffset / 2;

                const _needLeftPanel  = (_rw === 'left'  || _rw === 'both');
                const _needRightPanel = (_rw === 'right' || _rw === 'both');
                const _leftPanelW  = _closureW;
                const _rightPanelW = _closureWR;

                // ── 1a. Left side closure panel ───────────────────────────────
                if (_needLeftPanel && _leftPanelW > 0) {
                    const _sidePanelX = -_cwFull / 2 - _leftPanelW / 2;
                    const _sideMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(_leftPanelW, _panelH, _panelD),
                        _closureMat
                    );
                    _sideMesh.position.set(_sidePanelX, _panelY, _panelDZ);
                    _sideMesh.castShadow = true;
                    _sideMesh.userData = { isClosurePanel: true, side: 'left' };
                    cabinetGroup.add(_sideMesh);
                    state.bpData.push({
                        type: 'closure_panel', subtype: 'side', side: 'left',
                        w: _leftPanelW, h: _panelH, d: _panelD,
                        x: _sidePanelX, y: _panelY
                    });
                }

                // ── 1b. Right side closure panel ──────────────────────────────
                if (_needRightPanel && _rightPanelW > 0) {
                    const _sidePanelXR = _cwFull / 2 + _rightPanelW / 2;
                    const _sideMeshR = new THREE.Mesh(
                        new THREE.BoxGeometry(_rightPanelW, _panelH, _panelD),
                        _closureMat
                    );
                    _sideMeshR.position.set(_sidePanelXR, _panelY, _panelDZ);
                    _sideMeshR.castShadow = true;
                    _sideMeshR.userData = { isClosurePanel: true, side: 'right' };
                    cabinetGroup.add(_sideMeshR);
                    state.bpData.push({
                        type: 'closure_panel', subtype: 'side', side: 'right',
                        w: _rightPanelW, h: _panelH, d: _panelD,
                        x: _sidePanelXR, y: _panelY
                    });
                }

                // ── 2. Ceiling closure panel ───────────────────────────────────
                if (_ceilThick > 0) {
                    let _ceilTotalW, _ceilX;
                    if (_rw === 'both') {
                        // Ceiling spans full width: left gap + cabinet + right gap
                        // Center X = midpoint between left outer edge (-_cwFull/2 - _closureW)
                        // and right outer edge (+_cwFull/2 + _closureWR)
                        // = (_closureWR - _closureW) / 2
                        _ceilTotalW = _leftPanelW + _cwFull + _rightPanelW;
                        _ceilX = (_closureWR - _closureW) / 2;
                    } else if (_rw === 'left') {
                        // Ceiling spans: left gap + full cabinet width
                        _ceilTotalW = _closureW + _cwFull;
                        _ceilX = -_closureW / 2;
                    } else {
                        // Ceiling spans: full cabinet width + right gap
                        _ceilTotalW = _cwFull + _closureWR;
                        _ceilX = _closureWR / 2;
                    }
                    const _ceilY = _panelH + _ceilThick / 2;
                    const _ceilMesh = new THREE.Mesh(
                        new THREE.BoxGeometry(_ceilTotalW, _ceilThick, _panelD),
                        _closureMat
                    );
                    _ceilMesh.position.set(_ceilX, _ceilY, _panelDZ);
                    _ceilMesh.castShadow = true;
                    _ceilMesh.userData = { isClosurePanel: true, side: 'ceiling' };
                    cabinetGroup.add(_ceilMesh);
                    window._closureCeilMeshes.push(_ceilMesh);
                    state.bpData.push({
                        type: 'closure_panel', subtype: 'ceiling', side: 'ceiling',
                        w: _ceilTotalW, h: _ceilThick, d: _panelD,
                        x: _ceilX, y: _ceilY
                    });
                }
            }

        } else {
            cabinetGroup.position.x = 0;
        }

        // ── Niche closure panels (inside the niche alcove) ────────────────
        // Rendered whenever niche + niche-closure are enabled, regardless of room wall position.
        // Panels are fixed-thickness boards placed at the cabinet edges, running the full niche depth.
        //   Left panel:    at x = -cw/2 - thickness/2, spans niche depth in Z
        //   Right panel:   at x = +cw/2 + thickness/2, spans niche depth in Z
        //   Ceiling panel: at y = cabH + thickness/2,  spans niche width in X, niche depth in Z
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
            _ncLeft.castShadow = true;
            _ncLeft.userData = { isClosurePanel: true, side: 'niche-left' };
            cabinetGroup.add(_ncLeft);

            // Right side panel: placed just to the right of the cabinet right edge
            const _ncRight = new THREE.Mesh(
                new THREE.BoxGeometry(_ncThickR, _nc_cabH, _nichePanelTotalD),
                _nc_mat
            );
            _ncRight.position.set(_nc_cwFull / 2 + _ncThickR / 2, _nc_cabH / 2, _nichePanelZ);
            _ncRight.castShadow = true;
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
                _ncCeil.castShadow = true;
                _ncCeil.userData = { isClosurePanel: true, side: 'niche-ceiling' };
                cabinetGroup.add(_ncCeil);
            }
        }
    }

    // Sliding wardrobe overlay (aluminum frame + doors)
    if (state.presetId === 'sliding') {
        buildSlidingDoorCabinet();
    }

    addBlueprintSprites();
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

}

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

function _buildWingGeometry(targetGroup, _offsetX, _offsetY, _offsetZ, isActiveWing) {
    const isBP = state.viewMode === 'blueprint';
    const bpMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    
    const matBody = isBP ? bpMat : materials[state.materialBody];
    const matInternal = isBP ? bpMat : materials[state.materialInternal];
    const matExternal = isBP ? bpMat : materials[state.materialExternal];
    const matDesk = isBP ? bpMat : materials[state.materialDesk];
    const matOpenCell = isBP ? bpMat : materials[state.materialOpenCell];
    const matBack = isBP ? bpMat : (materials[state.materialBack] || materials[state.materialBody]);
    const matTopPanel = isBP ? bpMat : (materials[state.materialTopPanel] || materials[state.materialBody]);
    const activeEdgeMat = isBP ? new THREE.LineBasicMaterial({ color: 0x000000 }) : edgeMat;

    const t = state.thickness;
    const bodyD = state.depth;
    // For sliding wardrobes: internal column partitions are set back 6cm from the front face
    const _isSlidingWardrobe = state.presetId === 'sliding' && state.slidingDoor && state.slidingDoor.enabled;
    const _slidingPartSetback = 6; // cm — front 6cm reserved for door track
    const _slidingPartD = _isSlidingWardrobe ? (bodyD - _slidingPartSetback) : bodyD;
    const _slidingPartZ = _isSlidingWardrobe ? (-_slidingPartSetback / 2) : 0; // shift back so front face is 6cm behind cabinet front
    const backT = 0.5;
    const isInset = (state.cabinetModel === 'ab2' || state.cabinetModel === 'ab2_nohoney');
    // ab2 = touch (no handles); ab2_nohoney = inset doors but WITH regular handles
    const isTouch = (state.cabinetModel === 'ab2');
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
            const LEG_TOP_R   = 2.2;
            const LEG_BOT_R   = 0.9;
            const LEG_SEGS    = 20;
            const SPLAY_ANGLE = 0.18; // ~10°
            const cornerPositionsX = [-halfW + insetX, halfW - insetX];

            cornerPositionsX.forEach((lx, xi) => {
                legZPositions.forEach((lz, zi) => {
                    const legGeo = new THREE.CylinderGeometry(LEG_TOP_R, LEG_BOT_R, legH, LEG_SEGS);
                    const legMesh = new THREE.Mesh(legGeo, legMat);
                    const signX = xi === 0 ? -1 : 1;
                    const signZ = zi === 0 ? 1 : -1;
                    legMesh.rotation.x = signZ * SPLAY_ANGLE;
                    legMesh.rotation.z = signX * SPLAY_ANGLE;
                    legMesh.position.set(lx, legH / 2, lz);
                    legMesh.castShadow = true;
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
                    legMesh.castShadow = true;
                    _buildGroup.add(legMesh);
                });
            });
        }

        // פלטה: לוח ברוחב מלא על גבי הרגליים
        const plateGeo = new THREE.BoxGeometry(cabinetW, t, bodyD);
        const plateMesh = new THREE.Mesh(plateGeo, matBody);
        plateMesh.position.set(0, legH + t / 2, 0);
        plateMesh.castShadow = true;
        plateMesh.receiveShadow = true;
        plateMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(plateGeo), activeEdgeMat));
        _buildGroup.add(plateMesh);
    }

    function createBoard(w, h, d, x, y, z, specificMat = matBody) {
        // Part-paint mode: apply per-part color override if one exists
        if (!isBP && _ppPartId) {
            const partColors = state.partColors || {};
            const overrideKey = partColors[_ppWingId + '_' + _ppPartId];
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
        mesh.castShadow = !isBP;
        mesh.receiveShadow = !isBP;
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), activeEdgeMat));
        _buildGroup.add(mesh);
        // Tag mesh for part-paint mode
        if (!isBP && _ppPartId) {
            const fullPartId = _ppWingId + '_' + _ppPartId;
            mesh.userData.partId = fullPartId;
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

    // Helper: apply shelf UV — 90° CW rotation, natural size (1 tile per shelf width),
    // per-shelf offset and alternating horizontal flip for variety.
    // shelfIdx: div.idx (shelf index within column), boardW: shelf width, boardD: shelf depth
    // NOTE: createBoard already scales UV by (w/100, d/100) for top/bottom faces, so we use raw 0/1 values directly.
    function _applyShelfUV(mesh, boardW, boardD, shelfIdx) {
        if (!mesh || !mesh.geometry || !mesh.material || !mesh.material.map) return;
        const uv = mesh.geometry.attributes.uv;
        // Depth aspect ratio relative to shelf width (natural size = 1 tile per boardW)
        const vScale = boardD / boardW;
        const vOffset = (1 - vScale) / 2;
        // Horizontal offset: shift each shelf by a pseudo-random amount
        const uShift = ((shelfIdx * 0.37) % 1 + 1) % 1;
        // Flip: alternate every other shelf
        const flip = (shelfIdx % 2 === 1);
        // BoxGeometry top/bottom raw UV corners (before any scaling):
        // i=8:(0,1), i=9:(1,1), i=10:(0,0), i=11:(1,0) — top face
        // i=12:(0,1), i=13:(1,1), i=14:(0,0), i=15:(1,0) — bottom face
        const rawU = [0,1,0,1, 0,1,0,1];
        const rawV = [1,1,0,0, 1,1,0,0];
        for (let i = 8; i < 16; i++) {
            const origU = rawU[i - 8]; // 0 or 1 (left/right in width)
            const origV = rawV[i - 8]; // 0 or 1 (front/back in depth)
            // 90° CW: newU = depth axis, newV = width axis (reversed)
            const newU = vOffset + origV * vScale;
            // Width axis with offset and optional flip
            let widthT = flip ? origU : (1 - origU);
            const newV = (widthT + uShift) % 1;
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

    if (state.desk.side !== 'none') {
        const dSide = state.desk.side;
        const dWidth = state.desk.width;
        const dHeight = state.desk.height;
        const drawerH = state.desk.drawerHeight;
        let startX = (dSide === 'left') ? (-state.width/2) : (state.width/2);
        let dir = (dSide === 'left') ? -1 : 1;
        const surfaceCenterX = startX + dir * (dWidth / 2);
        createBoard(dWidth, t, bodyD, surfaceCenterX, dHeight - t/2, 0, matDesk); 
        const legX = startX + dir * (dWidth - t/2);
        createBoard(t, dHeight - t, bodyD, legX, (dHeight - t)/2, 0, matDesk); 
        if (state.desk.hasDrawers) {
            const numDrawers = dWidth <= 80 ? 1 : 2;
            const gap = 0.4; const innerWidth = dWidth - t;
            const drawerWidth = (innerWidth - gap*(numDrawers+1)) / numDrawers;
            const drawerBottomY = dHeight - t - drawerH;
            const drawerCenterY = drawerBottomY + drawerH/2;
            const fZ = isInset ? (bodyD/2 - t/2) : (bodyD/2 + t/2 + 0.1);
            if (!isBP) createBoard(innerWidth, t, bodyD - 2, startX + dir * (innerWidth/2), drawerBottomY + t/2, 0, matDesk);
            for(let i=0; i<numDrawers; i++) {
                let dx = (dSide === 'left') ? (startX - innerWidth) + gap + drawerWidth/2 + i * (drawerWidth + gap) : startX + gap + drawerWidth/2 + i * (drawerWidth + gap);
                let mesh = createBoard(drawerWidth, drawerH, t, dx, drawerCenterY, fZ, matExternal);
                if (!isBP && !isTouch) {
                    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15, 16).rotateZ(Math.PI/2), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 }));
                    handle.position.set(0, 0, t/2 + 1.5); mesh.add(handle);
                }
                if (!isBP) {
                    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 2, 2.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                    backPanel.position.set(dx, drawerBottomY + drawerH - 1.25, bodyD/2 - t/2 - 1.5 - t/2 - 0.25);
                    _buildGroup.add(backPanel);
                }
            }
        }
        if (_isActiveWingBuild) {
            state.dimData.push({ isDeskHeight: true, x: legX + (dSide==='left'? -20 : 20), y: dHeight/2, h: dHeight });
            state.dimData.push({ isDeskWidth: true, x: surfaceCenterX, y: dHeight + 20, h: dWidth });
            if (isBP) {
                // Add desk dimensions to blueprint overlay
                state.bpData.push({ type: 'width', val: Math.round(dWidth), x: surfaceCenterX, y: -20, halfW: dWidth / 2 });
                state.bpData.push({ type: 'height', val: Math.round(dHeight), x: legX + (dSide === 'left' ? -15 : 15), y: dHeight / 2, halfH: dHeight / 2 });
            }
            if(!isBP) dragHandlesData.desk.push({ type: 'deskHeight', x: legX, y: dHeight });
            if(!isBP) dragHandlesData.desk.push({ type: 'deskWidth', side: dSide, x: legX, y: dHeight/2 });
            if(!isBP && state.desk.hasDrawers) dragHandlesData.desk.push({ type: 'deskDrawer', x: surfaceCenterX, y: dHeight - t - drawerH });
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
        if (col.type === 'desk') startShelvesY = col.deskHeight + col.deskClearance + t;
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

    let currentX = -state.width/2 + t;
    let compCounter = 1;
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
                    const wm = createBoard(t, segH, bodyD, -state.width/2 + t/2, currentY + segH/2, 0);
                    _applyVertWallUV(wm, currentY - wallBottomY, segH, wallTotalH, bodyD, t);
                }
                currentY = Math.max(currentY, hole.top);
            }
            if (wallTopY - currentY > 0.01) {
                const segH = wallTopY - currentY;
                const wm = createBoard(t, segH, bodyD, -state.width/2 + t/2, currentY + segH/2, 0);
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
                // currentX כבר מצביע על תחילת העמודה הנוכחית (c === sinkGroupStart)
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
                ctrMesh.castShadow = true;
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
                wL.castShadow = true; _buildGroup.add(wL);

                // דופן ימין
                const wR = new THREE.Mesh(new THREE.BoxGeometry(SINK_T, SINK_BASIN_H, basinD), sinkWhiteMat);
                wR.position.set(groupCenterX + BASIN_W/2 + SINK_T/2, basinCenterY, basinCenterZ);
                wR.castShadow = true; _buildGroup.add(wR);

                // דופן קדמית
                const wF = new THREE.Mesh(new THREE.BoxGeometry(BASIN_W + SINK_T * 2, SINK_BASIN_H, SINK_T), sinkWhiteMat);
                wF.position.set(groupCenterX, basinCenterY, basinFrontZ + SINK_T/2);
                wF.castShadow = true; _buildGroup.add(wF);

                // דופן אחורית
                const wB = new THREE.Mesh(new THREE.BoxGeometry(BASIN_W + SINK_T * 2, SINK_BASIN_H, SINK_T), sinkWhiteMat);
                wB.position.set(groupCenterX, basinCenterY, basinBackZ - SINK_T/2);
                wB.castShadow = true; _buildGroup.add(wB);

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
                    botMesh.castShadow = true; botMesh.receiveShadow = true;
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

            const SLAB_T = _ct === 'butcher26' ? 2.6 : _ct === 'butcher40' ? 4.0 : 1.2;
            const OVERHANG_FRONT = 2;
            const OVERHANG_SIDE  = 1.5;
            const slabW = col.width + OVERHANG_SIDE * 2;
            const slabD = bodyD + OVERHANG_FRONT;
            const slabY = col.height + SLAB_T / 2;

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

            if (_isActiveWingBuild) dragHandlesData.roofs.push({ colIndex: c, x: colCenterX, y: col.height });

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
                        centerX: vesselCenterX,
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

        // When noPlinth=true and no floorOffset, the column extends to the floor (y=0).
        // startShelvesY is the Y above the bottom board — for noPlinth columns this is just t (board thickness),
        // not plinthHeight+t, so the bottom cell height includes the plinth zone.
        // For bathroom regalim: the full-width plate (top face at plinthHeight) is the only bottom board —
        //   no extra plinthTopMesh is drawn, so startShelvesY = plinthHeight (not plinthHeight + t).
        const _isBathroomRegalim = (state.presetId === 'bathroom' && isRegalim);
        let startShelvesY = fo > 0 ? fo + t : (col.noPlinth ? t : (_isBathroomRegalim ? state.plinthHeight : state.plinthHeight + t));

        if (isDesk) {
            createBoard(col.width, t, bodyD, colCenterX, col.deskHeight - t/2, 0, matDesk); 
            if(!isBP && _isActiveWingBuild) {
                state.dimData.push({ isInternalDeskSurface: true, colIndex: c, x: colCenterX, y: col.deskHeight/2, h: col.deskHeight });
                dragHandlesData.vertical.push({ isInternalDeskSurface: true, colIndex: c, x: colCenterX, y: col.deskHeight });
            }
            if (col.hasDrawers && !isBP) {
                const numDrawers = col.width <= 80 ? 1 : 2;
                const gap = 0.4;
                const drawerWidth = (col.width - gap*(numDrawers+1)) / numDrawers;
                const drawerBottomY = col.deskHeight - t - col.drawerHeight;
                const drawerCenterY = drawerBottomY + col.drawerHeight/2;
                const fZ = isInset ? (bodyD/2 - t/2) : (bodyD/2 + t/2 + 0.1); 
                createBoard(col.width, t, bodyD - 2, colCenterX, drawerBottomY + t/2, 0, matDesk);
                for(let i=0; i<numDrawers; i++) {
                    let innerStartX = colCenterX - col.width/2;
                    let dx = innerStartX + gap + drawerWidth/2 + i * (drawerWidth + gap);
                    let mesh = createBoard(drawerWidth, col.drawerHeight, t, dx, drawerCenterY, fZ, matExternal);
                    if (!isTouch) {
                        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15, 16).rotateZ(Math.PI/2), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 }));
                        handle.position.set(0, 0, t/2 + 1.5); mesh.add(handle);
                    }
                    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(drawerWidth - 2, 2.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                    backPanel.position.set(dx, drawerBottomY + col.drawerHeight - 1.25, bodyD/2 - t/2 - 1.5 - t/2 - 0.25);
                    _buildGroup.add(backPanel);
                }
                if (_isActiveWingBuild) {
                    state.dimData.push({ isInternalDeskDrawer: true, colIndex: c, x: colCenterX, y: drawerCenterY, h: col.drawerHeight });
                    dragHandlesData.vertical.push({ isInternalDeskDrawer: true, colIndex: c, x: colCenterX, y: drawerBottomY });
                }
            }
            startShelvesY = col.deskHeight + col.deskClearance;
            createBoard(col.width, t, bodyD, colCenterX, startShelvesY + t/2, 0, matDesk); 
            if(!isBP) dragHandlesData.vertical.push({ isInternalDeskClearance: true, colIndex: c, x: colCenterX, y: startShelvesY });
            startShelvesY += t; 
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
            // For sliding wardrobes and noPlinth columns: back panel extends to floor (y=0)
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
                    // Clamp door row indices to valid range (guard against stale saved state)
                    const _safeStartRow = Math.max(0, Math.min(door.startRow, dividersAsc.length));
                    const _safeEndRow   = Math.max(0, Math.min(door.endRow,   dividersAsc.length));
                    let doorBottomY = (_safeStartRow === 0) ? (baseForInset + t) : (dividersAsc[_safeStartRow - 1].y + dividersAsc[_safeStartRow - 1].thick/2);
                    let doorTopY = (_safeEndRow === dividersAsc.length) ? (col.height - t) : (dividersAsc[_safeEndRow].y - dividersAsc[_safeEndRow].thick/2);
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
                state.bpData.push({ type: 'height', val: Math.round(compH), x: colCenterX, y: compCenterY, halfH: compH / 2 });
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
            _ppPartId = div.type === 'shelf' ? `shelf_c${c}_r${div.idx}` : `split_c${c}`;
            const shelfMesh = createBoard(boardW, div.thick, boardD, boardX, div.y, boardZ, boardMat);
            _ppPartId = '';
            _applyShelfUV(shelfMesh, boardW, boardD, div.idx + c * 100);
            prevYTopDown = div.y - div.thick/2;
        });

        const lastCompH = prevYTopDown - startShelvesY;
        if(isBP && !isDesk) {
            state.bpData.push({ type: 'num', val: compCounter++, x: currentX + 15, y: prevYTopDown - 10 });
            state.bpData.push({ type: 'height', val: Math.round(lastCompH), x: colCenterX, y: startShelvesY + lastCompH/2, halfH: lastCompH / 2 });
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

            if(!isBP && compH > 0) {
                if (_isActiveWingBuild) {
                    // Skip regular dim entry for partitioned cells — isSubCellBtn entries replace it
                    const _hasPartition = compData && compData.partition && Array.isArray(compData.partitions) && compData.partitions.length > 0;
                    if (!_hasPartition) {
                        state.dimData.push({ colIndex: c, rowIndex: r, x: colCenterX, y: compCenterY, h: displayH, isTop: isLast, divAbove: div });
                    }
                }
                const isHoveredCol = (state.hoveredColIndex === c);
                const hitMat = new THREE.MeshBasicMaterial({ color: isHoveredCol ? 0x2ecc71 : 0x3498db, transparent: true, opacity: (state.selection.colIndex === c && state.selection.rows.includes(r)) ? 0.3 : (isHoveredCol ? 0.05 : 0.0), depthWrite: false });
                const hitBox = new THREE.Mesh(new THREE.BoxGeometry(col.width, compH, bodyD - backT - 2), hitMat);
                if (_isActiveWingBuild) { hitBox.position.set(colCenterX, compCenterY, -1); hitBox.userData = { colIndex: c, rowIndex: r }; _buildGroup.add(hitBox); hitBoxes.push(hitBox); }
                
                if (_isActiveWingBuild && !isLast) dragHandlesData.vertical.push({ colIndex: c, shelfIdx: div.idx, x: colCenterX, y: div.y, isSplit: (div.type === 'split') });
            }

if (compData && compData.type === 'hanging') {
                if (!isBP) {
                    const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, col.width - 2, 16), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 }));
                    rod.rotation.z = Math.PI / 2; rod.position.set(colCenterX, prevY + compH - 6, 0);
                    _buildGroup.add(rod);
                }
            }
            // === סורבטו — מנגנון תלייה מתרומם ===
            else if (compData && compData.type === 'sorbet') {
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
                        let baseForInset = col.type === 'desk' ? col.deskHeight + col.deskClearance : state.plinthHeight;
                        compBottomY = (r === 0) ? (baseForInset + t) : (dividersAsc[r-1].y + dividersAsc[r-1].thick/2);
                        compTopY = isLast ? (col.height - t) : (dividersAsc[r].y - dividersAsc[r].thick/2);
                        compBottomY += doorGap/2;
                        compTopY -= doorGap/2;
                    } else {
                        // For bathroom regalim: extend drawer fronts down by t to cover the bottom plate face.
                        const _bathRegalimBase = (state.presetId === 'bathroom' && isRegalim && r === 0 && fo === 0 && col.type !== 'desk');
                        compBottomY = (r === 0) ? (col.type === 'desk' ? col.deskHeight + col.deskClearance : (_bathRegalimBase ? state.plinthHeight - t : state.plinthHeight)) : prevY;
                        compTopY = isLast ? col.height : topY;
                        if (r === 0 && col.type !== 'desk' && state.plinthHeight === 7 && !_bathRegalimBase) compBottomY = 1.5;
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
                        if (!isTouch) {
                            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15, 16).rotateZ(Math.PI/2), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 }));
                            handle.position.set(0, 0, t/2 + 1.5); mesh.add(handle);
                        }
                        // ---- Bathroom groove overlay on external drawer ----
                        const _bathGrooveExt = state.presetId === 'bathroom'
                            ? ((state.wings.center && state.wings.center.doorGrooveStyle) || 'plain')
                            : 'plain';
                        if (_bathGrooveExt !== 'plain') {
                            _drawGroovesOnPanel(_buildGroup, _bathGrooveExt, overlayW, extDrawerH, t, overlayCenterX, dY, fZ + t / 2, matExternal);
                        }
                    }
                } else if(!isExt) {
                    const innerGap = 0.4;
                    const drawerH = (compH - innerGap*(count+1)) / count;
                    const fingerGap = 2.5;
                    const actualDrawerH = drawerH - fingerGap;

                    if (_isSlidingWardrobe && !isBP) {
                        // ---- Sliding wardrobe: drawer box inside visible carcass frame ----
                        // Shelf zone: depth = bodyD-10, front face at bodyD/2-10, back at -bodyD/2
                        const shelfFrontZ = bodyD / 2 - 10;   // front face of shelf zone (+20 for bodyD=60)
                        const cabinetBackZ = -bodyD / 2 + 1;  // near back wall
                        const carcassD = bodyD - 10 - 1;      // carcass depth (shelf zone depth minus back gap)
                        const carcassCenterZ = shelfFrontZ - carcassD / 2; // center Z of carcass

                        // Frame border thickness (visible from front)
                        const frameT = t; // same as board thickness

                        // Outer carcass frame for the entire cell (top, bottom, left, right rails at front face)
                        // These are thin strips at the front face of the shelf zone, forming the visible frame
                        const cellTopY    = prevY + compH;
                        const cellBottomY = prevY;
                        const cellCenterY = prevY + compH / 2;
                        const frameZ      = shelfFrontZ + frameT / 2 + 0.1; // slightly in front of shelf face

                        // Top rail
                        createBoard(col.width, frameT, frameT, colCenterX, cellTopY - frameT/2, frameZ, matBody);
                        // Bottom rail
                        createBoard(col.width, frameT, frameT, colCenterX, cellBottomY + frameT/2, frameZ, matBody);
                        // Left rail
                        createBoard(frameT, compH - frameT*2, frameT, colCenterX - col.width/2 + frameT/2, cellCenterY, frameZ, matBody);
                        // Right rail
                        createBoard(frameT, compH - frameT*2, frameT, colCenterX + col.width/2 - frameT/2, cellCenterY, frameZ, matBody);

                        // Drawer boxes — recessed 2cm behind the frame front face
                        const drwRecess = 2.0;
                        const drwFrontZ = shelfFrontZ - drwRecess;
                        const drwD      = carcassD - drwRecess;
                        const drwBackZ  = cabinetBackZ;
                        const drwCenterZ = (drwFrontZ + drwBackZ) / 2;
                        const drwW = col.width - frameT * 2 - innerGap * 2;

                        for(let d=0; d<count; d++) {
                            const dY = prevY + innerGap + drawerH/2 + (d * (drawerH + innerGap));
                            const boxH = actualDrawerH;
                            const boxCenterY = dY - fingerGap/2;
                            const boxBottomY = boxCenterY - boxH/2;

                            // Front face (visible panel, recessed inside frame)
                            createBoard(drwW, boxH, frameT, colCenterX, boxCenterY, drwFrontZ + frameT/2, matInternal);
                            // Bottom board
                            createBoard(drwW, frameT, drwD, colCenterX, boxBottomY + frameT/2, drwCenterZ, matInternal);
                            // Left side wall
                            createBoard(frameT, boxH, drwD, colCenterX - drwW/2 + frameT/2, boxCenterY, drwCenterZ, matInternal);
                            // Right side wall
                            createBoard(frameT, boxH, drwD, colCenterX + drwW/2 - frameT/2, boxCenterY, drwCenterZ, matInternal);
                            // Back panel
                            createBoard(drwW - frameT*2, boxH, frameT, colCenterX, boxCenterY, drwBackZ + frameT/2, matInternal);
                        }
                    } else {
                        // Standard (non-sliding) drawer: flat front panel + finger gap indicator
                        const fZ = bodyD/2 - t/2 - 1.5;
                        const drwW = col.width - innerGap * 2 - 2;
                        for(let d=0; d<count; d++) {
                            const dY = prevY + innerGap + drawerH/2 + (d * (drawerH + innerGap));
                            const actualDY = dY - fingerGap/2;
                            _ppPartId = `drawer_c${c}_r${r}_d${d}`;
                            createBoard(drwW, actualDrawerH, t, colCenterX, actualDY, fZ, matInternal);
                            _ppPartId = '';
                            if (!isBP) {
                                const backPanel = new THREE.Mesh(new THREE.BoxGeometry(drwW - 2, fingerGap, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                                backPanel.position.set(colCenterX, dY + drawerH/2 - fingerGap/2, fZ - t/2 - 0.25);
                                _buildGroup.add(backPanel);
                            }
                        }
                    }
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
                const _renderSubContent = (subType, subCenterX, subW, zoneBottomY, zoneH, subIdx = -1) => {
                    if (!subType || subType === 'empty') return;
                    if (subType === 'hanging') {
                        const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, subW - 2, 16), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 }));
                        rod.rotation.z = Math.PI / 2;
                        rod.position.set(subCenterX, zoneBottomY + zoneH - 6, 0);
                        _buildGroup.add(rod);
                    } else if (subType === 'internal_drawers') {
                        const count = 2;
                        const innerGap = 0.4;
                        const drawerH = (zoneH - innerGap*(count+1)) / count;
                        const fZ = bodyD/2 - t/2 - 1.5;
                        const fingerGap = 2.5;
                        const actualDrawerH = drawerH - fingerGap;
                        const _subSide = subCenterX < colCenterX ? 'R' : 'L';
                        for(let d=0; d<count; d++) {
                            const dY = zoneBottomY + innerGap + drawerH/2 + (d * (drawerH + innerGap));
                            const actualDY = dY - fingerGap/2;
                            _ppPartId = `drawer_sub_c${c}_r${r}_${_subSide}_d${d}`;
                            createBoard(subW - innerGap*2 - 2, actualDrawerH, t, subCenterX, actualDY, fZ, matInternal);
                            _ppPartId = '';
                            const backPanel = new THREE.Mesh(new THREE.BoxGeometry(subW - innerGap*2 - 4, fingerGap, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
                            backPanel.position.set(subCenterX, dY + drawerH/2 - fingerGap/2, fZ - t/2 - 0.25);
                            _buildGroup.add(backPanel);
                        }
                    } else if (subType === 'door_right' || subType === 'door_left' || subType === 'door_double') {
                        const fZ = isInset ? (bodyD/2 - t/2) : (bodyD/2 + t/2 + 0.1);
                        const doorH = zoneH + t;
                        const doorY = zoneBottomY + zoneH / 2;
                        if (subType === 'door_double') {
                            const halfW = (subW + t) / 2;
                            const lCX = subCenterX - halfW / 2;
                            const rCX = subCenterX + halfW / 2;
                            createBoard(halfW, doorH, t, lCX, doorY, fZ, matExternal);
                            createBoard(halfW, doorH, t, rCX, doorY, fZ, matExternal);
                            if (!isTouch) {
                                const handleH = Math.min(doorH * 0.35, 12);
                                const handleMatD = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 });
                                const hL = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, handleH, 12), handleMatD);
                                hL.position.set(lCX + halfW * 0.35, doorY, fZ + t/2 + 1.5);
                                _buildGroup.add(hL);
                                const hR = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, handleH, 12), handleMatD);
                                hR.position.set(rCX - halfW * 0.35, doorY, fZ + t/2 + 1.5);
                                _buildGroup.add(hR);
                            }
                        } else {
                            const doorW = subW + t;
                            createBoard(doorW, doorH, t, subCenterX, doorY, fZ, matExternal);
                            if (!isTouch) {
                                const isRight = subType === 'door_right';
                                const handleX = isRight ? subCenterX - subW * 0.35 : subCenterX + subW * 0.35;
                                const handleMesh = new THREE.Mesh(
                                    new THREE.CylinderGeometry(0.5, 0.5, Math.min(doorH * 0.35, 12), 12),
                                    new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 })
                                );
                                handleMesh.position.set(handleX, doorY, fZ + t/2 + 1.5);
                                _buildGroup.add(handleMesh);
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

                // Draw N partition boards + N+1 sub-cells
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
                    for (let si = 0; si < boundaryXs.length - 1; si++) {
                        const sub = compData.subCells[si];
                        if (!sub) continue;
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
                            sub.shelvesY = subShelvesY; // persist
                        }

                        // Push per-zone sub-cell + buttons for UI overlay
                        if (!isBP && _isActiveWingBuild) {
                            // Zone boundaries: prevY, shelvesY[0], shelvesY[1], ..., compTopY
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
                                state.dimData.push({
                                    isSubCellBtn: true,
                                    colIndex: c, rowIndex: r, subCellIdx: si,
                                    zoneIdx: z, numZones,
                                    x: subCenterX, y: zoneCenterY,
                                    subType: sub.zonesType[z] || 'empty'
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
                            const subD = bodyD - 2;
                            for (let s = 0; s < subShelvesY.length; s++) {
                                createBoard(subW, t, subD, subCenterX, subShelvesY[s], 0, matInternal);
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
                                    if (zoneH <= 0) continue;
                                    const zoneType = (Array.isArray(sub.zonesType) && sub.zonesType[z]) ? sub.zonesType[z] : (sub.type || 'empty');
                                    if (zoneType && zoneType !== 'empty') {
                                        _renderSubContent(zoneType, subCenterX, subW, zoneBottomY, zoneH, si);
                                    }
                                }
                            }
                        } else if (!isBP && sub.type && sub.type !== 'empty') {
                            _renderSubContent(sub.type, subCenterX, subW, prevY, compH, si);
                        }
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

            col.doors.forEach(door => {
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
                
                const dY = doorBottomY + dH/2;
                const zPos = isInset ? (bodyD/2 - t/2) : (bodyD/2 + t/2 + 0.1);

                const makeDoor = (w, isLeft, centerX, style, uvTotalW) => {
                    style = style || 'solid';
                    // For framed/glass styles, the frame profiles protrude fd=1.5cm in front of the door panel.
                    // To keep all door styles flush at the same front face, shift the door group back by fd
                    // so the frame's front face aligns with a solid door's front face.
                    // fz = t/2 + fd/2 (frame center relative to group), frame front = fz + fd/2 = t/2 + fd
                    // solid door front = t/2 (relative to group). Difference = fd → shift back by fd.
                    const fd_offset = (style !== 'solid') ? 1.5 : 0; // fd = 1.5cm
                    const pivotX = centerX + (isLeft ? -w/2 : w/2);
                    const doorGroup = new THREE.Group();
                    doorGroup.position.set(pivotX, dY, zPos - fd_offset);
                    _buildGroup.add(doorGroup);
                    
                    const doorLocalX = isLeft ? w/2 : -w/2;

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
                        const doorMat = matExternal.clone();

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
                        
                        if (!isTouch) {
                            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15, 16), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 }));
                            handle.position.set(isLeft ? w/2 - 4 : -w/2 + 4, 0, t/2 + 1.5);
                            mesh.add(handle);
                        }
                        doorGroup.add(mesh);
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
                            frameMat = matExternal.clone();
                        } else if (style === 'glass_melamine') {
                            frameMat = matExternal.clone();
                        } else if (style === 'glass_black') {
                            frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.15, roughness: 0.3 });
                        } else if (style === 'glass_gold') {
                            frameMat = new THREE.MeshStandardMaterial({ color: 0xe5ba70, metalness: 0.15, roughness: 0.3 });
                        }

                        // glass_black / glass_gold: no handle (aluminum frame doors don't have separate handles)
                        const isAlumFrame = (style === 'glass_black' || style === 'glass_gold');
                        // For glass_melamine: add handle on the frame (no back panel — glass is transparent)
                        if (isGlass && !isTouch && !isAlumFrame) {
                            // Attach handle to doorGroup directly (no back panel)
                            const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 15, 16), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 }));
                            handle.position.set(doorLocalX + (isLeft ? w/2 - 4 : -w/2 + 4), 0, fz + fd/2 + 1.5);
                            doorGroup.add(handle);
                        }

                        // Top frame bar
                        const topGeo = new THREE.BoxGeometry(w, fw, fd);
                        const topMesh = new THREE.Mesh(topGeo, frameMat);
                        topMesh.position.set(doorLocalX, dH/2 - fw/2, fz);
                        doorGroup.add(topMesh);

                        // Bottom frame bar
                        const botGeo = new THREE.BoxGeometry(w, fw, fd);
                        const botMesh = new THREE.Mesh(botGeo, frameMat);
                        botMesh.position.set(doorLocalX, -dH/2 + fw/2, fz);
                        doorGroup.add(botMesh);

                        // Left side bar (between top and bottom bars)
                        const sideH = dH - fw * 2;
                        const leftGeo = new THREE.BoxGeometry(fw, sideH, fd);
                        const leftMesh = new THREE.Mesh(leftGeo, frameMat);
                        leftMesh.position.set(doorLocalX - w/2 + fw/2, 0, fz);
                        doorGroup.add(leftMesh);

                        // Right side bar
                        const rightGeo = new THREE.BoxGeometry(fw, sideH, fd);
                        const rightMesh = new THREE.Mesh(rightGeo, frameMat);
                        rightMesh.position.set(doorLocalX + w/2 - fw/2, 0, fz);
                        doorGroup.add(rightMesh);

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
                if (door.type === 'left') makeDoor(_doorOverlayW, true, _doorOverlayCenterX, doorStyle);
                if (door.type === 'right') makeDoor(_doorOverlayW, false, _doorOverlayCenterX, doorStyle);
                if (door.type === 'double') {
                    const w = (_doorOverlayW / 2) - (doorGap / 2);
                    makeDoor(w, true, _doorOverlayCenterX - w/2 - doorGap/2, doorStyle, _doorOverlayW);
                    makeDoor(w, false, _doorOverlayCenterX + w/2 + doorGap/2, doorStyle, _doorOverlayW);
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
        let _cx = -state.width / 2 + t;
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
                    const panelLeftX = colLeftEdges[spanStart] - t / 2;
                    const lastColIdx = c - 1;
                    const panelRightX = colLeftEdges[lastColIdx] + _wingCols[lastColIdx].width + t / 2;
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
                        const panelLeftX = colLeftEdges[ci] - t / 2;
                        const panelRightX = colLeftEdges[ci] + sc.width + t / 2;
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

        if (state.activeWing === 'sideCabinetRight' || state.activeWing === 'sideCabinetLeft') {
            // Side cabinet edit mode: no red zone (it's not a regular wing with a hidden zone)

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
                    const cornerColR = state.columns[_numCols - 1];
                    const visibleOpening = Math.max(0, Math.round(cornerColR.width - frontWingD));
                    if (visibleOpening > 0) {
                        // Label centered on the corner column's visible portion
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

// ==========================================
// SLIDING WARDROBE 3D RENDERER
// ==========================================
function buildSlidingDoorCabinet() {
    const wing = state.wings.center;
    if (!wing || !wing.slidingDoor || !wing.slidingDoor.enabled) return;

    const sd = wing.slidingDoor;
    const isBP = state.viewMode === 'blueprint';

    const totalW = wing.width;
    const totalH = wing.globalHeight;
    const bodyD = wing.depth;           // full cabinet depth (e.g. 60cm)
    const shelfD = 42;                  // fixed interior shelf depth (cm)
    const doorZoneD = 10;               // door track zone depth from front face (cm)
    const partitionSetback = 5;         // gap between cabinet front face and partition front face (cm)
    const partitionD = bodyD - partitionSetback; // partition depth: front face always 5cm behind cabinet front
    const plinthH = wing.plinthHeight || 7; // 7cm for sliding wardrobes
    const profileT = 1.7; // aluminum profile thickness in cm — same as board thickness
    const sideProfileD = 1.7; // side profile depth (front-to-back) — slim aluminum extrusion
    const doorT = 2.0;    // door panel thickness in cm
    const trackGap = 2.0; // gap between front and back door tracks (center-to-center offset)
    const numDoors = sd.numDoors || 2;
    const t = wing.thickness || 1.7;    // board thickness

    // ---- Load brushed texture maps once and cache ----
    // _brushedTexRepeat controls how many times the texture tiles (default 4 = natural pattern size)
    if (window._brushedTexRepeat === undefined) window._brushedTexRepeat = 4;
    if (!window._silverTexMap) {
        const tl = new THREE.TextureLoader();
        window._silverTexMap = tl.load('images/silver.jpg', t => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.encoding = THREE.sRGBEncoding;
            t.repeat.set(window._brushedTexRepeat, window._brushedTexRepeat);
            if (typeof buildCabinet === 'function') buildCabinet();
        });
    } else {
        window._silverTexMap.repeat.set(window._brushedTexRepeat, window._brushedTexRepeat);
        window._silverTexMap.needsUpdate = true;
    }
    if (!window._goldTexMap) {
        const tl = new THREE.TextureLoader();
        window._goldTexMap = tl.load('images/gold.jpg', t => {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.encoding = THREE.sRGBEncoding;
            t.repeat.set(window._brushedTexRepeat, window._brushedTexRepeat);
            if (typeof buildCabinet === 'function') buildCabinet();
        });
    } else {
        window._goldTexMap.repeat.set(window._brushedTexRepeat, window._brushedTexRepeat);
        window._goldTexMap.needsUpdate = true;
    }

    // ---- Profile color material ----
    // brushed: 'silver'/'gold' → texture map, NO envMap, brightness via emissive
    // reflect: true            → solid color WITH envMap reflection (only black)
    // reflect: false           → solid color, NO envMap (white, cream)
    const _profileSlider = (window._hdrIntensity && window._hdrIntensity.profile != null)
        ? window._hdrIntensity.profile : 2.05;
    const profileColorMap = {
        nickel:    { color: 0xffffff, metalness: 0.5,  roughness: 0.55, brushed: 'silver', reflect: false },
        black:     { color: 0x1a1a1a, metalness: 0.85, roughness: 0.3,  brushed: false,    reflect: true  },
        white:     { color: 0xf0f0f0, metalness: 0.2,  roughness: 0.6,  brushed: false,    reflect: false },
        cream:     { color: 0xf0e8d0, metalness: 0.2,  roughness: 0.6,  brushed: false,    reflect: false },
        gold_matte:{ color: 0xffffff, metalness: 0.5,  roughness: 0.55, brushed: 'gold',   reflect: false }
    };
    const pc = profileColorMap[sd.profileColor] || profileColorMap.nickel;
    let profileMat;
    if (isBP) {
        profileMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    } else {
        const texMap = pc.brushed === 'silver' ? window._silverTexMap
                     : pc.brushed === 'gold'   ? window._goldTexMap
                     : null;
        if (pc.brushed) {
            // Brushed: texture only, no envMap, brightness via emissive
            const emissiveBrightness = Math.max(0, _profileSlider - 0.3);
            profileMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                metalness: pc.metalness,
                roughness: pc.roughness,
                envMapIntensity: 0,
                emissive: new THREE.Color(0xffffff),
                emissiveIntensity: emissiveBrightness * 0.15,
                ...(texMap ? { map: texMap } : {})
            });
        } else if (pc.reflect) {
            // Reflective solid (black): envMap with slider intensity
            profileMat = new THREE.MeshStandardMaterial({
                color: pc.color,
                metalness: pc.metalness,
                roughness: pc.roughness,
                envMapIntensity: _profileSlider
            });
            const sharpMap = window._hdrEnvMapSharp || window._hdrEnvMap;
            if (sharpMap) { profileMat.envMap = sharpMap; profileMat.needsUpdate = true; }
        } else {
            // Non-reflective solid (white, cream): no envMap
            profileMat = new THREE.MeshStandardMaterial({
                color: pc.color,
                metalness: pc.metalness,
                roughness: pc.roughness,
                envMapIntensity: 0
            });
        }
    }

    // ---- Door panel material — per-door using doorPanels[] array ----
    // Helper: create material for a given panel type and door index
    const _makeDoorMat = (panelType, doorIdx) => {
        if (isBP) return new THREE.MeshBasicMaterial({ color: 0xdddddd });
        if (panelType === 'glass') {
            const intensity = (window._hdrIntensity && window._hdrIntensity.glass != null) ? window._hdrIntensity.glass : 1.2;
            const mat = new THREE.MeshStandardMaterial({
                color: 0x88ccee, transparent: true, opacity: 0.35,
                metalness: 0.2, roughness: 0.0, side: THREE.DoubleSide,
                envMapIntensity: intensity
            });
            const glassMap = window._hdrEnvMapSharp || window._hdrEnvMap;
            if (glassMap) { mat.envMap = glassMap; mat.needsUpdate = true; }
            return mat;
        } else if (panelType === 'mirror') {
            const intensity = (window._hdrIntensity && window._hdrIntensity.mirror != null) ? window._hdrIntensity.mirror : 2.8;
            const mat = new THREE.MeshStandardMaterial({
                color: 0x888888, metalness: 1.0, roughness: 0.0,
                envMapIntensity: intensity
            });
            const mirrorMap = window._hdrEnvMapSharp || window._hdrEnvMap;
            if (mirrorMap) { mat.envMap = mirrorMap; mat.needsUpdate = true; }
            return mat;
        } else if (panelType === 'mirror_dark') {
            // Dark mirror: same as regular mirror but fixed envMapIntensity of 1.1
            const mat = new THREE.MeshStandardMaterial({
                color: 0x888888, metalness: 1.0, roughness: 0.0,
                envMapIntensity: 1.1
            });
            const mirrorMap = window._hdrEnvMapSharp || window._hdrEnvMap;
            if (mirrorMap) { mat.envMap = mirrorMap; mat.needsUpdate = true; }
            return mat;
        } else {
            // solid — use per-door color if set, otherwise body material
            const doorColorKey = (sd.doorColors && sd.doorColors[doorIdx]) ? sd.doorColors[doorIdx] : wing.materialBody;
            return materials[doorColorKey] || materials['white_matte'];
        }
    };
    // Ensure doorPanels array is populated
    if (!sd.doorPanels || sd.doorPanels.length < numDoors) {
        if (!sd.doorPanels) sd.doorPanels = [];
        while (sd.doorPanels.length < numDoors) sd.doorPanels.push(sd.doorPanelType || 'solid');
    }

    // ---- Shelf edge (קנט) material — aluminum in profile color ----
    const kantMat = profileMat;

    // ---- Group for the entire sliding door system ----
    // Frame (rails + side profiles) is always visible.
    // Door panels + door frames are hidden when state.hasDoors === false.
    const frameGroup = new THREE.Group();
    const doorsGroup = new THREE.Group();
    cabinetGroup.add(frameGroup);
    if (state.hasDoors !== false) {
        cabinetGroup.add(doorsGroup);
    }

    // Helper: add a box mesh to a target group
    const addBoxTo = (group, w, h, d, x, y, z, mat) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    };

    // ---- Z layout (bodyD=60cm, centered at z=0) ----
    // Cabinet body (from _buildWingGeometry): full bodyD depth, centered at z=0
    //   Back face: -bodyD/2 = -30,  Front face: +bodyD/2 = +30
    // Door zone: 10cm at the front (z = +20 to +30)
    //   Front door center: z = +29 (front face at +30)
    //   Back door center:  z = +25 (back face at +24, gap to z=+20 = 4cm)
    // Aluminum profiles: 4cm deep, flush with front face (z = +26 to +30)
    // Kant strips: at front face of shelves. Shelves are bodyD deep but kant sits
    //   at partitionFrontZ = bodyD/2 - doorZoneD = +20 (front of partition/shelf zone)
    const frameFrontZ   = bodyD / 2;                           // cabinet front face (+30)
    const partFrontZ    = frameFrontZ - doorZoneD;             // partition/shelf front face (+20)
    // Aluminum profiles sit IN FRONT of the cabinet body (back face at frameFrontZ).
    // This avoids Z-fighting with the body front face.
    const aluminumSideZ = frameFrontZ + sideProfileD / 2;     // center of aluminum profiles, in front of body

    // ---- Body material ----
    const bodyMat = isBP
        ? new THREE.MeshBasicMaterial({ color: 0xdddddd })
        : (materials[wing.materialBody] || materials['white_matte']);

    // ---- ALUMINUM PROFILES — at front face ----
    // Plinth aluminum rail
    addBoxTo(frameGroup, totalW, plinthH, sideProfileD, 0, plinthH / 2, aluminumSideZ, profileMat);
    // Top cladding aluminum
    addBoxTo(frameGroup, totalW, plinthH, sideProfileD, 0, totalH - plinthH / 2, aluminumSideZ, profileMat);
    // Left side profile
    addBoxTo(frameGroup, profileT, totalH, sideProfileD, -totalW / 2 + profileT / 2, totalH / 2, aluminumSideZ, profileMat);
    // Right side profile
    addBoxTo(frameGroup, profileT, totalH, sideProfileD, totalW / 2 - profileT / 2, totalH / 2, aluminumSideZ, profileMat);

    // ---- FULL-WIDTH BOTTOM & TOP BOARDS — cover gaps at partition boundaries ----
    // The internal column partitions are set back 6cm from the front face.
    // The per-column plinth top and ceiling boards from _buildWingGeometry span full bodyD,
    // but at partition boundaries there's a visible gap. Add full-width overlay boards
    // spanning the full inner width and full bodyD to cover these gaps.
    const innerW = totalW - t * 2; // inner width between side walls
    // Bottom board: top edge flush with top of aluminum plinth rail (y=plinthH)
    // Board spans y=plinthH-t .. y=plinthH, center at y=plinthH-t/2
    addBoxTo(frameGroup, innerW, t, bodyD, 0, plinthH - t / 2, 0, bodyMat);
    // Top board: sits at ceiling level, full width, full depth
    // Offset -0.05 in Y to sit just below the per-column ceiling boards (avoid Z-fighting)
    addBoxTo(frameGroup, innerW, t, bodyD, 0, totalH - t / 2 - 0.05, 0, bodyMat);

    // ---- SLIDING DOORS ----
    // Front door: center at z = +29 (front face flush with cabinet front)
    // Back door:  center at z = +25 (back face at +24, 4cm gap to partition front at +20)
    const doorAreaW = totalW - profileT * 2;
    const doorAreaH = totalH - plinthH;
    const doorW = doorAreaW / numDoors;
    const doorH = doorAreaH;

    const trackFrontZ = frameFrontZ - doorT / 2;                    // front door center (+29)
    const trackBackZ  = frameFrontZ - doorT - trackGap - doorT / 2; // back door center (+25)

    const fT = profileT;
    for (let i = 0; i < numDoors; i++) {
        const isBackTrack = (i % 2 === 0);
        const dz = isBackTrack ? trackBackZ : trackFrontZ;
        const dx = -totalW / 2 + profileT + doorW * i + doorW / 2;
        const dy = plinthH + doorH / 2;

        // Per-door panel material
        const thisDoorMat = _makeDoorMat(sd.doorPanels[i] || sd.doorPanelType || 'solid', i);

        const panelW = doorW - fT * 2 - 0.4;
        const panelH = doorH - fT * 2 - 0.4;
        addBoxTo(doorsGroup, panelW, panelH, doorT, dx, dy, dz, thisDoorMat);

        const frameDz = dz + doorT / 2 + 0.15;
        addBoxTo(doorsGroup, doorW, fT, fT, dx, plinthH + doorH - fT / 2, frameDz, profileMat); // top
        addBoxTo(doorsGroup, doorW, fT, fT, dx, plinthH + fT / 2, frameDz, profileMat);          // bottom
        addBoxTo(doorsGroup, fT, doorH, fT, dx - doorW / 2 + fT / 2, dy, frameDz, profileMat);  // left
        addBoxTo(doorsGroup, fT, doorH, fT, dx + doorW / 2 - fT / 2, dy, frameDz, profileMat);  // right
    }

    // ---- SHELF ALUMINUM EDGE (קנט) — 3cm strip at front face of shelves ----
    // Shelves are set back 10cm from cabinet front face (door zone = 10cm).
    // Kant sits at the front face of the shelves: frameFrontZ - 10 = +20 (for bodyD=60)
    const kantH = 3;
    const kantT = 0.6;
    const kantFrontZ = frameFrontZ - 10; // front face of shelves (10cm setback)
    const kantZ = kantFrontZ + 0.15;     // slightly in front to avoid Z-fighting
    let colStartX = -totalW / 2 + t;
    wing.columns.forEach(col => {
        const colCenterX = colStartX + col.width / 2;
        const colKantW = col.width;
        if (col.shelvesY) {
            col.shelvesY.forEach(shelfY => {
                const kantCenterY = shelfY + t - kantH / 2;
                addBoxTo(frameGroup, colKantW, kantH, kantT,
                    colCenterX, kantCenterY, kantZ, kantMat);
            });
        }
        colStartX += col.width + t;
    });
    // ---- Blueprint dimension data ----
    if (isBP) {
        state.bpData.push({
            type: 'sliding',
            totalW, totalH, bodyD, plinthH, numDoors, doorW,
            profileColor: sd.profileColor, doorPanelType: sd.doorPanelType
        });
    }
}

function buildCornerUnit() {
    const cu = state.corner;
    if (!cu || cu.side === 'none') return;

    const isBP = state.viewMode === 'blueprint';
    const t = state.thickness;
    const bodyD = state.depth;
    const mainW = state.width;

    // Corner unit — INSIDE the cabinet's X range, protruding FORWARD from the front face.
    //
    // World-space layout (right side):
    //   X: from (mainW/2 - cuD)  to  mainW/2          — inside cabinet, cuD = bodyD
    //   Z: from bodyD/2          to  bodyD/2 + cuW     — protrudes forward
    //   Y: from 0                to  cuH
    //
    // Walls:
    //   - Back wall (far Z):  at Z = bodyD/2 + cuW  (outer end, far from main cabinet front)
    //   - Side wall (far X):  at X = mainW/2         (cabinet side wall)
    //   - No wall at Z = bodyD/2  (opening, flush with main cabinet front face)
    //   - No wall at X = mainW/2 - cuD  (open toward main cabinet interior)
    //
    // For left side: mirror in X (sign = -1)

    const cuW = cu.width || 60;    // protrusion depth in Z (forward from front face)
    const cuH = cu.height || 90;   // height
    const cuD = cu.depth || bodyD; // width in X (default = main cabinet depth)
    const plinthH = state.plinthHeight;
    const sign = (cu.side === 'right') ? 1 : -1;

    // Group center in world space:
    // X center: sign * (mainW/2 - cuD/2)  — inside cabinet
    // Z center: bodyD/2 + cuW/2           — protrudes forward
    const cuCenterX = sign * (mainW / 2 - cuD / 2);
    const cuCenterZ = bodyD / 2 + cuW / 2;

    const cuGroup = new THREE.Group();
    cuGroup.position.set(cuCenterX, 0, cuCenterZ);

    // Local space (group centered at cuCenterX, cuCenterZ):
    //   X: [-cuD/2 .. +cuD/2]
    //     sign>0: +cuD/2 = side wall (at mainW/2), -cuD/2 = inner open side
    //   Z: [-cuW/2 .. +cuW/2]
    //     -cuW/2 = opening (at bodyD/2, flush with main cabinet front)
    //     +cuW/2 = back wall (far forward)

    const matBody = materials[state.materialBody] || materials['white_matte'];
    const matInternal = materials[state.materialInternal] || materials['white_matte'];
    const matExternal = materials[state.materialExternal] || materials['white_matte'];
    const edgeM = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });

    // Blueprint mode: draw a simple front-view rectangle outline for the corner unit
    if (isBP) {
        const bpMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        const bpEdge = new THREE.LineBasicMaterial({ color: 0x000000 });
        // Front-view rectangle: width=cuD, height=cuH, centered at (cuCenterX, cuH/2)
        const geo = new THREE.PlaneGeometry(cuD, cuH);
        const mesh = new THREE.Mesh(geo, bpMat);
        mesh.position.set(cuCenterX, cuH / 2, 0);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), bpEdge));
        _buildGroup.add(mesh);
        // Add width + height dimension data
        state.bpData.push({ type: 'width', val: Math.round(cuD), x: cuCenterX, y: -20, halfW: cuD / 2 });
        state.bpData.push({ type: 'height', val: Math.round(cuH), x: cuCenterX + sign * (cuD / 2 + 15), y: cuH / 2, halfH: cuH / 2 });
        return;
    }

    const addBoard = (w, h, d, x, y, z, mat) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat.clone());
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeM));
        mesh.position.set(x, y, z);
        cuGroup.add(mesh);
        return mesh;
    };

    // Key local positions:
    const sideWallX  = sign * (cuD / 2 - t / 2);   // side wall (at cabinet side, far X)
    const backWallZ  = cuW / 2 - t / 2;             // back wall (far Z, outer end)
    const innerCtrX  = sign * (-t / 2);             // center of inner content in X
    const innerCtrZ  = t / 2;                       // center of inner content in Z (inset from opening)
    const innerW     = cuD - t;                     // inner width in X
    const innerD     = cuW - t;                     // inner depth in Z

    if (cu.type === 'desk') {
        const matDesk = materials[state.materialDesk] || matBody;
        const deskH = cu.height || 80;
        // Surface: full width × full depth
        addBoard(cuD, t, cuW, 0, deskH - t / 2, 0, matDesk);
        // Back leg at far Z (outer end wall, far from main cabinet front face)
        addBoard(cuD, deskH, t, 0, deskH / 2, backWallZ, matDesk);
        // Optional drawers under desk surface
        const numDeskDrawers = cu.deskDrawerCount || 0;
        if (numDeskDrawers > 0) {
            const drawerUnitD = cuW - t;
            const drawerUnitH = deskH - plinthH - t;
            const drawerH = (drawerUnitH - 0.4 * (numDeskDrawers - 1)) / numDeskDrawers;
            const duZ = t / 2;
            const handleMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 0.85, roughness: 0.15 });
            for (let i = 0; i < numDeskDrawers; i++) {
                const dY = plinthH + drawerH / 2 + i * (drawerH + 0.4);
                const fX = sign * (cuD / 2 + t / 2 + 0.1);
                const dMesh = addBoard(t, drawerH - 0.5, drawerUnitD, fX, dY + plinthH / 2, duZ, matExternal);
                const barLen = Math.min(drawerUnitD * 0.5, 14);
                const barR = 0.3;
                const postH = 1.0;
                const hOffX = sign * (-t / 2 - postH - barR * 0.5);
                const bar = new THREE.Mesh(
                    new THREE.CylinderGeometry(barR, barR, barLen, 10).rotateX(Math.PI / 2),
                    handleMat
                );
                bar.position.set(hOffX, 0, 0);
                dMesh.add(bar);
                [-barLen / 2, barLen / 2].forEach(pz => {
                    const post = new THREE.Mesh(
                        new THREE.CylinderGeometry(barR, barR, postH, 8).rotateZ(Math.PI / 2),
                        handleMat
                    );
                    post.position.set(sign * (-t / 2 - postH / 2), 0, pz);
                    dMesh.add(post);
                });
            }
        }
    } else {
        // drawers (default)
        // Bottom board
        addBoard(cuD, t, cuW, 0, plinthH + t / 2, 0, matBody);
        // Top board
        addBoard(cuD, t, cuW, 0, cuH - t / 2, 0, matBody);
        // Side wall (at cabinet side, far X)
        addBoard(t, cuH, cuW, sideWallX, cuH / 2, 0, matBody);
        // Back wall (far Z, outer end)
        addBoard(cuD, cuH, t, 0, cuH / 2, backWallZ, matBody);

        // Plinth
        if (plinthH > 0) {
            addBoard(innerW, plinthH, innerD, innerCtrX, plinthH / 2, innerCtrZ, matBody);
        }

        // Drawers — fronts face the OPENING (-X direction, toward main cabinet interior)
        // The open side of the corner unit is at local X = -cuD/2 (inner side)
        // Drawer fronts are thin boards (t wide in X) spanning the full Z width (cuW)
        const numDrawers = cu.drawerCount || 4;
        const innerH = cuH - plinthH - t * 2;
        const drawerH = (innerH - 0.4 * (numDrawers - 1)) / numDrawers;
        // Drawer fronts at X = sign*(-cuD/2) — just outside the inner open side, facing -X (right side) or +X (left side)
        const fX = sign * (-cuD / 2 - t / 2 - 0.1);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 0.85, roughness: 0.15 });
        for (let i = 0; i < numDrawers; i++) {
            const dY = plinthH + t + drawerH / 2 + i * (drawerH + 0.4);
            // Board: t wide (X), drawerH tall (Y), innerD deep (Z) — spans inner Z range
            const dMesh = addBoard(t, drawerH - 0.5, innerD, fX, dY, innerCtrZ, matExternal);
            // Pipe/bar handle: thin horizontal cylinder running along Z, close to drawer face
            const barLen = Math.min(innerD * 0.55, 18); // bar length ~55% of drawer depth, max 18cm
            const barR = 0.35;  // thin pipe radius
            const postR = 0.4;
            const postH = 1.2;  // how far handle stands off the face
            const hOffX = sign * (-t / 2 - postH - barR * 0.5); // just off the drawer face
            // Horizontal bar (along Z)
            const bar = new THREE.Mesh(
                new THREE.CylinderGeometry(barR, barR, barLen, 12).rotateX(Math.PI / 2),
                handleMat
            );
            bar.position.set(hOffX, 0, 0);
            dMesh.add(bar);
            // Two end posts (short cylinders along X connecting bar to face)
            [-barLen / 2, barLen / 2].forEach(pz => {
                const post = new THREE.Mesh(
                    new THREE.CylinderGeometry(postR, postR, postH, 10).rotateZ(Math.PI / 2),
                    handleMat
                );
                post.position.set(sign * (-t / 2 - postH / 2), 0, pz);
                dMesh.add(post);
            });
        }
    }

    _buildGroup.add(cuGroup);
}

// ==========================================
// Full Corner Unit — 100×100 L-shape
// ==========================================
// World-space layout (right wing = side 'right'):
//   The full corner sits at the junction of the center cabinet and the right wing.
//   Center cabinet occupies X: [-mainW/2 .. mainW/2], Z: [-bodyD/2 .. bodyD/2]
//   Right wing occupies X: [mainW/2 .. mainW/2 + wingD], Z: [-wingW/2 .. wingW/2]  (after rotation)
//
//   Full corner box (right side):
//     X: [mainW/2 .. mainW/2 + fcSize]   (extends right, same direction as wing)
//     Z: [-bodyD/2 - fcSize .. -bodyD/2]  (extends backward, behind center cabinet front face)
//     Y: [0 .. colH]
//
//   Two open faces:
//     Z = -bodyD/2  (front face, flush with center cabinet front — open toward center)
//     X = mainW/2   (inner face, flush with center cabinet side — open toward center cabinet)
//
//   Two closed faces:
//     X = mainW/2 + fcSize  (outer face, toward wing)
//     Z = -bodyD/2 - fcSize (back face, toward wall)
//
// For left side: mirror in X (sign = -1)

function buildFullCornerUnit(side, wingData) {
    const isBP = state.viewMode === 'blueprint';
    const centerWing = state.wings.center;
    const mainW = centerWing ? centerWing.width : state.width;
    const bodyD = centerWing ? centerWing.depth : state.depth;
    const t = wingData.thickness || state.thickness;
    const plinthH = wingData.plinthHeight || state.plinthHeight;
    const colH = wingData.globalHeight || state.globalHeight;
    const fc = wingData.fullCorner || { size: 100, shelves: 2, shelvesY: [], compartments: [] };
    const cw = fc.size || 100;  // corner size (both X and Z) — fixed 100
    const cd = cw;              // total depth of L (Z direction)
    // The L has two arms:
    //   Horizontal arm (runs in X, faces viewer from top):  depth = bodyD (center cabinet depth)
    //   Vertical arm   (runs in Z, adjacent to side wing):  depth = wingD (side wing depth)
    // Step position: X = -sign*wingD from outer edge, Z = bodyD from back
    const wingD = wingData.depth || 54;  // side wing depth → controls vertical arm depth
    const horizD = bodyD;               // horizontal arm depth = center cabinet depth
    // For walls:
    const backArmInnerX = wingD;        // vertical arm width = wingD (step in X from outer edge)
    const frontD = horizD;              // alias: horizontal arm depth (Z extent of horizontal arm)
    const backD = cd - frontD;          // remaining Z depth (vertical arm Z extent)

    // Ensure shelvesY is populated
    if (!fc.shelvesY || fc.shelvesY.length !== (fc.shelves || 0)) {
        if (typeof window._distributeFullCornerShelves === 'function') {
            window._distributeFullCornerShelves(wingData);
        }
    }

    // sign: right=+1, left=-1
    const sign = (side === 'right') ? 1 : -1;

    // ---- Position: origin at the BACK-OUTER corner of the L unit ----
    // The L unit's BACK face aligns with the back of the center cabinet (Z = -bodyD/2).
    // Shape extends in -sign*X (toward center) and +Z (toward viewer = forward).
    //
    // For right wing (sign=+1):
    //   Origin at world X = +mainW/2 + cw (far-right edge of L)
    //   Shape goes from X=0 to X=-cw (toward center cabinet)
    //   Shape goes from Z=0 to Z=+cd (toward viewer)
    //
    // For left wing (sign=-1):
    //   Origin at world X = -mainW/2 - cw (far-left edge of L)
    //   Shape goes from X=0 to X=+cw (toward center cabinet)
    //   Shape goes from Z=0 to Z=+cd (toward viewer)
    //
    // Z: back face of L at local Z=0 → world Z = -bodyD/2 (center cabinet back face)
    //    L extends from Z=-bodyD/2 to Z=-bodyD/2+cd (toward viewer)

    const originX = sign * (mainW / 2 + cw);  // far outer edge of L
    const originZ = -bodyD / 2;                // back face aligned with center cabinet back

    const fcGroup = new THREE.Group();
    fcGroup.position.set(originX, 0, originZ);
    fcGroup.userData.isFullCorner = true;
    fcGroup.userData.side = side;

    const matBody = materials[wingData.materialBody] || materials['white_matte'];
    const matInternal = materials[wingData.materialInternal] || materials['white_matte'];
    const edgeM = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });

    const addBoard = (w, h, d, x, y, z, mat) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, (mat || matBody).clone ? (mat || matBody).clone() : (mat || matBody));
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeM));
        mesh.position.set(x, y, z);
        fcGroup.add(mesh);
        return mesh;
    };

    if (isBP) {
        const bpMat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        const bpEdge = new THREE.LineBasicMaterial({ color: 0x000000 });
        const geo = new THREE.PlaneGeometry(cw, colH);
        const mesh = new THREE.Mesh(geo, bpMat);
        mesh.position.set(originX - sign * cw / 2, colH / 2, 0);
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), bpEdge));
        cabinetGroup.add(mesh);
        state.bpData.push({ type: 'width', val: Math.round(cw), x: originX - sign * cw / 2, y: -20, halfW: cw / 2 });
        return;
    }

    // ---- L-shaped board helper (ExtrudeGeometry, no seam) ----
    // Following reference corner-builder.js exactly:
    //   Shape defined in XY plane, rotateX(+PI/2) maps Y→Z (forward into room)
    //   Extrude depth goes in -Y (downward after rotation)
    //   translate(0, yTop, 0) so board top is at yTop, bottom at yTop - t
    //
    // L-shape geometry (viewed from above, Y→Z after rotateX(+PI/2)):
    //   Horizontal arm: full width cw, depth frontD (= bodyD = center cabinet depth)
    //   Vertical arm:   width wingD,   depth backD  (= cd - bodyD, adjacent to side wing)
    //   Step at Z=frontD (=bodyD), X=-sign*wingD from outer edge
    //
    //   Shape points (right side, sign=+1):
    //   (0,0) → (-cw,0) → (-cw,frontD) → (-wingD,frontD) → (-wingD,cd) → (0,cd) → (0,0)
    const makeLShape = () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(-sign * cw, 0);
        shape.lineTo(-sign * cw, frontD);
        shape.lineTo(-sign * wingD, frontD);
        shape.lineTo(-sign * wingD, cd);
        shape.lineTo(0, cd);
        shape.lineTo(0, 0);
        return shape;
    };

    // addLBoard: yTop = world Y of the board's top face; thick = board thickness (default t)
    const addLBoard = (yTop, mat, thick = t) => {
        const geo = new THREE.ExtrudeGeometry(makeLShape(), { depth: thick, bevelEnabled: false });
        // rotateX(+PI/2): shape XY → XZ plane, extrude goes in -Y direction
        geo.rotateX(Math.PI / 2);
        // After rotation: board occupies Y from yTop down to yTop-thick
        geo.translate(0, yTop, 0);
        const mesh = new THREE.Mesh(geo, (mat || matBody).clone ? (mat || matBody).clone() : (mat || matBody));
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeM));
        fcGroup.add(mesh);
        return mesh;
    };

    // ---- Structural boards ----
    // Bottom board: top face at plinthH + t
    addLBoard(plinthH + t, matBody);
    // Top board: top face at colH
    addLBoard(colH, matBody);

    const innerH = colH - plinthH;
    const wallMidY = plinthH + t + (innerH - 2 * t) / 2;

    // Walls — L extends in -sign*X and +Z directions from origin (back face at Z=0):
    //   Horizontal arm: X from 0 to -sign*cw,       Z from 0       to +frontD (= bodyD)
    //   Vertical arm:   X from 0 to -sign*wingD,    Z from +frontD to +cd
    //   backArmInnerX = wingD  (vertical arm width = side wing depth)
    //
    // Back wall   (Z = t/2):                spans full width (X: 0 to -sign*cw)
    addBoard(cw,              innerH - 2 * t, t,       -sign * cw / 2,                    wallMidY, t / 2,              matBody);
    // Inner wall  (X = -sign*t/2):          spans FULL depth (Z: 0 to +cd)
    addBoard(t,               innerH - 2 * t, cd,      -sign * t / 2,                     wallMidY, cd / 2,             matBody);
    // Outer wall  (X = -sign*(cw-t/2)):     spans horizontal arm depth only (Z: 0 to +frontD)
    addBoard(t,               innerH - 2 * t, frontD,  -sign * (cw - t / 2),              wallMidY, frontD / 2,         matBody);
    // Front wall  (Z = cd - t/2):           spans vertical arm width (X: 0 to -sign*wingD)
    addBoard(backArmInnerX,   innerH - 2 * t, t,       -sign * backArmInnerX / 2,         wallMidY, cd - t / 2,         matBody);

    // Plinth (L-shaped, top face at plinthH)
    if (plinthH > 0) {
        const plinthGeo = new THREE.ExtrudeGeometry(makeLShape(), { depth: plinthH, bevelEnabled: false });
        plinthGeo.rotateX(Math.PI / 2);
        plinthGeo.translate(0, plinthH, 0);
        const plinthMesh = new THREE.Mesh(plinthGeo, matBody.clone ? matBody.clone() : matBody);
        plinthMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(plinthGeo), edgeM));
        fcGroup.add(plinthMesh);
    }

    // ---- Shelves: seamless L-shaped boards ----
    // fc.shelvesY stores center Y of each shelf; addLBoard expects top face = sy + t/2
    const shelvesY = fc.shelvesY || [];
    shelvesY.forEach(sy => addLBoard(sy + t / 2, matInternal));

    // ---- Split board (קושרת) — single L-shaped board of double thickness, centered at fc.splitY ----
    // Double thickness (2t) as one board, centered at fc.splitY to align with the adjacent wing's split board.
    // addLBoard(yTop, mat, thick): board occupies yTop-thick .. yTop
    // To center at fc.splitY with thick=2t: yTop = fc.splitY + t → occupies fc.splitY-t .. fc.splitY+t
    if (fc.splitY) {
        addLBoard(fc.splitY + t, matBody, 2 * t); // occupies fc.splitY-t .. fc.splitY+t
    }

    // ---- Compartment content ----
    const comps = fc.compartments || [];
    // Build allY with split board boundaries inserted (same approach as engine-corners.js).
    // compIndexMap[r] = fc.compartments index for allY row r (-1 = split board zone).
    let allY = [plinthH + t, ...shelvesY, colH - t];
    let compIndexMap = allY.slice(0, -1).map((_, i) => i);

    if (fc.splitY) {
        const splitBottom = fc.splitY - t; // bottom face of split board (2t thick, centered at fc.splitY)
        const splitTop    = fc.splitY + t; // top face of split board
        const mergedY = [...allY];
        if (!mergedY.some(y => Math.abs(y - splitBottom) < 0.01)) mergedY.push(splitBottom);
        if (!mergedY.some(y => Math.abs(y - splitTop)    < 0.01)) mergedY.push(splitTop);
        mergedY.sort((a, b) => a - b);
        const newCompMap = [];
        let compIdx = 0;
        for (let i = 0; i < mergedY.length - 1; i++) {
            const midY = (mergedY[i] + mergedY[i + 1]) / 2;
            if (midY >= splitBottom - 0.01 && midY <= splitTop + 0.01) {
                newCompMap.push(-1);
            } else {
                newCompMap.push(compIdx);
                const yTop = mergedY[i + 1];
                const yTopIsOriginal = allY.some(y => Math.abs(y - yTop) < 0.01);
                const yTopIsSplitBoundary = Math.abs(yTop - splitBottom) < 0.01 || Math.abs(yTop - splitTop) < 0.01;
                if (yTopIsOriginal && !yTopIsSplitBoundary) compIdx++;
            }
        }
        allY = mergedY;
        compIndexMap = newCompMap;
    }

    for (let r = 0; r < allY.length - 1; r++) {
        const bottomY = allY[r];
        const topY = allY[r + 1];
        const cellH = topY - bottomY;
        const cellMidY = bottomY + cellH / 2;
        const rodY = topY - 6;
        const ci = compIndexMap[r];
        if (ci < 0) continue; // split board zone — skip
        const comp = comps[ci] || { type: 'empty' };

        // Skip cells that are covered by a multi-cell door span from above
        if (comp.type === 'door_spanned') continue;

        if (comp.type === 'hanging') {
            // Rod along X in horizontal arm center (Z: 0 to frontD=bodyD)
            const rod = new THREE.Mesh(
                new THREE.CylinderGeometry(1.2, 1.2, cw - t, 16),
                new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 })
            );
            rod.rotation.z = Math.PI / 2;
            rod.position.set(-sign * cw / 2, rodY, frontD / 2);
            fcGroup.add(rod);
        } else if (comp.type === 'cross_hanging') {
            // Rod 1 along X (horizontal arm, full width cw)
            const rod1 = new THREE.Mesh(
                new THREE.CylinderGeometry(1.2, 1.2, cw - t, 16),
                new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 })
            );
            rod1.rotation.z = Math.PI / 2;
            rod1.position.set(-sign * cw / 2, rodY, frontD / 2);
            fcGroup.add(rod1);
            // Rod 2 along Z (full depth cd) — center at X=-sign*wingD/2, Z=cd/2
            const rod2 = new THREE.Mesh(
                new THREE.CylinderGeometry(1.2, 1.2, cd - t, 16),
                new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 })
            );
            rod2.rotation.x = Math.PI / 2;
            rod2.position.set(-sign * wingD / 2, rodY - 2.5, cd / 2);
            fcGroup.add(rod2);
        } else if (comp.type === 'door_regular' || comp.type === 'door_glass') {
            const isGlass = comp.type === 'door_glass';
            // Calculate door height — may span multiple cells.
            // Cap the span so it doesn't cross into the split board zone (compIndexMap[r] === -1).
            const span = Math.max(1, comp.doorSpan || 1);
            let spanEndIdx = r;
            for (let s = 1; s < span && r + s < allY.length - 1; s++) {
                if (compIndexMap[r + s] < 0) break; // hit split board zone — stop
                spanEndIdx = r + s;
            }
            // Extend by t on each side so the door covers the full board thickness (overlay door)
            const spanTopY    = allY[spanEndIdx + 1] + t;
            const spanBottomY = allY[r]              - t;
            const spanH = spanTopY - spanBottomY;
            if (spanH <= 0) continue; // skip degenerate door
            const spanMidY = spanBottomY + spanH / 2;
            const doorH = spanH - t;

            const doorMat = isGlass
                ? new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 })
                : (materials[wingData.materialExternal] || materials['white_matte']).clone
                    ? (materials[wingData.materialExternal] || materials['white_matte']).clone()
                    : (materials[wingData.materialExternal] || materials['white_matte']);

            // L-unit has two visible outer faces:
            //   Face A (outer wall of horizontal arm): at X = -sign*cw, spans Z from 0 to frontD
            //     → door sits just outside: X = -sign*(cw + t*0.45)
            //     → door depth (Z extent) = frontD - 2*t
            //   Face B (front wall of vertical arm):  at Z = cd, spans X from 0 to -sign*wingD
            //     → door sits just in front: Z = cd + t*0.45
            //     → door width (X extent) = wingD - 2*t

            // Door A: on the outer wall of the horizontal arm (side-facing door)
            const doorAD = frontD - 2 * t;  // Z-extent of door A
            if (doorAD > 1) {
                const doorAGeo = new THREE.BoxGeometry(t * 0.9, doorH, doorAD);
                const doorAMesh = new THREE.Mesh(doorAGeo, doorMat);
                doorAMesh.position.set(-sign * (cw + t * 0.45), spanMidY, t + doorAD / 2);
                doorAMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(doorAGeo), edgeM));
                fcGroup.add(doorAMesh);
            }

            // Door B: on the front wall of the vertical arm (front-facing door)
            const doorBW = wingD - 2 * t;  // X-extent of door B
            if (doorBW > 1) {
                const doorBMat = isGlass ? doorMat.clone() : (doorMat.clone ? doorMat.clone() : doorMat);
                const doorBGeo = new THREE.BoxGeometry(doorBW, doorH, t * 0.9);
                const doorBMesh = new THREE.Mesh(doorBGeo, doorBMat);
                doorBMesh.position.set(-sign * (t + doorBW / 2), spanMidY, cd + t * 0.45);
                doorBMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(doorBGeo), edgeM));
                fcGroup.add(doorBMesh);
            }
        }
    }

    cabinetGroup.add(fcGroup);
    window[`_fullCornerGroup_${side}`] = fcGroup;
}

// ==========================================
// Multi-view blueprint SVG generator
// ==========================================
window._generateMultiViewBlueprintSVG = function() {
    const pid = state.presetId;
    const centerWing = state.wings.center;
    const leftWing   = state.wings.left;
    const rightWing  = state.wings.right;

    // Use max(col.height) — the box top is at oy+dH - col.height*sc regardless of floorOffset
    const cH  = centerWing && centerWing.columns && centerWing.columns.length > 0
        ? Math.max(...centerWing.columns.map(c => c.height || state.globalHeight))
        : (centerWing ? (centerWing.globalHeight || state.globalHeight) : state.globalHeight);
    const cW  = centerWing ? (centerWing.width || state.width) : state.width;
    const cD  = centerWing ? (centerWing.depth || state.depth) : state.depth;
    const pH  = centerWing ? (centerWing.plinthHeight || state.plinthHeight) : state.plinthHeight;

    const hasRight = !!rightWing;
    const hasLeft  = !!leftWing;
    const rW   = hasRight ? (rightWing.width  || 160) : 0;
    const rD   = hasRight ? (rightWing.depth  || cD)  : 0;
    const rPos = hasRight ? (rightWing.wingPosition || 'side') : 'none';
    const lW   = hasLeft  ? (leftWing.width   || 160) : 0;
    const lD   = hasLeft  ? (leftWing.depth   || cD)  : 0;
    const lPos = hasLeft  ? (leftWing.wingPosition || 'side') : 'none';
    const fcSizeR = (hasRight && rPos === 'full_corner' && rightWing.fullCorner) ? (rightWing.fullCorner.size || 100) : 0;
    const fcSizeL = (hasLeft  && lPos === 'full_corner' && leftWing.fullCorner)  ? (leftWing.fullCorner.size || 100) : 0;

    // TOP VIEW coordinate system (cm → SVG pixels):
    // X axis = left-right (SVG x), Z axis = front-back (SVG y, Z=0=back wall=top, Z=max=front=bottom)
    // Center cabinet: X in [-cW/2 .. cW/2], Z in [0 .. cD]
    // 'side' wing is PERPENDICULAR to center wall:
    //   right 'side': depth rD extends RIGHT along X, width rW extends FORWARD along Z
    //     → rect at X=[cW/2 .. cW/2+rD], Z=[0 .. rW]
    //   left 'side':  depth lD extends LEFT along X, width lW extends FORWARD along Z
    //     → rect at X=[-cW/2-lD .. -cW/2], Z=[0 .. lW]
    // 'front' wing is PARALLEL (extends the front face):
    //   right 'front': X=[cW/2 .. cW/2+rW], Z=[0 .. cD]
    //   left 'front':  X=[-cW/2-lW .. -cW/2], Z=[0 .. cD]

    // ---- constants & helpers ----
    const STROKE = '#1e3a5f', STROKE_THIN = '#94a3b8';
    const FILL_CAB  = '#e8f0fe'; // center cabinet: light blue
    const FILL_WING_L = '#d1fae5'; // left wing: light green
    const FILL_WING_R = '#fce7f3'; // right wing: light pink
    const FILL_FC_L = '#fef3c7';  // left corner: light yellow
    const FILL_FC_R = '#ede9fe';  // right corner: light purple
    const FILL_WING = '#d1fae5';  // fallback (single wing)
    const FILL_FC   = '#fef3c7';  // fallback (single corner)
    const DIM_C = '#1e3a5f', ARROW = 5, FONT = 'Rubik,Tahoma,sans-serif';
    const MARGIN = 60, GAP = 18, LABEL_H = 26, PAD = 80;
    const SVG_W = 1200;
    const TOP_H = 220;   // floor-plan panel height (taller for L/U shapes)
    const WING_H = 400;  // per-wing front-view panel height (taller for cell dims above+below)
    // Helper: total drawing height = max(col.height) across all columns
    // The box top is at oy+dH - col.height*sc (since top = bottom_raised - visibleH = oy+dH - fo*sc - (h-fo)*sc = oy+dH - h*sc)
    const _wingSpan = (wd, fallback) => wd && wd.columns && wd.columns.length > 0
        ? Math.max(...wd.columns.map(c => c.height || fallback))
        : fallback;
    // Build ordered wing list: left → center → right
    const wingList = [];
    if (hasLeft)  wingList.push({ wd: leftWing,   label: 'כנף שמאל',   fill: FILL_WING_L, w: lW, h: _wingSpan(leftWing,  cH), d: lD });
    wingList.push(              { wd: centerWing,  label: 'ארון מרכזי', fill: FILL_CAB,    w: cW, h: _wingSpan(centerWing, cH), d: cD });
    if (hasRight) wingList.push({ wd: rightWing,   label: 'כנף ימין',   fill: FILL_WING_R, w: rW, h: _wingSpan(rightWing, cH), d: rD });
    const nW = wingList.length;
    const SVG_H = MARGIN + 22 + GAP + (TOP_H + LABEL_H) + GAP + nW * (WING_H + LABEL_H + GAP) + MARGIN;

    let p = [];
    p.push(`<defs>
      <marker id="ae" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="${ARROW-1}" refY="${ARROW/2}" orient="auto"><path d="M0,0 L0,${ARROW} L${ARROW},${ARROW/2} z" fill="${DIM_C}"/></marker>
      <marker id="as" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="1" refY="${ARROW/2}" orient="auto"><path d="M${ARROW},0 L${ARROW},${ARROW} L0,${ARROW/2} z" fill="${DIM_C}"/></marker>
    </defs>`);
    p.push(`<rect width="${SVG_W}" height="${SVG_H}" fill="white"/>`);
    const presetLabel = pid === 'walkin' ? 'חדר ארונות' : (pid.startsWith('corner')) ? 'ארון פינתי' : 'ארון';
    p.push(`<text x="${SVG_W/2}" y="26" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="bold" fill="${STROKE}">שרטוט טכני — ${presetLabel}</text>`);

    const rect = (x,y,w,h,fill,stroke,sw=1.5) => p.push(`<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
    const shelfLine = (x1,sy,x2) => p.push(`<line x1="${(+x1).toFixed(1)}" y1="${(+sy).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(+sy).toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="6,3"/>`);
    const vline = (x,y1,y2) => p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="0.8"/>`);
    const panelBox = (px,py,pw,ph,lbl) => {
        p.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph+LABEL_H}" rx="4" fill="white" stroke="${STROKE_THIN}" stroke-width="1"/>`);
        p.push(`<rect x="${px}" y="${py}" width="${pw}" height="${LABEL_H}" fill="#f1f5f9" stroke="${STROKE_THIN}" stroke-width="1"/>`);
        p.push(`<text x="${px+pw/2}" y="${py+LABEL_H/2+5}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="bold" fill="${STROKE}">${lbl}</text>`);
    };
    // dimH: horizontal dimension line. offset = pixels below/above the line
    const dimH = (x1,x2,y,lbl,above=true) => {
        const tk=7, lo=above?-8:14;
        p.push(`<line x1="${(+x1).toFixed(1)}" y1="${(y-tk/2).toFixed(1)}" x2="${(+x1).toFixed(1)}" y2="${(y+tk/2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(+x2).toFixed(1)}" y1="${(y-tk/2).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(y+tk/2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(+x1).toFixed(1)}" y1="${(+y).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(+y).toFixed(1)}" stroke="${DIM_C}" stroke-width="1" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const mx=(+x1+x2)/2;
        const lblW = Math.max(lbl.length * 7, 36);
        p.push(`<text x="${mx.toFixed(1)}" y="${(y+lo).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${DIM_C}">${lbl}</text>`);
    };
    // dimV: vertical dimension line — label placed to the RIGHT of the line
    // Use for lines on the LEFT side of cabinet (label goes right = toward cabinet)
    const dimV = (x,y1,y2,lbl) => {
        const tk=7;
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const my = (+y1+y2)/2;
        const tx = x + 14;
        p.push(`<text x="${tx.toFixed(1)}" y="${(my+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${DIM_C}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>`);
    };
    // dimVLeft: vertical dimension line — label placed to the LEFT of the line
    // Use for lines on the RIGHT side of cabinet (label goes left = toward cabinet)
    const dimVLeft = (x,y1,y2,lbl) => {
        const tk=7;
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1"/>`);
        p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const my = (+y1+y2)/2;
        const tx = x - 14;
        p.push(`<text x="${tx.toFixed(1)}" y="${(my+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${DIM_C}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>`);
    };

    // ---- PANEL 0: TOP VIEW (floor plan) — correct L/U geometry ----
    // 'side' wing is PERPENDICULAR: its depth (lD/rD) goes along X, its width (lW/rW) goes along Z
    {
        const py = MARGIN + 22 + GAP;
        const pw = SVG_W - MARGIN * 2;
        panelBox(MARGIN, py, pw, TOP_H, 'מבט עליון — תוכנית רצפה (Top View / Floor Plan)');
        const drawY = py + LABEL_H;

        // Compute world bounds in cm
        let minX = -cW/2, maxX = cW/2, minZ = 0, maxZ = cD;
        if (hasLeft) {
            if (lPos==='side')             { minX = Math.min(minX, -cW/2 - lD); maxZ = Math.max(maxZ, lW); }
            else if (lPos==='front')       { minX = Math.min(minX, -cW/2 - lW); }
            else if (lPos==='full_corner') { minX = Math.min(minX, -cW/2 - fcSizeL); maxZ = Math.max(maxZ, fcSizeL + lW); }
        }
        if (hasRight) {
            if (rPos==='side')             { maxX = Math.max(maxX, cW/2 + rD); maxZ = Math.max(maxZ, rW); }
            else if (rPos==='front')       { maxX = Math.max(maxX, cW/2 + rW); }
            else if (rPos==='full_corner') { maxX = Math.max(maxX, cW/2 + fcSizeR); maxZ = Math.max(maxZ, fcSizeR + rW); }
        }
        // Corner unit (שידה/שולחן פינתית) protrudes forward from front face
        const hasCU = state.corner && state.corner.side !== 'none';
        const cuW_fp = hasCU ? (state.corner.width || 60) : 0;
        const cuD_fp = hasCU ? (state.corner.depth || cD) : 0;
        if (hasCU) maxZ = Math.max(maxZ, cD + cuW_fp);
        // Side cabinet (ארון צד הפוך) — extends in X direction
        const scFP = state.wings.center ? state.wings.center.sideCabinet : null;
        const hasSCFP = scFP && scFP.side !== 'none';
        const scW_fp_R = hasSCFP ? (scFP.widthRight || scFP.width || 40) : 0;
        const scW_fp_L = hasSCFP ? (scFP.widthLeft  || scFP.width || 40) : 0;
        if (hasSCFP) {
            const scSideFP = scFP.side;
            if (scSideFP === 'right' || scSideFP === 'both') maxX = Math.max(maxX, cW/2 + scW_fp_R);
            if (scSideFP === 'left'  || scSideFP === 'both') minX = Math.min(minX, -cW/2 - scW_fp_L);
        }
        // Side desk (שולחן צד) — extends in X direction, depth = cD
        const deskFP = state.desk && state.desk.side !== 'none' ? state.desk : null;
        const hasDeskFP = !!deskFP;
        const deskFPW = hasDeskFP ? (deskFP.width || 100) : 0;
        if (hasDeskFP) {
            if (deskFP.side === 'right') maxX = Math.max(maxX, cW/2 + deskFPW);
            if (deskFP.side === 'left')  minX = Math.min(minX, -cW/2 - deskFPW);
        }
        const tW = maxX - minX, tD = maxZ - minZ;
        const sc = Math.min((pw - PAD*2) / Math.max(tW,1), (TOP_H - PAD*2) / Math.max(tD,1));
        const ox = MARGIN + (pw - tW*sc)/2 - minX*sc;
        const oz = drawY + PAD/2;
        const wx = xc => ox + xc*sc;
        const wz = zc => oz + zc*sc;

        // Draw center cabinet (back wall along top, front face at bottom)
        rect(wx(-cW/2), wz(0), cW*sc, cD*sc, FILL_CAB, STROKE, 2);
        // Label "חזית" on center front edge
        p.push(`<text x="${wx(0).toFixed(1)}" y="${(wz(cD)+11).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">חזית</text>`);

        // Draw wings with correct perpendicular geometry — use per-side colors
        if (hasLeft) {
            if (lPos==='side') {
                rect(wx(-cW/2 - lD), wz(0), lD*sc, lW*sc, FILL_WING_L, STROKE);
                p.push(`<text x="${wx(-cW/2 - lD/2).toFixed(1)}" y="${(wz(lW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(lD)}</text>`);
            } else if (lPos==='front') {
                rect(wx(-cW/2 - lW), wz(0), lW*sc, cD*sc, FILL_WING_L, STROKE);
            } else if (lPos==='full_corner') {
                const x1 = wx(-cW/2), y1 = wz(0);
                const x2 = wx(-cW/2 - fcSizeL), y2 = wz(0);
                const x3 = wx(-cW/2 - fcSizeL), y3 = wz(fcSizeL);
                const x4 = wx(-cW/2 - fcSizeL + lD), y4 = wz(fcSizeL);
                const x5 = wx(-cW/2 - fcSizeL + lD), y5 = wz(cD);
                const x6 = wx(-cW/2), y6 = wz(cD);
                p.push(`<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)} ${x5.toFixed(1)},${y5.toFixed(1)} ${x6.toFixed(1)},${y6.toFixed(1)}" fill="${FILL_FC_L}" stroke="${STROKE}" stroke-width="1.5"/>`);
                if (lW > 0) rect(wx(-cW/2 - fcSizeL), wz(fcSizeL), lD*sc, lW*sc, FILL_WING_L, STROKE);
            }
        }
        if (hasRight) {
            if (rPos==='side') {
                rect(wx(cW/2), wz(0), rD*sc, rW*sc, FILL_WING_R, STROKE);
                p.push(`<text x="${wx(cW/2 + rD/2).toFixed(1)}" y="${(wz(rW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(rD)}</text>`);
            } else if (rPos==='front') {
                rect(wx(cW/2), wz(0), rW*sc, cD*sc, FILL_WING_R, STROKE);
            } else if (rPos==='full_corner') {
                const x1 = wx(cW/2), y1 = wz(0);
                const x2 = wx(cW/2 + fcSizeR), y2 = wz(0);
                const x3 = wx(cW/2 + fcSizeR), y3 = wz(fcSizeR);
                const x4 = wx(cW/2 + fcSizeR - rD), y4 = wz(fcSizeR);
                const x5 = wx(cW/2 + fcSizeR - rD), y5 = wz(cD);
                const x6 = wx(cW/2), y6 = wz(cD);
                p.push(`<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)} ${x5.toFixed(1)},${y5.toFixed(1)} ${x6.toFixed(1)},${y6.toFixed(1)}" fill="${FILL_FC_R}" stroke="${STROKE}" stroke-width="1.5"/>`);
                if (rW > 0) rect(wx(cW/2 + fcSizeR - rD), wz(fcSizeR), rD*sc, rW*sc, FILL_WING_R, STROKE);
            }
        }

        // Corner unit (שידה/שולחן פינתית) — protrudes forward from front face
        if (hasCU) {
            const cuSide = state.corner.side; // 'right' or 'left'
            const cuX1 = cuSide === 'right' ? cW/2 - cuD_fp : -cW/2;
            const cuX2 = cuSide === 'right' ? cW/2 : -cW/2 + cuD_fp;
            const FILL_CU = '#fef9c3'; // light yellow for corner unit
            rect(wx(cuX1), wz(cD), (cuX2 - cuX1)*sc, cuW_fp*sc, FILL_CU, STROKE, 1.5);
            // Label
            const cuLabel = state.corner.type === 'desk' ? 'שולחן פינתי' : 'שידה פינתית';
            p.push(`<text x="${wx((cuX1+cuX2)/2).toFixed(1)}" y="${(wz(cD + cuW_fp/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.8">${cuLabel}</text>`);
            // Dimensions: width (horizontal, below the unit) and depth (vertical, on the outer side)
            dimH(wx(cuX1), wx(cuX2), wz(cD + cuW_fp) + 14, `${Math.round(cuD_fp)}`);
            if (cuSide === 'right') {
                dimV(wx(cuX2) + 14, wz(cD), wz(cD + cuW_fp), `${Math.round(cuW_fp)}`);
            } else {
                dimVLeft(wx(cuX1) - 14, wz(cD), wz(cD + cuW_fp), `${Math.round(cuW_fp)}`);
            }
        }

        // Side cabinet (ארון צד הפוך) — rectangle flush against main cabinet side
        if (hasSCFP) {
            const FILL_SC = '#e0f2fe'; // light blue for side cabinet
            const scSideFP2 = scFP.side;
            const _drawSCFP = (onRight) => {
                const scW_this = onRight ? scW_fp_R : scW_fp_L;
                const scX1 = onRight ? cW/2 : -cW/2 - scW_this;
                const scX2 = onRight ? cW/2 + scW_this : -cW/2;
                rect(wx(scX1), wz(0), scW_this*sc, cD*sc, FILL_SC, STROKE, 1.5);
                p.push(`<text x="${wx((scX1+scX2)/2).toFixed(1)}" y="${(wz(cD/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.8">ארון צד</text>`);
                dimH(wx(scX1), wx(scX2), wz(cD) + 14, `${Math.round(scW_this)}`);
            };
            if (scSideFP2 === 'right' || scSideFP2 === 'both') _drawSCFP(true);
            if (scSideFP2 === 'left'  || scSideFP2 === 'both') _drawSCFP(false);
        }

        // Side desk (שולחן צד) — top view: rectangle on the side of the cabinet
        if (hasDeskFP) {
            const FILL_DESK_FP = '#fed7aa'; // light orange for side desk
            const deskOnRight = deskFP.side === 'right';
            const deskX1 = deskOnRight ? cW/2 : -cW/2 - deskFPW;
            const deskX2 = deskOnRight ? cW/2 + deskFPW : -cW/2;
            rect(wx(deskX1), wz(0), deskFPW*sc, cD*sc, FILL_DESK_FP, STROKE, 1.5);
            p.push(`<text x="${wx((deskX1+deskX2)/2).toFixed(1)}" y="${(wz(cD/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.85">שולחן צד</text>`);
            dimH(wx(deskX1), wx(deskX2), wz(cD) + 24, `${Math.round(deskFPW)}`);
        }

        // Dimension lines
        // Total width at TOP — above all other horizontal dims (above 100/311 lines)
        const dimRowTop = wz(0) - 28; // above cabinet top edge, above the sub-dims at wz(0)-14
        dimH(wx(minX), wx(maxX), dimRowTop, `${Math.round(tW)}`);
        // Center cabinet width: just above the cabinet top edge (not at bottom)
        if (hasLeft || hasRight) dimH(wx(-cW/2), wx(cW/2), wz(0) - 14, `${Math.round(cW)}`);

        const hasRightFC = hasRight && rPos === 'full_corner';
        const hasLeftFC  = hasLeft  && lPos === 'full_corner';

        // Total depth lines:
        // - If BOTH corners: show left total depth on LEFT, right total depth on RIGHT
        // - If only left corner: show total depth on RIGHT side
        // - If only right corner (or no corner): show total depth on LEFT side
        if (hasLeftFC && hasRightFC) {
            // U-shape / walk-in: left depth on LEFT, right depth on RIGHT
            const leftTotalD = fcSizeL + lW;
            const rightTotalD = fcSizeR + rW;
            dimVLeft(wx(minX) - 54, wz(0), wz(leftTotalD), `${Math.round(leftTotalD)}`);
            dimV(wx(maxX) + 74, wz(0), wz(rightTotalD), `${Math.round(rightTotalD)}`);
        } else if (hasLeftFC && !hasRightFC) {
            // Left corner only: total depth on RIGHT side
            dimV(wx(maxX) + 74, wz(minZ), wz(maxZ), `${Math.round(tD)}`);
        } else {
            // Right corner or no corner: total depth on LEFT side
            dimVLeft(wx(minX) - 54, wz(minZ), wz(maxZ), `${Math.round(tD)}`);
        }

        // Center cabinet depth — only show if center is shorter than total depth
        if (cD < tD && !(hasLeftFC && hasRightFC)) {
            if (hasRightFC) {
                dimVLeft(wx(-cW/2) - 14, wz(0), wz(cD), `${Math.round(cD)}`);
            } else {
                dimVLeft(wx(cW/2) + 34, wz(0), wz(cD), `${Math.round(cD)}`);
            }
        }

        // Right wing depth (side position) — label on LEFT side of the right wing
        if (hasRight && rPos === 'side') dimVLeft(wx(cW/2) - 14, wz(0), wz(rW), `${Math.round(rW)}`);
        // Left wing depth (side position)
        if (hasLeft && lPos === 'side') dimVLeft(wx(-cW/2 - lD) - 14, wz(0), wz(lW), `${Math.round(lW)}`);

        // full_corner dims
        if (hasRightFC) {
            dimH(wx(cW/2), wx(cW/2 + fcSizeR), wz(0) - 14, `${Math.round(fcSizeR)}`);
            // Corner depth + wing width on RIGHT side, label right — use +54 to match total depth line spacing
            dimV(wx(cW/2 + fcSizeR) + 54, wz(0), wz(fcSizeR), `${Math.round(fcSizeR)}`);
            if (rW > 0) dimV(wx(cW/2 + fcSizeR) + 54, wz(fcSizeR), wz(fcSizeR + rW), `${Math.round(rW)}`);
            if (rW > 0) dimH(wx(cW/2 + fcSizeR - rD), wx(cW/2 + fcSizeR), wz(fcSizeR + rW) + 28, `${Math.round(rD)}`);
        }
        if (hasLeftFC) {
            dimH(wx(-cW/2 - fcSizeL), wx(-cW/2), wz(0) - 14, `${Math.round(fcSizeL)}`);
            // Corner depth + wing width on LEFT side, label left
            dimVLeft(wx(-cW/2 - fcSizeL) - 14, wz(0), wz(fcSizeL), `${Math.round(fcSizeL)}`);
            if (lW > 0) dimVLeft(wx(-cW/2 - fcSizeL) - 14, wz(fcSizeL), wz(fcSizeL + lW), `${Math.round(lW)}`);
            if (lW > 0) dimH(wx(-cW/2 - fcSizeL), wx(-cW/2 - fcSizeL + lD), wz(fcSizeL + lW) + 28, `${Math.round(lD)}`);
        }
    }

    // ---- PANELS 1..N: Per-wing front views with hangers & drawers ----
    wingList.forEach((wg, wi) => {
        const py = MARGIN + 22 + GAP + (TOP_H + LABEL_H) + GAP + wi * (WING_H + LABEL_H + GAP);
        const pw = SVG_W - MARGIN * 2;
        panelBox(MARGIN, py, pw, WING_H, `שרטוט חזית — ${wg.label} | רוחב: ${Math.round(wg.w)} | גובה: ${Math.round(wg.h)} | עומק: ${Math.round(wg.d)}`);
        const drawY = py + LABEL_H;
        const sc = Math.min((pw - PAD*2) / Math.max(wg.w,1), (WING_H - PAD*2) / Math.max(wg.h,1));
        const dW = wg.w * sc, dH = wg.h * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawY + (WING_H - dH) / 2;

        // Columns, shelves, hangers & drawers
        const cols = (wg.wd && wg.wd.columns) ? wg.wd.columns : (state.columns || []);

        // Cabinet body — draw per-column rects at actual heights, respecting floorOffset
        // floorOffset = how much is cut from the BOTTOM of the column
        // visibleH = col.height - col.floorOffset; box is raised by floorOffset from floor
        {
            let _cx = ox;
            cols.forEach((col, ci) => {
                const isLastCol = (ci === cols.length - 1);
                const _cw = isLastCol ? (ox + dW - _cx) : (col.width || wg.w) * sc;
                const _fo = col.floorOffset || 0;
                const _visibleH = (col.height || wg.h) - _fo;
                const _colSvgH = _visibleH * sc;
                // box is raised by floorOffset: bottom = oy+dH - fo*sc, top = bottom - visibleH*sc
                const _colBotY = oy + dH - _fo * sc;
                const _colTopY = _colBotY - _colSvgH;
                rect(_cx, _colTopY, _cw, _colSvgH, wg.fill, STROKE, 2);
                _cx += _cw;
            });
        }
        // Plinth — draw per-column segment only for columns that sit on the floor (floorOffset === 0)
        // Desk columns (col.type === 'desk') are open below — no plinth
        if (pH > 0) {
            let _px = ox;
            cols.forEach((col, ci) => {
                const isLastCol = (ci === cols.length - 1);
                const _pw = isLastCol ? (ox + dW - _px) : (col.width || wg.w) * sc;
                if (!(col.floorOffset > 0) && !col.noPlinth && col.type !== 'desk') {
                    rect(_px, oy + dH - pH*sc, _pw, pH*sc, '#cbd5e1', STROKE, 1);
                }
                _px += _pw;
            });
        }

        // Side desk (שולחן צד) — only for center wing
        if (wg.wd === centerWing && state.desk && state.desk.side !== 'none') {
            const dSide  = state.desk.side;
            const dWidth = state.desk.width;
            const dHeight = state.desk.height;
            const drawerH = state.desk.drawerHeight || 12;
            const dSvgW  = dWidth  * sc;
            const dSvgH  = dHeight * sc;
            const legT   = 1.8 * sc; // board thickness in SVG pixels
            // Desk sits to the left or right of the cabinet body
            const deskX  = dSide === 'left' ? (ox - dSvgW) : (ox + dW);
            const deskBotY = oy + dH; // floor level
            const deskTopY = deskBotY - dSvgH;
            // Outer leg (vertical board)
            const legX = dSide === 'left' ? deskX : (deskX + dSvgW - legT);
            rect(legX, deskTopY, legT, dSvgH, wg.fill, STROKE, 1.5);
            // Desk surface (horizontal board at top)
            rect(deskX, deskTopY, dSvgW, legT, wg.fill, STROKE, 1.5);
            // Drawers (if any) — sit just below the desk surface, inside the leg
            if (state.desk.hasDrawers) {
                const numDrawers = dWidth <= 80 ? 1 : 2;
                const innerSvgW = dSvgW - legT; // width between cabinet wall and leg
                const drawerSvgW = innerSvgW / numDrawers;
                const drawerSvgH = drawerH * sc;
                const drawerSvgY = deskTopY + legT; // just below desk surface
                const drawerStartX = dSide === 'left' ? deskX : (deskX + legT);
                for (let di = 0; di < numDrawers; di++) {
                    const dx = drawerStartX + di * drawerSvgW;
                    rect(dx + 1, drawerSvgY + 1, drawerSvgW - 2, drawerSvgH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN, 0.8);
                    // Handle line
                    const hndW = Math.min(drawerSvgW * 0.4, 20);
                    const hndX = dx + (drawerSvgW - hndW) / 2;
                    const hndY = drawerSvgY + drawerSvgH * 0.5;
                    p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                }
                // Dimension: drawer height (inner side of desk)
                const dimInnerX = dSide === 'left' ? (deskX + dSvgW + 14) : (deskX - 14);
                const drawerSvgY0 = deskTopY + legT;
                if (dSide === 'left') {
                    dimV(dimInnerX, drawerSvgY0, drawerSvgY0 + drawerH * sc, `${Math.round(drawerH)}`);
                    // Dimension: floor to drawer bottom (gap below drawer)
                    dimV(dimInnerX + 36, drawerSvgY0 + drawerH * sc, deskBotY, `${Math.round(dHeight - 1.8 - drawerH)}`);
                } else {
                    dimVLeft(dimInnerX, drawerSvgY0, drawerSvgY0 + drawerH * sc, `${Math.round(drawerH)}`);
                    // Dimension: floor to drawer bottom (gap below drawer)
                    dimVLeft(dimInnerX - 36, drawerSvgY0 + drawerH * sc, deskBotY, `${Math.round(dHeight - 1.8 - drawerH)}`);
                }
            }
            // Dimension: desk width (below)
            dimH(deskX, deskX + dSvgW, oy + dH + 22, `${Math.round(dWidth)}`);
            // Dimension: desk height (to the outer side)
            if (dSide === 'left') {
                dimVLeft(deskX - 14, deskTopY, deskBotY, `${Math.round(dHeight)}`);
            } else {
                dimV(deskX + dSvgW + 14, deskTopY, deskBotY, `${Math.round(dHeight)}`);
            }
        }

        // Track column X positions for per-column width dims
        const colXPositions = []; // [{x1, x2, wCm, colTopY, colBotY}]
        let colX = ox;
        cols.forEach((col, ci) => {
            const isLastCol = (ci === cols.length - 1);
            const colW = isLastCol ? (ox + dW - colX) : (col.width || wg.w) * sc;
            // Desk columns are open below (no plinth) — treat colPlinthH as 0
            const colPlinthH = (col.noPlinth || col.type === 'desk') ? 0 : pH;
            const _fo = col.floorOffset || 0;
            const _colActualH = col.height || wg.h;
            const _visibleH = _colActualH - _fo; // visible height after bottom cut
            // box is raised by floorOffset: bottom = oy+dH - fo*sc, top = bottom - visibleH*sc
            const _colBotY = oy + dH - _fo * sc;
            const _colTopY = _colBotY - _visibleH * sc;
            colXPositions.push({ x1: colX, x2: colX + colW, wCm: Math.round(col.width || wg.w), colTopY: _colTopY, colBotY: _colBotY });

            // Column divider line (not first) — spans from the higher top to the lower bottom of adjacent columns
            if (ci > 0) {
                const prevCol = cols[ci - 1];
                const prevFO  = prevCol ? (prevCol.floorOffset || 0) : 0;
                const prevH   = (prevCol && prevCol.height) ? prevCol.height : wg.h;
                const prevVisibleH = prevH - prevFO;
                const prevBotY = oy + dH - prevFO * sc;
                const prevTopY = prevBotY - prevVisibleH * sc;
                const sepTopY = Math.min(_colTopY, prevTopY);
                const sepBotY = Math.max(_colBotY, prevBotY);
                vline(colX, sepTopY, sepBotY);
            }

            // Shelves — only within visible height, measured from column bottom upward
            (col.shelvesY || []).forEach(sy => {
                // shelf positions are stored from original bottom; adjust by floorOffset
                const syAdjusted = sy - _fo;
                if (syAdjusted > 0 && syAdjusted < _visibleH) shelfLine(colX, _colBotY - syAdjusted*sc, colX + colW);
            });

            // Internal desk column rendering
            if (col.type === 'desk') {
                const deskH   = col.deskHeight   || 80;
                const deskClr = col.deskClearance || 80;
                const t       = 1.8; // board thickness in cm (visual only)
                // Open area below desk surface: white fill (no cabinet color)
                const openTop = _colBotY - deskH * sc;  // deskH from column bottom upward
                const openBot = _colBotY - colPlinthH * sc;
                rect(colX, openTop, colW, openBot - openTop, 'white', STROKE_THIN, 0.5);
                // Desk surface line
                p.push(`<line x1="${colX.toFixed(1)}" y1="${openTop.toFixed(1)}" x2="${(colX+colW).toFixed(1)}" y2="${openTop.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                // Drawers below desk surface
                if (col.hasDrawers) {
                    const drawerH = col.drawerHeight || 12;
                    const numDrawers = (col.width || wg.w) <= 80 ? 1 : 2;
                    const drawerW = colW / numDrawers;
                    const drawerPxH = drawerH * sc;
                    const drawerY = openTop + 2; // just below desk surface
                    for (let di = 0; di < numDrawers; di++) {
                        const dx = colX + di * drawerW;
                        rect(dx + 2, drawerY, drawerW - 4, drawerPxH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN, 0.8);
                        const hndW = Math.min(drawerW * 0.4, 20);
                        const hndX = dx + (drawerW - hndW) / 2;
                        const hndY = drawerY + drawerPxH * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                    // Dimension: drawer height (right side of column)
                    dimV(colX + colW + 14, drawerY, drawerY + drawerPxH, `${Math.round(drawerH)}`);
                    // Dimension: floor to drawer bottom (gap from floor to bottom of drawer)
                    dimV(colX + colW + 50, drawerY + drawerPxH, _colBotY, `${Math.round(deskH - 1.8 - drawerH)}`);
                }
                // Clearance board (shelf above clearance zone) — measured from column bottom
                const clrBoardY = _colBotY - (deskH + deskClr) * sc;
                p.push(`<line x1="${colX.toFixed(1)}" y1="${clrBoardY.toFixed(1)}" x2="${(colX+colW).toFixed(1)}" y2="${clrBoardY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.2"/>`);
                // Label "שולחן" inside the open area
                const lblY = openTop + (openBot - openTop) / 2 + 4;
                p.push(`<text x="${(colX+colW/2).toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.5">שולחן</text>`);
            }

            // Draw cell contents (hangers & drawers) per row
            // shelf positions are stored from original bottom; adjust by floorOffset
            const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
            const adjShelvesArr = shelvesArr.map(sy => sy - _fo).filter(sy => sy > 0 && sy < _visibleH);
            const deskBase = (col.type === 'desk') ? (col.deskHeight || 80) + (col.deskClearance || 80) : colPlinthH;
            const rowBounds = [deskBase, ...adjShelvesArr.filter(sy => sy > deskBase), _visibleH];
            const numRows = rowBounds.length - 1;
            for (let ri = 0; ri < numRows; ri++) {
                const rowBotCm = rowBounds[ri];
                const rowTopCm = rowBounds[ri + 1];
                const cellHeightCm = Math.round(rowTopCm - rowBotCm);
                const cellY1 = _colBotY - rowTopCm * sc; // SVG top of cell
                const cellY2 = _colBotY - rowBotCm * sc; // SVG bottom of cell
                const cellH = cellY2 - cellY1;
                const cellCX = colX + colW / 2;

                // Get cell type from compartments array
                const comp = col.compartments ? col.compartments[ri] : null;
                const cellType = comp ? (comp.type || 'empty') : 'empty';

                if (cellType === 'hanging') {
                    // Hanger symbol: horizontal hanging rod near top of cell
                    const rodY   = cellY1 + cellH * 0.25;
                    const hRodX1 = colX + 4;
                    const hRodX2 = colX + colW - 4;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                } else if (cellType === 'sorbet') {
                    // סורבטו — מנגנון תלייה מתרומם (ממורכז אנכית בתא)
                    // בלוקי דיור בתחתית, מוטות אנכיים עולים, מוט אופקי בראש, ידית יורדת מהמוט
                    const mechH  = cellH * 0.5;
                    const mechY1 = cellY1 + (cellH - mechH) / 2;
                    const mechY2 = mechY1 + mechH;
                    const boxH   = Math.min(mechH * 0.2, 8);
                    const boxW   = Math.min(colW * 0.1, 7);
                    const boxY   = mechY2 - boxH;                 // בלוקי דיור בתחתית המנגנון
                    const boxLX  = colX + 4;
                    const boxRX  = colX + colW - 4 - boxW;
                    // בלוקי דיור בתחתית
                    p.push(`<rect x="${boxLX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    p.push(`<rect x="${boxRX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    // מוט אופקי בראש המנגנון
                    const hRodY  = mechY1;
                    const hRodX1 = boxLX + boxW / 2;
                    const hRodX2 = boxRX + boxW / 2;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${hRodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    // שני מוטות אנכיים — מהמוט האופקי לבלוקים
                    p.push(`<line x1="${(boxLX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxLX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    p.push(`<line x1="${(boxRX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxRX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    // ידית משיכה — יורדת מהמוט האופקי כלפי מטה (ידית ארוכה)
                    const handleW  = Math.min(colW * 0.07, 5);
                    const handleH  = mechH * 0.6;
                    const handleX  = (hRodX1 + hRodX2) / 2 - handleW / 2;
                    p.push(`<rect x="${handleX.toFixed(1)}" y="${hRodY.toFixed(1)}" width="${handleW.toFixed(1)}" height="${handleH.toFixed(1)}" fill="${STROKE}" rx="1" opacity="0.75"/>`);
                    // תווית
                    if (cellH > 25) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">סורבטו</text>`);
                } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                    const drawerCount = comp.count || 2;
                    const dh = cellH / drawerCount;
                    for (let di = 0; di < drawerCount; di++) {
                        const dy = cellY1 + di * dh;
                        rect(colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                        const hndW = Math.min(colW * 0.35, 22);
                        const hndX = colX + (colW - hndW) / 2;
                        const hndY = dy + dh * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                } else if (cellType === 'open_cell') {
                    // כוורת — inner rectangle (frame inside the cell)
                    const pad = 5;
                    const fx = colX + pad, fy = cellY1 + pad, fw = colW - pad*2, fh = cellH - pad*2;
                    if (fw > 2 && fh > 2) p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                    // Label at top of cell to avoid overlapping height number
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                } else if (cellType === 'side_open_cell') {
                    // כוורת צד — inner frame open on one side (3-sided C-shape)
                    // openDir is NOT stored on comp — compute it from column position (same logic as 3D engine)
                    const pad = 5;
                    const _opensLeft = ci === 0;
                    const _opensRight = ci === cols.length - 1;
                    let openDir;
                    if (_opensLeft && _opensRight) openDir = (ci < cols.length / 2) ? 'left' : 'right';
                    else if (_opensLeft) openDir = 'left';
                    else if (_opensRight) openDir = 'right';
                    else openDir = 'left'; // fallback: center column, open left
                    const fx = colX + pad, fy = cellY1 + pad, fw = colW - pad*2, fh = cellH - pad*2;
                    if (fw > 2 && fh > 2) {
                        if (openDir === 'left') {
                            // Left side open: top-left → top-right → bottom-right → bottom-left (gap = left wall)
                            p.push(`<polyline points="${fx.toFixed(1)},${fy.toFixed(1)} ${(fx+fw).toFixed(1)},${fy.toFixed(1)} ${(fx+fw).toFixed(1)},${(fy+fh).toFixed(1)} ${fx.toFixed(1)},${(fy+fh).toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                        } else {
                            // Right side open: top-right → top-left → bottom-left → bottom-right (gap = right wall)
                            p.push(`<polyline points="${(fx+fw).toFixed(1)},${fy.toFixed(1)} ${fx.toFixed(1)},${fy.toFixed(1)} ${fx.toFixed(1)},${(fy+fh).toFixed(1)} ${(fx+fw).toFixed(1)},${(fy+fh).toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                        }
                    }
                    // Label at top of cell to avoid overlapping height number
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת צד</text>`);
                }

                // Partition (מחיצה) — dashed vertical line + sub-cell width dims + sub-cell shelves
                if (comp && comp.partition) {
                    const px = comp.partitionX || 0.5;
                    const partSvgX = colX + colW * px;
                    p.push(`<line x1="${partSvgX.toFixed(1)}" y1="${cellY1.toFixed(1)}" x2="${partSvgX.toFixed(1)}" y2="${cellY2.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5" stroke-dasharray="5,3"/>`);
                    // Width dims for each sub-cell — subtract half partition thickness from each side
                    const dimRowY = cellY1 + 22;
                    const partT = state.thickness || 1.8; // partition board thickness
                    const colWcm = col.width || wg.w;
                    const leftWcm  = Math.round(colWcm * px - partT / 2);
                    const rightWcm = Math.round(colWcm * (1 - px) - partT / 2);
                    // Left sub-cell dim (from colX to partSvgX)
                    if (partSvgX - colX > 20) dimH(colX, partSvgX, dimRowY, `${leftWcm}`);
                    // Right sub-cell dim (from partSvgX to colX+colW)
                    if (colX + colW - partSvgX > 20) dimH(partSvgX, colX + colW, dimRowY, `${rightWcm}`);
                    // Sub-cell shelves
                    if (comp.subCells) {
                        const cellHcm = rowTopCm - rowBotCm;
                        // idx 0 = left sub-cell (colX → partSvgX), idx 1 = right sub-cell (partSvgX → colX+colW)
                        [[colX, partSvgX, 0], [partSvgX, colX + colW, 1]].forEach(([x1, x2, idx]) => {
                            const sub = comp.subCells[idx];
                            const numShelves = (sub && sub.shelves) || 0;
                            if (numShelves > 0) {
                                const zoneHcm = cellHcm / (numShelves + 1);
                                for (let s = 1; s <= numShelves; s++) {
                                    const shelfYcm = rowBotCm + zoneHcm * s;
                                    const shelfSvgY = _colBotY - shelfYcm * sc; // measured from column bottom
                                    p.push(`<line x1="${x1.toFixed(1)}" y1="${shelfSvgY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${shelfSvgY.toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="6,3"/>`);
                                }
                            }
                        });
                    }
                }

                // Per-cell height: small text label INSIDE the cell (centered)
                if (cellHeightCm > 0 && cellH > 14) {
                    const lblCX = colX + colW / 2;
                    const lblCY = (cellY1 + cellY2) / 2 + 4;
                    p.push(`<text x="${lblCX.toFixed(1)}" y="${lblCY.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${DIM_C}" opacity="0.75">${cellHeightCm}</text>`);
                }
            }
            colX += colW;
        });

        // ---- Side-open-cell wall gap overlay ----
        {
            const _wallOverlayOld = (colIdx, isLeft) => {
                const col = cols[colIdx];
                if (!col) return;
                const colPlinthH = col.noPlinth ? 0 : pH;
                const _fo = col.floorOffset || 0;
                const _colActualH = col.height || wg.h;
                const _visibleH = _colActualH - _fo;
                // box is raised by floorOffset
                const _colBotSvgY = oy + dH - _fo * sc;
                const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
                // adjust shelf positions by floorOffset
                const adjShelves = shelvesArr.map(sy => sy - _fo).filter(sy => sy > 0 && sy < _visibleH);
                const rowBounds = [colPlinthH, ...adjShelves.filter(sy => sy > colPlinthH), _visibleH];
                for (let ri = 0; ri < rowBounds.length - 1; ri++) {
                    const comp = col.compartments ? col.compartments[ri] : null;
                    if (!comp || comp.type !== 'side_open_cell') continue;
                    const cellY1 = _colBotSvgY - rowBounds[ri + 1] * sc;
                    const cellY2 = _colBotSvgY - rowBounds[ri] * sc;
                    const wallX = isLeft ? ox : ox + dW;
                    const overlayW = 4;
                    p.push(`<rect x="${(wallX - overlayW/2).toFixed(1)}" y="${cellY1.toFixed(1)}" width="${overlayW}" height="${(cellY2 - cellY1).toFixed(1)}" fill="${wg.fill}" stroke="none"/>`);
                }
            };
            _wallOverlayOld(0, true);
            _wallOverlayOld(cols.length - 1, false);
        }

        // Overall dimensions
        const dimY = oy + dH + 20;
        // Total width (below cabinet)
        dimH(ox, ox + dW, dimY, `${Math.round(wg.w)}`);
        // Per-column width dims (above each column, at its actual top)
        if (colXPositions.length > 1) {
            colXPositions.forEach((cp, ci) => {
                dimH(cp.x1, cp.x2, cp.colTopY - 14, `${cp.wCm}`);
            });
        }
        // Total height (left side) — from floor (oy+dH) to highest column top
        // box is raised by floorOffset; top = oy+dH - fo*sc - visibleH*sc = oy+dH - (fo + visibleH)*sc = oy+dH - height*sc
        const _wgMaxTopY = cols.length > 0 ? Math.min(...cols.map(c => oy + dH - (c.height || wg.h) * sc)) : oy;
        const _wgTotalHcm = cols.length > 0 ? Math.round(Math.max(...cols.map(c => (c.height || wg.h)))) : Math.round(wg.h);
        dimV(ox - 54, _wgMaxTopY, oy + dH, `${_wgTotalHcm}`);
        // Plinth height (right side, to avoid overlap with total height)
        if (pH > 0) {
            const plinthDimX = ox + dW + 18;
            dimV(plinthDimX, oy + dH - pH*sc, oy + dH, `${Math.round(pH)}`);
        }
        // floorOffset dimension: for each floating column, show the gap from floor to column bottom
        {
            let _foDimX = ox + dW + 38;
            colXPositions.forEach((cp, ci) => {
                const _col = cols[ci];
                const _fo = (_col && _col.floorOffset) ? _col.floorOffset : 0;
                if (_fo > 0) {
                    // gap from floor (oy+dH) to column bottom (cp.colBotY)
                    dimV(_foDimX, cp.colBotY, oy + dH, `${Math.round(_fo)}`);
                    _foDimX += 36;
                }
            });
        }

        // ---- Closure panels overlay (only for center wing, when wall-snap is active) ----
        if (wg.wd === centerWing) {
            const _preset1 = state.presetId || 'linear';
            const _isLS1 = (_preset1 === 'linear' || _preset1 === 'sliding');
            const _rw1 = _isLS1 ? (window._roomWall || state.roomWall || 'center') : 'center';
            const _closureOn1 = (window._closureEnabled !== false);
            if (_rw1 !== 'center' && _isLS1 && _closureOn1) {
                const _cW1  = Math.max(1.8, parseFloat(window._closureWidth)      || 1.8);
                const _cCW1 = Math.max(1.8, parseFloat(window._closureCeilWidth)  || 1.8);
                const FILL_CL = '#d4c5b0', STROKE_CL = '#8b7355';

                // Side panel: sits to the left (or right) of the cabinet body
                const _sideSvgW1 = _cW1 * sc;
                const _sideSvgH1 = wg.h * sc;
                const _sideX1 = (_rw1 === 'left') ? (ox - _sideSvgW1) : (ox + dW);
                rect(_sideX1, oy, _sideSvgW1, _sideSvgH1, FILL_CL, STROKE_CL, 1.5);

                // Ceiling panel: spans from side panel outer edge to cabinet free-side edge
                const _ceilSvgH1 = _cCW1 * sc;
                const _ceilTotalSvgW1 = _sideSvgW1 + dW;
                const _ceilX1 = (_rw1 === 'left') ? (ox - _sideSvgW1) : ox;
                rect(_ceilX1, oy - _ceilSvgH1, _ceilTotalSvgW1, _ceilSvgH1, FILL_CL, STROKE_CL, 1.5);

                // Dimension: side closure width
                if (_rw1 === 'left') {
                    dimH(_sideX1, ox, oy + dH + 20, `${Math.round(_cW1)}`);
                } else {
                    dimH(ox + dW, _sideX1 + _sideSvgW1, oy + dH + 20, `${Math.round(_cW1)}`);
                }
                // Dimension: ceiling closure height
                dimV(_ceilX1 - 18, oy - _ceilSvgH1, oy, `${Math.round(_cCW1)}`);
            }
        }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${SVG_W} ${SVG_H}" style="display:block;max-width:100%;">${p.join('')}</svg>`;
};

// ==========================================
// _generateMultiViewBlueprintPages
// Returns array of { label, svg } — one per view (Top View + each wing front view)
// Each SVG is full-size (SVG_W × PAGE_H) showing only that one view.
// ==========================================
window._generateMultiViewBlueprintPages = function() {
    const pid = state.presetId;
    const centerWing = state.wings.center;
    const leftWing   = state.wings.left;
    const rightWing  = state.wings.right;

    // Use max(col.height) — the box top is at oy+dH - col.height*sc regardless of floorOffset
    const cH  = centerWing && centerWing.columns && centerWing.columns.length > 0
        ? Math.max(...centerWing.columns.map(c => c.height || state.globalHeight))
        : (centerWing ? (centerWing.globalHeight || state.globalHeight) : state.globalHeight);
    const cW  = centerWing ? (centerWing.width || state.width) : state.width;
    const cD  = centerWing ? (centerWing.depth || state.depth) : state.depth;
    const pH  = centerWing ? (centerWing.plinthHeight || state.plinthHeight) : state.plinthHeight;

    const hasRight = !!rightWing;
    const hasLeft  = !!leftWing;
    const rW   = hasRight ? (rightWing.width  || 160) : 0;
    const rD   = hasRight ? (rightWing.depth  || cD)  : 0;
    const rPos = hasRight ? (rightWing.wingPosition || 'side') : 'none';
    const lW   = hasLeft  ? (leftWing.width   || 160) : 0;
    const lD   = hasLeft  ? (leftWing.depth   || cD)  : 0;
    const lPos = hasLeft  ? (leftWing.wingPosition || 'side') : 'none';
    const fcSizeR = (hasRight && rPos === 'full_corner' && rightWing.fullCorner) ? (rightWing.fullCorner.size || 100) : 0;
    const fcSizeL = (hasLeft  && lPos === 'full_corner' && leftWing.fullCorner)  ? (leftWing.fullCorner.size || 100) : 0;

    const STROKE = '#1e3a5f', STROKE_THIN = '#94a3b8';
    const FILL_CAB    = '#e8f0fe'; // center: light blue
    const FILL_WING_L = '#d1fae5'; // left wing: light green
    const FILL_WING_R = '#fce7f3'; // right wing: light pink
    const FILL_FC_L   = '#fef3c7'; // left corner: light yellow
    const FILL_FC_R   = '#ede9fe'; // right corner: light purple
    const FILL_WING   = '#d1fae5'; // fallback
    const FILL_FC     = '#fef3c7'; // fallback
    const DIM_C = '#1e3a5f', ARROW = 5, FONT = 'Rubik,Tahoma,sans-serif';
    const MARGIN = 60, PAD = 80, LABEL_H = 30;
    const SVG_W = 1200;
    const PAGE_H = 800;  // height of each page SVG
    const presetLabel = pid === 'walkin' ? 'חדר ארונות' : (pid.startsWith('corner')) ? 'ארון פינתי' : pid === 'sliding' ? 'ארון הזזה' : 'ארון';

    // Shared SVG helpers — operate on a local array `p`
    const makeDefs = (p) => {
        p.push(`<defs>
          <marker id="ae" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="${ARROW-1}" refY="${ARROW/2}" orient="auto"><path d="M0,0 L0,${ARROW} L${ARROW},${ARROW/2} z" fill="${DIM_C}"/></marker>
          <marker id="as" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="1" refY="${ARROW/2}" orient="auto"><path d="M${ARROW},0 L${ARROW},${ARROW} L0,${ARROW/2} z" fill="${DIM_C}"/></marker>
        </defs>`);
    };
    const makeRect = (p, x,y,w,h,fill,stroke,sw=1.5) =>
        p.push(`<rect x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" width="${(+w).toFixed(1)}" height="${(+h).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
    const makeShelfLine = (p, x1,sy,x2) =>
        p.push(`<line x1="${(+x1).toFixed(1)}" y1="${(+sy).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(+sy).toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="6,3"/>`);
    const makeVline = (p, x,y1,y2) =>
        p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="0.8"/>`);
    const makeDimH = (p, x1,x2,y,lbl,above=true) => {
        const tk=8, lo=above?-10:16;
        p.push(`<line x1="${(+x1).toFixed(1)}" y1="${(y-tk/2).toFixed(1)}" x2="${(+x1).toFixed(1)}" y2="${(y+tk/2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>`);
        p.push(`<line x1="${(+x2).toFixed(1)}" y1="${(y-tk/2).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(y+tk/2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>`);
        p.push(`<line x1="${(+x1).toFixed(1)}" y1="${(+y).toFixed(1)}" x2="${(+x2).toFixed(1)}" y2="${(+y).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const mx=(+x1+x2)/2;
        p.push(`<text x="${mx.toFixed(1)}" y="${(y+lo).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" fill="${DIM_C}">${lbl}</text>`);
    };
    const makeDimV = (p, x,y1,y2,lbl) => {
        const tk=8;
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>`);
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>`);
        p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const my = (+y1+y2)/2, tx = x + 18;
        p.push(`<text x="${tx.toFixed(1)}" y="${(my+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" fill="${DIM_C}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>`);
    };
    const makeDimVLeft = (p, x,y1,y2,lbl) => {
        const tk=8;
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y1).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>`);
        p.push(`<line x1="${(x-tk/2).toFixed(1)}" y1="${(+y2).toFixed(1)}" x2="${(x+tk/2).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5"/>`);
        p.push(`<line x1="${(+x).toFixed(1)}" y1="${(+y1).toFixed(1)}" x2="${(+x).toFixed(1)}" y2="${(+y2).toFixed(1)}" stroke="${DIM_C}" stroke-width="1.5" marker-start="url(#as)" marker-end="url(#ae)"/>`);
        const my = (+y1+y2)/2, tx = x - 18;
        p.push(`<text x="${tx.toFixed(1)}" y="${(my+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" fill="${DIM_C}" transform="rotate(-90,${tx.toFixed(1)},${my.toFixed(1)})">${lbl}</text>`);
    };
    const wrapSVG = (p, label, pageNum, totalPages) => {
        const header = [
            `<rect width="${SVG_W}" height="${PAGE_H}" fill="white"/>`,
            `<text x="${SVG_W/2}" y="28" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="bold" fill="${STROKE}">שרטוט טכני — ${presetLabel}</text>`,
            `<text x="${SVG_W/2}" y="52" text-anchor="middle" font-family="${FONT}" font-size="16" fill="${STROKE}" opacity="0.7">${label}</text>`,
            `<text x="${SVG_W - MARGIN}" y="${PAGE_H - 12}" text-anchor="end" font-family="${FONT}" font-size="14" fill="${STROKE}" opacity="0.5">עמוד ${pageNum} / ${totalPages}</text>`,
        ];
        const defs = [];
        makeDefs(defs);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${SVG_W} ${PAGE_H}" style="display:block;">${defs.join('')}${header.join('')}${p.join('')}</svg>`;
    };

    const pages = []; // { label, svg }

    // ---- PAGE 0: TOP VIEW ----
    {
        const p = [];
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN;
        const pw = SVG_W - MARGIN * 2;

        // Panel border
        p.push(`<rect x="${MARGIN}" y="${drawAreaY}" width="${pw}" height="${drawAreaH}" rx="4" fill="white" stroke="${STROKE_THIN}" stroke-width="1"/>`);

        // Compute world bounds in cm
        let minX = -cW/2, maxX = cW/2, minZ = 0, maxZ = cD;
        if (hasLeft) {
            if (lPos==='side')             { minX = Math.min(minX, -cW/2 - lD); maxZ = Math.max(maxZ, lW); }
            else if (lPos==='front')       { minX = Math.min(minX, -cW/2 - lW); }
            else if (lPos==='full_corner') { minX = Math.min(minX, -cW/2 - fcSizeL); maxZ = Math.max(maxZ, fcSizeL + lW); }
        }
        if (hasRight) {
            if (rPos==='side')             { maxX = Math.max(maxX, cW/2 + rD); maxZ = Math.max(maxZ, rW); }
            else if (rPos==='front')       { maxX = Math.max(maxX, cW/2 + rW); }
            else if (rPos==='full_corner') { maxX = Math.max(maxX, cW/2 + fcSizeR); maxZ = Math.max(maxZ, fcSizeR + rW); }
        }
        // Corner unit (שידה/שולחן פינתית) protrudes forward from front face
        const hasCU = state.corner && state.corner.side !== 'none';
        const cuW_fp = hasCU ? (state.corner.width || 60) : 0;
        const cuD_fp = hasCU ? (state.corner.depth || cD) : 0;
        if (hasCU) maxZ = Math.max(maxZ, cD + cuW_fp);
        // Side cabinet (ארון צד הפוך) — extends in X direction
        const scFP2 = state.wings.center ? state.wings.center.sideCabinet : null;
        const hasSCFP2 = scFP2 && scFP2.side !== 'none';
        const scW_fp2_R = hasSCFP2 ? (scFP2.widthRight || scFP2.width || 40) : 0;
        const scW_fp2_L = hasSCFP2 ? (scFP2.widthLeft  || scFP2.width || 40) : 0;
        if (hasSCFP2) {
            const scSideFP2b = scFP2.side;
            if (scSideFP2b === 'right' || scSideFP2b === 'both') maxX = Math.max(maxX, cW/2 + scW_fp2_R);
            if (scSideFP2b === 'left'  || scSideFP2b === 'both') minX = Math.min(minX, -cW/2 - scW_fp2_L);
        }
        // Side desk (שולחן צד) — extends in X direction, depth = cD
        const deskFP2 = state.desk && state.desk.side !== 'none' ? state.desk : null;
        const hasDeskFP2 = !!deskFP2;
        const deskFPW2 = hasDeskFP2 ? (deskFP2.width || 100) : 0;
        if (hasDeskFP2) {
            if (deskFP2.side === 'right') maxX = Math.max(maxX, cW/2 + deskFPW2);
            if (deskFP2.side === 'left')  minX = Math.min(minX, -cW/2 - deskFPW2);
        }
        const tW = maxX - minX, tD = maxZ - minZ;
        const sc = Math.min((pw - PAD*2) / Math.max(tW,1), (drawAreaH - PAD*2) / Math.max(tD,1));
        const ox = MARGIN + (pw - tW*sc)/2 - minX*sc;
        const oz = drawAreaY + (drawAreaH - tD*sc)/2;
        const wx = xc => ox + xc*sc;
        const wz = zc => oz + zc*sc;

        // Center cabinet
        makeRect(p, wx(-cW/2), wz(0), cW*sc, cD*sc, FILL_CAB, STROKE, 2);
        p.push(`<text x="${wx(0).toFixed(1)}" y="${(wz(cD)+13).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}" opacity="0.6">חזית</text>`);

        // Wings — use per-side colors
        if (hasLeft) {
            if (lPos==='side') {
                makeRect(p, wx(-cW/2 - lD), wz(0), lD*sc, lW*sc, FILL_WING_L, STROKE);
                p.push(`<text x="${wx(-cW/2 - lD/2).toFixed(1)}" y="${(wz(lW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(lD)}</text>`);
            } else if (lPos==='front') {
                makeRect(p, wx(-cW/2 - lW), wz(0), lW*sc, cD*sc, FILL_WING_L, STROKE);
            } else if (lPos==='full_corner') {
                const x1 = wx(-cW/2), y1 = wz(0);
                const x2 = wx(-cW/2 - fcSizeL), y2 = wz(0);
                const x3 = wx(-cW/2 - fcSizeL), y3 = wz(fcSizeL);
                const x4 = wx(-cW/2 - fcSizeL + lD), y4 = wz(fcSizeL);
                const x5 = wx(-cW/2 - fcSizeL + lD), y5 = wz(cD);
                const x6 = wx(-cW/2), y6 = wz(cD);
                p.push(`<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)} ${x5.toFixed(1)},${y5.toFixed(1)} ${x6.toFixed(1)},${y6.toFixed(1)}" fill="${FILL_FC_L}" stroke="${STROKE}" stroke-width="1.5"/>`);
                if (lW > 0) makeRect(p, wx(-cW/2 - fcSizeL), wz(fcSizeL), lD*sc, lW*sc, FILL_WING_L, STROKE);
            }
        }
        if (hasRight) {
            if (rPos==='side') {
                makeRect(p, wx(cW/2), wz(0), rD*sc, rW*sc, FILL_WING_R, STROKE);
                p.push(`<text x="${wx(cW/2 + rD/2).toFixed(1)}" y="${(wz(rW/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.7">${Math.round(rD)}</text>`);
            } else if (rPos==='front') {
                makeRect(p, wx(cW/2), wz(0), rW*sc, cD*sc, FILL_WING_R, STROKE);
            } else if (rPos==='full_corner') {
                const x1 = wx(cW/2), y1 = wz(0);
                const x2 = wx(cW/2 + fcSizeR), y2 = wz(0);
                const x3 = wx(cW/2 + fcSizeR), y3 = wz(fcSizeR);
                const x4 = wx(cW/2 + fcSizeR - rD), y4 = wz(fcSizeR);
                const x5 = wx(cW/2 + fcSizeR - rD), y5 = wz(cD);
                const x6 = wx(cW/2), y6 = wz(cD);
                p.push(`<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)} ${x4.toFixed(1)},${y4.toFixed(1)} ${x5.toFixed(1)},${y5.toFixed(1)} ${x6.toFixed(1)},${y6.toFixed(1)}" fill="${FILL_FC_R}" stroke="${STROKE}" stroke-width="1.5"/>`);
                if (rW > 0) makeRect(p, wx(cW/2 + fcSizeR - rD), wz(fcSizeR), rD*sc, rW*sc, FILL_WING_R, STROKE);
            }
        }

        // Side cabinet (ארון צד הפוך) — rectangle flush against main cabinet side
        if (hasSCFP2) {
            const FILL_SC2 = '#e0f2fe'; // light blue for side cabinet
            const scSideFP2c = scFP2.side;
            const _drawSCFP2 = (onRight) => {
                const scW_this2 = onRight ? scW_fp2_R : scW_fp2_L;
                const scX1_2 = onRight ? cW/2 : -cW/2 - scW_this2;
                const scX2_2 = onRight ? cW/2 + scW_this2 : -cW/2;
                makeRect(p, wx(scX1_2), wz(0), scW_this2*sc, cD*sc, FILL_SC2, STROKE, 1.5);
                p.push(`<text x="${wx((scX1_2+scX2_2)/2).toFixed(1)}" y="${(wz(cD/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.8">ארון צד</text>`);
                makeDimH(p, wx(scX1_2), wx(scX2_2), wz(cD) + 14, `${Math.round(scW_this2)}`);
            };
            if (scSideFP2c === 'right' || scSideFP2c === 'both') _drawSCFP2(true);
            if (scSideFP2c === 'left'  || scSideFP2c === 'both') _drawSCFP2(false);
        }

        // Side desk (שולחן צד) — top view: rectangle on the side of the cabinet
        if (hasDeskFP2) {
            const FILL_DESK_FP2 = '#fed7aa'; // light orange for side desk
            const deskOnRight2 = deskFP2.side === 'right';
            const deskX1_2 = deskOnRight2 ? cW/2 : -cW/2 - deskFPW2;
            const deskX2_2 = deskOnRight2 ? cW/2 + deskFPW2 : -cW/2;
            makeRect(p, wx(deskX1_2), wz(0), deskFPW2*sc, cD*sc, FILL_DESK_FP2, STROKE, 1.5);
            p.push(`<text x="${wx((deskX1_2+deskX2_2)/2).toFixed(1)}" y="${(wz(cD/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.85">שולחן צד</text>`);
            makeDimH(p, wx(deskX1_2), wx(deskX2_2), wz(cD) + 24, `${Math.round(deskFPW2)}`);
        }

        // Corner unit (שידה/שולחן פינתית) — protrudes forward from front face
        if (hasCU) {
            const cuSide = state.corner.side; // 'right' or 'left'
            const cuX1 = cuSide === 'right' ? cW/2 - cuD_fp : -cW/2;
            const cuX2 = cuSide === 'right' ? cW/2 : -cW/2 + cuD_fp;
            const FILL_CU = '#fef9c3'; // light yellow for corner unit
            makeRect(p, wx(cuX1), wz(cD), (cuX2 - cuX1)*sc, cuW_fp*sc, FILL_CU, STROKE, 1.5);
            // Label
            const cuLabel = state.corner.type === 'desk' ? 'שולחן פינתי' : 'שידה פינתית';
            p.push(`<text x="${wx((cuX1+cuX2)/2).toFixed(1)}" y="${(wz(cD + cuW_fp/2)+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}" opacity="0.8">${cuLabel}</text>`);
            // Dimensions: width (horizontal, below the unit) and depth (vertical, on the outer side)
            makeDimH(p, wx(cuX1), wx(cuX2), wz(cD + cuW_fp) + 14, `${Math.round(cuD_fp)}`);
            if (cuSide === 'right') {
                makeDimV(p, wx(cuX2) + 14, wz(cD), wz(cD + cuW_fp), `${Math.round(cuW_fp)}`);
            } else {
                makeDimVLeft(p, wx(cuX1) - 14, wz(cD), wz(cD + cuW_fp), `${Math.round(cuW_fp)}`);
            }
        }

        // Dimension lines
        // Total width at TOP — above all other horizontal dims (above 100/311 lines at wz(0)-14)
        const dimRowTop = wz(0) - 28;
        makeDimH(p, wx(minX), wx(maxX), dimRowTop, `${Math.round(tW)}`);
        // Center cabinet width: just above the cabinet top edge
        if (hasLeft || hasRight) makeDimH(p, wx(-cW/2), wx(cW/2), wz(0) - 14, `${Math.round(cW)}`);

        const hasRightFC = hasRight && rPos === 'full_corner';
        const hasLeftFC  = hasLeft  && lPos === 'full_corner';

        // Total depth lines — side-aware:
        // Both corners (U/walk-in): left depth on LEFT, right depth on RIGHT
        // Only left corner: total depth on RIGHT
        // Only right corner or no corner: total depth on LEFT
        if (hasLeftFC && hasRightFC) {
            const leftTotalD = fcSizeL + lW;
            const rightTotalD = fcSizeR + rW;
            makeDimVLeft(p, wx(minX) - 54, wz(0), wz(leftTotalD), `${Math.round(leftTotalD)}`);
            makeDimV(p, wx(maxX) + 74, wz(0), wz(rightTotalD), `${Math.round(rightTotalD)}`);
        } else if (hasLeftFC && !hasRightFC) {
            makeDimV(p, wx(maxX) + 74, wz(minZ), wz(maxZ), `${Math.round(tD)}`);
        } else {
            makeDimVLeft(p, wx(minX) - 54, wz(minZ), wz(maxZ), `${Math.round(tD)}`);
        }

        // Center cabinet depth — only show if shorter than total depth (not in U-shape)
        if (cD < tD && !(hasLeftFC && hasRightFC)) {
            if (hasRightFC) {
                makeDimVLeft(p, wx(-cW/2) - 14, wz(0), wz(cD), `${Math.round(cD)}`);
            } else {
                makeDimVLeft(p, wx(cW/2) + 34, wz(0), wz(cD), `${Math.round(cD)}`);
            }
        }

        // Right wing depth (side position) — label on LEFT side of the right wing
        if (hasRight && rPos === 'side') makeDimVLeft(p, wx(cW/2) - 14, wz(0), wz(rW), `${Math.round(rW)}`);
        if (hasLeft && lPos === 'side') makeDimVLeft(p, wx(-cW/2 - lD) - 14, wz(0), wz(lW), `${Math.round(lW)}`);

        // full_corner dims
        if (hasRightFC) {
            makeDimH(p, wx(cW/2), wx(cW/2 + fcSizeR), wz(0) - 14, `${Math.round(fcSizeR)}`);
            // Corner depth + wing width on RIGHT side — use +54 to match total depth line spacing
            makeDimV(p, wx(cW/2 + fcSizeR) + 54, wz(0), wz(fcSizeR), `${Math.round(fcSizeR)}`);
            if (rW > 0) makeDimV(p, wx(cW/2 + fcSizeR) + 54, wz(fcSizeR), wz(fcSizeR + rW), `${Math.round(rW)}`);
            if (rW > 0) makeDimH(p, wx(cW/2 + fcSizeR - rD), wx(cW/2 + fcSizeR), wz(fcSizeR + rW) + 28, `${Math.round(rD)}`);
        }
        if (hasLeftFC) {
            makeDimH(p, wx(-cW/2 - fcSizeL), wx(-cW/2), wz(0) - 14, `${Math.round(fcSizeL)}`);
            makeDimVLeft(p, wx(-cW/2 - fcSizeL) - 14, wz(0), wz(fcSizeL), `${Math.round(fcSizeL)}`);
            if (lW > 0) makeDimVLeft(p, wx(-cW/2 - fcSizeL) - 14, wz(fcSizeL), wz(fcSizeL + lW), `${Math.round(lW)}`);
            if (lW > 0) makeDimH(p, wx(-cW/2 - fcSizeL), wx(-cW/2 - fcSizeL + lD), wz(fcSizeL + lW) + 28, `${Math.round(lD)}`);
        }

        pages.push({ label: 'מבט עליון — תוכנית רצפה', svgParts: p });
    }

    // ---- PAGES 1..N: Per-wing front views ----
    // full_corner wings have no columns — they get their own diagonal-face page below
    // Additional wings attached to full_corner corners also get their own front-view page
    // Helper: total drawing height = max(col.height) across all columns
    // The box top is at oy+dH - col.height*sc (since top = oy+dH - fo*sc - visibleH*sc = oy+dH - h*sc)
    const _wingMaxH = (wd, fallback) => wd && wd.columns && wd.columns.length > 0
        ? Math.max(...wd.columns.map(c => c.height || fallback))
        : (wd ? (wd.globalHeight || fallback) : fallback);

    const wingList = [];
    if (hasLeft  && lPos !== 'full_corner') wingList.push({ wd: leftWing,   label: 'שרטוט חזית — כנף שמאל',   fill: FILL_WING_L, w: lW, h: _wingMaxH(leftWing,  cH), d: lD });
    wingList.push(                                        { wd: centerWing,  label: 'שרטוט חזית — ארון מרכזי', fill: FILL_CAB,    w: cW, h: _wingMaxH(centerWing, cH), d: cD });
    if (hasRight && rPos !== 'full_corner') wingList.push({ wd: rightWing,   label: 'שרטוט חזית — כנף ימין',   fill: FILL_WING_R, w: rW, h: _wingMaxH(rightWing, cH), d: rD });

    wingList.forEach((wg) => {
        const p = [];
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN;
        const pw = SVG_W - MARGIN * 2;

        const sc = Math.min((pw - PAD*2) / Math.max(wg.w,1), (drawAreaH - PAD*2) / Math.max(wg.h,1));
        const dW = wg.w * sc, dH = wg.h * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        // Cabinet body — draw as individual column rects so shorter columns show correctly
        const cols = (wg.wd && wg.wd.columns) ? wg.wd.columns : (state.columns || []);

        // First pass: draw per-column body rects (each at its actual height, respecting floorOffset)
        // floorOffset = how much is cut from the BOTTOM; visibleH = height - floorOffset; box raised by floorOffset
        {
            let _cx = ox;
            cols.forEach((col, ci) => {
                const isLastCol = (ci === cols.length - 1);
                const _cw = isLastCol ? (ox + dW - _cx) : (col.width || wg.w) * sc;
                const _fo = col.floorOffset || 0;
                const _visibleH = (col.height || wg.h) - _fo;
                const _colSvgH = _visibleH * sc;
                // box is raised by floorOffset: bottom = oy+dH - fo*sc, top = bottom - visibleH*sc
                const _colBotY2 = oy + dH - _fo * sc;
                const _colTopY2 = _colBotY2 - _colSvgH;
                makeRect(p, _cx, _colTopY2, _cw, _colSvgH, wg.fill, STROKE, 2);
                _cx += _cw;
            });
        }
        // Plinth — draw per-column segment only for columns that sit on the floor (floorOffset === 0)
        // Desk columns (col.type === 'desk') are open below — no plinth
        if (pH > 0) {
            let _px = ox;
            cols.forEach((col, ci) => {
                const isLastCol = (ci === cols.length - 1);
                const _pw = isLastCol ? (ox + dW - _px) : (col.width || wg.w) * sc;
                if (!(col.floorOffset > 0) && !col.noPlinth && col.type !== 'desk') {
                    makeRect(p, _px, oy + dH - pH*sc, _pw, pH*sc, '#cbd5e1', STROKE, 1);
                }
                _px += _pw;
            });
        }

        // Side desk (שולחן צד) — only for center wing
        if (wg.wd === centerWing && state.desk && state.desk.side !== 'none') {
            const dSide   = state.desk.side;
            const dWidth  = state.desk.width;
            const dHeight = state.desk.height;
            const drawerH = state.desk.drawerHeight || 12;
            const dSvgW   = dWidth  * sc;
            const dSvgH   = dHeight * sc;
            const legT    = 1.8 * sc; // board thickness in SVG pixels
            // Desk sits to the left or right of the cabinet body
            const deskX   = dSide === 'left' ? (ox - dSvgW) : (ox + dW);
            const deskBotY = oy + dH; // floor level
            const deskTopY = deskBotY - dSvgH;
            // Outer leg (vertical board)
            const legX = dSide === 'left' ? deskX : (deskX + dSvgW - legT);
            makeRect(p, legX, deskTopY, legT, dSvgH, wg.fill, STROKE, 1.5);
            // Desk surface (horizontal board at top)
            makeRect(p, deskX, deskTopY, dSvgW, legT, wg.fill, STROKE, 1.5);
            // Drawers (if any) — sit just below the desk surface, inside the leg
            if (state.desk.hasDrawers) {
                const numDrawers = dWidth <= 80 ? 1 : 2;
                const innerSvgW = dSvgW - legT; // width between cabinet wall and leg
                const drawerSvgW = innerSvgW / numDrawers;
                const drawerSvgH = drawerH * sc;
                const drawerSvgY = deskTopY + legT; // just below desk surface
                const drawerStartX = dSide === 'left' ? deskX : (deskX + legT);
                for (let di = 0; di < numDrawers; di++) {
                    const dx = drawerStartX + di * drawerSvgW;
                    makeRect(p, dx + 1, drawerSvgY + 1, drawerSvgW - 2, drawerSvgH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN, 0.8);
                    // Handle line
                    const hndW = Math.min(drawerSvgW * 0.4, 20);
                    const hndX = dx + (drawerSvgW - hndW) / 2;
                    const hndY = drawerSvgY + drawerSvgH * 0.5;
                    p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                }
                // Dimension: drawer height (inner side of desk)
                const dimInnerX = dSide === 'left' ? (deskX + dSvgW + 14) : (deskX - 14);
                const drawerSvgY0 = deskTopY + legT;
                if (dSide === 'left') {
                    makeDimV(p, dimInnerX, drawerSvgY0, drawerSvgY0 + drawerH * sc, `${Math.round(drawerH)}`);
                    // Dimension: floor to drawer bottom (gap below drawer)
                    makeDimV(p, dimInnerX + 36, drawerSvgY0 + drawerH * sc, deskBotY, `${Math.round(dHeight - 1.8 - drawerH)}`);
                } else {
                    makeDimVLeft(p, dimInnerX, drawerSvgY0, drawerSvgY0 + drawerH * sc, `${Math.round(drawerH)}`);
                    // Dimension: floor to drawer bottom (gap below drawer)
                    makeDimVLeft(p, dimInnerX - 36, drawerSvgY0 + drawerH * sc, deskBotY, `${Math.round(dHeight - 1.8 - drawerH)}`);
                }
            }
            // Dimension: desk width (below)
            makeDimH(p, deskX, deskX + dSvgW, oy + dH + 22, `${Math.round(dWidth)}`);
            // Dimension: desk height (to the outer side)
            if (dSide === 'left') {
                makeDimVLeft(p, deskX - 14, deskTopY, deskBotY, `${Math.round(dHeight)}`);
            } else {
                makeDimV(p, deskX + dSvgW + 14, deskTopY, deskBotY, `${Math.round(dHeight)}`);
            }
        }

        // Columns, shelves, hangers & drawers
        const colXPositions = [];
        let colX = ox;
        cols.forEach((col, ci) => {
            const isLastCol = (ci === cols.length - 1);
            const colW = isLastCol ? (ox + dW - colX) : (col.width || wg.w) * sc;
            // Desk columns are open below (no plinth) — treat colPlinthH as 0
            const colPlinthH = (col.noPlinth || col.type === 'desk') ? 0 : pH;
            const _fo2 = col.floorOffset || 0;
            const _colActualH2 = col.height || wg.h;
            const _visibleH2 = _colActualH2 - _fo2; // visible height after bottom cut
            // box is raised by floorOffset: bottom = oy+dH - fo*sc, top = bottom - visibleH*sc
            const _colBotSvgY  = oy + dH - _fo2 * sc;
            const _colTopSvgY  = _colBotSvgY - _visibleH2 * sc;
            colXPositions.push({ x1: colX, x2: colX + colW, wCm: Math.round(col.width || wg.w), colTopY: _colTopSvgY, colBotY: _colBotSvgY });

            // Column separator: spans between the overlapping vertical extents of adjacent columns
            if (ci > 0) {
                const prevCol = cols[ci - 1];
                const prevFO2  = prevCol ? (prevCol.floorOffset || 0) : 0;
                const prevH2   = (prevCol && prevCol.height) ? prevCol.height : wg.h;
                const prevVisibleH2 = prevH2 - prevFO2;
                const prevBotY2 = oy + dH - prevFO2 * sc;
                const prevTopY2 = prevBotY2 - prevVisibleH2 * sc;
                const sepTopY = Math.min(_colTopSvgY, prevTopY2);
                const sepBotY = Math.max(_colBotSvgY, prevBotY2);
                makeVline(p, colX, sepTopY, sepBotY);
            }

            // Shelf lines — adjust by floorOffset, only within visible height
            (col.shelvesY || []).forEach(sy => {
                const syAdj = sy - _fo2;
                if (syAdj > 0 && syAdj < _visibleH2) makeShelfLine(p, colX, _colBotSvgY - syAdj*sc, colX + colW);
            });

            // Internal desk column rendering
            if (col.type === 'desk') {
                const deskH   = col.deskHeight   || 80;
                const deskClr = col.deskClearance || 80;
                // Open area below desk surface: white fill
                const openTop = _colBotSvgY - deskH * sc;
                const openBot = _colBotSvgY - colPlinthH * sc;
                makeRect(p, colX, openTop, colW, openBot - openTop, 'white', STROKE_THIN, 0.5);
                // Desk surface line
                p.push(`<line x1="${colX.toFixed(1)}" y1="${openTop.toFixed(1)}" x2="${(colX+colW).toFixed(1)}" y2="${openTop.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                // Drawers below desk surface
                if (col.hasDrawers) {
                    const drawerH = col.drawerHeight || 12;
                    const numDrawers = (col.width || wg.w) <= 80 ? 1 : 2;
                    const drawerW = colW / numDrawers;
                    const drawerPxH = drawerH * sc;
                    const drawerY = openTop + 2;
                    for (let di = 0; di < numDrawers; di++) {
                        const dx = colX + di * drawerW;
                        makeRect(p, dx + 2, drawerY, drawerW - 4, drawerPxH - 2, 'rgba(255,255,255,0.7)', STROKE_THIN, 0.8);
                        const hndW = Math.min(drawerW * 0.4, 20);
                        const hndX = dx + (drawerW - hndW) / 2;
                        const hndY = drawerY + drawerPxH * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                    // Dimension: drawer height (right side of column)
                    makeDimV(p, colX + colW + 14, drawerY, drawerY + drawerPxH, `${Math.round(drawerH)}`);
                    // Dimension: floor to drawer bottom (gap from floor to bottom of drawer)
                    makeDimV(p, colX + colW + 50, drawerY + drawerPxH, _colBotSvgY, `${Math.round(deskH - 1.8 - drawerH)}`);
                }
                // Clearance board (shelf above clearance zone)
                const clrBoardY = _colBotSvgY - (deskH + deskClr) * sc;
                p.push(`<line x1="${colX.toFixed(1)}" y1="${clrBoardY.toFixed(1)}" x2="${(colX+colW).toFixed(1)}" y2="${clrBoardY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.2"/>`);
                // Label inside open area
                const lblY = openTop + (openBot - openTop) / 2 + 4;
                p.push(`<text x="${(colX+colW/2).toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.5">שולחן</text>`);
            }

            const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
            const deskBase = (col.type === 'desk') ? (col.deskHeight || 80) + (col.deskClearance || 80) : colPlinthH;
            // visibleH = height - floorOffset; shelf positions adjusted by floorOffset
            const adjShelvesArr2 = shelvesArr.map(sy => sy - _fo2).filter(sy => sy > 0 && sy < _visibleH2);
            const rowBounds = [deskBase, ...adjShelvesArr2.filter(sy => sy > deskBase), _visibleH2];
            const numRows = rowBounds.length - 1;
            for (let ri = 0; ri < numRows; ri++) {
                const rowBotCm = rowBounds[ri];
                const rowTopCm = rowBounds[ri + 1];
                const cellHeightCm = Math.round(rowTopCm - rowBotCm);
                const cellY1 = _colBotSvgY - rowTopCm * sc;
                const cellY2 = _colBotSvgY - rowBotCm * sc;
                const cellH = cellY2 - cellY1;
                const cellCX = colX + colW / 2;

                const comp = col.compartments ? col.compartments[ri] : null;
                const cellType = comp ? (comp.type || 'empty') : 'empty';

                if (cellType === 'hanging') {
                    // Hanger symbol: horizontal hanging rod near top of cell (no vertical rod)
                    const rodY   = cellY1 + cellH * 0.25;
                    const hRodX1 = colX + 4;
                    const hRodX2 = colX + colW - 4;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                } else if (cellType === 'sorbet') {
                    // סורבטו — מנגנון תלייה מתרומם (ממורכז אנכית בתא)
                    const mechH  = cellH * 0.5;
                    const mechY1 = cellY1 + (cellH - mechH) / 2;
                    const mechY2 = mechY1 + mechH;
                    const boxH   = Math.min(mechH * 0.2, 8);
                    const boxW   = Math.min(colW * 0.1, 7);
                    const boxY   = mechY2 - boxH;                 // בלוקי דיור בתחתית המנגנון
                    const boxLX  = colX + 4;
                    const boxRX  = colX + colW - 4 - boxW;
                    p.push(`<rect x="${boxLX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    p.push(`<rect x="${boxRX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    const hRodY  = mechY1;                        // מוט אופקי בראש המנגנון
                    const hRodX1 = boxLX + boxW / 2;
                    const hRodX2 = boxRX + boxW / 2;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${hRodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<line x1="${(boxLX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxLX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    p.push(`<line x1="${(boxRX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxRX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    const handleW  = Math.min(colW * 0.07, 5);
                    const handleH  = mechH * 0.6;
                    const handleX  = (hRodX1 + hRodX2) / 2 - handleW / 2;
                    p.push(`<rect x="${handleX.toFixed(1)}" y="${hRodY.toFixed(1)}" width="${handleW.toFixed(1)}" height="${handleH.toFixed(1)}" fill="${STROKE}" rx="1" opacity="0.75"/>`);
                    if (cellH > 25) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">סורבטו</text>`);
                } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                    const drawerCount = comp.count || 2;
                    const dh = cellH / drawerCount;
                    for (let di = 0; di < drawerCount; di++) {
                        const dy = cellY1 + di * dh;
                        makeRect(p, colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                        const hndW = Math.min(colW * 0.35, 22);
                        const hndX = colX + (colW - hndW) / 2;
                        const hndY = dy + dh * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                } else if (cellType === 'open_cell') {
                    // כוורת — inner rectangle (frame inside the cell)
                    const pad = 5;
                    const fx = colX + pad, fy = cellY1 + pad, fw = colW - pad*2, fh = cellH - pad*2;
                    if (fw > 2 && fh > 2) p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                    // Label at top of cell to avoid overlapping height number
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                } else if (cellType === 'side_open_cell') {
                    // כוורת צד — inner frame open on one side (3-sided C-shape)
                    // openDir is NOT stored on comp — compute from column position (same logic as 3D engine)
                    const pad = 5;
                    const _opensLeft2 = ci === 0;
                    const _opensRight2 = ci === cols.length - 1;
                    let openDir2;
                    if (_opensLeft2 && _opensRight2) openDir2 = (ci < cols.length / 2) ? 'left' : 'right';
                    else if (_opensLeft2) openDir2 = 'left';
                    else if (_opensRight2) openDir2 = 'right';
                    else openDir2 = 'left';
                    const fx = colX + pad, fy = cellY1 + pad, fw = colW - pad*2, fh = cellH - pad*2;
                    if (fw > 2 && fh > 2) {
                        if (openDir2 === 'left') {
                            // Left side open: top-left → top-right → bottom-right → bottom-left (gap = left wall)
                            p.push(`<polyline points="${fx.toFixed(1)},${fy.toFixed(1)} ${(fx+fw).toFixed(1)},${fy.toFixed(1)} ${(fx+fw).toFixed(1)},${(fy+fh).toFixed(1)} ${fx.toFixed(1)},${(fy+fh).toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                        } else {
                            // Right side open: top-right → top-left → bottom-left → bottom-right (gap = right wall)
                            p.push(`<polyline points="${(fx+fw).toFixed(1)},${fy.toFixed(1)} ${fx.toFixed(1)},${fy.toFixed(1)} ${fx.toFixed(1)},${(fy+fh).toFixed(1)} ${(fx+fw).toFixed(1)},${(fy+fh).toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                        }
                    }
                    // Label at top of cell to avoid overlapping height number
                    if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת צד</text>`);
                }

                // Partition (מחיצה) — dashed vertical line + sub-cell width dims + sub-cell shelves
                if (comp && comp.partition) {
                    const px = comp.partitionX || 0.5;
                    const partSvgX = colX + colW * px;
                    p.push(`<line x1="${partSvgX.toFixed(1)}" y1="${cellY1.toFixed(1)}" x2="${partSvgX.toFixed(1)}" y2="${cellY2.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5" stroke-dasharray="5,3"/>`);
                    // Width dims for each sub-cell — subtract half partition thickness from each side
                    const dimRowY = cellY1 + 22;
                    const partT = state.thickness || 1.8; // partition board thickness
                    const colWcm = col.width || wg.w;
                    const leftWcm  = Math.round(colWcm * px - partT / 2);
                    const rightWcm = Math.round(colWcm * (1 - px) - partT / 2);
                    if (partSvgX - colX > 20) makeDimH(p, colX, partSvgX, dimRowY, `${leftWcm}`);
                    if (colX + colW - partSvgX > 20) makeDimH(p, partSvgX, colX + colW, dimRowY, `${rightWcm}`);
                    // Sub-cell shelves
                    if (comp.subCells) {
                        const cellHcm = rowTopCm - rowBotCm;
                        [[colX, partSvgX, 0], [partSvgX, colX + colW, 1]].forEach(([x1, x2, idx]) => {
                            const sub = comp.subCells[idx];
                            const numShelves = (sub && sub.shelves) || 0;
                            if (numShelves > 0) {
                                const zoneHcm = cellHcm / (numShelves + 1);
                                for (let s = 1; s <= numShelves; s++) {
                                    const shelfYcm = rowBotCm + zoneHcm * s;
                                    const shelfSvgY = _colBotSvgY - shelfYcm * sc;
                                    p.push(`<line x1="${x1.toFixed(1)}" y1="${shelfSvgY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${shelfSvgY.toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="6,3"/>`);
                                }
                            }
                        });
                    }
                }

                if (cellHeightCm > 0 && cellH > 14) {
                    const lblCX = colX + colW / 2;
                    const lblCY = (cellY1 + cellY2) / 2 + 4;
                    p.push(`<text x="${lblCX.toFixed(1)}" y="${lblCY.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${DIM_C}" opacity="0.75">${cellHeightCm}</text>`);
                }
            }
            colX += colW;
        });

        // ---- Side-open-cell wall gap overlay ----
        // For each side_open_cell on the outer left or right wall, paint a fill-colored
        // rectangle over the border line to visually "open" the wall at that cell.
        {
            const _wallOverlay = (colIdx, isLeft) => {
                const col = cols[colIdx];
                if (!col) return;
                const colW = (col.width || wg.w) * sc;
                const colPlinthH = col.noPlinth ? 0 : pH;
                const _foW = col.floorOffset || 0;
                // floorOffset = cut from bottom; visibleH = height - fo; box raised by floorOffset
                const _colActualH3 = col.height || wg.h;
                const _visibleH3 = _colActualH3 - _foW;
                const _colBotW = oy + dH - _foW * sc;
                const _colTopW = _colBotW - _visibleH3 * sc;
                const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
                const adjShelves3 = shelvesArr.map(sy => sy - _foW).filter(sy => sy > 0 && sy < _visibleH3);
                const rowBounds = [colPlinthH, ...adjShelves3.filter(sy => sy > colPlinthH), _visibleH3];
                for (let ri = 0; ri < rowBounds.length - 1; ri++) {
                    const comp = col.compartments ? col.compartments[ri] : null;
                    if (!comp || comp.type !== 'side_open_cell') continue;
                    const rowBotCm = rowBounds[ri];
                    const rowTopCm = rowBounds[ri + 1];
                    const cellY1 = _colBotW - rowTopCm * sc;
                    const cellY2 = _colBotW - rowBotCm * sc;
                    const wallX = isLeft ? ox : ox + dW;
                    const overlayW = 4; // wide enough to cover the 2px stroke
                    p.push(`<rect x="${(wallX - overlayW/2).toFixed(1)}" y="${cellY1.toFixed(1)}" width="${overlayW}" height="${(cellY2 - cellY1).toFixed(1)}" fill="${wg.fill}" stroke="none"/>`);
                }
            };
            _wallOverlay(0, true);                  // left outer wall (column 0)
            _wallOverlay(cols.length - 1, false);   // right outer wall (last column)
        }

        // ---- Corner unit overlay (front view) — only for center cabinet ----
        if (wg.wd === centerWing) {
            const hasCUfv = state.corner && state.corner.side !== 'none';
            if (hasCUfv) {
                const cuSidefv = state.corner.side; // 'right' or 'left'
                const cuHfv = state.corner.height || 90;
                const cuDfv = state.corner.depth || cD;
                const cuLabelfv = state.corner.type === 'desk' ? 'שולחן פינתי' : 'שידה פינתית';
                // SVG coordinates: bottom-aligned, flush against left or right wall
                const cuSvgW = cuDfv * sc;
                const cuSvgH = cuHfv * sc;
                const cuSvgX = cuSidefv === 'right' ? (ox + dW - cuSvgW) : ox;
                const cuSvgY = oy + dH - cuSvgH;
                // Semi-transparent yellow fill with amber dashed border
                p.push(`<rect x="${cuSvgX.toFixed(1)}" y="${cuSvgY.toFixed(1)}" width="${cuSvgW.toFixed(1)}" height="${cuSvgH.toFixed(1)}" fill="#fef08a" fill-opacity="0.55" stroke="#b45309" stroke-width="1.5" stroke-dasharray="5,3"/>`);
                // Label badge centered in the overlay
                const cuLblX = cuSvgX + cuSvgW / 2;
                const cuLblY = cuSvgY + cuSvgH / 2;
                const cuLblW = Math.max(cuLabelfv.length * 6 + 14, 72);
                p.push(`<rect x="${(cuLblX - cuLblW/2).toFixed(1)}" y="${(cuLblY - 9).toFixed(1)}" width="${cuLblW.toFixed(1)}" height="18" rx="3" fill="#fef08a" stroke="#b45309" stroke-width="1" opacity="0.95"/>`);
                p.push(`<text x="${cuLblX.toFixed(1)}" y="${(cuLblY + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="14" font-weight="bold" fill="#92400e">${cuLabelfv}</text>`);
                // Width dimension (below the overlay — placed below the total-width dim line at oy+dH+22)
                const cuDimY = oy + dH + 38;
                makeDimH(p, cuSvgX, cuSvgX + cuSvgW, cuDimY, `${Math.round(cuDfv)}`);
                // Height dimension (on the outer side — use far-right/far-left to avoid overlap with plinth dim)
                if (cuSidefv === 'right') {
                    makeDimV(p, ox + dW + 40, cuSvgY, oy + dH, `${Math.round(cuHfv)}`);
                } else {
                    makeDimVLeft(p, ox - 36, cuSvgY, oy + dH, `${Math.round(cuHfv)}`);
                }
            }
        }

        // Dimension lines
        const dimY = oy + dH + 22;
        makeDimH(p, ox, ox + dW, dimY, `${Math.round(wg.w)}`);
        if (colXPositions.length > 1) {
            // Per-column width labels: place above each column's actual top (accounting for floorOffset)
            colXPositions.forEach((cp, ci) => {
                makeDimH(p, cp.x1, cp.x2, cp.colTopY - 16, `${cp.wCm}`);
            });
        }
        // Overall height dimension: from lowest bottom to highest top across all columns
        {
            // Overall height: from floor (oy+dH) to highest column top
            // top = oy+dH - fo*sc - visibleH*sc = oy+dH - (fo + visibleH)*sc = oy+dH - height*sc
            const _maxTopY2 = cols.length > 0 ? Math.min(...cols.map(c => oy + dH - (c.height || wg.h) * sc)) : oy;
            const _totalHcm2 = cols.length > 0 ? Math.round(Math.max(...cols.map(c => (c.height || wg.h)))) : Math.round(wg.h);
            makeDimV(p, ox - 54, _maxTopY2, oy + dH, `${_totalHcm2}`);
        }
        if (pH > 0) {
            makeDimV(p, ox + dW + 18, oy + dH - pH*sc, oy + dH, `${Math.round(pH)}`);
        }
        // floorOffset dimension: for each floating column, show the gap below it (floor to column bottom)
        {
            let _foDimX2 = ox + dW + 38;
            colXPositions.forEach((cp, ci) => {
                const _col = cols[ci];
                const _fo = (_col && _col.floorOffset) ? _col.floorOffset : 0;
                if (_fo > 0) {
                    // gap from floor (oy+dH) to column bottom (cp.colBotY)
                    makeDimV(p, _foDimX2, cp.colBotY, oy + dH, `${Math.round(_fo)}`);
                    _foDimX2 += 36;
                }
            });
        }

        // ---- Closure panels overlay (only for center wing, when wall-snap is active) ----
        if (wg.wd === centerWing) {
            const _preset2 = state.presetId || 'linear';
            const _isLS2 = (_preset2 === 'linear' || _preset2 === 'sliding');
            const _rw2 = _isLS2 ? (window._roomWall || state.roomWall || 'center') : 'center';
            const _closureOn2 = (window._closureEnabled !== false);
            if (_rw2 !== 'center' && _isLS2 && _closureOn2) {
                const _cW2  = Math.max(1.8, parseFloat(window._closureWidth)      || 1.8);
                const _cCW2 = Math.max(1.8, parseFloat(window._closureCeilWidth)  || 1.8);
                const FILL_CLOSURE = '#d4c5b0';
                const STROKE_CLOSURE = '#8b7355';

                // Side panel: sits to the left (or right) of the cabinet body
                const _sideSvgW = _cW2 * sc;
                const _sideSvgH = wg.h * sc; // full cabinet height
                const _sideX = (_rw2 === 'left') ? (ox - _sideSvgW) : (ox + dW);
                const _sideY = oy; // top of cabinet
                makeRect(p, _sideX, _sideY, _sideSvgW, _sideSvgH, FILL_CLOSURE, STROKE_CLOSURE, 1.5);

                // Ceiling panel: spans from side panel outer edge to cabinet free-side edge
                const _ceilSvgH = _cCW2 * sc;
                const _ceilTotalSvgW = _sideSvgW + dW; // side panel + cabinet width
                const _ceilX = (_rw2 === 'left') ? (ox - _sideSvgW) : ox;
                const _ceilY = oy - _ceilSvgH; // sits above cabinet top
                makeRect(p, _ceilX, _ceilY, _ceilTotalSvgW, _ceilSvgH, FILL_CLOSURE, STROKE_CLOSURE, 1.5);

                // Dimension: side closure width
                if (_rw2 === 'left') {
                    makeDimH(p, _sideX, ox, oy + dH + 22, `${Math.round(_cW2)}`);
                } else {
                    makeDimH(p, ox + dW, _sideX + _sideSvgW, oy + dH + 22, `${Math.round(_cW2)}`);
                }
                // Dimension: ceiling closure height
                makeDimV(p, _ceilX - 18, _ceilY, oy, `${Math.round(_cCW2)}`);
            }
        }

        pages.push({ label: wg.label, svgParts: p });
    });

    // ---- Full-corner diagonal face pages ----
    // For each full_corner wing, draw a front view of the 45° diagonal face.
    // The diagonal face is a rectangle: width = fcSize * √2 (projected face width), height = colH.
    // It shows shelves as horizontal lines at the shelvesY positions.
    const fcWings = [];
    if (hasLeft  && lPos === 'full_corner') fcWings.push({ wd: leftWing,  label: 'שרטוט חזית — פינה מלאה שמאל', fcSize: fcSizeL, wingD: lD, fill: FILL_FC_L });
    if (hasRight && rPos === 'full_corner') fcWings.push({ wd: rightWing, label: 'שרטוט חזית — פינה מלאה ימין',  fcSize: fcSizeR, wingD: rD, fill: FILL_FC_R });

    fcWings.forEach((fc) => {
        const p = [];
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN;
        const pw = SVG_W - MARGIN * 2;

        // Diagonal face width = fcSize * √2 (the 45° face spans from one arm end to the other)
        const diagW = fc.fcSize * Math.SQRT2;
        const sc = Math.min((pw - PAD*2) / Math.max(diagW, 1), (drawAreaH - PAD*2) / Math.max(cH, 1));
        const dW = diagW * sc, dH = cH * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        // Cabinet body (diagonal face as rectangle) — use per-side color
        makeRect(p, ox, oy, dW, dH, fc.fill || FILL_FC_L, STROKE, 2);
        // Plinth
        if (pH > 0) makeRect(p, ox, oy + dH - pH*sc, dW, pH*sc, '#cbd5e1', STROKE, 1);

        // Diagonal indicator lines at top corners (showing this is a 45° face)
        const diagMark = 14;
        p.push(`<line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${(ox+diagMark).toFixed(1)}" y2="${(oy+diagMark).toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
        p.push(`<line x1="${(ox+dW).toFixed(1)}" y1="${oy.toFixed(1)}" x2="${(ox+dW-diagMark).toFixed(1)}" y2="${(oy+diagMark).toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="3,2"/>`);
        // Label showing this is a 45° view
        p.push(`<text x="${(ox+dW/2).toFixed(1)}" y="${(oy-8).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}" opacity="0.6">מבט חזית 45°</text>`);

        // Shelves from fullCorner data
        const fcData = fc.wd.fullCorner || {};
        const shelvesY = fcData.shelvesY || [];
        shelvesY.forEach(sy => {
            const sy_px = oy + dH - sy * sc;
            p.push(`<line x1="${ox.toFixed(1)}" y1="${sy_px.toFixed(1)}" x2="${(ox+dW).toFixed(1)}" y2="${sy_px.toFixed(1)}" stroke="${STROKE_THIN}" stroke-width="1" stroke-dasharray="6,3"/>`);
        });

        // Cell height labels inside each cell
        const shelvesArr = shelvesY.slice().sort((a,b) => a-b);
        const rowBounds = [pH, ...shelvesArr, cH];
        for (let ri = 0; ri < rowBounds.length - 1; ri++) {
            const rowBotCm = rowBounds[ri];
            const rowTopCm = rowBounds[ri + 1];
            const cellHeightCm = Math.round(rowTopCm - rowBotCm);
            const cellY1 = oy + dH - rowTopCm * sc;
            const cellY2 = oy + dH - rowBotCm * sc;
            const cellH = cellY2 - cellY1;
            if (cellHeightCm > 0 && cellH > 14) {
                p.push(`<text x="${(ox+dW/2).toFixed(1)}" y="${((cellY1+cellY2)/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${DIM_C}" opacity="0.75">${cellHeightCm}</text>`);
            }
        }

        // Dimension lines
        const dimY = oy + dH + 22;
        makeDimH(p, ox, ox + dW, dimY, `${Math.round(diagW)}`);
        makeDimV(p, ox - 54, oy, oy + dH, `${Math.round(cH)}`);
        if (pH > 0) makeDimV(p, ox + dW + 18, oy + dH - pH*sc, oy + dH, `${Math.round(pH)}`);
        // Also show the actual corner size
        makeDimH(p, ox, ox + dW, oy - 16, `${Math.round(fc.fcSize)} × ${Math.round(fc.fcSize)}`);

        pages.push({ label: fc.label, svgParts: p });
    });

    // ---- Additional wing front-view pages (for wings attached to full_corner corners) ----
    // These wings have their own columns and need a standard front-view page.
    const fcAdditionalWings = [];
    if (hasLeft  && lPos === 'full_corner' && lW > 0) fcAdditionalWings.push({ wd: leftWing,  label: 'שרטוט חזית — כנף שמאל (המשך פינה)', fill: FILL_WING_L, w: lW, h: cH, d: lD });
    if (hasRight && rPos === 'full_corner' && rW > 0) fcAdditionalWings.push({ wd: rightWing, label: 'שרטוט חזית — כנף ימין (המשך פינה)',  fill: FILL_WING_R, w: rW, h: cH, d: rD });

    fcAdditionalWings.forEach((wg) => {
        const p = [];
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN;
        const pw = SVG_W - MARGIN * 2;

        const sc = Math.min((pw - PAD*2) / Math.max(wg.w,1), (drawAreaH - PAD*2) / Math.max(wg.h,1));
        const dW = wg.w * sc, dH = wg.h * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        // Cabinet body
        makeRect(p, ox, oy, dW, dH, wg.fill, STROKE, 2);
        // Plinth
        if (pH > 0) makeRect(p, ox, oy + dH - pH*sc, dW, pH*sc, '#cbd5e1', STROKE, 1);

        // Columns, shelves, hangers & drawers
        const cols = (wg.wd && wg.wd.columns) ? wg.wd.columns : [];
        const colXPositions = [];
        let colX = ox;
        cols.forEach((col, ci) => {
            const colW = (col.width || wg.w) * sc;
            const colPlinthH = col.noPlinth ? 0 : pH;
            colXPositions.push({ x1: colX, x2: colX + colW, wCm: Math.round(col.width || wg.w) });

            if (ci > 0) makeVline(p, colX, oy, oy + dH);

            (col.shelvesY || []).forEach(sy => {
                makeShelfLine(p, colX, oy + dH - sy*sc, colX + colW);
            });

            const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
            const rowBounds = [colPlinthH, ...shelvesArr, wg.h];
            const numRows = rowBounds.length - 1;
            for (let ri = 0; ri < numRows; ri++) {
                const rowBotCm = rowBounds[ri];
                const rowTopCm = rowBounds[ri + 1];
                const cellHeightCm = Math.round(rowTopCm - rowBotCm);
                const cellY1 = oy + dH - rowTopCm * sc;
                const cellY2 = oy + dH - rowBotCm * sc;
                const cellH = cellY2 - cellY1;
                const cellCX = colX + colW / 2;

                const comp = col.compartments ? col.compartments[ri] : null;
                const cellType = comp ? (comp.type || 'empty') : 'empty';

                if (cellType === 'hanging') {
                    const rodTopY  = cellY1 + 4;
                    const rodBotY  = cellY1 + cellH * 0.32;
                    const rodX     = cellCX;
                    const hRodX1   = colX + 4;
                    const hRodX2   = colX + colW - 4;
                    p.push(`<line x1="${rodX.toFixed(1)}" y1="${rodTopY.toFixed(1)}" x2="${rodX.toFixed(1)}" y2="${rodBotY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodBotY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodBotY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodBotY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodBotY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                } else if (cellType === 'sorbet') {
                    // סורבטו — מנגנון תלייה מתרומם (ממורכז אנכית בתא)
                    const mechH  = cellH * 0.5;
                    const mechY1 = cellY1 + (cellH - mechH) / 2;
                    const mechY2 = mechY1 + mechH;
                    const boxH   = Math.min(mechH * 0.2, 8);
                    const boxW   = Math.min(colW * 0.1, 7);
                    const boxY   = mechY2 - boxH;                 // בלוקי דיור בתחתית המנגנון
                    const boxLX  = colX + 4;
                    const boxRX  = colX + colW - 4 - boxW;
                    p.push(`<rect x="${boxLX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    p.push(`<rect x="${boxRX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                    const hRodY  = mechY1;                        // מוט אופקי בראש המנגנון
                    const hRodX1 = boxLX + boxW / 2;
                    const hRodX2 = boxRX + boxW / 2;
                    p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${hRodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                    p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                    p.push(`<line x1="${(boxLX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxLX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    p.push(`<line x1="${(boxRX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxRX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                    const handleW  = Math.min(colW * 0.07, 5);
                    const handleH  = mechH * 0.6;
                    const handleX  = (hRodX1 + hRodX2) / 2 - handleW / 2;
                    p.push(`<rect x="${handleX.toFixed(1)}" y="${hRodY.toFixed(1)}" width="${handleW.toFixed(1)}" height="${handleH.toFixed(1)}" fill="${STROKE}" rx="1" opacity="0.75"/>`);
                    if (cellH > 25) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">סורבטו</text>`);
                } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                    const drawerCount = comp.count || 2;
                    const dh = cellH / drawerCount;
                    for (let di = 0; di < drawerCount; di++) {
                        const dy = cellY1 + di * dh;
                        makeRect(p, colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                        const hndW = Math.min(colW * 0.35, 22);
                        const hndX = colX + (colW - hndW) / 2;
                        const hndY = dy + dh * 0.5;
                        p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                    }
                }

                if (cellHeightCm > 0 && cellH > 14) {
                    const lblCX = colX + colW / 2;
                    const lblCY = (cellY1 + cellY2) / 2 + 4;
                    p.push(`<text x="${lblCX.toFixed(1)}" y="${lblCY.toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${DIM_C}" opacity="0.75">${cellHeightCm}</text>`);
                }
            }
            colX += colW;
        });

        // Dimension lines
        const dimY = oy + dH + 22;
        makeDimH(p, ox, ox + dW, dimY, `${Math.round(wg.w)}`);
        if (colXPositions.length > 1) {
            colXPositions.forEach(cp => makeDimH(p, cp.x1, cp.x2, oy - 16, `${cp.wCm}`));
        }
        makeDimV(p, ox - 54, oy, oy + dH, `${Math.round(wg.h)}`);
        if (pH > 0) {
            makeDimV(p, ox + dW + 18, oy + dH - pH*sc, oy + dH, `${Math.round(pH)}`);
        }

        pages.push({ label: wg.label, svgParts: p });
    });

    // ---- Corner unit page (שולחן פינתי / שידת מגירות פינתית) ----
    if (state.corner && state.corner.side !== 'none') {
        const cu = state.corner;
        const cuW = cu.width  || 60;
        const cuH = cu.height || 90;
        const cuD = cu.depth  || cD;
        const cuSideLabel = cu.side === 'right' ? 'ימין' : 'שמאל';
        const cuTypeLabel = cu.type === 'desk' ? 'שולחן פינתי' : 'שידת מגירות פינתית';
        const cuLabel = `שרטוט חזית — ${cuTypeLabel} (${cuSideLabel})`;
        const cuFill = cu.type === 'desk' ? '#fef9c3' : '#f0fdf4';

        const p = [];
        const drawAreaY = 65;
        const drawAreaH = PAGE_H - drawAreaY - MARGIN;
        const pw = SVG_W - MARGIN * 2;
        const sc = Math.min((pw - PAD*2) / Math.max(cuW, 1), (drawAreaH - PAD*2) / Math.max(cuH, 1));
        const dW = cuW * sc, dH = cuH * sc;
        const ox = MARGIN + (pw - dW) / 2;
        const oy = drawAreaY + (drawAreaH - dH) / 2;

        // Cabinet body
        makeRect(p, ox, oy, dW, dH, cuFill, STROKE, 2);
        // Plinth
        if (pH > 0) makeRect(p, ox, oy + dH - pH*sc, dW, pH*sc, '#cbd5e1', STROKE, 1);

        if (cu.type === 'desk') {
            // Desk surface at cu.height (full height = desk surface height)
            const deskSurfY = oy; // desk surface is at top of unit
            // Open area below desk surface (the whole unit is open workspace)
            makeRect(p, ox, oy, dW, dH - pH*sc, 'white', STROKE_THIN, 0.5);
            // Desk surface line (top board)
            p.push(`<line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${(ox+dW).toFixed(1)}" y2="${oy.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
            // Label
            p.push(`<text x="${(ox+dW/2).toFixed(1)}" y="${(oy+dH/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="${STROKE}" opacity="0.5">שולחן פינתי</text>`);
        } else {
            // Drawer unit: show drawers stacked
            const numDrawers = cu.drawerCount || 4;
            const innerH = cuH - pH - 1.8 * 2; // subtract plinth and top/bottom boards
            const drawerH = (innerH - 0.4 * (numDrawers - 1)) / numDrawers;
            for (let di = 0; di < numDrawers; di++) {
                const drawerBotCm = pH + 1.8 + di * (drawerH + 0.4);
                const drawerTopCm = drawerBotCm + drawerH;
                const dy1 = oy + dH - drawerTopCm * sc;
                const dy2 = oy + dH - drawerBotCm * sc;
                const dh = dy2 - dy1;
                makeRect(p, ox + 2, dy1 + 1, dW - 4, dh - 2, 'rgba(255,255,255,0.6)', STROKE_THIN, 0.8);
                // Handle
                const hndW = Math.min(dW * 0.4, 30);
                const hndX = ox + (dW - hndW) / 2;
                const hndY = dy1 + dh * 0.5;
                p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
            }
        }

        // Dimensions
        const dimY = oy + dH + 20;
        makeDimH(p, ox, ox + dW, dimY, `${Math.round(cuW)}`);
        makeDimV(p, ox - 34, oy, oy + dH, `${Math.round(cuH)}`);
        if (pH > 0) makeDimV(p, ox + dW + 18, oy + dH - pH*sc, oy + dH, `${Math.round(pH)}`);

        pages.push({ label: cuLabel, svgParts: p });
    }

    // ---- Side cabinet front-view pages ----
    {
        const scData = centerWing ? centerWing.sideCabinet : null;
        const hasSC = scData && scData.side !== 'none';
        if (hasSC) {
            const scSideVal = scData.side; // 'right', 'left', or 'both'
            const scH  = scData.globalHeight || cH;
            const scD  = scData.depth  || cD;
            const scPH = scData.plinthHeight || pH;
            const FILL_SC = '#e0f2fe'; // light blue

            const _drawSCPage = (sideLbl, scW) => {
                const scLabel = `שרטוט חזית — ארון צד ${sideLbl}`;
                const p = [];
                const drawAreaY = 65;
                const drawAreaH = PAGE_H - drawAreaY - MARGIN;
                const pw = SVG_W - MARGIN * 2;
                const scScale = Math.min((pw - PAD*2) / Math.max(scW, 1), (drawAreaH - PAD*2) / Math.max(scH, 1));
                const dW = scW * scScale, dH = scH * scScale;
                const ox = MARGIN + (pw - dW) / 2;
                const oy = drawAreaY + (drawAreaH - dH) / 2;

                // Cabinet body
                makeRect(p, ox, oy, dW, dH, FILL_SC, STROKE, 2);
                // Plinth
                if (scPH > 0) makeRect(p, ox, oy + dH - scPH*scScale, dW, scPH*scScale, '#cbd5e1', STROKE, 1);

                // Columns, shelves, hangers & drawers
                const cols = (scData.columns && scData.columns.length > 0) ? scData.columns : [];
                const colXPositions = [];
                let colX = ox;
                cols.forEach((col, ci) => {
                    const colW = (col.width || scW) * scScale;
                    const colPlinthH = col.noPlinth ? 0 : scPH;
                    colXPositions.push({ x1: colX, x2: colX + colW, wCm: Math.round(col.width || scW) });

                    if (ci > 0) makeVline(p, colX, oy, oy + dH);

                    (col.shelvesY || []).forEach(sy => {
                        makeShelfLine(p, colX, oy + dH - sy*scScale, colX + colW);
                    });

                    const shelvesArr = (col.shelvesY || []).slice().sort((a,b) => a-b);
                    const rowBounds = [colPlinthH, ...shelvesArr, scH];
                    const numRows = rowBounds.length - 1;
                    for (let ri = 0; ri < numRows; ri++) {
                        const rowBotCm = rowBounds[ri];
                        const rowTopCm = rowBounds[ri + 1];
                        const cellHeightCm = Math.round(rowTopCm - rowBotCm);
                        const cellY1 = oy + dH - rowTopCm * scScale;
                        const cellY2 = oy + dH - rowBotCm * scScale;
                        const cellH  = cellY2 - cellY1;
                        const cellCX = colX + colW / 2;

                        const comp = col.compartments ? col.compartments[ri] : null;
                        const cellType = comp ? (comp.type || 'empty') : 'empty';

                        if (cellType === 'hanging') {
                            const rodY  = cellY1 + cellH * 0.25;
                            const hRodX1 = colX + 4, hRodX2 = colX + colW - 4;
                            p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${rodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${rodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                            p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                            p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${rodY.toFixed(1)}" r="2" fill="${STROKE}"/>`);
                        } else if (cellType === 'sorbet') {
                            // סורבטו — מנגנון תלייה מתרומם (ממורכז אנכית בתא)
                            const mechH  = cellH * 0.5;
                            const mechY1 = cellY1 + (cellH - mechH) / 2;
                            const mechY2 = mechY1 + mechH;
                            const boxH   = Math.min(mechH * 0.2, 8);
                            const boxW   = Math.min(colW * 0.1, 7);
                            const boxY   = mechY2 - boxH;                 // בלוקי דיור בתחתית המנגנון
                            const boxLX  = colX + 4;
                            const boxRX  = colX + colW - 4 - boxW;
                            p.push(`<rect x="${boxLX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                            p.push(`<rect x="${boxRX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" fill="${STROKE}" rx="1"/>`);
                            const hRodY  = mechY1;                        // מוט אופקי בראש המנגנון
                            const hRodX1 = boxLX + boxW / 2;
                            const hRodX2 = boxRX + boxW / 2;
                            p.push(`<line x1="${hRodX1.toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${hRodX2.toFixed(1)}" y2="${hRodY.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`);
                            p.push(`<circle cx="${hRodX1.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                            p.push(`<circle cx="${hRodX2.toFixed(1)}" cy="${hRodY.toFixed(1)}" r="2.5" fill="${STROKE}"/>`);
                            p.push(`<line x1="${(boxLX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxLX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                            p.push(`<line x1="${(boxRX + boxW/2).toFixed(1)}" y1="${hRodY.toFixed(1)}" x2="${(boxRX + boxW/2).toFixed(1)}" y2="${boxY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.5"/>`);
                            const handleW  = Math.min(colW * 0.07, 5);
                            const handleH  = mechH * 0.6;
                            const handleX  = (hRodX1 + hRodX2) / 2 - handleW / 2;
                            p.push(`<rect x="${handleX.toFixed(1)}" y="${hRodY.toFixed(1)}" width="${handleW.toFixed(1)}" height="${handleH.toFixed(1)}" fill="${STROKE}" rx="1" opacity="0.75"/>`);
                            if (cellH > 25) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1 + 10).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${STROKE}" opacity="0.55">סורבטו</text>`);
                        } else if (cellType === 'internal_drawers' || cellType === 'external_drawers') {
                            const drawerCount = comp.count || 2;
                            const dh = cellH / drawerCount;
                            for (let di = 0; di < drawerCount; di++) {
                                const dy = cellY1 + di * dh;
                                makeRect(p, colX + 2, dy + 1, colW - 4, dh - 2, 'rgba(255,255,255,0.5)', STROKE_THIN, 0.8);
                                const hndW = Math.min(colW * 0.35, 22);
                                const hndX = colX + (colW - hndW) / 2;
                                const hndY = dy + dh * 0.5;
                                p.push(`<line x1="${hndX.toFixed(1)}" y1="${hndY.toFixed(1)}" x2="${(hndX+hndW).toFixed(1)}" y2="${hndY.toFixed(1)}" stroke="${STROKE}" stroke-width="1.8"/>`);
                            }
                        } else if (cellType === 'open_cell') {
                            const pad = 5;
                            const fx = colX + pad, fy = cellY1 + pad, fw = colW - pad*2, fh = cellH - pad*2;
                            if (fw > 2 && fh > 2) p.push(`<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="${STROKE}" stroke-width="1.2"/>`);
                            if (cellH > 18) p.push(`<text x="${cellCX.toFixed(1)}" y="${(cellY1+20).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">כוורת</text>`);
                        }

                        if (cellHeightCm > 0 && cellH > 14) {
                            p.push(`<text x="${cellCX.toFixed(1)}" y="${((cellY1+cellY2)/2+4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${DIM_C}" opacity="0.75">${cellHeightCm}</text>`);
                        }
                    }
                    colX += colW;
                });

                // Dimension lines
                const dimY = oy + dH + 22;
                makeDimH(p, ox, ox + dW, dimY, `${Math.round(scW)}`);
                if (colXPositions.length > 1) {
                    colXPositions.forEach(cp => makeDimH(p, cp.x1, cp.x2, oy - 16, `${cp.wCm}`));
                }
                makeDimV(p, ox - 54, oy, oy + dH, `${Math.round(scH)}`);
                if (scPH > 0) makeDimV(p, ox + dW + 18, oy + dH - scPH*scScale, oy + dH, `${Math.round(scPH)}`);

                pages.push({ label: scLabel, svgParts: p });
            };

            if (scSideVal === 'right' || scSideVal === 'both') _drawSCPage('ימין',  scData.widthRight || scData.width || 40);
            if (scSideVal === 'left'  || scSideVal === 'both') _drawSCPage('שמאל', scData.widthLeft  || scData.width || 40);
        }
    }

    // ---- SLIDING WARDROBE BLUEPRINT PAGE ----
    if (state.presetId === 'sliding') {
        const wing = state.wings.center;
        if (wing && wing.slidingDoor && wing.slidingDoor.enabled) {
            const sd = wing.slidingDoor;
            const p = [];
            const drawAreaY = 65;
            const drawAreaH = PAGE_H - drawAreaY - MARGIN;
            const pw = SVG_W - MARGIN * 2;

            const sdW = wing.width;
            const sdH = wing.globalHeight;
            const sdPlinth = wing.plinthHeight || 7;
            const sdNumDoors = sd.numDoors || 2;
            const sdDoorW = sdW / sdNumDoors;
            const profileT = 3.5;

            // Scale to fit
            const scaleX = (pw - PAD * 2) / Math.max(sdW, 1);
            const scaleY = (drawAreaH - PAD * 2) / Math.max(sdH, 1);
            const sc = Math.min(scaleX, scaleY);
            const ox = MARGIN + (pw - sdW * sc) / 2;
            const oy = drawAreaY + (drawAreaH - sdH * sc) / 2;

            // Panel border
            p.push(`<rect x="${MARGIN}" y="${drawAreaY}" width="${pw}" height="${drawAreaH}" rx="4" fill="white" stroke="${STROKE_THIN}" stroke-width="1"/>`);

            // Cabinet body (background)
            makeRect(p, ox, oy, sdW * sc, sdH * sc, FILL_CAB, STROKE, 2);

            // Plinth (bottom rail)
            makeRect(p, ox, oy + (sdH - sdPlinth) * sc, sdW * sc, sdPlinth * sc, '#c8c8c8', STROKE, 1.5);
            p.push(`<text x="${(ox + sdW * sc / 2).toFixed(1)}" y="${(oy + (sdH - sdPlinth / 2) * sc + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${STROKE}">צוקל ${Math.round(sdPlinth)} ס"מ</text>`);

            // Top rail
            makeRect(p, ox, oy, sdW * sc, profileT * sc, '#c8c8c8', STROKE, 1.5);

            // Left profile
            makeRect(p, ox, oy, profileT * sc, sdH * sc, '#aaaaaa', STROKE, 1.5);
            // Right profile
            makeRect(p, ox + (sdW - profileT) * sc, oy, profileT * sc, sdH * sc, '#aaaaaa', STROKE, 1.5);

            // Doors
            const doorAreaW = sdW - profileT * 2;
            const doorAreaH = sdH - sdPlinth - profileT;
            const doorW = doorAreaW / sdNumDoors;
            const doorColors = ['#e8e8e8', '#d8d8d8']; // alternating tracks

            for (let i = 0; i < sdNumDoors; i++) {
                const dx = ox + (profileT + doorW * i) * sc;
                const dy = oy + profileT * sc;
                const dw = doorW * sc;
                const dh = doorAreaH * sc;
                const fillColor = doorColors[i % 2];
                makeRect(p, dx, dy, dw, dh, fillColor, STROKE, 1);

                // Door panel type label
                const panelLabel = sd.doorPanelType === 'glass' ? 'זכוכית' : sd.doorPanelType === 'mirror' ? 'מראה' : sd.doorPanelType === 'mirror_dark' ? 'מראה כהה' : 'חלק';
                p.push(`<text x="${(dx + dw / 2).toFixed(1)}" y="${(dy + dh / 2).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="${STROKE}" opacity="0.7">${panelLabel}</text>`);

                // Vertical divider if door > 110cm
                if (doorW > 110) {
                    const divX = dx + (doorW * 2 / 3) * sc;
                    p.push(`<line x1="${divX.toFixed(1)}" y1="${dy.toFixed(1)}" x2="${divX.toFixed(1)}" y2="${(dy + dh).toFixed(1)}" stroke="${STROKE}" stroke-width="1.5" stroke-dasharray="4,3"/>`);
                    p.push(`<text x="${(divX + 4).toFixed(1)}" y="${(dy + dh / 2).toFixed(1)}" font-family="${FONT}" font-size="12" fill="${STROKE}" opacity="0.6">מחיצה</text>`);
                }
            }

            // Dimension lines
            // Total width
            makeDimH(p, ox, ox + sdW * sc, oy + sdH * sc + 22, `${Math.round(sdW)} ס"מ`);
            // Total height
            makeDimV(p, ox - 40, oy, oy + sdH * sc, `${Math.round(sdH)} ס"מ`);
            // Plinth height
            makeDimV(p, ox + sdW * sc + 18, oy + (sdH - sdPlinth) * sc, oy + sdH * sc, `${Math.round(sdPlinth)} ס"מ`);
            // Door widths
            for (let i = 0; i < sdNumDoors; i++) {
                const dx1 = ox + (profileT + doorW * i) * sc;
                const dx2 = dx1 + doorW * sc;
                makeDimH(p, dx1, dx2, oy - 16, `${Math.round(doorW)}`);
            }

            // Info text: profile color + panel type
            const profileColorHeb = { nickel: 'ניקל מוברש', black: 'שחור', white: 'לבן', cream: 'שמנת', gold_matte: 'זהב מט' };
            const panelTypeHeb = { solid: 'חלק', glass: 'זכוכית', mirror: 'מראה', mirror_dark: 'מראה כהה' };
            p.push(`<text x="${(MARGIN + 10).toFixed(1)}" y="${(PAGE_H - MARGIN - 30).toFixed(1)}" font-family="${FONT}" font-size="11" fill="${STROKE}">פרזול: ${profileColorHeb[sd.profileColor] || sd.profileColor} | פנל: ${panelTypeHeb[sd.doorPanelType] || sd.doorPanelType} | ${sdNumDoors} דלתות</text>`);

            pages.push({ label: 'ארון הזזה — חזית', svgParts: p });
        }
    }

    // Reorder: front views first, top view (מבט עליון) last
    const topViewIdx = pages.findIndex(pg => pg.label && pg.label.includes('מבט עליון'));
    if (topViewIdx >= 0) {
        const topPage = pages.splice(topViewIdx, 1)[0];
        pages.push(topPage);
    }

    // Wrap each page into a full SVG string
    const total = pages.length;
    return pages.map((pg, i) => ({
        label: pg.label,
        svg: wrapSVG(pg.svgParts, pg.label, i + 1, total)
    }));
};

function addBlueprintSprites() {
    // Clear old sprites from cabinetGroup (none added now — overlay handles it)
    // Show/hide the blueprint overlay layer
    const bpLayer = document.getElementById('blueprint-layer');
    if (!bpLayer) return;
    if (state.viewMode !== 'blueprint') {
        bpLayer.style.display = 'none';
        bpLayer.innerHTML = '';
        return;
    }
    bpLayer.style.display = 'block';
    // Render after a short delay so Three.js has finished its first render
    // and we can project coordinates accurately
    requestAnimationFrame(() => _renderBlueprintOverlay());
}

function _project3Dto2D(x3d, y3d, z3d) {
    // Project a 3D world point to 2D canvas pixel coordinates
    const vec = new THREE.Vector3(x3d, y3d, z3d);
    vec.project(camera); // NDC: -1..1
    const cw = renderer.domElement.clientWidth;
    const ch = renderer.domElement.clientHeight;
    return {
        x: (vec.x + 1) / 2 * cw,
        y: (-vec.y + 1) / 2 * ch
    };
}

function _renderBlueprintOverlay() {
    if (state.viewMode !== 'blueprint') return;
    const bpLayer = document.getElementById('blueprint-layer');
    if (!bpLayer) return;

    const cw = renderer.domElement.clientWidth;
    const ch = renderer.domElement.clientHeight;

    // SVG arrowhead marker size
    const ARROW = 7;
    const STROKE = '#1e3a5f';
    const STROKE_W = 1.5;
    const FONT = "13px 'Rubik', Tahoma, sans-serif";
    const FONT_BOLD = "bold 13px 'Rubik', Tahoma, sans-serif";
    const EXT_OFFSET = 6;   // gap between cabinet edge and extension line start
    const DIM_OFFSET = 22;  // how far the dimension line sits from the cabinet edge

    let svgParts = [];

    // SVG defs: arrowhead markers
    svgParts.push(`<defs>
      <marker id="arr-end" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="${ARROW-1}" refY="${ARROW/2}" orient="auto">
        <path d="M0,0 L0,${ARROW} L${ARROW},${ARROW/2} z" fill="${STROKE}"/>
      </marker>
      <marker id="arr-start" markerWidth="${ARROW}" markerHeight="${ARROW}" refX="1" refY="${ARROW/2}" orient="auto">
        <path d="M${ARROW},0 L${ARROW},${ARROW} L0,${ARROW/2} z" fill="${STROKE}"/>
      </marker>
    </defs>`);

    state.bpData.forEach(d => {
        if (d.type === 'num') {
            // Cell number badge — small circle with number
            const p = _project3Dto2D(d.x, d.y, 2);
            const r = 11;
            svgParts.push(`
              <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="white" stroke="#94a3b8" stroke-width="1.2"/>
              <text x="${p.x.toFixed(1)}" y="${(p.y + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
                font-family="'Rubik',Tahoma,sans-serif" font-size="11" font-weight="bold" fill="#475569">${d.val}</text>
            `);

        } else if (d.type === 'width') {
            // Horizontal dimension line below the cabinet/column
            // d.x = center X of column, d.y = Y position (negative = below cabinet)
            // We need left and right edges — stored as d.x1/d.x2 if available, else use d.x ± d.halfW
            const halfW = d.halfW !== undefined ? d.halfW : (d.w !== undefined ? d.w / 2 : 0);
            const leftX  = d.x - halfW;
            const rightX = d.x + halfW;
            const dimY   = d.y; // already offset below cabinet in 3D

            const pL  = _project3Dto2D(leftX,  dimY, 2);
            const pR  = _project3Dto2D(rightX, dimY, 2);
            const pLC = _project3Dto2D(leftX,  dimY + EXT_OFFSET, 2);
            const pRC = _project3Dto2D(rightX, dimY + EXT_OFFSET, 2);

            // Extension lines (short vertical ticks)
            svgParts.push(`<line x1="${pLC.x.toFixed(1)}" y1="${pLC.y.toFixed(1)}" x2="${pL.x.toFixed(1)}" y2="${(pL.y + DIM_OFFSET).toFixed(1)}"
              stroke="${STROKE}" stroke-width="1" stroke-dasharray="none"/>`);
            svgParts.push(`<line x1="${pRC.x.toFixed(1)}" y1="${pRC.y.toFixed(1)}" x2="${pR.x.toFixed(1)}" y2="${(pR.y + DIM_OFFSET).toFixed(1)}"
              stroke="${STROKE}" stroke-width="1"/>`);

            // Dimension line with arrows
            const dimLineY = (pL.y + DIM_OFFSET).toFixed(1);
            svgParts.push(`<line x1="${pL.x.toFixed(1)}" y1="${dimLineY}" x2="${pR.x.toFixed(1)}" y2="${dimLineY}"
              stroke="${STROKE}" stroke-width="${STROKE_W}" marker-start="url(#arr-start)" marker-end="url(#arr-end)"/>`);

            // Label
            const midX = ((pL.x + pR.x) / 2).toFixed(1);
            const labelY = (parseFloat(dimLineY) - 6).toFixed(1);
            svgParts.push(`
              <rect x="${(parseFloat(midX) - 22).toFixed(1)}" y="${(parseFloat(labelY) - 9).toFixed(1)}" width="44" height="16" rx="3" fill="white"/>
              <text x="${midX}" y="${labelY}" text-anchor="middle" dominant-baseline="auto"
                font-family="'Rubik',Tahoma,sans-serif" font-size="12" font-weight="bold" fill="${STROKE}">${d.val}</text>
            `);

        } else if (d.type === 'height' || d.type === 'overall-height') {
            // Vertical dimension line to the left of the column/cabinet
            // d.x = X position (already offset left), d.y = center Y of compartment
            const halfH = d.halfH !== undefined ? d.halfH : (d.h !== undefined ? d.h / 2 : 0);
            const topY    = d.y + halfH;
            const bottomY = d.y - halfH;
            const dimX    = d.x;

            const pT  = _project3Dto2D(dimX, topY,    2);
            const pB  = _project3Dto2D(dimX, bottomY, 2);
            const pTC = _project3Dto2D(dimX + EXT_OFFSET, topY,    2);
            const pBC = _project3Dto2D(dimX + EXT_OFFSET, bottomY, 2);

            // Extension lines
            svgParts.push(`<line x1="${pTC.x.toFixed(1)}" y1="${pTC.y.toFixed(1)}" x2="${(pT.x - DIM_OFFSET).toFixed(1)}" y2="${pT.y.toFixed(1)}"
              stroke="${STROKE}" stroke-width="1"/>`);
            svgParts.push(`<line x1="${pBC.x.toFixed(1)}" y1="${pBC.y.toFixed(1)}" x2="${(pB.x - DIM_OFFSET).toFixed(1)}" y2="${pB.y.toFixed(1)}"
              stroke="${STROKE}" stroke-width="1"/>`);

            // Dimension line with arrows
            const dimLineX = (pT.x - DIM_OFFSET).toFixed(1);
            svgParts.push(`<line x1="${dimLineX}" y1="${pT.y.toFixed(1)}" x2="${dimLineX}" y2="${pB.y.toFixed(1)}"
              stroke="${STROKE}" stroke-width="${STROKE_W}" marker-start="url(#arr-start)" marker-end="url(#arr-end)"/>`);

            // Label (rotated)
            const midY = ((pT.y + pB.y) / 2).toFixed(1);
            const labelX = (parseFloat(dimLineX) - 8).toFixed(1);
            svgParts.push(`
              <rect x="${(parseFloat(labelX) - 8).toFixed(1)}" y="${(parseFloat(midY) - 22).toFixed(1)}" width="16" height="44" rx="3" fill="white"/>
              <text x="${labelX}" y="${midY}" text-anchor="middle" dominant-baseline="middle"
                font-family="'Rubik',Tahoma,sans-serif" font-size="12" font-weight="bold" fill="${STROKE}"
                transform="rotate(-90,${labelX},${midY})">${d.val}</text>
            `);

        } else if (d.type === 'corner-front-label') {
            // Label badge in the center of the corner unit area on the front view
            const p = _project3Dto2D(d.x, d.y, 0.3);
            const labelW = Math.max(d.val.length * 7 + 16, 80);
            svgParts.push(`
              <rect x="${(p.x - labelW/2).toFixed(1)}" y="${(p.y - 10).toFixed(1)}" width="${labelW}" height="20" rx="4" fill="#fef08a" stroke="#b45309" stroke-width="1.2" opacity="0.9"/>
              <text x="${p.x.toFixed(1)}" y="${(p.y + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
                font-family="'Rubik',Tahoma,sans-serif" font-size="11" font-weight="bold" fill="#92400e">${d.val}</text>
            `);
        }
    });

    bpLayer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" style="position:absolute;top:0;left:0;overflow:visible;">${svgParts.join('')}</svg>`;
}
function _captureBlueprintWithOverlay() {
    // Returns a Promise<string> (data URL)
    const glCanvas = renderer.domElement;
    const cw = glCanvas.width;
    const ch = glCanvas.height;

    // Snapshot the WebGL canvas pixels NOW (before any async gap)
    const composite = document.createElement('canvas');
    composite.width = cw;
    composite.height = ch;
    const ctx = composite.getContext('2d');
    ctx.drawImage(glCanvas, 0, 0);

    // Get the SVG from the blueprint overlay layer
    const bpLayer = document.getElementById('blueprint-layer');
    const svgEl = bpLayer ? bpLayer.querySelector('svg') : null;

    if (!svgEl) {
        return Promise.resolve(composite.toDataURL('image/png'));
    }

    // Serialize SVG → data URL
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, cw, ch);
            resolve(composite.toDataURL('image/png'));
        };
        img.onerror = () => {
            // Fallback: return without overlay
            resolve(composite.toDataURL('image/png'));
        };
        img.src = svgDataUrl;
    });
}

// ---- Smooth camera animation ----
// window._camAnim is read each frame by animate() in ui.js
// Must use window.* because let-variables are script-scoped and not visible across <script> tags
window._camAnim = null;

window.animateCameraTo = function(toPos, toTarget, duration, onDone) {
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    const toPosVec = new THREE.Vector3(...toPos);
    const toTargetVec = new THREE.Vector3(...toTarget);
    // Immediately snap controls target so OrbitControls doesn't fight the animation
    controls.target.copy(toTargetVec);
    controls.enableDamping = false;
    window._camAnim = {
        fromPos,
        fromTarget,
        toPos: toPosVec,
        toTarget: toTargetVec,
        t: 0,
        duration: duration || 0.6,
        onDone: onDone || null
    };
};

function _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
// Note: animate() loop lives in ui.js — _camAnim is read there each frame.
