const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Trigger Revive maintenance script
 * POST /api/revive/maintenance/run
 * 
 * Security: Requires secret key in header or body
 * Headers: x-maintenance-secret: {secret}
 * Body: { secret: {secret} }
 */
router.post('/run', async (req, res) => {
  try {
    // Kiểm tra secret key để tránh public access
    const secret = req.headers['x-maintenance-secret'] || req.body.secret;
    const expectedSecret = process.env.REVIVE_MAINTENANCE_SECRET;
    
    if (!expectedSecret) {
      console.warn('[ReviveMaintenance] REVIVE_MAINTENANCE_SECRET not configured');
      return res.status(500).json({
        success: false,
        message: 'Maintenance secret not configured on server'
      });
    }
    
    if (secret !== expectedSecret) {
      console.warn('[ReviveMaintenance] Unauthorized access attempt');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Missing or invalid secret key.'
      });
    }

    console.log('[ReviveMaintenance] Triggering maintenance script...');
    
    // Gọi maintenance script qua HTTP (vì Revive chạy trong container riêng)
    const reviveUrl = process.env.REVIVE_AD_SERVER_URL || 'https://smoker-revive.onrender.com/revive';
    const maintenanceUrl = `${reviveUrl}/maintenance/maintenance.php`;
    
    try {
      const response = await axios.get(maintenanceUrl, {
        timeout: 180000, // 3 phút timeout (maintenance có thể mất thời gian)
        validateStatus: () => true, // Accept any status code
        headers: {
          'User-Agent': 'Smoker-Backend-Maintenance-Trigger/1.0'
        }
      });
      
      console.log('[ReviveMaintenance] Maintenance completed, status:', response.status);
      
      // Kiểm tra response có chứa lỗi không
      const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const hasError = responseText.includes('Fatal error') || 
                      responseText.includes('Error') || 
                      responseText.includes('Warning');
      
      if (hasError && response.status >= 400) {
        console.warn('[ReviveMaintenance] Maintenance may have errors:', responseText.substring(0, 500));
        return res.status(500).json({
          success: false,
          message: 'Maintenance script returned errors',
          status: response.status,
          output: responseText.substring(0, 1000) // Limit output
        });
      }
      
      return res.json({
        success: true,
        message: 'Maintenance script executed successfully',
        status: response.status,
        timestamp: new Date().toISOString()
      });
    } catch (httpError) {
      // Nếu HTTP call fail, log error nhưng vẫn trả về success (vì có thể script đã chạy)
      console.error('[ReviveMaintenance] HTTP call error:', httpError.message);
      
      // Nếu là timeout, có thể script vẫn đang chạy
      if (httpError.code === 'ECONNABORTED') {
        return res.json({
          success: true,
          message: 'Maintenance script triggered (timeout - may still be running)',
          warning: 'Request timed out, but maintenance may have started'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to trigger maintenance script',
        error: httpError.message
      });
    }
  } catch (error) {
    console.error('[ReviveMaintenance] Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * Health check endpoint for maintenance service
 * GET /api/revive/maintenance/status
 */
router.get('/status', (req, res) => {
  const hasSecret = !!process.env.REVIVE_MAINTENANCE_SECRET;
  const reviveUrl = process.env.REVIVE_AD_SERVER_URL || 'https://smoker-revive.onrender.com/revive';
  
  return res.json({
    success: true,
    configured: hasSecret,
    reviveUrl: reviveUrl,
    maintenanceUrl: `${reviveUrl}/maintenance/maintenance.php`,
    message: hasSecret 
      ? 'Maintenance service is configured' 
      : 'REVIVE_MAINTENANCE_SECRET not configured'
  });
});

module.exports = router;

