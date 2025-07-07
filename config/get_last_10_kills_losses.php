<?php
header('Content-Type: application/json');

$characterId = $_GET['characterId'] ?? '';

if (empty($characterId) || !is_numeric($characterId)) {
    echo json_encode(['error' => 'Invalid character ID provided.']);
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
        'Cache-Control: no-cache'
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
            'Cache-Control: no-cache'
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

// Step 1: Fetch recent killmail summaries from zKillboard
$zkbSummariesApiUrl = "https://zkillboard.com/api/characterID/{$characterId}/kills/losses/"; // Fetch both kills and losses

$ch = curl_init($zkbSummariesApiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'accept: application/json',
    'Cache-Control: no-cache'
]);
$zkbSummariesData = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($zkbSummariesData === FALSE || $httpCode !== 200) {
    error_log("Failed to fetch kill summaries from zKillboard for character {$characterId}. HTTP Code: " . $httpCode . ", Response: " . $zkbSummariesData);
    echo json_encode(['error' => 'Could not fetch kill summaries from zKillboard.']);
    exit();
}

$summaries = json_decode($zkbSummariesData, true);

$kills = [];
$losses = [];
$allKillmailIds = [];

if (is_array($summaries)) {
    foreach ($summaries as $summary) {
        $killmailId = $summary['killmail_id'] ?? null;
        $killmailHash = $summary['zkb']['hash'] ?? null;

        if ($killmailId && $killmailHash) {
            $allKillmailIds[] = ['id' => $killmailId, 'hash' => $killmailHash];
        }
    }
}

// Fetch full killmails for all summaries to determine if it's a kill or loss
$fullKillmails = [];
foreach ($allKillmailIds as $km) {
    $fullKillmail = fetchFullKillmail($km['id'], $km['hash']);
    if ($fullKillmail) {
        $fullKillmails[] = $fullKillmail;
    }
}

// Separate into kills and losses for the specific character
foreach ($fullKillmails as $killmail) {
    $isVictim = ($killmail['victim']['character_id'] ?? null) == $characterId;

    if ($isVictim) {
        $losses[] = $killmail;
    } else {
        // Check if the character is among the attackers
        $isAttacker = false;
        foreach (($killmail['attackers'] ?? []) as $attacker) {
            if (($attacker['character_id'] ?? null) == $characterId) {
                $isAttacker = true;
                break;
            }
        }
        if ($isAttacker) {
            $kills[] = $killmail;
        }
    }
}

// Sort by time and get the latest 10
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