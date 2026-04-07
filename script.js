const cityinput = document.getElementById('cityinput');
const btn = document.getElementById('btn');
const errorMsg = document.getElementById('errorMsg');
const loading = document.getElementById('loading');
const resultsbox = document.getElementById('resultsbox');

const themeBtn = document.getElementById('themeBtn');
if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
    });
}



// Suggestion chips on intro page
document.querySelectorAll('.sugg-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        cityinput.value = chip.dataset.city;
        doSearch();
    });
});

let currentSpots = [];
let likedPlaces = [];

btn.addEventListener('click', doSearch);
cityinput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doSearch();
});

let firstSearch = true;

function activateResultsMode() {
    if (!firstSearch) return;
    firstSearch = false;
    const body = document.body;
    const header = document.getElementById('headerContainer');
    body.classList.remove('intro-mode');
    if (header) {
        header.style.transition = 'all 0.6s ease';
    }
}

function doSearch() {
    const q = cityinput.value.trim();
    if (!q) {
        showErr("Please enter a destination to explore.");
        return;
    }
    hideErr();
    resultsbox.innerHTML = '';
    activateResultsMode();
    getAllData(q);
}

const myKey = config.MY_KEY;

async function getW(q) {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&units=metric&appid=${myKey}`);
    if (!res.ok) {
        if (res.status === 401) {
            throw new Error("Invalid API Key. If newly created, wait up to 2 hours for activation.");
        }
        throw new Error("Weather data not found");
    }
    const d = await res.json();
    return {
        t: Math.round(d.main.temp),
        cond: d.weather[0].main,
        hum: d.main.humidity + '%',
        ccode: d.sys.country,
        cname: d.name,
        lat: d.coord.lat,
        lon: d.coord.lon
    };
}

async function getC(code) {
    if (!code) return dummyC();

    try {
        const res = await fetch(`https://restcountries.com/v3.1/alpha/${code}`);
        if (!res.ok) return dummyC();
        const d = await res.json();
        const c = d[0];
        
        let money = null;
        if (c.currencies) {
            money = Object.keys(c.currencies)[0];
        }

        return {
            n: c.name?.common || 'N/A',
            cap: c.capital ? c.capital[0] : 'N/A',
            reg: c.region || 'N/A',
            pop: c.population ? (c.population / 1000000).toFixed(1) + ' Million' : 'N/A',
            money: money
        };
    } catch(e) {
        return dummyC();
    }
}

function dummyC() {
    return { n: 'N/A', cap: 'N/A', reg: 'N/A', pop: 'N/A', money: null };
}

async function getMoney(c) {
    if (!c) return { n: 'N/A', r: 'N/A' };
    if (c === 'USD') return { n: 'US Dollar (USD)', r: '1 USD = 1.00 USD' };
    
    try {
        const res = await fetch(`https://open.er-api.com/v6/latest/USD`);
        if (!res.ok) throw new Error("Currency API error");
        const d = await res.json();
        const rr = d.rates[c];
        
        if (rr) {
            return {
                n: c,
                r: `1 USD = ${rr.toFixed(2)} ${c}`
            };
        }
    } catch (e) {
        console.error(e);
    }
    return { n: c, r: 'Rate not available' };
}

async function getTips(q) {
    try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`);
        if (!res.ok) return "No travel insights available for this location.";
        const d = await res.json();
        if (d.extract) {
            const t = d.extract;
            return t.length > 200 ? t.substring(0, 197) + '...' : t;
        }
    } catch (e) {
        console.error(e);
    }
    return "No travel insights available for this location.";
}

/**
 * Finds real famous landmarks by reading links from the city's Wikipedia article.
 * The city's own Wikipedia page links to its famous landmarks (Eiffel Tower, Louvre, etc.),
 * so this guarantees highly relevant, city-specific results.
 */
async function getSpots(lat, lon, cityName) {
    const placeKeywords = [
        'tower', 'palace', 'museum', 'cathedral', 'church', 'chapel',
        'bridge', 'park', 'garden', 'square', 'monument', 'temple',
        'fort', 'castle', 'market', 'boulevard', 'basilica', 'opera',
        'theatre', 'theater', 'stadium', 'arena', 'mountain', 'lake',
        'beach', 'island', 'harbour', 'harbor', 'port', 'zoo',
        'aquarium', 'gallery', 'shrine', 'mosque', 'synagogue',
        'ruins', 'wall', 'gate', 'arch', 'waterfall', 'safari',
        'monument', 'memorial', 'fountain', 'observatory'
    ];

    const junkTitles = [
        'list of', 'lists of', 'history of', 'politics', 'commune',
        'arrondissement', 'municipality', 'television', 'film', 'novel',
        'song', 'album', 'footballer', 'athlete', 'politician',
        'bombing', 'attack', 'massacre', 'riot', 'war', 'battle',
        'election', 'census'
    ];

    const isJunk  = t => junkTitles.some(j => t.toLowerCase().includes(j));
    const isPlace = t => placeKeywords.some(k => t.toLowerCase().includes(k));

    try {
        // Step 1: Get all links from the city's Wikipedia article
        const linksUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(cityName)}&prop=links&format=json&origin=*&pllimit=500&plnamespace=0`;
        const linksRes = await fetch(linksUrl);
        if (!linksRes.ok) return [];
        const linksData = await linksRes.json();

        const pages = Object.values(linksData.query.pages);
        const allLinks = pages[0]?.links?.map(l => l.title) || [];

        // Step 2: Keep only titles that look like real places
        const placeLinks = allLinks
            .filter(t => !isJunk(t) && isPlace(t))
            .slice(0, 20);

        if (placeLinks.length === 0) return [];

        // Step 3: Fetch summaries and keep only those with images
        const summaries = await Promise.all(
            placeLinks.map(async (title) => {
                try {
                    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
                    if (!r.ok) return null;
                    const d = await r.json();
                    if (!d.thumbnail) return null;
                    const extract = d.extract || '';
                    if (extract.length < 30) return null;
                    return {
                        t: d.title,
                        img: d.thumbnail.source,
                        desc: extract.length > 160 ? extract.substring(0, 157) + '...' : extract
                    };
                } catch { return null; }
            })
        );

        return summaries.filter(s => s !== null).slice(0, 8);
    } catch (err) {
        console.error('getSpots error:', err);
        return [];
    }
}

async function getAllData(q) {
    loading.classList.remove('hide');
    resultsbox.classList.add('hide');
    
    try {
        const w = await getW(q);
        
        const [c, t, p] = await Promise.all([
            getC(w.ccode),
            getTips(w.cname),
            getSpots(w.lat, w.lon, w.cname)
        ]);
        
        const m = await getMoney(c.money);
        
        likedPlaces = [];
        currentSpots = p || [];
        
        loading.classList.add('hide');
        showHTML(w, c, m, t);
        renderPlacesContainer();
        
    } catch (err) {
        console.error(err);
        loading.classList.add('hide');
        if (err.message.includes("API Key")) {
            showErr(err.message);
        } else {
            showErr("Data not found. Please try a different location.");
        }
    }
}

function showHTML(w, c, m, t) {
    resultsbox.innerHTML = '';
    resultsbox.classList.remove('hide');

    let html = `
        <div class="infobox">
            <div class="boxtop">
                <span class="card-icon">🌦</span>
                <h3 class="boxtitle">Weather</h3>
            </div>
            <div class="boxdata">
                <div class="wmain">
                    <div class="wtemp">${w.t}°C</div>
                    <div class="wdesc">${w.cond}</div>
                </div>
                <div class="rowdata">
                    <div class="lbl">Humidity</div>
                    <div class="val">${w.hum}</div>
                </div>
                <div class="rowdata">
                    <div class="lbl">City</div>
                    <div class="val">${w.cname}</div>
                </div>
            </div>
        </div>

        <div class="infobox">
            <div class="boxtop">
                <span class="card-icon">🌍</span>
                <h3 class="boxtitle">Country Info</h3>
            </div>
            <div class="boxdata">
                <div class="rowdata">
                    <div class="lbl">Country</div>
                    <div class="val">${c.n}</div>
                </div>
                <div class="rowdata">
                    <div class="lbl">Capital</div>
                    <div class="val">${c.cap}</div>
                </div>
                <div class="rowdata">
                    <div class="lbl">Region</div>
                    <div class="val">${c.reg}</div>
                </div>
                <div class="rowdata">
                    <div class="lbl">Population</div>
                    <div class="val">${c.pop}</div>
                </div>
            </div>
        </div>

        <div class="infobox">
            <div class="boxtop">
                <span class="card-icon">💱</span>
                <h3 class="boxtitle">Currency</h3>
            </div>
            <div class="boxdata">
                <div class="rowdata">
                    <div class="lbl">Code</div>
                    <div class="val">${m.n}</div>
                </div>
                <div class="rowdata">
                    <div class="lbl">Rate vs USD</div>
                    <div class="val">${m.r}</div>
                </div>
            </div>
        </div>

        <div class="infobox">
            <div class="boxtop">
                <span class="card-icon">🗺</span>
                <h3 class="boxtitle">Travel Insights</h3>
            </div>
            <div class="boxdata tinbox">
                <p class="tips">${t}</p>
            </div>
        </div>
    `;
    
    resultsbox.innerHTML = html + '<div id="placesbox"></div>';
}

function renderPlacesContainer() {
    const placesbox = document.getElementById('placesbox');
    if (!placesbox || !currentSpots || currentSpots.length === 0) {
        if(placesbox) placesbox.innerHTML = '';
        return;
    }
    
    placesbox.innerHTML = `
        <div class="placesdiv">
            <h3>Top Places to Visit</h3>
            <div class="places-toolbar">
                <input type="text" id="placeSearch" placeholder="Search places..." autocomplete="off">
                <select id="placeSort">
                    <option value="default">Default</option>
                    <option value="az">Name: A-Z</option>
                    <option value="za">Name: Z-A</option>
                </select>
            </div>
            <div class="pgrid" id="pgrid"></div>
        </div>
    `;
    
    const searchInput = document.getElementById('placeSearch');
    const sortSelect = document.getElementById('placeSort');
    
    searchInput.addEventListener('input', updatePlacesList);
    sortSelect.addEventListener('change', updatePlacesList);
    
    updatePlacesList();
}

function updatePlacesList() {
    const searchInput = document.getElementById('placeSearch');
    const sortSelect = document.getElementById('placeSort');
    const pgrid = document.getElementById('pgrid');
    if (!pgrid) return;
    
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const sortVal = sortSelect ? sortSelect.value : 'default';
    
    let filteredSpots = currentSpots.filter(spot => {
        return spot.t.toLowerCase().includes(query) || spot.desc.toLowerCase().includes(query);
    });
    
    if (sortVal === 'az') {
        filteredSpots = filteredSpots.slice().sort((a, b) => a.t.localeCompare(b.t));
    } else if (sortVal === 'za') {
        filteredSpots = filteredSpots.slice().sort((a, b) => b.t.localeCompare(a.t));
    }
    
    pgrid.innerHTML = filteredSpots.map(x => `
        <div class="pcard">
            ${x.img ? `<img src="${x.img}" alt="${x.t}" class="pimg">` : '<div class="pimg noimg">No Image</div>'}
            <div class="pinfo">
                <div class="pcard-header">
                    <h4>${x.t}</h4>
                    <button class="heart-btn ${likedPlaces.includes(x.t) ? 'liked' : ''}" data-title="${x.t}">♥</button>
                </div>
                <p>${x.desc}</p>
            </div>
        </div>
    `).join('');
    
    const hearts = pgrid.querySelectorAll('.heart-btn');
    Array.from(hearts).map(btn => {
        btn.addEventListener('click', (e) => {
            const title = e.currentTarget.getAttribute('data-title');
            if (likedPlaces.includes(title)) {
                likedPlaces = likedPlaces.filter(t => t !== title);
            } else {
                likedPlaces.push(title);
            }
            e.currentTarget.classList.toggle('liked');
        });
    });
}

function showErr(m) {
    errorMsg.textContent = m;
    errorMsg.classList.remove('hide');
    resultsbox.classList.add('hide');
}

function hideErr() {
    errorMsg.classList.add('hide');
}


