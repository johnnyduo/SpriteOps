import { ethers } from "ethers";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { execSync } from "child_process";

config({ path: ".env.local" });

async function main() {
  // Get the EIP8004Agent address from previous deployment
  const registryAddress = process.env.EIP8004_ADDRESS;
  
  if (!registryAddress) {
    console.error("❌ Please set EIP8004_ADDRESS in .env.local");
    process.exit(1);
  }

  console.log("Deploying X402Streaming contract to Hedera Testnet...");
  console.log("Using registry address:", registryAddress);

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider("https://testnet.hashio.io/api");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log("Deploying from:", wallet.address);

  // Compile contracts first
  console.log("Compiling contracts...");
  execSync("npx hardhat --config hardhat.config.mjs compile", { stdio: "inherit" });

  // Read compiled contract
  const artifactPath = "./artifacts/contracts/X402Streaming.sol/X402Streaming.json";
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  // Create contract factory
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  // Deploy with legacy transaction
  console.log("Deploying contract...");
  const contract = await factory.deploy(registryAddress, {
    type: 0,
    gasLimit: 3000000,
    gasPrice: ethers.parseUnits("600", "gwei"), // Hedera testnet minimum
  });

  console.log("Waiting for deployment...");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ X402Streaming deployed to:", address);
  console.log("\n📋 Contract addresses:");
  console.log("   EIP8004Agent:", registryAddress);
  console.log("   X402Streaming:", address);
  console.log("\n🎉 Deployment complete!");
  console.log(`\nUpdate .env.local with:\nX402_STREAMING_ADDRESS=${address}`);
  
  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
