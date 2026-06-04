
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
        // Optional drawers under desk surface — same logic as side desk (engine.js)
        const numDeskDrawers = cu.deskDrawerCount || 0;
        if (numDeskDrawers > 0) {
            const drawerH = cu.deskDrawerHeight || 13;
            const gap = 0.4;
            // Drawers span the full inner X width, side by side (same as side desk spans width side by side)
            const innerW = cuD - t;                        // inner width in X (excluding side wall)
            const drawerW = (innerW - gap * (numDeskDrawers + 1)) / numDeskDrawers;
            const drawerBottomY = deskH - t - drawerH;
            const drawerCenterY = drawerBottomY + drawerH / 2;
            // Drawer fronts face the opening: local Z = -cuW/2 (front face of the corner unit)
            const fZ = -cuW / 2 - t / 2 - 0.1;
            const handleMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 });
            for (let i = 0; i < numDeskDrawers; i++) {
                // X center of each drawer, starting from inner open side (sign*(-cuD/2)) toward side wall
                const dX = sign * (-cuD / 2 + gap + drawerW / 2 + i * (drawerW + gap));
                // Drawer front: width in X, height in Y, thickness in Z
                const dMesh = addBoard(drawerW, drawerH - 0.5, t, dX, drawerCenterY, fZ, matExternal);
                // Handle: horizontal bar along X axis
                const barLen = Math.min(drawerW * 0.55, 18);
                const barR = 0.35;
                const postH = 1.2;
                const bar = new THREE.Mesh(
                    new THREE.CylinderGeometry(barR, barR, barLen, 12).rotateZ(Math.PI / 2),
                    handleMat
                );
                bar.position.set(0, 0, -(t / 2 + postH + barR * 0.5));
                dMesh.add(bar);
                // Two end posts along Z connecting bar to drawer face
                [-barLen / 2, barLen / 2].forEach(px => {
                    const post = new THREE.Mesh(
                        new THREE.CylinderGeometry(barR, barR, postH, 10).rotateX(Math.PI / 2),
                        handleMat
                    );
                    post.position.set(px, 0, -(t / 2 + postH / 2));
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
    const makeLShape = (frontInset = 0, backInset = 0) => {
        // frontInset: how much to pull back from the front face (Z = frontD)
        // backInset: how much to pull back from the back face (Z = cd)
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(-sign * cw, 0);
        shape.lineTo(-sign * cw, frontD - frontInset);
        shape.lineTo(-sign * wingD, frontD - frontInset);
        shape.lineTo(-sign * wingD, cd - backInset);
        shape.lineTo(0, cd - backInset);
        shape.lineTo(0, 0);
        return shape;
    };

    // addLBoard: yTop = world Y of the board's top face; thick = board thickness (default t)
    const addLBoard = (yTop, mat, frontInset = 0, backInset = 0, thick = t) => {
        const geo = new THREE.ExtrudeGeometry(makeLShape(frontInset, backInset), { depth: thick, bevelEnabled: false });
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
    // Shelves are inset by t on front and back so their edges don't poke through the doors
    // fc.shelvesY stores center Y of each shelf; addLBoard expects top face = sy + t/2
    const shelvesY = fc.shelvesY || [];
    shelvesY.forEach(sy => addLBoard(sy + t / 2, matInternal, t, t));

    // ---- Split board (קושרת) — single L-shaped board of double thickness, centered at fc.splitY ----
    // Double thickness (2t) as one board, centered at fc.splitY to align with the adjacent wing's split board.
    // addLBoard(yTop, mat, 0, 0, thick): board occupies yTop-thick .. yTop
    // To center at fc.splitY with thick=2t: yTop = fc.splitY + t → occupies fc.splitY-t .. fc.splitY+t
    if (fc.splitY) {
        addLBoard(fc.splitY + t, matBody, 0, 0, 2 * t); // occupies fc.splitY-t .. fc.splitY+t
    }

    // ---- Compartment content ----
    const comps = fc.compartments || [];
    // Build allY: compartment Y boundaries.
    // When a split board (קושרת) exists at fc.splitY, we insert the split board boundaries
    // so that door spans are automatically broken at the split board.
    // The split board occupies Y from (fc.splitY - 2t) to fc.splitY.
    // We insert fc.splitY - 2t (bottom) and fc.splitY (top) as extra boundaries.
    // We also build a compIndexMap: for each allY row index, the corresponding fc.compartments index.
    let allY = [plinthH + t, ...shelvesY, colH - t];
    // compIndexMap[r] = index into fc.compartments for allY row r
    // Without split: compIndexMap[r] = r
    let compIndexMap = allY.slice(0, -1).map((_, i) => i);

    if (fc.splitY) {
        const splitBottom = fc.splitY - t; // bottom face of split board (2t thick, centered at fc.splitY)
        const splitTop    = fc.splitY + t; // top face of split board

        // Insert splitBottom and splitTop into allY (if not already present), then rebuild compIndexMap.
        // Strategy: build a merged sorted list of all boundaries, then assign comp indices.
        const mergedY = [...allY];
        if (!mergedY.some(y => Math.abs(y - splitBottom) < 0.01)) mergedY.push(splitBottom);
        if (!mergedY.some(y => Math.abs(y - splitTop)    < 0.01)) mergedY.push(splitTop);
        mergedY.sort((a, b) => a - b);

        // Rebuild compIndexMap: map each row in mergedY to a fc.compartments index.
        // Rows that fall entirely within the split board zone [splitBottom, splitTop] get index -1.
        // Other rows map to the original allY row index (before split insertion).
        const newCompMap = [];
        let compIdx = 0;
        for (let i = 0; i < mergedY.length - 1; i++) {
            const yBot = mergedY[i];
            const yTop = mergedY[i + 1];
            const midY = (yBot + yTop) / 2;
            if (midY >= splitBottom - 0.01 && midY <= splitTop + 0.01) {
                // This row is inside the split board zone
                newCompMap.push(-1);
            } else {
                newCompMap.push(compIdx);
                // Advance compIdx only when we cross an original allY boundary
                // (i.e., yTop is an original allY entry that is not splitBottom or splitTop)
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
        // Use compIndexMap to get the correct fc.compartments index for this allY row
        const ci = compIndexMap[r];
        if (ci < 0) continue; // split board zone — no compartment content
        const comp = comps[ci] || {};

        // Resolve content and door from new { content, door } structure
        // with backward compat for legacy { type } structure
        const compContent = comp.content !== undefined ? comp.content
            : (comp.type === 'cross_hanging' ? 'cross_hanging' : 'empty');
        const compDoor = comp.door !== undefined ? comp.door
            : (comp.type === 'door_regular' ? 'right'
            : comp.type === 'door_glass' ? 'right' : 'empty');
        const compDoorStyle = comp.doorStyle || (comp.type === 'door_glass' ? 'glass_melamine' : 'solid');

        if (compContent === 'cross_hanging') {
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
        }

    }

    // ---- FC Doors — per-row spans, grouped by consecutive rows with same door style ----
    if (state.hasDoors !== false) {
        const matExt = materials[wingData.materialExternal] || materials['white_matte'];

        // Build list of door spans: consecutive rows with same non-empty door.
        // allY has (numRows+1) entries; row r spans allY[r]..allY[r+1], valid rows: 0..(allY.length-2)
        // compIndexMap[r] = fc.compartments index for row r (-1 = split board zone, no door)
        // The split board zone rows (compIndexMap[r] === -1) act as natural span-breakers.
        const numRows = allY.length - 1;
        const doorSpans = [];
        let spanStart = -1;
        let spanStyle = 'solid';
        for (let r = 0; r < numRows; r++) {
            const ci = compIndexMap[r];
            // Split board zone row — force-break any open span
            if (ci < 0) {
                if (spanStart !== -1) {
                    doorSpans.push({ startR: spanStart, endR: r - 1, doorStyle: spanStyle });
                    spanStart = -1;
                }
                continue;
            }
            const comp = comps[ci] || {};
            const d = comp.door !== undefined ? comp.door
                : (comp.type === 'door_regular' ? 'right' : comp.type === 'door_glass' ? 'right' : 'empty');
            const ds = comp.doorStyle || (comp.type === 'door_glass' ? 'glass_melamine' : 'solid');
            if (d !== 'empty') {
                if (spanStart === -1) {
                    // Start a new span
                    spanStart = r; spanStyle = ds;
                } else if (ds !== spanStyle) {
                    // Style changed — flush current span, start new one
                    doorSpans.push({ startR: spanStart, endR: r - 1, doorStyle: spanStyle });
                    spanStart = r; spanStyle = ds;
                }
                // If same style, just extend the span (do nothing)
            } else {
                if (spanStart !== -1) {
                    // Gap — flush current span
                    doorSpans.push({ startR: spanStart, endR: r - 1, doorStyle: spanStyle });
                    spanStart = -1;
                }
            }
        }
        // Flush any open span at end
        if (spanStart !== -1) {
            doorSpans.push({ startR: spanStart, endR: numRows - 1, doorStyle: spanStyle });
        }

        doorSpans.forEach(span => {
            const fcDoorStyle = span.doorStyle;
            const isGlass = (fcDoorStyle === 'glass_melamine' || fcDoorStyle === 'glass_black' || fcDoorStyle === 'glass_gold');
            // allY entries are the inner faces of the bounding boards (top of bottom board = plinthH+t,
            // bottom of top board = colH-t, shelf centers for intermediate shelves).
            // For overlay doors, extend by t on each side to cover the full board thickness.
            const spanBottomY = allY[span.startR]   - t;
            const spanTopY    = allY[span.endR + 1] + t;
            const spanH = spanTopY - spanBottomY;
            const spanMidY = spanBottomY + spanH / 2;

            // Helper: build one door panel with optional frame
            const _makeFCDoor = (w, h, midY, posX, posZ, isVertical) => {
                const doorGroup = new THREE.Group();
                const fd = 1.5; // frame protrusion amount
                const fd_offset = (fcDoorStyle !== 'solid') ? fd : 0;

                // For Door 1 (horizontal, thin in Z): frame protrudes in +Z → shift group back by fd_offset in Z
                // For Door 2 (vertical, thin in X): group stays at wall position, frame bars offset in X
                if (isVertical) {
                    doorGroup.position.set(posX, midY, posZ);
                } else {
                    doorGroup.position.set(posX, midY, posZ - fd_offset);
                }
                fcGroup.add(doorGroup);

                if (!isGlass) {
                    // Solid base panel
                    const geo = isVertical
                        ? new THREE.BoxGeometry(t * 0.9, h, w)
                        : new THREE.BoxGeometry(w, h, t * 0.9);
                    const mat = matExt.clone ? matExt.clone() : matExt;
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeM));
                    doorGroup.add(mesh);
                }

                // Frame profiles (framed_melamine, glass_*)
                if (fcDoorStyle !== 'solid') {
                    const fw = (fcDoorStyle === 'framed_melamine') ? 8 : 4;

                    let frameMat;
                    if (fcDoorStyle === 'framed_melamine' || fcDoorStyle === 'glass_melamine') {
                        frameMat = matExt.clone ? matExt.clone() : matExt;
                    } else if (fcDoorStyle === 'glass_black') {
                        frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.15, roughness: 0.3 });
                    } else {
                        frameMat = new THREE.MeshStandardMaterial({ color: 0xe5ba70, metalness: 0.15, roughness: 0.3 });
                    }

                    if (isVertical) {
                        // Door 2: thin in X, wide in Z
                        // Frame protrudes in -sign*X direction (outward from cabinet)
                        // fx = outward X offset of frame center = -(t*0.45 + fd/2) * sign
                        const fx = -sign * (t * 0.45 + fd / 2);
                        // Top bar: spans full Z width (w)
                        const topGeo = new THREE.BoxGeometry(fd, fw, w);
                        const topM = new THREE.Mesh(topGeo, frameMat);
                        topM.position.set(fx, h / 2 - fw / 2, 0);
                        doorGroup.add(topM);
                        // Bottom bar
                        const botGeo = new THREE.BoxGeometry(fd, fw, w);
                        const botM = new THREE.Mesh(botGeo, frameMat);
                        botM.position.set(fx, -h / 2 + fw / 2, 0);
                        doorGroup.add(botM);
                        // Front edge bar (Z = -w/2 + fw/2)
                        const sideH2 = h - fw * 2;
                        const frontGeo = new THREE.BoxGeometry(fd, sideH2, fw);
                        const frontM = new THREE.Mesh(frontGeo, frameMat);
                        frontM.position.set(fx, 0, -w / 2 + fw / 2);
                        doorGroup.add(frontM);
                        // Back edge bar (Z = w/2 - fw/2)
                        const backGeo = new THREE.BoxGeometry(fd, sideH2, fw);
                        const backM = new THREE.Mesh(backGeo, frameMat);
                        backM.position.set(fx, 0, w / 2 - fw / 2);
                        doorGroup.add(backM);
                        if (isGlass) {
                            const glassDepth = w - fw * 2;
                            const glassH2 = h - fw * 2;
                            if (glassDepth > 0 && glassH2 > 0) {
                                // PlaneGeometry(width, height) — after rotateY(PI/2): width→Z, height→Y
                                const glassGeo = new THREE.PlaneGeometry(glassDepth, glassH2);
                                glassGeo.rotateY(Math.PI / 2);
                                const glassMat = new THREE.MeshStandardMaterial({ color: 0xc8e6ff, transparent: true, opacity: 0.25, roughness: 0.0, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
                                if (window._hdrEnvMap) { glassMat.envMap = window._hdrEnvMap; glassMat.needsUpdate = true; }
                                const glassMesh = new THREE.Mesh(glassGeo, glassMat);
                                glassMesh.position.set(fx, 0, 0);
                                doorGroup.add(glassMesh);
                            }
                        }
                    } else {
                        // Door 1 is wide in X, thin in Z — frame bars protrude in +Z
                        const fz1 = t * 0.45 + fd / 2; // Z offset of frame center relative to doorGroup
                        const topGeo = new THREE.BoxGeometry(w, fw, fd);
                        const topM = new THREE.Mesh(topGeo, frameMat);
                        topM.position.set(0, h / 2 - fw / 2, fz1);
                        doorGroup.add(topM);
                        const botGeo = new THREE.BoxGeometry(w, fw, fd);
                        const botM = new THREE.Mesh(botGeo, frameMat);
                        botM.position.set(0, -h / 2 + fw / 2, fz1);
                        doorGroup.add(botM);
                        const sideH2 = h - fw * 2;
                        const leftGeo = new THREE.BoxGeometry(fw, sideH2, fd);
                        const leftM = new THREE.Mesh(leftGeo, frameMat);
                        leftM.position.set(-w / 2 + fw / 2, 0, fz1);
                        doorGroup.add(leftM);
                        const rightGeo = new THREE.BoxGeometry(fw, sideH2, fd);
                        const rightM = new THREE.Mesh(rightGeo, frameMat);
                        rightM.position.set(w / 2 - fw / 2, 0, fz1);
                        doorGroup.add(rightM);
                        if (isGlass) {
                            const glassW = w - fw * 2;
                            const glassH = h - fw * 2;
                            if (glassW > 0 && glassH > 0) {
                                const glassGeo = new THREE.PlaneGeometry(glassW, glassH);
                                const glassMat = new THREE.MeshStandardMaterial({ color: 0xc8e6ff, transparent: true, opacity: 0.25, roughness: 0.0, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
                                if (window._hdrEnvMap) { glassMat.envMap = window._hdrEnvMap; glassMat.needsUpdate = true; }
                                const glassMesh = new THREE.Mesh(glassGeo, glassMat);
                                glassMesh.position.set(0, 0, fz1);
                                doorGroup.add(glassMesh);
                            }
                        }
                    }
                }

                // Handle
                if (!isBP) {
                    const handleH = Math.min(h * 0.35, 15);
                    const handleMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });
                    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, handleH, 16), handleMat);
                    if (isVertical) {
                        // Door 2: handle protrudes outward in -sign*X from the door face
                        handle.position.set(-sign * (t * 0.45 + 1.5), 0, -w * 0.35);
                    } else {
                        // Door 1: handle protrudes in +Z from the door face (group already shifted back by fd_offset)
                        handle.position.set(sign * w * 0.35, 0, t * 0.45 + 1.5 + fd_offset);
                    }
                    doorGroup.add(handle);
                }
            };

            // Door 1: front face of horizontal arm
            const door1W = cw - wingD;
            if (door1W > 1) {
                _makeFCDoor(door1W, spanH, spanMidY,
                    -sign * (wingD + door1W / 2),
                    frontD + t * 0.45,
                    false);
            }

            // Door 2: side face of vertical arm
            const door2D = backD;
            if (door2D > 1) {
                _makeFCDoor(door2D, spanH, spanMidY,
                    -sign * (wingD + t * 0.45),
                    frontD + door2D / 2,
                    true);
            }
        }); // end doorSpans.forEach
    } // end hasDoors

    cabinetGroup.add(fcGroup);
    window[`_fullCornerGroup_${side}`] = fcGroup;
}
