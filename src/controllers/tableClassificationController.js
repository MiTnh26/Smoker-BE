const {
    getTableClassificationsByBarPageId,
    getTableClassificationById,
    createTableClassification,
    updateTableClassification,
    deleteTableClassification,
  } = require("../models/tableClassificationModel");
  
  // Lấy tất cả loại bàn của BarPage
  exports.getTableClassifications = async (req, res) => {
    try {
      const { barPageId } = req.params;
      if (!barPageId)
        return res.status(400).json({ status: "error", message: "Thiếu barPageId" });
  
      const classifications = await getTableClassificationsByBarPageId(barPageId);
      return res.status(200).json({ status: "success", data: classifications });
    } catch (err) {
      console.error("getTableClassifications error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Lấy loại bàn theo Id
  exports.getTableClassification = async (req, res) => {
    try {
      const { tableClassificationId } = req.params;
      if (!tableClassificationId)
        return res.status(400).json({ status: "error", message: "Thiếu tableClassificationId" });
  
      const classification = await getTableClassificationById(tableClassificationId);
      if (!classification)
        return res.status(404).json({ status: "error", message: "Không tìm thấy loại bàn" });
  
      return res.status(200).json({ status: "success", data: classification });
    } catch (err) {
      console.error("getTableClassification error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Tạo loại bàn mới
  exports.createTableClassification = async (req, res) => {
    try {
      const { tableTypeName, color, barPageId, tableTypes } = req.body;

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationController.js:44',message:'createTableClassification called',data:{tableTypeName,color,barPageId,hasTableTypes:!!tableTypes,sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
      // Handle multiple table types creation
      if (tableTypes && Array.isArray(tableTypes)) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationController.js:49',message:'Processing multiple table types',data:{tableTypesCount:tableTypes.length,barPageId,sessionId:'debug-session',runId:'run1',hypothesisId:'A'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        const results = [];
        for (const tableType of tableTypes) {
          if (tableType.name && tableType.color) {
            const newClassification = await createTableClassification({
              tableTypeName: tableType.name,
              color: tableType.color,
              barPageId
            });
            results.push(newClassification);
          }
        }
        return res.status(201).json({ status: "success", data: results });
      }

      // Handle single table type creation
      if (!tableTypeName || !color || !barPageId) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationController.js:64',message:'Missing required data',data:{hasTableTypeName:!!tableTypeName,hasColor:!!color,hasBarPageId:!!barPageId,barPageId,sessionId:'debug-session',runId:'run1',hypothesisId:'A'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });
      }

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tableClassificationController.js:67',message:'Calling createTableClassification',data:{tableTypeName,color,barPageId,sessionId:'debug-session',runId:'run1',hypothesisId:'B'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      const newClassification = await createTableClassification({ tableTypeName, color, barPageId });
      return res.status(201).json({ status: "success", data: newClassification });
    } catch (err) {
      console.error("createTableClassification error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
 
  // Cập nhật loại bàn
  exports.updateTableClassification = async (req, res) => {
    try {
      const { tableClassificationId } = req.params;
      const { tableTypeName, color } = req.body;

      if (!tableClassificationId)
        return res.status(400).json({ status: "error", message: "Thiếu tableClassificationId" });

      const updated = await updateTableClassification(tableClassificationId, { tableTypeName, color });
      return res.status(200).json({ status: "success", data: updated });
    } catch (err) {
      console.error("updateTableClassification error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };

  // Xóa loại bàn
  exports.deleteTableClassification = async (req, res) => {
    try {
      const { tableClassificationId } = req.params;
      if (!tableClassificationId)
        return res.status(400).json({ status: "error", message: "Thiếu tableClassificationId" });

      await deleteTableClassification(tableClassificationId);
      return res.status(200).json({ status: "success", message: "Xóa loại bàn thành công" });
    } catch (err) {
      console.error("deleteTableClassification error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };



  