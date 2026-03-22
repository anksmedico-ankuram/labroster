// ═══════════════════════════════════════════════════════════════════
//  ANKURAM LABS — LabRoster Pro  |  Google Apps Script Backend
//  Paste this entire file into: Extensions → Apps Script → Code.gs
//  Then: Deploy → New Deployment → Web App → Anyone → Deploy
//  Copy the Web App URL into both admin.html and staff.html
// ═══════════════════════════════════════════════════════════════════

const SHEET_NAMES = {
  employees:    'Employees',
  roster:       'Roster',
  leaveRequests:'LeaveRequests',
  lockedRanges: 'LockedRanges',
  staffBlocks:  'StaffBlocks',
  settings:     'Settings',
};

// ─── CORS helper ───
function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── GET handler — read all sheets at once ───
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const result = {};
    Object.entries(SHEET_NAMES).forEach(([key, name]) => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) { result[key] = []; return; }
      const data = sheet.getDataRange().getValues();
      if (data.length < 2) { result[key] = []; return; }
      const headers = data[0];
      result[key] = data.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = row[i] === '' ? null : String(row[i]));
        return obj;
      }).filter(obj => obj[headers[0]]); // skip empty rows
    });
    return corsResponse({ ok: true, data: result });
  } catch(err) {
    return corsResponse({ ok: false, error: err.message });
  }
}

// ─── POST handler — write operations ───
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { action, sheet: sheetKey, row, id, rows } = payload;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = SHEET_NAMES[sheetKey];
    if (!sheetName) return corsResponse({ ok: false, error: 'Unknown sheet: ' + sheetKey });

    let sheet = ss.getSheetByName(sheetName);

    // ── INIT: create sheet with headers if it doesn't exist ──
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      const headers = getHeaders(sheetKey);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      // Style header row
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#1a2035')
        .setFontColor('#e8c547')
        .setFontWeight('bold');
    }

    if (action === 'append') {
      // Add a new row
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rowData = headers.map(h => row[h] !== undefined ? row[h] : '');
      sheet.appendRow(rowData);
      return corsResponse({ ok: true });
    }

    if (action === 'update') {
      // Find row by id field and update
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('id');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(id)) {
          const newRow = headers.map(h => row[h] !== undefined ? row[h] : data[i][headers.indexOf(h)]);
          sheet.getRange(i + 1, 1, 1, headers.length).setValues([newRow]);
          return corsResponse({ ok: true });
        }
      }
      // Not found — append instead
      const rowData = headers.map(h => row[h] !== undefined ? row[h] : '');
      sheet.appendRow(rowData);
      return corsResponse({ ok: true, note: 'not found, appended' });
    }

    if (action === 'delete') {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const idCol = headers.indexOf('id');
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][idCol]) === String(id)) {
          sheet.deleteRow(i + 1);
          return corsResponse({ ok: true });
        }
      }
      return corsResponse({ ok: false, error: 'Row not found' });
    }

    if (action === 'bulkReplace') {
      // Clear all data rows and write fresh (used for full sync)
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
      if (rows && rows.length > 0) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const data = rows.map(r => headers.map(h => r[h] !== undefined ? r[h] : ''));
        sheet.getRange(2, 1, data.length, headers.length).setValues(data);
      }
      return corsResponse({ ok: true });
    }

    if (action === 'initSheets') {
      // Create all sheets with correct headers
      Object.keys(SHEET_NAMES).forEach(key => {
        const name = SHEET_NAMES[key];
        let s = ss.getSheetByName(name);
        if (!s) {
          s = ss.insertSheet(name);
          const headers = getHeaders(key);
          s.getRange(1, 1, 1, headers.length).setValues([headers]);
          s.setFrozenRows(1);
          s.getRange(1, 1, 1, headers.length)
            .setBackground('#1a2035')
            .setFontColor('#e8c547')
            .setFontWeight('bold');
          // Auto-resize columns
          s.autoResizeColumns(1, headers.length);
        }
      });
      return corsResponse({ ok: true, message: 'All sheets initialized' });
    }

    return corsResponse({ ok: false, error: 'Unknown action: ' + action });

  } catch(err) {
    return corsResponse({ ok: false, error: err.message });
  }
}

// ─── Column headers for each sheet ───
function getHeaders(sheetKey) {
  const map = {
    employees:    ['id','name','role','dept','contact','pin','preferredShift','joinDate'],
    roster:       ['id','empId','date','shift','site','notes','status'],
    leaveRequests:['id','empId','leaveDate','reason','replacementEmpId','status','submittedOn','adminNote'],
    lockedRanges: ['id','from','to','reason','addedOn'],
    staffBlocks:  ['id','empId','from','to'],
    settings:     ['key','value'],
  };
  return map[sheetKey] || [];
}
