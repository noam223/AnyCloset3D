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
      line: 'תכנון נגרות. *מוכן לייצור.*',
      say: `תכירו את ${BRAND_SAY}: תכנון נגרות מקצועי, מוכן לייצור — ישר מהדפדפן.`,
    },
    {
      type: 'deal', chip: '01', title: 'רשימת *חיתוכים* מוכנה',
      price: 14200,
      cuts: [['דופן', '270 × 60', '2'], ['מדף', '75 × 58', '8'], ['דלת', '268 × 49', '4'], ['מגירה', '72 × 18', '4']],
      say: 'מקלידים מידות — ומקבלים מחיר ורשימת חיתוכים מדויקת לנגר. בלי טבלאות אקסל.',
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
      rows: [['CAD כבד והתקנות', 'עובד ישר בדפדפן'], ['שגיאות מדידה', 'מידות מדויקות לייצור'],
        ['רינדור של שעות', 'הדמיה בלחיצה'], ['רק שרטוט', 'עד חתימת לקוח']],
      say: 'בלי התקנות, בלי לימוד של חודשים. מהמידה ועד רשימת החיתוכים והחתימה — הכל במקום אחד.',
    },
    {
      type: 'outro', min: 5.2, tail: 1.6,
      l1: 'שבוע ניסיון *חינם.*', l2: 'לנגרים ולסדנאות.',
      say: `${BRAND_SAY}. שבוע ניסיון חינם. תכננו היום, ייצרו מחר.`,
    },
  ],
};
}
