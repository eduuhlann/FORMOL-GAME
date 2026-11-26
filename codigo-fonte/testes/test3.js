const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 540 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('file:///home/claude/formol/formol.html'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__FORMOL.quickStart()); await p.waitForTimeout(300);
  const ev = f => p.evaluate(f);
  await ev(`(()=>{document.getElementById('pause').style.display='none'; window.__FORMOL.setPaused(false);})()`);
  const face = (x,z) => ev(`(()=>{const F=window.__FORMOL;const dx=${x}-F.P.pos.x,dz=${z}-F.P.pos.z;F.P.yaw=Math.atan2(-dx,-dz);F.P.pitch=0;})()`);
  for (const scenario of ['breath','nobreath','breath','nobreath']) {
    await ev(`window.__FORMOL.respawn()`);
    await ev(`(()=>{const F=window.__FORMOL;F.AI.grace=999;F.AI.pos.set(10,0,62);F.P.pos.set(59,0,21);})()`);
    await face(59,23); await ev(`window.__FORMOL.sim(0.05)`);
    const pr = await ev(`document.getElementById('prompt').textContent`);
    await p.keyboard.press('KeyE');
    await ev(`(()=>{const F=window.__FORMOL;F.AI.grace=0;F.AI.seenEnter=null;F.AI.pos.set(75,0,17);F.AI.lastKnown=F.P.pos.clone();F.AI.setState('search');F.AI.searchPts=['spot'];})()`);
    if (scenario==='breath') await p.keyboard.down('ShiftLeft');
    const r = await ev(`(()=>{const F=window.__FORMOL; const h=!!F.P.hidden; const log=[]; for(let i=0;i<24;i++){ F.sim(0.5); if(F.P.stamina<0.3){F.P.stamina=1;} log.push(F.AI.state[0]+(F.AI.checkSpot?(F.AI.checkSpot===F.P.hidden?'!':'*'):'')); if(F.P.dead)break;} return {h, dead:F.P.dead, log:log.join('')}})()`);
    if (scenario==='breath') await p.keyboard.up('ShiftLeft');
    if (await ev(`!!window.__FORMOL.P.hidden`)) await p.keyboard.press('KeyE');
    console.log(scenario, pr, JSON.stringify(r));
  }
  await p.keyboard.press('KeyE');
  await ev(`window.__FORMOL.respawn()`);
  await ev(`(()=>{const F=window.__FORMOL;F.AI.grace=999;F.AI.pos.set(10,0,62);F.P.pos.set(33,0,49);})()`); await face(33,51); await ev(`window.__FORMOL.sim(0.05)`);
  await p.keyboard.press('KeyE'); await p.waitForTimeout(1500); await p.screenshot({path:'shots/locker.png'});
  await p.keyboard.press('KeyE');
  // under bed view
  await ev(`(()=>{const F=window.__FORMOL;F.P.pos.set(33,0,9);})()`); await face(33,6); await ev(`window.__FORMOL.sim(0.05)`);
  console.log('bed prompt', await ev(`document.getElementById('prompt').textContent`));
  await p.keyboard.press('KeyE'); await p.waitForTimeout(1500); await p.screenshot({path:'shots/bed.png'});
  console.log('ERR', errs.join('\n'));
  await b.close();
})();
