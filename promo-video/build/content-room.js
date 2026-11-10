// "ארון בתוך חדר" — narrated timelapse: a designed wardrobe from a real project rebuilt from scratch,
// then placed in a niche in a 2D room plan (window, parquet, wall colour), viewed in 3D and finished
// with a photoreal render. Captures are 1766×1276 (editor canvas + panel), prices blurred.
{
const BRAND_SAY = 'אֶנִי קְלוֹזֶט תְּרִי דִי';

const C = window.CONTENT = {
  TEMPLATE: 'room',
  NAME: 'anycloset-room',
  VOICE: 'voice_rzpnfr6i06w4',
  VOICE_STYLE: 'energetic, warm and confident Israeli commercial voiceover for interior designers, brisk fast-paced delivery, smiling',
  IW: 1766, IH: 1276,
  STEP: 1.8,
  REC: 'TIMELAPSE',
  VIEW_BG: '#e9edf2',
  LAYOUT: {
    L: {
      win: { x: 70, y: 110, w: 1130, h: 880 },
      logo: { right: 70 }, rec: { right: 70 },
      step: { left: 1250 }, bar: { x: 1250, w: 600 },
      block: { right: 70, top: 268, w: 600, title: 68, sub: 29, gap: 12 },
      chips: { right: 70, top: 640, w: 600, fs: 19, gap: 10 },
    },
  },
  INTRO: {
    l1: 'מארון ריק', l2: '*לחדר שלם.*',
    sub: 'ארון מעוצב מפרויקט אמיתי — נבנה מחדש, ונכנס לחדר',
    subP: 'ארון מעוצב מפרויקט אמיתי —<br>נבנה מחדש, ונכנס לחדר',
    say: 'ככה בונים ארון מעוצב, ואת כל החדר סביבו, מאפס.',
  },
  FEATS: ['מידות', '4 עמודות', 'מדפים', 'מגירות', 'גוון עץ', 'דלתות', 'חזיתות מרווה', 'ידיות זהב',
    'חדר ב-2D', 'נישה + סגירות', 'חלון', 'פרקט וצבע קיר', 'חדר ב-3D', 'הדמיה פוטוריאליסטית'],
  PRE: 'rm_00',
  // focus: [x, y, scale] in capture px (overview ≈ 0.64 in 16:9); click / ring in capture px
  STEPS: [
    { img: 'rm_01', title: 'מגדירים *מידות*', sub: '240 × 240 × 45 ס״מ — הארון מתעדכן מיד.',
      click: [1711, 353], focus: [1000, 560, 0.72], ring: [1367, 320, 382, 52], feats: [0] },
    { img: 'rm_02', title: 'ארבע *עמודות*', sub: 'רוחב מדויק לכל עמודה: 78 / 78 / 38 / 38.',
      click: [1420, 354], focus: [1000, 560, 0.72], ring: [1367, 320, 74, 52], feats: [1],
      say: 'מידות, עמודות, מדפים ומגירות, בכמה לחיצות.' },
    { img: 'rm_03', title: 'חלוקת *מדפים*', sub: 'מדפים בגובה מדויק — בכל עמודה בנפרד.',
      click: [600, 520], focus: [600, 640, 1.0], ring: [290, 335, 610, 605], feats: [2] },
    { img: 'rm_04', title: '*מגירות*', sub: 'מגירות בתחתית העמודות הרחבות.',
      click: [480, 835], focus: [600, 700, 1.05], ring: [290, 765, 405, 152], feats: [3] },
    { img: 'rm_05', title: 'גוף בגוון *עץ*', sub: 'אלון 2020 לגוף, למדפים ולצוקל.',
      click: [1646, 842], focus: [1000, 640, 0.66], ring: [1625, 821, 42, 42], feats: [4],
      say: 'גוף בגוון עץ, חזיתות בירוק מרווה, וידיות זהב.' },
    { img: 'rm_06', title: '*דלתות*', sub: 'דלתות כפולות ובודדות — בלחיצה על כל עמודה.',
      click: [520, 520], focus: [600, 640, 1.0], ring: [290, 335, 610, 605], feats: [5] },
    { img: 'rm_07', title: 'חזיתות *מרווה*', sub: 'גוון U604 — ירוק מרווה מט.',
      click: [1520, 659], focus: [1000, 640, 0.66], ring: [1499, 638, 42, 42], feats: [6] },
    { img: 'rm_08', title: 'ידיות *זהב*', sub: 'ידית רוכבת בגימור זהב, לדלתות ולמגירות.',
      click: [1407, 975], focus: [1000, 640, 0.66], ring: [1373, 935, 68, 81], feats: [7] },
    { img: 'rm_09', title: 'עוברים *לחדר*', sub: 'תכנון החדר ב-2D: 380 × 380 ס״מ.',
      click: [1520, 620], focus: [883, 640, 0.64], ring: [1364, 560, 312, 225], feats: [8],
      say: 'ועכשיו, החדר. מתכננים אותו בדו־ממד, לפי המידות האמיתיות.' },
    { img: 'rm_10', title: '*נישה* בקיר', sub: 'נישה 250 × 50 — הארון נכנס בדיוק, עם סגירות.',
      click: [450, 255], focus: [500, 520, 0.95], ring: [180, 180, 535, 150], feats: [9],
      say: 'נישה בקיר, והארון נכנס בדיוק, עם סגירות אוטומטיות.' },
    { img: 'rm_11', title: 'מוסיפים *חלון*', sub: 'חלון בקיר הצד — עם אור יום אמיתי.',
      click: [75, 720], focus: [450, 640, 0.95], ring: [55, 575, 40, 290], feats: [10],
      say: 'מוסיפים חלון, פרקט, וצבע קיר מהמניפה של טמבור.' },
    { img: 'rm_12', title: 'פרקט *וצבע קיר*', sub: 'פרקט אלון בהיר, וגוון קיר מהמניפה של טמבור.',
      click: [1557, 884], focus: [1000, 700, 0.66], ring: [1364, 856, 310, 113], feats: [11] },
  ],
  REV: [
    { img: 'rm_3d_front', dur: 2.4, w: 1506, h: 847, c: [753, 440], feats: [12],
      say: 'ובלחיצה אחת, כל החדר בתלת־ממד.' },
    { img: 'rm_3d', dur: 2.2, w: 1506, h: 847, grp: 'ai' },
    { img: 'rm_ai', dur: 5.6, w: 1506, h: 847, grp: 'ai', wipe: true, feats: [13],
      say: 'ומשם, הדמיה פוטוריאליסטית שהלקוח פשוט מתאהב בה.' },
  ],
  PINS: [],
  BADGE: '<b>✦</b> הדמיה פוטוריאליסטית',
  REV_BLOCKS: [
    { from: [0], to: [2], kick: '3D', title: 'החדר *ב-3D*', sub: 'הארון בנישה, האור מהחלון — בדיוק כמו בתכנון.' },
    { from: [2], to: [2, 3.4], kick: 'בלחיצה', title: 'הדמיה *פוטוריאליסטית*', sub: 'אותו חדר, אותו ארון — כמו צילום אמיתי.' },
    { from: [2, 3.4], to: 'out', kick: 'סיכום', title: '14 *שלבים.* חדר שלם.', sub: 'מהמידה הראשונה ועד ההדמיה — הכל בתוך AnyCloset3D.', sum: true },
  ],
  OUTRO: {
    l1: 'מסקיצה להזמנה.', l2: '*במקום אחד.*', cta: 'anycloset3d.com',
    say: `${BRAND_SAY}. מסקיצה להזמנה, במקום אחד. נסו שבוע חינם.`,
  },
};
C.VO_ITEMS = [C.INTRO, ...C.STEPS, ...C.REV, C.OUTRO].filter(x => x.say);
}
