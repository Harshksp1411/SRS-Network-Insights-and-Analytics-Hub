const v = n => `rgb(var(--${n}) / <alpha-value>)`;
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: { extend: { colors: {
    canvas: v('bg'), panel: v('panel'), chip: v('chip'), line: v('line'), ink: v('ink'), ink2: v('ink2'), ink3: v('ink3'), mapland: v('mapland'), side: v('side'), head: v('head'),
    ok: v('ok'), warn: v('warn'), bad: v('bad'), alert: v('alert'), info: v('info'), ai: v('ai'), brand: v('brand'), action: v('action'),
  } } },
  plugins: [],
};
