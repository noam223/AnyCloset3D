// Narrated timelapse: loads the clip lengths written by tut-vo.mjs (audio/vo/<NAME>/vo.json), stretches
// step / reveal durations so no narration line overlaps the next one, then hands over to main.js.
{
let done;
window.__ready = new Promise(r => { done = r; });
window.__readyHook = () => done();

(async () => {
  const C = window.CONTENT;
  let VO = [];
  try { VO = await (await fetch(`audio/vo/${C.NAME}/vo.json`)).json(); } catch { console.error('no vo.json — run tut-vo.mjs'); }
  const T_IN = 3, GAP = 0.25, LEAD = 0.15;
  const items = [
    { it: C.INTRO, dur: T_IN, fixed: true, lead: 0.45 },
    ...C.STEPS.map(s => ({ it: s, dur: s.dur || C.STEP || 2 })),
    ...C.REV.map(r => ({ it: r, dur: r.dur || 2.5 })),
    { it: C.OUTRO || {}, dur: C.OUT_DUR || 5, out: true, lead: 0.5 },
  ];
  const cues = [];
  let t = 0, voEnd = 0, prev = null;
  for (const x of items) {
    const v = VO[(C.VO_ITEMS || []).indexOf(x.it)];
    if (v) {
      const need = voEnd + GAP - (x.lead || LEAD);
      if (t < need && prev && !prev.fixed) { prev.dur += need - t; t = need; }
      const at = Math.max(t + (x.lead || LEAD), voEnd + GAP);
      cues.push({ t: +at.toFixed(3), file: v.file });
      voEnd = at + v.dur;
      if (x.out) x.dur = Math.max(x.dur, voEnd - t + 1.4);
    }
    t += x.dur; prev = x;
  }
  for (const x of items) x.dur = Math.round(x.dur * 1000) / 1000;
  C.STEPS.forEach((s, i) => { s.dur = items[1 + i].dur; });
  C.REV.forEach((r, i) => { r.dur = items[1 + C.STEPS.length + i].dur; });
  C.OUT_DUR = items[items.length - 1].dur;
  C.VO_CUES = cues;

  const s = document.createElement('script');
  s.src = 'main.js';
  document.body.appendChild(s);
})();
}
