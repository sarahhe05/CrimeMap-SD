// Placeholder for initializing map, insights, and simulation
document.getElementById("start-simulation").addEventListener("click", function() {
    alert("Simulation mode is under development.");
});

// Replace with your own Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic2FyYWhoZTA1IiwiYSI6ImNtN2NxdDR2djA3OTIycnB0OXNyenRmaW8ifQ.MIoVxDMYrSy-nm4YY2K-3A';

const EARTH_RADIUS_KM = 6371;
let allCrimeData = []; // Full dataset in memory
let userLocation = null; // Store user's initial location

// Haversine formula
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
            properties: {},
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

function initMap(centerCoords = [-117.1611, 32.7157]) {
    const map = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: centerCoords,
        zoom: 15
    });

    window.currentMap = map; // So reset button can access it

    new mapboxgl.Marker({ color: "#2ecc71" })
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
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(currentDate.getMonth() - 6);

                allCrimeData = results.data.filter(crime => {
                    const occurredOn = new Date(crime.occurred_on);
                    const hasValidCoords = !isNaN(crime.latitude) && !isNaN(crime.longitude);
                    return occurredOn >= sixMonthsAgo && hasValidCoords;
                });

                map.addSource('crimes', {
                    type: 'geojson',
                    data: toGeoJSON([]) // start empty
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
            },
            error: function (error) {
                console.error('Error parsing CSV:', error);
            }
        });
    });

    // Update nearby crimes whenever the map stops moving
    map.on('moveend', () => {
        const center = map.getCenter();
        updateMapSource(map, [center.lng, center.lat]);
    });
}

// Get user location and initialize map
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const userCoords = [position.coords.longitude, position.coords.latitude];
            userLocation = userCoords;
            initMap(userCoords);
        },
        (error) => {
            console.warn('Geolocation failed. Using default location.');
            userLocation = [-117.1611, 32.7157];
            initMap();
        }
    );
} else {
    console.warn('Geolocation not supported.');
    userLocation = [-117.1611, 32.7157];
    initMap();
}

// Reset map to original location
document.getElementById("reset-location").addEventListener("click", () => {
    if (userLocation && window.currentMap) {
        window.currentMap.flyTo({
            center: userLocation,
            zoom: 15,
            essential: true
        });
    }
});