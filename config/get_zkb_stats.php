<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
header('Content-Type: application/json');

$entityName = $_GET['name'] ?? '';

if (empty($entityName)) {
    echo json_encode(['error' => 'No entity name provided.']);
    exit();
}

// Step 1: Use EVE ESI API to resolve entityName to entityID and entityType
$esiUrl = "https://esi.evetech.net/latest/universe/ids/?datasource=tranquility&language=en";
$postData = json_encode([$entityName]);

$ch = curl_init($esiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'accept: application/json',
    'Accept-Language: en',
    'Content-Type: application/json',
    'Cache-Control: no-cache'
]);

$esiResponse = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($esiResponse === FALSE || $httpCode !== 200) {
    echo json_encode(['error' => 'Could not resolve entity name via ESI.', 'http_code' => $httpCode]);
    exit();
}

$esiData = json_decode($esiResponse, true);

$entityId = null;
$entityType = null;

// Prioritize character, then corporation, then alliance
if (!empty($esiData['characters'])) {
    $entityId = $esiData['characters'][0]['id'];
    $entityType = 'character';
} else if (!empty($esiData['corporations'])) {
    $entityId = $esiData['corporations'][0]['id'];
    $entityType = 'corporation';
} else if (!empty($esiData['alliances'])) {
    $entityId = $esiData['alliances'][0]['id'];
    $entityType = 'alliance';
}

if (empty($entityId)) {
    echo json_encode(['error' => 'Entity ID not found for the given name.']);
    exit();
}

// Step 2: Fetch zKillboard stats using the resolved entityID and entityType
$zkbApiUrl = "https://zkillboard.com/api/stats/{$entityType}ID/{$entityId}/";

$zkbData = @file_get_contents($zkbApiUrl);

if ($zkbData === FALSE) {
    echo json_encode(['error' => 'Could not fetch data from zKillboard.']);
    exit();
}

$zkbStats = json_decode($zkbData, true);

// Step 3: Fetch latest killmail for the entity
$latestKillApiUrl = "https://zkillboard.com/api/kills/{$entityType}ID/{$entityId}/";

$ch = curl_init($latestKillApiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'accept: application/json',
    'Cache-Control: no-cache'
]);
$latestKillData = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($latestKillData === FALSE || $httpCode !== 200) {
    // Log error if fetch fails
    error_log("Failed to fetch latest kill summaries from zKillboard. HTTP Code: " . $httpCode . ", Response: " . $latestKillData);
    $latestKillData = '[]'; // Return empty array to prevent JSON parsing errors
}

$latestKill = null;
$latestKillHash = null; // Initialize $latestKillHash here
$latestKillSummaries = json_decode($latestKillData, true);
if (is_array($latestKillSummaries) && !empty($latestKillSummaries)) {
        $latestKillId = $latestKillSummaries[0]['killmail_id'] ?? null;
        $latestKillHash = $latestKillSummaries[0]['zkb']['hash'] ?? null;

        if ($latestKillId && $latestKillHash) {
            $fullKillmailApiUrl = "https://esi.evetech.net/latest/killmails/{$latestKillId}/{$latestKillHash}/?datasource=tranquility";

            error_log("Fetching full killmail from ESI: " . $fullKillmailApiUrl);
            $ch = curl_init($fullKillmailApiUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'accept: application/json',
                'Cache-Control: no-cache'
            ]);
            $fullKillmailData = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            error_log("Full killmail ESI response HTTP Code: " . $httpCode);
            error_log("Full killmail ESI raw data: " . ($fullKillmailData !== FALSE ? $fullKillmailData : "Failed to fetch"));

            if ($fullKillmailData !== FALSE && $httpCode === 200) {
                $fullKillmailArray = json_decode($fullKillmailData, true);
                if (is_array($fullKillmailArray) && !empty($fullKillmailArray)) {
                    $latestKill = $fullKillmailArray;
                }
            }
        }
    }
}

// Prepare the response data

// Prepare the response data