const express = require("express");
const router = express.Router();
const barTableController = require("../controllers/barTableController");

// Tạo bàn mới
router.post("/", barTableController.createBarTable);

// Tạo nhiều bàn cùng lúc
router.post("/multiple", barTableController.createMultipleBarTables);

// Lấy danh sách bàn của BarPage
router.get("/bar/:barPageId", barTableController.getBarTables);

// Cập nhật thông tin bàn
router.put("/:barTableId", barTableController.updateBarTable);

// Xóa bàn
router.delete("/:barTableId", barTableController.deleteBarTable);

module.exports = router;
