import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getLocation } from "./location.js";

test("location unavailable or insecure never asks for permission", async () => {
  let calls = 0;
  const geolocation = { getCurrentPosition() { calls++; } };
  await assert.rejects(getLocation({ secure: false, geolocation }), /HTTPS/);
  await assert.rejects(getLocation({ secure: true }), /位置情報を利用できません/);
  assert.equal(calls, 0);
});
test("permission denial, unavailable position and timeout have actionable distinct messages", async () => {
  const expected = [/許可/, /取得できません/, /時間/];
  for (const code of [1, 2, 3]) {
    await assert.rejects(getLocation({ secure: true, geolocation: {
      getCurrentPosition(_success, error, options) {
        assert.equal(options?.timeout, 10000);
        assert.equal(options?.maximumAge, 0);
        error?.({ code, message: "private device info", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      },
    } }), expected[code - 1]);
  }
});
test("successful location uses only coordinates, without retaining accuracy or timestamps", async () => {
  const result = await getLocation({ secure: true, geolocation: {
    getCurrentPosition(success) {
      success({ coords: { latitude: 35, longitude: 139 } } as GeolocationPosition);
    },
  } });
  assert.deepEqual(result, { latitude: 35, longitude: 139 });
});
