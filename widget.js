/**
 * 🚩 SMART GARDEN WIDGET - VERSION 4.3.1 "STRICT RULES"
 * UI ÉS LOGIKA SZÉTVÁLASZTVA - SZABÁLYOK FIXÁLVA
 */

(async function() {
    const version = "v4.3.1 - Strict 3-Past/4-Future";
    const lastUpdatedLabel = "Last updated: " + new Date().toLocaleTimeString('hu-HU', {hour:'2-digit', minute:'2-digit'});

    // --- 1. UI DEFINÍCIÓ (VÉLÉTLENÜL SE NYÚLJUNK HOZZÁ) ---
    const GARDEN_UI = {
        styles: `
            @keyframes pulse-inv { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(185,28,28,0.4); } 70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(185,28,28,0); } 100% { transform: scale(1); } }
            #smart-garden-widget { width: 300px; margin: 0 auto; font-family: 'Plus Jakarta Sans', sans-serif; }
            .garden-main-card { background: #fff!important; padding: 18px; box-shadow: 0 0 0 8px rgba(255,255,255,0.5)!important; min-height: 520px; display: flex; flex-direction: column; border: 1px solid #eee; border-radius: 4px; }
            .garden-title { font-family: 'Dancing Script', cursive!important; font-size: 3.6em!important; text-align: center; margin: 5px 0 12px; color: #1a1a1a; }
            .section-title { font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1.2px; margin: 12px 0 8px; color: #64748b; border-bottom: 1px solid rgba(0,0,0,0.06); }
            .carousel-wrapper { position: relative; height: 115px; overflow: hidden; margin-bottom: 8px; }
            .carousel-item { position: absolute; width: 100%; opacity: 0; visibility: hidden; transition: opacity 0.8s; }
            .carousel-item.active { opacity: 1; visibility: visible; }
            .card-container { position: relative; padding-left: 14px; }
            .card-line { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; border-radius: 2px; }
            .card-type-alert { background: #b91c1c; } .card-type-window { background: #2d6a4f; } .card-type-info { background: #6691b3; } .card-type-none { background: #94a3b8; }
            .time-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800; margin-right: 5px; color: #fff; }
            .time-urgent { background: #b91c1c; animation: pulse-inv 2s infinite; }
            .time-warning { background: #ea580c; } .time-soon { background: #64748b; }
            .event-name { font-weight: 800; font-size: 15px; color: #1e293b; }
            .event-range { font-size: 10px; font-weight: 700; color: #64748b; margin: 2px 0; }
            .event-msg { font-size: 12px; line-height: 1.4; color: #334155; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
            .footer { text-align: center; font-size: 9px; margin-top: auto; opacity: 0.6; padding-top: 8px; border-top: 1px solid #eee; }
            .loc-btn { width: 100%; cursor: pointer; padding: 6px; font-size: 9px; font-weight: 800; border: none; background: #475569; color: #fff; text-transform: uppercase; margin-bottom: 4px; border-radius: 4px; }
        `,
        renderCard: (it, idx) => `
            <div class="carousel-item ${idx === 0 ? 'active' : ''}">
                <div class="card-container">
                    <div class="card-line card-type-${it.type || 'info'}"></div>
                    <div class="event-name">${it.title}</div>
                    <div class="event-range">${it.range || ''}</div>
                    <div class="event-msg">${it.msg}</div>
                </div>
            </div>`
    };

    // --- 2. IDŐJÁRÁSI LOGIKA (A SZABÁLYOK ŐRE) ---
    function checkSustained(weather, dayIdx, cond, ruleType) {
        if (!cond || Object.keys(cond).length === 0) return false;
        const days = cond.days_min || 1;
        
        const checkSingle = (key, idx) => {
            const d = weather.daily;
            if (idx < 0 || !d.time[idx]) return false; 
            if (key === 'temp_min_below' || key === 'temp_below') return d.temperature_2m_min[idx] <= cond[key];
            if (key === 'temp_max_below') return d.temperature_2m_max[idx] <= cond[key];
            if (key === 'temp_above') return d.temperature_2m_max[idx] >= cond[key];
            if (key === 'rain_min') return d.precipitation_sum[idx] >= cond[key];
            if (key === 'rain_max') return d.precipitation_sum[idx] <= cond[key];
            const wKey = ruleType === 'alert' ? 'wind_gusts_10m_max' : 'wind_speed_10m_max';
            if (key === 'wind_min') return d[wKey][idx] >= cond[key];
            if (key === 'wind_max') return d[wKey][idx] <= cond[key];
            return true;
        };

        for (const key in cond) {
            if (key === 'days_min') continue;
            const isAny = key.endsWith('_any');
            const baseKey = isAny ? key.replace('_any', '') : key;
            const res = [];
            for (let j = 0; j < days; j++) res.push(checkSingle(baseKey, dayIdx - j));
            if (!(isAny ? res.some(r => r) : res.every(r => r))) return false;
        }
        return true;
    }

    async function init() {
        const container = document.getElementById('smart-garden-widget');
        if (!container) return;

        const styleTag = document.createElement("style");
        styleTag.textContent = GARDEN_UI.styles;
        document.head.appendChild(styleTag);

        let lat = 47.5136, lon = 19.3735; // Csak koordináták
        const sLat = localStorage.getItem('garden-lat'), sLon = localStorage.getItem('garden-lon');
        if (sLat) { lat = Number(sLat); lon = Number(sLon); }

        try {
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&timezone=auto&past_days=3`;
            const [rulesJson, hData, weather] = await Promise.all([
                fetch('https://raw.githubusercontent.com/amezitlabaskert-lab/smart-events/main/blog-scripts.json').then(r => r.json()),
                fetch('https://raw.githubusercontent.com/amezitlabaskert-lab/workflows/main/riasztasok.json').then(r => r.json()).catch(() => ({alerts:[]})),
                fetch(weatherUrl).then(r => r.json())
            ]);

            const results = { alert: [], info: [], window: [], idle: [] };
            const todayStr = new Date().toISOString().split('T')[0];
            const todayIdx = weather.daily.time.findIndex(t => t === todayStr);
            const monthDay = new Date().toISOString().slice(5,10);

            // 1. SZABÁLY: GÖRDÜLŐ ABLAK ÉS MAI PRIORITÁS
            rulesJson.forEach(rule => {
                const isSeasonal = !rule.conditions || Object.keys(rule.conditions).length === 0;
                if (isSeasonal) {
                    if (rule.seasons?.some(s => monthDay >= s.start && monthDay <= s.end)) results.idle.push({ ...rule, type: 'info' });
                    return;
                }

                let activeToday = checkSustained(weather, todayIdx, rule.conditions, rule.type); // MAI ELLENŐRZÉS
                let futureStart = null;

                // 3. SZABÁLY: JÖVŐBELI SZŰRÉS (Max 4 napra előre)
                for (let i = todayIdx + 1; i <= todayIdx + 4; i++) {
                    if (i >= weather.daily.time.length) break;
                    if (checkSustained(weather, i, rule.conditions, rule.type)) {
                        futureStart = weather.daily.time[i];
                        break; // Csak az első előfordulást keressük
                    }
                }

                if (activeToday) {
                    results[rule.type === 'alert' ? 'alert' : 'info'].push({ 
                        title: rule.name, msg: rule.message, type: rule.type, 
                        range: `<span class="time-badge time-urgent">MA</span>` 
                    });
                } else if (futureStart) {
                    const diff = Math.round((new Date(futureStart).setHours(12,0,0,0) - new Date(todayStr).setHours(12,0,0,0)) / 86400000);
                    const bClass = diff === 1 ? "time-warning" : "time-soon";
                    results[rule.type === 'alert' ? 'alert' : (rule.type === 'window' ? 'window' : 'info')].push({
                        title: rule.name, msg: rule.message, type: rule.type,
                        range: `<span class="time-badge ${bClass}">${diff === 1 ? 'HOLNAP' : diff + ' NAP MÚLVA'}</span>`
                    });
                }
            });

            // HungaroMet (Marad anonim)
            if (hData.alerts) {
                const myAlert = hData.alerts.find(a => a.j.some(j => j.includes(lat.toFixed(1))));
                if (myAlert) results.alert.unshift({ type: 'alert', title: `MET: ${myAlert.v}`, range: `<span class="time-badge time-urgent">MOST</span>`, msg: `Figyelmeztetés: ${myAlert.v}.` });
            }

            const buildZone = (type) => {
                let items = results[type];
                if (type === 'info' && items.length === 0) items = results.idle;
                if (items.length === 0) return `<div class="event-msg" style="opacity:0.5; padding:10px;">Nincs aktuális esemény.</div>`;
                return `<div id="${type}-carousel" class="carousel-wrapper">${items.map((it, idx) => GARDEN_UI.renderCard(it, idx)).join('')}</div>`;
            };

            container.innerHTML = `
                <div class="garden-main-card">
                    <div class="garden-title">Kertfigyelő</div>
                    <button id="locBtn" class="loc-btn">${sLat ? 'Visszaállítás' : 'Saját kertem'}</button>
                    <div class="section-title">Riasztások</div>${buildZone('alert')}
                    <div class="section-title">Teendők</div>${buildZone('info')}
                    <div class="section-title">Lehetőségek</div>${buildZone('window')}
                    <div class="footer">${lastUpdatedLabel}<br>${version}</div>
                </div>`;

            ['alert', 'info', 'window'].forEach(id => {
                const domItems = container.querySelectorAll(`#${id}-carousel .carousel-item`);
                if (domItems.length > 1) {
                    let idx = 0; setInterval(() => { 
                        domItems[idx].classList.remove('active'); idx = (idx+1)%domItems.length; domItems[idx].classList.add('active'); 
                    }, 5000);
                }
            });

            document.getElementById('locBtn').onclick = () => {
                if (sLat) { localStorage.removeItem('garden-lat'); localStorage.removeItem('garden-lon'); }
                else { navigator.geolocation.getCurrentPosition(p => { 
                    localStorage.setItem('garden-lat', p.coords.latitude); localStorage.setItem('garden-lon', p.coords.longitude); location.reload(); 
                }); }
                location.reload();
            };
        } catch(e) { console.error(version, e); }
    }
    init();
})();
