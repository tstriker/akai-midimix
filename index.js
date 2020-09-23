class MidiMix {
    constructor(options) {
        this.connected = false;
        this._input = null;
        this._output = null;
        this._initDone = false;

        this._listeners = [];

        // wrap toggles so that when the value is set, we send the signal to the MIDI light
        let _states = {};
        Object.keys(MidiButtons).forEach(button => {
            if (button == "solo") {
                // solo doesn't have a light
                return;
            }
            Object.defineProperty(this, button, {
                get() {
                    return _states[button] || false;
                },
                set: bool => {
                    if (bool == _states[button]) {
                        return;
                    }
                    _states[button] = bool;

                    if (!this.connected) {
                        // we're not connected but we're not gonna shout about it as we already yelled on connect
                        return;
                    }
                    this._output.send([0x90, MidiButtons[button], bool ? 127 : 0]);

                    // when the light gets toggled, we pretend there has been a cc event as we have a state for them
                    if (this._initDone) {
                        this._dispatchEvent("cc", {
                            code: button,
                            keyCode: MidiButtons[button],
                            val: bool,
                            prevVal: !bool,
                        });
                    }
                },
            });
        });

        this._onMessage = this._onMessage.bind(this);
        this._onStateChange = this._onStateChange.bind(this);
    }

    async connect() {
        return new Promise(async resolve => {
            let access = await navigator.requestMIDIAccess({sysex: true});
            // MIDI devices that send you data.
            const inputs = access.inputs.values();
            for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
                if (input.value.name.indexOf("MIDI Mix") == 0) {
                    this._input = input.value;
                }
            }

            if (!this._input) {
                console.error("Tried to connect to MIDI Mix but didn't find one.");
                return;
            }
            this._input.addEventListener("midimessage", this._onMessage);
            this._input.addEventListener("statechange", this._onStateChange);

            const outputs = access.outputs.values();
            for (let output = outputs.next(); output && !output.done; output = outputs.next()) {
                if (output.value.name.indexOf("MIDI Mix") == 0) {
                    this._output = output.value;
                }
            }

            let tempListener = evt => {
                if (evt.port.state == "connected") {
                    this._input.removeEventListener("statechange", tempListener);

                    Object.keys(MidiButtons).forEach(button => {
                        // reset the buttons lights on load as we can't read their state
                        this[button] = false;
                    });
                    this._initDone = true;
                    resolve();
                }
            };
            this._input.addEventListener("statechange", tempListener);
        });
    }

    addEventListener(eventType, listener) {
        this._listeners.push([eventType, listener]);
    }

    removeEventListener(eventType, listener) {
        let idx = -1;
        this._listeners.forEach(([lType, lFunc], idx) => {
            if (lType == eventType && lFunc == listener) {
                idx = idx;
            }
        });
        if (idx != -1) {
            this._listeners.splice(idx, 1);
        }
    }

    _dispatchEvent(eventType, data) {
        /* emits a custom event with cc data */
        this._listeners.forEach(([listenerType, listener]) => {
            if (listenerType == eventType) {
                listener({...data, type: eventType});
            }
        });
    }

    _onMessage(event) {
        if (event.data.lengt > 3) {
            this._handleSysexMessage(event);
            return;
        }

        let [typeId, knob, val] = event.data;
        let eventType = {144: "note_on", 128: "note_off", 176: "cc"}[typeId];
        let code = eventType == "cc" ? ccMapping[knob] : buttonMapping[knob];

        if (eventType == "cc") {
            // normalize the value and round to the 6th digit as that's far enough
            let prev = this[code];
            this[code] = round(val / 127, 6);
            this._dispatchEvent("cc", {code: code, keyCode: knob, val: this[code], prevVal: prev});
        } else {
            // button press
            let pascalCase = {bank_left: "BankLeft", bank_right: "BankRight", solo: "Solo"};
            this._dispatchEvent(eventType == "note_on" ? "keydown" : "keyup", {
                key: code,
                code: pascalCase[code] || code,
                keyCode: knob,
            });
        }
    }

    _handleSysexMessage(event) {
        // sysex event (e.g. reading conf) not used right now
        let [_start, _manufacturerID, _deviceID, _modelId, messageId, _msb, _lsb, ...data] = [...event.data];
        console.log("sysex message received:", messageId, event, data.join(","));
    }

    _onStateChange(event) {
        this.connected = event.port.state == "connected";
    }

    disconnect() {
        Object.keys(MidiButtons).forEach(button => {
            // clean up after ourselves and reset the buttons on unload
            this[button] = false;
        });

        if (this._input) {
            this._input.removeEventListener("midimessage", this._onMessage);
            this._input.removeEventListener("statechange", this._onStateChange);
            this._input = null;
        }
        this.connected = false;
        this._output = null;
    }

    destroy() {
        this.disconnect();
        this._listeners = [];
    }
}

function round(val, precision = 0) {
    // rounds the number to requested precision. how is this not part of stdlib
    return Math.round(val * Math.pow(10, precision)) / Math.pow(10, precision);
}

let MidiCc = {
    c1: 16,
    c2: 20,
    c3: 24,
    c4: 28,
    c5: 46,
    c6: 50,
    c7: 54,
    c8: 58,
    c1a: 17,
    c2a: 21,
    c3a: 25,
    c4a: 29,
    c5a: 47,
    c6a: 51,
    c7a: 55,
    c8a: 59,
    c1b: 18,
    c2b: 22,
    c3b: 26,
    c4b: 30,
    c5b: 34,
    c6b: 53,
    c7b: 56,
    c8b: 60,

    s1: 19,
    s2: 23,
    s3: 27,
    s4: 31,
    s5: 49,
    s6: 53,
    s7: 57,
    s8: 61,
    master: 62,
};
let ccMapping = Object.fromEntries(Object.entries(MidiCc).map(([key, val]) => [val, key]));

let MidiButtons = {
    m1: 1,
    m2: 4,
    m3: 7,
    m4: 10,
    m5: 13,
    m6: 16,
    m7: 19,
    m8: 22,
    r1: 3,
    r2: 6,
    r3: 9,
    r4: 12,
    r5: 15,
    r6: 18,
    r7: 21,
    r8: 24,
    bank_left: 25,
    bank_right: 26,
    solo: 27,
};
let buttonMapping = Object.fromEntries(Object.entries(MidiButtons).map(([key, val]) => [val, key]));

export {MidiMix, MidiCc, MidiButtons};
export default MidiMix;
