// Tutorial 5 — "כוורות ותאים פתוחים": removing a door, honeycomb column, honeycomb colour, vertical partition.
// Continues the tutorial-4 cabinet, captured at 1904×1071; prices blurred.
// Coordinates (focus / ring / click / drag) are in capture pixels. Beat `at` = fraction of the narration.
{
const COL3 = [1156, 186, 162, 690], F_COL3 = [1237, 530, 1.5], F_PANEL = [1660, 620, 2.0];

window.CONTENT = {
  TEMPLATE: 'tutorial',
  NAME: 'anycloset-tutorial-05',
  VOICE: 'voice_rzpnfr6i06w4',
  VOICE_STYLE: 'clear, warm and confident professional software tutorial narration, steady pace',
  CURSOR0: [1100, 820],
  STEPS: [
    {
      card: true, bg: 'tut5_08', kick: 'הדרכה · פרק 5', cardTitle: 'כוורות *ותאים פתוחים*', cardSub: 'כוורת, צבע לכוורת ומחיצות',
      say: 'בפרק הזה נהפוך עמודה לכוורת של תאים פתוחים, נבחר לה צבע, ונחלק תא עם מחיצה. כוורת היא דרך מצוינת לשבור ארון סגור ולתת לו מראה קליל ומעוצב.',
    },
    {
      img: 'tut5_01', chapter: '01', title: 'הסרת דלת',
      say: 'נהפוך את העמודה הימנית לתאים פתוחים. בוחרים את העמודה, ובחלק של הדלתות לוחצים "ללא". הדלת יורדת, והמדפים נחשפים. אפשר כמובן להשאיר דלתות בשאר העמודות, ולפתוח רק את מה שהלקוח רוצה להציג.',
      beats: [
        { at: 0.03, focus: [1150, 620, 1.4], ring: [1229, 847, 40, 40] },
        { at: 0.1, click: [1249, 867] },
        { at: 0.25, ring: [1305, 487, 100, 37] },
        { at: 0.33, click: [1355, 505] },
        { at: 0.38, img: 'tut5_02', focus: F_COL3, ring: COL3 },
      ],
    },
    {
      chapter: '02', title: 'כוורת',
      say: 'עכשיו לוחצים על "כוורת". יש שתי אפשרויות: כוורת רגילה, או כוורת צד. נבחר כוורת רגילה, לכל העמודה. התוכנה בונה את התאים לפי המדפים שכבר קיימים, ככה שהגבהים נשמרים.',
      beats: [
        { at: 0.04, focus: [1250, 450, 1.7], ring: [1305, 358, 100, 37] },
        { at: 0.12, click: [1355, 376] },
        { at: 0.2, ring: [1307, 398, 94, 74] },
        { at: 0.4, click: [1354, 418] },
        { at: 0.45, img: 'tut5_03', focus: F_COL3, ring: COL3 },
      ],
    },
    {
      chapter: '03', title: 'צבע לכוורת',
      say: 'לכוורת יש צבע משלה. בלשונית הצבעים מופיע עכשיו חלק חדש: "כוורת". אפשר לבחור עץ, כמו הגוף, או לבן, שיוצר ניגוד ומבליט את התאים.',
      beats: [
        { at: 0.04, focus: F_PANEL, ring: [1608, 478, 99, 32] },
        { at: 0.22, click: [1657, 494] },
        { at: 0.36, click: [1594, 842], ring: [1571, 819, 47, 47] },
        { at: 0.42, img: 'tut5_04', focus: F_COL3, ring: COL3 },
        { at: 0.66, focus: F_PANEL, ring: [1760, 553, 47, 47] },
        { at: 0.72, click: [1783, 576] },
        { at: 0.78, img: 'tut5_05', focus: F_COL3, ring: COL3 },
      ],
    },
    {
      chapter: '04', title: 'מחיצה',
      say: 'צריכים לחלק תא לשניים? בוחרים את התא, ולוחצים "מחיצה". נוספת מחיצה אנכית באמצע התא, וכל צד הופך לתא נפרד. זה שימושי במיוחד לתיקים, לנעליים או לפריטים קטנים.',
      beats: [
        { at: 0.04, focus: [1237, 560, 1.7], ring: [1261, 513, 22, 22] },
        { at: 0.11, click: [1272, 524] },
        { at: 0.16, img: 'tut5_06', ring: [1305, 333, 100, 37] },
        { at: 0.3, click: [1355, 351] },
        { at: 0.34, img: 'tut5_07', focus: [1237, 520, 2.2], ring: [1160, 455, 155, 135] },
      ],
    },
    {
      chapter: '05', title: 'התוצאה',
      say: 'וזה הארון, עם עמודת הכוורת. כל השינויים מתעדכנים מיד גם במחיר ובשרטוט הייצור. בפרק הבא נלמד לבנות ארון פינתי, ולהוסיף כנפיים.',
      beats: [
        { at: 0.02, img: 'tut5_08', focus: [861, 524, 1.3], ring: [480, 182, 762, 684] },
        { at: 0.75, focus: [952, 535, 1], ring: null },
      ],
    },
    {
      card: true, last: true, bg: 'tut5_08', kick: 'בפרק הבא', cardTitle: 'ארון פינתי *וכנפיים*', cardSub: 'פינה ימין ושמאל, וכנפיים צדדיות',
      dur: 3.2, tail: 0.6,
    },
  ],
};
}
