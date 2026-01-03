(async function() {
    // 1. CSS hozzáadása programozottan, hogy ne kelljen külön fájl
    const style = document.createElement('style');
    style.innerHTML = `
        #smart-garden-widget { font-family: 'Open Sans', sans-serif; max-width: 100%; margin: 10px 0; }
        .garden-card { padding: 15px; border-radius: 8px; margin-bottom: 12px; border-left: 6px solid #8ebf42; background: #f4f9ed; box-shadow: 0 2px 4px rgba(0,0,0,0.1); color: #333; }
        .garden-card.alert { background: #fff0f0; border-left-color: #ff4d4d; color: #b30000; }
        .garden-card hstrong { display: block; font-size: 1.1em; margin-bottom: 5px; }
        .garden-card p { margin: 5px 0; font-size: 0.9em; line-height: 1.4; }
        .plant-list { font-style: italic; color: #666; font-size: 0.85em; }
    `;
    document.head.appendChild(style);

    // 2. Adatok lekérése (JSON és Időjárás)
    const lat = 47.62;
    const lon = 19.52;
    
    try {
        // A te GitHub JSON fájlod (cseréld le a saját raw linkedre!)
        const rulesRes = await fetch('https://raw.githubusercontent.com/amezitlabaskert-lab/smart-events/main/blog-scripts.json');
        const rules = await rulesRes.json();
        
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_min,wind_speed_10m_max,precipitation_sum&timezone=auto`);
        const weather = await weatherRes.json();

        const today = {
            tempMin: weather.daily.temperature_2m_min[0],
            windMax: weather.daily.wind_speed_10m_max[0],
            rain: weather.daily.precipitation_sum[0],
            date: new Date()
        };

        const widgetDiv = document.getElementById('smart-garden-widget');
        let htmlContent = '';

        rules.forEach(rule => {
            let isTriggered = false;

            // Fagy ellenőrzés
            if (rule.type === 'alert' && today.tempMin <= rule.trigger.temp_min) {
                isTriggered = true;
            }

            // Permetezési ablak ellenőrzés (Szezon + Időjárás)
            if (rule.type === 'window') {
                const now = new Date();
                const [startMonth, startDay] = rule.season.start.split('-').map(Number);
                const [endMonth, endDay] = rule.season.end.split('-').map(Number);
                const startDate = new Date(now.getFullYear(), startMonth - 1, startDay);
                const endDate = new Date(now.getFullYear(), endMonth - 1, endDay);

                if (now >= startDate && now <= endDate) {
                    if (today.tempMin >= rule.conditions.temp_min && 
                        today.windMax <= rule.conditions.wind_max && 
                        today.rain <= rule.conditions.rain_max) {
                        isTriggered = true;
                    }
                }
            }

            if (isTriggered) {
                htmlContent += `
                    <div class="garden-card ${rule.type === 'alert' ? 'alert' : ''}">
                        <strong>${rule.name}</strong>
                        <p>${rule.message}</p>
                        <div class="plant-list">Érintett: ${rule.plants.join(', ')}</div>
                    </div>
                `;
            }
        });

        widgetDiv.innerHTML = htmlContent;

    } catch (error) {
        console.error('Kerti widget hiba:', error);
    }
})();
