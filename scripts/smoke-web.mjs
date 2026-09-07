import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const server = createServer(async (req,res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/blink-coach\/?/,'').replace(/^\//,'');
    let file = path.resolve(root,relative || 'index.html');
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    if (!path.extname(file)) file += '.html';
    const mime = {'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.css':'text/css'};
    res.setHeader('Content-Type',mime[path.extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({executablePath:process.argv[2],headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[]; page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  page.on('response', response => { if(response.status()>=400) console.error(response.status(),response.url()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/blink-coach/`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'Start Monitoring',exact:true}).click();
  await page.getByText('Monitoring',{exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Stop Monitoring',exact:true}).click();
  await page.getByText('Ready to begin',{exact:true}).waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow || errors.length) throw new Error(JSON.stringify({overflow,errors}));
  await page.goto(`http://127.0.0.1:${server.address().port}/blink-coach/lab`);
  await page.getByText('Left EAR', {exact:true}).waitFor();
  for (const label of ['Left EAR', 'Right EAR', 'Inference FPS']) {
    const box = await page.getByText(label, {exact:true}).boundingBox();
    if (!box || box.width < 60) throw new Error(`Crushed diagnostic label: ${label}`);
  }
  const labOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(labOverflow || errors.length) throw new Error(JSON.stringify({labOverflow,errors}));
  if (process.argv[3]) {
    await page.getByText('Inference FPS', {exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:process.argv[3]});
  }
  console.log('PASS: mobile camera start/stop, diagnostic labels readable, no page errors or horizontal overflow.');
} finally {await browser.close();server.close();}
