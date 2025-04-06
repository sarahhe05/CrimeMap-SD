mapboxgl.accessToken = 'pk.eyJ1Ijoic2FyYWhoZTA1IiwiYSI6ImNtN2NxdDR2djA3OTIycnB0OXNyenRmaW8ifQ.MIoVxDMYrSy-nm4YY2K-3A';

const MAPBOX_GEOCODING_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places/';
const EARTH_RADIUS_KM = 6371;
let allCrimeData = [];
let userLocation = null;

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
}

function filterCrimes(center, radiusKm = 2) {
    return allCrimeData.filter(crime => {
        return getDistanceKm(center[1], center[0], crime.latitude, crime.longitude) <= radiusKm;
    });
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

function updateMapSource(map, centerCoords) {
    const nearbyCrimes = filterCrimes(centerCoords);
    const geojson = toGeoJSON(nearbyCrimes);
    if (map.getSource('crimes')) {
        map.getSource('crimes').setData(geojson);
    }
}

function updateCurrentTime() {
    const now = new Date();
    const timeStr = now.toLocaleString();
    const timeElement = document.getElementById("current-time");
    if (timeElement) timeElement.textContent = timeStr;
}
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

function updateLocationLabels(lng, lat) {
    const url = `${MAPBOX_GEOCODING_URL}${lng},${lat}.json?access_token=${mapboxgl.accessToken}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            const features = data.features;

            let neighborhood = 'Unavailable';
            let street = 'Unavailable';

            for (const feature of features) {
                if (feature.place_type.includes('neighborhood')) {
                    neighborhood = feature.text;
                }
                if (feature.place_type.includes('address') || feature.place_type.includes('street')) {
                    street = feature.place_name;
                }
            }

            document.getElementById('neighborhood').textContent = neighborhood;
            document.getElementById('street').textContent = street;
        })
        .catch(error => {
            console.error('Geocoding failed:', error);
            document.getElementById('neighborhood').textContent = 'Error';
            document.getElementById('street').textContent = 'Error';
        });
}

function initMap(centerCoords = [-117.1611, 32.7157]) {
    const map = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: centerCoords,
        zoom: 17
    });

    window.currentMap = map;

    window.userMarker = new mapboxgl.Marker({ color: "#2ecc71" })
        .setLngLat(centerCoords)
        .setPopup(new mapboxgl.Popup().setText("You are here!"))
        .addTo(map);


    map.on('load', () => {
        Papa.parse('cleaned_crime_data.csv', {
            download: true,
            header: true,
            dynamicTyping: true,
            complete: function (results) {
                const currentDate = new Date();
                const aYearAgo = new Date();
                aYearAgo.setMonth(currentDate.getMonth() - 12);

                allCrimeData = results.data.filter(crime => {
                    const occurredOn = new Date(crime.occurred_on);
                    const hasValidCoords = !isNaN(crime.latitude) && !isNaN(crime.longitude);
                    return occurredOn >= aYearAgo && hasValidCoords;
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
                        'circle-opacity': 0.7
                    }
                });

                updateMapSource(map, centerCoords);
                updateLocationLabels(centerCoords[0], centerCoords[1]);

                // === Tooltip on hover ===
                const popup = new mapboxgl.Popup({
                    closeButton: false,
                    closeOnClick: false
                });

                map.on('mouseenter', 'nearby-points', (e) => {
                    map.getCanvas().style.cursor = 'pointer';

                    const feature = e.features[0];
                    const { pd_offense_category, code_section, occurred_on, block_addr } = feature.properties;

                    const html = `
                        <strong>Category:</strong> ${pd_offense_category}<br>
                        <strong>Code:</strong> ${code_section}<br>
                        <strong>Occurred on:</strong> ${occurred_on}<br>
                        <strong>Address:</strong> ${block_addr}
                    `;

                    popup
                        .setLngLat(e.lngLat)
                        .setHTML(html)
                        .addTo(map);
                });

                map.on('mouseleave', 'nearby-points', () => {
                    map.getCanvas().style.cursor = '';
                    popup.remove();
                });
            },
            error: function (error) {
                console.error('Error parsing CSV:', error);
            }
        });
        map.resize(); // 🔁 force re-measure and fill container
    });

    map.on('moveend', () => {
        const center = map.getCenter();
        updateMapSource(map, [center.lng, center.lat]);
        updateLocationLabels(center.lng, center.lat);
        updateCrimeSnapshotPanel(30);
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
        }
  
        // Update user marker if already added
        if (window.userMarker) {
          window.userMarker.setLngLat(userCoords);
        }
      },
      (error) => {
        console.warn('Geolocation failed. Using default location.');
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
        window.currentMap.flyTo({
            center: userLocation,
            zoom: 17,
            essential: true
        });
        updateLocationLabels(userLocation[0], userLocation[1]);
    }
});

function updateCrimeSnapshotPanel(days = 30) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);

    // ✅ clone it safely
    const prevCutoff = new Date(cutoff);
    prevCutoff.setDate(prevCutoff.getDate() - days);



    const currentNeighborhood = document.getElementById("neighborhood").textContent.trim().toLowerCase();

    // Helper to check crime against neighborhood or fallback to radius
    function isRelevantCrime(crime, fallbackCenter, fallbackRadius = 2) {
        const crimeNeighborhood = (crime.neighborhood || "").trim().toLowerCase();
        const mapNeighborhood = document.getElementById("neighborhood").textContent.trim().toLowerCase();
      
        // If the map neighborhood is valid and matches the crime
        if (
          mapNeighborhood &&
          mapNeighborhood !== "unavailable" &&
          crimeNeighborhood &&
          crimeNeighborhood === mapNeighborhood
        ) {
          return true;
        }
      
        // Otherwise, fall back to distance check
        return getDistanceKm(fallbackCenter[1], fallbackCenter[0], crime.latitude, crime.longitude) <= fallbackRadius;
      }

      const center = window.currentMap.getCenter();
      const centerCoords = [center.lng, center.lat];
      
      const radiusKm = 2;
      
      const currentCrimes = allCrimeData.filter(c =>
        new Date(c.occurred_on) >= cutoff &&
        isRelevantCrime(c, centerCoords)
      );
      
      const prevCrimes = allCrimeData.filter(c =>
        new Date(c.occurred_on) >= prevCutoff &&
        new Date(c.occurred_on) < cutoff &&
        isRelevantCrime(c, centerCoords)
      );
      

    // Most common crime
    const crimeTypes = {};
    currentCrimes.forEach(c => {
        const type = c.pd_offense_category || "Unknown";
        crimeTypes[type] = (crimeTypes[type] || 0) + 1;
    });
    const common = Object.entries(crimeTypes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
    document.getElementById("common-crime").textContent = common;

    // Top 3 streets
    const streetCounts = {};
    currentCrimes.forEach(c => {
        const street = c.block_addr || "Unknown";
        streetCounts[street] = (streetCounts[street] || 0) + 1;
    });
    const topStreets = Object.entries(streetCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([s]) => s);
    document.getElementById("hotspot-streets").textContent = topStreets.join(', ');

    // % change
    let percent;
    let trendText = '';
    let trendBox = document.getElementById("trend-box");

    if (prevCrimes.length === 0 && currentCrimes.length > 0) {
        percent = 100;
        trendText = `▲ ${currentCrimes.length} new crimes (no data last period)`;
        trendBox.className = 'trend-box positive';
    } else if (prevCrimes.length === 0 && currentCrimes.length === 0) {
        percent = 0;
        trendText = `No crimes in either period`;
        trendBox.className = '';
    } else {
        const change = currentCrimes.length - prevCrimes.length;
        percent = Math.round((change / prevCrimes.length) * 100);
        const sign = percent >= 0 ? '▲' : '▼';
        trendText = `${sign} ${Math.abs(percent)}% from previous period`;
        trendBox.className = percent >= 0 ? 'trend-box positive' : 'trend-box negative';
    }

    trendBox.textContent = trendText;

const debugSample = allCrimeData.filter(c => {
  const date = new Date(c.occurred_on);
  return !isNaN(date) && date >= prevCutoff && date < cutoff;
});
console.log("Crimes in previous period (before location filtering):", debugSample.length);


    // Bar chart by hour
    const hourCounts = Array(24).fill(0);
    currentCrimes.forEach(c => {
        const hour = new Date(c.occurred_on).getHours();
        hourCounts[hour]++;
    });

    const currentHour = now.getHours();

    if (window.hourChart) window.hourChart.destroy();

    const ctx = document.getElementById("crime-hour-chart").getContext("2d");
    window.hourChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [...Array(24).keys()].map(h => `${h}:00`),
            datasets: [{
                label: 'Crimes by Hour',
                data: hourCounts,
                backgroundColor: hourCounts.map((_, i) => i === currentHour ? '#ff4d4f' : '#36a2eb')
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

  
  document.getElementById("snapshot-range").addEventListener("change", (e) => {
    updateCrimeSnapshotPanel(parseInt(e.target.value));
  });
  
  