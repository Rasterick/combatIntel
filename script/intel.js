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
        if (latestKill) {
            const lastKillTime = new Date(latestKill.killmail_time).toLocaleString();
            const location = resolvedNames[latestKill.solar_system_id] || latestKill.solar_system_id;
            const victimName = resolvedNames[latestKill.victim?.character_id] || latestKill.victim?.character_id || 'Unknown Victim';
            const victimCorp = resolvedNames[latestKill.victim?.corporation_id] || latestKill.victim?.corporation_id || 'Unknown Corp';
            const victim = `${victimName} (${victimCorp})`;
            const victimShip = resolvedNames[latestKill.victim?.ship_type_id] || latestKill.victim?.ship_type_id || 'Unknown Ship';

            const attackerCharacter = latestKill.attackers?.find(a => (resolvedNames[a.character_id] || a.character_id).toLowerCase() === name.toLowerCase());
            const attackerShip = attackerCharacter ? (resolvedNames[attackerCharacter.ship_type_id] || attackerCharacter.ship_type_id) : 'Unknown Ship';
            const otherPilots = (latestKill.attackers?.length || 1) - 1;
            const pilotText = otherPilots === 1 ? 'pilot' : 'pilots';

            charHtml += `
                <p>
                    <span class="info-label">Last Kill:</span> 
                    <span>(${lastKillTime} in ${location}) - ${name} killed ${victim} in a ${victimShip} with ${otherPilots} other ${pilotText}.</span>
                    <a href="https://zkillboard.com/kill/${latestKill.killmail_id}/" target="_blank">(ZKB)</a>
                </p>
            `;
        } else {
            charHtml += `<p><span class="info-label">Last Kill:</span> No recent kills found for this entity.</p>`;
        }

        charBox.innerHTML = charHtml;

        // --- Populate Associations Box ---
        const assocBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-content');
        const topCorps = data.topAllTime.find(t => t.type === 'corporation').data.slice(0, 5);
        const topAlliances = data.topAllTime.find(t => t.type === 'alliance').data.slice(0, 5);
        assocBox.innerHTML = `
            <h4>Top Corporations</h4>
            <ul>
                ${topCorps.map(c => `<li>${resolvedNames[c.corporationID] || c.corporationID} - Kills: ${c.kills}</li>`).join('')}
            </ul>
            <h4>Top Alliances</h4>
            <ul>
                ${topAlliances.map(a => `<li>${resolvedNames[a.allianceID] || a.allianceID} - Kills: ${a.kills}</li>`).join('')}
            </ul>
        `;

        // --- Populate Combat Box ---
        const combatBox = document.querySelector('.info-column:nth-child(1) .info-box:nth-child(2) .info-box-content');
        const recentMonths = Object.values(data.months).slice(-10);
        combatBox.innerHTML = `
            <h4>Last 10 Months Activity</h4>
            <ul>
                ${recentMonths.map(m => `<li>${m.year}-${m.month}: ${m.shipsDestroyed} destroyed, ${m.shipsLost} lost</li>`).join('')}
            </ul>
        `;

        // --- Populate Ships and Locations Box ---
        const shipsBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(2) .info-box-content');
        const topShips = data.topAllTime.find(t => t.type === 'ship').data.slice(0, 5);
        const topSystems = data.topAllTime.find(t => t.type === 'system').data.slice(0, 5);
        shipsBox.innerHTML = `
            <h4>Top Ships</h4>
            <ul>
                ${topShips.map(s => `<li>${resolvedNames[s.shipTypeID] || s.shipTypeID} - Kills: ${s.kills}</li>`).join('')}
            </ul>
            <h4>Top Systems</h4>
            <ul>
                ${topSystems.map(s => `<li>${resolvedNames[s.solarSystemID] || s.solarSystemID} - Kills: ${s.kills}</li>`).join('')}
            </ul>
        `;

        // --- Populate zKillboard Box ---
        const zkbBox = document.querySelector('.info-column:nth-child(3) .info-box .info-box-content');
        zkbBox.innerHTML = ''; // Blank out the zKillboard box as requested.
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
