document.addEventListener('DOMContentLoaded', function () {
    const getIntelButton = document.querySelector('.intel-button');
    const intelInput = document.querySelector('.intel-input');

    getIntelButton.addEventListener('click', async () => {
        const entityName = intelInput.value.trim();
        if (!entityName) {
            alert('Please enter a name.');
            return;
        }

        // Clear the associations chart before fetching new data
        const associationsCanvas = document.getElementById('associationsChartCanvas');
        if (window.associationsChartCanvas instanceof Chart) {
            window.associationsChartCanvas.destroy();
        }

        try {
            // Step 1: Fetch stats from the PHP backend
            const zkbResponse = await fetch(`/combatIntel/config/get_zkb_stats.php?name=${encodeURIComponent(entityName)}`);
            const responseData = await zkbResponse.json();

            if (responseData.error) {
                alert(`Error: ${responseData.error}`);
                return;
            }

            const zkbStats = responseData.zkbStats;
            const latestKill = responseData.latestKill;
            const resolvedNames = responseData.resolvedNames;

            // The PHP script now resolves entityType and entityId
            const entityId = zkbStats.info.id;
            const entityType = zkbStats.info.type; // Assuming PHP returns 'character', 'corporation', or 'alliance'

            // Step 3: Populate the main info boxes immediately
            populateMainInfoBoxes(zkbStats, entityName, entityType, latestKill, resolvedNames);

            document.getElementById('last10KillsLossesHeader').textContent = `${name}: Last 10 Kills/Losses`;

        // Get references for Last 10 Kills/Losses section
        const last10KillsLossesBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(2)');
        const associationsBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1)');

        if (entityType !== 'character') {
            last10KillsLossesBox.style.display = 'none';
            associationsBox.style.display = 'none';
        } else {
            last10KillsLossesBox.style.display = 'flex'; // Assuming default display is flex
            associationsBox.style.display = 'flex'; // Assuming default display is flex
        }

        const last10KillsLossesContent = document.getElementById('last10KillsLossesContent');
        const toggleButton = document.querySelector('.toggle-kills-losses');

        // Asynchronously load and populate other sections
            loadLast10KillsLosses(entityId, resolvedNames, entityName, entityType, last10KillsLossesContent, toggleButton, document.getElementById('associationsChartCanvas'));
            loadTopStatsCharts(zkbStats, resolvedNames, entityType);

        } catch (error) {
            console.error('Error fetching intel:', error);
            alert('An error occurred while fetching intel.');
        }
    });

    // New function to populate main info boxes (character and combat activity)
    function populateMainInfoBoxes(data, name, type, latestKill, resolvedNames) {
        // Update headers
        document.querySelector('.info-column:nth-child(1) .info-box:nth-child(1) .info-box-header').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${name}`;
        document.querySelector('.info-column:nth-child(1) .info-box:nth-child(2) .info-box-header').textContent = `${name}: Combat (Last 10)`;
        document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-header').textContent = `${name}: Associations`;
        document.getElementById('last10KillsLossesHeader').textContent = `${name}: Last 10 Kills/Losses`;

        // --- Populate Character Box ---
        const charBox = document.querySelector('.info-column:nth-child(1) .info-box:nth-child(1) .info-box-content');

        // Basic info, varies by type
        let charHtml = '';
        if (type === 'character') {
            charHtml += `
                <p><span class="info-label">Birthday:</span> ${new Date(data.info.birthday).toLocaleDateString()}</p>
                <p><span class="info-label">Gender:</span> ${data.info.gender}</p>
                <p><span class="info-label">Race:</span> ${resolvedNames[data.info.race_id] || data.info.race_id}</p>
                <p><span class="info-label">Corporation:</span> ${resolvedNames[data.info.corporation_id] || data.info.corporation_id}</p>
                <p><span class="info-label">Alliance:</span> ${resolvedNames[data.info.alliance_id] || data.info.alliance_id}</p>
                <p><span class="info-label">Security Status:</span> ${data.info.security_status.toFixed(2)}</p>
            `;
        } else if (type === 'corporation') {
            charHtml += `
                <p><span class="info-label">Ticker:</span> ${data.info.ticker}</p>
                <p><span class="info-label">Member Count:</span> ${data.info.member_count}</p>
                <p><span class="info-label">Date Founded:</span> ${new Date(data.info.date_founded).toLocaleDateString()}</p>
                <p><span class="info-label">Alliance:</span> ${resolvedNames[data.info.alliance_id] || 'None'}</p>
            `;
        } else if (type === 'alliance') {
            charHtml += `
                <p><span class="info-label">Ticker:</span> ${data.info.ticker}</p>
                <p><span class="info-label">Date Founded:</span> ${new Date(data.info.date_founded).toLocaleDateString()}</p>
            `;
        }

        charHtml += `
            <hr>
            <p><span class="info-label">Total Kills:</span> ${data.allTimeSum}</p>
            <p><span class="info-label">Total Losses:</span> ${data.shipsLost}</p>
            <p><span class="info-label">ISK Destroyed:</span> ${data.iskDestroyed.toLocaleString()}</p>
            <p><span class="info-label">ISK Lost:</span> ${data.iskLost.toLocaleString()}</p>
            <p><span class="info-label">Solo Kills:</span> ${data.soloKills}</p>
            <hr>
        `;

        // Danger Ratio Logic
        const dangerRatio = data.dangerRatio;
        let dangerText = '';
        let dangerColorClass = '';
        if (dangerRatio < 50) {
            dangerText = 'Snuggly';
            dangerColorClass = 'text-green';
        } else if (dangerRatio >= 50 && dangerRatio < 75) {
            dangerText = 'Moderate';
            dangerColorClass = 'text-orange';
        } else {
            dangerText = 'Dangerous';
            dangerColorClass = 'text-red';
        }

        charHtml += `<p><span class="info-label">Danger Ratio:</span> <span class="${dangerColorClass}">${dangerRatio}% (${dangerText})</span></p>`

        charHtml += `
            <p><span class="info-label">Gang Ratio:</span> ${data.gangRatio}%</p>
            <p><span class="info-label">Solo Ratio:</span> ${data.soloRatio}%</p>
            <p><span class="info-label">Average Gang Size:</span> ${data.avgGangSize}</p>
        `;

        // Construct and add the Last Kill HTML
        let lastKillTime = 'Unknown Date';
        let location = 'Unknown System';
        let victimName = 'Unknown Victim';
        let victimCorp = 'Unknown Corp';
        let victim = `${victimName} (${victimCorp})`;
        let victimShip = 'Unknown Ship';
        let attackerCharacter = null;
        let attackerShip = 'Unknown Ship';
        let otherPilots = 0;
        let pilotText = 'pilots';
        let zkbLink = '';

        if (latestKill) {
            lastKillTime = latestKill.killmail_time ? new Date(latestKill.killmail_time).toLocaleString() : 'Unknown Date';
            location = (latestKill.solar_system_id && resolvedNames[latestKill.solar_system_id]) ? resolvedNames[latestKill.solar_system_id] : 'Unknown System';
            victimName = resolvedNames[latestKill.victim?.character_id] || latestKill.victim?.character_id || 'Unknown Victim';
            victimCorp = resolvedNames[latestKill.victim?.corporation_id] || latestKill.victim?.corporation_id || 'Unknown Corp';
            victim = `${victimName} (${victimCorp})`;
            victimShip = resolvedNames[latestKill.victim?.ship_type_id] || latestKill.victim?.ship_type_id || 'Unknown Ship';

            attackerCharacter = latestKill.attackers?.find(a => (resolvedNames[a.character_id] || a.character_id).toLowerCase() === name.toLowerCase());
            attackerShip = attackerCharacter ? (resolvedNames[attackerCharacter.ship_type_id] || attackerCharacter.ship_type_id) : 'Unknown Ship';
            otherPilots = (latestKill.attackers?.length || 1) - 1;
            pilotText = otherPilots === 1 ? 'pilot' : 'pilots';
            zkbLink = latestKill.killmail_id ? `<a href="https://zkillboard.com/kill/${latestKill.killmail_id}/" target="_blank">(ZKB)</a>` : '';
        }

        charHtml += `
            <p>
                <span class="info-label">Last Kill:</span> 
                <span>(${lastKillTime} in ${location}) - ${name} killed ${victim} in a ${victimShip} with ${otherPilots} other ${pilotText}.</span>
                ${zkbLink}
            </p>
        `;

        charBox.innerHTML = charHtml;

        // --- Populate Associations Box (Empty) ---
        const assocBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-content');

        // --- Populate Combat Box (Chart) ---
        const combatBox = document.querySelector('.info-column:nth-child(1) .info-box:nth-child(2) .info-box-content');
        const recentMonths = Object.values(data.months).slice(-10);

        // Prepare data for Chart.js
        const labels = recentMonths.map(m => `${m.year}-${m.month}`);
        const shipsDestroyed = recentMonths.map(m => m.shipsDestroyed);
        const shipsLost = recentMonths.map(m => m.shipsLost);

        const ctx = document.getElementById('combatActivityChart').getContext('2d');
        if (window.combatActivityChart instanceof Chart) {
            window.combatActivityChart.destroy();
        }
        window.combatActivityChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Ships Destroyed',
                        data: shipsDestroyed,
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Ships Lost',
                        data: shipsLost,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                indexAxis: 'y', // Horizontal bar chart
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true
                    }
                }
            }
        });

        // The chart will now render in the canvas element
    }

    // New asynchronous function to load and populate Last 10 Kills/Losses
    async function loadLast10KillsLosses(characterId, resolvedNames, characterName, characterType, last10KillsLossesContent, toggleButton, associationsCanvas) {
        try {
            if (last10KillsLossesContent) {
                last10KillsLossesContent.innerHTML = '<p>Please wait - retrieving kill and loss data...</p>';
            }

            const last10Response = await fetch(`/combatIntel/config/get_last_10_kills_losses.php?characterId=${characterId}`);
            const last10Data = await last10Response.json();

            if (last10Data.error) {
                console.error('Error fetching last 10 kills/losses:', last10Data.error);
                if (last10KillsLossesContent) {
                    last10KillsLossesContent.innerHTML = '<p>Error retrieving data.</p>';
                }
                return;
            }

            // Merge resolved names from last 10 kills/losses into main resolvedNames
            Object.assign(resolvedNames, last10Data.resolvedNames);

            let showingKills = true; // Initial state

            // If no kills but losses exist, show losses by default
            if (last10Data.kills.length === 0 && last10Data.losses.length > 0) {
                showingKills = false;
            }

            function renderList() {
                if (!last10KillsLossesContent) return; // Defensive check
                last10KillsLossesContent.innerHTML = ''; // Clear previous content
                const listToRender = showingKills ? last10Data.kills : last10Data.losses;
                const listTitle = showingKills ? 'Last 10 Kills' : 'Last 10 Losses';

                const last10KillsLossesHeader = document.getElementById('last10KillsLossesHeader');
                if (last10KillsLossesHeader) {
                    last10KillsLossesHeader.textContent = `${characterName}: ${listTitle}`;
                }

                if (listToRender.length === 0) {
                    last10KillsLossesContent.innerHTML = `<p>No ${listTitle.toLowerCase()} found.</p>`;
                    return;
                }

                listToRender.forEach(killmail => {
                    last10KillsLossesContent.innerHTML += renderKillmailDetails(killmail, resolvedNames, characterId, characterType, characterName);
                });
            }

            // Initial render
            renderList();

            // Toggle button event listener
            if (toggleButton) {
                toggleButton.onclick = () => {
                    showingKills = !showingKills;
                    renderList();
                };
            }

            // --- Populate Associations Box (Chart) ---
            const assocBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-content');
            const associatedCharacters = {};

            // Aggregate characters from kills where the main character is an attacker
            last10Data.kills.forEach(killmail => {
                const mainCharacterIsAttacker = (killmail.attackers || []).some(attacker => attacker.character_id == characterId);

                if (mainCharacterIsAttacker) {
                    // Add victim of this kill
                    if (killmail.victim?.character_id && killmail.victim.character_id != characterId) {
                        associatedCharacters[killmail.victim.character_id] = (associatedCharacters[killmail.victim.character_id] || 0) + 1;
                    }
                    // Add all other attackers involved in this kill
                    (killmail.attackers || []).forEach(attacker => {
                        if (attacker.character_id && attacker.character_id != characterId) {
                            associatedCharacters[attacker.character_id] = (associatedCharacters[attacker.character_id] || 0) + 1;
                        }
                    });
                }
            });

            console.log('Associated Characters (raw):', associatedCharacters);

            // Convert to array and sort by incidence
            const sortedAssociations = Object.entries(associatedCharacters)
                .sort(([, countA], [, countB]) => countB - countA)
                .slice(0, 20); // Get top 20

            console.log('Sorted Associations:', sortedAssociations);

            const assocLabels = sortedAssociations.map(([id,]) => resolvedNames[id] || id);
            const assocData = sortedAssociations.map(([, count]) => count);
            const assocIds = sortedAssociations.map(([id,]) => id);

            console.log('Associations Labels:', assocLabels);
            console.log('Associations Data:', assocData);
            console.log('Associations Canvas Element:', associationsCanvas);

            if (associationsCanvas) {
                renderHorizontalBarChart(
                    associationsCanvas,
                    assocLabels,
                    assocData,
                    'Combat Incidence',
                    'rgba(255, 159, 64, 0.6)',
                    assocIds
                );
            }

        } catch (error) {
            console.error('Error loading last 10 kills/losses:', error);
        }
    }
    function loadTopStatsCharts(data, resolvedNames, entityType) {
        // --- Populate Top Stats Box (Charts) ---
        const zkbBox = document.querySelector('.info-column:nth-child(3) .info-box .info-box-content');
        const topCorps = data.topAllTime.find(t => t.type === 'corporation').data.slice(0, 5);
        const topAlliances = data.topAllTime.find(t => t.type === 'alliance').data.slice(0, 5);
        const topShips = data.topAllTime.find(t => t.type === 'ship').data.slice(0, 5);
        const topSystems = data.topAllTime.find(t => t.type === 'system').data.slice(0, 5);

        // Get canvas elements
        const topCorpsCanvas = document.getElementById('topCorpsChart');
        const topAlliancesCanvas = document.getElementById('topAlliancesChart');
        const topShipsCanvas = document.getElementById('topShipsChart');
        const topSystemsCanvas = document.getElementById('topSystemsChart');

        // Get parent info-box elements to control visibility
        const topCorpsBox = topCorpsCanvas ? topCorpsCanvas.closest('.info-box-content').previousElementSibling : null;
        const topAlliancesBox = topAlliancesCanvas ? topAlliancesCanvas.closest('.info-box-content').previousElementSibling : null;

        // Hide/show charts based on entityType
        if (entityType === 'corporation') {
            if (topCorpsBox) topCorpsBox.style.display = 'none';
            if (topCorpsCanvas) topCorpsCanvas.style.display = 'none';
        } else {
            if (topCorpsBox) topCorpsBox.style.display = 'block';
            if (topCorpsCanvas) topCorpsCanvas.style.display = 'block';
        }

        if (entityType === 'alliance') {
            if (topCorpsBox) topCorpsBox.style.display = 'none';
            if (topCorpsCanvas) topCorpsCanvas.style.display = 'none';
            if (topAlliancesBox) topAlliancesBox.style.display = 'none';
            if (topAlliancesCanvas) topAlliancesCanvas.style.display = 'none';
        } else {
            if (topAlliancesBox) topAlliancesBox.style.display = 'block';
            if (topAlliancesCanvas) topAlliancesCanvas.style.display = 'block';
        }

        // Render Top Corporations Chart
        if (topCorpsCanvas && entityType !== 'corporation' && entityType !== 'alliance') {
            renderHorizontalBarChart(
                topCorpsCanvas,
                topCorps.map(c => resolvedNames[c.corporationID] || c.corporationID),
                topCorps.map(c => c.kills),
                'Kills',
                'rgba(54, 162, 235, 0.6)'
            );
        }

        // Render Top Alliances Chart
        if (topAlliancesCanvas && entityType !== 'alliance') {
            renderHorizontalBarChart(
                topAlliancesCanvas,
                topAlliances.map(a => resolvedNames[a.allianceID] || a.allianceID),
                topAlliances.map(a => a.kills),
                'Kills',
                'rgba(153, 102, 255, 0.6)'
            );
        }

        // Render Top Ships Chart
        if (topShipsCanvas) {
            renderHorizontalBarChart(
                topShipsCanvas,
                topShips.map(s => resolvedNames[s.shipTypeID] || s.shipTypeID),
                topShips.map(s => s.kills),
                'Kills',
                'rgba(255, 206, 86, 0.6)'
            );
        }

        // Render Top Systems Chart
        if (topSystemsCanvas) {
            renderHorizontalBarChart(
                topSystemsCanvas,
                topSystems.map(s => resolvedNames[s.solarSystemID] || s.solarSystemID),
                topSystems.map(s => s.kills),
                'Kills',
                'rgba(75, 192, 192, 0.6)'
            );
        }
    }

    // Helper function to render a single killmail's details
    function renderKillmailDetails(killmail, resolvedNames, characterId, characterType, characterName) {
        if (!killmail) return '';

        const killmailTime = killmail.killmail_time ? new Date(killmail.killmail_time).toLocaleString() : 'Unknown Date';
        const location = (killmail.solar_system_id && resolvedNames[killmail.solar_system_id]) ? resolvedNames[killmail.solar_system_id] : 'Unknown System';
        const victimName = resolvedNames[killmail.victim?.character_id] || killmail.victim?.character_id || 'Unknown Victim';
        const victimCorp = resolvedNames[killmail.victim?.corporation_id] || killmail.victim?.corporation_id || 'Unknown Corp';
        const victimShip = resolvedNames[killmail.victim?.ship_type_id] || killmail.victim?.ship_type_id || 'Unknown Ship';
        const zkbLink = killmail.killmail_id ? `<a href="https://zkillboard.com/kill/${killmail.killmail_id}/" target="_blank" class="zkb-link">(ZKB)</a>` : '';

        let description = '';
        const isVictim = (killmail.victim?.character_id ?? null) == characterId; // Use characterId for comparison

        if (isVictim) {
            // This is a loss
            const finalBlowAttacker = killmail.attackers?.find(a => a.final_blow) || killmail.attackers?.[0];
            const finalBlowAttackerName = resolvedNames[finalBlowAttacker?.character_id] || finalBlowAttacker?.character_id || 'Unknown Attacker';
            const finalBlowAttackerShip = resolvedNames[finalBlowAttacker?.ship_type_id] || finalBlowAttacker?.ship_type_id || 'Unknown Ship';
            const totalAttackers = killmail.attackers?.length || 1;
            const otherPilotsText = totalAttackers > 1 ? ` with ${totalAttackers - 1} other pilot${totalAttackers - 1 > 1 ? 's' : ''}` : '';

            description = `${characterName} was killed in a ${victimShip} by ${finalBlowAttackerName} in a ${finalBlowAttackerShip}${otherPilotsText}.`;
        } else {
            // This is a kill
            const targetVictimName = resolvedNames[killmail.victim?.character_id] || killmail.victim?.character_id || 'Unknown Victim';
            const targetVictimCorp = resolvedNames[killmail.victim?.corporation_id] || killmail.victim?.corporation_id || 'Unknown Corp';
            const targetVictimShip = resolvedNames[killmail.victim?.ship_type_id] || killmail.victim?.ship_type_id || 'Unknown Ship';
            const totalAttackers = killmail.attackers?.length || 1;
            const otherPilotsText = totalAttackers > 1 ? ` with ${totalAttackers - 1} other pilot${totalAttackers - 1 > 1 ? 's' : ''}` : '';

            description = `${characterName} killed ${targetVictimName} (${targetVictimCorp}) in a ${targetVictimShip}${otherPilotsText}.`;
        }

        return `
            <p>
                <span class="info-label">${new Date(killmail.killmail_time).toLocaleString()} in ${location}:</span> 
                <span>${description}</span>
                ${zkbLink}
            </p>
        `;
    }

    // Helper function to render a horizontal bar chart
    function renderHorizontalBarChart(canvasElement, labels, data, labelText, backgroundColor, ids = null) {
        if (!canvasElement) return; // Defensive check
        const ctx = canvasElement.getContext('2d');
        if (window[canvasElement.id] instanceof Chart) {
            window[canvasElement.id].destroy();
        }
        window[canvasElement.id] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: labelText,
                    data: data,
                    backgroundColor: backgroundColor,
                    borderColor: backgroundColor.replace('0.6', '1'),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true
                    },
                    y: {
                        ticks: {
                            autoSkip: false
                        }
                    }
                },
                onClick: (e) => {
                    const canvasPosition = Chart.helpers.getRelativePosition(e, window[canvasElement.id]);

                    // Substitute the appropriate scale IDs
                    const dataX = window[canvasElement.id].scales.y.getValueForPixel(canvasPosition.y);
                    const dataY = window[canvasElement.id].scales.x.getValueForPixel(canvasPosition.x);

                    const id = ids[dataX];
                    window.open(`https://zkillboard.com/character/${id}/`, '_blank');
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                barPercentage: 0.8,
                categoryPercentage: 0.8
            }
        });
    }

    // Dropdown menu logic
    const menuItems = document.querySelectorAll('.top-nav .menu-item');
    menuItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            const dropdown = item.querySelector('.dropdown');
            if (dropdown) dropdown.style.display = 'block';
        });
        item.addEventListener('mouseleave', () => {
            const dropdown = item.querySelector('.dropdown');
            if (dropdown) dropdown.style.display = 'none';
        });
    });
});

        
