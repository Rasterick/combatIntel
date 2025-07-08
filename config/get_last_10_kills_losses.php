<?php
header('Content-Type: application/json');

$entityId = $_GET['entityId'] ?? '';
$entityType = $_GET['entityType'] ?? '';

if (empty($entityId) || !is_numeric($entityId) || empty($entityType)) {
    echo json_encode(['error' => 'Invalid entity ID or type provided.']);
    exit();
}

$resolvedNames = [];

// Helper function to fetch full killmail details from ESI
function fetchFullKillmail($killmailId, $killmailHash) {
    $fullKillmailApiUrl = "https://esi.evetech.net/latest/killmails/{$killmailId}/{$killmailHash}/?datasource=tranquility";
    $ch = curl_init($fullKillmailApiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'accept: application/json',
        'Cache-Control: no-cache',
        'User-Agent: combatIntel (abonriff@gmail.com, https://gpi-services.co.uk/combatIntel/combatintel.html)'
    ]);
    $fullKillmailData = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($fullKillmailData !== FALSE && $httpCode === 200) {
        return json_decode($fullKillmailData, true);
    }
    return null;
}

// Helper function to resolve IDs to names
function resolveIds($idsToResolve, &$resolvedNames) {
    $idsToResolve = array_unique(array_filter($idsToResolve, function($id) {
        return !empty($id) && is_numeric($id) && $id > 0;
    }));

    if (empty($idsToResolve)) {
        return;
    }

    $idChunks = array_chunk($idsToResolve, 999);

    foreach ($idChunks as $chunk) {
        $namesEsiUrl = "https://esi.evetech.net/latest/universe/names/?datasource=tranquility";
        $namesPostData = json_encode(array_values($chunk));

        $ch = curl_init($namesEsiUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $namesPostData);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'accept: application/json',
            'Content-Type: application/json',
            'Cache-Control: no-cache',
            'User-Agent: combatIntel (abonriff@gmail.com, https://gpi-services.co.uk/combatIntel/combatintel.html)'
        ]);

        $namesResponse = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($namesResponse !== FALSE && $httpCode === 200) {
            $namesData = json_decode($namesResponse, true);
            foreach ($namesData as $item) {
                $resolvedNames[$item['id']] = $item['name'];
            }
        } else {
            error_log("Failed to resolve names for a chunk in get_last_10_kills_losses. HTTP Code: {$httpCode}. cURL Error: {$curlError}. ESI Response: {$namesResponse}");
        }
    }
}

// Step 1: Fetch recent killmail summaries for KILLS from zKillboard
$zkbKillsApiUrl = "https://zkillboard.com/api/{$entityType}ID/{$entityId}/kills/";

$ch = curl_init($zkbKillsApiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'accept: application/json',
    'Cache-Control: no-cache',
    'User-Agent: combatIntel (abonriff@gmail.com, https://gpi-services.co.uk/combatIntel/combatintel.html)'
]);
$zkbKillsData = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($zkbKillsData === FALSE || $httpCode !== 200) {
    error_log("Failed to fetch kill summaries from zKillboard for {$entityType} {$entityId} (kills). HTTP Code: " . $httpCode . ", Response: " . $zkbKillsData);
    $zkbKillsData = '[]'; // Return empty array to prevent JSON parsing errors
}

$killsSummaries = json_decode($zkbKillsData, true);

// Step 2: Fetch recent killmail summaries for LOSSES from zKillboard
$zkbLossesApiUrl = "https://zkillboard.com/api/{$entityType}ID/{$entityId}/losses/";

$ch = curl_init($zkbLossesApiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'accept: application/json',
    'Cache-Control: no-cache',
    'User-Agent: combatIntel (abonriff@gmail.com, https://gpi-services.co.uk/combatIntel/combatintel.html)'
]);
$zkbLossesData = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($zkbLossesData === FALSE || $httpCode !== 200) {
    error_log("Failed to fetch kill summaries from zKillboard for {$entityType} {$entityId} (losses). HTTP Code: " . $httpCode . ", Response: " . $zkbLossesData);
    $zkbLossesData = '[]'; // Return empty array to prevent JSON parsing errors
}

$lossesSummaries = json_decode($zkbLossesData, true);

$kills = [];
$losses = [];

// Process Kills Summaries
if (is_array($killsSummaries)) {
    foreach ($killsSummaries as $summary) {
        $killmailId = $summary['killmail_id'] ?? null;
        $killmailHash = $summary['zkb']['hash'] ?? null;

        if ($killmailId && $killmailHash) {
            $fullKillmail = fetchFullKillmail($killmailId, $killmailHash);
            if ($fullKillmail) {
                $kills[] = $fullKillmail;
            }
        }
    }
}

// Process Losses Summaries
if (is_array($lossesSummaries)) {
    foreach ($lossesSummaries as $summary) {
        $killmailId = $summary['killmail_id'] ?? null;
        $killmailHash = $summary['zkb']['hash'] ?? null;

        if ($killmailId && $killmailHash) {
            $fullKillmail = fetchFullKillmail($killmailId, $killmailHash);
            if ($fullKillmail) {
                $losses[] = $fullKillmail;
            }
        }
    }
}

// Sort by time and get the latest 10 of each
usort($kills, function($a, $b) { return strtotime($b['killmail_time']) - strtotime($a['killmail_time']); });
usort($losses, function($a, $b) { return strtotime($b['killmail_time']) - strtotime($a['killmail_time']); });

$latest10Kills = array_slice($kills, 0, 10);
$latest10Losses = array_slice($losses, 0, 10);

// Collect all unique IDs from the latest 10 kills and losses for resolution
$idsToResolve = [];

foreach (array_merge($latest10Kills, $latest10Losses) as $killmail) {
    if (isset($killmail['victim']['character_id'])) $idsToResolve[] = $killmail['victim']['character_id'];
    if (isset($killmail['victim']['corporation_id'])) $idsToResolve[] = $killmail['victim']['corporation_id'];
    if (isset($killmail['victim']['alliance_id'])) $idsToResolve[] = $killmail['victim']['alliance_id'];
    if (isset($killmail['victim']['ship_type_id'])) $idsToResolve[] = $killmail['victim']['ship_type_id'];
    if (isset($killmail['solar_system_id'])) $idsToResolve[] = $killmail['solar_system_id'];

    foreach (($killmail['attackers'] ?? []) as $attacker) {
        if (isset($attacker['character_id'])) $idsToResolve[] = $attacker['character_id'];
        if (isset($attacker['corporation_id'])) $idsToResolve[] = $attacker['corporation_id'];
        if (isset($attacker['alliance_id'])) $idsToResolve[] = $attacker['alliance_id'];
        if (isset($attacker['ship_type_id'])) $idsToResolve[] = $attacker['ship_type_id'];
    }
}

// Resolve all collected IDs
resolveIds($idsToResolve, $resolvedNames);

// Prepare the final response
$responseData = [
    'kills' => $latest10Kills,
    'losses' => $latest10Losses,
    'resolvedNames' => $resolvedNames
];

echo json_encode($responseData);

?>