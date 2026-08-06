import { chromium } from '@playwright/test';
const OUT='/private/tmp/claude-501/-Users-eduardocoimbra-Desktop-Code-RCV-rvcpoker/d49d6994-9840-4f6a-98ef-0e4bdbdf3736/scratchpad';
const browser = await chromium.launch();
for (const [w,h,tag] of [[393,800,'A'],[360,640,'B']]) {
  const page = await browser.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:3 });
  page.on('pageerror', e => console.log('ERR', tag, e.message));
  await page.addInitScript(() => window.localStorage.setItem('bacbo-arena:state', JSON.stringify({version:3,state:{balance:5000,history:[],settings:{audio:{muted:true,musicVolume:0.4,sfxVolume:0.8},vibrationEnabled:false,tutorialSeen:true,scenery:'high'}}})));
  await page.goto('http://localhost:5173/');
  await page.getByTestId('play-button').click();
  await page.getByTestId('confirm-match').click({timeout:25000});
  await page.waitForSelector('[data-testid="action-fold"]', { timeout: 45000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/400-mesa-${tag}.png` });
  console.log(tag, await page.evaluate(() => {
    const c = (s) => { const e=document.querySelector(s); if(!e) return null;
      const r=e.getBoundingClientRect(); return Math.round(r.left+r.width/2); };
    const arena = document.querySelector('[data-testid="poker-arena"]').getBoundingClientRect();
    const cartas = document.querySelector('.poker-seat--player .poker-seat__cards').getBoundingClientRect();
    return {
      saldoNaMesa: !!document.querySelector('[data-testid="balance"]'),
      brasaoNoPote: document.querySelectorAll('[data-testid="pot"] .rvc-chip__crest').length,
      // O disco tem de cair no MEIO do vão entre a borda e as cartas.
      vaoEsq: [Math.round(arena.left), Math.round(cartas.left)],
      discoX: c('[data-testid="dealer-button-player"]') ?? c('[data-testid="dealer-button-opponent"]'),
      rackX: c('[data-testid="chip-rack-player"]'),
      vaoDir: [Math.round(cartas.right), Math.round(arena.right)],
    };
  }));
  // E o intervalo entre as mãos.
  const prazo = Date.now() + 90000;
  while (Date.now() < prazo) {
    if (await page.getByTestId('handover-clock').count() > 0) break;
    for (const t of ['action-check','action-call']) {
      const el = page.getByTestId(t);
      if (await el.count() > 0) { await el.click({timeout:1000}).catch(()=>{}); break; }
    }
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/401-intervalo-${tag}.png` });
  await page.close();
}
await browser.close();
