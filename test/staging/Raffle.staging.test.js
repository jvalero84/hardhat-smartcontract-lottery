const { assert, expect } = require("chai")
const { network, deployments, getNamedAccounts } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          // Describe blocks don't understand about async functions so no need to add the keyword
          let raffle, raffleEntranceFee, deployer

          beforeEach(async function () {
              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              deployer = accounts[0] // with getNamedAccounts: (await getNamedAccounts()).deployer
              let raffleAddress
              const raffleInfo = await deployments.get("Raffle")
              raffleAddress = raffleInfo.address
              //const signer = await ethers.getSigner(deployer)  // This is only needed if we use getNamedAccounts instead of ethers.getSigners() to get the deployer.
              raffle = await ethers.getContractAt("Raffle", raffleAddress, deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Automation aka Keepers and VRF, we get a random winner", async function () {
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()
                  // Setup the listener before entering the raffle
                  // Just in case the Blockchain moves really fast!
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              // Lets add our asserts here
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await ethers.provider.getBalance(
                                  accounts[0].address, // This is the deployer account.
                              )
                              const endingTimeStamp = await raffle.getLatestTimeStamp()

                              await expect(raffle.getPlayer(0)).to.be.reverted // when the winner is picked, the array of players is reset.
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerBalance.toString(),
                                  (winnerStartingBalance + raffleEntranceFee).toString(),
                              ) // As we only have a single player in the raffle..
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              console.log(e)
                              reject(e)
                          }
                      })
                      // After setting up the listener, we enter the raffle.
                      const txResponse = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await txResponse.wait(1)
                      const winnerStartingBalance = await ethers.provider.getBalance(
                          accounts[0].address,
                      )

                      // and this code won't complete until our listener has finished listening (the event is fired and code executed or timeout is reached..)
                  })
              })
          })
      })
