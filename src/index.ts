import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify, identifyPush } from "@libp2p/identify";
import { kadDHT } from "@libp2p/kad-dht";
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { tcp } from "@libp2p/tcp";
import { multiaddr } from "@multiformats/multiaddr";
import chalk from "chalk";
import { createLibp2p } from "libp2p";
import { createInterface } from "readline/promises";

const PUBLIC_KAD_DHT = "/ipfs/kad/1.0.0";
const TOPIC = "chat";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createNode() {
  return await createLibp2p({
    addresses: {
      listen: ["/ip4/0.0.0.0/tcp/0"],
    },
    peerDiscovery: [
      pubsubPeerDiscovery({
        interval: 1000,
      }),
    ],
    services: {
      dht: kadDHT({
        protocol: PUBLIC_KAD_DHT,
        clientMode: false,
      }),
      identify: identify(),
      identifyPush: identifyPush(),
      pubsub: gossipsub(),
    },
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    transports: [tcp()],
  });
}

const node = await createNode();

console.log(
  "Service online:",
  node.getMultiaddrs().map((e) => e.toString())
);

node.addEventListener("peer:connect", (evt: any) => {
  const peerId = evt.detail;
  console.log("Connection established to:", peerId.toString()); // Emitted when a peer has been found
});

if (process.argv.length === 3) {
  node.dial(multiaddr(process.argv[2]));
}

node.services.pubsub.addEventListener("message", (message) => {
  if (message.detail.topic === TOPIC) {
    const res = JSON.parse(new TextDecoder().decode(message.detail.data));
    console.log(
      `${chalk.bgBlue.white(res.time)}${chalk.bgGreen.white(
        res.from
      )}${chalk.bgRed.white(res.message)}`
    );
  }
});

node.services.pubsub.subscribe(TOPIC);

let subscribers = 0;
while (subscribers === 0) {
  subscribers = node.services.pubsub.getSubscribers(TOPIC).length;
  await sleep(1000);
}
console.log("You're online");
const rl = createInterface({
  input: process.stdin,
});

while (true) {
  const answer = await rl.question(">");
  node.services.pubsub.publish(
    TOPIC,
    new TextEncoder().encode(
      JSON.stringify({
        from: node.peerId.toString(),
        time: new Date().toISOString(),
        message: answer,
      })
    )
  );
}
