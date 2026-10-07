// Watermark for exports produced during a free trial.
// window._trialWatermark is set by loadFeatures (editor), projects.js and viewer.js.
(function () {
    var TEXT = 'גרסת ניסיון · AnyCloset 3D';

    window._trialWatermarkHtml = function () {
        if (!window._trialWatermark) return '';
        var tile = encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="340">' +
            '<text x="280" y="170" transform="rotate(-30 280 170)" text-anchor="middle" ' +
            'font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#dc2626" fill-opacity="0.2">' +
            TEXT + '</text></svg>'
        );
        return '<div aria-hidden="true" style="position:fixed;inset:0;pointer-events:none;z-index:2147483647;' +
            'background-image:url(&quot;data:image/svg+xml;charset=utf-8,' + tile + '&quot;);background-repeat:repeat;' +
            '-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>';
    };

    window._trialWatermarkSvg = function (svg) {
        if (!window._trialWatermark || typeof svg !== 'string' || svg.indexOf('data-trial-wm') !== -1) return svg;
        var x = 0, y = 0, w = 1200, h = 800;
        var vb = svg.match(/viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
        if (vb) { x = +vb[1]; y = +vb[2]; w = +vb[3]; h = +vb[4]; }
        var fs = Math.max(14, Math.round(Math.min(w, h) / 16));
        var stepX = fs * 14, stepY = fs * 5;
        var texts = '';
        for (var ty = y + fs * 2, row = 0; ty < y + h; ty += stepY, row++) {
            for (var tx = x + (row % 2 ? stepX / 2 : 0); tx < x + w + stepX / 2; tx += stepX) {
                var px = tx.toFixed(1), py = ty.toFixed(1);
                texts += '<text x="' + px + '" y="' + py + '" transform="rotate(-30 ' + px + ' ' + py + ')">' + TEXT + '</text>';
            }
        }
        var g = '<g data-trial-wm="1" pointer-events="none" font-family="Arial, sans-serif" font-size="' + fs +
            '" font-weight="700" fill="#dc2626" fill-opacity="0.16" text-anchor="middle">' + texts + '</g>';
        var end = svg.lastIndexOf('</svg>');
        return end === -1 ? svg : svg.slice(0, end) + g + svg.slice(end);
    };

    window._trialWatermarkExcelRow = function () {
        if (!window._trialWatermark) return '';
        return '<Row><Cell ss:StyleID="red"><Data ss:Type="String">' + TEXT + ' — לא לשימוש מסחרי</Data></Cell></Row>\n<Row/>\n';
    };
})();
