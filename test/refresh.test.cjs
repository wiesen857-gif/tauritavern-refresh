const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

let browser, server, origin;
const root = path.resolve(__dirname, '..');

before(async () => {
    const script = await readFile(path.join(root, 'index.js'), 'utf8');
    const css = await readFile(path.join(root, 'style.css'), 'utf8');
    const files = {
        '/index.js': ['text/javascript', script],
        '/style.css': ['text/css', css],
        '/script.js': ['text/javascript', `
            export function isGenerating() { return window.host.generating; }
            export let isChatSaving = false;
            export function setSaving(value) { isChatSaving = value; }
        `],
        '/tauri/main/services/lifecycle/lifecycle-flush-service.js': ['text/javascript', `
            export async function flushLifecycleState(reason) {
                window.host.calls++;
                sessionStorage.setItem('flushReason', reason);
                if (window.host.defer) await new Promise(resolve => window.host.release = resolve);
                if (window.host.fail) throw new Error('测试：保存失败');
            }
        `],
        '/': ['text/html', `<!doctype html><meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
            <style>
              :root { --mainFontSize:16px; --topBarIconSize:32px; --topBarBlockPadding:calc(16px / 3); --topBarBlockSize:calc(var(--topBarIconSize) + var(--topBarBlockPadding)); }
              body { margin: 0; color: #292723; background: #f3efe5; }
              #top-settings-holder { display:flex; height:var(--topBarBlockSize); width:100%; justify-content:center; position:relative; }
              .drawer { display:flex; align-items:center; justify-content:center; width:100%; }
              .drawer-icon { display:inline-block; font-size:var(--topBarIconSize); padding:1px 3px; }
              .fa-fw { display:inline-block; width:1.25em; text-align:center; }
              .drawer-icon.closedIcon { opacity:0.3; }
              .drawer-icon.closedIcon:hover { opacity:1; }
              #chat { margin-top:var(--topBarBlockSize); }
            </style>
            <link rel="stylesheet" href="/style.css">
            <div id="top-settings-holder">${'<div class="drawer"><div class="drawer-toggle"><span class="drawer-icon fa-fw closedIcon">●</span></div></div>'.repeat(9)}</div>
            <div id="chat"></div><textarea id="send_textarea"></textarea>
            <script>
              sessionStorage.setItem('loads', Number(sessionStorage.getItem('loads') || 0) + 1);
              window.host = { calls:0, generating:false, fail:false, defer:false };
              window.errors = [];
              window.toastr = { error: message => window.errors.push(message) };
            </script>
            <script type="module" src="/index.js"></script>`],
    };
    server = http.createServer((request, response) => {
        const file = files[new URL(request.url, 'http://localhost').pathname];
        response.writeHead(file ? 200 : 404, { 'Content-Type': file?.[0] || 'text/plain' });
        response.end(file?.[1] || 'Not found');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
});

after(async () => {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
});

async function pageFor(t, options = {}) {
    const page = await browser.newPage(options);
    t.after(() => page.close());
    await page.goto(origin);
    await page.locator('#tt-refresh button').waitFor();
    return page;
}

async function reloadWith(page, action) {
    await Promise.all([page.waitForEvent('framenavigated', frame => frame === page.mainFrame()), action()]);
    await page.locator('#tt-refresh button').waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('loads')), '2');
    assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation')[0].type), 'reload');
}

test('click saves first, reloads the page, and mounts exactly one button again', async t => {
    const page = await pageFor(t);
    await page.evaluate(() => import('/index.js?duplicate'));
    assert.equal(await page.locator('#tt-refresh').count(), 1);
    await reloadWith(page, () => page.getByRole('button', { name: '刷新酒馆' }).click());
    assert.equal(await page.evaluate(() => sessionStorage.getItem('flushReason')), 'extension:refresh');
    assert.equal(await page.locator('#tt-refresh').count(), 1);
});

test('pending save disables repeated clicks and delays navigation', async t => {
    const page = await pageFor(t);
    await page.evaluate(() => { host.defer = true; });
    await page.locator('#tt-refresh button').click();
    await page.waitForFunction(() => typeof host.release === 'function');
    await page.evaluate(() => document.querySelector('#tt-refresh button').click());
    assert.equal(await page.locator('#tt-refresh button').isDisabled(), true);
    assert.equal(await page.evaluate(() => host.calls), 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('loads')), '1');
    await reloadWith(page, () => page.evaluate(() => host.release()));
});

test('save failure preserves the page, reports the failure, and allows retry', async t => {
    const page = await pageFor(t);
    await page.evaluate(() => { host.fail = true; });
    await page.locator('#tt-refresh button').click();
    await page.waitForFunction(() => errors.length === 1);
    assert.match(await page.evaluate(() => errors[0]), /保存失败/);
    assert.equal(await page.locator('#tt-refresh button').isEnabled(), true);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('loads')), '1');
    await page.evaluate(() => { host.fail = false; });
    await reloadWith(page, () => page.locator('#tt-refresh button').click());
});

test('generation, chat saving, message editing, and unsent input each block refresh', async t => {
    const page = await pageFor(t);
    for (const state of ['generating', 'saving', 'editing', 'draft']) {
        await page.evaluate(async state => {
            host.generating = state === 'generating';
            (await import('/script.js')).setSaving(state === 'saving');
            document.querySelector('#chat').innerHTML = state === 'editing' ? '<textarea class="edit_textarea">editing</textarea>' : '';
            document.querySelector('#send_textarea').value = state === 'draft' ? '未发送的文字' : '';
            errors.length = 0;
        }, state);
        await page.locator('#tt-refresh button').click();
        await page.waitForFunction(() => errors.length === 1);
        assert.equal(await page.evaluate(() => host.calls), 0, state);
        assert.equal(await page.evaluate(() => sessionStorage.getItem('loads')), '1', state);
    }
    assert.equal(await page.locator('#send_textarea').inputValue(), '未发送的文字');
});

test('starting generation during a save cancels the pending refresh', async t => {
    const page = await pageFor(t);
    await page.evaluate(() => { host.defer = true; });
    await page.locator('#tt-refresh button').click();
    await page.waitForFunction(() => typeof host.release === 'function');
    await page.evaluate(() => { host.generating = true; host.release(); });
    await page.waitForFunction(() => errors.length === 1);
    assert.match(await page.evaluate(() => errors[0]), /停止生成/);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('loads')), '1');
});

test('missing host save module shows an error instead of unsafe reload', async t => {
    const page = await pageFor(t);
    await page.route('**/lifecycle-flush-service.js', route => route.fulfill({ status: 404, body: 'missing' }));
    await page.locator('#tt-refresh button').click();
    await page.waitForFunction(() => errors.length === 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('loads')), '1');
    assert.equal(await page.locator('#tt-refresh button').isEnabled(), true);
});

test('toolbar fits desktop and narrow screens and offers visible keyboard focus', async t => {
    const page = await pageFor(t);
    for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        const box = await page.locator('#tt-refresh button').boundingBox();
        assert.ok(box.width > 0 && box.x + box.width <= width + 1, String(width));
        if (width <= 600) assert.ok(box.height >= 44);
    }
    await page.locator('#tt-refresh button').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#tt-refresh button').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await reloadWith(page, () => page.keyboard.press('Enter'));
});

test('Space key activates the native button', async t => {
    const page = await pageFor(t);
    await page.locator('#tt-refresh button').focus();
    await reloadWith(page, () => page.keyboard.press('Space'));
});

test('mobile touch target stays 44px, visible and separate from native menus in both orientations', async t => {
    const page = await pageFor(t, { isMobile:true, hasTouch:true, viewport:{ width:390, height:844 } });
    for (const [width, height] of [[320, 700], [360, 800], [390, 844], [430, 932], [844, 390]]) {
        await page.setViewportSize({ width, height });
        const metrics = await page.evaluate(() => {
            const button = document.querySelector('#tt-refresh button');
            const b = button.getBoundingClientRect();
            const icons = [...document.querySelectorAll('.drawer-toggle .drawer-icon')].map(el => {
                const r = el.getBoundingClientRect();
                return { x:r.x, right:r.right, width:r.width };
            });
            return { x:b.x, right:b.right, width:b.width, height:b.height, opacity:Number(getComputedStyle(button).opacity),
                scroll:document.documentElement.scrollWidth, viewport:innerWidth, icons,
                topSize:parseFloat(getComputedStyle(document.querySelector('#top-settings-holder')).height) };
        });
        assert.ok(metrics.width >= 44 && metrics.height >= 44, `touch target ${width}: ${JSON.stringify(metrics)}`);
        assert.ok(metrics.opacity >= 0.8, `icon must be visible without hover: ${width}`);
        assert.ok(metrics.x >= 0 && metrics.right <= width + 1 && metrics.scroll <= width, `viewport overflow ${width}`);
        assert.ok(metrics.topSize >= metrics.height, `button overflows the bar: ${width}`);
        metrics.icons.forEach((icon, i) => {
            assert.ok(icon.x >= 0 && icon.width > 0 && icon.right <= metrics.x, `native menu overlaps refresh: ${width}/${i}`);
            if (i) assert.ok(metrics.icons[i - 1].right <= icon.x + 1, `native menus overlap: ${width}/${i}`);
        });
    }
    await reloadWith(page, () => page.locator('#tt-refresh button').tap());
});

test('mobile tap reports save failure and remains usable', async t => {
    const page = await pageFor(t, { isMobile:true, hasTouch:true, viewport:{ width:360, height:800 } });
    await page.evaluate(() => { host.fail = true; });
    await page.locator('#tt-refresh button').tap();
    await page.waitForFunction(() => errors.length === 1);
    assert.match(await page.evaluate(() => errors[0]), /保存失败/);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('loads')), '1');
    assert.equal(await page.locator('#tt-refresh button').isEnabled(), true);
});
