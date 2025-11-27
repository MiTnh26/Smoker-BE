const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { verifyToken } = require('../middleware/authMiddleware');

// Route để lấy dữ liệu profile, yêu cầu xác thực
router.get('/:entityId', verifyToken, profileController.getProfile.bind(profileController));

module.exports = router;

