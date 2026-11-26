const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 600 } }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/claude/formol/formol.html'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const F = window.__FORMOL; F.quickStart(); for (const n of [1,2]) { F.P.carry.push(F.interact.find(x=>x.type==='fuse'&&x.n===n)); F.installOne(); } });
  await p.evaluate(() => { document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'})); });
  await p.waitForTimeout(1200); await p.screenshot({path:'shots/m_pause.png'});
  console.log('paused', await p.evaluate(()=>document.getElementById('pause').style.display)); await p.reload(); await p.waitForTimeout(1200); await p.keyboard.press('KeyA'); await p.waitForTimeout(800);
  console.log('cont:', await p.evaluate(()=>[document.getElementById('contItem').className, document.getElementById('contInfo').textContent]));
  await p.evaluate(()=>document.querySelector('#mainItems li[data-act=cont]').click()); await p.waitForTimeout(2500);
  console.log(await p.evaluate(()=>JSON.stringify({m:window.__FORMOL.MODE, inst:window.__FORMOL.P.installed, lv:window.__FORMOL.AI.level})));
  console.log(errs.join('\n')); await b.close();
})();
