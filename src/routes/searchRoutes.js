const express = require("express");
const router = express.Router();
const searchController = require("../controllers/searchController");

router.get("/all", searchController.searchAll);
router.get("/trending", searchController.getTrendingSearches); // GET /api/search/trending?limit=6

module.exports = router;


