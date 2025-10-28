const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");

router.post("/register", authController.register);
router.post("/google-register", authController.googleRegister);
router.post("/login", authController.login);
router.post("/google-oauth", authController.googleOAuthLogin);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-otp", authController.verifyOtp);
router.post("/reset-password", authController.resetPassword);
router.post("/change-password", verifyToken, authController.changePassword);
router.post("/facebook-oauth", authController.facebookOAuthLogin);
router.post("/facebook-register", authController.facebookRegister);

module.exports = router;
