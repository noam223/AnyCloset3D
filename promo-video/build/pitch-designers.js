// "למעצבות" — a narrated ~60s sales video aimed at interior designers: AnyCloset3D as the light,
// all-in-one alternative to heavy CAD/render software. App footage reuses the tutorial captures
// (demo projects only, prices blurred); sample figures in motion graphics are marked "דוגמה".
{
const BRAND_SAY = 'אֶנִי קְלוֹזֶט תְּרִי דִי';

window.CONTENT = {
  TEMPLATE: 'pitch',
  NAME: 'anycloset-designers',
  VOICE: 'voice_rzpnfr6i06w4',
  VOICE_STYLE: 'energetic, warm and confident Israeli commercial voiceover for interior designers, brisk fast-paced delivery, smiling',
  STEPS: [
    {
      type: 'hook', min: 5.2,
      l1: 'שעות על תוכנות', l2: '*כבדות* ומסובכות?',
      say: 'מעצבות, עוד ערב שלם על תוכנה כבדה ומסובכת, רק כדי לשרטט ארון אחד?',
    },
    {
      type: 'logo', min: 5,
      line: 'כל הנגרות של הבית. *במקום אחד.*',
      say: `תכירו את ${BRAND_SAY}: כל הנגרות של הבית, מהר, ובמקום אחד.`,
    },
    {
      type: 'app', side: 'left', chip: '01', title: 'ארון שלם *בדקות*',
      sub: 'מידות, עמודות, חלוקה ודלתות — בכמה לחיצות.',
      imgs: ['tut1_01', 'tut1_04', 'tut1_07', 'tut2_13', 'tut3_12', 'tut4_08'],
      ticks: ['מידות', 'עמודות', 'מדפים', 'תלייה ומגירות', 'דלתות וידיות', 'גוונים'],
      focus: [[952, 535, 1], [720, 500, 1.25]],
      say: 'מקלידים מידות, מחלקים לעמודות, ומוסיפים מדפים, מגירות ודלתות בכמה לחיצות.',
    },
    {
      type: 'grid', chip: '02', title: 'כל הנגרות *של הבית*',
      items: [['ty1a', 'ארון קיר'], ['ty2a', 'ארון פינתי'], ['ty3', 'חדר ארונות'], ['ty6a', 'ארון הזזה'],
        ['ty7', 'מטבח'], ['ty4', 'ארון כביסה'], ['ty8', 'קיר טלוויזיה'], ['ty5', 'ארון כניסה']],
      say: 'ארונות קיר, הזזה, פינות, מטבחים, כביסה וטלוויזיה: כל הבית בפרויקט אחד.',
    },
    {
      type: 'app', side: 'right', chip: '03', title: 'גוונים *אמיתיים*',
      sub: 'גוף, חזיתות, פנים וידיות — מקטלוג אמיתי, בתלת־ממד.',
      imgs: ['tut4_02', 'tut4_03', 'tut4_05', 'tut4_08', 'tut7_10', 'tut9_12'],
      swatches: ['#e9e4da', '#c8b49a', '#8a9a7b', '#6b4f3a', '#2f3338', '#b9c4c9'],
      focus: [[952, 535, 1], [700, 520, 1.22]],
      say: 'גוונים, חזיתות וידיות מקטלוג אמיתי, וכל שינוי מופיע מיד בתלת־ממד.',
    },
    {
      type: 'ai', min: 5.6, chip: '04', title: 'הדמיה *פוטוריאליסטית*',
      from: 'g_r4', to: 'g_ai', gallery: ['ai-03', 'ai-10', 'ai-11', 'ai-06', 'ai-02', 'ai-12', 'ai-01', 'ai-05'],
      say: 'ובלחיצה אחת, הדמיה פוטוריאליסטית שהלקוחה מתאהבת בה.',
    },
    {
      type: 'deal', chip: '05', title: 'מתכנון *לעסקה סגורה*',
      price: 18450,
      cuts: [['דופן', '270 × 60', '2'], ['מדף', '75 × 58', '6'], ['דלת', '268 × 49', '4'], ['מגירה', '72 × 18', '3']],
      say: 'מחיר בזמן אמת, חתימה דיגיטלית מהטלפון, ורשימת חיתוכים לנגר.',
    },
    {
      type: 'live', chip: '06', title: 'הלקוחה *בנייד*. בזמן אמת.',
      img: 'tut11_20', img2: 'tut11_11',
      say: 'הלקוחה רואה הכל בנייד, משאירה הערות, ומקבלת כל שינוי בזמן אמת.',
    },
    {
      type: 'compare',
      rows: [['התקנות ומחשב חזק', 'עובד ישר בדפדפן'], ['חודשים של לימוד', 'מתחילים כבר היום'],
        ['רינדור של שעות', 'הדמיה בלחיצה'], ['תוכנה לכל שלב', 'הכל במקום אחד']],
      say: 'בלי התקנות, בלי חודשי לימוד, ובלי רינדורים של שעות. מהמידה ועד החתימה, הכל במקום אחד.',
    },
    {
      type: 'outro', min: 5.6, tail: 1.8,
      l1: 'מתכננות מהר.', l2: '*סוגרות יותר.*',
      say: `${BRAND_SAY}. מתכננות מהר, סוגרות יותר.`,
    },
  ],
};
}
