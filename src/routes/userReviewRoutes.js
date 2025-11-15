const express = require('express');
const router = express.Router();
const userReviewController = require('../controllers/userReviewController');

// Create or update review for business account
router.post('/', userReviewController.createUserReview);
// Get all (admin)
router.get('/', userReviewController.getAllUserReviews);
// Get by business account
router.get('/business/:businessAccountId', userReviewController.getUserReviewsByBusiness);
// Get by id
router.get('/:id', userReviewController.getUserReviewById);
// Update
router.put('/:id', userReviewController.updateUserReview);
// Delete
router.delete('/:id', userReviewController.deleteUserReview);

module.exports = router;
