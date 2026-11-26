const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 540 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file:///home/claude/formol/formol.html'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__FORMOL.quickStart()); await p.waitForTimeout(300);
  const ev = f => p.evaluate(f);
  await ev(`(()=>{document.getElementById('pause').style.display='none'; window.__FORMOL.setPaused(false);})()`);
  const face = (x,z) => ev(`(()=>{const F=window.__FORMOL;const dx=${x}-F.P.pos.x,dz=${z}-F.P.pos.z;F.P.yaw=Math.atan2(-dx,-dz);F.P.pitch=0;})()`);
  const aimHead = `const hp=new F.camera.position.constructor(); F.AI.headPos(hp); const dx=hp.x-F.camera.position.x, dy=hp.y-F.camera.position.y, dz=hp.z-F.camera.position.z; F.P.yaw=Math.atan2(-dx,-dz); F.P.pitch=Math.atan2(dy,Math.hypot(dx,dz));`;
  // ---- grace / patrol sanity
  let r = await ev(`(()=>{const F=window.__FORMOL; F.sim(30); return {state:F.AI.state, ai:F.AI.pos.toArray().map(v=>+v.toFixed(1)), grace:F.AI.grace.toFixed(1)}})()`); console.log('after30s', JSON.stringify(r));
  // ---- burn: creature charging from 9m
  await ev(`(()=>{const F=window.__FORMOL;F.P.pos.set(41,0,28);F.AI.pos.set(30,0,28);F.AI.grace=0;F.AI.setState('chase');F.AI.lastSeenT=0;F.sim(0.1);})()`);
  await p.mouse.down({button:'right'});
  r = await ev(`(()=>{const F=window.__FORMOL; const log=[]; for(let i=0;i<60;i++){ ${aimHead} F.sim(1/30); if(i%6==0) log.push(F.AI.state[0]+F.AI.burnAcc.toFixed(2)+'@'+F.AI.pos.distanceTo(F.P.pos).toFixed(1)); if(F.AI.state==='recoil') break;} return {state:F.AI.state,burns:F.AI.burns,heat:F.fl.heat.toFixed(2),dead:F.P.dead,log:log.join(' ')}})()`);
  console.log('burn', JSON.stringify(r));
  await p.mouse.up({button:'right'});
  r = await ev(`(()=>{const F=window.__FORMOL; F.sim(6.5); return {state:F.AI.state, d:F.AI.pos.distanceTo(F.P.pos).toFixed(1)}})()`); console.log('after recoil', JSON.stringify(r));
  // ---- overheat
  await ev(`(()=>{const F=window.__FORMOL;F.AI.pos.set(10,0,62);F.AI.setState('patrol');F.AI.grace=999;F.P.dead=false;F.fl.heat=0;})()`);
  await p.mouse.down({button:'right'}); r = await ev(`(()=>{const F=window.__FORMOL; F.sim(4.5); return {heat:F.fl.heat.toFixed(2), over:F.fl.overheat.toFixed(1), batt:F.fl.battery.toFixed(1)}})()`); await p.mouse.up({button:'right'}); console.log('overheat', JSON.stringify(r));
  // ---- fuse pickup + install
  r = await ev(`(()=>{const F=window.__FORMOL; const f=F.interact.find(i=>i.type==='fuse'&&i.n===1); F.P.pos.set(f.pos.x+1.0,0,f.pos.z); return f.pos.toArray()})()`);
  await face(r[0], r[2]); await ev(`window.__FORMOL.sim(0.1)`);
  console.log('fuse prompt:', await ev(`document.getElementById('prompt').textContent`));
  await p.keyboard.press('KeyE');
  r = await ev(`(()=>{const F=window.__FORMOL; return {carry:F.P.carry.length, susp:F.AI.state}})()`); console.log('pickup', JSON.stringify(r));
  await ev(`(()=>{const F=window.__FORMOL;F.P.pos.set(37,0,33.4);})()`); await face(37,32); await ev(`window.__FORMOL.sim(0.1)`);
  console.log('panel prompt:', await ev(`document.getElementById('prompt').textContent`));
  await p.keyboard.down('KeyE'); await ev(`window.__FORMOL.sim(3.2)`); await p.keyboard.up('KeyE');
  await p.waitForTimeout(1000); await ev(`window.__FORMOL.sim(0.1)`);
  r = await ev(`(()=>{const F=window.__FORMOL; return {inst:F.P.installed, lvl:F.AI.level, enf:F.LIGHTS.filter(l=>l.sector==='enfermaria').map(l=>l.on), lg:F.lightGrid[6*44+22].toFixed(2)}})()`); console.log('install', JSON.stringify(r));
  // ---- hide in locker, creature searches; holding breath vs not
  await ev(`(()=>{const F=window.__FORMOL;F.P.pos.set(33,0,49);})()`); await face(33,51); await ev(`window.__FORMOL.sim(0.1)`);
  console.log('locker prompt:', await ev(`document.getElementById('prompt').textContent`));
  await p.keyboard.press('KeyE');
  r = await ev(`(()=>{const F=window.__FORMOL; return {hidden:!!F.P.hidden, type:F.P.hidden&&F.P.hidden.type}})()`); console.log('hide', JSON.stringify(r));
  await p.screenshot({path:'shots/locker.png'});
  await p.keyboard.press('KeyE'); r = await ev(`(()=>{const F=window.__FORMOL; return {hidden:!!F.P.hidden, pos:F.P.pos.toArray().map(v=>v.toFixed(1))}})()`); console.log('unhide', JSON.stringify(r));
  // seen entering → pulled out
  await ev(`(()=>{const F=window.__FORMOL;F.P.pos.set(33,0,49);F.AI.pos.set(33,0,40);F.AI.grace=0;F.AI.setState('chase');F.AI.lastSeenT=0;})()`); await face(33,51);
  await p.keyboard.press('KeyE');
  r = await ev(`(()=>{const F=window.__FORMOL; const seen=F.AI.seenEnter===F.P.hidden; F.sim(5); return {seen, dead:F.P.dead}})()`); console.log('seen-enter', JSON.stringify(r));
  await ev(`window.__FORMOL.respawn()`);
  // ---- death by contact
  await ev(`(()=>{const F=window.__FORMOL;F.P.pos.set(40,0,28);F.AI.pos.set(42,0,28);F.AI.grace=0;F.AI.setState('chase');F.sim(2);})()`);
  r = await ev(`(()=>{const F=window.__FORMOL; return {dead:F.P.dead}})()`); console.log('death', JSON.stringify(r));
  await ev(`window.__FORMOL.respawn()`);
  r = await ev(`(()=>{const F=window.__FORMOL; return {dead:F.P.dead, inst:F.P.installed, carry:F.P.carry.length, ai:F.AI.pos.toArray().map(v=>v.toFixed(0))}})()`); console.log('respawn', JSON.stringify(r));
  // ---- stalking at reception edge
  await ev(`(()=>{const F=window.__FORMOL;F.P.pos.set(43,0,40);F.AI.pos.set(43,0,24);F.AI.grace=0;F.AI.setState('chase');F.AI.lastSeenT=0;F.sim(4);})()`);
  r = await ev(`(()=>{const F=window.__FORMOL; return {state:F.AI.state, stalking:F.AI.stalking, dead:F.P.dead, ai:F.AI.pos.toArray().map(v=>v.toFixed(1))}})()`); console.log('reception refuge', JSON.stringify(r));
  // ---- ignition + win
  await ev(`(()=>{const F=window.__FORMOL; for(let i=F.P.installed;i<5;i++){ F.P.carry.push(F.interact.find(x=>x.type==='fuse'&&x.n===i+1)); F.installOne(); } F.AI.pos.set(10,0,62); F.AI.setState('patrol'); F.AI.grace=0; F.P.pos.set(37,0,33.4);})()`);
  await face(37,32); await ev(`window.__FORMOL.sim(0.1)`);
  console.log('lever prompt:', await ev(`document.getElementById('prompt').textContent`));
  await p.keyboard.press('KeyE');
  r = await ev(`(()=>{const F=window.__FORMOL; F.AI.pos.set(10,0,62); F.sim(10); return {ign:F.AI.ignition, state:F.AI.state, d:F.AI.pos.distanceTo(F.P.pos).toFixed(1), dead:F.P.dead}})()`); console.log('ignition 10s', JSON.stringify(r));
  await ev(`(()=>{const F=window.__FORMOL; F.AI.pos.set(10,0,62); F.AI.ignT=24.9; F.P.dead=false; F.sim(3.5); F.AI.pos.set(10,0,62);})()`);
  await ev(`(()=>{const F=window.__FORMOL; F.P.pos.set(44,0,48); F.P.yaw=Math.PI; F.sim(0.2)})()`);
  await p.waitForTimeout(800); await p.screenshot({path:'shots/door.png'});
  r = await ev(`(()=>{const F=window.__FORMOL; F.P.pos.set(44,0,58); F.AI.pos.set(10,0,62); F.sim(0.3); return {won:F.P.won, dead:F.P.dead, sub:document.getElementById('win_sub').textContent}})()`); console.log('win', JSON.stringify(r));
  console.log('ERRORS:', errs.join('\n'));
  await b.close();
})();
