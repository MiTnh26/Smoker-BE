<?php
/**
 * Test script để kiểm tra kết nối Azure MySQL
 * Chạy: php test-db-connection.php
 */

$host = 'smoker1.mysql.database.azure.com';
$port = 3306;
$username = 'minhdbd4';
$password = 'Minhtran26@';
$database = 'smoker';
$ssl_ca = __DIR__ . '/revive/certs/azure-mysql-ssl-cert.pem';

echo "🔍 Testing Azure MySQL connection...\n";
echo "Host: $host\n";
echo "User: $username\n";
echo "Database: $database\n";
echo "SSL Certificate: $ssl_ca\n\n";

// Kiểm tra certificate file
if (!file_exists($ssl_ca)) {
    echo "⚠️  SSL certificate not found. Downloading...\n";
    $certUrl = 'https://cacerts.digicert.com/DigiCertGlobalRootCA.crt.pem';
    $certDir = dirname($ssl_ca);

    if (!is_dir($certDir)) {
        mkdir($certDir, 0755, true);
    }

    $certContent = file_get_contents($certUrl);
    if ($certContent !== false) {
        file_put_contents($ssl_ca, $certContent);
        echo "✅ Certificate downloaded successfully\n";
    } else {
        echo "❌ Failed to download certificate\n";
        exit(1);
    }
}

$init = mysqli_init();
mysqli_ssl_set($init, null, null, $ssl_ca, null, null);

echo "Connecting to database...\n";

if ($link = mysqli_real_connect($init, $host, $username, $password, $database, $port)) {
    echo "✅ Connection successful!\n\n";

    // Test query
    echo "📊 Testing database queries...\n";

    // Show tables
    $result = mysqli_query($link, "SHOW TABLES");
    if ($result) {
        echo "✅ SHOW TABLES successful\n";
        $tables = mysqli_fetch_all($result, MYSQLI_NUM);
        echo "   Found " . count($tables) . " tables\n";
        mysqli_free_result($result);
    } else {
        echo "❌ SHOW TABLES failed: " . mysqli_error($link) . "\n";
    }

    // Count banners
    $result = mysqli_query($link, "SELECT COUNT(*) as count FROM rv_banners");
    if ($result) {
        $row = mysqli_fetch_assoc($result);
        echo "✅ Banner count: " . $row['count'] . "\n";
        mysqli_free_result($result);
    } else {
        echo "❌ Banner count query failed: " . mysqli_error($link) . "\n";
    }

    mysqli_close($link);
    echo "\n🎉 All tests passed! Database connection is working.\n";
} else {
    echo "❌ Connection failed: " . mysqli_connect_error() . "\n";

    // Troubleshooting tips
    echo "\n💡 Troubleshooting:\n";
    echo "1. Check Azure MySQL Firewall rules\n";
    echo "2. Verify credentials (username/password)\n";
    echo "3. Ensure database 'Mysql-Revive-New' exists\n";
    echo "4. Check if user has permissions on the database\n";
    echo "5. Verify SSL certificate is valid\n";
}
?>