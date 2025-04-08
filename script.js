mapboxgl.accessToken = 'pk.eyJ1Ijoic2FyYWhoZTA1IiwiYSI6ImNtN2NxdDR2djA3OTIycnB0OXNyenRmaW8ifQ.MIoVxDMYrSy-nm4YY2K-3A';

const MAPBOX_GEOCODING_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places/';
const EARTH_RADIUS_KM = 6371;

let allCrimeData = [];
let userLocation = null;
let followUser = true;
let tooltipBound = false;
let startCoord = null;
let endCoord = null;

// --- 📌 Utility Functions ---
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toGeoJSON(crimes) {
  return {
    type: 'FeatureCollection',
    features: crimes.map(crime => ({
      type: 'Feature',
      properties: {
        pd_offense_category: crime.pd_offense_category || "Unknown",
        code_section: (crime.code_section || "N/A").replace(/\|\|$/, ''),
        occurred_on: crime.occurred_on || "Date Unknown",
        block_addr: crime.block_addr || "Address not available"
      },
      geometry: {
        type: 'Point',
        coordinates: [crime.longitude, crime.latitude]
      }
    }))
  };
}

function filterCrimes(center, radiusKm = 2) {
  return allCrimeData.filter(crime =>
    getDistanceKm(center[1], center[0], crime.latitude, crime.longitude) <= radiusKm
  );
}

function updateMapSource(map, centerCoords) {
  const nearbyCrimes = filterCrimes(centerCoords);
  const geojson = toGeoJSON(nearbyCrimes);
  if (map.getSource('crimes')) {
    map.getSource('crimes').setData(geojson);
  }
}

function updateCrimeSnapshotPanel(days = 30) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - days);

  const prevCutoff = new Date(cutoff);
  prevCutoff.setDate(prevCutoff.getDate() - days);

  const neighborhood = document.getElementById("neighborhood").textContent.trim().toLowerCase();
  const center = window.currentMap.getCenter();
  const centerCoords = [center.lng, center.lat];

  const isRelevantCrime = (crime) => {
    const crimeHood = (crime.neighborhood || '').trim().toLowerCase();
    if (neighborhood && neighborhood !== "unavailable" && crimeHood === neighborhood) return true;
    return getDistanceKm(centerCoords[1], centerCoords[0], crime.latitude, crime.longitude) <= 2;
  };

  const currentCrimes = allCrimeData.filter(c =>
    new Date(c.occurred_on) >= cutoff && isRelevantCrime(c)
  );

  const prevCrimes = allCrimeData.filter(c =>
    new Date(c.occurred_on) >= prevCutoff &&
    new Date(c.occurred_on) < cutoff &&
    isRelevantCrime(c)
  );

  const typeCounts = {};
  currentCrimes.forEach(c => {
    const type = c.code_section || "Unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  const common = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
  document.getElementById("common-crime").textContent = common;

  const streetCounts = {};
  currentCrimes.forEach(c => {
    const street = c.block_addr || "Unknown";
    streetCounts[street] = (streetCounts[street] || 0) + 1;
  });
  const topStreets = Object.entries(streetCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);
  document.getElementById("hotspot-streets").textContent = topStreets.join(', ');

  const trendBox = document.getElementById("trend-box");
  if (prevCrimes.length === 0 && currentCrimes.length > 0) {
    trendBox.textContent = `▲ ${currentCrimes.length} new crimes (no data last period)`;
    trendBox.className = 'trend-box positive';
  } else if (prevCrimes.length === 0) {
    trendBox.textContent = 'No crimes in either period';
    trendBox.className = '';
  } else {
    const change = currentCrimes.length - prevCrimes.length;
    const percent = Math.round((change / prevCrimes.length) * 100);
    const sign = percent >= 0 ? '▲' : '▼';
    trendBox.textContent = `${sign} ${Math.abs(percent)}% from previous period`;
    trendBox.className = percent >= 0 ? 'trend-box positive' : 'trend-box negative';
  }

  const hourCounts = Array(24).fill(0);
  currentCrimes.forEach(c => {
    const hour = new Date(c.occurred_on).getHours();
    hourCounts[hour]++;
  });

  if (window.hourChart) window.hourChart.destroy();

  const ctx = document.getElementById("crime-hour-chart").getContext("2d");
  const currentHour = now.getHours();

  window.hourChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [...Array(24).keys()].map(h => `${h}:00`),
      datasets: [{
        label: 'Crimes by Hour',
        data: hourCounts,
        backgroundColor: hourCounts.map((_, i) =>
          i === currentHour ? '#a052d3' : '#36a2eb'
        )
      }]
    },
    options: {
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: false } }
    }
  });
}

// --- 🗺️ Map Setup ---
function initMap(centerCoords = [-117.1611, 32.7157]) {
  const map = new mapboxgl.Map({
    container: 'map-container',
    style: 'mapbox://styles/mapbox/navigation-day-v1',
    center: centerCoords,
    zoom: 17
  });

  window.currentMap = map;

  window.userMarker = new mapboxgl.Marker({ color: '#a052d3' })
    .setLngLat(centerCoords)
    .setPopup(new mapboxgl.Popup().setText("You are here!"))
    .addTo(map);

  map.on('dragstart', () => followUser = false);
  map.on('zoomstart', () => followUser = false);

  map.on('load', () => {
    removeTrafficLayers(map);

    Papa.parse('cleaned_crime_data.csv', {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (results) => {
        const aYearAgo = new Date();
        aYearAgo.setMonth(aYearAgo.getMonth() - 12);

        allCrimeData = results.data.filter(crime => {
          const date = new Date(crime.occurred_on);
          return date >= aYearAgo && !isNaN(crime.latitude) && !isNaN(crime.longitude);
        });

        map.addSource('crimes', {
          type: 'geojson',
          data: toGeoJSON([])
        });

        map.addLayer({
          id: 'nearby-points',
          type: 'circle',
          source: 'crimes',
          paint: {
            'circle-color': '#FF0000',
            'circle-radius': 6,
            'circle-opacity': 0.65
          }
        });

        setupCrimeTooltip(map);
        updateMapSource(map, centerCoords);
        updateLocationLabels(centerCoords[0], centerCoords[1]);
        updateCrimeSnapshotPanel(parseInt(document.getElementById("snapshot-range").value));
        setupRouteButtons(map);
      }
    });
  });

  map.on('moveend', () => {
    const center = map.getCenter();
    updateMapSource(map, [center.lng, center.lat]);
    updateLocationLabels(center.lng, center.lat);
    updateCrimeSnapshotPanel(parseInt(document.getElementById("snapshot-range").value));
  });
}

// --- 📍 Tooltip ---
function setupCrimeTooltip(map) {
  if (tooltipBound) return;
  tooltipBound = true;

  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    anchor: 'top',
    offset: 15
  });

  map.on('mouseenter', 'nearby-points', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const { pd_offense_category, code_section, occurred_on, block_addr } = e.features[0].properties;
    popup.setLngLat(e.lngLat).setHTML(`
      <strong>Category:</strong> ${pd_offense_category}<br>
      <strong>Code:</strong> ${code_section}<br>
      <strong>Occurred on:</strong> ${occurred_on}<br>
      <strong>Address:</strong> ${block_addr}
    `).addTo(map);
  });

  map.on('mouseleave', 'nearby-points', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });
}

// --- 🧭 GPS Tracking ---
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (position) => {
      const userCoords = [position.coords.longitude, position.coords.latitude];
      userLocation = userCoords;

      if (!window.mapInitialized) {
        initMap(userCoords);
        window.mapInitialized = true;
      } else {
        if (window.userMarker) window.userMarker.setLngLat(userCoords);
        if (followUser && window.currentMap) {
          window.currentMap.flyTo({
            center: userCoords,
            zoom: 17,
            speed: 1,
            essential: true
          });
        }
      }
    },
    () => {
      userLocation = [-117.1611, 32.7157];
      initMap();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    }
  );
}

// --- 🎯 Location Reset Button ---
document.getElementById("reset-location").addEventListener("click", () => {
  if (userLocation && window.currentMap) {
    followUser = true;
    window.currentMap.flyTo({
      center: userLocation,
      zoom: 17,
      essential: true
    });
    updateLocationLabels(userLocation[0], userLocation[1]);
    updateCrimeSnapshotPanel(parseInt(document.getElementById("snapshot-range").value));
  }
});

// --- ⏱️ Current Time ---
function updateCurrentTime() {
  document.getElementById("current-time").textContent = new Date().toLocaleString();
}
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

// --- 🧠 Location Labels ---
function updateLocationLabels(lng, lat) {
  const url = `${MAPBOX_GEOCODING_URL}${lng},${lat}.json?access_token=${mapboxgl.accessToken}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      let neighborhood = 'Unavailable';
      let street = 'Unavailable';
      for (const feature of data.features) {
        if (feature.place_type.includes('neighborhood')) neighborhood = feature.text;
        if (feature.place_type.includes('address') || feature.place_type.includes('street')) street = feature.place_name;
      }
      document.getElementById('neighborhood').textContent = neighborhood;
      document.getElementById('street').textContent = street;
    });
}

// --- 🚦 Remove Traffic Color Layers ---
function removeTrafficLayers(map) {
  const layers = map.getStyle().layers;
  layers.forEach(layer => {
    const paint = layer.paint || {};
    if (layer.type === 'line' && paint['line-color'] && /traffic/i.test(layer.id)) {
      map.setPaintProperty(layer.id, 'line-opacity', 0);
    }
  });
}

// --- 🌗 Dark Mode ---
const toggle = document.getElementById('mode-toggle');
toggle.addEventListener('change', () => {
  const isDark = toggle.checked;
  document.body.classList.toggle('dark-mode', isDark);

  if (!window.currentMap) return;

  const styleUrl = isDark
    ? 'mapbox://styles/mapbox/navigation-night-v1'
    : 'mapbox://styles/mapbox/navigation-day-v1';

  const center = window.currentMap.getCenter();

  window.currentMap.setStyle(styleUrl);

  window.currentMap.once('styledata', () => {
    window.currentMap.on('idle', () => removeTrafficLayers(window.currentMap));

    window.currentMap.addSource('crimes', {
      type: 'geojson',
      data: toGeoJSON(filterCrimes([center.lng, center.lat]))
    });

    window.currentMap.addLayer({
      id: 'nearby-points',
      type: 'circle',
      source: 'crimes',
      paint: {
        'circle-color': '#FF0000',
        'circle-radius': 6,
        'circle-opacity': 0.65
      }
    });

    setupCrimeTooltip(window.currentMap);
    updateLocationLabels(center.lng, center.lat);
    updateCrimeSnapshotPanel(parseInt(document.getElementById("snapshot-range").value));
  });
});

// --- 📊 Snapshot Range ---
document.getElementById("snapshot-range").addEventListener("change", (e) => {
  updateCrimeSnapshotPanel(parseInt(e.target.value));
});

// --- ✨ Route Drawing + Buttons ---
function setupRouteButtons(map) {
  map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#3887be', 'line-width': 5 } });

  map.addSource('route-buffer', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'route-buffer-fill', type: 'fill', source: 'route-buffer', paint: { 'fill-color': '#f03b20', 'fill-opacity': 0.2 } });

  const startGeocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl,
    placeholder: 'Start location'
  });
  const endGeocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl,
    placeholder: 'End location'
  });
  document.getElementById('start-geocoder')?.appendChild(startGeocoder.onAdd(map));
  document.getElementById('end-geocoder')?.appendChild(endGeocoder.onAdd(map));

  document.getElementById('use-current-location')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported by this browser.");
      return;
    }
  
    navigator.geolocation.getCurrentPosition(position => {
      const lng = position.coords.longitude;
      const lat = position.coords.latitude;
      startCoord = [lng, lat];
      const query = `${lng},${lat}`;
      startGeocoder.setInput(query);
      startGeocoder.query(query);
    }, () => {
      alert("Unable to access your location.");
    });
  });
  

  startGeocoder.on('result', e => { startCoord = e.result.geometry.coordinates; });
  endGeocoder.on('result', e => { endCoord = e.result.geometry.coordinates; });

  document.getElementById('analyze-route')?.addEventListener('click', () => {
    if (!startCoord || !endCoord) {
      alert('Please select both a start and end location.');
      return;
    }
    getRoute(map, { lng: startCoord[0], lat: startCoord[1] }, { lng: endCoord[0], lat: endCoord[1] });
  });

  document.getElementById('clear-route')?.addEventListener('click', () => {
    startCoord = null;
    endCoord = null;

    document.getElementById('route-insights').innerHTML = '';

    map.getSource('route')?.setData({ type: 'FeatureCollection', features: [] });
    map.getSource('route-buffer')?.setData({ type: 'FeatureCollection', features: [] });

    const startInput = document.querySelector('#start-geocoder input');
    const endInput = document.querySelector('#end-geocoder input');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
  });
}

async function getRoute(map, start, end) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  const route = data.routes[0].geometry;
  const routeFeature = { type: 'Feature', geometry: route };

  map.getSource('route')?.setData(routeFeature);
  const buffer = turf.buffer(routeFeature, 0.1, { units: 'kilometers' });
  map.getSource('route-buffer')?.setData(buffer);

  analyzeCrimes(buffer);
}

function analyzeCrimes(bufferPolygon) {
  const timeRange = parseInt(document.getElementById('snapshot-range')?.value || '30');
  const cutoff = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
  const crimesInBuffer = allCrimeData.filter(crime => {
    const point = turf.point([+crime.longitude, +crime.latitude]);
    const timestamp = new Date(crime.occurred_on || crime.timestamp);
    return turf.booleanPointInPolygon(point, bufferPolygon) && timestamp >= cutoff;
  });
  const summary = summarizeCrimes(crimesInBuffer);
  showInsights(summary);
}

function summarizeCrimes(crimes) {
  const stats = { total: crimes.length, categories: {} };
  crimes.forEach(crime => {
    const type = crime.pd_offense_category || "Unknown";
    stats.categories[type] = (stats.categories[type] || 0) + 1;
  });
  return stats;
}

function showInsights(summary) {
  const container = document.getElementById('route-insights');
  if (!container) return;
  container.innerHTML = `<h3>${summary.total} crimes along this route</h3>`;
  Object.entries(summary.categories).forEach(([type, count]) => {
    const p = document.createElement('p');
    p.textContent = `${type}: ${count}`;
    container.appendChild(p);
  });
}

// --- 🧠 Wait for Map Initialization ---
window.addEventListener('load', () => {
  const checkMap = () => {
    if (window.currentMap) {
      setupRouteButtons(window.currentMap);
    } else {
      setTimeout(checkMap, 250);
    }
  };
  checkMap();
});