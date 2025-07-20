// Map.js - MapLibre GL JS functionality for WSPR.spot

// Global map variable - make it accessible to other scripts
window.map = null;

// Function to setup map layers and handlers
function setupMapLayersAndHandlers() {
  console.log('Setting up map layers and handlers');
  
  // Remove existing layers and sources if they exist
  if (window.map.getLayer('spots-layer')) {
    console.log('Removing existing spots-layer');
    window.map.removeLayer('spots-layer');
  }
  if (window.map.getSource('spots')) {
    console.log('Removing existing spots source');
    window.map.removeSource('spots');
  }

  // Add spots source
  console.log('Adding spots source with data:', currentSpots);
  window.map.addSource('spots', {
    type: 'geojson',
    data: currentSpots
  });

  // Add circle layer for spots
  console.log('Adding spots layer');
  window.map.addLayer({
    id: 'spots-layer',
    type: 'circle',
    source: 'spots',
    paint: {
      'circle-radius': 6,
      'circle-color': [
        'case',
        ['==', ['get', 'isLatest'], 1], '#ff8c00',  // orange for latest spot
        '#4264fb'  // default blue for others
      ],
      'circle-opacity': 0.8,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#ffffff'
    }
  });

  // Setup popup
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  window.map.on('mouseenter', 'spots-layer', (e) => {
    window.map.getCanvas().style.cursor = 'pointer';
    
    const coordinates = e.features[0].geometry.coordinates.slice();
    const properties = e.features[0].properties;
    console.log('Popup properties:', properties); // Debug log
    
    const receivers = JSON.parse(properties.receivers);
    
    let html = `
      <strong>Transmitter Location: ${properties.tx_loc}</strong><br>
      Time: ${new Date(properties.date + 'Z').toLocaleString()}<br>
      Received by: ${properties.receiverCount} stations<br>
    `;
    
    // Add enhanced telemetry data if available
    if (properties.hasTelemetry) {
      console.log('Enhanced telemetry detected:', {
        altitude: properties.altitude,
        speed: properties.speed,
        voltage: properties.voltage,
        temp: properties.temp,
        grid6: properties.grid6
      }); // Debug log
      
      html += `<br><strong>Enhanced Telemetry:</strong><br>`;
      
      if (properties.altitude !== undefined && properties.altitude !== null) {
        html += `Altitude: ${(properties.altitude / 1000).toFixed(2)} km<br>`;
      }
      
      if (properties.speed !== undefined && properties.speed !== null) {
        html += `Speed: ${Math.round(properties.speed)} km/h<br>`;
      }
      
      if (properties.voltage !== undefined && properties.voltage !== null) {
        html += `Voltage: ${properties.voltage.toFixed(2)}V<br>`;
      }
      
      if (properties.temp !== undefined && properties.temp !== null) {
        html += `Temperature: ${properties.temp}°C<br>`;
      }
      
      if (properties.grid6) {
        html += `Grid6: ${properties.grid6}<br>`;
      }
    } else {
      console.log('No enhanced telemetry detected'); // Debug log
    }
    
    html += `<br><strong>Receivers:</strong><br>`;
    
    // Handle different receiver data structures for regular vs enhanced mode
    if (receivers.length > 0 && receivers[0].band !== undefined) {
      // Regular mode - has band, snr, distance properties
      html += receivers.map(rx => `
        ${rx.rx_sign} (${rx.grid})<br>
        SNR: ${rx.snr} dB, Band: ${rx.band.toFixed(3)} MHz<br>
        Distance: ${rx.distance} km
      `).join('<br>');
    } else {
      // Enhanced mode - has cs, grid, freq, snr properties
      html += receivers.map(rx => `
        ${rx.cs} (${rx.grid})<br>
        SNR: ${rx.snr} dB, Frequency: ${(rx.freq / 1000000).toFixed(3)} MHz
      `).join('<br>');
    }

    popup.setLngLat(coordinates).setHTML(html).addTo(window.map);
  });

  window.map.on('mouseleave', 'spots-layer', () => {
    window.map.getCanvas().style.cursor = '';
    popup.remove();
  });
}

// Function to convert Maidenhead grid to lat/lon
function gridToLatLon(grid) {
  if (!grid || grid.length < 4) return null;
  
  // Store original grid for subsquare calculation
  const originalGrid = grid;
  grid = grid.toUpperCase();
  
  // Field calculation (first pair)
  // Longitude: first letter represents 20° zones starting from 180° W (-180°)
  const fieldLon = (grid.charCodeAt(0) - 65) * 20 - 180;
  // Latitude: second letter represents 10° zones starting from 90° S (-90°)
  const fieldLat = (grid.charCodeAt(1) - 65) * 10 - 90;
  
  // Square calculation (second pair)
  // Each digit represents 2° longitude and 1° latitude
  const squareLon = parseInt(grid[2]) * 2;
  const squareLat = parseInt(grid[3]);
  
  // Subsquare calculation (third pair) if present
  // Each letter represents 5 minutes of longitude and 2.5 minutes of latitude
  let subSquareLon = 0;
  let subSquareLat = 0;
  if (originalGrid.length >= 6) {
    subSquareLon = (originalGrid.charCodeAt(4) - 97) * (5/60) + (5/60)/2;  // 5 minutes of arc, use 'a' as base for lowercase grid
    subSquareLat = (originalGrid.charCodeAt(5) - 97) * (2.5/60) + (2.5/60)/2;  // 2.5 minutes of arc, use 'a' as base for lowercase grid
  }
  
  // Calculate final coordinates
  const lon = fieldLon + squareLon + subSquareLon;
  const lat = fieldLat + squareLat + subSquareLat;
  
  return [lon, lat];
}

// Function to update map data
function updateMapData(data) {
  if (window.map && window.map.getSource('spots')) {
    window.map.getSource('spots').setData(data);
  } else {
    console.warn('Map or spots source not available, data will be updated when map is ready');
    // Store the data to be applied when map is ready
    window.pendingSpotsData = data;
  }
}

// Function to fly to coordinates
function flyToMap(coordinates, zoom = 4, duration = 1000) {
  if (window.map && coordinates) {
    window.map.flyTo({
      center: coordinates,
      zoom: zoom,
      duration: duration
    });
  }
}

// Function to ease to coordinates (for animation)
function easeToMap(coordinates, zoom = 4, duration = 150) {
  if (window.map && coordinates) {
    // Use easeTo instead of flyTo for smoother transitions, especially in 3D
    // Add constraints to prevent spinning in 3D mode
    const currentCenter = window.map.getCenter();
    const currentLng = currentCenter.lng;
    const targetLng = coordinates[0];
    
    // Calculate the shortest longitude difference to prevent spinning
    let lngDiff = targetLng - currentLng;
    if (lngDiff > 180) lngDiff -= 360;
    if (lngDiff < -180) lngDiff += 360;
    
    const newLng = currentLng + lngDiff;
    
    map.easeTo({
      center: [newLng, coordinates[1]],
      zoom: zoom,
      duration: duration,
      easing: (t) => t // Linear easing for more predictable movement
    });
  }
}

// Function to wait for map animation to complete
function onMapMoveEnd(callback) {
  if (window.map) {
    window.map.once('moveend', callback);
  }
}

// Initialize map when DOM is ready
function initializeMap() {
  // Initialize map
  window.map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',  // Set Voyager style as default
    center: [0, 51.5],
    zoom: 4
  });

  // Initial setup when map first loads
  window.map.on('load', () => {
    console.log('Map loaded, setting up layers and handlers');
    setupMapLayersAndHandlers();
    
    // If there's pending spots data, apply it now that the map is ready
    if (window.pendingSpotsData) {
      console.log('Found pending spots data, applying to map');
      if (window.map && window.map.getSource('spots')) {
        window.map.getSource('spots').setData(window.pendingSpotsData);
      }
      window.pendingSpotsData = null; // Clear the pending data
    }
    
    // If there's a pending callsign from URL parameters, fetch data now that map is ready
    if (window.pendingCallsign) {
      console.log('Found pending callsign:', window.pendingCallsign, '- fetching data automatically');
      fetchData();
      window.pendingCallsign = null; // Clear the pending callsign
    } else {
      console.log('No pending callsign found');
    }
  });
}

// Initialize map when the script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMap);
} else {
  initializeMap();
} 