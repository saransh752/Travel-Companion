const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const loadingText = document.getElementById("loadingText");
const errorText = document.getElementById("errorText");
const results = document.getElementById("results");
const weatherCard = document.getElementById("weatherCard");
const countryCard = document.getElementById("countryCard");
const currencyCard = document.getElementById("currencyCard");
const placesCard = document.getElementById("placesCard");
const themeToggle = document.getElementById("themeToggle");
const recentSearchesWrap = document.getElementById("recentSearches");
const OPEN_WEATHER_KEY = (typeof config !== "undefined" && config.MY_KEY) ? config.MY_KEY : "";
const OTM_KEY = (typeof config !== "undefined" && config.OTM_KEY) ? config.OTM_KEY : "";
const GEOAPIFY_KEY = (typeof config !== "undefined" && config.GEOAPIFY_KEY) ? config.GEOAPIFY_KEY : "";
const RECENT_KEY = "travel_explorer_recent";
const PLACE_DETAIL_KEY = "travel_explorer_selected_place";
let allPlaces = [];
const DEFAULT_PLACE_IMAGE = "https://picsum.photos/seed/travel-default/600/400";
const placeImageCache = new Map();
const NOISY_NAME_PATTERNS = [
    /^m$/i,
    /^view$/i,
    /^road$/i,
    /^street$/i,
    /^gate$/i,
    /^house$/i,
    /^shop$/i,
    /^roundabout/i,
    /^rooftop/i,
    /chowk/i,
    /bazar/i
];

searchBtn.addEventListener("click", () => getTravelData());
searchInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") getTravelData();
});
themeToggle.addEventListener("click", toggleTheme);
renderRecentSearches();

function toggleTheme() {
    document.body.classList.toggle("dark-theme");
    themeToggle.textContent = document.body.classList.contains("dark-theme") ? "☀ Light" : "🌙 Dark";
}

function showLoading(show) {
    loadingText.classList.toggle("hide", !show);
}

function showError(message) {
    errorText.textContent = message;
    errorText.classList.remove("hide");
}

function hideError() {
    errorText.classList.add("hide");
}

function getCategoryFallbackImage(category) {
    const seed = `travel-${category || "travel"}-fallback`;
    return `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/400`;
}

async function getBestPlaceImage(placeName, cityName, category) {
    const cacheKey = `${placeName}::${cityName}`.toLowerCase();
    if (placeImageCache.has(cacheKey)) return placeImageCache.get(cacheKey);

    // 1) Exact summary image
    try {
        const exactRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(placeName)}`);
        if (exactRes.ok) {
            const exact = await exactRes.json();
            if (exact.thumbnail?.source) {
                placeImageCache.set(cacheKey, exact.thumbnail.source);
                return exact.thumbnail.source;
            }
        }
    } catch (_e) {}

    // 2) Best title match from Wikipedia search + summary image
    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(placeName + " " + cityName + " landmark")}&format=json&origin=*`;
        const searchRes = await fetch(searchUrl);
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            const candidates = searchData.query?.search || [];
            const placeTokens = placeName.toLowerCase().split(/\s+/).filter(Boolean);
            const best = candidates
                .map((c) => {
                    const title = c.title.toLowerCase();
                    const overlap = placeTokens.filter((t) => title.includes(t)).length;
                    return { ...c, overlap };
                })
                .filter((c) => c.overlap > 0)
                .sort((a, b) => b.overlap - a.overlap || b.wordcount - a.wordcount)
                .slice(0, 2);

            for (const item of best) {
                const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(item.title)}`);
                if (!sumRes.ok) continue;
                const sum = await sumRes.json();
                if (sum.thumbnail?.source) {
                    placeImageCache.set(cacheKey, sum.thumbnail.source);
                    return sum.thumbnail.source;
                }
            }
        }
    } catch (_e) {}

    // 3) Stable fallback if no image found
    const fallback = getCategoryFallbackImage(category);
    placeImageCache.set(cacheKey, fallback);
    return fallback;
}

// fetchLocation is now redundant as fetchWeather provides coordinates


async function fetchWeather(city) {
    // Primary source: OpenWeather (API key based)
    if (OPEN_WEATHER_KEY && OPEN_WEATHER_KEY !== "YOUR_API_KEY_HERE") {
        try {
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPEN_WEATHER_KEY}&units=metric`);
            if (!res.ok) throw new Error("Weather API failed.");
            const data = await res.json();
            return {
                cityName: data.name,
                countryCode: data.sys.country,
                temperature: Math.round(data.main.temp),
                condition: data.weather[0].main,
                icon: data.weather[0].icon,
                lat: data.coord.lat,
                lon: data.coord.lon
            };
        } catch (_e) {
            // Fall through to no-key fallback below
        }
    }

    // Fallback source: Open-Meteo (no API key required)
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    if (!geoRes.ok) throw new Error("Could not find location.");
    const geoData = await geoRes.json();
    const place = geoData.results && geoData.results[0];
    if (!place) throw new Error("Location not found.");

    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=auto`);
    if (!weatherRes.ok) throw new Error("Weather fallback failed.");
    const weatherData = await weatherRes.json();
    const weatherCodeMap = {
        0: "Clear", 1: "Mainly Clear", 2: "Partly Cloudy", 3: "Cloudy",
        45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
        61: "Rain", 63: "Rain", 65: "Heavy Rain", 71: "Snow", 73: "Snow",
        75: "Heavy Snow", 80: "Rain Showers", 81: "Rain Showers", 82: "Heavy Showers",
        95: "Thunderstorm"
    };
    const code = weatherData.current?.weather_code;
    return {
        cityName: place.name,
        countryCode: place.country_code,
        temperature: Math.round(weatherData.current?.temperature_2m || 0),
        condition: weatherCodeMap[code] || "Weather Update",
        icon: "01d",
        lat: place.latitude,
        lon: place.longitude
    };
}

async function fetchCountry(countryCode) {
    // Use alpha code from weather API for accurate country match.
    const res = await fetch(`https://restcountries.com/v3.1/alpha/${encodeURIComponent(countryCode)}`);
    if (!res.ok) throw new Error("Country API failed.");
    const data = await res.json();
    const country = Array.isArray(data) ? data[0] : null;
    if (!country) throw new Error("Country data not found.");

    const currencyCode = country.currencies ? Object.keys(country.currencies)[0] : "USD";
    const currencyName = country.currencies ? country.currencies[currencyCode].name : "US Dollar";

    return {
        name: country.name.common,
        capital: country.capital ? country.capital[0] : "N/A",
        population: country.population,
        region: country.region,
        flag: country.flags?.png || "",
        currencyCode,
        currencyName
    };
}

async function fetchCurrency() {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("Currency API failed.");
    const data = await res.json();
    return data.rates || {};
}

async function fetchPlaces(lat, lon, cityName) {
    let geoShortlist = [];
    // Primary source: Geoapify (key-based)
    if (GEOAPIFY_KEY) {
        try {
            const categories = "tourism.sights,tourism.attraction,heritage,religion.place_of_worship";
            const url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lon},${lat},20000&bias=proximity:${lon},${lat}&limit=80&apiKey=${GEOAPIFY_KEY}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Geoapify failed");
            const data = await res.json();
            const features = data.features || [];

            const merged = features
                .map((feature) => {
                    const props = feature.properties || {};
                    const title = (props.name || "").trim();
                    if (!title || title.length < 3) return null;
                    const badName = NOISY_NAME_PATTERNS.some((pattern) => pattern.test(title));
                    if (badName) return null;
                    const popularity = props.rank?.popularity || 0;
                    const confidence = props.rank?.confidence || 0;
                    if (popularity <= 0.25 || confidence <= 0.55) return null;
                    const address = props.formatted || props.address_line2 || props.address_line1 || "Address not available";
                    if (!address || address.toLowerCase().includes("unnamed")) return null;
                    return {
                        title,
                        description: `Famous place in ${cityName}. ${address}`,
                        image: "",
                        category: mapGeoapifyCategory(props.categories),
                        popularity,
                        confidence,
                        distance: props.distance || 0,
                        address,
                        wikipediaUrl: props.wiki ? `https://en.wikipedia.org/wiki/${props.wiki}` : "",
                        source: "Geoapify"
                    };
                })
                .filter(Boolean);

            const seen = new Set();
            let clean = merged.filter((item) => {
                const key = item.title.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            clean = await Promise.all(clean.map(async (place) => {
                const image = await getBestPlaceImage(place.title, cityName, place.category);
                return { ...place, image: image || DEFAULT_PLACE_IMAGE };
            }));

            clean.sort((a, b) => {
                if (Math.abs(a.popularity - b.popularity) > 0.05) return b.popularity - a.popularity;
                if (Math.abs(a.confidence - b.confidence) > 0.05) return b.confidence - a.confidence;
                return a.distance - b.distance;
            });
            geoShortlist = clean.slice(0, 10);
            if (geoShortlist.length >= 8) return geoShortlist;
        } catch (_geoErr) {
            // Try next source below
        }
    }

    // Secondary source: OpenTripMap (key-based)
    if (OTM_KEY) {
        try {
            const otmPlaces = await fetchPlacesFromOpenTripMap(lat, lon);
            if (otmPlaces.length) {
                const merged = [...geoShortlist, ...otmPlaces];
                const seen = new Set();
                const deduped = merged.filter((p) => {
                    const k = p.title.toLowerCase();
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
                if (deduped.length >= 8) return deduped.slice(0, 10);
            }
        } catch (_otmErr) {
            // Try next source below
        }
    }

    // Last fallback: Wikipedia-only (no key)
    const wikiFallback = await fetchPlacesFromWikipedia(cityName);
    const merged = [...geoShortlist, ...wikiFallback];
    const seen = new Set();
    return merged.filter((p) => {
        const k = p.title.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    }).slice(0, 10);
}

async function fetchPlacesFromOpenTripMap(lat, lon) {
    const radius = 10000;
    const listRes = await fetch(`https://api.opentripmap.com/0.1/en/places/radius?radius=${radius}&lon=${lon}&lat=${lat}&rate=2&format=json&limit=25&apikey=${OTM_KEY}`);
    if (!listRes.ok) return [];
    const listData = await listRes.json();
    const places = Array.isArray(listData) ? listData : [];

    const filtered = places
        .filter((p) => p.name && p.name.trim().length > 1)
        .sort((a, b) => (b.rate || 0) - (a.rate || 0))
        .slice(0, 15);

    const detailed = await Promise.all(filtered.map(async (p) => {
        if (!p.xid) return null;
        try {
            const detailRes = await fetch(`https://api.opentripmap.com/0.1/en/places/xid/${p.xid}?apikey=${OTM_KEY}`);
            if (!detailRes.ok) return null;
            const d = await detailRes.json();
            const title = d.name || p.name;
            const description = d.wikipedia_extracts?.text || d.info?.descr || "Popular tourist place.";
            const image = d.preview?.source || d.image || await getBestPlaceImage(title, title);
            return {
                title,
                description,
                image: image || getCategoryFallbackImage("travel"),
                category: detectCategory(title, description),
                source: "OpenTripMap"
            };
        } catch (_e) {
            return null;
        }
    }));

    return detailed.filter(Boolean);
}

async function fetchPlacesFromWikipedia(city) {
    const q = `${city} tourist attractions`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*`;
    const res = await fetch(searchUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const raw = data.query?.search || [];

    const filtered = raw
        .filter((item) => {
            const text = `${item.title} ${item.snippet}`.toLowerCase();
            return !text.includes("disambiguation") && !text.includes("list of") && !text.includes("wikipedia");
        })
        .sort((a, b) => b.wordcount - a.wordcount)
        .slice(0, 15);

    const detailed = await Promise.all(filtered.map(async (item) => {
        const cleanTitle = item.title.replace(/\s*\(.*?\)\s*/g, "").trim();
        try {
            const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`);
            if (!summaryRes.ok) return null;
            const summary = await summaryRes.json();
            if (!summary.extract) return null;
            return {
                title: (summary.title || cleanTitle).replace(" - Wikipedia", ""),
                description: summary.extract,
                image: summary.thumbnail?.source || await getBestPlaceImage(cleanTitle, city, "travel"),
                category: detectCategory(summary.title || cleanTitle, summary.extract),
                source: "Wikipedia"
            };
        } catch (_e) {
            return null;
        }
    }));

    return detailed.filter(Boolean);
}

function mapGeoapifyCategory(categories) {
    if (!categories || categories.length === 0) return "travel";
    const cats = categories.join(" ").toLowerCase();
    if (cats.includes("shop") || cats.includes("commercial")) return "shopping";
    if (cats.includes("catering") || cats.includes("restaurant") || cats.includes("food")) return "food";
    if (cats.includes("leisure.park") || cats.includes("natural")) return "park";
    if (cats.includes("museum") || cats.includes("culture")) return "museum";
    if (cats.includes("religion") || cats.includes("temple")) return "temple";
    if (cats.includes("historic") || cats.includes("monument") || cats.includes("attraction")) return "historic";
    return "travel";
}

function detectCategory(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    if (text.includes("mall") || text.includes("market") || text.includes("bazaar") || text.includes("shopping") || text.includes("shop")) {
        return "shopping";
    }
    if (text.includes("restaurant") || text.includes("food") || text.includes("cafe") || text.includes("street food") || text.includes("cuisine")) {
        return "food";
    }
    if (text.includes("park") || text.includes("garden") || text.includes("lake") || text.includes("nature") || text.includes("river")) {
        return "park";
    }
    if (text.includes("museum") || text.includes("gallery") || text.includes("art") || text.includes("exhibition")) {
        return "museum";
    }
    if (text.includes("palace") || text.includes("fort") || text.includes("castle") || text.includes("historic") || text.includes("ancient") || text.includes("monument")) {
        return "historic";
    }
    if (text.includes("temple") || text.includes("church") || text.includes("mosque") || text.includes("shrine") || text.includes("monastery")) {
        return "temple";
    }
    return "travel";
}

function renderWeather(weather, locationName) {
    weatherCard.innerHTML = `
        <h2>🌦 Weather</h2>
        <div class="weather-main">
            <div>
                <p><strong>Location:</strong> ${locationName}</p>
                <div class="weather-temp">${weather.temperature}°C</div>
                <p><strong>Condition:</strong> ${weather.condition}</p>
            </div>
            <img class="weather-icon" src="https://openweathermap.org/img/wn/${weather.icon}@2x.png" alt="${weather.condition}">
        </div>
    `;
}

function renderCountry(country) {
    countryCard.innerHTML = `
        <h2>🌍 Country Info</h2>
        <p><strong>Country:</strong> ${country.name}${country.flag ? `<img class="flag" src="${country.flag}" alt="${country.name} flag">` : ""}</p>
        <p><strong>Capital:</strong> ${country.capital}</p>
        <p><strong>Population:</strong> ${country.population.toLocaleString()}</p>
        <p><strong>Region:</strong> ${country.region}</p>
    `;
}

function renderCurrency(currency) {
    currencyCard.innerHTML = `
        <h2>💱 Currency</h2>
        <p><strong>Name:</strong> ${currency.currencyName}</p>
        <p><strong>Code:</strong> ${currency.currencyCode}</p>
        <p><strong>Rate:</strong> 1 USD = ${currency.rate} ${currency.currencyCode}</p>
    `;
}

function renderPlaces(places) {
    if (places.length === 0) {
        placesCard.innerHTML = `
            <h2>🗺 Tourist Places</h2>
            <p>No places found, try another city.</p>
        `;
        return;
    }
    allPlaces = places;

    placesCard.innerHTML = `
        <div class="places-top-row">
            <h2>🗺 Top Famous Places</h2>
            <p class="places-count">${places.length} places</p>
        </div>
        <div class="places-filters">
            <select id="placeTypeFilter">
                <option value="all">All Categories</option>
                <option value="temple">🛕 Temples</option>
                <option value="food">🍱 Food</option>
                <option value="historic">🏰 Historical</option>
                <option value="park">🌳 Parks</option>
                <option value="shopping">🛍 Shopping</option>
                <option value="travel">✈ Travel</option>
            </select>
            <input type="text" id="placeSearchFilter" placeholder="Search in places...">
            <select id="placeSortFilter">
                <option value="relevance">Sort: Relevance</option>
                <option value="popularity">Sort: Popularity</option>
                <option value="distance">Sort: Nearest</option>
                <option value="az">Sort: A-Z</option>
                <option value="za">Sort: Z-A</option>
                <option value="category">Sort: Category</option>
                <option value="detailed">Sort: Most Detailed</option>
            </select>
        </div>
        <div class="places-grid" id="placesGrid"></div>
    `;

    const placeTypeFilter = document.getElementById("placeTypeFilter");
    const placeSearchFilter = document.getElementById("placeSearchFilter");
    const placeSortFilter = document.getElementById("placeSortFilter");

    placeTypeFilter.addEventListener("change", updatePlacesGrid);
    placeSearchFilter.addEventListener("input", updatePlacesGrid);
    placeSortFilter.addEventListener("change", updatePlacesGrid);

    updatePlacesGrid();
}

function updatePlacesGrid() {
    const grid = document.getElementById("placesGrid");
    const placeTypeFilter = document.getElementById("placeTypeFilter");
    const placeSearchFilter = document.getElementById("placeSearchFilter");
    const placeSortFilter = document.getElementById("placeSortFilter");
    if (!grid || !placeTypeFilter || !placeSearchFilter || !placeSortFilter) return;

    const type = placeTypeFilter.value;
    const text = placeSearchFilter.value.trim().toLowerCase();
    const sortType = placeSortFilter.value;

    let filtered = allPlaces.filter((place) => {
        const typeMatch = type === "all" ? true : place.category === type;
        const textMatch =
            place.title.toLowerCase().includes(text) ||
            place.description.toLowerCase().includes(text);
        return typeMatch && textMatch;
    });

    if (sortType === "az") {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortType === "za") {
        filtered.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortType === "popularity") {
        filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } else if (sortType === "distance") {
        filtered.sort((a, b) => (a.distance || Number.MAX_SAFE_INTEGER) - (b.distance || Number.MAX_SAFE_INTEGER));
    } else if (sortType === "category") {
        filtered.sort((a, b) => a.category.localeCompare(b.category));
    } else if (sortType === "detailed") {
        filtered.sort((a, b) => b.description.length - a.description.length);
    }

    if (!filtered.length) {
        grid.innerHTML = "<p class='place-empty'>No places match this filter.</p>";
        return;
    }

    grid.innerHTML = filtered.map((place) => {
        const shortText = place.description.length > 120
            ? place.description.slice(0, 120) + "..."
            : place.description;

        return `
            <div class="place-card fade-in">
                <img src="${place.image || DEFAULT_PLACE_IMAGE}" alt="${place.title}" onerror="this.onerror=null;this.src='${DEFAULT_PLACE_IMAGE}'">
                <div class="place-content">
                    <h4>${place.title}</h4>
                    <span class="place-tag" data-cat="${place.category}">${place.category}</span>
                    <span class="source-tag">${place.source || "Mixed"}</span>
                    <p>${shortText}</p>
                    ${place.distance ? `<p><strong>Distance:</strong> ${(place.distance / 1000).toFixed(1)} km</p>` : ""}
                    <button class="read-more-btn" data-place="${encodeURIComponent(JSON.stringify(place))}">Read More</button>
                </div>
            </div>
        `;
    }).join("");

    const buttons = grid.querySelectorAll(".read-more-btn");
    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const raw = btn.getAttribute("data-place");
            if (!raw) return;
            const place = JSON.parse(decodeURIComponent(raw));
            localStorage.setItem(PLACE_DETAIL_KEY, JSON.stringify(place));
            window.location.href = "place.html";
        });
    });
}

function onDataLoaded(callback) {
    callback();
}

async function getTravelData() {
    const query = searchInput.value.trim();
    if (!query) {
        showError("Please type a city or country.");
        return;
    }

    showLoading(true);
    hideError();
    results.classList.add("hide");

    try {
        const weather = await fetchWeather(query);
        const [country, rates, places] = await Promise.all([
            fetchCountry(weather.countryCode),
            fetchCurrency(),
            fetchPlaces(weather.lat, weather.lon, weather.cityName)
        ]);

        const rate = rates[country.currencyCode] ? Number(rates[country.currencyCode]).toFixed(2) : "N/A";
        const currency = {
            currencyCode: country.currencyCode,
            currencyName: country.currencyName,
            rate
        };

        renderWeather(weather, weather.cityName);
        renderCountry(country);
        renderCurrency(currency);
        renderPlaces(places);
        saveRecentSearch(query);

        onDataLoaded(function () {
            showLoading(false);
            results.classList.remove("hide");
        });
    } catch (error) {
        showLoading(false);
        if (error && error.message === "Failed to fetch") {
            showError("Network/API issue. Please try again in a few seconds.");
        } else {
            showError(error.message || "Something went wrong.");
        }
    }
}

function saveRecentSearch(text) {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    const normalized = text.trim();
    const updated = [normalized, ...prev.filter((x) => x.toLowerCase() !== normalized.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    renderRecentSearches();
}

function renderRecentSearches() {
    const items = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    if (!items.length) {
        recentSearchesWrap.innerHTML = "";
        return;
    }

    recentSearchesWrap.innerHTML = items
        .map((item) => `<button class="recent-chip" data-city="${item}">${item}</button>`)
        .join("");

    const chips = recentSearchesWrap.querySelectorAll(".recent-chip");
    chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            searchInput.value = chip.getAttribute("data-city");
            getTravelData();
        });
    });
}


