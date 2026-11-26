const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 540 } });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///home/claude/formol/formol.html'); await p.waitForTimeout(1000);
  await p.click('#shakeBtn'); console.log('btn:', await p.textContent('#shakeBtn')); await p.click('#shakeBtn'); await p.click('#shakeBtn'); await p.click('#shakeBtn');
  console.log('btn:', await p.textContent('#shakeBtn'));
  await p.evaluate(() => window.__FORMOL.quickStart()); await p.waitForTimeout(200);
  const ev = f => p.evaluate(f);
  await ev(`(()=>{document.getElementById('pause').style.display='none'; window.__FORMOL.setPaused(false); const F=window.__FORMOL; F.AI.grace=999; F.AI.pos.set(10,0,62); F.P.pos.set(10,0,28); F.P.yaw=-Math.PI/2;})()`);
  for (const [label, keys] of [['walk',['KeyW']],['run',['KeyW','ShiftLeft']],['idle',[]]]) {
    for (const k of keys) await p.keyboard.down(k);
    const r = await ev(`(()=>{const F=window.__FORMOL, c=F.camera; let ys=[],rs=[],xs=[]; for(let i=0;i<60;i++){F.sim(1/30); ys.push(c.position.y); rs.push(c.rotation.z); xs.push(c.position.z);} const rng=a=>(Math.max(...a)-Math.min(...a)).toFixed(3); return {yRange:rng(ys), rollRange:rng(rs), x:F.P.pos.x.toFixed(1), trauma:F.CAM.trauma.toFixed(2)}})()`);
    for (const k of keys) await p.keyboard.up(k);
    console.log(label, JSON.stringify(r));
  }
  console.log(errs.join('\n')); await b.close();
})();
