// 啱啱好標誌：黃（機會）+ 深綠（需求）+ 綠點（連接）
const C = { yellow: '#F6C61A', dark: '#0D4A3A', mint: '#2EB67D', cream: '#FBF6EA' };
function mark({ yellow = C.yellow, dark = C.dark, mint = C.mint } = {}) {
  // viewBox 0 0 330 300（標誌本身）
  return `<g>
    <rect x="70" y="12" width="96" height="276" rx="30" fill="${yellow}"/>
    <rect x="214" y="10" width="96" height="280" rx="30" fill="${dark}"/>
    <rect x="148" y="104" width="112" height="82" rx="41" fill="${dark}"/>
    <path d="M206 104 C214 104 214 96 214 90 L214 200 C214 194 214 186 206 186 Z" fill="${dark}"/>
    <ellipse cx="70" cy="196" rx="44" ry="41" fill="${dark}"/>
    <ellipse cx="304" cy="158" rx="48" ry="45" fill="${mint}"/>
  </g>`;
}
module.exports = { C, mark };
