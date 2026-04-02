const cityinput = document.getElementById('cityinput');
const btn = document.getElementById('btn');
const errorMsg = document.getElementById('errorMsg');
const loading = document.getElementById('loading');
const resultsbox = document.getElementById('resultsbox');


btn.addEventListener('click', doSearch);
cityinput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doSearch();
});

function doSearch() {
    const q = cityinput.value.trim();
    if (!q) {
        showErr("Please enter a destination to explore.");
        return;
    }
    
    hideErr();
    resultsbox.innerHTML = '';
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
        cname: d.name
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

async function getSpots(q) {
    try {
        const res1 = await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=tourist+attractions+in+${encodeURIComponent(q)}&utf8=1&origin=*`);
        if (!res1.ok) return [];
        const d1 = await res1.json();
        
        const list = d1.query.search
            .map(i => i.title)
            .filter(t => !t.toLowerCase().includes("list of") && !t.toLowerCase().includes("tourism in") && !t.toLowerCase().includes("history of"))
            .slice(0, 5);
            
        const spots = await Promise.all(list.map(async (t) => {
            try {
                const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`);
                if (!r.ok) return null;
                const d2 = await r.json();
                return {
                    t: d2.title,
                    img: d2.thumbnail ? d2.thumbnail.source : null,
                    desc: d2.extract ? (d2.extract.length > 150 ? d2.extract.substring(0, 147) + '...' : d2.extract) : 'No description available.'
                };
            } catch (err) {
                return null;
            }
        }));
        
        return spots.filter(s => s !== null);
    } catch (err) {
        console.error(err);
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
            getSpots(w.cname)
        ]);
        
        const m = await getMoney(c.money);
        
        loading.classList.add('hide');
        showHTML(w, c, m, t, p);
        
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

function showHTML(w, c, m, t, p) {
    resultsbox.innerHTML = '';
    resultsbox.classList.remove('hide');

    let html = `
        <div class="infobox">
            <div class="boxtop">
                <h3 class="boxtitle">Weather Info</h3>
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
            </div>
        </div>

        <div class="infobox">
            <div class="boxtop">
                <h3 class="boxtitle">Country Info</h3>
            </div>
            <div class="boxdata">
                <div class="rowdata">
                    <div class="lbl">Country Name</div>
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
                <h3 class="boxtitle">Currency Info</h3>
            </div>
            <div class="boxdata">
                <div class="rowdata">
                    <div class="lbl">Currency</div>
                    <div class="val">${m.n}</div>
                </div>
                <div class="rowdata">
                    <div class="lbl">Conv. Rate</div>
                    <div class="val">${m.r}</div>
                </div>
            </div>
        </div>

        <div class="infobox">
            <div class="boxtop">
                <h3 class="boxtitle">Travel Insights</h3>
            </div>
            <div class="boxdata tinbox">
                <p class="tips">"${t}"</p>
            </div>
        </div>
    `;
    
    let phtml = '';
    if (p && p.length > 0) {
        phtml = `
            <div class="placesdiv">
                <h3>Top Places to Visit</h3>
                <div class="pgrid">
                    ${p.map(x => `
                        <div class="pcard">
                            ${x.img ? `<img src="${x.img}" alt="${x.t}" class="pimg">` : '<div class="pimg noimg">No Image</div>'}
                            <div class="pinfo">
                                <h4>${x.t}</h4>
                                <p>${x.desc}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    resultsbox.innerHTML = html + phtml;
}

function showErr(m) {
    errorMsg.textContent = m;
    errorMsg.classList.remove('hide');
    resultsbox.classList.add('hide');
}

function hideErr() {
    errorMsg.classList.add('hide');
}
