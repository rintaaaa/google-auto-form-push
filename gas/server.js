/* GAS_CONFIG_START */
const FORM_URL = "https://docs.google.com/forms/d/e/REPLACE_WITH_YOUR_FORM_ID/viewform";

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

const SENT_AT_HEADER = '送信日時';
const LOG_MESSAGE_HEADER = 'logMessage';

const NAME_HEADER = '代表名';
const PHONE_HEADER = '電話番号';
const PREFILL_LINK_HEADER = 'Form事前入力リンク';

const URL_CANDIDATE_HEADERS = ['HP', '媒体1', '媒体2', '媒体3'];

function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('フォーム送信')
        .addItem('初回設定を開く', 'showInitialSetupPanel')
        .addItem('送信パネルを開く', 'showSendPanel')
        .addSeparator()
        .addItem('選択行の事前入力リンクを生成', 'generatePrefilledFormLinksForSelectedRows')
        .addToUi();
}

function showInitialSetupPanel() {
    showSidebar_('setup', '初回設定');
}

function showSendPanel() {
    showSidebar_('send', '送信パネル');
}

function showSidebar_(panelMode, panelTitle) {
    const template = HtmlService.createTemplateFromFile('sidebar');

    template.panelMode = panelMode;
    template.panelTitle = panelTitle;

    const html = template.evaluate()
        .setTitle(panelTitle);

    SpreadsheetApp.getUi().showSidebar(html);
}

function getSelectedRowsPayloads() {
    const sheet = SpreadsheetApp.getActiveSheet();
    const range = sheet.getActiveRange();

    if (!range) {
        throw new Error('行を選択してください。');
    }

    const startRow = range.getRow();
    const numRows = range.getNumRows();

    if (startRow === 1) {
        throw new Error('ヘッダー行ではなく、データ行を選択してください。');
    }

    const lastColumn = sheet.getLastColumn();

    const headers = sheet
        .getRange(1, 1, 1, lastColumn)
        .getValues()[0]
        .map(header => String(header).trim());

    validateRequiredHeaders(headers);

    const rows = sheet
        .getRange(startRow, 1, numRows, lastColumn)
        .getValues();

    return rows.map((row, index) => {
        const data = Object.fromEntries(
            headers.map((header, colIndex) => [header, row[colIndex]])
        );

        const representativeName = String(data[NAME_HEADER] || '').trim();
        const phone = String(data[PHONE_HEADER] || '').trim();
        const selectedUrl = pickUrlByPriority(data);

        return {
            rowNumber: startRow + index,
            formUrl: FORM_URL,
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
        };
    });
}

function generatePrefilledFormLinksForSelectedRows() {
    const sheet = SpreadsheetApp.getActiveSheet();
    const range = sheet.getActiveRange();

    if (!range) {
        SpreadsheetApp.getUi().alert('事前入力リンクを生成したい行を選択してください。');
        return;
    }

    const startRow = range.getRow();
    const numRows = range.getNumRows();

    if (startRow === 1) {
        SpreadsheetApp.getUi().alert('ヘッダー行ではなく、データ行を選択してください。');
        return;
    }

    const lastColumn = sheet.getLastColumn();

    const headers = sheet
        .getRange(1, 1, 1, lastColumn)
        .getValues()[0]
        .map(header => String(header).trim());

    validateRequiredHeaders(headers);

    const prefillLinkCol = headers.indexOf(PREFILL_LINK_HEADER) + 1;

    if (prefillLinkCol === 0) {
        SpreadsheetApp.getUi().alert(`${PREFILL_LINK_HEADER}列が必要です。`);
        return;
    }

    const rows = sheet
        .getRange(startRow, 1, numRows, lastColumn)
        .getValues();

    const links = rows.map(row => {
        const data = Object.fromEntries(
            headers.map((header, colIndex) => [header, row[colIndex]])
        );

        const representativeName = String(data[NAME_HEADER] || '').trim();
        const phone = String(data[PHONE_HEADER] || '').trim();
        const selectedUrl = pickUrlByPriority(data);

        const prefilledFormUrl = buildPrefilledFormUrl(
            representativeName,
            selectedUrl,
            phone
        );

        return [prefilledFormUrl];
    });

    sheet.getRange(startRow, prefillLinkCol, links.length, 1).setValues(links);

    SpreadsheetApp.getUi().alert(`${links.length}行の事前入力リンクを生成しました。`);
}

function buildPrefilledFormUrl(representativeName, selectedUrl, phone) {
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

    return FORM_URL + '?' + params.join('&');
}

function pickUrlByPriority(data) {
    for (const header of URL_CANDIDATE_HEADERS) {
        const value = String(data[header] || '').trim();

        if (value.startsWith('https://')) {
            return value;
        }
    }

    return '';
}

function validateRequiredHeaders(headers) {
    const requiredHeaders = [
        SENT_AT_HEADER,
        LOG_MESSAGE_HEADER,
        NAME_HEADER,
        PHONE_HEADER,
        PREFILL_LINK_HEADER,
        ...URL_CANDIDATE_HEADERS
    ];

    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));

    if (missingHeaders.length > 0) {
        throw new Error('必要なヘッダーがありません: ' + missingHeaders.join(', '));
    }
}

function clearSelectedRowsResult() {
    const sheet = SpreadsheetApp.getActiveSheet();
    const range = sheet.getActiveRange();

    if (!range) {
        SpreadsheetApp.getUi().alert('クリアしたい行を選択してください。');
        return;
    }

    const startRow = range.getRow();
    const numRows = range.getNumRows();

    if (startRow === 1) {
        SpreadsheetApp.getUi().alert('ヘッダー行は選択しないでください。');
        return;
    }

    const headers = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getValues()[0]
        .map(header => String(header).trim());

    const sentAtCol = headers.indexOf(SENT_AT_HEADER) + 1;
    const logMessageCol = headers.indexOf(LOG_MESSAGE_HEADER) + 1;

    if (sentAtCol === 0 || logMessageCol === 0) {
        SpreadsheetApp.getUi().alert(`${SENT_AT_HEADER}列と${LOG_MESSAGE_HEADER}列が必要です。`);
        return;
    }

    for (let i = 0; i < numRows; i++) {
        const row = startRow + i;
        sheet.getRange(row, sentAtCol).setValue('');
        sheet.getRange(row, logMessageCol).setValue('');
    }

    SpreadsheetApp.getUi().alert(`${numRows}行の送信日時とログをクリアしました。`);
}

function updateRowResult(rowNumber, status, message) {
    const sheet = SpreadsheetApp.getActiveSheet();

    const headers = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getValues()[0]
        .map(header => String(header).trim());

    const sentAtCol = headers.indexOf(SENT_AT_HEADER) + 1;
    const logMessageCol = headers.indexOf(LOG_MESSAGE_HEADER) + 1;

    if (sentAtCol === 0 || logMessageCol === 0) {
        throw new Error(`${SENT_AT_HEADER}列と${LOG_MESSAGE_HEADER}列が必要です。`);
    }

    if (status === 'DONE') {
        sheet.getRange(rowNumber, sentAtCol).setValue(new Date());
        sheet.getRange(rowNumber, logMessageCol).setValue(message || 'form submitted');
        return;
    }

    if (status === 'RUNNING') {
        sheet.getRange(rowNumber, logMessageCol).setValue(message || '送信中');
        return;
    }

    if (status === 'ERROR') {
        sheet.getRange(rowNumber, logMessageCol).setValue(message || 'ERROR');
        return;
    }

    sheet.getRange(rowNumber, logMessageCol).setValue(message || status || '');
}
