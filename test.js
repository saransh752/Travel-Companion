const fetch = require('node-fetch') || global.fetch;

const myKey = '5a7daa1e53d0aaa94f52997e279d7ca9';

async function getW(q) {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&units=metric&appid=${myKey}`);
    if (!res.ok) {
        throw new Error("Weather data not found");
    }
    const d = await res.json();
    console.log("Weather:", d);
}

getW("Jaipur").catch(e => console.error(e));
