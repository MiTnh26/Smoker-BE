<?php
/**
 * Script để test database connection đến Azure MySQL
 * Đặt file này trong /var/www/html/revive/test-db-connection.php
 * Truy cập: https://smoker-revive.onrender.com/revive/test-db-connection.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "<h1>Azure MySQL Connection Test</h1>";

$host = 'mysql-smoker.mysql.database.azure.com';
$port = 3306;
$username = 'smoker';
$password = 'Minhtran26';
$database = 'revive_adserver';
$certPath = '/var/www/html/revive/certs/azure-mysql-ca-cert.pem';

echo "<h2>Connection Details:</h2>";
echo "<pre>";
echo "Host: $host\n";
echo "Port: $port\n";
echo "Username: $username\n";
echo "Database: $database\n";
echo "Certificate Path: $certPath\n";
echo "</pre>";

// Check certificate file
echo "<h2>📋 Certificate File Check:</h2>";
if (file_exists($certPath)) {
    $certSize = filesize($certPath);
    echo "✅ Certificate file EXISTS: $certPath<br>";
    echo "📦 File size: " . number_format($certSize) . " bytes<br>";
    
    // Show first few lines of certificate
    $certContent = file_get_contents($certPath);
    if (strpos($certContent, 'BEGIN CERTIFICATE') !== false) {
        echo "✅ Certificate format looks valid<br>";
    } else {
        echo "⚠️ Certificate format may be invalid<br>";
    }
} else {
    echo "❌ Certificate file NOT FOUND: $certPath<br>";
    echo "⚠️ This is a problem! Certificate was not downloaded during build.<br>";
}

echo "<hr>";

// Test 1: Without SSL (will fail - expected)
echo "<h2>Test 1: mysqli_connect() without SSL</h2>";
try {
    $link1 = @mysqli_connect($host, $username, $password, $database, $port);
    if ($link1) {
        echo "✅ Connection successful without SSL!<br>";
        mysqli_close($link1);
    } else {
        echo "❌ Connection failed: " . mysqli_connect_error() . "<br>";
    }
} catch (Exception $e) {
    echo "❌ Expected failure (Azure requires SSL): " . $e->getMessage() . "<br>";
}
echo "<small>💡 This is expected to fail - Azure MySQL requires SSL</small><br>";

echo "<hr>";

// Test 2: With SSL but no certificate file
echo "<h2>Test 2: mysqli with SSL (no certificate file)</h2>";
try {
    $init = mysqli_init();
    mysqli_ssl_set($init, null, null, null, null, null);
    
    if ($link2 = @mysqli_real_connect($init, $host, $username, $password, $database, $port)) {
        echo "✅ Connection successful with SSL (no cert file)!<br>";
        
        $result = mysqli_query($link2, "SELECT COUNT(*) as count FROM rv_accounts");
        if ($result) {
            $row = mysqli_fetch_assoc($result);
            echo "✅ Query successful! Found {$row['count']} accounts in database.<br>";
        }
        
        mysqli_close($link2);
    } else {
        echo "❌ Connection failed: " . mysqli_connect_error() . "<br>";
        echo "Error code: " . mysqli_connect_errno() . "<br>";
    }
} catch (Exception $e) {
    echo "❌ Connection failed: " . $e->getMessage() . "<br>";
}

echo "<hr>";

// Test 3: With SSL certificate file (như Revive sử dụng)
echo "<h2>Test 3: mysqli with SSL Certificate File (như Revive sử dụng)</h2>";
if (file_exists($certPath)) {
    try {
        $init3 = mysqli_init();
        mysqli_ssl_set($init3, null, null, $certPath, null, null);
        
        if ($link3 = @mysqli_real_connect($init3, $host, $username, $password, $database, $port)) {
            echo "✅ Connection successful with certificate file!<br>";
            
            // Test query
            $result = mysqli_query($link3, "SELECT COUNT(*) as count FROM rv_accounts");
            if ($result) {
                $row = mysqli_fetch_assoc($result);
                echo "✅ Query successful! Found {$row['count']} accounts in database.<br>";
            } else {
                echo "⚠️ Connection OK but query failed: " . mysqli_error($link3) . "<br>";
            }
            
            mysqli_close($link3);
        } else {
            echo "❌ Connection failed: " . mysqli_connect_error() . "<br>";
            echo "Error code: " . mysqli_connect_errno() . "<br>";
        }
    } catch (Exception $e) {
        echo "❌ Connection failed: " . $e->getMessage() . "<br>";
    }
} else {
    echo "⏭️ Skipped - Certificate file not found<br>";
}

echo "<hr>";

// Test 3.5: mysqli with SSL but NO certificate (like Revive will use)
echo "<h2>Test 3.5: mysqli with SSL but NO certificate file (Revive config with ca=)</h2>";
try {
    $init35 = mysqli_init();
    // Enable SSL but don't verify certificate (all null)
    mysqli_ssl_set($init35, null, null, null, null, null);
    
    if ($link35 = @mysqli_real_connect($init35, $host, $username, $password, $database, $port)) {
        echo "✅ Connection successful with SSL (no cert verification)!<br>";
        
        // Test query
        $result = mysqli_query($link35, "SELECT COUNT(*) as count FROM rv_accounts");
        if ($result) {
            $row = mysqli_fetch_assoc($result);
            echo "✅ Query successful! Found {$row['count']} accounts in database.<br>";
        }
        
        mysqli_close($link35);
    } else {
        echo "❌ Connection failed: " . mysqli_connect_error() . "<br>";
        echo "Error code: " . mysqli_connect_errno() . "<br>";
    }
} catch (Exception $e) {
    echo "❌ Connection failed: " . $e->getMessage() . "<br>";
} 

echo "<hr>";



// Test 4: PDO with SSL
echo "<h2>Test 4: PDO with SSL</h2>";
try {
    $options = [
        PDO::MYSQL_ATTR_SSL_CA => null,
        PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => false,
    ];
    $pdo = new PDO(
        "mysql:host=$host;port=$port;dbname=$database;charset=utf8mb4",
        $username,
        $password,
        $options
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "✅ PDO connection successful!<br>";
    
    $stmt = $pdo->query("SELECT COUNT(*) as count FROM rv_accounts");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    echo "✅ Query successful! Found {$row['count']} accounts in database.<br>";
} catch (PDOException $e) {
    echo "❌ PDO Connection failed: " . $e->getMessage() . "<br>";
}

echo "<hr>";

// PHP Info
echo "<h2>📊 PHP Info (MySQLi SSL support)</h2>";
if (function_exists('mysqli_ssl_set')) {
    echo "✅ mysqli_ssl_set() function exists<br>";
} else {
    echo "❌ mysqli_ssl_set() function NOT found<br>";
}

if (extension_loaded('mysqli')) {
    echo "✅ mysqli extension loaded<br>";
    echo "Version: " . mysqli_get_client_info() . "<br>";
} else {
    echo "❌ mysqli extension NOT loaded<br>";
}

echo "<hr>";
echo "<h2>✅ Done!</h2>";
echo "<p><strong>Kết luận:</strong></p>";
echo "<ul>";
echo "<li>Nếu <strong>Test 3</strong> thành công → Revive config đúng, vấn đề có thể là ở Revive code</li>";
echo "<li>Nếu <strong>Test 3</strong> failed → Certificate path hoặc file có vấn đề</li>";
echo "<li>Nếu <strong>Certificate file NOT FOUND</strong> → Certificate chưa được download trong Dockerfile</li>";
echo "</ul>";
?>