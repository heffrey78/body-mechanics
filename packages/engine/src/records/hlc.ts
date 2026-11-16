/**
 * Edit stamps: a hybrid logical clock, so the record merge (D2 item 5) can tell which of two edits is
 * later even when the devices' clocks disagree a little. A stamp is
 * `<ISO time to the millisecond>~<4-digit counter>~<device id>`, which sorts as a string in time order.
 */
export const HLC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z~\d{4}~[a-z2-7]{16}$/;

export type Hlc = string;

interface Parsed { ms: number; counter: number; device: string }

export function parseHlc(stamp: Hlc): Parsed {
  const [iso, counter, device] = stamp.split("~");
  if (!iso || !counter || !device || !HLC_PATTERN.test(stamp)) throw new Error(`Not an edit stamp: ${stamp}`);
  return { ms: Date.parse(iso), counter: Number(counter), device };
}

function format(ms: number, counter: number, device: string): Hlc {
  return `${new Date(ms).toISOString()}~${String(counter).padStart(4, "0")}~${device}`;
}

/** A clock for one device. `tick()` stamps a local edit; `receive()` takes in a stamp seen from another device. */
export class Clock {
  readonly device: string;
  #now: () => number;
  #ms = 0;
  #counter = 0;
  constructor(device: string, now: () => number = () => Date.now()) {
    this.device = device;
    this.#now = now;
  }

  tick(): Hlc {
    const wall = this.#now();
    if (wall > this.#ms) { this.#ms = wall; this.#counter = 0; } else { this.#counter++; }
    return format(this.#ms, this.#counter, this.device);
  }

  receive(stamp: Hlc): void {
    const seen = parseHlc(stamp);
    const wall = this.#now();
    const ms = Math.max(wall, this.#ms, seen.ms);
    if (ms === this.#ms && ms === seen.ms) this.#counter = Math.max(this.#counter, seen.counter) + 1;
    else if (ms === this.#ms) this.#counter++;
    else if (ms === seen.ms) this.#counter = seen.counter + 1;
    else this.#counter = 0;
    this.#ms = ms;
  }
}

/** Later of two stamps; ties (impossible across devices) favour `a`. */
export function later(a: Hlc, b: Hlc): Hlc {
  return b > a ? b : a;
}
