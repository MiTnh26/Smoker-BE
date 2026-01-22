const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { optionalVerifyToken } = require('../middleware/authMiddleware');

// Route để lấy dữ liệu profile, cho phép xem công khai (không yêu cầu đăng nhập)
// optionalVerifyToken: nếu có token thì verify, nếu không có thì vẫn cho phép truy cập
router.get('/:entityId', optionalVerifyToken, profileController.getProfile.bind(profileController));

module.exports = router;

