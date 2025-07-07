document.addEventListener('DOMContentLoaded', function () {
    const getIntelButton = document.querySelector('.intel-button');
    const intelInput = document.querySelector('.intel-input');

    getIntelButton.addEventListener('click', async () => {
        const entityName = intelInput.value.trim();
        if (!entityName) {
            alert('Please enter a name.');
            return;
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

            // Step 3: Populate the info boxes
            populateInfoBoxes(zkbStats, entityName, entityType, latestKill, resolvedNames);

        } catch (error) {
            console.error('Error fetching intel:', error);
            alert('An error occurred while fetching intel.');
        }
    });

    function populateInfoBoxes(data, name, type, latestKill, resolvedNames) {
        // Update headers
        document.querySelector('.info-column:nth-child(1) .info-box:nth-child(1) .info-box-header').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${name}`;
        document.querySelector('.info-column:nth-child(1) .info-box:nth-child(2) .info-box-header').textContent = `${name}: Combat (Last 10)`;
        document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-header').textContent = `${name}: Associations`;
        document.querySelector('.info-column:nth-child(2) .info-box:nth-child(2) .info-box-header').textContent = `${name}: Ships and Locations`;

        // --- Populate Character Box ---
        const charBox = document.querySelector('.info-column:nth-child(1) .info-box:nth-child(1) .info-box-content');

        // Basic character info
        let charHtml = `
            <p><span class="info-label">Birthday:</span> ${new Date(data.info.birthday).toLocaleDateString()}</p>
            <p><span class="info-label">Gender:</span> ${data.info.gender}</p>
            <p><span class="info-label">Race:</span> ${resolvedNames[data.info.race_id] || data.info.race_id}</p>
            <p><span class="info-label">Corporation:</span> ${resolvedNames[data.info.corporation_id] || data.info.corporation_id}</p>
            <p><span class="info-label">Alliance:</span> ${resolvedNames[data.info.alliance_id] || data.info.alliance_id}</p>
            <p><span class="info-label">Security Status:</span> ${data.info.security_status.toFixed(2)}</p>
            <hr>
            <p><span class="info-label">Total Kills:</span> ${data.allTimeSum}</p>
            <p><span class="info-label">Total Losses:</span> ${data.shipsLost}</p>
            <p><span class="info-label">ISK Destroyed:</span> ${data.iskDestroyed.toLocaleString()}</p>
            <p><span class="info-label">ISK Lost:</span> ${data.iskLost.toLocaleString()}</p>
            <p><span class="info-label">Solo Kills:</span> ${data.soloKills}</p>
            <hr>
            <p><span class="info-label">Danger Ratio:</span> ${data.dangerRatio}%</p>
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
        assocBox.innerHTML = '';

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

        // --- Populate Ships and Locations Box (Empty) ---
        const shipsBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(2) .info-box-content');
        shipsBox.innerHTML = '';

        // --- Populate Top Stats Box (Charts) ---
        const zkbBox = document.querySelector('.info-column:nth-child(3) .info-box .info-box-content');
        const topCorps = data.topAllTime.find(t => t.type === 'corporation').data.slice(0, 5);
        const topAlliances = data.topAllTime.find(t => t.type === 'alliance').data.slice(0, 5);
        const topShips = data.topAllTime.find(t => t.type === 'ship').data.slice(0, 5);
        const topSystems = data.topAllTime.find(t => t.type === 'system').data.slice(0, 5);

        // Render Top Corporations Chart
        renderHorizontalBarChart(
            'topCorpsChart',
            topCorps.map(c => resolvedNames[c.corporationID] || c.corporationID),
            topCorps.map(c => c.kills),
            'Kills',
            'rgba(54, 162, 235, 0.6)'
        );

        // Render Top Alliances Chart
        renderHorizontalBarChart(
            'topAlliancesChart',
            topAlliances.map(a => resolvedNames[a.allianceID] || a.allianceID),
            topAlliances.map(a => a.kills),
            'Kills',
            'rgba(153, 102, 255, 0.6)'
        );

        // Render Top Ships Chart
        renderHorizontalBarChart(
            'topShipsChart',
            topShips.map(s => resolvedNames[s.shipTypeID] || s.shipTypeID),
            topShips.map(s => s.kills),
            'Kills',
            'rgba(255, 206, 86, 0.6)'
        );

        // Render Top Systems Chart
        renderHorizontalBarChart(
            'topSystemsChart',
            topSystems.map(s => resolvedNames[s.solarSystemID] || s.solarSystemID),
            topSystems.map(s => s.kills),
            'Kills',
            'rgba(75, 192, 192, 0.6)'
        );
    }

    // Helper function to render a horizontal bar chart
    function renderHorizontalBarChart(canvasId, labels, data, labelText, backgroundColor) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (window[canvasId] instanceof Chart) {
            window[canvasId].destroy();
        }
        window[canvasId] = new Chart(ctx, {
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
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                barPercentage: 0.6,
                categoryPercentage: 0.6
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
