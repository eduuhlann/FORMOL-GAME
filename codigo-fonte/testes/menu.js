const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
  const errs=[]; p.on('pageerror', e => errs.push('PAGEERR '+e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file:///home/claude/formol/formol.html'); await p.waitForTimeout(2500);
  await p.screenshot({path:'shots/m_splash.png'});
  await p.keyboard.press('KeyA'); await p.waitForTimeout(1800);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(400);
  await p.screenshot({path:'shots/m_menu.png'});
  await p.keyboard.press('Enter'); await p.waitForTimeout(800); await p.screenshot({path:'shots/m_opts.png'});
  await p.keyboard.press('Escape'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(200);
  const sel = await p.evaluate(()=>document.querySelector('#mainItems li.sel').dataset.act); console.log('selected:', sel);
  await p.keyboard.press('Enter');
  const t0 = Date.now();
  for (const [ms, name] of [[3500,'i_card'],[14000,'i_recep'],[26000,'i_corr'],[40000,'i_necro'],[60000,'i_door'],[80000,'i_creature']]) { await p.waitForTimeout(Math.max(0, ms-(Date.now()-t0))); await p.screenshot({path:`shots/${name}.png`}); console.log(name, await p.evaluate(()=>document.getElementById('subs').textContent)); }
  // hold space to skip
  await p.keyboard.down('Space'); await p.waitForTimeout(4500); await p.keyboard.up('Space');
  await p.waitForTimeout(3000);
  const st = await p.evaluate(()=>({mode: document.body.className, cine: document.getElementById('cine').style.display, ai: window.__FORMOL.AI.state, play: window.__FORMOL.P.pos.toArray()}));
  console.log(JSON.stringify(st));
  await p.screenshot({path:'shots/i_game.png'});
  console.log(errs.join('\n')); await b.close();
})();
