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
    'Cache-Control: no-cache',
    'User-Agent: combatIntel (abonriff@gmail.com, https://gpi-services.co.uk/combatIntel/combatintel.html)'
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
    $entityType = 'characterID';
} else if (!empty($esiData['corporations'])) {
    $entityId = $esiData['corporations'][0]['id'];
    $entityType = 'corporationID';
} else if (!empty($esiData['alliances'])) {
    $entityId = $esiData['alliances'][0]['id'];
    $entityType = 'allianceID';
}

if (empty($entityId)) {
    echo json_encode(['error' => 'Entity ID not found for the given name.']);
    exit();
}

// Step 2: Fetch zKillboard stats using the resolved entityID and entityType
$zkbApiUrl = "https://zkillboard.com/api/stats/{$entityType}/{$entityId}/";

$zkbData = @file_get_contents($zkbApiUrl);

if ($zkbData === FALSE) {
    echo json_encode(['error' => 'Could not fetch data from zKillboard.']);
    exit();
}

$zkbStats = json_decode($zkbData, true);

// Step 3: Fetch latest killmail for the entity
$latestKillApiUrl = "https://zkillboard.com/api/kills/{$entityType}/{$entityId}/";

$ch = curl_init($latestKillApiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'accept: application/json',
    'Cache-Control: no-cache',
    'User-Agent: combatIntel (abonriff@gmail.com, https://gpi-services.co.uk/combatIntel/combatintel.html)'
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
                $fullKillmailArray = json_decode($fullKillmailData, true);
                if (is_array($fullKillmailArray) && !empty($fullKillmailArray)) {
                    $latestKill = $fullKillmailArray;
                }
            }
        }
    }
// Closing brace for if (is_array($latestKillSummaries) && !empty($latestKillSummaries))

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
    // race_id is not resolvable via the /universe/names endpoint, so we skip it.
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

// Manual mapping for race IDs to names
$raceMap = [
    1 => 'Caldari',
    2 => 'Minmatar',
    4 => 'Amarr',
    8 => 'Gallente',
];

// Add the race name to the resolved names if it exists
if (isset($zkbStats['info']['race_id']) && isset($raceMap[$zkbStats['info']['race_id']])) {
    $resolvedNames[$zkbStats['info']['race_id']] = $raceMap[$zkbStats['info']['race_id']];
}

// Filter out any invalid IDs (null, 0, non-numeric) before sending to ESI
$idsToResolve = array_filter($idsToResolve, function($id) {
    return !empty($id) && is_numeric($id) && $id > 0;
});
$idsToResolve = array_unique($idsToResolve);
if (!empty($idsToResolve)) {
    // ESI has a limit of 1000 IDs per request, let's use 999 to be safe.
    $idChunks = array_chunk($idsToResolve, 999);

    foreach ($idChunks as $chunk) {
        $namesEsiUrl = "https://esi.evetech.net/latest/universe/names/?datasource=tranquility";
        $namesPostData = json_encode(array_values($chunk)); // Ensure array is 0-indexed

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
            // Log detailed error information
            error_log("Failed to resolve names for a chunk. HTTP Code: {$httpCode}. cURL Error: {$curlError}. ESI Response: {$namesResponse}");
            $responseData['error'] = "Failed to resolve some names. Check server logs for details.";
        }
    }
}

$responseData['resolvedNames'] = $resolvedNames;
echo json_encode($responseData);

?>