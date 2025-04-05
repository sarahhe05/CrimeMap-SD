// Placeholder for initializing map, insights, and simulation
document.getElementById("start-simulation").addEventListener("click", function() {
    alert("Simulation mode is under development.");
});

// Replace with your own Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic2FyYWhoZTA1IiwiYSI6ImNtN2NxdDR2djA3OTIycnB0OXNyenRmaW8ifQ.MIoVxDMYrSy-nm4YY2K-3A';

function initMap() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const userLng = position.coords.longitude;
            const userLat = position.coords.latitude;

            // Create a new Mapbox map, centered on the user's location
            const map = new mapboxgl.Map({
                container: 'map-container',
                style: 'mapbox://styles/mapbox/streets-v11',
                center: [userLng, userLat],
                zoom: 17
            });

            // Add a marker at the user's current location
            new mapboxgl.Marker()
                .setLngLat([userLng, userLat])
                .setPopup(new mapboxgl.Popup().setText("You are here!"))
                .addTo(map);

        }, function(error) {
            console.warn('Geolocation failed. Defaulting to San Diego location.');

            const map = new mapboxgl.Map({
                container: 'map-container',
                style: 'mapbox://styles/mapbox/streets-v11',
                center: [-117.1611, 32.7157], // San Diego coordinates
                zoom: 17
            });

            // Add a marker at the default location (San Diego)
            new mapboxgl.Marker()
                .setLngLat([-117.1611, 32.7157])
                .setPopup(new mapboxgl.Popup().setText("Default location: San Diego"))
                .addTo(map);
        });
    } else {
        console.warn('Geolocation not supported. Defaulting to San Diego location.');

        const map = new mapboxgl.Map({
            container: 'map-container',
            style: 'mapbox://styles/mapbox/streets-v11',
            center: [-117.1611, 32.7157], // San Diego coordinates
            zoom: 17
        });

        // Add a marker at the default location (San Diego)
        new mapboxgl.Marker()
            .setLngLat([-117.1611, 32.7157])
            .setPopup(new mapboxgl.Popup().setText("Default location: San Diego"))
            .addTo(map);
    }
}

// Call the map initialization
initMap();

