/**
 * GOOGLE APPS SCRIPT SETUP INSTRUCTIONS
 * 
 * 1. Go to https://docs.google.com/spreadsheets/ and create a new Google Sheet.
 * 2. Name the first sheet (tab at the bottom) exactly: "Sheet1"
 * 3. In the menu, click "Extensions" -> "Apps Script".
 * 4. Delete any code in the editor and paste ALL of the code below into it.
 * 5. Click the Save icon (or Ctrl+S / Cmd+S).
 * 6. Click the blue "Deploy" button at the top right -> "New deployment".
 * 7. Click the gear icon next to "Select type" and choose "Web app".
 * 8. Under Configuration:
 *    - Description: "SheetSync API" (or anything you like)
 *    - Execute as: "Me (your email)"
 *    - Who has access: "Anyone" <--- THIS IS CRITICAL for it to work.
 * 9. Click "Deploy".
 *    - Note: You may be prompted to "Review permissions". Click it, select your Google account, click "Advanced", and click "Go to Untitled project (unsafe)". Then click "Allow".
 * 10. Copy the "Web app URL" provided. It looks like: https://script.google.com/macros/s/.../exec
 * 11. Paste this URL into the settings of your web app!
 * Deployment ID: AKfycbyg1ywdChhD_wR1UwCA-9Fbl3l8VjjUqXpSwXw-RGR61bamZopIe4GieRqelOk4fSkl
 * https://script.google.com/macros/s/AKfycbyg1ywdChhD_wR1UwCA-9Fbl3l8VjjUqXpSwXw-RGR61bamZopIe4GieRqelOk4fSkl/exec
 * Note: If you ever change the code below, you MUST click "Deploy" -> "Manage deployments" -> Edit -> New Version to apply the changes.
 */

const SHEET_NAME = 'Sheet1';

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    return createJsonResponse({ error: "Sheet '" + SHEET_NAME + "' not found." });
  }

  const data = sheet.getDataRange().getValues();
  
  let available = [];
  let selected = [];
  
  // Assuming row 1 is headers. If empty, we start at row 0 or 1.
  // We'll read from row index 1 (the 2nd row) downwards to skip headers.
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== "" && data[i][0] !== undefined) available.push(String(data[i][0]));
    if (data[i][1] !== "" && data[i][1] !== undefined) selected.push(String(data[i][1]));
  }
  
  // If the sheet is completely empty (data.length <= 1), return empty arrays
  return createJsonResponse({ available: available, selected: selected });
}

function doPost(e) {
  let requestData;
  try {
    requestData = JSON.parse(e.postData.contents);
  } catch(err) {
    return createJsonResponse({ error: "Invalid JSON format" });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return createJsonResponse({ error: "Sheet '" + SHEET_NAME + "' not found." });
  }
  
  sheet.clearContents();
  
  // Set headers
  sheet.getRange(1, 1, 1, 2).setValues([["Available Items", "Selected Items"]]);
  sheet.getRange(1, 1, 1, 2).setFontWeight("bold");
  
  const available = requestData.available || [];
  const selected = requestData.selected || [];
  
  const maxRows = Math.max(available.length, selected.length);
  
  if (maxRows > 0) {
    let writeData = [];
    for (let i = 0; i < maxRows; i++) {
      writeData.push([
        available[i] !== undefined ? available[i] : "",
        selected[i] !== undefined ? selected[i] : ""
      ]);
    }
    // Batch write all data
    sheet.getRange(2, 1, writeData.length, 2).setValues(writeData);
  }
  
  return createJsonResponse({ success: true, message: "Sheet updated successfully" });
}

// Helper to return proper JSON with CORS headers (though App Script masks some CORS, JSON output is standard)
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
