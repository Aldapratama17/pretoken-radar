const puppeteer = require('/root/makefun/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const OUT = '/root/makefun/radar-entry/out/screenshots';
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
    errors.push(String(e).slice(0, 500));
    console.log('PAGE ERROR:', e.message);
    console.log('PAGE ERROR STACK:', e.stack);
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
    
    // Check if there's actual visible content
    const visibleCheck = await page.evaluate(() => {
      const table = document.querySelector('#board-table');
      if (!table) return 'no table';
      const firstRow = table.querySelector('tbody tr');
      if (!firstRow) return 'no rows';
      return 'first row text: ' + firstRow.innerText.slice(0, 100);
    });
    console.log('VISIBLE CHECK:', visibleCheck);
    
    // Check if the main element has content
    const mainContent = await page.evaluate(() => {
      const main = document.querySelector('main#board');
      if (!main) return 'no main';
      return main.innerHTML.slice(0, 500);
    });
    console.log('MAIN CONTENT:', mainContent);
    
    // Take screenshot
    await page.screenshot({ path: OUT + '/1-board.png', type: 'png', fullPage: false });
    console.log('1-board.png captured');

    // 2. Detail view - click first row's Details button
    await page.evaluate(() => {
      const firstBtn = document.querySelector('#board-table tbody tr .btn-detail');
      if (firstBtn) firstBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    
    // Verify Farm Plan is visible in modal
    const farmPlanCheck = await page.evaluate(() => {
      const modal = document.querySelector('#detail-modal');
      if (!modal || !modal.classList.contains('open')) return 'modal not open';
      const farmPlan = modal.querySelector('.farm-plan');
      if (!farmPlan) return 'no farm-plan';
      const items = farmPlan.querySelectorAll('li');
      if (items.length === 0) return 'no farm steps';
      const lastItem = items[items.length - 1];
      return {
        steps: items.length,
        lastItemText: lastItem.innerText.slice(0, 80),
        modalOpen: true
      };
    });
    console.log('FARM PLAN CHECK:', JSON.stringify(farmPlanCheck));
    
    await page.screenshot({ path: OUT + '/2-detail.png', type: 'png', fullPage: false });
    console.log('2-detail.png captured');

    // 3. Filtered view - click watchlist filter
    await page.evaluate(() => {
      const modalClose = document.querySelector('.modal-close');
      if (modalClose) modalClose.click();
    });
    await new Promise(r => setTimeout(r, 300));
    
    // Click watchlist filter checkbox
    await page.evaluate(() => {
      const wlCheckbox = document.querySelector('.chip-toggle input[type=checkbox]');
      if (wlCheckbox) { wlCheckbox.checked = true; wlCheckbox.dispatchEvent(new Event('change')); }
    });
    await new Promise(r => setTimeout(r, 800));
    
    // Verify filter applied
    const filteredCheck = await page.evaluate(() => {
      const table = document.querySelector('#board-table');
      if (!table) return 'no table';
      const rows = table.querySelectorAll('tbody tr');
      const watchlistRows = Array.from(rows).filter(r => r.querySelector('.badge.watchlist'));
      return {
        totalRows: rows.length,
        watchlistRows: watchlistRows.length,
        firstWL: watchlistRows[0] ? watchlistRows[0].innerText.slice(0, 80) : 'none'
      };
    });
    console.log('FILTERED CHECK:', JSON.stringify(filteredCheck));
    
    await page.screenshot({ path: OUT + '/3-filtered.png', type: 'png', fullPage: false });
    console.log('3-filtered.png captured');

    console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none');
    server.close();
    await browser.close();
  });
})();
