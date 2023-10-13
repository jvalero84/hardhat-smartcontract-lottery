const { ethers, network, deployments } = require("hardhat")

let accounts, deployer, vrfCoordinatorV2Mock

async function mockKeepers() {
    accounts = await ethers.getSigners() // could also do with getNamedAccounts
    deployer = accounts[0]
    const raffleInfo = await deployments.get("Raffle")
    const raffleAddress = raffleInfo.address
    const raffle = await ethers.getContractAt("Raffle", raffleAddress, deployer)
    const vrfCoordinatorMockInfo = await deployments.get("VRFCoordinatorV2Mock")
    const vrfCoordinatorMockAddress = vrfCoordinatorMockInfo.address
    vrfCoordinatorV2Mock = await ethers.getContractAt(
        "VRFCoordinatorV2Mock",
        vrfCoordinatorMockAddress,
        deployer,
    )
    const subsId = await raffle.getSubscriptionId()
    await vrfCoordinatorV2Mock.addConsumer(subsId, raffle.target)

    const checkData = ethers.keccak256(ethers.toUtf8Bytes(""))
    const { upkeepNeeded } = await raffle.checkUpkeep.staticCall(checkData)
    if (upkeepNeeded) {
        const tx = await raffle.performUpkeep(checkData)
        const txReceipt = await tx.wait(1)
        const requestId = txReceipt.logs[1].args.requestId
        console.log(`Performed upkeep with RequestId: ${requestId}`)
        if (network.config.chainId == 31337) {
            await mockVrf(requestId, raffle)
        }
    } else {
        console.log("No upkeep needed!")
    }
}

async function mockVrf(requestId, raffle) {
    console.log("We on a local network? Ok let's pretend...")
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, raffle.target)
    console.log("Responded!")
    const recentWinner = await raffle.getRecentWinner()
    console.log(`The winner is: ${recentWinner}`)
}

mockKeepers()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
