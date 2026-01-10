const { getPool, sql } = require("../db/sqlserver");

// Lấy tất cả loại bàn theo BarPageId
async function getTableClassificationsByBarPageId(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT TableClassificationId, TableTypeName, Color, BarPageId
      FROM TableClassifications
      WHERE BarPageId = @BarPageId
      ORDER BY TableTypeName
    `);
  return result.recordset;
}

// Lấy loại bàn theo Id
async function getTableClassificationById(tableClassificationId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId)
    .query(`
      SELECT TableClassificationId, TableTypeName, Color, BarPageId
      FROM TableClassifications
      WHERE TableClassificationId = @TableClassificationId
    `);
  return result.recordset[0] || null;
}

// Tạo loại bàn mới
async function createTableClassification({ tableTypeName, color, barPageId }) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationModel.js:31',message:'createTableClassification called',data:{tableTypeName,color,barPageId,barPageIdType:typeof barPageId,sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const pool = await getPool();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationModel.js:35',message:'Got database pool, checking BarPageId existence',data:{barPageId,sessionId:'debug-session',runId:'run1',hypothesisId:'C'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // Check if BarPageId exists in BarPages table
  try {
    const checkResult = await pool.request()
      .input("BarPageId", sql.UniqueIdentifier, barPageId)
      .query(`
        SELECT BarPageId, BarName
        FROM BarPages
        WHERE BarPageId = @BarPageId
      `);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationModel.js:40',message:'BarPageId existence check result',data:{barPageId,exists:checkResult.recordset.length > 0,barName:checkResult.recordset[0]?.BarName,sessionId:'debug-session',runId:'run1',hypothesisId:'C'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (checkResult.recordset.length === 0) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationModel.js:45',message:'BarPageId does not exist - about to throw error',data:{barPageId,sessionId:'debug-session',runId:'run1',hypothesisId:'C'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      throw new Error(`BarPageId ${barPageId} does not exist in BarPages table`);
    }
  } catch (checkError) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationModel.js:50',message:'Error checking BarPageId existence',data:{barPageId,error:checkError.message,sessionId:'debug-session',runId:'run1',hypothesisId:'C'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw checkError;
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationModel.js:56',message:'About to execute INSERT query',data:{tableTypeName,color,barPageId,sessionId:'debug-session',runId:'run1',hypothesisId:'D'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const result = await pool.request()
    .input("TableTypeName", sql.NVarChar(50), tableTypeName)
    .input("Color", sql.NVarChar(10), color)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      INSERT INTO TableClassifications (TableTypeName, Color, BarPageId)
      OUTPUT inserted.*
      VALUES (@TableTypeName, @Color, @BarPageId)
    `);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationModel.js:61',message:'INSERT query completed successfully',data:{insertedId:result.recordset[0]?.TableClassificationId,sessionId:'debug-session',runId:'run1',hypothesisId:'D'},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  return result.recordset[0];
}

// Cập nhật loại bàn
async function updateTableClassification(tableClassificationId, updates) {
  const pool = await getPool();
  const { tableTypeName, color } = updates;

  const result = await pool.request()
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId)
    .input("TableTypeName", sql.NVarChar(50), tableTypeName || null)
    .input("Color", sql.NVarChar(10), color || null)
    .query(`
      UPDATE TableClassifications
      SET 
        TableTypeName = COALESCE(@TableTypeName, TableTypeName),
        Color = COALESCE(@Color, Color)
      WHERE TableClassificationId = @TableClassificationId;

      SELECT * FROM TableClassifications WHERE TableClassificationId = @TableClassificationId;
    `);
  return result.recordset[0] || null;
}

// Xóa loại bàn
async function deleteTableClassification(tableClassificationId) {
  const pool = await getPool();
  await pool.request()
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId)
    .query(`DELETE FROM TableClassifications WHERE TableClassificationId = @TableClassificationId`);
  return true;
}

module.exports = {
  getTableClassificationsByBarPageId,
  getTableClassificationById,
  createTableClassification,
  updateTableClassification,
  deleteTableClassification,
};
