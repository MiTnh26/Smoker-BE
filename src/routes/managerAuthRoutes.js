const express = require("express");
const router = express.Router();
const managerAuthController = require("../controllers/managerAuthController");
const { verifyToken } = require("../middleware/authMiddleware");

// Public routes
router.post("/register", managerAuthController.register);
router.post("/login", managerAuthController.login);

// Protected routes
router.get("/me", verifyToken, managerAuthController.getMe);

module.exports = router;

