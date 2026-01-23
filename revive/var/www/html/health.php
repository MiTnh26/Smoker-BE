<?php
// health.php - simple health check for Revive Adserver

http_response_code(200);
header('Content-Type: application/json');

echo json_encode([
    'status' => 'ok',
    'service' => 'revive-adserver',
    'timestamp' => date('c')
]);
exit;
