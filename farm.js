(function () {
    "use strict";

    // ==========================================================================
    // ПИКСЕЛЬНАЯ ФЕРМА — КАРТА НА CANVAS (спрайты рисуются кодом)
    // ==========================================================================

    const W = 320;
    const H = 340;
    const STORAGE_KEY = "farmMapState";
    const MAX_ANIMALS = 4;
    const GRACE_MS = 300000;
    const DEATH_STEP_MS = 60000;

    const COL = {
        grass: "#7cc24a", grassDark: "#6ab13c", grassLight: "#8fd65e",
        dirt: "#d5bb85", dirtEdge: "#bfa26e", pebble: "#a98c5c",
        wood: "#a9733d", woodDark: "#7c5228", woodLight: "#c08c52",
        roof: "#d04a3f", roofDark: "#a1372d",
        fence: "#a07a4a", fenceDark: "#6f5230",
        white: "#f7f7f2", shade: "#dcdcd2", black: "#2a2320",
        red: "#d94141", pink: "#f2a3b6", pinkDark: "#d7849a",
        yellow: "#f5d76e", orange: "#e08a2e",
        carrot: "#ef8b2c", carrotDark: "#c96a18",
        cheese: "#f2c14e", cheeseDark: "#c99a2e",
        honey: "#e8a33d", honeyDark: "#b97a20",
        skin: "#f0c39a", shirt: "#4a90d9", pants: "#333f5e",
        water: "#59b6e8", waterDark: "#3f95c6", waterLight: "#8fd4f4",
        trunk: "#7a4b26", leaf: "#4e9a3a", leafDark: "#3c7a2c", leafLight: "#63b449",
        sheepFace: "#3a3330", goatFace: "#8a8378", goatBody: "#efeadd", goatShade: "#d9d4c6",
        meat: "#e05b5b", meatDark: "#b83f45", meatLight: "#f08a86",
        soil: "#8d6a42", soilDark: "#745433",
        hay: "#d9b455", hayDark: "#c4a02f", hayLight: "#e8c96c",
        stone: "#b9bdb2", stoneLight: "#cfd3c8",
        gold: "#f5d76e", goldDark: "#c9a62e"
    };

    const PRODUCTS = {
        egg: { name: "Яйца", icon: "egg", price: 25 },
        milk: { name: "Молоко", icon: "milk", price: 60 },
        meat: { name: "Мясо", icon: "meat", price: 95 },
        wool: { name: "Шерсть", icon: "wool", price: 110 },
        cheese: { name: "Сыр", icon: "cheese", price: 120 },
        honey: { name: "Мёд", icon: "honey", price: 140 },
        carrot: { name: "Овощи", icon: "carrot", price: 40 }
    };

    const PENS = [
        {
            id: "chicken", animal: "chicken", product: "egg", growMs: 25000,
            x: 8, y: 68, w: 126, h: 58, ground: "dirt", title: "Курятник",
            feedText: "куры клюют зерно", collectText: "Собрали яйцо",
            animalName: "Курица", animalEmoji: "🐔", buyPrice: 250, productLabel: "яйца",
            unlocked: true
        },
        {
            id: "cow", animal: "cow", product: "milk", growMs: 70000,
            x: 186, y: 68, w: 126, h: 58, ground: "grass", title: "Коровник",
            feedText: "коровы жуют траву", collectText: "Надоили молоко",
            animalName: "Корова", animalEmoji: "🐄", buyPrice: 700, productLabel: "молоко",
            unlocked: true
        },
        {
            id: "pig", animal: "pig", product: "meat", growMs: 50000,
            x: 8, y: 134, w: 126, h: 58, ground: "dirt", title: "Свинарник",
            feedText: "свиньи роют пятачками", collectText: "Мясо на складе",
            consumes: true, regrowMs: 60000,
            animalName: "Свинья", animalEmoji: "🐖", buyPrice: 450, productLabel: "мясо",
            unlocked: true
        },
        {
            id: "sheep", animal: "sheep", product: "wool", growMs: 70000,
            x: 186, y: 134, w: 126, h: 58, ground: "grass", title: "Овчарня",
            feedText: "овцы щиплют траву", collectText: "Настригли шерсть",
            animalName: "Овца", animalEmoji: "🐑", buyPrice: 900, productLabel: "шерсть",
            unlocked: true
        },
        {
            id: "goat", animal: "goat", product: "cheese", growMs: 80000,
            x: 8, y: 200, w: 126, h: 58, ground: "grass", title: "Козлятник",
            feedText: "козы жуют траву", collectText: "Сварили сыр",
            animalName: "Коза", animalEmoji: "🐐", buyPrice: 850, productLabel: "сыр",
            unlocked: false, lockPrice: 1500
        },
        {
            id: "bee", animal: "bee", product: "honey", growMs: 100000,
            x: 186, y: 200, w: 126, h: 58, ground: "grass", title: "Пасека",
            feedText: "пчёлы собирают нектар", collectText: "Собрали мёд",
            animalName: "Улей", animalEmoji: "🐝", buyPrice: 1100, productLabel: "мёд",
            unlocked: false, lockPrice: 2500
        }
    ];

    const CUSTOMER_DEFS = [
        { name: "Пекарь", emoji: "🧑‍🍳", product: "egg" },
        { name: "Повар", emoji: "👨‍🍳", product: "milk" },
        { name: "Мясник", emoji: "🥩", product: "meat" },
        { name: "Портной", emoji: "🧵", product: "wool" },
        { name: "Сырник", emoji: "🧀", product: "cheese" },
        { name: "Кондитер", emoji: "🍯", product: "honey" },
        { name: "Рынок", emoji: "🧺", product: "carrot" }
    ];

    const GARDEN = { x: 8, y: 264, w: 126, h: 68 };
    const BED_PRICE = 400;
    const BEDS = [];
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
            BEDS.push({
                id: "bed-" + row + "-" + col,
                x: GARDEN.x + 4 + col * 60,
                y: GARDEN.y + 4 + row * 22,
                w: 56, h: 20, growMs: 30000,
                unlocked: row < 2, lockPrice: BED_PRICE
            });
        }
    }

    const BARNS = [
        { x: 8, y: 8, w: 126, h: 52 },
        { x: 186, y: 8, w: 126, h: 52 }
    ];

    const ANIMAL_SLOTS = [
        { dx: 12, dy: 30 },
        { dx: 40, dy: 35 },
        { dx: 70, dy: 30 },
        { dx: 98, dy: 35 }
    ];

    const DIGITS = {
        "0": ["111", "101", "101", "101", "111"],
        "1": ["010", "110", "010", "010", "111"],
        "2": ["111", "001", "111", "100", "111"],
        "3": ["111", "001", "111", "001", "111"],
        "4": ["101", "101", "111", "001", "001"],
        "5": ["111", "100", "111", "001", "111"],
        "6": ["111", "100", "111", "101", "111"],
        "7": ["111", "001", "001", "010", "010"],
        "8": ["111", "101", "111", "101", "111"],
        "9": ["111", "101", "111", "001", "111"]
    };

    let canvas = null;
    let ctx = null;
    let terrain = null;
    let screenEl = null;
    let callbacks = {};
    let rafId = 0;
    let syncTimer = 0;

    // ---------------------------------------------------------------- звук
    let audioCtx = null;

    function ensureAudio() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!audioCtx) {
            try { audioCtx = new Ctx(); } catch (e) { audioCtx = null; }
        }
        if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
        return audioCtx;
    }

    function tone(freq, dur, type, vol, delay, slideTo) {
        const ac = ensureAudio();
        if (!ac) return;
        const t0 = ac.currentTime + (delay || 0);
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type || "square";
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, vol, freq) {
        const ac = ensureAudio();
        if (!ac) return;
        const len = Math.max(1, Math.floor(ac.sampleRate * dur));
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filter = ac.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = freq || 900;
        const gain = ac.createGain();
        gain.gain.value = vol || 0.05;
        src.connect(filter).connect(gain).connect(ac.destination);
        src.start();
    }

    function sfx(name) {
        switch (name) {
            case "tap": tone(520, 0.05, "triangle", 0.04); break;
            case "collect": tone(660, 0.09, "triangle", 0.06); tone(990, 0.09, "triangle", 0.045, 0.06); break;
            case "coin": tone(880, 0.08, "square", 0.045); tone(1320, 0.1, "square", 0.04, 0.07); break;
            case "error": tone(220, 0.16, "sawtooth", 0.045, 0, 140); break;
            case "chicken":
                tone(1050, 0.07, "square", 0.05);
                tone(700, 0.1, "square", 0.045, 0.08, 520);
                tone(950, 0.06, "square", 0.035, 0.2);
                break;
            case "cow":
                tone(180, 0.5, "sawtooth", 0.05, 0, 120);
                tone(240, 0.35, "sine", 0.04, 0.12, 170);
                break;
            case "pig":
                noise(0.09, 0.05, 420);
                tone(300, 0.08, "sawtooth", 0.04, 0.05, 220);
                break;
            case "sheep":
                tone(620, 0.28, "triangle", 0.045, 0, 700);
                tone(700, 0.2, "triangle", 0.035, 0.05, 600);
                break;
            case "bee":
                tone(260, 0.3, "sawtooth", 0.03, 0, 320);
                noise(0.2, 0.02, 1800);
                break;
        }
    }

    const state = {
        pens: {},
        beds: {},
        res: { egg: 0, milk: 0, meat: 0, wool: 0, cheese: 0, honey: 0, carrot: 0 },
        customers: [],
        collected: 0,
        earned: 0,
        xp: 0
    };

    // ---------------------------------------------------------------- утилиты

    function makeRng(seed) {
        let s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    function rect(c, x, y, w, h, color) {
        if (w <= 0 || h <= 0) return;
        c.fillStyle = color;
        c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }

    function penState(pen) {
        if (!state.pens[pen.id]) {
            state.pens[pen.id] = {
                phase: "idle", startedAt: 0, readyAt: 0,
                animals: pen.unlocked ? 2 : 0,
                herd: pen.unlocked ? 2 : 0,
                regrowAt: 0, hungerAt: 0,
                unlocked: !!pen.unlocked
            };
        }
        return state.pens[pen.id];
    }

    function bedState(bed) {
        if (!state.beds[bed.id]) {
            state.beds[bed.id] = { phase: "idle", startedAt: 0, readyAt: 0, unlocked: !!bed.unlocked };
        }
        return state.beds[bed.id];
    }

    function syncByTime() {
        const now = Date.now();
        let changed = false;
        PENS.forEach(function (pen) {
            const st = penState(pen);
            if (!st.unlocked) return;
            if (st.phase === "growing" && now >= st.readyAt) st.phase = "ready";

            if (st.phase === "idle" && st.animals > 0 && st.hungerAt > 0) {
                const overdue = now - st.hungerAt - GRACE_MS;
                if (overdue >= 0) {
                    const deaths = Math.min(st.animals, 1 + Math.floor(overdue / DEATH_STEP_MS));
                    st.animals -= deaths;
                    st.herd = Math.max(0, st.herd - deaths);
                    st.hungerAt = st.animals > 0 ? st.hungerAt + deaths * DEATH_STEP_MS : 0;
                    changed = true;
                }
            }

            if (st.animals < st.herd && st.regrowAt && now >= st.regrowAt) {
                st.animals = st.herd;
                st.regrowAt = 0;
                changed = true;
            }
        });
        BEDS.forEach(function (bed) {
            const st = bedState(bed);
            if (!st.unlocked) return;
            if (st.phase === "growing" && now >= st.readyAt) st.phase = "ready";
        });
        if (changed) {
            save();
            updateUI();
        }
    }

    function formatLeft(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return minutes > 0 ? minutes + ":" + String(seconds).padStart(2, "0") : seconds + " с";
    }

    // ------------------------------------------------------------- сохранение

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            if (!saved || typeof saved !== "object") return;
            PENS.forEach(function (pen) {
                const src = saved.pens && saved.pens[pen.id];
                if (!src) return;
                const unlocked = src.unlocked === undefined ? !!pen.unlocked : !!src.unlocked;
                const herd = unlocked ? Math.min(MAX_ANIMALS, Math.max(0, Number(src.herd) || 0)) : 0;
                state.pens[pen.id] = {
                    phase: ["idle", "growing", "ready"].indexOf(src.phase) >= 0 ? src.phase : "idle",
                    startedAt: Number(src.startedAt) || 0,
                    readyAt: Number(src.readyAt) || 0,
                    animals: Math.min(herd, Math.max(0, Number(src.animals) || 0)),
                    herd: herd,
                    regrowAt: Number(src.regrowAt) || 0,
                    hungerAt: Number(src.hungerAt) || 0,
                    unlocked: unlocked
                };
            });
            BEDS.forEach(function (bed) {
                const src = saved.beds && saved.beds[bed.id];
                if (!src) return;
                state.beds[bed.id] = {
                    phase: ["idle", "growing", "ready"].indexOf(src.phase) >= 0 ? src.phase : "idle",
                    startedAt: Number(src.startedAt) || 0,
                    readyAt: Number(src.readyAt) || 0,
                    unlocked: src.unlocked === undefined ? !!bed.unlocked : !!src.unlocked
                };
            });
            Object.keys(state.res).forEach(function (key) {
                state.res[key] = Math.max(0, Number(saved.res && saved.res[key]) || 0);
            });
            state.collected = Math.max(0, Number(saved.collected) || 0);
            state.earned = Math.max(0, Number(saved.earned) || 0);
            state.xp = Math.max(0, Number(saved.xp) || 0);
            if (Array.isArray(saved.customers) && saved.customers.length === 3) {
                const clients = saved.customers.map(function (item) {
                    if (!item || !PRODUCTS[item.product]) return null;
                    return {
                        product: item.product,
                        name: String(item.name || "Клиент"),
                        emoji: String(item.emoji || "🧑‍🌾"),
                        qty: Math.min(5, Math.max(1, Number(item.qty) || 1)),
                        price: Math.max(1, Number(item.price) || PRODUCTS[item.product].price)
                    };
                });
                if (clients.filter(Boolean).length === 3) state.customers = clients;
            }
        } catch (error) {
            // повреждённое сохранение — начинаем заново
        }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            // localStorage может быть недоступен внутри WebView
        }
    }

    // ----------------------------------------------------------- статичная карта

    function drawPath(c) {
        rect(c, 146, 0, 28, H, COL.dirt);
        rect(c, 146, 0, 2, H, COL.dirtEdge);
        rect(c, 172, 0, 2, H, COL.dirtEdge);
        [60, 126, 192].forEach(function (y) {
            rect(c, 0, y, W, 8, COL.dirt);
            rect(c, 0, y + 8, W, 2, COL.dirtEdge);
        });
        const rnd = makeRng(99);
        for (let i = 0; i < 260; i++) {
            const onVertical = rnd() > 0.4;
            const x = onVertical ? 147 + Math.floor(rnd() * 26) : Math.floor(rnd() * W);
            const y = Math.floor(rnd() * H);
            rect(c, x, y, 1, 1, rnd() > 0.5 ? COL.pebble : COL.dirtEdge);
        }
    }

    function drawBarn(c, x, y, w, h) {
        const roofH = 22;
        for (let row = 0; row < roofH; row++) {
            const half = Math.round(((row + 1) * (w / 2)) / roofH);
            rect(c, x + w / 2 - half, y + row, half * 2, 1, row % 5 === 4 ? COL.roofDark : COL.roof);
        }
        rect(c, x + 2, y + roofH, w - 4, h - roofH, COL.wood);
        for (let i = 1; i < 4; i++) rect(c, x + 2, y + roofH + i * 7, w - 4, 1, COL.woodDark);
        rect(c, x + 2, y + roofH, w - 4, 1, COL.woodLight);
        rect(c, x + 2, y + h - 2, w - 4, 2, COL.woodDark);
        rect(c, x + w / 2 - 11, y + h - 21, 22, 21, COL.woodDark);
        rect(c, x + w / 2 - 9, y + h - 19, 18, 19, COL.trunk);
        rect(c, x + w / 2 - 1, y + h - 19, 2, 19, COL.woodLight);
        [x + 10, x + w - 28].forEach(function (wx) {
            rect(c, wx, y + roofH + 7, 18, 13, COL.yellow);
            rect(c, wx, y + roofH + 12, 18, 1, COL.woodDark);
            rect(c, wx + 8, y + roofH + 7, 1, 13, COL.woodDark);
        });
    }

    function drawPenGround(c, pen) {
        const inner = { x: pen.x + 3, y: pen.y + 3, w: pen.w - 6, h: pen.h - 6 };
        const rnd = makeRng(pen.x * 31 + pen.y);
        if (pen.ground === "grass") {
            rect(c, inner.x, inner.y, inner.w, inner.h, COL.grassDark);
            for (let i = 0; i < 70; i++) {
                rect(c, inner.x + rnd() * inner.w, inner.y + rnd() * inner.h, 2, 1, rnd() > 0.5 ? COL.grass : COL.grassLight);
            }
        } else {
            rect(c, inner.x, inner.y, inner.w, inner.h, COL.dirt);
            for (let i = 0; i < 80; i++) {
                rect(c, inner.x + rnd() * inner.w, inner.y + rnd() * inner.h, 1, 1, rnd() > 0.5 ? COL.dirtEdge : COL.pebble);
            }
        }
    }

    function drawFence(c, x, y, w, h) {
        rect(c, x, y, w, 2, COL.fence);
        rect(c, x, y + h - 2, w, 2, COL.fence);
        rect(c, x, y, 2, h, COL.fence);
        rect(c, x + w - 2, y, 2, h, COL.fence);
        rect(c, x, y, w, 1, COL.fenceDark);
        rect(c, x, y + h - 1, w, 1, COL.fenceDark);
        for (let i = 0; i <= w - 3; i += 11) {
            rect(c, x + i, y - 2, 3, 6, COL.fenceDark);
            rect(c, x + i, y + h - 4, 3, 6, COL.fenceDark);
        }
        for (let j = 6; j <= h - 4; j += 11) {
            rect(c, x - 2, y + j, 6, 3, COL.fenceDark);
            rect(c, x + w - 4, y + j, 6, 3, COL.fenceDark);
        }
    }

    function drawPond(c, x, y, w, h) {
        rect(c, x + 4, y, w - 8, h, COL.waterDark);
        rect(c, x + 2, y + 2, w - 4, h - 4, COL.waterDark);
        rect(c, x + 4, y + 3, w - 8, h - 6, COL.water);
        rect(c, x + 8, y + 6, w - 26, 2, COL.waterLight);
        rect(c, x + 14, y + 14, w - 34, 2, COL.waterLight);
        rect(c, x + 2, y + h - 2, w - 4, 2, COL.dirtEdge);
        rect(c, x + 2, y, w - 4, 2, COL.dirtEdge);
    }

    function drawTree(c, x, y) {
        rect(c, x + 4, y + 10, 4, 11, COL.trunk);
        rect(c, x, y + 4, 12, 7, COL.leafDark);
        rect(c, x + 1, y, 10, 6, COL.leaf);
        rect(c, x + 3, y - 3, 7, 4, COL.leafLight);
        rect(c, x - 3, y + 5, 5, 5, COL.leafDark);
        rect(c, x + 11, y + 6, 5, 5, COL.leaf);
        rect(c, x + 3, y + 5, 4, 2, COL.leafLight);
    }

    function drawWell(c, x, y) {
        rect(c, x + 3, y + 44, 20, 2, "rgba(0,0,0,0.15)");
        rect(c, x, y + 14, 36, 20, COL.woodDark);
        rect(c, x + 1, y + 15, 34, 8, COL.wood);
        rect(c, x + 1, y + 25, 34, 8, COL.woodDark);
        rect(c, x + 6, y + 16, 24, 4, COL.waterDark);
        rect(c, x + 8, y + 16, 8, 1, COL.waterLight);
        rect(c, x + 2, y + 4, 2, 11, COL.woodDark);
        rect(c, x + 32, y + 4, 2, 11, COL.woodDark);
        for (let row = 0; row < 8; row++) {
            const half = Math.round(((row + 1) * 21) / 8);
            rect(c, x + 18 - half, y + row, half * 2, 1, row % 4 === 3 ? COL.roofDark : COL.roof);
        }
        rect(c, x + 14, y + 11, 8, 4, COL.woodLight);
        rect(c, x + 14, y + 11, 8, 1, COL.woodDark);
        rect(c, x + 17, y + 7, 2, 4, COL.woodDark);
    }

    function drawHayBale(c, x, y) {
        rect(c, x, y + 10, 18, 1, "rgba(0,0,0,0.15)");
        rect(c, x, y, 18, 10, COL.hay);
        rect(c, x, y, 18, 1, COL.hayLight);
        rect(c, x, y + 9, 18, 1, COL.hayDark);
        for (let i = 3; i < 18; i += 5) rect(c, x + i, y + 1, 1, 8, COL.hayDark);
        rect(c, x, y + 4, 18, 1, "#cbb04a");
    }

    function drawCrate(c, x, y) {
        rect(c, x, y + 13, 13, 1, "rgba(0,0,0,0.15)");
        rect(c, x, y, 13, 13, COL.wood);
        rect(c, x, y, 13, 1, COL.woodLight);
        rect(c, x, y + 12, 13, 1, COL.woodDark);
        rect(c, x, y, 1, 13, COL.woodDark);
        rect(c, x + 12, y, 1, 13, COL.woodDark);
        rect(c, x + 1, y + 6, 11, 1, COL.woodDark);
    }

    function drawTrough(c, x, y) {
        rect(c, x, y + 8, 26, 2, "rgba(0,0,0,0.12)");
        rect(c, x, y, 26, 8, COL.woodDark);
        rect(c, x + 1, y + 1, 24, 6, COL.wood);
        rect(c, x + 2, y + 2, 22, 3, COL.hay);
        rect(c, x + 2, y + 2, 22, 1, COL.hayLight);
    }

    function drawGardenFence(c) {
        rect(c, GARDEN.x + 1, GARDEN.y + GARDEN.h, GARDEN.w - 2, 2, "rgba(0,0,0,0.12)");
        rect(c, GARDEN.x, GARDEN.y, GARDEN.w, GARDEN.h, COL.soil);
        rect(c, GARDEN.x + 1, GARDEN.y + 1, GARDEN.w - 2, GARDEN.h - 2, COL.soilDark);
    }

    function drawLock(c, x, y) {
        rect(c, x + 4, y, 6, 1, "#cfcabe");
        rect(c, x + 3, y + 1, 1, 4, "#cfcabe");
        rect(c, x + 10, y + 1, 1, 4, "#cfcabe");
        rect(c, x + 2, y + 5, 12, 9, COL.goldDark);
        rect(c, x + 3, y + 6, 10, 7, COL.gold);
        rect(c, x + 7, y + 8, 2, 4, "#8a6a1c");
    }

    function buildTerrain() {
        const cv = document.createElement("canvas");
        cv.width = W;
        cv.height = H;
        const c = cv.getContext("2d");
        const rnd = makeRng(1337);

        rect(c, 0, 0, W, H, COL.grass);
        for (let i = 0; i < 620; i++) {
            rect(c, Math.floor(rnd() * W), Math.floor(rnd() * H), 3 + Math.floor(rnd() * 7), 1 + Math.floor(rnd() * 2), rnd() > 0.5 ? COL.grassDark : COL.grassLight);
        }

        drawPath(c);
        BARNS.forEach(function (barn) {
            drawBarn(c, barn.x, barn.y, barn.w, barn.h);
        });

        PENS.forEach(function (pen) {
            if (pen.unlocked) drawPenGround(c, pen);
            else rect(c, pen.x + 3, pen.y + 3, pen.w - 6, pen.h - 6, COL.grassDark);
            if (pen.unlocked) drawTrough(c, pen.x + pen.w - 56, pen.y + 10);
        });

        drawGardenFence(c);
        drawPond(c, 186, 264, 78, 28);
        drawWell(c, 276, 258);
        drawHayBale(c, 186, 300);
        drawHayBale(c, 206, 306);
        drawCrate(c, 228, 302);
        drawTree(c, 256, 298);
        drawTree(c, 6, 330);

        rect(c, 66, 100, 5, 4, COL.stone);
        rect(c, 67, 99, 3, 1, COL.stoneLight);
        rect(c, 122, 152, 4, 3, COL.stone);
        rect(c, 268, 160, 5, 4, COL.stone);
        rect(c, 269, 159, 3, 1, COL.stoneLight);
        rect(c, 122, 216, 4, 3, COL.stone);

        PENS.forEach(function (pen) {
            drawFence(c, pen.x, pen.y, pen.w, pen.h);
        });

        const flowers = ["#ffffff", "#f5d76e", "#f2a3b6", "#c9a0ff"];
        for (let i = 0; i < 110; i++) {
            const x = 4 + Math.floor(rnd() * (W - 8));
            const y = 4 + Math.floor(rnd() * (H - 8));
            const blocked = PENS.some(function (pen) {
                return x > pen.x - 4 && x < pen.x + pen.w + 4 && y > pen.y - 4 && y < pen.y + pen.h + 4;
            }) || (x > GARDEN.x - 4 && x < GARDEN.x + GARDEN.w + 4 && y > GARDEN.y - 4 && y < GARDEN.y + GARDEN.h + 4)
                || (x > 140 && x < 182);
            if (blocked) continue;
            rect(c, x, y, 1, 1, flowers[i % flowers.length]);
            rect(c, x - 1, y + 1, 3, 1, COL.leafDark);
        }

        return cv;
    }

    // ----------------------------------------------------------------- спрайты

    function drawChicken(c, x, y) {
        rect(c, x + 1, y + 13, 13, 1, "rgba(0,0,0,0.18)");
        rect(c, x, y + 4, 3, 5, COL.shade);
        rect(c, x + 2, y + 2, 10, 9, "#c6c6bb");
        rect(c, x + 3, y + 3, 8, 7, COL.white);
        rect(c, x + 4, y + 5, 4, 3, "#efefe9");
        rect(c, x + 8, y + 7, 2, 1, COL.shade);
        rect(c, x + 10, y + 1, 5, 4, "#c6c6bb");
        rect(c, x + 11, y + 2, 3, 3, COL.white);
        rect(c, x + 11, y, 3, 1, COL.red);
        rect(c, x + 14, y + 3, 1, 1, COL.yellow);
        rect(c, x + 12, y + 3, 1, 1, COL.black);
        rect(c, x + 5, y + 12, 1, 2, COL.orange);
        rect(c, x + 9, y + 12, 1, 2, COL.orange);
    }

    function drawCow(c, x, y) {
        rect(c, x + 2, y + 14, 19, 1, "rgba(0,0,0,0.18)");
        rect(c, x + 3, y + 2, 17, 10, "#d4d4c9");
        rect(c, x + 4, y + 3, 15, 8, COL.white);
        rect(c, x + 6, y + 4, 4, 3, COL.black);
        rect(c, x + 13, y + 6, 4, 3, COL.black);
        rect(c, x + 12, y + 4, 3, 2, COL.black);
        rect(c, x, y + 3, 7, 7, "#d4d4c9");
        rect(c, x + 1, y + 4, 5, 5, COL.white);
        rect(c, x + 2, y + 5, 1, 1, COL.black);
        rect(c, x, y + 8, 4, 2, COL.pink);
        rect(c, x + 2, y + 2, 1, 1, COL.yellow);
        rect(c, x + 5, y + 2, 1, 1, COL.yellow);
        rect(c, x + 5, y + 12, 3, 3, COL.black);
        rect(c, x + 9, y + 12, 3, 3, COL.black);
        rect(c, x + 14, y + 12, 3, 3, COL.black);
        rect(c, x + 17, y + 12, 2, 3, COL.black);
        rect(c, x + 12, y + 10, 4, 1, COL.pink);
        rect(c, x + 19, y + 3, 1, 5, COL.white);
        rect(c, x + 19, y + 8, 2, 1, COL.black);
    }

    function drawPig(c, x, y) {
        rect(c, x + 1, y + 12, 16, 1, "rgba(0,0,0,0.18)");
        rect(c, x + 2, y + 1, 11, 10, COL.pinkDark);
        rect(c, x + 3, y + 2, 9, 8, COL.pink);
        rect(c, x + 4, y + 4, 3, 2, "#f7bcc9");
        rect(c, x + 12, y + 3, 6, 6, COL.pinkDark);
        rect(c, x + 13, y + 4, 4, 4, COL.pink);
        rect(c, x + 14, y + 6, 2, 2, COL.pinkDark);
        rect(c, x + 14, y + 4, 1, 1, COL.black);
        rect(c, x + 12, y + 2, 2, 2, COL.pinkDark);
        rect(c, x + 4, y + 10, 2, 2, COL.pinkDark);
        rect(c, x + 10, y + 10, 2, 2, COL.pinkDark);
        rect(c, x, y + 4, 2, 1, COL.pinkDark);
    }

    function drawPiglet(c, x, y) {
        rect(c, x + 1, y + 8, 10, 1, "rgba(0,0,0,0.16)");
        rect(c, x + 2, y + 1, 7, 6, COL.pinkDark);
        rect(c, x + 3, y + 2, 5, 4, COL.pink);
        rect(c, x + 8, y + 2, 4, 4, COL.pinkDark);
        rect(c, x + 9, y + 3, 2, 2, COL.pink);
        rect(c, x + 9, y + 4, 1, 1, COL.pinkDark);
        rect(c, x + 9, y + 3, 1, 1, COL.black);
        rect(c, x + 3, y + 7, 1, 2, COL.pinkDark);
        rect(c, x + 7, y + 7, 1, 2, COL.pinkDark);
    }

    function drawSheep(c, x, y) {
        rect(c, x + 2, y + 14, 17, 1, "rgba(0,0,0,0.18)");
        rect(c, x + 3, y + 1, 13, 10, "#d4d4c9");
        rect(c, x + 4, y + 2, 11, 8, COL.white);
        rect(c, x + 4, y + 3, 3, 2, COL.shade);
        rect(c, x + 9, y + 5, 3, 2, COL.shade);
        rect(c, x + 6, y + 8, 3, 1, COL.shade);
        rect(c, x + 16, y + 4, 4, 4, COL.sheepFace);
        rect(c, x + 17, y + 5, 1, 1, COL.black);
        rect(c, x + 16, y + 3, 3, 1, COL.sheepFace);
        rect(c, x + 12, y + 3, 2, 2, COL.sheepFace);
        rect(c, x + 6, y + 11, 2, 3, COL.sheepFace);
        rect(c, x + 12, y + 11, 2, 3, COL.sheepFace);
    }

    function drawGoat(c, x, y) {
        rect(c, x + 2, y + 14, 17, 1, "rgba(0,0,0,0.18)");
        rect(c, x + 3, y + 2, 12, 9, COL.goatShade);
        rect(c, x + 4, y + 3, 10, 7, COL.goatBody);
        rect(c, x + 4, y + 4, 3, 2, COL.goatShade);
        rect(c, x + 8, y + 8, 3, 1, COL.goatShade);
        rect(c, x + 14, y + 3, 5, 5, COL.goatFace);
        rect(c, x + 15, y + 4, 3, 3, COL.goatBody);
        rect(c, x + 16, y + 5, 1, 1, COL.black);
        rect(c, x + 13, y + 1, 1, 3, "#c9c2b0");
        rect(c, x + 18, y + 1, 1, 3, "#c9c2b0");
        rect(c, x + 13, y, 1, 1, "#efe9db");
        rect(c, x + 18, y, 1, 1, "#efe9db");
        rect(c, x + 15, y + 8, 2, 2, COL.goatFace);
        rect(c, x + 6, y + 11, 2, 3, COL.goatFace);
        rect(c, x + 12, y + 11, 2, 3, COL.goatFace);
        rect(c, x + 1, y + 4, 2, 1, COL.goatShade);
    }

    function drawHive(c, x, y) {
        rect(c, x + 1, y + 17, 14, 1, "rgba(0,0,0,0.18)");
        rect(c, x, y + 4, 16, 13, COL.woodDark);
        rect(c, x + 1, y + 5, 14, 11, COL.hay);
        rect(c, x + 1, y + 8, 14, 1, COL.hayDark);
        rect(c, x + 1, y + 11, 14, 1, COL.hayDark);
        rect(c, x + 1, y, 14, 4, COL.roof);
        rect(c, x + 1, y + 3, 14, 1, COL.roofDark);
        rect(c, x + 5, y + 9, 4, 2, "#4a3320");
    }

    function drawBee(c, x, y, phase) {
        const dx = Math.round(Math.sin(phase) * 4);
        const dy = Math.round(Math.cos(phase * 1.4) * 2);
        rect(c, x + dx, y + dy, 3, 2, COL.gold);
        rect(c, x + dx + 1, y + dy, 1, 2, COL.black);
        rect(c, x + dx - 1, y + dy - 1, 1, 1, "rgba(255,255,255,0.7)");
        rect(c, x + dx + 3, y + dy - 1, 1, 1, "rgba(255,255,255,0.7)");
    }

    function drawDuck(c, x, y, phase) {
        const bob = Math.round(Math.sin(phase) * 0.7);
        rect(c, x + 3, y + 2 + bob, 6, 1, COL.white);
        rect(c, x + 4, y + 1 + bob, 4, 1, COL.white);
        rect(c, x + 4, y + 3 + bob, 5, 3, COL.white);
        rect(c, x + 9, y + 1 + bob, 2, 3, COL.white);
        rect(c, x + 11, y + 2 + bob, 1, 1, COL.orange);
        rect(c, x + 10, y + 2 + bob, 1, 1, COL.black);
        rect(c, x + 2, y + 6, 8, 1, COL.waterDark);
    }

    function drawFarmer(c, x, y, now) {
        const bob = Math.round(Math.sin(now / 620) * 1);
        rect(c, x + 2, y + 24, 10, 1, "rgba(0,0,0,0.2)");
        rect(c, x + 2, y + bob, 9, 2, COL.woodDark);
        rect(c, x, y + 2 + bob, 13, 2, COL.woodDark);
        rect(c, x + 3, y + 4 + bob, 7, 5, COL.skin);
        rect(c, x + 4, y + 6 + bob, 1, 1, COL.black);
        rect(c, x + 8, y + 6 + bob, 1, 1, COL.black);
        rect(c, x + 1, y + 9 + bob, 11, 7, COL.shirt);
        rect(c, x, y + 10 + bob, 1, 5, COL.skin);
        rect(c, x + 12, y + 10 + bob, 1, 5, COL.skin);
        rect(c, x + 3, y + 16 + bob, 3, 6, COL.pants);
        rect(c, x + 7, y + 16 + bob, 3, 6, COL.pants);
        rect(c, x + 1, y + 22 + bob, 4, 2, COL.woodDark);
        rect(c, x + 8, y + 22 + bob, 4, 2, COL.woodDark);
    }

    function drawIcon(c, type, x, y) {
        if (type === "egg") {
            rect(c, x + 3, y + 1, 4, 1, COL.white);
            rect(c, x + 2, y + 2, 6, 5, COL.white);
            rect(c, x + 3, y + 7, 4, 1, COL.shade);
            rect(c, x + 3, y + 2, 2, 2, "#ffffff");
        } else if (type === "milk") {
            rect(c, x + 4, y, 3, 1, COL.white);
            rect(c, x + 3, y + 1, 5, 2, COL.white);
            rect(c, x + 3, y + 3, 5, 6, "#eef2f6");
            rect(c, x + 3, y + 3, 5, 1, COL.shirt);
            rect(c, x + 4, y + 5, 2, 1, COL.white);
        } else if (type === "meat") {
            rect(c, x + 7, y, 2, 1, COL.white);
            rect(c, x + 8, y + 1, 1, 4, COL.white);
            rect(c, x + 1, y + 3, 8, 6, COL.meatDark);
            rect(c, x + 2, y + 4, 6, 4, COL.meat);
            rect(c, x + 3, y + 5, 2, 1, COL.meatLight);
        } else if (type === "wool") {
            rect(c, x + 3, y + 1, 5, 1, COL.white);
            rect(c, x + 2, y + 2, 7, 5, COL.white);
            rect(c, x + 3, y + 7, 5, 1, COL.shade);
            rect(c, x + 3, y + 3, 1, 1, COL.shade);
            rect(c, x + 6, y + 4, 1, 1, COL.shade);
        } else if (type === "cheese") {
            rect(c, x + 1, y + 3, 9, 6, COL.cheeseDark);
            rect(c, x + 2, y + 2, 7, 5, COL.cheese);
            rect(c, x + 4, y + 4, 2, 1, COL.cheeseDark);
            rect(c, x + 6, y + 6, 1, 1, COL.cheeseDark);
        } else if (type === "honey") {
            rect(c, x + 3, y, 5, 1, COL.woodDark);
            rect(c, x + 2, y + 1, 7, 2, COL.woodLight);
            rect(c, x + 2, y + 3, 7, 6, COL.honeyDark);
            rect(c, x + 3, y + 4, 5, 4, COL.honey);
            rect(c, x + 4, y + 5, 1, 2, "#f7cf7a");
        } else if (type === "carrot") {
            rect(c, x + 4, y + 3, 3, 1, COL.carrot);
            rect(c, x + 3, y + 4, 4, 3, COL.carrot);
            rect(c, x + 4, y + 7, 2, 2, COL.carrotDark);
            rect(c, x + 5, y, 1, 3, COL.leaf);
            rect(c, x + 3, y + 1, 2, 1, COL.leafLight);
            rect(c, x + 7, y + 1, 2, 1, COL.leafDark);
        }
    }

    function drawNumber(c, text, x, y, color) {
        let cursor = x;
        for (let i = 0; i < text.length; i++) {
            const glyph = DIGITS[text[i]];
            if (!glyph) {
                cursor += 4;
                continue;
            }
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 3; col++) {
                    if (glyph[row][col] === "1") rect(c, cursor + col, y + row, 1, 1, color);
                }
            }
            cursor += 4;
        }
    }

    function drawPrice(c, value, centerX, y, color) {
        const text = String(value);
        const width = text.length * 4 - 1;
        drawNumber(c, text, centerX - width / 2, y, color);
    }

    // ------------------------------------------------------------------ рендер

    function drawAnimals(pen, st, now, penIndex) {
        const total = Math.min(MAX_ANIMALS, st.animals);
        for (let i = 0; i < total; i++) {
            const slot = ANIMAL_SLOTS[i];
            const t = now / (1100 + i * 260) + penIndex * 1.7 + i * 2.4;
            const dx = Math.round(Math.sin(t) * 3);
            const dy = Math.round(Math.cos(t * 1.3) * 1);
            const ax = pen.x + slot.dx + dx;
            const ay = pen.y + slot.dy + dy;
            if (pen.animal === "chicken") drawChicken(ctx, ax, ay);
            else if (pen.animal === "cow") drawCow(ctx, ax, ay);
            else if (pen.animal === "pig") drawPig(ctx, ax, ay);
            else if (pen.animal === "sheep") drawSheep(ctx, ax, ay);
            else if (pen.animal === "goat") drawGoat(ctx, ax, ay);
            else drawHive(ctx, pen.x + slot.dx, pen.y + slot.dy);
        }
        if (pen.animal === "bee" && st.animals > 0) {
            drawBee(ctx, pen.x + 30 + Math.sin(now / 700) * 20, pen.y + 22 + Math.cos(now / 600) * 6, now / 400);
            drawBee(ctx, pen.x + 80 + Math.cos(now / 800) * 22, pen.y + 30 + Math.sin(now / 500) * 6, now / 380 + 2);
        }
        if (pen.consumes && st.animals < st.herd && st.regrowAt > Date.now()) {
            const slot = ANIMAL_SLOTS[Math.min(MAX_ANIMALS - 1, st.animals)];
            const wob = Math.round(Math.sin(now / 420) * 1);
            drawPiglet(ctx, pen.x + slot.dx + 4, pen.y + slot.dy + 8 + wob);
        }
    }

    function drawPenIndicators(pen, st, now) {
        const barX = pen.x + 10;
        const barW = pen.w - 20;
        const barY = pen.y + pen.h - 10;

        if (st.phase === "growing") {
            const total = Math.max(1, pen.growMs);
            const done = Math.min(1, Math.max(0, (Date.now() - st.startedAt) / total));
            rect(ctx, barX, barY, barW, 3, "rgba(20,24,18,0.42)");
            rect(ctx, barX, barY, Math.round(barW * done), 3, "#ccff00");

            const left = Math.min(99, Math.max(0, Math.ceil((st.readyAt - Date.now()) / 1000)));
            const label = String(left);
            rect(ctx, pen.x + 5, pen.y + 5, label.length * 4 + 5, 8, "rgba(12,16,12,0.62)");
            drawNumber(ctx, label, pen.x + 7, pen.y + 7, "#ccff00");
        }

        if (st.phase === "ready") {
            rect(ctx, barX, barY, barW, 3, "rgba(20,24,18,0.42)");
            rect(ctx, barX, barY, barW, 3, "#ccff00");
            const bob = Math.round(Math.sin(now / 260) * 1.5);
            const iconX = pen.x + pen.w - 22;
            const iconY = pen.y + 5 + bob;
            rect(ctx, iconX - 2, iconY - 1, 12, 11, "rgba(12,16,12,0.5)");
            drawIcon(ctx, PRODUCTS[pen.product].icon, iconX, iconY);
        }

        if (st.animals < st.herd && st.regrowAt > Date.now()) {
            const left = Math.min(99, Math.max(0, Math.ceil((st.regrowAt - Date.now()) / 1000)));
            const label = String(left);
            rect(ctx, pen.x + pen.w - 8 - (label.length * 4 + 5), pen.y + 5, label.length * 4 + 5, 8, "rgba(12,16,12,0.62)");
            drawNumber(ctx, label, pen.x + pen.w - 6 - (label.length * 4 + 5) + 2, pen.y + 7, "#ffd166");
        }

        if (st.phase === "idle" && st.animals > 0 && st.hungerAt > 0) {
            const leftMs = st.hungerAt + GRACE_MS - Date.now();
            const hungerY = pen.y + 4;
            if (leftMs > 0) {
                const p = Math.max(0, Math.min(1, leftMs / GRACE_MS));
                rect(ctx, barX, hungerY, barW, 3, "rgba(20,24,18,0.35)");
                rect(ctx, barX, hungerY, Math.round(barW * p), 3, p > 0.3 ? "#ffb020" : "#ff5a3c");
                const minutes = Math.max(1, Math.ceil(leftMs / 60000));
                rect(ctx, pen.x + 5, pen.y + 9, 9, 8, "rgba(12,16,12,0.5)");
                drawNumber(ctx, String(minutes), pen.x + 7, pen.y + 11, "#ffd166");
            } else {
                const nextIn = Math.max(0, Math.ceil((st.hungerAt + GRACE_MS + DEATH_STEP_MS - Date.now()) / 1000));
                ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 220);
                rect(ctx, barX, hungerY, barW, 3, "#ff3838");
                ctx.globalAlpha = 1;
                const label = String(Math.min(99, nextIn));
                rect(ctx, pen.x + 5, pen.y + 9, label.length * 4 + 5, 8, "rgba(60,10,10,0.7)");
                drawNumber(ctx, label, pen.x + 7, pen.y + 11, "#ff6b6b");
            }
        }

        if (st.animals === 0) {
            const centerX = pen.x + pen.w / 2;
            rect(ctx, centerX - 16, pen.y + 22, 32, 12, "rgba(12,16,12,0.6)");
            drawNumber(ctx, "0", centerX - 2, pen.y + 25, "#ff6b6b");
        }
    }

    function drawLockedPen(pen) {
        const centerX = pen.x + pen.w / 2;
        const centerY = pen.y + pen.h / 2;
        rect(ctx, centerX - 22, centerY - 18, 44, 38, "rgba(12,16,12,0.45)");
        drawLock(ctx, centerX - 7, centerY - 16);
        drawPrice(ctx, pen.lockPrice, centerX, centerY + 2, "#ffd166");
    }

    function drawPens(now) {
        PENS.forEach(function (pen, penIndex) {
            const st = penState(pen);
            if (!st.unlocked) {
                drawLockedPen(pen);
                return;
            }
            if (st.phase === "idle" && st.animals >= st.herd && st.animals > 0) {
                ctx.globalAlpha = 0.3 + 0.3 * Math.sin(now / 420 + penIndex);
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(pen.x + 0.5, pen.y + 0.5, pen.w - 1, pen.h - 1);
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
            }
            drawAnimals(pen, st, now, penIndex);
            drawPenIndicators(pen, st, now);
        });
    }

    function drawBeds(now) {
        BEDS.forEach(function (bed) {
            const st = bedState(bed);
            if (!st.unlocked) {
                rect(ctx, bed.x, bed.y, bed.w, bed.h, COL.woodDark);
                rect(ctx, bed.x + 2, bed.y + 2, bed.w - 4, bed.h - 4, "#5d4a33");
                drawLock(ctx, bed.x + bed.w / 2 - 7, bed.y + 4);
                drawPrice(ctx, bed.lockPrice, bed.x + bed.w / 2, bed.y + 15, "#ffd166");
                return;
            }

            rect(ctx, bed.x, bed.y, bed.w, bed.h, COL.woodDark);
            rect(ctx, bed.x + 2, bed.y + 2, bed.w - 4, bed.h - 4, COL.soil);
            rect(ctx, bed.x + 2, bed.y + 2, bed.w - 4, 1, "#a4805a");
            for (let r = 0; r < 2; r++) {
                rect(ctx, bed.x + 4, bed.y + 7 + r * 8, bed.w - 8, 2, COL.soilDark);
            }

            if (st.phase === "idle") {
                for (let r = 0; r < 2; r++) {
                    for (let i = 0; i < 3; i++) {
                        rect(ctx, bed.x + 9 + i * 16, bed.y + 6 + r * 8, 2, 2, "#5f4429");
                    }
                }
                return;
            }

            const p = st.phase === "ready" ? 1 : Math.min(1, Math.max(0, (Date.now() - st.startedAt) / bed.growMs));
            for (let r = 0; r < 2; r++) {
                for (let i = 0; i < 3; i++) {
                    const sx = bed.x + 9 + i * 16;
                    const sy = bed.y + 5 + r * 8;
                    if (p < 0.4) {
                        rect(ctx, sx, sy + 2, 2, 1, COL.leaf);
                    } else if (p < 0.75) {
                        rect(ctx, sx, sy + 1, 2, 2, COL.leaf);
                        rect(ctx, sx + 1, sy, 1, 1, COL.leafLight);
                    } else {
                        rect(ctx, sx - 1, sy + 1, 4, 2, COL.leaf);
                        rect(ctx, sx, sy - 1, 2, 2, COL.leafLight);
                        rect(ctx, sx + 1, sy + 3, 2, 1, COL.carrot);
                    }
                }
            }

            if (st.phase === "ready") {
                ctx.globalAlpha = 0.45 + 0.3 * Math.sin(now / 380);
                ctx.strokeStyle = "#ccff00";
                ctx.lineWidth = 1;
                ctx.strokeRect(bed.x + 0.5, bed.y + 0.5, bed.w - 1, bed.h - 1);
                ctx.globalAlpha = 1;
            }
        });
    }

    function render(now) {
        if (!ctx || !terrain) return;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(terrain, 0, 0);

        drawBeds(now);
        drawPens(now);

        drawFarmer(ctx, 152, 272, now);
        drawDuck(ctx, 200, 272, now / 500);
        drawDuck(ctx, 232, 280, now / 470 + 1.6);
    }

    function loop(now) {
        rafId = requestAnimationFrame(loop);
        if (!canvas || !screenEl || !screenEl.classList.contains("active")) return;
        render(now);
    }

    // ---------------------------------------------------------------------- UI

    function $(id) {
        return document.getElementById(id);
    }

    function sellSum() {
        return Object.keys(state.res).reduce(function (sum, key) {
            return sum + state.res[key] * PRODUCTS[key].price;
        }, 0);
    }

    function setStatus(text, color) {
        const field = $("farm-status-text");
        if (!field) return;
        field.textContent = text;
        field.style.color = color || "#ccff00";
    }

    function barnStatus(text, color) {
        const field = $("barn-status");
        if (!field) return;
        field.textContent = text;
        field.style.color = color || "#ccff00";
    }

    function updateUI() {
        Object.keys(state.res).forEach(function (key) {
            const field = $("farm-" + key);
            if (field) field.textContent = state.res[key];
        });
        const stockField = $("farm-stock");
        if (stockField) stockField.textContent = "Склад: " + sellSum() + " 💰";
        const harvestField = $("stat-harvest");
        if (harvestField) harvestField.textContent = state.collected;
        const earnedField = $("stat-earned");
        if (earnedField) earnedField.textContent = state.earned;
        if (typeof callbacks.onStats === "function") {
            callbacks.onStats({
                collected: state.collected,
                earned: state.earned,
                xp: state.xp,
                resources: state.res,
                sellSum: sellSum()
            });
        }
    }

    function penSound(pen) {
        if (pen.id === "chicken") return "chicken";
        if (pen.id === "cow") return "cow";
        if (pen.id === "pig") return "pig";
        if (pen.id === "sheep" || pen.id === "goat") return "sheep";
        if (pen.id === "bee") return "bee";
        return "collect";
    }

    function startPen(pen) {
        const st = penState(pen);
        st.phase = "growing";
        st.startedAt = Date.now();
        st.readyAt = st.startedAt + pen.growMs;
        st.hungerAt = st.readyAt;
        save();
        updateUI();
        sfx(penSound(pen));
        setStatus(pen.title + ": " + pen.feedText + " — " + formatLeft(pen.growMs), "#8e9297");
    }

    function collectPen(pen) {
        const st = penState(pen);
        const gained = pen.consumes ? 1 : Math.max(1, st.animals);
        state.res[pen.product] += gained;
        state.collected += gained;
        state.xp += 10 * gained;
        st.phase = "idle";
        st.startedAt = 0;
        st.readyAt = 0;
        st.hungerAt = Date.now();
        sfx(penSound(pen));
        if (pen.consumes) {
            st.animals = Math.max(1, st.animals - 1);
            st.regrowAt = Date.now() + pen.regrowMs;
            save();
            updateUI();
            setStatus(pen.collectText + " (+" + gained + ") — одна свинья ушла на рынок, растёт поросёнок (" + formatLeft(pen.regrowMs) + ")", "#ccff00");
            return;
        }
        save();
        updateUI();
        setStatus(pen.collectText + " (+" + gained + ") · на продажу: " + sellSum() + " 💰", "#ccff00");
    }

    function handlePenClick(pen) {
        syncByTime();
        const st = penState(pen);

        if (!st.unlocked) {
            openBarn("expand");
            barnStatus("Загон «" + pen.title + "» закрыт: " + pen.lockPrice + " 💰", "#ffd166");
            return;
        }

        if (st.phase === "ready") {
            collectPen(pen);
            return;
        }
        if (st.phase === "growing") {
            setStatus(pen.title + ": ещё " + formatLeft(st.readyAt - Date.now()), "#8e9297");
            return;
        }
        if (st.animals === 0) {
            setStatus(pen.title + " пуст — купите животное в амбаре", "#ff3838");
            return;
        }
        if (st.animals < st.herd && st.regrowAt) {
            setStatus("Поросёнок подрастает — ещё " + formatLeft(st.regrowAt - Date.now()), "#ffd166");
            return;
        }
        startPen(pen);
    }

    function plantBed(bed) {
        const st = bedState(bed);
        st.phase = "growing";
        st.startedAt = Date.now();
        st.readyAt = st.startedAt + bed.growMs;
        save();
        updateUI();
        setStatus("Посадили овощи — взойдут через " + formatLeft(bed.growMs), "#8e9297");
    }

    function harvestBed(bed) {
        const st = bedState(bed);
        state.res.carrot += 1;
        state.collected += 1;
        state.xp += 6;
        st.phase = "idle";
        st.startedAt = 0;
        st.readyAt = 0;
        save();
        updateUI();
        sfx("collect");
        setStatus("Собрали овощи · на продажу: " + sellSum() + " 💰", "#ccff00");
    }

    function handleBedClick(bed) {
        syncByTime();
        const st = bedState(bed);
        if (!st.unlocked) {
            openBarn("expand");
            barnStatus("Грядка закрыта: " + bed.lockPrice + " 💰", "#ffd166");
            return;
        }
        if (st.phase === "ready") {
            harvestBed(bed);
            return;
        }
        if (st.phase === "growing") {
            setStatus("Овощи растут — ещё " + formatLeft(st.readyAt - Date.now()), "#8e9297");
            return;
        }
        plantBed(bed);
    }

    function feedAll() {
        syncByTime();
        let started = 0;
        PENS.forEach(function (pen) {
            const st = penState(pen);
            if (!st.unlocked) return;
            if (st.phase === "idle" && st.animals > 0 && st.animals >= st.herd) {
                st.phase = "growing";
                st.startedAt = Date.now();
                st.readyAt = st.startedAt + pen.growMs;
                st.hungerAt = st.readyAt;
                started += 1;
            }
        });
        if (!started) {
            setStatus("Кормить некого — животные уже заняты", "#8e9297");
            return;
        }
        save();
        updateUI();
        setStatus("Покормили всех: +" + started + " загонов", "#ccff00");
    }

    function artCoords(event) {
        const box = canvas.getBoundingClientRect();
        const point = event.touches && event.touches[0] ? event.touches[0] : event;
        return {
            x: (point.clientX - box.left) * (W / box.width),
            y: (point.clientY - box.top) * (H / box.height)
        };
    }

    function onCanvasClick(event) {
        event.preventDefault();
        sfx("tap");
        const point = artCoords(event);

        const barn = BARNS.find(function (item) {
            return point.x >= item.x - 2 && point.x <= item.x + item.w + 2 &&
                point.y >= item.y - 2 && point.y <= item.y + item.h + 2;
        });
        if (barn) {
            openBarn();
            return;
        }

        const pen = PENS.find(function (item) {
            return point.x >= item.x - 2 && point.x <= item.x + item.w + 2 &&
                point.y >= item.y - 2 && point.y <= item.y + item.h + 2;
        });
        if (pen) {
            handlePenClick(pen);
            return;
        }

        const bed = BEDS.find(function (item) {
            return point.x >= item.x - 3 && point.x <= item.x + item.w + 3 &&
                point.y >= item.y - 3 && point.y <= item.y + item.h + 3;
        });
        if (bed) handleBedClick(bed);
    }

    function sellAll() {
        syncByTime();
        const sum = sellSum();
        if (sum <= 0) {
            barnStatus("Склад пуст — покорми животных и посади грядки", "#ff3838");
            return 0;
        }
        if (typeof callbacks.onSell === "function") callbacks.onSell(sum);
        sfx("coin");
        state.earned += sum;
        state.xp += Math.round(sum / 25);
        Object.keys(state.res).forEach(function (key) {
            state.res[key] = 0;
        });
        save();
        updateUI();
        setStatus("Скупщик забрал склад: +" + sum + " 💰", "#ccff00");
        return sum;
    }

    // ------------------------------------------------------------------- амбар

    function customerOffer(usedProducts) {
        const pool = CUSTOMER_DEFS.filter(function (def) {
            return usedProducts.indexOf(def.product) < 0;
        });
        const source = pool.length ? pool : CUSTOMER_DEFS;
        const def = source[Math.floor(Math.random() * source.length)];
        const base = PRODUCTS[def.product].price;
        const qty = (def.product === "egg" || def.product === "carrot")
            ? 2 + Math.floor(Math.random() * 2)
            : 1 + Math.floor(Math.random() * 2);
        const price = Math.round((base * qty * (1.15 + Math.random() * 0.45)) / 5) * 5;
        return { product: def.product, name: def.name, emoji: def.emoji, qty: qty, price: price };
    }

    function ensureCustomers() {
        if (state.customers.length === 3) return;
        const used = state.customers.filter(Boolean).map(function (item) { return item.product; });
        while (state.customers.length < 3) {
            const offer = customerOffer(used);
            used.push(offer.product);
            state.customers.push(offer);
        }
        save();
    }

    function makeRow(emoji, title, subtitle, buttonText, disabled, onClick) {
        const row = document.createElement("div");
        row.className = "barn-item";
        row.innerHTML =
            '<div class="barn-item-avatar">' + emoji + "</div>" +
            '<div class="barn-item-info">' +
            '<div class="barn-item-name">' + title + "</div>" +
            '<div class="barn-item-sub">' + subtitle + "</div>" +
            "</div>";
        const button = document.createElement("button");
        button.className = "barn-buy";
        button.textContent = buttonText;
        button.disabled = !!disabled;
        button.addEventListener("click", onClick);
        row.appendChild(button);
        return row;
    }

    function renderBarn() {
        ensureCustomers();

        const coinsField = $("barn-coins");
        if (coinsField && typeof callbacks.getCoins === "function") {
            coinsField.textContent = Number(callbacks.getCoins() || 0).toLocaleString("ru-RU");
        }

        const shop = $("barn-shop");
        if (shop) {
            shop.innerHTML = "";
            PENS.forEach(function (pen) {
                const st = penState(pen);
                if (!st.unlocked) return;
                const full = st.animals >= MAX_ANIMALS;
                shop.appendChild(makeRow(
                    pen.animalEmoji,
                    pen.animalName,
                    pen.productLabel + " · в загоне " + st.animals + "/" + MAX_ANIMALS,
                    full ? "Максимум" : pen.buyPrice + " 💰",
                    full,
                    function () { buyAnimal(pen); }
                ));
            });
        }

        const clients = $("barn-clients");
        if (clients) {
            clients.innerHTML = "";
            state.customers.forEach(function (offer, index) {
                if (!offer) return;
                const have = state.res[offer.product] || 0;
                clients.appendChild(makeRow(
                    offer.emoji,
                    offer.name,
                    "Хочет " + offer.qty + " × " + PRODUCTS[offer.product].name.toLowerCase() +
                    " за " + offer.price + " 💰 · на складе " + have,
                    "Отдать",
                    have < offer.qty,
                    function () { fulfillCustomer(index); }
                ));
            });

            const bulkRow = makeRow(
                "🚚",
                "Скупщик",
                "Заберёт весь склад по базовой цене: " + sellSum() + " 💰",
                "Продать",
                sellSum() <= 0,
                function () {
                    const sum = sellAll();
                    renderBarn();
                    if (sum > 0) barnStatus("Скупщик забрал склад: +" + sum + " 💰", "#ccff00");
                }
            );
            clients.appendChild(bulkRow);
        }

        const expand = $("barn-expand");
        if (expand) {
            expand.innerHTML = "";
            const lockedPens = PENS.filter(function (pen) { return !penState(pen).unlocked; });
            const lockedBeds = BEDS.filter(function (bed) { return !bedState(bed).unlocked; });

            lockedPens.forEach(function (pen) {
                expand.appendChild(makeRow(
                    pen.animalEmoji,
                    "Загон «" + pen.title + "»",
                    pen.animalName + " · " + pen.productLabel + " по " + PRODUCTS[pen.product].price + " 💰",
                    "Открыть " + pen.lockPrice + " 💰",
                    false,
                    function () { unlockPen(pen); }
                ));
            });

            lockedBeds.forEach(function (bed) {
                expand.appendChild(makeRow(
                    "🥕",
                    "Новая грядка",
                    "Овощи по " + PRODUCTS.carrot.price + " 💰 за штуку",
                    "Купить " + bed.lockPrice + " 💰",
                    false,
                    function () { unlockBed(bed); }
                ));
            });

            if (!lockedPens.length && !lockedBeds.length) {
                const all = document.createElement("div");
                all.className = "barn-empty";
                all.textContent = "Вся земля выкуплена — ферма на максимуме 🌱";
                expand.appendChild(all);
            }
        }
    }

    function openBarn(tab) {
        const modal = $("farm-barn");
        if (!modal) return;
        modal.classList.remove("hidden-barn");
        renderBarn();
        selectBarnTab(tab || "shop");
        barnStatus("Выберите, что сделать", "#8e9297");
    }

    function closeBarn() {
        const modal = $("farm-barn");
        if (modal) modal.classList.add("hidden-barn");
    }

    function isBarnOpen() {
        const modal = $("farm-barn");
        return !!modal && !modal.classList.contains("hidden-barn");
    }

    function selectBarnTab(tab) {
        document.querySelectorAll("[data-barn-tab]").forEach(function (item) {
            item.classList.toggle("active", item.getAttribute("data-barn-tab") === tab);
        });
        const shopPane = $("barn-shop");
        const clientsPane = $("barn-clients");
        const expandPane = $("barn-expand");
        if (shopPane) shopPane.classList.toggle("hidden-pane", tab !== "shop");
        if (clientsPane) clientsPane.classList.toggle("hidden-pane", tab !== "clients");
        if (expandPane) expandPane.classList.toggle("hidden-pane", tab !== "expand");
    }

    function buyAnimal(pen) {
        const st = penState(pen);
        if (st.animals >= MAX_ANIMALS) {
            barnStatus("В загоне уже максимум — " + MAX_ANIMALS + " головы", "#ffd166");
            return;
        }
        if (typeof callbacks.onSpend === "function" && !callbacks.onSpend(pen.buyPrice)) {
            sfx("error");
                barnStatus("Не хватает монет на покупку", "#ff3838");
            return;
        }
        st.animals += 1;
            sfx("coin");
        st.herd = Math.max(st.herd, st.animals);
        if (st.animals === 1 || !st.hungerAt) st.hungerAt = Date.now();
        save();
        updateUI();
        renderBarn();
        barnStatus(pen.animalName + " куплена: в загоне " + st.animals + " из " + MAX_ANIMALS, "#ccff00");
    }

    function unlockPen(pen) {
        const st = penState(pen);
        if (typeof callbacks.onSpend === "function" && !callbacks.onSpend(pen.lockPrice)) {
            sfx("error");
                barnStatus("Не хватает монет на загон", "#ff3838");
            return;
        }
        st.unlocked = true;
            sfx("coin");
        st.animals = 2;
        st.herd = 2;
        st.phase = "idle";
        st.hungerAt = Date.now();
        save();
        updateUI();
        renderBarn();
        barnStatus("Загон «" + pen.title + "» открыт — можно кормить!", "#ccff00");
    }

    function unlockBed(bed) {
        const st = bedState(bed);
        if (typeof callbacks.onSpend === "function" && !callbacks.onSpend(bed.lockPrice)) {
            sfx("error");
                barnStatus("Не хватает монет на грядку", "#ff3838");
            return;
        }
        st.unlocked = true;
            sfx("coin");
        st.phase = "idle";
        save();
        updateUI();
        renderBarn();
        barnStatus("Новая грядка готова к посадке", "#ccff00");
    }

    function fulfillCustomer(index) {
        const offer = state.customers[index];
        if (!offer) return;
        const have = state.res[offer.product] || 0;
        if (have < offer.qty) {
            barnStatus("Не хватает: нужно " + offer.qty + " × " + PRODUCTS[offer.product].name.toLowerCase(), "#ff3838");
            return;
        }
        state.res[offer.product] -= offer.qty;
        if (typeof callbacks.onSell === "function") callbacks.onSell(offer.price);
        state.earned += offer.price;
        state.xp += Math.round(offer.price / 25);
        const used = state.customers
            .map(function (item, i) { return i === index || !item ? null : item.product; })
            .filter(Boolean);
        state.customers[index] = customerOffer(used);
        save();
        updateUI();
        renderBarn();
        barnStatus(offer.name + " заплатил " + offer.price + " 💰", "#ccff00");
    }

    // --------------------------------------------------------------------- init

    function init(options) {
        callbacks = options || {};
        canvas = $("farm-canvas");
        screenEl = $("screen-farm");
        if (!canvas) return;

        ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        canvas.width = W;
        canvas.height = H;

        terrain = buildTerrain();
        load();
        syncByTime();
        save();
        updateUI();

        canvas.addEventListener("click", onCanvasClick);
        canvas.addEventListener("touchstart", function (event) {
            event.preventDefault();
            onCanvasClick(event);
        }, { passive: false });

        const feedButton = $("btn-farm-feed");
        if (feedButton) feedButton.addEventListener("click", feedAll);

        const barnButton = $("btn-farm-barn");
        if (barnButton) barnButton.addEventListener("click", openBarn);

        const barnClose = $("btn-barn-close");
        if (barnClose) barnClose.addEventListener("click", closeBarn);

        const modal = $("farm-barn");
        if (modal) {
            modal.addEventListener("click", function (event) {
                if (event.target === modal) closeBarn();
            });
        }

        document.querySelectorAll("[data-barn-tab]").forEach(function (tab) {
            tab.addEventListener("click", function () {
                selectBarnTab(tab.getAttribute("data-barn-tab"));
            });
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && isBarnOpen()) {
                event.stopPropagation();
                closeBarn();
            }
        }, true);

        if (!syncTimer) {
            syncTimer = setInterval(function () {
                syncByTime();
            }, 1000);
        }

        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
    }

    function refresh() {
        syncByTime();
        save();
        updateUI();
        if (isBarnOpen()) renderBarn();
        render(performance.now());
    }

    window.Farm = {
        init: init,
        refresh: refresh,
        sellAll: sellAll,
        feedAll: feedAll,
        openBarn: openBarn,
        closeBarn: closeBarn,
        isBarnOpen: isBarnOpen,
        getStats: function () {
            return { collected: state.collected, earned: state.earned, xp: state.xp, resources: state.res };
        }
    };
})();
