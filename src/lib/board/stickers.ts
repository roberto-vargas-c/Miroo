// Schema's own sticker art (original, drawn for this app). Each sticker is a small SVG on a
// 200×200 canvas; the "die-cut" white border and dark outline come from a shared filter.

const INK = "#1e1b4b";
const FONT = `font-family="Arial Black, 'Helvetica Neue', Impact, sans-serif" font-weight="900" text-anchor="middle"`;

function burst(cx: number, cy: number, r1: number, r2: number, n: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
const poly = (n: number, cx: number, cy: number, r: number, rot = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (2 * Math.PI * i) / n;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
const eye = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="${x + r * 0.15}" cy="${y + r * 0.1}" r="${r * 0.5}" fill="${INK}"/><circle cx="${x + r * 0.3}" cy="${y - r * 0.15}" r="${r * 0.18}" fill="#fff"/>`;
const text = (x: number, y: number, size: number, fill: string, t: string, extra = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${FONT} ${extra}>${t}</text>`;
const HEART = "M100 172 C42 130 18 100 18 70 C18 44 38 26 62 26 C80 26 92 36 100 50 C108 36 120 26 138 26 C162 26 182 44 182 70 C182 100 158 130 100 172 Z";

export type Sticker = { id: string; label: string; body: string };
export type StickerPack = { id: string; name: string; stickers: Sticker[] };

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "feedback", name: "Feedback", stickers: [
      { id: "love", label: "Love", body: `<path d="${HEART}" fill="#ff5c8a"/>${eye(76, 74, 17)}${eye(124, 74, 17)}
        <rect x="28" y="108" width="144" height="46" rx="12" fill="${INK}"/>${text(100, 144, 36, "#fff", "LOVE")}` },
      { id: "review", label: "Review", body: `<ellipse cx="100" cy="104" rx="86" ry="46" fill="#4f6bff"/>
        <ellipse cx="100" cy="52" rx="26" ry="17" fill="#fff" stroke="${INK}" stroke-width="5"/><circle cx="104" cy="54" r="9" fill="${INK}"/>
        ${text(100, 116, 34, "#fff", "REVIEW")}
        <ellipse cx="100" cy="156" rx="20" ry="13" fill="#fff" stroke="${INK}" stroke-width="5"/><circle cx="96" cy="153" r="7" fill="${INK}"/>` },
      { id: "check", label: "Approved", body: `<path d="M40 104 L82 146 L162 56" fill="none" stroke="#84cc16" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M40 104 L82 146 L162 56" fill="none" stroke="#bef264" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" transform="translate(-3 -5)"/>` },
      { id: "wow", label: "Wow", body: `<polygon points="${burst(100, 100, 82, 52, 12)}" fill="#facc15"/>
        <rect x="88" y="52" width="24" height="64" rx="12" fill="${INK}"/><circle cx="100" cy="138" r="13" fill="${INK}"/>` },
      { id: "question", label: "Question", body: `<circle cx="100" cy="100" r="78" fill="#a855f7"/>${text(100, 138, 110, "#fff", "?")}` },
      { id: "happy-heart", label: "Happy", body: `<path d="${HEART}" fill="#fb7185"/>
        <path d="M62 78 Q74 66 86 78 M114 78 Q126 66 138 78" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        <path d="M76 104 Q100 128 124 104" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        <circle cx="56" cy="100" r="9" fill="#fda4af"/><circle cx="144" cy="100" r="9" fill="#fda4af"/>` },
      { id: "plus-one", label: "+1", body: `<circle cx="100" cy="100" r="76" fill="#fb923c"/>${text(100, 128, 76, "#fff", "+1")}` },
    ],
  },
  {
    id: "status", name: "Status", stickers: [
      { id: "coming-soon", label: "Coming soon", body: `<circle cx="100" cy="102" r="46" fill="#7dd3fc" stroke="${INK}" stroke-width="6"/>
        <path d="M100 102 L100 74 M100 102 L120 112" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        ${text(100, 48, 34, "#ff3d7f", "COMING")}${text(100, 186, 38, "#ff3d7f", "SOON")}` },
      { id: "wip", label: "Work in progress", body: `<path d="M100 18 L128 108 L72 108 Z" fill="#f97316" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <path d="M91 47 L109 47 L114 64 L86 64 Z M82 78 L118 78 L122 92 L78 92 Z" fill="#fff"/>
        <rect x="56" y="104" width="88" height="16" rx="5" fill="#ea580c" stroke="${INK}" stroke-width="5"/>
        ${text(100, 152, 28, "#10b981", "WORK IN")}${text(100, 184, 30, "#7c3aed", "PROGRESS")}` },
      { id: "done", label: "Done", body: `<rect x="18" y="58" width="164" height="84" rx="22" fill="#22c55e"/>
        <path d="M40 100 L56 116 L82 84" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>${text(126, 114, 32, "#fff", "DONE")}` },
      { id: "blocked", label: "Blocked", body: `<polygon points="${poly(8, 100, 100, 82, Math.PI / 8)}" fill="#ef4444"/>${text(100, 112, 30, "#fff", "BLOCKED")}` },
      { id: "on-hold", label: "On hold", body: `<circle cx="100" cy="86" r="56" fill="#fbbf24"/><rect x="78" y="58" width="15" height="56" rx="5" fill="${INK}"/><rect x="107" y="58" width="15" height="56" rx="5" fill="${INK}"/>
        <rect x="34" y="150" width="132" height="36" rx="10" fill="${INK}"/>${text(100, 178, 26, "#fbbf24", "ON HOLD")}` },
      { id: "new", label: "New", body: `<polygon points="${burst(100, 100, 84, 64, 16)}" fill="#ec4899"/>${text(100, 116, 46, "#fff", "NEW!", 'transform="rotate(-10 100 100)"')}` },
      { id: "urgent", label: "Urgent", body: `<path d="M100 22 L182 166 L18 166 Z" fill="#facc15" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
        <rect x="91" y="70" width="18" height="56" rx="9" fill="${INK}"/><circle cx="100" cy="146" r="11" fill="${INK}"/>` },
    ],
  },
  {
    id: "celebrate", name: "Celebrate", stickers: [
      { id: "rocket", label: "Rocket", body: `<g transform="translate(100 104) rotate(45) scale(0.92) translate(-100 -104)">
        <path d="M82 140 Q100 200 118 140 Z" fill="#f97316"/><path d="M90 140 Q100 176 110 140 Z" fill="#fde047"/>
        <path d="M76 108 L50 150 L80 140 Z M124 108 L150 150 L120 140 Z" fill="#ef4444" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M100 16 C132 44 136 100 124 142 L76 142 C64 100 68 44 100 16 Z" fill="#2563eb" stroke="${INK}" stroke-width="5"/>
        <circle cx="100" cy="74" r="16" fill="#bae6fd" stroke="${INK}" stroke-width="6"/></g>` },
      { id: "star", label: "Star", body: `<polygon points="${burst(100, 104, 86, 40, 5)}" fill="#fde047" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <circle cx="86" cy="100" r="6" fill="${INK}"/><circle cx="114" cy="100" r="6" fill="${INK}"/><path d="M88 118 Q100 128 112 118" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` },
      { id: "trophy", label: "Trophy", body: `<path d="M56 44 Q22 44 30 76 Q38 100 66 100 M144 44 Q178 44 170 76 Q162 100 134 100" fill="none" stroke="#eab308" stroke-width="12"/>
        <path d="M54 30 L146 30 L140 92 Q132 124 100 126 Q68 124 60 92 Z" fill="#facc15" stroke="${INK}" stroke-width="5"/>
        <rect x="90" y="124" width="20" height="26" fill="#eab308"/><rect x="60" y="148" width="80" height="26" rx="6" fill="#7c2d12"/>${text(100, 92, 44, "#a16207", "1")}` },
      { id: "fire", label: "Fire", body: `<path d="M100 18 C120 56 160 74 156 124 C152 162 126 184 100 184 C70 184 44 162 44 126 C44 96 64 84 70 62 C82 80 86 90 92 96 C100 70 92 44 100 18 Z" fill="#f97316"/>
        <path d="M100 96 C110 116 130 126 126 152 C122 170 112 178 100 178 C86 178 76 168 76 152 C76 132 92 124 100 96 Z" fill="#fde047"/>` },
      { id: "yay", label: "Yay", body: `<polygon points="${burst(100, 100, 80, 56, 10)}" fill="#22d3ee"/>${text(100, 116, 48, "#fff", "YAY!", 'transform="rotate(-8 100 100)"')}
        <rect x="20" y="24" width="14" height="14" fill="#f472b6" transform="rotate(20 27 31)"/><circle cx="172" cy="34" r="8" fill="#a3e635"/><rect x="164" y="160" width="14" height="14" fill="#facc15" transform="rotate(-25 171 167)"/><circle cx="28" cy="168" r="8" fill="#a78bfa"/>` },
      { id: "hundred", label: "100", body: `${text(100, 120, 84, "#ef4444", "100", 'transform="rotate(-8 100 100)"')}
        <path d="M30 146 Q100 132 172 136 M40 166 Q100 152 162 156" fill="none" stroke="#ef4444" stroke-width="10" stroke-linecap="round"/>` },
      { id: "clap", label: "Bravo", body: `<rect x="24" y="56" width="152" height="88" rx="44" fill="#8b5cf6"/>${text(100, 116, 40, "#fff", "BRAVO")}
        <path d="M30 40 L44 54 M100 24 L100 44 M170 40 L156 54" stroke="#f59e0b" stroke-width="9" stroke-linecap="round"/>` },
    ],
  },
  {
    id: "studio", name: "Studio", stickers: [
      { id: "idea", label: "Idea", body: `<path d="M100 26 C140 26 160 56 156 86 C152 110 132 120 128 142 L72 142 C68 120 48 110 44 86 C40 56 60 26 100 26 Z" fill="#fde047" stroke="${INK}" stroke-width="5"/>
        <rect x="74" y="142" width="52" height="16" rx="4" fill="#94a3b8" stroke="${INK}" stroke-width="4"/><rect x="80" y="158" width="40" height="14" rx="6" fill="#64748b"/>
        <path d="M88 120 L88 96 Q100 84 112 96 L112 120" fill="none" stroke="#f59e0b" stroke-width="6" stroke-linecap="round"/>` },
      { id: "coffee", label: "Coffee", body: `<path d="M150 92 Q182 92 176 122 Q170 146 140 140" fill="none" stroke="${INK}" stroke-width="12"/>
        <path d="M34 72 L156 72 L148 158 Q144 178 122 178 L68 178 Q46 178 42 158 Z" fill="#f43f5e" stroke="${INK}" stroke-width="5"/>
        <path d="M70 52 Q60 38 72 24 M100 52 Q90 38 102 24 M130 52 Q120 38 132 24" fill="none" stroke="#94a3b8" stroke-width="7" stroke-linecap="round"/>
        ${text(95, 136, 30, "#fff", "BRB")}` },
      { id: "pencil", label: "Sketch", body: `<g transform="rotate(-45 100 100)"><rect x="80" y="24" width="40" height="120" fill="#facc15" stroke="${INK}" stroke-width="5"/>
        <rect x="80" y="16" width="40" height="20" rx="6" fill="#f472b6" stroke="${INK}" stroke-width="5"/><path d="M80 144 L100 182 L120 144 Z" fill="#fde68a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <path d="M93 168 L100 182 L107 168 Z" fill="${INK}"/></g>` },
      { id: "house", label: "House", body: `<path d="M100 22 L178 92 L156 92 L156 172 L44 172 L44 92 L22 92 Z" fill="#38bdf8" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
        <rect x="86" y="118" width="30" height="54" fill="#f97316" stroke="${INK}" stroke-width="5"/><rect x="58" y="104" width="22" height="22" fill="#fff" stroke="${INK}" stroke-width="5"/><rect x="124" y="104" width="22" height="22" fill="#fff" stroke="${INK}" stroke-width="5"/>` },
      { id: "set-square", label: "Measure", body: `<path d="M30 170 L30 30 L170 170 Z M56 144 L56 92 L108 144 Z" fill="#a3e635" fill-rule="evenodd" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
        <path d="M30 60 L44 60 M30 90 L40 90 M30 120 L44 120 M60 170 L60 158 M90 170 L90 160 M120 170 L120 158" stroke="${INK}" stroke-width="5"/>` },
      { id: "nice", label: "Nice", body: `<path d="M24 40 L176 40 Q186 40 186 52 L186 128 Q186 140 176 140 L80 140 L48 176 L54 140 L24 140 Q14 140 14 128 L14 52 Q14 40 24 40 Z" fill="#14b8a6"/>${text(100, 108, 42, "#fff", "NICE!")}` },
      { id: "deadline", label: "Deadline", body: `<rect x="30" y="38" width="140" height="138" rx="14" fill="#fff" stroke="${INK}" stroke-width="6"/><rect x="30" y="38" width="140" height="40" rx="14" fill="#ef4444" stroke="${INK}" stroke-width="6"/>
        <path d="M64 26 L64 50 M136 26 L136 50" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>${text(100, 150, 60, INK, "!!")}` },
    ],
  },
];

export const STICKER_BY_ID = new Map(STICKER_PACKS.flatMap((p) => p.stickers.map((s) => [s.id, s] as const)));

const FILTER = `<filter id="cut" filterUnits="userSpaceOnUse" x="-12" y="-12" width="224" height="228">
  <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="w"/>
  <feMorphology in="SourceAlpha" operator="dilate" radius="9" result="k"/>
  <feFlood flood-color="#fff"/><feComposite in2="w" operator="in" result="white"/>
  <feFlood flood-color="${INK}" flood-opacity="0.9"/><feComposite in2="k" operator="in" result="ink"/>
  <feOffset in="ink" dy="4" result="shadow"/>
  <feMerge><feMergeNode in="shadow"/><feMergeNode in="ink"/><feMergeNode in="white"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;

/** Full SVG document for a sticker, with its die-cut border. */
export function stickerSvg(id: string) {
  const s = STICKER_BY_ID.get(id);
  if (!s) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 224 228" width="448" height="456"><defs>${FILTER}</defs><g filter="url(#cut)">${s.body}</g></svg>`;
}
export function stickerUrl(id: string) {
  const svg = stickerSvg(id);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " "))}` : null;
}

export const EMOJI_GROUPS: { name: string; emojis: string[] }[] = [
  { name: "Smileys", emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂", "😉", "😍", "🥰", "😘", "😎", "🤩", "🥳", "🤔", "🤨", "😐", "😶", "🙄", "😏", "😮", "😲", "😳", "🥺", "😢", "😭", "😤", "😡", "🤯", "😱", "🤗", "🤫", "😴", "🤓", "🧐", "😇", "🤠"] },
  { name: "Hands", emojis: ["👍", "👎", "👏", "🙌", "👋", "🤝", "🙏", "✌️", "🤞", "👌", "🤘", "💪", "👉", "👈", "👆", "👇", "✋", "🫶"] },
  { name: "Symbols", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💯", "✅", "❌", "❓", "❗", "⚠️", "⭐", "🌟", "✨", "🔥", "💡", "🎯", "📌", "📍", "🚩", "🏁", "⏰", "⏳", "🔒", "🔑", "♻️"] },
  { name: "Work", emojis: ["🚀", "🎉", "🎊", "🏆", "🥇", "📈", "📉", "📊", "📝", "✏️", "📐", "📏", "🖊️", "🗂️", "📁", "📎", "🗓️", "📅", "💼", "☕", "🧠", "👀", "💬", "🗯️", "🔍", "🛠️", "🧱", "🏗️"] },
  { name: "Places", emojis: ["🏠", "🏡", "🏢", "🏛️", "🏙️", "🌇", "🌳", "🌲", "🌿", "🌊", "⛰️", "🌞", "🌙", "☁️", "🌧️", "❄️", "🚗", "🚲", "🚆", "✈️"] },
];
