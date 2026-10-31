// Version B — "speed & sales": gold on dark amber, bright music, pricing-first story.
const R = '../assets/renders/';
export const VIDEO = { name: 'anycloset-promo-B', fps: 30, bpm: 120, music: 'bright', seed: 4242 };

export const BRAND = {
  lang: 'he',
  logo: '../assets/brand/logo-wide.png',
  logoIcon: { ratio: 0.16, side: 'left' },
  url: 'anycloset3d.com',
  bgPattern: 'diag',
  colors: {
    accent: '#ffb547', accent2: '#ffd89a',
    bg1: '#1d1409', bg2: '#130d07', bg3: '#0a0704', glow: 'rgba(120,72,18,.75)',
    sun1: '#3a2208', sun2: '#8a4b12', sun3: '#e08a2a',
  },
};

export const SCENES = [
  { type: 'hook', dur: 4, title: ['הלקוח עדיין', 'מחכה ל<em>הצעת מחיר</em>…'],
    cards: [
      { kind: 'alert', text: 'הלקוח סגר עם מתחרה' },
      { kind: 'bubble', text: 'נו, יש כבר מחיר?', time: '09:12' },
      { kind: 'calc', text: '₪ ???' },
      { kind: 'bubble', text: 'עוד לא קיבלתי כלום…', time: '18:40' },
      { kind: 'sheet', rows: [['פריט', 'כמות', 'מחיר'], ['פרזול', '12', '?'], ['חזיתות', '7', '?'], ['הובלה', '1', '?']] },
      { kind: 'sticky', text: 'לשלוח<br>עד מחר!' },
      { kind: 'note', text: 'הצעה #3 — לתקן', x: '✗' },
      { kind: 'tag', text: '3 ימי המתנה' },
    ] },
  { type: 'logo', dur: 2, tagline: 'מהדמיה להצעת מחיר — בדקות' },
  { type: 'list', dur: 3.5, num: '01', chip: 'תמחור', title: ['הצעת מחיר.', '<em>תוך דקות.</em>'],
    sub: 'כל רכיב מתומחר אוטומטית לפי המפרט.', card: { title: 'הצעת מחיר', note: 'פרויקט לדוגמה' },
    items: [{ label: 'ארון זכוכית · 7 דלתות', value: '₪14,900' }, { label: 'תאורת LED פנימית', value: '₪1,350' },
            { label: 'מגירות פנימיות ×4', value: '₪1,600' }, { label: 'הובלה והתקנה', value: '₪1,900' }],
    total: { label: 'סה״כ', value: 19750, prefix: '₪' }, stamp: 'נשלח ללקוח ✓' },
  { type: 'image', dur: 3.5, in: 'push', num: '02', chip: 'תכנון', title: ['תכנון מדויק.', '<em>בלי שרטוטים.</em>'],
    sub: 'מידות, עמודות ומגירות — בגרירה.', image: R + 'sample-3d.jpg', bullets: ['מידות', 'עמודות', 'מגירות', 'דלתות'] },
  { type: 'scan', dur: 3.5, num: '03', chip: 'הדמיית AI', title: ['מרשים את הלקוח.', '<em>בלחיצה.</em>'],
    titlePortrait: ['מרשים', 'את הלקוח.', '<em>בלחיצה.</em>'],
    before: R + 'sample-3d-close.jpg', after: R + 'ai-02.jpg', labels: ['תלת-ממד', '✦ AI'] },
  { type: 'gallery', dur: 3, in: 'blur', num: '04', chip: 'עיצוב', title: ['משנים גוון.', '<em>בשנייה.</em>'],
    images: [R + 'ai-12.jpg', R + 'ai-06.jpg', R + 'ai-02.jpg', R + 'ai-05.jpg'],
    swatches: ['#e9e4da', '#9fb19a', '#2d3138', '#f3f1ec', '#6b4a32'],
    counter: { to: 1651, label: 'גווני טמבור' } },
  { type: 'device', dur: 3, in: 'whip', num: '05', chip: 'שיתוף', title: ['הלקוח רואה.', '<em>מהטלפון.</em>'],
    sub: 'קישור אחד — בלי התקנה, מכל מכשיר.', screens: [R + 'ai-02.jpg', R + 'ai-01.jpg'],
    link: 'anycloset3d.com/live', toast: '✓ ההצעה אצל הלקוח' },
  { type: 'cards', dur: 3.5, in: 'wipe', num: '06', chip: 'ייצור', title: ['אושר?', '<em>ישר לייצור.</em>'],
    sub: 'שרטוט לנגר והזמנה למפעל — אוטומטית.',
    cards: [{ title: 'הצעת מחיר · PDF', label: 'ללקוח', color: '#8a4b12', image: R + 'ai-02.jpg' },
            { title: 'שרטוט ייצור', label: 'לנגר', dark: true, color: '#3a2208' },
            { title: 'הזמנה לייצור', label: 'למפעל', color: '#b8741a' }] },
  { type: 'outro', dur: 4, title: ['פחות שרטוטים.', 'יותר <em>סגירות</em>.'], cta: 'נסו שבוע חינם' },
];
