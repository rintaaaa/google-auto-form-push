const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GAS_DIR = path.join(ROOT_DIR, 'gas');
const DEFAULT_CONFIG_PATH = path.join(GAS_DIR, 'gas-config.json');
const CONFIG_START = '/* GAS_CONFIG_START */';
const CONFIG_END = '/* GAS_CONFIG_END */';

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureConfig(config) {
    const required = [
        'apiSecret',
        'sourceSpreadsheetId',
        'sourceSheetName',
        'destSpreadsheetId',
        'templateSheetName',
        'formUrl',
        'formPrefillEntries'
    ];

    const missing = required.filter(key => config[key] === undefined || config[key] === null);

    if (missing.length > 0) {
        throw new Error(`Missing config keys: ${missing.join(', ')}`);
    }

    const entryKeys = ['name', 'url', 'phone'];
    const missingEntryKeys = entryKeys.filter(
        key => !config.formPrefillEntries || config.formPrefillEntries[key] === undefined
    );

    if (missingEntryKeys.length > 0) {
        throw new Error(`Missing formPrefillEntries keys: ${missingEntryKeys.join(', ')}`);
    }
}

function toJsLiteral(value) {
    return JSON.stringify(value, null, 4);
}

function renderTemplate(templatePath, replacements) {
    let content = fs.readFileSync(templatePath, 'utf8');

    Object.entries(replacements).forEach(([token, value]) => {
        content = content.replaceAll(token, value);
    });

    const unresolvedTokens = content.match(/__[A-Z0-9_]+__/g);

    if (unresolvedTokens) {
        throw new Error(
            `Unresolved template tokens in ${path.basename(templatePath)}: ${unresolvedTokens.join(', ')}`
        );
    }

    return content.trimEnd();
}

function replaceConfigBlock(targetPath, renderedBlock) {
    const content = fs.readFileSync(targetPath, 'utf8');
    const startIndex = content.indexOf(CONFIG_START);
    const endIndex = content.indexOf(CONFIG_END);

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error(`Config markers not found in ${path.basename(targetPath)}`);
    }

    const updated = [
        content.slice(0, startIndex + CONFIG_START.length),
        '\n',
        renderedBlock,
        '\n',
        content.slice(endIndex)
    ].join('');

    fs.writeFileSync(targetPath, updated);
}

function main() {
    const configPath = process.argv[2]
        ? path.resolve(ROOT_DIR, process.argv[2])
        : DEFAULT_CONFIG_PATH;

    if (!fs.existsSync(configPath)) {
        throw new Error(
            `Config file not found: ${configPath}\n` +
            'Copy gas/gas-config.example.json to gas/gas-config.json and edit the values.'
        );
    }

    const config = readJson(configPath);
    ensureConfig(config);

    const replacements = {
        '__API_SECRET__': toJsLiteral(config.apiSecret),
        '__SOURCE_SPREADSHEET_ID__': toJsLiteral(config.sourceSpreadsheetId),
        '__SOURCE_SHEET_NAME__': toJsLiteral(config.sourceSheetName),
        '__DEST_SPREADSHEET_ID__': toJsLiteral(config.destSpreadsheetId),
        '__TEMPLATE_SHEET_NAME__': toJsLiteral(config.templateSheetName),
        '__FORM_URL__': toJsLiteral(config.formUrl),
        '__FORM_PREFILL_ENTRIES__': toJsLiteral(config.formPrefillEntries)
    };

    const dailyRunBlock = renderTemplate(
        path.join(GAS_DIR, 'daily-run.config.template.js'),
        replacements
    );
    const serverBlock = renderTemplate(
        path.join(GAS_DIR, 'server.config.template.js'),
        replacements
    );

    replaceConfigBlock(path.join(GAS_DIR, 'daily-run.js'), dailyRunBlock);
    replaceConfigBlock(path.join(GAS_DIR, 'server.js'), serverBlock);

    console.log('Generated gas/daily-run.js and gas/server.js');
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
