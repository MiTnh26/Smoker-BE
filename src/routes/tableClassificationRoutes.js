const express = require("express");
const router = express.Router();
const tableClassificationController = require("../controllers/tableClassificationController");

// Tạo loại bàn mới
router.post("/", tableClassificationController.createTableClassification);

// Lấy danh sách loại bàn của 1 BarPage
// IMPORTANT: Route này phải validate GUID format để tránh conflict với routes khác
router.get("/bar/:barPageId", (req, res, next) => {
  const { barPageId } = req.params;
  // Validate GUID format
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guidRegex.test(barPageId)) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed for parameter 'BarPageId'. Invalid GUID.",
      received: barPageId
    });
  }
  next();
}, tableClassificationController.getTableClassifications);

// Cập nhật loại bàn
router.put("/:tableClassificationId", tableClassificationController.updateTableClassification);

// Xóa loại bàn
router.delete("/:tableClassificationId", tableClassificationController.deleteTableClassification);

module.exports = router;
