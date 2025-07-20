// Telemetry.js - Enhanced telemetry functionality for WSPR.spot

// Band info for enhanced telemetry. For each band, the value is
// [starting_minute_base (for ch 0), wspr_live_band]
const kBandInfo = {
  '160m' : [8, 1],
  '80m' : [2, 3],
  '60m' : [6, 5],
  '40m' : [0, 7],
  '30m' : [4, 10],
  '20m' : [8, 14],
  '17m' : [2, 18],
  '15m' : [6, 21],
  '12m' : [0, 24],
  '10m' : [4, 28],
  '6m' : [8, 50]
};

// Used for spot decoding
const kWsprPowers = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40,
  43, 47, 50, 53, 57, 60];

// Returns c's offset in ['A'..'Z'] if alphanum is false and in
// [0..9A..Z] otherwise
function charToNum(c, alphanum = false) {
  let code = c.charCodeAt(0);
  let A = 'A'.charCodeAt(0);
  if (alphanum) {
    if (code >= A) {
      return code - A + 10;
    } else {
      let zero = '0'.charCodeAt(0);
      return code - zero;
    }
  } else {
    return code - A;
  }
}

// Decodes and annotates a spot with enhanced telemetry
function decodeSpot(spot) {
  spot.grid = spot.grid.slice(0, 4);  // normalize grid
  if (spot.basic) {
    // Basic telemetry message is present
    if (spot.basic.cs.length != 6) {
      spot.invalid = true;
      return;
    }
    spot.basic.grid = spot.basic.grid.slice(0, 4);
    // Extract values from callsign
    let cs = spot.basic.cs;
    let m = ((((charToNum(cs[1], true) * 26 + charToNum(cs[3])) * 26) +
             charToNum(cs[4]))) * 26 + charToNum(cs[5]);
    let p = Math.floor(m / 1068);
    spot.grid6 = spot.grid + String.fromCharCode(97 + Math.floor(p / 24)) +
        String.fromCharCode(97 + (p % 24));
    const coords = gridToLatLon(spot.grid6);
    spot.lon = coords[0];
    spot.lat = coords[1];
    spot.altitude = (m % 1068) * 20;
    // Extract values from grid + power
    let grid = spot.basic.grid;
    let n = ((((charToNum(grid[0]) * 18 + charToNum(grid[1])) * 10) +
             charToNum(grid[2], true)) * 10 + charToNum(grid[3], true)) * 19 +
        kWsprPowers.indexOf(spot.basic.power);
    if (!(Math.floor(n / 2) % 2)) {
      // Invalid GPS bit
      spot.invalid = true;
      return;
    }
    spot.speed = (Math.floor(n / 4) % 42) * 2 * 1.852;
    spot.voltage = ((Math.floor(n / 168) + 20) % 40) * 0.05 + 3;
    spot.temp = (Math.floor(n / 6720) % 90) - 50;
    
    console.log('Enhanced telemetry decoded:', {
      grid: spot.grid,
      grid6: spot.grid6,
      altitude: spot.altitude,
      speed: spot.speed,
      voltage: spot.voltage,
      temp: spot.temp,
      coords: [spot.lon, spot.lat]
    });
  } else {
    const coords = gridToLatLon(spot.grid);
    spot.lon = coords[0];
    spot.lat = coords[1];
  }
}

// Annotates telemetry spots (appends lat, lon, speed, etc)
function decodeSpots(spots) {
  spots.forEach((spot, index) => { decodeSpot(spot); });
}

// Find coreceiver between two receiver arrays
function findCoreceiver(rx1, rx2) {
  for (let i = 0; i < rx1.length; i++) {
    for (let j = 0; j < rx2.length; j++) {
      if (rx1[i].cs === rx2[j].cs) {
        const freq_diff = Math.abs(rx1[i].freq - rx2[j].freq);
        if (freq_diff < 5) {  // Within 5 Hz (same as test folder)
          return true;
        }
      }
    }
  }
  return false;
}

// Match telemetry data with regular callsign data
function matchTelemetry(reg_cs_data, basic_tel_data) {
  let spots = [];
  let i = 0;  // index into reg_cs_data
  let j = 0;  // index into basic_tel_data
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (;;) {
    if (i >= reg_cs_data.length) {
      // We have run out of regular callsign messages
      break;
    }
    if (j >= basic_tel_data.length ||
        reg_cs_data[i].ts < basic_tel_data[j].ts - 120 * 1000 ||
        reg_cs_data[i].basic) {
      // Unmatched regular callsign message or this row has already
      // been matched before (in case of incremental updates)
      spots.push(reg_cs_data[i++]);
      unmatchedCount++;
    } else if (reg_cs_data[i].ts > basic_tel_data[j].ts - 120 * 1000 ||
               !basic_tel_data[j].rx) {
      // Unmatched basic telemetry message or already previously matched
      // (rx was deleted)
      j++;
    } else {
      // Possible match. Check if the messages were co-received by the same
      // callsign on a similar frequency.
      if (findCoreceiver(reg_cs_data[i].rx, basic_tel_data[j].rx)) {
        let data = reg_cs_data[i];
        data.basic = basic_tel_data[j];
        delete data.basic.rx;
        spots.push(data);
        matchedCount++;
        i++;
        j++;
      } else {
        // Unmatched basic telemetry message
        j++;
      }
    }
  }
  
  console.log('Telemetry matching results:', {
    totalRegularSpots: reg_cs_data.length,
    totalBasicTelemetrySpots: basic_tel_data.length,
    matchedSpots: matchedCount,
    unmatchedSpots: unmatchedCount
  });
  
  return spots;
}

// Creates wspr.live query for fetching regular callsign reports (enhanced telemetry)
function createRegularCallsignQuery(callsign, channel, band, startUTC, endUTC) {
  const [starting_minute_base, wspr_band] = kBandInfo[band];
  const tx_minute = (starting_minute_base + (channel % 5) * 2) % 10;
  return `
    SELECT
      time, tx_loc, power,
      groupArray(tuple(rx_sign, rx_loc, frequency, snr))
    FROM wspr.rx
    WHERE
      tx_sign = '${callsign}' AND
      band = ${wspr_band} AND
      time >= '${startUTC}' AND
      time <= '${endUTC}' AND
      toMinute(time) % 10 = ${tx_minute}
    GROUP BY time, tx_loc, power
    FORMAT JSONCompact`;
}

// Creates wspr.live query for fetching basic telemetry reports
function createBasicTelemetryQuery(channel, band, startUTC, endUTC) {
  const cs1 = ['0', '1', 'Q'][Math.floor(channel / 200)];
  const cs3 = Math.floor(channel / 20) % 10;
  const [starting_minute_base, wspr_band] = kBandInfo[band];
  const tx_minute = (starting_minute_base + (channel % 5) * 2 + 2) % 10;
  return `
    SELECT
      time, tx_sign, tx_loc, power,
      groupArray(tuple(rx_sign, frequency))
    FROM wspr.rx
    WHERE
      substr(tx_sign, 1, 1) = '${cs1}' AND
      substr(tx_sign, 3, 1) = '${cs3}' AND
      band = ${wspr_band} AND
      time >= '${startUTC}' AND
      time <= '${endUTC}' AND
      toMinute(time) % 10 = ${tx_minute}
    GROUP BY time, tx_sign, tx_loc, power
    FORMAT JSONCompact`;
}

// Import regular callsign data for enhanced telemetry
function importRegularCallsignData(data) {
  for (let i = 0; i < data.length; i++) {
    let row = data[i];
    data[i] = {'ts' : new Date(Date.parse(row[0].replace(' ', 'T') + 'Z')),
               'grid' : row[1], 'power' : row[2],
               'rx' : row[3].map(rx => ({'cs' : rx[0], 'grid' : rx[1],
                                         'freq' : rx[2], 'snr' : rx[3]}))
                   .sort((r1, r2) => (r1.cs > r2.cs) - (r1.cs < r2.cs))};
  }
  // Sort rows by time
  return data.sort((row1, row2) => (row1.ts - row2.ts));
}

// Import basic telemetry data
function importBasicTelemetryData(data) {
  for (let i = 0; i < data.length; i++) {
    let row = data[i];
    data[i] = {'ts' : new Date(Date.parse(row[0].replace(' ', 'T') + 'Z')),
               'cs' : row[1], 'grid' : row[2], 'power' : row[3],
               'rx' : row[4].map(rx => ({'cs' : rx[0], 'freq' : rx[1]}))
                   .sort((r1, r2) => (r1.cs > r2.cs) - (r1.cs < r2.cs))};
  }
  // Sort rows by time
  data.sort((row1, row2) => (row1.ts - row2.ts));
  return data;
}

// Function to fetch enhanced telemetry data
async function fetchEnhancedTelemetry(callsign, channel, band, startUTC, endUTC) {
  // For enhanced telemetry, use full-day range to capture all spots
  // Extract just the date part from startUTC
  const startDate = startUTC.split(' ')[0];
  const endDate = endUTC.split(' ')[0];
  
  // Use full-day range for enhanced telemetry queries
  const enhancedStartUTC = startDate;
  const enhancedEndUTC = endDate + ' 23:59:00';
  
  console.log('Enhanced telemetry using full-day range:', enhancedStartUTC, 'to', enhancedEndUTC);
  try {
    console.log('Fetching enhanced telemetry data...');
    
    // Fetch regular callsign data
    const reg_cs_query = createRegularCallsignQuery(callsign, channel, band, enhancedStartUTC, enhancedEndUTC);
    const reg_cs_url = `https://db1.wspr.live/?query=${encodeURIComponent(reg_cs_query)}`;
    console.log('Regular callsign query:', reg_cs_url);
    
    const reg_cs_response = await fetch(reg_cs_url);
    if (!reg_cs_response.ok) {
      throw new Error(`HTTP error! status: ${reg_cs_response.status}`);
    }
    const reg_cs_data = await reg_cs_response.json();
    
    if (reg_cs_data.exception) {
      throw new Error('Database error: ' + reg_cs_data.exception);
    }
    
    // Fetch basic telemetry data
    const basic_tel_query = createBasicTelemetryQuery(channel, band, enhancedStartUTC, enhancedEndUTC);
    const basic_tel_url = `https://db1.wspr.live/?query=${encodeURIComponent(basic_tel_query)}`;
    console.log('Basic telemetry query:', basic_tel_url);
    
    const basic_tel_response = await fetch(basic_tel_url);
    if (!basic_tel_response.ok) {
      throw new Error(`HTTP error! status: ${basic_tel_response.status}`);
    }
    const basic_tel_data = await basic_tel_response.json();
    
    if (basic_tel_data.exception) {
      throw new Error('Database error: ' + basic_tel_data.exception);
    }

    // Import and process data
    const processed_reg_cs_data = importRegularCallsignData(reg_cs_data.data);
    const processed_basic_tel_data = importBasicTelemetryData(basic_tel_data.data);
    
    console.log('Processed regular callsign data:', processed_reg_cs_data.length, 'spots');
    console.log('Processed basic telemetry data:', processed_basic_tel_data.length, 'spots');

    // Match telemetry data
    let spots = matchTelemetry(processed_reg_cs_data, processed_basic_tel_data);
    console.log('Matched spots:', spots.length, 'spots');
    
    // Debug: Check which spots have enhanced telemetry
    const spotsWithTelemetry = spots.filter(spot => spot.basic);
    const spotsWithoutTelemetry = spots.filter(spot => !spot.basic);
    console.log('Spots with enhanced telemetry:', spotsWithTelemetry.length);
    console.log('Spots without enhanced telemetry:', spotsWithoutTelemetry.length);
    
    // Debug: Show first few spots with and without telemetry
    if (spotsWithTelemetry.length > 0) {
      console.log('Sample spot with telemetry:', {
        time: spotsWithTelemetry[0].ts,
        grid: spotsWithTelemetry[0].grid,
        basic: spotsWithTelemetry[0].basic
      });
    }
    if (spotsWithoutTelemetry.length > 0) {
      console.log('Sample spot without telemetry:', {
        time: spotsWithoutTelemetry[0].ts,
        grid: spotsWithoutTelemetry[0].grid,
        basic: spotsWithoutTelemetry[0].basic
      });
    }

    // Decode spots to extract telemetry
    decodeSpots(spots);
    
    // Filter out invalid spots
    spots = spots.filter(spot => !spot.invalid);
    
    // Filter spots to user's requested time range
    const userStartTime = new Date(startUTC + 'Z');
    const userEndTime = new Date(endUTC + 'Z');
    spots = spots.filter(spot => {
      const spotTime = new Date(spot.ts);
      return spotTime >= userStartTime && spotTime <= userEndTime;
    });
    
    console.log('Spots after time range filtering:', spots.length, 'spots');
    
    // For enhanced telemetry mode, only show spots that actually have telemetry data
    const spotsBeforeTelemetryFilter = spots.length;
    spots = spots.filter(spot => spot.basic);
    console.log('Spots after telemetry filtering:', spots.length, 'spots (removed', spotsBeforeTelemetryFilter - spots.length, 'spots without telemetry)');
    
    if (spots.length === 0) {
      document.getElementById('results').innerHTML = "<p>No enhanced telemetry spots found for the specified parameters. Only spots with altitude, speed, voltage, and temperature data are shown.</p>";
              updateMapData({
          type: 'FeatureCollection',
          features: []
        });
      document.getElementById('animate-button').style.display = 'none';
      document.getElementById('animation-speed').style.display = 'none';
      document.getElementById('flight-time-section').style.display = 'none';
      document.getElementById('chart-section').style.display = 'none';
      return;
    }

    // Convert spots to GeoJSON format
    const spotFeatures = spots.map((spot, index) => {
      const isLatest = index === spots.length - 1 ? 1 : 0;
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [spot.lon, spot.lat]
        },
        properties: {
          date: spot.ts.toISOString().slice(0, 19).replace('T', ' '),
          tx_loc: spot.grid,
          isLatest: isLatest,
          receivers: JSON.stringify(spot.rx),
          receiverCount: spot.rx.length,
          // Enhanced telemetry properties
          hasTelemetry: !!spot.basic,
          altitude: spot.altitude,
          speed: spot.speed,
          voltage: spot.voltage,
          temp: spot.temp,
          grid6: spot.grid6
        }
      };
    });

    // Store the spots data for style changes
    lastFetchedSpots = {
      type: 'FeatureCollection',
      features: spotFeatures
    };
    
    // Store unique spots for animation
    uniqueSpotsForAnimation = spots;
    
    // Update map data
    updateMapData(lastFetchedSpots);

    // Show animation button and speed dropdown
    document.getElementById('animate-button').style.display = 'inline-block';
    document.getElementById('animation-speed').style.display = 'inline-block';

    // Update charts with enhanced telemetry data
    updateChartSection(spots);

    // Center map on the latest spot
    if (spotFeatures.length > 0) {
      const latestSpot = spotFeatures[spotFeatures.length - 1];
      const coordinates = latestSpot.geometry.coordinates;
      
      flyToMap(coordinates);
      
      // Calculate and display flight time
      calculateFlightTime(spots.map(s => ({ date: s.ts.toISOString().slice(0, 19).replace('T', ' ') })));
    }

    // Create enhanced table with telemetry data
    const table = `
      <p style="font-size: 0.9em; color: #6c757d; margin-bottom: 10px; font-style: italic;">
        Hover over Altitude, Speed, Temperature to see imperial units. Hover over Receivers to see information about receiving stations.
      </p>
      <table>
        <thead>
          <tr>
            <th>Timestamp (Local Time)</th>
            <th>Grid</th>
            <th>Altitude</th>
            <th>Speed</th>
            <th>Voltage</th>
            <th>Temp</th>
            <th>Receivers</th>
          </tr>
        </thead>
        <tbody>
          ${spots.slice(-10).reverse().map(spot => `
            <tr>
              <td>${spot.ts.toLocaleString()}</td>
              <td>${(() => {
                const coords = [spot.lon, spot.lat];
                return coords ? 
                  `<a href="https://www.google.com/maps?q=${coords[1]},${coords[0]}" target="_blank">${spot.grid6 || spot.grid}</a>` :
                  spot.grid6 || spot.grid;
              })()}</td>
              <td>${spot.altitude ? `<span class="metric-value" data-altitude="${spot.altitude}">${(spot.altitude / 1000).toFixed(2)} km</span>` : '-'}</td>
              <td>${spot.speed ? `<span class="metric-value" data-speed="${spot.speed}">${Math.round(spot.speed)} km/h</span>` : '-'}</td>
              <td>${spot.voltage ? spot.voltage.toFixed(2) + 'V' : '-'}</td>
              <td>${spot.temp ? `<span class="metric-value" data-temp="${spot.temp}">${spot.temp}°C</span>` : '-'}</td>
              <td>
                <span class="receiver-count metric-value" data-receivers='${JSON.stringify(spot.rx)}'>
                  ${spot.rx.length}
                </span>
              </td>
            </tr>
          `).join('')}
          ${spots.length > 10 ? spots.slice(0, -10).reverse().map(spot => `
            <tr class="expandable-row" style="display: none;">
              <td>${spot.ts.toLocaleString()}</td>
              <td>${(() => {
                const coords = [spot.lon, spot.lat];
                return coords ? 
                  `<a href="https://www.google.com/maps?q=${coords[1]},${coords[0]}" target="_blank">${spot.grid6 || spot.grid}</a>` :
                  spot.grid6 || spot.grid;
              })()}</td>
              <td>${spot.altitude ? `<span class="metric-value" data-altitude="${spot.altitude}">${(spot.altitude / 1000).toFixed(2)} km</span>` : '-'}</td>
              <td>${spot.speed ? `<span class="metric-value" data-speed="${spot.speed}">${Math.round(spot.speed)} km/h</span>` : '-'}</td>
              <td>${spot.voltage ? spot.voltage.toFixed(2) + 'V' : '-'}</td>
              <td>${spot.temp ? `<span class="metric-value" data-temp="${spot.temp}">${spot.temp}°C</span>` : '-'}</td>
              <td>
                <span class="receiver-count metric-value" data-receivers='${JSON.stringify(spot.rx)}'>
                  ${spot.rx.length}
                </span>
              </td>
            </tr>
          `).join('') : ''}
        </tbody>
      </table>
      <p>Total enhanced telemetry spots: ${spots.length}</p>
      ${spots.length > 10 ? `
        <button id="expand-button" onclick="toggleTable()" style="margin: 10px 0; padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Show All ${spots.length} Entries
        </button>
      ` : ''}
      ${spots.length > 0 ? `
        <button id="download-csv-button" onclick="downloadCSV()" style="margin: 10px 0 10px 10px; padding: 8px 16px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Download CSV
        </button>
      ` : ''}
    `;
    document.getElementById('results').innerHTML = table;
    
    // Add event listeners for imperial tooltips and receiver tooltips
    addMetricValueListeners();
    addReceiverTooltipListeners();

  } catch (err) {
    console.error('Error:', err);
    document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
  }
} 