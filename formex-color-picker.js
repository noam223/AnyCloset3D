// ── Formex paint colors palette (HEX from formex.co.il) ────────────────

(function () {
    var CATALOG_URL = 'color%20picker/formex_catalog.json';
    var ITEMS_PER_PAGE = 80;

    var catalog = null;
    var allColors = [];
    var filteredColors = [];
    var activeCategory = 'all';
    var renderedCount = 0;
    var catalogLoaded = false;

    var modal, grid, searchInput, scrollContainer, counterLabel, tabsEl;
    var pickHandler = null;

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function ensurePaletteState() {
        if (typeof state !== 'undefined' && !state.formexPalette) state.formexPalette = {};
    }

    function applyMaterialToActivePart(matKey) {
        if (typeof state === 'undefined') return;
        ensurePaletteState();

        document.querySelectorAll('.material-btn').forEach(function (b) { b.classList.remove('active'); });
        var uploadBtn = document.getElementById('btn-upload-texture');
        if (uploadBtn) uploadBtn.classList.remove('active');

        if (typeof window._isSlidingDoorColorPart === 'function' && window._isSlidingDoorColorPart(state.activeColorPart)) {
            var sdIdx = window._slidingDoorIndexFromPart(state.activeColorPart);
            if (typeof window.updateSlidingDoorColor === 'function') window.updateSlidingDoorColor(sdIdx, matKey);
            return;
        }
        if (state.activeColorPart === 'materialUpperUnit') {
            if (typeof window.applyUpperUnitMaterial === 'function') window.applyUpperUnitMaterial(matKey);
            return;
        }
        if (state.activeColorPart === 'materialSideCabinet') {
            var sc = state.wings.center ? state.wings.center.sideCabinet : null;
            if (sc) {
                sc.materialBody = matKey;
                sc.materialInternal = matKey;
                sc.materialDesk = matKey;
                sc.materialOpenCell = matKey;
                sc.materialBack = matKey;
                if (typeof window._syncSideCabinetDoorMaterial === 'function') {
                    window._syncSideCabinetDoorMaterial(state.wings.center);
                }
                if (state.wings.center) state.wings.center.materialSideCabinet = matKey;
            }
        } else {
            state[state.activeColorPart || 'materialBody'] = matKey;
            if (state.activeColorPart === 'materialExternal' && state.wings.center) {
                if (typeof window._syncSideCabinetDoorMaterial === 'function') {
                    window._syncSideCabinetDoorMaterial(state.wings.center);
                }
            }
        }
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof saveHistoryState === 'function') saveHistoryState();
    }

    window.applyFormexColor = function (color) {
        if (!color || !color.id) return;
        if (!color.hex && !color.img) return;
        ensurePaletteState();
        var matKey = window._registerFormexMaterial(color);
        state.formexPalette[matKey] = {
            id: color.id,
            hex: color.hex || null,
            name: color.name || color.id,
            img: color.img || null,
            finish: color.finish || 'matte',
            type: color.type || 'solid',
            category: color.category || null
        };
        applyMaterialToActivePart(matKey);
        if (window.StockMaterials && typeof window.StockMaterials.onMaterialSelected === 'function') {
            window.StockMaterials.onMaterialSelected(matKey, {
                label: color.name || color.id,
                brand: 'formex',
                hex: color.hex || null,
                img: color.img || null
            });
        }
        if (typeof _showToast === 'function') {
            _showToast('הוחל גוון פורמקס ' + color.id + ' — ' + (color.name || ''), 2800);
        }
    };

    function flattenCatalog(data) {
        var list = [];
        (data.categories || []).forEach(function (cat) {
            (cat.items || []).forEach(function (it) {
                list.push({
                    id: it.id,
                    name: it.name || it.id,
                    hex: it.hex || null,
                    img: it.img || null,
                    finish: it.finish || 'matte',
                    type: it.type || (it.img ? 'texture' : 'solid'),
                    category: cat.id,
                    categoryName: cat.name
                });
            });
        });
        return list;
    }

    async function loadCatalog() {
        if (catalogLoaded) return;
        try {
            var response = await fetch(CATALOG_URL);
            catalog = await response.json();
            allColors = flattenCatalog(catalog);
            filteredColors = allColors.slice();
            catalogLoaded = true;
            buildTabs();
            updateCounter();
        } catch (err) {
            console.error('[formex-palette] catalog load error:', err);
            if (counterLabel) counterLabel.textContent = 'שגיאה בטעינת מניפת פורמקס';
        }
    }

    function buildTabs() {
        if (!tabsEl || !catalog) return;
        tabsEl.innerHTML = '';
        var tabs = [{ id: 'all', name: 'הכל' }].concat(
            (catalog.categories || []).map(function (c) {
                return { id: c.id, name: c.name };
            })
        );
        tabs.forEach(function (tab) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bluran-cat-tab formex-cat-tab' + (tab.id === activeCategory ? ' active' : '');
            btn.textContent = tab.name;
            btn.dataset.cat = tab.id;
            btn.addEventListener('click', function () {
                activeCategory = tab.id;
                tabsEl.querySelectorAll('.formex-cat-tab').forEach(function (b) {
                    b.classList.toggle('active', b.dataset.cat === activeCategory);
                });
                applyFilter(searchInput ? searchInput.value : '');
            });
            tabsEl.appendChild(btn);
        });
    }

    function applyFilter(text) {
        text = String(text || '').toLowerCase().trim();
        filteredColors = allColors.filter(function (color) {
            if (activeCategory !== 'all' && color.category !== activeCategory) return false;
            if (!text) return true;
            return (color.name || '').toLowerCase().includes(text) ||
                (color.id || '').toLowerCase().includes(text) ||
                (color.categoryName || '').toLowerCase().includes(text);
        });
        resetGrid();
        renderNextBatch();
        updateCounter();
    }

    function updateCounter() {
        if (!counterLabel) return;
        counterLabel.textContent = 'נמצאו ' + filteredColors.length + ' גוונים' +
            (catalog ? ' · ' + allColors.length + ' במניפת פורמקס' : '');
    }

    function resetGrid() {
        if (grid) grid.innerHTML = '';
        renderedCount = 0;
    }

    function renderNextBatch() {
        if (!grid) return;
        var nextBatch = filteredColors.slice(renderedCount, renderedCount + ITEMS_PER_PAGE);
        nextBatch.forEach(function (color) {
            var card = document.createElement('div');
            card.className = 'tambour-color-card formex-color-card';
            var swatchStyle = color.img
                ? 'background-image:url(\'' + escapeHtml(color.img) + '\');background-size:cover;background-position:center;'
                : 'background-color:' + escapeHtml(color.hex || '#ccc') + ';';
            card.innerHTML =
                '<div class="tambour-color-swatch" style="' + swatchStyle + '"></div>' +
                '<div class="tambour-color-meta">' +
                    '<span class="tambour-color-id">' + escapeHtml(color.id) + '</span>' +
                    '<span class="tambour-color-name" title="' + escapeHtml(color.name) + '">' + escapeHtml(color.name) + '</span>' +
                    '<span class="bluran-color-cat formex-color-cat">' + escapeHtml(color.categoryName || '') + '</span>' +
                '</div>';
            card.addEventListener('click', function () {
                var handler = pickHandler;
                if (handler) handler(color);
                else window.applyFormexColor(color);
                closeFormexPalette();
            });
            grid.appendChild(card);
        });
        renderedCount += nextBatch.length;
    }

    window.openFormexPaletteFor = function (handler) {
        window.openFormexPalette();
        pickHandler = typeof handler === 'function' ? handler : null;
    };

    window.openFormexPalette = async function () {
        pickHandler = null;
        if (!modal) return;
        if (typeof closeMobilePanel === 'function') closeMobilePanel();
        await loadCatalog();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (renderedCount === 0 && filteredColors.length) renderNextBatch();
    };

    function closeFormexPalette() {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = '';
        pickHandler = null;
    }
    window.closeFormexPalette = closeFormexPalette;

    function initFormexPalettePicker() {
        modal = document.getElementById('formex-palette-modal');
        grid = document.getElementById('formex-colors-grid');
        searchInput = document.getElementById('formex-palette-search');
        scrollContainer = document.getElementById('formex-palette-body');
        counterLabel = document.getElementById('formex-palette-count');
        tabsEl = document.getElementById('formex-palette-tabs');
        if (!modal || !grid) return;

        var closeBtn = document.getElementById('formex-palette-close');
        if (closeBtn) closeBtn.addEventListener('click', closeFormexPalette);

        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeFormexPalette();
        });

        document.querySelectorAll('.btn-open-formex-palette').forEach(function (btn) {
            btn.addEventListener('click', function () { window.openFormexPalette(); });
        });

        if (searchInput) {
            searchInput.addEventListener('input', function (e) {
                applyFilter(e.target.value);
            });
        }

        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', function () {
                if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 100) {
                    if (renderedCount < filteredColors.length) renderNextBatch();
                }
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) closeFormexPalette();
        });

        loadCatalog();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFormexPalettePicker);
    } else {
        initFormexPalettePicker();
    }
})();
