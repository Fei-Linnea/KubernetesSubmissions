const { connect, StringCodec } = require("nats");

const NATS_URL =
  process.env.NATS_URL ||
  "nats://my-nats.nats.svc.cluster.local:4222";

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL;

const SUBJECT = "todo.events";
const QUEUE_GROUP = "broadcasters";

const sc = StringCodec();

async function sendToDiscord(message) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log(
      "DISCORD_WEBHOOK_URL is not set, skipping Discord notification"
    );
    return;
  }

  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: message,
    }),
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Discord returned ${response.status}: ${body}`
    );
  }
}

async function main() {
  if (DISCORD_WEBHOOK_URL) {
    console.log("Discord webhook is configured");
  } else {
    console.log(
      "Discord webhook is not configured, messages will only be logged"
    );
  }

  console.log(`Connecting to NATS at ${NATS_URL}`);

  const nc = await connect({
    servers: NATS_URL,
  });

  console.log("Connected to NATS");

  const subscription = nc.subscribe(SUBJECT, {
    queue: QUEUE_GROUP,
  });

  console.log(
    `Subscribed to ${SUBJECT} with queue group ${QUEUE_GROUP}`
  );

  for await (const message of subscription) {
    try {
      const data = JSON.parse(
        sc.decode(message.data)
      );

      console.log("Received todo event:", data);

      let discordMessage;

      if (data.action === "created") {
        discordMessage =
          `A todo was created: ${data.text}`;
      } else if (data.action === "completed") {
        discordMessage =
          `A todo was marked as done: ${data.text}`;
      } else {
        discordMessage =
          `Todo update: ${data.text}`;
      }

      await sendToDiscord(discordMessage);

      if (DISCORD_WEBHOOK_URL) {
        console.log("Message sent to Discord");
      } else {
        console.log("Message logged only (staging mode)");
      }
    } catch (err) {
      console.error(
        "Failed to process NATS message:",
        err
      );
    }
  }
}

main().catch(err => {
  console.error("Broadcaster failed:", err);
  process.exit(1);
});
