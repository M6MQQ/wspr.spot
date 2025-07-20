// App.js - Main application functionality for WSPR.spot

// Global variables
let currentSpots = {
  type: 'FeatureCollection',
  features: []
};

let lastFetchedSpots = {
  type: 'FeatureCollection',
  features: []
};

let uniqueSpotsForAnimation = [];

let reg_cs_data = [];
let basic_tel_data = [];

// Animation variables
let animationInterval = null;
let currentAnimationIndex = 0;
let isAnimating = false;
let animationSpots = [];

// Chart variables
let altitudeChart = null;
let speedChart = null;

// Function to get URL parameters
function getUrlParams() {
  console.log('Current URL:', window.location.href);
  console.log('URL search:', window.location.search);
  
  const params = new URLSearchParams(window.location.search);
  const result = {
    callsign: params.get('callsign') || '',
    channel: params.get('channel') || '',
    band: params.get('band') || '',
    start: params.get('start') || '',
    end: params.get('end') || '',
    timeOffset: params.get('timeOffset') || ''
  };
  
  console.log('Parsed URL parameters:', result);
  return result;
}

// Function to update URL with current parameters
function updateUrl(callsign, channel, band, start, end, timeOffset) {
  const params = new URLSearchParams();
  if (callsign) params.set('callsign', callsign);
  if (channel) params.set('channel', channel);
  if (band) params.set('band', band);
  
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (timeOffset) params.set('timeOffset', timeOffset);
  
  const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
  window.history.replaceState({}, '', newUrl);
  return newUrl;
}

// Function to get shareable URL
function getShareableUrl() {
  const callsign = document.getElementById('callsign').value.trim();
  const channel = document.getElementById('channel').value;
  const band = document.getElementById('band').value;
  const start = document.getElementById('start').value;
  const end = document.getElementById('end').value;
  const timeOffset = document.getElementById('time-offset').value;
  
  return window.location.origin + updateUrl(callsign, channel, band, start, end, timeOffset);
}

// Function to copy URL to clipboard
function copyShareableUrl() {
  const url = getShareableUrl();
  const copyButton = document.getElementById('copy-button');
  
  // Check if clipboard API is available
  if (!navigator.clipboard) {
    // Fallback for older browsers
    fallbackCopyTextToClipboard(url, copyButton);
    return;
  }
  
  navigator.clipboard.writeText(url).then(() => {
    copyButton.textContent = 'Copied!';
    setTimeout(() => {
      copyButton.textContent = 'Copy Share URL';
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy URL to clipboard:', err);
    // Fallback to alternative method
    fallbackCopyTextToClipboard(url, copyButton);
  });
}

// Fallback method for copying text to clipboard
function fallbackCopyTextToClipboard(text, button) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      button.textContent = 'Copied!';
      setTimeout(() => {
        button.textContent = 'Copy Share URL';
      }, 2000);
    } else {
      button.textContent = 'Failed to copy';
      setTimeout(() => {
        button.textContent = 'Copy Share URL';
      }, 2000);
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    button.textContent = 'Failed to copy';
    setTimeout(() => {
      button.textContent = 'Copy Share URL';
    }, 2000);
  }
  
  document.body.removeChild(textArea);
}

// Set default date/time values and handle URL parameters
function setDefaultDates() {
  console.log('setDefaultDates called');
  
  const now = new Date();
  const todayAtMidnight = new Date(now);
  todayAtMidnight.setHours(0, 0, 0, 0);
  
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const params = getUrlParams();
  console.log('URL parameters:', params);
  
  const callsignElement = document.getElementById('callsign');
  const channelElement = document.getElementById('channel');
  const bandElement = document.getElementById('band');
  const startElement = document.getElementById('start');
  const endElement = document.getElementById('end');
  const timeOffsetElement = document.getElementById('time-offset');
  
  if (!callsignElement || !channelElement || !bandElement || !startElement || !endElement || !timeOffsetElement) {
    console.error('Form elements not found, retrying in 100ms');
    setTimeout(setDefaultDates, 100);
    return;
  }
  
  callsignElement.value = params.callsign;
  channelElement.value = params.channel;
  bandElement.value = params.band;
  startElement.value = params.start || formatDate(todayAtMidnight);
  endElement.value = params.end || '';
  timeOffsetElement.value = params.timeOffset;

  const animationSpeedSelect = document.getElementById('animation-speed');
  if (animationSpeedSelect) {
    animationSpeedSelect.addEventListener('change', (e) => {
      console.log('Animation speed changed to:', e.target.value + 'x');
    });
    console.log('Animation speed change listener added successfully');
  } else {
    console.error('Animation speed select element not found!');
  }

  window.pendingCallsign = params.callsign;
  if (params.callsign) {
    console.log('Stored pending callsign from URL:', params.callsign);
  }
}

// Main data fetching function
function fetchData() {
  const callsign = document.getElementById('callsign').value.trim().toUpperCase();
  const channel = document.getElementById('channel').value;
  const band = document.getElementById('band').value;
  const start = document.getElementById('start').value;
  const end = document.getElementById('end').value;
  const timeOffset = document.getElementById('time-offset').value;

  if (!callsign || !start) {
    alert('Please fill in callsign and start time.');
    return;
  }

  const isEnhancedMode = channel && band;
  const channelNum = isEnhancedMode ? parseInt(channel) : null;
  
  if (isEnhancedMode) {
    if (isNaN(channelNum) || channelNum < 0 || channelNum >= 600) {
      alert('Channel should be an integer between 0 and 599');
      return;
    }
    
    if (!kBandInfo[band]) {
      alert('Please select a valid band');
      return;
    }
  }

  if (typeof window.map === 'undefined' || !window.map) {
    console.log('Map not ready yet, storing callsign for later');
    window.pendingCallsign = callsign;
    return;
  }

  const startUTC = start + ' 00:00:00';
  const endUTC = end ? 
    end + ' 23:59:59' : 
    new Date().toISOString().slice(0, 19).replace('T', ' ');

  updateUrl(callsign, channel, band, start, end, timeOffset);

  if (isEnhancedMode) {
    fetchEnhancedTelemetry(callsign, channelNum, band, startUTC, endUTC);
  } else {
    fetchRegularData(callsign, startUTC, endUTC, timeOffset);
  }
}

// Function to fetch regular callsign data
async function fetchRegularData(callsign, startUTC, endUTC, timeOffset) {
  const query = `
    SELECT 
      time as date,
      frequency/1000000.0 as band,
      rx_sign,
      snr,
      distance,
      rx_loc as grid,
      power,
      drift,
      tx_sign,
      tx_loc
    FROM wspr.rx 
    WHERE tx_sign = '${callsign}'
      AND time >= '${startUTC}'
      AND time <= '${endUTC}'
      ${timeOffset ? `AND (EXTRACT(MINUTE FROM time) % 10 = ${timeOffset})` : ''}
    ORDER BY time DESC
    FORMAT JSON
  `;

  const url = `https://db1.wspr.live/?query=${encodeURIComponent(query)}`;
  
  console.log('Requesting URL:', url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    console.log('Response status:', res.status);
    const response = await res.json();
    
    console.log('Raw response:', response);

    if (response.exception) {
      throw new Error('Database error: ' + response.exception);
    }

    const data = response.data;
    if (!Array.isArray(data)) {
      throw new Error('Invalid response format');
    }

    console.log('Raw data length:', data.length);
    console.log('First few raw spots:', data.slice(0, 3));

    if (data.length === 0) {
      document.getElementById('results').innerHTML = "<p>No spots found for the specified date range.</p>";
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

    const txLocations = new Map();
    data.forEach(spot => {
      const key = spot.date + spot.tx_loc;
      if (!txLocations.has(key)) {
        txLocations.set(key, {
          date: spot.date,
          tx_loc: spot.tx_loc,
          receivers: []
        });
      }
      txLocations.get(key).receivers.push({
        rx_sign: spot.rx_sign,
        grid: spot.grid,
        snr: spot.snr,
        band: spot.band,
        distance: spot.distance
      });
    });

    const uniqueSpots = Array.from(txLocations.values())
      .sort((a, b) => new Date(b.date + 'Z') - new Date(a.date + 'Z'));

    console.log('Unique spots count:', uniqueSpots.length);
    console.log('First unique spot:', uniqueSpots[0]);

    const spotFeatures = uniqueSpots.map((spot, index) => {
      const coords = gridToLatLon(spot.tx_loc);
      if (!coords) {
        console.log(`Skipping spot due to invalid grid: ${spot.tx_loc}`);
        return null;
      }
      
      const isLatest = index === 0 ? 1 : 0;
      console.log(`Processing spot ${index}:`, {
        date: spot.date,
        tx_loc: spot.tx_loc,
        isLatest: isLatest,
        coords: coords
      });
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: coords
        },
        properties: {
          date: spot.date,
          tx_loc: spot.tx_loc,
          isLatest: isLatest,
          receivers: JSON.stringify(spot.receivers),
          receiverCount: spot.receivers.length,
          hasTelemetry: false
        }
      };
    }).filter(f => f !== null);

    lastFetchedSpots = {
      type: 'FeatureCollection',
      features: spotFeatures.slice().reverse()
    };
    
    uniqueSpotsForAnimation = uniqueSpots;
    
    updateMapData(lastFetchedSpots);

    document.getElementById('animate-button').style.display = 'inline-block';
    document.getElementById('animation-speed').style.display = 'inline-block';

    document.getElementById('chart-section').style.display = 'none';

    if (spotFeatures.length > 0) {
      const latestSpot = spotFeatures[0];
      const coordinates = latestSpot.geometry.coordinates;
      
      flyToMap(coordinates);
      
      calculateFlightTime(data);
    }

    const table = `
      <p style="font-size: 0.9em; color: #6c757d; margin-bottom: 10px; font-style: italic;">
      Hover over <span style="border-bottom: 1px dotted #666;">Receivers</span> to see detailed information about each receiving station.
      </p>
      <table>
        <thead>
          <tr>
            <th>Timestamp (Local Time)</th>
            <th>Grid</th>
            <th>Receivers</th>
          </tr>
        </thead>
        <tbody>
          ${uniqueSpots.slice(0, 10).map(spot => `
            <tr>
              <td>${new Date(spot.date + 'Z').toLocaleString()}</td>
              <td>${(() => {
                const coords = gridToLatLon(spot.tx_loc);
                return coords ? 
                  `<a href="https://www.google.com/maps?q=${coords[1]},${coords[0]}" target="_blank">${spot.tx_loc}</a>` :
                  spot.tx_loc;
              })()}</td>
              <td>
                <span class="receiver-count metric-value" data-receivers='${JSON.stringify(spot.receivers)}'>
                  ${spot.receivers.length}
                </span>
              </td>
            </tr>
          `).join('')}
          ${uniqueSpots.length > 10 ? uniqueSpots.slice(10).map(spot => `
            <tr class="expandable-row" style="display: none;">
              <td>${new Date(spot.date + 'Z').toLocaleString()}</td>
              <td>${(() => {
                const coords = gridToLatLon(spot.tx_loc);
                return coords ? 
                  `<a href="https://www.google.com/maps?q=${coords[1]},${coords[0]}" target="_blank">${spot.tx_loc}</a>` :
                  spot.tx_loc;
              })()}</td>
              <td>
                <span class="receiver-count metric-value" data-receivers='${JSON.stringify(spot.receivers)}'>
                  ${spot.receivers.length}
                </span>
              </td>
            </tr>
          `).join('') : ''}
        </tbody>
      </table>
      <p>Total unique timestamps: ${uniqueSpots.length}</p>
      ${uniqueSpots.length > 10 ? `
        <button id="expand-button" onclick="toggleTable()" style="margin: 10px 0; padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Show All ${uniqueSpots.length} Entries
        </button>
      ` : ''}
      ${uniqueSpots.length > 0 ? `
        <button id="download-csv-button" onclick="downloadCSV()" style="margin: 10px 0 10px 10px; padding: 8px 16px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Download CSV
        </button>
      ` : ''}
    `;
    document.getElementById('results').innerHTML = table;
    
    addReceiverTooltipListeners();

  } catch (err) {
    console.error('Error:', err);
    document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
  }
}

// Function to calculate and display flight time
function calculateFlightTime(spots) {
  if (spots.length < 2) {
    document.getElementById('flight-time-section').style.display = 'none';
    return;
  }
  
  const sortedSpots = [...spots].sort((a, b) => new Date(a.date + 'Z') - new Date(b.date + 'Z'));
  
  const earliestDate = new Date(sortedSpots[0].date + 'Z');
  const latestDate = new Date(sortedSpots[sortedSpots.length - 1].date + 'Z');
  
  const timeDiff = latestDate - earliestDate;
  
  const months = Math.floor(timeDiff / (1000 * 60 * 60 * 24 * 30.44));
  const days = Math.floor((timeDiff % (1000 * 60 * 60 * 24 * 30.44)) / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  let flightTimeText = '';
  
  if (months > 0) {
    flightTimeText = `${months}mo ${days}d ${hours}h`;
  } else if (days > 0) {
    flightTimeText = `${days}d ${hours}h`;
  } else {
    flightTimeText = `${hours}h`;
  }
  
  document.getElementById('flight-time-section').style.display = 'block';
  document.getElementById('flight-time-value').textContent = flightTimeText;

  const timeOffset = document.getElementById('time-offset').value;
  const channel = document.getElementById('channel').value;
  const band = document.getElementById('band').value;
  const offsetLabel = document.getElementById('offset-label');
  
  if (channel && band) {
    offsetLabel.textContent = `Enhanced Telemetry: Ch ${channel}, ${band}`;
  } else if (timeOffset) {
    const offsetText = document.getElementById('time-offset').options[document.getElementById('time-offset').selectedIndex].text;
    offsetLabel.textContent = `Tracking: ${offsetText}`;
  } else {
    offsetLabel.textContent = '';
  }
}

// Function to toggle table expansion
function toggleTable() {
  const expandableRows = document.querySelectorAll('.expandable-row');
  const expandButton = document.getElementById('expand-button');
  
  if (expandableRows[0].style.display === 'none') {
    expandableRows.forEach(row => {
      row.style.display = 'table-row';
    });
    expandButton.textContent = 'Show Only Recent 10 Entries';
  } else {
    expandableRows.forEach(row => {
      row.style.display = 'none';
    });
    expandButton.textContent = 'Show All Entries';
  }
}

// Function to download data as CSV
function downloadCSV() {
  if (!lastFetchedSpots || lastFetchedSpots.features.length === 0) {
    alert('No data available to download');
    return;
  }

  const callsign = document.getElementById('callsign').value.trim();
  const start = document.getElementById('start').value;
  const end = document.getElementById('end').value;
  const timeOffset = document.getElementById('time-offset').value;
  
  const hasEnhancedData = lastFetchedSpots.features.some(f => f.properties.hasTelemetry);
  
  let csvHeader;
  if (hasEnhancedData) {
    csvHeader = [
      'Timestamp (UTC)',
      'Timestamp (Local)',
      'Transmitter Grid',
      'Transmitter Latitude',
      'Transmitter Longitude',
      'Altitude (km)',
      'Speed (km/h)',
      'Voltage (V)',
      'Temperature (°C)',
      'Grid6',
      'Receiver Count',
      'Receivers (JSON)'
    ].join(',');
  } else {
    csvHeader = [
      'Timestamp (UTC)',
      'Timestamp (Local)',
      'Transmitter Grid',
      'Transmitter Latitude',
      'Transmitter Longitude',
      'Receiver Count',
      'Receivers (JSON)'
    ].join(',');
  }

  const csvRows = lastFetchedSpots.features.map(feature => {
    const properties = feature.properties;
    const coords = feature.geometry.coordinates;
    const utcDate = new Date(properties.date + 'Z');
    const localDate = new Date(properties.date + 'Z').toLocaleString();
    
    const receiversEscaped = properties.receivers.replace(/"/g, '""');
    
    if (hasEnhancedData) {
      return [
        properties.date,
        localDate,
        properties.tx_loc,
        coords[1],
        coords[0],
        properties.altitude ? (properties.altitude / 1000).toFixed(2) : '',
        properties.speed ? Math.round(properties.speed) : '',
        properties.voltage ? properties.voltage.toFixed(2) : '',
        properties.temp ? properties.temp : '',
        properties.grid6 || '',
        properties.receiverCount,
        `"${receiversEscaped}"`
      ].join(',');
    } else {
      return [
        properties.date,
        localDate,
        properties.tx_loc,
        coords[1],
        coords[0],
        properties.receiverCount,
        `"${receiversEscaped}"`
      ].join(',');
    }
  });

  const csvContent = [csvHeader, ...csvRows].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  const startDate = start ? start.split('T')[0] : 'unknown';
  const endDate = end ? end.split('T')[0] : 'current';
  const filename = `wspr_${callsign}_${startDate}_to_${endDate}.csv`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Animation functions
function toggleAnimation() {
  if (isAnimating) {
    stopAnimation();
  } else {
    startAnimation();
  }
}

function startAnimation() {
  if (!uniqueSpotsForAnimation || uniqueSpotsForAnimation.length === 0) {
    alert('No data available for animation');
    return;
  }

  const sortedSpots = [...uniqueSpotsForAnimation].sort((a, b) => {
    const dateA = a.date ? new Date(a.date + 'Z') : a.ts;
    const dateB = b.date ? new Date(b.date + 'Z') : b.ts;
    return dateA - dateB;
  });

  const isEnhancedTelemetry = sortedSpots.length > 0 && sortedSpots[0].basic !== undefined;
  
  if (isEnhancedTelemetry) {
    animationSpots = sortedSpots;
    console.log('Enhanced telemetry animation: showing all', animationSpots.length, 'spots in chronological order');
  } else {
    const seenGrids = new Set();
    animationSpots = sortedSpots.filter(spot => {
      const grid = spot.tx_loc || spot.grid;
      if (seenGrids.has(grid)) {
        return false;
      }
      seenGrids.add(grid);
      return true;
    });
    console.log('Regular data animation: showing', animationSpots.length, 'unique grid references');
  }

  console.log('Animation starting with', animationSpots.length, 'spots');
  console.log('First few spots:', animationSpots.slice(0, 3).map(s => s.tx_loc || s.grid));

  currentAnimationIndex = 0;
  isAnimating = true;
  
  const animateButton = document.getElementById('animate-button');
  animateButton.textContent = 'Stop Animation';
  animateButton.style.backgroundColor = '#dc3545';

  showNextSpot();
}

function stopAnimation() {
  isAnimating = false;
  if (animationInterval) {
    clearTimeout(animationInterval);
    animationInterval = null;
  }
  
  const animateButton = document.getElementById('animate-button');
  animateButton.textContent = 'Play Animation';
  animateButton.style.backgroundColor = '#ff8c00';

  updateMapData(lastFetchedSpots);
}

function showNextSpot() {
  if (!isAnimating || currentAnimationIndex >= animationSpots.length) {
    console.log('Animation finished at index', currentAnimationIndex, 'of', animationSpots.length);
    stopAnimation();
    return;
  }

  const currentSpot = animationSpots[currentAnimationIndex];
  
  const grid = currentSpot.tx_loc || currentSpot.grid;
  const date = currentSpot.date || currentSpot.ts.toISOString().slice(0, 19).replace('T', ' ');
  const receivers = currentSpot.receivers || currentSpot.rx;
  const receiverCount = receivers ? receivers.length : 0;
  
  let coordinates;
  if (currentSpot.lat && currentSpot.lon) {
    coordinates = [currentSpot.lon, currentSpot.lat];
  } else {
    coordinates = gridToLatLon(grid);
  }
  
  console.log('Showing spot', currentAnimationIndex + 1, 'of', animationSpots.length, ':', grid, 'at', date);
  if (currentSpot.basic) {
    console.log('Enhanced telemetry data:', {
      altitude: currentSpot.altitude,
      speed: currentSpot.speed,
      voltage: currentSpot.voltage,
      temp: currentSpot.temp
    });
  }

  const animationData = {
    type: 'FeatureCollection',
    features: animationSpots.slice(0, currentAnimationIndex + 1).map((spot, index) => {
      const spotGrid = spot.tx_loc || spot.grid;
      const spotDate = spot.date || spot.ts.toISOString().slice(0, 19).replace('T', ' ');
      const spotReceivers = spot.receivers || spot.rx;
      const spotReceiverCount = spotReceivers ? spotReceivers.length : 0;
      
      let spotCoordinates;
      if (spot.lat && spot.lon) {
        spotCoordinates = [spot.lon, spot.lat];
      } else {
        spotCoordinates = gridToLatLon(spotGrid);
      }
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: spotCoordinates
        },
        properties: {
          date: spotDate,
          tx_loc: spotGrid,
          isLatest: index === currentAnimationIndex ? 1 : 0,
          receivers: JSON.stringify(spotReceivers),
          receiverCount: spotReceiverCount,
          hasTelemetry: !!spot.basic,
          altitude: spot.altitude,
          speed: spot.speed,
          voltage: spot.voltage,
          temp: spot.temp,
          grid6: spot.grid6
        }
      };
    })
  };

  updateMapData(animationData);

  easeToMap(coordinates);

  currentAnimationIndex++;

  onMapMoveEnd(() => {
    if (isAnimating) {
      const speedMultiplier = parseInt(document.getElementById('animation-speed').value);
      const baseDelay = 50;
      const adjustedDelay = baseDelay / speedMultiplier;
      
      animationInterval = setTimeout(() => {
        if (isAnimating) {
          showNextSpot();
        }
      }, adjustedDelay);
    }
  });
}

// Tooltip functions
function convertToImperial(value, type) {
  switch(type) {
    case 'altitude':
      return Math.round(value * 3.28084);
    case 'speed':
      return Math.round(value * 0.621371);
    case 'temp':
      return Math.round((value * 9/5) + 32);
    default:
      return value;
  }
}

function showImperialTooltip(event, type) {
  const element = event.target;
  const value = parseFloat(element.dataset[type]);
  
  if (isNaN(value)) return;
  
  const imperialValue = convertToImperial(value, type);
  let unit = '';
  
  switch(type) {
    case 'altitude':
      unit = 'ft';
      break;
    case 'speed':
      unit = 'mph';
      break;
    case 'temp':
      unit = '°F';
      break;
  }
  
  const tooltip = document.createElement('div');
  tooltip.className = 'imperial-tooltip';
  tooltip.textContent = `${imperialValue} ${unit}`;
  tooltip.style.cssText = `
    position: fixed;
    background: #333;
    color: white;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `;
  
  tooltip.style.left = (event.clientX + 10) + 'px';
  tooltip.style.top = (event.clientY - 10) + 'px';
  
  document.body.appendChild(tooltip);
  element.tooltip = tooltip;
}

function hideImperialTooltip(event) {
  const element = event.target;
  if (element.tooltip) {
    document.body.removeChild(element.tooltip);
    element.tooltip = null;
  }
}

function addMetricValueListeners() {
  const metricValues = document.querySelectorAll('.metric-value');
  metricValues.forEach(element => {
    element.addEventListener('mouseenter', (e) => {
      const type = e.target.dataset.altitude ? 'altitude' : 
                  e.target.dataset.speed ? 'speed' : 
                  e.target.dataset.temp ? 'temp' : null;
      if (type) {
        showImperialTooltip(e, type);
      }
    });
    
    element.addEventListener('mouseleave', hideImperialTooltip);
  });
}

function showReceiverDetails(event) {
  const element = event.target;
  const receivers = JSON.parse(element.dataset.receivers);
  
  const tooltip = document.createElement('div');
  tooltip.className = 'receiver-tooltip';
  
  let html = `<strong>Receivers:</strong><br>`;
  if (receivers.length > 0 && receivers[0].band !== undefined) {
    html += receivers.map(rx => `
      ${rx.rx_sign} (${rx.grid})<br>
      SNR: ${rx.snr} dB, Band: ${rx.band.toFixed(3)} MHz<br>
      Distance: ${rx.distance} km
    `).join('<br>');
  } else {
    html += receivers.map(rx => `
      ${rx.cs} (${rx.grid})<br>
      SNR: ${rx.snr} dB, Frequency: ${(rx.freq / 1000000).toFixed(3)} MHz
    `).join('<br>');
  }
  
  tooltip.innerHTML = html;
  tooltip.style.cssText = `
    position: fixed;
    background: #333;
    color: white;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 1000;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    max-width: 300px;
    line-height: 1.4;
  `;
  
  tooltip.style.left = (event.clientX + 10) + 'px';
  tooltip.style.top = (event.clientY - 10) + 'px';
  
  document.body.appendChild(tooltip);
  element.tooltip = tooltip;
}

function hideReceiverDetails(event) {
  const element = event.target;
  if (element.tooltip) {
    document.body.removeChild(element.tooltip);
    element.tooltip = null;
  }
}

function addReceiverTooltipListeners() {
  const receiverCounts = document.querySelectorAll('.receiver-count');
  receiverCounts.forEach(element => {
    element.addEventListener('mouseenter', showReceiverDetails);
    element.addEventListener('mouseleave', hideReceiverDetails);
  });
}

// Chart functions
function createAltitudeChart(spots) {
  const ctx = document.getElementById('altitude-chart').getContext('2d');
  
  if (altitudeChart) {
    altitudeChart.destroy();
  }
  
  const validSpots = spots.filter(spot => spot.altitude !== undefined && spot.altitude !== null)
                          .sort((a, b) => a.ts - b.ts);
  
  if (validSpots.length === 0) {
    const canvas = document.getElementById('altitude-chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6c757d';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No altitude data available', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  const timeSpan = validSpots[validSpots.length - 1].ts - validSpots[0].ts;
  const daysSpan = timeSpan / (1000 * 60 * 60 * 24);
  
  const labels = validSpots.map(spot => {
    const date = new Date(spot.ts);
    if (daysSpan > 30) {
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric',
        year: '2-digit'
      });
    } else if (daysSpan > 7) {
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric'
      });
    } else {
      return date.toLocaleDateString(undefined, { 
        month: 'numeric', 
        day: 'numeric' 
      }) + ' ' + date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  });
  
  const altitudeData = validSpots.map(spot => spot.altitude / 1000);
  
  altitudeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Altitude (km)',
        data: altitudeData,
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: daysSpan > 30 ? 2 : 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              const feet = Math.round(value * 3280.84);
              return `Altitude: ${value.toFixed(2)} km (${feet} ft)`;
            },
            title: function(context) {
              const date = new Date(validSpots[context[0].dataIndex].ts);
              return date.toLocaleString();
            }
          }
        },
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Date'
          },
          ticks: {
            maxTicksLimit: daysSpan > 30 ? 8 : 6,
            autoSkip: true,
            maxRotation: 45,
            font: {
              size: 10
            }
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Altitude (km)'
          },
          beginAtZero: false
        }
      },
      interaction: {
        mode: 'index',
        axis: 'x',
        intersect: false
      },
      onHover: (event, activeElements) => {
        if (activeElements.length > 0) {
          event.native.target.style.cursor = 'pointer';
        }
      }
    }
  });
}

function createSpeedChart(spots) {
  const ctx = document.getElementById('speed-chart').getContext('2d');
  
  if (speedChart) {
    speedChart.destroy();
  }
  
  const validSpots = spots.filter(spot => spot.speed !== undefined && spot.speed !== null)
                          .sort((a, b) => a.ts - b.ts);
  
  if (validSpots.length === 0) {
    const canvas = document.getElementById('speed-chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6c757d';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No speed data available', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  const timeSpan = validSpots[validSpots.length - 1].ts - validSpots[0].ts;
  const daysSpan = timeSpan / (1000 * 60 * 60 * 24);
  
  const labels = validSpots.map(spot => {
    const date = new Date(spot.ts);
    if (daysSpan > 30) {
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric',
        year: '2-digit'
      });
    } else if (daysSpan > 7) {
      return date.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric'
      });
    } else {
      return date.toLocaleDateString(undefined, { 
        month: 'numeric', 
        day: 'numeric'
      }) + ' ' + date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  });
  
  const speedData = validSpots.map(spot => spot.speed);
  
  speedChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Speed (km/h)',
        data: speedData,
        borderColor: '#2196F3',
        backgroundColor: 'rgba(33, 150, 243, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: daysSpan > 30 ? 2 : 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              const mph = Math.round(value * 0.621371);
              return `Speed: ${Math.round(value)} km/h (${mph} mph)`;
            },
            title: function(context) {
              const date = new Date(validSpots[context[0].dataIndex].ts);
              return date.toLocaleString();
            }
          }
        },
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Date'
          },
          ticks: {
            maxTicksLimit: daysSpan > 30 ? 8 : 6,
            autoSkip: true,
            maxRotation: 45,
            font: {
              size: 10
            }
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Speed (km/h)'
          },
          beginAtZero: false
        }
      },
      interaction: {
        mode: 'index',
        axis: 'x',
        intersect: false
      },
      onHover: (event, activeElements) => {
        if (activeElements.length > 0) {
          event.native.target.style.cursor = 'pointer';
        }
      }
    }
  });
}

function updateChartSection(spots) {
  const chartSection = document.getElementById('chart-section');
  const hasAltitudeData = spots.some(spot => spot.altitude !== undefined && spot.altitude !== null);
  const hasSpeedData = spots.some(spot => spot.speed !== undefined && spot.speed !== null);
  
  if (hasAltitudeData || hasSpeedData) {
    chartSection.style.display = 'block';
    createAltitudeChart(spots);
    createSpeedChart(spots);
  } else {
    chartSection.style.display = 'none';
  }
}



// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setDefaultDates);
} else {
  setDefaultDates();
}

// Fallback: Check for pending callsign after a delay
setTimeout(() => {
  if (window.pendingCallsign && window.map) {
    console.log('Fallback: Found pending callsign and map exists - fetching data');
    fetchData();
    window.pendingCallsign = null;
  }
}, 2000);

 