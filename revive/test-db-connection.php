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

echo "<h2>Connection Details:</h2>";
echo "<pre>";
echo "Host: $host\n";
echo "Port: $port\n";
echo "Username: $username\n";
echo "Database: $database\n";
echo "</pre>";

echo "<h2>Test 1: mysqli_connect() without SSL</h2>";
$link1 = @mysqli_connect($host, $username, $password, $database, $port);
if ($link1) {
    echo "✅ Connection successful without SSL!<br>";
    mysqli_close($link1);
} else {
    echo "❌ Connection failed: " . mysqli_connect_error() . "<br>";
}

echo "<h2>Test 2: mysqli with SSL (như Revive sử dụng)</h2>";
$init = mysqli_init();
mysqli_ssl_set($init, null, null, null, null, null);

if ($link2 = @mysqli_real_connect($init, $host, $username, $password, $database, $port)) {
    echo "✅ Connection successful with SSL!<br>";
    
    // Test query
    $result = mysqli_query($link2, "SELECT COUNT(*) as count FROM rv_accounts");
    if ($result) {
        $row = mysqli_fetch_assoc($result);
        echo "✅ Query successful! Found {$row['count']} accounts in database.<br>";
    } else {
        echo "⚠️ Connection OK but query failed: " . mysqli_error($link2) . "<br>";
    }
    
    mysqli_close($link2);
} else {
    echo "❌ Connection failed: " . mysqli_connect_error() . "<br>";
    echo "Error code: " . mysqli_connect_errno() . "<br>";
}

echo "<h2>Test 3: PDO with SSL</h2>";
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

echo "<h2>PHP Info (MySQLi SSL support)</h2>";
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

echo "<h2>Done!</h2>";
?>

