<?php
// Revive Adserver database configuration

$GLOBALS['_MAX']['CONF']['database'] = [
    'type' => 'mysqli',
    'host' => 'smoker1.mysql.database.azure.com',        // ví dụ: mysql.render.com
    'username' => 'minhdbd4',
    'password' => 'Minhtran26@',
    'name' => 'smoker',
    'port' => '3306',
    'persistent' => false,

    // 🔴 QUAN TRỌNG: tắt SSL
    'ssl' => false,
    'mysql_ssl' => false,
];
