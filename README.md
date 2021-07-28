# Tic-Tac-Toe

A simple implementation of TicTacToe game (https://en.wikipedia.org/wiki/Tic-tac-toe).

Features:

- The game allows 2 players to bet ETH or ERC20 token on a Match, hoster and joiner has to bet the same amount of money.
- The winner will get all locked funds.
- If the game is drawn, then the locked funds will be returned back to both players.
- The players are enforced to finish the match. If one player doesn't reply for a certain period (e.g. 1 day), then the opposite can withdraw the locked funds. 

## Spec

- Player 1 creates a new game specifying & depositing bet in ether or erc20 token
- Player 2 accepts the challenge & deposits matching amount
- The game begins once Player 2 makes first move
- Once winner is decided, move locked funds to winner's address, Normal tic tac toe rules apply.

## How to use

### Install

```
yarn install
```

### Compile

```
yarn run compile
```

### Test / Coverage

```
yarn run test
yarn run coverage
```
