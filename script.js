mapboxgl.accessToken = 'pk.eyJ1Ijoic2FyYWhoZTA1IiwiYSI6ImNtN2NxdDR2djA3OTIycnB0OXNyenRmaW8ifQ.MIoVxDMYrSy-nm4YY2K-3A';

const toggle = document.getElementById('mode-toggle');
toggle.addEventListener('change', () => {
  const isDark = toggle.checked;
  document.body.classList.toggle('dark-mode', isDark);

  if (window.currentMap) {
    const styleUrl = isDark
      ? 'mapbox://styles/mapbox/navigation-night-v1'
      : 'mapbox://styles/mapbox/navigation-day-v1';

    const center = window.currentMap.getCenter();
    const zoom = window.currentMap.getZoom();

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

      updateLocationLabels(center.lng, center.lat);
      updateCrimeSnapshotPanel(parseInt(document.getElementById("snapshot-range").value));
    });
  }
});

function removeTrafficLayers(map) {
  const allLayers = map.getStyle().layers;

  allLayers.forEach(layer => {
    if (
      layer.type === 'line' &&
      layer.paint &&
      layer.paint['line-color'] &&
      /traffic/i.test(layer.id)
    ) {
      map.setPaintProperty(layer.id, 'line-opacity', 0); // Hide just the color
    }
  });
}

const MAPBOX_GEOCODING_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places/';
const EARTH_RADIUS_KM = 6371;
let allCrimeData = [];
let userLocation = null;
let followUser = true;

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

function updateCurrentTime() {
  document.getElementById("current-time").textContent = new Date().toLocaleString();
}
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

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

        updateMapSource(map, centerCoords);
        updateLocationLabels(centerCoords[0], centerCoords[1]);
        updateCrimeSnapshotPanel(parseInt(document.getElementById("snapshot-range").value));
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

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (position) => {
      const userCoords = [position.coords.longitude, position.coords.latitude];
      if (!window.mapInitialized) {
        userLocation = userCoords;
        initMap(userCoords);
        window.mapInitialized = true;
      } else {
        userLocation = userCoords;
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

document.getElementById("snapshot-range").addEventListener("change", (e) => {
  updateCrimeSnapshotPanel(parseInt(e.target.value));
});
