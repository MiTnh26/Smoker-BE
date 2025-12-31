const {
  getBarTablesByBarId,
  getBarTableById,
  createBarTable,
  updateBarTable,
  deleteBarTable,
} = require("../models/barTableModel");
const { getTableClassificationById } = require("../models/tableClassificationModel"); // <-- thêm dòng này
// Lấy tất cả bàn của Bar
exports.getBarTables = async (req, res) => {
  try {
    const { barPageId } = req.params;
    if (!barPageId) {
      return res.status(400).json({ status: "error", message: "Thiếu barPageId" });
    }

    // Validate GUID format
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(barPageId)) {
      return res.status(400).json({ status: "error", message: "barPageId không hợp lệ" });
    }

    // Lấy tất cả bàn kèm thông tin loại bàn
    const tables = await getBarTablesByBarId(barPageId);
    console.log("getBarTablesByBarId result:", tables); 

    // Không cần map thêm nữa vì đã có TableTypeName & Color
    return res.status(200).json({ status: "success", data: tables || [] });
  } catch (err) {
    console.error("getBarTables error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({ 
      status: "error", 
      message: err.message || "Lỗi máy chủ",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
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

    const type = await getTableClassificationById(table.tableClassificationId);

    return res.status(200).json({ 
      status: "success", 
      data: {
        ...table,
        TableTypeName: type?.TableTypeName || "",
        Color: type?.Color || "#eee"
      }
    });
  } catch (err) {
    console.error("getBarTable error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
  }
};


// Tạo bàn mới
exports.createBarTable = async (req, res) => {
  try {
    const { barId, tableName, status = "Active", tableClassificationId } = req.body;

    if (!barId || !tableName || !tableClassificationId)
      return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });

    const newTable = await createBarTable({ barId, tableName, status, tableClassificationId });
    console.log("Created new table:", newTable);
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

      // Check bắt buộc dữ liệu
      if (!barPageId || !tableName || !tableClassificationId)
        throw new Error(`Thiếu dữ liệu bắt buộc cho bàn: ${tableName || "?"}`);


      // Tạo bàn
      const newTable = await createBarTable({
        barId: barPageId,
        tableName,
        tableClassificationId,
        status: "Active"
      });
      results.push(newTable);
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
    const { tableName, status, tableClassificationId } = req.body;

    if (!barTableId)
      return res.status(400).json({ status: "error", message: "Thiếu barTableId" });

    const updated = await updateBarTable(barTableId, { tableName, status, tableClassificationId });
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

