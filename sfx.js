/* Общий звук приложения: короткие синтезированные эффекты без файлов. */
(function () {
    var ctx = null;

    function audio() {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!ctx) {
            try { ctx = new Ctx(); } catch (e) { ctx = null; }
        }
        if (ctx && ctx.state === "suspended") ctx.resume();
        return ctx;
    }

    function master() {
        var ac = audio();
        if (!ac) return null;
        return ac.destination;
    }

    function tone(freq, dur, opts) {
        var ac = audio();
        if (!ac) return;
        opts = opts || {};
        var t0 = ac.currentTime + (opts.delay || 0);
        var osc = ac.createOscillator();
        var gain = ac.createGain();
        osc.type = opts.type || "sine";
        osc.frequency.setValueAtTime(freq, t0);
        if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);

        var node = osc;
        if (opts.lowpass) {
            var lp = ac.createBiquadFilter();
            lp.type = "lowpass";
            lp.frequency.value = opts.lowpass;
            osc.connect(lp);
            node = lp;
        }

        var vol = opts.vol == null ? 0.06 : opts.vol;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack == null ? 0.012 : opts.attack));
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        node.connect(gain).connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);

        if (opts.vibrato) {
            var lfo = ac.createOscillator();
            var depth = ac.createGain();
            lfo.frequency.value = opts.vibrato.rate || 6;
            depth.gain.value = opts.vibrato.depth || 8;
            lfo.connect(depth).connect(osc.frequency);
            lfo.start(t0);
            lfo.stop(t0 + dur + 0.03);
        }
    }

    function noise(dur, vol, center, q, delay) {
        var ac = audio();
        if (!ac) return;
        var t0 = ac.currentTime + (delay || 0);
        var len = Math.max(1, Math.floor(ac.sampleRate * dur));
        var buf = ac.createBuffer(1, len, ac.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ac.createBufferSource();
        src.buffer = buf;
        var filter = ac.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = center || 900;
        filter.Q.value = q || 1;
        var gain = ac.createGain();
        gain.gain.value = vol || 0.05;
        src.connect(filter).connect(gain).connect(ac.destination);
        src.start(t0);
    }

    function cluck(delay) {
        noise(0.045, 0.09, 1300, 7, delay);
        tone(560, 0.06, { type: "sawtooth", vol: 0.05, delay: delay, slideTo: 380, lowpass: 1800 });
    }

    function animal(name) {
        switch (name) {
            case "chicken":
                cluck(0);
                cluck(0.17);
                break;
            case "cow":
                tone(150, 0.75, { type: "sawtooth", vol: 0.055, slideTo: 105, lowpass: 700, attack: 0.06, vibrato: { rate: 5.5, depth: 5 } });
                tone(300, 0.6, { type: "triangle", vol: 0.02, slideTo: 210, attack: 0.08, delay: 0.05 });
                break;
            case "pig":
                noise(0.07, 0.08, 480, 4);
                tone(210, 0.07, { type: "sawtooth", vol: 0.05, slideTo: 150, lowpass: 900 });
                noise(0.06, 0.06, 420, 4, 0.16);
                tone(190, 0.06, { type: "sawtooth", vol: 0.04, slideTo: 140, lowpass: 900, delay: 0.16 });
                break;
            case "sheep":
                tone(520, 0.42, { type: "sawtooth", vol: 0.045, slideTo: 610, lowpass: 1500, attack: 0.05, vibrato: { rate: 11, depth: 18 } });
                break;
            case "bee":
                tone(190, 0.5, { type: "sawtooth", vol: 0.03, slideTo: 230, lowpass: 1200, vibrato: { rate: 28, depth: 20 } });
                break;
        }
    }

    var SFX = {
        play: function (name) {
            switch (name) {
                case "tap": tone(520, 0.05, { type: "triangle", vol: 0.04 }); break;
                case "collect": tone(660, 0.09, { type: "triangle", vol: 0.06 }); tone(990, 0.1, { type: "triangle", vol: 0.045, delay: 0.06 }); break;
                case "coin": tone(880, 0.08, { type: "square", vol: 0.045 }); tone(1320, 0.1, { type: "square", vol: 0.04, delay: 0.07 }); break;
                case "error": tone(220, 0.16, { type: "sawtooth", vol: 0.045, slideTo: 140 }); break;
                case "win": tone(660, 0.12, { vol: 0.06 }); tone(880, 0.12, { vol: 0.06, delay: 0.1 }); tone(1180, 0.26, { vol: 0.055, delay: 0.2 }); break;
                case "lose": tone(300, 0.22, { type: "triangle", vol: 0.05, slideTo: 150 }); break;
                case "riser":
                    tone(120, 1.5, { type: "sawtooth", vol: 0.045, slideTo: 820, lowpass: 1600, attack: 0.05 });
                    noise(1.2, 0.03, 1200, 2);
                    break;
                case "chicken":
                case "cow":
                case "pig":
                case "sheep":
                case "bee":
                    animal(name);
                    break;
            }
        },

        /* Трещотка колеса: щелчки замедляются, как у настоящего колеса. */
        wheel: function (durationMs) {
            var ac = audio();
            if (!ac) return;
            var total = (durationMs || 4000) / 1000;
            var t = 0;
            var step = 0.03;
            while (t < total) {
                noise(0.03, 0.05, 2200, 6, t);
                tone(1500, 0.02, { type: "square", vol: 0.025, delay: t });
                t += step;
                step = Math.min(0.28, step * 1.22);
            }
        }
    };

    window.Sfx = SFX;
})();
