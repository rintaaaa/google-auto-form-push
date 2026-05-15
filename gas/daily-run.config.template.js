const API_SECRET = __API_SECRET__;

// 取得元スプレッドシート
const SOURCE_SPREADSHEET_ID = __SOURCE_SPREADSHEET_ID__;
const SOURCE_SHEET_NAME = __SOURCE_SHEET_NAME__;

// 実行側スプレッドシート
const DEST_SPREADSHEET_ID = __DEST_SPREADSHEET_ID__;

// 実行側スプレッドシートに作成しておくテンプレートシート名
// このシートにヘッダー順、ステータス列のプルダウンチップ、列幅、固定行、日付形式、罫線などを設定しておく
const TEMPLATE_SHEET_NAME = __TEMPLATE_SHEET_NAME__;

const AUTO_FORM_URL = __FORM_URL__;

// TODO: Google Form の「事前入力したリンクを取得」から実際の entry ID に置き換えてください。
// Form のテキストボックス順:
// 1. 代表名
// 2. URL
// 3. 電話番号
const FORM_PREFILL_ENTRIES = __FORM_PREFILL_ENTRIES__;
