const express = require('express');
const { chromium } = require('playwright');

const app = express();

const PORT = 8006;
const API_KEY = 'test';
const USER_DATA_DIR = './user-data';
const DEFAULT_RPA_HEADLESS = true;
const RPA_HEADLESS = getHeadlessFromArgs(DEFAULT_RPA_HEADLESS);

let persistentContext = null;
let contextStarting = null;
let loginContext = null;

app.use(express.json({ limit: '1mb' }));

function getHeadlessFromArgs(defaultValue) {
    if (process.argv.includes('--headed')) {
        return false;
    }

    if (process.argv.includes('--headless')) {
        return true;
    }

    return defaultValue;
}

// アクセスログ
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// GAS sidebar から localhost を叩くためのCORS設定
app.use((req, res, next) => {
    const origin = req.headers.origin || '*';

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, x-api-key, Access-Control-Request-Private-Network'
    );
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    next();
});

// 簡易APIキー
app.use((req, res, next) => {
    if (req.method === 'GET' && req.path === '/health') {
        return next();
    }

    const apiKey = req.header('x-api-key');

    if (apiKey !== API_KEY) {
        return res.status(401).json({
            ok: false,
            error: 'Unauthorized'
        });
    }

    next();
});

async function getPersistentContext() {
    if (persistentContext) {
        return persistentContext;
    }

    if (contextStarting) {
        return contextStarting;
    }

    contextStarting = chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: RPA_HEADLESS,
        viewport: { width: 1280, height: 900 }
    });

    persistentContext = await contextStarting;

    persistentContext.on('close', () => {
        console.log('persistent context closed');
        persistentContext = null;
        contextStarting = null;
    });

    contextStarting = null;

    return persistentContext;
}

async function closePersistentContext() {
    if (persistentContext) {
        await persistentContext.close();
        persistentContext = null;
    }

    contextStarting = null;
}

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        message: `localhost ${PORT} reached`,
        contextAlive: !!persistentContext,
        pages: persistentContext ? persistentContext.pages().length : 0,
        origin: req.headers.origin || null,
        time: new Date().toISOString()
    });
});

app.post('/echo', (req, res) => {
    res.json({
        ok: true,
        body: req.body,
        origin: req.headers.origin || null
    });
});

// 初回ログイン用
app.post('/login', async (req, res) => {
    const { url = 'https://accounts.google.com/' } = req.body || {};

    try {
        // 通常RPA用Contextが残っていると同じuser-dataを掴むので閉じる
        await closePersistentContext();

        if (loginContext) {
            return res.json({
                ok: true,
                message: 'login browser is already open'
            });
        }

        loginContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false,
            viewport: { width: 1280, height: 900 }
        });

        loginContext.on('close', () => {
            console.log('login context closed');
            loginContext = null;
        });

        const page = loginContext.pages()[0] || await loginContext.newPage();

        await page.goto(url, {
            waitUntil: 'domcontentloaded'
        });

        res.json({
            ok: true,
            message: 'login browser opened. Please login manually, then close the browser window.',
            url: page.url()
        });
    } catch (e) {
        console.error(e);
        loginContext = null;

        res.status(500).json({
            ok: false,
            error: e.message
        });
    }
});

// ログイン用ブラウザを閉じたいとき用
app.post('/close-login', async (req, res) => {
    if (!loginContext) {
        return res.json({
            ok: true,
            message: 'login browser is not open'
        });
    }

    await loginContext.close();
    loginContext = null;

    res.json({
        ok: true,
        message: 'login browser closed'
    });
});

// 常駐ブラウザを明示的に閉じる
app.post('/open-context', async (req, res) => {
    try {
        if (loginContext) {
            throw new Error('Login browser is open. Please close login browser first.');
        }

        const context = await getPersistentContext();

        res.json({
            ok: true,
            message: 'persistent context opened',
            pages: context.pages().length
        });
    } catch (e) {
        console.error(e);

        res.status(500).json({
            ok: false,
            error: e.message
        });
    }
});

app.post('/close-context', async (req, res) => {
    await closePersistentContext();

    res.json({
        ok: true,
        message: 'persistent context closed'
    });
});

async function fillField(page, field) {
    if (field.type === 'checkbox') {
        const checkbox = page
            .getByRole('checkbox')
            .nth(Number(field.index));

        await checkbox.scrollIntoViewIfNeeded();

        const checked = await checkbox.getAttribute('aria-checked');

        if (checked !== 'true') {
            await checkbox.click();
            await page.waitForTimeout(300);
        }

        return;
    }

    if (field.type === 'textbox') {
        const textbox = page
            .getByRole('textbox')
            .nth(Number(field.index));

        await textbox.scrollIntoViewIfNeeded();
        await textbox.fill(String(field.value ?? ''));
        return;
    }

    if (field.type === 'textarea') {
        const textarea = page
            .locator('textarea')
            .nth(Number(field.index));

        await textarea.scrollIntoViewIfNeeded();
        await textarea.fill(String(field.value ?? ''));
        return;
    }

    if (field.type === 'clickText') {
        await page
            .getByText(String(field.text), { exact: true })
            .click();

        return;
    }

    throw new Error(`Unsupported field type: ${field.type}`);
}

async function clickSubmitButton(page) {
    const candidates = [
        page.locator('div[role="button"]').filter({ hasText: /^送信$/ }).first(),
        page.locator('div[role="button"]').filter({ hasText: '送信' }).first(),
        page.getByText('送信', { exact: true }),
        page.locator('button').filter({ hasText: '送信' }).first()
    ];

    let lastError = null;

    for (const candidate of candidates) {
        try {
            const count = await candidate.count();

            if (count === 0) {
                continue;
            }

            await candidate.scrollIntoViewIfNeeded();

            await candidate.click({
                timeout: 5000
            });

            return;
        } catch (e) {
            lastError = e;
        }
    }

    throw new Error(
        `Submit button not found or not clickable: ${lastError ? lastError.message : 'unknown'}`
    );
}

async function detectSubmitResult(page) {
    await page.waitForTimeout(1500);

    const bodyText = await page.locator('body').innerText();

    const successTexts = [
        '回答を記録しました',
        '回答を送信しました',
        'ありがとうございました',
        'フォームの回答を記録しました'
    ];

    const errorTexts = [
        '必須の質問です',
        '有効なメールアドレスを入力してください',
        '有効な URL を入力してください',
        'この質問は必須です'
    ];

    const hasSuccess = successTexts.some(text => bodyText.includes(text));
    const hasError = errorTexts.some(text => bodyText.includes(text));

    return {
        hasSuccess,
        hasError
    };
}

async function submitOnePayload(context, payload) {
    let page = null;

    try {
        if (!payload.formUrl) {
            throw new Error('formUrl is required');
        }

        page = await context.newPage();

        await page.goto(payload.formUrl, {
            waitUntil: 'networkidle'
        });

        const currentUrl = page.url();

        if (currentUrl.includes('accounts.google.com')) {
            throw new Error('Google login required. Please run login first.');
        }

        for (const field of payload.fields || []) {
            await fillField(page, field);
        }

        console.log(`row ${payload.rowNumber}: clicking submit button...`);

        await clickSubmitButton(page);

        const submitResult = await detectSubmitResult(page);

        if (submitResult.hasError) {
            throw new Error('Submit clicked, but validation error was detected.');
        }

        const title = await page.title();

        return {
            ok: true,
            message: 'form submitted',
            title,
            url: page.url(),
            rowNumber: payload.rowNumber,
            submitResult
        };
    } catch (e) {
        console.error(e);

        return {
            ok: false,
            error: e.message,
            rowNumber: payload.rowNumber
        };
    } finally {
        if (page) {
            try {
                await page.close();
            } catch (closeError) {
                console.error('failed to close page:', closeError);
            }
        }
    }
}

// 単体送信用。必要なら使えるように残す。
// 送信後はブラウザごと閉じる。
app.post('/fill-form', async (req, res) => {
    const payload = req.body;
    const keepContextAlive = !!(payload && payload.keepContextAlive);

    console.log('fill-form payload:', JSON.stringify(payload, null, 2));

    let context = null;

    try {
        if (loginContext) {
            throw new Error('Login browser is open. Please close login browser first.');
        }

        context = await getPersistentContext();

        const result = await submitOnePayload(context, payload);

        if (!result.ok) {
            return res.status(500).json(result);
        }

        res.json(result);
    } catch (e) {
        console.error(e);

        res.status(500).json({
            ok: false,
            error: e.message,
            rowNumber: payload && payload.rowNumber
        });
    } finally {
        if (!keepContextAlive) {
            await closePersistentContext();
        }
    }
});

// 複数行送信用。
// ここでブラウザ開始〜全件送信〜ブラウザ終了まで完結させる。
app.post('/fill-forms', async (req, res) => {
    const { payloads } = req.body;

    console.log('fill-forms payload count:', payloads && payloads.length);

    let context = null;

    try {
        if (!Array.isArray(payloads) || payloads.length === 0) {
            throw new Error('payloads must be a non-empty array');
        }

        if (loginContext) {
            throw new Error('Login browser is open. Please close login browser first.');
        }

        context = await getPersistentContext();

        const results = [];

        for (const payload of payloads) {
            const result = await submitOnePayload(context, payload);
            results.push(result);
        }

        const successCount = results.filter(result => result.ok).length;
        const errorCount = results.length - successCount;

        res.json({
            ok: errorCount === 0,
            message: `batch completed: success=${successCount}, error=${errorCount}`,
            successCount,
            errorCount,
            results
        });
    } catch (e) {
        console.error(e);

        res.status(500).json({
            ok: false,
            error: e.message
        });
    } finally {
        // ここで確実にブラウザごと閉じる
        await closePersistentContext();
    }
});

process.on('SIGINT', async () => {
    console.log('SIGINT received. closing browser contexts...');

    try {
        if (loginContext) {
            await loginContext.close();
        }

        await closePersistentContext();
    } finally {
        process.exit(0);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Local RPA server running on http://localhost:${PORT}`);
});
