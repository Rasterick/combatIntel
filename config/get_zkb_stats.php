<?php
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
$latestKillData = @file_get_contents($latestKillApiUrl);

$latestKill = null;
$latestKillHash = null; // Initialize $latestKillHash here
if ($latestKillData !== FALSE) {
    $latestKillSummaries = json_decode($latestKillData, true);
    if (is_array($latestKillSummaries) && !empty($latestKillSummaries)) {
        $latestKillId = $latestKillSummaries[0]['killmail_id'] ?? null;
        $latestKillHash = $latestKillSummaries[0]['zkb']['hash'] ?? null;

        if ($latestKillId && $latestKillHash) {
            $fullKillmailApiUrl = "https://esi.evetech.net/latest/killmails/{$latestKillId}/{$latestKillHash}/?datasource=tranquility";

            $ch = curl_init($fullKillmailApiUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'accept: application/json',
                'Cache-Control: no-cache'
            ]);
            $fullKillmailData = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($fullKillmailData !== FALSE && $httpCode === 200) {
                $fullKillmailArray = json_decode($fullKillmailData, true);
                if (is_array($fullKillmailArray) && !empty($fullKillmailArray)) {
                    $latestKill = $fullKillmailArray;
                }
            }
        }

// Prepare the response data
$responseData = [
    'zkbStats' => $zkbStats,
    'latestKill' => $latestKill,
    'resolvedNames' => [] // This will be populated in the next step
];

// Collect all unique IDs for resolution
$idsToResolve = [];

// Add entityId itself
if ($entityId) {
    $idsToResolve[] = $entityId;
}

// IDs from zkbStats
if (isset($zkbStats['info'])) {
    if (isset($zkbStats['info']['race_id'])) $idsToResolve[] = $zkbStats['info']['race_id'];
    if (isset($zkbStats['info']['corporation_id'])) $idsToResolve[] = $zkbStats['info']['corporation_id'];
    if (isset($zkbStats['info']['alliance_id'])) $idsToResolve[] = $zkbStats['info']['alliance_id'];
}

if (isset($zkbStats['topAllTime'])) {
    foreach ($zkbStats['topAllTime'] as $category) {
        foreach ($category['data'] as $item) {
            if (isset($item['corporationID'])) $idsToResolve[] = $item['corporationID'];
            if (isset($item['allianceID'])) $idsToResolve[] = $item['allianceID'];
            if (isset($item['shipTypeID'])) $idsToResolve[] = $item['shipTypeID'];
            if (isset($item['solarSystemID'])) $idsToResolve[] = $item['solarSystemID'];
        }
    }
}

// IDs from latestKill
if ($latestKill) {
    if (isset($latestKill['victim']['character_id'])) $idsToResolve[] = $latestKill['victim']['character_id'];
    if (isset($latestKill['victim']['corporation_id'])) $idsToResolve[] = $latestKill['victim']['corporation_id'];
    if (isset($latestKill['victim']['alliance_id'])) $idsToResolve[] = $latestKill['victim']['alliance_id'];
    if (isset($latestKill['victim']['ship_type_id'])) $idsToResolve[] = $latestKill['victim']['ship_type_id'];
    if (isset($latestKill['solar_system_id'])) $idsToResolve[] = $latestKill['solar_system_id'];

    if (isset($latestKill['attackers'])) {
        foreach ($latestKill['attackers'] as $attacker) {
            if (isset($attacker['character_id'])) $idsToResolve[] = $attacker['character_id'];
            if (isset($attacker['corporation_id'])) $idsToResolve[] = $attacker['corporation_id'];
            if (isset($attacker['alliance_id'])) $idsToResolve[] = $attacker['alliance_id'];
            if (isset($attacker['ship_type_id'])) $idsToResolve[] = $attacker['ship_type_id'];
        }
    }
}

$idsToResolve = array_unique(array_filter($idsToResolve)); // Remove duplicates and nulls

$resolvedNames = [];
if (!empty($idsToResolve)) {
    $namesEsiUrl = "https://esi.evetech.net/latest/universe/names/?datasource=tranquility";
    $namesPostData = json_encode(array_values($idsToResolve)); // Ensure array is 0-indexed

    $ch = curl_init($namesEsiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $namesPostData);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'accept: application/json',
        'Content-Type: application/json',
        'Cache-Control: no-cache'
    ]);

    $namesResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($namesResponse !== FALSE && $httpCode === 200) {
        $namesData = json_decode($namesResponse, true);
        foreach ($namesData as $item) {
            $resolvedNames[$item['id']] = $item['name'];
        }
    }
}

$responseData['resolvedNames'] = $resolvedNames;
echo json_encode($responseData);

?>