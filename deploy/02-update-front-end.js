const { network, deployments, getNamedAccounts } = require("hardhat")
const fs = require("fs")

const FRONT_END_ADDRESSES_FILE =
    "../nextjs-smartcontract-lottery-fcc/constants/contractAddresses.json"
const FRONT_END_ABI_FILE = "../nextjs-smartcontract-lottery-fcc/constants/abi.json"

module.exports = async function () {
    if (process.env.UPDATE_FRONT_END) {
        console.log("Updating front end...")
        updateContractAddresses()
        updateAbi()
    }
}

async function updateContractAddresses() {
    const raffleInfo = await deployments.get("Raffle")
    const raffleAddress = raffleInfo.address
    const deployer = (await getNamedAccounts()).deployer
    const raffle = await ethers.getContractAt("Raffle", raffleAddress, deployer)
    const chainId = network.config.chainId.toString()
    const currentAddresses = JSON.parse(fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf-8"))
    if (chainId in currentAddresses) {
        if (!currentAddresses[chainId].includes(raffle.target)) {
            currentAddresses[chainId].push(raffle.target)
        }
    } else {
        currentAddresses[chainId] = [raffle.target]
    }
    fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(currentAddresses))
}

async function updateAbi() {
    const raffleInfo = await deployments.get("Raffle")
    const raffleAddress = raffleInfo.address
    const deployer = (await getNamedAccounts()).deployer
    const raffle = await ethers.getContractAt("Raffle", raffleAddress, deployer)
    fs.writeFileSync(FRONT_END_ABI_FILE, JSON.stringify(raffleInfo.abi))
}

module.exports.tags = ["all", "frontend"]
