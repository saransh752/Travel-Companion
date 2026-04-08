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
const RECENT_KEY = "travel_explorer_recent";
let allPlaces = [];

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

async function fetchLocation(query) {
    const weather = await fetchWeather(query);
    if (!weather || !weather.countryCode) {
        throw new Error("Location not found.");
    }
    return {
        cityName: weather.cityName,
        countryCode: weather.countryCode
    };
}

function getCountryNameFromCode(code) {
    try {
        const display = new Intl.DisplayNames(["en"], { type: "region" });
        return display.of(code) || code;
    } catch (_e) {
        return code;
    }
}

async function fetchWeather(city) {
    if (!OPEN_WEATHER_KEY || OPEN_WEATHER_KEY === "YOUR_API_KEY_HERE") {
        throw new Error("OpenWeather API key is missing in config.js");
    }
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPEN_WEATHER_KEY}&units=metric`);
    if (!res.ok) throw new Error("Weather API failed.");
    const data = await res.json();

    return {
        cityName: data.name,
        countryCode: data.sys.country,
        temperature: Math.round(data.main.temp),
        condition: data.weather[0].main,
        icon: data.weather[0].icon
    };
}

async function fetchCountry(countryName) {
    const res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=false`);
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

async function fetchPlaces(city) {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=50&srsearch=${encodeURIComponent(city + " tourist attractions")}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error("Places API failed.");
    const searchData = await searchRes.json();
    const rawResults = searchData.query?.search || [];

    const filtered = rawResults
        .filter((item) => {
            const text = `${item.title} ${item.snippet}`.toLowerCase();
            return (
                !text.includes("disambiguation") &&
                !text.includes("wikipedia") &&
                !text.includes("may refer to") &&
                !text.includes("list of") &&
                (text.includes("tourist") ||
                 text.includes("museum") ||
                 text.includes("park") ||
                 text.includes("palace") ||
                 text.includes("temple") ||
                 text.includes("fort") ||
                 text.includes("monument") ||
                 text.includes("market") ||
                 text.includes("restaurant") ||
                 text.includes("food") ||
                 text.includes("mall") ||
                 text.includes(city.toLowerCase()))
            );
        })
        .sort((a, b) => b.wordcount - a.wordcount)
        .slice(0, 20);

    const placesWithDetails = await Promise.all(
        filtered.map(async (item) => {
            const cleanTitle = item.title.replace(/\s*\(.*?\)\s*/g, "").trim();
            const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`);
            if (!summaryRes.ok) return null;
            const summary = await summaryRes.json();
            if (!summary.extract) return null;
            return {
                title: (summary.title || cleanTitle).replace(" - Wikipedia", ""),
                description: summary.extract,
                image: summary.thumbnail?.source || "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
                category: detectCategory(summary.title || cleanTitle, summary.extract)
            };
        })
    );

    return placesWithDetails.filter((x) => x !== null);
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
        return "religion";
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
            <h2>🗺 Top 20 Places to Visit</h2>
            <p class="places-count">${places.length} places</p>
        </div>
        <div class="places-filters">
            <select id="placeTypeFilter">
                <option value="all">All Categories</option>
                <option value="historic">🏰 Historic</option>
                <option value="park">🌳 Parks & Nature</option>
                <option value="museum">🖼 Museums</option>
                <option value="shopping">🛍 Shopping</option>
                <option value="food">🍱 Food</option>
                <option value="religion">🕉 Religion</option>
                <option value="travel">✈ Travel</option>
            </select>
            <input type="text" id="placeSearchFilter" placeholder="Search in places...">
            <select id="placeSortFilter">
                <option value="relevance">Sort: Relevance</option>
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
    } else if (sortType === "category") {
        filtered.sort((a, b) => a.category.localeCompare(b.category));
    } else if (sortType === "detailed") {
        filtered.sort((a, b) => b.description.length - a.description.length);
    }

    if (!filtered.length) {
        grid.innerHTML = "<p>No places match this filter.</p>";
        return;
    }

    grid.innerHTML = filtered.map((place) => {
        const shortText = place.description.length > 120
            ? place.description.slice(0, 120) + "..."
            : place.description;

        return `
            <div class="place-card fade-in">
                <img src="${place.image}" alt="${place.title}">
                <div class="place-content">
                    <h4>${place.title}</h4>
                    <span class="place-tag" data-cat="${place.category}">${place.category}</span>
                    <p>${shortText}</p>
                </div>
            </div>
        `;
    }).join("");
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
        const weatherForLocation = await fetchWeather(query);
        const location = await fetchLocation(query);
        const countryName = getCountryNameFromCode(location.countryCode);
        const [weather, country, rates, places] = await Promise.all([
            fetchWeather(query),
            fetchCountry(countryName),
            fetchCurrency(),
            fetchPlaces(weatherForLocation.cityName)
        ]);

        const rate = rates[country.currencyCode] ? Number(rates[country.currencyCode]).toFixed(2) : "N/A";
        const currency = {
            currencyCode: country.currencyCode,
            currencyName: country.currencyName,
            rate
        };

        renderWeather(weather, location.cityName);
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


