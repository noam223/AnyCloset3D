// ==========================================
// space-appliance-preset.js
// Freestanding electrical appliances as SPACE PROPS (not cart / slot units).
// Live inside the selected cabinet's space — gizmo + delete only; visual in
// the full-space export photo, never dimensioned as a separate cabinet.
// ==========================================

window._spacePropGroups = window._spacePropGroups || [];
window._spacePropHits = window._spacePropHits || [];
window._spacePropSelectedId = null;
window._spacePropGizmoDragId = null;
window._spacePropGizmoHoverId = null;

function _saNewId() {
    return 'sap_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

window._spaceApplianceLabel = function(type) {
    const cat = (window.SPACE_APPLIANCE_CATALOG || []).find(function(c) { return c.id === type; });
    return (cat && cat.label) || type || 'מוצר חשמל';
};

/** Cart item that owns props for the current space (pair host, else editing item / live state). */
window._spacePropsOwnerItem = function() {
    const cart = state && state.orderCart;
    if (!cart || !cart.length) return null;
    const info = (typeof window._getSpacePairInfo === 'function') ? window._getSpacePairInfo() : null;
    if (info && info.slotIndices && info.slotIndices[0] != null) {
        return cart[info.slotIndices[0]] || null;
    }
    const idx = state.editingCartIndex;
    if (idx >= 0 && cart[idx]) return cart[idx];
    return null;
};

window._getSpaceProps = function() {
    const owner = window._spacePropsOwnerItem();
    if (owner) {
        if (!Array.isArray(owner.spaceProps)) {
            owner.spaceProps = (owner.rawState && Array.isArray(owner.rawState.spaceProps))
                ? JSON.parse(JSON.stringify(owner.rawState.spaceProps))
                : [];
        }
        if (owner.rawState) owner.rawState.spaceProps = owner.spaceProps;
        return owner.spaceProps;
    }
    if (!Array.isArray(state.spaceProps)) state.spaceProps = [];
    return state.spaceProps;
};

window._persistSpaceProps = function() {
    const props = window._getSpaceProps();
    const owner = window._spacePropsOwnerItem();
    if (owner) {
        owner.spaceProps = props;
        if (!owner.rawState) owner.rawState = {};
        owner.rawState.spaceProps = props;
    }
    state.spaceProps = props;
};

window._getSpacePropById = function(id) {
    if (!id) return null;
    const props = window._getSpaceProps();
    for (let i = 0; i < props.length; i++) {
        if (props[i] && props[i].id === id) return props[i];
    }
    return null;
};

function _saDefaultOffset(type) {
    const hostW = (state && (state.width || (state.wings && state.wings.center && state.wings.center.width))) || 160;
    const info = (typeof window._getSpacePairInfo === 'function') ? window._getSpacePairInfo() : null;
    let baseX = Math.round(hostW / 2 + 50);
    let baseY = 0;
    let baseZ = 0;
    if (info && typeof window._spaceOffsetForSlot === 'function') {
        const off0 = window._spaceOffsetForSlot(info.activeSlot != null ? info.activeSlot : 0) || { x: 0, y: 0, z: 0 };
        baseX = Math.round((off0.x || 0) + hostW / 2 + 50);
        baseY = Math.round(off0.y || 0);
        baseZ = Math.round(off0.z || 0);
    }
    if (type === 'tv') baseY = Math.max(baseY, 100);
    return { x: baseX, y: baseY, z: baseZ, rot: 0 };
}

window._addSpaceApplianceProp = function(type, opts) {
    opts = opts || {};
    type = type || 'washer';
    const inch = opts.inch || (window.TV_DEFAULT_INCH || 43);
    const props = window._getSpaceProps();
    const prop = {
        id: _saNewId(),
        kind: 'appliance',
        type: type,
        inch: type === 'tv' ? inch : undefined,
        offset: _saDefaultOffset(type)
    };
    props.push(prop);
    window._persistSpaceProps();
    window._spacePropSelectedId = prop.id;
    if (typeof window._rebuildSpaceProps === 'function') window._rebuildSpaceProps();
    window._updateSpaceApplianceSectionVisibility();
    if (typeof window._invalidateSpacePairPreviewImages === 'function') {
        const owner = window._spacePropsOwnerItem();
        const pairId = owner && (typeof window._spacePairIdOf === 'function') ? window._spacePairIdOf(owner) : null;
        if (pairId) window._invalidateSpacePairPreviewImages(pairId);
    }
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (typeof _showToast === 'function') {
        _showToast('נוסף: ' + window._spaceApplianceLabel(type) + ' — הזיזו עם ה־GIZMO', 2500);
    }
    return prop;
};

window._removeSpaceProp = function(id) {
    if (!id) id = window._spacePropSelectedId;
    if (!id) return;
    const props = window._getSpaceProps();
    const next = props.filter(function(p) { return p && p.id !== id; });
    props.length = 0;
    next.forEach(function(p) { props.push(p); });
    if (window._spacePropSelectedId === id) window._spacePropSelectedId = null;
    window._persistSpaceProps();
    if (typeof window._rebuildSpaceProps === 'function') window._rebuildSpaceProps();
    window._updateSpaceApplianceSectionVisibility();
    if (typeof window._invalidateSpacePairPreviewImages === 'function') {
        const owner = window._spacePropsOwnerItem();
        const pairId = owner && (typeof window._spacePairIdOf === 'function') ? window._spacePairIdOf(owner) : null;
        if (pairId) window._invalidateSpacePairPreviewImages(pairId);
    }
    if (typeof saveHistoryState === 'function') saveHistoryState();
};

window._setSpacePropOffset = function(id, x, y, opts) {
    opts = opts || {};
    const prop = window._getSpacePropById(id);
    if (!prop) return;
    const prev = prop.offset || { x: 0, y: 0, z: 0, rot: 0 };
    let z = opts.z != null ? opts.z : (prev.z || 0);
    x = Math.max(-800, Math.min(800, Math.round(Number(x) || 0)));
    y = Math.max(0, Math.min(400, Math.round(Number(y) || 0)));
    z = Math.max(-400, Math.min(600, Math.round(Number(z) || 0)));
    prop.offset = { x: x, y: y, z: z, rot: prev.rot || 0 };
    window._persistSpaceProps();
    if (typeof window._applySpacePropPositions === 'function') window._applySpacePropPositions();
    if (!opts.dragging && typeof saveHistoryState === 'function' && !opts.silent) saveHistoryState();
};

window._setSpacePropRotation = function(id, rot) {
    const prop = window._getSpacePropById(id || window._spacePropSelectedId);
    if (!prop) return;
    const prev = prop.offset || { x: 0, y: 0, z: 0, rot: 0 };
    const next = (typeof window._normSpaceRot === 'function')
        ? window._normSpaceRot(rot)
        : (((Math.round((Number(rot) || 0) / 90) * 90) % 360) + 360) % 360;
    prop.offset = { x: prev.x || 0, y: prev.y || 0, z: prev.z || 0, rot: next };
    window._persistSpaceProps();
    if (typeof window._applySpacePropPositions === 'function') window._applySpacePropPositions();
    if (typeof saveHistoryState === 'function') saveHistoryState();
    window._updateSpaceApplianceSectionVisibility();
};

window._rotateSelectedSpaceProp = function() {
    const id = window._spacePropSelectedId;
    const prop = window._getSpacePropById(id);
    if (!prop) return false;
    const cur = (prop.offset && prop.offset.rot) || 0;
    window._setSpacePropRotation(id, cur + 90);
    return true;
};

window._clearSpacePropsScene = function() {
    (window._spacePropGroups || []).forEach(function(g) {
        if (g && g.parent) g.parent.remove(g);
    });
    window._spacePropGroups = [];
    window._spacePropHits = [];
};

window._applySpacePropPositions = function() {
    const flattenZ = !!(state && state.viewMode === 'blueprint');
    (window._spacePropGroups || []).forEach(function(g) {
        if (!g || !g.userData || !g.userData.spacePropId) return;
        const prop = window._getSpacePropById(g.userData.spacePropId);
        const off = (prop && prop.offset) || { x: 0, y: 0, z: 0, rot: 0 };
        g.position.set(off.x || 0, off.y || 0, flattenZ ? 0 : (off.z || 0));
        g.rotation.y = flattenZ ? 0 : -((off.rot || 0) * Math.PI / 180);
    });
};

window._rebuildSpaceProps = function() {
    if (typeof window._migrateLegacySpaceAppliances === 'function' && !window._spaceApplianceMigrated) {
        window._spaceApplianceMigrated = true;
        try { window._migrateLegacySpaceAppliances(); } catch (e) { /* ignore */ }
    }
    window._clearSpacePropsScene();
    if (!window.THREE || typeof scene === 'undefined' || !scene) return;
    if (state && state.viewMode === 'blueprint') return;
    const props = window._getSpaceProps();
    if (!props.length) {
        window._updateSpacePropDeleteHandle();
        return;
    }
    props.forEach(function(prop) {
        if (!prop || prop.kind !== 'appliance') return;
        const type = prop.type || 'washer';
        const dims = (typeof window._spaceApplianceDims === 'function')
            ? window._spaceApplianceDims(type, { inch: prop.inch })
            : { W: 60, H: 85, D: 60 };
        const g = new THREE.Group();
        g.name = 'spaceProp_' + prop.id;
        g.userData.spacePropId = prop.id;
        g.userData.isSpaceProp = true;
        g.userData.applianceType = type;

        let mesh = null;
        if (typeof window._buildSpaceApplianceMesh === 'function') {
            mesh = window._buildSpaceApplianceMesh(type, { inch: prop.inch });
        }
        if (mesh) {
            g.add(mesh);
        } else {
            const mat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.55, metalness: 0.2 });
            const box = new THREE.Mesh(new THREE.BoxGeometry(dims.W, dims.H, dims.D), mat);
            box.position.set(0, dims.H / 2, 0);
            g.add(box);
        }

        const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const hit = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(dims.W, 40) + 4, Math.max(dims.H, 40) + 4, Math.max(dims.D, 30) + 4),
            hitMat
        );
        hit.position.set(0, dims.H / 2, 0);
        hit.userData.spacePropId = prop.id;
        hit.userData.isSpaceProp = true;
        g.add(hit);

        scene.add(g);
        window._spacePropGroups.push(g);
        window._spacePropHits.push(hit);
    });
    window._applySpacePropPositions();
    window._updateSpacePropDeleteHandle();
};

window._spacePropPivotH = function(prop) {
    if (!prop) return 40;
    const dims = (typeof window._spaceApplianceDims === 'function')
        ? window._spaceApplianceDims(prop.type || 'washer', { inch: prop.inch })
        : { H: 85 };
    return Math.max(20, (dims.H || 85) / 2);
};

window._pickSpacePropId = function(ndc) {
    if (!window.THREE || !camera) return null;
    const hits = window._spacePropHits || [];
    if (!hits.length) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    let best = null;
    let bestDist = Infinity;
    hits.forEach(function(h) {
        if (!h || !h.visible) return;
        const inter = ray.intersectObject(h, true);
        if (!inter.length) return;
        if (inter[0].distance < bestDist) {
            bestDist = inter[0].distance;
            best = h.userData && h.userData.spacePropId;
        }
    });
    return best || null;
};

window._selectSpaceProp = function(id) {
    window._spacePropSelectedId = id || null;
    window._updateSpaceApplianceSectionVisibility();
    window._updateSpacePropDeleteHandle();
};

/** Popup: pick which freestanding appliance to add into the current cabinet's space. */
window._askSpaceApplianceType = function() {
    const old = document.getElementById('_space-appliance-popup');
    if (old) old.remove();
    const catalog = window.SPACE_APPLIANCE_CATALOG || [];
    if (!catalog.length) {
        if (typeof _showToast === 'function') _showToast('אין מוצרי חשמל זמינים', 2500);
        return;
    }
    const popup = document.createElement('div');
    popup.id = '_space-appliance-popup';
    popup.className = 'corner-side-popup';
    const btns = catalog.map(function(c) {
        return '<button type="button" data-sa-type="' + c.id + '">' +
            '<i class="' + (c.icon || 'fa-solid fa-plug') + '"></i> ' + c.label +
            '</button>';
    }).join('');
    popup.innerHTML =
        '<div class="corner-side-popup-title">הוספת מוצר חשמל למרחב</div>' +
        '<div class="corner-side-popup-btns sa-picker-btns">' + btns + '</div>' +
        '<button type="button" class="corner-side-popup-cancel">ביטול</button>';
    document.body.appendChild(popup);
    const close = function() {
        popup.remove();
        document.removeEventListener('mousedown', outside, true);
    };
    const outside = function(e) { if (!popup.contains(e.target)) close(); };
    popup.querySelectorAll('button[data-sa-type]').forEach(function(b) {
        b.addEventListener('click', function() {
            const type = b.getAttribute('data-sa-type');
            close();
            window._addSpaceApplianceProp(type);
        });
    });
    popup.querySelector('.corner-side-popup-cancel').addEventListener('click', close);
    setTimeout(function() { document.addEventListener('mousedown', outside, true); }, 0);
};

window._updateSpaceApplianceSectionVisibility = function() {
    const section = document.getElementById('space-appliance-section');
    const props = window._getSpaceProps().filter(function(p) { return p && p.kind === 'appliance'; });
    const show = props.length > 0;
    if (section) section.style.display = show ? '' : 'none';

    const list = document.getElementById('sa-prop-list');
    if (list) {
        list.innerHTML = '';
        props.forEach(function(p) {
            const row = document.createElement('div');
            row.className = 'sa-prop-row' + (window._spacePropSelectedId === p.id ? ' active' : '');
            row.innerHTML =
                '<button type="button" class="sa-prop-select" data-id="' + p.id + '">' +
                '<i class="fa-solid fa-plug"></i> ' + window._spaceApplianceLabel(p.type) +
                (p.type === 'tv' && p.inch ? (' ' + p.inch + '″') : '') +
                '</button>' +
                '<button type="button" class="sa-prop-del" data-id="' + p.id + '" title="מחק">' +
                '<i class="fa-solid fa-trash"></i></button>';
            list.appendChild(row);
        });
        list.querySelectorAll('.sa-prop-select').forEach(function(btn) {
            btn.addEventListener('click', function() {
                window._selectSpaceProp(btn.getAttribute('data-id'));
            });
        });
        list.querySelectorAll('.sa-prop-del').forEach(function(btn) {
            btn.addEventListener('click', function() {
                window._removeSpaceProp(btn.getAttribute('data-id'));
            });
        });
    }

    const sel = window._getSpacePropById(window._spacePropSelectedId);
    const rotRow = document.getElementById('sa-prop-rot-row');
    if (rotRow) rotRow.style.display = sel ? '' : 'none';
    if (sel) {
        document.querySelectorAll('.sa-prop-rot-btn').forEach(function(btn) {
            btn.classList.toggle('active', Number(btn.getAttribute('data-rot')) === ((sel.offset && sel.offset.rot) || 0));
        });
    }
};

window._updateSpacePropDeleteHandle = function() {
    let handle = document.getElementById('space-prop-delete-handle');
    const id = window._spacePropSelectedId;
    const prop = window._getSpacePropById(id);
    if (!prop || state.viewMode === 'blueprint' || document.body.classList.contains('room-plan-mode')) {
        if (handle) handle.style.display = 'none';
        return;
    }
    if (!handle) {
        handle = document.createElement('button');
        handle.id = 'space-prop-delete-handle';
        handle.type = 'button';
        handle.className = 'space-prop-delete-handle';
        handle.title = 'מחק מוצר חשמל';
        handle.innerHTML = '<i class="fa-solid fa-trash"></i>';
        handle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window._removeSpaceProp(window._spacePropSelectedId);
        });
        (document.getElementById('drag-layer') || document.body).appendChild(handle);
    }
    handle.style.display = 'flex';
    // Position near gizmo proxy if available
    try {
        if (!camera || !container) return;
        const off = prop.offset || { x: 0, y: 0, z: 0 };
        const pivotH = window._spacePropPivotH(prop);
        const world = new THREE.Vector3(off.x || 0, (off.y || 0) + pivotH, off.z || 0);
        const pos = world.project(camera);
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        let x = (pos.x * 0.5 + 0.5) * cw;
        let y = (-(pos.y * 0.5) + 0.5) * ch;
        x = Math.max(24, Math.min(cw - 24, x + 56));
        y = Math.max(24, Math.min(ch - 24, y - 56));
        handle.style.left = x + 'px';
        handle.style.top = y + 'px';
    } catch (e) { /* keep last position */ }
};

/** Convert legacy space-appliance cart units in a pair into host props (once). */
window._migrateLegacySpaceAppliances = function() {
    const cart = state && state.orderCart;
    if (!cart || !cart.length) return;
    const byPair = {};
    cart.forEach(function(it, i) {
        const rs = it && it.rawState;
        if (!rs || rs.presetId !== 'space-appliance') return;
        const pairId = (typeof window._spacePairIdOf === 'function') ? window._spacePairIdOf(it) : null;
        if (!pairId) return;
        if (!byPair[pairId]) byPair[pairId] = [];
        byPair[pairId].push({ it: it, index: i });
    });
    Object.keys(byPair).forEach(function(pairId) {
        const host = cart.find(function(it) {
            return window._spacePairIdOf(it) === pairId && window._spacePairSlotOf(it) === 0;
        });
        if (!host) return;
        if (!Array.isArray(host.spaceProps)) host.spaceProps = [];
        if (!host.rawState) host.rawState = {};
        byPair[pairId].forEach(function(m) {
            if (m.it === host) return;
            const rs = m.it.rawState || {};
            const sa = rs.wings && rs.wings.center && rs.wings.center.spaceAppliance;
            const type = (sa && sa.type) || 'washer';
            const off = (typeof window._getSpaceOffset === 'function')
                ? window._getSpaceOffset(m.it)
                : { x: 0, y: 0, z: 0, rot: 0 };
            host.spaceProps.push({
                id: _saNewId(),
                kind: 'appliance',
                type: type,
                inch: sa && sa.inch,
                offset: { x: off.x || 0, y: off.y || 0, z: off.z || 0, rot: off.rot || 0 }
            });
        });
        host.rawState.spaceProps = host.spaceProps;
        // Remove legacy appliance members (except if host itself is appliance — rare)
        for (let i = cart.length - 1; i >= 0; i--) {
            const it = cart[i];
            if (window._spacePairIdOf(it) !== pairId) continue;
            if (it === host) continue;
            if (it.rawState && it.rawState.presetId === 'space-appliance') {
                cart.splice(i, 1);
            }
        }
        if (typeof window._renumberSpacePairSlots === 'function') {
            window._renumberSpacePairSlots(pairId);
        }
    });
};

(function() {
    const _origRestore = window._restorePresetUI;
    window._restorePresetUI = function() {
        if (typeof _origRestore === 'function') _origRestore();
        window._updateSpaceApplianceSectionVisibility();
    };
})();

(function() {
    const _origSync = window.syncSidebarToWing;
    window.syncSidebarToWing = function() {
        if (typeof _origSync === 'function') _origSync();
        window._updateSpaceApplianceSectionVisibility();
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    window._updateSpaceApplianceSectionVisibility();
    // Rotation buttons for selected prop
    document.querySelectorAll('.sa-prop-rot-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const rot = Number(btn.getAttribute('data-rot')) || 0;
            if (window._spacePropSelectedId) window._setSpacePropRotation(window._spacePropSelectedId, rot);
        });
    });
});
