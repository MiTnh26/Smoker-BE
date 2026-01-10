const express = require("express");
const router = express.Router();
const adminComboController = require("../controllers/adminComboController");
const { verifyToken } = require("../middleware/authMiddleware");

// GET /api/admin/combos - Lấy danh sách combos
router.get("/", verifyToken, adminComboController.getCombos);

// GET /api/admin/combos/stats - Thống kê combo
router.get("/stats", verifyToken, adminComboController.getComboStats);

// GET /api/admin/combos/:id - Lấy combo theo ID
router.get("/:id", verifyToken, adminComboController.getComboById);

// POST /api/admin/combos - Tạo combo mới
router.post("/", verifyToken, adminComboController.createCombo);

// PUT /api/admin/combos/:id - Cập nhật combo
router.put("/:id", verifyToken, adminComboController.updateCombo);

// DELETE /api/admin/combos/:id - Xóa combo
router.delete("/:id", verifyToken, adminComboController.deleteCombo);

module.exports = router;



