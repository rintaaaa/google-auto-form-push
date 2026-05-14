# Google Form Auto Push RPA

Google スプレッドシート上の選択行を、ローカルの Playwright RPA サーバ経由で Google Form に送信するツールです。

Google Form に組織認証やメールアドレス確認チェックがあるため、GAS の `UrlFetchApp` や curl ではなく、ログイン済み Chromium を Playwright で操作します。

## 構成

```txt
Google Spreadsheet
  ↓ Apps Script sidebar
http://localhost:8181
  ↓
local Node.js server / executable
  ↓
Playwright / Chromium
  ↓
Google Form
```

## ディレクトリ構成

```txt
.
├── dist
│   ├── google-form-rpa.exe
│   └── google-form-rpa-mac-arm64
├── gas
│   ├── code.js
│   ├── sidebar.html
│   └── sample-spreadsheet.xlsx
├── scripts
│   ├── build-mac.sh
│   ├── build-win.sh
│   └── check-local.sh
├── package-lock.json
├── package.json
├── README.md
├── server.js
├── setup.bat
└── start.bat
```

## 必要なもの

開発・ビルドを行う場合は以下が必要です。

- Node.js
- npm
- Google スプレッドシート
- Google Apps Script
- Playwright

Windows でビルド済み exe を利用する場合も、初回セットアップで Playwright Chromium をインストールするために Node.js / npm / npx が必要です。

## Windows での初期設定フロー

Windows で利用する場合は、以下の順番で初期設定します。

```txt
1. PowerShell を開く
2. Node.js / npm / npx が使えるか確認する
3. 未インストールなら winget で Node.js LTS をインストールする
4. PowerShell を開き直す
5. setup.bat を実行する
6. start.bat を実行する
7. スプレッドシートから疎通確認する
8. ログイン用ブラウザで Google ログインする
9. 選択行をフォーム送信して動作確認する
```

### 1. PowerShell を開く

通常は管理者権限なしで問題ありません。

```txt
通常起動:
  Win + X → I

管理者起動:
  Win + X → A
```

`winget install` が権限エラーになる場合だけ、管理者 PowerShell で実行してください。

### 2. Node.js / npm / npx の確認

PowerShell で以下を実行します。

```powershell
node -v
npm -v
npx -v
```

3つともバージョンが表示されれば、Node.js の準備は完了です。

### 3. Node.js がない場合

Node.js が入っていない場合は、PowerShell で以下を実行します。

```powershell
winget install OpenJS.NodeJS.LTS
```

インストール後、PowerShell を一度閉じて、開き直してください。

その後、再度確認します。

```powershell
node -v
npm -v
npx -v
```

`npx -v` で `このシステムではスクリプトの実行が無効になっているため...` のようなエラーが出る場合は、PowerShell の実行ポリシーが原因です。

恒久的に現在のユーザーだけ許可する場合は、以下を実行します。

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

実行後、PowerShell を開き直して確認します。

```powershell
npx -v
```

### 4. 初回セットアップ

配布フォルダに移動し、`setup.bat` を実行します。

```txt
setup.bat
```

`setup.bat` は以下を行います。

- Node.js / npm / npx が利用できることを確認
- npm依存関係がなければ `npm ci` または `npm install` を実行
- `package.json` に定義された Playwright のバージョンを読む
- Playwright Chromium が未インストールの場合のみインストール

### 5. ローカルRPAサーバ起動

初回セットアップ後、`start.bat` を実行します。

```txt
start.bat
```

起動すると以下のように表示されます。

```txt
Local RPA server running on http://localhost:8181
```

このウィンドウは閉じないでください。閉じるとローカルRPAサーバも停止します。

### 6. スプレッドシートから疎通確認

スプレッドシートを開き、以下を実行します。

```txt
フォーム送信 → 初回設定を開く → 疎通確認
```

疎通確認が成功すれば、スプレッドシートのサイドバーから `localhost:8181` にアクセスできています。

### 7. Google ログイン

Google Form は組織認証付きのため、初回だけログイン済みセッションを作成します。

```txt
フォーム送信 → 初回設定を開く → ログイン用ブラウザを開く
```

起動した Chromium で Google アカウントにログインしてください。

ログイン状態は以下に保存されます。

```txt
./user-data
```

`user-data` を削除すると再ログインが必要になります。

### 8. 送信テスト

送信したい行を選択し、以下を実行します。

```txt
フォーム送信 → 送信パネルを開く → 選択行をフォーム送信
```

送信が成功すると、対象行に以下が書き込まれます。

```txt
送信日時 = 送信時刻
logMessage = form submitted
```

## セットアップ

### 1. npm install

開発環境では以下を実行します。

```bash
npm install
```

Playwright の Chromium を入れていない場合は以下も実行します。

```bash
npx playwright install chromium
```

### 2. サーバ起動

開発時は以下で起動できます。

```bash
node server.js
```

起動すると以下のように表示されます。

```txt
Local RPA server running on http://localhost:8181
```

### 3. 疎通確認

別ターミナルで確認します。

```bash
curl http://localhost:8181/health
```

正常なら以下のような JSON が返ります。

```json
{
  "ok": true,
  "message": "localhost 8181 reached"
}
```

または、スプレッドシートから以下を実行します。

```txt
フォーム送信 → 初回設定を開く → 疎通確認
```

## Apps Script の配置

`gas/code.js` の内容を Apps Script の `Code.gs` に貼り付けます。

`gas/sidebar.html` の内容を Apps Script の `sidebar.html` に貼り付けます。

サンプルのスプレッドシートは以下です。

```txt
gas/sample-spreadsheet.xlsx
```

Google スプレッドシートとして使う場合は、この xlsx を Google Drive にアップロードし、Google スプレッドシート形式で開いてください。

## 初回ログイン

Google Form は組織認証付きのため、初回だけログイン済みセッションを作成します。

1. ローカルRPAサーバを起動する
2. スプレッドシートを開く
3. `フォーム送信 → 初回設定を開く`
4. `疎通確認` を押して、ローカルRPAサーバに接続できることを確認する
5. `ログイン用ブラウザを開く` を押す
6. 起動した Chromium で Google アカウントにログインする
7. ログイン完了後、ブラウザを閉じる

ログイン状態は以下に保存されます。

```txt
./user-data
```

`user-data` を削除すると再ログインが必要になります。

## スプレッドシートのヘッダー

対象シートには以下のヘッダーが必要です。

```txt
送信日時 | logMessage | 電話番号 | 代表名 | HP | 媒体1 | 媒体2 | 媒体3
```

列順は自由です。ヘッダー名で動的に取得します。

### 入力値の対応

| スプレッドシート列 | Google Form入力先 |
|---|---|
| 代表名 | 名前 |
| 電話番号 | 電話番号 |
| HP / 媒体1 / 媒体2 / 媒体3 | URL |

URL は以下の優先順で採用します。

```txt
HP → 媒体1 → 媒体2 → 媒体3
```

ただし、値が `https://` で始まるものだけを採用します。

例：

| HP | 媒体1 | 媒体2 | 採用URL |
|---|---|---|---|
| http://example.com |  | https://example.jp | https://example.jp |
| https://example.com | https://example.jp |  | https://example.com |

## 使い方

1. ローカルRPAサーバを起動する
2. スプレッドシートを開く
3. `フォーム送信 → 送信パネルを開く`
4. 送信したい行を選択する
5. `選択行をフォーム送信` を押す

複数行を選択すると、上から順番に送信します。

送信が成功すると、対象行に以下が書き込まれます。

```txt
送信日時 = 送信時刻
logMessage = form submitted
```

エラー時は `logMessage` にエラー内容が書き込まれます。

## Windows exe で使う場合

Windows 用の exe は以下に出力されます。

```txt
dist/google-form-rpa.exe
```

配布時は以下のような構成にします。

```txt
google-form-rpa/
├── google-form-rpa.exe
├── package.json
├── package-lock.json
├── setup.bat
├── start.bat
└── user-data/
```

`user-data` は初回ログイン時に作成されます。

### 初回セットアップ

詳しい流れは `Windows での初期設定フロー` を参照してください。

`setup.bat` は以下を行います。

- Node.js / npm / npx が利用できることを確認
- npm依存関係がなければ `npm ci` または `npm install` を実行
- `package.json` に定義された Playwright のバージョンを読む
- Playwright Chromium が未インストールの場合のみインストール

`package-lock.json` も同梱することで、`npm install` / `npm ci` 時の依存関係を開発時に確認した構成に近づけます。

### 通常起動

通常起動は `start.bat` を実行します。

```txt
start.bat
```

起動すると以下のように表示されます。

```txt
Local RPA server running on http://localhost:8181
```

その後、スプレッドシートから以下を実行して確認します。

```txt
フォーム送信 → 初回設定を開く → 疎通確認
```

## ビルド

### Mac 用 executable を作成

```bash
./scripts/build-mac.sh
```

出力先：

```txt
dist/google-form-rpa-mac-arm64
```

実行：

```bash
./dist/google-form-rpa-mac-arm64
```

### Windows 用 exe を作成

```bash
./scripts/build-win.sh
```

出力先：

```txt
dist/google-form-rpa.exe
```

## ローカルRPAサーバが起動していない場合

スプレッドシートから送信できない場合、まず以下を確認します。

```bash
curl http://localhost:8181/health
```

返らない場合はサーバが起動していません。

開発時は以下を実行してください。

```bash
node server.js
```

Mac の executable を使う場合：

```bash
./dist/google-form-rpa-mac-arm64
```

Windows の exe を使う場合：

```txt
start.bat
```

## Windowsで自動起動する場合

Windows ではタスクスケジューラを使います。

タスクスケジューラから `start.bat` を起動してください。

例：

- トリガー: ログオン時
- 操作: プログラムの開始
- プログラム: `start.bat`
- 開始: `google-form-rpa` フォルダ

## よくあるエラー

### Google login required. Please run login first.

ログイン済みセッションがない、または期限切れです。

対応：

1. `フォーム送信 → 初回設定を開く`
2. `ログイン用ブラウザを開く`
3. Googleログインする
4. ブラウザを閉じる
5. 再実行する

### Failed to fetch

スプレッドシートのサイドバーから `localhost:8181` にアクセスできていません。

確認：

```bash
curl http://localhost:8181/health
```

サーバが起動していなければ、開発時は以下を実行してください。

```bash
node server.js
```

Windows exe 版の場合は `start.bat` を実行してください。

### 送信日時 / logMessage 列が必要です

スプレッドシートのヘッダーが不足しています。

必要な列：

```txt
送信日時
logMessage
電話番号
代表名
HP
媒体1
媒体2
媒体3
```

### Playwright Chromium が見つからない

Playwright Chromium が未インストールです。

開発環境では以下を実行してください。

```bash
npx playwright install chromium
```

Windows exe 版では、初回セットアップとして以下を実行してください。

```txt
setup.bat
```

### node / npm / npx が見つからない

Windows の場合は PowerShell で Node.js をインストールしてください。

```powershell
winget install OpenJS.NodeJS.LTS
```

インストール後、PowerShell を一度閉じて開き直し、以下を確認します。

```powershell
node -v
npm -v
npx -v
```

`npx -v` でスクリプト実行ポリシーのエラーが出る場合は、以下を実行します。

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

その後、PowerShell を開き直して `npx -v` を再確認してください。

## 注意

- GAS の `UrlFetchApp` では localhost にアクセスできません。
- この仕組みでは、Apps Script サイドバー内のブラウザ JavaScript から `localhost:8181` にアクセスしています。
- Google Form の仕様変更により、入力欄や送信ボタンのセレクタ調整が必要になる場合があります。
- `user-data` にはログインセッション情報が含まれるため、共有・コミットしないでください。
- `dist/` の exe は配布物です。Git管理するかどうかは運用に応じて判断してください。
