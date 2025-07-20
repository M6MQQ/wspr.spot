# WSPR.spot - WSPR Signal Tracking and Telemetry Visualization

WSPR.spot is an interactive web application for tracking and visualizing WSPR (Weak Signal Propagation Reporter) signals from amateur radio stations and high-altitude balloons. The application provides both standard WSPR tracking and enhanced telemetry capabilities for Traquito balloon tracking.

## Features

### Standard WSPR Tracking
- Track WSPR signals by callsign with customizable date ranges
- Interactive map visualization using MapLibre GL JS
- Real-time signal reception data from multiple stations
- Time-based filtering with transmission pattern analysis
- Shareable URLs for easy collaboration

### Enhanced Telemetry (Traquito Support)
- Advanced balloon tracking with altitude, speed, voltage, and temperature data
- Channel-based telemetry decoding (0-599 channels)
- Multi-band support (160m, 80m, 60m, 40m, 30m, 20m, 17m, 15m, 12m, 10m, 6m)
- Flight time calculations and trajectory analysis
- Animated playback of signal progression over time

### Visualization & Analysis
- Interactive world map with signal spot visualization
- Altitude and speed charts over time
- Receiver network analysis with SNR and distance data
- CSV export functionality for data analysis
- Responsive design for desktop and mobile use

## Technology Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Mapping:** MapLibre GL JS for interactive maps
- **Charts:** Chart.js with date-fns adapter
- **Data Source:** wspr.live API for WSPR data
- **Telemetry:** Enhanced decoding based on wsprtv project

## Getting Started

1. Clone the repository
2. Open `index.html` in a web browser
3. Enter a callsign and date range to start tracking
4. For enhanced telemetry, add channel and band information

## Use Cases

- **Amateur Radio:** Track your WSPR transmissions and analyze propagation
- **High-Altitude Balloons:** Monitor Traquito balloon flights with enhanced telemetry
- **Propagation Research:** Study signal propagation patterns and conditions
- **Educational:** Learn about radio propagation and atmospheric conditions

## Data Sources

- WSPR data from [wspr.live](https://wspr.live)
- Enhanced telemetry decoding based on [wsprtv](https://github.com/wsprtv/wsprtv.github.io)

## Project Structure

### Core Files

#### `index.html`
The main HTML file that provides the user interface structure:
- Form controls for callsign, date range, channel, and band selection
- Map container for signal visualization
- Chart sections for altitude and speed analysis
- Results table for detailed spot data
- Footer with attribution and links

#### `app.js` (Main Application Logic)
Contains the core application functionality:

**Global Variables:**
- `currentSpots`: GeoJSON feature collection for current map data
- `lastFetchedSpots`: Backup of previously fetched data
- `uniqueSpotsForAnimation`: Spots for animation playback
- `reg_cs_data` & `basic_tel_data`: Telemetry data arrays
- Animation and chart variables

**Key Functions:**
- `getUrlParams()`: Parse URL parameters for shareable links
- `updateUrl()`: Update browser URL with current search parameters
- `getShareableUrl()`: Generate shareable URL with current settings
- `copyShareableUrl()`: Copy URL to clipboard
- `setDefaultDates()`: Initialize form with default dates and URL parameters
- `fetchData()`: Main data fetching function with validation
- `fetchRegularData()`: Fetch standard WSPR data for a callsign
- `fetchEnhancedTelemetry()`: Fetch enhanced telemetry data for balloon tracking
- `calculateFlightTime()`: Calculate balloon flight duration
- `toggleAnimation()`: Start/stop signal animation playback
- `startAnimation()`: Begin animated playback of signals over time
- `stopAnimation()`: Stop animation and reset controls
- `showNextSpot()`: Display next spot in animation sequence
- `createAltitudeChart()`: Generate altitude over time chart
- `createSpeedChart()`: Generate speed over time chart
- `updateChartSection()`: Update chart display with new data
- `downloadCSV()`: Export spot data to CSV format
- `convertToImperial()`: Convert metric values to imperial units
- `showReceiverDetails()`: Display detailed receiver information

#### `telemetry.js` (Enhanced Telemetry Processing)
Handles advanced telemetry decoding for balloon tracking:

**Constants:**
- `kBandInfo`: Band configuration for different frequencies
- `kWsprPowers`: WSPR power level mappings

**Key Functions:**
- `charToNum()`: Convert characters to numerical values for decoding
- `decodeSpot()`: Decode individual spot with enhanced telemetry data
- `decodeSpots()`: Process array of spots with telemetry decoding
- `findCoreceiver()`: Find common receivers between two spot arrays
- `matchTelemetry()`: Match regular callsign data with telemetry data
- `createRegularCallsignQuery()`: Generate SQL query for regular callsign data
- `createBasicTelemetryQuery()`: Generate SQL query for telemetry data
- `fetchEnhancedTelemetry()`: Fetch and process enhanced telemetry data
- `importRegularCallsignData()`: Import regular callsign data from API
- `importBasicTelemetryData()`: Import telemetry data from API

#### `map.js` (Map Visualization)
Manages the interactive map functionality:

**Global Variables:**
- `window.map`: MapLibre GL JS map instance

**Key Functions:**
- `setupMapLayersAndHandlers()`: Configure map layers and event handlers
- `gridToLatLon()`: Convert Maidenhead grid coordinates to lat/lon
- `updateMapData()`: Update map with new spot data
- `flyToMap()`: Animate map to specific coordinates
- `easeToMap()`: Smooth transition to coordinates for animation
- `onMapMoveEnd()`: Handle map movement completion
- `initializeMap()`: Initialize the MapLibre GL JS map

#### `styles.css`
CSS styling for the application interface:
- Responsive layout design
- Form styling and validation states
- Map container styling
- Chart and table formatting
- Animation and interactive element styles

### Supporting Files

#### `favicon.ico`
Website favicon for browser tabs

#### `backup/` Directory
Contains archived versions and test files:
- `test/`: Test files including map tiles and test data
- `working/`: Working version backups
- Various archive files

## API Integration

The application integrates with the wspr.live API to fetch WSPR data:

**Standard WSPR Query:**
```sql
SELECT 
  time as date,
  frequency/1000000.0 as band,
  rx_sign,
  snr,
  distance,
  rx_loc as grid
FROM wspr.rx
WHERE tx_sign = '[CALLSIGN]' 
  AND time >= '[START_TIME]' 
  AND time <= '[END_TIME]'
```

**Enhanced Telemetry Queries:**
- Regular callsign queries with channel and band filtering
- Basic telemetry queries for balloon data
- Co-receiver matching for data correlation

## Data Processing

### Standard WSPR Mode
1. User enters callsign and date range
2. Application queries wspr.live API
3. Data is processed and displayed on map
4. Results table shows detailed reception information

### Enhanced Telemetry Mode
1. User enters callsign, channel, and band
2. Application fetches both regular and telemetry data
3. Data is matched using co-receiver analysis
4. Enhanced telemetry is decoded (altitude, speed, voltage, temperature)
5. Combined data is displayed with charts and animations

## Browser Compatibility

- Modern browsers with ES6+ support
- MapLibre GL JS compatibility
- Chart.js rendering support
- Local file serving required for development

## Development

To run the application locally:
```bash
cd /path/to/wspr.spot
python3 -m http.server 8002
```

Then open `http://localhost:8002` in your browser.

## License

Open source - see LICENSE file for details.

---

*Developed by M6MQQ for the amateur radio and high-altitude balloon communities.* 