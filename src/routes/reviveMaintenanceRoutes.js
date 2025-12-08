const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Test endpoint - không cần secret (chỉ để verify route hoạt động)
 * GET /api/revive/maintenance/test
 */
router.get('/test', (req, res) => {
  return res.json({
    success: true,
    message: 'Revive maintenance route is working!',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  });
});

/**
 * Trigger maintenance via GET (easier for cron jobs)
 * GET /api/revive/maintenance/run?secret={secret}
 * 
 * Đặt GET route trước POST để đảm bảo match đúng
 */
router.get('/run', async (req, res) => {
  try {
    // Lấy secret từ query param hoặc header
    const secret = req.query.secret || 
                   req.headers['x-maintenance-secret'] || 
                   req.headers['X-Maintenance-Secret'] ||
                   req.headers['X-MAINTENANCE-SECRET'];
    const expectedSecret = process.env.REVIVE_MAINTENANCE_SECRET;
    
    console.log('[ReviveMaintenance] GET request received:', {
      hasQuerySecret: !!req.query.secret,
      hasHeader: !!(req.headers['x-maintenance-secret'] || req.headers['X-Maintenance-Secret'] || req.headers['X-MAINTENANCE-SECRET']),
      secretLength: secret ? secret.length : 0,
      expectedSecretLength: expectedSecret ? expectedSecret.length : 0,
      url: req.url
    });
    
    if (!expectedSecret) {
      console.warn('[ReviveMaintenance] REVIVE_MAINTENANCE_SECRET not configured');
      return res.status(500).json({
        success: false,
        message: 'Maintenance secret not configured on server'
      });
    }
    
    if (!secret) {
      console.warn('[ReviveMaintenance] No secret provided in GET request');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Missing secret key.',
        hint: 'Add ?secret=your-secret-key to URL or use x-maintenance-secret header'
      });
    }
    
    if (secret !== expectedSecret) {
      console.warn('[ReviveMaintenance] Unauthorized GET request - secret mismatch');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Invalid secret key.',
        hint: 'Check that the secret matches REVIVE_MAINTENANCE_SECRET environment variable'
      });
    }

    console.log('[ReviveMaintenance] ✅ GET request validated, triggering maintenance...');
    
    // Gọi maintenance script
    const reviveUrl = process.env.REVIVE_AD_SERVER_URL || 'https://smoker-revive.onrender.com/revive';
    const maintenanceUrl = `${reviveUrl}/maintenance/maintenance.php`;
    
    try {
      const response = await axios.get(maintenanceUrl, {
        timeout: 180000, // 3 phút timeout
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
          output: responseText.substring(0, 1000)
        });
      }
      
      return res.json({
        success: true,
        message: 'Maintenance script executed successfully',
        status: response.status,
        timestamp: new Date().toISOString()
      });
    } catch (httpError) {
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
 * Trigger Revive maintenance script
 * POST /api/revive/maintenance/run
 * 
 * Security: Requires secret key in header or body
 * Headers: x-maintenance-secret: {secret}
 * Body: { secret: {secret} }
 */
router.post('/run', async (req, res) => {
  try {
    // Kiểm tra secret key từ nhiều nguồn (hỗ trợ cả lowercase/uppercase headers)
    const secret = req.headers['x-maintenance-secret'] || 
                   req.headers['X-Maintenance-Secret'] ||
                   req.headers['X-MAINTENANCE-SECRET'] ||
                   req.body?.secret ||
                   req.query?.secret; // Hỗ trợ cả query param (cho GET request)
    
    const expectedSecret = process.env.REVIVE_MAINTENANCE_SECRET;
    
    // Log để debug (không log giá trị secret thực tế)
    console.log('[ReviveMaintenance] Request received:', {
      hasHeader: !!(req.headers['x-maintenance-secret'] || req.headers['X-Maintenance-Secret'] || req.headers['X-MAINTENANCE-SECRET']),
      hasBodySecret: !!req.body?.secret,
      hasQuerySecret: !!req.query?.secret,
      secretLength: secret ? secret.length : 0,
      expectedSecretLength: expectedSecret ? expectedSecret.length : 0,
      headers: Object.keys(req.headers).filter(h => h.toLowerCase().includes('maintenance'))
    });
    
    if (!expectedSecret) {
      console.warn('[ReviveMaintenance] REVIVE_MAINTENANCE_SECRET not configured');
      return res.status(500).json({
        success: false,
        message: 'Maintenance secret not configured on server'
      });
    }
    
    if (!secret) {
      console.warn('[ReviveMaintenance] No secret provided in request');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Missing secret key.',
        hint: 'Provide secret via header "x-maintenance-secret" or body "secret" field'
      });
    }
    
    if (secret !== expectedSecret) {
      console.warn('[ReviveMaintenance] Unauthorized access attempt - secret mismatch');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Invalid secret key.',
        hint: 'Check that the secret matches REVIVE_MAINTENANCE_SECRET environment variable'
      });
    }

    console.log('[ReviveMaintenance] ✅ Secret validated, triggering maintenance script...');
    
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
 * Trigger maintenance via GET (easier for cron jobs)
 * GET /api/revive/maintenance/run?secret={secret}
 */
router.get('/run', async (req, res) => {
  try {
    // Lấy secret từ query param hoặc header
    const secret = req.query.secret || 
                   req.headers['x-maintenance-secret'] || 
                   req.headers['X-Maintenance-Secret'] ||
                   req.headers['X-MAINTENANCE-SECRET'];
    const expectedSecret = process.env.REVIVE_MAINTENANCE_SECRET;
    
    console.log('[ReviveMaintenance] GET request received:', {
      hasQuerySecret: !!req.query.secret,
      hasHeader: !!(req.headers['x-maintenance-secret'] || req.headers['X-Maintenance-Secret'] || req.headers['X-MAINTENANCE-SECRET']),
      secretLength: secret ? secret.length : 0,
      expectedSecretLength: expectedSecret ? expectedSecret.length : 0
    });
    
    if (!expectedSecret) {
      console.warn('[ReviveMaintenance] REVIVE_MAINTENANCE_SECRET not configured');
      return res.status(500).json({
        success: false,
        message: 'Maintenance secret not configured on server'
      });
    }
    
    if (!secret) {
      console.warn('[ReviveMaintenance] No secret provided in GET request');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Missing secret key.',
        hint: 'Add ?secret=your-secret-key to URL or use x-maintenance-secret header'
      });
    }
    
    if (secret !== expectedSecret) {
      console.warn('[ReviveMaintenance] Unauthorized GET request - secret mismatch');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Invalid secret key.',
        hint: 'Check that the secret matches REVIVE_MAINTENANCE_SECRET environment variable'
      });
    }

    console.log('[ReviveMaintenance] ✅ GET request validated, triggering maintenance...');
    
    // Gọi maintenance script
    const reviveUrl = process.env.REVIVE_AD_SERVER_URL || 'https://smoker-revive.onrender.com/revive';
    const maintenanceUrl = `${reviveUrl}/maintenance/maintenance.php`;
    
    try {
      const response = await axios.get(maintenanceUrl, {
        timeout: 180000, // 3 phút timeout
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
          output: responseText.substring(0, 1000)
        });
      }
      
      return res.json({
        success: true,
        message: 'Maintenance script executed successfully',
        status: response.status,
        timestamp: new Date().toISOString()
      });
    } catch (httpError) {
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

