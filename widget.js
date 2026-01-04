(async function() {
    const esc = str => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
    
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    function isInSeason(date, startStr, endStr) {
        const [sM, sD] = startStr.split('-').map(Number);
        const [eM, eD] = endStr.split('-').map(Number);
        const year = date.getFullYear();
        let start = new Date(year, sM - 1, sD);
        let end = new Date(year, eM - 1, eD);
        if (end < start) { 
            if (date >= start) return true;
            let prevYearStart = new Date(year - 1, sM - 1, sD);
            let prevYearEnd = new Date(year, eM - 1, eD);
            return date >= prevYearStart && date <= prevYearEnd;
        }
        return date >= start && date <= end;
    }

    function checkDay(rule, weather, date, i, FORECAST_DAYS) {
        if (!weather.daily || weather.daily.temperature_2m_min[i] === undefined) return false;
        
        const dayMin = weather.daily.temperature_2m_min[i];
        const dayWind = weather.daily.wind_speed_10m_max[i] || 0;
        const dayRain = weather.daily.precipitation_sum[i] || 0;
        const daySoil = weather.daily.soil_temperature_0_to_7cm ? weather.daily.soil_temperature_0_to_7cm[i] : null;

        const seasons = rule.seasons || (rule.season ? [rule.season] : null);
        if (seasons && !seasons.some(s => isInSeason(date, s.start, s.end))) return false;

        const cond = rule.conditions || rule.trigger || {};

        if (cond.temp_below !== undefined && dayMin > cond.temp_below) return false;
        if (cond.temp_above !== undefined && dayMin < cond.temp_above) return false;

        if (cond.temp_above_sustained !== undefined) {
            if (i > FORECAST_DAYS - 3) return false; 
            const futureTemps = weather.daily.temperature_2m_min.slice(i, i + 3);
            if (futureTemps.length < 3 || !futureTemps.every(t => t >= cond.temp_above_sustained)) return false;
        }

        if (cond.soil_temp_stable !== undefined) {
            if (i > FORECAST_DAYS - 2) return false;
            const nextDaySoil = weather.daily.soil_temperature_0_to_7cm[i + 1];
            if (daySoil < cond.soil_temp_stable || nextDaySoil < cond.soil_temp_stable) return false;
        }

        if (cond.rain_max !== undefined && dayRain > cond.rain_max) return false;
        if (cond.rain_min !== undefined && dayRain < cond.rain_min) return false;
        if (cond.wind_max !== undefined && dayWind > cond.wind_max) return false;

        return true;
    }

    window.activateLocalWeather = () => navigator.geolocation.getCurrentPosition(p => {
        localStorage.setItem('garden-lat', p.coords.latitude);
        localStorage.setItem('garden-lon', p.coords.longitude);
        location.reload();
    });

    window.resetLocation = () => { 
        localStorage.removeItem('garden-lat');
        localStorage.removeItem('garden-lon');
        location.reload(); 
    };

    try {
        const lat = localStorage.getItem('garden-lat') || 47.5136;
        const lon = localStorage.getItem('garden-lon') || 19.3735;
        const isPersonalized = !!localStorage.getItem('garden-lat');

        const [rulesRes, weatherRes] = await Promise.all([
            fetch('https://raw.githubusercontent.com/amezitlabaskert-lab/smart-events/main/blog-scripts.json'),
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_min,wind_speed_10m_max,precipitation_sum,soil_temperature_0_to_7cm&timezone=auto`)
        ]);

        const rules = await rulesRes.json();
        const weather = await weatherRes.json();
        const widgetDiv = document.getElementById('smart-garden-widget');
        const FORECAST_DAYS = weather.daily.temperature_2m_min.length;

        let htmlHeader = `
            <div style="background: #f8fafc; padding: 18px; border-radius: 14px; border: 1px solid #e2e8f0; position: relative; font-family: 'Plus Jakarta Sans', sans-serif; margin-bottom: 15px;">
                <div style="position: absolute; top: 0; right: 0; background: #fef3c7; color: #92400e; font-size: 0.65rem; font-weight: 800; padding: 4px 12px; border-bottom-left-radius: 10px; text-transform: uppercase;">Tesztüzem v1.7</div>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;">
                    <div style="flex: 1;">
                        <span style="font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                            ${isPersonalized ? '<span style="color: #22c55e;">✅</span> SAJÁT KERT' : '<span style="filter: grayscale(1);">📍</span> ÁLTALÁNOS HELYSZÍN'}
                        </span>
                        <p style="margin: 4px 0 0; font-size: 0.85rem; color: #64748b;">${isPersonalized ? 'A te környezeted adatai alapján.' : 'Bázis-adatok alapján.'}</p>
                    </div>
                    <button onclick="${isPersonalized ? 'resetLocation()' : 'activateLocalWeather()'}" style="padding: 10px 16px; border-radius: 10px; cursor: pointer; border: none; font-weight: 700; background: ${isPersonalized ? '#e2e8f0' : '#15803d'}; color: ${isPersonalized ? '#475569' : 'white'}; transition: 0.2s;">
                        ${isPersonalized ? 'Vissza az alaphoz' : 'Saját kertre szabom'}
                    </button>
                </div>
            </div>`;

        let htmlCards = '';
        let hasActiveCards = false;
        const today = new Date();
        today.setHours(12, 0, 0, 0); 

        rules.forEach(rule => {
            const typeClass = ['alert','info','window'].includes(rule.type) ? rule.type : 'info';
            let windows = [];

            // --- HELYREÁLLÍTOTT ALERT VS WINDOW LOGIKA ---
            if (typeClass === 'alert') {
                let first = null, last = null;
                for (let i = 0; i < FORECAST_DAYS; i++) {
                    const d = new Date(today); d.setDate(today.getDate() + i);
                    if (checkDay(rule, weather, d, i, FORECAST_DAYS)) {
                        if (!first) first = new Date(d);
                        last = new Date(d);
                    }
                }
                if (first) windows.push({ s: first, e: last });
            } else {
                let current = null;
                for (let i = 0; i < FORECAST_DAYS; i++) {
                    const d = new Date(today); d.setDate(today.getDate() + i);
                    if (checkDay(rule, weather, d, i, FORECAST_DAYS)) {
                        if (!current) current = { s: new Date(d), e: new Date(d) };
                        else current.e = new Date(d);
                    } else if (current) { windows.push(current); current = null; }
                }
                if (current) windows.push(current);
            }

            if (typeClass === 'window' && windows.length > 1) {
                htmlCards += `
                    <div style="margin-bottom:10px; padding:12px 16px; background:#f0fdf4; border-radius:12px; border-left:4px solid #22c55e; color:#15803d; font-size:0.9rem; font-weight:600; font-family: 'Plus Jakarta Sans', sans-serif;">
                        📅 ${windows.length} alkalmas időszak: ${esc(rule.name)}
                    </div>`;
            }

            windows.forEach(w => {
                hasActiveCards = true;
                const dStr = w.s.toLocaleDateString('hu-HU', {month:'short', day:'numeric'}) + (w.s.getTime() !== w.e.getTime() ? ' - ' + w.e.toLocaleDateString('hu-HU', {month:'short', day:'numeric'}) : '');
                const bg = typeClass === 'alert' ? 'linear-gradient(135deg, #1e3a8a, #3b82f6)' : typeClass === 'window' ? 'linear-gradient(135deg, #15803d, #22c55e)' : 'linear-gradient(135deg, #0369a1, #0ea5e9)';
                
                htmlCards += `
                    <div class="garden-card ${typeClass}" style="margin-bottom:15px; padding:20px; border-radius:16px; color:white; border-left: 8px solid rgba(255,255,255,0.3); background: ${bg}; font-family: 'Plus Jakarta Sans', sans-serif;">
                        <strong style="display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">${esc(dStr)}: ${esc(rule.name)}</strong>
                        <p style="margin:0 0 12px 0; opacity:0.95; line-height:1.5;">${esc(rule.message)}</p>
                        ${rule.plants?.length ? `<div style="font-size:0.85em; background:rgba(255,255,255,0.15); padding:8px 12px; border-radius:8px; font-weight:600;">Érintett: ${esc(rule.plants.join(', '))}</div>` : ''}
                    </div>`;
            });
        });

        const fallbackContent = `<p style="text-align:center; padding:30px; color:#94a3b8; font-size: 0.9rem; font-style: italic;">Jelenleg nincs aktív kerti teendő.</p>`;
        widgetDiv.innerHTML = htmlHeader + (hasActiveCards ? htmlCards : fallbackContent);

    } catch (e) { console.error("Widget hiba:", e); }
})();
