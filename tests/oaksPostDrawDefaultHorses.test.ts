import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultHorses } from "../lib/defaultHorses";

const oaksCourseId = "tokyo-turf-2400-202605021011";

test("Oaks defaults use the post-draw official runner roster", () => {
  const horses = getDefaultHorses(oaksCourseId);
  const gates = horses.map((horse) => horse.gateNumber);
  const names = horses.map((horse) => horse.name);

  assert.equal(horses.length, 18);
  assert.deepEqual(gates, Array.from({ length: 18 }, (_, index) => index + 1));
  assert.equal(new Set(names).size, 18);
  assert.ok(!names.includes("ウィズクィーン"));
});
