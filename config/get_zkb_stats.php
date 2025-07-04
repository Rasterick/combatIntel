<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');

echo json_encode(['status' => 'success', 'message' => 'Simplified script is working!']);

?>