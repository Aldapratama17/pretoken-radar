const puppeteer = require('/root/makefun/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const OUT = '/root/makefun/radar-entry/screenshots';
fs.mkdirSync(OUT, {recursive: true});

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/root/.cache/puppeteer/chrome/linux-157.0.8103.78/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => {
    errors.push(String(e).slice(0, 200));
    console.log('PAGE ERROR:', e.message);
  });
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

  // Track all requests
  page.on('request', req => {
    console.log('REQUEST:', req.url());
  });
  page.on('response', res => {
    console.log('RESPONSE:', res.status(), res.url());
  });

  // Serve from out/ directory, handle all paths correctly
  const serveDir = '/root/makefun/radar-entry/out';
  const server = require('http').createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    let filePath;
    if (urlPath === '/') {
      filePath = path.join(serveDir, 'dashboard/index.html');
    } else if (urlPath.startsWith('/dashboard/')) {
      filePath = path.join(serveDir, urlPath);
    } else if (urlPath === '/data.js') {
      filePath = path.join(serveDir, 'data.js');
    } else if (urlPath === '/app.css' || urlPath === '/app.js') {
      filePath = path.join(serveDir, 'dashboard', urlPath.slice(1));
    } else {
      filePath = path.join(serveDir, urlPath);
    }
    fs.readFile(filePath, (err, data) => {
      if (err) { 
        console.log('404:', req.url, '->', filePath);
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath);
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
  });
  server.listen(8822, '127.0.0.1', async () => {
    console.log('Server listening on http://127.0.0.1:8822');

    // 1. Board view
    await page.goto('http://127.0.0.1:8822/', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    
    // Check if DATA is loaded
    const dataLoaded = await page.evaluate(() => typeof window.DATA !== 'undefined');
    console.log('DATA loaded:', dataLoaded);
    
    // Check page content - look at specific elements
    const tableRows = await page.evaluate(() => document.querySelectorAll('#board-table tbody tr').length);
    console.log('Table rows:', tableRows);
    
    // Force rendering by evaluating something visible
    await page.evaluate(() => {
      const table = document.querySelector('#board-table');
      if (table) console.log('Table found, rows:', table.querySelectorAll('tbody tr').length);
    });
    
    // Check if there's actual visible content
    const visibleCheck = await page.evaluate(() => {
      const table = document.querySelector('#board-table');
      if (!table) return 'no table';
      const firstRow = table.querySelector('tbody tr');
      if (!firstRow) return 'no rows';
      return 'first row text: ' + firstRow.innerText.slice(0, 100);
    });
    console.log('VISIBLE CHECK:', visibleCheck);
    
    // Take screenshot with fullPage to see what's captured
    await page.screenshot({ path: OUT + '/1-board.png', type: 'png', fullPage: false });
    console.log('1-board.png captured');

    // 2. Detail view - click first row
    await page.evaluate(() => {
      const firstLink = document.querySelector('#board-table tbody tr a');
      if (firstLink) firstLink.click();
    });
    await new Promise(r => setTimeout(r, 800));
    // Scroll modal to show Farm Plan
    await page.evaluate(() => {
      const panel = document.querySelector('.detail-panel');
      if (panel) {
        console.log('Panel scrollHeight:', panel.scrollHeight, 'clientHeight:', panel.clientHeight);
        panel.scrollTop = panel.scrollHeight;
      }
    });
    await new Promise(r => setTimeout(r, 300));
    
    // Verify Farm Plan is visible
    const farmPlanCheck = await page.evaluate(() => {
      const farmPlan = document.querySelector('.farm-plan');
      if (!farmPlan) return 'no farm-plan';
      const items = farmPlan.querySelectorAll('li');
      if (items.length === 0) return 'no farm steps';
      // Check last item visibility
      const lastItem = items[items.length - 1];
      const rect = lastItem.getBoundingClientRect();
      const panel = document.querySelector('.detail-panel');
      const panelRect = panel.getBoundingClientRect();
      return {
        steps: items.length,
        lastItemText: lastItem.innerText.slice(0, 80),
        lastItemVisible: rect.top >= panelRect.top && rect.bottom <= panelRect.bottom,
        rect: rect,
        panelRect: panelRect
      };
    });
    console.log('FARM PLAN CHECK:', JSON.stringify(farmPlanCheck));
    
    await page.screenshot({ path: OUT + '/2-detail.png', type: 'png', fullPage: false });
    console.log('2-detail.png captured');

    // 3. Filtered view - search for "bridge"
    await page.evaluate(() => {
      const input = document.querySelector('input[type=search]');
      if (input) { input.value = 'bridge'; input.dispatchEvent(new Event('input')); }
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: OUT + '/3-filtered.png', type: 'png', fullPage: false });
    console.log('3-filtered.png captured');

    console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none');
    server.close();
    await browser.close();
  });
})();
