// Single source of truth for the edit: scene windows, animation hit points and SFX cues.
// 120 BPM -> one beat every 0.5 s. Every cut and hit lands on a beat or half-beat.
export const FPS = 30;
export const DURATION = 30;
export const BPM = 120;

export const SCENES = {
  problem: [0, 4],
  logo:    [4, 6],
  sketch:  [6, 10],
  colors:  [10, 13],
  price:   [13, 16],
  ai:      [16, 19.5],
  live:    [19.5, 22.5],
  outputs: [22.5, 26],
  outro:   [26, 30],
};

export const T = {
  // problem
  cardsIn: 0.1, cardStagger: 0.16, implode: 3.3, flash: 4.0,
  // logo
  iconIn: 4.0, wordIn: 4.45, sweep: 4.95, tagIn: 5.05, zoomThrough: 5.55,
  // sketch
  drawStart: 6.05, drawEnd: 7.45, dims: 6.9, reveal: 7.75,
  // colors
  swaps: [10.5, 11.0, 11.5, 12.0], countFrom: 10.2, countTo: 12.2,
  // price
  items: [13.3, 13.7, 14.1, 14.5], totalFrom: 14.55, totalTo: 15.15, stamp: 15.25,
  // ai
  aiCut: 16.0, scanStart: 16.45, scanEnd: 17.45, aiBadge: 17.45, whip: 19.15,
  // live
  linkFly: 20.0, linkLand: 20.4, livePulse: 20.5, pick: 20.95, update: 21.15, toast: 21.3,
  // outputs
  docs: [22.6, 22.85, 23.1], stamps: [23.6, 24.1, 24.6], docsOut: 25.4,
  // outro
  slogan: 26.05, logoIn: 27.3, cta: 27.8, url: 28.1,
};

// [time, type, gain]
export const SFX = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => [T.cardsIn + i * T.cardStagger, 'pop', 0.55]),
  [1.4, 'notify', 0.45], [2.2, 'notify', 0.4], [2.9, 'notify', 0.38],
  [T.implode, 'suck', 0.8],
  [T.flash, 'impact', 1.0],
  [T.wordIn, 'whoosh', 0.55],
  [T.sweep, 'shimmer', 0.5],
  [T.zoomThrough, 'whooshBig', 0.8],
  [T.drawStart, 'draw', 0.55],
  [T.dims, 'tick', 0.5],
  [T.reveal, 'whoosh', 0.7], [T.reveal + 0.05, 'shimmer', 0.55],
  ...T.swaps.map(t => [t, 'click', 0.7]),
  ...T.items.map(t => [t, 'pop', 0.6]),
  [T.totalFrom, 'counter', 0.45],
  [T.stamp, 'stamp', 0.95],
  [T.aiCut, 'impact', 1.0],
  [T.scanStart, 'scan', 0.7],
  [T.aiBadge, 'sparkle', 0.65],
  [T.whip, 'whooshBig', 0.8],
  [T.linkFly, 'whoosh', 0.5],
  [T.linkLand, 'notify', 0.7],
  [T.pick, 'click', 0.7],
  [T.update, 'shimmer', 0.45],
  [T.toast, 'ding', 0.55],
  ...T.docs.map(t => [t, 'pop', 0.65]),
  ...T.stamps.map(t => [t, 'stamp', 0.85]),
  [T.docsOut, 'whooshBig', 0.7],
  [25.0, 'reverse', 0.7],
  [26.0, 'impact', 1.0],
  [T.logoIn, 'shimmer', 0.5],
  [T.cta, 'pop', 0.7],
  [T.url, 'tick', 0.45],
];
