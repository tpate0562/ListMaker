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
  let inventory = [];
  let selected = [];
  
  // Assuming row 1 is headers. We read from row index 1 downwards.
  for (let i = 1; i < data.length; i++) {
    // Column A & B: Inventory List
    const invName = String(data[i][0]);
    if (invName && invName !== "undefined" && invName.trim() !== "") {
      const qtyStr = String(data[i][1]);
      const qty = (qtyStr && !isNaN(qtyStr)) ? parseInt(qtyStr, 10) : 0;
      inventory.push({ name: invName, qty: qty });
    }
    
    // Column C: All Items List
    const allName = String(data[i][2]);
    if (allName && allName !== "undefined" && allName.trim() !== "") {
      available.push(allName);
    }
    
    // Column D & E: Needed List
    const neededItem = String(data[i][3]);
    if (neededItem && neededItem !== "undefined" && neededItem.trim() !== "") {
      const neededQtyStr = String(data[i][4]);
      const neededQty = (neededQtyStr && !isNaN(neededQtyStr)) ? parseInt(neededQtyStr, 10) : 1;
      selected.push({ name: neededItem, qty: neededQty });
    }
  }
  
  return createJsonResponse({ available: available, inventory: inventory, selected: selected });
}

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  let requestData;
  try {
    requestData = JSON.parse(e.postData.contents);
  } catch (err) {
    return createJsonResponse({ error: "Invalid JSON payload" });
  }
  
  sheet.clearContents();
  
  // Set headers for 5 columns
  sheet.getRange(1, 1, 1, 5).setValues([["Inventory Item", "Inventory Qty", "All Items", "Needed Item", "Needed Qty"]]);
  sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
  
  const available = requestData.available || []; // String array
  const inventory = requestData.inventory || []; // [{name, qty}, ...]
  const selected = requestData.selected || [];   // [{name, qty}, ...]
  
  const maxRows = Math.max(available.length, inventory.length, selected.length);
  
  if (maxRows > 0) {
    let writeData = [];
    for (let i = 0; i < maxRows; i++) {
        
      // Inventory (Cols A, B)
      let invName = "";
      let invQty = "";
      if (inventory[i]) {
          invName = inventory[i].name || "";
          invQty = inventory[i].qty !== undefined ? inventory[i].qty : 0;
      }
      
      // All Items (Col C)
      let allName = available[i] !== undefined ? available[i] : "";

      // Needed Items (Cols D, E)
      let neededName = "";
      let neededQty = "";
      if (selected[i]) {
          neededName = selected[i].name || selected[i]; // Handle object or string legacy
          neededQty = selected[i].qty !== undefined ? selected[i].qty : 1;
      }

      writeData.push([
        invName,
        invName !== "" ? invQty : "",
        allName,
        neededName,
        neededName !== "" ? neededQty : "" // Only write qty if name exists
      ]);
    }
    // Batch write all data to 5 columns
    sheet.getRange(2, 1, writeData.length, 5).setValues(writeData);
  }
  
  return createJsonResponse({ success: true, message: "Sheet updated successfully" });
}

// Helper to return proper JSON with CORS headers
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
