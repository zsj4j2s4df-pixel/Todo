import webpush from "npm:web-push@3.6.7";
import { createECDH, randomBytes } from "node:crypto";
Deno.test(
  "VAPID and encrypted request generation work in the Edge Deno runtime without sending",
  () => {
    const vapid = webpush.generateVAPIDKeys();
    const device = createECDH("prime256v1");
    device.generateKeys();
    const payload = JSON.stringify({
      title: "Todo",
      body: "Er staat een herinnering voor je klaar.",
    });
    const details = webpush.generateRequestDetails(
      {
        endpoint: "https://fcm.googleapis.com/test-not-sent",
        keys: {
          p256dh: device.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url"),
        },
      },
      payload,
      {
        TTL: 3600,
        vapidDetails: {
          subject: "https://todo.zsj4j2s4df.workers.dev",
          ...vapid,
        },
      },
    );
    if (
      details.method !== "POST" ||
      !details.headers.Authorization?.startsWith("vapid ") ||
      !details.body ||
      details.body.toString().includes(payload)
    )
      throw new Error("Invalid Web Push encryption or VAPID");
  },
);
