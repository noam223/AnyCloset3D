// Meta ad (~35s) — sell AnyCloset3D directly to interior designers.
// Angle: close more deals — photoreal + client on phone. Pros named in the first second.
{
const BRAND_SAY = 'אֶנִי קְלוֹזֶט תְּרִי דִי';

window.CONTENT = {
  TEMPLATE: 'pitch',
  NAME: 'anycloset-pros-designers',
  VOICE: 'voice_rzpnfr6i06w4',
  VOICE_STYLE: 'energetic, warm Israeli commercial voiceover for interior designers, clear and confident, smiling, brisk',
  STEPS: [
    {
      type: 'hook', min: 4.8,
      l1: 'מעצבות פנים —', l2: 'הלקוחה *מחכה* להצעה?',
      say: 'מעצבות פנים — הלקוחה מחכה להצעה, ואתן עדיין תקועות על תוכנה כבדה?',
    },
    {
      type: 'logo', min: 4.4,
      line: 'תוכנה *לבעלות מקצוע.* סוגרות מהר.',
      say: `תכירו את ${BRAND_SAY}: תוכנה לבעלות מקצוע. מתכננות מהר, סוגרות יותר.`,
    },
    {
      type: 'app', side: 'left', chip: '01', title: 'ארון שלם *בדקות*',
      sub: 'מידות, חלוקה, דלתות וגוונים — בלי שעות שרטוט.',
      imgs: ['tut1_01', 'tut1_07', 'tut2_13', 'tut3_12', 'tut4_08'],
      ticks: ['מידות', 'חלוקה', 'דלתות', 'גוונים', '3D חי'],
      focus: [[952, 535, 1], [720, 500, 1.25]],
      say: 'מידות, חלוקה, דלתות וגוונים — ארון שלם בדקות, בלי שעות שרטוט.',
    },
    {
      type: 'ai', min: 5.2, chip: '02', title: 'הדמיה *שהלקוחה קונה*',
      from: 'g_r4', to: 'g_ai', gallery: ['ai-03', 'ai-10', 'ai-11', 'ai-06', 'ai-02', 'ai-12'],
      say: 'ובלחיצה אחת — הדמיה פוטוריאליסטית שהלקוחה באמת מתאהבת בה.',
    },
    {
      type: 'live', chip: '03', title: 'הלקוחה *בנייד*. חותמת.',
      img: 'tut11_20', img2: 'tut11_11',
      say: 'הלקוחה רואה בנייד, משאירה הערות, וחותמת דיגיטלית — בלי פגישת מכירה נוספת.',
    },
    {
      type: 'deal', chip: '04', title: 'מחיר *ממוצע לשוק*',
      price: 18450,
      priceLabel: 'מחיר ממוצע לשוק',
      priceDemo: 'ממוצע שוק',
      cutsLabel: 'רשימת חיתוכים לנגר',
      cutsOk: 'מוכן להורדה ✓',
      cuts: [['דופן', '270 × 60', '2'], ['מדף', '75 × 58', '6'], ['דלת', '268 × 49', '4'], ['מגירה', '72 × 18', '3']],
      say: 'מחירון ממוצע לשוק להצעה מהירה ללקוחה, ורשימת חיתוכים מוכנה לנגר. מהתכנון ועד העסקה — במקום אחד.',
    },
    {
      type: 'outro', min: 5.2, tail: 1.6,
      l1: 'שבוע ניסיון *חינם.*', l2: 'למעצבות בלבד.',
      say: `${BRAND_SAY}. שבוע ניסיון חינם. התחילו היום.`,
    },
  ],
};
}
