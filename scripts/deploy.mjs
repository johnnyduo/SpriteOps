import { ethers } from "ethers";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { resolve } from "path";
import { execSync } from "child_process";

config({ path: ".env.local" });

async function main() {
  console.log("Deploying EIP8004Agent contract to Hedera Testnet...");

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider("https://testnet.hashio.io/api");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log("Deploying from:", wallet.address);

  // Compile contracts first
  console.log("Compiling contracts...");
  execSync("npx hardhat --config hardhat.config.mjs compile", { stdio: "inherit" });

  // Read compiled contract
  const artifactPath = "./artifacts/contracts/EIP8004Agent.sol/EIP8004Agent.json";
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  // Create contract factory
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  // Deploy with legacy transaction (Hedera requires min 590 gwei)
  console.log("Deploying contract...");
  const contract = await factory.deploy({
    type: 0,
    gasLimit: 3000000,
    gasPrice: ethers.parseUnits("600", "gwei"), // Hedera testnet minimum
  });

  console.log("Waiting for deployment...");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ EIP8004Agent deployed to:", address);
  console.log("\n📋 Save this address for X402Streaming deployment!");
  console.log(`\nUpdate .env.local with:\nEIP8004_ADDRESS=${address}`);
  
  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
