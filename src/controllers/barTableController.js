const {
    getBarTablesByBarId,
    getBarTableById,
    createBarTable,
    updateBarTable,
    deleteBarTable,
  } = require("../models/barTableModel");
  
  // Lấy tất cả bàn của Bar
  exports.getBarTables = async (req, res) => {
    try {
      const { barId } = req.params;
      if (!barId)
        return res.status(400).json({ status: "error", message: "Thiếu barId" });
  
      const tables = await getBarTablesByBarId(barId);
      return res.status(200).json({ status: "success", data: tables });
    } catch (err) {
      console.error("getBarTables error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Lấy bàn theo Id
  exports.getBarTable = async (req, res) => {
    try {
      const { barTableId } = req.params;
      if (!barTableId)
        return res.status(400).json({ status: "error", message: "Thiếu barTableId" });
  
      const table = await getBarTableById(barTableId);
      if (!table)
        return res.status(404).json({ status: "error", message: "Không tìm thấy bàn" });
  
      return res.status(200).json({ status: "success", data: table });
    } catch (err) {
      console.error("getBarTable error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Tạo bàn mới
  exports.createBarTable = async (req, res) => {
    try {
      const { barId, tableApplyId = null, tableName, depositPrice = 0, status = "Active", tableClassificationId } = req.body;

      if (!barId || !tableName || !tableClassificationId)
        return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });

      const newTable = await createBarTable({ barId, tableApplyId, tableName, depositPrice, status, tableClassificationId });
      return res.status(201).json({ status: "success", data: newTable });
    } catch (err) {
      console.error("createBarTable error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };

  // Tạo nhiều bàn cùng lúc
  exports.createMultipleBarTables = async (req, res) => {
    try {
      const tables = req.body;
      if (!Array.isArray(tables) || tables.length === 0)
        return res.status(400).json({ status: "error", message: "Dữ liệu bàn không hợp lệ" });

      const results = [];
      for (const table of tables) {
        const { barPageId, tableName, tableClassificationId } = table;
        if (barPageId && tableName && tableClassificationId) {
          const newTable = await createBarTable({ 
            barId: barPageId, 
            tableName, 
            tableClassificationId,
            depositPrice: 0,
            status: "Active"
          });
          results.push(newTable);
        }
      }

      return res.status(201).json({ status: "success", data: results });
    } catch (err) {
      console.error("createMultipleBarTables error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Cập nhật bàn
  exports.updateBarTable = async (req, res) => {
    try {
      const { barTableId } = req.params;
      const { tableName, depositPrice, status, tableClassificationId, tableApplyId } = req.body;
  
      if (!barTableId)
        return res.status(400).json({ status: "error", message: "Thiếu barTableId" });
  
      const updated = await updateBarTable(barTableId, { tableName, depositPrice, status, tableClassificationId, tableApplyId });
      return res.status(200).json({ status: "success", data: updated });
    } catch (err) {
      console.error("updateBarTable error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  // Xóa bàn
exports.deleteBarTable = async (req, res) => {
    try {
      const { barTableId } = req.params;
      if (!barTableId)
        return res.status(400).json({ status: "error", message: "Thiếu barTableId" });
  
      const table = await getBarTableById(barTableId);
      if (!table)
        return res.status(404).json({ status: "error", message: "Không tìm thấy bàn" });
  
      await deleteBarTable(barTableId); // cần tạo function delete trong model
      return res.status(200).json({ status: "success", message: "Xóa bàn thành công" });
    } catch (err) {
      console.error("deleteBarTable error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  