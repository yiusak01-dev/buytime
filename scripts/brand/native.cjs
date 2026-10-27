// 用法：node scripts/brand/native.cjs — 產生原生 app 用嘅大尺寸 icon 同開 app 畫面（assets/），
// 再用 `npx @capacitor/assets generate` 生成 iPhone／Android 各種尺寸
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { C, mark } = require('./mark.cjs');
const OUT = path.resolve(__dirname, '../../assets');
fs.mkdirSync(OUT, { recursive: true });
const BG = '#FFE04A';
// 同網頁版 B 款 icon 一樣（黃底），唔透明
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/><g transform="translate(182 250) scale(1.75)">${mark({ yellow: '#E9A800' })}</g></svg>`;
// Android 自適應 icon：前景（透明底，標誌縮細留安全區）+ 背景色
const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><g transform="translate(287 330) scale(1.25)">${mark({ yellow: '#E9A800' })}</g></svg>`;
const bg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`;
// 開 app 畫面：米白底，中間標誌同名（2732 正方，會按機種裁剪中間部分）
const splash = (dark) => `<div style="width:2732px;height:2732px;background:${dark ? C.dark : C.cream};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Noto Sans CJK TC','Noto Sans TC',sans-serif">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 370 320" width="420" height="363">${mark()}</svg>
  <div style="font-size:150px;font-weight:900;color:${dark ? C.cream : C.dark};letter-spacing:6px;margin-top:60px">啱啱好</div>
</div>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  async function shot(html, w, h, file, transparent = false) {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;${transparent ? 'background:transparent' : ''}">${html}</body></html>`);
    await p.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  }
  await shot(icon, 1024, 1024, `${OUT}/icon-only.png`);
  await shot(fg, 1024, 1024, `${OUT}/icon-foreground.png`, true);
  await shot(bg, 1024, 1024, `${OUT}/icon-background.png`);
  await shot(splash(false), 2732, 2732, `${OUT}/splash.png`);
  await shot(splash(true), 2732, 2732, `${OUT}/splash-dark.png`);
  await b.close();
  console.log('ok');
})();
