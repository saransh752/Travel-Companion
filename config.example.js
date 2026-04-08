var config = {
    // Replace with your OpenWeatherMap API key
    MY_KEY: 'YOUR_OPENWEATHER_KEY_HERE',
    // Replace with your Geoapify Places key (recommended primary places API)
    GEOAPIFY_KEY: 'YOUR_GEOAPIFY_KEY_HERE',
    // Replace with your OpenTripMap key (fallback places API)
    OTM_KEY: 'YOUR_OPENTRIPMAP_KEY_HERE'
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
}
