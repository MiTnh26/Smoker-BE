const express = require("express");
const router = express.Router();
const comboController = require("../controllers/comboController");

// 🔹 Lấy danh sách combo (hoặc tất cả / theo bar nếu bạn mở rộng sau)
router.get("/bar/:barPageId", comboController.getCombos);

// 🔹 Tạo combo mới
router.post("/", comboController.createCombo);

// 🔹 Cập nhật combo theo ID
router.put("/:comboId", comboController.updateCombo);

// 🔹 Xóa combo theo ID
router.delete("/:comboId", comboController.deleteCombo);

module.exports = router;
