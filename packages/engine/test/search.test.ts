import { describe, expect, it } from "vitest";
import { catalogue, search } from "../src/index.ts";

const items = catalogue().entries;
const top = (q: string) => search(q, items)[0];
const names = (q: string, n = 3) => search(q, items).slice(0, n).map((h) => h.item.name);

describe("finding an exercise (#2, #15)", () => {
  it("forgives typos: 'caf stretch' and 'calf strech' find the calf stretch first", () => {
    expect(top("caf stretch")?.item.id).toBe("bm:calf-stretch-step");
    expect(top("calf strech")?.item.id).toBe("bm:calf-stretch-step");
    expect(top("calf strech")?.full).toBe(true);
  });

  it("finds by body words: achilles, psoas, hips", () => {
    expect(top("achilles")?.item.id).toBe("bm:calf-stretch-step");
    expect(names("psoas")).toContain("Hip flexor stretch");
    expect(search("hips", items).length).toBeGreaterThan(3);
  });

  it("finds by aliases and names: kb swing, press up, rdl", () => {
    expect(top("kettlebell swing")?.item.id).toBe("bm:kettlebell-swing");
    expect(top("push up")?.item.id).toBe("bm:push-up");
    expect(top("romanian deadlift")?.item.id).toBe("bm:romanian-deadlift");
  });

  it("only lets Enter add a full match: 'couch sit to stand' isn't one", () => {
    const hits = search("couch sit to stand", items);
    expect(hits.every((h) => !h.full)).toBe(true);
  });

  it("ignores little words and returns nothing for nothing", () => {
    expect(top("the plank")?.item.id).toBe("bm:plank");
    expect(search("", items)).toEqual([]);
    expect(search("the", items)).toEqual([]);
  });
});
