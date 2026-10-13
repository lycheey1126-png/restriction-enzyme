const { chromium } = require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const os=require('node:os');
const entry=path.resolve(__dirname,'../index.html');
const screenshots=path.join(os.tmpdir(),'restriction-enzyme-checks');
fs.mkdirSync(screenshots,{recursive:true});
const html=fs.readFileSync(entry,'utf8');
const script=html.split('<script>')[1].split('</script>')[0];
const model=script.split('const COLORS=')[0];
const context=vm.createContext({}); vm.runInContext(model,context);
vm.runInContext(`for(const e of Object.values(ENZYMES)){if([...e.top].map(complement).join('')!==e.bottom)throw Error('noncomplementary');if(e.top.slice(1,5)!==e.overhang)throw Error('overhang');}if(!compatible('HindIII','HindIII')||compatible('HindIII','EcoRI')||compatible('EcoRI','HindIII')||!compatible('EcoRI','EcoRI'))throw Error('compatibility');for(const side of [0,1]){if(junctionData('HindIII','EcoRI',side).matches.filter(Boolean).length!==4)throw Error('mismatches');}`,context);
(async()=>{
const localServer=require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
await new Promise(resolve=>localServer.listen(0,'127.0.0.1',resolve));
const url=process.env.TEST_URL||`http://127.0.0.1:${localServer.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
let count=0;
for(const width of [375,768,1280]){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 assert(await page.locator('#next').isDisabled());await page.locator('[data-prediction="yes"]').click();await page.locator('#next').click();assert.equal(await page.locator('#step-label').textContent(),'步驟 2 / 4');await page.locator('#next').click();await page.locator('#pair').click();assert.equal(await page.locator('#stage .junctions svg').count(),2);assert.equal(await page.locator('#stage .junctions svg text').filter({hasText:/^切口$/}).count(),4);await page.locator('#next').click();await page.locator('#ligase').click();assert.match(await page.locator('#stage').textContent(),/目標 DNA 片段已插入質粒/);assert.equal(await page.locator('#stage .junctions svg text').filter({hasText:/^共價鍵$/}).count(),4);
 await page.locator('#back').click();assert.equal(await page.locator('#stage .junctions svg text').filter({hasText:/^切口$/}).count(),4);await page.locator('#reset').click();await page.locator('#scenario-b').click();await page.locator('[data-prediction="no"]').click();await page.locator('#next').click();await page.locator('#next').click();await page.locator('#pair').click();assert.match(await page.locator('#pair-feedback').textContent(),/不能完整互補配對/);assert.equal(await page.locator('#stage .junctions svg text').filter({hasText:/^×$/}).count(),4);await page.locator('#next').click();await page.locator('#ligase').click();assert.match(await page.locator('#stage').textContent(),/不能把這組不互補的黏端變成互補/);assert.equal(await page.locator('#stage .junctions svg text').filter({hasText:/^共價鍵$/}).count(),0);
 for(const [q,correct] of [[0,0],[1,1],[2,2]]){await page.locator(`[data-quiz="${q}"][data-answer="${(correct+1)%3}"]`).click();assert.match(await page.locator(`#quiz-feedback-${q}`).textContent(),/再試一次/);await page.locator(`[data-quiz="${q}"][data-answer="${correct}"]`).click();assert.match(await page.locator(`#quiz-feedback-${q}`).textContent(),/正確/);}
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#reset').click();await page.locator('[data-prediction="yes"]').click();await page.locator('#next').click();await page.locator('#next').click();await page.locator('#drag-fragment').focus();await page.keyboard.press('Enter');assert.match(await page.locator('#status').textContent(),/兩端互補/);
 await page.screenshot({path:path.join(screenshots,`screen-${width}.png`),fullPage:true});assert.deepEqual(errors,[]);count++;await page.close();
}
const page=await browser.newPage({viewport:{width:1280,height:1000}});await page.goto(url);await page.locator('#reduce').uncheck();await page.locator('[data-prediction="yes"]').click();await page.locator('#next').click();await page.locator('#next').click();await page.locator('#pair').click();await page.locator('#pause').click();const paused=await page.evaluate(()=>state.revealed);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>state.revealed),paused);await page.locator('#pause').click();await page.waitForTimeout(2100);assert.equal(await page.evaluate(()=>state.revealed),4);await page.locator('#replay').click();assert.equal(await page.evaluate(()=>state.attempt),false);
const svg=await page.locator('#global-svg').boundingBox();const fragment=await page.locator('#drag-fragment').boundingBox();await page.mouse.move(fragment.x+fragment.width/2,fragment.y+fragment.height/2);await page.mouse.down();await page.mouse.move(svg.x+svg.width*.75,svg.y+svg.height*.5,{steps:12});await page.mouse.up();assert(await page.evaluate(()=>state.attempt));await page.locator('#reset').click();await page.waitForTimeout(600);assert.deepEqual(await page.evaluate(()=>[state.step,state.prediction,state.attempt,state.ligated,state.revealed]),[0,null,false,false,0]);await browser.close();localServer.close();console.log(`PASS: scientific model; ${count} screen sizes; compatible/incompatible junctions; ligation; quizzes; keyboard; drag; pause/resume; reset.`);
})().catch(e=>{console.error(e);process.exit(1)});
