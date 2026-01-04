(async function() {
    const esc = str => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
    
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
        #smart-garden-widget { width: 300px; text-align: left; }
        .garden-main-card { 
            background: #ffffff !important; 
            padding: 18px; 
            margin-bottom: 20px !important; 
            box-shadow: 0 0 0 8px rgba(255, 255, 255, 0.5) !important;
            border-radius: 0 !important;
            height: 440px; /* TELJESEN FIX MAGASSÁG A WIDGETNEK */
            display: flex;
            flex-direction: column;
        }
        
        .garden-title { font-family: 'Dancing Script', cursive !important; font-size: 3.6em !important; text-align: center !important; margin: 5px 0 12px 0 !important; line-height: 1.1; }
        .section-title { font-family: 'Plus Jakarta Sans', sans-serif !important; font-weight: 800 !important; font-size: 16px !important; text-transform: uppercase; letter-spacing: 1.2px; margin: 12px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(0,0,0,0.06); }
        
        /* FIX CAROUSEL MAGASSÁG - Nem fog ugrálni váltáskor */
        .carousel-wrapper { position: relative; height: 110px; margin-bottom: 5px; overflow: hidden; }
        .carousel-item { 
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; visibility: hidden; 
            transition: opacity 1.2s ease-in-out; 
        }
        .carousel-item.active { opacity: 1; visibility: visible; }

        .card-container { position: relative; padding-left: 14px; height: 100%; overflow: hidden; }
        .card-line { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
        
        .card-type-alert { background: #b91c1c !important; }
        .card-type-window { background: #2d6a4f !important; }
        .card-type-info { background: #6691b3 !important; }
        .card-type-none { background: #94a3b8 !important; }
        
        .event-name { font-family: 'Plus Jakarta Sans', sans-serif !important; font-weight: 800 !important; font-size: 16px !important; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .event-range { font-family: 'Plus Jakarta Sans', sans-serif !important; font-size: 9px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase; opacity: 0.8; }
        .event-msg { font-family: 'Plus Jakarta Sans', sans-serif !important; font-size: 12.5px; line-height: 1.4; color: #334155; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
        
        .garden-footer { text-align: center; font-family: 'Plus Jakarta Sans', sans-serif !important; font-size: 9px; margin-top: auto; padding-top: 8px; line-height: 1.4; border-top: 1px solid rgba(0,0,0,0.05); opacity: 0.7; }
        .loc-btn { width: 100%; cursor: pointer; padding: 10px; font-family: 'Plus Jakarta Sans', sans-serif !important; font-size: 10px; margin-bottom: 5px; text-transform: uppercase; font-weight: 800; border: none; outline: none; border-radius: 0 !important; }
    `;
    document.head.appendChild(styleSheet);

    function createSafeStorage() { const m={}; try { const t='t'; localStorage.setItem(t,t); localStorage.removeItem(t); return { getItem: (k)=>localStorage.getItem(k), setItem: (k,v)=>localStorage.setItem(k,v), removeItem: (k)=>localStorage.removeItem(k) }; } catch(e) { return { getItem: (k)=>m[k]||null, setItem: (k,v)=>{m[k]=v;}, removeItem: (k)=>{delete m[k];} }; } }
    const storage = createSafeStorage();

    function checkDay(rule, weather, date, i) {
        const c = rule.conditions || {};
        const windKey = rule.type === 'alert' ? 'wind_gusts_10m_max' : 'wind_speed_10m_max';
        const dayRain = weather.daily.precipitation_sum[i] || 0;
        const dayWind = weather.daily[windKey][i] || 0;
        
        if (c.wind_min !== undefined && dayWind < c.wind_min) return false;
        if (c.wind_max !== undefined && dayWind > c.wind_max) return false;
        if (c.rain_min !== undefined && dayRain < c.rain_min) return false;
        if (c.rain_max !== undefined && dayRain > c.rain_max) return false;
        
        const seasons = rule.seasons || (rule.season ? [rule.season] : null);
        if (seasons) {
            const isInSeason = (d, s, e) => {
                const [sM, sD] = s.split('-').map(Number);
                const [eM, eD] = e.split('-').map(Number);
                const year = d.getFullYear();
                let start = new Date(year, sM - 1, sD), end = new Date(year, eM - 1, eD);
                if (end < start) { if (d >= start) return true; return d <= new Date(year, eM-1, eD); }
                return d >= start && d <= end;
            };
            if (!seasons.some(s => isInSeason(date, s.start, s.end))) return false;
        }
        if (c.temp_below !== undefined && weather.daily.temperature_2m_min[i] > c.temp_below) return false;
        if (c.temp_above !== undefined && weather.daily.temperature_2m_max[i] < c.temp_above) return false;
        return true;
    }

    async function init() {
        const widgetDiv = document.getElementById('smart-garden-widget');
        if (!widgetDiv) return;
        try {
            let lat = 47.5136, lon = 19.3735, isPers = false;
            const sLat = storage.getItem('garden-lat'), sLon = storage.getItem('garden-lon');
            if (sLat && sLon) { lat = Number(sLat); lon = Number(sLon); isPers = true; }
            const cacheKey = 'garden-weather-cache';
            const cachedData = storage.getItem(cacheKey);
            let weather, lastUpdate;
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    if (new Date().getTime() - parsed.timestamp < 1800000 && Number(parsed.lat) === lat) {
                        weather = parsed.data; lastUpdate = new Date(parsed.timestamp);
                    }
                } catch(e) { storage.removeItem(cacheKey); }
            }
            const rRes = await fetch('https://raw.githubusercontent.com/amezitlabaskert-lab/smart-events/main/blog-scripts.json');
            const rules = await rRes.json();
            if (!weather) {
                const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum&past_days=7&timezone=auto`);
                weather = await wRes.json();
                const timestamp = new Date().getTime();
                storage.setItem(cacheKey, JSON.stringify({ timestamp, data: weather, lat, lon }));
                lastUpdate = new Date(timestamp);
            }
            const results = [];
            const todayNoon = new Date().setHours(12, 0, 0, 0);
            rules.forEach(rule => {
                let range = null;
                for (let i = 0; i < weather.daily.time.length; i++) {
                    const d = new Date(weather.daily.time[i]);
                    if (checkDay(rule, weather, d, i)) {
                        if (!range) range = { start: d, end: d }; else range.end = d;
                    } else if (range) break;
                }
                if (range) {
                    const fmt = d => {
                        const diff = Math.round((new Date(d).setHours(12,0,0,0) - todayNoon) / 86400000);
                        if (diff === 0) return "MA"; if (diff === 1) return "HOLNAP";
                        return d.toLocaleDateString('hu-HU', {month:'short', day:'numeric'}).toUpperCase().replace('.', '');
                    };
                    results.push({ range: fmt(range.start) + (fmt(range.start) !== fmt(range.end) ? ' — ' + fmt(range.end) : ''), title: rule.name, msg: rule.message, type: rule.type });
                }
            });
            const renderZone = (items, fallback, id) => {
                const displayItems = items.length ? items : (fallback ? [fallback] : []);
                if (displayItems.length === 0) return '';
                return `<div id="${id}-carousel" class="carousel-wrapper">
                    ${displayItems.map((item, idx) => `
                        <div class="carousel-item ${idx === 0 ? 'active' : ''}">
                            <div class="card-container">
                                <div class="card-line card-type-${item.type}"></div>
                                <div class="event-name">${esc(item.title)}</div>
                                <div class="event-range">${item.range}</div>
                                <div class="event-msg">${esc(item.msg)}</div>
                            </div>
                        </div>`).join('')}
                </div>`;
            };
            widgetDiv.innerHTML = `
                <div class="garden-main-card">
                    <div class="garden-title">${isPers ? 'Kertfigyelőd' : 'Kertfigyelő'}</div>
                    <button onclick="window.gardenAction()" class="loc-btn">${isPers ? 'VISSZA AZ ALAPHOZ' : 'SAJÁT KERTFIGYELŐT SZERETNÉM'}</button>
                    <div class="section-title">Riasztások</div>
                    ${renderZone(results.filter(r => r.type === 'alert'), { range: 'Jelenleg', title: 'Minden nyugi', msg: 'Nincs veszély.', type: 'none' }, 'alert')}
                    ${results.some(r => r.type === 'window') ? '<div class="section-title">Lehetőségek</div>' : ''}
                    ${renderZone(results.filter(r => r.type === 'window'), null, 'window')}
                    <div class="section-title">Teendők</div>
                    ${renderZone(results.filter(r => r.type !== 'alert' && r.type !== 'window'), { range: 'MA', title: 'Pihenj!', msg: 'Élvezd a kertet.', type: 'none' }, 'info')}
                    <div class="garden-footer">Last updated: ${lastUpdate.toLocaleTimeString('hu-HU', {hour:'2-digit', minute:'2-digit'})}<br>Winter Skin Edition - v3.6.0</div>
                </div>`;
            window.gardenAction = () => {
                if (isPers) { storage.removeItem('garden-lat'); storage.removeItem('garden-lon'); storage.removeItem('garden-weather-cache'); location.reload(); }
                else { navigator.geolocation.getCurrentPosition(p => { storage.setItem('garden-lat', p.coords.latitude); storage.setItem('garden-lon', p.coords.longitude); storage.removeItem('garden-weather-cache'); location.reload(); }, () => alert("Helyadat szükséges.")); }
            };
            const setupCarousel = (id, count) => {
                if (count <= 1) return;
                const container = document.getElementById(`${id}-carousel`);
                let idx = 0;
                setInterval(() => {
                    const items = container.querySelectorAll('.carousel-item');
                    if (items.length) { items[idx].classList.remove('active'); idx = (idx + 1) % items.length; items[idx].classList.add('active'); }
                }, 6000);
            };
            setupCarousel('alert', Math.max(1, results.filter(r => r.type === 'alert').length));
            setupCarousel('window', results.filter(r => r.type === 'window').length);
            setupCarousel('info', Math.max(1, results.filter(r => r.type !== 'alert' && r.type !== 'window').length));
        } catch (e) { console.error(e); }
    }
    init();
})();
