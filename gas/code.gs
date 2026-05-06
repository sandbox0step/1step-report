// =================================================================
//  統合 GAS スクリプト
//  1. 除草作業 完了報告書 -> スプレッドシート（index.html）
//  2. ASRカメラ URLのみ  -> スプレッドシート（camera.html）
//  3. ASRカメラ 写真     -> Google ドライブ保存（camera.html）
// =================================================================
//
// デプロイ手順
//  (1) スプレッドシートを開く
//      https://docs.google.com/spreadsheets/d/1vN9wtH2nEiSpC4QxpYphaJ-369eGmNHV4k5DB5ETvms/edit
//  (2) メニュー「拡張機能」->「Apps Script」-> このコードを貼り付けて保存
//  (3)「デプロイ」->「新しいデプロイ」
//      種類: ウェブアプリ / 実行者: 自分 / アクセス: 全員
//  (4)「アクセスを承認」-> Googleアカウントでログイン
//      「詳細」->「安全でないページへ移動」->「許可」
//  (5) 表示された URL を camera.html / index.html の GAS_URL に設定
//
// 変更後の再デプロイ
//  「デプロイ」->「デプロイを管理」-> 鉛筆アイコン ->
//  バージョン「新しいバージョン」->「デプロイ」
// =================================================================

// ----- 設定 -----
var SPREADSHEET_ID = '1vN9wtH2nEiSpC4QxpYphaJ-369eGmNHV4k5DB5ETvms';
var REPORT_SHEET   = 'シート1';
var CAMERA_SHEET   = 'ASRカメラ';

// ----- ヘッダー定義 -----
var REPORT_HEADERS = [
  '送信日時', '作業日', '案件名', '担当者名', '現場名称',
  '工番', '所在地', '作業時間', '作業人数', '天候・気温',
  '備考・連絡事項', '共有リンクURL'
];

// camera_asr: 縦配列 ── 送信日時 | 現場名 | カテゴリ | アルバムURL
var CAMERA_HEADERS = ['送信日時', '現場名', 'カテゴリ', 'アルバムURL'];

// =================================================================
// エントリーポイント
// =================================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.type === 'camera_photo') { return savePhotoToDrive(data); }
    if (data.type === 'camera_asr')   { return saveCameraToSheet(data); }
    return saveReportToSheet(data);

  } catch (err) {
    return makeJson({ status: 'error', message: err.toString() });
  }
}

// =================================================================
// 写真を Google ドライブに保存
// フォルダ構成: ASR / 現場名 / 日付 / カテゴリ名
// カテゴリフォルダを共有し、そのURLを返す
// =================================================================
function savePhotoToDrive(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var siteName   = (data.siteName || '未設定').replace(/[\\/:*?<>|"]/g, '_');
    var date       = data.date || todayJST();
    var mode       = data.mode || '点検';

    var root       = DriveApp.getRootFolder();
    var asrFolder  = getOrCreateFolder('ASR', root);
    var siteFolder = getOrCreateFolder(siteName, asrFolder);
    var dateFolder = getOrCreateFolder(date, siteFolder);
    var modeFolder = getOrCreateFolder(mode, dateFolder);

    var filename = data.filename || (nowFilename() + '.jpg');
    var bytes    = Utilities.base64Decode(data.imageData);
    var blob     = Utilities.newBlob(bytes, data.mimeType || 'image/jpeg', filename);
    modeFolder.createFile(blob);

    // カテゴリフォルダ単位で共有リンクを発行
    modeFolder.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );

    var link = 'https://drive.google.com/drive/folders/' + modeFolder.getId();
    return makeJson({ status: 'ok', link: link });

  } catch (err) {
    return makeJson({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// =================================================================
// ASRカメラのURLをスプレッドシートに縦配列で書き込む
// 受け取るデータ: カテゴリ名とURLのみ（写真URLは一切書き込まない）
//
// 書き込みイメージ:
//   行1: 送信日時 | 現場名 | 作業前 | https://drive...
//   行2: 送信日時 | 現場名 | 作業後 | https://drive...
//   行3: 送信日時 | 現場名 | 点検   | https://drive...
// =================================================================
function saveCameraToSheet(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CAMERA_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(CAMERA_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CAMERA_HEADERS);
    sheet.getRange(1, 1, 1, CAMERA_HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#dce8ff');
    sheet.setFrozenRows(1);
  }

  var jst   = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  var modes = data.modes || [];

  modes.forEach(function(m) {
    if (!m.url) return; // URLのないカテゴリはスキップ
    sheet.appendRow([jst, data.siteName || '', m.name, m.url]);
  });

  return makeJson({ status: 'ok' });
}

// =================================================================
// 報告書データをスプレッドシートに保存（index.html 用・変更なし）
// =================================================================
function saveReportToSheet(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(REPORT_SHEET) || ss.getActiveSheet();

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REPORT_HEADERS);
    sheet.getRange(1, 1, 1, REPORT_HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#e8f5ec');
    sheet.setFrozenRows(1);
    sheet.getDataRange().createFilter();
  }

  var jst = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

  sheet.appendRow([
    jst,
    data.workDate    || data.date      || '',
    data.projectName || data.project   || '',
    data.workerName  || data.staff     || '',
    data.siteName    || '',
    data.siteId      || data.jobNo     || '',
    data.location    || '',
    data.workTime    || '',
    data.workerCount || data.workers   || '',
    data.weather     || '',
    data.remarks     || '',
    data.shareLink   || data.icloudUrl || ''
  ]);

  if (!sheet.getFilter()) {
    sheet.getDataRange().createFilter();
  }

  return makeJson({ status: 'ok' });
}

// =================================================================
// ヘルパー関数
// =================================================================
function getOrCreateFolder(name, parentFolder) {
  var it = parentFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(name);
}

function todayJST() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function nowFilename() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
}

function makeJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
