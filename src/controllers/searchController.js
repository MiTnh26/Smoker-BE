const searchService = require("../services/searchService");

exports.searchAll = async (req, res) => {
  try {
    const { q = '', limit = 10 } = req.query;
    if (!q || !String(q).trim()) {
      return res.status(400).json({ success: false, message: 'Query q is required' });
    }
    const data = await searchService.searchAll(String(q).trim(), parseInt(limit));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Search error', error: err.message });
  }
};


