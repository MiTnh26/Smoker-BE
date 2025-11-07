const express = require('express');
const router = express.Router();
const userReviewController = require('../controllers/userReviewController');

// Create
router.post('/', userReviewController.createUserReview);
// Get all
router.get('/', userReviewController.getAllUserReviews);
// Get by id
router.get('/:id', userReviewController.getUserReviewById);
// Update
router.put('/:id', userReviewController.updateUserReview);
// Delete
router.delete('/:id', userReviewController.deleteUserReview);

module.exports = router;
