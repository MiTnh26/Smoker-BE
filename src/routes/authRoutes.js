const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/register", authController.register);
router.post("/google-register", authController.googleRegister);
router.post("/login", authController.login);
router.post("/google-oauth", authController.googleOAuthLogin);
router.post("/forgot-password", authController.forgotPassword);
router.post("/change-password", authController.changePassword);

module.exports = router;
