(async function() {
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Plus+Jakarta+Sans:wght@400;700;800&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    const esc = str => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
    
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
        #smart-garden-widget { width: 300px; text-align: left; }
        .garden-main-card { 
            background: #ffffff !important; padding: 18px; margin-bottom: 20px !important; 
            box-shadow: 0 0 0 8px rgba(255, 255, 255, 0.5) !important;
            border-radius: 0 !important; height: 480px; display: flex; flex-direction: column;
        }
        .garden-title { font-family: 'Dancing Script', cursive !important; font-size: 3.6em !important; text-align: center !important; margin: 5px 0 12px 0 !important; line-height: 1.1; color: #1a1a1a; }
        .section-title { font-family: 'Plus Jakarta Sans', sans-serif !important; font-weight: 800 !important; font-size: 16px !important; text-transform: uppercase; letter-spacing: 1.2px; margin: 12px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid rgba(0,0,0,0.06); }
        .carousel-wrapper { position: relative; height: 125px; margin-bottom: 5px; overflow: hidden; }
        .carousel-item { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; visibility: hidden; transition: opacity 1.2s ease-in-out, transform 1.2s ease-in-out; transform: translateY(5px); }
        .carousel-item.active { opacity: 1; visibility: visible; transform: translateY(0); }
        .card-container { position: relative; padding-left: 14px; height: 100%; }
        .card-line { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
        .card-type-alert { background: #b91c1c !important; }
        .card-type-window { background: #2d6a4f !important; }
        .card-type-info { background: #6691b3 !important; }
        .card-type-none { background: #94a3b8 !important; }
        .event-name { font-family: 'Plus Jakarta Sans', sans-serif !important; font-weight: 800 !important; font-size: 16px !important; margin-bottom: 2px; color: #1e293b; }
        .event-range { font-family: 'Plus Jakarta Sans', sans-serif !important; font-size: 11px !important; font-weight: 700; margin-bottom: 4px; text-transform: uppercase; opacity: 0.8; color: #64748b; }
        .event-msg { font-family: 'Plus Jakarta Sans', sans-serif !important; font-size: 14px !important; line-height: 1.45; color: #334155; }
        .garden-footer { text-align: center; font-family: 'Plus Jakarta Sans', sans-serif !important; font-size: 11px !important; margin-top: auto; padding-top: 8px; line-height: 1.4; border-top: 1px solid rgba(0,0,0,0.05); opacity: 0.7; }
        .loc-btn { width: 100%; cursor: pointer; padding: 10px; font-family: 'Plus Jakarta Sans', sans-serif !important; font-size: 10px; margin-bottom: 5px; text-transform: uppercase; font-weight: 800; border: none; outline: none; border-radius: 0 !important; transition: all 0.3s ease; animation: pulse-invitation 3s infinite ease-in-out; }
        @keyframes pulse-invitation { 0% { transform: scale(1); } 50% { transform: scale(0.98); opacity: 0.9; } 100% { transform: scale(1); } }
    `;
    document.head.appendChild(styleSheet);

    const storage = {
        getItem: k => { try { return localStorage.getItem(k); } catch(e) { return null; } },
        setItem: (k,v) => { try { localStorage.setItem(k,v); } catch(e) {} },
        removeItem: k => { try { localStorage.removeItem(k); } catch(e) {} }
    };

    // JAVÍTOTT checkSustained: Most már kulcsonként nézi az ANY/ALL logikát
    function checkSustained(weather, dayIdx, cond, ruleType) {
        const days = cond.days_min || 1;
        if (dayIdx < days - 1) return false;

        const checkCondition = (key, idx) => {
            const val = key.includes('temp_above') ? weather.daily.temperature_2m_max[idx] :
                        key.includes('temp_below') ? weather.daily.temperature_2m_min[idx] :
                        key.includes('rain') ? weather.daily.precipitation_sum[idx] :
                        key.includes('wind') ? weather.daily[ruleType === 'alert' ? 'wind_gusts_10m_max' : 'wind_speed_10m_max'][idx] : 0;
            
            if (key.includes('min')) return val >= cond[key];
            if (key.includes('max')) return val <= cond[key];
            if (key.includes('above')) return val >= cond[key];
            if (key.includes('below')) return val <= cond[key];
            return true;
        };

        for (const key in cond) {
            if (key === 'days_min') continue;
            const isAny = key.endsWith('_any');
            const dayResults = [];
            for (let j = 0; j < days; j++) {
                dayResults.push(checkCondition(key, dayIdx - j));
            }
            // Ha ez a kulcs ANY, akkor elég belőle egy nap. Ha nem, akkor mind a N nap kell.
            const ok = isAny ? dayResults.some(r => r) : dayResults.every(r => r);
            if (!ok) return false;
        }
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
            const cached = storage.getItem(cacheKey);
            let weather, lastUpdate;

            if (cached) {
                const p = JSON.parse(cached);
                if (Date.now() - p.ts < 1800000 && Math.abs(p.lat - lat) < 0.01 && Math.abs(p.lon - lon) < 0.01) {
                    weather = p.data; lastUpdate = new Date(p.ts);
                }
            }

            const rRes = await fetch('https://raw.githubusercontent.com/amezitlabaskert-lab/smart-events/main/blog-scripts.json');
            const rules = await rRes.json();

            if (!weather) {
                const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum&past_days=7&timezone=auto`);
                weather = await wRes.json();
                lastUpdate = new Date();
                storage.setItem(cacheKey, JSON.stringify({ ts: lastUpdate.getTime(), data: weather, lat, lon }));
            }

            const results = [];
            const todayStr = new Date().toISOString().split('T')[0];
            const noon = d => new Date(d).setHours(12,0,0,0);

            rules.forEach(rule => {
                let range = null;
                for (let i = 0; i < weather.daily.time.length; i++) {
                    const d = new Date(weather.daily.time[i]);
                    let inSeason = true;
                    if (rule.seasons) {
                        inSeason = rule.seasons.some(s => {
                            const [sM, sD] = s.start.split('-').map(Number);
                            const [eM, eD] = s.end.split('-').map(Number);
                            const startD = new Date(d.getFullYear(), sM-1, sD), endD = new Date(d.getFullYear(), eM-1, eD);
                            return endD < startD ? (d >= startD || d <= endD) : (d >= startD && d <= endD);
                        });
                    }
                    if (inSeason && checkSustained(weather, i, rule.conditions || {}, rule.type)) {
                        if (!range) range = { start: d, end: d }; else range.end = d;
                    } else if (range) break;
                }
                if (range && noon(range.end) >= noon(todayStr)) {
                    const fmt = date => {
                        const diff = Math.round((noon(date) - noon(todayStr)) / 86400000);
                        if (diff === 0) return "MA"; if (diff === 1) return "HOLNAP";
                        return date.toLocaleDateString('hu-HU', {month:'short', day:'numeric'}).toUpperCase().replace('.','');
                    };
                    results.push({ range: fmt(range.start) + (noon(range.start) !== noon(range.end) ? ' — ' + fmt(range.end) : ''), title: rule.name, msg: rule.message, type: rule.type });
                }
            });

            const renderZone = (items, fallback, id) => {
                const display = items.length ? items : (fallback ? [fallback] : []);
                if (!display.length) return '';
                return `<div id="${id}-carousel" class="carousel-wrapper">${display.map((item, idx) => `
                    <div class="carousel-item ${idx === 0 ? 'active' : ''}">
                        <div class="card-container">
                            <div class="card-line card-type-${item.type}"></div>
                            <div class="event-name">${esc(item.title)}</div>
                            <div class="event-range">${item.range}</div>
                            <div class="event-msg">${esc(item.msg)}</div>
                        </div>
                    </div>`).join('')}</div>`;
            };

            widgetDiv.innerHTML = `
                <div class="garden-main-card">
                    <div class="garden-title">${isPers ? 'Kertfigyelőd' : 'Kertfigyelő'}</div>
                    <button id="locBtn" class="loc-btn">${isPers ? 'VISSZA AZ ALAPHOZ' : 'SAJÁT KERTFIGYELŐT SZERETNÉM'}</button>
                    <div class="section-title">Riasztások</div>
                    ${renderZone(results.filter(r => r.type === 'alert'), { range: 'Jelenleg', title: 'Minden nyugi', msg: 'Nincs veszély.', type: 'none' }, 'alert')}
                    ${results.some(r => r.type === 'window') ? '<div class="section-title">Lehetőségek</div>' : ''}
                    ${renderZone(results.filter(r => r.type === 'window'), null, 'window')}
                    <div class="section-title">Teendők</div>
                    ${renderZone(results.filter(r => r.type !== 'alert' && r.type !== 'window'), { range: 'MA', title: 'Pihenj!', msg: 'Élvezd a kertet.', type: 'none' }, 'info')}
                    <div class="garden-footer">Last updated: ${lastUpdate.toLocaleTimeString('hu-HU',{hour:'2-digit',minute:'2-digit'})}<br>Winter Skin Edition - v3.6.4</div>
                </div>`;

            document.getElementById('locBtn').onclick = () => {
                if (isPers) { ['lat','lon','weather-cache'].forEach(k => storage.removeItem('garden-'+k)); location.reload(); }
                else {
                    navigator.geolocation.getCurrentPosition(p => {
                        const {latitude: la, longitude: lo} = p.coords;
                        if (la > 45.7 && la < 48.6 && lo > 16.1 && lo < 22.9) {
                            storage.setItem('garden-lat', la); storage.setItem('garden-lon', lo);
                            storage.removeItem('garden-weather-cache'); location.reload();
                        } else alert("Sajnálom, ez a szolgáltatás csak Magyarország területén érhető el.");
                    }, () => alert("Helyadat szükséges."));
                }
            };

            const setupCarousel = (id, count) => {
                if (count <= 1) return;
                const items = document.querySelectorAll(`#${id}-carousel .carousel-item`);
                let idx = 0;
                setInterval(() => {
                    items[idx].classList.remove('active');
                    idx = (idx + 1) % items.length;
                    items[idx].classList.add('active');
                }, 6000);
            };
            setupCarousel('alert', Math.max(1, results.filter(r => r.type === 'alert').length));
            setupCarousel('window', results.filter(r => r.type === 'window').length);
            setupCarousel('info', Math.max(1, results.filter(r => r.type !== 'alert' && r.type !== 'window').length));

        } catch(e) { console.error(e); }
    }
    init();
})();
