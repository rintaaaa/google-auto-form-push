const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = process.cwd();

const DAILY_CONFIG_PATH = path.join(ROOT_DIR, 'daily-config.json');
const USER_DATA_DIR = path.join(ROOT_DIR, 'user-data');

const PAGE_GOTO_TIMEOUT_MS = 180000;
const DEFAULT_RPA_HEADLESS = true;

function loadJson(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildUrl(baseUrl, params) {
    const url = new URL(baseUrl);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
}

function parseJsonText(text, label) {
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`${label} response is not JSON:\n${text.slice(0, 1000)}`);
    }
}

function getTargetDateFromArgsOrConfig(config) {
    const argTargetDate = process.argv.find(arg => arg.startsWith('--target-date='));

    if (argTargetDate) {
        return argTargetDate.replace('--target-date=', '').trim();
    }

    if (config.targetDate) {
        return String(config.targetDate).trim();
    }

    return '';
}

function getSheetNameFromArgsOrConfig(config) {
    const argSheetName = process.argv.find(arg => arg.startsWith('--sheet-name='));

    if (argSheetName) {
        return argSheetName.replace('--sheet-name=', '').trim();
    }

    if (config.sheetName) {
        return String(config.sheetName).trim();
    }

    return '';
}

function getDryRunFromArgsOrConfig(config) {
    if (process.argv.includes('--dry-run')) {
        return true;
    }

    return Boolean(config.dryRun);
}

function getHeadlessFromArgs(defaultValue) {
    if (process.argv.includes('--headed')) {
        return false;
    }

    if (process.argv.includes('--headless')) {
        return true;
    }

    return defaultValue;
}

function getFieldValue(payload, fieldName) {
    const field = (payload.fields || []).find(item => item.name === fieldName);

    return field ? String(field.value || '') : '';
}

async function getGasJsonByPage(context, config, action, extraParams = {}) {
    const page = await context.newPage();

    try {
        const url = buildUrl(config.webAppUrl, {
            action,
            secret: config.secret,
            ...extraParams
        });

        console.log(`Opening GAS Web App: action=${action}`);

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: PAGE_GOTO_TIMEOUT_MS
        });

        const currentUrl = page.url();

        if (
            currentUrl.includes('accounts.google.com') ||
            currentUrl.includes('ServiceLogin')
        ) {
            throw new Error(
                'Google login required for GAS Web App. Please run login first.'
            );
        }

        const bodyText = await page.locator('body').innerText({
            timeout: PAGE_GOTO_TIMEOUT_MS
        });

        const json = parseJsonText(bodyText, action);

        if (!json.ok) {
            throw new Error(json.error || `${action} failed`);
        }

        return json;
    } finally {
        await page.close();
    }
}

async function importTodayTargets(context, config, runOptions) {
    const params = {};

    if (runOptions.targetDate) {
        params.targetDate = runOptions.targetDate;
    }

    if (runOptions.sheetName) {
        params.sheetName = runOptions.sheetName;
    }

    const json = await getGasJsonByPage(
        context,
        config,
        'importTodayTargets',
        params
    );

    return {
        sheetName: json.sheetName,
        importedCount: json.importedCount || 0,
        scannedCount: json.scannedCount || 0
    };
}

async function getTargets(context, config, sheetName) {
    const json = await getGasJsonByPage(
        context,
        config,
        'getTargets',
        {
            sheetName
        }
    );

    return {
        sheetName: json.sheetName,
        payloads: json.payloads || []
    };
}

async function updateResult(context, config, result) {
    const page = await context.newPage();

    try {
        const url = buildUrl(config.webAppUrl, {
            action: 'updateResult',
            secret: config.secret,
            sheetName: result.sheetName || '',
            rowNumber: String(result.rowNumber),
            status: String(result.status || ''),
            message: String(result.message || '')
        });

        console.log(`Updating ${result.sheetName || ''} row ${result.rowNumber}: ${result.status}`);

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: PAGE_GOTO_TIMEOUT_MS
        });

        const currentUrl = page.url();

        if (
            currentUrl.includes('accounts.google.com') ||
            currentUrl.includes('ServiceLogin')
        ) {
            throw new Error(
                'Google login required for GAS Web App. Please run login first.'
            );
        }

        const bodyText = await page.locator('body').innerText({
            timeout: PAGE_GOTO_TIMEOUT_MS
        });

        const json = parseJsonText(bodyText, 'updateResult');

        if (!json.ok) {
            throw new Error(json.error || 'updateResult failed');
        }

        return json;
    } finally {
        await page.close();
    }
}

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
        `Submit button not found or not clickable: ${lastError ? lastError.message : 'unknown'
        }`
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
        page = await context.newPage();

        await page.goto(payload.formUrl, {
            waitUntil: 'domcontentloaded',
            timeout: PAGE_GOTO_TIMEOUT_MS
        });

        const currentUrl = page.url();

        if (
            currentUrl.includes('accounts.google.com') ||
            currentUrl.includes('ServiceLogin')
        ) {
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

        return {
            sheetName: payload.sheetName,
            rowNumber: payload.rowNumber,
            status: 'DONE',
            message: 'form submitted'
        };
    } catch (e) {
        return {
            sheetName: payload.sheetName,
            rowNumber: payload.rowNumber,
            status: 'ERROR',
            message: e.message
        };
    } finally {
        if (page) {
            try {
                await page.close();
            } catch (e) {
                console.error(`row ${payload.rowNumber}: failed to close page`, e);
            }
        }
    }
}

async function main() {
    console.log('========================================');
    console.log('Daily Google Form Auto Push');
    console.log('========================================');
    console.log('');

    const config = loadJson(DAILY_CONFIG_PATH);

    const runOptions = {
        targetDate: getTargetDateFromArgsOrConfig(config),
        sheetName: getSheetNameFromArgsOrConfig(config),
        dryRun: getDryRunFromArgsOrConfig(config),
        headless: getHeadlessFromArgs(DEFAULT_RPA_HEADLESS)
    };

    if (runOptions.targetDate) {
        console.log(`Target date: ${runOptions.targetDate}`);
    }

    if (runOptions.sheetName) {
        console.log(`Export sheet name: ${runOptions.sheetName}`);
    }

    if (runOptions.dryRun) {
        console.log('Mode: DRY RUN');
    }

    console.log(`Browser mode: ${runOptions.headless ? 'headless' : 'headed'}`);

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: runOptions.headless,
        viewport: {
            width: 1280,
            height: 900
        }
    });

    try {
        console.log('Importing targets from source spreadsheet...');

        const importResult = await importTodayTargets(context, config, runOptions);

        console.log(
            `Import completed. sheet=${importResult.sheetName}, scanned=${importResult.scannedCount}, imported=${importResult.importedCount}`
        );

        console.log('');
        console.log('Fetching targets from exported sheet...');

        const targetResult = await getTargets(context, config, importResult.sheetName);
        const payloads = targetResult.payloads;

        console.log(`Send target count: ${payloads.length}`);

        if (payloads.length === 0) {
            console.log('No target rows to send.');
            return;
        }

        if (runOptions.dryRun) {
            console.log('');
            console.log('Dry run target rows:');

            payloads.forEach((payload, index) => {
                const name = getFieldValue(payload, 'name');
                const url = getFieldValue(payload, 'url');
                const phone = getFieldValue(payload, 'phone');

                console.log(
                    `${index + 1}. sheet=${payload.sheetName}, row=${payload.rowNumber}, name=${name}, phone=${phone}, url=${url}`
                );
            });

            console.log('');
            console.log(`Dry run completed. targetCount=${payloads.length}`);
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < payloads.length; i++) {
            const payload = payloads[i];

            console.log('');
            console.log(`Processing ${i + 1}/${payloads.length}: sheet=${payload.sheetName}, row=${payload.rowNumber}`);

            const result = await submitOnePayload(context, payload);

            await updateResult(context, config, result);

            if (result.status === 'DONE') {
                successCount++;
                console.log(`row ${payload.rowNumber}: DONE`);
            } else {
                errorCount++;
                console.log(`row ${payload.rowNumber}: ERROR ${result.message}`);
            }
        }

        console.log('');
        console.log(`Daily run completed. success=${successCount}, error=${errorCount}`);
    } finally {
        await context.close();
    }
}

main().catch(error => {
    console.error('');
    console.error('Daily run failed.');
    console.error(error);
    process.exit(1);
});
