const express = require("express");
const router = express.Router();
const tableClassificationController = require("../controllers/tableClassificationController");

// Tạo loại bàn mới
router.post("/", tableClassificationController.createTableClassification);

// Lấy danh sách loại bàn của 1 BarPage
router.get("/bar/:barPageId", tableClassificationController.getTableClassifications);

// Cập nhật loại bàn
router.put("/:tableClassificationId", tableClassificationController.updateTableClassification);

// Xóa loại bàn
router.delete("/:tableClassificationId", tableClassificationController.deleteTableClassification);

module.exports = router;
