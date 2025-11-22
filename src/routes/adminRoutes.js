const express = require("express");
const router = express.Router();
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");
const AdminController = require("../controllers/adminController");

router.get("/stats", verifyToken, requireAdmin, AdminController.getStats);
router.get("/users", verifyToken, requireAdmin, AdminController.listUsers);
router.get("/registrations/pending", verifyToken, requireAdmin, AdminController.getPendingRegistrations);
router.patch("/users/:id/status", verifyToken, requireAdmin, AdminController.updateUserStatus);
router.patch("/users/:id/role", verifyToken, requireAdmin, AdminController.updateUserRole);
router.patch("/business/:id/status", verifyToken, requireAdmin, AdminController.updateBusinessStatus);
router.get("/users/:id/businesses", verifyToken, requireAdmin, AdminController.getUserBusinesses);
router.patch("/bar/:id/status", verifyToken, requireAdmin, AdminController.updateBarStatus);

module.exports = router;
