const FORM_URL = __FORM_URL__;

const SENT_AT_HEADER = '送信日時';
const LOG_MESSAGE_HEADER = 'logMessage';

const NAME_HEADER = '代表名';
const PHONE_HEADER = '電話番号';
const PREFILL_LINK_HEADER = 'Form事前入力リンク';

const URL_CANDIDATE_HEADERS = ['HP', '媒体1', '媒体2', '媒体3'];

// TODO: Google Form の「事前入力したリンクを取得」から実際の entry ID に置き換えてください。
// Form のテキストボックス順:
// 1. 代表名
// 2. URL
// 3. 電話番号
const FORM_PREFILL_ENTRIES = __FORM_PREFILL_ENTRIES__;
