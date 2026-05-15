/* GAS_CONFIG_START */
const API_SECRET = "replace-with-your-api-secret";

// 取得元スプレッドシート
const SOURCE_SPREADSHEET_ID = "REPLACE_WITH_SOURCE_SPREADSHEET_ID";
const SOURCE_SHEET_NAME = "Sheet1";

// 実行側スプレッドシート
const DEST_SPREADSHEET_ID = "REPLACE_WITH_DEST_SPREADSHEET_ID";

// 実行側スプレッドシートに作成しておくテンプレートシート名
// このシートにヘッダー順、ステータス列のプルダウンチップ、列幅、固定行、日付形式、罫線などを設定しておく
const TEMPLATE_SHEET_NAME = "template";

const AUTO_FORM_URL = "https://docs.google.com/forms/d/e/REPLACE_WITH_YOUR_FORM_ID/viewform";

// TODO: Google Form の「事前入力したリンクを取得」から実際の entry ID に置き換えてください。
// Form のテキストボックス順:
// 1. 代表名
// 2. URL
// 3. 電話番号
const FORM_PREFILL_ENTRIES = {
    "name": "entry.123456789",
    "url": "entry.987654321",
    "phone": "entry.555555555"
};
/* GAS_CONFIG_END */

const SOURCE_HEADERS = {
    date: '日付',
    caseId: '案件ID',
    caseName: '案件名',
    name: '代表名',
    email: 'メールアドレス',
    phone: '電話番号',
    hp: 'HP',
    media1: '媒体1',
    media2: '媒体2',
    media3: '媒体3'
};

const DEST_HEADERS = {
    date: '日付',
    caseId: '案件ID',
    caseName: '案件名',
    name: '代表名',
    email: 'メールアドレス',
    phone: '電話番号',
    hp: 'HP',
    media1: '媒体1',
    media2: '媒体2',
    media3: '媒体3',
    prefillLink: PREFILL_LINK_HEADER,
    sentAt: '送信日時',
    logMessage: 'logMessage'
};

// 案件ID / 案件名 は template に存在する場合だけ出力する optional ヘッダー。
// そのため、ここでは必須にしない。
const DEST_REQUIRED_HEADERS = [
    DEST_HEADERS.date,
    DEST_HEADERS.name,
    DEST_HEADERS.email,
    DEST_HEADERS.phone,
    DEST_HEADERS.hp,
    DEST_HEADERS.media1,
    DEST_HEADERS.media2,
    DEST_HEADERS.media3,
    DEST_HEADERS.prefillLink,
    DEST_HEADERS.sentAt,
    DEST_HEADERS.logMessage
];

const AUTO_HEADERS = {
    sentAt: '送信日時',
    logMessage: 'logMessage',
    phone: '電話番号',
    name: '代表名',
    urlCandidates: ['HP', '媒体1', '媒体2', '媒体3']
};

function doGet(e) {
    try {
        const params = e.parameter || {};
        validateSecret_(params.secret);

        if (params.action === 'importTodayTargets') {
            return jsonResponse_(importTodayTargets_(params));
        }

        if (params.action === 'getTargets') {
            return jsonResponse_(getTargets_(params));
        }

        if (params.action === 'updateResult') {
            return jsonResponse_(updateResult_({
                sheetName: params.sheetName || getDefaultExportSheetName_(),
                rowNumber: params.rowNumber,
                status: params.status,
                message: params.message || ''
            }));
        }

        return jsonResponse_({
            ok: false,
            error: 'Unknown action'
        });
    } catch (error) {
        return jsonResponse_({
            ok: false,
            error: error.message
        });
    }
}

function doPost(e) {
    try {
        const params = e.parameter || {};
        validateSecret_(params.secret);

        const body = JSON.parse(e.postData.contents || '{}');

        if (params.action === 'importTodayTargets') {
            return jsonResponse_(importTodayTargets_(body));
        }

        if (params.action === 'updateResult') {
            return jsonResponse_(updateResult_(body));
        }

        if (params.action === 'updateResults') {
            return jsonResponse_(updateResults_(body));
        }

        return jsonResponse_({
            ok: false,
            error: 'Unknown action'
        });
    } catch (error) {
        return jsonResponse_({
            ok: false,
            error: error.message
        });
    }
}

function validateSecret_(secret) {
    if (!secret || secret !== API_SECRET) {
        throw new Error('Unauthorized');
    }
}

function importTodayTargets_(params) {
    const targetDate = params && params.targetDate
        ? parseDateString_(params.targetDate)
        : new Date();

    const exportSheetName = params && params.sheetName
        ? String(params.sheetName).trim()
        : formatDate_(targetDate, 'yyyyMMdd');

    const sourceSheet = SpreadsheetApp
        .openById(SOURCE_SPREADSHEET_ID)
        .getSheetByName(SOURCE_SHEET_NAME);

    if (!sourceSheet) {
        throw new Error(`Source sheet not found: ${SOURCE_SHEET_NAME}`);
    }

    const sourceLastRow = sourceSheet.getLastRow();
    const sourceLastColumn = sourceSheet.getLastColumn();

    const destSpreadsheet = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
    const exportSheet = recreateExportSheet_(destSpreadsheet, exportSheetName);

    // template からコピーしたヘッダー順・入力規則・チップ表示・書式・列幅は残しつつ、
    // 2行目以降の値だけ消す。ヘッダー行は template のものをそのまま使う。
    clearDataRows_(exportSheet);

    const exportHeaders = getHeaders_(exportSheet);
    const exportHeaderMap = buildHeaderMap_(exportHeaders);

    validateExportHeaders_(exportHeaderMap);

    const shouldExportCaseId = hasHeader_(exportHeaderMap, DEST_HEADERS.caseId);
    const shouldExportCaseName = hasHeader_(exportHeaderMap, DEST_HEADERS.caseName);

    if (sourceLastRow < 2) {
        return {
            ok: true,
            sheetName: exportSheetName,
            importedCount: 0,
            scannedCount: 0
        };
    }

    const sourceHeaders = sourceSheet
        .getRange(1, 1, 1, sourceLastColumn)
        .getValues()[0]
        .map(value => String(value).trim());

    const sourceHeaderMap = buildHeaderMap_(sourceHeaders);

    const startRow = Math.max(2, sourceLastRow - IMPORT_SCAN_LIMIT + 1);
    const rowCount = sourceLastRow - startRow + 1;

    const rows = sourceSheet
        .getRange(startRow, 1, rowCount, sourceLastColumn)
        .getValues();

    const exportRows = [];
    const normalizedTargetDate = normalizeDate_(targetDate);

    rows.forEach(row => {
        const rawDate = getValue_(row, sourceHeaderMap, SOURCE_HEADERS.date);
        const dateValue = parseSheetDate_(rawDate);

        if (!dateValue) {
            return;
        }

        const elapsedBusinessDays = countBusinessDaysElapsed_(
            dateValue,
            normalizedTargetDate
        );

        if (TARGET_BUSINESS_DAYS.indexOf(elapsedBusinessDays) === -1) {
            return;
        }

        const caseId = shouldExportCaseId
            ? getValue_(row, sourceHeaderMap, SOURCE_HEADERS.caseId)
            : '';

        const caseName = shouldExportCaseName
            ? getValue_(row, sourceHeaderMap, SOURCE_HEADERS.caseName)
            : '';

        const representativeName = getValue_(row, sourceHeaderMap, SOURCE_HEADERS.name);
        const email = getValue_(row, sourceHeaderMap, SOURCE_HEADERS.email);
        const phone = getValue_(row, sourceHeaderMap, SOURCE_HEADERS.phone);
        const hp = getValue_(row, sourceHeaderMap, SOURCE_HEADERS.hp);
        const media1 = getValue_(row, sourceHeaderMap, SOURCE_HEADERS.media1);
        const media2 = getValue_(row, sourceHeaderMap, SOURCE_HEADERS.media2);
        const media3 = getValue_(row, sourceHeaderMap, SOURCE_HEADERS.media3);

        const selectedUrl = pickUrlFromObjectByPriority_({
            HP: hp,
            '媒体1': media1,
            '媒体2': media2,
            '媒体3': media3
        });

        const prefilledFormUrl = buildPrefilledFormUrl_(
            representativeName,
            selectedUrl,
            phone
        );

        const exportRowObject = {
            [DEST_HEADERS.date]: dateValue,
            [DEST_HEADERS.name]: representativeName,
            [DEST_HEADERS.email]: email,
            [DEST_HEADERS.phone]: phone,
            [DEST_HEADERS.hp]: hp,
            [DEST_HEADERS.media1]: media1,
            [DEST_HEADERS.media2]: media2,
            [DEST_HEADERS.media3]: media3,
            [DEST_HEADERS.prefillLink]: prefilledFormUrl,
            [DEST_HEADERS.sentAt]: '',
            [DEST_HEADERS.logMessage]: ''
        };

        if (shouldExportCaseId) {
            exportRowObject[DEST_HEADERS.caseId] = caseId;
        }

        if (shouldExportCaseName) {
            exportRowObject[DEST_HEADERS.caseName] = caseName;
        }

        exportRows.push(buildRowByHeaders_(exportHeaders, exportRowObject));
    });

    if (exportRows.length > 0) {
        exportSheet
            .getRange(2, 1, exportRows.length, exportHeaders.length)
            .setValues(exportRows);
    }

    return {
        ok: true,
        sheetName: exportSheetName,
        importedCount: exportRows.length,
        scannedCount: rows.length
    };
}

function getTargets_(params) {
    const sheetName = params && params.sheetName
        ? String(params.sheetName).trim()
        : getDefaultExportSheetName_();

    const sheet = getDestSheet_(sheetName);
    const headers = getHeaders_(sheet);
    const headerMap = buildHeaderMap_(headers);

    validateTargetHeaders_(headerMap);

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
        return {
            ok: true,
            sheetName,
            count: 0,
            payloads: []
        };
    }

    const values = sheet
        .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
        .getValues();

    const payloads = [];

    values.forEach((row, index) => {
        const rowNumber = index + 2;

        const sentAt = getValue_(row, headerMap, AUTO_HEADERS.sentAt);
        const representativeName = getValue_(row, headerMap, AUTO_HEADERS.name);
        const phone = getValue_(row, headerMap, AUTO_HEADERS.phone);
        const selectedUrl = pickUrlByPriority_(row, headerMap);

        if (sentAt) {
            return;
        }

        if (!representativeName || !phone || !selectedUrl) {
            return;
        }

        payloads.push({
            sheetName,
            rowNumber,
            formUrl: AUTO_FORM_URL,
            fields: [
                {
                    type: 'checkbox',
                    index: 0,
                    name: 'emailCheckbox'
                },
                {
                    type: 'textbox',
                    index: 0,
                    name: 'name',
                    value: representativeName
                },
                {
                    type: 'textbox',
                    index: 1,
                    name: 'url',
                    value: selectedUrl
                },
                {
                    type: 'textbox',
                    index: 2,
                    name: 'phone',
                    value: phone
                }
            ]
        });
    });

    return {
        ok: true,
        sheetName,
        count: payloads.length,
        payloads
    };
}

function updateResults_(body) {
    const results = body.results || [];

    if (!Array.isArray(results)) {
        throw new Error('results must be an array');
    }

    results.forEach(result => {
        updateResult_(result);
    });

    return {
        ok: true,
        updatedCount: results.length
    };
}

function updateResult_(body) {
    const sheetName = body.sheetName
        ? String(body.sheetName).trim()
        : getDefaultExportSheetName_();

    const rowNumber = Number(body.rowNumber);
    const status = String(body.status || '');
    const message = String(body.message || '');

    if (!rowNumber || rowNumber < 2) {
        throw new Error('Invalid rowNumber');
    }

    const sheet = getDestSheet_(sheetName);
    const headers = getHeaders_(sheet);
    const headerMap = buildHeaderMap_(headers);

    validateTargetHeaders_(headerMap);

    const sentAtCol = headerMap[AUTO_HEADERS.sentAt] + 1;
    const logMessageCol = headerMap[AUTO_HEADERS.logMessage] + 1;

    if (status === 'DONE') {
        sheet.getRange(rowNumber, sentAtCol).setValue(new Date());
        sheet.getRange(rowNumber, logMessageCol).setValue(message || 'form submitted');

        return {
            ok: true,
            sheetName,
            rowNumber,
            status,
            message: message || 'form submitted'
        };
    }

    if (status === 'RUNNING') {
        sheet.getRange(rowNumber, logMessageCol).setValue(message || '自動送信中');

        return {
            ok: true,
            sheetName,
            rowNumber,
            status,
            message: message || '自動送信中'
        };
    }

    if (status === 'ERROR') {
        sheet.getRange(rowNumber, logMessageCol).setValue(message || 'ERROR');

        return {
            ok: true,
            sheetName,
            rowNumber,
            status,
            message: message || 'ERROR'
        };
    }

    sheet.getRange(rowNumber, logMessageCol).setValue(message || status || '');

    return {
        ok: true,
        sheetName,
        rowNumber,
        status,
        message: message || status || ''
    };
}

function getDestSheet_(sheetName) {
    const spreadsheet = SpreadsheetApp.openById(DEST_SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
        throw new Error(`Destination sheet not found: ${sheetName}`);
    }

    return sheet;
}

function recreateExportSheet_(spreadsheet, sheetName) {
    const existingSheet = spreadsheet.getSheetByName(sheetName);

    if (existingSheet) {
        spreadsheet.deleteSheet(existingSheet);
    }

    const templateSheet = spreadsheet.getSheetByName(TEMPLATE_SHEET_NAME);

    if (!templateSheet) {
        throw new Error(`Template sheet not found: ${TEMPLATE_SHEET_NAME}`);
    }

    const copiedSheet = templateSheet.copyTo(spreadsheet);
    copiedSheet.setName(sheetName);

    spreadsheet.setActiveSheet(copiedSheet);
    spreadsheet.moveActiveSheet(1);

    return copiedSheet;
}

function clearDataRows_(sheet) {
    const maxRows = sheet.getMaxRows();
    const lastColumn = sheet.getLastColumn();

    if (maxRows < 2 || lastColumn < 1) {
        return;
    }

    sheet
        .getRange(2, 1, maxRows - 1, lastColumn)
        .clearContent();
}

function buildRowByHeaders_(headers, rowObject) {
    return headers.map(header => {
        if (Object.prototype.hasOwnProperty.call(rowObject, header)) {
            return rowObject[header];
        }

        return '';
    });
}

function getHeaders_(sheet) {
    return sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getValues()[0]
        .map(value => String(value).trim());
}

function buildHeaderMap_(headers) {
    const map = {};

    headers.forEach((header, index) => {
        map[header] = index;
    });

    return map;
}

function hasHeader_(headerMap, headerName) {
    return headerMap[headerName] !== undefined;
}

function validateExportHeaders_(headerMap) {
    const missing = DEST_REQUIRED_HEADERS.filter(header => headerMap[header] === undefined);

    if (missing.length > 0) {
        throw new Error('template に必要なヘッダーがありません: ' + missing.join(', '));
    }
}

function validateTargetHeaders_(headerMap) {
    const requiredHeaders = [
        AUTO_HEADERS.sentAt,
        AUTO_HEADERS.logMessage,
        AUTO_HEADERS.phone,
        AUTO_HEADERS.name,
        ...AUTO_HEADERS.urlCandidates
    ];

    const missing = requiredHeaders.filter(header => headerMap[header] === undefined);

    if (missing.length > 0) {
        throw new Error('必要なヘッダーがありません: ' + missing.join(', '));
    }
}

function getValue_(row, headerMap, headerName) {
    const index = headerMap[headerName];

    if (index === undefined) {
        return '';
    }

    const value = row[index];

    if (value instanceof Date) {
        return value;
    }

    return String(value || '').trim();
}

function pickUrlByPriority_(row, headerMap) {
    for (const headerName of AUTO_HEADERS.urlCandidates) {
        const value = getValue_(row, headerMap, headerName);
        const text = value instanceof Date ? '' : String(value || '').trim();

        if (text.startsWith('https://')) {
            return text;
        }
    }

    return '';
}

function pickUrlFromObjectByPriority_(data) {
    for (const headerName of AUTO_HEADERS.urlCandidates) {
        const value = String(data[headerName] || '').trim();

        if (value.startsWith('https://')) {
            return value;
        }
    }

    return '';
}

function buildPrefilledFormUrl_(representativeName, selectedUrl, phone) {
    const params = [];

    params.push('usp=pp_url');

    params.push(
        encodeURIComponent(FORM_PREFILL_ENTRIES.name) +
        '=' +
        encodeURIComponent(String(representativeName || ''))
    );

    params.push(
        encodeURIComponent(FORM_PREFILL_ENTRIES.url) +
        '=' +
        encodeURIComponent(String(selectedUrl || ''))
    );

    params.push(
        encodeURIComponent(FORM_PREFILL_ENTRIES.phone) +
        '=' +
        encodeURIComponent(String(phone || ''))
    );

    return AUTO_FORM_URL + '?' + params.join('&');
}

function parseSheetDate_(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
        return normalizeDate_(value);
    }

    const text = String(value || '').trim();

    if (!text) {
        return null;
    }

    const normalized = text.replace(/-/g, '/');
    const parsed = new Date(normalized);

    if (isNaN(parsed.getTime())) {
        return null;
    }

    return normalizeDate_(parsed);
}

function parseDateString_(value) {
    const text = String(value || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new Error('targetDate must be in YYYY-MM-DD format');
    }

    const parts = text.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function normalizeDate_(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countBusinessDaysElapsed_(fromDate, toDate) {
    const start = normalizeDate_(fromDate);
    const end = normalizeDate_(toDate);

    if (start >= end) {
        return 0;
    }

    let count = 0;
    const cursor = new Date(start);

    cursor.setDate(cursor.getDate() + 1);

    while (cursor <= end) {
        if (isBusinessDay_(cursor)) {
            count++;
        }

        cursor.setDate(cursor.getDate() + 1);
    }

    return count;
}

function isBusinessDay_(date) {
    const day = date.getDay();

    if (day === 0 || day === 6) {
        return false;
    }

    if (isHoliday_(date)) {
        return false;
    }

    return true;
}

function isHoliday_(date) {
    const key = formatDate_(date, 'yyyyMMdd');

    if (Object.prototype.hasOwnProperty.call(HOLIDAY_CACHE, key)) {
        return HOLIDAY_CACHE[key];
    }

    const calendar = CalendarApp.getCalendarById(JAPAN_HOLIDAY_CALENDAR_ID);

    if (!calendar) {
        throw new Error('日本の祝日カレンダーを取得できませんでした。');
    }

    const isHoliday = calendar.getEventsForDay(date).length > 0;
    HOLIDAY_CACHE[key] = isHoliday;

    return isHoliday;
}

function getDefaultExportSheetName_() {
    return formatDate_(new Date(), 'yyyyMMdd');
}

function formatDate_(date, format) {
    return Utilities.formatDate(date, 'Asia/Tokyo', format);
}

function authorizeCalendarForHoliday() {
    const calendar = CalendarApp.getCalendarById(JAPAN_HOLIDAY_CALENDAR_ID);

    if (!calendar) {
        throw new Error('日本の祝日カレンダーを取得できませんでした。');
    }

    const events = calendar.getEventsForDay(new Date());
    Logger.log(events.length);
}

function jsonResponse_(object) {
    return ContentService
        .createTextOutput(JSON.stringify(object))
        .setMimeType(ContentService.MimeType.JSON);
}
