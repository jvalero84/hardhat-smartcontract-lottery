const { assert, expect } = require("chai")
const { network, deployments, getNamedAccounts } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          // Describe blocks don't understand about async functions so no need to add the keyword
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              deployer = accounts[0] // with getNamedAccounts: (await getNamedAccounts()).deployer
              let vrfCoordinatorV2Address, raffleAddress
              await deployments.fixture(["all"])
              const raffleInfo = await deployments.get("Raffle")
              const vrfCoordinatorV2MockInfo = await deployments.get("VRFCoordinatorV2Mock")
              vrfCoordinatorV2Address = vrfCoordinatorV2MockInfo.address
              raffleAddress = raffleInfo.address
              //const signer = await ethers.getSigner(deployer)  // This is only needed if we use getNamedAccounts instead of ethers.getSigners() to get the deployer.

              raffle = await ethers.getContractAt("Raffle", raffleAddress, deployer)
              vrfCoordinatorV2Mock = await ethers.getContractAt(
                  "VRFCoordinatorV2Mock",
                  vrfCoordinatorV2Address,
                  deployer,
              )
              const subsId = await raffle.getSubscriptionId()
              await vrfCoordinatorV2Mock.addConsumer(subsId, raffle.target) // registering addresses which launch requests (consumers) is needed on newer versions of VRF
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async function () {
                  // Ideally we make our tests have just a single assert per "it"
                  const raffleState = await raffle.getRaffleState()
                  const gasLane = await raffle.getGasLane()
                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
                  assert.equal(gasLane, networkConfig[chainId]["gasLane"])
                  assert.equal(raffleEntranceFee.toString(), networkConfig[chainId]["entranceFee"])
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETHEntered",
                  )
              })
              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer.address) // Since we have entered the raffle with the account "connected" with the Raffle contract. thus, the deployer.
              })
              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee }))
                      .to.emit(raffle, "RaffleEnter")
                      .withArgs(deployer.address)
              })
              it("doesnt allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", []) // We just want to mine one extra block.
                  // we could use network.provider.request instead of network.provider.send, but send is slightly quicker..
                  // Once we increase the time and mine the block, the interval should have passed and all the conditions of checkupkeep should be true.
                  await raffle.performUpkeep("0x") // we pass the empty calldata by passing and empty array.
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee }),
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen")
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent enough ETH", async function () {
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // On ethers v5 staticcalls equivalent would be raffle.callStatic.checkUpkeep("[]")
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x")
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep.staticCall("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("it can only run if checkUpkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx) // If tx doesn't work or the above statement fails, this assertion will fail.
              })
              it("reverts when checkupkeep is false", async function () {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UpkeepNotNeeded",
                  )
              })
              it("updates the raffle state, emits an event, and calls the vrf coordinator", async function () {
                  // First lets make checkupkeep true (next three statements)
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  filter = raffle.filters.RequestedRaffleWinner
                  const events = await raffle.queryFilter(filter, -1)
                  const ourEvent = events[0]
                  const requestId = ourEvent.args.requestId
                  // Alternatively we could get the event info from the txReceipt logs..
                  const matchingRequestId = txReceipt.logs[1].args.requestId
                  //const requestId = txReceipt.events[1].args.requestId // We pick [1] because the first event emitted is the one from the VRFCoordinator (RandomWordsRequested)
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId > 0)
                  assert.equal(requestId, matchingRequestId)
                  assert.equal(Number(raffleState), 1)
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  // Before doing any testing of fulfillRandomWords we want to have someone entering the raffle and making sure the interval has passed to clear the prerequisistes
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [Number(interval) + 1])
                  await network.provider.request({ method: "evm_mine", param: [] })
              })
              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.target),
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.target),
                  ).to.be.revertedWith("nonexistent request")
              })
              // The next one is going to be a test way too big, should be maybe split in a few it..
              it("picks a winner, resets the lottery and sends money", async function () {
                  const additionalPlayers = 3
                  const startingAccountIndex = 1 // As deployer is at index 0
                  let startingBalance = await ethers.provider.getBalance(raffle.target)
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalPlayers;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp() // Lets keep note of our starting timestamp..
                  console.log(`setup finished.. ts: ${startingTimeStamp}`)

                  // performUpkeep (mock being Chainlink Keepers).. which will kick-off fulFillRandomWords..
                  // fulFillRandowmWords (mock being Chainlink VRF)
                  // Normally on testnets we would have to wait to check that all the state variables have been set after fulfillRandomWords is called, as as we want to simulate
                  // that behaviour, we have to set a listener to listen for the fulfillRandowWords call so that the test does not progress before that event has finished.
                  await new Promise(async (resolve, reject) => {
                      // We have to setup the listener first before calling performUpkeep and fulfillRandomWords so that it starts listening before the event is kicked-off
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(recentWinner)
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)
                              const winnerBalance = await ethers.provider.getBalance(
                                  accounts[1].address,
                              )
                              console.log(`winnerBalance: ${winnerBalance}`)
                              const raffleState = await raffle.getRaffleState()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              const numPlayers = await raffle.getNumberOfPlayers()
                              // Comparisons to check if our ending values are correct:
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert.equal(recentWinner.toString(), accounts[1].address)
                              console.log(typeof raffleEntranceFee) // Had issues with mixing up types (BigInt and number). This was part of the debugging..
                              console.log(typeof additionalPlayers)
                              assert.equal(
                                  winnerBalance.toString(),
                                  (
                                      startingBalance + // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      raffleEntranceFee * BigInt(additionalPlayers) +
                                      raffleEntranceFee
                                  ).toString(),
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)
                      startingBalance = await ethers.provider.getBalance(accounts[1].address)
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.logs[1].args.requestId,
                          raffle.target,
                      )
                  })
              })
          })
      })
