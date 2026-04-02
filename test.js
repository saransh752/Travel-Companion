const fetch = require('node-fetch') || global.fetch;

const config = require('./config.js');
const myKey = config.MY_KEY;

async function getW(q) {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&units=metric&appid=${myKey}`);
    if (!res.ok) {
        throw new Error("Weather data not found");
    }
    const d = await res.json();
    console.log("Weather:", d);
}

getW("Jaipur").catch(e => console.error(e));
