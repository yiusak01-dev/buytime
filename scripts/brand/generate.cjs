// 用法：node scripts/brand/generate.cjs A（A 深綠底／B 黃底／C 米白底）— 會覆蓋 public 入面嘅 icon 同開 app 畫面
// 由品牌標誌產生 app icon、通知小圖示同 iPhone 開 app 畫面
const { chromium } = require('playwright');
const fs = require('fs');
const { C, mark } = require('./mark.cjs');
const OUT = require('path').resolve(__dirname, '../../public');
const style = process.argv[2] || 'A';
const icon = (s, st = style) => {
  if (st === 'A') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${s}" height="${s}"><rect width="1024" height="1024" fill="${C.dark}"/><rect x="192" y="192" width="640" height="640" rx="150" fill="#fff"/><g transform="translate(262 300) scale(1.42)">${mark()}</g></svg>`;
  if (st === 'B') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${s}" height="${s}"><rect width="1024" height="1024" fill="#FFE04A"/><g transform="translate(182 250) scale(1.75)">${mark({ yellow: '#E9A800' })}</g></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${s}" height="${s}"><rect width="1024" height="1024" fill="${C.cream}"/><g transform="translate(182 250) scale(1.75)">${mark()}</g></svg>`;
};
// 細 favicon：標誌放大、米白底，細尺寸都睇得清
const favicon = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${s}" height="${s}"><rect width="1024" height="1024" rx="200" fill="${C.cream}"/><g transform="translate(140 220) scale(2.1)">${mark()}</g></svg>`;
// Android 通知列小圖示：白色剪影、透明底
const badge = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 410 360" width="${s}" height="${s}">${mark({ yellow: '#fff', dark: '#fff', mint: '#fff' })}</svg>`;
const splashHtml = (w, h) => {
  const u = w / 390; // 以 390 闊為基準縮放
  return `<div style="width:${w}px;height:${h}px;background:${C.cream};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'PingFang HK','Noto Sans CJK TC','Noto Sans TC',sans-serif;position:relative;overflow:hidden">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 370 320" width="${140 * u}" height="${140 * u * 320 / 370}">${mark()}</svg>
    <div style="font-size:${50 * u}px;font-weight:900;color:${C.dark};letter-spacing:${2 * u}px;margin-top:${22 * u}px">啱啱好</div>
    <div style="font-size:${16 * u}px;font-weight:700;color:${C.dark};opacity:.8;margin-top:${8 * u}px;letter-spacing:${3 * u}px">啱時間　啱地方　啱啱好</div>
    <div style="position:absolute;bottom:${-70 * u}px;left:${-50 * u}px;width:${300 * u}px;height:${160 * u}px;border-radius:50%;background:${C.yellow}"></div>
    <div style="position:absolute;bottom:${-100 * u}px;right:${-70 * u}px;width:${260 * u}px;height:${170 * u}px;border-radius:50%;background:${C.dark}"></div>
  </div>`;
};
// iPhone 開 app 畫面：[闊, 高, 點寬, 點高, 倍數]
const IPHONES = [
  [1320, 2868, 440, 956, 3], [1206, 2622, 402, 874, 3], [1290, 2796, 430, 932, 3], [1179, 2556, 393, 852, 3],
  [1284, 2778, 428, 926, 3], [1170, 2532, 390, 844, 3], [1125, 2436, 375, 812, 3], [1242, 2688, 414, 896, 3],
  [828, 1792, 414, 896, 2], [750, 1334, 375, 667, 2],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  async function shot(html, w, h, file, transparent = false) {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;${transparent ? 'background:transparent' : ''}">${html}</body></html>`);
    await p.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  }
  await shot(icon(192), 192, 192, `${OUT}/icon-192.png`);
  await shot(icon(512), 512, 512, `${OUT}/icon-512.png`);
  await shot(icon(512), 512, 512, `${OUT}/icon-maskable-512.png`);
  await shot(icon(180), 180, 180, `${OUT}/apple-touch-icon.png`);
  await shot(favicon(32), 32, 32, `${OUT}/favicon-32.png`, true);
  await shot(badge(96), 96, 96, `${OUT}/badge-96.png`, true);
  fs.mkdirSync(`${OUT}/splash`, { recursive: true });
  const links = [];
  for (const [w, h, dw, dh, r] of IPHONES) {
    const f = `splash/iphone-${w}x${h}.png`;
    await shot(splashHtml(w, h), w, h, `${OUT}/${f}`);
    links.push(`    <link rel="apple-touch-startup-image" href="/${f}" media="(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" />`);
  }
  fs.writeFileSync(require('path').join(__dirname, 'splash-links.html'), links.join('\n'));
  await b.close();
  console.log('ok', style);
})();
