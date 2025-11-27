const searchService = require("../services/searchService");

exports.searchAll = async (req, res) => {
  try {
    const { q = '', limit = 10 } = req.query;
    console.log('[SearchController] searchAll - Request:', { q, limit });
    
    if (!q || !String(q).trim()) {
      console.log('[SearchController] searchAll - Empty query');
      return res.status(400).json({ success: false, message: 'Query q is required' });
    }
    
    const query = String(q).trim();
    const data = await searchService.searchAll(query, parseInt(limit));
    
    console.log('[SearchController] searchAll - Response:', {
      users: data.users?.length || 0,
      djs: data.djs?.length || 0,
      dancers: data.dancers?.length || 0,
      bars: data.bars?.length || 0,
      posts: data.posts?.length || 0
    });
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('[SearchController] searchAll - Error:', err);
    res.status(500).json({ success: false, message: 'Search error', error: err.message });
  }
};


