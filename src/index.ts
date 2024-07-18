import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify, identifyPush } from "@libp2p/identify";
import { kadDHT } from "@libp2p/kad-dht";
import { pubsubPeerDiscovery } from "@libp2p/pubsub-peer-discovery";
import { tcp } from "@libp2p/tcp";
import { multiaddr } from "@multiformats/multiaddr";
import chalk from "chalk";
import { unmarshalPrivateKey } from "@libp2p/crypto/keys";
import {
  createEd25519PeerId,
  createFromProtobuf,
  exportToProtobuf,
} from "@libp2p/peer-id-factory";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createLibp2p } from "libp2p";
import { createInterface } from "readline/promises";

const PUBLIC_KAD_DHT = "/ipfs/kad/1.0.0";
const KEY_FILE = `${process.cwd()}/nodekey.bin`;
const TOPIC = "orochi-network-p2p-chat";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createNode() {
  if (!existsSync(KEY_FILE)) {
    const peerId = await createEd25519PeerId();
    console.log("Create peerId:", peerId.toString());
    writeFileSync(KEY_FILE, exportToProtobuf(peerId));
  }

  const filecontent = readFileSync(KEY_FILE);
  const peerId = await createFromProtobuf(filecontent);
  const privKey = await unmarshalPrivateKey(peerId.privateKey!);
  return await createLibp2p({
    peerId: peerId,
    privateKey: privKey,
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
  `Service online:\n${chalk.greenBright(
    node
      .getMultiaddrs()
      .map((e) => e.toString())
      .join("\n")
  )}`
);

const nodes: string[] = [];

for (let i = 0; i < nodes.length; i += 1) {
  try {
    await node.dial(multiaddr(nodes[i]));
  } catch (e: any) {
    console.log(e.message);
  }
}

if (process.argv.length === 3) {
  node.dial(multiaddr(process.argv[2]));
}

const prompt = () =>
  `${chalk.bgBlue.white(new Date().toISOString())}${chalk.bgGreen.white(
    "me"
  )}${chalk.bgRed.white(":")}`;

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

node.services.pubsub.addEventListener("message", async (message) => {
  if (message.detail.topic === TOPIC) {
    const res = JSON.parse(new TextDecoder().decode(message.detail.data));
    process.stdout.cursorTo(0);
    process.stdout.clearLine(1);
    console.log(
      `${chalk.bgBlue.white(res.time)}${chalk.bgGreen.white(
        res.alias || res.from
      )}${chalk.bgRed.white(":")}${res.message}`
    );
    process.stdout.write(prompt());
  }
});

const name = await rl.question("What is your alias? ");
node.services.pubsub.subscribe(TOPIC);

let subscribers = 0;
while (subscribers === 0) {
  subscribers = node.services.pubsub.getSubscribers(TOPIC).length;
  await sleep(1000);
}

console.log(chalk.blueBright(`Hi ${name}, you're online.\n`));

while (true) {
  const answer = await rl.question(prompt());
  await node.services.pubsub.publish(
    TOPIC,
    new TextEncoder().encode(
      JSON.stringify({
        from: node.peerId.toString(),
        time: new Date().toISOString(),
        message: answer,
        alias: name,
      })
    )
  );
}
