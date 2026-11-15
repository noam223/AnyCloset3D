// Meta ad (~35s) — sell AnyCloset3D directly to carpenters / cabinet makers.
// Angle: from plan to cutting list — no heavy CAD. Pros named in the first second.
{
const BRAND_SAY = 'אֶנִי קְלוֹזֶט תְּרִי דִי';

window.CONTENT = {
  TEMPLATE: 'pitch',
  NAME: 'anycloset-pros-carpenters',
  VOICE: 'voice_rzpnfr6i06w4',
  VOICE_STYLE: 'confident, direct Israeli commercial voiceover for carpenters and workshop owners, clear and grounded, brisk',
  STEPS: [
    {
      type: 'hook', min: 4.8,
      l1: 'נגרים —', l2: 'עוד פעם *שרטוט* ידני?',
      say: 'נגרים — עוד פעם שרטוט ידני, או תוכנת תלת־ממד שלוקחת חודשים ללמוד?',
    },
    {
      type: 'logo', min: 4.4,
      line: 'תכנון נגרות. *בלי CAD כבד.*',
      say: `תכירו את ${BRAND_SAY}: תכנון נגרות מקצועי בדפדפן — בלי תוכנה כבדה ובלי חודשי לימוד.`,
    },
    {
      type: 'deal', chip: '01', title: 'סיכום *חיתוכים* להערכה',
      price: 14200,
      priceLabel: 'מחיר ממוצע לשוק',
      priceDemo: 'ממוצע שוק',
      cutsLabel: 'סיכום חיתוכים להערכה',
      cutsOk: 'מוכן להורדה ✓',
      cuts: [['דופן', '270 × 60', '2'], ['מדף', '75 × 58', '8'], ['דלת', '268 × 49', '4'], ['מגירה', '72 × 18', '4']],
      say: 'מקלידים מידות — ומקבלים הערכת מחיר וסיכום חיתוכים לתכנון. לא נשלח ל־CNC, זה כלי עזר לסדנה.',
    },
    {
      type: 'app', side: 'right', chip: '02', title: 'כל סוגי *הנגרות*',
      sub: 'קיר, הזזה, פינה, מטבח, כביסה — בפרויקט אחד.',
      imgs: ['tut1_07', 'tut6_10', 'tut7_10', 'tut8_10', 'tut9_12'],
      ticks: ['ארון קיר', 'הזזה', 'פינתי', 'מטבח', 'כביסה'],
      focus: [[952, 535, 1], [700, 520, 1.2]],
      say: 'ארון קיר, הזזה, פינה, מטבח וכביסה — כל הנגרות של הבית בפרויקט אחד.',
    },
    {
      type: 'compare',
      rows: [['CAD כבד והתקנות', 'עובד ישר בדפדפן'], ['בלגן באקסל', 'סיכום ברור להערכה'],
        ['רינדור של שעות', 'הדמיה בלחיצה'], ['רק שרטוט', 'עד חתימת לקוח']],
      say: 'בלי התקנות, בלי לימוד של חודשים. מהמידה דרך ההערכה ועד חתימת הלקוח — הכל במקום אחד.',
    },
    {
      type: 'outro', min: 5.2, tail: 1.6,
      l1: 'שבוע ניסיון *חינם.*', l2: 'לנגרים ולסדנאות.',
      say: `${BRAND_SAY}. שבוע ניסיון חינם. תכננו היום, הציגו ללקוח מחר.`,
    },
  ],
};
}
