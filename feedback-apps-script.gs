/**
 * แจ้งปัญหา — shared Apps Script webhook (ใช้ร่วมกันได้หลายแอป BMS)
 * ไม่ได้เป็นส่วนหนึ่งของโค้ด client — ไฟล์นี้ไว้ copy ไปวางใน Apps Script editor
 * ของ Google Sheet ที่จะใช้เป็นฐานข้อมูลแจ้งปัญหา แล้ว deploy เป็น Web App
 *
 * ===== วิธีติดตั้ง =====
 * 1. สร้าง Google Sheet ใหม่ (หรือใช้ชีตที่ตั้งใจจะใช้ร่วมกันหลายแอปอยู่แล้ว)
 * 2. เมนู Extensions → Apps Script
 * 3. ลบโค้ดเดิมในไฟล์ Code.gs ทั้งหมด แล้ววางโค้ดนี้แทน
 * 4. กด Deploy → New deployment
 *      - Select type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. กด Deploy แล้ว copy URL ที่ลงท้ายด้วย /exec
 * 6. เอา URL นั้นไปแทนค่า FEEDBACK_WEBHOOK_URL ในไฟล์ panels.jsx ของแอปนี้
 *    (ตอนนี้ panels.jsx ใช้ URL ตัวอย่างที่ยังไม่ได้ deploy จริง)
 *
 * ชีตจะถูกสร้างแท็บ "Feedback" ให้อัตโนมัติพร้อมหัวตารางตอนเรียกครั้งแรก
 * คอลัมน์ "solution" และ "status" เว้นว่างไว้ให้ผู้ดูแลกรอกเองในชีตตอนแก้ปัญหาแล้ว
 * (พิมพ์คำว่า "แก้ไข", "เสร็จ" หรือ "ปิด" ในคอลัมน์ status เพื่อให้หน้าแอปขึ้น badge สีเขียว)
 */

const TOKEN = 'gfjoo4k';
const SHEET_NAME = 'Feedback';
const HEADERS = ['timestamp', 'app', 'hospital', 'reporter', 'detail', 'solution', 'status'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// รับรายงานปัญหาใหม่ — body: { token, app, hospital, reporter, detail }
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return jsonOut_({ ok: false, error: 'invalid token' });
    if (!body.reporter || !body.detail) return jsonOut_({ ok: false, error: 'missing reporter/detail' });

    getSheet_().appendRow([
      new Date(),
      body.app || '',
      body.hospital || '',
      body.reporter,
      body.detail,
      '',               // solution — กรอกทีหลังตอนแก้ปัญหาแล้ว
      'รอดำเนินการ',     // status เริ่มต้น
    ]);
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// ดึงรายการที่เคยแจ้ง — query: ?token=...&hospital=...&app=...
// กรองตาม hospital และ app พร้อมกัน (ไม่ใส่พารามิเตอร์ไหน = ไม่กรองตัวนั้น)
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.token !== TOKEN) return jsonOut_({ ok: false, error: 'invalid token' });

    const values = getSheet_().getDataRange().getValues();
    const headers = values.shift();
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });

    const rows = values
      .filter(r =>
        (!p.app || String(r[idx.app]) === p.app) &&
        (!p.hospital || String(r[idx.hospital]) === p.hospital)
      )
      .map(r => ({
        'วันที่แจ้ง': r[idx.timestamp] instanceof Date ? r[idx.timestamp].toISOString() : r[idx.timestamp],
        'ผู้แจ้ง': r[idx.reporter],
        'รายละเอียด': r[idx.detail],
        'วิธีแก้ไข': r[idx.solution],
        'สถานะ': r[idx.status],
      }))
      .reverse(); // แสดงรายการล่าสุดก่อน

    return jsonOut_(rows);
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}
