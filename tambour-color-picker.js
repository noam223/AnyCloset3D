// ── Tambour full palette picker (1651 colors) ───────────────────────────────

(function() {
    var CSV_URL = 'color%20picker/tambour_full_colors_1651.csv';
    var ITEMS_PER_PAGE = 100;

    var allColors = [];
    var filteredColors = [];
    var renderedCount = 0;
    var csvLoaded = false;

    var modal, grid, searchInput, scrollContainer, counterLabel;

    function parseCSVLine(line) {
        var result = [], current = '', inQuotes = false, i, char;
        for (i = 0; i < line.length; i++) {
            char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
            else current += char;
        }
        result.push(current.trim());
        return result;
    }

    function ensurePaletteState() {
        if (typeof state !== 'undefined' && !state.tambourPalette) state.tambourPalette = {};
    }

    function applyMaterialToActivePart(matKey) {
        if (typeof state === 'undefined') return;
        ensurePaletteState();

        document.querySelectorAll('.material-btn').forEach(function(b) { b.classList.remove('active'); });
        var uploadBtn = document.getElementById('btn-upload-texture');
        if (uploadBtn) uploadBtn.classList.remove('active');

        if (state.activeColorPart === 'materialUpperUnit') {
            if (typeof window.applyUpperUnitMaterial === 'function') window.applyUpperUnitMaterial(matKey);
            return;
        }
        if (state.activeColorPart === 'materialSideCabinet') {
            var sc = state.wings.center ? state.wings.center.sideCabinet : null;
            if (sc) {
                sc.materialBody = matKey;
                sc.materialInternal = matKey;
                sc.materialExternal = matKey;
                sc.materialDesk = matKey;
                sc.materialOpenCell = matKey;
                sc.materialBack = matKey;
                if (state.wings.center) state.wings.center.materialSideCabinet = matKey;
            }
        } else {
            state[state.activeColorPart || 'materialBody'] = matKey;
        }
        if (typeof buildCabinet === 'function') buildCabinet();
        if (typeof saveHistoryState === 'function') saveHistoryState();
    }

    window.applyTambourColor = function(color) {
        if (!color || !color.hex || !color.id) return;
        ensurePaletteState();
        var matKey = window._registerTambourMaterial(color.id, color.hex);
        state.tambourPalette[matKey] = { id: color.id, hex: color.hex, name: color.name || color.id };
        applyMaterialToActivePart(matKey);
        if (typeof _showToast === 'function') {
            _showToast('הוחל גוון ' + color.id + ' — ' + (color.name || ''), 2800);
        }
    };

    function renderNextBatch() {
        var nextBatch = filteredColors.slice(renderedCount, renderedCount + ITEMS_PER_PAGE);
        nextBatch.forEach(function(color) {
            var card = document.createElement('div');
            card.className = 'tambour-color-card';
            card.innerHTML =
                '<div class="tambour-color-swatch" style="background-color:' + color.hex + ';"></div>' +
                '<div class="tambour-color-meta">' +
                    '<span class="tambour-color-id">' + escapeHtml(color.id) + '</span>' +
                    '<span class="tambour-color-name" title="' + escapeHtml(color.name) + '">' + escapeHtml(color.name) + '</span>' +
                '</div>';
            card.addEventListener('click', function() {
                window.applyTambourColor(color);
                closeTambourPalette();
            });
            grid.appendChild(card);
        });
        renderedCount += nextBatch.length;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function resetGrid() {
        if (grid) grid.innerHTML = '';
        renderedCount = 0;
    }

    async function loadCSVData() {
        if (csvLoaded) return;
        try {
            var response = await fetch(CSV_URL);
            var csvText = await response.text();
            var lines = csvText.trim().split('\n');
            allColors = [];
            for (var i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                var row = parseCSVLine(lines[i]);
                if (row.length >= 4) {
                    allColors.push({ name: row[0], id: row[1], rgb: row[2], hex: row[3] });
                }
            }
            filteredColors = allColors.slice();
            csvLoaded = true;
            if (counterLabel) counterLabel.textContent = 'נמצאו ' + allColors.length + ' גוונים זמינים';
        } catch (err) {
            console.error('[tambour-palette] CSV load error:', err);
            if (counterLabel) counterLabel.textContent = 'שגיאה בטעינת מניפת הצבעים';
        }
    }

    window.openTambourPalette = async function() {
        if (!modal) return;
        if (typeof closeMobilePanel === 'function') closeMobilePanel();
        await loadCSVData();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (renderedCount === 0 && filteredColors.length) renderNextBatch();
    };

    function closeTambourPalette() {
        if (!modal) return;
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    window.closeTambourPalette = closeTambourPalette;

    function onSearchInput(e) {
        var text = e.target.value.toLowerCase().trim();
        filteredColors = allColors.filter(function(color) {
            return color.name.toLowerCase().includes(text) || color.id.toLowerCase().includes(text);
        });
        resetGrid();
        renderNextBatch();
        if (counterLabel) counterLabel.textContent = 'נמצאו ' + filteredColors.length + ' גוונים מתאימים';
    }

    function initTambourPalettePicker() {
        modal = document.getElementById('tambour-palette-modal');
        grid = document.getElementById('tambour-colors-grid');
        searchInput = document.getElementById('tambour-palette-search');
        scrollContainer = document.getElementById('tambour-palette-body');
        counterLabel = document.getElementById('tambour-palette-count');
        if (!modal || !grid) return;

        var closeBtn = document.getElementById('tambour-palette-close');
        if (closeBtn) closeBtn.addEventListener('click', closeTambourPalette);

        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeTambourPalette();
        });

        document.querySelectorAll('.btn-open-tambour-palette').forEach(function(btn) {
            btn.addEventListener('click', function() { window.openTambourPalette(); });
        });

        if (searchInput) searchInput.addEventListener('input', onSearchInput);

        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', function() {
                if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 100) {
                    if (renderedCount < filteredColors.length) renderNextBatch();
                }
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) closeTambourPalette();
        });

        loadCSVData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTambourPalettePicker);
    } else {
        initTambourPalettePicker();
    }
})();
