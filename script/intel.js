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
            // Step 1: Fetch the ID from the mock ESI data
            const esiResponse = await fetch('../data/esi-ids.json');
            const esiData = await esiResponse.json();

            let entityId = null;
            let entityType = null;

            if (esiData.characters && esiData.characters.some(c => c.name.toLowerCase() === entityName.toLowerCase())) {
                entityId = esiData.characters.find(c => c.name.toLowerCase() === entityName.toLowerCase()).id;
                entityType = 'character';
            } else if (esiData.corporations && esiData.corporations.some(c => c.name.toLowerCase() === entityName.toLowerCase())) {
                entityId = esiData.corporations.find(c => c.name.toLowerCase() === entityName.toLowerCase()).id;
                entityType = 'corporation';
            } else if (esiData.alliances && esiData.alliances.some(a => a.name.toLowerCase() === entityName.toLowerCase())) {
                entityId = esiData.alliances.find(a => a.name.toLowerCase() === entityName.toLowerCase()).id;
                entityType = 'alliance';
            }

            if (!entityId) {
                alert('Entity not found.');
                return;
            }

            // Step 2: Fetch stats from the mock zKillboard data
            const zkbResponse = await fetch(`../data/zkillboard-stats.json`);
            const zkbData = await zkbResponse.json();

            // Step 3: Populate the info boxes
            populateInfoBoxes(zkbData, entityName, entityType);

        } catch (error) {
            console.error('Error fetching intel:', error);
            alert('An error occurred while fetching intel.');
        }
    });

    function populateInfoBoxes(data, name, type) {
        // Update headers
        document.querySelector('.info-column:nth-child(1) .info-box:nth-child(1) .info-box-header').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${name}`;

        // --- Populate Character Box ---
        const charBox = document.querySelector('.info-column:nth-child(1) .info-box:nth-child(1) .info-box-content');
        charBox.innerHTML = `
            <p><span class="info-label">Birthday:</span> ${new Date(data.info.birthday).toLocaleDateString()}</p>
            <p><span class="info-label">Gender:</span> ${data.info.gender}</p>
            <p><span class="info-label">Race:</span> ${data.info.race_id} (ID - requires API call)</p>
            <p><span class="info-label">Corporation:</span> ${data.info.corporation_id} (ID - requires API call)</p>
            <p><span class="info-label">Alliance:</span> ${data.info.alliance_id} (ID - requires API call)</p>
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
            <p><span class="info-label">Last Kill:</span> (Requires combat data)</p>
        `;

        // --- Populate Associations Box ---
        const assocBox = document.querySelector('.info-column:nth-child(2) .info-box:nth-child(1) .info-box-content');
        const topCorps = data.topAllTime.find(t => t.type === 'corporation').data.slice(0, 5);
        const topAlliances = data.topAllTime.find(t => t.type === 'alliance').data.slice(0, 5);
        assocBox.innerHTML = `
            <h4>Top Corporations</h4>
            <ul>
                ${topCorps.map(c => `<li>ID: ${c.corporationID} - Kills: ${c.kills}</li>`).join('')}
            </ul>
            <h4>Top Alliances</h4>
            <ul>
                ${topAlliances.map(a => `<li>ID: ${a.allianceID} - Kills: ${a.kills}</li>`).join('')}
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
                ${topShips.map(s => `<li>ID: ${s.shipTypeID} - Kills: ${s.kills}</li>`).join('')}
            </ul>
            <h4>Top Systems</h4>
            <ul>
                ${topSystems.map(s => `<li>ID: ${s.solarSystemID} - Kills: ${s.kills}</li>`).join('')}
            </ul>
        `;

        // --- Populate zKillboard Box ---
        const zkbBox = document.querySelector('.info-column:nth-child(3) .info-box .info-box-content');
        zkbBox.innerHTML = `<iframe src="https://zkillboard.com/${type}/${data.info.id}/" style="width: 100%; height: 100%; border: none;"></iframe>`;
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
