// Placeholder for initializing map, insights, and simulation
document.getElementById("start-simulation").addEventListener("click", function() {
    alert("Simulation mode is under development.");
});

// Replace with your own Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic2FyYWhoZTA1IiwiYSI6ImNtN2NxdDR2djA3OTIycnB0OXNyenRmaW8ifQ.MIoVxDMYrSy-nm4YY2K-3A';

function initMap() {
    const defaultCenter = [-117.1611, 32.7157]; // San Diego
    const map = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: defaultCenter,
        zoom: 12
    });

    map.on('load', () => {
        Papa.parse('cleaned_crime_data.csv', {
            download: true,
            header: true,
            dynamicTyping: true,
            complete: function (results) {
                const currentDate = new Date();
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(currentDate.getMonth() - 6);

                const crimeData = results.data.filter(crime => {
                    const occurredOn = new Date(crime.occurred_on);
                    return occurredOn >= sixMonthsAgo && !isNaN(crime.latitude) && !isNaN(crime.longitude);
                });

                // Convert to GeoJSON
                const geojson = {
                    type: 'FeatureCollection',
                    features: crimeData.map(crime => ({
                        type: 'Feature',
                        properties: {}, // Add custom popup text or metadata here
                        geometry: {
                            type: 'Point',
                            coordinates: [crime.longitude, crime.latitude]
                        }
                    }))
                };

                // Add the crime data as a source with clustering enabled
                map.addSource('crimes', {
                    type: 'geojson',
                    data: geojson,
                    cluster: true,
                    clusterMaxZoom: 14,
                    clusterRadius: 50
                });

                // Add clustered layer
                map.addLayer({
                    id: 'clusters',
                    type: 'circle',
                    source: 'crimes',
                    filter: ['has', 'point_count'],
                    paint: {
                        'circle-color': '#FF5722',
                        'circle-radius': ['step', ['get', 'point_count'], 15, 100, 25, 750, 35],
                        'circle-opacity': 0.7
                    }
                });

                // Add cluster count labels
                map.addLayer({
                    id: 'cluster-count',
                    type: 'symbol',
                    source: 'crimes',
                    filter: ['has', 'point_count'],
                    layout: {
                        'text-field': '{point_count_abbreviated}',
                        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                        'text-size': 12
                    }
                });

                // Add individual points
                map.addLayer({
                    id: 'unclustered-point',
                    type: 'circle',
                    source: 'crimes',
                    filter: ['!', ['has', 'point_count']],
                    paint: {
                        'circle-color': '#0088cc',
                        'circle-radius': 5,
                        'circle-opacity': 0.6
                    }
                });
            },
            error: function (error) {
                console.error('Error parsing CSV:', error);
            }
        });
    });
}

initMap();
