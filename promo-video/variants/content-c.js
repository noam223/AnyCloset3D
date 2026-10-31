// Version C — "customer experience": emerald on deep green, warm music, AI-first story.
const R = '../assets/renders/';
export const VIDEO = { name: 'anycloset-promo-C', fps: 30, bpm: 120, music: 'warm', seed: 777 };

export const BRAND = {
  lang: 'he',
  logo: '../assets/brand/logo-wide.png',
  logoIcon: { ratio: 0.16, side: 'left' },
  url: 'anycloset3d.com',
  bgPattern: 'dots',
  colors: {
    accent: '#5ee6b0', accent2: '#b4f5da',
    bg1: '#06231d', bg2: '#041814', bg3: '#020e0b', glow: 'rgba(20,95,74,.8)',
    sun1: '#05372c', sun2: '#0f6b53', sun3: '#2fbf8f',
  },
};

export const SCENES = [
  { type: 'hook', dur: 4.5, title: ['הלקוח לא מצליח', '<em>לדמיין</em> את הארון?'],
    cards: [
      { kind: 'bubble', text: 'אני לא רואה את זה בראש', time: '20:31' },
      { kind: 'note', text: 'סקיצה #4', x: '?' },
      { kind: 'bubble', text: 'אפשר לראות תמונה?', time: '20:33' },
      { kind: 'sticky', text: 'לצייר<br>שוב…' },
      { kind: 'bubble', text: 'זה לא מה שדמיינתי 😕', time: '20:40' },
      { kind: 'tag', text: 'איזה גוון?' },
      { kind: 'alert', text: 'הלקוח צריך לחשוב' },
    ] },
  { type: 'logo', dur: 2, tagline: 'הלקוח רואה את הארון — לפני שהוא קיים' },
  { type: 'scan', dur: 4, num: '01', chip: 'הדמיית AI', title: ['תמונה אמיתית.', 'עוד <em>לפני הייצור</em>.'],
    before: R + 'sample-3d.jpg', after: R + 'ai-01.jpg', labels: ['תלת-ממד', '✦ הדמיית AI'] },
  { type: 'device', dur: 4, in: 'whip', num: '02', chip: 'שיתוף חי', title: ['בוחרים יחד.', '<em>בזמן אמת.</em>'],
    sub: 'הלקוח פותח קישור — ורואה כל שינוי.', screens: [R + 'ai-07.jpg', R + 'ai-05.jpg'],
    link: 'anycloset3d.com/live', picker: { label: 'גוון חזית', colors: ['#9fb19a', '#f3f1ec', '#6b4a32'] }, toast: '✓ הלקוח אהב!' },
  { type: 'gallery', dur: 4, in: 'blur', num: '03', chip: 'השראה', title: ['כל סגנון.', '<em>כל חלום.</em>'],
    images: [R + 'ai-06.jpg', R + 'ai-03.jpg', R + 'ai-12.jpg', R + 'ai-05.jpg', R + 'ai-02.jpg', R + 'ai-07.jpg'],
    counter: { to: 1651, label: 'גוונים לבחירה' } },
  { type: 'blueprint', dur: 4, in: 'push', num: '04', chip: 'דיוק', title: ['כמו בהדמיה.', '<em>בדיוק.</em>'],
    sub: 'מידות מדויקות עד המילימטר.', image: R + 'sample-3d-close.jpg',
    box: [6.7, 15.4, 74.4, 74.6], columns: 7, measure: { value: 280, unit: 'ס״מ' } },
  { type: 'cards', dur: 3.5, in: 'wipe', num: '05', chip: 'ליווי', title: ['הכל מסודר.', '<em>במקום אחד.</em>'],
    sub: 'סיכום ללקוח, שרטוט והזמנה — בלחיצה.',
    cards: [{ title: 'סיכום ללקוח · PDF', label: 'ללקוח', color: '#0f6b53', image: R + 'ai-01.jpg' },
            { title: 'שרטוט ייצור', label: 'לנגר', dark: true, color: '#05372c' },
            { title: 'הזמנה לייצור', label: 'למפעל', color: '#1f8f6c' }] },
  { type: 'outro', dur: 4, title: ['הלקוח רואה.', 'הלקוח <em>סוגר</em>.'], cta: 'התחילו שבוע ניסיון חינם' },
];
