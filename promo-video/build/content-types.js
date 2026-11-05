// "כל סוגי הארונות" — one showcase per cabinet type, each built in a fresh, unsaved editor project.
// Fronts are solid colours; wood appears only in bodies, shelves, open cells and the countertop.
{
const FEATS = ['ארון רגיל', 'ארון פינתי', 'חדר ארונות', 'ארון כביסה', 'ארון כניסה', 'ארון הזזה', 'מטבח', 'ארון טלוויזיה'];

window.CONTENT = {
  NAME: 'anycloset-cabinet-types',
  REC: 'SHOWCASE',
  VIEW_BG: '#eef1f5',
  FEATS,
  INTRO: {
    l1: 'כל סוגי הארונות', l2: '*בתוכנה אחת.*',
    sub: 'מארון בגדים ועד מטבח — הכל מתוכנן ב-AnyCloset3D',
    subP: 'מארון בגדים ועד מטבח<br>הכל מתוכנן ב-AnyCloset3D',
  },
  STEPS: [],
  REV: [
    { img: 'ty1a', dur: 1.5, n: 1, feats: [0] },
    { img: 'ty1b', dur: 1.7, n: 1 },
    { img: 'ty2a', dur: 1.5, n: 2, grp: 'corner', feats: [1] },
    { img: 'ty2b', dur: 1.7, n: 2, grp: 'corner' },
    { img: 'ty3', dur: 2.6, n: 3, k: 0.84, feats: [2] },
    { img: 'ty4', dur: 2.6, n: 4, feats: [3] },
    { img: 'ty5', dur: 2.6, n: 5, feats: [4] },
    { img: 'ty6a', dur: 1.5, n: 6, grp: 'sliding', feats: [5] },
    { img: 'ty6b', dur: 1.7, n: 6, grp: 'sliding' },
    { img: 'ty7', dur: 2.6, n: 7, k: 0.9, feats: [6] },
    { img: 'ty8', dur: 3.2, n: 8, feats: [7] },
  ],
  PINS: [],
  REV_BLOCKS: [
    { from: [0], to: [2], kick: 'סוג 01', title: 'ארון *רגיל*', sub: 'דלתות ציר, מגירות, תלייה וסורבטו — בכל מידה.' },
    { from: [2], to: [4], kick: 'סוג 02', title: 'ארון *פינתי*', sub: 'שתי דפנות בזווית — כל סנטימטר בפינה מנוצל.' },
    { from: [4], to: [5], kick: 'סוג 03', title: 'חדר *ארונות*', sub: 'שלוש דפנות פתוחות: מדפים, מגירות ומוטות תלייה.' },
    { from: [5], to: [6], kick: 'סוג 04', title: 'ארון *כביסה*', sub: 'מכונת כביסה ומייבש בטור, ואחסון סגור מעל ובצד.' },
    { from: [6], to: [7], kick: 'סוג 05', title: 'ארון *כניסה*', sub: 'תלייה, מגירות וכוורת צד פתוחה — לתיקים ולמפתחות.' },
    { from: [7], to: [9], kick: 'סוג 06', title: 'ארון *הזזה*', sub: 'דלתות הזזה בפרופיל שחור — גוון אחר לכל כנף.' },
    { from: [9], to: [10], kick: 'סוג 07', title: '*מטבח*', sub: 'ארונות תחתונים עם משטח עץ, ויחידה עליונה תלויה.' },
    { from: [10], to: [10, 1.6], kick: 'סוג 08', title: 'ארון *טלוויזיה*', sub: 'נישת עץ למסך, ואחסון סגור מסביב.' },
    { from: [10, 1.6], to: 'out', kick: 'סיכום', title: `${FEATS.length} *סוגי ארונות.* תוכנה אחת.`, sub: 'מתכננים, רואים בתלת-ממד ומתמחרים — הכל ב-AnyCloset3D.', sum: true },
  ],
};
}
