const chai = require("chai");
const { solidity } = require("ethereum-waffle");
const { time } = require("@openzeppelin/test-helpers");
const { ethers, upgrades } = require("hardhat");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { expect } = chai;

chai.use(solidity);

const units = (value) => ethers.utils.parseUnits(value.toString());
const days = (value) => value * 24 * 60 * 60;

const timeTravel = async (seconds) => {
  await time.increase(seconds);
};

const checkAlmostSame = (a, b) => {
  expect(
    ethers.BigNumber.from(a).gte(ethers.BigNumber.from(b).mul(999).div(1000))
  ).to.be.true;
  expect(
    ethers.BigNumber.from(a).lte(ethers.BigNumber.from(b).mul(1001).div(1000))
  ).to.be.true;
};

describe("Tic Tac Toe", () => {
  let deployer, host, joiner;
  let token, game;

  before(async () => {
    const accounts = await ethers.getSigners();
    deployer = accounts[0];
    host = accounts[1];
    joiner = accounts[2];

    const TicTacToe = await ethers.getContractFactory("TicTacToe");
    game = await TicTacToe.deploy();
    await game.deployed();

    const TestToken = await ethers.getContractFactory("TestToken");
    token = await TestToken.deploy(1000000); // 1M tokens
    await token.deployed();
  });

  it("Should be able to create a game with ETH", async () => {
    // TTT_INVALID_AMOUNT
    await expect(
      game.connect(host).createNewGame(ZERO_ADDRESS, units(1), {
        value: units(2),
      })
    ).to.be.revertedWith("TTT_INVALID_AMOUNT");

    // Able to create the game
    expect(
      await game.connect(host).createNewGame(ZERO_ADDRESS, units(1), {
        value: units(1),
      })
    )
      .to.emit(game, "NewGame")
      .withArgs(host.address, 1);
  });

  it("Should be able to create a game with Token", async () => {
    // Check token approvement
    await expect(
      game.connect(host).createNewGame(token.address, units(1))
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

    // Able to create the game
    await token.transfer(host.address, units(1));
    await token.connect(host).approve(game.address, units(1));
    expect(await game.connect(host).createNewGame(token.address, units(1)))
      .to.emit(game, "NewGame")
      .withArgs(host.address, 2);
  });

  it("Should be able to join the game with ETH", async () => {
    // TTT_INVALID_GAME_ID
    await expect(game.connect(joiner).joinGame(0)).to.be.revertedWith(
      "TTT_INVALID_GAME_ID"
    );
    await expect(game.connect(joiner).joinGame(3)).to.be.revertedWith(
      "TTT_INVALID_GAME_ID"
    );

    // TTT_INVALID_AMOUNT
    await expect(
      game.connect(joiner).joinGame(1, { value: units(2) })
    ).to.be.revertedWith("TTT_INVALID_AMOUNT");

    // Able to join the game
    expect(await game.connect(joiner).joinGame(1, { value: units(1) }))
      .to.emit(game, "JoinGame")
      .withArgs(joiner.address, 1);

    // TTT_ALREADY_STARTED
    await expect(
      game.connect(joiner).joinGame(1, { value: units(1) })
    ).to.be.revertedWith("TTT_ALREADY_STARTED");
  });

  it("Should be able to join the game with Token", async () => {
    // Check token approvement
    await expect(game.connect(joiner).joinGame(2)).to.be.revertedWith(
      "ERC20: transfer amount exceeds balance"
    );

    // Able to join the game
    await token.transfer(joiner.address, units(1));
    await token.connect(joiner).approve(game.address, units(1));
    expect(await game.connect(joiner).joinGame(2))
      .to.emit(game, "JoinGame")
      .withArgs(joiner.address, 2);

    await expect(game.connect(joiner).joinGame(2)).to.be.revertedWith(
      "TTT_ALREADY_STARTED"
    );
  });

  it("should let the players can play the game: host wins", async () => {
    // TTT_INVALID_GAME_ID
    await expect(game.connect(host).play(0, 0, 0)).to.be.revertedWith(
      "TTT_INVALID_GAME_ID"
    );
    await expect(game.connect(host).play(3, 0, 0)).to.be.revertedWith(
      "TTT_INVALID_GAME_ID"
    );

    // TTT_INVALID_COORDINATE
    await expect(game.connect(host).play(1, 3, 0)).to.be.revertedWith(
      "TTT_INVALID_COORDINATE"
    );
    await expect(game.connect(host).play(1, 0, 3)).to.be.revertedWith(
      "TTT_INVALID_COORDINATE"
    );

    // Create a new game and test TTT_NOT_STARTED
    await token.transfer(host.address, units(1));
    await token.connect(host).approve(game.address, units(1));
    expect(await game.connect(host).createNewGame(token.address, units(1)))
      .to.emit(game, "NewGame")
      .withArgs(host.address, 3);
    await expect(game.connect(host).play(3, 0, 0)).to.be.revertedWith(
      "TTT_NOT_STARTED"
    );

    // TTT_NOT_YOUR_TURN
    await expect(game.connect(joiner).play(1, 0, 0)).to.be.revertedWith(
      "TTT_NOT_YOUR_TURN"
    );

    await game.connect(host).play(1, 0, 0);

    // TTT_NOT_YOUR_TURN
    await expect(game.connect(host).play(1, 0, 1)).to.be.revertedWith(
      "TTT_NOT_YOUR_TURN"
    );

    // TTT_EXIST_COORDINATE
    await expect(game.connect(joiner).play(1, 0, 0)).to.be.revertedWith(
      "TTT_EXIST_COORDINATE"
    );

    // Able to win the game
    await game.connect(joiner).play(1, 1, 1);
    await game.connect(host).play(1, 0, 1);
    await game.connect(joiner).play(1, 1, 2);

    const hostBalanceBefore = await ethers.provider.getBalance(host.address);
    const joinerBalanceBefore = await ethers.provider.getBalance(
      joiner.address
    );

    await game.connect(host).play(1, 0, 2);

    const hostBalanceAfter = await ethers.provider.getBalance(host.address);
    const joinerBalanceAfter = await ethers.provider.getBalance(joiner.address);

    // Check balance changes
    checkAlmostSame(units(2).add(hostBalanceBefore), hostBalanceAfter);
    checkAlmostSame(joinerBalanceBefore, joinerBalanceAfter);

    // Check the game info - winner
    expect(await game.gameCount()).to.be.equal(3);
    const gameInfo = await game.games(1);
    expect(gameInfo[0]).to.be.equal(host.address);
    expect(gameInfo[1]).to.be.equal(joiner.address);
    expect(gameInfo[2]).to.be.equal(ZERO_ADDRESS);
    expect(gameInfo[3]).to.be.equal(units(1));
    expect(gameInfo[4]).to.be.equal(1);
    expect(gameInfo[5]).to.be.equal(0);

    // TTT_ALREADY_ENDED
    await expect(game.connect(joiner).play(1, 2, 2)).to.be.revertedWith(
      "TTT_ALREADY_ENDED"
    );
  });

  it("should let the players can play the game: joiner wins", async () => {
    await game.connect(host).play(2, 0, 0);
    await game.connect(joiner).play(2, 1, 1);
    await game.connect(host).play(2, 0, 1);
    await game.connect(joiner).play(2, 0, 2);
    await game.connect(host).play(2, 1, 0);

    const hostBalanceBefore = await token.balanceOf(host.address);
    const joinerBalanceBefore = await token.balanceOf(joiner.address);

    await game.connect(joiner).play(2, 2, 0);

    const hostBalanceAfter = await token.balanceOf(host.address);
    const joinerBalanceAfter = await token.balanceOf(joiner.address);

    // Check balance changes
    expect(hostBalanceBefore).to.be.equal(hostBalanceAfter);
    expect(units(2).add(joinerBalanceBefore)).to.be.equal(joinerBalanceAfter);

    // Check the game info - winner
    const gameInfo = await game.games(2);
    expect(gameInfo[0]).to.be.equal(host.address);
    expect(gameInfo[1]).to.be.equal(joiner.address);
    expect(gameInfo[2]).to.be.equal(token.address);
    expect(gameInfo[3]).to.be.equal(units(1));
    expect(gameInfo[4]).to.be.equal(2);
    expect(gameInfo[5]).to.be.equal(0);
  });

  it("should let the players can play the game: drawn", async () => {
    await token.transfer(joiner.address, units(1));
    await token.connect(joiner).approve(game.address, units(1));
    await game.connect(joiner).joinGame(3);

    await game.connect(host).play(3, 0, 0);
    await game.connect(joiner).play(3, 1, 1);
    await game.connect(host).play(3, 0, 2);
    await game.connect(joiner).play(3, 0, 1);
    await game.connect(host).play(3, 2, 1);
    await game.connect(joiner).play(3, 2, 0);
    await game.connect(host).play(3, 1, 2);
    await game.connect(joiner).play(3, 2, 2);

    const hostBalanceBefore = await token.balanceOf(host.address);
    const joinerBalanceBefore = await token.balanceOf(joiner.address);

    await game.connect(host).play(3, 1, 0);

    const hostBalanceAfter = await token.balanceOf(host.address);
    const joinerBalanceAfter = await token.balanceOf(joiner.address);

    // Check balance changes
    expect(units(1).add(hostBalanceBefore)).to.be.equal(hostBalanceAfter);
    expect(units(1).add(joinerBalanceBefore)).to.be.equal(joinerBalanceAfter);

    // Check the game info - winner
    const gameInfo = await game.games(3);
    expect(gameInfo[0]).to.be.equal(host.address);
    expect(gameInfo[1]).to.be.equal(joiner.address);
    expect(gameInfo[2]).to.be.equal(token.address);
    expect(gameInfo[3]).to.be.equal(units(1));
    expect(gameInfo[4]).to.be.equal(3);
    expect(gameInfo[5]).to.be.equal(0);
  });

  it("should be able to withdraw: joiner didn't reply for more than 1 day", async () => {
    await token.connect(host).approve(game.address, units(1));
    await game.connect(host).createNewGame(token.address, units(1));
    await token.connect(joiner).approve(game.address, units(1));
    await game.connect(joiner).joinGame(4);

    // TTT_INVALID_GAME_ID
    await expect(game.connect(host).withdraw(0)).to.be.revertedWith(
      "TTT_INVALID_GAME_ID"
    );
    await expect(game.connect(host).withdraw(5)).to.be.revertedWith(
      "TTT_INVALID_GAME_ID"
    );

    // TTT_ALREADY_ENDED
    await expect(game.connect(host).withdraw(3)).to.be.revertedWith(
      "TTT_ALREADY_ENDED"
    );

    // TTT_YOUR_TURN
    await expect(game.connect(host).withdraw(4)).to.be.revertedWith(
      "TTT_YOUR_TURN"
    );

    await game.connect(host).play(4, 0, 0);

    await expect(game.connect(joiner).withdraw(4)).to.be.revertedWith(
      "TTT_YOUR_TURN"
    );

    // TTT_NOT_WITHDRAWABLE
    await expect(game.connect(host).withdraw(4)).to.be.revertedWith(
      "TTT_NOT_WITHDRAWABLE"
    );

    // Able to withdraw
    await timeTravel(days(2));

    const hostBalanceBefore = await token.balanceOf(host.address);
    const joinerBalanceBefore = await token.balanceOf(joiner.address);

    await game.connect(host).withdraw(4);

    const hostBalanceAfter = await token.balanceOf(host.address);
    const joinerBalanceAfter = await token.balanceOf(joiner.address);

    // Check balance changes
    expect(units(2).add(hostBalanceBefore)).to.be.equal(hostBalanceAfter);
    expect(joinerBalanceBefore).to.be.equal(joinerBalanceAfter);
  });

  it("Should be able to withdraw: joiner didn't connect for more than 1 day", async () => {
    await token.connect(host).approve(game.address, units(1));
    await game.connect(host).createNewGame(token.address, units(1));

    // Able to withdraw
    await timeTravel(days(2));

    const hostBalanceBefore = await token.balanceOf(host.address);
    const joinerBalanceBefore = await token.balanceOf(joiner.address);

    await game.connect(host).withdraw(5);

    const hostBalanceAfter = await token.balanceOf(host.address);
    const joinerBalanceAfter = await token.balanceOf(joiner.address);

    // Check balance changes
    expect(units(1).add(hostBalanceBefore)).to.be.equal(hostBalanceAfter);
    expect(joinerBalanceBefore).to.be.equal(joinerBalanceAfter);
  });
});
