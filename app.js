document.addEventListener("DOMContentLoaded", () => {
    
    // Инициализация Telegram WebApp API
    let tgUser = null;
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand(); // Открываем Mini App на весь экран смартфона

        // Берём данные реального пользователя Telegram, если они доступны
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            tgUser = tg.initDataUnsafe.user;
            
            // Заполняем имя в профиле
            const nameField = document.getElementById("profile-name");
            if (nameField) {
                nameField.textContent = tgUser.first_name + (tgUser.last_name ? " " + tgUser.last_name : "");
            }
        }
    }

    // Если открыли в обычном браузере, ставим стандартное имя
    const nameField = document.getElementById("profile-name");
    if (nameField && nameField.textContent === "Загрузка...") {
        nameField.textContent = "Гость Фермы";
    }

    // 1. АВТОМАТИЧЕСКИЙ СПЛЕШ-СКРИН (ЗАГРУЗКА)
    const splashScreen = document.getElementById("splash-screen");
    const appContainer = document.getElementById("app-container");

    setTimeout(() => {
        splashScreen.style.opacity = "0";
        setTimeout(() => {
            splashScreen.style.display = "none";
            appContainer.classList.remove("hidden");
        }, 500);
    }, 2500);

    // 2. ПЕРЕКЛЮЧЕНИЕ ТАБОВ (НИЖНЕЕ МЕНЮ)
    const navItems = document.querySelectorAll(".nav-item");
    const screens = document.querySelectorAll(".screen");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            // Снимаем класс active со старой кнопки
            document.querySelector(".nav-item.active").classList.remove("active");
            // Добавляем текущей кнопке
            item.classList.add("active");

            // Ищем нужный экран
            const targetId = item.getAttribute("data-screen");
            const targetScreen = document.getElementById(targetId);

            // Убираем старый экран
            document.querySelector(".screen.active").classList.remove("active");
            // Показываем новый
            targetScreen.classList.add("active");
        });
  
    });

      // ==========================================================================
    // 4. КОЛЕСО ЖЕЛАНИЙ (ЦЕНТРИРОВАННОЕ - 200px + ПЛАТНЫЕ ВРАЩЕНИЯ + ПРИЗ 20 ЗВЕЗД)
    // ==========================================================================
    const btnOpenWheel = document.getElementById("btn-open-wheel");
    const btnCloseWheel = document.getElementById("btn-close-wheel");
    const wheelModal = document.getElementById("wheel-modal");
    const btnSpin = document.getElementById("btn-spin");
    const spinsLeftField = document.getElementById("spins-left");
    const wheelStatusText = document.getElementById("wheel-status-text");
    const canvas = document.getElementById("wheel-canvas");
    const ctx = canvas?.getContext("2d");

    const starsBalanceField = document.getElementById("stars-balance");
    const coinsBalanceField = document.getElementById("coins-balance");

    let currentStars = 20; 
    let currentCoins = 1000;
    const FREE_SPINS = 3;
    const WHEEL_STORAGE_KEY = "wheelState";
    let spinsLeft = FREE_SPINS;
    let isSpinning = false;

    function todayKey() {
        const now = new Date();
        return now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, "0") + "-" +
            String(now.getDate()).padStart(2, "0");
    }

    function syncDailySpins() {
        const today = todayKey();
        let used = 0;
        try {
            const saved = JSON.parse(localStorage.getItem(WHEEL_STORAGE_KEY) || "null");
            if (saved && saved.date === today) {
                used = Math.min(FREE_SPINS, Math.max(0, Number(saved.used) || 0));
            }
        } catch (error) {
            used = 0;
        }
        spinsLeft = Math.max(0, FREE_SPINS - used);
    }

    function saveDailySpins() {
        try {
            localStorage.setItem(WHEEL_STORAGE_KEY, JSON.stringify({
                date: todayKey(),
                used: Math.max(0, FREE_SPINS - spinsLeft)
            }));
        } catch (error) {
            // localStorage может быть недоступен внутри WebView
        }
    }

    function renderSpins() {
        if (spinsLeftField) spinsLeftField.textContent = spinsLeft;
    }

    const WALLET_STORAGE_KEY = "walletState";

    try {
        const savedWallet = JSON.parse(localStorage.getItem(WALLET_STORAGE_KEY) || "null");
        if (savedWallet && Number.isFinite(savedWallet.stars)) currentStars = savedWallet.stars;
        if (savedWallet && Number.isFinite(savedWallet.coins)) currentCoins = savedWallet.coins;
    } catch (error) {
        // повреждённое сохранение — стартуем с базового баланса
    }

    function saveWallet() {
        try {
            localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ stars: currentStars, coins: currentCoins }));
        } catch (error) {
            // localStorage может быть недоступен внутри WebView
        }
    }

    function renderBalances() {
        if (starsBalanceField) starsBalanceField.textContent = currentStars;
        if (coinsBalanceField) coinsBalanceField.textContent = currentCoins.toLocaleString();
        const crashStars = document.getElementById("crash-stars");
        const crashCoins = document.getElementById("crash-coins");
        if (crashStars) crashStars.textContent = currentStars;
        if (crashCoins) crashCoins.textContent = currentCoins.toLocaleString();
    }

    function addStars(value) {
        currentStars += value;
        renderBalances();
        saveWallet();
    }

    function addCoins(value) {
        currentCoins += value;
        renderBalances();
        saveWallet();
    }

    renderBalances();

    // ==========================================================================
    // РАБОТА С СЕРВЕРОМ (если приложение открыто с бэкенда)
    // Без сервера всё работает как раньше — на localStorage.
    // ==========================================================================
    const DEVICE_KEY = "deviceId";
    let deviceId = "";
    try {
        deviceId = localStorage.getItem(DEVICE_KEY) || "";
        if (!deviceId) {
            deviceId = (window.crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : "d" + Date.now() + Math.random().toString(16).slice(2);
            localStorage.setItem(DEVICE_KEY, deviceId);
        }
    } catch (error) {
        deviceId = "d" + Date.now();
    }

    let serverMode = false;
    let serverInventory = null;

    // Адрес API: по умолчанию тот же домен, но можно указать ?api=https://...
    // Это удобно, чтобы направить фронт на staging-сервер.
    const API_QUERY = new URLSearchParams(location.search).get("api") || "";
    const API_BASE = API_QUERY.replace(/\/$/, "");

    function apiHeaders() {
        const headers = { "Content-Type": "application/json", "X-Device-Id": deviceId };
        const tg = window.Telegram && window.Telegram.WebApp;
        if (tg && tg.initData) headers["X-Init-Data"] = tg.initData;
        return headers;
    }

    const API_TIMEOUT_MS = 15000;

    async function api(path, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
        const opts = Object.assign({ headers: apiHeaders(), signal: controller.signal }, options || {});

        let response;
        try {
            response = await fetch(API_BASE + path, opts);
        } catch (error) {
            clearTimeout(timer);
            const problem = new Error("api network");
            problem.status = 0;
            problem.data = {};
            throw problem;
        }
        clearTimeout(timer);

        let data = null;
        try {
            data = await response.json();
        } catch (error) {
            data = null;
        }
        if (!response.ok) {
            const problem = new Error("api " + response.status);
            problem.status = response.status;
            problem.data = data || {};
            throw problem;
        }
        return data || {};
    }

    function applyServerState(data) {
        if (!data) return;
        if (Number.isFinite(data.stars)) currentStars = data.stars;
        if (Number.isFinite(data.coins)) currentCoins = data.coins;
        if (Array.isArray(data.inventory)) serverInventory = data.inventory;
        if (Number.isFinite(data.spins_left)) {
            spinsLeft = data.spins_left;
            renderSpins();
            updateSpinButtonState();
        }
        renderBalances();
        saveWallet();
    }

    async function initServer() {
        try {
            const health = await api("/api/health");
            serverMode = !!health.ok;
        } catch (error) {
            serverMode = false;
        }
        if (!serverMode) return;

        try {
            applyServerState(await api("/api/me"));
            renderInventory();
        } catch (error) {
            serverMode = false;
        }
    }

    // Изменили сектор "+1 ⭐" на "+20 ⭐"
    const prizes = [
        { text: "Пусто ❌", type: "empty", value: 0, color: "#181b22" },
        { text: "500 💰", type: "coins", value: 500, color: "#1f232b" },
        { text: "Пусто ❌", type: "empty", value: 0, color: "#181b22" },
        { text: "20 ⭐", type: "stars", value: 20, color: "#ccff00" }, 
        { text: "Пусто ❌", type: "empty", value: 0, color: "#181b22" },
        { text: "1000 💰", type: "coins", value: 1000, color: "#1f232b" },
        { text: "Пусто ❌", type: "empty", value: 0, color: "#181b22" },
        { text: "5 ⭐", type: "stars", value: 5, color: "#11998e" }
    ];
    const numSectors = prizes.length;
    const arcSize = (2 * Math.PI) / numSectors;

    function drawWheel() {
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = canvas.width / 2 - 4;

        for (let i = 0; i < numSectors; i++) {
            const angle = i * arcSize;
            
            ctx.beginPath();
            ctx.fillStyle = prizes[i].color;
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, angle, angle + arcSize);
            ctx.lineTo(cx, cy);
            ctx.fill();
            ctx.strokeStyle = "#242933";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle + arcSize / 2);
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillStyle = prizes[i].color === "#ccff00" ? "#000000" : "#ffffff";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText(prizes[i].text, radius - 15, 0);
            ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
        ctx.fillStyle = "#ccff00";
        ctx.fill();
        ctx.strokeStyle = "#242933";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawWheel();
    syncDailySpins();
    renderSpins();

    function updateSpinButtonState() {
        if (!btnSpin) return;
        if (spinsLeft > 0) {
            btnSpin.innerHTML = "КРУТИТЬ! 🎡";
            if (spinsLeftField) spinsLeftField.parentElement.style.opacity = "1";
        } else {
            btnSpin.innerHTML = "КРУТИТЬ ЗА 10 ⭐";
            if (spinsLeftField) spinsLeftField.parentElement.style.opacity = "0.5";
        }
    }

    updateSpinButtonState();

    if (btnOpenWheel) {
        btnOpenWheel.addEventListener("click", async () => {
            if (wheelModal) wheelModal.classList.remove("hidden-modal");
            if (wheelStatusText) wheelStatusText.textContent = "";

            if (serverMode) {
                // Прокруты и баланс берём с сервера, иначе открытие колеса сбрасывает счётчик
                try {
                    applyServerState(await api("/api/me"));
                } catch (error) {
                    // остаёмся с тем, что уже известно
                }
            } else {
                syncDailySpins();
            }

            renderSpins();
            updateSpinButtonState();
        });
    }

    if (btnCloseWheel) {
        btnCloseWheel.addEventListener("click", () => {
            if (!isSpinning && wheelModal) wheelModal.classList.add("hidden-modal");
        });
    }

    if (wheelModal) {
        wheelModal.addEventListener("click", (event) => {
            if (event.target === wheelModal && !isSpinning) {
                wheelModal.classList.add("hidden-modal");
            }
        });
    }

    function animateWheelTo(targetIndex) {
        const degreesPerSector = 360 / numSectors;
        const targetAngle = 270 - (targetIndex * degreesPerSector) - (degreesPerSector / 2);
        const totalRotation = 360 * 5 + targetAngle;

        if (canvas) canvas.style.transform = `rotate(${totalRotation}deg)`;

        setTimeout(() => {
            isSpinning = false;
            if (btnSpin) btnSpin.disabled = false;
            if (canvas) {
                canvas.style.transition = "none";
                canvas.style.transform = `rotate(${totalRotation % 360}deg)`;
                canvas.offsetHeight;
                canvas.style.transition = "transform 4s cubic-bezier(0.1, 0.8, 0.1, 1)";
            }
        }, 4000);
    }

    function wheelPrizeText(prize) {
        if (prize.type === "coins") return "Вы выиграли: " + prize.text + " 💰";
        if (prize.type === "stars") return "УРА! Вы выиграли: " + prize.text + " ⭐";
        return "В этот раз пусто. Попробуй еще! 🍀";
    }

    if (btnSpin) {
        btnSpin.addEventListener("click", async () => {
            if (isSpinning) return;

            if (serverMode) {
                isSpinning = true;
                btnSpin.disabled = true;
                if (wheelStatusText) {
                    wheelStatusText.style.color = "#ccff00";
                    wheelStatusText.textContent = "Колесо желаний крутится...";
                }

                let result;
                try {
                    result = await api("/api/wheel/spin", { method: "POST", body: "{}" });
                } catch (error) {
                    isSpinning = false;
                    btnSpin.disabled = false;
                    if (wheelStatusText) {
                        wheelStatusText.style.color = "#ff3838";
                        if (error.status === 402) {
                            wheelStatusText.textContent = "Бесплатные прокруты кончились, а Stars не хватает ❌";
                        } else if (error.status === 401) {
                            wheelStatusText.textContent = "Открой приложение через Telegram ⭐";
                        } else {
                            wheelStatusText.textContent = "Сервер не ответил. Попробуй ещё раз.";
                        }
                    }
                    return;
                }

                applyServerState(result);
                spinsLeft = result.spins_left;
                renderSpins();
                updateSpinButtonState();
                animateWheelTo(result.index);
                setTimeout(() => {
                    if (!wheelStatusText) return;
                    wheelStatusText.style.color = "#ccff00";
                    wheelStatusText.textContent = wheelPrizeText(result.prize);
                }, 4000);
                return;
            }

            let isPaidSpin = false;
            if (spinsLeft <= 0) {
                if (currentStars < 10) {
                    if (wheelStatusText) {
                        wheelStatusText.style.color = "#ff3838";
                        wheelStatusText.textContent = "Недостаточно Stars на балансе! ❌";
                    }
                    return;
                }
                isPaidSpin = true;
            }

            isSpinning = true;
            btnSpin.disabled = true;
            if (wheelStatusText) {
                wheelStatusText.style.color = "#ccff00";
                wheelStatusText.textContent = isPaidSpin ? "Списание 10 ⭐... Колесо желаний крутится!" : "Колесо желаний крутится...";
            }
            
            if (isPaidSpin) {
                currentStars -= 10;
                renderBalances();
                saveWallet();
            } else {
                spinsLeft--;
                renderSpins();
                saveDailySpins();
            }

            const winningIndex = Math.floor(Math.random() * numSectors);
            const degreesPerSector = 360 / numSectors;
            const targetAngle = 270 - (winningIndex * degreesPerSector) - (degreesPerSector / 2);
            const totalRotation = 360 * 5 + targetAngle;

            // Исправленные кавычки для физического вращения canvas
            if (canvas) canvas.style.transform = `rotate(${totalRotation}deg)`;

            setTimeout(() => {
                isSpinning = false;
                btnSpin.disabled = false;
                
                const prize = prizes[winningIndex];
                if (wheelStatusText) wheelStatusText.style.color = "#ccff00";
                
                if (prize.type === "coins") {
                    addCoins(prize.value);
                    if (wheelStatusText) wheelStatusText.textContent = `Вы выиграли: ${prize.text}! 💰`;
                } else if (prize.type === "stars") {
                    addStars(prize.value);
                    if (wheelStatusText) wheelStatusText.textContent = `УРА! Вы выиграли ЗВЕЗДУ: ${prize.text}! ⭐`;
                } else {
                    if (wheelStatusText) wheelStatusText.textContent = "В этот раз пусто. Попробуй еще! 🍀";
                }

                updateSpinButtonState();

                // Вернули на место обязательный сброс анимации без рывков
                setTimeout(() => {
                    if (canvas) {
                        canvas.style.transition = "none";
                        const remainderAngle = totalRotation % 360;
                        canvas.style.transform = `rotate(${remainderAngle}deg)`;
                        canvas.offsetHeight; 
                        canvas.style.transition = "transform 4s cubic-bezier(0.1, 0.8, 0.1, 1)";
                    }
                }, 500);

            }, 4000); // 4 секунды кручения — идеальное совпадение с CSS
        });
    }

    // ==========================================================================
    // 5. КРАШ / АПГРЕЙД ШАНСОВ (55 ПОДАРКОВ ИЗ assets/gifts-v2, ЦЕНА — В ИМЕНИ ФАЙЛА)
    // ==========================================================================
    const GIFTS = [
        { name: "Plush Pepe", file: "plush-pepe-10000.png", price: 10000, chanceRate: 10000 },
        { name: "Joyful Bundle", file: "joyful-bundle-1834.png", price: 1834 },
        { name: "Mood Pack", file: "mood-pack-1200.png", price: 1200 },
        { name: "Input Key", file: "input-key-1000.png", price: 1000 },
        { name: "Homemade Cake", file: "homemade-cake-1000.png", price: 1000 },
        { name: "Westside Sign", file: "westside-sign-1000.png", price: 1000 },
        { name: "Perfume Bottle", file: "perfume-bottle-1000.png", price: 1000 },
        { name: "UFC Strike", file: "ufc-strike-603.png", price: 603 },
        { name: "UFC Strike", file: "ufc-strike-602.png", price: 602 },
        { name: "UFC Strike", file: "ufc-strike-601.png", price: 601 },
        { name: "UFC Strike", file: "ufc-strike-600.png", price: 600 },
        { name: "Toy Bear", file: "toy-bear-500.png", price: 500 },
        { name: "Clover Pin", file: "clover-pin-500.png", price: 500 },
        { name: "Khabibs Papakha", file: "khabibs-papakha-500.png", price: 500 },
        { name: "Heroic Helmet", file: "heroic-helmet-500.png", price: 500 },
        { name: "Holiday Drink", file: "holiday-drink-500.png", price: 500 },
        { name: "Pet Snake", file: "pet-snake-401.png", price: 401 },
        { name: "Spy Agaric", file: "spy-agaric-400.png", price: 400 },
        { name: "Astral Shard", file: "astral-shard-400.png", price: 400 },
        { name: "Big Year", file: "big-year-400.png", price: 400 },
        { name: "Swiss Watch", file: "swiss-watch-400.png", price: 400 },
        { name: "Vintage Cigar", file: "vintage-cigar-400.png", price: 400 },
        { name: "Hex Pot", file: "hex-pot-400.png", price: 400 },
        { name: "Low Rider", file: "low-rider-350.png", price: 350 },
        { name: "Jingle Bells", file: "jingle-bells-320.png", price: 320 },
        { name: "Winter Wreath", file: "winter-wreath-300.png", price: 300 },
        { name: "Voodoo Doll", file: "voodoo-doll-300.png", price: 300 },
        { name: "Neko Helmet", file: "neko-helmet-300.png", price: 300 },
        { name: "Moon Pendant", file: "moon-pendant-300.png", price: 300 },
        { name: "Input Key", file: "input-key-300.png", price: 300 },
        { name: "Ewil Eye", file: "ewil-eye-300.png", price: 300 },
        { name: "Light Sword", file: "light-sword-300.png", price: 300 },
        { name: "Top Hat", file: "top-hat-250.png", price: 250 },
        { name: "Vice Cream", file: "vice-cream-250.png", price: 250 },
        { name: "Snoop Dogg", file: "snoop-dogg-201.png", price: 201 },
        { name: "Party Sparkler", file: "party-sparkler-200.png", price: 200 },
        { name: "Easter Egg", file: "easter-egg-200.png", price: 200 },
        { name: "Kissed Frog", file: "kissed-frog-200.png", price: 200 },
        { name: "Fine Pen", file: "fine-pen-200.png", price: 200 },
        { name: "Jolly Chimp", file: "jolly-chimp-200.png", price: 200 },
        { name: "Snoop Dogg", file: "snoop-dogg-200.png", price: 200 },
        { name: "Love Candle", file: "love-candle-200.png", price: 200 },
        { name: "Pet Snake", file: "pet-snake-200.png", price: 200 },
        { name: "Mousse Cake", file: "mousse-cake-200.png", price: 200 },
        { name: "Snake Box", file: "snake-box-200.png", price: 200 },
        { name: "Lolpop", file: "lolpop-200.png", price: 200 },
        { name: "Spiced Wine", file: "spiced-wine-150.png", price: 150 },
        { name: "Bday Candle", file: "bday-candle-100.png", price: 100 },
        { name: "Whip Cupcake", file: "whip-cupcake-100.png", price: 100 },
        { name: "Xmas Stocking", file: "xmas-stocking-100.png", price: 100 },
        { name: "Snow Globe", file: "snow-globe-100.png", price: 100 },
        { name: "Liberty Figure", file: "liberty-figure-100.png", price: 100 },
        { name: "Jelly Bunny", file: "jelly-bunny-100.png", price: 100 },
        { name: "Victory Medal", file: "victory-medal-100.png", price: 100 },
        { name: "Swag Bag", file: "swag-bag-100.png", price: 100 }
    ];

    const slotsLine = document.getElementById("gifts-line");
    const pickerGrid = document.getElementById("picker-grid");
    const pickerBox = document.getElementById("gift-picker");
    const pickerSearch = document.getElementById("picker-search");
    const crashMain = document.getElementById("crash-main");
    const pickerSlotLabel = document.getElementById("picker-slot-label");
    const chanceSlider = document.getElementById("chance-slider");
    const chancePercentText = document.getElementById("chance-percent-text");
    const chanceCostHint = document.getElementById("chance-cost-hint");
    const upgradeCostText = document.getElementById("upgrade-cost-text");
    const chanceFillCircle = document.getElementById("chance-fill-circle");
    const upgradePointer = document.getElementById("upgrade-wheel-pointer");
    const currentGiftImage = document.getElementById("current-gift-image");
    const btnBuyUpgradeSpin = document.getElementById("btn-buy-upgrade-spin");
    const btnChangeGift = document.getElementById("btn-change-gift");
    const btnPickerBack = document.getElementById("btn-picker-back");
    const upgradeStatusText = document.getElementById("upgrade-status-text");
    const chanceChip = document.getElementById("chance-chip");
    const chanceTip = document.getElementById("chance-tip");
    const btnChanceTipClose = document.getElementById("btn-chance-tip-close");
    const crashStarsField = document.getElementById("crash-stars");
    const crashCoinsField = document.getElementById("crash-coins");
    const inventoryGrid = document.getElementById("inventory-grid");
    const inventoryStatus = document.getElementById("inventory-status");
    const btnCrashBack = document.getElementById("btn-crash-back");
    const btnOpenCrash = document.getElementById("btn-open-crash");
    const btnOpenInventory = document.getElementById("btn-open-inventory");

    const CHANCE_MIN = 1;
    const CHANCE_MAX = 85;
    // 1% шанса стоит 10% от цены подарка
    const CHANCE_PRICE_RATE = 0.1;
    const CIRCUMFERENCE = 2 * Math.PI * 87.5;
    const CRASH_STORAGE_KEY = "crashGiftState";
    const OWNED_STORAGE_KEY = "ownedGifts";

    let slotGifts = [0, 1, 2, 3];
    let activeSlot = 0;
    let crashChance = 1;
    let isCrashSpinning = false;
    let ownedGifts = [];
    let pickerQuery = "";

    try {
        const savedOwned = JSON.parse(localStorage.getItem(OWNED_STORAGE_KEY) || "[]");
        if (Array.isArray(savedOwned)) {
            ownedGifts = savedOwned.filter(index =>
                Number.isInteger(index) && index >= 0 && index < GIFTS.length
            );
        }
    } catch (error) {
        ownedGifts = [];
    }

    try {
        const saved = JSON.parse(localStorage.getItem(CRASH_STORAGE_KEY) || "null");
        if (saved && Array.isArray(saved.slots) && saved.slots.length === 4) {
            slotGifts = saved.slots.map(value =>
                Number.isInteger(value) && value >= 0 && value < GIFTS.length ? value : 0
            );
        }
        if (saved && Number.isFinite(saved.chance)) {
            crashChance = Math.min(CHANCE_MAX, Math.max(CHANCE_MIN, Math.round(saved.chance)));
        }
    } catch (error) {
        slotGifts = [0, 1, 2, 3];
    }

    function giftSrc(index) {
        return "assets/gifts-v2/" + GIFTS[index].file;
    }

    const GIFT_INDEX_BY_FILE = {};
    GIFTS.forEach((gift, index) => {
        GIFT_INDEX_BY_FILE[gift.file] = index;
    });

    function saveCrashState() {
        try {
            localStorage.setItem(CRASH_STORAGE_KEY, JSON.stringify({ slots: slotGifts, chance: crashChance }));
        } catch (error) {
            // localStorage может быть недоступен внутри WebView — тихо игнорируем
        }
    }

    function saveOwnedGifts() {
        try {
            localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify(ownedGifts));
        } catch (error) {
            // localStorage может быть недоступен внутри WebView — тихо игнорируем
        }
    }

    function setInventoryStatus(text) {
        if (!inventoryStatus) return;
        inventoryStatus.textContent = text;
    }

    function inventoryEntries() {
        if (serverInventory) {
            return serverInventory.map(item => ({
                id: item.id,
                giftIndex: GIFT_INDEX_BY_FILE[item.gift],
                position: -1
            })).filter(entry => entry.giftIndex !== undefined && entry.giftIndex !== null);
        }
        return ownedGifts
            .map((giftIndex, position) => ({ id: null, giftIndex: giftIndex, position: position }))
            .reverse();
    }

    function renderInventory() {
        if (!inventoryGrid) return;
        inventoryGrid.innerHTML = "";

        const entries = inventoryEntries();

        if (entries.length === 0) {
            const empty = document.createElement("div");
            empty.className = "inventory-empty";
            empty.innerHTML = '<span class="inventory-empty-icon">🎁</span>' +
                '<span>Пока пусто. Выиграй подарок в разделе «Игры → Краш».</span>';
            inventoryGrid.appendChild(empty);
            return;
        }

        entries.forEach(entry => {
            const gift = GIFTS[entry.giftIndex];

            const card = document.createElement("div");
            card.className = "inventory-card";

            const art = document.createElement("div");
            art.className = "inventory-art";

            const image = document.createElement("img");
            image.src = giftSrc(entry.giftIndex);
            image.alt = gift.name;

            const price = document.createElement("span");
            price.className = "inventory-price";
            price.textContent = "⭐ " + gift.price;

            art.appendChild(image);
            art.appendChild(price);

            const name = document.createElement("span");
            name.className = "inventory-name";
            name.textContent = gift.name;

            const withdrawBtn = document.createElement("button");
            withdrawBtn.className = "inventory-withdraw";
            withdrawBtn.textContent = "Вывести";
            withdrawBtn.addEventListener("click", async () => {
                if (entry.id !== null && serverMode) {
                    try {
                        const result = await api("/api/inventory/withdraw", {
                            method: "POST",
                            body: JSON.stringify({ id: entry.id })
                        });
                        applyServerState(result);
                        renderInventory();
                        setInventoryStatus("Заявка на вывод подарка «" + gift.name + "» создана.");
                    } catch (error) {
                        setInventoryStatus("Не удалось отправить заявку. Попробуй ещё раз.", "#ff3838");
                    }
                    return;
                }
                ownedGifts.splice(entry.position, 1);
                saveOwnedGifts();
                renderInventory();
                setInventoryStatus("Заявка на вывод подарка «" + gift.name + "» создана.");
            });

            card.appendChild(art);
            card.appendChild(name);
            card.appendChild(withdrawBtn);
            inventoryGrid.appendChild(card);
        });
    }

    function openCrash() {
        switchToScreen("screen-crash");
        upgradeStatusText && (upgradeStatusText.textContent = "");
        updateCenterGift();
        updateChanceUI();
        syncChanceSlider();
    }

    function closeCrash() {
        closeGiftPicker();
        switchToScreen("screen-games", "screen-games");
    }

    if (btnOpenCrash) btnOpenCrash.addEventListener("click", openCrash);
    if (btnCrashBack) btnCrashBack.addEventListener("click", closeCrash);
    if (btnOpenInventory) {
        btnOpenInventory.addEventListener("click", () => switchToScreen("screen-inventory", "screen-inventory"));
    }

    function syncChanceSlider() {
        if (!chanceSlider) return;
        chanceSlider.value = String(crashChance);
    }

    function spinCost() {
        return chanceCostFor(crashChance);
    }

    function onePercentCost(index) {
        const gift = GIFTS[index];
        if (Number.isFinite(gift.chanceRate)) return gift.chanceRate;
        return Math.max(1, Math.round(gift.price * CHANCE_PRICE_RATE));
    }

    function chanceCostFor(percent) {
        return onePercentCost(slotGifts[activeSlot]) * percent;
    }

    function setStatus(text, color) {
        if (!upgradeStatusText) return;
        upgradeStatusText.textContent = text;
        upgradeStatusText.style.color = color || "#ccff00";
    }

    function updateCenterGift() {
        if (!currentGiftImage) return;
        currentGiftImage.src = giftSrc(slotGifts[activeSlot]);
        currentGiftImage.alt = GIFTS[slotGifts[activeSlot]].name;
    }

    function updateChanceUI() {
        if (chancePercentText) chancePercentText.textContent = crashChance + "%";
        if (chanceChip) chanceChip.textContent = "Шанс " + crashChance + "%";
        if (chanceFillCircle) {
            chanceFillCircle.style.strokeDasharray = CIRCUMFERENCE;
            chanceFillCircle.style.strokeDashoffset = CIRCUMFERENCE * (1 - crashChance / 100);
        }

        const cost = spinCost();
        if (upgradeCostText) upgradeCostText.textContent = cost;
        if (chanceCostHint) chanceCostHint.textContent = cost + " ⭐";
        syncChanceSlider();
    }

    function renderGiftsLine() {
        if (!slotsLine) return;
        slotsLine.innerHTML = "";

        slotGifts.forEach((giftIndex, slotIndex) => {
            const slot = document.createElement("div");
            slot.className = "gift-slot" + (slotIndex === activeSlot ? " active" : "");
            slot.dataset.slot = String(slotIndex);

            const badge = document.createElement("span");
            badge.className = "slot-badge";
            badge.textContent = String(slotIndex + 1);

            const image = document.createElement("img");
            image.src = giftSrc(giftIndex);
            image.alt = GIFTS[giftIndex].name;

            const nameLabel = document.createElement("span");
            nameLabel.className = "slot-name";
            nameLabel.textContent = GIFTS[giftIndex].name;

            slot.appendChild(badge);
            slot.appendChild(image);
            slot.appendChild(nameLabel);
            slot.addEventListener("click", () => {
                activeSlot = slotIndex;
                renderGiftsLine();
                updateCenterGift();
            });

            slotsLine.appendChild(slot);
        });
    }

    function renderPicker() {
        if (!pickerGrid) return;
        pickerGrid.innerHTML = "";

        const query = pickerQuery.trim().toLowerCase();
        let shown = 0;

        GIFTS.forEach((gift, index) => {
            if (query && gift.name.toLowerCase().indexOf(query) === -1) return;
            shown++;

            const item = document.createElement("div");
            item.className = "picker-item" + (slotGifts[activeSlot] === index ? " selected" : "");

            const art = document.createElement("div");
            art.className = "picker-art";

            const image = document.createElement("img");
            image.src = giftSrc(index);
            image.alt = gift.name;

            const priceBadge = document.createElement("span");
            priceBadge.className = "picker-price";
            priceBadge.textContent = "⭐ " + gift.price;

            art.appendChild(image);
            art.appendChild(priceBadge);

            const nameBox = document.createElement("div");
            nameBox.className = "picker-name";

            const nameLabel = document.createElement("span");
            nameLabel.className = "picker-name-text";
            nameLabel.textContent = gift.name;

            const chanceLabel = document.createElement("em");
            chanceLabel.className = "picker-name-chance";
            chanceLabel.textContent = "1% = " + onePercentCost(index) + " ⭐";

            nameBox.appendChild(nameLabel);
            nameBox.appendChild(chanceLabel);

            item.appendChild(art);
            item.appendChild(nameBox);
            item.addEventListener("click", () => {
                slotGifts[activeSlot] = index;
                saveCrashState();
                renderGiftsLine();
                updateCenterGift();
                updateChanceUI();
                closeGiftPicker();
            });

            pickerGrid.appendChild(item);
        });

        if (shown === 0) {
            const empty = document.createElement("p");
            empty.className = "picker-empty";
            empty.textContent = "Ничего не найдено. Попробуй другое название.";
            pickerGrid.appendChild(empty);
        }
    }

    function openGiftPicker() {
        if (!pickerBox || !crashMain) return;
        if (pickerSlotLabel) pickerSlotLabel.textContent = "Слот " + (activeSlot + 1);
        pickerQuery = "";
        if (pickerSearch) pickerSearch.value = "";
        renderPicker();
        crashMain.classList.add("hidden-picker");
        pickerBox.classList.remove("hidden-picker");
        if (pickerBox) pickerBox.scrollTop = 0;
    }

    function closeGiftPicker() {
        if (!pickerBox || !crashMain) return;
        pickerBox.classList.add("hidden-picker");
        crashMain.classList.remove("hidden-picker");
    }

    if (pickerSearch) {
        pickerSearch.addEventListener("input", () => {
            pickerQuery = pickerSearch.value || "";
            renderPicker();
        });
    }

    if (chanceSlider) {
        chanceSlider.value = String(crashChance);
        chanceSlider.addEventListener("input", () => {
            const raw = Number(chanceSlider.value);
            crashChance = Math.min(CHANCE_MAX, Math.max(CHANCE_MIN, Math.round(raw)));
            updateChanceUI();
            saveCrashState();
        });
    }

    if (btnChanceTipClose && chanceTip) {
        btnChanceTipClose.addEventListener("click", () => chanceTip.classList.add("hidden-tip"));
    }

    if (btnChangeGift) btnChangeGift.addEventListener("click", openGiftPicker);
    if (btnPickerBack) btnPickerBack.addEventListener("click", closeGiftPicker);

    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", () => {
            if (item.getAttribute("data-screen") !== "screen-crash") closeGiftPicker();
        });
    });

    function playSpinAnimation(won, giftName, giftIndex) {
        isCrashSpinning = true;
        btnBuyUpgradeSpin.disabled = true;

        // Стрелку ставим именно туда, где нарисован исход
        const winZone = crashChance * 3.6;
        const landingAngle = won
            ? 8 + Math.random() * Math.max(4, winZone - 16)
            : Math.min(352, winZone + 8 + Math.random() * Math.max(4, 352 - winZone - 8));

        const totalRotation = 360 * 4 + landingAngle;

        setStatus("Крутим стрелку... Подарок: " + giftName, "#ccff00");

        if (upgradePointer) {
            upgradePointer.style.transition = "";
            upgradePointer.style.transform = "rotate(" + totalRotation + "deg)";
        }

        setTimeout(() => {
            isCrashSpinning = false;
            btnBuyUpgradeSpin.disabled = false;

            if (won) {
                if (!serverMode) {
                    ownedGifts.push(giftIndex);
                    saveOwnedGifts();
                }
                renderInventory();
                setStatus("Вы выиграли «" + giftName + "»! Подарок уже в инвентаре.", "#ccff00");
            } else {
                setStatus("Не повезло. Стрелка остановилась вне зелёной зоны.", "#8e9297");
            }

            setTimeout(() => {
                if (!upgradePointer) return;
                upgradePointer.style.transition = "none";
                upgradePointer.style.transform = "rotate(" + (totalRotation % 360) + "deg)";
                void upgradePointer.offsetHeight;
                upgradePointer.style.transition = "";
            }, 120);
        }, 2900);
    }

    if (btnBuyUpgradeSpin) {
        btnBuyUpgradeSpin.addEventListener("click", async () => {
            if (isCrashSpinning) return;

            const giftIndex = slotGifts[activeSlot];
            const gift = GIFTS[giftIndex];

            if (serverMode) {
                btnBuyUpgradeSpin.disabled = true;
                setStatus("Проверяем баланс...", "#ccff00");
                let result;
                try {
                    result = await api("/api/spin", {
                        method: "POST",
                        body: JSON.stringify({ gift: gift.file, chance: crashChance })
                    });
                } catch (error) {
                    btnBuyUpgradeSpin.disabled = false;
                    if (error.status === 402) {
                        setStatus("Недостаточно Stars. Пополни баланс ⭐", "#ff3838");
                    } else if (error.status === 401) {
                        setStatus("Открой приложение через Telegram, чтобы играть ⭐", "#ff3838");
                    } else {
                        setStatus("Сервер не ответил. Попробуй ещё раз.", "#ff3838");
                    }
                    return;
                }
                applyServerState(result);
                playSpinAnimation(!!result.won, gift.name, giftIndex);
                return;
            }

            const cost = spinCost();
            if (currentStars < cost) {
                setStatus("Недостаточно Stars. Пополни баланс ⭐", "#ff3838");
                return;
            }

            currentStars -= cost;
            renderBalances();
            saveWallet();

            playSpinAnimation(Math.random() * 100 < crashChance, gift.name, giftIndex);
        });
    }

    // ==========================================================================
    // 6. МЕНЮ ПОПОЛНЕНИЯ, СПОСОБЫ ОПЛАТЫ И ПРОМОКОДЫ
    // ==========================================================================
    // Впиши свои данные, когда бот и приём платежей будут готовы.
    const CONFIG = {
        supportHandle: "@username",
        depositHandle: "@username",
        payLinks: {
            stars: "",
            ton: "",
            nft: "",
            cryptobot: "",
            sbp: "",
            crypto: "",
            crypto2: ""
        }
    };

    const PAY_METHODS = [
        { id: "stars", label: "STARS", icon: "⭐", cls: "stars", badge: "+5%" },
        { id: "ton", label: "TON", icon: "◆", cls: "ton", badge: "+15%" },
        { id: "nft", label: "NFT", icon: "🎁", cls: "nft", badge: "" },
        { id: "cryptobot", label: "CRYPTOBOT", icon: "V", cls: "cryptobot", badge: "" },
        { id: "xrocket", label: "XROCKET", icon: "🚀", cls: "xrocket", badge: "скоро", soon: true },
        { id: "sbp", label: "СБП", icon: "✳", cls: "sbp", badge: "+20%" },
        { id: "crypto", label: "КРИПТА", icon: "₿", cls: "crypto", badge: "" },
        { id: "crypto2", label: "КРИПТА", icon: "₿", cls: "crypto2", badge: "" }
    ];

    // Демо-промокоды: настоящая проверка должна жить на сервере,
    // иначе любой откроет исходники и увидит все коды.
    const PROMO_CODES = {
        FARMSTARS17967: { stars: 25000, text: "Промокод принят: +25 000 ⭐" },
        STARS10000: { stars: 10000, text: "Промокод принят: +10 000 ⭐" },
        FARMSTARS: { stars: 25, text: "Промокод принят: +25 ⭐" },
        HARVEST: { coins: 50000, text: "Промокод принят: +50 000 💰" }
    };
    const PROMO_STORAGE_KEY = "usedPromos";

    const btnTopup = document.getElementById("btn-topup");
    const btnTopupProfile = document.getElementById("btn-topup-profile");
    const topupModal = document.getElementById("topup-modal");
    const topupBackdrop = document.getElementById("topup-backdrop");
    const btnTopupClose = document.getElementById("btn-topup-close");
    const topupGrid = document.getElementById("topup-grid");
    const topupPackages = document.getElementById("topup-packages");
    const topupStatus = document.getElementById("topup-status");
    const promoInput = document.getElementById("promo-input");
    const btnApplyPromo = document.getElementById("btn-apply-promo");
    const supportLink = document.getElementById("support-link");
    const btnAddGift = document.getElementById("btn-add-gift");
    const depositHandle = document.getElementById("deposit-handle");

    function setTopupStatus(text, color) {
        if (!topupStatus) return;
        topupStatus.textContent = text;
        topupStatus.style.color = color || "#ccff00";
    }

    function renderPayMethods() {
        if (!topupGrid) return;
        topupGrid.innerHTML = "";

        PAY_METHODS.forEach(method => {
            const tile = document.createElement("div");
            tile.className = "method " + method.cls;
            tile.dataset.method = method.id;

            if (method.badge) {
                const badge = document.createElement("span");
                badge.className = "method-badge" + (method.soon ? " soon" : "");
                badge.textContent = method.badge;
                tile.appendChild(badge);
            }

            const icon = document.createElement("span");
            icon.className = "method-icon";
            icon.textContent = method.icon;

            const label = document.createElement("span");
            label.className = "method-label";
            label.textContent = method.label;

            tile.appendChild(icon);
            tile.appendChild(label);
            tile.addEventListener("click", () => choosePayMethod(method, tile));
            topupGrid.appendChild(tile);
        });
    }

    const TOPUP_PACKAGES = [50, 100, 250, 500, 1000, 2500];
    const MIN_TOPUP = 10;
    const MAX_TOPUP = 100000;

    function renderTopupPackages() {
        if (!topupPackages) return;
        topupPackages.innerHTML = "";

        TOPUP_PACKAGES.forEach(amount => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "pack-btn";
            button.textContent = amount + " ⭐";
            button.addEventListener("click", () => buyStars(amount));
            topupPackages.appendChild(button);
        });

        const custom = document.createElement("div");
        custom.className = "pack-custom";

        const input = document.createElement("input");
        input.type = "number";
        input.inputMode = "numeric";
        input.min = String(MIN_TOPUP);
        input.step = "1";
        input.className = "pack-input";
        input.placeholder = "Своя сумма, от " + MIN_TOPUP + " ⭐";

        const submit = document.createElement("button");
        submit.type = "button";
        submit.className = "pack-buy";
        submit.textContent = "Пополнить";

        const send = () => {
            const raw = Math.floor(Number(input.value));
            if (!Number.isFinite(raw) || raw < MIN_TOPUP) {
                setTopupStatus("Минимальная сумма — " + MIN_TOPUP + " ⭐", "#ff3838");
                return;
            }
            if (raw > MAX_TOPUP) {
                setTopupStatus("Максимум за один раз — " + MAX_TOPUP.toLocaleString() + " ⭐", "#ff3838");
                return;
            }
            buyStars(raw);
        };

        submit.addEventListener("click", send);
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") send();
        });

        custom.appendChild(input);
        custom.appendChild(submit);
        topupPackages.appendChild(custom);

        topupPackages.classList.remove("hidden-packages");
    }

    async function buyStars(amount) {
        if (!serverMode) {
            setTopupStatus("Оплата работает на серверной версии приложения.", "#8e9297");
            return;
        }

        const tg = window.Telegram && window.Telegram.WebApp;
        if (!tg || !tg.openInvoice) {
            setTopupStatus("Открой приложение через Telegram, чтобы оплатить ⭐", "#ff3838");
            return;
        }

        setTopupStatus("Создаём счёт на " + amount + " ⭐...", "#8e9297");

        let invoice;
        try {
            invoice = await api("/api/invoice", {
                method: "POST",
                body: JSON.stringify({ stars: amount })
            });
        } catch (error) {
            if (error.status === 401) {
                setTopupStatus("Открой приложение через Telegram ⭐", "#ff3838");
            } else if (error.status === 502) {
                setTopupStatus("Платежи ещё не настроены: бот без токена.", "#ff3838");
            } else {
                setTopupStatus("Не удалось создать счёт. Попробуй позже.", "#ff3838");
            }
            return;
        }

        tg.openInvoice(invoice.link, function (status) {
            if (status === "paid") {
                setTopupStatus("Оплата прошла, начисляем звёзды...", "#ccff00");
                setTimeout(async function () {
                    try {
                        applyServerState(await api("/api/me"));
                        setTopupStatus("Готово: +" + amount + " ⭐ на балансе", "#ccff00");
                    } catch (error) {
                        setTopupStatus("Оплата прошла, баланс обновится через минуту.", "#ccff00");
                    }
                }, 1500);
            } else if (status === "cancelled") {
                setTopupStatus("Оплата отменена.", "#8e9297");
            } else {
                setTopupStatus("Оплата не прошла. Попробуй ещё раз.", "#ff3838");
            }
        });
    }

    function choosePayMethod(method, tile) {
        if (method.soon) {
            setTopupStatus("Способ «" + method.label + "» появится позже.", "#8e9297");
            return;
        }

        topupGrid.querySelectorAll(".method.selected").forEach(el => el.classList.remove("selected"));
            if (tile) tile.classList.add("selected");

            if (method.id === "stars") {
                if (!serverMode) {
                    setTopupStatus("Оплата звёздами работает на серверной версии приложения.", "#8e9297");
                    return;
                }
                renderTopupPackages();
                setTopupStatus("Выбери сумму или введи свою — минимум " + MIN_TOPUP + " ⭐", "#8e9297");
                return;
            }

            const link = CONFIG.payLinks[method.id];


        if (!link) {
            setTopupStatus(
                "«" + method.label + "» подключится, когда настроим бота и приём платежей. Ссылка вставляется в CONFIG.payLinks.",
                "#8e9297"
            );
            return;
        }

        const tg = window.Telegram && window.Telegram.WebApp;
        if (tg && tg.openInvoice && method.id === "stars") {
            tg.openInvoice(link, function (result) {
                if (result && result.status === "paid") {
                    setTopupStatus("Оплата прошла. Баланс обновим после ответа сервера.", "#ccff00");
                }
            });
        } else if (tg && tg.openTelegramLink && link.indexOf("tg://") === 0) {
            tg.openTelegramLink(link);
        } else {
            window.open(link, "_blank");
        }
    }

    function loadUsedPromos() {
        try {
            const saved = JSON.parse(localStorage.getItem(PROMO_STORAGE_KEY) || "[]");
            return Array.isArray(saved) ? saved : [];
        } catch (error) {
            return [];
        }
    }

    function saveUsedPromos(list) {
        try {
            localStorage.setItem(PROMO_STORAGE_KEY, JSON.stringify(list));
        } catch (error) {
            // localStorage может быть недоступен внутри WebView
        }
    }

    async function applyPromo() {
        if (!promoInput) return;
        const code = (promoInput.value || "").trim().toUpperCase();

        if (!code) {
            setTopupStatus("Введите промокод.", "#ff3838");
            return;
        }

        if (serverMode) {
            try {
                const result = await api("/api/promo", {
                    method: "POST",
                    body: JSON.stringify({ code: code })
                });
                applyServerState(result);
                promoInput.value = "";
                setTopupStatus(
                    "Промокод принят: +" + result.amount.toLocaleString() + (result.kind === "stars" ? " ⭐" : " 💰"),
                    "#ccff00"
                );
            } catch (error) {
                const reason = error.data && error.data.error;
                if (error.status === 404) {
                    setTopupStatus("Промокод не найден. Проверьте написание.", "#ff3838");
                } else if (reason === "exhausted") {
                    setTopupStatus("Промокод больше не действует.", "#ff3838");
                } else if (error.status === 409) {
                    setTopupStatus("Этот промокод уже использован.", "#ff3838");
                } else if (error.status === 401) {
                    setTopupStatus("Открой приложение через Telegram, чтобы активировать код.", "#ff3838");
                } else {
                    setTopupStatus("Сервер не ответил. Попробуй ещё раз.", "#ff3838");
                }
            }
            return;
        }

        const used = loadUsedPromos();
        if (used.indexOf(code) !== -1) {
            setTopupStatus("Этот промокод уже использован.", "#ff3838");
            return;
        }

        const promo = PROMO_CODES[code];
        if (!promo) {
            setTopupStatus("Промокод не найден. Проверьте написание.", "#ff3838");
            return;
        }

        if (promo.stars) addStars(promo.stars);
        if (promo.coins) addCoins(promo.coins);

        used.push(code);
        saveUsedPromos(used);
        promoInput.value = "";
        setTopupStatus(promo.text, "#ccff00");
    }

    function openTopup() {
        if (!topupModal) return;
        renderPayMethods();
        setTopupStatus("");
        if (topupPackages) topupPackages.classList.add("hidden-packages");
        topupModal.classList.remove("hidden-topup");
    }

    function closeTopup() {
        if (!topupModal) return;
        topupModal.classList.add("hidden-topup");
    }

    if (btnTopup) btnTopup.addEventListener("click", openTopup);
    if (btnTopupProfile) btnTopupProfile.addEventListener("click", openTopup);
    if (btnTopupClose) btnTopupClose.addEventListener("click", closeTopup);
    if (topupBackdrop) topupBackdrop.addEventListener("click", closeTopup);
    if (btnApplyPromo) btnApplyPromo.addEventListener("click", applyPromo);
    if (promoInput) {
        promoInput.addEventListener("keydown", event => {
            if (event.key === "Enter") applyPromo();
        });
    }
    if (depositHandle) depositHandle.textContent = CONFIG.depositHandle;

    if (supportLink) {
        supportLink.addEventListener("click", event => {
            event.preventDefault();
            if (CONFIG.supportHandle && CONFIG.supportHandle !== "@username") {
                window.open("https://t.me/" + CONFIG.supportHandle.replace("@", ""), "_blank");
            } else {
                setTopupStatus("Укажите свой @username в CONFIG.supportHandle — пока ссылка не настроена.", "#8e9297");
            }
        });
    }

    if (btnAddGift) {
        btnAddGift.addEventListener("click", () => {
            setTopupStatus(
                "Отправьте подарок в " + CONFIG.depositHandle + " — он появится в «Инвентаре» в течение 2 минут.",
                "#ccff00"
            );
        });
    }

    // ==========================================================================
    // 5. ПИКСЕЛЬНАЯ ФЕРМА (КАРТА С ЗАГОНАМИ И ЖИВОТНЫМИ)
    // ==========================================================================
    const btnOpenFarm = document.getElementById("btn-open-farm");
    const btnFarmBack = document.getElementById("btn-farm-back");
    const levelTextField = document.getElementById("user-level");
    const levelFill = document.getElementById("level-fill");
    const LEVEL_BASE = 150;
    const LEVEL_GROWTH = 1.2;

    function levelInfo(xp) {
        const safe = Math.max(0, Number(xp) || 0);
        let level = 1;
        let need = LEVEL_BASE;
        let passed = 0;

        while (safe >= passed + need && level < 999) {
            passed += need;
            level += 1;
            need = Math.round(need * LEVEL_GROWTH);
        }

        return { level: level, into: safe - passed, need: need };
    }

    function renderLevel(xp) {
        const info = levelInfo(xp);
        const progress = Math.max(0, Math.min(100, (info.into / info.need) * 100));
        if (levelTextField) levelTextField.textContent = "Уровень " + info.level;
        if (levelFill) levelFill.style.width = progress.toFixed(0) + "%";
    }

    function farmSetStatus(text, color) {
        const field = document.getElementById("farm-status-text");
        if (!field) return;
        field.textContent = text;
        field.style.color = color || "#ccff00";
    }

    function farmSync(path, sum) {
        if (!serverMode) return;
        api(path, { method: "POST", body: JSON.stringify({ coins: sum }) })
            .then(applyServerState)
            .catch(function () { /* сервер поправит баланс при следующей синхронизации */ });
    }

    if (window.Farm) {
        Farm.init({
            onSell: function (sum) {
                addCoins(sum);
                farmSync("/api/farm/sell", sum);
            },
            onSpend: function (sum) {
                if (currentCoins < sum) return false;
                currentCoins -= sum;
                renderBalances();
                saveWallet();
                farmSync("/api/farm/buy", sum);
                return true;
            },
            getCoins: function () {
                return currentCoins;
            },
            onStats: function (stats) {
                renderLevel(stats.xp);
            }
        });
    }

    if (btnOpenFarm) {
        btnOpenFarm.addEventListener("click", function () {
            switchToScreen("screen-farm");
            farmSetStatus("", "#ccff00");
            if (window.Farm) Farm.refresh();
        });
    }

    const btnFarmFullscreen = document.getElementById("btn-farm-fullscreen");
    const screenFarmEl = document.getElementById("screen-farm");

    function toggleFullscreen() {
        const root = document.documentElement;
        if (document.fullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen();
            return;
        }
        if (root.requestFullscreen) {
            const request = root.requestFullscreen();
            if (request && request.catch) request.catch(function () { });
        }
    }

    function closeFarm() {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(function () { });
        }
        switchToScreen("screen-games", "screen-games");
    }

    if (btnFarmFullscreen) {
        btnFarmFullscreen.addEventListener("click", toggleFullscreen);
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && screenFarmEl && screenFarmEl.classList.contains("active")) {
            closeFarm();
        }
    });

    if (btnFarmBack) {
        btnFarmBack.addEventListener("click", closeFarm);
    }

    function switchToScreen(screenId, navScreenId) {
        const currentScreen = document.querySelector(".screen.active");
        if (currentScreen) currentScreen.classList.remove("active");
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) targetScreen.classList.add("active");

        if (navScreenId) {
            document.querySelectorAll(".nav-item").forEach(button => {
                button.classList.toggle("active", button.getAttribute("data-screen") === navScreenId);
            });
        }
    }

    // ==========================================================================
    // 6. ОБМЕН МОНЕТ НА ЗВЁЗДЫ В ПРОФИЛЕ
    // ==========================================================================
    const EXCHANGE_RATE = 2000;
    const btnExchangeStars = document.getElementById("btn-exchange-stars");
    const exchangeStatusText = document.getElementById("exchange-status-text");
    const exchangeAmountInput = document.getElementById("exchange-amount");
    const exchangePreview = document.getElementById("exchange-preview");

    function setExchangeStatus(text, color) {
        if (!exchangeStatusText) return;
        exchangeStatusText.textContent = text;
        exchangeStatusText.style.color = color || "#ccff00";
    }

    function getExchangeAmount() {
        if (!exchangeAmountInput) return 0;
        const raw = Math.floor(Number(exchangeAmountInput.value));
        return Number.isFinite(raw) && raw > 0 ? raw : 0;
    }

    function updateExchangePreview() {
        if (!exchangePreview) return;
        const amount = getExchangeAmount();
        const stars = Math.floor(amount / EXCHANGE_RATE);
        const rest = amount % EXCHANGE_RATE;

        if (stars <= 0) {
            exchangePreview.textContent = "Минимум " + EXCHANGE_RATE + " 💰 = 1 ⭐";
            exchangePreview.style.color = "#8e9297";
            return;
        }

        exchangePreview.textContent = "Вы получите: " + stars + " ⭐" + (rest > 0 ? " (" + rest + " 💰 останется)" : "");
        exchangePreview.style.color = amount > currentCoins ? "#ff3838" : "#ccff00";
    }

    if (exchangeAmountInput) {
        exchangeAmountInput.addEventListener("input", () => {
            setExchangeStatus("", "#ccff00");
            updateExchangePreview();
        });
    }

    if (btnExchangeStars) {
        btnExchangeStars.addEventListener("click", async () => {
            const amount = getExchangeAmount();
            if (amount < EXCHANGE_RATE) {
                setExchangeStatus("Минимум " + EXCHANGE_RATE + " 💰 для обмена", "#ff3838");
                return;
            }
            if (amount > currentCoins) {
                setExchangeStatus("Недостаточно монет на балансе", "#ff3838");
                return;
            }

            if (serverMode) {
                try {
                    const result = await api("/api/exchange", {
                        method: "POST",
                        body: JSON.stringify({ coins: amount })
                    });
                    applyServerState(result);
                    if (exchangeAmountInput) exchangeAmountInput.value = "";
                    updateExchangePreview();
                    setExchangeStatus(
                        "Обменяно: −" + result.spent + " 💰 → +" + Math.floor(result.spent / EXCHANGE_RATE) + " ⭐",
                        "#ccff00"
                    );
                } catch (error) {
                    if (error.status === 402) {
                        setExchangeStatus("На сервере монет меньше — перезагрузи приложение, баланс подтянется.", "#ff3838");
                    } else if (error.status === 400) {
                        setExchangeStatus("Минимум " + EXCHANGE_RATE + " 💰 для обмена", "#ff3838");
                    } else if (error.status === 401) {
                        setExchangeStatus("Открой приложение через Telegram ⭐", "#ff3838");
                    } else {
                        setExchangeStatus("Сервер не ответил. Попробуй ещё раз.", "#ff3838");
                    }
                }
                return;
            }

            const stars = Math.floor(amount / EXCHANGE_RATE);
            const spent = stars * EXCHANGE_RATE;
            const rest = amount - spent;

            currentCoins -= spent;
            addStars(stars);
            if (exchangeAmountInput) exchangeAmountInput.value = "";
            updateExchangePreview();
            setExchangeStatus(
                "Обменяно: −" + spent + " 💰 → +" + stars + " ⭐" + (rest > 0 ? " (остаток " + rest + " 💰 не тронут)" : ""),
                "#ccff00"
            );
        });
    }

    updateExchangePreview();

    // ==========================================================================
    // 7. ШАШКИ: игра со ставкой
    // ==========================================================================
    const CHECKERS_MIN_BET = 10;
    const checkersLobby = document.getElementById("checkers-lobby");
    const checkersGameBox = document.getElementById("checkers-game");
    const checkersBoardEl = document.getElementById("checkers-board");
    const checkersBetInput = document.getElementById("checkers-bet");
    const checkersStatusLobby = document.getElementById("checkers-status");
    const checkersStatusGame = document.getElementById("checkers-status2");
    const checkersOpponentEl = document.getElementById("checkers-opponent");
    const checkersMeEl = document.getElementById("checkers-me");
    const checkersTimerMe = document.getElementById("checkers-timer-me");
    const checkersTimerOpponent = document.getElementById("checkers-timer-opponent");
    const checkersClock = document.getElementById("checkers-clock");
    const checkersCells = [];

    let checkersMinutes = 5;
    let checkersGame = null;
    let checkersSelected = null;
    let checkersPollTimer = null;
    let checkersBotTimer = null;

    function checkersSetStatus(text, color) {
        const box = checkersGameBox && !checkersGameBox.classList.contains("hidden-game")
            ? checkersStatusGame
            : checkersStatusLobby;
        if (!box) return;
        box.textContent = text;
        box.style.color = color || "#ccff00";
    }

    function formatClock(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
    }

    function buildCheckersBoard() {
        if (!checkersBoardEl || checkersCells.length) return;
        for (let index = 0; index < 64; index++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.addEventListener("click", () => onCheckersCell(Number(cell.dataset.index)));
            checkersBoardEl.appendChild(cell);
            checkersCells.push(cell);
        }
    }

    function renderCheckers() {
        const game = checkersGame;
        if (!game) return;

        const flip = game.myColor === "black";
        const moves = game.moves || [];
        const myKey = game.myColor === "white" ? "whiteMs" : "blackMs";
        const otherKey = game.myColor === "white" ? "blackMs" : "whiteMs";

        checkersOpponentEl.textContent = game.myColor === "white"
            ? (game.blackName || "Соперник")
            : (game.whiteName || "Соперник");
        checkersMeEl.textContent = "Вы";

        checkersTimerMe.textContent = formatClock(game[myKey]);
        checkersTimerOpponent.textContent = formatClock(game[otherKey]);
        checkersTimerMe.classList.toggle("active", game.status === "active" && game.turn === game.myColor);
        checkersTimerOpponent.classList.toggle("active", game.status === "active" && game.turn !== game.myColor);

        checkersClock.hidden = false;
        checkersClock.textContent = game.status !== "active"
            ? "Партия окончена"
            : (game.turn === game.myColor ? "Ваш ход" : "Ход соперника");

        for (let display = 0; display < 64; display++) {
            const row = Math.floor(display / 8);
            const col = display % 8;
            const actual = flip ? (7 - row) * 8 + (7 - col) : display;
            const cell = checkersCells[display];
            const piece = game.board[actual];
            const dark = (Math.floor(actual / 8) + (actual % 8)) % 2 === 1;

            cell.className = "cell " + (dark ? "dark" : "light");
            cell.dataset.index = String(actual);
            cell.innerHTML = "";
            if (!dark) continue;

            const mine = (piece === "w" || piece === "W")
                ? game.myColor === "white"
                : (piece === "b" || piece === "B") ? game.myColor === "black" : false;

            if (mine && game.status === "active" && game.turn === game.myColor) {
                cell.classList.add("playable");
            }

            if (piece !== ".") {
                const chip = document.createElement("span");
                chip.className = "piece " + (piece === "w" || piece === "W" ? "white" : "black");
                if (piece === "W" || piece === "B") chip.textContent = "♛";
                cell.appendChild(chip);
            }

            if (checkersSelected !== null) {
                if (actual === checkersSelected) cell.classList.add("selected");
                if (moves.some(move => move.from === checkersSelected && move.to === actual)) {
                    cell.classList.add("target");
                }
            }
        }

        if (game.status === "finished") {
            const text = game.winner === "draw"
                ? "Ничья — ставки возвращены"
                : (game.winner === game.myColor ? "Вы выиграли!" : "Вы проиграли");
            checkersSetStatus(text, game.winner === game.myColor ? "#ccff00" : "#ff3838");
        } else if (game.status === "waiting") {
            checkersSetStatus("Ищем соперника... если никого не будет, через 30 секунд подключим бота.", "#8e9297");
        }
    }

    async function onCheckersCell(index) {
        const game = checkersGame;
        if (!game || game.status !== "active" || game.turn !== game.myColor) return;
        if (Number.isNaN(index)) return;

        const moves = game.moves || [];
        const isTarget = checkersSelected !== null && moves.some(m => m.from === checkersSelected && m.to === index);

        if (isTarget) {
            const from = checkersSelected;
            checkersSelected = null;
            try {
                checkersGame = await api("/api/checkers/move", {
                    method: "POST",
                    body: JSON.stringify({ id: game.id, from: from, to: index })
                });
                renderCheckers();
            } catch (error) {
                checkersSetStatus("Ход не принят. Попробуй другой.", "#ff3838");
                renderCheckers();
            }
            return;
        }

        const piece = game.board[index];
        const mine = (piece === "w" || piece === "W")
            ? game.myColor === "white"
            : (piece === "b" || piece === "B") ? game.myColor === "black" : false;

        checkersSelected = mine ? index : null;
        renderCheckers();
    }

    function stopCheckersPolling() {
        if (checkersPollTimer) {
            clearInterval(checkersPollTimer);
            checkersPollTimer = null;
        }
    }

    function stopCheckersBot() {
        if (checkersBotTimer) {
            clearTimeout(checkersBotTimer);
            checkersBotTimer = null;
        }
    }

    function startCheckersPolling() {
        stopCheckersPolling();
        checkersPollTimer = setInterval(async () => {
            if (!checkersGame) return;
            try {
                const state = await api("/api/checkers/game?id=" + checkersGame.id);
                checkersGame = state;
                renderCheckers();
                if (state.status !== "active") stopCheckersPolling();
            } catch (error) {
                // тихо: следующий опрос попробует снова
            }
        }, 1500);
    }

    function enterCheckersGame(game) {
        checkersGame = game;
        checkersSelected = null;
        if (checkersLobby) checkersLobby.classList.add("hidden-game");
        if (checkersGameBox) checkersGameBox.classList.remove("hidden-game");
        buildCheckersBoard();
        renderCheckers();
        if (game.status === "active") {
            checkersSetStatus(game.turn === game.myColor ? "Твой ход" : "Ход соперника", "#8e9297");
        } else if (game.status === "waiting") {
            checkersSetStatus("Ищем соперника... через 30 секунд подключим бота.", "#8e9297");
        }
    }

    function resetCheckers() {
        stopCheckersPolling();
        stopCheckersBot();
        checkersGame = null;
        checkersSelected = null;
        if (checkersGameBox) checkersGameBox.classList.add("hidden-game");
        if (checkersLobby) checkersLobby.classList.remove("hidden-game");
        if (checkersClock) checkersClock.hidden = true;
        checkersSetStatus("", "#ccff00");
    }

    async function startCheckersGame() {
        const bet = Math.floor(Number(checkersBetInput ? checkersBetInput.value : 0));
        if (!Number.isFinite(bet) || bet < CHECKERS_MIN_BET) {
            checkersSetStatus("Минимальная ставка — " + CHECKERS_MIN_BET + " ⭐", "#ff3838");
            return;
        }

        checkersSetStatus("Создаём игру...", "#8e9297");
        let game;
        try {
            game = await api("/api/checkers/start", {
                method: "POST",
                body: JSON.stringify({ bet: bet, minutes: checkersMinutes })
            });
        } catch (error) {
            if (error.status === 402) checkersSetStatus("Недостаточно звёзд для этой ставки.", "#ff3838");
            else if (error.status === 401) checkersSetStatus("Открой приложение через Telegram ⭐", "#ff3838");
            else checkersSetStatus("Сервер не ответил. Попробуй ещё раз.", "#ff3838");
            return;
        }

        enterCheckersGame(game);

        if (game.status === "waiting") {
            checkersSetStatus("Ищем соперника... если никого не будет, через 30 секунд подключим бота.", "#8e9297");
            checkersBotTimer = setTimeout(async () => {
                try {
                    const withBot = await api("/api/checkers/bot", {
                        method: "POST",
                        body: JSON.stringify({ id: game.id })
                    });
                    enterCheckersGame(withBot);
                    checkersSetStatus("Соперник — сильный бот. Твой ход!", "#ccff00");
                } catch (error) {
                    checkersSetStatus("Не удалось подключить бота.", "#ff3838");
                }
            }, 30000);
        }

        startCheckersPolling();
    }

    const btnOpenCheckers = document.getElementById("btn-open-checkers");
    const btnCheckersBack = document.getElementById("btn-checkers-back");
    const btnCheckersPlay = document.getElementById("btn-checkers-play");
    const btnCheckersResign = document.getElementById("btn-checkers-resign");
    const btnCheckersDraw = document.getElementById("btn-checkers-draw");

    if (btnOpenCheckers) {
        btnOpenCheckers.addEventListener("click", () => {
            switchToScreen("screen-checkers");
            resetCheckers();
        });
    }
    if (btnCheckersBack) {
        btnCheckersBack.addEventListener("click", () => {
            stopCheckersPolling();
            switchToScreen("screen-games", "screen-games");
        });
    }
    if (btnCheckersPlay) btnCheckersPlay.addEventListener("click", startCheckersGame);

    document.querySelectorAll(".time-btn").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".time-btn").forEach(item => item.classList.remove("active"));
            button.classList.add("active");
            checkersMinutes = Number(button.dataset.minutes) || 5;
        });
    });

    if (btnCheckersResign) {
        btnCheckersResign.addEventListener("click", async () => {
            if (!checkersGame) return;
            try {
                checkersGame = await api("/api/checkers/resign", {
                    method: "POST",
                    body: JSON.stringify({ id: checkersGame.id })
                });
                renderCheckers();
                stopCheckersPolling();
            } catch (error) {
                checkersSetStatus("Не удалось сдаться. Попробуй ещё раз.", "#ff3838");
            }
        });
    }

    if (btnCheckersDraw) {
        btnCheckersDraw.addEventListener("click", async () => {
            if (!checkersGame) return;
            try {
                checkersGame = await api("/api/checkers/draw", {
                    method: "POST",
                    body: JSON.stringify({ id: checkersGame.id })
                });
                renderCheckers();
                stopCheckersPolling();
            } catch (error) {
                checkersSetStatus("Соперник против ничьей или партия уже закончилась.", "#ff3838");
            }
        });
    }

    renderGiftsLine();
    updateCenterGift();
    updateChanceUI();
    renderInventory();
    initServer();
});


    


 


