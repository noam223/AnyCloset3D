// Tutorial 4 — "חומרים וצבעים": colour tab, per-part materials (body, fronts, interior, back), hiding doors.
// Continues the tutorial-3 cabinet, captured at 1904×1071; prices blurred.
// Coordinates (focus / ring / click / drag) are in capture pixels. Beat `at` = fraction of the narration.
{
const CAB = [548, 195, 688, 664], F_CAB = [892, 527, 1.35], F_PANEL = [1660, 620, 2.0];
const T_BODY = [1713, 440, 99, 32], T_INT = [1608, 440, 99, 32], T_BACK = [1503, 440, 99, 32], T_EXT = [1713, 478, 99, 32];
const M_WOOD = [1571, 819, 47, 47], M_705 = [1571, 553, 47, 47], DOORS_BTN = [1002, 18, 50, 36];

window.CONTENT = {
  TEMPLATE: 'tutorial',
  NAME: 'anycloset-tutorial-04',
  VOICE: 'voice_rzpnfr6i06w4',
  VOICE_STYLE: 'clear, warm and confident professional software tutorial narration, steady pace',
  CURSOR0: [1100, 820],
  STEPS: [
    {
      card: true, bg: 'tut4_08', kick: 'הדרכה · פרק 4', cardTitle: 'חומרים *וצבעים*', cardSub: 'גוף, חזיתות, פנים וגב הארון',
      say: 'בפרק הזה נבחר חומרים וצבעים לארון. כל חלק בנפרד: הגוף, החזיתות, הפנים, והגב.',
    },
    {
      img: 'tut4_01', chapter: '01', title: 'לשונית הצבעים',
      say: 'את החומרים בוחרים בלשונית "צבעים", בתפריט הצדדי. למעלה בוחרים את החלק שרוצים לצבוע: גוף וצוקל, מדפים ופנים, גב ארון, או חזיתות. מתחת מופיעים הגוונים החלקים, ומתחתם טקסטורות העץ והדוגמאות.',
      beats: [
        { at: 0.03, focus: [1700, 620, 2.0], ring: [1838, 620, 54, 54] },
        { at: 0.13, click: [1865, 647] },
        { at: 0.24, ring: [1499, 415, 318, 100] },
        { at: 0.6, focus: [1660, 700, 1.8], ring: [1505, 548, 307, 225] },
        { at: 0.8, ring: [1505, 812, 307, 250] },
      ],
    },
    {
      chapter: '02', title: 'גוף וצוקל',
      say: 'נתחיל בגוף. בוחרים "גוף וצוקל", ולוחצים על טקסטורת עץ כהה. הדפנות והצוקל מתעדכנים מיד.',
      beats: [
        { at: 0.04, focus: F_PANEL, ring: T_BODY },
        { at: 0.2, click: [1762, 456] },
        { at: 0.42, click: [1594, 842], ring: M_WOOD },
        { at: 0.48, img: 'tut4_02' },
        { at: 0.62, focus: [892, 700, 1.6], ring: [548, 815, 690, 50] },
      ],
    },
    {
      chapter: '03', title: 'חזיתות',
      say: 'עכשיו החזיתות, כלומר הדלתות והמגירות. עוברים ל"חזיתות", ובוחרים גוון חלק, כאן שבע מאות וחמש, בגוון שמנת. דלת המראה נשארת מראה.',
      sub: 'עכשיו החזיתות, כלומר הדלתות והמגירות. עוברים ל"חזיתות", ובוחרים גוון חלק, כאן 705, בגוון שמנת. דלת המראה נשארת מראה.',
      beats: [
        { at: 0.04, focus: F_PANEL, ring: T_EXT },
        { at: 0.18, click: [1762, 494] },
        { at: 0.24, img: 'tut4_03' },
        { at: 0.44, click: [1594, 576], ring: M_705 },
        { at: 0.5, img: 'tut4_04' },
        { at: 0.6, focus: F_CAB, ring: CAB },
      ],
    },
    {
      chapter: '04', title: 'הצגת הפנים',
      say: 'כדי לראות את הפנים, מסתירים את הדלתות בכפתור שבסרגל העליון. עכשיו רואים את הגוף, בטקסטורת העץ.',
      beats: [
        { at: 0.04, focus: [1000, 220, 2.2], ring: DOORS_BTN },
        { at: 0.24, click: [1027, 36] },
        { at: 0.32, img: 'tut4_05', focus: F_CAB, ring: CAB },
      ],
    },
    {
      chapter: '05', title: 'מדפים ופנים',
      say: 'בלשונית "מדפים ופנים" בוחרים את צבע המדפים והמחיצות. נבחר את אותה טקסטורה, כך שהפנים יתאימו לגוף.',
      beats: [
        { at: 0.04, focus: F_PANEL, ring: T_INT },
        { at: 0.18, click: [1657, 456] },
        { at: 0.42, click: [1594, 842], ring: M_WOOD },
        { at: 0.48, img: 'tut4_06', focus: F_CAB, ring: CAB },
      ],
    },
    {
      chapter: '06', title: 'גב הארון',
      say: 'ולגב הארון נבחר גוון בהיר, שיוצר ניגוד יפה ומאיר את הפנים.',
      beats: [
        { at: 0.04, focus: F_PANEL, ring: T_BACK },
        { at: 0.2, click: [1552, 456] },
        { at: 0.42, click: [1594, 576], ring: M_705 },
        { at: 0.48, img: 'tut4_07', focus: F_CAB, ring: CAB },
      ],
    },
    {
      chapter: '07', title: 'התוצאה',
      say: 'מחזירים את הדלתות, וזה הארון בחומרים הסופיים. בפרק הבא נוסיף כוורות ותאים פתוחים.',
      beats: [
        { at: 0.04, focus: [1000, 220, 2.2], ring: DOORS_BTN },
        { at: 0.16, click: [1027, 36] },
        { at: 0.24, img: 'tut4_08', focus: F_CAB, ring: CAB },
        { at: 0.8, focus: [952, 535, 1], ring: null },
      ],
    },
    {
      card: true, last: true, bg: 'tut4_08', kick: 'בפרק הבא', cardTitle: 'כוורות *ותאים פתוחים*', cardSub: 'כוורת, מחיצות ותאים שווים',
      dur: 3.2, tail: 0.6,
    },
  ],
};
}
